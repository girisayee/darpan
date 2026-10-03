import type { CalculationResult, RealizedPnLEvent, TradeTransaction } from "@/types/trading";
import { accountFor, holdingTerm, toCents } from "./helpers";
import type {
  StockLotLedger,
  TaxAccount,
  TaxDisposition,
  TaxDispositionBuildResult,
  TaxDispositionCategory,
  TaxDomainIssue,
  TaxHoldingTerm,
} from "./types";

const supportedOptionStrategies = new Set([
  "COVERED_CALL",
  "CASH_SECURED_PUT",
  "COVERED_CALL_ASSIGNMENT",
  "LONG_OPTION",
]);

/**
 * Combines a transaction-level stock ledger with supported realized engine events.
 * SWING_TRADE events are deliberately omitted because the stock ledger already contains
 * those dispositions at matched-lot granularity.
 */
export function buildTaxDispositions(
  result: CalculationResult,
  stockLedger: StockLotLedger,
): TaxDispositionBuildResult {
  const dispositions: TaxDisposition[] = [...stockLedger.dispositions];
  let issues: TaxDomainIssue[] = [...stockLedger.issues];
  const transactionsById = new Map(result.transactions.map((transaction) => [transaction.id, transaction]));
  const seenEventIds = new Set<string>();

  // Put assignments create engine lots without creating stock BUY rows. When the engine
  // can prove a wholly-unknown ledger sale has basis from linked transactions in the same
  // account, replace that transaction's unknown ledger record with the engine event.
  const resolvedUnknownSellIds = new Set<string>();
  for (const event of result.realizedEvents) {
    if (event.strategy !== "SWING_TRADE" || event.costBasis === null) continue;
    const sellTransaction = event.linkedTransactionIds
      .map((id) => transactionsById.get(id))
      .find((transaction) => transaction?.instrumentType === "stock" && transaction.action === "SELL");
    if (!sellTransaction) continue;
    const eventAccountResult = eventAccount(event, transactionsById);
    if (eventAccountResult.ambiguous) {
      issues.push(Object.freeze({
        code: "AMBIGUOUS_ACCOUNT" as const,
        eventId: event.id,
        message: `Stock event ${event.id} cannot supply fallback basis because it links more than one account.`,
      }));
      continue;
    }
    if (eventAccountResult.account.key !== accountFor(sellTransaction).key) continue;

    const ledgerIndexes = dispositions
      .map((disposition, index) => ({ disposition, index }))
      .filter(({ disposition }) =>
        disposition.source === "STOCK_LEDGER" &&
        disposition.linkedTransactionIds.includes(sellTransaction.id),
      );
    if (
      ledgerIndexes.length === 0 ||
      !ledgerIndexes.every(({ disposition }) => disposition.inclusion === "EXCLUDED_UNKNOWN_BASIS")
    ) continue;

    for (const { index } of [...ledgerIndexes].sort((a, b) => b.index - a.index)) {
      dispositions.splice(index, 1);
    }
    dispositions.push(eventDisposition(
      event,
      eventAccountResult.account,
      "STOCK",
      "INCLUDED",
      undefined,
      inferEventTerm(event, transactionsById),
    ));
    resolvedUnknownSellIds.add(sellTransaction.id);
  }
  if (resolvedUnknownSellIds.size > 0) {
    issues = issues.filter((issue) =>
      issue.code !== "UNKNOWN_BASIS" ||
      !issue.transactionId ||
      !resolvedUnknownSellIds.has(issue.transactionId),
    );
  }

  for (const event of result.realizedEvents) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);

    // Normal stock events are reconstructed above, including unknown-basis fragments.
    if (event.strategy === "SWING_TRADE") continue;

    const accountResult = eventAccount(event, transactionsById);
    if (accountResult.ambiguous) {
      issues.push(Object.freeze({
        code: "AMBIGUOUS_ACCOUNT" as const,
        eventId: event.id,
        message: `Realized event ${event.id} links transactions from more than one account.`,
      }));
    }

    if (event.strategy === "COVERED_CALL_ASSIGNMENT_STOCK") {
      dispositions.push(eventDisposition(
        event,
        accountResult.account,
        "STOCK",
        event.costBasis === null ? "EXCLUDED_UNKNOWN_BASIS" : "INCLUDED",
        event.costBasis === null ? "The assigned shares have no verified stock basis." : undefined,
        inferEventTerm(event, transactionsById),
      ));
      continue;
    }

    if (supportedOptionStrategies.has(event.strategy)) {
      const category: TaxDispositionCategory = event.strategy === "COVERED_CALL_ASSIGNMENT"
        ? "OPTION_ASSIGNMENT_ADJUSTMENT"
        : "OPTION";
      dispositions.push(eventDisposition(
        event,
        accountResult.account,
        category,
        "INCLUDED",
        undefined,
        inferEventTerm(event, transactionsById),
      ));
      continue;
    }

    issues.push(Object.freeze({
      code: "UNSUPPORTED_REALIZED_EVENT" as const,
      eventId: event.id,
      message: `Excluded ${event.strategy} event ${event.id} from the tax estimate.`,
    }));
    dispositions.push(eventDisposition(
      event,
      accountResult.account,
      "UNSUPPORTED",
      "EXCLUDED_UNSUPPORTED",
      `Tax treatment for ${event.strategy} is not supported.`,
      "UNKNOWN",
    ));
  }

  dispositions.sort((a, b) => a.disposedDate.localeCompare(b.disposedDate) || a.id.localeCompare(b.id));
  return Object.freeze({
    dispositions: Object.freeze(dispositions),
    issues: Object.freeze(issues),
  });
}

function eventDisposition(
  event: RealizedPnLEvent,
  account: TaxAccount,
  category: TaxDispositionCategory,
  inclusion: TaxDisposition["inclusion"],
  exclusionReason: string | undefined,
  term: TaxHoldingTerm,
): TaxDisposition {
  return Object.freeze({
    id: `tax-event-${event.id}`,
    source: "CALCULATION_EVENT" as const,
    sourceEventId: event.id,
    category,
    inclusion,
    exclusionReason,
    account,
    symbol: event.symbol,
    acquiredDate: null,
    disposedDate: event.date,
    quantity: Math.abs(event.quantity),
    proceedsCents: toCents(event.grossProceeds),
    costBasisCents: event.costBasis === null ? null : toCents(event.costBasis),
    feesCents: toCents(event.fees),
    gainLossCents: inclusion === "INCLUDED" ? toCents(event.realizedPnl) : null,
    term,
    linkedTransactionIds: Object.freeze([...event.linkedTransactionIds]),
  });
}

function eventAccount(
  event: RealizedPnLEvent,
  transactionsById: ReadonlyMap<string, TradeTransaction>,
): { account: TaxAccount; ambiguous: boolean } {
  const accounts = event.linkedTransactionIds
    .map((id) => transactionsById.get(id))
    .filter((transaction): transaction is TradeTransaction => transaction !== undefined)
    .map(accountFor);
  const unique = new Map(accounts.map((account) => [account.key, account]));
  if (unique.size === 1) return { account: [...unique.values()][0], ambiguous: false };
  if (unique.size > 1) {
    return {
      account: Object.freeze({ key: "ambiguous", accountName: "Multiple accounts" }),
      ambiguous: true,
    };
  }
  return {
    account: Object.freeze({ key: "unassigned", accountName: "Unassigned" }),
    ambiguous: false,
  };
}

function inferEventTerm(
  event: RealizedPnLEvent,
  transactionsById: ReadonlyMap<string, TradeTransaction>,
): TaxHoldingTerm {
  if (event.strategy === "COVERED_CALL" || event.strategy === "CASH_SECURED_PUT") {
    return "SHORT_TERM";
  }

  const linked = event.linkedTransactionIds
    .map((id) => transactionsById.get(id))
    .filter((transaction): transaction is TradeTransaction => transaction !== undefined);
  const openerActions = event.strategy === "LONG_OPTION"
    ? new Set(["BUY_TO_OPEN"])
    : new Set(["BUY"]);
  const acquiredDate = linked
    .filter((transaction) => openerActions.has(transaction.action))
    .map((transaction) => transaction.tradeDate)
    .sort()[0];
  if (acquiredDate) return holdingTerm(acquiredDate, event.date);

  if (event.holdingDays !== null) {
    return event.holdingDays > 365 ? "LONG_TERM" : "SHORT_TERM";
  }
  return "UNKNOWN";
}

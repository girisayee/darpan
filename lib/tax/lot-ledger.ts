import type { TradeTransaction } from "@/types/trading";
import { accountFor, allocateCents, holdingTerm, isIsoDate, normalizeQuantity, QUANTITY_EPSILON, toCents } from "./helpers";
import type { StockLotLedger, StockLotMethod, StockTaxLot, TaxDisposition, TaxDomainIssue } from "./types";

type MutableLot = {
  id: string;
  account: StockTaxLot["account"];
  symbol: string;
  acquiredDate: string;
  originalQuantity: number;
  remainingQuantity: number;
  originalBasisCents: number;
  remainingBasisCents: number;
  sourceTransactionId: string;
  sequence: number;
};

type PendingAllocation = {
  lot: MutableLot | null;
  quantity: number;
  costBasisCents: number | null;
};

/**
 * Reconstructs stock lots without mutating the input transaction array.
 * Matching is isolated by account and symbol; unsupported instruments/actions are ignored.
 */
export function createStockLotLedger(
  transactions: readonly TradeTransaction[],
  method: StockLotMethod = "FIFO",
): StockLotLedger {
  const issues: TaxDomainIssue[] = [];
  const lots: MutableLot[] = [];
  const dispositions: TaxDisposition[] = [];
  const ordered = transactions
    .map((transaction, sequence) => ({ transaction, sequence }))
    .filter(({ transaction }) =>
      transaction.instrumentType === "stock" &&
      transaction.status === "normalized" &&
      (transaction.action === "BUY" || transaction.action === "SELL"),
    )
    .sort((a, b) =>
      a.transaction.tradeDate.localeCompare(b.transaction.tradeDate) ||
      actionPriority(a.transaction) - actionPriority(b.transaction) ||
      a.sequence - b.sequence,
    );

  for (const { transaction, sequence } of ordered) {
    const quantity = normalizeQuantity(transaction.quantity);
    if (quantity <= QUANTITY_EPSILON) {
      issues.push(freezeIssue({
        code: "INVALID_QUANTITY",
        transactionId: transaction.id,
        message: `Transaction ${transaction.id} has no usable stock quantity.`,
      }));
      continue;
    }
    if (!isIsoDate(transaction.tradeDate)) {
      issues.push(freezeIssue({
        code: "INVALID_DATE",
        transactionId: transaction.id,
        message: `Transaction ${transaction.id} has an invalid trade date.`,
      }));
      continue;
    }

    if (transaction.action === "BUY") {
      const basisCents = purchaseBasisCents(transaction);
      lots.push({
        id: `tax-lot-${transaction.id}-${sequence}`,
        account: accountFor(transaction),
        symbol: transaction.symbol,
        acquiredDate: transaction.tradeDate,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        originalBasisCents: basisCents,
        remainingBasisCents: basisCents,
        sourceTransactionId: transaction.id,
        sequence,
      });
      continue;
    }

    const account = accountFor(transaction);
    const eligibleLots = lots
      .filter((lot) =>
        lot.account.key === account.key &&
        lot.symbol === transaction.symbol &&
        lot.remainingQuantity > QUANTITY_EPSILON,
      )
      .sort((a, b) => {
        const dateOrder = a.acquiredDate.localeCompare(b.acquiredDate);
        return method === "FIFO" ? dateOrder || a.sequence - b.sequence : -dateOrder || b.sequence - a.sequence;
      });

    let remainingToSell = quantity;
    const pending: PendingAllocation[] = [];
    for (const lot of eligibleLots) {
      if (remainingToSell <= QUANTITY_EPSILON) break;
      const lotQuantityBefore = lot.remainingQuantity;
      const used = Math.min(lotQuantityBefore, remainingToSell);
      const consumesLot = Math.abs(used - lotQuantityBefore) <= QUANTITY_EPSILON;
      const allocatedBasis = consumesLot
        ? lot.remainingBasisCents
        : Math.round((lot.remainingBasisCents * used) / lotQuantityBefore);

      lot.remainingQuantity = normalizeRemainder(lotQuantityBefore - used);
      lot.remainingBasisCents = consumesLot ? 0 : lot.remainingBasisCents - allocatedBasis;
      remainingToSell = normalizeRemainder(remainingToSell - used);
      pending.push({ lot, quantity: used, costBasisCents: allocatedBasis });
    }

    if (remainingToSell > QUANTITY_EPSILON) {
      pending.push({ lot: null, quantity: remainingToSell, costBasisCents: null });
      issues.push(freezeIssue({
        code: "UNKNOWN_BASIS",
        transactionId: transaction.id,
        message: `Excluded ${formatQuantity(remainingToSell)} of ${formatQuantity(quantity)} ${transaction.symbol} shares because no opening lot was available in ${account.accountName}.`,
      }));
    }

    const proceeds = allocateCents(saleProceedsCents(transaction), pending.map((item) => item.quantity));
    const fees = allocateCents(toCents(Math.abs(transaction.fees)), pending.map((item) => item.quantity));
    pending.forEach((item, index) => {
      const known = item.lot !== null && item.costBasisCents !== null;
      const netProceedsCents = proceeds[index];
      dispositions.push(Object.freeze({
        id: `tax-disposition-${transaction.id}-${index + 1}`,
        source: "STOCK_LEDGER" as const,
        category: "STOCK" as const,
        inclusion: known ? "INCLUDED" as const : "EXCLUDED_UNKNOWN_BASIS" as const,
        exclusionReason: known ? undefined : "No opening stock lot was available in the same account.",
        account,
        symbol: transaction.symbol,
        acquiredDate: item.lot?.acquiredDate ?? null,
        disposedDate: transaction.tradeDate,
        quantity: item.quantity,
        proceedsCents: netProceedsCents,
        costBasisCents: item.costBasisCents,
        feesCents: fees[index],
        gainLossCents: known ? netProceedsCents - item.costBasisCents! : null,
        term: item.lot ? holdingTerm(item.lot.acquiredDate, transaction.tradeDate) : "UNKNOWN" as const,
        linkedTransactionIds: Object.freeze(item.lot
          ? [item.lot.sourceTransactionId, transaction.id]
          : [transaction.id]),
      }));
    });
  }

  const frozenLots = lots.map((lot): StockTaxLot => Object.freeze({
    id: lot.id,
    account: lot.account,
    symbol: lot.symbol,
    acquiredDate: lot.acquiredDate,
    originalQuantity: lot.originalQuantity,
    remainingQuantity: lot.remainingQuantity,
    originalBasisCents: lot.originalBasisCents,
    remainingBasisCents: lot.remainingBasisCents,
    sourceTransactionId: lot.sourceTransactionId,
    status:
      lot.remainingQuantity <= QUANTITY_EPSILON
        ? "CLOSED"
        : lot.remainingQuantity < lot.originalQuantity - QUANTITY_EPSILON
          ? "PARTIALLY_CLOSED"
          : "OPEN",
  }));

  return Object.freeze({
    method,
    lots: Object.freeze(frozenLots),
    dispositions: Object.freeze(dispositions),
    issues: Object.freeze(issues),
  });
}

function actionPriority(transaction: TradeTransaction): number {
  return transaction.action === "BUY" ? 0 : 1;
}

function purchaseBasisCents(transaction: TradeTransaction): number {
  if (transaction.netAmount !== 0 && Number.isFinite(transaction.netAmount)) {
    return toCents(Math.abs(transaction.netAmount));
  }
  if (transaction.grossAmount !== 0 && Number.isFinite(transaction.grossAmount)) {
    return toCents(Math.abs(transaction.grossAmount) + Math.abs(transaction.fees));
  }
  return toCents(normalizeQuantity(transaction.quantity) * Math.abs(transaction.price) + Math.abs(transaction.fees));
}

function saleProceedsCents(transaction: TradeTransaction): number {
  if (transaction.netAmount !== 0 && Number.isFinite(transaction.netAmount)) {
    return toCents(Math.abs(transaction.netAmount));
  }
  if (transaction.grossAmount !== 0 && Number.isFinite(transaction.grossAmount)) {
    return Math.max(0, toCents(Math.abs(transaction.grossAmount) - Math.abs(transaction.fees)));
  }
  return Math.max(0, toCents(normalizeQuantity(transaction.quantity) * Math.abs(transaction.price) - Math.abs(transaction.fees)));
}

function normalizeRemainder(quantity: number): number {
  return Math.abs(quantity) <= QUANTITY_EPSILON ? 0 : quantity;
}

function formatQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(8)));
}

function freezeIssue(issue: TaxDomainIssue): TaxDomainIssue {
  return Object.freeze(issue);
}

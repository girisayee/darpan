/**
 * Pure helpers for option lifecycle → drawer and manual transaction building.
 * All functions are side-effect free and unit-testable.
 */

import type {
  OptionLifecycle,
  RealizedPnLEvent,
  TradeAction,
  TradeTransaction,
} from "@/types/trading";

// ── Feature 1: lifecycleToEvent ───────────────────────────────────────────────

/**
 * Resolve an OptionLifecycle to a RealizedPnLEvent for the DetailDrawer.
 *
 * Priority:
 *  1. A real event whose linkedTransactionIds intersect the lifecycle's, excluding
 *     COVERED_CALL_ASSIGNMENT_STOCK (which is the stock-sale side, not the premium event).
 *  2. The COVERED_CALL_ASSIGNMENT_STOCK event (accepted as last resort among real events).
 *  3. A synthetic event built from lifecycle fields.
 */
export function lifecycleToEvent(
  lifecycle: OptionLifecycle,
  events: RealizedPnLEvent[]
): RealizedPnLEvent {
  const lcIds = new Set(lifecycle.linkedTransactionIds);

  // Collect all events that share at least one linked tx with the lifecycle
  const candidates = events.filter((e) =>
    e.linkedTransactionIds.some((id) => lcIds.has(id))
  );

  // Prefer non-COVERED_CALL_ASSIGNMENT_STOCK events
  const preferred = candidates.find(
    (e) => e.strategy !== "COVERED_CALL_ASSIGNMENT_STOCK"
  );
  if (preferred) return preferred;

  // Fallback: any candidate (including the stock-sale side)
  if (candidates.length > 0) return candidates[0];

  // Last resort: build synthetic event
  const netPnl =
    lifecycle.netOptionPnl + (lifecycle.assignmentStockPnl ?? 0);
  const holdingDays =
    lifecycle.openDate && lifecycle.closeDate
      ? Math.round(
          (new Date(lifecycle.closeDate + "T00:00:00").getTime() -
            new Date(lifecycle.openDate + "T00:00:00").getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : null;
  const capital = lifecycle.capitalDeployed ?? 0;
  const roiPercent =
    capital > 0 ? (netPnl / capital) * 100 : null;

  return {
    id: `synthetic-${lifecycle.id}`,
    date: lifecycle.closeDate ?? lifecycle.expirationDate,
    symbol: lifecycle.underlyingSymbol,
    strategy:
      lifecycle.direction === "long"
        ? "LONG_OPTION"
        : lifecycle.optionType === "call"
          ? "COVERED_CALL"
          : "CASH_SECURED_PUT",
    grossProceeds: lifecycle.premiumReceived,
    costBasis: lifecycle.closeCost,
    optionPremium: lifecycle.premiumReceived,
    fees: lifecycle.fees,
    realizedPnl: netPnl,
    quantity: lifecycle.sharesControlled,
    capitalDeployed: capital > 0 ? capital : null,
    roiPercent,
    annualizedRoiPercent: null,
    holdingDays,
    linkedTransactionIds: lifecycle.linkedTransactionIds,
    explanation: lifecycle.explanation,
    warnings: lifecycle.warnings,
  };
}

// ── Feature 2: inferOpenerAction ─────────────────────────────────────────────

/**
 * Infer the opening action from a closing action.
 *
 * SELL_TO_CLOSE → BUY_TO_OPEN (long option)
 * BUY_TO_CLOSE  → SELL_TO_OPEN (short option)
 * EXPIRATION / ASSIGNMENT → SELL_TO_OPEN (short; typical wheel)
 * SELL (stock)  → BUY (the opening stock purchase)
 */
export function inferOpenerAction(
  closeAction: TradeAction
): "BUY_TO_OPEN" | "SELL_TO_OPEN" | "BUY" {
  if (closeAction === "SELL_TO_CLOSE") return "BUY_TO_OPEN";
  if (closeAction === "SELL") return "BUY";
  // BUY_TO_CLOSE, EXPIRATION, ASSIGNMENT → short
  return "SELL_TO_OPEN";
}

// ── Feature 2: buildManualOpenTransaction ─────────────────────────────────────

export interface ManualOpenOptionInput {
  kind?: "option";
  /** Base for id derivation (e.g. close tx id). */
  baseId: string;
  openDate: string;
  symbol: string;
  underlyingSymbol: string;
  optionType: "call" | "put";
  strikePrice: number;
  expirationDate: string;
  action: "BUY_TO_OPEN" | "SELL_TO_OPEN";
  pricePerContract: number;
  contracts: number;
  fees: number;
  sourceBroker: string;
  accountName: string;
}

export interface ManualOpenStockInput {
  kind: "stock";
  /** Base for id derivation (e.g. close tx id). */
  baseId: string;
  openDate: string;
  symbol: string;
  underlyingSymbol: string;
  /** Opener for a stock close is always a BUY. */
  action: "BUY";
  pricePerShare: number;
  shares: number;
  fees: number;
  sourceBroker: string;
  accountName: string;
}

export type ManualOpenInput = ManualOpenOptionInput | ManualOpenStockInput;

/**
 * Build a manual TradeTransaction for an opening leg (option or stock).
 *
 * Sign convention matches lib/import/robinhood.ts:
 *   Option SELL_TO_OPEN → grossAmount positive (credit received)
 *   Option BUY_TO_OPEN  → grossAmount negative (debit paid)
 *   Stock  BUY          → grossAmount negative (debit paid)
 *
 * netAmount = grossAmount − fees  (fees always reduce net toward / past zero)
 */
export function buildManualOpenTransaction(
  input: ManualOpenInput
): TradeTransaction {
  if (input.kind === "stock") {
    const rawAmount = input.pricePerShare * input.shares;
    // Stock BUY is a debit (matches Robinhood's negative `amount` for buys).
    const grossAmount = -rawAmount;
    const netAmount = grossAmount - input.fees;

    return {
      id: `manual-${crypto.randomUUID()}`,
      sourceBroker: input.sourceBroker as "Robinhood",
      accountName: input.accountName,
      tradeDate: input.openDate,
      symbol: input.symbol,
      underlyingSymbol: input.underlyingSymbol,
      instrumentType: "stock",
      action: "BUY",
      quantity: input.shares,
      price: input.pricePerShare,
      grossAmount,
      fees: input.fees,
      netAmount,
      optionType: null,
      rawDescription: `Manually added opening buy for ${input.shares} ${input.symbol} @ $${input.pricePerShare}`,
      importBatchId: "manual",
      tags: ["manual"],
      status: "normalized",
    };
  }

  const rawAmount = input.pricePerContract * input.contracts * 100;
  const grossAmount =
    input.action === "SELL_TO_OPEN" ? rawAmount : -rawAmount;
  const netAmount = grossAmount - input.fees;

  return {
    id: `manual-${crypto.randomUUID()}`,
    sourceBroker: input.sourceBroker as "Robinhood",
    accountName: input.accountName,
    tradeDate: input.openDate,
    symbol: input.symbol,
    underlyingSymbol: input.underlyingSymbol,
    instrumentType: "option",
    action: input.action,
    quantity: input.contracts,
    price: input.pricePerContract,
    grossAmount,
    fees: input.fees,
    netAmount,
    optionType: input.optionType,
    strikePrice: input.strikePrice,
    expirationDate: input.expirationDate,
    rawDescription: `Manually added opening leg for ${input.symbol} ${input.optionType} $${input.strikePrice} ${input.expirationDate}`,
    importBatchId: "manual",
    tags: ["manual"],
    status: "normalized",
  };
}

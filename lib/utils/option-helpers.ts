/**
 * Pure helpers for option lifecycle → drawer and manual transaction building.
 * All functions are side-effect free and unit-testable.
 */

import type {
  OptionLifecycle,
  RealizedPnLEvent,
  TaxLot,
  TradeAction,
  TradeTransaction,
} from "@/types/trading";

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
 * Sign convention matches lib/import/transactions.ts:
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

// ── assignmentShareDetail: share-side detail for the DetailDrawer ─────────────

/**
 * Share-leg detail for an assignment event, for display in the DetailDrawer.
 *  - "called-away": covered-call assignment sold the shares at strike — shows the
 *    allocated cost basis, strike proceeds, the realized share P&L, and share ROI.
 *  - "acquired": cash-secured-put assignment bought shares at strike — shows the
 *    resulting lot's effective cost basis (strike purchase − net premium).
 */
export type AssignmentShareDetail =
  | {
      kind: "called-away";
      shares: number;
      costBasis: number | null;
      proceeds: number;
      pnl: number;
      roiPercent: number | null;
    }
  | {
      kind: "acquired";
      shares: number;
      costBasisTotal: number;
      costBasisPerShare: number;
    }
  | null;

export function assignmentShareDetail(
  event: RealizedPnLEvent,
  events: RealizedPnLEvent[],
  taxLots: TaxLot[]
): AssignmentShareDetail {
  // Covered call: the underlying shares were called away (sold at strike).
  // The premium event id is `pnl-<lc>-assignment`; the share event is `...-stock`.
  const stockEvent =
    event.strategy === "COVERED_CALL_ASSIGNMENT_STOCK"
      ? event
      : event.strategy === "COVERED_CALL_ASSIGNMENT"
        ? events.find((e) => e.id === `${event.id}-stock`)
        : undefined;
  if (stockEvent) {
    const basis = stockEvent.costBasis;
    return {
      kind: "called-away",
      shares: stockEvent.quantity,
      costBasis: basis,
      proceeds: stockEvent.grossProceeds,
      pnl: stockEvent.realizedPnl,
      roiPercent: basis != null && basis > 0 ? (stockEvent.realizedPnl / basis) * 100 : null,
    };
  }

  // Cash-secured put: shares were acquired at strike — a new lot carries the basis.
  if (event.strategy === "PUT_ASSIGNMENT") {
    const ids = new Set(event.linkedTransactionIds);
    const lot = taxLots.find(
      (l) =>
        l.source === "CASH_SECURED_PUT_ASSIGNMENT" &&
        l.linkedTransactionIds.some((id) => ids.has(id))
    );
    if (lot) {
      return {
        kind: "acquired",
        shares: lot.originalQuantity,
        costBasisTotal: lot.costBasisTotal,
        costBasisPerShare: lot.costBasisPerShare,
      };
    }
  }

  return null;
}

// ── lifecycleShareDetail: share-leg detail driven by the OptionLifecycle ──────

/**
 * Share-leg detail for an assigned option lifecycle, for the lifecycle-driven
 * DetailDrawer. Mirrors {@link assignmentShareDetail} but is keyed off the
 * lifecycle (status + optionType) rather than a realized event.
 *
 *  - "called-away": an assigned covered call sold the underlying at strike. The
 *    stock-sale gain/loss lives in the `pnl-<id>-assignment-stock` event. When the
 *    share cost basis was never entered (`costBasis == null`) we flag `basisMissing`
 *    so the drawer can show a fix-it prompt instead of a misleading gain.
 *  - "acquired": an assigned cash-secured put bought the underlying at strike — the
 *    resulting lot (`lot-<id>-assignment`) carries the effective basis.
 *  - else null (open / expired / bought-to-close, or no matching stock leg).
 */
export type LifecycleShareDetail =
  | {
      kind: "called-away";
      shares: number;
      costBasis: number | null;
      proceeds: number;
      pnl: number;
      roiPercent: number | null;
      basisMissing: boolean;
    }
  | {
      kind: "acquired";
      shares: number;
      costBasisTotal: number;
      costBasisPerShare: number;
    }
  | null;

export function lifecycleShareDetail(
  lifecycle: OptionLifecycle,
  events: RealizedPnLEvent[],
  taxLots: TaxLot[]
): LifecycleShareDetail {
  if (lifecycle.status !== "assigned") return null;

  // Assigned covered call → underlying called away at strike.
  if (lifecycle.optionType === "call") {
    const stockEvent = events.find(
      (e) => e.id === `pnl-${lifecycle.id}-assignment-stock`
    );
    if (!stockEvent) return null;
    const basis = stockEvent.costBasis;
    const proceeds = lifecycle.strikePrice * lifecycle.sharesControlled;
    return {
      kind: "called-away",
      shares: lifecycle.sharesControlled,
      costBasis: basis,
      proceeds,
      pnl: stockEvent.realizedPnl,
      roiPercent:
        basis != null && basis > 0 ? (stockEvent.realizedPnl / basis) * 100 : null,
      basisMissing: basis == null,
    };
  }

  // Assigned cash-secured put → underlying acquired at strike.
  if (lifecycle.optionType === "put") {
    const lot =
      taxLots.find((l) => l.id === `lot-${lifecycle.id}-assignment`) ??
      (() => {
        const ids = new Set(lifecycle.linkedTransactionIds);
        return taxLots.find(
          (l) =>
            l.source === "CASH_SECURED_PUT_ASSIGNMENT" &&
            l.linkedTransactionIds.some((id) => ids.has(id))
        );
      })();
    if (!lot) return null;
    return {
      kind: "acquired",
      shares: lot.originalQuantity,
      costBasisTotal: lot.costBasisTotal,
      costBasisPerShare: lot.costBasisPerShare,
    };
  }

  return null;
}

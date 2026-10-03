import type { TradeTransaction } from "@/types/trading";
import type { TaxAccount, TaxHoldingTerm, TaxTermSummary } from "./types";

export const QUANTITY_EPSILON = 1e-8;

export function toCents(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function normalizeQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.abs(quantity) : 0;
}

export function accountFor(transaction: Pick<TradeTransaction, "accountId" | "accountName">): TaxAccount {
  const accountId = transaction.accountId?.trim() || undefined;
  const accountName = transaction.accountName?.trim() || "Unassigned";
  return Object.freeze({
    key: accountId ? `id:${accountId}` : `name:${accountName}`,
    accountId,
    accountName,
  });
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** A disposition is long term only when it is later than the calendar one-year anniversary. */
export function holdingTerm(acquiredDate: string, disposedDate: string): TaxHoldingTerm {
  if (!isIsoDate(acquiredDate) || !isIsoDate(disposedDate)) return "UNKNOWN";
  const [year, month, day] = acquiredDate.split("-").map(Number);
  const anniversary = Date.UTC(year + 1, month - 1, day);
  const [disposedYear, disposedMonth, disposedDay] = disposedDate.split("-").map(Number);
  const disposed = Date.UTC(disposedYear, disposedMonth - 1, disposedDay);
  return disposed > anniversary ? "LONG_TERM" : "SHORT_TERM";
}

export function allocateCents(totalCents: number, quantities: readonly number[]): number[] {
  const totalQuantity = quantities.reduce((sum, quantity) => sum + quantity, 0);
  if (quantities.length === 0) return [];
  if (totalQuantity <= QUANTITY_EPSILON) return quantities.map(() => 0);

  let allocated = 0;
  return quantities.map((quantity, index) => {
    if (index === quantities.length - 1) return totalCents - allocated;
    const share = Math.round((totalCents * quantity) / totalQuantity);
    allocated += share;
    return share;
  });
}

export function emptyTermSummary(): MutableTaxTermSummary {
  return {
    proceedsCents: 0,
    costBasisCents: 0,
    realizedGainCents: 0,
    realizedLossCents: 0,
    netGainLossCents: 0,
    dispositionCount: 0,
  };
}

export type MutableTaxTermSummary = { -readonly [K in keyof TaxTermSummary]: TaxTermSummary[K] };

export function freezeTermSummary(summary: MutableTaxTermSummary): TaxTermSummary {
  return Object.freeze({ ...summary });
}

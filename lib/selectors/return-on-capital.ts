/**
 * The single source of truth for return on capital across the app.
 *
 * Realized RoC = realized P&L / peak concurrent capital behind positions
 * realized in the period.
 * Reusing the same collateral across sequential trades does not add to the
 * denominator. Inferred open tax lots stay out of return math because the app
 * has no authoritative holdings/equity snapshot; they remain available to the
 * separate exposure/utilization measures.
 */

import type { CapitalUsage, MonthlyCapitalReturn } from "@/types/trading";

const DAY_MS = 24 * 60 * 60 * 1000;

function activeAt(row: CapitalUsage, date: string): boolean {
  return row.startDate <= date && (
    row.endDate > date ||
    (row.id.endsWith("-open") && row.endDate === date)
  );
}

/** Exclude synthetic rows that represent positions which are still open. */
export function closedCapitalUsage(usage: CapitalUsage[]): CapitalUsage[] {
  return usage.filter((row) => !row.id.endsWith("-open"));
}

/**
 * De-duplicate covered-call attribution when the supplied rows also contain a
 * stock/assignment interval that fully backs the same shares. Callers should
 * scope the rows first: a realized call still retains its stock-basis row when
 * the underlying shares themselves are open and therefore outside that scope.
 */
export function portfolioCapitalUsage(usage: CapitalUsage[]): CapitalUsage[] {
  return usage.filter((row) => {
    if (row.strategy !== "COVERED_CALL" || row.capitalType !== "STOCK_CAPITAL") return true;
    const backingRows = usage.filter((candidate) =>
      candidate.symbol === row.symbol &&
      candidate.strategy !== "COVERED_CALL" &&
      (candidate.capitalType === "SWING_TRADE_CAPITAL" || candidate.capitalType === "ASSIGNMENT_COLLATERAL") &&
      candidate.startDate <= row.startDate &&
      candidate.endDate >= row.endDate
    );
    const backingQuantity = backingRows.reduce((sum, candidate) => sum + candidate.quantity, 0);
    const backingAmount = backingRows.reduce((sum, candidate) => sum + candidate.amount, 0);
    return backingQuantity < row.quantity && backingAmount < row.amount * 0.995;
  });
}

function parseDate(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

export function daysInclusive(start: string, end: string): number {
  if (end < start) return 0;
  return Math.round((parseDate(end) - parseDate(start)) / DAY_MS) + 1;
}

/** Dollar-days remain an exposure primitive; they are not an RoC denominator. */
export function dollarDays(usage: CapitalUsage[], start: string, end: string): number {
  let total = 0;
  for (const row of usage) {
    const overlapStart = row.startDate > start ? row.startDate : start;
    const overlapEnd = row.endDate < end ? row.endDate : end;
    const days = daysInclusive(overlapStart, overlapEnd);
    if (days > 0) total += row.amount * days;
  }
  return total;
}

export type RocResult = {
  pnl: number;
  capital: number;
  avgDeployed: number;
  periodDays: number;
  roc: number | null;
};

export type CapitalScope = {
  startDate?: string;
  endDate?: string;
  symbol?: string;
  strategies?: readonly string[];
};

/**
 * Most capital simultaneously committed within a scope. End dates are treated
 * as release dates, so closing and reopening a position on the same date does
 * not double-count recycled capital. A standalone same-day trade still counts
 * via the max-single fallback rather than being added to its replacement.
 */
export function peakConcurrentCapital(usage: CapitalUsage[], scope: CapitalScope = {}): number {
  const rows = usage.filter((row) => {
    if (row.amount <= 0) return false;
    if (scope.symbol && row.symbol !== scope.symbol) return false;
    if (scope.strategies && !scope.strategies.includes(row.strategy)) return false;
    if (scope.startDate && row.endDate < scope.startDate) return false;
    if (scope.endDate && row.startDate > scope.endDate) return false;
    return true;
  });
  if (rows.length === 0) return 0;

  const candidates = new Set<string>();
  if (scope.startDate) candidates.add(scope.startDate);
  for (const row of rows) {
    candidates.add(scope.startDate && row.startDate < scope.startDate ? scope.startDate : row.startDate);
  }

  let peak = 0;
  for (const date of candidates) {
    if (scope.endDate && date > scope.endDate) continue;
    const deployed = rows
      .filter((row) => activeAt(row, date))
      .reduce((sum, row) => sum + row.amount, 0);
    peak = Math.max(peak, deployed);
  }

  const maxSingle = rows.reduce((max, row) => Math.max(max, row.amount), 0);
  return Math.max(peak, maxSingle);
}

export function scopedReturnOnCapital(
  usage: CapitalUsage[],
  pnl: number,
  scope: CapitalScope = {},
): { capital: number; roc: number | null } {
  const closed = closedCapitalUsage(usage);
  const capitalRows = scope.strategies ? closed : portfolioCapitalUsage(closed);
  const capital = peakConcurrentCapital(capitalRows, scope);
  return { capital, roc: capital > 0 ? (pnl / capital) * 100 : null };
}

export function portfolioReturnOnCapital(
  monthly: MonthlyCapitalReturn[],
  usage?: CapitalUsage[],
  maxCapital?: number,
): RocResult {
  const pnl = monthly.reduce((sum, row) => sum + row.realizedPnl, 0);
  const derivedCapital = usage
    ? peakConcurrentCapital(portfolioCapitalUsage(closedCapitalUsage(usage)))
    : Math.max(0, ...monthly.map((row) => row.returnCapital ?? 0));
  const capital = maxCapital && maxCapital > 0
    ? Math.min(derivedCapital, maxCapital)
    : derivedCapital;
  const dollarDayTotal = monthly.reduce((sum, row) => sum + row.capitalDays, 0);
  const periodDays = monthly.reduce((sum, row) => sum + row.periodDays, 0);
  return {
    pnl,
    capital,
    avgDeployed: periodDays > 0 ? dollarDayTotal / periodDays : 0,
    periodDays,
    roc: capital > 0 ? (pnl / capital) * 100 : null,
  };
}

export function symbolReturnOnCapital(
  usage: CapitalUsage[],
  symbol: string,
  pnl: number,
): { capital: number; roc: number | null } {
  return scopedReturnOnCapital(usage, pnl, { symbol });
}

export function strategyReturnOnCapital(
  usage: CapitalUsage[],
  strategies: readonly string[],
  pnl: number,
): { capital: number; roc: number | null } {
  return scopedReturnOnCapital(usage, pnl, { strategies });
}

export function yearlyPortfolioReturnOnCapital(
  monthly: MonthlyCapitalReturn[],
  year: number,
  usage?: CapitalUsage[],
  maxCapital?: number,
): RocResult {
  const yearRows = monthly.filter((row) => row.year === year);
  const base = portfolioReturnOnCapital(yearRows);
  if (!usage) return base;
  const yearUsage = closedCapitalUsage(usage).filter((row) => row.endDate.startsWith(`${year}-`));
  const derivedCapital = peakConcurrentCapital(portfolioCapitalUsage(yearUsage));
  const capital = maxCapital && maxCapital > 0 ? Math.min(derivedCapital, maxCapital) : derivedCapital;
  return {
    ...base,
    capital,
    roc: capital > 0 ? (base.pnl / capital) * 100 : null,
  };
}

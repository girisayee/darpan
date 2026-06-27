/**
 * lib/selectors/return-on-capital.ts — PURE.
 *
 * The single source of truth for "return on capital" across the app. Every RoC
 * the UI shows derives from the same primitive — deployed **dollar-days** over a
 * window — so Home, Performance, the monthly table, and per-symbol all agree.
 *
 * RoC = realized P&L ÷ time-weighted average deployed capital, where
 *   average deployed capital = dollar-days ÷ days-in-window.
 * Annualized RoC = RoC × (365 ÷ days-in-window). Annualization is never the
 * headline — callers label it explicitly.
 */

import type { CapitalUsage, MonthlyCapitalReturn } from "@/types/trading";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

/** Inclusive day count between two ISO dates (1 for a single-day span, 0 if end < start). */
export function daysInclusive(start: string, end: string): number {
  if (end < start) return 0;
  return Math.round((parseDate(end) - parseDate(start)) / DAY_MS) + 1;
}

/**
 * Deployed dollar-days over `[start, end]` (inclusive). For each capital-usage
 * row, its amount times the number of days its own span overlaps the window.
 * Summing row-first is algebraically identical to summing point-in-time deployed
 * capital over each day, so this matches the engine's per-month `capitalDays`.
 */
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
  avgDeployed: number;
  periodDays: number;
  roc: number | null;
  annualizedRoc: number | null;
};

function build(pnl: number, dollarDayTotal: number, periodDays: number): RocResult {
  const avgDeployed = periodDays > 0 ? dollarDayTotal / periodDays : 0;
  const roc = avgDeployed > 0 ? (pnl / avgDeployed) * 100 : null;
  const annualizedRoc = roc !== null && periodDays > 0 ? roc * (365 / periodDays) : null;
  return { pnl, avgDeployed, periodDays, roc, annualizedRoc };
}

/**
 * Portfolio / period RoC, derived from the monthly rows so it stays mutually
 * consistent with the monthly ROI table (which uses the same per-month
 * capital-days ÷ period-days basis). Home and Performance both read this.
 */
export function portfolioReturnOnCapital(monthly: MonthlyCapitalReturn[]): RocResult {
  const pnl = monthly.reduce((s, m) => s + m.realizedPnl, 0);
  const dollarDayTotal = monthly.reduce((s, m) => s + m.capitalDays, 0);
  const periodDays = monthly.reduce((s, m) => s + m.periodDays, 0);
  return build(pnl, dollarDayTotal, periodDays);
}

/**
 * Per-symbol RoC over the symbol's active span (first deployment → min(asOf,
 * last close)), so a symbol traded for one month isn't diluted by the rest of
 * the year. Same formula as the portfolio — only the window and filter differ.
 */
export function symbolReturnOnCapital(
  usage: CapitalUsage[],
  symbol: string,
  pnl: number,
  asOfDate: string,
): RocResult {
  const rows = usage.filter((r) => r.symbol === symbol && r.amount > 0);
  if (rows.length === 0) return build(pnl, 0, 0);
  const start = rows.reduce((min, r) => (r.startDate < min ? r.startDate : min), rows[0].startDate);
  const lastEnd = rows.reduce((max, r) => (r.endDate > max ? r.endDate : max), rows[0].endDate);
  const end = lastEnd < asOfDate ? lastEnd : asOfDate;
  const periodDays = daysInclusive(start, end);
  return build(pnl, dollarDays(rows, start, end), periodDays);
}

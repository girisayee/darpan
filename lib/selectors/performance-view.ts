import type { CalculationResult, CapitalUsage, RealizedPnLEvent, Strategy } from "@/types/trading";
import type { MonthlyTrade } from "@/lib/selectors/monthly-trades";
import { monthlyTrades } from "@/lib/selectors/monthly-trades";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import { peakConcurrentCapital, portfolioCapitalUsage, closedCapitalUsage } from "@/lib/selectors/return-on-capital";

export type MonthSlot = {
  month: string;
  pnl: number;
  roc: number | null;
  returnCapital: number;
  tradeCount: number;
  hasRealizedClose: boolean;
  isFuture: boolean;
};

export type InstrumentReturn = { pnl: number; capital: number; roc: number | null };
export type InstrumentAttribution = {
  month: string;
  options: InstrumentReturn;
  stocks: InstrumentReturn;
};

export type GroupedDayTrades = { date: string; pnl: number; trades: MonthlyTrade[] };
export type CumulativePnlPoint = { date: string; actual: number; goalPace: number | null };

const OPTION_STRATEGIES: readonly Strategy[] = [
  "COVERED_CALL", "CASH_SECURED_PUT", "PUT_ASSIGNMENT", "COVERED_CALL_ASSIGNMENT", "LONG_OPTION",
];
const STOCK_STRATEGIES: readonly Strategy[] = ["SWING_TRADE", "COVERED_CALL_ASSIGNMENT_STOCK"];

function isOption(strategy: Strategy): boolean { return OPTION_STRATEGIES.includes(strategy); }
function isStock(strategy: Strategy): boolean { return STOCK_STRATEGIES.includes(strategy); }

export function annualInstrumentPnl(result: CalculationResult, year: number): { options: number; stocks: number } {
  return result.realizedEvents.reduce((totals, event) => {
    if (!event.date.startsWith(`${year}-`)) return totals;
    if (isOption(event.strategy)) totals.options += event.realizedPnl;
    if (isStock(event.strategy)) totals.stocks += event.realizedPnl;
    return totals;
  }, { options: 0, stocks: 0 });
}

/** Twelve calendar slots, including empty months omitted by monthlyReturns. */
export function monthSlots(result: CalculationResult, year: number, today = new Date()): MonthSlot[] {
  const monthly = new Map(result.monthlyReturns.map((row) => [
    `${row.year}-${String(row.month).padStart(2, "0")}`, row,
  ]));
  const trades = new Map(monthlyTrades(result).map((row) => [row.month, row.trades.length]));
  const closes = new Set(result.realizedEvents.filter((event) => event.strategy !== "DATA_ISSUE").map((event) => event.date.slice(0, 7)));
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const row = monthly.get(month);
    return {
      month,
      pnl: row?.realizedPnl ?? 0,
      roc: row?.realizedRoiPercent ?? null,
      returnCapital: row?.returnCapital ?? 0,
      tradeCount: trades.get(month) ?? 0,
      hasRealizedClose: closes.has(month),
      isFuture: month > currentMonth,
    };
  });
}

/** Select the latest realized close, ignoring exposure-only monthly rows. */
export function defaultPerformanceMonth(result: CalculationResult, year: number, today = new Date()): string {
  const latest = result.realizedEvents
    .filter((event) => event.strategy !== "DATA_ISSUE" && event.date.startsWith(`${year}-`))
    .map((event) => event.date.slice(0, 7))
    .sort()
    .at(-1);
  if (latest) return latest;
  return year === today.getFullYear()
    ? `${year}-${String(today.getMonth() + 1).padStart(2, "0")}`
    : `${year}-01`;
}

function categoryCapital(
  result: CalculationResult,
  month: string,
  category: "options" | "stocks",
  events: RealizedPnLEvent[],
  maxBuyingPower?: number,
): number {
  const monthUsage = closedCapitalUsage(result.capitalUsage).filter((row) => row.endDate.startsWith(month));
  const scoped: CapitalUsage[] = monthUsage.filter((row) => category === "options"
    ? isOption(row.strategy)
    : row.strategy === "SWING_TRADE" || row.strategy === "COVERED_CALL_ASSIGNMENT" || row.strategy === "COVERED_CALL_ASSIGNMENT_STOCK");
  // Portfolio attribution removes a covered-call basis only when a realized
  // stock interval fully backs it. The stock card includes assignment basis;
  // the option card can also use that same basis without adding the two rates.
  const rows = category === "options" ? portfolioCapitalUsage(scoped) : scoped;
  const derived = peakConcurrentCapital(rows);
  // Synthetic CalculationResults may have events without interval records,
  // mirroring calculateMonthlyReturns' event-capital fallback.
  const assignmentOptions = category === "stocks"
    ? result.realizedEvents.filter((event) => event.date.startsWith(month) && event.strategy === "COVERED_CALL_ASSIGNMENT")
    : [];
  const fallback = Math.max(0, ...[...events, ...assignmentOptions].map((event) => event.capitalDeployed ?? 0));
  const capital = derived || fallback;
  return maxBuyingPower && maxBuyingPower > 0 ? Math.min(capital, maxBuyingPower) : capital;
}

/** Realized option/stock P&L and independent peak-capital rates for a month. */
export function instrumentAttribution(
  result: CalculationResult,
  month: string,
  maxBuyingPower?: number,
): InstrumentAttribution {
  const monthEvents = result.realizedEvents.filter((event) => event.date.startsWith(month));
  const optionsEvents = monthEvents.filter((event) => isOption(event.strategy));
  const stocksEvents = monthEvents.filter((event) => isStock(event.strategy));
  const makeReturn = (category: "options" | "stocks", events: RealizedPnLEvent[]): InstrumentReturn => {
    const pnl = events.reduce((sum, event) => sum + event.realizedPnl, 0);
    const capital = categoryCapital(result, month, category, events, maxBuyingPower);
    return { pnl, capital, roc: capital > 0 ? (pnl / capital) * 100 : null };
  };
  return { month, options: makeReturn("options", optionsEvents), stocks: makeReturn("stocks", stocksEvents) };
}

/** Daily totals use realized events; the row list uses grouped ledger trades. */
export function groupedDayTrades(result: CalculationResult, month: string): GroupedDayTrades[] {
  const trades = monthlyTrades(result).find((row) => row.month === month)?.trades ?? [];
  const days = new Map<string, GroupedDayTrades>(
    dailyPnl(result.realizedEvents)
      .filter((row) => row.date.startsWith(month))
      .map((row) => [row.date, { date: row.date, pnl: row.pnl, trades: [] }]),
  );
  for (const trade of trades) {
    const date = trade.date.slice(0, 10);
    const day = days.get(date) ?? { date, pnl: 0, trades: [] };
    day.trades.push(trade);
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** A daily close-date step series; actual stops at the last observed close. */
export function cumulativeRealizedPnl(
  events: RealizedPnLEvent[],
  year: number,
  annualGoal?: number,
  asOfDate?: Date,
): CumulativePnlPoint[] {
  const latestDate = asOfDate ? `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, "0")}-${String(asOfDate.getDate()).padStart(2, "0")}` : null;
  const daily = new Map<string, number>();
  for (const event of events) {
    const date = event.date.slice(0, 10);
    if (event.strategy === "DATA_ISSUE" || !date.startsWith(`${year}-`) || (latestDate && date > latestDate)) continue;
    daily.set(date, (daily.get(date) ?? 0) + event.realizedPnl);
  }
  if (daily.size === 0) return [];
  const start = Date.UTC(year, 0, 1);
  const yearDays = (Date.UTC(year + 1, 0, 1) - start) / 86_400_000;
  const pace = (date: string): number | null => annualGoal && annualGoal > 0
    ? annualGoal * ((Date.parse(`${date}T00:00:00Z`) - start) / 86_400_000 + 1) / yearDays
    : null;
  let actual = 0;
  const points: CumulativePnlPoint[] = [{ date: `${year}-01-01`, actual: 0, goalPace: pace(`${year}-01-01`) }];
  for (const [date, pnl] of [...daily].sort(([a], [b]) => a.localeCompare(b))) {
    actual += pnl;
    const point = { date, actual, goalPace: pace(date) };
    if (points[points.length - 1].date === date) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}

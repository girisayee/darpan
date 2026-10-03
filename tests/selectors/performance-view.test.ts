import { describe, expect, it } from "vitest";
import { calculateDashboard } from "@/lib/calculations/engine";
import {
  annualInstrumentPnl,
  cumulativeRealizedPnl,
  defaultPerformanceMonth,
  groupedDayTrades,
  instrumentAttribution,
  monthSlots,
} from "@/lib/selectors/performance-view";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import { defaultSettings } from "@/lib/storage/local-store";
import type { CalculationResult, CapitalUsage, RealizedPnLEvent, Strategy } from "@/types/trading";
import { optionTx, stockTx } from "../helpers";

const today = new Date("2026-09-27T00:00:00Z");
const settings = { ...defaultSettings, maxBuyingPower: 125_000 };

function event(id: string, date: string, strategy: Strategy, pnl: number, capital: number | null = null): RealizedPnLEvent {
  return {
    id, date, strategy, symbol: id, realizedPnl: pnl, capitalDeployed: capital,
    grossProceeds: 0, costBasis: null, optionPremium: 0, fees: 0, quantity: 1,
    roiPercent: null, annualizedRoiPercent: null, holdingDays: null,
    linkedTransactionIds: [], explanation: "", warnings: [],
  };
}

function usage(id: string, startDate: string, endDate: string, amount: number, strategy: Strategy = "CASH_SECURED_PUT"): CapitalUsage {
  return {
    id, symbol: id, strategy, startDate, endDate, amount, quantity: 1,
    capitalType: strategy === "SWING_TRADE" ? "SWING_TRADE_CAPITAL" : "OPTION_COLLATERAL",
    linkedTransactionIds: [],
  };
}

function result(events: RealizedPnLEvent[], capitalUsage: CapitalUsage[] = []): CalculationResult {
  return { realizedEvents: events, capitalUsage, monthlyReturns: [], optionLifecycles: [] } as unknown as CalculationResult;
}

describe("month selection and slots", () => {
  it("fills all 12 months and picks the latest close rather than an exposure-only row", () => {
    const dashboard = calculateDashboard([
      stockTx("buy", "2026-01-02", "BUY", "AAA", 10, 100),
      stockTx("sell", "2026-03-08", "SELL", "AAA", 10, 110),
      optionTx("open", "2026-07-01", "SELL_TO_OPEN", "BBB", "put", 50, "2026-11-20", 100),
    ], settings, today);
    const slots = monthSlots(dashboard, 2026, today);
    expect(slots).toHaveLength(12);
    expect(slots.find((slot) => slot.month === "2026-03")).toMatchObject({ hasRealizedClose: true, tradeCount: 1, pnl: 100 });
    expect(slots.find((slot) => slot.month === "2026-07")).toMatchObject({ hasRealizedClose: false, tradeCount: 0 });
    expect(slots.find((slot) => slot.month === "2026-10")?.isFuture).toBe(true);
    expect(defaultPerformanceMonth(dashboard, 2026, today)).toBe("2026-03");
    expect(defaultPerformanceMonth(result([]), 2026, today)).toBe("2026-09");
    expect(defaultPerformanceMonth(result([]), 2025, today)).toBe("2025-01");
  });
});

describe("instrumentAttribution", () => {
  it.each([
    ["positive", 300, 100, 400],
    ["negative", -300, -100, -400],
    ["mixed signs", 300, -100, 200],
    ["zero", 100, -100, 0],
  ])("reconciles %s month P&L", (_name, optionPnl, stockPnl, total) => {
    const dashboard = result([
      event("option", "2026-03-01", "LONG_OPTION", optionPnl, 1000),
      event("stock", "2026-03-02", "SWING_TRADE", stockPnl, 2000),
      event("issue", "2026-03-03", "DATA_ISSUE", 0),
    ]);
    const attribution = instrumentAttribution(dashboard, "2026-03");
    expect(attribution.options.pnl + attribution.stocks.pnl).toBe(total);
    expect(attribution.options.roc).toBe(optionPnl / 10);
    expect(attribution.stocks.roc).toBe(stockPnl / 20);
  });

  it("splits an assignment's premium and stock gain while grouping its daily ledger row", () => {
    const dashboard = calculateDashboard([
      stockTx("buy", "2026-01-02", "BUY", "AAA", 100, 100),
      optionTx("call", "2026-01-03", "SELL_TO_OPEN", "AAA", "call", 110, "2026-02-20", 200),
      optionTx("assignment", "2026-02-20", "ASSIGNMENT", "AAA", "call", 110, "2026-02-20", 0),
    ], settings, today);
    const attribution = instrumentAttribution(dashboard, "2026-02", settings.maxBuyingPower);
    expect(attribution.options).toMatchObject({ pnl: 200, capital: 10_000, roc: 2 });
    expect(attribution.stocks).toMatchObject({ pnl: 1000, capital: 10_000, roc: 10 });
    expect(attribution.options.pnl + attribution.stocks.pnl).toBe(dashboard.monthlyReturns.find((row) => row.month === 2)?.realizedPnl);
    const days = groupedDayTrades(dashboard, "2026-02");
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-02-20", pnl: 1200 });
    expect(days[0].trades).toHaveLength(1);
    expect(days[0].trades[0].pnl).toBe(1200);
  });

  it("reuses sequential capital, adds overlaps, and caps each category", () => {
    const dashboard = result([
      event("a", "2026-05-10", "CASH_SECURED_PUT", 100),
      event("b", "2026-05-20", "LONG_OPTION", 100),
      event("c", "2026-05-25", "COVERED_CALL", 100),
      event("s", "2026-05-25", "SWING_TRADE", 300),
    ], [
      usage("a", "2026-05-01", "2026-05-10", 10_000),
      usage("b", "2026-05-10", "2026-05-20", 10_000, "LONG_OPTION"),
      usage("c", "2026-05-15", "2026-05-25", 5_000, "COVERED_CALL"),
      usage("s", "2026-05-01", "2026-05-25", 30_000, "SWING_TRADE"),
    ]);
    expect(instrumentAttribution(dashboard, "2026-05").options.capital).toBe(15_000);
    expect(instrumentAttribution(dashboard, "2026-05", 12_000).options).toMatchObject({ capital: 12_000, roc: 2.5 });
    expect(instrumentAttribution(dashboard, "2026-05", 12_000).stocks).toMatchObject({ capital: 12_000, roc: 2.5 });
  });

  it("leaves RoC unavailable without positive realized capital", () => {
    const attribution = instrumentAttribution(result([event("missing", "2026-01-01", "SWING_TRADE", -100)]), "2026-01");
    expect(attribution.stocks).toMatchObject({ pnl: -100, capital: 0, roc: null });
    expect(attribution.options).toMatchObject({ pnl: 0, capital: 0, roc: null });
  });
});

describe("daily and cumulative realized views", () => {
  it("reconciles daily totals and annual categories across a month", () => {
    const dashboard = calculateDashboard([
      stockTx("buy", "2026-01-02", "BUY", "AAA", 10, 100),
      stockTx("sell", "2026-02-03", "SELL", "AAA", 10, 110),
      optionTx("long-open", "2026-02-01", "BUY_TO_OPEN", "BBB", "call", 50, "2026-03-20", -100),
      optionTx("long-close", "2026-02-05", "SELL_TO_CLOSE", "BBB", "call", 50, "2026-03-20", 150),
    ], settings, today);
    const days = groupedDayTrades(dashboard, "2026-02");
    expect(days.map((day) => day.pnl)).toEqual(dailyPnl(dashboard.realizedEvents).map((day) => day.pnl));
    expect(days.reduce((sum, day) => sum + day.pnl, 0)).toBe(dashboard.monthlyReturns.find((row) => row.month === 2)?.realizedPnl);
    expect(annualInstrumentPnl(dashboard, 2026)).toEqual({ options: 50, stocks: 100 });
  });

  it("stops actual at the last close and uses elapsed leap-year goal pace", () => {
    const points = cumulativeRealizedPnl([
      event("a", "2028-02-29", "LONG_OPTION", 100),
      event("b", "2028-02-29", "SWING_TRADE", -25),
      event("c", "2028-09-01", "SWING_TRADE", 50),
    ], 2028, 3660);
    expect(points.map((point) => point.date)).toEqual(["2028-01-01", "2028-02-29", "2028-09-01"]);
    expect(points[1]).toMatchObject({ actual: 75, goalPace: 600 });
    expect(points[2].actual).toBe(125);
    expect(points[2].goalPace).toBeLessThan(3660);
    expect(cumulativeRealizedPnl([event("a", "2028-02-29", "LONG_OPTION", 100)], 2028)[1].goalPace).toBeNull();
  });
});

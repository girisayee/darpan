import { describe, it, expect } from "vitest";
import {
  closedCapitalUsage,
  daysInclusive,
  dollarDays,
  peakConcurrentCapital,
  portfolioCapitalUsage,
  portfolioReturnOnCapital,
  scopedReturnOnCapital,
  yearlyPortfolioReturnOnCapital,
} from "@/lib/selectors/return-on-capital";
import type { CapitalUsage, MonthlyCapitalReturn } from "@/types/trading";

const usage = (symbol: string, startDate: string, endDate: string, amount: number): CapitalUsage => ({
  id: `${symbol}-${startDate}-${amount}`,
  strategy: "CASH_SECURED_PUT",
  symbol,
  startDate,
  endDate,
  capitalType: "OPTION_COLLATERAL",
  amount,
  quantity: 1,
  linkedTransactionIds: [],
});

const month = (over: Partial<MonthlyCapitalReturn>): MonthlyCapitalReturn =>
  ({ capitalDays: 0, periodDays: 0, realizedPnl: 0, closedTradeCapital: 0, returnCapital: 0, ...over }) as MonthlyCapitalReturn;

describe("daysInclusive", () => {
  it("counts both endpoints", () => {
    expect(daysInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysInclusive("2026-01-01", "2026-01-31")).toBe(31);
    expect(daysInclusive("2026-02-01", "2026-01-31")).toBe(0);
  });
});

describe("dollarDays", () => {
  it("is amount × overlapping days, clipped to the window", () => {
    // $1000 deployed all of January = 1000 × 31 dollar-days within Jan.
    expect(dollarDays([usage("X", "2026-01-01", "2026-01-31", 1000)], "2026-01-01", "2026-01-31")).toBe(31000);
    // Clipped: only 10 days fall inside the window.
    expect(dollarDays([usage("X", "2026-01-01", "2026-01-31", 1000)], "2026-01-22", "2026-01-31")).toBe(10000);
  });

  it("sums concurrent rows (genuinely overlapping capital)", () => {
    const rows = [usage("X", "2026-01-01", "2026-01-10", 1000), usage("X", "2026-01-01", "2026-01-10", 500)];
    expect(dollarDays(rows, "2026-01-01", "2026-01-10")).toBe(1500 * 10);
  });
});

describe("portfolioReturnOnCapital", () => {
  it("is P&L ÷ peak concurrent realized capital, not capital cycled", () => {
    const rows = [
      month({ capitalDays: 30_000 * 31, periodDays: 31, realizedPnl: 1000, closedTradeCapital: 20_000, returnCapital: 20_000 }),
      month({ capitalDays: 30_000 * 28, periodDays: 28, realizedPnl: 2000, closedTradeCapital: 40_000, returnCapital: 40_000 }),
    ];
    const r = portfolioReturnOnCapital(rows);
    expect(r.avgDeployed).toBeCloseTo(30_000, 5); // separate exposure metric
    expect(r.capital).toBe(40_000);
    expect(r.roc).toBeCloseTo(7.5, 5);
  });

  it("returns null roc when no capital was deployed", () => {
    expect(portfolioReturnOnCapital([month({ periodDays: 31, realizedPnl: 100 })]).roc).toBeNull();
  });

  it("uses configured max buying power as the portfolio capital ceiling", () => {
    const rows = [month({ periodDays: 31, realizedPnl: 40_000, returnCapital: 160_000 })];
    const result = portfolioReturnOnCapital(rows, undefined, 125_000);
    expect(result.capital).toBe(125_000);
    expect(result.roc).toBe(32);
  });
});

describe("peakConcurrentCapital", () => {
  it("does not add sequential reuse of the same capital", () => {
    const rows = [
      usage("AMD", "2026-01-01", "2026-01-15", 100_000),
      usage("AMD", "2026-01-15", "2026-01-31", 100_000),
    ];
    expect(peakConcurrentCapital(rows)).toBe(100_000);
  });

  it("turns 40,880 of P&L on a reused 125,000 basis into 32.704%", () => {
    const rows = [
      usage("AMD", "2026-01-01", "2026-03-01", 125_000),
      usage("NVDA", "2026-03-01", "2026-06-01", 125_000),
      usage("TSLA", "2026-06-01", "2026-08-01", 125_000),
    ];

    const result = scopedReturnOnCapital(rows, 40_880);
    expect(result.capital).toBe(125_000);
    expect(result.roc).toBeCloseTo(32.704, 6);
  });

  it("does add genuinely overlapping positions", () => {
    const rows = [
      usage("AMD", "2026-01-01", "2026-01-20", 100_000),
      usage("NVDA", "2026-01-10", "2026-01-31", 50_000),
    ];
    expect(peakConcurrentCapital(rows)).toBe(150_000);
  });

  it("releases a same-day close before counting its replacement", () => {
    const rows = [
      usage("BE", "2026-07-02", "2026-07-02", 29_500),
      usage("BE", "2026-07-02", "2026-07-16", 26_750),
      usage("MDB", "2026-07-01", "2026-07-10", 50_000),
    ];
    // The $29.5k close and $26.75k replacement are recycled capital, not
    // concurrent positions. The standalone same-day row still participates in
    // the max-single fallback.
    expect(peakConcurrentCapital(rows)).toBe(76_750);
  });
});

describe("closedCapitalUsage", () => {
  it("removes current open-exposure rows but preserves completed trade usage", () => {
    const rows = [
      { ...usage("X", "2026-01-01", "2026-01-02", 1000), id: "cap-closed" },
      { ...usage("X", "2026-01-03", "2026-01-04", 1000), id: "cap-position-open" },
    ];
    expect(closedCapitalUsage(rows).map((row) => row.id)).toEqual(["cap-closed"]);
  });
});

describe("portfolioCapitalUsage", () => {
  it("removes covered-call attribution when the supplied rows contain its backing stock", () => {
    const stock = {
      ...usage("X", "2026-01-01", "2026-12-31", 1000),
      id: "stock-closed",
      strategy: "SWING_TRADE" as const,
      capitalType: "SWING_TRADE_CAPITAL" as const,
      quantity: 100,
    };
    const call = {
      ...usage("X", "2026-02-01", "2026-03-01", 1000),
      id: "call-closed",
      strategy: "COVERED_CALL" as const,
      capitalType: "STOCK_CAPITAL" as const,
      quantity: 100,
    };
    expect(portfolioCapitalUsage([stock, call])).toEqual([stock]);
    expect(scopedReturnOnCapital([stock, call], 100).capital).toBe(1000);
    expect(scopedReturnOnCapital([stock, call], 100, { strategies: ["COVERED_CALL"] }).capital).toBe(1000);
  });

  it("retains a realized covered call when its underlying shares remain open", () => {
    const call = {
      ...usage("X", "2026-02-01", "2026-03-01", 1000),
      id: "call-closed",
      strategy: "COVERED_CALL" as const,
      capitalType: "STOCK_CAPITAL" as const,
      quantity: 100,
    };
    const openStock = {
      ...call,
      id: "stock-open",
      strategy: "SWING_TRADE" as const,
      capitalType: "SWING_TRADE_CAPITAL" as const,
      startDate: "2026-01-01",
      endDate: "2026-08-17",
    };
    expect(scopedReturnOnCapital([call, openStock], 100).capital).toBe(1000);
  });
});

describe("yearlyPortfolioReturnOnCapital", () => {
  it("excludes prior years from a YTD capital comparison", () => {
    const rows = [
      month({ year: 2025, periodDays: 31, capitalDays: 31_000, realizedPnl: 100, closedTradeCapital: 1_000 }),
      month({ year: 2026, periodDays: 10, capitalDays: 100_000, realizedPnl: 500, closedTradeCapital: 10_000, returnCapital: 10_000 }),
    ];

    const result = yearlyPortfolioReturnOnCapital(rows, 2026);

    expect(result.avgDeployed).toBe(10_000);
    expect(result.pnl).toBe(500);
    expect(result.roc).toBe(5);
  });

  it("includes a prior-year position that remains active during the requested year", () => {
    const rows = [
      month({ year: 2026, periodDays: 31, capitalDays: 310_000, realizedPnl: 500, returnCapital: 10_000 }),
    ];
    const closedAcrossYear = usage("AMD", "2025-06-01", "2026-08-17", 10_000);
    const result = yearlyPortfolioReturnOnCapital(rows, 2026, [closedAcrossYear]);
    expect(result.capital).toBe(10_000);
    expect(result.roc).toBe(5);
  });
});

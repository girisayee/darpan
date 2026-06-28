import { describe, it, expect } from "vitest";
import {
  daysInclusive,
  dollarDays,
  portfolioReturnOnCapital,
  symbolReturnOnCapital,
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
  ({ capitalDays: 0, periodDays: 0, realizedPnl: 0, ...over }) as MonthlyCapitalReturn;

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
  it("is P&L ÷ (Σcapital-days ÷ Σperiod-days)", () => {
    const rows = [
      month({ capitalDays: 30_000 * 31, periodDays: 31, realizedPnl: 1000 }),
      month({ capitalDays: 30_000 * 28, periodDays: 28, realizedPnl: 2000 }),
    ];
    const r = portfolioReturnOnCapital(rows);
    expect(r.avgDeployed).toBeCloseTo(30_000, 5); // constant $30k deployed → avg 30k
    expect(r.roc).toBeCloseTo((3000 / 30_000) * 100, 5); // 10%
    expect(r.annualizedRoc).toBeCloseTo(r.roc! * (365 / 59), 5);
  });

  it("returns null roc when no capital was deployed", () => {
    expect(portfolioReturnOnCapital([month({ periodDays: 31, realizedPnl: 100 })]).roc).toBeNull();
  });
});

describe("symbolReturnOnCapital", () => {
  it("divides by the symbol's own active span, not the whole year", () => {
    // $30k deployed for all of January (31 days). Active span = Jan 1–31.
    const r = symbolReturnOnCapital([usage("MDB", "2026-01-01", "2026-01-31", 30_000)], "MDB", 1500, "2026-06-30");
    expect(r.periodDays).toBe(31);
    expect(r.avgDeployed).toBeCloseTo(30_000, 5);
    expect(r.roc).toBeCloseTo(5, 5); // 1500 / 30000 = 5%
  });

  it("isolates by symbol and ignores zero-amount rows", () => {
    const rows = [usage("MDB", "2026-01-01", "2026-01-31", 30_000), usage("AAPL", "2026-01-01", "2026-01-31", 99_000)];
    expect(symbolReturnOnCapital(rows, "MDB", 1500, "2026-06-30").avgDeployed).toBeCloseTo(30_000, 5);
  });
});

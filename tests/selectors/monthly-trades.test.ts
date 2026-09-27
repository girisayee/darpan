import { describe, expect, it } from "vitest";
import { calculateDashboard } from "@/lib/calculations/engine";
import { monthlyTrades } from "@/lib/selectors/monthly-trades";
import { defaultSettings } from "@/lib/storage/local-store";
import { optionTx, stockTx } from "../helpers";

const today = new Date("2026-03-31T00:00:00Z");

describe("monthlyTrades", () => {
  it("groups by realization month, including positions opened in a prior year", () => {
    const result = calculateDashboard([
      stockTx("buy", "2025-12-15", "BUY", "AAA", 10, 100),
      stockTx("sell", "2026-02-03", "SELL", "AAA", 10, 110),
      optionTx("long-open", "2026-02-01", "BUY_TO_OPEN", "BBB", "call", 50, "2026-03-20", -100),
      optionTx("long-close", "2026-03-05", "SELL_TO_CLOSE", "BBB", "call", 50, "2026-03-20", 150),
    ], defaultSettings, today);
    const months = monthlyTrades(result);
    expect(months.find((month) => month.month === "2025-12")?.trades).toEqual([]);
    expect(months.find((month) => month.month === "2026-02")?.trades.map((trade) => trade.symbol)).toEqual(["AAA"]);
    const march = months.find((month) => month.month === "2026-03")!;
    expect(march.trades).toHaveLength(1);
    expect(march.trades[0].lifecycle?.direction).toBe("long");
    for (const month of months) {
      expect(month.trades.reduce((sum, trade) => sum + trade.pnl, 0)).toBeCloseTo(month.pnl);
    }
  });

  it("shows a covered-call assignment as one trade with both stock and option P&L", () => {
    const result = calculateDashboard([
      stockTx("buy", "2026-01-02", "BUY", "AAA", 100, 100),
      optionTx("call", "2026-01-03", "SELL_TO_OPEN", "AAA", "call", 110, "2026-02-20", 200),
      optionTx("assignment", "2026-02-20", "ASSIGNMENT", "AAA", "call", 110, "2026-02-20", 0),
    ], defaultSettings, today);
    const february = monthlyTrades(result).find((month) => month.month === "2026-02")!;
    expect(february.trades).toHaveLength(1);
    expect(february.trades[0].pnl).toBe(1200);
    expect(february.trades[0].pnl).toBe(february.pnl);
    expect(february.trades[0].lifecycle?.status).toBe("assigned");
  });

  it("does not turn open options, deferred put assignments, or data issues into realized trades", () => {
    const result = calculateDashboard([
      optionTx("put", "2026-01-03", "SELL_TO_OPEN", "AAA", "put", 100, "2026-02-20", 200),
      optionTx("assigned", "2026-02-20", "ASSIGNMENT", "AAA", "put", 100, "2026-02-20", 0),
      optionTx("open", "2026-03-02", "SELL_TO_OPEN", "BBB", "put", 50, "2026-04-17", 100),
      optionTx("orphan", "2026-03-05", "BUY_TO_CLOSE", "CCC", "put", 50, "2026-03-20", -20),
    ], defaultSettings, today);
    expect(monthlyTrades(result).flatMap((month) => month.trades)).toEqual([]);
    expect(monthlyTrades(calculateDashboard([], defaultSettings, today))).toEqual([]);
  });
});

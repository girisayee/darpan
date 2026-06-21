import { describe, it, expect } from "vitest";
import { leaderboard } from "@/lib/selectors/leaderboard";
import type { CalculationResult } from "@/types/trading";

function res(breakdown: CalculationResult["aggregates"]["symbolBreakdown"]): CalculationResult {
  return { aggregates: { symbolBreakdown: breakdown } } as CalculationResult;
}
const row = (symbol: string, pnl: number) => ({ symbol, pnl, capital: 0, roiPercent: 0, trades: 1, winRate: 0 });

describe("leaderboard", () => {
  it("splits winners (pnl>0 desc) and losers (pnl<0 asc)", () => {
    const out = leaderboard(res([row("A", 100), row("B", -50), row("C", 300), row("D", -200)]));
    expect(out.winners.map((r) => r.symbol)).toEqual(["C", "A"]);
    expect(out.losers.map((r) => r.symbol)).toEqual(["D", "B"]);
  });
  it("excludes zero-pnl symbols and respects limit", () => {
    const out = leaderboard(res([row("A", 10), row("Z", 0), row("B", 20), row("C", 30)]), 2);
    expect(out.winners.map((r) => r.symbol)).toEqual(["C", "B"]);
    expect(out.losers).toEqual([]);
  });
});

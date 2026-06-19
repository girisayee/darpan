import type { CalculationResult } from "@/types/trading";

export function topMovers(
  result: CalculationResult,
  limit = 8
): { symbol: string; pnl: number }[] {
  return [...(result.aggregates.symbolBreakdown ?? [])]
    .map((b) => ({ symbol: b.symbol, pnl: b.pnl }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, limit);
}

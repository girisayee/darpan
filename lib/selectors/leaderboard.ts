import type { CalculationResult } from "@/types/trading";

export interface LeaderboardRow {
  symbol: string;
  pnl: number;
  roiPercent: number | null;
  trades: number;
  winRate: number | null;
}

export interface Leaderboard {
  winners: LeaderboardRow[];
  losers: LeaderboardRow[];
}

export function leaderboard(result: CalculationResult, limit = 5): Leaderboard {
  const rows: LeaderboardRow[] = (result.aggregates.symbolBreakdown ?? []).map((b) => ({
    symbol: b.symbol,
    pnl: b.pnl,
    roiPercent: b.roiPercent,
    trades: b.trades,
    winRate: b.winRate,
  }));
  const winners = rows.filter((r) => r.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, limit);
  const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, limit);
  return { winners, losers };
}

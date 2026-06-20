import type { RealizedPnLEvent } from "@/types/trading";

export interface TradeQuality {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;       // fraction 0..1
  grossProfit: number;          // sum of positive pnl
  grossLoss: number;            // sum of negative pnl (<= 0)
  averageWin: number | null;
  averageLoss: number | null;   // <= 0
  profitFactor: number | null;  // grossProfit / |grossLoss|; null if no losses
  payoffRatio: number | null;   // averageWin / |averageLoss|; null if missing side
  expectancy: number | null;    // mean realizedPnl; null if no trades
}

export function tradeQuality(events: RealizedPnLEvent[]): TradeQuality {
  const total = events.length;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sum = 0;

  for (const e of events) {
    const p = e.realizedPnl;
    sum += p;
    if (p > 0) {
      wins += 1;
      grossProfit += p;
    } else if (p < 0) {
      losses += 1;
      grossLoss += p;
    }
  }

  const averageWin = wins > 0 ? grossProfit / wins : null;
  const averageLoss = losses > 0 ? grossLoss / losses : null;

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: total > 0 ? wins / total : null,
    grossProfit,
    grossLoss,
    averageWin,
    averageLoss,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
    payoffRatio:
      averageWin !== null && averageLoss !== null && averageLoss !== 0
        ? averageWin / Math.abs(averageLoss)
        : null,
    expectancy: total > 0 ? sum / total : null,
  };
}

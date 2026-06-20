import type { CalculationResult } from "@/types/trading";

export interface DrawdownResult {
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  peakIndex: number;
  troughIndex: number;
}

export function maxDrawdown(equity: number[]): DrawdownResult {
  let peak = -Infinity;
  let curPeakIdx = 0;
  let maxDD = 0;
  let peakIndex = 0;
  let troughIndex = 0;
  let peakValAtMax = 0;
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (v > peak) {
      peak = v;
      curPeakIdx = i;
    }
    const dd = peak - v;
    if (dd > maxDD) {
      maxDD = dd;
      troughIndex = i;
      peakIndex = curPeakIdx;
      peakValAtMax = peak;
    }
  }
  return {
    maxDrawdown: maxDD,
    maxDrawdownPct: peakValAtMax > 0 ? maxDD / peakValAtMax : null,
    peakIndex,
    troughIndex,
  };
}

export function sortino(returns: number[], mar = 0): number | null {
  if (returns.length === 0) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const downsideSq =
    returns.reduce((s, r) => {
      const d = Math.min(0, r - mar);
      return s + d * d;
    }, 0) / returns.length;
  const downsideDev = Math.sqrt(downsideSq);
  if (downsideDev === 0) return null;
  return (mean - mar) / downsideDev;
}

export function calmar(
  annualizedReturnPct: number | null,
  maxDrawdownFraction: number | null,
): number | null {
  if (annualizedReturnPct === null) return null;
  if (maxDrawdownFraction === null || maxDrawdownFraction === 0) return null;
  return annualizedReturnPct / 100 / maxDrawdownFraction;
}

export interface RiskMetrics {
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  sortino: number | null;
  calmar: number | null;
}

export function riskMetrics(result: CalculationResult): RiskMetrics {
  const equity = result.aggregates.monthlyRealizedPnl.map((m) => m.cumulative);
  const returns = result.monthlyReturns.map((m) => m.realizedRoiPercent ?? 0);
  const dd = maxDrawdown(equity);
  const annualizedReturnPct =
    result.aggregates.averageMonthlyRoi === null ? null : result.aggregates.averageMonthlyRoi * 12;
  return {
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPct: dd.maxDrawdownPct,
    sortino: sortino(returns, 0),
    calmar: calmar(annualizedReturnPct, dd.maxDrawdownPct),
  };
}

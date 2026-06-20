import type { CalculationResult } from "@/types/trading";
import { tradeQuality, type TradeQuality } from "@/lib/selectors/trade-quality";
import { premiumStats, type PremiumStats } from "@/lib/selectors/premium-capture";
import { allocation, type AllocationStats } from "@/lib/selectors/allocation";
import { capitalEfficiency, type CapitalEfficiency } from "@/lib/selectors/capital-efficiency";

export interface WheelAnalytics {
  tradeQuality: TradeQuality;
  premium: PremiumStats;
  allocation: AllocationStats;
  capitalEfficiency: CapitalEfficiency;
}

export function wheelAnalytics(result: CalculationResult): WheelAnalytics {
  const tradeEvents = result.realizedEvents.filter((e) => e.strategy !== "DATA_ISSUE");
  return {
    tradeQuality: tradeQuality(tradeEvents),
    premium: premiumStats(result.optionLifecycles),
    allocation: allocation(
      result.aggregates.symbolBreakdown.map((b) => ({ symbol: b.symbol, capital: b.capital })),
      result.aggregates.strategyBreakdown.map((b) => ({ strategy: b.strategy, capital: b.capital })),
    ),
    capitalEfficiency: capitalEfficiency(result.realizedEvents, result.monthlyReturns),
  };
}

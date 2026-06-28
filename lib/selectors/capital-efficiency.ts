import type { MonthlyCapitalReturn } from "@/types/trading";
import { portfolioReturnOnCapital } from "@/lib/selectors/return-on-capital";

export interface CapitalEfficiency {
  capitalTurnover: number | null;
  incomePerDay: number | null;
}

/**
 * Capital-efficiency stats that share the canonical time-weighted deployed
 * capital (so turnover's denominator matches the RoC denominator shown
 * elsewhere). Return on capital itself lives on `aggregates.returnOnCapital`.
 */
export function capitalEfficiency(monthly: MonthlyCapitalReturn[]): CapitalEfficiency {
  const { avgDeployed } = portfolioReturnOnCapital(monthly);

  // Turnover = total closed capital ÷ time-weighted average deployed.
  const totalClosed = monthly.reduce((s, m) => s + m.closedTradeCapital, 0);
  const capitalTurnover = avgDeployed > 0 ? totalClosed / avgDeployed : null;

  // Income per capital-day from option premium.
  const totalPremiumPnl = monthly.reduce((s, m) => s + m.optionsPremiumPnl, 0);
  const totalCapitalDays = monthly.reduce((s, m) => s + m.capitalDays, 0);
  const incomePerDay = totalCapitalDays > 0 ? totalPremiumPnl / totalCapitalDays : null;

  return { capitalTurnover, incomePerDay };
}

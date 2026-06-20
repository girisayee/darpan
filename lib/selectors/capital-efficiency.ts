import type { RealizedPnLEvent, MonthlyCapitalReturn } from "@/types/trading";

export interface CapitalEfficiency {
  annualizedRoc: number | null;
  capitalTurnover: number | null;
  incomePerDay: number | null;
}

export function capitalEfficiency(
  events: RealizedPnLEvent[],
  monthly: MonthlyCapitalReturn[],
): CapitalEfficiency {
  // Capital-weighted mean of per-event annualized ROI%.
  let weightSum = 0;
  let weighted = 0;
  for (const e of events) {
    if (e.annualizedRoiPercent === null || e.capitalDeployed === null) continue;
    if (e.capitalDeployed <= 0) continue;
    weighted += e.annualizedRoiPercent * e.capitalDeployed;
    weightSum += e.capitalDeployed;
  }
  const annualizedRoc = weightSum > 0 ? weighted / weightSum : null;

  // Turnover = total closed capital / mean monthly average deployed.
  const totalClosed = monthly.reduce((s, m) => s + m.closedTradeCapital, 0);
  const deployedMonths = monthly.filter((m) => m.averageDeployedCapital > 0);
  const meanDeployed =
    deployedMonths.length > 0
      ? deployedMonths.reduce((s, m) => s + m.averageDeployedCapital, 0) / deployedMonths.length
      : 0;
  const capitalTurnover = meanDeployed > 0 ? totalClosed / meanDeployed : null;

  // Income per capital-day from option premium.
  const totalPremiumPnl = monthly.reduce((s, m) => s + m.optionsPremiumPnl, 0);
  const totalCapitalDays = monthly.reduce((s, m) => s + m.capitalDays, 0);
  const incomePerDay = totalCapitalDays > 0 ? totalPremiumPnl / totalCapitalDays : null;

  return { annualizedRoc, capitalTurnover, incomePerDay };
}

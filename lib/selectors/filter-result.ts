import { calculateDashboard } from "@/lib/calculations/engine";
import type { AppSettings, CalculationResult, RealizedPnLEvent, TradeTransaction } from "@/types/trading";

export type DashboardFilters = {
  symbol: string;
  strategy: string;
  year: string;
  month: string;
  account: string;
};

export function filterResult(
  result: CalculationResult,
  filters: DashboardFilters,
  settings: AppSettings
): CalculationResult {
  const eventFilter = (event: RealizedPnLEvent) =>
    (filters.symbol === "ALL" || event.symbol === filters.symbol) &&
    (filters.strategy === "ALL" || event.strategy === filters.strategy) &&
    (filters.year === "ALL" || event.date.slice(0, 4) === filters.year) &&
    (filters.month === "ALL" || event.date.slice(5, 7) === filters.month);
  const transactionFilter = (transaction: TradeTransaction) =>
    (filters.symbol === "ALL" || transaction.symbol === filters.symbol) &&
    (filters.year === "ALL" || transaction.tradeDate.slice(0, 4) === filters.year) &&
    (filters.month === "ALL" || transaction.tradeDate.slice(5, 7) === filters.month) &&
    (filters.account === "ALL" || transaction.accountName === filters.account);
  const nextEvents = result.realizedEvents.filter(eventFilter);
  const nextTransactions = result.transactions.filter(transactionFilter);
  const recalculated = calculateDashboard(nextTransactions, settings);
  return { ...recalculated, realizedEvents: nextEvents };
}

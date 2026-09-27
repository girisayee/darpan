import { calculateDashboard } from "@/lib/calculations/engine";
import type { AppSettings, CalculationResult, RealizedPnLEvent, TradeTransaction } from "@/types/trading";

export type DashboardFilters = {
  symbol: string;
  strategy: string;
  year: string;
  month: string;
  /** Selected trading-account ids; empty = all accounts. */
  accountIds: string[];
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

  const nextEvents = result.realizedEvents.filter(eventFilter);

  // Collect transaction IDs that must be included regardless of their own date:
  // - transactions linked to realized events closing in the target period
  // - transactions linked to option lifecycles closing in the target period or still open
  // This ensures cross-year positions (opened 2025, closed 2026) are fully visible.
  const linkedIds = new Set(nextEvents.flatMap((e) => e.linkedTransactionIds));
  if (filters.year !== "ALL") {
    for (const lc of result.optionLifecycles) {
      const closeYear = (lc.closeDate ?? lc.expirationDate ?? "").slice(0, 4);
      if (closeYear === filters.year || lc.status === "open") {
        for (const id of lc.linkedTransactionIds) linkedIds.add(id);
      }
    }
  }

  const transactionFilter = (transaction: TradeTransaction) => {
    if (filters.accountIds.length > 0 && !(transaction.accountId != null && filters.accountIds.includes(transaction.accountId)))
      return false;
    if (filters.symbol !== "ALL" && transaction.symbol !== filters.symbol) return false;
    // Always include transactions that are part of a position closing in the target period
    if (linkedIds.has(transaction.id)) return true;
    if (filters.year !== "ALL" && transaction.tradeDate.slice(0, 4) !== filters.year) return false;
    if (filters.month !== "ALL" && transaction.tradeDate.slice(5, 7) !== filters.month) return false;
    return true;
  };

  const nextTransactions = result.transactions.filter(transactionFilter);
  const recalculated = calculateDashboard(nextTransactions, settings);

  // Cross-year opening legs can produce prior-year rows in monthlyReturns; strip them.
  const monthlyReturns = filters.year === "ALL"
    ? recalculated.monthlyReturns
    : recalculated.monthlyReturns.filter((m) => String(m.year) === filters.year);

  // Use recomputed events so drill-downs honor the selected accounts and their basis.
  return { ...recalculated, realizedEvents: recalculated.realizedEvents.filter(eventFilter), monthlyReturns };
}

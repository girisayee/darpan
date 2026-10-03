import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";

export type MonthlyTrade = {
  id: string;
  date: string;
  symbol: string;
  pnl: number;
  event: RealizedPnLEvent;
  lifecycle?: OptionLifecycle;
};

export type MonthTrades = {
  month: string;
  pnl: number;
  trades: MonthlyTrade[];
};

/** Group realized closes by month, keeping both legs of a call assignment together. */
export function monthlyTrades(result: CalculationResult): MonthTrades[] {
  const lifecycleByEvent = new Map<string, OptionLifecycle>();
  for (const lifecycle of result.optionLifecycles) {
    for (const outcome of ["closed", "expired", "assignment", "assignment-stock"]) {
      lifecycleByEvent.set(`pnl-${lifecycle.id}-${outcome}`, lifecycle);
    }
  }

  const byMonth = new Map<string, Map<string, MonthlyTrade>>();
  for (const event of result.realizedEvents) {
    if (event.strategy === "DATA_ISSUE") continue;
    const month = event.date.slice(0, 7);
    const lifecycle = lifecycleByEvent.get(event.id);
    const id = lifecycle?.id ?? event.id;
    const trades = byMonth.get(month) ?? new Map<string, MonthlyTrade>();
    const existing = trades.get(id);
    if (existing) {
      existing.pnl += event.realizedPnl;
    } else {
      trades.set(id, { id, date: event.date, symbol: event.symbol, pnl: event.realizedPnl, event, lifecycle });
    }
    byMonth.set(month, trades);
  }

  return result.monthlyReturns.map((row) => {
    const month = `${row.year}-${String(row.month).padStart(2, "0")}`;
    return {
      month,
      pnl: row.realizedPnl,
      trades: [...(byMonth.get(month)?.values() ?? [])].sort(
        (a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id),
      ),
    };
  });
}

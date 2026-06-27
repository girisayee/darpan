"use client";

import { LeaderboardPanels } from "@/components/dashboard/Leaderboard";
import { Column, DataTable } from "@/components/tables/DataTable";
import { TickerLogo } from "@/components/common/TickerLogo";
import { leaderboard } from "@/lib/selectors/leaderboard";
import { peakCapitalRoi } from "@/lib/selectors/symbol-capital";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";
import type { CalculationResult } from "@/types/trading";

type SymbolRow = CalculationResult["aggregates"]["symbolBreakdown"][number] & {
  /** Return on the most capital this symbol tied up at once — never sums recycled collateral. */
  returnOnCapital: number | null;
};

const columns: Column<SymbolRow>[] = [
  {
    key: "symbol",
    header: "Symbol",
    value: (r) => r.symbol,
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <TickerLogo symbol={r.symbol} size={18} />
        <span className="font-medium text-foreground">{r.symbol}</span>
      </span>
    ),
  },
  {
    key: "pnl",
    header: "Net P&L",
    value: (r) => r.pnl,
    render: (r) => signedMoney(r.pnl),
    align: "right",
    tooltip: "Total realized P&L across this symbol's closed events.",
  },
  {
    key: "returnOnCapital",
    header: "Return on capital",
    value: (r) => r.returnOnCapital ?? -Infinity,
    render: (r) =>
      r.returnOnCapital == null ? (
        <span className="opacity-50">—</span>
      ) : (
        signedPercent(r.returnOnCapital)
      ),
    align: "right",
    tooltip:
      "Realized P&L ÷ the most capital this symbol tied up at once. Recycling the same collateral across cycles doesn't inflate the denominator. Open a row to see turnover-based ROI.",
  },
  {
    key: "trades",
    header: "Trades",
    value: (r) => r.trades,
    render: (r) => <span className="tabular-nums text-foreground">{r.trades}</span>,
    align: "right",
    tooltip: "Number of closed (realized) events for this symbol.",
  },
  {
    key: "winRate",
    header: "Win rate",
    value: (r) => r.winRate ?? -Infinity,
    render: (r) =>
      r.winRate == null ? <span className="opacity-50">—</span> : formatPercent(r.winRate, 0),
    align: "right",
    tooltip: "Share of this symbol's closed events that were profitable.",
  },
];

export function TickersTab({
  result,
  onSelectSymbol,
}: {
  result: CalculationResult;
  onSelectSymbol: (row: SymbolRow) => void;
}) {
  const data = leaderboard(result);
  const rows: SymbolRow[] = result.aggregates.symbolBreakdown.map((r) => ({
    ...r,
    returnOnCapital: peakCapitalRoi(result.capitalUsage, r.symbol, r.pnl),
  }));
  return (
    <div className="space-y-5 py-2">
      <LeaderboardPanels data={data} />
      <DataTable
        rows={rows}
        columns={columns}
        empty="No symbol data yet."
        defaultSort={{ key: "pnl", direction: "desc" }}
        searchable
        searchPlaceholder="Filter symbols…"
        pageSize={25}
        onRowClick={onSelectSymbol}
      />
    </div>
  );
}

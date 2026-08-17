"use client";

import { LeaderboardPanels } from "@/components/dashboard/Leaderboard";
import { Column, DataTable } from "@/components/tables/DataTable";
import { TickerLogo } from "@/components/common/TickerLogo";
import { leaderboard } from "@/lib/selectors/leaderboard";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";

type SymbolRow = CalculationResult["aggregates"]["symbolBreakdown"][number] & {
  /** Realized P&L ÷ peak concurrent capital behind this symbol's realized positions. */
  returnOnCapital: number | null;
};

export function TickersTab({
  result,
  onSelectSymbol,
  settings,
}: {
  result: CalculationResult;
  onSelectSymbol: (row: SymbolRow) => void;
  settings: AppSettings;
}) {
  const maskAmounts = settings.maskAmounts;
  const data = leaderboard(result);
  const rows: SymbolRow[] = result.aggregates.symbolBreakdown.map((r) => ({
    ...r,
    returnOnCapital: r.roiPercent,
  }));

  const columns: Column<SymbolRow>[] = [
    {
      key: "symbol",
      header: "Symbol",
      value: (r) => r.symbol,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <TickerLogo symbol={r.symbol} size={20} />
          <span className="font-medium text-foreground">{r.symbol}</span>
        </span>
      ),
    },
    {
      key: "pnl",
      header: "Net P&L",
      value: (r) => r.pnl,
      render: (r) => signedMoney(r.pnl, maskAmounts),
      align: "right",
      tooltip: "Total realized P&L across this symbol's closed events.",
    },
    {
      key: "returnOnCapital",
      header: "Realized RoC",
      value: (r) => r.returnOnCapital ?? -Infinity,
      render: (r) =>
        r.returnOnCapital == null ? (
          <span className="opacity-50">—</span>
        ) : (
          signedPercent(r.returnOnCapital)
        ),
      align: "right",
      tooltip:
        "Realized P&L ÷ the most capital simultaneously behind this symbol's realized positions. Open positions remain exposure only; covered-call stock basis is de-duplicated when the underlying also realizes.",
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

  return (
    <div className="space-y-5 py-2">
      <LeaderboardPanels data={data} maskAmounts={maskAmounts} />
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

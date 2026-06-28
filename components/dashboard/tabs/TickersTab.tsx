"use client";

import { LeaderboardPanels } from "@/components/dashboard/Leaderboard";
import { Column, DataTable } from "@/components/tables/DataTable";
import { TickerLogo } from "@/components/common/TickerLogo";
import { leaderboard } from "@/lib/selectors/leaderboard";
import { peakCapitalRoi } from "@/lib/selectors/symbol-capital";
import { symbolReturnOnCapital } from "@/lib/selectors/return-on-capital";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";

type SymbolRow = CalculationResult["aggregates"]["symbolBreakdown"][number] & {
  /** Canonical return on capital: P&L ÷ time-weighted avg deployed over the symbol's active span. */
  returnOnCapital: number | null;
  /** Return on the most capital this symbol ever tied up at once — never sums recycled collateral. */
  peakCapitalRoi: number | null;
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
  const asOf = new Date().toISOString().slice(0, 10);
  const rows: SymbolRow[] = result.aggregates.symbolBreakdown.map((r) => ({
    ...r,
    returnOnCapital: symbolReturnOnCapital(result.capitalUsage, r.symbol, r.pnl, asOf).roc,
    peakCapitalRoi: peakCapitalRoi(result.capitalUsage, r.symbol, r.pnl),
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
      header: "RoC",
      value: (r) => r.returnOnCapital ?? -Infinity,
      render: (r) =>
        r.returnOnCapital == null ? (
          <span className="opacity-50">—</span>
        ) : (
          signedPercent(r.returnOnCapital)
        ),
      align: "right",
      tooltip:
        "Realized P&L ÷ time-weighted average capital deployed over this symbol's active span — the same definition used on Home and Performance.",
    },
    {
      key: "peakCapitalRoi",
      header: "Peak-capital RoC",
      value: (r) => r.peakCapitalRoi ?? -Infinity,
      render: (r) =>
        r.peakCapitalRoi == null ? (
          <span className="opacity-50">—</span>
        ) : (
          signedPercent(r.peakCapitalRoi)
        ),
      align: "right",
      tooltip:
        "Realized P&L ÷ the most capital this symbol ever tied up at once. Recycling the same collateral across cycles doesn't inflate the denominator — a stricter view than Return on capital.",
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

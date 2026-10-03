"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";
import { cn } from "@/lib/utils/cn";
import { formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";

type SymbolRow = CalculationResult["aggregates"]["symbolBreakdown"][number];
type TickerView = "leaders" | "all" | "losses";
type SortKey = "symbol" | "pnl" | "roiPercent" | "trades" | "winRate";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const PAGE_SIZE = 25;
const ROC_DESCRIPTION = "Realized P&L divided by peak concurrent capital behind this symbol's realized positions. Open positions remain exposure only.";
const SORT_COLUMNS: { key: SortKey; label: string; tooltip?: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "pnl", label: "Realized P&L", tooltip: "Total realized P&L across this symbol's closed events." },
  { key: "roiPercent", label: "Realized RoC", tooltip: ROC_DESCRIPTION },
  { key: "trades", label: "Trades", tooltip: "Number of closed (realized) events for this symbol." },
  { key: "winRate", label: "Win rate", tooltip: "Share of this symbol's closed events that were profitable." },
];

function compareSymbols(a: SymbolRow, b: SymbolRow, sort: Sort): number {
  const av = a[sort.key];
  const bv = b[sort.key];
  // Unavailable RoC and win rates go last in either direction.
  if (av == null && bv == null) return a.symbol.localeCompare(b.symbol);
  if (av == null) return 1;
  if (bv == null) return -1;
  const order = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
  return (sort.direction === "asc" ? order : -order) || a.symbol.localeCompare(b.symbol);
}

function LeaderRow({ row, rank, maxAbsPnl, maskAmounts, onSelect }: {
  row: SymbolRow;
  rank: number;
  maxAbsPnl: number;
  maskAmounts: boolean;
  onSelect: (row: SymbolRow) => void;
}) {
  const barWidth = `${(Math.abs(row.pnl) / maxAbsPnl) * 100}%`;
  return (
    <button type="button" onClick={() => onSelect(row)} className="group relative grid min-h-[74px] w-full grid-cols-[20px_minmax(0,1fr)_auto_16px] items-center gap-2 border-b border-hairline-soft px-4 pb-2 text-left transition-colors last:border-b-0 hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 lg:grid-cols-[20px_minmax(0,1fr)_minmax(95px,auto)_52px_16px] lg:gap-3 lg:px-5">
      <span className="text-caption tabular-nums text-muted-foreground">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate text-strong font-semibold text-foreground">{row.symbol}</span>
        <span className="block text-caption tabular-nums text-muted-foreground lg:hidden">{row.trades} closed {row.trades === 1 ? "event" : "events"}</span>
      </span>
      <span className={cn("shrink-0 text-right text-strong font-semibold tabular-nums", row.pnl >= 0 ? "text-pos" : "text-neg")}>{row.pnl > 0 && !maskAmounts ? "+" : ""}{signedMoney(row.pnl, maskAmounts)}</span>
      <span className="hidden text-right text-body tabular-nums text-foreground lg:block">{row.trades}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      {!maskAmounts && <span className="pointer-events-none absolute bottom-2 left-4 right-4 h-1 overflow-hidden rounded-full bg-surface-inset lg:left-5 lg:right-5" aria-hidden="true">
        <span className={cn("block h-full rounded-full", row.pnl >= 0 ? "bg-pos/80" : "bg-neg/80")} style={{ width: barWidth }} />
      </span>}
    </button>
  );
}

function LeaderColumns() {
  return <div className="hidden grid-cols-[20px_minmax(0,1fr)_minmax(95px,auto)_52px_16px] gap-3 border-b border-hairline-soft px-5 py-2.5 text-caption text-muted-foreground lg:grid">
    <span>#</span><span>Symbol</span><span className="text-right">Realized P&amp;L</span><span className="text-right">Closed</span><span aria-hidden="true" />
  </div>;
}

export function TickersTab({ result, onSelectSymbol, settings, year }: {
  result: CalculationResult;
  onSelectSymbol: (row: SymbolRow) => void;
  settings: AppSettings;
  year?: string;
}) {
  const [view, setView] = useState<TickerView>("leaders");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "pnl", direction: "desc" });
  const [page, setPage] = useState(0);
  const rows = result.aggregates.symbolBreakdown;
  const displayYear = year ?? String(new Date().getFullYear());

  const { winners, losses } = useMemo(() => ({
    winners: rows.filter((row) => row.pnl > 0).sort((a, b) => b.pnl - a.pnl || a.symbol.localeCompare(b.symbol)),
    losses: rows.filter((row) => row.pnl < 0).sort((a, b) => a.pnl - b.pnl || a.symbol.localeCompare(b.symbol)),
  }), [rows]);
  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows
      .filter((row) => view !== "losses" || row.pnl < 0)
      .filter((row) => !search || row.symbol.toLowerCase().includes(search))
      .sort((a, b) => compareSymbols(a, b, sort));
  }, [rows, view, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const closedEvents = filtered.reduce((sum, row) => sum + row.trades, 0);
  const displayedSymbolCount = searching || view !== "leaders" ? filtered.length : rows.length;

  function selectSort(key: SortKey) {
    setPage(0);
    setSort((current) => ({
      key,
      direction: current.key === key ? (current.direction === "asc" ? "desc" : "asc") : key === "symbol" ? "asc" : "desc",
    }));
  }

  const empty = rows.length === 0 ? "No realized symbol results for this year." : searching ? "No symbols match your search." : "No symbols match this view.";

  return (
    <div className="space-y-4 py-2 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-accent">Symbol analysis</p>
          <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">Tickers</h1>
          <p className="mt-1 text-body text-muted-foreground">Search and explore your trading results for {displayYear}.</p>
        </div>
        <p className="text-caption tabular-nums text-muted-foreground" aria-live="polite">
          {displayedSymbolCount} {displayedSymbolCount === 1 ? "symbol" : "symbols"} · {searching || view !== "leaders" ? closedEvents : rows.reduce((sum, row) => sum + row.trades, 0)} closed events
        </p>
      </header>

      <div className="space-y-1.5" aria-label="Ticker controls">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
              if (event.target.value.trim()) { setView("all"); setSort({ key: "pnl", direction: "desc" }); }
            }}
            aria-label="Search all tickers"
            placeholder="Search all tickers…"
            className="h-12 w-full rounded-xl border border-hairline bg-surface pl-12 pr-4 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Ticker view">
          {(["leaders", "all", "losses"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={view === item}
              onClick={() => {
                setView(item);
                setPage(0);
                if (item === "leaders") setQuery("");
                if (item !== "leaders") setSort({ key: "pnl", direction: item === "losses" ? "asc" : "desc" });
              }}
              className={cn(
                "min-h-11 flex-1 whitespace-nowrap rounded-lg border px-3 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 md:flex-none md:px-4",
                view === item ? "border-accent bg-accent text-white" : "border-hairline bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {item === "leaders" ? "Highlights" : item === "all" ? "All symbols" : "Losses"}
            </button>
          ))}
        </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption tabular-nums text-muted-foreground">Search all {rows.length} {rows.length === 1 ? "symbol" : "symbols"}</p>
        {(searching || view !== "leaders") && <div className="flex items-center gap-2">
          <select
            aria-label="Sort symbols"
            value={`${sort.key}-${sort.direction}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split("-") as [SortKey, Sort["direction"]];
              setSort({ key, direction });
              setPage(0);
            }}
            className="h-10 max-w-[138px] rounded-lg border border-hairline bg-surface px-2 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/50 md:hidden"
          >
            <option value="pnl-desc">P&amp;L ↓</option><option value="pnl-asc">P&amp;L ↑</option>
            <option value="roiPercent-desc">RoC ↓</option><option value="roiPercent-asc">RoC ↑</option>
            <option value="trades-desc">Trades ↓</option><option value="trades-asc">Trades ↑</option>
            <option value="winRate-desc">Win rate ↓</option><option value="winRate-asc">Win rate ↑</option>
            <option value="symbol-asc">Symbol A–Z</option><option value="symbol-desc">Symbol Z–A</option>
          </select>
        </div>}
        </div>
      </div>

      {(searching || view !== "leaders") && <p className="text-caption text-muted-foreground md:hidden">
        Realized RoC <InfoTooltip text={ROC_DESCRIPTION} label="Realized RoC" /> is based on peak capital behind closed positions.
      </p>}

      {!searching && view === "leaders" && rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="grid lg:grid-cols-2">
            <section className="border-b border-hairline lg:border-b-0 lg:border-r" aria-label="Biggest wins">
              <div className="flex items-baseline justify-between gap-2 px-4 py-4 lg:px-5"><h2 className="text-lead font-semibold text-foreground">Biggest wins</h2><p className="hidden text-caption text-muted-foreground xl:block">Realized P&amp;L ({displayYear})</p></div>
              <LeaderColumns />
              {winners.length ? winners.slice(0, 5).map((row, index) => <LeaderRow key={row.symbol} row={row} rank={index + 1} maxAbsPnl={winners[0].pnl} maskAmounts={settings.maskAmounts} onSelect={onSelectSymbol} />) : <p className="p-5 text-body text-muted-foreground">No profitable symbols this year.</p>}
            </section>
            <section aria-label="Biggest losses">
              <div className="flex items-baseline justify-between gap-2 px-4 py-4 lg:px-5"><h2 className="text-lead font-semibold text-foreground">Biggest losses</h2><p className="hidden text-caption text-muted-foreground xl:block">Realized P&amp;L ({displayYear})</p></div>
              <LeaderColumns />
              {losses.length ? losses.slice(0, 5).map((row, index) => <LeaderRow key={row.symbol} row={row} rank={index + 1} maxAbsPnl={Math.abs(losses[0].pnl)} maskAmounts={settings.maskAmounts} onSelect={onSelectSymbol} />) : <p className="p-5 text-body text-muted-foreground">No loss-making symbols this year.</p>}
            </section>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-3 sm:px-5">
            <p className="text-caption text-muted-foreground">Top five by realized P&amp;L in {displayYear}.{!settings.maskAmounts && " Bars are scaled within each list."}</p>
            <button type="button" onClick={() => { setView("all"); setPage(0); }} className="inline-flex items-center gap-1 text-body font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Browse all {rows.length} symbols <ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-6 text-body text-muted-foreground">{empty}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <table className="hidden w-full border-separate border-spacing-0 text-body md:table">
            <thead className="bg-surface-inset"><tr>
              {SORT_COLUMNS.map((column) => {
                const active = sort.key === column.key;
                const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("border-b border-hairline px-4 py-3 font-medium text-muted-foreground", column.key === "symbol" ? "text-left" : "text-right")}
                  >
                    <span className={cn("inline-flex items-center gap-1", column.key !== "symbol" && "flex-row-reverse")}>
                      <button type="button" onClick={() => selectSort(column.key)} className="inline-flex items-center gap-1 rounded text-caption font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                        {column.label}<Icon aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      {column.tooltip && <InfoTooltip text={column.tooltip} label={column.label} side="bottom" />}
                    </span>
                  </th>
                );
              })}
            </tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.symbol}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSymbol(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectSymbol(row); }
                  }}
                  className="cursor-pointer transition-colors hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                >
                  <td className="border-b border-hairline-soft px-4 py-3 font-semibold text-foreground"><span className="inline-flex items-center gap-2"><TickerLogo symbol={row.symbol} size={20} />{row.symbol}</span></td>
                  <td className="border-b border-hairline-soft px-4 py-3 text-right font-semibold tabular-nums">{signedMoney(row.pnl, settings.maskAmounts)}</td>
                  <td className="border-b border-hairline-soft px-4 py-3 text-right tabular-nums">{row.roiPercent == null ? <span className="text-muted-foreground">—</span> : signedPercent(row.roiPercent)}</td>
                  <td className="border-b border-hairline-soft px-4 py-3 text-right tabular-nums text-foreground">{row.trades}</td>
                  <td className="border-b border-hairline-soft px-4 py-3 text-right tabular-nums text-foreground">{row.winRate == null ? <span className="text-muted-foreground">—</span> : formatPercent(row.winRate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="divide-y divide-hairline-soft md:hidden" aria-label="Symbols">
            {visible.map((row) => (
              <button
                key={row.symbol}
                type="button"
                onClick={() => onSelectSymbol(row)}
                className="flex min-h-[70px] w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
              >
                <span className="flex min-w-0 items-start gap-2.5">
                  <TickerLogo symbol={row.symbol} size={22} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block truncate text-strong font-semibold text-foreground">{row.symbol}</span>
                    <span className="mt-0.5 block text-caption tabular-nums text-muted-foreground">
                      {row.trades} closed {row.trades === 1 ? "event" : "events"} · {row.winRate == null ? "Win —" : `${formatPercent(row.winRate, 0)} win`}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-strong font-semibold">{signedMoney(row.pnl, settings.maskAmounts)}</span>
                  <span className="mt-0.5 block text-caption text-muted-foreground">RoC {row.roiPercent == null ? "—" : signedPercent(row.roiPercent)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2 text-caption tabular-nums text-muted-foreground">
            <span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} symbols</span>
            {totalPages > 1 && <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-30"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
              <span className="min-w-[48px] text-center">{currentPage + 1} / {totalPages}</span>
              <button type="button" aria-label="Next page" disabled={currentPage === totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-30"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}

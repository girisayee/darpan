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
type ResultFilter = "all" | "winners" | "losers";
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

export function TickersTab({ result, onSelectSymbol, settings, year }: {
  result: CalculationResult;
  onSelectSymbol: (row: SymbolRow) => void;
  settings: AppSettings;
  year?: string;
}) {
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "pnl", direction: "desc" });
  const [page, setPage] = useState(0);
  const rows = result.aggregates.symbolBreakdown;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows
      .filter((row) => filter === "all" || (filter === "winners" ? row.pnl > 0 : row.pnl < 0))
      .filter((row) => !search || row.symbol.toLowerCase().includes(search))
      .sort((a, b) => compareSymbols(a, b, sort));
  }, [rows, filter, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const closedEvents = filtered.reduce((sum, row) => sum + row.trades, 0);

  function selectSort(key: SortKey) {
    setPage(0);
    setSort((current) => ({
      key,
      direction: current.key === key ? (current.direction === "asc" ? "desc" : "asc") : key === "symbol" ? "asc" : "desc",
    }));
  }

  const empty = rows.length === 0 ? "No symbol data yet." : "No symbols match this filter.";

  return (
    <div className="space-y-4 py-2 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-accent">Symbol analysis</p>
          <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">Tickers</h1>
          <p className="mt-1 text-body text-muted-foreground">Realized results by symbol in {year ?? new Date().getFullYear()}.</p>
        </div>
        <p className="text-caption tabular-nums text-muted-foreground" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "symbol" : "symbols"} · {closedEvents} closed events
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2" aria-label="Ticker controls">
        <div className="inline-flex max-w-full rounded-lg border border-hairline bg-surface-inset p-0.5" role="group" aria-label="Filter symbols by result">
          {(["all", "winners", "losers"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => { setFilter(item); setPage(0); }}
              className={cn(
                "min-h-9 rounded-md px-3 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:px-4",
                filter === item ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item === "all" ? "All symbols" : item === "winners" ? "Winners" : "Losers"}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-[220px] sm:flex-none">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0); }}
              aria-label="Search symbols"
              placeholder="Search symbols…"
              className="h-10 w-full rounded-lg border border-hairline bg-surface pl-9 pr-3 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/50"
            />
          </div>
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
        </div>
      </div>

      <p className="text-caption text-muted-foreground md:hidden">
        Realized RoC <InfoTooltip text={ROC_DESCRIPTION} label="Realized RoC" /> is based on peak capital behind closed positions.
      </p>

      {filtered.length === 0 ? (
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

"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import type { MonthlyTrade, MonthTrades } from "@/lib/selectors/monthly-trades";
import { formatDisplayDate, formatMaskedCurrency, formatNumber, monthLabel } from "@/lib/utils/format";

function strategyName(trade: MonthlyTrade) {
  if (!trade.lifecycle) return label(trade.event.strategy);
  return trade.lifecycle.direction === "long" ? "Long option" : label(trade.lifecycle.strategy);
}

const iconButton = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-inset hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

/** Kept mounted during trade drill-in so Back restores search and scroll position. */
export function MonthDetailBody({ month, months, active, onSelectMonth, onSelectTrade, onClose, maskAmounts }: {
  month: MonthTrades;
  months: MonthTrades[];
  active: boolean;
  onSelectMonth?: (month: string) => void;
  onSelectTrade: (trade: MonthlyTrade) => void;
  onClose: () => void;
  maskAmounts: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const lastTradeRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const index = months.findIndex((entry) => entry.month === month.month);
  const previous = months[index - 1];
  const next = months[index + 1];
  const wins = month.trades.filter((trade) => trade.pnl > 0).length;
  const losses = month.trades.filter((trade) => trade.pnl < 0).length;
  const even = month.trades.length - wins - losses;
  const search = query.trim().toLowerCase();
  const visibleTrades = month.trades.filter((trade) =>
    `${trade.symbol} ${strategyName(trade)} ${label(trade.lifecycle?.status ?? "closed")} ${trade.date} ${formatDisplayDate(trade.date)} ${trade.lifecycle?.optionType ?? ""}`.toLowerCase().includes(search),
  ).sort((a, b) => sort === "highest" ? b.pnl - a.pnl : sort === "lowest" ? a.pnl - b.pnl : b.date.localeCompare(a.date));

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const target = lastTradeRef.current?.isConnected ? lastTradeRef.current : closeRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-6">
        <div><p className="text-caption text-muted-foreground">Monthly review</p><h2 className="text-[22px] font-semibold tracking-tight text-foreground">{monthLabel(month.month)}</h2></div>
        <div className="flex items-center">
          <button type="button" className={iconButton} aria-label={previous ? `Previous month: ${monthLabel(previous.month)}` : "Previous month"} disabled={!previous || !onSelectMonth} onClick={() => previous && onSelectMonth?.(previous.month)}><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button>
          <button type="button" className={iconButton} aria-label={next ? `Next month: ${monthLabel(next.month)}` : "Next month"} disabled={!next || !onSelectMonth} onClick={() => next && onSelectMonth?.(next.month)}><ChevronRight aria-hidden="true" className="h-5 w-5" /></button>
          <span className="mx-1 h-5 border-l border-hairline" aria-hidden="true" />
          <button ref={closeRef} type="button" className={iconButton} aria-label="Close monthly review" onClick={onClose}><X aria-hidden="true" className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="border-b border-hairline bg-surface-inset/50 px-4 py-6 sm:px-6">
          <p className="text-body text-muted-foreground">Realized P&amp;L</p>
          <div className="mt-2 text-[38px] font-semibold leading-tight tracking-tight tabular-nums sm:text-[44px]">{signedMoney(month.pnl, maskAmounts)}</div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-body tabular-nums">
            <span className="font-medium text-foreground">{month.trades.length} closed {month.trades.length === 1 ? "trade" : "trades"}</span>
            <span className="text-muted-foreground">{wins} winning <span className="px-1 text-dim">/</span> {losses} losing{even > 0 ? ` / ${even} flat` : ""}</span>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3"><h3 className="text-lead font-medium text-foreground">Closed trades</h3><span className="text-caption text-muted-foreground">Select a trade to explore</span></div>
          {month.trades.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <div className="relative min-w-[160px] flex-1">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search this month's trades" placeholder="Search ticker or strategy" className="h-11 w-full rounded-lg border border-hairline bg-surface pl-9 pr-3 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" />
              </div>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort monthly trades" className="h-11 rounded-lg border border-hairline bg-surface px-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                <option value="newest">Latest close</option><option value="highest">Highest P&amp;L</option><option value="lowest">Lowest P&amp;L</option>
              </select>
            </div>
          )}
          {visibleTrades.length > 0 ? (
            <>
              <p className="mb-2 text-caption text-muted-foreground" aria-live="polite">{search ? `${visibleTrades.length} of ${month.trades.length} trades` : sort === "newest" ? "Most recent first" : sort === "highest" ? "Highest P&L first" : "Lowest P&L first"}</p>
              <ul className="divide-y divide-hairline-soft overflow-hidden rounded-xl border border-hairline">
                {visibleTrades.map((trade) => (
                  <li key={trade.id}>
                    <button type="button" onClick={(event) => { lastTradeRef.current = event.currentTarget; onSelectTrade(trade); }} className="group flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 sm:p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-lead font-semibold text-foreground">{trade.symbol}</span><span className="rounded bg-surface-inset px-1.5 py-0.5 text-micro text-muted-foreground">{strategyName(trade)}</span></div>
                        <p className="mt-1 text-caption text-muted-foreground">
                          {trade.lifecycle
                            ? `${formatNumber(trade.lifecycle.contracts)} ${trade.lifecycle.contracts === 1 ? "contract" : "contracts"} · ${formatMaskedCurrency(trade.lifecycle.strikePrice, maskAmounts, { maximumFractionDigits: 2 })} ${trade.lifecycle.optionType} · Exp ${formatDisplayDate(trade.lifecycle.expirationDate)}`
                            : `${formatNumber(trade.event.quantity, Number.isInteger(trade.event.quantity) ? 0 : 4)} shares`}
                        </p>
                        <p className="mt-1 text-caption text-muted-foreground">{label(trade.lifecycle?.status ?? "closed")} · {formatDisplayDate(trade.date)}</p>
                      </div>
                      <span className="shrink-0 text-strong font-medium tabular-nums sm:text-lead">{signedMoney(trade.pnl, maskAmounts)}</span>
                      <ChevronRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent sm:block" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-hairline px-4 py-10 text-center">
              <CalendarDays aria-hidden="true" className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="text-strong font-medium text-foreground">{search ? "No matching trades" : "No trades closed this month"}</p>
              <p className="mt-1 text-body text-muted-foreground">{search ? "Try another ticker or strategy." : "Open positions appear here when their P&L is realized."}</p>
              {search && <button type="button" onClick={() => setQuery("")} className="mt-3 min-h-11 rounded-lg px-3 text-body text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Clear search</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

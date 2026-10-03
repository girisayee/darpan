"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { label } from "@/components/dashboard/tabs/shared";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import type { MonthlyTrade } from "@/lib/selectors/monthly-trades";
import { formatCurrency, formatDisplayDate, formatPercent, MASKED_AMOUNT, monthLabel, monthTick } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useRef, useState } from "react";

export type MonthSlot = {
  /** Calendar month in YYYY-MM form. */
  month: string;
  /** Realized P&L, or null when no realized closes exist in that month. */
  pnl: number | null;
  hasRealizedClose?: boolean;
  isFuture?: boolean;
};

type SignedAmountProps = { value: number | null; masked?: boolean; className?: string };

function SignedAmount({ value, masked = false, className }: SignedAmountProps) {
  if (value === null || Number.isNaN(value)) return <span className={cn("tabular-nums text-muted-foreground", className)}>—</span>;
  if (masked) return <span className={cn("tabular-nums text-muted-foreground", className)}>{MASKED_AMOUNT}</span>;
  return (
    <span className={cn("tabular-nums", value > 0 && "text-pos", value < 0 && "text-neg", className)}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}{formatCurrency(Math.abs(value))}
    </span>
  );
}

function signedRate(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatPercent(Math.abs(value), 1)}`;
}

function MiniZeroBar({ value, maxAbs, className }: { value: number | null; maxAbs: number; className?: string }) {
  const fraction = value === null || maxAbs === 0 ? 0 : Math.min(1, Math.abs(value) / maxAbs);
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-surface-active", className)} aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/60" />
      {value !== null && value !== 0 && (
        <span
          className={cn("absolute inset-y-0", value > 0 ? "bg-pos" : "bg-neg")}
          style={{ width: `${fraction * 50}%`, left: value > 0 ? "50%" : undefined, right: value < 0 ? "50%" : undefined }}
        />
      )}
    </div>
  );
}

/** Twelve month buttons with a zero-centered P&L marker; scrolls the selected month into view on narrow screens. */
export function MonthStrip({
  slots,
  selectedMonth,
  onSelectMonth,
  maskAmounts = false,
}: {
  slots: MonthSlot[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  maskAmounts?: boolean;
}) {
  const stripRef = useRef<HTMLElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const year = Number(selectedMonth.slice(0, 4)) || new Date().getFullYear();
  const byMonth = new Map(slots.map((slot) => [slot.month, slot]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return byMonth.get(month) ?? { month, pnl: null };
  });
  const maxAbs = months.reduce((max, item) => Math.max(max, Math.abs(item.pnl ?? 0)), 0);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const selectedIndex = months.findIndex((item) => item.month === selectedMonth);
  const previousMonth = selectedIndex > 0 ? months[selectedIndex - 1].month : null;
  const nextSlot = selectedIndex >= 0 ? months[selectedIndex + 1] : null;
  const nextMonth = nextSlot && !(nextSlot.isFuture ?? nextSlot.month > currentMonth) ? nextSlot.month : null;

  useEffect(() => {
    const strip = stripRef.current;
    const selected = selectedRef.current;
    if (!strip || !selected) return;
    const centerSelected = () => {
      if (strip.scrollWidth <= strip.clientWidth) return;
      const stripLeft = strip.getBoundingClientRect().left;
      const selectedLeft = selected.getBoundingClientRect().left - stripLeft + strip.scrollLeft;
      strip.scrollTo({ left: selectedLeft - (strip.clientWidth - selected.clientWidth) / 2, behavior: "auto" });
    };
    centerSelected();
    const observer = new ResizeObserver(centerSelected);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [selectedMonth]);

  return (
    <div className="flex min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface/70">
      <nav ref={stripRef} aria-label={`${year} monthly realized P&L`} className="scrollbar-hidden min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
        <div className="flex min-w-max lg:min-w-0">
        {months.map((slot, index) => {
          const isSelected = slot.month === selectedMonth;
          const hasRealizedClose = slot.hasRealizedClose ?? slot.pnl !== null;
          const disabled = slot.isFuture ?? slot.month > currentMonth;
          const amount = hasRealizedClose ? slot.pnl : null;
          return (
            <button
              key={slot.month}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${monthLabel(slot.month)} realized P&L ${!hasRealizedClose || amount === null ? "no closes" : maskAmounts ? "hidden" : formatCurrency(amount)}${disabled ? ", future month" : ""}`}
              onClick={() => onSelectMonth(slot.month)}
              className={cn(
                "flex min-h-[96px] w-[106px] shrink-0 flex-col items-center justify-center gap-1 border-r border-hairline px-2 lg:w-auto lg:min-w-0 lg:flex-1",
                "transition-colors hover:bg-surface-active focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                isSelected && "rounded-lg bg-accent/10 ring-2 ring-inset ring-accent",
                (!hasRealizedClose || disabled) && "text-muted-foreground",
                disabled && "cursor-not-allowed opacity-50",
                index === 0 && "lg:rounded-l-xl",
              )}
            >
              <span className="text-caption font-medium text-muted-foreground">{monthTick(slot.month)}</span>
              <SignedAmount value={amount} masked={maskAmounts} className="text-[13px] font-semibold leading-5 lg:text-[14px]" />
              <MiniZeroBar value={maskAmounts ? null : amount} maxAbs={maxAbs} className="h-2 w-full max-w-[78px]" />
            </button>
          );
        })}
        </div>
      </nav>
      <div className="hidden shrink-0 items-center gap-1 border-l border-hairline px-2 lg:flex">
        <button type="button" aria-label="Previous month" disabled={!previousMonth} onClick={() => previousMonth && onSelectMonth(previousMonth)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline text-muted-foreground hover:bg-surface-active hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Next month" disabled={!nextMonth} onClick={() => nextMonth && onSelectMonth(nextMonth)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline text-muted-foreground hover:bg-surface-active hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function isoDate(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** A seven-column, weekday-aligned month calendar with selectable dates and magnitude shading. */
export function MonthCalendar({
  month,
  days,
  selectedDate,
  onSelectDate,
  maskAmounts = false,
}: {
  month: string;
  days: DailyPnl[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  maskAmounts?: boolean;
}) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const monthIndex = monthNumber - 1;
  const leading = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cellCount = Math.ceil((leading + dayCount) / 7) * 7;
  const daysByDate = new Map(days.map((day) => [day.date.slice(0, 10), day]));
  const monthDays = days.filter((day) => day.date.slice(0, 7) === month);
  const maxAbs = monthDays.reduce((max, day) => Math.max(max, Math.abs(day.pnl)), 0);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section aria-label={`${monthLabel(month)} daily realized P&L calendar`} className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="grid grid-cols-7 border-b border-hairline bg-surface-inset">
        {weekDays.map((weekday) => <div key={weekday} className="py-2 text-center text-caption font-medium text-muted-foreground">{weekday}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: cellCount }, (_, cellIndex) => {
          const dayNumber = cellIndex - leading + 1;
          const date = isoDate(year, monthIndex, dayNumber);
          const inMonth = dayNumber >= 1 && dayNumber <= dayCount;
          if (!inMonth) {
            return <div key={date} aria-hidden="true" className="min-h-[54px] border-b border-r border-hairline bg-surface-inset/40 p-1.5 text-caption text-muted-foreground/60 sm:min-h-[82px] sm:p-2">{new Date(`${date}T00:00:00Z`).getUTCDate()}</div>;
          }
          const day = daysByDate.get(date);
          const selected = selectedDate === date;
          const hasPnl = day !== undefined;
          const intensity = hasPnl && maxAbs > 0 ? 0.12 + 0.3 * Math.min(1, Math.abs(day.pnl) / maxAbs) : 0;
          const backgroundColor = !hasPnl || maskAmounts
            ? undefined
            : `rgb(var(--${day.pnl >= 0 ? "pos" : "neg"}) / ${intensity.toFixed(2)})`;
          const accessiblePnl = day
            ? maskAmounts ? "realized activity, amount hidden" : `${day.pnl < 0 ? "loss" : day.pnl > 0 ? "gain" : "break-even"} ${formatCurrency(Math.abs(day.pnl))}`
            : "no realized closes";
          return (
            <button
              key={date}
              type="button"
              aria-label={`${formatDisplayDate(date)}: ${accessiblePnl}${selected ? ", selected" : ""}`}
              aria-pressed={selected}
              title={`${formatDisplayDate(date)}${day ? maskAmounts ? " · Amount hidden" : ` · ${formatCurrency(day.pnl)}` : " · No realized closes"}`}
              onClick={() => onSelectDate(date)}
              style={{ backgroundColor }}
              className={cn(
                "relative flex min-h-[54px] flex-col items-start border-b border-r border-hairline p-1.5 text-left transition sm:min-h-[82px] sm:p-2",
                (!hasPnl || maskAmounts) && "bg-surface hover:bg-surface-active",
                hasPnl && "hover:brightness-110",
                selected && "z-[1] rounded-sm outline outline-2 outline-offset-[-2px] outline-accent",
                "focus-visible:z-[2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
              )}
            >
              <span className={cn("text-caption tabular-nums", hasPnl ? "text-foreground" : "text-muted-foreground")}>{dayNumber}</span>
              {day && (
                <span className={cn("mt-auto hidden w-full text-center text-body font-semibold tabular-nums sm:block", day.pnl > 0 && "text-pos", day.pnl < 0 && "text-neg")}>
                  {maskAmounts ? MASKED_AMOUNT : `${day.pnl > 0 ? "+" : day.pnl < 0 ? "−" : ""}${formatCurrency(Math.abs(day.pnl))}`}
                </span>
              )}
              {day && <span aria-hidden="true" className={cn("mt-auto text-caption font-semibold sm:hidden", !maskAmounts && day.pnl > 0 && "text-pos", !maskAmounts && day.pnl < 0 && "text-neg", (maskAmounts || day.pnl === 0) && "text-muted-foreground")}>{maskAmounts ? "•" : day.pnl > 0 ? "+" : day.pnl < 0 ? "−" : "0"}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline px-3 py-3 text-caption text-muted-foreground" role="group" aria-label="Calendar legend">
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-pos" aria-hidden="true" />Profit day (+)</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-neg" aria-hidden="true" />Loss day (−)</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-surface-active" aria-hidden="true" />No trades</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border-2 border-accent" aria-hidden="true" />Selected day</span>
      </div>
    </section>
  );
}

/** Grouped monthly closes with local search, close-date filtering, and P&L/date sorting. */
export function MonthTradeLedger({
  trades,
  month,
  maskAmounts = false,
  onSelectTrade,
  rocByTradeId,
}: {
  trades: MonthlyTrade[];
  month?: string;
  maskAmounts?: boolean;
  onSelectTrade: (trade: MonthlyTrade) => void;
  /** Optional grouped-trade RoC values. Missing/null entries render as unavailable. */
  rocByTradeId?: Readonly<Record<string, number | null>>;
}) {
  const [search, setSearch] = useState("");
  const [dateFilterState, setDateFilterState] = useState({ month, value: "all" });
  const [sort, setSort] = useState<"newest" | "highest" | "lowest">("newest");
  const dateFilter = dateFilterState.month === month ? dateFilterState.value : "all";
  const availableDates = useMemo(
    () => [...new Set(trades.map((trade) => trade.date.slice(0, 10)))].sort((a, b) => b.localeCompare(a)),
    [trades],
  );
  const visibleTrades = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return trades
      .filter((trade) => dateFilter === "all" || trade.date.slice(0, 10) === dateFilter)
      .filter((trade) => !query || trade.symbol.toLocaleLowerCase().includes(query) || label(trade.event.strategy).toLocaleLowerCase().includes(query))
      .slice()
      .sort((a, b) => {
        if (sort === "highest") return b.pnl - a.pnl || b.date.localeCompare(a.date);
        if (sort === "lowest") return a.pnl - b.pnl || b.date.localeCompare(a.date);
        return b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol);
      });
  }, [trades, search, dateFilter, sort]);
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface" aria-label="Closed trades">
      <div className="grid gap-2 border-b border-hairline p-3 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,auto)_minmax(150px,auto)]">
        <label className="relative block min-w-0">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search symbol or strategy</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol or strategy…" className="h-11 w-full rounded-lg border border-hairline bg-surface-inset pl-9 pr-3 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" />
        </label>
        <label className="relative block">
          <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Filter by close date</span>
          <select value={dateFilter} onChange={(event) => setDateFilterState({ month, value: event.target.value })} className="h-11 w-full appearance-none rounded-lg border border-hairline bg-surface-inset pl-9 pr-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <option value="all">All {month ? monthLabel(month) : "dates"}</option>
            {availableDates.map((date) => <option key={date} value={date}>{formatDisplayDate(date)}</option>)}
          </select>
        </label>
        <label className="relative block">
          <span className="sr-only">Sort closed trades</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 w-full rounded-lg border border-hairline bg-surface-inset px-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <option value="newest">Newest first</option>
            <option value="highest">Highest P&amp;L</option>
            <option value="lowest">Lowest P&amp;L</option>
          </select>
        </label>
      </div>
      {visibleTrades.length === 0 ? (
        <div className="p-8 text-center text-body text-muted-foreground">{search || dateFilter !== "all" ? "No trades match these filters." : "No closed trades for this month."}</div>
      ) : <>
      <div className="hidden grid-cols-[1.1fr_1fr_1.5fr_1fr_0.7fr_24px] items-center gap-3 border-b border-hairline bg-surface-inset px-4 py-3 text-caption font-medium text-muted-foreground md:grid">
        <span>Close date</span><span>Symbol</span><span>Strategy</span><span className="text-right">Realized P&amp;L</span><span className="text-right">RoC</span><span />
      </div>
      <div>
        {visibleTrades.map((trade) => {
          const roc = rocByTradeId?.[trade.id] ?? null;
          return (
            <button
              key={trade.id}
              type="button"
              onClick={() => onSelectTrade(trade)}
              aria-label={`${trade.symbol}, ${label(trade.event.strategy)}, closed ${formatDisplayDate(trade.date)}, realized P&L ${maskAmounts ? "hidden" : formatCurrency(trade.pnl)}${roc === null ? "" : `, return on capital ${maskAmounts ? "hidden" : formatPercent(roc, 1)}`}`}
              className="grid min-h-[72px] w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-x-3 border-b border-hairline px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent md:min-h-[48px] md:grid-cols-[1.1fr_1fr_1.5fr_1fr_0.7fr_24px] md:gap-3 md:px-4 md:py-1.5"
            >
              <span className="hidden text-body text-foreground md:block">{formatDisplayDate(trade.date)}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">{trade.symbol}</span>
                <span className="block truncate text-caption text-muted-foreground md:hidden">{label(trade.event.strategy)}</span>
              </span>
              <span className="hidden truncate text-body text-muted-foreground md:block">{label(trade.event.strategy)}</span>
              <span className="min-w-[96px] text-right">
                <SignedAmount value={trade.pnl} masked={maskAmounts} className="text-body font-semibold" />
                <span className="block text-caption text-muted-foreground md:hidden">{formatDisplayDate(trade.date)}</span>
              </span>
              <span className={cn("hidden text-right text-body font-medium tabular-nums md:block", roc !== null && roc > 0 && "text-pos", roc !== null && roc < 0 && "text-neg", roc === null && "text-muted-foreground")}>
                {roc === null ? "—" : maskAmounts ? "•••%" : signedRate(roc)}
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>
      </>}
    </section>
  );
}

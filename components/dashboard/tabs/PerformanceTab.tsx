"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import {
  MonthCalendar,
  MonthStrip,
  MonthTradeLedger,
} from "@/components/dashboard/performance";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import { monthlyTrades, type MonthlyTrade } from "@/lib/selectors/monthly-trades";
import {
  defaultPerformanceMonth,
  groupedDayTrades,
  instrumentAttribution,
  monthSlots,
} from "@/lib/selectors/performance-view";
import { cn } from "@/lib/utils/cn";
import { formatDisplayDate, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";

type View = "trades" | "daily";

function fullMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, number - 1, 1)));
}

function signedRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : value < 0 ? "−" : "") + formatPercent(Math.abs(value), 1);
}

function MonthHeader({
  month,
  pnl,
  roc,
  tradeCount,
  options,
  stocks,
  previous,
  next,
  view,
  maskAmounts,
  onSelectMonth,
  onSelectView,
}: {
  month: string;
  pnl: number;
  roc: number | null;
  tradeCount: number;
  options: { pnl: number; roc: number | null };
  stocks: { pnl: number; roc: number | null };
  previous: string | null;
  next: string | null;
  view: View;
  maskAmounts: boolean;
  onSelectMonth: (month: string) => void;
  onSelectView: (view: View) => void;
}) {
  const categoryRoc = (value: number | null) => value === null ? "RoC unavailable" : `RoC ${maskAmounts ? "•••%" : signedRate(value)}`;
  return (
    <section className="min-w-0 rounded-xl border border-hairline bg-surface p-4 sm:p-5" aria-label={fullMonth(month) + " summary"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={previous ? "Previous month: " + fullMonth(previous) : "Previous month"}
            disabled={!previous}
            onClick={() => previous && onSelectMonth(previous)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline text-muted-foreground hover:bg-surface-inset hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <h2 className="min-w-[160px] text-center text-lead font-semibold text-foreground sm:min-w-0 sm:text-left">{fullMonth(month)}</h2>
          <button
            type="button"
            aria-label={next ? "Next month: " + fullMonth(next) : "Next month"}
            disabled={!next}
            onClick={() => next && onSelectMonth(next)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline text-muted-foreground hover:bg-surface-inset hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div role="tablist" aria-label="Monthly view" className="flex w-full rounded-lg border border-hairline bg-surface-inset p-1 sm:w-auto">
          {(["trades", "daily"] as const).map((item) => (
            <button
              key={item}
              id={"performance-" + item + "-tab"}
              type="button"
              role="tab"
              aria-selected={view === item}
              aria-controls="performance-view-panel"
              onClick={() => onSelectView(item)}
              className={cn(
                "min-h-11 flex-1 rounded-md px-5 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:flex-none",
                view === item ? "bg-accent text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item === "trades" ? "Trades" : "Daily view"}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("mt-4 grid grid-cols-6 gap-x-2 gap-y-3 border-t border-hairline pt-4 sm:gap-x-4", view === "trades" ? "lg:grid-cols-5" : "lg:grid-cols-3")}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="text-caption text-muted-foreground">Realized P&amp;L</p>
          <p className="mt-1 text-[23px] font-semibold leading-tight tabular-nums sm:text-[26px]">{signedMoney(pnl, maskAmounts)}</p>
        </div>
        <div className="col-span-2 min-w-0 border-l border-hairline pl-2 sm:pl-4 lg:col-span-1">
          <p className="flex items-center gap-1 text-caption text-muted-foreground">
            Realized RoC
            <InfoTooltip label="Monthly realized RoC" text="Realized P&L divided by capped peak concurrent capital behind positions realized in this month. Open exposure is excluded." />
          </p>
          <p className={cn("mt-1 text-[21px] font-semibold leading-tight tabular-nums sm:text-[24px]", roc !== null && roc > 0 && "text-pos", roc !== null && roc < 0 && "text-neg")} title={roc === null ? "Unavailable because no realized capital denominator exists" : undefined}>
            {roc === null ? "—" : maskAmounts ? "•••%" : signedRate(roc)}
          </p>
        </div>
        <div className="col-span-2 min-w-0 border-l border-hairline pl-2 sm:pl-4 lg:col-span-1">
          <p className="text-caption text-muted-foreground">Closed trades</p>
          <p className="mt-1 text-[21px] font-semibold leading-tight tabular-nums text-foreground sm:text-[24px]">{tradeCount}</p>
        </div>
        {view === "trades" && ([{ name: "Options", value: options }, { name: "Stocks", value: stocks }] as const).map(({ name, value }) => (
          <div key={name} className="col-span-3 min-w-0 border-t border-hairline pt-3 lg:col-span-1 lg:border-l lg:border-t-0 lg:py-0 lg:pl-4">
            <p className="flex items-center gap-1 text-caption text-muted-foreground">
              {name}
              <InfoTooltip label={`${name} realized return on capital`} text="Category P&L contributes to the month total. Category RoC uses peak concurrent realized capital within this category and does not add to monthly RoC." />
            </p>
            <p className="mt-1 text-[19px] font-semibold leading-tight tabular-nums sm:text-[22px]">{signedMoney(value.pnl, maskAmounts)}</p>
            <p className="mt-1 text-caption tabular-nums text-muted-foreground" title={value.roc === null ? "Unavailable because no realized capital denominator exists" : undefined}>{categoryRoc(value.roc)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SelectedDayPanel({
  date,
  pnl,
  trades,
  maskAmounts,
  onSelectTrade,
}: {
  date: string | null;
  pnl: number;
  trades: MonthlyTrade[];
  maskAmounts: boolean;
  onSelectTrade: (trade: MonthlyTrade) => void;
}) {
  return (
    <section className="min-h-[230px] rounded-xl border border-hairline bg-surface p-4" aria-live="polite" aria-label="Selected day">
      {!date ? (
        <div className="flex min-h-[190px] items-center justify-center text-center text-body text-muted-foreground">
          No realized closes this month. Select a calendar day to inspect it.
        </div>
      ) : (
        <>
          <h3 className="text-section font-semibold text-foreground">{formatDisplayDate(date)}</h3>
          <div className="mt-2 text-[28px] font-semibold tabular-nums">{signedMoney(pnl, maskAmounts)}</div>
          <p className="mt-1 text-body text-muted-foreground">{trades.length} closed {trades.length === 1 ? "trade" : "trades"}</p>
          {trades.length === 0 ? (
            <p className="mt-5 border-t border-hairline pt-4 text-body text-muted-foreground">No realized closes on this day.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
              {trades.map((trade) => (
                <li key={trade.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTrade(trade)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="min-w-0"><span className="block font-semibold text-foreground">{trade.symbol}</span><span className="text-caption text-muted-foreground">{label(trade.event.strategy)}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{signedMoney(trade.pnl, maskAmounts)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function PerformanceTab({
  result,
  settings,
  year,
  dataLoaded,
  onSelectEvent,
  onSelectLifecycle,
}: {
  result: CalculationResult;
  settings: AppSettings;
  year: string;
  dataLoaded: boolean;
  onSelectEvent: (event: RealizedPnLEvent) => void;
  onSelectLifecycle: (lifecycle: OptionLifecycle) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedYear = Number(year) || new Date().getFullYear();
  const slots = useMemo(() => monthSlots(result, selectedYear), [result, selectedYear]);
  const defaultMonth = useMemo(() => defaultPerformanceMonth(result, selectedYear), [result, selectedYear]);
  const monthParam = searchParams.get("month");
  const validMonth = slots.find((slot) => slot.month === monthParam && !slot.isFuture);
  const month = validMonth?.month ?? defaultMonth;
  const viewParam = searchParams.get("view");
  const view: View = viewParam === "daily" ? "daily" : "trades";
  const accountScope = searchParams.get("accounts") ?? "";
  const [selectedDay, setSelectedDay] = useState<{ month: string; date: string; accountScope: string; sourceResult: CalculationResult } | null>(null);

  useEffect(() => {
    if (!dataLoaded) return;
    if (monthParam === month && (viewParam === null || viewParam === "daily")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    if (view === "daily") params.set("view", "daily");
    else params.delete("view");
    router.replace(pathname + "?" + params.toString(), { scroll: false });
  }, [dataLoaded, month, monthParam, pathname, router, searchParams, view, viewParam]);

  function selectMonth(next: string) {
    if (next === month) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(pathname + "?" + params.toString(), { scroll: false });
  }

  function selectView(next: View) {
    if (next === view) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    if (next === "daily") params.set("view", "daily");
    else params.delete("view");
    router.push(pathname + "?" + params.toString(), { scroll: false });
  }

  const slot = slots.find((item) => item.month === month);
  const index = slots.findIndex((item) => item.month === month);
  const previous = index > 0 ? slots[index - 1].month : null;
  const nextSlot = index >= 0 ? slots[index + 1] : null;
  const next = nextSlot && !nextSlot.isFuture ? nextSlot.month : null;
  const trades = useMemo(() => monthlyTrades(result).find((item) => item.month === month)?.trades ?? [], [result, month]);
  const attribution = useMemo(() => instrumentAttribution(result, month, settings.maxBuyingPower), [result, month, settings.maxBuyingPower]);
  const daily = useMemo(() => dailyPnl(result.realizedEvents).filter((day) => day.date.startsWith(month)), [result.realizedEvents, month]);
  const groupedDays = useMemo(() => groupedDayTrades(result, month), [result, month]);
  const latestRealizedDay = groupedDays.at(-1)?.date ?? null;
  const activeDate = selectedDay?.month === month && selectedDay.accountScope === accountScope && selectedDay.sourceResult === result
    ? selectedDay.date
    : latestRealizedDay;
  const activeDay = groupedDays.find((day) => day.date === activeDate);
  const rocByTradeId = useMemo(() => Object.fromEntries(trades.map((trade) => [
    trade.id,
    trade.event.strategy === "COVERED_CALL_ASSIGNMENT" || trade.event.strategy === "COVERED_CALL_ASSIGNMENT_STOCK"
      ? null
      : trade.event.roiPercent,
  ])), [trades]);

  function selectTrade(trade: MonthlyTrade) {
    if (trade.lifecycle) onSelectLifecycle(trade.lifecycle);
    else onSelectEvent(trade.event);
  }

  return (
    <div className="space-y-4 py-2">
      <header>
        <h1 className="text-[30px] font-semibold tracking-tight text-foreground sm:text-[36px]">Monthly review</h1>
        <p className="mt-1 text-body text-muted-foreground">Closed trades and daily results for the selected month.</p>
      </header>
      <MonthStrip slots={slots} selectedMonth={month} onSelectMonth={selectMonth} maskAmounts={settings.maskAmounts} />
      <MonthHeader
        month={month}
        pnl={slot?.pnl ?? 0}
        roc={slot?.roc ?? null}
        tradeCount={slot?.tradeCount ?? 0}
        options={attribution.options}
        stocks={attribution.stocks}
        previous={previous}
        next={next}
        view={view}
        maskAmounts={settings.maskAmounts}
        onSelectMonth={selectMonth}
        onSelectView={selectView}
      />
      <div id="performance-view-panel" role="tabpanel" aria-labelledby={"performance-" + view + "-tab"} className="space-y-4">
        {view === "trades" ? (
          <MonthTradeLedger month={month} trades={trades} onSelectTrade={selectTrade} rocByTradeId={rocByTradeId} maskAmounts={settings.maskAmounts} />
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
            <MonthCalendar month={month} days={daily} selectedDate={activeDate} onSelectDate={(date) => setSelectedDay({ month, date, accountScope, sourceResult: result })} maskAmounts={settings.maskAmounts} />
            <SelectedDayPanel date={activeDate} pnl={activeDay?.pnl ?? 0} trades={activeDay?.trades ?? []} maskAmounts={settings.maskAmounts} onSelectTrade={selectTrade} />
          </div>
        )}
      </div>
    </div>
  );
}

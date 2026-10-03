"use client";

import { ArrowUpRight, CalendarDays } from "lucide-react";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import type { MonthTrades } from "@/lib/selectors/monthly-trades";
import { cn } from "@/lib/utils/cn";
import { monthTick } from "@/lib/utils/format";

export function MonthlyTradeBreakdown({ months, onSelectMonth, maskAmounts }: {
  months: MonthTrades[];
  onSelectMonth: (month: string) => void;
  maskAmounts: boolean;
}) {
  const largestPnl = Math.max(...months.map((month) => Math.abs(month.pnl)), 1);
  if (months.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline p-8 text-center">
        <CalendarDays className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-strong font-medium text-foreground">Your monthly story starts here</p>
        <p className="mt-1 text-body text-muted-foreground">Realized trades will appear in the month they close.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
      {months.map((month) => (
        <button key={month.month} type="button" aria-haspopup="dialog" onClick={() => onSelectMonth(month.month)}
          className="group relative overflow-hidden rounded-xl border border-hairline bg-surface p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:p-5">
          <span className="sr-only">View trades for </span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-strong font-medium text-foreground">{monthTick(month.month)} <span className="ml-1 text-caption font-normal text-muted-foreground">{month.month.slice(0, 4)}</span></span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
          </div>
          <div className="mt-5 break-words text-[24px] font-semibold leading-none tracking-tight tabular-nums sm:text-[28px]">{signedMoney(month.pnl, maskAmounts)}</div>
          <div className="mt-2 text-caption text-muted-foreground">{month.trades.length} closed {month.trades.length === 1 ? "trade" : "trades"}</div>
          <div aria-hidden="true" className="mt-5 h-1 overflow-hidden rounded-full bg-surface-inset">
            <div className={cn("h-full rounded-full", maskAmounts ? "bg-hairline" : month.pnl < 0 ? "bg-neg/70" : "bg-pos/70")}
              style={{ width: maskAmounts ? "100%" : `${Math.abs(month.pnl) / largestPnl * 100}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

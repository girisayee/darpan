"use client";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { formatDisplayDate } from "@/lib/utils/format";

export function DayDetail({ day }: { day: DailyPnl | null }) {
  if (!day) return <p className="text-[12px] text-muted-foreground">Select a day to see its trades.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-foreground">{formatDisplayDate(day.date)}</span>
        <span className="text-[12px] font-medium">{signedMoney(day.pnl)}</span>
      </div>
      {day.events.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded-[8px] bg-surface-inset px-2.5 py-1.5">
          <span className="text-[11px] text-foreground">{e.symbol} <span className="text-muted-foreground">{label(e.strategy)}</span></span>
          <span className="text-[11px]">{signedMoney(e.realizedPnl)}</span>
        </div>
      ))}
    </div>
  );
}

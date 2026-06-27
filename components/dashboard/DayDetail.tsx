"use client";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import type { RealizedPnLEvent } from "@/types/trading";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { formatDisplayDate } from "@/lib/utils/format";

export function DayDetail({
  day,
  onSelect,
}: {
  day: DailyPnl | null;
  onSelect?: (e: RealizedPnLEvent) => void;
}) {
  if (!day) return <p className="text-body text-muted-foreground">Select a day to see its trades.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-medium text-foreground">{formatDisplayDate(day.date)}</span>
        <span className="text-body font-medium">{signedMoney(day.pnl)}</span>
      </div>
      {day.events.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onSelect?.(e)}
          className="flex w-full items-center justify-between rounded-[8px] bg-surface-inset px-2.5 py-1.5 text-left transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="text-caption text-foreground">{e.symbol} <span className="text-muted-foreground">{label(e.strategy)}</span></span>
          <span className="text-caption">{signedMoney(e.realizedPnl)}</span>
        </button>
      ))}
    </div>
  );
}

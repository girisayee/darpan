"use client";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import { formatDisplayDate } from "@/lib/utils/format";

export function intensity(pnl: number, maxAbs: number): number {
  if (maxAbs <= 0) return 0.2;
  return 0.2 + 0.8 * Math.min(1, Math.abs(pnl) / maxAbs);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function CalendarHeatmap({ days, mode, year: yearProp, onSelectDay }: {
  days: DailyPnl[]; mode: "year" | "month"; year?: string; onSelectDay: (d: DailyPnl) => void;
}) {
  const byKey = new Map(days.map((d) => [d.date, d]));
  const maxAbs = days.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0);
  const color = (pnl: number) =>
    `rgb(var(--${pnl >= 0 ? "pos" : "neg"}) / ${intensity(pnl, maxAbs).toFixed(2)})`;

  // Use the explicitly-passed year when available; fall back to inferring from data.
  const year = yearProp ?? (days.length ? days[days.length - 1].date.slice(0, 4) : `${new Date().getFullYear()}`);
  const monthsToRender = mode === "year"
    ? Array.from(new Set(days.map((d) => Number(d.date.slice(5, 7))))).sort((a, b) => a - b)
    : [days.length ? Number(days[days.length - 1].date.slice(5, 7)) : 1];

  const cell = (key: string) => {
    const d = byKey.get(key);
    if (!d) return <div key={key} className="aspect-square rounded-[4px] bg-background" />;
    return (
      <button key={key} type="button" title={formatDisplayDate(key)} onClick={() => onSelectDay(d)}
        className="aspect-square rounded-[4px] border border-transparent hover:border-accent"
        style={{ background: color(d.pnl) }} />
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {monthsToRender.map((m) => {
        const mm = String(m).padStart(2, "0");
        const dim = new Date(Number(year), m, 0).getDate();
        return (
          <div key={m} className="grid items-center gap-1" style={{ gridTemplateColumns: `30px repeat(31, 1fr)` }}>
            <span className="text-micro text-muted-foreground">{MONTHS[m - 1]}</span>
            {Array.from({ length: 31 }, (_, i) => {
              const day = i + 1;
              if (day > dim) return <div key={i} />;
              return cell(`${year}-${mm}-${String(day).padStart(2, "0")}`);
            })}
          </div>
        );
      })}
    </div>
  );
}

import type { RealizedPnLEvent } from "@/types/trading";

export interface DailyPnl {
  date: string; // YYYY-MM-DD
  pnl: number;
  events: RealizedPnLEvent[];
}

export function dailyPnl(events: RealizedPnLEvent[]): DailyPnl[] {
  const map = new Map<string, DailyPnl>();
  for (const e of events) {
    if (e.strategy === "DATA_ISSUE") continue;
    const key = e.date.slice(0, 10);
    const bucket = map.get(key) ?? { date: key, pnl: 0, events: [] };
    bucket.pnl += e.realizedPnl;
    bucket.events.push(e);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatDisplayDate, MASKED_AMOUNT } from "@/lib/utils/format";

type Point = { date: string; actual: number; goalPace: number | null };
const POS = "rgb(var(--pos))";
const NEG = "rgb(var(--neg))";
const ACCENT = "rgb(var(--accent))";
const MUTED = "rgb(var(--text-muted))";
const HAIRLINE = "rgb(var(--hairline))";
const SURFACE = "rgb(var(--surface))";

function axisMoney(value: number): string {
  if (Math.abs(value) >= 1000) return `${value < 0 ? "−" : ""}$${Math.abs(value / 1000).toFixed(0)}k`;
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(0)}`;
}

export function CumulativePnlChart({ data, year, currentYear, goal, maskAmounts }: {
  data: Point[]; year: number; currentYear: boolean; goal: number | null; maskAmounts: boolean;
}) {
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const actual = data.at(-1)?.actual ?? 0;
  const chartData = useMemo(() => data.map((point) => ({ ...point, time: Date.parse(`${point.date}T00:00:00Z`) })), [data]);
  const ticks = useMemo(() => {
    const last = chartData.at(-1)?.time ?? Date.UTC(year, 0, 1);
    return Array.from({ length: 12 }, (_, month) => Date.UTC(year, month, 1)).filter((time) => time <= last);
  }, [chartData, year]);
  const axisColor = actual >= 0 ? POS : NEG;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-strong font-medium text-foreground">Cumulative realized P&amp;L <span className="font-normal text-muted-foreground">· {currentYear ? "YTD" : year}</span></h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-accent" />Realized P&amp;L</span>
          {goal !== null && <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-muted-foreground" />Goal pace</span>}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="mt-4 flex h-[260px] items-center justify-center rounded-lg bg-surface-inset/40 text-center text-body text-muted-foreground">No realized closes in {year} yet.</div>
      ) : !mounted ? (
        <div className="mt-4 h-[260px] animate-pulse rounded-lg bg-surface-inset" />
      ) : (
        <div className="mt-4 h-[260px] w-full sm:h-[310px]" role="img" aria-label={`Cumulative realized P&L ending at ${maskAmounts ? MASKED_AMOUNT : formatCurrency(actual)} on ${formatDisplayDate(data.at(-1)?.date)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={HAIRLINE} />
              <ReferenceLine y={0} stroke={MUTED} strokeWidth={1.5} />
              <XAxis type="number" dataKey="time" domain={[Date.UTC(year, 0, 1), Math.max(chartData.at(-1)?.time ?? 0, Date.UTC(year, 0, 2))]} ticks={ticks} tickFormatter={(time: number) => new Date(time).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: HAIRLINE }} minTickGap={20} />
              <YAxis domain={([min, max]: readonly [number, number]) => [Math.min(0, min), Math.max(0, max)]} tickFormatter={(value: number) => maskAmounts ? "" : axisMoney(value)} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={maskAmounts ? 8 : 54} />
              <Tooltip
                formatter={(value: unknown, name: string | number | undefined) => [maskAmounts ? MASKED_AMOUNT : formatCurrency(Number(value)), name === "goalPace" ? "Goal pace" : "Cumulative realized P&L"]}
                labelFormatter={(label) => formatDisplayDate(new Date(Number(label)).toISOString().slice(0, 10))}
                contentStyle={{ background: SURFACE, border: `1px solid ${HAIRLINE}`, borderRadius: 8, color: MUTED, fontSize: 12 }}
                cursor={{ stroke: HAIRLINE }}
              />
              {goal !== null && <Line type="linear" dataKey="goalPace" stroke={MUTED} strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} />}
              <Line type="stepAfter" dataKey="actual" stroke={ACCENT} strokeWidth={2.5} dot={chartData.length === 1 ? { r: 4, fill: ACCENT } : false} activeDot={{ r: 4, stroke: axisColor, fill: SURFACE }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

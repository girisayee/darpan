"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { CalculationResult } from "@/types/trading";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

// Tape palette — consumed via CSS variables so both themes work automatically.
// recharts props only accept string colors, so we use the rgb(var(…)) form.
const C_POS       = "rgb(var(--pos))";
const C_NEG       = "rgb(var(--neg))";
const C_BRAND     = "rgb(var(--brand))";
const C_HAIRLINE  = "rgb(var(--hairline))";
const C_MUTED     = "rgb(var(--text-muted))";
const C_DIM       = "rgb(var(--text-dim))";
const C_SURFACE   = "rgb(var(--surface))";

const TICK_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fill: C_MUTED
} as const;

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: C_SURFACE,
  border: `1px solid ${C_HAIRLINE}`,
  borderRadius: 8,
  boxShadow: "none",
  padding: "8px 12px"
};

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: C_DIM
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: C_MUTED,
  marginBottom: 4
};

function tooltipCurrency(value: unknown) {
  return formatCurrency(typeof value === "number" ? value : Number(value));
}

function tooltipPercent(value: unknown) {
  return formatPercent(typeof value === "number" ? value : Number(value));
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
      <div className="mt-4 h-72">{children}</div>
    </section>
  );
}

export function OverviewCharts({ result, annualGoal }: { result: CalculationResult; annualGoal: number }) {
  const monthlyTarget = annualGoal / 12;
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const monthly = useMemo(
    () =>
      result.monthlyReturns.reduce<{ cumulative: number; rows: Array<Record<string, number | string | null>> }>(
        (acc, row) => {
          const nextCumulative = acc.cumulative + row.realizedPnl;
          const monthNumber = acc.rows.length + 1;
          return {
            cumulative: nextCumulative,
            rows: [
              ...acc.rows,
              {
                month: `${row.year}-${String(row.month).padStart(2, "0")}`,
                pnl: Math.round(row.realizedPnl),
                cumulative: Math.round(nextCumulative),
                cumulativeTarget: Math.round(monthlyTarget * monthNumber),
                roi: row.realizedRoiPercent,
                averageCapital: Math.round(row.averageDeployedCapital),
                peakCapital: Math.round(row.peakDeployedCapital),
                target: Math.round(monthlyTarget)
              }
            ]
          };
        },
        { cumulative: 0, rows: [] }
      ).rows,
    [monthlyTarget, result.monthlyReturns]
  );
  const strategy = displayStrategyBreakdown(result).map((row) => ({ name: row.strategy.replaceAll("_", " "), pnl: Math.round(row.pnl) }));
  const symbols = result.aggregates.symbolBreakdown.slice(0, 8).map((row) => ({ name: row.symbol, pnl: Math.round(row.pnl) }));

  if (!mounted) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {["Monthly Realized P&L vs Target", "Monthly ROI %", "P&L vs Deployed Capital", "Strategy Breakdown", "Symbol Leaderboard"].map((title) => (
          <section key={title} className="rounded-lg border border-hairline bg-surface p-4">
            <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
            <div className="mt-4 h-72 animate-pulse rounded-md bg-surface-inset" />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Monthly Realized P&L vs Target">
        <ResponsiveContainer>
          <ComposedChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke={C_HAIRLINE} opacity={1} />
            <XAxis dataKey="month" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <Tooltip
              formatter={tooltipCurrency}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ fill: "rgba(var(--hairline) / 0.12)" }}
            />
            <Bar dataKey="pnl" fill={C_POS} radius={[4, 4, 0, 0]} />
            <Line dataKey="target" name="Monthly target" stroke={C_NEG} strokeWidth={2} strokeDasharray="6 5" dot={false} />
            <Line dataKey="cumulative" name="Cumulative realized P&L" stroke={C_BRAND} strokeWidth={2} dot={false} />
            <Line dataKey="cumulativeTarget" name={`${formatCurrency(annualGoal, { maximumFractionDigits: 0 })} cumulative target`} stroke={C_DIM} strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C_MUTED }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Monthly ROI %">
        <ResponsiveContainer>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke={C_HAIRLINE} opacity={1} />
            <XAxis dataKey="month" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <YAxis tickFormatter={(value) => `${value}%`} tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <Tooltip
              formatter={tooltipPercent}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
            />
            <Line dataKey="roi" stroke={C_POS} strokeWidth={2} dot={{ r: 3, fill: C_POS }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="P&L vs Deployed Capital">
        <ResponsiveContainer>
          <ComposedChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke={C_HAIRLINE} opacity={1} />
            <XAxis dataKey="month" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <YAxis yAxisId="left" tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <Tooltip
              formatter={tooltipCurrency}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
            />
            <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C_MUTED }} />
            <Bar yAxisId="left" dataKey="pnl" fill={C_POS} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" dataKey="averageCapital" name="Average deployed capital" stroke={C_BRAND} strokeWidth={2} dot={false} />
            <Line yAxisId="right" dataKey="peakCapital" name="Peak deployed capital" stroke={C_NEG} strokeWidth={2} strokeDasharray="6 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Strategy Breakdown">
        <ResponsiveContainer>
          <BarChart data={strategy} layout="vertical" margin={{ left: 70 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C_HAIRLINE} opacity={1} />
            <XAxis type="number" tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <YAxis type="category" dataKey="name" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <Tooltip
              formatter={tooltipCurrency}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
            />
            <Bar dataKey="pnl" fill={C_BRAND} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Symbol Leaderboard">
        <ResponsiveContainer>
          <BarChart data={symbols}>
            <CartesianGrid strokeDasharray="3 3" stroke={C_HAIRLINE} opacity={1} />
            <XAxis dataKey="name" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={{ stroke: C_HAIRLINE }} />
            <Tooltip
              formatter={tooltipCurrency}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
            />
            <Bar dataKey="pnl" fill={C_POS} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

/** Custom bar shape that colors positive values --pos and negative values --neg */
function RoiBar(props: { x?: number; y?: number; width?: number; height?: number; value?: number | [number, number] }) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!width || !height) return null;
  const numValue = Array.isArray(value) ? value[1] - value[0] : value;
  const fill = numValue >= 0 ? C_POS : C_NEG;
  return <rect x={x} y={y} width={width} height={Math.abs(height)} rx={2} fill={fill} />;
}

/** Capital & ROI tab: standalone monthly-ROI bar chart used only in CapitalTab */
export function MonthlyRoiChart({ result }: { result: CalculationResult }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const data = useMemo(
    () =>
      result.monthlyReturns.map((row) => ({
        month: `${row.year}-${String(row.month).padStart(2, "0")}`,
        roi: row.realizedRoiPercent
      })),
    [result.monthlyReturns]
  );

  if (!mounted) {
    return <div className="h-[150px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div style={{ height: 150 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke={C_HAIRLINE} opacity={1} />
          <XAxis dataKey="month" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={(value: unknown) => [formatPercent(typeof value === "number" ? value : Number(value)), "ROI"]}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ fill: `rgb(var(--hairline) / 0.2)` }}
          />
          <Bar
            dataKey="roi"
            radius={[2, 2, 0, 0]}
            /* positive bars → --pos, negative → --neg via Cell list */
            fill={C_POS}
            shape={RoiBar}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function displayStrategyBreakdown(result: CalculationResult) {
  const rows = new Map<string, { strategy: string; pnl: number; capital: number; roiPercent: number | null }>();
  for (const row of result.aggregates.strategyBreakdown) {
    const strategy = displayStrategy(row.strategy);
    if (!strategy) continue;
    const current = rows.get(strategy) ?? { strategy, pnl: 0, capital: 0, roiPercent: null };
    current.pnl += row.pnl;
    current.capital += row.capital;
    current.roiPercent = current.capital > 0 ? (current.pnl / current.capital) * 100 : null;
    rows.set(strategy, current);
  }
  return [...rows.values()].sort((a, b) => b.pnl - a.pnl);
}

function displayStrategy(strategy: string) {
  if (strategy === "COVERED_CALL_ASSIGNMENT") return "COVERED_CALL";
  if (strategy === "PUT_ASSIGNMENT") return "CASH_SECURED_PUT";
  if (strategy === "DATA_ISSUE" || strategy === "OTHER") return null;
  return strategy;
}

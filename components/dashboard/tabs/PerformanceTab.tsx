"use client";

/**
 * PerformanceTab — Phase 2.
 *
 * Sections:
 *   1. Top KPI strip (3 compact KpiCards: Net P&L · Return on capital · Profit factor)
 *   2. Equity curve — recharts line in an h-[200px] ResponsiveContainer
 *   3. Risk strip (Concentration + Assignment rate only)
 *   4. Monthly P&L + ROI ComposedChart (bars left $ axis, line right % axis, ReferenceLine at monthly goal)
 *   5. Monthly ledger table
 *   6. "Benchmark vs SPY/QQQ — coming soon" placeholder card
 *
 * DATA GAPS noted inline where a live data source is deferred:
 *   - Benchmark (SPY/QQQ) returns: deferred subsystem → placeholder card
 *   - Income calendar: deferred subsystem → not rendered
 *
 * Token classes only; fraction selectors ×100 before formatPercent;
 * already-% values (ytdRoi, averageMonthlyRoi) passed straight.
 * Nulls render "—".
 */

import { useMemo, useSyncExternalStore } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { BenchmarkComparison } from "@/components/dashboard/BenchmarkComparison";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";
import { MonthlyRoiTable, tone } from "./shared";

// ── recharts palette via CSS variables ───────────────────────────────────────
const C_POS      = "rgb(var(--pos))";
const C_NEG      = "rgb(var(--neg))";
const C_MUTED    = "rgb(var(--text-muted))";
const C_HAIRLINE = "rgb(var(--hairline))";
const C_SURFACE  = "rgb(var(--surface))";
const C_ACCENT   = "rgb(var(--accent))";

const TICK_STYLE = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fill: C_MUTED,
} as const;

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: C_SURFACE,
  border: `1px solid ${C_HAIRLINE}`,
  borderRadius: 8,
  boxShadow: "none",
  padding: "8px 12px",
};

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  color: C_MUTED,
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  color: C_MUTED,
  marginBottom: 4,
};

// ── Equity-curve chart ────────────────────────────────────────────────────────

const C_GOAL_PACE = "rgb(var(--text-muted))";

function EquityCurveChart({
  result,
  annualGoal,
}: {
  result: CalculationResult;
  annualGoal: number;
}) {
  // useSyncExternalStore avoids SSR/client hydration mismatch for recharts.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const data = useMemo(() => {
    return result.aggregates.monthlyRealizedPnl.map((m, i) => ({
      month: m.month,
      cumulative: m.cumulative,
      // Goal pace: annualGoal × (i+1) / 12 — prorated monthly target
      goalPace: annualGoal > 0 ? annualGoal * (i + 1) / 12 : undefined,
    }));
  }, [result.aggregates.monthlyRealizedPnl, annualGoal]);

  if (!mounted) {
    return <div className="h-[200px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
          <span className="inline-block h-0.5 w-5 rounded-full bg-pos" />
          Cumulative P&amp;L
        </span>
        {annualGoal > 0 && (
          <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
            <span className="inline-block h-0.5 w-5 rounded-full bg-muted-foreground opacity-50" style={{ borderTop: "2px dashed" }} />
            Goal pace
          </span>
        )}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="0"
              stroke={C_HAIRLINE}
              opacity={1}
            />
            <XAxis
              dataKey="month"
              tick={TICK_STYLE}
              axisLine={{ stroke: C_HAIRLINE }}
              tickLine={false}
            />
            <YAxis
              tick={TICK_STYLE}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 || v <= -1000
                  ? `$${(v / 1000).toFixed(0)}k`
                  : `$${v.toFixed(0)}`
              }
              width={52}
            />
            <Tooltip
              formatter={(value: unknown, name: string | number | undefined) => [
                formatCurrency(typeof value === "number" ? value : Number(value)),
                name === "goalPace" ? "Goal pace" : "Cumulative P&L",
              ]}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ stroke: C_HAIRLINE, strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={C_POS}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: C_POS, fill: C_SURFACE }}
            />
            {annualGoal > 0 && (
              <Line
                type="monotone"
                dataKey="goalPace"
                stroke={C_GOAL_PACE}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                opacity={0.6}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Monthly P&L + ROI ComposedChart ──────────────────────────────────────────
//
// Left Y-axis ($): realized P&L bars (green ≥0, red <0, per-bar Cell)
// Right Y-axis (%): monthly ROI line
// ReferenceLine on $ axis at annualGoal/12, labelled "Monthly goal"

function MonthlyComposedChart({
  result,
  annualGoal,
}: {
  result: CalculationResult;
  annualGoal: number;
}) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const data = useMemo(() => {
    return result.monthlyReturns.map((m) => ({
      label: `${m.year}-${String(m.month).padStart(2, "0")}`,
      realizedPnl: m.realizedPnl,
      // realizedRoiPercent is already a % value — pass straight
      roi: m.realizedRoiPercent,
    }));
  }, [result.monthlyReturns]);

  const monthlyGoal = annualGoal > 0 ? annualGoal / 12 : undefined;

  if (!mounted) {
    return <div className="h-[220px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="space-y-2">
      {/* Custom legend */}
      <div className="flex items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-sm bg-pos opacity-80" />
          P&amp;L
        </span>
        <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
          <span className="inline-block h-0.5 w-5 rounded-full" style={{ background: C_ACCENT }} />
          ROI
        </span>
        {monthlyGoal !== undefined && (
          <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
            <span className="inline-block h-0.5 w-5 rounded-full opacity-60" style={{ borderTop: `2px dashed ${C_GOAL_PACE}` }} />
            Monthly goal
          </span>
        )}
      </div>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="0"
              stroke={C_HAIRLINE}
              opacity={1}
            />
            <XAxis
              dataKey="label"
              tick={TICK_STYLE}
              axisLine={{ stroke: C_HAIRLINE }}
              tickLine={false}
            />
            {/* Left Y-axis: dollar P&L */}
            <YAxis
              yAxisId="pnl"
              orientation="left"
              tick={TICK_STYLE}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 || v <= -1000
                  ? `$${(v / 1000).toFixed(0)}k`
                  : `$${v.toFixed(0)}`
              }
              width={52}
            />
            {/* Right Y-axis: ROI % */}
            <YAxis
              yAxisId="roi"
              orientation="right"
              tick={TICK_STYLE}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              width={44}
            />
            <Tooltip
              formatter={(value: unknown, name: string | number | undefined) => {
                const n = typeof value === "number" ? value : Number(value);
                if (name === "roi") return [formatPercent(n, 1), "ROI"];
                return [formatCurrency(n), "Realized P&L"];
              }}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ fill: C_HAIRLINE, opacity: 0.3 }}
            />
            {/* Suppress recharts default legend — we use our own */}
            <Legend content={() => null} />
            {/* Monthly goal reference line on $ axis */}
            {monthlyGoal !== undefined && (
              <ReferenceLine
                yAxisId="pnl"
                y={monthlyGoal}
                stroke={C_GOAL_PACE}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                opacity={0.7}
                label={{
                  value: "Monthly goal",
                  position: "insideTopRight",
                  style: { ...TICK_STYLE, fontSize: 10 },
                }}
              />
            )}
            {/* P&L bars with per-bar color */}
            <Bar yAxisId="pnl" dataKey="realizedPnl" radius={[3, 3, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.realizedPnl >= 0 ? C_POS : C_NEG}
                />
              ))}
            </Bar>
            {/* ROI line */}
            <Line
              yAxisId="roi"
              type="monotone"
              dataKey="roi"
              stroke={C_ACCENT}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: C_ACCENT, fill: C_SURFACE }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── PerformanceTab ─────────────────────────────────────────────────────────────

export function PerformanceTab({
  result,
  annualGoal,
  onSelectEvent,
}: {
  result: CalculationResult;
  annualGoal: number;
  onSelectEvent: (event: RealizedPnLEvent) => void;
}) {
  void onSelectEvent; // DetailDrawer wiring — available for future drill-down

  const a = wheelAnalytics(result);

  // ── Top KPI strip ────────────────────────────────────────────────────────
  // Net P&L YTD, Return on capital, Profit factor

  // Return on capital = totalRealizedPnl / averageDeployedCapital × 100
  const roc =
    result.aggregates.averageDeployedCapital > 0
      ? (result.aggregates.totalRealizedPnl / result.aggregates.averageDeployedCapital) * 100
      : null;
  const rocDisplay = roc === null ? "—" : formatPercent(roc, 1);

  // Profit factor
  const pfDisplay =
    a.tradeQuality.profitFactor === null
      ? "—"
      : formatNumber(a.tradeQuality.profitFactor, 2);

  return (
    <div className="space-y-5 py-2">
      {/* ── 1. Top KPI strip ── */}
      <MetricGroup cols={3}>
        <KpiCard
          label="Net P&L · YTD"
          value={formatCurrency(result.aggregates.currentYearRealizedPnl)}
          helper="Calendar-year realized"
          tooltip="Current calendar-year realized P&L across all closed events."
          tone={tone(result.aggregates.currentYearRealizedPnl)}
          variant="compact"
        />
        <KpiCard
          label="Return on capital"
          value={rocDisplay}
          helper="realized P&L ÷ avg deployed"
          tooltip="Total realized P&L divided by average deployed capital."
          tone={tone(roc ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Profit factor"
          value={pfDisplay}
          helper="Gross profit / gross loss"
          tooltip="Total gross profit divided by total gross loss magnitude. Values above 1.0 are positive."
          tone={
            a.tradeQuality.profitFactor !== null && a.tradeQuality.profitFactor >= 1
              ? "positive"
              : a.tradeQuality.profitFactor !== null
                ? "negative"
                : "neutral"
          }
          variant="compact"
        />
      </MetricGroup>

      {/* ── 2. Benchmark comparison (moved up above equity curve) ── */}
      <BenchmarkComparison result={result} />

      {/* ── 3. Equity curve ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Equity curve
        </h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <EquityCurveChart result={result} annualGoal={annualGoal} />
        </div>
      </section>

      {/* ── 4. Monthly realized P&L + ROI ComposedChart ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Monthly realized P&amp;L &amp; ROI
        </h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <MonthlyComposedChart result={result} annualGoal={annualGoal} />
        </div>
        <MonthlyRoiTable rows={result.monthlyReturns} />
        <p className="font-sans text-[12px] text-muted-foreground">
          Monthly ROI = realized P&amp;L ÷ average capital deployed all month (how hard your whole book worked). Closed Trade ROI = realized P&amp;L ÷ capital in just the trades that closed (return on the positions you realized).
        </p>
      </section>
    </div>
  );
}

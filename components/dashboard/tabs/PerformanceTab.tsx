"use client";

/**
 * PerformanceTab — benchmark comparison + capital-deployed metrics + equity curve
 * + monthly breakdown.
 *
 * Excluded per spec: max drawdown, Sortino, Calmar, payoff ratio.
 */

import { useMemo, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BenchmarkComparison } from "@/components/dashboard/BenchmarkComparison";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { capitalEfficiency } from "@/lib/selectors/capital-efficiency";
import { goalPace } from "@/lib/selectors/goal-pace";
import { formatCurrency, formatPercent, monthLabel, monthTick } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";
import { MonthlyRoiTable, tone } from "./shared";

const C_POS      = "rgb(var(--pos))";
const C_NEG      = "rgb(var(--neg))";
const C_MUTED    = "rgb(var(--text-muted))";
const C_HAIRLINE = "rgb(var(--hairline))";
const C_SURFACE  = "rgb(var(--surface))";
const C_GOAL_PACE = "rgb(var(--text-muted))";

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

function EquityCurveChart({
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
    return result.monthlyReturns.map((m, i) => ({
      month: `${m.year}-${String(m.month).padStart(2, "0")}`,
      cumulative: result.monthlyReturns
        .slice(0, i + 1)
        .reduce((sum, x) => sum + x.realizedPnl, 0),
      goalPace: annualGoal > 0 ? (annualGoal * (i + 1)) / 12 : undefined,
    }));
  }, [result.monthlyReturns, annualGoal]);

  const finalCumulative = data.length > 0 ? data[data.length - 1].cumulative : 0;
  const C_EQUITY = finalCumulative >= 0 ? C_POS : "rgb(var(--neg))";

  if (!mounted) {
    return <div className="h-[200px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 font-sans text-caption text-muted-foreground">
          <span className="inline-block h-0.5 w-5 rounded-full" style={{ background: C_EQUITY }} />
          Cumulative P&amp;L
        </span>
        {annualGoal > 0 && (
          <span className="flex items-center gap-1.5 font-sans text-caption text-muted-foreground">
            <span
              className="inline-block h-0.5 w-5 rounded-full bg-muted-foreground opacity-50"
              style={{ borderTop: "2px dashed" }}
            />
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
              tickFormatter={monthTick}
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
              labelFormatter={(label) => monthLabel(String(label))}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ stroke: C_HAIRLINE, strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={C_EQUITY}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: C_EQUITY, fill: C_SURFACE }}
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

function MonthlyPnlBar({ result }: { result: CalculationResult }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const data = useMemo(
    () =>
      result.monthlyReturns.map((m) => ({
        month: `${m.year}-${String(m.month).padStart(2, "0")}`,
        pnl: m.realizedPnl,
      })),
    [result.monthlyReturns]
  );

  if (!mounted) {
    return <div className="h-[180px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke={C_HAIRLINE} opacity={1} />
          <XAxis
            dataKey="month"
            tick={TICK_STYLE}
            tickFormatter={monthTick}
            axisLine={{ stroke: C_HAIRLINE }}
            tickLine={false}
          />
          <YAxis
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1000 || v <= -1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
            }
            width={52}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatCurrency(typeof value === "number" ? value : Number(value)),
              "Monthly P&L",
            ]}
            labelFormatter={(label) => monthLabel(String(label))}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ fill: C_HAIRLINE, fillOpacity: 0.3 }}
          />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? C_POS : C_NEG} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceTab({
  result,
  settings,
}: {
  result: CalculationResult;
  settings: AppSettings;
}) {
  const annualGoal = settings.annualRealizedPnlGoal;
  const maxBP = settings.maxBuyingPower ?? 125000;

  const monthlyRealized = result.monthlyReturns.map((m) => m.realizedPnl);
  const monthIndex = result.monthlyReturns.length > 0 ? result.monthlyReturns.length - 1 : 0;
  const pace = goalPace({ annualGoal, monthlyRealized, monthIndex });

  const ce = capitalEfficiency(result.monthlyReturns);
  const roc = result.aggregates.returnOnCapital;
  const annualizedRoc = result.aggregates.annualizedReturnOnCapital;

  const avgDeployed = result.aggregates.averageDeployedCapital;
  const peakDeployed = result.aggregates.peakDeployedCapital;
  const bpUsed = maxBP > 0 ? (avgDeployed / maxBP) * 100 : null;

  // The annual-goal headline and the equity curve only make sense when the user
  // is tracking against a goal; hide both when the toggle is off or no goal is set.
  const showGoal = (settings.trackAgainstGoal ?? true) && annualGoal > 0;

  return (
    <div className="space-y-5 py-2">
      {/* ── Annual goal (headline) ── */}
      {showGoal && (
        <div className="rounded-[14px] border border-hairline bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-body font-medium text-muted-foreground">Annual goal</span>
            <span className="text-body text-muted-foreground">{formatPercent(pace.pct, 0)} of goal</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold tabular-nums leading-none text-foreground">
              {formatCurrency(pace.actual)}
            </span>
            <span className="text-strong tabular-nums text-muted-foreground">/ {formatCurrency(annualGoal)}</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-aurora transition-all"
              style={{ width: `${Math.max(0, Math.min(100, (pace.actual / annualGoal) * 100)).toFixed(1)}%` }}
            />
          </div>
          <p className="mt-2 text-body text-muted-foreground">
            Projected {formatCurrency(pace.projectedYearEnd)} · needs {formatCurrency(pace.requiredMonthly)}/mo to hit goal
          </p>
        </div>
      )}

      {/* ── Equity curve + market comparison ── */}
      {showGoal ? (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="rounded-[14px] border border-hairline bg-surface px-4 py-3 space-y-3">
            <h2 className="font-sans text-strong font-medium text-foreground">Equity curve</h2>
            <EquityCurveChart result={result} annualGoal={annualGoal} />
          </div>
          <BenchmarkComparison result={result} />
        </div>
      ) : (
        <BenchmarkComparison result={result} />
      )}

      {/* ── Capital deployed metrics ── */}
      <MetricGroup label="Capital deployed" cols={4}>
        <KpiCard
          label="Avg deployed"
          value={formatCurrency(avgDeployed)}
          helper="Time-weighted"
          tooltip="Time-weighted average capital deployed (dollar-days ÷ days in the period). The denominator behind Return on capital."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Peak deployed"
          value={formatCurrency(peakDeployed)}
          helper="Highest single day"
          tooltip="Highest capital deployed on any single day."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Return on capital"
          value={roc != null ? formatPercent(roc, 1) : "—"}
          helper={annualizedRoc != null ? `${formatPercent(annualizedRoc, 0)} annualized` : "Realized P&L ÷ avg deployed"}
          tooltip="Realized P&L ÷ time-weighted average deployed capital over the period. The same return-on-capital shown on Home; the helper annualizes it (× 365 ÷ days)."
          tone={tone(roc ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Capital utilization"
          value={bpUsed != null ? formatPercent(bpUsed, 0) : "—"}
          helper="Avg deployed ÷ configured max"
          tooltip="Average deployed capital as a share of your configured max buying power."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Capital turnover"
          value={ce.capitalTurnover != null ? ce.capitalTurnover.toFixed(2) + "×" : "—"}
          helper="Closed capital ÷ avg deployed"
          tooltip="How many times your average deployed capital cycled through closed trades."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Monthly breakdown ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-strong font-medium text-foreground">Monthly P&amp;L</h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <MonthlyPnlBar result={result} />
        </div>
        <MonthlyRoiTable rows={result.monthlyReturns} />
      </section>
    </div>
  );
}

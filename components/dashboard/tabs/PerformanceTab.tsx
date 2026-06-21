"use client";

/**
 * PerformanceTab — benchmark comparison + capital-deployed metrics + equity curve
 * + monthly breakdown.
 *
 * Excluded per spec: max drawdown, Sortino, Calmar, payoff ratio.
 */

import { useMemo, useSyncExternalStore } from "react";
import {
  CartesianGrid,
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
import { allocation } from "@/lib/selectors/allocation";
import { goalPace } from "@/lib/selectors/goal-pace";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";
import { MonthlyRoiTable, tone } from "./shared";

const C_POS      = "rgb(var(--pos))";
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
        <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
          <span className="inline-block h-0.5 w-5 rounded-full" style={{ background: C_EQUITY }} />
          Cumulative P&amp;L
        </span>
        {annualGoal > 0 && (
          <span className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
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
              tickFormatter={(v: string) => v.slice(5)}
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

  const ce = capitalEfficiency(result.realizedEvents, result.monthlyReturns);

  const alloc = allocation(
    result.aggregates.symbolBreakdown,
    result.aggregates.strategyBreakdown.map((b) => ({
      strategy: b.strategy,
      capital: b.capital,
    }))
  );

  const avgDeployed = result.aggregates.averageDeployedCapital;
  const peakDeployed = result.aggregates.peakDeployedCapital;
  const bpUsed = maxBP > 0 ? (avgDeployed / maxBP) * 100 : null;

  return (
    <div className="space-y-5 py-2">
      {/* ── Benchmark comparison ── */}
      <BenchmarkComparison result={result} />

      {/* ── Goal card ── */}
      {annualGoal > 0 && (
        <div className="rounded-[14px] border border-hairline bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-muted-foreground">Annual goal</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-semibold tabular-nums leading-none text-foreground">
                  {formatCurrency(pace.actual)}
                </span>
                <span className="text-[13px] tabular-nums text-dim">/ {formatCurrency(annualGoal)}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-aurora transition-all"
              style={{ width: `${Math.max(0, Math.min(100, (pace.actual / annualGoal) * 100)).toFixed(1)}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {formatPercent(pace.pct, 0)} of goal · Projected {formatCurrency(pace.projectedYearEnd)} · needs {formatCurrency(pace.requiredMonthly)}/mo
          </p>
        </div>
      )}

      {/* ── Equity curve ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">Equity curve</h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <EquityCurveChart result={result} annualGoal={annualGoal} />
        </div>
      </section>

      {/* ── Capital deployed metrics ── */}
      <MetricGroup label="Capital deployed" cols={4}>
        <KpiCard
          label="Avg deployed"
          value={formatCurrency(avgDeployed)}
          helper="Average across active months"
          tooltip="Average capital deployed across all months with activity."
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
          value={ce.annualizedRoc != null ? formatPercent(ce.annualizedRoc, 1) : "—"}
          helper="Capital-weighted annualized"
          tooltip="Capital-weighted mean of per-event annualized ROI."
          tone={tone(ce.annualizedRoc ?? 0)}
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
        <KpiCard
          label="Income / day"
          value={ce.incomePerDay != null ? formatCurrency(ce.incomePerDay) : "—"}
          helper="Option premium per capital-day"
          tooltip="Option premium P&L divided by total capital-days deployed."
          tone={tone(ce.incomePerDay ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Concentration"
          value={alloc.bySymbol.level}
          helper={`HHI ${alloc.bySymbol.hhi.toFixed(2)}`}
          tooltip="Herfindahl–Hirschman index across symbols. Low < 0.15, moderate 0.15–0.25, high > 0.25."
          tone={alloc.bySymbol.level === "high" ? "negative" : alloc.bySymbol.level === "moderate" ? "neutral" : "positive"}
          variant="compact"
        />
      </MetricGroup>

      {/* ── Monthly breakdown table ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">Monthly breakdown</h2>
        <MonthlyRoiTable rows={result.monthlyReturns} />
      </section>
    </div>
  );
}

"use client";

/**
 * PerformanceTab — Phase 2.
 *
 * Sections (per aurora_performance mockup):
 *   1. Top KPI strip (4 compact KpiCards)
 *   2. Equity curve — recharts line in an h-[200px] ResponsiveContainer
 *   3. Capital-efficiency ranking table (open optionLifecycles)
 *   4. Risk strip (compact KpiCards)
 *   5. Buying-power utilization bar (proxy: deployed vs peak)
 *   6. Monthly ROI chart + ledger
 *   7. "Benchmark vs SPY/QQQ — coming soon" placeholder card
 *
 * DATA GAPS noted inline where a live data source is deferred:
 *   - Benchmark (SPY/QQQ) returns: deferred subsystem → placeholder card
 *   - Income calendar: deferred subsystem → not rendered
 *   - Buying-power (account): proxy only (avg deployed / peak deployed)
 *   - Ann. ROC per open position: uses event annualizedRoiPercent on the
 *     underlying symbol; if no matching event it renders "—"
 *
 * Token classes only; fraction selectors ×100 before formatPercent;
 * already-% values (annualizedRoc, ytdRoi, averageMonthlyRoi) passed straight.
 * Nulls render "—".
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
import { MonthlyRoiChart } from "@/components/charts/DashboardCharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import { riskMetrics } from "@/lib/selectors/risk";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
import { MonthlyRoiTable, tone } from "./shared";

// ── recharts palette via CSS variables ───────────────────────────────────────
const C_POS      = "rgb(var(--pos))";
const C_MUTED    = "rgb(var(--text-muted))";
const C_HAIRLINE = "rgb(var(--hairline))";
const C_SURFACE  = "rgb(var(--surface))";

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

// ── Capital-efficiency ranking table ─────────────────────────────────────────
//
// Shows open optionLifecycles ranked by Ann. ROC (if computable from
// realizedEvents on the same underlying symbol; otherwise "—").
// DATA GAP: live option marks not available → % captured / ITM not shown.

function buildAnnRocBySymbol(events: RealizedPnLEvent[]): Map<string, number | null> {
  // Capital-weighted annualized ROC per underlying symbol.
  const acc = new Map<string, { weighted: number; weight: number }>();
  for (const e of events) {
    if (e.annualizedRoiPercent === null || e.capitalDeployed === null) continue;
    if (e.capitalDeployed <= 0) continue;
    const cur = acc.get(e.symbol) ?? { weighted: 0, weight: 0 };
    cur.weighted += e.annualizedRoiPercent * e.capitalDeployed;
    cur.weight += e.capitalDeployed;
    acc.set(e.symbol, cur);
  }
  const result = new Map<string, number | null>();
  for (const [sym, { weighted, weight }] of acc) {
    result.set(sym, weight > 0 ? weighted / weight : null);
  }
  return result;
}

function dteFromToday(expirationDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function capitalForLifecycle(lc: OptionLifecycle): number {
  if ((lc.capitalDeployed ?? 0) > 0) return lc.capitalDeployed!;
  return lc.strikePrice * lc.sharesControlled;
}

function CapitalEfficiencyTable({
  lifecycles,
  annRocBySymbol,
}: {
  lifecycles: OptionLifecycle[];
  annRocBySymbol: Map<string, number | null>;
}) {
  // Sort by Ann. ROC desc (nulls last), then by capital desc.
  const rows = [...lifecycles].sort((a, b) => {
    const ra = annRocBySymbol.get(a.underlyingSymbol) ?? null;
    const rb = annRocBySymbol.get(b.underlyingSymbol) ?? null;
    if (ra === null && rb === null) return capitalForLifecycle(b) - capitalForLifecycle(a);
    if (ra === null) return 1;
    if (rb === null) return -1;
    return rb - ra;
  });

  if (rows.length === 0) {
    return (
      <p className="py-4 text-center font-sans text-[12px] text-muted-foreground">
        No open positions.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse font-sans text-[12px]">
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] text-muted-foreground">
            <th className="pb-1.5 pr-3 font-medium">Symbol</th>
            <th className="pb-1.5 pr-3 font-medium">Strategy</th>
            <th className="pb-1.5 pr-3 text-right font-medium">Capital</th>
            <th className="pb-1.5 pr-3 text-right font-medium">DTE</th>
            <th className="pb-1.5 text-right font-medium">Ann. ROC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lc) => {
            const dte = dteFromToday(lc.expirationDate);
            const cap = capitalForLifecycle(lc);
            const annRoc = annRocBySymbol.get(lc.underlyingSymbol) ?? null;
            const stratLabel = lc.optionType === "call" ? "CC" : "CSP";
            const dteClass =
              dte <= 7
                ? "text-neg"
                : dte <= 14
                  ? "text-warn"
                  : "text-foreground";
            return (
              <tr
                key={lc.id}
                className="border-b border-hairline last:border-b-0 hover:bg-surface-inset/40"
              >
                <td className="py-1.5 pr-3 font-medium text-foreground">
                  {lc.underlyingSymbol}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">{stratLabel}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                  {formatCurrency(cap)}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular-nums ${dteClass}`}>
                  {dte}
                </td>
                <td className="py-1.5 text-right tabular-nums text-foreground">
                  {annRoc === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={tone(annRoc) === "positive" ? "text-pos" : tone(annRoc) === "negative" ? "text-neg" : undefined}>
                      {formatPercent(annRoc)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Buying-power utilization bar ──────────────────────────────────────────────
//
// DATA GAP: Real account buying-power is a deferred subsystem.
// Proxy: averageDeployedCapital / peakDeployedCapital.
// Healthy band: 40–80%.

function UtilizationBar({ result }: { result: CalculationResult }) {
  const { averageDeployedCapital, peakDeployedCapital } = result.aggregates;

  if (peakDeployedCapital <= 0) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-4">
        <p className="font-sans text-[12px] text-muted-foreground">
          Buying-power utilization — no deployed capital data
        </p>
      </div>
    );
  }

  const pct = Math.min(100, (averageDeployedCapital / peakDeployedCapital) * 100);
  const isHealthy = pct >= 40 && pct <= 80;
  const barColor = isHealthy
    ? "bg-pos"
    : pct > 80
      ? "bg-neg"
      : "bg-warn";

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-sans text-[12px] text-muted-foreground">
          Buying-power utilization
        </span>
        <span className="font-sans text-[12px] font-medium tabular-nums text-foreground">
          {formatPercent(pct, 0)}
        </span>
      </div>
      {/* Track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="font-sans text-[11px] text-muted-foreground">
        Avg deployed {formatCurrency(averageDeployedCapital)} vs peak {formatCurrency(peakDeployedCapital)} ·{" "}
        healthy band 40–80% · proxy until account buying-power data available
      </p>
    </div>
  );
}

// ── Benchmark placeholder ─────────────────────────────────────────────────────
//
// DATA GAP: SPY / QQQ benchmark returns are a deferred subsystem.

function BenchmarkPlaceholder() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-hairline bg-surface px-6 py-8 text-center"
      aria-label="Benchmark coming soon"
    >
      <span className="font-sans text-[13px] font-medium text-muted-foreground">
        Benchmark vs SPY / QQQ
      </span>
      <span className="inline-flex items-center rounded-full bg-surface-inset px-3 py-1 font-sans text-[11px] font-medium text-muted-foreground">
        coming soon
      </span>
      <p className="max-w-[280px] font-sans text-[12px] text-dim">
        Benchmark comparison requires a market-data feed that is not yet connected. It will appear here once available.
      </p>
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
  const risk = riskMetrics(result);

  // Open option lifecycles for the capital-efficiency table
  const openLifecycles = useMemo(
    () => result.optionLifecycles.filter((lc) => lc.status === "open"),
    [result.optionLifecycles]
  );

  // Ann. ROC per symbol from realized events (for capital-efficiency table)
  const annRocBySymbol = useMemo(
    () => buildAnnRocBySymbol(result.realizedEvents),
    [result.realizedEvents]
  );

  // ── Top KPI strip ────────────────────────────────────────────────────────
  // Net P&L YTD, Annualized ROC (already %), Profit factor, Max drawdown
  // maxDrawdownPct is fraction → ×100 before formatPercent; negate for display
  const maxDdDisplay =
    risk.maxDrawdownPct === null
      ? "—"
      : formatPercent(-(risk.maxDrawdownPct * 100), 1);

  // Annualized ROC — already %, pass straight
  const annRocDisplay =
    a.capitalEfficiency.annualizedRoc === null
      ? "—"
      : formatPercent(a.capitalEfficiency.annualizedRoc);

  // Profit factor
  const pfDisplay =
    a.tradeQuality.profitFactor === null
      ? "—"
      : formatNumber(a.tradeQuality.profitFactor, 2);

  // Risk strip: Sortino, Calmar, Concentration level, Assignment rate
  // sortino / calmar — raw numbers, format to 2dp
  const sortinoDisplay =
    risk.sortino === null ? "—" : formatNumber(risk.sortino, 2);
  const calmarDisplay =
    risk.calmar === null ? "—" : formatNumber(risk.calmar, 2);

  // assignmentRate is fraction → ×100 before formatPercent
  const assignmentRateDisplay =
    a.premium.assignmentRate === null
      ? "—"
      : formatPercent(a.premium.assignmentRate * 100, 0);

  const concentrationLevel = a.allocation.bySymbol.level; // "low" | "moderate" | "high"
  const concentrationTone: "positive" | "negative" | "neutral" =
    concentrationLevel === "low"
      ? "positive"
      : concentrationLevel === "high"
        ? "negative"
        : "neutral";

  return (
    <div className="space-y-5 py-2">
      {/* ── 1. Top KPI strip ── */}
      <MetricGroup cols={4}>
        <KpiCard
          label="Net P&L · YTD"
          value={formatCurrency(result.aggregates.currentYearRealizedPnl)}
          helper="Calendar-year realized"
          tooltip="Current calendar-year realized P&L across all closed events."
          tone={tone(result.aggregates.currentYearRealizedPnl)}
          variant="compact"
        />
        <KpiCard
          label="Annualized ROC"
          value={annRocDisplay}
          helper="Capital-weighted"
          tooltip="Capital-weighted mean of per-event annualized ROI%. Passed straight — already expressed as a percentage."
          tone={tone(a.capitalEfficiency.annualizedRoc ?? 0)}
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
        <KpiCard
          label="Max drawdown"
          value={maxDdDisplay}
          helper="Peak-to-trough equity decline"
          tooltip="Largest peak-to-trough decline in cumulative realized equity. Expressed as a negative percentage."
          tone={risk.maxDrawdownPct ? "negative" : "neutral"}
          variant="compact"
        />
      </MetricGroup>

      {/* ── 2. Equity curve ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Equity curve
        </h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <EquityCurveChart result={result} annualGoal={annualGoal} />
        </div>
      </section>

      {/* ── 3. Capital-efficiency ranking ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Open positions · Capital efficiency ranking
        </h2>
        {/* DATA GAP: % captured / ITM requires live option marks — not rendered */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <CapitalEfficiencyTable
            lifecycles={openLifecycles}
            annRocBySymbol={annRocBySymbol}
          />
        </div>
      </section>

      {/* ── 4. Risk strip ── */}
      <MetricGroup label="Risk" cols={4}>
        <KpiCard
          label="Sortino"
          value={sortinoDisplay}
          helper="Return / downside σ"
          tooltip="Sortino ratio: mean monthly return divided by downside standard deviation. Higher is better."
          tone={
            risk.sortino !== null && risk.sortino > 0
              ? "positive"
              : risk.sortino !== null && risk.sortino < 0
                ? "negative"
                : "neutral"
          }
          variant="compact"
        />
        <KpiCard
          label="Calmar"
          value={calmarDisplay}
          helper="Ann. return / max drawdown"
          tooltip="Calmar ratio: annualized return divided by max drawdown magnitude. Higher is better."
          tone={
            risk.calmar !== null && risk.calmar > 0
              ? "positive"
              : risk.calmar !== null && risk.calmar < 0
                ? "negative"
                : "neutral"
          }
          variant="compact"
        />
        <KpiCard
          label="Concentration"
          value={concentrationLevel.charAt(0).toUpperCase() + concentrationLevel.slice(1)}
          helper={`HHI ${formatNumber(a.allocation.bySymbol.hhi, 3)}`}
          tooltip="Symbol concentration level based on Herfindahl–Hirschman Index. Low < 0.15, moderate 0.15–0.25, high > 0.25."
          tone={concentrationTone}
          variant="compact"
        />
        <KpiCard
          label="Assignment rate"
          value={assignmentRateDisplay}
          helper="Assigned / terminal cycles"
          tooltip="Fraction of terminal option cycles (expired + closed + assigned) that ended in assignment. Fraction ×100 before display."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── 5. Buying-power utilization bar ── */}
      <UtilizationBar result={result} />

      {/* ── 6. Monthly ROI chart + ledger ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Monthly ROI
        </h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <MonthlyRoiChart result={result} />
        </div>
        <MonthlyRoiTable rows={result.monthlyReturns} />
      </section>

      {/* ── 7. Benchmark placeholder ── */}
      {/* DATA GAP: SPY/QQQ benchmark returns require a market-data feed (deferred) */}
      <BenchmarkPlaceholder />
    </div>
  );
}

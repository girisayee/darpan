"use client";

/**
 * PerformanceTab — index comparison + visuals only.
 *
 * Sections:
 *   1. Benchmark vs SPY/QQQ (capital-matched index comparison)
 *   2. Equity curve — recharts line in an h-[200px] ResponsiveContainer
 *   3. Monthly P&L + ROI ComposedChart (bars left $ axis, line right % axis,
 *      ReferenceLine at monthly goal) + Monthly ledger table
 *
 * Numeric KPI cards (Net P&L · YTD, Return on capital, Profit factor) live on
 * the Overview tab — this tab is deliberately charts + benchmark only.
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
import { BenchmarkComparison } from "@/components/dashboard/BenchmarkComparison";
import { Column, DataTable } from "@/components/tables/DataTable";
import { formatCurrency, formatDisplayDate, formatPercent } from "@/lib/utils/format";
import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";
import { MonthlyRoiTable, signedMoney, signedPercent } from "./shared";

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
    // Build from monthlyReturns (already trimmed to the selected year by filterResult) so
    // the curve shows ONLY the selected year — not prior-year months that bleed in via
    // cross-year opening legs. Cumulative is a running within-scope sum (n ≤ 12).
    return result.monthlyReturns.map((m, i) => ({
      month: `${m.year}-${String(m.month).padStart(2, "0")}`,
      cumulative: result.monthlyReturns.slice(0, i + 1).reduce((sum, x) => sum + x.realizedPnl, 0),
      // Goal pace: annualGoal × (i+1) / 12 — prorated monthly target
      goalPace: annualGoal > 0 ? (annualGoal * (i + 1)) / 12 : undefined,
    }));
  }, [result.monthlyReturns, annualGoal]);

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
              tickFormatter={(v: string) => formatDisplayDate(v)}
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
              labelFormatter={(label: unknown) => formatDisplayDate(String(label))}
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
              tickFormatter={(v: string) => formatDisplayDate(v)}
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
              labelFormatter={(label: unknown) => formatDisplayDate(String(label))}
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

// ── Returns by symbol ──────────────────────────────────────────────────────────

type SymbolRow = CalculationResult["aggregates"]["symbolBreakdown"][number];

/**
 * Ranked leaderboard — Top winners / Top losers by realized P&L. A ranked list
 * (not bars) so a single large outlier can't compress the rest of the field.
 */
function LeaderColumn({ title, rows }: { title: string; rows: SymbolRow[] }) {
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-3">
      <div className="mb-1 font-sans text-[12px] font-medium text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="py-2 font-sans text-[12px] text-dim">None</div>
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {rows.map((r, i) => (
            <li key={r.symbol} className="flex items-center gap-2 py-1.5">
              <span className="w-4 shrink-0 text-right font-sans text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-foreground">{r.symbol}</span>
              <span className="shrink-0 font-sans text-[11px] tabular-nums">
                {r.roiPercent == null ? <span className="text-dim">—</span> : signedPercent(r.roiPercent)}
              </span>
              <span className="w-[88px] shrink-0 text-right font-sans text-[12.5px] tabular-nums">{signedMoney(r.pnl)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SymbolLeaderboard({ rows }: { rows: SymbolRow[] }) {
  const sorted = [...rows].sort((a, b) => b.pnl - a.pnl);
  const winners = sorted.filter((r) => r.pnl > 0).slice(0, 5);
  const losers = sorted.filter((r) => r.pnl < 0).reverse().slice(0, 5); // most negative first
  if (winners.length === 0 && losers.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LeaderColumn title="Top winners" rows={winners} />
      <LeaderColumn title="Top losers" rows={losers} />
    </div>
  );
}

function SymbolReturnsTable({ rows }: { rows: SymbolRow[] }) {
  const columns: Column<SymbolRow>[] = [
    {
      key: "symbol",
      header: "Symbol",
      value: (r) => r.symbol,
      render: (r) => <span className="font-medium text-foreground">{r.symbol}</span>,
    },
    {
      key: "pnl",
      header: "Realized P&L",
      value: (r) => r.pnl,
      render: (r) => signedMoney(r.pnl),
      align: "right",
    },
    {
      key: "roi",
      header: "ROI",
      // roiPercent is already a % value — pass straight; null sorts last / renders "—"
      value: (r) => r.roiPercent ?? -Infinity,
      render: (r) => (r.roiPercent == null ? <span className="opacity-50">—</span> : signedPercent(r.roiPercent)),
      align: "right",
    },
    {
      key: "trades",
      header: "Trades",
      value: (r) => r.trades,
      render: (r) => <span className="tabular-nums text-foreground">{r.trades}</span>,
      align: "right",
    },
    {
      key: "winRate",
      header: "Win rate",
      value: (r) => r.winRate ?? -Infinity,
      render: (r) => (r.winRate == null ? <span className="opacity-50">—</span> : formatPercent(r.winRate, 0)),
      align: "right",
    },
    {
      key: "capital",
      header: "Capital",
      value: (r) => r.capital,
      render: (r) => <span className="tabular-nums text-foreground">{formatCurrency(r.capital)}</span>,
      align: "right",
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      empty="No symbol returns yet."
      defaultSort={{ key: "pnl", direction: "desc" }}
      searchable
      searchPlaceholder="Filter symbols…"
      pageSize={15}
    />
  );
}

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

  // This tab is intentionally index-comparison + visuals only. The numeric KPI
  // strip (Net P&L · YTD, Return on capital, Profit factor) now lives on the
  // Overview tab to avoid duplicating headline metrics across tabs.

  return (
    <div className="space-y-5 py-2">
      {/* ── 1. Benchmark vs SPY/QQQ ── */}
      <BenchmarkComparison result={result} />

      {/* ── 2. Equity curve ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Equity curve
        </h2>
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <EquityCurveChart result={result} annualGoal={annualGoal} />
        </div>
      </section>

      {/* ── 3. Monthly realized P&L + ROI ComposedChart ── */}
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

      {/* ── 4. Returns by symbol ── */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Returns by symbol
        </h2>
        <SymbolLeaderboard rows={result.aggregates.symbolBreakdown} />
        <SymbolReturnsTable rows={result.aggregates.symbolBreakdown} />
      </section>
    </div>
  );
}

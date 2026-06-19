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

const teal = "#0e7490";
const green = "#15803d";
const red = "#be123c";
const gold = "#d97706";
const blue = "#2563eb";

function tooltipCurrency(value: unknown) {
  return formatCurrency(typeof value === "number" ? value : Number(value));
}

function tooltipPercent(value: unknown) {
  return formatPercent(typeof value === "number" ? value : Number(value));
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-panel">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
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
          <section key={title} className="rounded-lg border bg-card p-4 shadow-panel">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <div className="mt-4 h-72 animate-pulse rounded-md bg-muted" />
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
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
            <Tooltip formatter={tooltipCurrency} />
            <Bar dataKey="pnl" fill={teal} radius={[4, 4, 0, 0]} />
            <Line dataKey="target" name="Monthly target" stroke={red} strokeWidth={2} strokeDasharray="6 5" dot={false} />
            <Line dataKey="cumulative" name="Cumulative realized P&L" stroke={gold} strokeWidth={2} dot={false} />
            <Line dataKey="cumulativeTarget" name={`${formatCurrency(annualGoal, { maximumFractionDigits: 0 })} cumulative target`} stroke={blue} strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Legend />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Monthly ROI %">
        <ResponsiveContainer>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={tooltipPercent} />
            <Line dataKey="roi" stroke={green} strokeWidth={3} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="P&L vs Deployed Capital">
        <ResponsiveContainer>
          <ComposedChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tickFormatter={(value) => `$${Number(value) / 1000}k`} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `$${Number(value) / 1000}k`} />
            <Tooltip formatter={tooltipCurrency} />
            <Legend />
            <Bar yAxisId="left" dataKey="pnl" fill={teal} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" dataKey="averageCapital" name="Average deployed capital" stroke={gold} strokeWidth={2} dot={false} />
            <Line yAxisId="right" dataKey="peakCapital" name="Peak deployed capital" stroke={red} strokeWidth={2} strokeDasharray="6 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Strategy Breakdown">
        <ResponsiveContainer>
          <BarChart data={strategy} layout="vertical" margin={{ left: 70 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis type="number" tickFormatter={(value) => `$${Number(value) / 1000}k`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} />
            <Tooltip formatter={tooltipCurrency} />
            <Bar dataKey="pnl" fill={blue} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Symbol Leaderboard">
        <ResponsiveContainer>
          <BarChart data={symbols}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
            <Tooltip formatter={tooltipCurrency} />
            <Bar dataKey="pnl" fill={green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
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

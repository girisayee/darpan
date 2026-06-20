"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { goalPace } from "@/lib/selectors/goal-pace";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import { riskMetrics } from "@/lib/selectors/risk";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";
import { addDaysIso, optionCycleCapital, tone } from "./shared";

type TradeIssueFilter = "unresolved" | "duplicates" | null;

export function OverviewTab({
  result,
  settings,
  onReviewTrades,
}: {
  result: CalculationResult;
  settings: AppSettings;
  onReviewTrades: (issueFilter: TradeIssueFilter, search?: string) => void;
}) {
  // ── Goal-pace ──────────────────────────────────────────────────────────────
  const annualGoal = settings.annualRealizedPnlGoal;
  const monthlyRealized = result.monthlyReturns.map((m) => m.realizedPnl);
  const monthIndex =
    result.monthlyReturns.length > 0 ? result.monthlyReturns.length - 1 : 0;
  const pace = goalPace({ annualGoal, monthlyRealized, monthIndex });

  const latest = result.monthlyReturns.at(-1);
  const currentYear = latest?.year ?? new Date().getFullYear();

  const isAhead = pace.aheadBy >= 0;
  const progressPct =
    annualGoal > 0
      ? Math.max(0, Math.min(100, (pace.actual / annualGoal) * 100))
      : 0;

  // ── Wheel analytics ────────────────────────────────────────────────────────
  const a = wheelAnalytics(result);
  const risk = riskMetrics(result);

  // ── Dividends: sum of DIVIDEND transactions ────────────────────────────────
  const dividends = result.transactions
    .filter((t) => t.action === "DIVIDEND")
    .reduce((sum, t) => sum + t.netAmount, 0);

  // ── Utilization proxy: avg deployed / peak deployed ────────────────────────
  // Real buying-power data is a deferred subsystem; proxy uses deployed-vs-peak.
  const utilization =
    result.aggregates.peakDeployedCapital > 0
      ? formatPercent(
          (result.aggregates.averageDeployedCapital /
            result.aggregates.peakDeployedCapital) *
            100,
          0
        )
      : "—";

  // ── Insights visibility ────────────────────────────────────────────────────
  const hasInsights =
    result.aggregates.symbolBreakdown.some(
      (row) => row.pnl < 0 && row.trades > 1
    ) ||
    result.optionLifecycles.some(
      (c) =>
        c.status === "open" &&
        c.expirationDate <= addDaysIso(new Date(), 14)
    ) ||
    result.unresolvedTransactions.length > 0 ||
    result.duplicateTransactionIds.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Goal-hero card ── */}
      <div className="rounded-[14px] border border-hairline bg-surface p-4">
        {/* Top row: label + big value + ahead/behind pill */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">
              Annual goal · {currentYear}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[30px] font-semibold tabular-nums leading-none text-foreground">
                {formatCurrency(pace.actual)}
              </span>
              <span className="text-[13px] tabular-nums text-dim">
                / {formatCurrency(annualGoal)}
              </span>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-[8px] px-2.5 py-[5px] text-[11px] font-semibold",
              isAhead ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"
            )}
          >
            {isAhead ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {formatCurrency(Math.abs(pace.aheadBy))}{" "}
            {isAhead ? "ahead" : "behind"}
          </span>
        </div>

        {/* Gradient progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-aurora transition-all"
            style={{ width: `${progressPct}%` }}
            aria-label={`${progressPct.toFixed(0)}% of annual goal`}
          />
        </div>

        {/* Run-rate footer */}
        <p className="mt-2 text-[12px] text-muted-foreground">
          {formatPercent(pace.pct, 0)} of goal · Projected year-end{" "}
          {formatCurrency(pace.projectedYearEnd)} · needs{" "}
          {formatCurrency(pace.requiredMonthly)}/mo
        </p>
      </div>

      {/* ── Hero KPI row ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        {/* 1. Net P&L · YTD */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <KpiCard
            label="Net P&L · YTD"
            value={formatCurrency(result.aggregates.currentYearRealizedPnl)}
            helper="Calendar-year realized"
            tooltip="Current calendar-year realized P&L across all closed events."
            tone={tone(result.aggregates.currentYearRealizedPnl)}
            variant="hero"
          />
        </div>

        {/* 2. Annualized ROC — already %, pass straight */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <KpiCard
            label="Annualized ROC"
            value={
              a.capitalEfficiency.annualizedRoc === null
                ? "—"
                : formatPercent(a.capitalEfficiency.annualizedRoc)
            }
            helper="Capital-weighted"
            tooltip="Capital-weighted mean of per-event annualized ROI."
            tone={tone(a.capitalEfficiency.annualizedRoc ?? 0)}
            variant="hero"
          />
        </div>

        {/* 3. Premium — captureRate is a fraction → ×100 before formatPercent */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <KpiCard
            label="Premium"
            value={formatCurrency(a.premium.premiumCollected)}
            helper={
              a.premium.captureRate === null
                ? "—"
                : `${formatPercent(a.premium.captureRate * 100, 0)} capture`
            }
            tooltip="Total premium received from opening option sales."
            tone="neutral"
            variant="hero"
          />
        </div>

        {/* 4. Win · PF — winRate is a fraction → ×100 before formatPercent */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <KpiCard
            label="Win · PF"
            value={
              a.tradeQuality.winRate === null
                ? "—"
                : formatPercent(a.tradeQuality.winRate * 100, 0)
            }
            helper={`PF ${a.tradeQuality.profitFactor === null ? "—" : formatNumber(a.tradeQuality.profitFactor, 1)} · exp ${a.tradeQuality.expectancy === null ? "—" : formatCurrency(a.tradeQuality.expectancy)}`}
            tooltip="Win rate: fraction of realized events that closed profitable."
            tone="neutral"
            variant="hero"
          />
        </div>
      </div>

      {/* ── Income group ── */}
      <MetricGroup label="Income" cols={4}>
        <KpiCard
          label="Options premium"
          value={formatCurrency(result.aggregates.totalOptionsPremium)}
          helper="Closed option premium P&L"
          tooltip="Net realized option premium from all closed cycles."
          tone={tone(result.aggregates.totalOptionsPremium)}
          variant="compact"
        />
        <KpiCard
          label="Stock P&L"
          value={formatCurrency(result.aggregates.totalStockTradingPnl)}
          helper="Realized stock sales"
          tooltip="Realized P&L from stock sales (swings and assignments)."
          tone={tone(result.aggregates.totalStockTradingPnl)}
          variant="compact"
        />
        {/* Dividends computed from transactions where action === "DIVIDEND" */}
        <KpiCard
          label="Dividends"
          value={formatCurrency(dividends)}
          helper="Sum of dividend payments"
          tooltip="Total net amount from DIVIDEND transactions in the current view."
          tone={tone(dividends)}
          variant="compact"
        />
        <KpiCard
          label="Income / day"
          value={
            a.capitalEfficiency.incomePerDay === null
              ? "—"
              : formatCurrency(a.capitalEfficiency.incomePerDay)
          }
          helper="Option premium per capital-day"
          tooltip="Total option premium P&L divided by total capital-days."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Returns & risk group ── */}
      <MetricGroup label="Returns & risk" cols={4}>
        {/* ytdRoi is already a % value — pass straight */}
        <KpiCard
          label="YTD ROI"
          value={
            result.aggregates.ytdRoi === null
              ? "—"
              : formatPercent(result.aggregates.ytdRoi)
          }
          helper="YTD P&L / avg deployed capital"
          tooltip="YTD realized P&L divided by average deployed capital."
          tone={tone(result.aggregates.ytdRoi ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Expectancy"
          value={
            a.tradeQuality.expectancy === null
              ? "—"
              : formatCurrency(a.tradeQuality.expectancy)
          }
          helper="Mean P&L per trade"
          tooltip="Average realized P&L per closed event."
          tone={tone(a.tradeQuality.expectancy ?? 0)}
          variant="compact"
        />
        {/* Max drawdown — maxDrawdownPct is a fraction → ×100 before formatPercent, negate for display */}
        <KpiCard
          label="Max drawdown"
          value={
            risk.maxDrawdownPct === null
              ? "—"
              : formatPercent(-(risk.maxDrawdownPct * 100), 1)
          }
          helper="Peak-to-trough equity decline"
          tooltip="Largest peak-to-trough decline in cumulative realized equity."
          tone={risk.maxDrawdownPct ? "negative" : "neutral"}
          variant="compact"
        />
        {/* Utilization proxy: avg deployed / peak deployed (buying-power data deferred) */}
        <KpiCard
          label="Utilization"
          value={utilization}
          helper="Avg / peak deployed (proxy)"
          tooltip="Average deployed capital vs peak deployed; proxy until account buying-power data is available."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Needs-attention insight cards ── */}
      {hasInsights && (
        <>
          <div className="h-px bg-hairline" />
          <InsightCards result={result} onReviewTrades={onReviewTrades} />
        </>
      )}
    </div>
  );
}

// ── InsightCards ──────────────────────────────────────────────────────────────

function InsightCards({
  result,
  onReviewTrades,
}: {
  result: CalculationResult;
  onReviewTrades: (issueFilter: TradeIssueFilter, search?: string) => void;
}) {
  const repeatedLosses = result.aggregates.symbolBreakdown
    .filter((row) => row.pnl < 0 && row.trades > 1)
    .map((row) => row.symbol);

  const openCycles = result.optionLifecycles.filter(
    (cycle) => cycle.status === "open"
  );
  const nearTermCutoff = addDaysIso(new Date(), 14);
  const nearTermCycles = openCycles.filter(
    (cycle) => cycle.expirationDate <= nearTermCutoff
  );
  const nearTermContracts = nearTermCycles.reduce(
    (sum, cycle) => sum + cycle.contracts,
    0
  );
  const unresolvedCount = result.unresolvedTransactions.length;
  const duplicateCount = result.duplicateTransactionIds.length;

  type InsightItem = {
    text: string;
    severity: "neg" | "warn";
    action?: { label: string; onClick: () => void };
  };

  const items: InsightItem[] = [];

  if (nearTermCycles.length) {
    items.push({
      text: `${formatNumber(nearTermContracts)} ${nearTermContracts === 1 ? "contract" : "contracts"} expiring within 14 days · ${formatCurrency(nearTermCycles.reduce((sum, cycle) => sum + optionCycleCapital(cycle, true), 0))} exposure`,
      severity: "neg",
    });
  }
  if (unresolvedCount > 0) {
    items.push({
      text: `${formatNumber(unresolvedCount)} unresolved ${unresolvedCount === 1 ? "row" : "rows"} need classification.`,
      severity: "warn",
      action: {
        label: "Resolve →",
        onClick: () => onReviewTrades("unresolved"),
      },
    });
  }
  if (duplicateCount > 0) {
    items.push({
      text: `${formatNumber(duplicateCount)} potential duplicate ${duplicateCount === 1 ? "row" : "rows"} preserved.`,
      severity: "warn",
      action: {
        label: "Review →",
        onClick: () => onReviewTrades("duplicates"),
      },
    });
  }
  if (repeatedLosses.length) {
    items.push({
      text: `${repeatedLosses.slice(0, 4).join(", ")}${repeatedLosses.length > 4 ? ` +${repeatedLosses.length - 4}` : ""} have repeated losses`,
      severity: "neg",
      action: {
        label: "Review →",
        onClick: () => onReviewTrades(null, repeatedLosses[0]),
      },
    });
  }

  if (items.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Needs attention">
      {items.map((item, i) => (
        <li
          key={i}
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 rounded-[10px] border border-hairline p-2.5",
            "border-l-[3px] bg-surface text-[12.5px] text-muted-foreground",
            item.severity === "neg" ? "border-l-neg" : "border-l-warn"
          )}
        >
          <span>{item.text}</span>
          {item.action && (
            <button
              type="button"
              onClick={item.action.onClick}
              className="text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
            >
              {item.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

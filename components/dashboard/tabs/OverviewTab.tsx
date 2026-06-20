"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { BuyingPowerGauge } from "@/components/dashboard/BuyingPowerGauge";
import { goalPace } from "@/lib/selectors/goal-pace";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult, Strategy } from "@/types/trading";
import { addDaysIso, currentDeployedCapital, optionCycleCapital, tone } from "./shared";

type TradeIssueFilter = "unresolved" | "duplicates" | null;

// Strategies for each "By strategy" bucket
const CSP_STRATEGIES: Strategy[] = ["CASH_SECURED_PUT", "PUT_ASSIGNMENT"];
const CC_STRATEGIES: Strategy[] = ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT"];
const SWING_STRATEGIES: Strategy[] = ["SWING_TRADE"];

export function OverviewTab({
  result,
  settings,
  onReviewTrades,
}: {
  result: CalculationResult;
  settings: AppSettings;
  onReviewTrades: (issueFilter: TradeIssueFilter) => void;
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

  // ── By strategy: CSP, CC, Swing ───────────────────────────────────────────
  function stratGroup(strategies: Strategy[]) {
    const events = result.realizedEvents.filter((e) =>
      strategies.includes(e.strategy)
    );
    const pnl = events.reduce((s, e) => s + e.realizedPnl, 0);
    const capital = events.reduce(
      (s, e) => s + (e.capitalDeployed ?? 0),
      0
    );
    const trades = events.length;
    const roi = capital > 0 ? (pnl / capital) * 100 : null;
    return { pnl, capital, trades, roi };
  }

  const csp = stratGroup(CSP_STRATEGIES);
  const cc = stratGroup(CC_STRATEGIES);
  const swing = stratGroup(SWING_STRATEGIES);

  // ── Buying-power utilization (current open capital / maxBP) ───────────────
  const maxBP = settings.maxBuyingPower ?? 125000;
  const currentDeployed = currentDeployedCapital(result);

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

  // Return on capital
  const roc =
    result.aggregates.averageDeployedCapital > 0
      ? (result.aggregates.totalRealizedPnl / result.aggregates.averageDeployedCapital) * 100
      : null;

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

      {/* ── Hero KPI row — exactly three tiles ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        {/* 1. Return on capital */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <KpiCard
            label="Return on capital"
            value={roc === null ? "—" : formatPercent(roc, 1)}
            helper="realized P&L ÷ avg deployed"
            tooltip="Total realized P&L divided by average deployed capital."
            tone={tone(roc ?? 0)}
            variant="hero"
          />
        </div>

        {/* 2. Avg deployed capital */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <KpiCard
            label="Avg deployed capital"
            value={formatCurrency(result.aggregates.averageDeployedCapital)}
            helper="Average across active months"
            tooltip="Average capital deployed across all months with activity."
            tone="neutral"
            variant="hero"
          />
        </div>

        {/* 3. Win · PF — winRate is a fraction → ×100 before formatPercent */}
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

      {/* ── Buying-power ring gauge — after hero KPI row, before By strategy ── */}
      <BuyingPowerGauge deployed={currentDeployed} maxBP={maxBP} />

      {/* ── By strategy ── */}
      <MetricGroup label="By strategy" cols={3}>
        <KpiCard
          label="Cash-secured puts"
          value={formatCurrency(csp.pnl)}
          helper={`${csp.roi == null ? "—" : formatPercent(csp.roi, 1)} ROI · ${csp.trades} trades`}
          tooltip="Realized P&L from cash-secured puts and put assignments."
          tone={tone(csp.pnl)}
          variant="compact"
        />
        <KpiCard
          label="Covered calls"
          value={formatCurrency(cc.pnl)}
          helper={`${cc.roi == null ? "—" : formatPercent(cc.roi, 1)} ROI · ${cc.trades} trades`}
          tooltip="Realized P&L from covered calls and covered-call assignments."
          tone={tone(cc.pnl)}
          variant="compact"
        />
        <KpiCard
          label="Swing"
          value={formatCurrency(swing.pnl)}
          helper={`${swing.roi == null ? "—" : formatPercent(swing.roi, 1)} ROI · ${swing.trades} trades`}
          tooltip="Realized P&L from swing trades."
          tone={tone(swing.pnl)}
          variant="compact"
        />
      </MetricGroup>

      {/* ── Returns & efficiency group (YTD ROI + Expectancy only) ── */}
      <MetricGroup label="Returns & efficiency" cols={2}>
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
  onReviewTrades: (issueFilter: TradeIssueFilter) => void;
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

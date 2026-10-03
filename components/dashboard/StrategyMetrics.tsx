"use client";
import type { OptionsAggregateAnalytics, StrategyAnalytics } from "@/lib/selectors/strategy-analytics";
import { formatMaskedCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Tone = "pos" | "neg" | "neutral";

function Cell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface p-3">
      <div className="text-body font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[19px] font-medium tabular-nums",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
          tone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

const pctFrac = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const sign = (v: number | null | undefined): Tone =>
  v == null ? "neutral" : v > 0 ? "pos" : v < 0 ? "neg" : "neutral";

export function StrategyMetrics({
  a,
  maskAmounts = false,
  secondaryOnly = false,
}: {
  a: StrategyAnalytics | OptionsAggregateAnalytics;
  maskAmounts?: boolean;
  secondaryOnly?: boolean;
}) {
  const money = (v: number | null | undefined) => formatMaskedCurrency(v, maskAmounts);
  const q = a.quality;
  const cells: { label: string; value: string; tone?: Tone }[] = [
    { label: "Realized P&L", value: money(a.pnl), tone: sign(a.pnl) },
    { label: "Win rate", value: pctFrac(q.winRate) },
    {
      label: "Expectancy",
      value: q.expectancy != null ? money(q.expectancy) : "—",
      tone: sign(q.expectancy),
    },
  ];
  if (a.key === "options") {
    // Aggregate "All options" view: per-strategy capture/assignment rates would be meaningless
    // blended, so show the strategy-agnostic set instead.
    cells.push(
      {
        label: "Premium collected",
        value: a.premium ? money(a.premium.premiumCollected) : "—",
        tone: sign(a.premium?.premiumCollected),
      },
      { label: "Capital at risk", value: money(a.capitalAtRisk) },
      { label: "Trades", value: String(q.totalTrades) }
    );
  } else if (a.premium && (a.key === "csp" || a.key === "cc")) {
    const capture =
      a.key === "csp" ? a.premium.captureCashSecuredPut : a.premium.captureCoveredCall;
    cells.push(
      {
        label: "Premium collected",
        value: money(a.premium.premiumCollected),
        tone: sign(a.premium.premiumCollected),
      },
      { label: "Capture rate", value: formatPercent(capture != null ? capture * 100 : null) },
      {
        label: a.key === "csp" ? "Assignment · put" : "Assignment · call",
        value: pctFrac(a.key === "csp" ? a.premium.assignmentRatePut : a.premium.assignmentRateCall),
      },
      { label: "Capital at risk", value: money(a.capitalAtRisk) }
    );
  } else {
    cells.push(
      {
        label: "Profit factor",
        value: q.profitFactor != null ? q.profitFactor.toFixed(2) : "—",
        tone: q.profitFactor == null ? "neutral" : q.profitFactor >= 1 ? "pos" : "neg",
      },
      {
        label: "Avg win",
        value: q.averageWin != null ? money(q.averageWin) : "—",
        tone: q.averageWin != null ? "pos" : "neutral",
      },
      {
        label: "Avg loss",
        value: q.averageLoss != null ? money(q.averageLoss) : "—",
        tone: q.averageLoss != null ? "neg" : "neutral",
      },
      { label: "Trades", value: String(q.totalTrades) }
    );
  }
  const visibleCells = secondaryOnly
    ? cells.filter((cell) => cell.label !== "Realized P&L" && cell.label !== "Win rate" && cell.label !== "Trades")
    : cells;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {visibleCells.map((c) => (
        <Cell key={c.label} {...c} />
      ))}
    </div>
  );
}

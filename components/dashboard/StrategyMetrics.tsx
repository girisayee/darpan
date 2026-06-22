"use client";
import type { StrategyAnalytics } from "@/lib/selectors/strategy-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Tone = "pos" | "neg" | "neutral";

function Cell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-[16px] font-medium tabular-nums",
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

export function StrategyMetrics({ a }: { a: StrategyAnalytics }) {
  const q = a.quality;
  const cells: { label: string; value: string; tone?: Tone }[] = [
    { label: "Realized P&L", value: formatCurrency(a.pnl), tone: sign(a.pnl) },
    { label: "Win rate", value: pctFrac(q.winRate) },
    {
      label: "Expectancy",
      value: q.expectancy != null ? formatCurrency(q.expectancy) : "—",
      tone: sign(q.expectancy),
    },
  ];
  if (a.premium && (a.key === "csp" || a.key === "cc")) {
    const capture =
      a.key === "csp" ? a.premium.captureCashSecuredPut : a.premium.captureCoveredCall;
    cells.push(
      {
        label: "Premium collected",
        value: formatCurrency(a.premium.premiumCollected),
        tone: sign(a.premium.premiumCollected),
      },
      { label: "Capture rate", value: formatPercent(capture != null ? capture * 100 : null) },
      {
        label: a.key === "csp" ? "Assignment · put" : "Assignment · call",
        value: pctFrac(a.key === "csp" ? a.premium.assignmentRatePut : a.premium.assignmentRateCall),
      },
      { label: "Capital at risk", value: formatCurrency(a.capitalAtRisk) }
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
        value: q.averageWin != null ? formatCurrency(q.averageWin) : "—",
        tone: q.averageWin != null ? "pos" : "neutral",
      },
      {
        label: "Avg loss",
        value: q.averageLoss != null ? formatCurrency(q.averageLoss) : "—",
        tone: q.averageLoss != null ? "neg" : "neutral",
      },
      { label: "Trades", value: String(q.totalTrades) }
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {cells.map((c) => (
        <Cell key={c.label} {...c} />
      ))}
    </div>
  );
}

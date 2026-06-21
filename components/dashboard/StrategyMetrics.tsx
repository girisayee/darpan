"use client";
import type { StrategyAnalytics } from "@/lib/selectors/strategy-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-[16px] font-medium tabular-nums text-foreground">{value}</div>
    </div>
  );
}
const pctFrac = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function StrategyMetrics({ a }: { a: StrategyAnalytics }) {
  const q = a.quality;
  const cells: { label: string; value: string }[] = [
    { label: "Realized P&L", value: formatCurrency(a.pnl) },
    { label: "Win rate", value: pctFrac(q.winRate) },
    { label: "Expectancy", value: q.expectancy != null ? formatCurrency(q.expectancy) : "—" },
  ];
  if (a.premium && (a.key === "csp" || a.key === "cc")) {
    cells.push(
      { label: "Premium collected", value: formatCurrency(a.premium.premiumCollected) },
      { label: "Capture rate", value: formatPercent((a.key === "csp" ? a.premium.captureCashSecuredPut : a.premium.captureCoveredCall) != null ? ((a.key === "csp" ? a.premium.captureCashSecuredPut! : a.premium.captureCoveredCall!) * 100) : null) },
      { label: a.key === "csp" ? "Assignment · put" : "Assignment · call", value: pctFrac(a.key === "csp" ? a.premium.assignmentRatePut : a.premium.assignmentRateCall) },
      { label: "Capital at risk", value: formatCurrency(a.capitalAtRisk) },
    );
  } else {
    cells.push(
      { label: "Profit factor", value: q.profitFactor != null ? q.profitFactor.toFixed(2) : "—" },
      { label: "Avg win", value: q.averageWin != null ? formatCurrency(q.averageWin) : "—" },
      { label: "Avg loss", value: q.averageLoss != null ? formatCurrency(q.averageLoss) : "—" },
      { label: "Trades", value: String(q.totalTrades) },
    );
  }
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{cells.map((c) => <Cell key={c.label} {...c} />)}</div>;
}

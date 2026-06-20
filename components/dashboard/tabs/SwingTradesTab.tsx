"use client";

/**
 * SwingTradesTab — shows only SWING_TRADE realized events.
 *
 * Removed from the old TradesTab monolith per the IA redesign:
 *   - No segmented Closed|Transactions control
 *   - No raw all-transactions blotter
 *   - No CC/CSP/strategy filter chips
 * Renders a metrics strip (Realized P&L, ROI, Win rate, Avg days held, # trades)
 * above the ClosedTradesTable filtered to SWING_TRADE rows.
 */

import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";
import { ClosedTradesTable } from "./shared";

// ── Swing metrics strip ───────────────────────────────────────────────────────

function SwingMetricsStrip({ rows }: { rows: RealizedPnLEvent[] }) {
  const count = rows.length;

  if (count === 0) return null;

  const realizedPnl = rows.reduce((s, e) => s + e.realizedPnl, 0);
  const capitalDeployed = rows.reduce((s, e) => s + (e.capitalDeployed ?? 0), 0);
  // ROI: sum realizedPnl / sum capitalDeployed × 100; null if no capital recorded
  const roi = capitalDeployed > 0 ? (realizedPnl / capitalDeployed) * 100 : null;
  const winners = rows.filter((e) => e.realizedPnl > 0).length;
  const winRate = (winners / count) * 100;

  // Average holding days — only over events that have holdingDays present
  const withDays = rows.filter((e) => e.holdingDays != null);
  const avgDays =
    withDays.length > 0
      ? withDays.reduce((s, e) => s + (e.holdingDays ?? 0), 0) / withDays.length
      : null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
      <div className="rounded-[12px] border border-hairline bg-surface px-3 py-2.5 space-y-0.5">
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Realized P&L</div>
        <div className={cn("font-sans text-[14px] font-semibold tabular-nums", realizedPnl > 0 ? "text-pos" : realizedPnl < 0 ? "text-neg" : "text-foreground")}>
          {formatCurrency(realizedPnl)}
        </div>
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface px-3 py-2.5 space-y-0.5">
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">ROI</div>
        <div className={cn("font-sans text-[14px] font-semibold tabular-nums", roi !== null && roi > 0 ? "text-pos" : roi !== null && roi < 0 ? "text-neg" : "text-foreground")}>
          {roi !== null ? formatPercent(roi, 1) : "—"}
        </div>
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface px-3 py-2.5 space-y-0.5">
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Win rate</div>
        <div className="font-sans text-[14px] font-semibold tabular-nums text-foreground">
          {formatPercent(winRate, 0)}
        </div>
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface px-3 py-2.5 space-y-0.5">
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Avg days held</div>
        <div className="font-sans text-[14px] font-semibold tabular-nums text-foreground">
          {avgDays !== null ? `${avgDays.toFixed(1)}d` : "—"}
        </div>
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface px-3 py-2.5 space-y-0.5">
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Trades</div>
        <div className="font-sans text-[14px] font-semibold tabular-nums text-foreground">{count}</div>
      </div>
    </div>
  );
}

// ── SwingTradesTab ────────────────────────────────────────────────────────────

export function SwingTradesTab({
  result,
  onSelectEvent,
}: {
  result: CalculationResult;
  onSelectEvent: (e: RealizedPnLEvent) => void;
}) {
  const swingRows = result.realizedEvents.filter(
    (e) => e.strategy === "SWING_TRADE"
  );

  return (
    <div className="space-y-4 py-2">
      {/* ── Metrics strip ── */}
      <SwingMetricsStrip rows={swingRows} />

      {/* ── Ledger ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Swing trades
        </h2>
        <span className="font-sans text-[12px] tabular-nums text-muted-foreground">
          {swingRows.length} trade{swingRows.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ClosedTradesTable
        rows={swingRows}
        onSelectEvent={onSelectEvent}
        empty="No swing trades yet."
      />
    </div>
  );
}

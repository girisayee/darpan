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

import { Column, DataTable } from "@/components/tables/DataTable";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";
import { signedMoney, signedPercent } from "./shared";

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

// ── SwingTradesTable ──────────────────────────────────────────────────────────

function SwingTradesTable({
  rows,
  onSelectEvent,
}: {
  rows: RealizedPnLEvent[];
  onSelectEvent: (e: RealizedPnLEvent) => void;
}) {
  const filtered = rows.filter((r) => r.strategy !== "DATA_ISSUE");

  const columns: Column<RealizedPnLEvent>[] = [
    {
      key: "date",
      header: "Date",
      value: (row) => row.date ?? "",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.date ?? <span className="opacity-50">—</span>}
        </span>
      ),
    },
    {
      key: "symbol",
      header: "Symbol",
      value: (row) => row.symbol,
      render: (row) => (
        <span className="font-medium text-foreground">{row.symbol}</span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      value: (row) => row.quantity,
      render: (row) => (
        <span className="tabular-nums text-foreground">{row.quantity}</span>
      ),
      align: "right",
    },
    {
      key: "purchasePrice",
      header: "Purchase price",
      value: (row) => {
        const basis = (row.costBasis ?? 0) > 0 ? row.costBasis! : 1;
        return row.quantity > 0 ? basis / row.quantity : 0;
      },
      render: (row) => {
        const basis = (row.costBasis ?? 0) > 0 ? row.costBasis! : 1;
        const price = row.quantity > 0 ? basis / row.quantity : 0;
        return <span className="tabular-nums text-foreground">{formatCurrency(price)}</span>;
      },
      align: "right",
    },
    {
      key: "salePrice",
      header: "Sale price",
      value: (row) => (row.quantity > 0 ? row.grossProceeds / row.quantity : 0),
      render: (row) => {
        const price = row.quantity > 0 ? row.grossProceeds / row.quantity : 0;
        return <span className="tabular-nums text-foreground">{formatCurrency(price)}</span>;
      },
      align: "right",
    },
    {
      key: "realizedPnl",
      header: "Realized P&L",
      value: (row) => row.realizedPnl,
      render: (row) => signedMoney(row.realizedPnl),
      align: "right",
    },
    {
      key: "holdingDays",
      header: "Days held",
      value: (row) => row.holdingDays ?? -Infinity,
      render: (row) =>
        row.holdingDays != null ? (
          <span className="tabular-nums text-foreground">{row.holdingDays}</span>
        ) : (
          <span className="opacity-50">—</span>
        ),
      align: "right",
    },
    {
      key: "roiPercent",
      header: "ROI %",
      value: (row) => {
        const basis = (row.costBasis ?? 0) > 0 ? row.costBasis! : 1;
        return (row.realizedPnl / basis) * 100;
      },
      render: (row) => {
        const basis = (row.costBasis ?? 0) > 0 ? row.costBasis! : 1;
        return signedPercent((row.realizedPnl / basis) * 100);
      },
      align: "right",
    },
  ];

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      onRowClick={onSelectEvent}
      empty="No swing trades yet."
      defaultSort={{ key: "date", direction: "desc" }}
    />
  );
}

// ── SwingTradesTab ────────────────────────────────────────────────────────────

export function SwingTradesTab({
  result,
  onSelectEvent,
  onReviewFix,
}: {
  result: CalculationResult;
  onSelectEvent: (e: RealizedPnLEvent) => void;
  onReviewFix?: () => void;
}) {
  const swingRows = result.realizedEvents.filter(
    (e) => e.strategy === "SWING_TRADE"
  );
  const unresolvedCount = swingRows.filter((e) => e.costBasis === null).length;

  return (
    <div className="space-y-4 py-2">
      {/* ── Metrics strip ── */}
      <SwingMetricsStrip rows={swingRows} />

      {/* ── Ledger ── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Swing trades
        </h2>
        <div className="flex items-center gap-2">
          {unresolvedCount > 0 && onReviewFix && (
            <button
              type="button"
              onClick={onReviewFix}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 font-sans text-[11.5px] font-medium text-accent transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warn/15 px-1 text-[10px] tabular-nums text-warn">
                {unresolvedCount}
              </span>
              Fix →
            </button>
          )}
          <span className="font-sans text-[12px] tabular-nums text-muted-foreground">
            {swingRows.length} trade{swingRows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <SwingTradesTable
        rows={swingRows}
        onSelectEvent={onSelectEvent}
      />
    </div>
  );
}

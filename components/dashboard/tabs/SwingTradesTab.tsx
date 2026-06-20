"use client";

/**
 * SwingTradesTab — shows only SWING_TRADE realized events.
 *
 * Removed from the old TradesTab monolith per the IA redesign:
 *   - No segmented Closed|Transactions control
 *   - No raw all-transactions blotter
 *   - No CC/CSP/strategy filter chips
 * Renders a simple heading + ClosedTradesTable filtered to SWING_TRADE rows.
 */

import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";
import { ClosedTradesTable } from "./shared";

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

"use client";

import { useState } from "react";
import { StrategyStrip } from "@/components/dashboard/StrategyStrip";
import { StrategyMetrics } from "@/components/dashboard/StrategyMetrics";
import { DataTable } from "@/components/tables/DataTable";
import { SegmentedControl } from "@/components/dashboard/tabs/shared";
import { columnsFor, toPositionRows } from "@/components/dashboard/positions/columns";
import { strategyAnalytics, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import type { CalculationResult } from "@/types/trading";

type SegmentValue = "all" | StrategyKey;
type StateFilter = "All" | "Active" | "Closed";

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  csp: "Cash-secured puts",
  cc: "Covered calls",
  long: "Long options",
  swing: "Swing",
};

export function PositionsTab({
  result,
  initialStrategy,
  onReviewFix,
}: {
  result: CalculationResult;
  initialStrategy?: StrategyKey;
  onReviewFix?: () => void;
}) {
  const [segment, setSegment] = useState<SegmentValue>(initialStrategy ?? "all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("Active");

  function handleOpenStrategy(k: StrategyKey) {
    setSegment(k);
    setStateFilter("Active");
  }

  if (segment === "all") {
    return (
      <div className="space-y-5 py-2">
        <StrategyStrip result={result} onOpen={handleOpenStrategy} />
        {onReviewFix && result.realizedEvents.some((e) => e.strategy === "DATA_ISSUE") && (
          <div className="flex items-center justify-between rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2">
            <span className="text-[12px] text-warn">Some trades have unresolved data issues.</span>
            <button
              type="button"
              onClick={onReviewFix}
              className="text-[12px] font-medium text-warn underline"
            >
              Review &amp; fix
            </button>
          </div>
        )}
      </div>
    );
  }

  const a = strategyAnalytics(result, segment);
  const stateKey = stateFilter.toLowerCase() as "all" | "active" | "closed";
  const rows = toPositionRows(result, segment, stateKey);

  return (
    <div className="space-y-4 py-2">
      {/* Back to all */}
      <button
        type="button"
        onClick={() => setSegment("all")}
        className="text-[12px] text-muted-foreground hover:text-foreground"
      >
        ← All strategies
      </button>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[14px] font-semibold text-foreground">
          {STRATEGY_LABELS[segment]}
        </h2>
        <SegmentedControl<StateFilter>
          value={stateFilter}
          options={["All", "Active", "Closed"]}
          onChange={setStateFilter}
        />
      </div>

      <StrategyMetrics a={a} />

      {onReviewFix && result.realizedEvents.some((e) => e.strategy === "DATA_ISSUE") && (
        <div className="flex items-center justify-between rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2">
          <span className="text-[12px] text-warn">Some trades have unresolved data issues.</span>
          <button
            type="button"
            onClick={onReviewFix}
            className="text-[12px] font-medium text-warn underline"
          >
            Review &amp; fix
          </button>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={columnsFor(segment)}
        empty={`No ${stateFilter.toLowerCase()} ${STRATEGY_LABELS[segment].toLowerCase()} positions.`}
        searchable
        pageSize={5}
      />
    </div>
  );
}

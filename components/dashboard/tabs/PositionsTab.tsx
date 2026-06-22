"use client";

import { useState } from "react";
import { StrategyStrip } from "@/components/dashboard/StrategyStrip";
import { StrategyMetrics } from "@/components/dashboard/StrategyMetrics";
import { DataTable } from "@/components/tables/DataTable";
import { SegmentedControl } from "@/components/dashboard/tabs/shared";
import { allColumns, columnsFor, toAllPositionRows, toPositionRows } from "@/components/dashboard/positions/columns";
import { strategyAnalytics, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";

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
  onSelectEvent,
  onSelectLifecycle,
}: {
  result: CalculationResult;
  initialStrategy?: StrategyKey;
  onReviewFix?: () => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
  onSelectLifecycle: (l: OptionLifecycle) => void;
}) {
  const [appliedInitial, setAppliedInitial] = useState<StrategyKey | undefined>(initialStrategy);
  const [segment, setSegment] = useState<SegmentValue>(initialStrategy ?? "all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("All");
  const [allStateFilter, setAllStateFilter] = useState<StateFilter>("All");

  // Detect prop changes using only state (avoids effect/ref lint rules).
  // When the parent passes a new initialStrategy, update segment to match.
  if (initialStrategy !== appliedInitial) {
    setAppliedInitial(initialStrategy);
    if (initialStrategy) setSegment(initialStrategy);
  }

  function handleOpenStrategy(k: StrategyKey) {
    setSegment(k);
    setStateFilter("All");
  }

  if (segment === "all") {
    const allStateKey = allStateFilter.toLowerCase() as "all" | "active" | "closed";
    const allRows = toAllPositionRows(result, allStateKey);
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
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-foreground">All positions</span>
          <SegmentedControl<StateFilter>
            value={allStateFilter}
            options={["All", "Active", "Closed"]}
            onChange={setAllStateFilter}
          />
        </div>
        <DataTable
          rows={allRows}
          columns={allColumns}
          empty={`No ${allStateFilter.toLowerCase()} positions.`}
          searchable
          pageSize={8}
          onRowClick={(row) => {
            if (row.lifecycle) onSelectLifecycle(row.lifecycle);
            else if (row.event) onSelectEvent(row.event);
          }}
        />
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
        onRowClick={(row) => {
          if (row.lifecycle) onSelectLifecycle(row.lifecycle);
          else if (row.event) onSelectEvent(row.event);
        }}
      />
    </div>
  );
}

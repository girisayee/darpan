"use client";

import { useMemo, useState, type ReactNode } from "react";
import { StrategyMetrics } from "@/components/dashboard/StrategyMetrics";
import { DataTable } from "@/components/tables/DataTable";
import { SegmentedControl, signedMoney } from "@/components/dashboard/tabs/shared";
import { allColumns, columnsFor, toAllPositionRows, toPositionRows } from "@/components/dashboard/positions/columns";
import { optionsAnalytics, strategyAnalytics, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { cn } from "@/lib/utils/cn";
import type { AppSettings, CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";

type TabKey = "options" | "swing";
type OptionChip = "all" | "csp" | "cc" | "long";
type StateFilter = "All" | "Active" | "Closed";

const OPTION_CHIP_LABELS: Record<OptionChip, string> = {
  all: "All",
  csp: "Cash-secured puts",
  cc: "Covered calls",
  long: "Long options",
};

const OPTION_CHIPS: { key: OptionChip; short: string }[] = [
  { key: "all", short: "All" },
  { key: "csp", short: "CSP" },
  { key: "cc", short: "CC" },
  { key: "long", short: "Long" },
];

/** Map the deep-link strategy to a (tab, chip) pair. */
function mapInitial(initial?: StrategyKey): { tab: TabKey; chip: OptionChip } {
  if (initial === "swing") return { tab: "swing", chip: "all" };
  if (initial === "csp" || initial === "cc" || initial === "long") return { tab: "options", chip: initial };
  return { tab: "options", chip: "all" };
}

function ReviewFixBanner({ onReviewFix }: { onReviewFix: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2">
      <span className="text-[12px] text-warn">Some trades have unresolved data issues.</span>
      <button type="button" onClick={onReviewFix} className="text-[12px] font-medium text-warn underline">
        Review &amp; fix
      </button>
    </div>
  );
}

function TabCard({
  name,
  count,
  pnl,
  sub,
  active,
  onClick,
}: {
  name: string;
  count: string;
  pnl: number;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[10px] border bg-surface p-3 text-left transition-colors",
        active ? "border-accent ring-1 ring-accent/40" : "border-hairline hover:border-accent/50"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{name}</span>
        <span className="text-[12px] text-muted-foreground">{count}</span>
      </div>
      <div className="mt-0.5 text-[19px] font-medium tabular-nums">{signedMoney(pnl)}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>
    </button>
  );
}

export function PositionsTab(props: {
  result: CalculationResult;
  // Retained for the caller contract; the Swing tab now always shows open lots,
  // so settings.showSwingOpenPositions is intentionally not consulted here.
  settings: AppSettings;
  initialStrategy?: StrategyKey;
  onReviewFix?: () => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
  onSelectLifecycle: (l: OptionLifecycle) => void;
}) {
  const { result, initialStrategy, onReviewFix, onSelectEvent, onSelectLifecycle } = props;
  const initial = mapInitial(initialStrategy);
  const [appliedInitial, setAppliedInitial] = useState<StrategyKey | undefined>(initialStrategy);
  const [tab, setTab] = useState<TabKey>(initial.tab);
  const [optionChip, setOptionChip] = useState<OptionChip>(initial.chip);
  const [stateFilter, setStateFilter] = useState<StateFilter>("All");

  // Detect a new deep-link from the parent using state only (avoids effect/ref lint rules).
  if (initialStrategy !== appliedInitial) {
    setAppliedInitial(initialStrategy);
    if (initialStrategy) {
      const next = mapInitial(initialStrategy);
      setTab(next.tab);
      setOptionChip(next.chip);
      setStateFilter("All");
    }
  }

  // Headline numbers shown on both tab cards — visible before any interaction.
  const cards = useMemo(() => {
    const cspActive = toPositionRows(result, "csp", "active").length;
    const ccActive = toPositionRows(result, "cc", "active").length;
    const longActive = toPositionRows(result, "long", "active").length;
    const swingA = strategyAnalytics(result, "swing");
    const swingOpen = result.taxLots.filter((l) => l.status !== "closed" && l.remainingQuantity > 0).length;
    const winRate = swingA.quality.winRate;
    return {
      optionsActive: cspActive + ccActive + longActive,
      optionsPnl: optionsAnalytics(result).pnl,
      optionsSub: `${cspActive} CSP · ${ccActive} CC · ${longActive} long`,
      swingOpen,
      swingPnl: swingA.pnl,
      swingSub: `${swingA.quality.totalTrades} trades · ${winRate != null ? `${Math.round(winRate * 100)}% win` : "—"}`,
    };
  }, [result]);

  const stateKey = stateFilter.toLowerCase() as "all" | "active" | "closed";

  let rows: ReturnType<typeof toPositionRows>;
  let columns: typeof allColumns;
  let metrics: ReactNode;
  let emptyLabel: string;

  if (tab === "options") {
    if (optionChip === "all") {
      rows = toAllPositionRows(result, stateKey);
      columns = allColumns;
      metrics = <StrategyMetrics a={optionsAnalytics(result)} />;
      emptyLabel = `No ${stateFilter.toLowerCase()} option positions.`;
    } else {
      rows = toPositionRows(result, optionChip, stateKey);
      columns = columnsFor(optionChip);
      metrics = <StrategyMetrics a={strategyAnalytics(result, optionChip)} />;
      emptyLabel = `No ${stateFilter.toLowerCase()} ${OPTION_CHIP_LABELS[optionChip].toLowerCase()} positions.`;
    }
  } else {
    // Positions/Swing always shows open lots — that is the point of a positions page.
    rows = toPositionRows(result, "swing", stateKey, true);
    columns = columnsFor("swing");
    metrics = <StrategyMetrics a={strategyAnalytics(result, "swing")} />;
    emptyLabel = `No ${stateFilter.toLowerCase()} swing positions.`;
  }

  const hasDataIssues = onReviewFix != null && result.realizedEvents.some((e) => e.strategy === "DATA_ISSUE");

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-2.5">
        <TabCard
          name="Options"
          count={`${cards.optionsActive} active`}
          pnl={cards.optionsPnl}
          sub={cards.optionsSub}
          active={tab === "options"}
          onClick={() => {
            setTab("options");
            setStateFilter("All");
          }}
        />
        <TabCard
          name="Swing trades"
          count={`${cards.swingOpen} open`}
          pnl={cards.swingPnl}
          sub={cards.swingSub}
          active={tab === "swing"}
          onClick={() => {
            setTab("swing");
            setStateFilter("All");
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {tab === "options" ? (
          <div className="flex gap-1.5">
            {OPTION_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setOptionChip(c.key)}
                aria-pressed={optionChip === c.key}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  optionChip === c.key
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-hairline text-muted-foreground hover:text-foreground"
                )}
              >
                {c.short}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[13px] font-medium text-foreground">Swing trades</span>
        )}
        <SegmentedControl<StateFilter>
          value={stateFilter}
          options={["All", "Active", "Closed"]}
          onChange={setStateFilter}
        />
      </div>

      {metrics}

      {hasDataIssues && onReviewFix && <ReviewFixBanner onReviewFix={onReviewFix} />}

      <DataTable
        rows={rows}
        columns={columns}
        empty={emptyLabel}
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

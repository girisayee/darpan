"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StrategyMetrics } from "@/components/dashboard/StrategyMetrics";
import { DataTable } from "@/components/tables/DataTable";
import { SegmentedControl, signedMoney } from "@/components/dashboard/tabs/shared";
import { allColumns, columnsFor, toAllPositionRows, toPositionRows } from "@/components/dashboard/positions/columns";
import { optionsAnalytics, strategyAnalytics } from "@/lib/selectors/strategy-analytics";
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

function ReviewFixBanner({ onReviewFix }: { onReviewFix: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2">
      <span className="text-body text-warn">Some trades have unresolved data issues.</span>
      <button type="button" onClick={onReviewFix} className="text-body font-medium text-warn underline">
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
        <span className="text-strong font-medium text-foreground">{name}</span>
        <span className="text-body text-muted-foreground">{count}</span>
      </div>
      <div className="mt-0.5 text-[19px] font-medium tabular-nums">{signedMoney(pnl)}</div>
      <div className="mt-0.5 text-body text-muted-foreground">{sub}</div>
    </button>
  );
}

export function PositionsTab(props: {
  result: CalculationResult;
  settings: AppSettings;
  onReviewFix?: () => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
  onSelectLifecycle: (l: OptionLifecycle) => void;
}) {
  const { result, settings, onReviewFix, onSelectEvent, onSelectLifecycle } = props;
  const showSwingOpen = settings.showSwingOpenPositions;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The Options/Swing view and the option-strategy chip live in the URL so they are
  // deep-linkable and survive reload; the All/Active/Closed filter stays local.
  const tab: TabKey = searchParams.get("view") === "swing" ? "swing" : "options";
  const strategyParam = searchParams.get("strategy");
  const optionChip: OptionChip =
    strategyParam === "csp" || strategyParam === "cc" || strategyParam === "long" ? strategyParam : "all";
  const [stateFilter, setStateFilter] = useState<StateFilter>("All");

  function navigate(next: { view: TabKey; strategy?: OptionChip }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next.view);
    if (next.view === "options" && next.strategy && next.strategy !== "all") {
      params.set("strategy", next.strategy);
    } else {
      params.delete("strategy");
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Headline numbers shown on both tab cards — visible before any interaction.
  const cards = useMemo(() => {
    const cspActive = toPositionRows(result, "csp", "active").length;
    const ccActive = toPositionRows(result, "cc", "active").length;
    const longActive = toPositionRows(result, "long", "active").length;
    const swingA = strategyAnalytics(result, "swing");
    // Only count open lots when the user opts in, so the card matches what the table shows.
    const swingOpen = showSwingOpen
      ? result.taxLots.filter((l) => l.status !== "closed" && l.remainingQuantity > 0).length
      : 0;
    const winRate = swingA.quality.winRate;
    return {
      optionsActive: cspActive + ccActive + longActive,
      optionsPnl: optionsAnalytics(result).pnl,
      optionsSub: `${cspActive} CSP · ${ccActive} CC · ${longActive} long`,
      swingOpen,
      swingPnl: swingA.pnl,
      swingSub: `${swingA.quality.totalTrades} trades · ${winRate != null ? `${Math.round(winRate * 100)}% win` : "—"}`,
    };
  }, [result, showSwingOpen]);

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
    // Open swing lots appear only when the user enables "show open swing positions".
    rows = toPositionRows(result, "swing", stateKey, showSwingOpen);
    columns = columnsFor("swing");
    metrics = <StrategyMetrics a={strategyAnalytics(result, "swing")} />;
    emptyLabel = `No ${stateFilter.toLowerCase()} stock positions.`;
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
            navigate({ view: "options", strategy: optionChip });
            setStateFilter("All");
          }}
        />
        <TabCard
          name="Stock trades"
          count={`${cards.swingOpen} open`}
          pnl={cards.swingPnl}
          sub={cards.swingSub}
          active={tab === "swing"}
          onClick={() => {
            navigate({ view: "swing" });
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
                onClick={() => navigate({ view: "options", strategy: c.key })}
                aria-pressed={optionChip === c.key}
                className={cn(
                  "rounded-full border px-3 py-1 text-body font-medium transition-colors",
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
          <span className="text-strong font-medium text-foreground">Stock trades</span>
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
        defaultSort={{ key: "closeDate", direction: "desc" }}
        tiebreak={{ key: "openDate", direction: "desc" }}
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

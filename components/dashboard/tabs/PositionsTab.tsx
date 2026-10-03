"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StrategyMetrics } from "@/components/dashboard/StrategyMetrics";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import { PositionMobileList } from "@/components/dashboard/positions/PositionMobileList";
import { DataTable } from "@/components/tables/DataTable";
import { SegmentedControl, currentDeployedCapital, signedMoney } from "@/components/dashboard/tabs/shared";
import { allColumns, columnsFor, openStockRowsForYear, searchPositionRows, toAllPositionRows, toPositionRows, type PositionRow } from "@/components/dashboard/positions/columns";
import { optionsAnalytics, strategyAnalytics } from "@/lib/selectors/strategy-analytics";
import { cn } from "@/lib/utils/cn";
import { formatMaskedCurrency } from "@/lib/utils/format";
import type { AppSettings, CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";

type TabKey = "options" | "swing";
type OptionChip = "all" | "csp" | "cc" | "long";
type StateFilter = "All" | "Active" | "Closed";

const OPTION_CHIPS: { key: OptionChip; short: string; label: string }[] = [
  { key: "all", short: "All", label: "All strategies" },
  { key: "csp", short: "CSP", label: "Cash-secured puts" },
  { key: "cc", short: "CC", label: "Covered calls" },
  { key: "long", short: "Long", label: "Long options" },
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

function ExposureLine({ result, settings }: { result: CalculationResult; settings: AppSettings }) {
  const deployed = currentDeployedCapital(result);
  const max = settings.maxBuyingPower;
  const ratio = max != null && max > 0 ? deployed / max : null;
  const overage = max != null ? Math.max(0, deployed - max) : 0;
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1 text-body font-medium text-foreground">
          Inferred open option exposure
          <InfoTooltip label="Inferred open option exposure" text="Collateral behind open short options reconstructed from imported trades. Long options and stock holdings are excluded. This is not a live broker balance." />
        </span>
        <span className={cn("text-body font-semibold tabular-nums", ratio != null && ratio > 1 ? "text-warn" : "text-foreground")}>
          {formatMaskedCurrency(deployed, settings.maskAmounts)}{ratio != null ? ` / ${formatMaskedCurrency(max, settings.maskAmounts)} · ${Math.round(ratio * 100)}%` : ""}
        </span>
        {ratio != null && <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-inset sm:block" aria-hidden="true"><div className={cn("h-full rounded-full", ratio > 1 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>}
      </div>
      <p className="mt-1 text-caption text-muted-foreground">{ratio == null ? "Set max buying power in Settings to compare exposure." : ratio > 1 ? `Above configured max by ${formatMaskedCurrency(overage, settings.maskAmounts)}.` : `${Math.round(ratio * 100)}% of configured max.`} Imported positions, not a live broker balance.</p>
    </div>
  );
}

function ClosedTradeStats({ analytics, count, maskAmounts, category }: {
  analytics: ReturnType<typeof optionsAnalytics> | ReturnType<typeof strategyAnalytics>;
  count: number;
  maskAmounts: boolean;
  category: TabKey;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface">
      <div className="grid grid-cols-3 px-3 py-2.5 sm:flex sm:gap-6 sm:px-4">
        <div className="border-r border-hairline-soft pr-2 sm:pr-6"><div className="text-caption text-muted-foreground">Realized P&amp;L</div><div className="text-strong font-semibold tabular-nums">{signedMoney(analytics.pnl, maskAmounts)}</div></div>
        <div className="border-r border-hairline-soft px-2 sm:px-0 sm:pr-6"><div className="inline-flex items-center gap-1 text-caption text-muted-foreground">Event win rate <InfoTooltip label="Event win rate" text="Winning realized events divided by all realized events in this category and strategy. A closed option play can contain more than one realized event." /></div><div className="text-strong font-semibold tabular-nums">{analytics.quality.winRate == null ? "—" : `${Math.round(analytics.quality.winRate * 100)}%`}</div></div>
        <div className="pl-2 sm:pl-0"><div className="text-caption text-muted-foreground">{category === "options" ? "Closed plays" : "Closed stock trades"}</div><div className="text-strong font-semibold tabular-nums">{count}</div></div>
      </div>
      {count > 0 && <details className="border-t border-hairline-soft px-3 py-2.5 sm:px-4"><summary className="cursor-pointer text-body font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">More strategy stats</summary><div className="pt-2"><p className="mb-2 text-caption text-muted-foreground">Quality uses realized events. Premium and capital measures include open option cycles where relevant.</p><StrategyMetrics a={analytics} maskAmounts={maskAmounts} secondaryOnly /></div></details>}
    </div>
  );
}

function PositionSection({ title, rows, total, kind, status, chip, maskAmounts, onSelect, empty, helper, hideHeading = false }: {
  title: string;
  rows: PositionRow[];
  total: number;
  kind: TabKey;
  status: "active" | "closed";
  chip: OptionChip;
  maskAmounts: boolean;
  onSelect: (row: PositionRow) => void;
  empty: string;
  helper?: string;
  hideHeading?: boolean;
}) {
  const columns = kind === "options"
    ? chip === "all" ? allColumns(maskAmounts, status) : columnsFor(chip, maskAmounts, status)
    : columnsFor("swing", maskAmounts, status);
  const dateKey = status === "active" && kind === "options" ? "expirationDate" : status === "closed" ? "closeDate" : "openDate";
  const direction = status === "active" && kind === "options" ? "asc" : "desc";
  return (
    <section className="space-y-2.5" aria-label={title}>
      {!hideHeading && <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lead font-semibold text-foreground">{title} <span className="ml-1 text-body font-normal tabular-nums text-muted-foreground">{total}</span></h2>
        {helper && <span className="hidden text-caption text-muted-foreground md:inline">{helper}</span>}
      </div>}
      <div className="hidden md:block">
        <DataTable key={`${kind}-${status}-${chip}`} rows={rows} columns={columns} empty={empty} defaultSort={{ key: dateKey, direction }} pageSize={8} onRowClick={status === "active" && kind === "swing" ? undefined : onSelect} />
      </div>
      <PositionMobileList key={`${kind}-${status}-${chip}`} rows={rows} kind={kind} status={status} maskAmounts={maskAmounts} onSelect={onSelect} empty={empty} />
    </section>
  );
}

export function PositionsTab(props: {
  result: CalculationResult;
  allYearsResult: CalculationResult;
  settings: AppSettings;
  year?: string;
  onReviewFix?: () => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
  onSelectLifecycle: (l: OptionLifecycle) => void;
}) {
  const { result, allYearsResult, settings, year, onReviewFix, onSelectEvent, onSelectLifecycle } = props;
  const isCurrentYear = year == null || Number(year) === new Date().getFullYear();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The Options/Swing view and the option-strategy chip live in the URL so they are
  // deep-linkable and survive reload; the All/Active/Closed filter stays local.
  const tab: TabKey = searchParams.get("view") === "swing" ? "swing" : "options";
  const strategyParam = searchParams.get("strategy");
  const optionChip: OptionChip =
    strategyParam === "csp" || strategyParam === "cc" || strategyParam === "long" ? strategyParam : "all";
  // Seed the All/Active/Closed filter from the URL (deep-linkable, e.g. from
  // Home's "View all open positions"), then keep it as local state.
  const stateParam = searchParams.get("state");
  const initialStateFilter: StateFilter =
    stateParam === "active" ? "Active" : stateParam === "closed" ? "Closed" : "All";
  const stateFilter: StateFilter = tab === "options" && !isCurrentYear && initialStateFilter === "Active" ? "All" : initialStateFilter;
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  function navigate(next: { view?: TabKey; strategy?: OptionChip; state?: StateFilter }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextView = next.view ?? tab;
    params.set("view", nextView);
    if (nextView === "options") {
      const nextChip = next.strategy ?? optionChip;
      if (nextChip === "all") params.delete("strategy");
      else params.set("strategy", nextChip);
    } else params.delete("strategy");
    const nextState = next.state ?? (next.view && next.view !== tab ? "All" : stateFilter);
    if (nextState === "All") params.delete("state");
    else params.set("state", nextState.toLowerCase());
    router.replace(`${pathname}?${params.toString()}`);
  }

  const analytics = tab === "options"
    ? optionChip === "all" ? optionsAnalytics(result) : strategyAnalytics(result, optionChip)
    : strategyAnalytics(result, "swing");
  const openRows = tab === "options"
    ? optionChip === "all" ? toAllPositionRows(result, "active") : toPositionRows(result, optionChip, "active")
    : openStockRowsForYear(allYearsResult, year);
  const closedRowsInResult = tab === "options"
    ? optionChip === "all" ? toAllPositionRows(result, "closed") : toPositionRows(result, optionChip, "closed")
    : toPositionRows(result, "swing", "closed");
  // A filtered year can carry an earlier option lifecycle forward for basis
  // reconstruction. Its eventual close belongs only to the close year.
  const closedRows = year ? closedRowsInResult.filter((row) => row.closeDate?.startsWith(year)) : closedRowsInResult;
  const visibleOpenRows = searchPositionRows(openRows, query);
  const visibleClosedRows = searchPositionRows(closedRows, query);
  const showOpen = stateFilter !== "Closed" && (tab === "swing" || isCurrentYear);
  const showClosed = stateFilter !== "Active";
  const searchGroups = searching ? [
    { title: "Open options", rows: isCurrentYear ? searchPositionRows(toAllPositionRows(result, "active"), query) : [], kind: "options" as const, status: "active" as const },
    { title: "Closed options", rows: searchPositionRows(toAllPositionRows(result, "closed").filter((row) => !year || row.closeDate?.startsWith(year)), query), kind: "options" as const, status: "closed" as const },
    { title: `Open stock lots · opened in ${year ?? new Date().getFullYear()}`, rows: searchPositionRows(openStockRowsForYear(allYearsResult, year), query), kind: "swing" as const, status: "active" as const },
    { title: "Closed stock trades", rows: searchPositionRows(toPositionRows(result, "swing", "closed").filter((row) => !year || row.closeDate?.startsWith(year)), query), kind: "swing" as const, status: "closed" as const },
  ] : [];
  const searchCount = searchGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const selectRow = (row: PositionRow) => {
    if (row.lifecycle) onSelectLifecycle(row.lifecycle);
    else if (row.event) onSelectEvent(row.event);
  };

  const hasDataIssues = onReviewFix != null && result.realizedEvents.some((e) => e.strategy === "DATA_ISSUE");

  return (
    <div className="space-y-4 py-2">
      <div>
        <p className="mb-1 text-caption font-semibold uppercase tracking-[0.12em] text-accent">Open book and trade record</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">Positions</h1>
        <p className="mt-1 text-body text-muted-foreground">Options and stock trades closed in {year ?? new Date().getFullYear()}, plus stock lots still open from that year.</p>
      </div>
      {isCurrentYear && <ExposureLine result={result} settings={settings} />}

      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all positions…" aria-label="Search all positions" className="h-12 w-full rounded-xl border border-hairline bg-surface pl-12 pr-4 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/40" />
      </div>

      {!searching && <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-hairline bg-surface-inset p-0.5" role="group" aria-label="Position category">
          {([{ key: "options", label: "Options" }, { key: "swing", label: "Stock trades" }] as const).map((item) => (
            <button key={item.key} type="button" onClick={() => navigate({ view: item.key, state: "All" })} aria-pressed={tab === item.key} className={cn("rounded-md px-3 py-1.5 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", tab === item.key ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>
          ))}
        </div>
        <SegmentedControl<StateFilter>
          value={stateFilter}
          options={tab === "options" && !isCurrentYear ? ["All", "Closed"] : ["All", "Active", "Closed"]}
          onChange={(state) => navigate({ state })}
        />
      </div>}
      {!searching && tab === "options" && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Option strategy">
        {OPTION_CHIPS.map((chip) => (
          <button key={chip.key} type="button" onClick={() => navigate({ strategy: chip.key })} aria-pressed={optionChip === chip.key} aria-label={chip.label} className={cn("rounded-full border px-3 py-1 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", optionChip === chip.key ? "border-accent bg-accent/15 text-accent" : "border-hairline text-muted-foreground hover:text-foreground")}>{chip.short}</button>
        ))}
      </div>}

      {hasDataIssues && onReviewFix && <ReviewFixBanner onReviewFix={onReviewFix} />}

      {searching && <div className="space-y-4">
        <p className="text-body tabular-nums text-muted-foreground" aria-live="polite">{searchCount} {searchCount === 1 ? "position" : "positions"} found across options and stocks in {year ?? new Date().getFullYear()}</p>
        {searchCount === 0 ? <div className="rounded-xl border border-hairline bg-surface p-6 text-body text-muted-foreground">No positions match your search in this year.</div> : searchGroups.filter((group) => group.rows.length > 0).map((group) => <PositionSection
          key={`${group.kind}-${group.status}`} title={group.title} rows={group.rows} total={group.rows.length} kind={group.kind} status={group.status} chip="all" maskAmounts={settings.maskAmounts} onSelect={selectRow} empty="No matching positions."
        />)}
      </div>}

      {!searching && showOpen && <PositionSection
        title={tab === "options" ? "Open options" : `Open stock lots · opened in ${year ?? new Date().getFullYear()}`}
        rows={visibleOpenRows} total={openRows.length} kind={tab} status="active" chip={optionChip}
        maskAmounts={settings.maskAmounts} onSelect={selectRow}
        empty={tab === "options" ? "No open option positions." : "No stock lots opened in this year are still open."}
        helper={tab === "options" ? "Default sort: nearest expiry" : "Reconstructed from imported trades; no live mark"}
      />}

      {!searching && showClosed && <div className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lead font-semibold text-foreground">{tab === "options" ? "Closed options" : "Closed stock trades"} <span className="ml-1 text-body font-normal tabular-nums text-muted-foreground">{closedRows.length}</span></h2>
          <span className="text-caption text-muted-foreground">Realized results in the selected year</span>
        </div>
        <ClosedTradeStats analytics={analytics} count={closedRows.length} maskAmounts={settings.maskAmounts} category={tab} />
        <PositionSection
          title={tab === "options" ? "Closed options" : "Closed stock trades"} hideHeading
          rows={visibleClosedRows} total={closedRows.length} kind={tab} status="closed" chip={optionChip}
          maskAmounts={settings.maskAmounts} onSelect={selectRow}
          empty={tab === "options" ? "No closed option positions." : "No closed stock trades."}
        />
      </div>}
    </div>
  );
}

"use client";

/**
 * TradesTab — aurora_trades_blotter mockup (Phase 2)
 *
 * Features:
 *  - Segmented control: "Closed trades" | "Transactions"
 *  - Closed trades: strategy filter chips + ClosedTradesTable
 *  - Transactions: search input + type chips + paginated raw blotter
 */

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusChip } from "@/components/common/StatusChip";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";
import type { CalculationResult, RealizedPnLEvent, Strategy, TradeTransaction } from "@/types/trading";
import { ClosedTradesTable, compareDateDesc, label, SegmentedControl, signedMoney } from "./shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type TradeIssueFilter = "unresolved" | "duplicates" | null;
type TypeFilter = "All" | "Options" | "Stock" | "Unresolved";
type PrimaryView = "Closed trades" | "Transactions";
type StrategyFilter = "All" | "Covered calls" | "Cash-secured puts" | "Swing";

const PAGE_SIZE = 50;

// ── Strategy filter → Strategy[] map ─────────────────────────────────────────

const STRATEGY_FILTER_MAP: Record<StrategyFilter, Strategy[]> = {
  All: ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT", "CASH_SECURED_PUT", "PUT_ASSIGNMENT", "SWING_TRADE"],
  "Covered calls": ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT"],
  "Cash-secured puts": ["CASH_SECURED_PUT", "PUT_ASSIGNMENT"],
  Swing: ["SWING_TRADE"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Classify a transaction as Options, Stock, or Unresolved for filter chips. */
function typeCategory(tx: TradeTransaction): "Options" | "Stock" | "Unresolved" {
  if (tx.status === "unresolved") return "Unresolved";
  if (tx.instrumentType === "option") return "Options";
  return "Stock";
}

/** Action label used both for display and search matching. */
function actionLabel(action: string): string {
  return label(action);
}

/** Status chip for a trade transaction row. */
function tradeRowStatusChip(tx: TradeTransaction) {
  const kindMap = {
    normalized: "ok",
    unresolved: "unresolved",
    ignored: "closed",
  } as const;
  return <StatusChip kind={kindMap[tx.status] ?? "ok"} />;
}

// ── Filter chip component ─────────────────────────────────────────────────────

function FilterChip({
  label: chipLabel,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-sans text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        active
          ? "bg-accent/15 text-accent"
          : "bg-surface-inset text-muted-foreground hover:text-foreground"
      )}
    >
      {chipLabel}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none",
            active ? "bg-accent/25 text-accent" : "bg-warn/15 text-warn"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TradesTab({
  result,
  search: externalSearch,
  onSearchChange,
  issueFilter,
  onIssueFilterChange,
  onSelectEvent,
}: {
  result: CalculationResult;
  search: string;
  onSearchChange: (value: string) => void;
  issueFilter: TradeIssueFilter;
  onIssueFilterChange: (value: TradeIssueFilter) => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
}) {
  // Primary segmented control
  const [primaryView, setPrimaryView] = useState<PrimaryView>("Closed trades");

  // Strategy filter for closed-trades view
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>("All");

  // Sync external search prop with local controlled input
  const [localSearch, setLocalSearch] = useState(externalSearch ?? "");

  // Type filter chip state — also sync with issueFilter prop on mount
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    issueFilter === "unresolved" ? "Unresolved" : "All"
  );

  const [page, setPage] = useState(0);

  // Keep local search in sync if parent changes it
  const searchTerm = localSearch;

  function handleSearchChange(value: string) {
    setLocalSearch(value);
    onSearchChange(value);
    setPage(0);
  }

  function handleTypeFilter(next: TypeFilter) {
    setTypeFilter(next);
    // Reflect back to parent's issueFilter contract
    if (next === "Unresolved") {
      onIssueFilterChange("unresolved");
    } else {
      onIssueFilterChange(null);
    }
    setPage(0);
  }

  // ── Closed-trades filtering ───────────────────────────────────────────────

  const allowedStrategies = STRATEGY_FILTER_MAP[strategyFilter];
  const closedTradesRows = useMemo(
    () =>
      result.realizedEvents.filter(
        (e) => allowedStrategies.includes(e.strategy)
      ),
    [result.realizedEvents, allowedStrategies]
  );

  // ── Counts for chips ──────────────────────────────────────────────────────

  const unresolvedCount = useMemo(
    () => result.transactions.filter((tx) => tx.status === "unresolved").length,
    [result.transactions]
  );

  // ── Newest-first sort (null-safe) ─────────────────────────────────────────

  const sortedTransactions = useMemo(
    () =>
      [...result.transactions].sort((a, b) =>
        compareDateDesc(a.tradeDate, b.tradeDate)
      ),
    [result.transactions]
  );

  // ── Apply type filter ─────────────────────────────────────────────────────

  const typeFiltered = useMemo(() => {
    if (typeFilter === "All") return sortedTransactions;
    return sortedTransactions.filter(
      (tx) => typeCategory(tx) === typeFilter
    );
  }, [sortedTransactions, typeFilter]);

  // ── Apply search ──────────────────────────────────────────────────────────

  const searched = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return typeFiltered;
    return typeFiltered.filter(
      (tx) =>
        tx.symbol.toLowerCase().includes(q) ||
        actionLabel(tx.action).toLowerCase().includes(q)
    );
  }, [typeFiltered, searchTerm]);

  // ── Pagination ────────────────────────────────────────────────────────────

  const total = searched.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const pageStart = safePage * PAGE_SIZE; // 0-indexed
  const pageEnd = Math.min(pageStart + PAGE_SIZE, total);
  const pageRows = searched.slice(pageStart, pageEnd);

  // Human-readable range: "1–50 of 312"
  const rangeLabel =
    total === 0
      ? "0 of 0"
      : `${pageStart + 1}–${pageEnd} of ${formatNumber(total)}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 py-2">
      {/* Primary segmented control */}
      <SegmentedControl<PrimaryView>
        value={primaryView}
        options={["Closed trades", "Transactions"]}
        onChange={setPrimaryView}
      />

      {/* ── Closed trades view ──────────────────────────────────────────────── */}
      {primaryView === "Closed trades" && (
        <div className="space-y-4">
          {/* Strategy filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by strategy">
              {(["All", "Covered calls", "Cash-secured puts", "Swing"] as const).map((chip) => (
                <FilterChip
                  key={chip}
                  label={chip}
                  active={strategyFilter === chip}
                  onClick={() => setStrategyFilter(chip)}
                />
              ))}
            </div>
            <span className="ml-auto font-sans text-[12px] tabular-nums text-muted-foreground">
              {closedTradesRows.length} trade{closedTradesRows.length !== 1 ? "s" : ""}
            </span>
          </div>

          <ClosedTradesTable
            rows={closedTradesRows}
            onSelectEvent={onSelectEvent}
            empty="No closed trades match the current filter."
          />
        </div>
      )}

      {/* ── Transactions view (raw blotter, unchanged) ───────────────────────── */}
      {primaryView === "Transactions" && (
        <>
          {/* Search + type chips toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search symbol or action…"
                className="h-8 w-full rounded-md border border-hairline bg-surface pl-8 pr-3 font-sans text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/40"
                aria-label="Search trades"
              />
            </div>

            {/* Type filter chips */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              {(["All", "Options", "Stock"] as const).map((chip) => (
                <FilterChip
                  key={chip}
                  label={chip}
                  active={typeFilter === chip}
                  onClick={() => handleTypeFilter(chip)}
                />
              ))}
              <FilterChip
                label="Unresolved"
                active={typeFilter === "Unresolved"}
                onClick={() => handleTypeFilter("Unresolved")}
                badge={unresolvedCount}
              />
            </div>
          </div>

          {/* Table */}
          <div className="scrollbar-thin overflow-auto rounded-lg border border-hairline bg-surface">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Symbol</Th>
                  <Th>Action</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Net</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center font-sans text-[13px] text-muted-foreground"
                    >
                      {total === 0 && !searchTerm && typeFilter === "All"
                        ? "No transactions yet."
                        : "No transactions match the current filter."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((tx) => (
                    <TradeRow key={tx.id} tx={tx} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between gap-3 pb-1">
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">
              {rangeLabel}
            </span>
            <div className="flex gap-2">
              <PaginationButton
                label="Prev"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              />
              <PaginationButton
                label="Next"
                disabled={safePage >= pageCount - 1 || total === 0}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-b border-hairline-soft px-3 py-2.5 font-sans text-[11.5px] font-normal text-muted-foreground",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

function TradeRow({ tx }: { tx: TradeTransaction }) {
  return (
    <tr className="border-b border-hairline-soft last:border-0 transition-colors duration-[120ms] hover:bg-accent/[0.04]">
      {/* Date */}
      <td className="px-3 py-2.5 font-sans text-[12.5px] tabular-nums text-muted-foreground">
        {tx.tradeDate ?? <span className="text-muted-foreground/50">—</span>}
      </td>

      {/* Symbol */}
      <td className="px-3 py-2.5 font-sans text-[13px] font-medium text-foreground">
        {tx.symbol}
      </td>

      {/* Action */}
      <td className="px-3 py-2.5 font-sans text-[12.5px] text-foreground">
        {actionLabel(tx.action)}
      </td>

      {/* Qty */}
      <td className="px-3 py-2.5 text-right font-sans text-[12.5px] tabular-nums text-foreground">
        {tx.quantity}
      </td>

      {/* Net — signed coloured via signedMoney */}
      <td className="px-3 py-2.5 text-right font-sans text-[12.5px] tabular-nums">
        {tx.netAmount !== null && tx.netAmount !== undefined
          ? signedMoney(tx.netAmount)
          : <span className="text-muted-foreground">—</span>}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5 text-right">
        {tradeRowStatusChip(tx)}
      </td>
    </tr>
  );
}

function PaginationButton({
  label: btnLabel,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-md border border-hairline px-3 font-sans text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        disabled
          ? "cursor-not-allowed opacity-40 text-muted-foreground bg-surface"
          : "bg-surface text-foreground hover:bg-surface-inset"
      )}
    >
      {btnLabel}
    </button>
  );
}

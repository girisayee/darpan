"use client";

/**
 * WheelsTab — Phase 2 implementation.
 * Builds the wheels triage-list UI per the wheels_triage_list Aurora mockup.
 *
 * DATA GAPS (noted per spec):
 *   - "% captured" and ITM/OTM require live option mark data we do not have.
 *     These columns are intentionally OMITTED — do not fabricate.
 *   - Assigned-leg detection (for "Assigned" bucket) uses lifecycle.status === "assigned"
 *     since we have no live mark to determine "underwater" positions.
 */

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent, Strategy, TaxLot } from "@/types/trading";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DataTable, Column } from "@/components/tables/DataTable";
import { ClosedTradesTable, SegmentedControl, taxLotStatusChip } from "@/components/dashboard/tabs/shared";

// ── View types ────────────────────────────────────────────────────────────────

type WheelView = "Open" | "Closed";
type TriageBucket = "All" | "Roll / close soon" | "Working";

const OPTION_STRATEGIES: Strategy[] = [
  "COVERED_CALL",
  "COVERED_CALL_ASSIGNMENT",
  "CASH_SECURED_PUT",
  "PUT_ASSIGNMENT",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Days-to-expiry from today (ISO date string). Returns null if no expiration. */
function daysToExpiry(expirationDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Classify an open lifecycle into its triage bucket. */
function triageBucket(lc: OptionLifecycle): Exclude<TriageBucket, "All"> {
  const dte = daysToExpiry(lc.expirationDate);
  if (dte <= 7) return "Roll / close soon";
  return "Working";
}

/** Capital for display: capitalDeployed if set, else strike × sharesControlled */
function displayCapital(lc: OptionLifecycle): number {
  if (lc.capitalDeployed != null && lc.capitalDeployed > 0) return lc.capitalDeployed;
  return lc.strikePrice * lc.sharesControlled;
}

/** Stage label derived from optionType. */
function stageLabel(lc: OptionLifecycle): string {
  if (lc.optionType === "call") return "Covered call";
  return "Sold put";
}

/** Stage tone class. */
function stageToneClass(lc: OptionLifecycle): string {
  if (lc.optionType === "call") return "text-accent";
  return "text-pos";
}

// ── Triage chip (filter pill) ─────────────────────────────────────────────────

function TriageChip({
  label,
  count,
  active,
  onClick,
}: {
  label: TriageBucket;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-[12px] font-medium leading-none transition-colors duration-[120ms] select-none cursor-pointer";

  const variant = active
    ? cn(
        base,
        label === "Roll / close soon"
          ? "border-neg/40 bg-neg/10 text-neg"
          : label === "Working"
            ? "border-pos/40 bg-pos/10 text-pos"
            : "border-hairline bg-surface-inset text-foreground"
      )
    : cn(base, "border-hairline bg-surface text-muted-foreground hover:border-hairline-soft hover:text-foreground");

  return (
    <button type="button" className={variant} onClick={onClick}>
      {label}
      <span
        className={cn(
          "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
          active
            ? label === "Roll / close soon"
              ? "bg-neg/20 text-neg"
              : label === "Working"
                ? "bg-pos/20 text-pos"
                : "bg-surface-inset text-muted-foreground"
            : "bg-surface-inset text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ── Open-wheels token-styled row ──────────────────────────────────────────────

function DteCell({ dte }: { dte: number }) {
  return (
    <span
      className={cn(
        "tabular-nums font-medium",
        dte <= 7 ? "text-neg" : dte <= 14 ? "text-warn" : "text-foreground"
      )}
    >
      {dte}d
    </span>
  );
}

function ActionChip({ bucket }: { bucket: Exclude<TriageBucket, "All"> }) {
  if (bucket === "Roll / close soon") {
    return (
      <span className="inline-flex items-center rounded-full bg-neg/10 px-2 py-0.5 font-sans text-[11px] font-medium leading-none text-neg">
        Roll / close soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-surface-inset px-2 py-0.5 font-sans text-[11px] font-medium leading-none text-muted-foreground">
      Working
    </span>
  );
}

// ── Open-wheels table ─────────────────────────────────────────────────────────

function OpenWheelsTable({
  rows,
}: {
  rows: OptionLifecycle[];
}) {
  const columns: Column<OptionLifecycle>[] = [
    {
      key: "position",
      header: "Position",
      value: (row) => row.underlyingSymbol,
      render: (row) => {
        const tag = row.optionType === "call" ? "CC" : "CSP";
        const sharesNote =
          row.optionType === "call" ? ` · ${row.sharesControlled} shs` : "";
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{row.underlyingSymbol}</span>
            <span className="text-[11px] text-muted-foreground">
              {tag} ${row.strikePrice.toFixed(2)}
              {sharesNote}
            </span>
          </div>
        );
      },
    },
    {
      key: "stage",
      header: "Stage",
      value: (row) => stageLabel(row),
      render: (row) => (
        <span className={cn("text-[12px] font-medium", stageToneClass(row))}>
          {stageLabel(row)}
        </span>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      value: (row) => row.contracts,
      render: (row) => (
        <div className="flex flex-col gap-0">
          <span className="font-medium text-foreground tabular-nums">{row.contracts}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">· {row.sharesControlled} sh</span>
        </div>
      ),
      align: "right",
    },
    {
      key: "dte",
      header: "DTE",
      value: (row) => daysToExpiry(row.expirationDate),
      render: (row) => <DteCell dte={daysToExpiry(row.expirationDate)} />,
      align: "right",
    },
    {
      key: "capital",
      header: "Capital",
      value: (row) => displayCapital(row),
      render: (row) => (
        <span className="tabular-nums text-foreground">{formatCurrency(displayCapital(row))}</span>
      ),
      align: "right",
    },
    {
      key: "action",
      header: "Action",
      value: (row) => triageBucket(row),
      render: (row) => <ActionChip bucket={triageBucket(row)} />,
      align: "right",
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      empty="No open wheel positions."
    />
  );
}

// ── Tax lots section (folded) ─────────────────────────────────────────────────

function TaxLotsSection({ rows }: { rows: TaxLot[] }) {
  const [open, setOpen] = useState(false);

  const columns: Column<TaxLot>[] = [
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    { key: "openDate", header: "Open Date", value: (row) => row.openDate },
    {
      key: "source",
      header: "Source",
      value: (row) => row.source,
      render: (row) => {
        const labels: Record<string, string> = {
          STOCK_BUY: "Stock buy",
          CASH_SECURED_PUT_ASSIGNMENT: "CSP assignment",
          MANUAL_ADJUSTMENT: "Manual",
        };
        return <span className="text-muted-foreground">{labels[row.source] ?? row.source}</span>;
      },
    },
    {
      key: "remainingQuantity",
      header: "Shares",
      value: (row) => row.remainingQuantity,
      align: "right",
    },
    {
      key: "costBasisPerShare",
      header: "Cost / share",
      value: (row) => row.costBasisPerShare,
      render: (row) => formatCurrency(row.costBasisPerShare, { maximumFractionDigits: 2 }),
      align: "right",
    },
    {
      key: "costBasisTotal",
      header: "Cost basis",
      value: (row) => row.costBasisTotal,
      render: (row) => formatCurrency(row.costBasisTotal),
      align: "right",
    },
    {
      key: "status",
      header: "Status",
      value: (row) => row.status,
      render: (row) => taxLotStatusChip(row),
      align: "right",
    },
  ];

  return (
    <section className="space-y-3">
      {/* Fold header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-[10px] border border-hairline bg-surface px-4 py-3 transition-colors hover:bg-surface-inset"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="font-sans text-[13px] font-medium text-foreground">
            Assigned shares / tax lots
          </span>
          <span className="inline-flex items-center rounded-full bg-surface-inset px-2 py-0.5 font-sans text-[11px] font-medium leading-none text-muted-foreground">
            {rows.length}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Table (shown when expanded) */}
      {open && (
        <DataTable
          rows={rows}
          columns={columns}
          empty="No tax lots yet."
        />
      )}
    </section>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function WheelsTab({
  result,
  onSelectEvent,
}: {
  result: CalculationResult;
  onSelectEvent: (event: RealizedPnLEvent) => void;
}) {
  const [wheelView, setWheelView] = useState<WheelView>("Open");
  const [activeBucket, setActiveBucket] = useState<TriageBucket>("All");

  // Derive analytics via shared selector
  const analytics = wheelAnalytics(result);
  const premium = analytics.premium;

  // Open lifecycles only
  const openLifecycles = result.optionLifecycles.filter((lc) => lc.status === "open");

  // Header strip metrics
  const distinctUnderlyings = new Set(openLifecycles.map((lc) => lc.underlyingSymbol)).size;
  const capitalAtRisk = openLifecycles.reduce((sum, lc) => sum + displayCapital(lc), 0);

  // Bucket counts
  const bucketCounts: Record<Exclude<TriageBucket, "All">, number> = {
    "Roll / close soon": 0,
    Working: 0,
  };
  for (const lc of openLifecycles) {
    bucketCounts[triageBucket(lc)]++;
  }

  // Filtered rows
  const filteredRows =
    activeBucket === "All"
      ? openLifecycles
      : openLifecycles.filter((lc) => triageBucket(lc) === activeBucket);

  // Tax lots (open ones are most relevant; show all for completeness)
  const taxLots = result.taxLots;

  // Closed cycles — option strategies only (exclude SWING_TRADE + DATA_ISSUE)
  const closedCyclesRows = result.realizedEvents.filter((e) =>
    OPTION_STRATEGIES.includes(e.strategy)
  );

  return (
    <div className="space-y-6 py-2">
      {/* ── Open / Closed segmented control ─────────────────────────────────── */}
      <SegmentedControl<WheelView>
        value={wheelView}
        options={["Open", "Closed"]}
        onChange={setWheelView}
      />

      {/* ── Closed cycles view ──────────────────────────────────────────────── */}
      {wheelView === "Closed" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-[13px] font-medium text-foreground">
              Closed cycles
            </h2>
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">
              {closedCyclesRows.length} cycle{closedCyclesRows.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ClosedTradesTable
            rows={closedCyclesRows}
            onSelectEvent={onSelectEvent}
            empty="No closed option cycles yet."
          />
        </section>
      )}

      {/* ── Open positions view ─────────────────────────────────────────────── */}
      {wheelView === "Open" && (
        <>
      {/* ── Header strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <KpiCard
            label="Active wheels"
            value={String(distinctUnderlyings)}
            helper={`${openLifecycles.length} open position${openLifecycles.length !== 1 ? "s" : ""}`}
            tooltip="Distinct underlying symbols with an open option lifecycle"
            tone="neutral"
            variant="compact"
          />
        </div>
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <KpiCard
            label="Capital at risk"
            value={capitalAtRisk > 0 ? formatCurrency(capitalAtRisk) : "—"}
            helper="Sum of open position capital"
            tooltip="Total capital deployed across all open wheel positions (strike × shares for CSPs without recorded capital)"
            tone="neutral"
            variant="compact"
          />
        </div>
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <KpiCard
            label="Premium · YTD"
            value={premium.premiumCollected > 0 ? formatCurrency(premium.premiumCollected) : "—"}
            helper={
              premium.assignmentRate != null
                ? `${(premium.assignmentRate * 100).toFixed(0)}% assignment rate`
                : "No closed cycles yet"
            }
            tooltip="Total option premium collected across all cycles (YTD via active filter)"
            tone={premium.premiumCollected > 0 ? "positive" : "neutral"}
            variant="compact"
          />
        </div>
      </div>

      {/* ── Triage chips ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by triage bucket">
        <TriageChip
          label="All"
          count={openLifecycles.length}
          active={activeBucket === "All"}
          onClick={() => setActiveBucket("All")}
        />
        <TriageChip
          label="Roll / close soon"
          count={bucketCounts["Roll / close soon"]}
          active={activeBucket === "Roll / close soon"}
          onClick={() => setActiveBucket("Roll / close soon")}
        />
        <TriageChip
          label="Working"
          count={bucketCounts.Working}
          active={activeBucket === "Working"}
          onClick={() => setActiveBucket("Working")}
        />
      </div>

      {/* ── Open-wheels table ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-[13px] font-medium text-foreground">
            Open positions
          </h2>
          <span className="font-sans text-[12px] text-muted-foreground">
            {filteredRows.length} of {openLifecycles.length}
          </span>
        </div>
        {/*
          DATA GAP: "% captured" and ITM/OTM status columns require live option
          marks which are not available in the current data model. These columns
          are intentionally omitted. See spec note: "OMIT %captured/ITM — no
          live marks, do not fabricate."
        */}
        <OpenWheelsTable rows={filteredRows} />
      </section>

      {/* ── Tax lots ledger (folded) ─────────────────────────────────────────── */}
      <TaxLotsSection rows={taxLots} />
        </>
      )}
    </div>
  );
}

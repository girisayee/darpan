"use client";

/**
 * OptionsTab — renamed from WheelsTab, Phase 2+ implementation.
 * Shows open and closed option positions across all strategies (CC, CSP, long options).
 *
 * DATA GAPS (noted per spec):
 *   - "% captured" and ITM/OTM require live option mark data we do not have.
 *     These columns are intentionally OMITTED — do not fabricate.
 *   - Assigned-leg detection (for "Assigned" bucket) uses lifecycle.status === "assigned"
 *     since we have no live mark to determine "underwater" positions.
 */

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent, TradeTransaction } from "@/types/trading";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DataTable, Column } from "@/components/tables/DataTable";
import {
  ClosedCyclesTable,
  SegmentedControl,
  currentDeployedCapital,
  tone,
} from "@/components/dashboard/tabs/shared";
import { lifecycleToEvent } from "@/lib/utils/option-helpers";

// ── View types ────────────────────────────────────────────────────────────────

type OptionsView = "Open" | "Closed";
type TriageBucket = "All" | "Roll / close soon" | "Working";

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

/** Stage label derived from direction + optionType. */
function stageLabel(lc: OptionLifecycle): string {
  if (lc.direction === "long") {
    return lc.optionType === "call" ? "Long call" : "Long put";
  }
  if (lc.optionType === "call") return "Covered call";
  return "Sold put";
}

/** Stage tone class. */
function stageToneClass(lc: OptionLifecycle): string {
  if (lc.direction === "long") return "text-muted-foreground";
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

// ── Open-positions token-styled row ──────────────────────────────────────────

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

// ── Open-positions table ─────────────────────────────────────────────────────

function OpenPositionsTable({
  rows,
}: {
  rows: OptionLifecycle[];
}) {
  const todayMs = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  })();

  function daysHeld(openDate: string | undefined): number | null {
    if (!openDate) return null;
    const ms = todayMs - new Date(openDate + "T00:00:00").getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

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
      key: "openDate",
      header: "Open date",
      value: (row) => row.openDate ?? "",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.openDate ?? <span className="opacity-50">—</span>}
        </span>
      ),
    },
    {
      key: "daysHeld",
      header: "Days held",
      value: (row) => daysHeld(row.openDate) ?? -Infinity,
      render: (row) => {
        const d = daysHeld(row.openDate);
        return d != null ? (
          <span className="tabular-nums text-foreground">{d}</span>
        ) : (
          <span className="opacity-50">—</span>
        );
      },
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
      key: "premium",
      header: "Premium",
      value: (row) => row.premiumReceived,
      render: (row) => (
        <span className="tabular-nums text-pos">{formatCurrency(row.premiumReceived)}</span>
      ),
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
      empty="No open positions."
    />
  );
}

// ── Unresolved closes subsection ─────────────────────────────────────────────

/**
 * An unresolved close row derived from a DATA_ISSUE event + its source transaction.
 */
interface UnresolvedCloseRow {
  id: string;
  date: string;
  symbol: string;
  action: string;
  optionType: string | null;
  strikePrice: number | null;
  expirationDate: string | null;
  qty: number;
}

function buildUnresolvedCloseRows(result: CalculationResult): UnresolvedCloseRow[] {
  // Index transactions by id for fast lookup
  const txById = new Map<string, TradeTransaction>(
    result.transactions.map((t) => [t.id, t])
  );

  // DATA_ISSUE events come from option closing legs that had no matching opener.
  // Each has exactly one linkedTransactionId pointing to the closing transaction.
  const rows: UnresolvedCloseRow[] = [];
  for (const event of result.realizedEvents) {
    if (event.strategy !== "DATA_ISSUE") continue;
    const txId = event.linkedTransactionIds[0];
    const tx = txId ? txById.get(txId) : undefined;

    // Only include option close actions, not unrelated DATA_ISSUE events.
    const OPTION_CLOSE_ACTIONS = new Set([
      "SELL_TO_CLOSE",
      "BUY_TO_CLOSE",
      "EXPIRATION",
      "ASSIGNMENT",
    ]);
    if (tx && !OPTION_CLOSE_ACTIONS.has(tx.action)) continue;
    if (!tx && event.quantity === 0) continue; // skip non-option noise

    rows.push({
      id: event.id,
      date: event.date,
      symbol: event.symbol,
      action: tx?.action ?? "UNKNOWN",
      optionType: tx?.optionType ?? null,
      strikePrice: tx?.strikePrice ?? null,
      expirationDate: tx?.expirationDate ?? null,
      qty: Math.abs(event.quantity || tx?.quantity || 0),
    });
  }

  // Sort newest-first
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    SELL_TO_CLOSE: "STC",
    BUY_TO_CLOSE: "BTC",
    EXPIRATION: "Expiration",
    ASSIGNMENT: "Assignment",
  };
  return map[action] ?? action;
}

function UnresolvedClosesSection({
  result,
  onReviewFix,
}: {
  result: CalculationResult;
  onReviewFix?: () => void;
}) {
  const rows = buildUnresolvedCloseRows(result);
  if (rows.length === 0) return null;

  const columns: Column<UnresolvedCloseRow>[] = [
    {
      key: "date",
      header: "Date",
      value: (row) => row.date,
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{row.date}</span>
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
      key: "action",
      header: "Action",
      value: (row) => row.action,
      render: (row) => (
        <span className="text-[12px] text-muted-foreground">{actionLabel(row.action)}</span>
      ),
    },
    {
      key: "optionType",
      header: "Type",
      value: (row) => row.optionType ?? "",
      render: (row) => {
        const parts: string[] = [];
        if (row.optionType) parts.push(row.optionType.charAt(0).toUpperCase() + row.optionType.slice(1));
        if (row.strikePrice) parts.push(`$${row.strikePrice.toFixed(2)}`);
        if (row.expirationDate) parts.push(row.expirationDate);
        return (
          <span className="text-[12px] text-muted-foreground">
            {parts.length > 0 ? parts.join(" · ") : <span className="opacity-50">—</span>}
          </span>
        );
      },
    },
    {
      key: "qty",
      header: "Qty",
      value: (row) => row.qty,
      // qty can be 0 when the broker quantity cell is unparseable (e.g. CAN's "10S"
      // assignment/expiration format the importer can't read) — show "—" rather than a
      // misleading literal 0.
      render: (row) =>
        row.qty > 0 ? (
          <span className="tabular-nums text-foreground">{row.qty}</span>
        ) : (
          <span className="opacity-50">—</span>
        ),
      align: "right",
    },
    {
      key: "pnl",
      header: "Realized P/L",
      value: () => -Infinity,
      render: () => <span className="opacity-50">—</span>,
      align: "right",
    },
    {
      key: "roi",
      header: "ROI",
      value: () => -Infinity,
      render: () => <span className="opacity-50">—</span>,
      align: "right",
    },
    {
      key: "note",
      header: "Note",
      value: () => "",
      render: () => (
        <span className="text-[11px] text-warn">Opening trade not imported</span>
      ),
    },
  ];

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Unresolved closes
        </h2>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warn/15 px-1.5 font-sans text-[10px] font-medium tabular-nums text-warn">
          {rows.length}
        </span>
        {onReviewFix && (
          <button
            type="button"
            onClick={onReviewFix}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-hairline bg-surface px-2.5 font-sans text-[11.5px] font-medium text-accent transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Fix →
          </button>
        )}
      </div>
      <p className="font-sans text-[12px] text-muted-foreground">
        These closing legs could not be matched to an opening trade in the imported data.
        P&amp;L cannot be calculated until the opener is imported.
      </p>
      <DataTable
        rows={rows}
        columns={columns}
        empty="No unresolved closes."
        defaultSort={{ key: "date", direction: "desc" }}
      />
    </section>
  );
}

// ── Whole-book KPI header (4 cards, always visible) ──────────────────────────

function OptionsKpiHeader({ result }: { result: CalculationResult }) {
  // Realized P/L = Σ over CLOSED lifecycles of (netOptionPnl + (assignmentStockPnl ?? 0))
  const closedLifecycles = result.optionLifecycles.filter(
    (l) => l.status === "closed" || l.status === "expired" || l.status === "assigned"
  );
  const realizedPnl = closedLifecycles.reduce(
    (s, l) => s + l.netOptionPnl + (l.assignmentStockPnl ?? 0),
    0
  );

  // Premium collected = Σ premiumReceived over SHORT closed lifecycles
  const premiumCollected = closedLifecycles
    .filter((l) => l.direction === "short")
    .reduce((s, l) => s + l.premiumReceived, 0);

  // Win rate = % of closed cycles where net P/L > 0
  const winners = closedLifecycles.filter(
    (l) => l.netOptionPnl + (l.assignmentStockPnl ?? 0) > 0
  ).length;
  const winRate = closedLifecycles.length > 0
    ? (winners / closedLifecycles.length) * 100
    : null;

  // Capital at risk = current open short positions
  const capitalAtRisk = currentDeployedCapital(result);

  const hasClosed = closedLifecycles.length > 0;
  const realizedTone = hasClosed ? tone(realizedPnl) : "neutral";

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label="Realized P/L"
          value={hasClosed ? formatCurrency(realizedPnl) : "—"}
          helper={`${closedLifecycles.length} closed cycle${closedLifecycles.length !== 1 ? "s" : ""}`}
          tooltip="Sum of (net option P&L + assignment stock P&L) across all closed option lifecycles."
          tone={realizedTone}
          variant="compact"
        />
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label="Premium collected"
          value={premiumCollected > 0 ? formatCurrency(premiumCollected) : "—"}
          helper="Short positions only"
          tooltip="Total option premium received from sold-to-open (CC/CSP) positions."
          tone="neutral"
          variant="compact"
        />
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label="Win rate"
          value={winRate !== null ? formatPercent(winRate, 0) : "—"}
          helper={winRate !== null ? `${winners} of ${closedLifecycles.length} cycles` : "No closed cycles yet"}
          tooltip="Percentage of closed option cycles with a positive net realized P&L."
          tone="neutral"
          variant="compact"
        />
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label="Capital at risk"
          value={capitalAtRisk > 0 ? formatCurrency(capitalAtRisk) : "—"}
          helper="Open short positions"
          tooltip="Total capital deployed across all currently open short option positions (CC/CSP collateral)."
          tone="neutral"
          variant="compact"
        />
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function OptionsTab({
  result,
  onSelectEvent,
  onReviewFix,
}: {
  result: CalculationResult;
  onSelectEvent?: (event: RealizedPnLEvent) => void;
  onReviewFix?: () => void;
}) {
  const [optionsView, setOptionsView] = useState<OptionsView>("Open");
  const [activeBucket, setActiveBucket] = useState<TriageBucket>("All");

  // Derive analytics via shared selector
  const analytics = wheelAnalytics(result);
  const premium = analytics.premium;

  // Build set of manual tx ids for badge rendering
  const manualTxIds = new Set(
    result.transactions
      .filter((t) => t.importBatchId === "manual" || t.tags.includes("manual"))
      .map((t) => t.id)
  );

  // Handler for closed cycle row activation → DetailDrawer
  function handleCycleClick(lifecycle: OptionLifecycle) {
    if (!onSelectEvent) return;
    const event = lifecycleToEvent(lifecycle, result.realizedEvents);
    onSelectEvent(event);
  }

  // Open lifecycles: short direction only (CC/CSP — premium-selling positions).
  const openLifecycles = result.optionLifecycles.filter(
    (lc) => lc.status === "open" && lc.direction === "short"
  );

  const distinctUnderlyings = new Set(openLifecycles.map((lc) => lc.underlyingSymbol)).size;

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

  // Closed lifecycles (not open or unresolved)
  const closedCyclesLifecycles = result.optionLifecycles.filter(
    (l) => l.status !== "open" && l.status !== "unresolved"
  );

  return (
    <div className="space-y-6 py-2">
      {/* ── Compact KPI header — always visible, whole-book ─────────────────── */}
      <OptionsKpiHeader result={result} />

      {/* ── Open / Closed segmented control ─────────────────────────────────── */}
      <SegmentedControl<OptionsView>
        value={optionsView}
        options={["Open", "Closed"]}
        onChange={setOptionsView}
      />

      {/* ── Open positions view ─────────────────────────────────────────────── */}
      {optionsView === "Open" && (
        <>
          {/* Open positions count */}
          <div className="rounded-xl border border-hairline bg-surface p-3">
            <KpiCard
              label="Open positions"
              value={String(distinctUnderlyings)}
              helper={`${openLifecycles.length} open position${openLifecycles.length !== 1 ? "s" : ""} · ${premium.assignmentRate != null ? `${(premium.assignmentRate * 100).toFixed(0)}% assignment rate` : "No closed cycles yet"}`}
              tooltip="Distinct underlying symbols with an open option lifecycle"
              tone="neutral"
              variant="compact"
            />
          </div>

          {/* ── Triage chips ────────────────────────────────────────────────── */}
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

          {/* ── Open-positions table ─────────────────────────────────────────── */}
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
            <OpenPositionsTable rows={filteredRows} />
          </section>
        </>
      )}

      {/* ── Closed positions view ────────────────────────────────────────────── */}
      {optionsView === "Closed" && (
        <section className="space-y-6">
          {/* Closed cycles table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-[13px] font-medium text-foreground">
                Closed positions
              </h2>
              <span className="font-sans text-[12px] tabular-nums text-muted-foreground">
                {closedCyclesLifecycles.length} position{closedCyclesLifecycles.length !== 1 ? "s" : ""}
              </span>
            </div>
            <ClosedCyclesTable
              rows={closedCyclesLifecycles}
              empty="No closed option positions yet."
              onRowClick={onSelectEvent ? handleCycleClick : undefined}
              manualTxIds={manualTxIds}
            />
          </div>

          {/* Unresolved closes — orphan closing legs with no matched opener */}
          <UnresolvedClosesSection result={result} onReviewFix={onReviewFix} />
        </section>
      )}
    </div>
  );
}

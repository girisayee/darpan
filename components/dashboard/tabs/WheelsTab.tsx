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
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DataTable, Column } from "@/components/tables/DataTable";
import { ClosedCyclesTable, SegmentedControl, currentDeployedCapital } from "@/components/dashboard/tabs/shared";

// ── View types ────────────────────────────────────────────────────────────────

type WheelView = "Open" | "Closed";
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
  // Compute today once for Days held calculation
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
      empty="No open wheel positions."
    />
  );
}

// ── Returns by strategy section ───────────────────────────────────────────────

const CC_STRATEGIES: RealizedPnLEvent["strategy"][] = ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT"];
const CSP_STRATEGIES: RealizedPnLEvent["strategy"][] = ["CASH_SECURED_PUT", "PUT_ASSIGNMENT"];

interface StrategyStats {
  premiumCollected: number;
  realizedPnl: number;
  roi: number | null;
  winRate: number | null;
  count: number;
}

function strategyStats(events: RealizedPnLEvent[], strategies: RealizedPnLEvent["strategy"][]): StrategyStats {
  const filtered = events.filter((e) => strategies.includes(e.strategy));
  const count = filtered.length;
  const premiumCollected = filtered.reduce((s, e) => s + e.optionPremium, 0);
  const realizedPnl = filtered.reduce((s, e) => s + e.realizedPnl, 0);
  const capitalDeployed = filtered.reduce((s, e) => s + (e.capitalDeployed ?? 0), 0);
  const roi = capitalDeployed > 0 ? (realizedPnl / capitalDeployed) * 100 : null;
  const winners = filtered.filter((e) => e.realizedPnl > 0).length;
  const winRate = count > 0 ? (winners / count) * 100 : null;
  return { premiumCollected, realizedPnl, roi, winRate, count };
}

function ReturnsByStrategy({ result }: { result: CalculationResult }) {
  const events = result.realizedEvents.filter((e) => e.strategy !== "DATA_ISSUE");
  const cc = strategyStats(events, CC_STRATEGIES);
  const csp = strategyStats(events, CSP_STRATEGIES);

  if (cc.count === 0 && csp.count === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-sans text-[13px] font-medium text-foreground">Returns by strategy</h2>
      <div className="grid grid-cols-2 gap-3">
        {/* Covered calls */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3 space-y-2">
          <div className="font-sans text-[12px] font-semibold text-accent">Covered calls</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Premium</div>
              <div className="font-sans text-[13px] font-medium text-pos tabular-nums">
                {cc.count > 0 ? formatCurrency(cc.premiumCollected) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Realized P&L</div>
              <div className={cn("font-sans text-[13px] font-medium tabular-nums", cc.realizedPnl > 0 ? "text-pos" : cc.realizedPnl < 0 ? "text-neg" : "text-foreground")}>
                {cc.count > 0 ? formatCurrency(cc.realizedPnl) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">ROI</div>
              <div className={cn("font-sans text-[13px] font-medium tabular-nums", cc.roi !== null && cc.roi > 0 ? "text-pos" : cc.roi !== null && cc.roi < 0 ? "text-neg" : "text-foreground")}>
                {cc.roi !== null ? formatPercent(cc.roi, 1) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Win rate</div>
              <div className="font-sans text-[13px] font-medium text-foreground tabular-nums">
                {cc.winRate !== null ? formatPercent(cc.winRate, 0) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Trades</div>
              <div className="font-sans text-[13px] font-medium text-foreground tabular-nums">{cc.count}</div>
            </div>
          </div>
        </div>

        {/* Cash-secured puts */}
        <div className="rounded-[12px] border border-hairline bg-surface p-3 space-y-2">
          <div className="font-sans text-[12px] font-semibold text-pos">Cash-secured puts</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Premium</div>
              <div className="font-sans text-[13px] font-medium text-pos tabular-nums">
                {csp.count > 0 ? formatCurrency(csp.premiumCollected) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Realized P&L</div>
              <div className={cn("font-sans text-[13px] font-medium tabular-nums", csp.realizedPnl > 0 ? "text-pos" : csp.realizedPnl < 0 ? "text-neg" : "text-foreground")}>
                {csp.count > 0 ? formatCurrency(csp.realizedPnl) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">ROI</div>
              <div className={cn("font-sans text-[13px] font-medium tabular-nums", csp.roi !== null && csp.roi > 0 ? "text-pos" : csp.roi !== null && csp.roi < 0 ? "text-neg" : "text-foreground")}>
                {csp.roi !== null ? formatPercent(csp.roi, 1) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Win rate</div>
              <div className="font-sans text-[13px] font-medium text-foreground tabular-nums">
                {csp.winRate !== null ? formatPercent(csp.winRate, 0) : "—"}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wide">Trades</div>
              <div className="font-sans text-[13px] font-medium text-foreground tabular-nums">{csp.count}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Totals strip component ────────────────────────────────────────────────────

function TotalsStrip({
  premiumLabel,
  premiumValue,
  roiValue,
  roiHelper,
  roiTooltip,
  capitalLabel,
  capitalValue,
}: {
  premiumLabel: string;
  premiumValue: string;
  roiValue: string;
  roiHelper: string;
  roiTooltip: string;
  capitalLabel: string;
  capitalValue: string;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label={premiumLabel}
          value={premiumValue}
          helper="Option premium received"
          tooltip="Total option premium received across these positions."
          tone="neutral"
          variant="compact"
        />
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label="ROI"
          value={roiValue}
          helper={roiHelper}
          tooltip={roiTooltip}
          tone="neutral"
          variant="compact"
        />
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <KpiCard
          label={capitalLabel}
          value={capitalValue}
          helper={capitalLabel === "Capital at risk" ? "Open positions capital" : "Sum of deployed capital"}
          tooltip={capitalLabel === "Capital at risk" ? "Total capital deployed across all open wheel positions." : "Sum of capital deployed across closed option cycles."}
          tone="neutral"
          variant="compact"
        />
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function WheelsTab({
  result,
}: {
  result: CalculationResult;
}) {
  const [wheelView, setWheelView] = useState<WheelView>("Open");
  const [activeBucket, setActiveBucket] = useState<TriageBucket>("All");

  // Derive analytics via shared selector
  const analytics = wheelAnalytics(result);
  const premium = analytics.premium;

  // Open lifecycles: short direction only (CC/CSP — premium-selling positions).
  // Long (bought) options are not wheel positions and are excluded from this view.
  const openLifecycles = result.optionLifecycles.filter(
    (lc) => lc.status === "open" && lc.direction === "short"
  );

  // Header strip metrics (kept for triage chip context)
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

  // ── Open totals strip ─────────────────────────────────────────────────────
  const openPremiumCollected = openLifecycles.reduce((s, lc) => s + lc.premiumReceived, 0);
  const capitalAtRisk = currentDeployedCapital(result);
  const openRoi = capitalAtRisk > 0 ? (openPremiumCollected / capitalAtRisk) * 100 : null;

  // ── Closed totals strip ───────────────────────────────────────────────────
  // Only count premium from short (sold-to-open) positions; long positions have no received premium.
  const closedPremiumCollected = closedCyclesLifecycles
    .filter((l) => l.direction === "short")
    .reduce((s, l) => s + l.premiumReceived, 0);
  const closedDeployed = closedCyclesLifecycles.reduce((s, l) => s + (l.capitalDeployed ?? 0), 0);
  const closedPnl = closedCyclesLifecycles.reduce((s, l) => s + l.netOptionPnl, 0);
  const closedRoi = closedDeployed > 0 ? (closedPnl / closedDeployed) * 100 : null;

  return (
    <div className="space-y-6 py-2">
      {/* ── Open / Closed segmented control ─────────────────────────────────── */}
      <SegmentedControl<WheelView>
        value={wheelView}
        options={["Open", "Closed"]}
        onChange={setWheelView}
      />

      {/* ── Returns by strategy (CC vs CSP) — always visible ─────────────────── */}
      <ReturnsByStrategy result={result} />

      {/* ── Closed cycles view ──────────────────────────────────────────────── */}
      {wheelView === "Closed" && (
        <section className="space-y-4">
          {/* Closed totals strip */}
          <TotalsStrip
            premiumLabel="Premium collected"
            premiumValue={formatCurrency(closedPremiumCollected)}
            roiValue={closedRoi !== null ? formatPercent(closedRoi, 1) : "—"}
            roiHelper="Realized P&L / capital"
            roiTooltip="Realized P&L as a % of deployed capital."
            capitalLabel="Deployed capital"
            capitalValue={closedDeployed > 0 ? formatCurrency(closedDeployed) : "—"}
          />

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
          />
        </section>
      )}

      {/* ── Open positions view ─────────────────────────────────────────────── */}
      {wheelView === "Open" && (
        <>
          {/* Open totals strip */}
          <TotalsStrip
            premiumLabel="Premium collected"
            premiumValue={openPremiumCollected > 0 ? formatCurrency(openPremiumCollected) : "—"}
            roiValue={openRoi !== null ? formatPercent(openRoi, 1) : "—"}
            roiHelper="Premium / capital"
            roiTooltip="Option premium as a % of capital at risk."
            capitalLabel="Capital at risk"
            capitalValue={capitalAtRisk > 0 ? formatCurrency(capitalAtRisk) : "—"}
          />

          {/* Active wheels count row */}
          <div className="rounded-xl border border-hairline bg-surface p-3">
            <KpiCard
              label="Active wheels"
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

          {/* ── Open-wheels table ────────────────────────────────────────────── */}
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
        </>
      )}
    </div>
  );
}

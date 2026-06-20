"use client";

/**
 * Shared helpers for dashboard tab components.
 * Extracted from DashboardApp.tsx to allow parallel tab development.
 */

import { StatusChip } from "@/components/common/StatusChip";
import { Column, DataTable } from "@/components/tables/DataTable";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type {
  MonthlyCapitalReturn,
  OptionLifecycle,
  RealizedPnLEvent,
  TaxLot,
} from "@/types/trading";

// ── Tone helper ──────────────────────────────────────────────────────────────

export function tone(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

// ── Label helper ─────────────────────────────────────────────────────────────

export function label(value: string | null | undefined) {
  if (!value) return "N/A";
  if (value === "ALL") return "All";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ── Signed money/percent ─────────────────────────────────────────────────────

export function signedMoney(value: number) {
  return (
    <span className={cn(value > 0 && "text-pos", value < 0 && "text-neg")}>
      {formatCurrency(value)}
    </span>
  );
}

export function signedPercent(value: number | null) {
  return (
    <span
      className={cn(
        (value ?? 0) > 0 && "text-pos",
        (value ?? 0) < 0 && "text-neg"
      )}
    >
      {formatPercent(value)}
    </span>
  );
}

// ── Option capital helpers ───────────────────────────────────────────────────

export function optionCycleCapital(
  lifecycle: OptionLifecycle,
  useExposureFallback = false
) {
  const recorded = lifecycle.capitalDeployed ?? 0;
  if (!useExposureFallback || recorded > 0) return recorded;
  return lifecycle.strikePrice * lifecycle.sharesControlled;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

export function addDaysIso(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

// ── Status chip helpers ──────────────────────────────────────────────────────

export function taxLotStatusChip(row: TaxLot) {
  if (row.costBasisPerShare === 0 && row.status === "open") {
    return <StatusChip kind="zero-basis" />;
  }
  const kindMap: Record<string, "open" | "closed"> = {
    open: "open",
    closed: "closed",
    partially_closed: "closed",
  };
  return <StatusChip kind={kindMap[row.status] ?? "closed"} />;
}

// ── SegmentedControl ─────────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-surface-inset p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-md px-4 py-1.5 font-sans text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            value === opt
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── MonthlyRoiTable ──────────────────────────────────────────────────────────

export function MonthlyRoiTable({ rows }: { rows: MonthlyCapitalReturn[] }) {
  const columns: Column<MonthlyCapitalReturn>[] = [
    {
      key: "month",
      header: "Month",
      value: (row) => `${row.year}-${String(row.month).padStart(2, "0")}`,
    },
    {
      key: "realizedPnl",
      header: "Realized P&L",
      value: (row) => row.realizedPnl,
      render: (row) => signedMoney(row.realizedPnl),
      align: "right",
    },
    {
      key: "averageDeployedCapital",
      header: "Average Capital",
      value: (row) => row.averageDeployedCapital,
      render: (row) => formatCurrency(row.averageDeployedCapital),
      align: "right",
    },
    {
      key: "peakDeployedCapital",
      header: "Peak Capital",
      value: (row) => row.peakDeployedCapital,
      render: (row) => formatCurrency(row.peakDeployedCapital),
      align: "right",
    },
    {
      key: "capitalDays",
      header: "Capital Days",
      value: (row) => row.capitalDays,
      render: (row) => formatCurrency(row.capitalDays),
      align: "right",
    },
    {
      key: "realizedRoiPercent",
      header: "Monthly ROI %",
      value: (row) => row.realizedRoiPercent ?? -999,
      render: (row) => signedPercent(row.realizedRoiPercent),
      align: "right",
    },
    {
      key: "closedTradeRoiPercent",
      header: "Closed Trade ROI",
      value: (row) => row.closedTradeRoiPercent ?? -999,
      render: (row) => signedPercent(row.closedTradeRoiPercent),
      align: "right",
    },
    {
      key: "coveredCallRoiPercent",
      header: "CC ROI",
      value: (row) => row.coveredCallRoiPercent ?? -999,
      render: (row) => signedPercent(row.coveredCallRoiPercent),
      align: "right",
    },
    {
      key: "cashSecuredPutRoiPercent",
      header: "CSP ROI",
      value: (row) => row.cashSecuredPutRoiPercent ?? -999,
      render: (row) => signedPercent(row.cashSecuredPutRoiPercent),
      align: "right",
    },
    {
      key: "swingTradeRoiPercent",
      header: "Swing ROI",
      value: (row) => row.swingTradeRoiPercent ?? -999,
      render: (row) => signedPercent(row.swingTradeRoiPercent),
      align: "right",
    },
  ];
  return (
    <DataTable rows={rows} columns={columns} empty="No monthly ROI rows yet." />
  );
}

// ── TaxLotsTable ─────────────────────────────────────────────────────────────

export function TaxLotsTable({ rows }: { rows: TaxLot[] }) {
  const columns: Column<TaxLot>[] = [
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    { key: "openDate", header: "Open Date", value: (row) => row.openDate },
    {
      key: "closeDate",
      header: "Close Date",
      value: (row) => row.closeDate ?? "",
    },
    {
      key: "source",
      header: "Source",
      value: (row) => row.source,
      render: (row) => label(row.source),
    },
    {
      key: "originalQuantity",
      header: "Original Qty",
      value: (row) => row.originalQuantity,
      align: "right",
    },
    {
      key: "remainingQuantity",
      header: "Remaining",
      value: (row) => row.remainingQuantity,
      align: "right",
    },
    {
      key: "costBasisTotal",
      header: "Cost Basis",
      value: (row) => row.costBasisTotal,
      render: (row) => formatCurrency(row.costBasisTotal),
      align: "right",
    },
    {
      key: "costBasisPerShare",
      header: "Per Share",
      value: (row) => row.costBasisPerShare,
      render: (row) =>
        formatCurrency(row.costBasisPerShare, { maximumFractionDigits: 2 }),
      align: "right",
    },
    {
      key: "status",
      header: "Status",
      value: (row) => row.status,
      render: (row) => taxLotStatusChip(row),
      align: "right",
    },
    { key: "notes", header: "Notes", value: (row) => row.notes ?? "" },
  ];
  return (
    <section className="space-y-2">
      <h2 className="font-sans text-[13px] font-medium text-foreground">
        Tax Lots
      </h2>
      <DataTable rows={rows} columns={columns} empty="No tax lots yet." />
    </section>
  );
}

// ── ClosedTradesTable ─────────────────────────────────────────────────────────

/**
 * Null-safe descending date comparator.
 * Null/empty dates sort last.
 */
export function compareDateDesc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const aVal = a ?? "";
  const bVal = b ?? "";
  if (!aVal && !bVal) return 0;
  if (!aVal) return 1;
  if (!bVal) return -1;
  return bVal.localeCompare(aVal);
}

export function ClosedTradesTable({
  rows,
  onSelectEvent,
  empty = "No closed trades yet.",
}: {
  rows: RealizedPnLEvent[];
  onSelectEvent: (e: RealizedPnLEvent) => void;
  empty?: string;
}) {
  // Filter DATA_ISSUE; DataTable handles sort via defaultSort below
  const filtered = rows.filter((r) => r.strategy !== "DATA_ISSUE");

  const columns: Column<RealizedPnLEvent>[] = [
    {
      key: "date",
      header: "Date",
      value: (row) => row.date ?? "",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.date ?? <span className="opacity-50">—</span>}
        </span>
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
      key: "strategy",
      header: "Strategy",
      value: (row) => row.strategy,
      render: (row) => (
        <span className="text-foreground">{label(row.strategy)}</span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      value: (row) => row.quantity,
      align: "right",
    },
    {
      key: "optionPremium",
      header: "Premium",
      value: (row) => row.optionPremium,
      render: (row) => signedMoney(row.optionPremium),
      align: "right",
    },
    {
      key: "realizedPnl",
      header: "Realized P&L",
      value: (row) => row.realizedPnl,
      render: (row) => signedMoney(row.realizedPnl),
      align: "right",
    },
    {
      key: "roiPercent",
      header: "ROI %",
      value: (row) => row.roiPercent ?? -Infinity,
      render: (row) => signedPercent(row.roiPercent),
      align: "right",
    },
    {
      key: "annualizedRoiPercent",
      header: "Annualized",
      value: (row) => row.annualizedRoiPercent ?? -Infinity,
      render: (row) => signedPercent(row.annualizedRoiPercent),
      align: "right",
    },
  ];

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      onRowClick={onSelectEvent}
      empty={empty}
      defaultSort={{ key: "date", direction: "desc" }}
    />
  );
}

// ── formatNumber re-export (convenience) ────────────────────────────────────

export { formatCurrency, formatNumber, formatPercent };

"use client";

/**
 * Shared helpers for dashboard tab components.
 * Extracted from DashboardApp.tsx to allow parallel tab development.
 */

import { Column, DataTable } from "@/components/tables/DataTable";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type {
  CalculationResult,
  MonthlyCapitalReturn,
  OptionLifecycle,
  RealizedPnLEvent,
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

/**
 * Sum of capital deployed across all currently-open option lifecycles.
 * Uses capitalDeployed if recorded; falls back to strikePrice × sharesControlled.
 */
export function currentDeployedCapital(result: CalculationResult): number {
  return result.optionLifecycles
    .filter((l) => l.status === "open")
    .reduce(
      (sum, l) => sum + (l.capitalDeployed ?? l.strikePrice * l.sharesControlled),
      0
    );
}

// ── Date helpers ─────────────────────────────────────────────────────────────

export function addDaysIso(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
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
      render: (row) => {
        // Option strategies: quantity is sharesControlled; derive contracts (1 contract = 100 shares)
        const OPTION_STRATEGIES = [
          "COVERED_CALL",
          "CASH_SECURED_PUT",
          "COVERED_CALL_ASSIGNMENT",
          "PUT_ASSIGNMENT",
        ];
        if (OPTION_STRATEGIES.includes(row.strategy)) {
          const shares = row.quantity;
          const contracts = Math.round(shares / 100);
          return (
            <div className="flex flex-col gap-0 text-right">
              <span className="font-medium tabular-nums text-foreground">{contracts}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">· {shares} sh</span>
            </div>
          );
        }
        // SWING_TRADE / other: quantity is share count
        return (
          <span className="tabular-nums text-foreground">{row.quantity}</span>
        );
      },
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

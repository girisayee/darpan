"use client";

/**
 * Shared helpers for dashboard tab components.
 * Extracted from DashboardApp.tsx to allow parallel tab development.
 */

import { Column, DataTable } from "@/components/tables/DataTable";
import { StatusChip } from "@/components/common/StatusChip";
import { TickerLogo } from "@/components/common/TickerLogo";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatMaskedCurrency, MASKED_AMOUNT, formatDisplayDate, formatNumber, formatPercent } from "@/lib/utils/format";
import type {
  CalculationResult,
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

export function signedMoney(value: number, masked = false) {
  if (masked) return <span className="tabular-nums text-muted-foreground">{MASKED_AMOUNT}</span>;
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
    .filter((l) => l.status === "open" && l.direction === "short")
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
            "rounded-md px-4 py-1.5 font-sans text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
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
  maskAmounts = false,
}: {
  rows: RealizedPnLEvent[];
  onSelectEvent: (e: RealizedPnLEvent) => void;
  empty?: string;
  maskAmounts?: boolean;
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
          {row.date ? formatDisplayDate(row.date) : <span className="opacity-50">—</span>}
        </span>
      ),
    },
    {
      key: "symbol",
      header: "Symbol",
      value: (row) => row.symbol,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <TickerLogo symbol={row.symbol} size={20} />
          <span className="font-medium text-foreground">{row.symbol}</span>
        </span>
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
              <span className="text-caption tabular-nums text-muted-foreground">· {shares} sh</span>
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
      render: (row) => signedMoney(row.optionPremium, maskAmounts),
      align: "right",
      tooltip: "Net option premium received to open (credit), or paid for a long option.",
    },
    {
      key: "realizedPnl",
      header: "Realized P&L",
      value: (row) => row.realizedPnl,
      render: (row) => signedMoney(row.realizedPnl, maskAmounts),
      align: "right",
      tooltip: "Sale proceeds − cost basis − fees.",
    },
    {
      key: "holdingDays",
      header: "Days held",
      value: (row) => row.holdingDays ?? -Infinity,
      tooltip: "Calendar days from open to close/expiration.",
      render: (row) =>
        row.holdingDays != null ? (
          <span className="tabular-nums text-foreground">{row.holdingDays}</span>
        ) : (
          <span className="opacity-50">—</span>
        ),
      align: "right",
    },
    {
      key: "roiPercent",
      header: "RoC",
      value: (row) => row.roiPercent ?? -Infinity,
      render: (row) => signedPercent(row.roiPercent),
      align: "right",
      tooltip: "Realized P&L ÷ capital deployed (cost basis).",
    },
  ];

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      onRowClick={onSelectEvent}
      empty={empty}
      defaultSort={{ key: "date", direction: "desc" }}
      searchable
      pageSize={25}
    />
  );
}

// ── Option type label ────────────────────────────────────────────────────────

/**
 * Returns a human-readable type label for an OptionLifecycle row.
 * "Sold Put" | "Covered Call" | "Bought Call" | "Bought Put"
 */
export function optionTypeLabel(row: OptionLifecycle): string {
  if (row.direction === "long") {
    return row.optionType === "call" ? "Bought Call" : "Bought Put";
  }
  // Short direction: distinguish by strategy
  if (row.strategy === "COVERED_CALL") return "Covered Call";
  if (row.strategy === "CASH_SECURED_PUT") return "Sold Put";
  // Fallback: infer from optionType
  return row.optionType === "call" ? "Covered Call" : "Sold Put";
}

/** Tone class for an option type label — shared by open and closed option tables. */
export function optionTypeToneClass(row: Pick<OptionLifecycle, "direction" | "optionType">): string {
  if (row.direction === "long") return "text-muted-foreground"; // bought call/put
  if (row.optionType === "call") return "text-accent"; // covered call
  return "text-pos"; // sold put
}

/**
 * Shared option-type tag: identical label + coloring + style across the open-positions
 * and closed-cycles tables (covered call = accent, sold put = pos, long = muted).
 */
export function OptionTypeTag({ row }: { row: OptionLifecycle }) {
  return (
    <span className={cn("font-sans text-body font-medium", optionTypeToneClass(row))}>
      {optionTypeLabel(row)}
    </span>
  );
}

// ── ClosedCyclesTable ─────────────────────────────────────────────────────────

/**
 * Lifecycle-based closed-cycles table for the Options tab.
 * Displays one row per OptionLifecycle (closed/expired/assigned), newest-first.
 * Includes both short (sold-to-open) and long (bought-to-open) closed positions.
 * Rows are clickable when onRowClick is provided — opens the DetailDrawer.
 *
 * Column order: Date · Type · Symbol · Qty · Days held · Outcome · Premium · Shares P/L · Realized P/L · Capital · ROI
 */
export function ClosedCyclesTable({
  rows,
  empty = "No closed option cycles yet.",
  onRowClick,
  manualTxIds,
  maskAmounts = false,
}: {
  rows: OptionLifecycle[];
  empty?: string;
  /** Called when a closed row is activated (click / Enter / Space). */
  onRowClick?: (lifecycle: OptionLifecycle) => void;
  /** Set of manual transaction ids (tags includes 'manual') — used to show badge. */
  manualTxIds?: Set<string>;
  maskAmounts?: boolean;
}) {
  const columns: Column<OptionLifecycle>[] = [
    // 1. Date (close date) — first column, default sort target
    {
      key: "closeDate",
      header: "Date",
      value: (row) => (row.closeDate ?? row.expirationDate) ?? "",
      render: (row) => {
        const date = row.closeDate ?? row.expirationDate;
        return (
          <span className="tabular-nums text-muted-foreground">
            {date ? formatDisplayDate(date) : <span className="opacity-50">—</span>}
          </span>
        );
      },
    },
    // 2. Type
    {
      key: "type",
      header: "Type",
      value: (row) => optionTypeLabel(row),
      render: (row) => <OptionTypeTag row={row} />,
      tooltip: "Position type — covered call, cash-secured put, or long call/put.",
    },
    // 3. Symbol (+ manual badge when lifecycle includes a manual tx)
    {
      key: "symbol",
      header: "Symbol",
      value: (row) => row.underlyingSymbol,
      render: (row) => {
        const isManual = manualTxIds != null &&
          row.linkedTransactionIds.some((id) => manualTxIds.has(id));
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <TickerLogo symbol={row.underlyingSymbol} size={20} />
              <span className="font-bold text-foreground">{row.underlyingSymbol}</span>
              {isManual && (
                <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.5 font-sans text-micro font-medium leading-none text-accent">
                  manual
                </span>
              )}
            </div>
            <span className="text-caption text-muted-foreground">
              ${row.strikePrice.toFixed(2)}
            </span>
          </div>
        );
      },
    },
    // 4. Qty
    {
      key: "qty",
      header: "Qty",
      value: (row) => row.contracts,
      render: (row) => (
        <div className="flex flex-col gap-0">
          <span className="font-medium tabular-nums text-foreground">{row.contracts}</span>
          <span className="text-caption tabular-nums text-muted-foreground">· {row.sharesControlled} sh</span>
        </div>
      ),
      align: "right",
    },
    // 5. Days held
    {
      key: "daysHeld",
      header: "Days held",
      tooltip: "Calendar days from open to close/expiration.",
      value: (row) => {
        if (!row.openDate) return -Infinity;
        const end = row.closeDate ?? row.expirationDate;
        const ms = new Date(end + "T00:00:00").getTime() - new Date(row.openDate + "T00:00:00").getTime();
        return Math.round(ms / (1000 * 60 * 60 * 24));
      },
      render: (row) => {
        if (!row.openDate) return <span className="opacity-50">—</span>;
        const end = row.closeDate ?? row.expirationDate;
        const ms = new Date(end + "T00:00:00").getTime() - new Date(row.openDate + "T00:00:00").getTime();
        const days = Math.round(ms / (1000 * 60 * 60 * 24));
        return <span className="tabular-nums text-foreground">{days}</span>;
      },
      align: "right",
    },
    // 6. Outcome
    {
      key: "status",
      header: "Outcome",
      value: (row) => row.status,
      render: (row) => (
        <StatusChip kind={row.status as "closed" | "expired" | "assigned"} />
      ),
      tooltip: "How it ended: expired, closed (bought/sold back), or assigned.",
    },
    // 7. Premium (the option premium received/paid to open)
    {
      key: "premiumReceived",
      header: "Premium",
      tooltip: "Net option premium received to open (credit), or paid for a long option.",
      value: (row) => row.premiumReceived,
      render: (row) => {
        if (maskAmounts) return <span className="tabular-nums text-muted-foreground">{MASKED_AMOUNT}</span>;
        if (row.direction === "long") {
          // Show the debit paid to open (negative cost).
          // For STC-closed longs: open cost is in closeCost (swapped by engine).
          // For expired longs: open cost is still in premiumReceived.
          const openCost = row.status === "closed" ? row.closeCost : row.premiumReceived;
          return (
            <span className="tabular-nums text-neg">({formatCurrency(openCost)})</span>
          );
        }
        return (
          <span className="tabular-nums text-pos">{formatCurrency(row.premiumReceived)}</span>
        );
      },
      align: "right",
    },
    // 8. Shares P/L (assignment stock gain/loss component)
    {
      key: "assignmentStockPnl",
      header: "Shares P/L",
      tooltip: "Gain/loss on shares called away in a covered-call assignment (strike proceeds − share cost basis); — if not assigned.",
      value: (row) => row.assignmentStockPnl ?? -Infinity,
      render: (row) => {
        if (row.assignmentStockPnl == null) {
          return <span className="opacity-50">—</span>;
        }
        return signedMoney(row.assignmentStockPnl, maskAmounts);
      },
      align: "right",
    },
    // 9. Realized P/L = netOptionPnl + (assignmentStockPnl ?? 0) — the NET total
    {
      key: "realizedPnl",
      header: "Realized P/L",
      tooltip: "Net of option premium + any assignment share P&L.",
      value: (row) => row.netOptionPnl + (row.assignmentStockPnl ?? 0),
      render: (row) => {
        const net = row.netOptionPnl + (row.assignmentStockPnl ?? 0);
        return signedMoney(net, maskAmounts);
      },
      align: "right",
    },
    // 10. Capital — purchase price (long debit paid) or deployed capital
    //     (short CC stock basis / CSP collateral). Same field the ROI column
    //     divides by, so ROI = Realized P/L ÷ Capital reconciles in-row.
    {
      key: "capitalDeployed",
      header: "Capital",
      tooltip: "Capital deployed — CSP collateral, covered-call underlying basis, or long-option debit.",
      value: (row) => row.capitalDeployed ?? -Infinity,
      render: (row) => {
        const cap = row.capitalDeployed ?? 0;
        if (cap <= 0) return <span className="opacity-50">—</span>;
        return (
          <span className="tabular-nums text-foreground">{formatMaskedCurrency(cap, maskAmounts)}</span>
        );
      },
      align: "right",
    },
    // 11. ROI — net realized P/L ÷ capitalDeployed
    {
      key: "roi",
      header: "RoC",
      tooltip: "Realized P/L ÷ capital deployed.",
      value: (row) => {
        const cap = row.capitalDeployed ?? 0;
        const net = row.netOptionPnl + (row.assignmentStockPnl ?? 0);
        return cap > 0 ? (net / cap) * 100 : -Infinity;
      },
      render: (row) => {
        const cap = row.capitalDeployed ?? 0;
        if (cap <= 0) return <span className="opacity-50">—</span>;
        const net = row.netOptionPnl + (row.assignmentStockPnl ?? 0);
        return signedPercent((net / cap) * 100);
      },
      align: "right",
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      empty={empty}
      onRowClick={onRowClick}
      defaultSort={{ key: "closeDate", direction: "desc" }}
      searchable
      pageSize={25}
    />
  );
}

// ── formatNumber re-export (convenience) ────────────────────────────────────

export { formatCurrency, formatNumber, formatPercent };

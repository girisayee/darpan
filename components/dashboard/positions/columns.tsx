import type { Column } from "@/components/tables/DataTable";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatMaskedCurrency, formatDisplayDate, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export interface PositionRow {
  sym: string;
  detail: string;
  status: "active" | "closed";
  tag: string;
  warm: boolean;
  when: string;
  pnl: number;
  premium?: number;
  capital?: number;
  cost?: number;
  qty?: string;
  costBasis?: string;
  openDate?: string;
  closeDate?: string;
  expirationDate?: string;
  dte?: number;
  daysHeld?: number;
  roc?: number;
  strategyLabel?: string;
  lifecycle?: OptionLifecycle;
  event?: RealizedPnLEvent;
}

const DAY_MS = 1000 * 60 * 60 * 24;

const position = (): Column<PositionRow> => ({
  key: "position",
  header: "Position",
  value: (r) => r.sym,
  render: (r) => (
    <span className="flex items-center gap-2">
      <TickerLogo symbol={r.sym} size={20} />
      <span>
        <span className="flex items-center gap-1.5 text-strong font-medium text-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${r.status === "active" ? "bg-accent" : "bg-dim"}`}
          />
          {r.sym}
        </span>
        <span className="block text-body text-muted-foreground">{r.detail}</span>
      </span>
    </span>
  ),
});

const stage = (): Column<PositionRow> => ({
  key: "stage",
  header: "Stage",
  value: (r) => r.tag,
  render: (r) => (
    <span className={r.warm ? "text-warn" : "text-muted-foreground"}>{r.tag}</span>
  ),
});

const opened = (): Column<PositionRow> => ({
  key: "openDate",
  header: "Opened",
  align: "right",
  value: (r) => r.openDate ?? "",
  render: (r) =>
    r.openDate ? (
      <span className="tabular-nums text-muted-foreground">{formatDisplayDate(r.openDate)}</span>
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const closed = (): Column<PositionRow> => ({
  key: "closeDate",
  header: "Closed",
  align: "right",
  value: (r) => r.closeDate ?? "",
  render: (r) =>
    r.closeDate ? (
      <span className="tabular-nums text-muted-foreground">{formatDisplayDate(r.closeDate)}</span>
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const daysHeld = (): Column<PositionRow> => ({
  key: "daysHeld",
  header: "Days",
  align: "right",
  value: (r) => r.daysHeld ?? null,
  render: (r) =>
    r.daysHeld != null ? (
      <span className="tabular-nums text-muted-foreground">{r.daysHeld}d</span>
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const expiry = (): Column<PositionRow> => ({
  key: "expirationDate",
  header: "Expiry",
  align: "right",
  value: (r) => r.expirationDate ?? "",
  render: (r) =>
    r.expirationDate ? (
      <span className="tabular-nums text-muted-foreground">{formatDisplayDate(r.expirationDate)}</span>
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const dte = (): Column<PositionRow> => ({
  key: "dte",
  header: "DTE",
  align: "right",
  value: (r) => r.dte ?? null,
  render: (r) =>
    r.dte != null ? (
      <span className={cn("tabular-nums", r.dte <= 7 ? "text-warn" : "text-muted-foreground")}>
        {r.dte}d
      </span>
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const roc = (): Column<PositionRow> => ({
  key: "roc",
  header: "RoC",
  align: "right",
  value: (r) => r.roc ?? null,
  render: (r) =>
    r.roc != null ? (
      <span
        className={cn(
          "tabular-nums",
          r.roc > 0 ? "text-pos" : r.roc < 0 ? "text-neg" : "text-muted-foreground"
        )}
      >
        {formatPercent(r.roc, 1)}
      </span>
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const pnl = (maskAmounts = false): Column<PositionRow> => ({
  key: "pnl",
  header: "P&L",
  align: "right",
  value: (r) => r.pnl,
  render: (r) => signedMoney(r.pnl, maskAmounts),
});

const money = (key: keyof PositionRow, header: string, maskAmounts = false): Column<PositionRow> => ({
  key,
  header,
  align: "right",
  value: (r) => (r[key] as number | undefined) ?? null,
  render: (r) =>
    r[key] != null ? (
      formatMaskedCurrency(r[key] as number, maskAmounts)
    ) : (
      <span className="opacity-50">—</span>
    ),
});

const text = (key: keyof PositionRow, header: string): Column<PositionRow> => ({
  key,
  header,
  align: "right",
  value: (r) => (r[key] as string | undefined) ?? "",
});

export function allColumns(maskAmounts = false, state: "all" | "active" | "closed" = "all"): Column<PositionRow>[] {
  return [
    position(),
    {
      key: "strategyLabel",
      header: "Strategy",
      value: (r) => r.strategyLabel ?? "",
      render: (r) => (
        <span className="text-caption text-muted-foreground">{r.strategyLabel ?? "—"}</span>
      ),
    },
    stage(),
    opened(),
    ...(state === "active" ? [expiry(), dte()] : []),
    closed(),
    ...(state === "closed" ? [daysHeld(), roc()] : []),
    ...(state === "active" ? [] : [pnl(maskAmounts)]),
  ];
}

export function toAllPositionRows(
  result: CalculationResult,
  state: "all" | "active" | "closed"
): PositionRow[] {
  const labels: Record<StrategyKey, string> = {
    csp: "Cash-secured puts",
    cc: "Covered calls",
    long: "Long options",
    swing: "Stock trades",
  };
  // Option plays only — swing positions are reached via the Swing strategy tile.
  return (["csp", "cc", "long"] as StrategyKey[]).flatMap((k) =>
    toPositionRows(result, k, state).map((row) => ({
      ...row,
      strategyLabel: labels[k],
    }))
  );
}

export function columnsFor(
  key: StrategyKey,
  maskAmounts = false,
  state: "all" | "active" | "closed" = "all"
): Column<PositionRow>[] {
  const closedCols = state === "closed" ? [daysHeld(), roc()] : [];
  const activeCols = state === "active" ? [expiry(), dte()] : [];
  const pnlCol = state === "active" ? [] : [pnl(maskAmounts)];
  if (key === "csp" || key === "cc")
    return [
      position(),
      stage(),
      money("premium", "Premium", maskAmounts),
      money("capital", "Capital", maskAmounts),
      opened(),
      ...activeCols,
      closed(),
      ...closedCols,
      ...pnlCol,
    ];
  if (key === "long")
    return [position(), stage(), money("cost", "Cost", maskAmounts), opened(), ...activeCols, closed(), ...closedCols, ...pnlCol];
  return [
    position(),
    stage(),
    text("qty", "Qty"),
    text("costBasis", "Cost basis"),
    opened(),
    closed(),
    ...closedCols,
    ...pnlCol,
  ];
}

export function toPositionRows(
  result: CalculationResult,
  key: StrategyKey,
  state: "all" | "active" | "closed",
  showSwingOpen = false
): PositionRow[] {
  const today = new Date();

  if (key === "csp" || key === "cc") {
    const stratEnum = key === "csp" ? "CASH_SECURED_PUT" : "COVERED_CALL";
    return result.optionLifecycles
      .filter((lc) => {
        if (lc.strategy !== stratEnum) return false;
        if (state === "active") return lc.status === "open";
        if (state === "closed")
          return lc.status === "expired" || lc.status === "closed" || lc.status === "assigned";
        return lc.status !== "unresolved";
      })
      .map((lc): PositionRow => {
        const isActive = lc.status === "open";
        const detail = `$${lc.strikePrice.toFixed(0)} ${lc.optionType}`;

        if (isActive) {
          const expMs = new Date(lc.expirationDate + "T00:00:00").getTime();
          const daysToExpiry = Math.round((expMs - today.getTime()) / DAY_MS);
          const tag = daysToExpiry <= 7 ? "Roll soon" : "Working";
          return {
            sym: lc.underlyingSymbol,
            detail,
            status: "active",
            tag,
            warm: tag === "Roll soon",
            when: `${daysToExpiry} DTE`,
            pnl: lc.netOptionPnl,
            premium: lc.premiumReceived,
            capital: lc.capitalDeployed ?? undefined,
            openDate: lc.openDate,
            expirationDate: lc.expirationDate,
            dte: daysToExpiry,
            lifecycle: lc,
          };
        }

        // closed/expired/assigned
        const endDate = lc.closeDate ?? lc.expirationDate;
        const daysHeld = Math.round(
          (new Date(endDate + "T00:00:00").getTime() -
            new Date(lc.openDate + "T00:00:00").getTime()) /
            DAY_MS
        );
        const statusStr = lc.status;
        const tag = statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
        // Put-assignment premium is deferred into the assigned shares' basis;
        // it becomes realized only when those shares close.
        const deferredPutAssignment = lc.status === "assigned" && lc.optionType === "put";
        const closedPnl = deferredPutAssignment ? 0 : lc.netOptionPnl + (lc.assignmentStockPnl ?? 0);
        const capital = lc.capitalDeployed ?? undefined;
        return {
          sym: lc.underlyingSymbol,
          detail,
          status: "closed",
          tag,
          warm: lc.status === "assigned",
          when: `${daysHeld}d`,
          pnl: closedPnl,
          premium: lc.premiumReceived,
          capital,
          openDate: lc.openDate,
          closeDate: endDate,
          daysHeld,
          roc: !deferredPutAssignment && capital && capital > 0 ? (closedPnl / capital) * 100 : undefined,
          lifecycle: lc,
        };
      });
  }

  if (key === "long") {
    return result.optionLifecycles
      .filter((lc) => {
        if (lc.direction !== "long") return false;
        if (state === "active") return lc.status === "open";
        if (state === "closed")
          return lc.status === "expired" || lc.status === "closed" || lc.status === "assigned";
        return lc.status !== "unresolved";
      })
      .map((lc): PositionRow => {
        const isActive = lc.status === "open";
        const detail = `$${lc.strikePrice.toFixed(0)} ${lc.optionType}`;

        if (isActive) {
          const expMs = new Date(lc.expirationDate + "T00:00:00").getTime();
          const daysToExpiry = Math.round((expMs - today.getTime()) / DAY_MS);
          const tag = daysToExpiry <= 7 ? "Roll soon" : "Working";
          return {
            sym: lc.underlyingSymbol,
            detail,
            status: "active",
            tag,
            warm: tag === "Roll soon",
            when: `${daysToExpiry} DTE`,
            pnl: lc.netOptionPnl,
            cost: lc.premiumReceived,
            openDate: lc.openDate,
            expirationDate: lc.expirationDate,
            dte: daysToExpiry,
            lifecycle: lc,
          };
        }

        const endDate = lc.closeDate ?? lc.expirationDate;
        const daysHeld = Math.round(
          (new Date(endDate + "T00:00:00").getTime() -
            new Date(lc.openDate + "T00:00:00").getTime()) /
            DAY_MS
        );
        const statusStr = lc.status;
        const tag = statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
        const closedPnl = lc.netOptionPnl + (lc.assignmentStockPnl ?? 0);
        const cost = lc.premiumReceived;
        return {
          sym: lc.underlyingSymbol,
          detail,
          status: "closed",
          tag,
          warm: false,
          when: `${daysHeld}d`,
          pnl: closedPnl,
          cost,
          openDate: lc.openDate,
          closeDate: endDate,
          daysHeld,
          roc: cost && cost > 0 ? (closedPnl / cost) * 100 : undefined,
          lifecycle: lc,
        };
      });
  }

  // key === "swing"
  // Open swing lots (held stock) are shown only when the user opts in; they have
  // no realized P&L yet (the app doesn't track live quotes), so P&L reads $0.
  const openSwingRows: PositionRow[] =
    showSwingOpen && state !== "closed"
      ? result.taxLots
          .filter((l) => l.status !== "closed" && l.remainingQuantity > 0)
          .map((l): PositionRow => {
            const daysHeld = Math.round(
              (today.getTime() - new Date(l.openDate + "T00:00:00").getTime()) / DAY_MS
            );
            return {
              sym: l.symbol,
              detail: `${l.remainingQuantity} sh`,
              status: "active",
              tag: "Holding",
              warm: false,
              when: `${daysHeld}d`,
              pnl: 0,
              qty: `${l.remainingQuantity} sh`,
              costBasis: `$${l.costBasisPerShare.toFixed(2)}`,
              openDate: l.openDate,
            };
          })
      : [];

  // Closed swing positions come from realized events (open lots aren't realized yet).
  const closedSwingRows: PositionRow[] =
    state === "active"
      ? []
      : result.realizedEvents
          .filter((e) => e.strategy === "SWING_TRADE")
    .map((e): PositionRow => {
      let openDate: string | undefined;
      if (e.holdingDays != null) {
        const d = new Date(e.date + "T00:00:00");
        d.setDate(d.getDate() - e.holdingDays);
        openDate = d.toISOString().slice(0, 10);
      }
      return {
        sym: e.symbol,
        detail: `${e.quantity} sh`,
        status: "closed",
        tag: "Closed",
        warm: false,
        when: e.holdingDays != null ? `${e.holdingDays}d` : "—",
        pnl: e.realizedPnl,
        qty: `${e.quantity} sh`,
        costBasis:
          e.costBasis != null ? `$${(e.costBasis / e.quantity).toFixed(2)}` : "—",
        openDate,
        closeDate: e.date,
        daysHeld: e.holdingDays ?? undefined,
        roc:
          e.costBasis != null && e.costBasis > 0
            ? (e.realizedPnl / e.costBasis) * 100
            : undefined,
        event: e,
      };
    });

  return [...openSwingRows, ...closedSwingRows];
}

import type { Column } from "@/components/tables/DataTable";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatCurrency, formatDisplayDate } from "@/lib/utils/format";

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
        <span className="block text-caption text-muted-foreground">{r.detail}</span>
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

const pnl = (): Column<PositionRow> => ({
  key: "pnl",
  header: "P&L",
  align: "right",
  value: (r) => r.pnl,
  render: (r) => signedMoney(r.pnl),
});

const money = (key: keyof PositionRow, header: string): Column<PositionRow> => ({
  key,
  header,
  align: "right",
  value: (r) => (r[key] as number | undefined) ?? null,
  render: (r) =>
    r[key] != null ? (
      formatCurrency(r[key] as number)
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

export const allColumns: Column<PositionRow>[] = [
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
  closed(),
  pnl(),
];

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

export function columnsFor(key: StrategyKey): Column<PositionRow>[] {
  if (key === "csp" || key === "cc")
    return [
      position(),
      stage(),
      money("premium", "Premium"),
      money("capital", "Capital"),
      opened(),
      closed(),
      pnl(),
    ];
  if (key === "long")
    return [position(), stage(), money("cost", "Cost"), opened(), closed(), pnl()];
  return [
    position(),
    stage(),
    text("qty", "Qty"),
    text("costBasis", "Cost basis"),
    opened(),
    closed(),
    pnl(),
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
        return {
          sym: lc.underlyingSymbol,
          detail,
          status: "closed",
          tag,
          warm: lc.status === "assigned",
          when: `${daysHeld}d`,
          pnl: lc.netOptionPnl + (lc.assignmentStockPnl ?? 0),
          premium: lc.premiumReceived,
          capital: lc.capitalDeployed ?? undefined,
          openDate: lc.openDate,
          closeDate: endDate,
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
        return {
          sym: lc.underlyingSymbol,
          detail,
          status: "closed",
          tag,
          warm: false,
          when: `${daysHeld}d`,
          pnl: lc.netOptionPnl + (lc.assignmentStockPnl ?? 0),
          cost: lc.premiumReceived,
          openDate: lc.openDate,
          closeDate: endDate,
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
        event: e,
      };
    });

  return [...openSwingRows, ...closedSwingRows];
}

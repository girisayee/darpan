import type { Column } from "@/components/tables/DataTable";
import type { CalculationResult } from "@/types/trading";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatCurrency } from "@/lib/utils/format";

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
        <span className="flex items-center gap-1.5 text-[11.5px] text-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${r.status === "active" ? "bg-accent" : "bg-dim"}`}
          />
          {r.sym}
        </span>
        <span className="block text-[9.5px] text-muted-foreground">{r.detail}</span>
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

const when = (): Column<PositionRow> => ({
  key: "when",
  header: "When",
  align: "right",
  value: (r) => r.when,
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

export function columnsFor(key: StrategyKey): Column<PositionRow>[] {
  if (key === "csp" || key === "cc")
    return [
      position(),
      stage(),
      money("premium", "Premium"),
      money("capital", "Capital"),
      when(),
      pnl(),
    ];
  if (key === "long") return [position(), stage(), money("cost", "Cost"), when(), pnl()];
  return [position(), stage(), text("qty", "Qty"), text("costBasis", "Cost basis"), when(), pnl()];
}

export function toPositionRows(
  result: CalculationResult,
  key: StrategyKey,
  state: "all" | "active" | "closed"
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
        };
      });
  }

  // key === "swing"
  const activeRows: PositionRow[] =
    state === "closed"
      ? []
      : result.taxLots
          .filter((lot) => lot.status !== "closed")
          .map(
            (lot): PositionRow => ({
              sym: lot.symbol,
              detail: `${lot.remainingQuantity} sh`,
              status: "active",
              tag: "Working",
              warm: false,
              when: "—",
              pnl: 0,
              qty: `${lot.remainingQuantity} sh`,
              costBasis: `$${lot.costBasisPerShare.toFixed(2)}`,
            })
          );

  const closedRows: PositionRow[] =
    state === "active"
      ? []
      : result.realizedEvents
          .filter((e) => e.strategy === "SWING_TRADE")
          .map(
            (e): PositionRow => ({
              sym: e.symbol,
              detail: `${e.quantity} sh`,
              status: "closed",
              tag: "Closed",
              warm: false,
              when: e.holdingDays != null ? `${e.holdingDays}d` : "—",
              pnl: e.realizedPnl,
              qty: `${e.quantity} sh`,
              costBasis:
                e.costBasis != null
                  ? `$${(e.costBasis / e.quantity).toFixed(2)}`
                  : "—",
            })
          );

  return [...activeRows, ...closedRows];
}

"use client";
import type { CalculationResult } from "@/types/trading";
import { optionsAnalytics, strategyAnalytics, STRATEGY_EVENT_ENUMS, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";

/** Where a Home tile navigates: the aggregate Options tab, or the Stock-trades tab. */
export type StrategyTarget = StrategyKey | "options";

function roiFor(result: CalculationResult, enums: string[]): number | null {
  const rows = result.aggregates.strategyBreakdown.filter((b) => enums.includes(b.strategy));
  const capital = rows.reduce((s, b) => s + b.capital, 0);
  const pnl = rows.reduce((s, b) => s + b.pnl, 0);
  return capital > 0 ? (pnl / capital) * 100 : null;
}

function Tile({
  name,
  pnl,
  roi,
  winRate,
  hint,
  onClick,
}: {
  name: string;
  pnl: number;
  roi: number | null;
  winRate: number | null;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[12px] border border-hairline bg-surface p-4 text-left hover:border-accent"
    >
      <div className="text-[13px] font-medium text-foreground">{name}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums">{signedMoney(pnl)}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">
        ROI {formatPercent(roi)} · {winRate != null ? `${Math.round(winRate * 100)}%` : "—"} win
      </div>
      <div className="mt-1.5 text-[10.5px] text-dim">{hint}</div>
    </button>
  );
}

const OPTION_ENUMS = [
  ...STRATEGY_EVENT_ENUMS.csp,
  ...STRATEGY_EVENT_ENUMS.cc,
  ...STRATEGY_EVENT_ENUMS.long,
];

export function StrategyStrip({
  result,
  onOpen,
}: {
  result: CalculationResult;
  onOpen: (target: StrategyTarget) => void;
}) {
  const options = optionsAnalytics(result);
  const swing = strategyAnalytics(result, "swing");
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <Tile
        name="Options"
        pnl={options.pnl}
        roi={roiFor(result, OPTION_ENUMS)}
        winRate={options.quality.winRate}
        hint="CSP · Covered calls · Long"
        onClick={() => onOpen("options")}
      />
      <Tile
        name="Stock trades"
        pnl={swing.pnl}
        roi={roiFor(result, STRATEGY_EVENT_ENUMS.swing)}
        winRate={swing.quality.winRate}
        hint={`${swing.quality.totalTrades} trade${swing.quality.totalTrades === 1 ? "" : "s"}`}
        onClick={() => onOpen("swing")}
      />
    </div>
  );
}

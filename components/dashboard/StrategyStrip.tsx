"use client";
import type { CalculationResult } from "@/types/trading";
import { optionsAnalytics, strategyAnalytics, STRATEGY_EVENT_ENUMS, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { strategyReturnOnCapital } from "@/lib/selectors/return-on-capital";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";

/** Where a Home tile navigates: the aggregate Options tab, or the Stock-trades tab. */
export type StrategyTarget = StrategyKey | "options";

const OPTION_ENUMS = [
  ...STRATEGY_EVENT_ENUMS.csp,
  ...STRATEGY_EVENT_ENUMS.cc,
  ...STRATEGY_EVENT_ENUMS.long,
];

function Tile({
  name,
  pnl,
  roc,
  winRate,
  hint,
  onClick,
  maskAmounts = false,
}: {
  name: string;
  pnl: number;
  roc: number | null;
  winRate: number | null;
  hint: string;
  onClick: () => void;
  maskAmounts?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[12px] border border-hairline bg-surface p-4 text-left hover:border-accent"
    >
      <div className="text-caption text-muted-foreground">{name}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums leading-none">{signedMoney(pnl, maskAmounts)}</div>
      <div className="mt-1.5 text-strong font-medium text-foreground">{hint}</div>
      <div className="mt-0.5 text-caption text-dim">
        {roc != null ? formatPercent(roc) : "—"} Realized RoC · {winRate != null ? `${Math.round(winRate * 100)}%` : "—"} win
      </div>
    </button>
  );
}

export function StrategyStrip({
  result,
  onOpen,
  maskAmounts = false,
}: {
  result: CalculationResult;
  onOpen: (target: StrategyTarget) => void;
  maskAmounts?: boolean;
}) {
  const options = optionsAnalytics(result);
  const swing = strategyAnalytics(result, "swing");
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <Tile
        name="Options"
        pnl={options.pnl}
        roc={strategyReturnOnCapital(result.capitalUsage, OPTION_ENUMS, options.pnl).roc}
        winRate={options.quality.winRate}
        hint="CSP · Covered calls · Long"
        onClick={() => onOpen("options")}
        maskAmounts={maskAmounts}
      />
      <Tile
        name="Stock trades"
        pnl={swing.pnl}
        roc={strategyReturnOnCapital(result.capitalUsage, STRATEGY_EVENT_ENUMS.swing, swing.pnl).roc}
        winRate={swing.quality.winRate}
        hint={`${swing.quality.totalTrades} trade${swing.quality.totalTrades === 1 ? "" : "s"}`}
        onClick={() => onOpen("swing")}
        maskAmounts={maskAmounts}
      />
    </div>
  );
}

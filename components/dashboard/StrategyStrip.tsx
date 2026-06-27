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

const OPTION_SUBS: { key: StrategyKey; label: string }[] = [
  { key: "csp", label: "Cash-secured puts" },
  { key: "cc", label: "Covered calls" },
  { key: "long", label: "Long options" },
];

function rocClass(roc: number | null) {
  if (roc == null) return "text-muted-foreground";
  return roc > 0 ? "text-pos" : roc < 0 ? "text-neg" : "text-muted-foreground";
}

/** Options tile: aggregate header (opens the Options tab) + a per-strategy breakdown. */
function OptionsTile({
  result,
  asOf,
  onOpen,
}: {
  result: CalculationResult;
  asOf: string;
  onOpen: (target: StrategyTarget) => void;
}) {
  const a = optionsAnalytics(result);
  const roc = strategyReturnOnCapital(result.capitalUsage, OPTION_ENUMS, a.pnl, asOf).roc;
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-4">
      <button type="button" onClick={() => onOpen("options")} className="block w-full text-left">
        <div className="text-strong font-medium text-foreground">Options</div>
        <div className="mt-1 text-[24px] font-semibold tabular-nums">{signedMoney(a.pnl)}</div>
        <div className="mt-0.5 text-body text-muted-foreground">
          ROC {formatPercent(roc)} · {a.quality.winRate != null ? `${Math.round(a.quality.winRate * 100)}%` : "—"} win
        </div>
      </button>
      <div className="mt-2.5 border-t border-hairline pt-2">
        {OPTION_SUBS.map((s) => {
          const sa = strategyAnalytics(result, s.key);
          const sroc = strategyReturnOnCapital(result.capitalUsage, STRATEGY_EVENT_ENUMS[s.key], sa.pnl, asOf).roc;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onOpen(s.key)}
              className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-surface-inset"
            >
              <span className="text-caption text-muted-foreground">{s.label}</span>
              <span className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-caption">{signedMoney(sa.pnl)}</span>
                <span className={`text-micro ${rocClass(sroc)}`}>{formatPercent(sroc)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Stock-trades tile: a single clickable summary. */
function StockTile({
  result,
  asOf,
  onOpen,
}: {
  result: CalculationResult;
  asOf: string;
  onOpen: (target: StrategyTarget) => void;
}) {
  const a = strategyAnalytics(result, "swing");
  const roc = strategyReturnOnCapital(result.capitalUsage, STRATEGY_EVENT_ENUMS.swing, a.pnl, asOf).roc;
  return (
    <button
      type="button"
      onClick={() => onOpen("swing")}
      className="rounded-[12px] border border-hairline bg-surface p-4 text-left hover:border-accent"
    >
      <div className="text-strong font-medium text-foreground">Stock trades</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums">{signedMoney(a.pnl)}</div>
      <div className="mt-0.5 text-body text-muted-foreground">
        ROC {formatPercent(roc)} · {a.quality.winRate != null ? `${Math.round(a.quality.winRate * 100)}%` : "—"} win
      </div>
      <div className="mt-1.5 text-micro text-dim">
        {a.quality.totalTrades} trade{a.quality.totalTrades === 1 ? "" : "s"}
      </div>
    </button>
  );
}

export function StrategyStrip({
  result,
  onOpen,
}: {
  result: CalculationResult;
  onOpen: (target: StrategyTarget) => void;
}) {
  const asOf = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <OptionsTile result={result} asOf={asOf} onOpen={onOpen} />
      <StockTile result={result} asOf={asOf} onOpen={onOpen} />
    </div>
  );
}

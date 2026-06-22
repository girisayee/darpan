"use client";
import type { CalculationResult } from "@/types/trading";
import { strategyAnalytics, STRATEGY_EVENT_ENUMS, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";

const LABELS: Record<StrategyKey, string> = { csp: "Cash-secured puts", cc: "Covered calls", long: "Long options", swing: "Swing" };

function strategyRoi(result: CalculationResult, key: StrategyKey): number | null {
  const enums = STRATEGY_EVENT_ENUMS[key];
  const rows = result.aggregates.strategyBreakdown.filter((b) => enums.includes(b.strategy));
  const capital = rows.reduce((s, b) => s + b.capital, 0);
  const pnl = rows.reduce((s, b) => s + b.pnl, 0);
  return capital > 0 ? (pnl / capital) * 100 : null;
}

export function StrategyStrip({ result, onOpen }: { result: CalculationResult; onOpen: (k: StrategyKey) => void }) {
  const keys: StrategyKey[] = ["csp", "cc", "long", "swing"];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {keys.map((k) => {
        const a = strategyAnalytics(result, k);
        const roi = strategyRoi(result, k);
        return (
          <button key={k} type="button" onClick={() => onOpen(k)}
            className="rounded-[10px] border border-hairline bg-surface p-3 text-left hover:border-accent">
            <div className="text-[12.5px] font-medium text-muted-foreground">{LABELS[k]}</div>
            <div className="mt-0.5 text-[19px] font-medium tabular-nums">{signedMoney(a.pnl)}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">ROI {formatPercent(roi)} · {a.quality.winRate != null ? `${Math.round(a.quality.winRate * 100)}%` : "—"} win</div>
          </button>
        );
      })}
    </div>
  );
}

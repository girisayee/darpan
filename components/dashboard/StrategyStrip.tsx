"use client";
import type { CalculationResult } from "@/types/trading";
import { strategyAnalytics, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";

const LABELS: Record<StrategyKey, string> = { csp: "Cash-secured puts", cc: "Covered calls", long: "Long options", swing: "Swing" };

export function StrategyStrip({ result, onOpen }: { result: CalculationResult; onOpen: (k: StrategyKey) => void }) {
  const keys: StrategyKey[] = ["csp", "cc", "long", "swing"];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {keys.map((k) => {
        const a = strategyAnalytics(result, k);
        const roi = result.aggregates.strategyBreakdown.find((b) => b.pnl === a.pnl)?.roiPercent ?? null;
        return (
          <button key={k} type="button" onClick={() => onOpen(k)}
            className="rounded-[10px] border border-hairline bg-surface p-3 text-left hover:border-accent">
            <div className="text-[10.5px] text-muted-foreground">{LABELS[k]}</div>
            <div className="text-[16px] font-medium tabular-nums">{signedMoney(a.pnl)}</div>
            <div className="text-[9.5px] text-dim">ROI {formatPercent(roi)} · {a.quality.winRate != null ? `${Math.round(a.quality.winRate * 100)}%` : "—"} win</div>
          </button>
        );
      })}
    </div>
  );
}

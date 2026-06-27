"use client";
import type { CalculationResult } from "@/types/trading";
import { strategyAnalytics, STRATEGY_EVENT_ENUMS, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";

const LABELS: Record<StrategyKey, string> = {
  csp: "Cash-secured puts",
  cc: "Covered calls",
  long: "Long options",
  swing: "Stock trades",
};

function strategyRoi(result: CalculationResult, key: StrategyKey): number | null {
  const enums = STRATEGY_EVENT_ENUMS[key];
  const rows = result.aggregates.strategyBreakdown.filter((b) => enums.includes(b.strategy));
  const capital = rows.reduce((s, b) => s + b.capital, 0);
  const pnl = rows.reduce((s, b) => s + b.pnl, 0);
  return capital > 0 ? (pnl / capital) * 100 : null;
}

function StrategyTile({
  result,
  k,
  onOpen,
}: {
  result: CalculationResult;
  k: StrategyKey;
  onOpen: (k: StrategyKey) => void;
}) {
  const a = strategyAnalytics(result, k);
  const roi = strategyRoi(result, k);
  return (
    <button
      type="button"
      onClick={() => onOpen(k)}
      className="rounded-[10px] border border-hairline bg-surface p-3 text-left hover:border-accent"
    >
      <div className="text-[12.5px] font-medium text-muted-foreground">{LABELS[k]}</div>
      <div className="mt-0.5 text-[19px] font-medium tabular-nums">{signedMoney(a.pnl)}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">
        ROI {formatPercent(roi)} · {a.quality.winRate != null ? `${Math.round(a.quality.winRate * 100)}%` : "—"} win
      </div>
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function StrategyStrip({ result, onOpen }: { result: CalculationResult; onOpen: (k: StrategyKey) => void }) {
  return (
    <div className="space-y-3">
      <Group label="Options">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {(["csp", "cc", "long"] as StrategyKey[]).map((k) => (
            <StrategyTile key={k} result={result} k={k} onOpen={onOpen} />
          ))}
        </div>
      </Group>
      <Group label="Stock trades">
        <div className="grid grid-cols-1 gap-2.5">
          <StrategyTile result={result} k="swing" onOpen={onOpen} />
        </div>
      </Group>
    </div>
  );
}

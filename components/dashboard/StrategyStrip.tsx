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

/** Running cumulative realized P&L (oldest → newest) for the given strategy enums. */
function cumulativeSeries(result: CalculationResult, enums: string[]): number[] {
  const events = result.realizedEvents
    .filter((e) => enums.includes(e.strategy))
    .slice()
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  let sum = 0;
  return events.map((e) => (sum += e.realizedPnl));
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <div className="h-7" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "rgb(var(--pos))" : "rgb(var(--neg))"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Tile({
  name,
  pnl,
  roi,
  winRate,
  hint,
  series,
  onClick,
}: {
  name: string;
  pnl: number;
  roi: number | null;
  winRate: number | null;
  hint: string;
  series: number[];
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
        ROC {formatPercent(roi)} · {winRate != null ? `${Math.round(winRate * 100)}%` : "—"} win
      </div>
      <Sparkline values={series} positive={pnl >= 0} />
      <div className="text-[10.5px] text-dim">{hint}</div>
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
        series={cumulativeSeries(result, OPTION_ENUMS)}
        onClick={() => onOpen("options")}
      />
      <Tile
        name="Stock trades"
        pnl={swing.pnl}
        roi={roiFor(result, STRATEGY_EVENT_ENUMS.swing)}
        winRate={swing.quality.winRate}
        hint={`${swing.quality.totalTrades} trade${swing.quality.totalTrades === 1 ? "" : "s"}`}
        series={cumulativeSeries(result, STRATEGY_EVENT_ENUMS.swing)}
        onClick={() => onOpen("swing")}
      />
    </div>
  );
}

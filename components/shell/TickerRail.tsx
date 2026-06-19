"use client";

import { formatNumber } from "@/lib/utils/format";

interface Mover {
  symbol: string;
  pnl: number;
}

interface TickerRailProps {
  movers: Mover[];
}

function formatSignedPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "−";
  return `${sign}${formatNumber(Math.abs(pnl))}`;
}

export function TickerRail({ movers }: TickerRailProps) {
  if (movers.length === 0) return null;

  return (
    <div
      aria-label="Top movers by realized P&L"
      className="flex overflow-x-auto motion-reduce:overflow-x-auto whitespace-nowrap select-none"
      style={{ scrollbarWidth: "none" }}
    >
      {/* motion-safe: animate the marquee; motion-reduce: static strip */}
      <ul
        className={[
          "flex items-center gap-4 px-3 py-1",
          "motion-safe:animate-ticker-rail",
        ].join(" ")}
        role="list"
      >
        {movers.map(({ symbol, pnl }) => (
          <li key={symbol} className="flex items-center gap-1.5 shrink-0">
            <span className="font-sans text-xs text-muted-foreground uppercase tracking-wide">
              {symbol}
            </span>
            <span
              className={[
                "font-mono tabular-nums text-xs",
                pnl >= 0 ? "text-pos" : "text-neg",
              ].join(" ")}
            >
              {formatSignedPnl(pnl)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

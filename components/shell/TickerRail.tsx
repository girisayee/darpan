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

function MoverList({
  movers,
  ariaHidden,
}: {
  movers: Mover[];
  ariaHidden?: boolean;
}) {
  return (
    <ul
      className="flex items-center gap-4 px-3 py-1 shrink-0"
      role="list"
      aria-hidden={ariaHidden || undefined}
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
  );
}

export function TickerRail({ movers }: TickerRailProps) {
  if (movers.length === 0) return null;

  return (
    <div
      aria-label="Top movers by realized P&L"
      className="flex overflow-x-auto whitespace-nowrap select-none"
      style={{ scrollbarWidth: "none" }}
    >
      {/*
       * motion-safe: render two copies and animate translateX(-50%) for a
       * seamless loop. motion-reduce: single static strip, no animation.
       */}
      <div className="motion-safe:flex motion-safe:animate-ticker-rail motion-reduce:hidden">
        <MoverList movers={movers} />
        {/* Duplicate for seamless wrap-around */}
        <MoverList movers={movers} ariaHidden />
      </div>
      {/* Static strip shown only under reduced-motion */}
      <div className="motion-safe:hidden motion-reduce:flex">
        <MoverList movers={movers} />
      </div>
    </div>
  );
}

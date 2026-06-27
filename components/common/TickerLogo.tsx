"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/** Deterministic, readable initials color for the monogram fallback (on a white tile). */
function monogramColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) h = (h * 31 + symbol.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 38%)`;
}

/**
 * Ticker logo rendered as a rounded-square tile with a fail-soft initials fallback.
 * Tries a keyless logo CDN; on any load error (missing / small / foreign tickers, or
 * CDN unavailable) it shows the same-shaped tile with colored initials instead — so
 * logos and fallbacks share one consistent app-icon look without a network guarantee.
 */
export function TickerLogo({
  symbol,
  size = 20,
  className,
}: {
  symbol: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const sym = (symbol ?? "").trim().toUpperCase();
  const radius = Math.max(4, Math.round(size * 0.22));
  const pad = Math.max(1, Math.round(size * 0.14));

  if (!sym) {
    return (
      <span
        className={cn("inline-flex shrink-0 border border-hairline bg-surface-inset", className)}
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden="true"
      />
    );
  }

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center border border-black/10 bg-white font-sans font-semibold leading-none",
          className
        )}
        style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.4, color: monogramColor(sym) }}
        aria-hidden="true"
        title={sym}
      >
        {sym.slice(0, 2)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white",
        className
      )}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external logo CDN with onError fallback; next/image isn't suitable for arbitrary unverified remote hosts */}
      <img
        src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(sym)}?format=png&size=64`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
        style={{ padding: pad }}
      />
    </span>
  );
}

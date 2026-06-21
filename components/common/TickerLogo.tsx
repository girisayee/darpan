"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/** Deterministic, pleasant background hue for a symbol's monogram fallback. */
function monogramColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) h = (h * 31 + symbol.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 42%)`;
}

/**
 * Ticker logo with a fail-soft monogram fallback. Tries a keyless logo CDN; on any
 * load error (missing / small / foreign tickers, or CDN unavailable) it shows a colored
 * initials badge instead — so it always renders something clean without a network guarantee.
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

  if (!sym) {
    return (
      <span
        className={cn("inline-flex shrink-0 rounded-full bg-surface-inset", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  if (failed) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-sans font-semibold leading-none text-white", className)}
        style={{ width: size, height: size, fontSize: size * 0.42, background: monogramColor(sym) }}
        aria-hidden="true"
        title={sym}
      >
        {sym.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external logo CDN with onError fallback; next/image isn't suitable for arbitrary unverified remote hosts
    <img
      src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(sym)}?format=png&size=64`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-white object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

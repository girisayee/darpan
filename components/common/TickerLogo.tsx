"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Ticker logo rendered directly on the surface (no tile/background). Tries a keyless
 * logo CDN; on any load error (missing / small / foreign tickers, or CDN unavailable)
 * it falls back to muted initials in the same footprint — so it always renders something
 * clean without a network guarantee.
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
        className={cn("inline-block shrink-0", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-sans font-semibold leading-none text-muted-foreground",
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
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
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-[4px] object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

"use client";

/**
 * BenchmarkComparison — capital-matched SPY/QQQ vs your realized return.
 *
 * Props: result: CalculationResult
 *
 * Derives the window from result.aggregates.monthlyRealizedPnl
 * (first month → today). Fetches /api/benchmark once per session
 * (keyed in sessionStorage). Fail-soft: never fabricated numbers.
 */

import { useEffect, useState } from "react";
import { benchmarkStartISO, capitalMatchedReturn } from "@/lib/benchmark/compare";
import type { ClosePoint } from "@/lib/benchmark/fetch";
import type { CalculationResult } from "@/types/trading";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type BenchmarkData = { spy: ClosePoint[]; qqq: ClosePoint[]; vti: ClosePoint[] };
type FetchStatus = "loading" | "success" | "error";

type TileProps = {
  label: string;
  returnPct: number | null;
  dollarPnl: number | null;
  unavailable?: boolean;
};

function Tile({ label, returnPct, dollarPnl, unavailable }: TileProps) {
  const pos = returnPct !== null && returnPct > 0;
  const neg = returnPct !== null && returnPct < 0;

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="font-sans text-[11px] text-muted-foreground">{label}</span>
      {unavailable || returnPct === null ? (
        <span className="font-sans text-[16px] font-medium text-muted-foreground">—</span>
      ) : (
        <>
          <span
            className={cn(
              "font-sans text-[16px] font-medium tabular-nums",
              pos && "text-pos",
              neg && "text-neg",
              !pos && !neg && "text-foreground"
            )}
          >
            {formatPercent(returnPct, 2)}
          </span>
          {dollarPnl !== null && (
            <span
              className={cn(
                "font-sans text-[12px] tabular-nums",
                dollarPnl > 0 && "text-pos",
                dollarPnl < 0 && "text-neg",
                dollarPnl === 0 && "text-muted-foreground"
              )}
            >
              {formatCurrency(dollarPnl)}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonTile() {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="h-3 w-16 rounded bg-surface-inset animate-pulse" />
      <div className="h-5 w-20 rounded bg-surface-inset animate-pulse" />
      <div className="h-3 w-16 rounded bg-surface-inset animate-pulse" />
    </div>
  );
}

function readCache(key: string | null): BenchmarkData | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as BenchmarkData;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: BenchmarkData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore storage quota / availability errors
  }
}

function deleteCache(key: string | null): void {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function BenchmarkComparison({ result }: { result: CalculationResult }) {
  // Derive window: earliest month → today. Build the start date from numeric
  // year/month (result.monthlyReturns), NOT the formatted aggregates label —
  // see benchmarkStartISO for the prior "Jan 25-01" bug this avoids.
  const fromISO: string | null = benchmarkStartISO(result.monthlyReturns);
  const toISO = new Date().toISOString().slice(0, 10);
  // "v2" invalidates older SPY/QQQ-only cache entries that lack vti.
  const cacheKey = fromISO ? `benchmark|v2|${fromISO}|${toISO}` : null;

  // Lazy state init: seed from sessionStorage on first render to avoid a
  // loading flash when the data is already cached. This runs only once.
  const [status, setStatus] = useState<FetchStatus>(() => {
    if (!cacheKey) return "loading";
    const cached = readCache(cacheKey);
    return cached ? "success" : "loading";
  });

  const [data, setData] = useState<BenchmarkData | null>(() => {
    if (!cacheKey) return null;
    return readCache(cacheKey);
  });

  // retryCount increments trigger re-fetches
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!fromISO || !cacheKey) return;
    // If we already have success data (from cache seed), skip the fetch
    if (status === "success" && data !== null) return;

    let cancelled = false;

    fetch(`/api/benchmark?from=${fromISO}&to=${toISO}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("non-ok");
        return r.json() as Promise<BenchmarkData>;
      })
      .then((d) => {
        if (cancelled) return;
        writeCache(cacheKey, d);
        setData(d);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // retryCount is intentionally included so Retry re-runs the fetch.
    // status and data are excluded: we only want to fetch when NOT already cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromISO, toISO, cacheKey, retryCount]);

  function retry() {
    deleteCache(cacheKey);
    setData(null);
    setStatus("loading");
    setRetryCount((c) => c + 1);
  }

  // No monthly data at all → render nothing
  if (!fromISO) return null;

  const avgDeployed = result.aggregates.averageDeployedCapital;
  const totalPnl = result.aggregates.totalRealizedPnl;

  // Your return % = totalRealizedPnl ÷ averageDeployedCapital × 100
  const yourReturnPct =
    avgDeployed > 0 ? (totalPnl / avgDeployed) * 100 : null;

  const spyResult =
    data && data.spy.length >= 2
      ? capitalMatchedReturn(data.spy, avgDeployed)
      : null;

  const qqqResult =
    data && data.qqq.length >= 2
      ? capitalMatchedReturn(data.qqq, avgDeployed)
      : null;

  const vtiResult =
    data && data.vti && data.vti.length >= 2
      ? capitalMatchedReturn(data.vti, avgDeployed)
      : null;

  const spyUnavailable = status === "success" && (!data || data.spy.length < 2);
  const qqqUnavailable = status === "success" && (!data || data.qqq.length < 2);
  const vtiUnavailable = status === "success" && (!data || !data.vti || data.vti.length < 2);

  return (
    <div className="rounded-[14px] border border-hairline bg-surface px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Vs. buy &amp; hold (SPY / VTI / QQQ)
        </h2>
        <span className="font-sans text-[11px] text-muted-foreground">
          {fromISO} → {toISO}
        </span>
      </div>

      {/* Helper: deployed capital basis */}
      <p className="font-sans text-[11px] text-muted-foreground">
        On your avg deployed capital{" "}
        {avgDeployed > 0 ? (
          <span className="font-medium text-foreground">{formatCurrency(avgDeployed)}</span>
        ) : (
          "—"
        )}
      </p>

      {/* Error state */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="font-sans text-[13px] text-muted-foreground">
            Benchmark unavailable — couldn&apos;t reach market data
          </span>
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-hairline bg-surface-inset px-4 py-1.5 font-sans text-[12px] font-medium text-foreground transition hover:bg-surface active:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {status === "loading" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </div>
      )}

      {/* Success state */}
      {status === "success" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile
            label="Your return"
            returnPct={yourReturnPct}
            dollarPnl={totalPnl}
          />
          <Tile
            label="SPY (matched)"
            returnPct={spyResult?.returnPct ?? null}
            dollarPnl={spyResult?.dollarPnl ?? null}
            unavailable={spyUnavailable}
          />
          <Tile
            label="VTI (matched)"
            returnPct={vtiResult?.returnPct ?? null}
            dollarPnl={vtiResult?.dollarPnl ?? null}
            unavailable={vtiUnavailable}
          />
          <Tile
            label="QQQ (matched)"
            returnPct={qqqResult?.returnPct ?? null}
            dollarPnl={qqqResult?.dollarPnl ?? null}
            unavailable={qqqUnavailable}
          />
        </div>
      )}
    </div>
  );
}

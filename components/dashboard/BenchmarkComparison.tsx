"use client";

/**
 * BenchmarkComparison — index calendar-YTD (SPY / VTI / QQQ) vs your realized return.
 *
 * Props: result: CalculationResult
 *
 * The index tiles show each index's calendar year-to-date return (prior
 * year-end close → latest close) for the year in view. Fetches /api/benchmark
 * once per session (keyed in sessionStorage). Fail-soft: never fabricated numbers.
 */

import { useEffect, useState } from "react";
import { ytdReturn } from "@/lib/benchmark/compare";
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
  // The year in view drives YTD: each index's calendar return is measured from
  // its year-open close (first close on/after Jan 1) to the latest close.
  const months = result.monthlyReturns;
  const benchYear = months.length ? months[months.length - 1].year : null;
  const fromISO = benchYear ? `${benchYear}-01-01` : null;
  const toISO = new Date().toISOString().slice(0, 10);
  // "v5" invalidates older cache entries (prior-December baseline windows, plus
  // SPY/QQQ-only or empty results a prior broken data source cached as success).
  const cacheKey = fromISO ? `benchmark|v5|${fromISO}|${toISO}` : null;

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
        // If every series came back empty, treat it as a failure rather than
        // caching a permanent "—" for the session.
        const hasAny =
          (d.spy?.length ?? 0) > 0 || (d.qqq?.length ?? 0) > 0 || (d.vti?.length ?? 0) > 0;
        if (!hasAny) {
          setStatus("error");
          return;
        }
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
  if (!fromISO || benchYear === null) return null;

  const avgDeployed = result.aggregates.averageDeployedCapital;
  const totalPnl = result.aggregates.totalRealizedPnl;

  // Your return % = totalRealizedPnl ÷ averageDeployedCapital × 100
  const yourReturnPct =
    avgDeployed > 0 ? (totalPnl / avgDeployed) * 100 : null;

  // Dollar figure for an index tile: what the year-to-date index return would
  // have earned on your average deployed capital (apples-to-apples with the $
  // shown on "Your return"). Null when no capital was deployed.
  const dollarsOn = (pct: number | undefined) =>
    pct != null && avgDeployed > 0 ? avgDeployed * (pct / 100) : null;

  const spyResult = data && data.spy.length >= 2 ? ytdReturn(data.spy, benchYear) : null;
  const qqqResult = data && data.qqq.length >= 2 ? ytdReturn(data.qqq, benchYear) : null;
  const vtiResult = data && data.vti && data.vti.length >= 2 ? ytdReturn(data.vti, benchYear) : null;

  const spyUnavailable = status === "success" && !spyResult;
  const qqqUnavailable = status === "success" && !qqqResult;
  const vtiUnavailable = status === "success" && !vtiResult;

  return (
    <div className="rounded-[14px] border border-hairline bg-surface px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Vs. index YTD (SPY / VTI / QQQ)
        </h2>
        <span className="font-sans text-[11px] text-muted-foreground">YTD {benchYear}</span>
      </div>

      {/* Helper: deployed capital basis */}
      <p className="font-sans text-[11px] text-muted-foreground">
        Index $ shown on your avg deployed capital{" "}
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
            label="SPY YTD"
            returnPct={spyResult?.returnPct ?? null}
            dollarPnl={dollarsOn(spyResult?.returnPct)}
            unavailable={spyUnavailable}
          />
          <Tile
            label="VTI YTD"
            returnPct={vtiResult?.returnPct ?? null}
            dollarPnl={dollarsOn(vtiResult?.returnPct)}
            unavailable={vtiUnavailable}
          />
          <Tile
            label="QQQ YTD"
            returnPct={qqqResult?.returnPct ?? null}
            dollarPnl={dollarsOn(qqqResult?.returnPct)}
            unavailable={qqqUnavailable}
          />
        </div>
      )}
    </div>
  );
}

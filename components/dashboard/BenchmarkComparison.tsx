"use client";

/**
 * BenchmarkComparison — "Market comparison": index calendar-YTD (SPY / VTI / QQQ)
 * vs your realized return, shown as a single set of data bars — each row carries
 * its own inline bar plus the exact % and $ (chart and figures combined).
 *
 * Props: result: CalculationResult
 *
 * Each row shows that index's calendar year-to-date return (year-open close →
 * latest close) for the year in view. Fetches /api/benchmark once per session
 * (keyed in sessionStorage). Fail-soft: never fabricated numbers.
 */

import { useEffect, useState } from "react";
import { ytdReturn } from "@/lib/benchmark/compare";
import type { ClosePoint } from "@/lib/benchmark/fetch";
import type { CalculationResult } from "@/types/trading";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type BenchmarkData = { spy: ClosePoint[]; qqq: ClosePoint[]; vti: ClosePoint[] };
type FetchStatus = "loading" | "success" | "error";

const C_POS = "rgb(var(--pos))";
const C_NEG = "rgb(var(--neg))";
const C_MUTED = "rgb(var(--text-muted))";

type RowSpec = {
  label: string;
  /** What the ticker tracks, shown under the label (e.g. "S&P 500"). */
  sub?: string;
  pct: number | null;
  dollarPnl: number | null;
  emphasis?: boolean;
  unavailable?: boolean;
};

/** One data-bar row: label · inline bar · exact % and $. */
function DataBarRow({
  row,
  maxAbs,
  hasNeg,
}: {
  row: RowSpec;
  maxAbs: number;
  hasNeg: boolean;
}) {
  const { label, pct, dollarPnl, emphasis } = row;
  const value = row.unavailable || pct === null ? null : pct;
  const pos = value !== null && value > 0;
  const neg = value !== null && value < 0;

  // Bar geometry. When any return is negative we anchor a zero line at the
  // track centre (positive → right, negative → left); otherwise bars fill
  // from the left edge so the common all-positive case uses the full width.
  let barLeft = "0%";
  let barWidth = "0%";
  if (value !== null) {
    if (hasNeg) {
      const half = (Math.abs(value) / maxAbs) * 50;
      barWidth = `${half}%`;
      barLeft = value >= 0 ? "50%" : `${50 - half}%`;
    } else {
      barWidth = `${(value / maxAbs) * 100}%`;
    }
  }
  const fill = emphasis ? (value !== null && value < 0 ? C_NEG : C_POS) : C_MUTED;

  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_84px] items-center gap-3 py-1.5">
      <span className="font-sans leading-tight">
        {row.sub && <span className={cn("block text-body", emphasis ? "font-medium text-foreground" : "text-foreground")}>{row.sub}</span>}
        <span className="block text-micro text-muted-foreground">{label}</span>
      </span>

      <div className="relative h-3.5 rounded bg-surface-inset">
        {hasNeg && <div className="absolute inset-y-0 w-px bg-hairline" style={{ left: "50%" }} />}
        {value !== null && (
          <div
            className="absolute inset-y-0 rounded"
            style={{ left: barLeft, width: barWidth, background: fill, opacity: emphasis ? 1 : 0.5 }}
          />
        )}
      </div>

      <div className="text-right leading-tight">
        {value === null ? (
          <span className="font-sans text-strong font-medium text-muted-foreground">—</span>
        ) : (
          <>
            <div
              className={cn(
                "font-sans text-strong font-medium tabular-nums",
                pos && "text-pos",
                neg && "text-neg",
                !pos && !neg && "text-foreground"
              )}
            >
              {formatPercent(value, 2)}
            </div>
            {dollarPnl !== null && (
              <div
                className={cn(
                  "font-sans text-caption tabular-nums",
                  dollarPnl > 0 && "text-pos",
                  dollarPnl < 0 && "text-neg",
                  dollarPnl === 0 && "text-muted-foreground"
                )}
              >
                {formatCurrency(dollarPnl)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_84px] items-center gap-3 py-1.5">
      <div className="h-3 w-7 rounded bg-surface-inset animate-pulse" />
      <div className="h-3.5 rounded bg-surface-inset animate-pulse" />
      <div className="ml-auto h-4 w-16 rounded bg-surface-inset animate-pulse" />
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

  // Canonical return on capital — the same field shown on Home and the
  // Performance "Return on capital" KPI, so the three never disagree.
  const yourReturnPct = result.aggregates.returnOnCapital;

  // Dollar figure for an index: what the year-to-date index return would have
  // earned on your average deployed capital (apples-to-apples with the $ shown
  // on "You"). Null when no capital was deployed.
  const dollarsOn = (pct: number | undefined) =>
    pct != null && avgDeployed > 0 ? avgDeployed * (pct / 100) : null;

  const spyResult = data && data.spy.length >= 2 ? ytdReturn(data.spy, benchYear) : null;
  const qqqResult = data && data.qqq.length >= 2 ? ytdReturn(data.qqq, benchYear) : null;
  const vtiResult = data && data.vti && data.vti.length >= 2 ? ytdReturn(data.vti, benchYear) : null;

  const rows: RowSpec[] = [
    { label: "You", sub: "Your return", pct: yourReturnPct, dollarPnl: totalPnl, emphasis: true },
    {
      label: "SPY",
      sub: "S&P 500",
      pct: spyResult?.returnPct ?? null,
      dollarPnl: dollarsOn(spyResult?.returnPct),
      unavailable: status === "success" && !spyResult,
    },
    {
      label: "VTI",
      sub: "Total market",
      pct: vtiResult?.returnPct ?? null,
      dollarPnl: dollarsOn(vtiResult?.returnPct),
      unavailable: status === "success" && !vtiResult,
    },
    {
      label: "QQQ",
      sub: "Nasdaq 100",
      pct: qqqResult?.returnPct ?? null,
      dollarPnl: dollarsOn(qqqResult?.returnPct),
      unavailable: status === "success" && !qqqResult,
    },
  ];

  // Shared bar scale across all rows so lengths are comparable.
  const activePcts = rows
    .filter((r) => !r.unavailable && r.pct !== null)
    .map((r) => r.pct as number);
  const maxAbs = Math.max(1, ...activePcts.map((p) => Math.abs(p)));
  const hasNeg = activePcts.some((p) => p < 0);

  return (
    <div className="rounded-[14px] border border-hairline bg-surface px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-strong font-medium text-foreground">Market comparison</h2>
        <span className="font-sans text-caption text-muted-foreground">YTD {benchYear}</span>
      </div>

      {/* Helper: deployed capital basis */}
      <p className="font-sans text-caption text-muted-foreground">
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
          <span className="font-sans text-strong text-muted-foreground">
            Benchmark unavailable — couldn&apos;t reach market data
          </span>
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-hairline bg-surface-inset px-4 py-1.5 font-sans text-body font-medium text-foreground transition hover:bg-surface active:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {status === "loading" && (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* Success — combined data bars (bar + exact % and $ per row) */}
      {status === "success" && (
        <div>
          {rows.map((row) => (
            <DataBarRow key={row.label} row={row} maxAbs={maxAbs} hasNeg={hasNeg} />
          ))}
        </div>
      )}
    </div>
  );
}

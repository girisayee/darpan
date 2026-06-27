"use client";

/**
 * BenchmarkComparison — "Market comparison": index calendar-YTD (SPY / VTI / QQQ)
 * vs your realized return, shown as a horizontal bar chart beside the exact figures.
 *
 * Props: result: CalculationResult
 *
 * Each bar/row shows that index's calendar year-to-date return (year-open close →
 * latest close) for the year in view. Fetches /api/benchmark once per session
 * (keyed in sessionStorage). Fail-soft: never fabricated numbers.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
const C_HAIRLINE = "rgb(var(--hairline))";
const C_SURFACE = "rgb(var(--surface))";

const TICK_STYLE = { fontFamily: "var(--font-sans)", fontSize: 11, fill: C_MUTED } as const;
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: C_SURFACE,
  border: `1px solid ${C_HAIRLINE}`,
  borderRadius: 8,
  boxShadow: "none",
  padding: "6px 10px",
};
const TOOLTIP_ITEM_STYLE: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, color: C_MUTED };
const TOOLTIP_LABEL_STYLE: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11, color: C_MUTED, marginBottom: 2 };

type ChartDatum = { name: string; pct: number; you: boolean };

function ComparisonChart({ data }: { data: ChartDatum[] }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  if (!mounted) {
    return <div className="h-[176px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="h-[176px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={C_HAIRLINE} opacity={1} />
          <XAxis
            type="number"
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <ReferenceLine x={0} stroke={C_HAIRLINE} />
          <Tooltip
            formatter={(value: unknown) => [
              formatPercent(typeof value === "number" ? value : Number(value), 2),
              "YTD return",
            ]}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ fill: C_HAIRLINE, fillOpacity: 0.3 }}
          />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={16}>
            {data.map((d, i) => (
              <Cell
                key={`cell-${i}`}
                fill={d.you ? (d.pct >= 0 ? C_POS : C_NEG) : C_MUTED}
                fillOpacity={d.you ? 1 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type MetricRowProps = {
  label: string;
  returnPct: number | null;
  dollarPnl: number | null;
  emphasis?: boolean;
  unavailable?: boolean;
};

function MetricRow({ label, returnPct, dollarPnl, emphasis, unavailable }: MetricRowProps) {
  const pos = returnPct !== null && returnPct > 0;
  const neg = returnPct !== null && returnPct < 0;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
      <span className={cn("font-sans text-[12px]", emphasis ? "font-medium text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      {unavailable || returnPct === null ? (
        <span className="font-sans text-[14px] font-medium text-muted-foreground">—</span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-sans text-[14px] font-medium tabular-nums",
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
                "font-sans text-[11px] tabular-nums",
                dollarPnl > 0 && "text-pos",
                dollarPnl < 0 && "text-neg",
                dollarPnl === 0 && "text-muted-foreground"
              )}
            >
              {formatCurrency(dollarPnl)}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="h-3 w-16 rounded bg-surface-inset animate-pulse" />
      <div className="h-4 w-20 rounded bg-surface-inset animate-pulse" />
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
  const yourReturnPct = avgDeployed > 0 ? (totalPnl / avgDeployed) * 100 : null;

  // Dollar figure for an index: what the year-to-date index return would have
  // earned on your average deployed capital (apples-to-apples with the $ shown
  // on "You"). Null when no capital was deployed.
  const dollarsOn = (pct: number | undefined) =>
    pct != null && avgDeployed > 0 ? avgDeployed * (pct / 100) : null;

  const spyResult = data && data.spy.length >= 2 ? ytdReturn(data.spy, benchYear) : null;
  const qqqResult = data && data.qqq.length >= 2 ? ytdReturn(data.qqq, benchYear) : null;
  const vtiResult = data && data.vti && data.vti.length >= 2 ? ytdReturn(data.vti, benchYear) : null;

  const spyUnavailable = status === "success" && !spyResult;
  const qqqUnavailable = status === "success" && !qqqResult;
  const vtiUnavailable = status === "success" && !vtiResult;

  // Chart series — keep the You / SPY / VTI / QQQ order, drop entries with no data.
  const chartData: ChartDatum[] = (
    [
      { name: "You", pct: yourReturnPct, you: true },
      { name: "SPY", pct: spyResult?.returnPct ?? null, you: false },
      { name: "VTI", pct: vtiResult?.returnPct ?? null, you: false },
      { name: "QQQ", pct: qqqResult?.returnPct ?? null, you: false },
    ] as { name: string; pct: number | null; you: boolean }[]
  )
    .filter((d): d is ChartDatum => d.pct !== null);

  return (
    <div className="rounded-[14px] border border-hairline bg-surface px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[13px] font-medium text-foreground">Market comparison</h2>
        <span className="font-sans text-[11px] text-muted-foreground">YTD {benchYear} · SPY / VTI / QQQ</span>
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

      {/* Loading skeleton — chart placeholder beside metric rows */}
      {status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
          <div className="h-[176px] animate-pulse rounded-md bg-surface-inset" />
          <div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </div>
      )}

      {/* Success — comparison chart side by side with the exact figures */}
      {status === "success" && (
        <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
          <ComparisonChart data={chartData} />
          <div>
            <MetricRow label="You" returnPct={yourReturnPct} dollarPnl={totalPnl} emphasis />
            <MetricRow
              label="SPY YTD"
              returnPct={spyResult?.returnPct ?? null}
              dollarPnl={dollarsOn(spyResult?.returnPct)}
              unavailable={spyUnavailable}
            />
            <MetricRow
              label="VTI YTD"
              returnPct={vtiResult?.returnPct ?? null}
              dollarPnl={dollarsOn(vtiResult?.returnPct)}
              unavailable={vtiUnavailable}
            />
            <MetricRow
              label="QQQ YTD"
              returnPct={qqqResult?.returnPct ?? null}
              dollarPnl={dollarsOn(qqqResult?.returnPct)}
              unavailable={qqqUnavailable}
            />
          </div>
        </div>
      )}
    </div>
  );
}

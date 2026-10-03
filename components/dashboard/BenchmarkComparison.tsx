"use client";

import { useEffect, useState } from "react";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import { ytdReturn } from "@/lib/benchmark/compare";
import type { ClosePoint } from "@/lib/benchmark/fetch";
import { formatDisplayDate, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type BenchmarkData = { spy: ClosePoint[]; qqq: ClosePoint[]; vti: ClosePoint[] };
type FetchStatus = "loading" | "success" | "error";

const BENCHMARKS = [
  { key: "spy", ticker: "SPY", name: "S&P 500" },
  { key: "vti", ticker: "VTI", name: "US market" },
  { key: "qqq", ticker: "QQQ", name: "Nasdaq 100" },
] as const;

function readCache(key: string): BenchmarkData | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as BenchmarkData : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: BenchmarkData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Market context still works when session storage is unavailable.
  }
}

export function BenchmarkComparison({ year, roc, masked, rocDescription }: {
  year: number;
  roc: number | null;
  masked: boolean;
  rocDescription: string;
}) {
  const fromISO = `${year}-01-01`;
  const toISO = year < new Date().getFullYear() ? `${year}-12-31` : new Date().toISOString().slice(0, 10);
  const cacheKey = `benchmark|v6|${fromISO}|${toISO}`;
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (roc === null) return;
    let cancelled = false;
    const cached = readCache(cacheKey);
    if (cached) {
      queueMicrotask(() => {
        if (cancelled) return;
        setData(cached);
        setStatus("success");
      });
      return () => { cancelled = true; };
    }

    fetch(`/api/benchmark?from=${fromISO}&to=${toISO}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Market data unavailable");
        return response.json() as Promise<BenchmarkData>;
      })
      .then((nextData) => {
        if (cancelled) return;
        if (!BENCHMARKS.some(({ key }) => (nextData[key]?.length ?? 0) > 0)) {
          setStatus("error");
          return;
        }
        writeCache(cacheKey, nextData);
        setData(nextData);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => { cancelled = true; };
  }, [cacheKey, fromISO, toISO, retryCount, roc]);

  const benchmarks = BENCHMARKS.map(({ key, ticker, name }) => {
    const points = data?.[key];
    const result = points && points.length >= 2 ? ytdReturn(points, year) : null;
    return { ticker, name, value: result?.returnPct ?? null, endDate: result?.endDate ?? null };
  });
  const latestClose = benchmarks.map((row) => row.endDate).filter((date): date is string => date !== null).sort().at(-1);
  const maxReturnMagnitude = Math.max(1, masked ? 0 : Math.abs(roc ?? 0), ...benchmarks.map((row) => Math.abs(row.value ?? 0)));

  function retry() {
    try { sessionStorage.removeItem(cacheKey); } catch { /* ignore */ }
    setData(null);
    setStatus("loading");
    setRetryCount((count) => count + 1);
  }

  return (
    <section className="rounded-[14px] border border-hairline bg-surface p-4 sm:p-5" aria-label="Realized return and market context">
      <div className="flex items-center gap-1 text-body font-medium text-muted-foreground">
        Realized RoC <InfoTooltip text={rocDescription} label="Realized RoC" />
      </div>
      {roc !== null ? (
        <div className="mt-2 grid grid-cols-[50px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
          <span className="text-caption font-medium text-muted-foreground">Trading</span>
          <div className="h-2 overflow-hidden rounded-full bg-surface-inset" aria-hidden="true">
            {!masked && <div className={cn("h-full rounded-full", roc < 0 ? "bg-neg" : "bg-pos")} style={{ width: `${Math.abs(roc) / maxReturnMagnitude * 100}%` }} />}
          </div>
          <span className={cn("text-right text-[32px] font-semibold leading-none tracking-tight tabular-nums sm:text-[40px]", masked ? "text-muted-foreground" : roc > 0 ? "text-pos" : roc < 0 ? "text-neg" : "text-foreground")}>
            {masked ? "••••" : formatPercent(roc, 1)}
          </span>

          <div className="col-span-3 mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-hairline pt-3">
            <h2 className="text-caption font-medium text-muted-foreground">Market backdrop</h2>
            <span className="text-caption tabular-nums text-muted-foreground">
              {year === new Date().getFullYear() ? "YTD" : year} adjusted{latestClose ? ` · ${formatDisplayDate(latestClose)}` : ""}
            </span>
          </div>

          {status === "error" ? (
            <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-inset px-3 py-2 text-caption text-muted-foreground">
              <span>Market data unavailable.</span>
              <button type="button" onClick={retry} className="font-medium text-accent hover:underline">Retry</button>
            </div>
          ) : benchmarks.map(({ ticker, name, value }) => (
            <div key={ticker} className="contents">
              <span className="text-caption font-semibold text-foreground" title={name}>{ticker}<span className="sr-only"> {name}</span></span>
              <div className="h-2 overflow-hidden rounded-full bg-accent/15" aria-hidden="true">
                {status === "success" && value !== null && <div className={cn("h-full rounded-full", value < 0 ? "bg-neg" : "bg-accent")} style={{ width: `${Math.abs(value) / maxReturnMagnitude * 100}%` }} />}
              </div>
              {status === "loading" ? (
                <span className="h-5 w-16 animate-pulse rounded bg-accent/15" aria-label={`Loading ${ticker} return`} />
              ) : (
                <span className={cn("text-right text-[15px] font-semibold leading-none tabular-nums min-[380px]:text-[17px] sm:text-[19px]", value === null ? "text-muted-foreground" : value < 0 ? "text-neg" : "text-accent")}>
                  {value === null ? "—" : `${value > 0 ? "+" : ""}${formatPercent(value, 1)}`}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : <p className="mt-4 border-t border-hairline pt-3 text-caption text-muted-foreground">No realized return available for this period.</p>}
    </section>
  );
}

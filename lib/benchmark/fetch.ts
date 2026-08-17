/**
 * lib/benchmark/fetch.ts — SERVER ONLY
 *
 * Fetches weekly adjusted close prices for an index/ETF symbol from Alpha Vantage
 * (TIME_SERIES_WEEKLY_ADJUSTED) and caches the full series locally so we hit the API at
 * most once per symbol per CACHE_TTL_MS (4 hours).
 *
 * Why WEEKLY ADJUSTED: on the free tier, TIME_SERIES_DAILY only returns the last ~100
 * points (outputsize=full is premium), which can't cover a benchmark window that
 * starts when the user began trading. Weekly adjusted prices also account for
 * splits and distributions, which is the appropriate market-context series.
 *
 * Why a durable cache: Alpha Vantage's free tier is rate-limited (≈25 req/day),
 * and benchmark data only moves once a day at the close — there is no reason to
 * re-fetch on every page view. The cache lives in Postgres (see cache-store.ts),
 * so it survives restarts/redeploys and is shared across instances — a transient
 * rate-limit always has a stale-but-usable fallback.
 *
 * FAIL-SOFT: returns [] on any error, rate-limit, or empty response — never
 * throws. If a live fetch fails but a cached entry exists (even stale), that
 * data is returned in preference to nothing.
 */

import { readEntry, writeEntry, type ClosePoint } from "@/lib/benchmark/cache-store";

export type { ClosePoint };

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const FETCH_TIMEOUT_MS = 8000;
const MIN_REQUEST_GAP_MS = 1100; // free tier allows ~1 request/sec

/** In-flight fetches per symbol, so concurrent requests share one API call. */
const inFlight = new Map<string, Promise<ClosePoint[]>>();

function apiKey(): string {
  return process.env.ALPHAVANTAGE_API_KEY ?? "";
}

/** fetch with an abort timeout. Returns null on any error/timeout (never throws). */
async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse an Alpha Vantage TIME_SERIES_WEEKLY_ADJUSTED response into ascending ClosePoints.
 * Returns null (NOT []) on a rate-limit / error / unparseable response so the
 * caller can distinguish "API said no" from "symbol genuinely has no data" and
 * fall back to a stale cache.
 */
function parseAlphaVantage(json: unknown): ClosePoint[] | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  // Rate-limit / informational / error envelopes — never contain price data.
  if (obj["Note"] || obj["Information"] || obj["Error Message"]) return null;

  const series = obj["Weekly Adjusted Time Series"];
  if (!series || typeof series !== "object") return null;

  const points: ClosePoint[] = [];
  for (const [date, bar] of Object.entries(series as Record<string, unknown>)) {
    const close = Number((bar as Record<string, string>)?.["5. adjusted close"]);
    if (!Number.isFinite(close) || close <= 0) continue;
    points.push({ date, close });
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

/**
 * Serialize outbound Alpha Vantage calls ≥ MIN_REQUEST_GAP_MS apart so a cold
 * refresh of all three symbols stays under the free-tier ~1/sec burst limit.
 */
let throttleChain: Promise<void> = Promise.resolve();
function nextSlot(): Promise<void> {
  const gap = Number(process.env.BENCHMARK_REQUEST_GAP_MS ?? MIN_REQUEST_GAP_MS);
  if (!Number.isFinite(gap) || gap <= 0) return Promise.resolve();
  const wait = throttleChain.then(
    () => new Promise<void>((r) => setTimeout(r, gap))
  );
  throttleChain = wait;
  return wait;
}

/** Fetch the full weekly series for a symbol from Alpha Vantage. null on failure. */
async function fetchFromAlphaVantage(symbol: string): Promise<ClosePoint[] | null> {
  const key = apiKey();
  if (!key) return null;
  await nextSlot();
  const url =
    `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED` +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!resp?.ok) return null;
  try {
    return parseAlphaVantage(await resp.json());
  } catch {
    return null;
  }
}

/**
 * Return the cached full series for a symbol, refreshing from Alpha Vantage when
 * the cache is missing or older than CACHE_TTL_MS. Fail-soft: stale-on-error.
 */
async function getSeries(symbol: string): Promise<ClosePoint[]> {
  const cacheSymbol = `weekly-adjusted:${symbol}`;
  const entry = await readEntry(cacheSymbol);
  const fresh = entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
  if (fresh) return entry.points;

  // Coalesce concurrent refreshes for the same symbol.
  const existing = inFlight.get(cacheSymbol);
  if (existing) return existing;

  const task = (async (): Promise<ClosePoint[]> => {
    const fetched = await fetchFromAlphaVantage(symbol);
    if (fetched) {
      await writeEntry(cacheSymbol, fetched);
      return fetched;
    }
    // Fetch failed (rate-limit / network) — serve stale cached data if we have
    // any, else empty. Durable Postgres cache means this fallback survives
    // restarts and redeploys.
    return entry?.points ?? [];
  })().finally(() => inFlight.delete(cacheSymbol));

  inFlight.set(cacheSymbol, task);
  return task;
}

/**
 * Fetch daily closes for `symbol` between `fromISO` and `toISO` (YYYY-MM-DD),
 * served from the local 4-hour cache. Returns [] on all errors.
 */
export async function fetchDailyCloses(
  symbol: string,
  fromISO: string,
  toISO: string
): Promise<ClosePoint[]> {
  try {
    const series = await getSeries(symbol);
    return series.filter((p) => p.date >= fromISO && p.date <= toISO);
  } catch {
    return [];
  }
}

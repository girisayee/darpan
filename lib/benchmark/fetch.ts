/**
 * lib/benchmark/fetch.ts — SERVER ONLY
 *
 * Fetches daily close prices for a given symbol from Stooq (primary)
 * with a Yahoo Finance chart JSON fallback.
 *
 * FAIL-SOFT: returns [] on any error, timeout, or empty response — never throws.
 */

export type ClosePoint = { date: string; close: number };

/**
 * Format a Date as YYYYMMDD for Stooq query params.
 */
function toYYYYMMDD(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Parse Stooq CSV (Date,Open,High,Low,Close,Volume).
 * Returns [] if the response is not a valid CSV or has no data rows.
 */
function parseStooqCsv(text: string): ClosePoint[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  if (!header.includes("close")) return [];
  const cols = header.split(",").map((c) => c.trim());
  const dateIdx = cols.indexOf("date");
  const closeIdx = cols.indexOf("close");
  if (dateIdx === -1 || closeIdx === -1) return [];
  const result: ClosePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length <= Math.max(dateIdx, closeIdx)) continue;
    const date = parts[dateIdx]?.trim();
    const close = parseFloat(parts[closeIdx]?.trim() ?? "");
    if (!date || isNaN(close) || close <= 0) continue;
    result.push({ date, close });
  }
  return result;
}

/**
 * Parse Yahoo Finance v8 chart JSON.
 * Returns [] on any shape mismatch.
 */
function parseYahooJson(json: unknown): ClosePoint[] {
  try {
    const chart = (json as { chart: { result: Array<{ timestamp: number[]; indicators: { quote: Array<{ close: (number | null)[] }> } }> } }).chart;
    const res = chart?.result?.[0];
    if (!res) return [];
    const timestamps: number[] = res.timestamp ?? [];
    const closes: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
    const result: ClosePoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const close = closes[i];
      if (ts == null || close == null || close <= 0) continue;
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      result.push({ date, close });
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Realistic browser headers. Stooq and Yahoo both increasingly reject requests
 * that don't look like a browser (Stooq serves an anti-bot JS challenge; Yahoo
 * returns 401/429). These improve the odds of a real response on a live network.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** fetch with an abort timeout. Returns null on any error/timeout (never throws). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort Yahoo session cookie (cached for the server process lifetime).
 * Yahoo's data hosts often 401/429 without an A1/A3 cookie. Failure is fine —
 * we proceed without one and let the chart call try anyway.
 */
let yahooCookie: string | null = null;
async function getYahooCookie(): Promise<string | null> {
  if (yahooCookie) return yahooCookie;
  const resp = await fetchWithTimeout(
    "https://fc.yahoo.com/",
    { headers: BROWSER_HEADERS },
    4000
  );
  if (!resp) return null;
  // Node/undici exposes getSetCookie(); fall back to the combined header.
  const raw =
    typeof resp.headers.getSetCookie === "function"
      ? resp.headers.getSetCookie()
      : resp.headers.get("set-cookie")
        ? [resp.headers.get("set-cookie") as string]
        : [];
  const pairs = raw.map((c) => c.split(";")[0]).filter(Boolean);
  if (pairs.length === 0) return null;
  yahooCookie = pairs.join("; ");
  return yahooCookie;
}

/**
 * Fetch daily closes for `symbol` between `fromISO` and `toISO` (YYYY-MM-DD).
 * Tries Stooq first, falls back to Yahoo Finance, returns [] on all errors.
 */
export async function fetchDailyCloses(
  symbol: string,
  fromISO: string,
  toISO: string
): Promise<ClosePoint[]> {
  const d1 = toYYYYMMDD(fromISO);
  const d2 = toYYYYMMDD(toISO);
  const stooqUrl = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&d1=${d1}&d2=${d2}&i=d`;

  // Primary: Stooq CSV
  const stooqResp = await fetchWithTimeout(
    stooqUrl,
    { headers: BROWSER_HEADERS },
    4000
  );
  if (stooqResp?.ok) {
    const data = parseStooqCsv(await stooqResp.text());
    if (data.length > 0) return data;
  }

  // Fallback: Yahoo Finance chart API (try both hosts; attach a session cookie).
  const from = Math.floor(new Date(fromISO + "T00:00:00Z").getTime() / 1000);
  const to = Math.floor(new Date(toISO + "T23:59:59Z").getTime() / 1000);
  const cookie = await getYahooCookie();
  const yahooHeaders: Record<string, string> = cookie
    ? { ...BROWSER_HEADERS, Cookie: cookie }
    : BROWSER_HEADERS;

  for (const host of ["query1", "query2"]) {
    const yahooUrl = `https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${from}&period2=${to}&interval=1d`;
    const resp = await fetchWithTimeout(yahooUrl, { headers: yahooHeaders }, 4000);
    if (!resp?.ok) continue;
    try {
      const data = parseYahooJson(await resp.json());
      if (data.length > 0) return data;
    } catch {
      // try next host
    }
  }

  return [];
}

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
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(stooqUrl, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (resp.ok) {
      const text = await resp.text();
      const data = parseStooqCsv(text);
      if (data.length > 0) return data;
    }
  } catch {
    // fall through to Yahoo
  }

  // Fallback: Yahoo Finance chart API
  try {
    const from = Math.floor(new Date(fromISO + "T00:00:00Z").getTime() / 1000);
    const to = Math.floor(new Date(toISO + "T23:59:59Z").getTime() / 1000);
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${from}&period2=${to}&interval=1d`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(yahooUrl, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timer);
    if (resp.ok) {
      const json: unknown = await resp.json();
      const data = parseYahooJson(json);
      if (data.length > 0) return data;
    }
  } catch {
    // fall through
  }

  return [];
}

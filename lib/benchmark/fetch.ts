/**
 * lib/benchmark/fetch.ts — SERVER ONLY
 *
 * Fetches daily close prices for a symbol from Yahoo Finance (v8 chart JSON),
 * using a browser-like User-Agent + a session cookie + a crumb token to get past
 * Yahoo's bot defenses.
 *
 * Stooq was dropped: it now serves a JavaScript proof-of-work anti-bot challenge
 * (verified) that a server-side fetch cannot solve, so it only ever returned [].
 *
 * FAIL-SOFT: returns [] on any error, timeout, block, or empty response — never throws.
 */

export type ClosePoint = { date: string; close: number };

/**
 * Parse Yahoo Finance v8 chart JSON. Returns [] on any shape mismatch.
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
 * Realistic browser headers. Yahoo's data hosts reject requests that don't look
 * like a browser (401/429), so these improve the odds of a real response.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
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
 * Yahoo's data hosts often 401/429 without an A1/A3 cookie.
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
 * Best-effort crumb token paired with the cookie (cached for the process lifetime).
 * Yahoo's query hosts increasingly require a matching cookie+crumb pair.
 */
let yahooCrumb: string | null = null;
async function getYahooCrumb(cookie: string | null): Promise<string | null> {
  if (yahooCrumb) return yahooCrumb;
  const headers = cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS;
  for (const host of ["query1", "query2"]) {
    const resp = await fetchWithTimeout(
      `https://${host}.finance.yahoo.com/v1/test/getcrumb`,
      { headers },
      4000
    );
    if (!resp?.ok) continue;
    const text = (await resp.text()).trim();
    // A crumb is a short opaque token; reject empty / HTML challenge pages.
    if (text && text.length > 0 && text.length < 64 && !text.startsWith("<")) {
      yahooCrumb = text;
      return yahooCrumb;
    }
  }
  return null;
}

/**
 * Fetch daily closes for `symbol` between `fromISO` and `toISO` (YYYY-MM-DD).
 * Yahoo v8 chart across query1/query2 with cookie + crumb. Returns [] on all errors.
 */
export async function fetchDailyCloses(
  symbol: string,
  fromISO: string,
  toISO: string
): Promise<ClosePoint[]> {
  const from = Math.floor(new Date(fromISO + "T00:00:00Z").getTime() / 1000);
  const to = Math.floor(new Date(toISO + "T23:59:59Z").getTime() / 1000);
  const cookie = await getYahooCookie();
  const crumb = await getYahooCrumb(cookie);
  const headers = cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS;
  const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";

  for (const host of ["query1", "query2"]) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d${crumbParam}`;
    const resp = await fetchWithTimeout(url, { headers }, 4000);
    if (!resp?.ok) continue;
    try {
      const data = parseYahooJson(await resp.json());
      if (data.length > 0) return data;
    } catch {
      // try the next host
    }
  }

  return [];
}

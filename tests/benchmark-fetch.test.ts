import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for lib/benchmark/fetch.ts — the Alpha Vantage source + 4-hour local
 * cache. `fetch` and `node:fs/promises` are mocked so these run fully offline.
 *
 * The module keeps process-lifetime state (in-memory cache + in-flight map), so
 * each test imports a fresh copy via vi.resetModules().
 */

// In-memory stand-in for the on-disk cache file.
let fakeDisk: Record<string, string> = {};

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string) => {
    if (p in fakeDisk) return fakeDisk[p];
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  }),
  writeFile: vi.fn(async (p: string, data: string) => {
    fakeDisk[p] = data;
  }),
  mkdir: vi.fn(async () => undefined),
}));

const AV_RESPONSE = (closes: Record<string, string>) => ({
  "Meta Data": { "2. Symbol": "SPY" },
  "Weekly Time Series": Object.fromEntries(
    Object.entries(closes).map(([date, c]) => [
      date,
      { "1. open": c, "2. high": c, "3. low": c, "4. close": c, "5. volume": "1" },
    ])
  ),
});

function mockFetchOnce(json: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => json })) as unknown as typeof fetch;
}

async function loadModule() {
  vi.resetModules();
  return import("@/lib/benchmark/fetch");
}

beforeEach(() => {
  fakeDisk = {};
  process.env.ALPHAVANTAGE_API_KEY = "TEST_KEY";
  process.env.BENCHMARK_REQUEST_GAP_MS = "0"; // disable throttle in tests
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDailyCloses (Alpha Vantage + cache)", () => {
  it("parses closes and filters to the requested window", async () => {
    global.fetch = mockFetchOnce(
      AV_RESPONSE({
        "2026-01-02": "400.00",
        "2026-03-15": "420.50",
        "2026-06-20": "450.00",
      })
    );
    const { fetchDailyCloses } = await loadModule();

    const pts = await fetchDailyCloses("SPY", "2026-01-01", "2026-04-01");
    expect(pts).toEqual([
      { date: "2026-01-02", close: 400 },
      { date: "2026-03-15", close: 420.5 },
    ]);
  });

  it("serves the second call from cache without re-fetching (within TTL)", async () => {
    const f = mockFetchOnce(AV_RESPONSE({ "2026-01-02": "400.00", "2026-02-02": "410.00" }));
    global.fetch = f;
    const { fetchDailyCloses } = await loadModule();

    await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31");
    await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cache is older than the 4-hour TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:00:00Z"));
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => AV_RESPONSE({ "2026-01-02": "400.00", "2026-02-02": "410.00" }),
    })) as unknown as typeof fetch;
    global.fetch = f;
    const { fetchDailyCloses } = await loadModule();

    await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31");
    // 4h + 1min later → stale → refetch
    vi.setSystemTime(new Date("2026-06-20T04:01:00Z"));
    await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("falls back to stale cached data when a refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:00:00Z"));
    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, json: async () => AV_RESPONSE({ "2026-01-02": "400.00", "2026-02-02": "410.00" }) };
      }
      return { ok: false, json: async () => ({}) }; // refresh fails
    }) as unknown as typeof fetch;
    const { fetchDailyCloses } = await loadModule();

    const first = await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31");
    expect(first.length).toBe(2);

    vi.setSystemTime(new Date("2026-06-20T05:00:00Z")); // stale
    const stale = await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31");
    expect(stale).toEqual(first); // served stale, not empty
  });

  it("returns [] on a rate-limit envelope with no prior cache", async () => {
    global.fetch = mockFetchOnce({ Note: "Thank you for using Alpha Vantage! ... 25 requests per day" });
    const { fetchDailyCloses } = await loadModule();
    expect(await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("returns [] when the API key is missing (no fetch attempted)", async () => {
    delete process.env.ALPHAVANTAGE_API_KEY;
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    const { fetchDailyCloses } = await loadModule();
    expect(await fetchDailyCloses("SPY", "2026-01-01", "2026-12-31")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("coalesces concurrent requests for the same symbol into one fetch", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => AV_RESPONSE({ "2026-01-02": "400.00" }),
    })) as unknown as typeof fetch;
    global.fetch = f;
    const { fetchDailyCloses } = await loadModule();

    await Promise.all([
      fetchDailyCloses("SPY", "2026-01-01", "2026-12-31"),
      fetchDailyCloses("SPY", "2026-01-01", "2026-12-31"),
      fetchDailyCloses("SPY", "2026-01-01", "2026-12-31"),
    ]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

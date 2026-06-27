/**
 * lib/benchmark/cache-store.ts — durable Postgres store for the benchmark
 * close-price cache. Split out from fetch.ts so the fetch/parse/throttle logic
 * can be unit-tested with this store mocked (no DB dependency in tests).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { benchmarkCache } from "@/lib/db/schema";

export type ClosePoint = { date: string; close: number };
export type CacheEntry = { fetchedAt: number; points: ClosePoint[] };

/**
 * Read a symbol's cached series. Durable across restarts and shared across
 * instances, so the stale-on-error fallback always has data once a symbol has
 * ever been fetched. Returns null on miss or any DB error.
 */
export async function readEntry(symbol: string): Promise<CacheEntry | null> {
  try {
    const rows = await db
      .select()
      .from(benchmarkCache)
      .where(eq(benchmarkCache.symbol, symbol))
      .limit(1);
    if (!rows.length) return null;
    return { fetchedAt: rows[0].fetchedAt.getTime(), points: rows[0].points as ClosePoint[] };
  } catch {
    return null;
  }
}

export async function writeEntry(symbol: string, points: ClosePoint[]): Promise<void> {
  try {
    const fetchedAt = new Date();
    await db
      .insert(benchmarkCache)
      .values({ symbol, fetchedAt, points })
      .onConflictDoUpdate({ target: benchmarkCache.symbol, set: { fetchedAt, points } });
  } catch {
    // Non-fatal: a write failure just means we re-fetch next time.
  }
}

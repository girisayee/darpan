/**
 * app/api/benchmark/route.ts
 *
 * GET /api/benchmark?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns: { spy: ClosePoint[], qqq: ClosePoint[], vti: ClosePoint[] }
 * Fail-soft: never 500; missing/failed symbols return empty arrays.
 */

import { fetchDailyCloses } from "@/lib/benchmark/fetch";
import type { ClosePoint } from "@/lib/benchmark/fetch";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";

    // Validate date format roughly — fail-soft to empty arrays if bad
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) {
      return Response.json({ spy: [], qqq: [], vti: [] });
    }

    const [spy, qqq, vti]: [ClosePoint[], ClosePoint[], ClosePoint[]] = await Promise.all([
      fetchDailyCloses("SPY", from, to).catch((): ClosePoint[] => []),
      fetchDailyCloses("QQQ", from, to).catch((): ClosePoint[] => []),
      fetchDailyCloses("VTI", from, to).catch((): ClosePoint[] => []),
    ]);

    return Response.json({ spy, qqq, vti });
  } catch {
    // Never 500 — always return the empty shape
    return Response.json({ spy: [], qqq: [], vti: [] });
  }
}

/**
 * lib/benchmark/compare.ts — PURE, no I/O.
 *
 * Adjusted market-context return math.
 * All inputs are plain values; no fetch, no side-effects — safe to unit-test.
 */

export type ClosePoint = { date: string; close: number };

export type YtdResult = {
  baselineDate: string;
  baselineClose: number;
  endDate: string;
  endClose: number;
  returnPct: number;
};

/**
 * Calendar year-to-date return for an index/ETF.
 *
 * Baseline is the **year-open close** — the first close on/after Jan 1 of
 * `year`. True YTD is measured from the prior Dec 31 print, which isn't
 * available on weekly data (the bar spanning the new year is dated in early
 * January), so the year-open close is the closest proxy: it sits ~1 trading day
 * from Dec 31, versus ~3 for the prior December weekly bar. (Anchoring to the
 * prior-December bar measurably undershoots — e.g. QQQ 13.2% vs ~15% actual.)
 *
 * End is the last close within `year`, so a past year is capped at its Dec 31
 * and the current year runs to the latest available close. Returns null when
 * fewer than two in-year closes exist.
 */
export function ytdReturn(closes: ClosePoint[], year: number): YtdResult | null {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const inYear = closes
    .filter((c) => c.close > 0 && c.date >= yearStart && c.date <= yearEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (inYear.length < 2) return null;

  const baseline = inYear[0];
  const end = inYear[inYear.length - 1];
  if (baseline.close <= 0) return null;

  const returnPct = ((end.close - baseline.close) / baseline.close) * 100;
  return {
    baselineDate: baseline.date,
    baselineClose: baseline.close,
    endDate: end.date,
    endClose: end.close,
    returnPct,
  };
}

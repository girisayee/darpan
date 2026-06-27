/**
 * lib/benchmark/compare.ts — PURE, no I/O.
 *
 * Capital-matched benchmark comparison math.
 * All inputs are plain values; no fetch, no side-effects — safe to unit-test.
 */

export type ClosePoint = { date: string; close: number };

export type CapitalMatchedResult = {
  startClose: number;
  endClose: number;
  returnPct: number;
  dollarPnl: number;
};

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
 * Baseline is the **last close strictly before Jan 1 of `year`** (the prior
 * year-end close — the true YTD starting point), NOT the first close inside the
 * year. Measuring from the first in-year close systematically biases the return
 * whenever the market moved over the new-year gap, which overstated every
 * benchmark here. End is the last close within `year` (so a past year is capped
 * at its Dec 31; the current year runs to the latest available close).
 *
 * `closes` must therefore include at least one point before Jan 1 of `year`.
 * Returns null when there is no prior-year baseline or no in-year close.
 */
export function ytdReturn(closes: ClosePoint[], year: number): YtdResult | null {
  const valid = closes.filter((c) => c.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  let baseline: ClosePoint | null = null;
  for (const point of valid) {
    if (point.date < yearStart) baseline = point; // keep the latest pre-year close
    else break;
  }
  const inYear = valid.filter((p) => p.date >= yearStart && p.date <= yearEnd);
  if (!baseline || baseline.close <= 0 || inYear.length === 0) return null;

  const end = inYear[inYear.length - 1];
  const returnPct = ((end.close - baseline.close) / baseline.close) * 100;
  return {
    baselineDate: baseline.date,
    baselineClose: baseline.close,
    endDate: end.date,
    endClose: end.close,
    returnPct,
  };
}

/**
 * Resolve the benchmark window start as a strict YYYY-MM-01 ISO date from the
 * earliest numeric year/month present.
 *
 * IMPORTANT: callers MUST pass numeric year/month (e.g. result.monthlyReturns),
 * NOT a formatted month label. A prior bug derived this from
 * aggregates.monthlyRealizedPnl[].month — a human label like "Jan 25" — and
 * appended "-01", producing "Jan 25-01", which the /api/benchmark route rejects
 * (it validates /^\d{4}-\d{2}-\d{2}$/), so the comparison always returned empty.
 *
 * Returns null when there are no months.
 */
export function benchmarkStartISO(
  months: { year: number; month: number }[]
): string | null {
  if (months.length === 0) return null;
  const earliest = [...months].sort(
    (a, b) => a.year - b.year || a.month - b.month
  )[0];
  return `${earliest.year}-${String(earliest.month).padStart(2, "0")}-01`;
}

/**
 * Given an array of daily closes and an average deployed capital amount,
 * compute what a buy-and-hold of that capital in the benchmark would have returned
 * over the same window.
 *
 * Returns null if:
 *   - fewer than 2 valid closes are present
 *   - the first close is ≤ 0 (division by zero guard)
 */
export function capitalMatchedReturn(
  closes: ClosePoint[],
  averageDeployedCapital: number
): CapitalMatchedResult | null {
  const valid = closes.filter((c) => c.close > 0);
  if (valid.length < 2) return null;

  // Sort ascending by date so first = earliest, last = latest
  const sorted = [...valid].sort((a, b) => a.date.localeCompare(b.date));

  const startClose = sorted[0].close;
  const endClose = sorted[sorted.length - 1].close;

  if (startClose <= 0) return null;

  const returnPct = ((endClose - startClose) / startClose) * 100;
  const dollarPnl = averageDeployedCapital * (returnPct / 100);

  return { startClose, endClose, returnPct, dollarPnl };
}

import type { CapitalUsage } from "@/types/trading";

/**
 * Peak concurrent capital tied up by a single symbol.
 *
 * Each {@link CapitalUsage} row holds a constant `amount` over the half-open span
 * `[startDate, endDate)`: a cycle that closes on day D *frees* its collateral that day,
 * and a cycle that opens on day D *reclaims* it — so recycling the same collateral
 * across back-to-back cycles must NOT be counted as concurrent at the seam. (Treating
 * the interval as closed on both ends double-counts every roll, which understates
 * Return on Capital for wheel/covered-call symbols that reuse the same cash.)
 *
 * The maximum overlap sum is always reached on some row's `startDate` (overlap can only
 * grow when a new row begins), so we evaluate the deployed total at each start date and
 * take the maximum. A same-day round trip (`startDate === endDate`) spans an empty
 * half-open range, so we floor the result at the largest single position that ever
 * existed — that capital was unquestionably deployed at some point.
 */
export function peakConcurrentCapital(usage: CapitalUsage[], symbol: string): number {
  const rows = usage.filter((row) => row.symbol === symbol);
  if (rows.length === 0) return 0;
  let peak = 0;
  for (const row of rows) {
    const date = row.startDate;
    const deployed = rows
      .filter((r) => r.startDate <= date && r.endDate > date)
      .reduce((acc, r) => acc + r.amount, 0);
    peak = Math.max(peak, deployed);
  }
  const maxSingle = rows.reduce((m, r) => Math.max(m, r.amount), 0);
  return Math.max(peak, maxSingle);
}

/**
 * Return on peak concurrent capital for a symbol — realized P&L divided by the most
 * cash the symbol ever had at risk at one time. Unlike the turnover-based "Capital ROI"
 * (which sums capital across every closed cycle), this reflects how hard the actual
 * committed cash worked. Returns null when no capital was ever deployed.
 */
export function peakCapitalRoi(usage: CapitalUsage[], symbol: string, pnl: number): number | null {
  const peak = peakConcurrentCapital(usage, symbol);
  return peak > 0 ? (pnl / peak) * 100 : null;
}

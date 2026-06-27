import { describe, it, expect } from "vitest";
import { peakConcurrentCapital, peakCapitalRoi } from "@/lib/selectors/symbol-capital";
import type { CapitalUsage } from "@/types/trading";

const usage = (
  symbol: string,
  startDate: string,
  endDate: string,
  amount: number,
): CapitalUsage => ({
  id: `${symbol}-${startDate}-${amount}`,
  strategy: "CASH_SECURED_PUT",
  symbol,
  startDate,
  endDate,
  capitalType: "OPTION_COLLATERAL",
  amount,
  quantity: 1,
  linkedTransactionIds: [],
});

describe("peakConcurrentCapital", () => {
  it("returns 0 when the symbol has no capital usage", () => {
    expect(peakConcurrentCapital([], "MDB")).toBe(0);
    expect(peakConcurrentCapital([usage("AAPL", "2026-01-01", "2026-02-01", 100)], "MDB")).toBe(0);
  });

  it("does not sum sequential, non-overlapping cycles", () => {
    const rows = [
      usage("MDB", "2026-01-01", "2026-01-31", 30_000),
      usage("MDB", "2026-02-01", "2026-02-28", 30_000),
      usage("MDB", "2026-03-01", "2026-03-31", 30_000),
    ];
    expect(peakConcurrentCapital(rows, "MDB")).toBe(30_000);
  });

  it("sums overlapping cycles on the busiest day", () => {
    const rows = [
      usage("MDB", "2026-01-01", "2026-01-20", 30_000),
      usage("MDB", "2026-01-10", "2026-01-31", 20_000),
    ];
    expect(peakConcurrentCapital(rows, "MDB")).toBe(50_000);
  });

  it("does not double-count collateral recycled at a day boundary", () => {
    // A cycle that closes on D frees its collateral; the next cycle opening on D
    // reclaims the *same* collateral. The seam must not be counted as concurrent.
    const rows = [
      usage("MDB", "2026-05-28", "2026-05-29", 32_300),
      usage("MDB", "2026-05-29", "2026-06-02", 32_300),
      usage("MDB", "2026-06-02", "2026-06-08", 32_300),
    ];
    expect(peakConcurrentCapital(rows, "MDB")).toBe(32_300);
  });

  it("still counts a same-day round trip ([D,D]) as deployed capital", () => {
    const rows = [usage("MDB", "2026-05-29", "2026-05-29", 32_300)];
    expect(peakConcurrentCapital(rows, "MDB")).toBe(32_300);
  });

  it("isolates capital by symbol", () => {
    const rows = [
      usage("MDB", "2026-01-01", "2026-01-31", 30_000),
      usage("AAPL", "2026-01-01", "2026-01-31", 99_000),
    ];
    expect(peakConcurrentCapital(rows, "MDB")).toBe(30_000);
  });
});

describe("peakCapitalRoi", () => {
  it("is null when no capital was deployed", () => {
    expect(peakCapitalRoi([], "MDB", 2_590.26)).toBeNull();
  });

  it("divides P&L by peak concurrent capital, not summed turnover", () => {
    const rows = [
      usage("MDB", "2026-01-01", "2026-01-31", 30_000),
      usage("MDB", "2026-02-01", "2026-02-28", 30_000),
    ];
    // Turnover capital would be 60k → ~4.3%; peak is 30k → ~8.6%.
    expect(peakCapitalRoi(rows, "MDB", 2_590.26)).toBeCloseTo(8.634, 2);
  });
});

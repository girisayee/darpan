import { maxDrawdown, sortino, calmar, riskMetrics } from "@/lib/selectors/risk";
import type { CalculationResult } from "@/types/trading";

test("maxDrawdown finds the largest peak-to-trough decline", () => {
  const d = maxDrawdown([0, 10, 7, 12, 5, 9]);
  expect(d.maxDrawdown).toBe(7);          // peak 12 -> trough 5
  expect(d.maxDrawdownPct).toBeCloseTo(7 / 12, 5);
  expect(d.peakIndex).toBe(3);
  expect(d.troughIndex).toBe(4);
});

test("maxDrawdown: no drawdown -> pct null; empty -> safe zeros", () => {
  expect(maxDrawdown([0, 5, 10]).maxDrawdown).toBe(0);
  expect(maxDrawdown([0, 5, 10]).maxDrawdownPct).toBeNull();
  const e = maxDrawdown([]);
  expect(e.maxDrawdown).toBe(0);
  expect(e.maxDrawdownPct).toBeNull();
});

test("maxDrawdown: all-negative equity (peak <= 0) -> pct null, no NaN", () => {
  const d = maxDrawdown([-5, -10, -3]);
  expect(d.maxDrawdownPct).toBeNull();
  expect(Number.isNaN(d.maxDrawdown)).toBe(false);
});

test("maxDrawdown does not mutate its input", () => {
  const input = [0, 10, 7, 12, 5, 9];
  const copy = [...input];
  maxDrawdown(input);
  expect(input).toEqual(copy);
});

test("sortino uses downside deviation only", () => {
  // mean 1.2; downside sq [0,0,1,0,4] mean 1 -> dev 1 -> 1.2/1
  expect(sortino([2, 3, -1, 4, -2], 0)).toBeCloseTo(1.2, 5);
});

test("sortino: no downside or empty -> null (no NaN)", () => {
  expect(sortino([1, 2, 3], 0)).toBeNull();
  expect(sortino([], 0)).toBeNull();
});

test("calmar = annualized return / max drawdown; null-safe", () => {
  expect(calmar(18, 0.5833)).toBeCloseTo(0.18 / 0.5833, 4);
  expect(calmar(18, null)).toBeNull();
  expect(calmar(null, 0.5)).toBeNull();
  expect(calmar(18, 0)).toBeNull();
});

test("riskMetrics composes from result", () => {
  const result = {
    aggregates: {
      monthlyRealizedPnl: [
        { month: "1", pnl: 0, cumulative: 0 },
        { month: "2", pnl: 10, cumulative: 10 },
        { month: "3", pnl: -3, cumulative: 7 },
        { month: "4", pnl: 5, cumulative: 12 },
        { month: "5", pnl: -7, cumulative: 5 },
        { month: "6", pnl: 4, cumulative: 9 },
      ],
      averageMonthlyRoi: 1.5,
    },
    monthlyReturns: [
      { realizedRoiPercent: 2 }, { realizedRoiPercent: 3 }, { realizedRoiPercent: -1 },
      { realizedRoiPercent: 4 }, { realizedRoiPercent: -2 }, { realizedRoiPercent: 1 },
    ],
  } as unknown as CalculationResult;
  const r = riskMetrics(result);
  expect(r.maxDrawdown).toBe(7);
  expect(r.maxDrawdownPct).toBeCloseTo(7 / 12, 5);
  expect(r.sortino).toBeCloseTo(1.278, 2);   // mean 7/6, downside dev sqrt(5/6)
  expect(r.calmar).toBeCloseTo((1.5 * 12 / 100) / (7 / 12), 3);
});

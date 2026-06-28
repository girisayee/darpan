import { goalPace } from "@/lib/selectors/goal-pace";

test("computes cumulative, actual, aheadBy, and pct correctly", () => {
  const result = goalPace({
    annualGoal: 50000,
    monthlyRealized: [5000, 5000, 5000, 5000, 5000, 6940],
    monthIndex: 5,
  });

  // cumulative running sum: [5000, 10000, 15000, 20000, 25000, 31940]
  expect(result.cumulative).toEqual([5000, 10000, 15000, 20000, 25000, 31940]);

  // actual = cumulative[5] = 31940
  expect(result.actual).toBe(31940);

  // target = 50000 * 6/12 = 25000
  expect(result.target).toBe(25000);

  // aheadBy = 31940 - 25000 = 6940
  expect(result.aheadBy).toBe(6940);

  // pct = (31940 / 50000) * 100 = 63.88
  expect(result.pct).toBeCloseTo(63.88, 1);
});

test("annualGoal 0 yields pct 0 (no NaN)", () => {
  const result = goalPace({
    annualGoal: 0,
    monthlyRealized: [1000, 2000],
    monthIndex: 1,
  });

  expect(result.pct).toBe(0);
  expect(Number.isNaN(result.pct)).toBe(false);
});

test("empty monthlyRealized yields zeros", () => {
  const result = goalPace({
    annualGoal: 50000,
    monthlyRealized: [],
    monthIndex: 0,
  });

  expect(result.cumulative).toEqual([]);
  expect(result.actual).toBe(0);
  expect(result.pct).toBe(0);
});

test("monthIndex beyond data length falls back to 0", () => {
  const result = goalPace({
    annualGoal: 12000,
    monthlyRealized: [1000],
    monthIndex: 5,
  });

  expect(result.actual).toBe(0);
  expect(result.aheadBy).toBe(0 - 12000 * 6 / 12);
});

test("projects year-end and required monthly from pace", () => {
  const result = goalPace({
    annualGoal: 50000,
    monthlyRealized: [5000, 5000, 5000, 5000, 5000, 6940],
    monthIndex: 5,
  });
  // monthsElapsed = 6, actual = 31940
  expect(result.projectedYearEnd).toBeCloseTo(63880, 5); // 31940 / 6 * 12
  // remaining = 6, required = (50000 - 31940) / 6
  expect(result.requiredMonthly).toBeCloseTo(3010, 5);
});

test("final month: no remaining -> requiredMonthly 0, no NaN", () => {
  const result = goalPace({
    annualGoal: 12000,
    monthlyRealized: Array(12).fill(1000),
    monthIndex: 11,
  });
  expect(result.requiredMonthly).toBe(0);
  expect(Number.isNaN(result.requiredMonthly)).toBe(false);
  expect(result.projectedYearEnd).toBeCloseTo(12000, 5);
});

test("goal already met -> requiredMonthly clamps to 0", () => {
  const result = goalPace({ annualGoal: 1000, monthlyRealized: [5000], monthIndex: 0 });
  expect(result.requiredMonthly).toBe(0);
});

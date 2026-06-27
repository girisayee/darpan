import { capitalEfficiency } from "@/lib/selectors/capital-efficiency";
import type { MonthlyCapitalReturn } from "@/types/trading";

const mo = (o: Partial<MonthlyCapitalReturn>): MonthlyCapitalReturn =>
  ({
    closedTradeCapital: 0,
    averageDeployedCapital: 0,
    optionsPremiumPnl: 0,
    capitalDays: 0,
    periodDays: 0,
    ...o,
  } as MonthlyCapitalReturn);

test("turnover (over time-weighted deployed) and income/day", () => {
  const out = capitalEfficiency([
    mo({ closedTradeCapital: 10000, capitalDays: 10000, periodDays: 1, optionsPremiumPnl: 400 }),
    mo({ closedTradeCapital: 20000, capitalDays: 20000, periodDays: 1, optionsPremiumPnl: 500 }),
  ]);
  // avg deployed = ΣcapitalDays/ΣperiodDays = 30000/2 = 15000
  // turnover = totalClosed 30000 / 15000 = 2
  expect(out.capitalTurnover).toBeCloseTo(2, 5);
  // income/day = 900 / ΣcapitalDays 30000 = 0.03
  expect(out.incomePerDay).toBeCloseTo(0.03, 5);
});

test("empty -> nulls", () => {
  const out = capitalEfficiency([]);
  expect(out.capitalTurnover).toBeNull();
  expect(out.incomePerDay).toBeNull();
});

test("zero denominators -> null, no NaN", () => {
  const out = capitalEfficiency([
    mo({ closedTradeCapital: 5000, capitalDays: 0, periodDays: 30, optionsPremiumPnl: 100 }),
  ]);
  expect(out.capitalTurnover).toBeNull();
  expect(out.incomePerDay).toBeNull();
});

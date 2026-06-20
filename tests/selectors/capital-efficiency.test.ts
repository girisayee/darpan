import { capitalEfficiency } from "@/lib/selectors/capital-efficiency";
import type { RealizedPnLEvent, MonthlyCapitalReturn } from "@/types/trading";

const ev = (annualizedRoiPercent: number | null, capitalDeployed: number | null): RealizedPnLEvent =>
  ({ annualizedRoiPercent, capitalDeployed } as unknown as RealizedPnLEvent);

const mo = (o: Partial<MonthlyCapitalReturn>): MonthlyCapitalReturn =>
  ({
    closedTradeCapital: 0,
    averageDeployedCapital: 0,
    optionsPremiumPnl: 0,
    capitalDays: 0,
    ...o,
  } as MonthlyCapitalReturn);

test("capital-weighted annualized ROC, turnover, income/day", () => {
  const out = capitalEfficiency(
    [ev(20, 10000), ev(40, 5000)],
    [
      mo({ closedTradeCapital: 10000, averageDeployedCapital: 10000, optionsPremiumPnl: 400, capitalDays: 200 }),
      mo({ closedTradeCapital: 20000, averageDeployedCapital: 20000, optionsPremiumPnl: 500, capitalDays: 100 }),
    ],
  );
  // weighted ROC = (20*10000 + 40*5000) / 15000 = 26.666...
  expect(out.annualizedRoc).toBeCloseTo(26.6667, 3);
  // turnover = 30000 / mean(10000,20000)=15000 = 2
  expect(out.capitalTurnover).toBeCloseTo(2, 5);
  // income/day = 900 / 300 = 3
  expect(out.incomePerDay).toBeCloseTo(3, 5);
});

test("ignores events lacking ann ROC or capital; empty -> nulls", () => {
  const out = capitalEfficiency([ev(null, 1000), ev(30, null)], []);
  expect(out.annualizedRoc).toBeNull();
  expect(out.capitalTurnover).toBeNull();
  expect(out.incomePerDay).toBeNull();
});

test("zero denominators -> null, no NaN", () => {
  const out = capitalEfficiency(
    [],
    [mo({ closedTradeCapital: 5000, averageDeployedCapital: 0, optionsPremiumPnl: 100, capitalDays: 0 })],
  );
  expect(out.capitalTurnover).toBeNull();
  expect(out.incomePerDay).toBeNull();
});

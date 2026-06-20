import { wheelAnalytics } from "@/lib/selectors/analytics";
import type { CalculationResult } from "@/types/trading";

const result = {
  realizedEvents: [
    { realizedPnl: 300, strategy: "COVERED_CALL", annualizedRoiPercent: 20, capitalDeployed: 10000 },
    { realizedPnl: -100, strategy: "CASH_SECURED_PUT", annualizedRoiPercent: 10, capitalDeployed: 5000 },
    { realizedPnl: -999, strategy: "DATA_ISSUE", annualizedRoiPercent: null, capitalDeployed: null },
  ],
  optionLifecycles: [
    { premiumReceived: 100, netOptionPnl: 80, strategy: "COVERED_CALL", optionType: "call", status: "expired" },
  ],
  monthlyReturns: [
    { closedTradeCapital: 10000, averageDeployedCapital: 10000, optionsPremiumPnl: 80, capitalDays: 40 },
  ],
  aggregates: {
    symbolBreakdown: [{ symbol: "A", capital: 8000 }, { symbol: "B", capital: 2000 }],
    strategyBreakdown: [{ strategy: "COVERED_CALL", capital: 10000 }],
  },
} as unknown as CalculationResult;

test("composes the four selectors and excludes DATA_ISSUE from trade quality", () => {
  const out = wheelAnalytics(result);
  expect(out.tradeQuality.totalTrades).toBe(2); // DATA_ISSUE excluded
  expect(out.premium.captureRate).toBeCloseTo(0.8, 5);
  expect(out.allocation.bySymbol.topShare).toBeCloseTo(0.8, 5);
  expect(out.capitalEfficiency.incomePerDay).toBeCloseTo(2, 5); // 80 / 40
});

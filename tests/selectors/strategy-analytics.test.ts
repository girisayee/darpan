import { describe, it, expect } from "vitest";
import { strategyAnalytics } from "@/lib/selectors/strategy-analytics";
import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";

function ev(strategy: string, realizedPnl: number): RealizedPnLEvent {
  return {
    id: `${strategy}-${realizedPnl}`, date: "2026-06-01", symbol: "X",
    strategy: strategy as RealizedPnLEvent["strategy"], grossProceeds: 0, costBasis: null,
    optionPremium: 0, fees: 0, realizedPnl, quantity: 1, capitalDeployed: null, roiPercent: null,
    annualizedRoiPercent: null, holdingDays: null, linkedTransactionIds: [], explanation: "", warnings: [],
  };
}
function res(events: RealizedPnLEvent[]): CalculationResult {
  return { realizedEvents: events, optionLifecycles: [], taxLots: [] } as unknown as CalculationResult;
}

describe("strategyAnalytics", () => {
  it("scopes events to the swing strategy and sums pnl", () => {
    const out = strategyAnalytics(res([ev("SWING_TRADE", 100), ev("COVERED_CALL", 999)]), "swing");
    expect(out.pnl).toBe(100);
    expect(out.quality.totalTrades).toBe(1);
    expect(out.premium).toBeNull();
  });
  it("includes assignment events under their parent strategy", () => {
    const out = strategyAnalytics(res([ev("CASH_SECURED_PUT", 50), ev("PUT_ASSIGNMENT", -20)]), "csp");
    expect(out.pnl).toBe(30);
    expect(out.quality.totalTrades).toBe(2);
  });
});

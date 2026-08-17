import { describe, it, expect } from "vitest";
import { optionsAnalytics, strategyAnalytics } from "@/lib/selectors/strategy-analytics";
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";

function ev(strategy: string, realizedPnl: number): RealizedPnLEvent {
  return {
    id: `${strategy}-${realizedPnl}`, date: "2026-06-01", symbol: "X",
    strategy: strategy as RealizedPnLEvent["strategy"], grossProceeds: 0, costBasis: null,
    optionPremium: 0, fees: 0, realizedPnl, quantity: 1, capitalDeployed: null, roiPercent: null,
    annualizedRoiPercent: null, holdingDays: null, linkedTransactionIds: [], explanation: "", warnings: [],
  };
}
function lc(partial: Partial<OptionLifecycle>): OptionLifecycle {
  return {
    strategy: "UNKNOWN", status: "closed", optionType: "call", direction: "short",
    premiumReceived: 0, netOptionPnl: 0, capitalDeployed: null, strikePrice: 0, sharesControlled: 0,
    ...partial,
  } as unknown as OptionLifecycle;
}
function res(events: RealizedPnLEvent[], lifecycles: OptionLifecycle[] = []): CalculationResult {
  return { realizedEvents: events, optionLifecycles: lifecycles, taxLots: [] } as unknown as CalculationResult;
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

describe("optionsAnalytics", () => {
  it("aggregates realized P&L across CSP + CC + long, excluding swing", () => {
    const result = res([
      ev("CASH_SECURED_PUT", 150),
      ev("COVERED_CALL", 300),
      ev("LONG_OPTION", 200),
      ev("SWING_TRADE", 250),
    ]);
    expect(optionsAnalytics(result).pnl).toBe(650);
    expect(strategyAnalytics(result, "swing").pnl).toBe(250);
  });

  it("counts only option trades and includes assignment sub-strategies", () => {
    const a = optionsAnalytics(res([
      ev("CASH_SECURED_PUT", 150),
      ev("PUT_ASSIGNMENT", -20),
      ev("COVERED_CALL", 300),
      ev("LONG_OPTION", 200),
      ev("SWING_TRADE", 250),
    ]));
    expect(a.quality.totalTrades).toBe(4);
  });

  it("reports premium collected from short (CSP + CC) lifecycles only", () => {
    const a = optionsAnalytics(res([], [
      lc({ strategy: "CASH_SECURED_PUT", premiumReceived: 150 }),
      lc({ strategy: "COVERED_CALL", premiumReceived: 300 }),
      lc({ strategy: "UNKNOWN", direction: "long", premiumReceived: 0 }),
    ]));
    expect(a.premium).not.toBeNull();
    expect(a.premium?.premiumCollected).toBe(450);
  });

  it("excludes open option premium from realized premium metrics", () => {
    const a = optionsAnalytics(res([], [
      lc({ strategy: "CASH_SECURED_PUT", status: "closed", premiumReceived: 150, netOptionPnl: 100 }),
      lc({ strategy: "COVERED_CALL", status: "open", premiumReceived: 900, netOptionPnl: 900 }),
    ]));
    expect(a.premium?.premiumCollected).toBe(150);
    expect(a.premium?.netOptionPnl).toBe(100);
    expect(a.premium?.counts.total).toBe(1);
  });

  it("sums capital at risk across only OPEN option lifecycles", () => {
    const a = optionsAnalytics(res([], [
      lc({ status: "open", capitalDeployed: 5000 }),
      lc({ status: "closed", capitalDeployed: 9999 }),
    ]));
    expect(a.capitalAtRisk).toBe(5000);
  });

  it("tags the aggregate with key 'options'", () => {
    expect(optionsAnalytics(res([])).key).toBe("options");
  });
});

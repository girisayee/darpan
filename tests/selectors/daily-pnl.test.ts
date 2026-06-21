import { describe, it, expect } from "vitest";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import type { RealizedPnLEvent } from "@/types/trading";

function ev(date: string, realizedPnl: number, strategy = "SWING_TRADE"): RealizedPnLEvent {
  return {
    id: `${date}-${realizedPnl}`, date, symbol: "X", strategy: strategy as RealizedPnLEvent["strategy"],
    grossProceeds: 0, costBasis: null, optionPremium: 0, fees: 0, realizedPnl, quantity: 1,
    capitalDeployed: null, roiPercent: null, annualizedRoiPercent: null, holdingDays: null,
    linkedTransactionIds: [], explanation: "", warnings: [],
  };
}

describe("dailyPnl", () => {
  it("returns [] for no events", () => {
    expect(dailyPnl([])).toEqual([]);
  });
  it("sums multiple events on the same calendar day", () => {
    const out = dailyPnl([ev("2026-06-12", 100), ev("2026-06-12", -40)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: "2026-06-12", pnl: 60 });
    expect(out[0].events).toHaveLength(2);
  });
  it("sorts days ascending and excludes DATA_ISSUE", () => {
    const out = dailyPnl([ev("2026-06-12", 10), ev("2026-01-03", 5), ev("2026-02-02", 999, "DATA_ISSUE")]);
    expect(out.map((d) => d.date)).toEqual(["2026-01-03", "2026-06-12"]);
  });
});

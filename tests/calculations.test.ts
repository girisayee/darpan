import { describe, expect, it } from "vitest";
import { calculateDashboard, calculateMonthlyReturns } from "@/lib/calculations/engine";
import { defaultSettings } from "@/lib/storage/local-store";
import type { CapitalUsage, RealizedPnLEvent } from "@/types/trading";
import { optionTx, stockTx } from "./helpers";

describe("calculation engine", () => {
  it("calculates a basic stock buy/sell realized gain", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10), stockTx("s1", "2025-01-20", "SELL", "AMD", 100, 12)]);
    expect(result.realizedEvents[0].realizedPnl).toBe(200);
    expect(result.realizedEvents[0].roiPercent).toBe(20);
  });

  it("handles partial lot sales", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10), stockTx("s1", "2025-01-20", "SELL", "AMD", 40, 12)]);
    expect(result.realizedEvents[0].costBasis).toBe(400);
    expect(result.taxLots[0].remainingQuantity).toBe(60);
  });

  it("uses FIFO cost basis", () => {
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      stockTx("b2", "2025-01-03", "BUY", "AMD", 100, 20),
      stockTx("s1", "2025-01-20", "SELL", "AMD", 100, 30)
    ]);
    expect(result.realizedEvents[0].costBasis).toBe(1000);
  });

  it("uses LIFO cost basis", () => {
    const result = calculateDashboard(
      [stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10), stockTx("b2", "2025-01-03", "BUY", "AMD", 100, 20), stockTx("s1", "2025-01-20", "SELL", "AMD", 100, 30)],
      { ...defaultSettings, costBasisMethod: "LIFO" }
    );
    expect(result.realizedEvents[0].costBasis).toBe(2000);
  });

  it("uses average cost basis", () => {
    const result = calculateDashboard(
      [stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10), stockTx("b2", "2025-01-03", "BUY", "AMD", 100, 20), stockTx("s1", "2025-01-20", "SELL", "AMD", 100, 30)],
      { ...defaultSettings, costBasisMethod: "AVERAGE" }
    );
    expect(result.realizedEvents[0].costBasis).toBe(1500);
  });

  it("calculates covered call expiration", () => {
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100),
      optionTx("o2", "2025-01-31", "EXPIRATION", "AMD", "call", 12, "2025-01-31", 0)
    ]);
    expect(result.realizedEvents[0].realizedPnl).toBe(100);
    expect(result.realizedEvents[0].roiPercent).toBe(10);
  });

  it("calculates covered call buy-to-close", () => {
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100),
      optionTx("o2", "2025-01-12", "BUY_TO_CLOSE", "AMD", "call", 12, "2025-01-31", -140)
    ]);
    expect(result.realizedEvents[0].realizedPnl).toBe(-40);
  });

  it("calculates covered call assignment with stock gain and premium", () => {
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100),
      optionTx("o2", "2025-01-31", "ASSIGNMENT", "AMD", "call", 12, "2025-01-31", 0)
    ]);
    // Two events emitted: option premium side + stock sale side
    const assignEvent = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT");
    const stockEvent = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT_STOCK");
    expect(assignEvent).toBeDefined();
    expect(stockEvent).toBeDefined();

    // (a) COVERED_CALL_ASSIGNMENT realizedPnl = option premium − fees only
    expect(assignEvent!.realizedPnl).toBe(100); // netOptionPnl(100) − fees(0)
    expect(assignEvent!.grossProceeds).toBe(100); // premiumReceived
    expect(assignEvent!.costBasis).toBe(0);        // closeCost (no BTC)

    // (b) share-sale gain/loss flows into totalStockTradingPnl
    expect(stockEvent!.realizedPnl).toBe(200);  // 1200 proceeds − 1000 cost basis
    expect(result.aggregates.totalStockTradingPnl).toBe(200);

    // (c) no new SWING_TRADE event was created
    const swingCount = result.realizedEvents.filter((e) => e.strategy === "SWING_TRADE").length;
    expect(swingCount).toBe(0);

    // (d) grand total realized P&L is unchanged (300 = 100 premium + 200 stock gain)
    expect(result.aggregates.totalRealizedPnl).toBe(300);
  });

  it("covered-call assignment with fees > 0: no double-counting", () => {
    // SELL_TO_OPEN: premium = $150, fees = $5 → netOptionPnl = 150 − 5 = $145
    // ASSIGNMENT: fees = $2 → netOptionPnl = 150 − 0 (closeCost) − (5+2) = $143
    // stockBuy: 100 shares @ $10 = $1000 cost basis; strike = $12 → proceeds = $1200
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 150, 5),
      optionTx("o2", "2025-01-31", "ASSIGNMENT", "AMD", "call", 12, "2025-01-31", 0, 2)
    ]);
    const assignEvent = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT");
    const stockEvent  = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT_STOCK");
    expect(assignEvent).toBeDefined();
    expect(stockEvent).toBeDefined();

    // (a) COVERED_CALL_ASSIGNMENT.realizedPnl === netOptionPnl (premium − fees, NOT premium − 2×fees)
    // netOptionPnl = 150 − 0 − 7 = 143
    expect(assignEvent!.realizedPnl).toBe(143);

    // (b) COVERED_CALL_ASSIGNMENT_STOCK.realizedPnl === proceeds − costBasis
    // 1200 − 1000 = 200; capitalDeployed/roiPercent must be null (no double-count)
    expect(stockEvent!.realizedPnl).toBe(200);
    expect(stockEvent!.capitalDeployed).toBeNull();
    expect(stockEvent!.roiPercent).toBeNull();

    // (c) grand total = netOptionPnl + (proceeds − costBasis) = 143 + 200 = 343
    // Old buggy total would have been 143 − 7 + 200 = 336 (extra fee subtracted twice)
    expect(result.aggregates.totalRealizedPnl).toBe(343);
  });

  it("calculates cash-secured put expiration return on collateral", () => {
    const result = calculateDashboard([optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "put", 50, "2025-01-31", 150), optionTx("o2", "2025-01-31", "EXPIRATION", "AMD", "put", 50, "2025-01-31", 0)]);
    expect(result.realizedEvents[0].realizedPnl).toBe(150);
    expect(result.realizedEvents[0].roiPercent).toBe(3);
  });

  it("calculates cash-secured put buy-to-close", () => {
    const result = calculateDashboard([optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "put", 50, "2025-01-31", 150), optionTx("o2", "2025-01-12", "BUY_TO_CLOSE", "AMD", "put", 50, "2025-01-31", -40)]);
    expect(result.realizedEvents[0].realizedPnl).toBe(110);
  });

  it("keeps current cash-secured put collateral on open cycles", () => {
    const result = calculateDashboard([optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "put", 50, "2025-01-31", 150)], defaultSettings, new Date("2025-01-15T12:00:00Z"));
    expect(result.realizedEvents).toHaveLength(0);
    expect(result.optionLifecycles[0]).toMatchObject({
      status: "open",
      optionType: "put",
      capitalDeployed: 5000
    });
    expect(result.capitalUsage[0]).toMatchObject({
      strategy: "CASH_SECURED_PUT",
      startDate: "2025-01-03",
      endDate: "2025-01-15",
      amount: 5000
    });
    expect(result.monthlyReturns[0].peakCashSecuredPutCollateral).toBe(5000);
  });

  it("keeps current covered call stock capital on open cycles", () => {
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100)
    ], defaultSettings, new Date("2025-01-15T12:00:00Z"));
    expect(result.realizedEvents).toHaveLength(0);
    expect(result.optionLifecycles[0]).toMatchObject({
      status: "open",
      optionType: "call",
      capitalDeployed: 1000
    });
    expect(result.capitalUsage[0]).toMatchObject({
      strategy: "COVERED_CALL",
      startDate: "2025-01-03",
      endDate: "2025-01-15",
      amount: 1000
    });
    expect(result.monthlyReturns[0].peakCoveredCallCapital).toBe(1000);
  });

  it("shows open June option exposure as peak deployed capital", () => {
    const result = calculateDashboard(
      [
        optionTx("snow-cc", "2026-05-20", "SELL_TO_OPEN", "SNOW", "call", 185, "2026-06-18", 889),
        stockTx("mdb-buy", "2026-05-28", "BUY", "MDB", 100, 323),
        optionTx("mdb-cc", "2026-05-29", "SELL_TO_OPEN", "MDB", "call", 330, "2026-06-05", 1715),
        { ...optionTx("ccj-csp", "2026-05-20", "SELL_TO_OPEN", "CCJ", "put", 106, "2026-06-26", 1706), quantity: 2 },
        optionTx("mod-csp", "2026-06-01", "SELL_TO_OPEN", "MOD", "put", 280, "2026-06-18", 1600)
      ],
      defaultSettings,
      new Date("2026-06-02T12:00:00Z")
    );
    const june = result.monthlyReturns.find((row) => row.year === 2026 && row.month === 6);
    expect(june?.peakCoveredCallCapital).toBe(50800);
    expect(june?.peakCashSecuredPutCollateral).toBe(49200);
    expect(june?.peakDeployedCapital).toBe(100000);
    expect(june?.capitalDays).toBe(200000);
    expect(june?.averageDeployedCapital).toBe(100000);
  });

  it("links same-day option open and close rows even when imported close appears first", () => {
    const result = calculateDashboard([
      optionTx("leu-btc", "2026-05-14", "BUY_TO_CLOSE", "LEU", "put", 190, "2026-05-15", -480.04),
      optionTx("leu-sto", "2026-05-14", "SELL_TO_OPEN", "LEU", "put", 190, "2026-05-15", 499.93)
    ]);
    expect(result.realizedEvents).toHaveLength(1);
    expect(result.realizedEvents[0]).toMatchObject({
      symbol: "LEU",
      strategy: "CASH_SECURED_PUT"
    });
    expect(result.realizedEvents[0].realizedPnl).toBeCloseTo(19.89, 2);
  });

  it("creates adjusted stock basis for cash-secured put assignment", () => {
    const result = calculateDashboard([optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "put", 50, "2025-01-31", 150), optionTx("o2", "2025-01-31", "ASSIGNMENT", "AMD", "put", 50, "2025-01-31", 0)]);
    expect(result.taxLots[0].source).toBe("CASH_SECURED_PUT_ASSIGNMENT");
    expect(result.taxLots[0].costBasisTotal).toBe(4850);
  });

  it("calculates a losing swing trade", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-02", "BUY", "META", 10, 100), stockTx("s1", "2025-01-20", "SELL", "META", 10, 90)]);
    expect(result.realizedEvents[0].realizedPnl).toBe(-100);
  });

  it("includes fees in net P&L", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-02", "BUY", "META", 10, 100), stockTx("s1", "2025-01-20", "SELL", "META", 10, 110, 5)]);
    expect(result.realizedEvents[0].realizedPnl).toBe(95);
  });

  it("calculates monthly capital-days and average deployed capital", () => {
    const events: RealizedPnLEvent[] = [];
    const usage: CapitalUsage[] = [{ id: "c1", strategy: "SWING_TRADE", symbol: "AMD", startDate: "2025-01-01", endDate: "2025-01-15", capitalType: "SWING_TRADE_CAPITAL", amount: 10000, quantity: 100, linkedTransactionIds: [] }];
    const monthly = calculateMonthlyReturns(events, usage);
    expect(monthly[0].capitalDays).toBe(150000);
    expect(monthly[0].averageDeployedCapital).toBeCloseTo(4838.71, 2);
  });

  it("calculates closed trade ROI", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10), stockTx("s1", "2025-01-20", "SELL", "AMD", 100, 12)]);
    expect(result.monthlyReturns[0].closedTradeRoiPercent).toBe(20);
  });

  it("calculates monthly ROI with partial-month capital deployment", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-01", "BUY", "AMD", 100, 100), stockTx("s1", "2025-01-15", "SELL", "AMD", 100, 101)]);
    expect(result.monthlyReturns[0].realizedRoiPercent).toBeCloseTo(2.066, 2);
  });

  it("calculates YTD ROI from YTD average deployed capital instead of summing monthly averages", () => {
    const result = calculateDashboard(
      [stockTx("b1", "2026-01-01", "BUY", "AMD", 100, 10), stockTx("s1", "2026-06-30", "SELL", "AMD", 100, 10.7)],
      defaultSettings,
      new Date("2026-06-30T12:00:00Z")
    );
    const june = result.monthlyReturns.find((row) => row.year === 2026 && row.month === 6);
    expect(june?.realizedRoiPercent).toBeCloseTo(7, 2);
    expect(result.aggregates.ytdRoi).toBeCloseTo(7, 2);
  });

  it("returns N/A-equivalent null ROI when capital is missing", () => {
    const result = calculateDashboard([optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100), optionTx("o2", "2025-01-31", "EXPIRATION", "AMD", "call", 12, "2025-01-31", 0)]);
    expect(result.realizedEvents[0].roiPercent).toBeNull();
    expect(result.realizedEvents[0].warnings).toContain("Option trade could not be linked to underlying stock lot");
  });

  it("calculates annualized ROI", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-01", "BUY", "AMD", 100, 10), stockTx("s1", "2025-01-11", "SELL", "AMD", 100, 11)]);
    expect(result.realizedEvents[0].annualizedRoiPercent).toBeCloseTo(365, 1);
  });

  it("aggregates strategy-level ROI", () => {
    const result = calculateDashboard([stockTx("b1", "2025-01-01", "BUY", "AMD", 100, 10), stockTx("s1", "2025-01-11", "SELL", "AMD", 100, 11)]);
    expect(result.aggregates.strategyBreakdown[0].strategy).toBe("SWING_TRADE");
    expect(result.aggregates.strategyBreakdown[0].roiPercent).toBe(10);
  });

  it("uses manual cost basis for covered call assignments when opening lots are absent", () => {
    const result = calculateDashboard(
      [
        optionTx("o1", "2026-02-01", "SELL_TO_OPEN", "IREN", "call", 35, "2026-02-27", 100),
        optionTx("o2", "2026-02-27", "ASSIGNMENT", "IREN", "call", 35, "2026-02-27", 0)
      ],
      { ...defaultSettings, manualCostBasisPerShare: { IREN: 49.25 } }
    );
    const assignEvent = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT");
    const stockEvent = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT_STOCK");
    expect(assignEvent).toBeDefined();
    expect(stockEvent).toBeDefined();

    // Option-premium event: realizedPnl = netOptionPnl − fees = 100 − 0
    expect(assignEvent!.strategy).toBe("COVERED_CALL_ASSIGNMENT");
    expect(assignEvent!.realizedPnl).toBe(100);
    // closeCost for option = 0 (no BTC); grossProceeds = premiumReceived = 100
    expect(assignEvent!.grossProceeds).toBe(100);

    // Stock-sale event: proceeds(3500) − costBasis(4925) = −1425
    expect(stockEvent!.costBasis).toBe(4925);
    expect(stockEvent!.realizedPnl).toBe(-1425);
    expect(stockEvent!.warnings).toContain("Manual cost basis override used for IREN.");

    // Grand total unchanged: 100 + (−1425) = −1325
    expect(result.aggregates.totalRealizedPnl).toBe(-1325);

    // Share-sale loss flows into totalStockTradingPnl
    expect(result.aggregates.totalStockTradingPnl).toBe(-1425);
  });

  it("uses manual cost basis for stock sells when opening lots are absent", () => {
    const result = calculateDashboard(
      [stockTx("s1", "2026-01-10", "SELL", "PYPL", 10, 80)],
      { ...defaultSettings, manualCostBasisPerShare: { PYPL: 79 }, manualZeroBasisLots: [] }
    );
    expect(result.realizedEvents[0].costBasis).toBe(790);
    expect(result.realizedEvents[0].realizedPnl).toBe(10);
    expect(result.realizedEvents[0].warnings).toContain("Manual cost basis override used for PYPL.");
  });

  it("creates a closed lifecycle for a bought-then-sold (long) option with correct P&L", () => {
    // AMZN call: BTO 1 contract at $3.50/share debit ($350 total), STC at $5.00/share ($500 total)
    // netOptionPnl = $500 − $350 − $0 fees = $150
    const result = calculateDashboard([
      optionTx("bto1", "2025-06-01", "BUY_TO_OPEN", "AMZN", "call", 200, "2025-06-30", -350),
      optionTx("stc1", "2025-06-20", "SELL_TO_CLOSE", "AMZN", "call", 200, "2025-06-30", 500)
    ]);
    expect(result.optionLifecycles).toHaveLength(1);
    const lc = result.optionLifecycles[0];
    expect(lc.direction).toBe("long");
    expect(lc.strategy).toBe("UNKNOWN");
    expect(lc.status).toBe("closed");
    expect(lc.optionType).toBe("call");
    expect(lc.netOptionPnl).toBe(150);
    // After STC, premiumReceived holds the closing proceeds; closeCost holds the open cost
    expect(lc.premiumReceived).toBe(500);
    expect(lc.closeCost).toBe(350);
    // A realized event should be emitted with LONG_OPTION strategy
    expect(result.realizedEvents).toHaveLength(1);
    expect(result.realizedEvents[0].strategy).toBe("LONG_OPTION");
    expect(result.realizedEvents[0].realizedPnl).toBe(150);
  });

  it("creates a losing long option lifecycle (bought call that expires worthless)", () => {
    // BTO for $200 debit, expires worthless → netOptionPnl = −$200
    const result = calculateDashboard([
      optionTx("bto2", "2025-07-01", "BUY_TO_OPEN", "NVDA", "put", 100, "2025-07-31", -200),
      optionTx("exp2", "2025-07-31", "EXPIRATION", "NVDA", "put", 100, "2025-07-31", 0)
    ]);
    expect(result.optionLifecycles).toHaveLength(1);
    const lc = result.optionLifecycles[0];
    expect(lc.direction).toBe("long");
    expect(lc.status).toBe("expired");
    expect(lc.netOptionPnl).toBe(-200);
  });

  it("assigned covered-call lifecycle has assignmentStockPnl and unchanged option P&L", () => {
    // Stock: 100 shares @ $10 = $1000 cost basis. CC strike = $12. Premium = $100.
    // Assignment: proceeds = 12 × 100 = $1200; stockPnl = $1200 − $1000 = $200.
    // netOptionPnl = premium($100) − closeCost($0) − fees($0) = $100 — unchanged.
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100),
      optionTx("o2", "2025-01-31", "ASSIGNMENT", "AMD", "call", 12, "2025-01-31", 0)
    ]);
    const lc = result.optionLifecycles.find((l) => l.status === "assigned");
    expect(lc).toBeDefined();
    // assignmentStockPnl = proceeds(1200) − costBasis(1000)
    expect(lc!.assignmentStockPnl).toBe(200);
    // option-side P&L is unaffected by the share sale
    expect(lc!.netOptionPnl).toBe(100);
    // The COVERED_CALL_ASSIGNMENT_STOCK event carries the same value
    const stockEvent = result.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT_STOCK");
    expect(stockEvent!.realizedPnl).toBe(lc!.assignmentStockPnl);
  });

  it("non-assigned lifecycles have no assignmentStockPnl", () => {
    // Expired CC: no share sale, so assignmentStockPnl should be absent/null.
    const result = calculateDashboard([
      stockTx("b1", "2025-01-02", "BUY", "AMD", 100, 10),
      optionTx("o1", "2025-01-03", "SELL_TO_OPEN", "AMD", "call", 12, "2025-01-31", 100),
      optionTx("o2", "2025-01-31", "EXPIRATION", "AMD", "call", 12, "2025-01-31", 0)
    ]);
    const lc = result.optionLifecycles.find((l) => l.status === "expired");
    expect(lc).toBeDefined();
    expect(lc!.assignmentStockPnl == null).toBe(true);
  });

  it("open-wheels filter excludes long (BTO) lifecycles with status=open", () => {
    // A BTO that has no closing leg stays "open" but must NOT count as a wheel position.
    // Verify direction==="long" on the stranded lifecycle.
    const result = calculateDashboard([
      optionTx("bto1", "2025-06-01", "BUY_TO_OPEN", "AMZN", "call", 200, "2025-09-30", -350)
    ], defaultSettings, new Date("2025-06-15T12:00:00Z"));
    expect(result.optionLifecycles).toHaveLength(1);
    const lc = result.optionLifecycles[0];
    expect(lc.direction).toBe("long");
    expect(lc.status).toBe("open");
    // Active-wheels consumer filters to direction==="short" only — this lc must be excluded.
    const openWheels = result.optionLifecycles.filter(
      (l) => l.status === "open" && l.direction === "short"
    );
    expect(openWheels).toHaveLength(0);
  });

  it("uses a zero cost basis for the PYPL dividend share lot", () => {
    const result = calculateDashboard(
      [stockTx("s1", "2026-01-10", "SELL", "PYPL", 0.11481, 47.5)],
      {
        ...defaultSettings,
        manualCostBasisPerShare: { PYPL: 79 },
        manualZeroBasisLots: [{ symbol: "PYPL", quantity: 0.11481, note: "Dividend share with zero cost basis." }]
      }
    );
    expect(result.realizedEvents[0].costBasis).toBe(0);
    expect(result.realizedEvents[0].realizedPnl).toBeCloseTo(5.453475, 5);
    expect(result.realizedEvents[0].warnings).not.toContain("Missing cost basis");
  });
});

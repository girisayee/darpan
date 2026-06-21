import { describe, expect, it } from "vitest";
import { calculateDashboard, calculateMonthlyReturns } from "@/lib/calculations/engine";
import { filterResult } from "@/lib/selectors/filter-result";
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

  it("produces an unresolved SWING_TRADE event (costBasis null + Missing cost basis warning) for a stock SELL with no opening BUY", () => {
    const result = calculateDashboard([stockTx("s1", "2026-01-10", "SELL", "PYPL", 10, 80)]);
    const event = result.realizedEvents.find((e) => e.strategy === "SWING_TRADE");
    expect(event).toBeDefined();
    expect(event!.costBasis).toBeNull();
    expect(event!.warnings).toContain("Missing cost basis");
    // The warning appears exactly once (deduped).
    expect(event!.warnings.filter((w) => w === "Missing cost basis")).toHaveLength(1);
  });

  it("legacy manual-basis covered call assignment now relies on real opening lots", () => {
    const result = calculateDashboard(
      [
        optionTx("o1", "2026-02-01", "SELL_TO_OPEN", "IREN", "call", 35, "2026-02-27", 100),
        optionTx("o2", "2026-02-27", "ASSIGNMENT", "IREN", "call", 35, "2026-02-27", 0)
      ]
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

    // With no opening stock lot and no manual override, basis is unknown:
    // costBasis is null and the stock-sale P&L falls back to full proceeds.
    expect(stockEvent!.costBasis).toBeNull();
    expect(stockEvent!.realizedPnl).toBe(3500);
    expect(stockEvent!.warnings).toContain("Missing cost basis");

    // Grand total: 100 (premium) + 3500 (proceeds, no basis) = 3600
    expect(result.aggregates.totalRealizedPnl).toBe(3600);

    // Share-sale flows into totalStockTradingPnl
    expect(result.aggregates.totalStockTradingPnl).toBe(3500);
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

  it("counts option fees once when netAmount bakes in fees (importer/manual convention)", () => {
    // The importer and buildManualOpenTransaction set netAmount = gross − fees. The option
    // P&L formulas subtract `fees` separately, so reading netAmount would double-count.
    // Long call: $380 debit + $0.42 fee → loss should be exactly −380.42 (NOT −380.84).
    const bto = {
      ...optionTx("can-bto", "2026-01-05", "BUY_TO_OPEN", "CAN", "call", 1, "2026-01-16", -380, 0.42),
      netAmount: -380.42, // fee baked into net, like the real importer
    };
    const exp = optionTx("can-exp", "2026-01-16", "EXPIRATION", "CAN", "call", 1, "2026-01-16", 0, 0);
    const result = calculateDashboard([bto, exp]);
    const lc = result.optionLifecycles.find((l) => l.underlyingSymbol === "CAN");
    expect(lc!.netOptionPnl).toBeCloseTo(-380.42, 2);
  });

  it("covered call links its prior-year underlying shares and survives a year filter", () => {
    // Shares bought 2025, covered call written + expired 2026. The CC must record the
    // backing share lot so the year filter (which re-runs the engine on a date-filtered
    // tx set) keeps the 2025 purchase and doesn't resurrect the "no underlying lot" warning.
    const txs = [
      stockTx("nflx-buy", "2025-11-14", "BUY", "NFLX", 100, 110),
      optionTx("nflx-cc", "2026-01-05", "SELL_TO_OPEN", "NFLX", "call", 104, "2026-01-30", 100),
      optionTx("nflx-exp", "2026-01-30", "EXPIRATION", "NFLX", "call", 104, "2026-01-30", 0),
    ];
    const base = calculateDashboard(txs, defaultSettings);
    const cc = base.optionLifecycles.find((l) => l.strategy === "COVERED_CALL");
    expect(cc!.linkedTransactionIds).toContain("nflx-buy");
    expect(cc!.warnings).not.toContain("Option trade could not be linked to underlying stock lot");

    const filtered = filterResult(
      base,
      { symbol: "ALL", strategy: "ALL", year: "2026", month: "ALL", account: "ALL" },
      defaultSettings
    );
    const fcc = filtered.optionLifecycles.find((l) => l.strategy === "COVERED_CALL");
    expect(fcc!.warnings).not.toContain("Option trade could not be linked to underlying stock lot");
    expect(fcc!.capitalDeployed).toBe(11000); // 100 shares × $110, preserved across the filter
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

  it("a stock SELL covered by a prior BUY lot resolves with a known cost basis", () => {
    const result = calculateDashboard([
      stockTx("b1", "2026-01-02", "BUY", "PYPL", 10, 79),
      stockTx("s1", "2026-01-10", "SELL", "PYPL", 10, 80)
    ]);
    expect(result.realizedEvents[0].costBasis).toBe(790);
    expect(result.realizedEvents[0].realizedPnl).toBe(10);
    expect(result.realizedEvents[0].warnings).not.toContain("Missing cost basis");
  });

  // ── Key-collision (FIFO queue) tests ────────────────────────────────────────

  it("(a) two STO of the same contract key then two BTC — both lifecycles reach closed", () => {
    // Two separate opens of the same CAN put, followed by two BTC closings.
    // Without the queue fix the second STO would overwrite the first, leaving
    // the first lifecycle permanently at status='open'.
    const result = calculateDashboard([
      optionTx("sto1", "2025-01-05", "SELL_TO_OPEN",  "CAN", "put", 20, "2025-02-21", 120),
      optionTx("sto2", "2025-01-12", "SELL_TO_OPEN",  "CAN", "put", 20, "2025-02-21", 110),
      optionTx("btc1", "2025-01-28", "BUY_TO_CLOSE",  "CAN", "put", 20, "2025-02-21", -30),
      optionTx("btc2", "2025-02-10", "BUY_TO_CLOSE",  "CAN", "put", 20, "2025-02-21", -20)
    ]);
    const lifecycles = result.optionLifecycles;
    expect(lifecycles).toHaveLength(2);
    // Neither lifecycle may remain "open"
    const openCount = lifecycles.filter((lc) => lc.status === "open").length;
    expect(openCount).toBe(0);
    // Both must be closed
    expect(lifecycles.every((lc) => lc.status === "closed")).toBe(true);
    // Total realized P&L = (120−30) + (110−20) = 90 + 90 = 180
    const totalPnl = result.realizedEvents.reduce((acc, e) => acc + e.realizedPnl, 0);
    expect(totalPnl).toBe(180);
  });

  it("(b) STO → BTC → STO again (same key): first closes, second stays open", () => {
    // First open closes correctly; the second open issued after the first close
    // must remain open (no closing leg exists for it).
    const result = calculateDashboard([
      optionTx("sto1", "2025-01-05", "SELL_TO_OPEN",  "AMZN", "put", 180, "2025-01-31", 200),
      optionTx("btc1", "2025-01-20", "BUY_TO_CLOSE",  "AMZN", "put", 180, "2025-01-31", -50),
      optionTx("sto2", "2025-02-03", "SELL_TO_OPEN",  "AMZN", "put", 180, "2025-02-28", 180)
    ], defaultSettings, new Date("2025-02-15T00:00:00Z"));
    const lifecycles = result.optionLifecycles;
    expect(lifecycles).toHaveLength(2);
    const closed = lifecycles.filter((lc) => lc.status === "closed");
    const open   = lifecycles.filter((lc) => lc.status === "open");
    // Exactly one closed (first) and one genuinely open (second)
    expect(closed).toHaveLength(1);
    expect(open).toHaveLength(1);
    // The closed one is the first STO, P&L = 200 − 50 = 150
    expect(closed[0].netOptionPnl).toBe(150);
  });

  it("(c) BTO long and STO short on same key close to their own direction", () => {
    // A long and a short on the same contract key are both open; each must
    // match only its own directional closing leg.
    const result = calculateDashboard([
      optionTx("bto1", "2025-03-01", "BUY_TO_OPEN",  "NFLX", "call", 600, "2025-03-31", -400),
      optionTx("sto1", "2025-03-01", "SELL_TO_OPEN",  "NFLX", "call", 600, "2025-03-31",  300),
      // STC closes the long (BTO)
      optionTx("stc1", "2025-03-20", "SELL_TO_CLOSE", "NFLX", "call", 600, "2025-03-31",  600),
      // BTC closes the short (STO)
      optionTx("btc1", "2025-03-20", "BUY_TO_CLOSE",  "NFLX", "call", 600, "2025-03-31",  -80)
    ]);
    const lifecycles = result.optionLifecycles;
    expect(lifecycles).toHaveLength(2);
    // No lifecycle should be stranded open
    expect(lifecycles.filter((lc) => lc.status === "open")).toHaveLength(0);
    // Both must be closed
    expect(lifecycles.every((lc) => lc.status === "closed")).toBe(true);

    const longLc  = lifecycles.find((lc) => lc.direction === "long");
    const shortLc = lifecycles.find((lc) => lc.direction === "short");
    expect(longLc).toBeDefined();
    expect(shortLc).toBeDefined();
    // Long P&L: proceeds(600) − cost(400) − fees(0) = 200
    expect(longLc!.netOptionPnl).toBe(200);
    // Short P&L: premium(300) − closeCost(80) − fees(0) = 220
    expect(shortLc!.netOptionPnl).toBe(220);
    // Total = 420
    const totalPnl = result.realizedEvents.reduce((acc, e) => acc + e.realizedPnl, 0);
    expect(totalPnl).toBe(420);
  });
});

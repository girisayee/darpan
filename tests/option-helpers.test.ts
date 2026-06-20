import { describe, expect, it } from "vitest";
import {
  lifecycleToEvent,
  inferOpenerAction,
  buildManualOpenTransaction,
} from "@/lib/utils/option-helpers";
import { calculateDashboard } from "@/lib/calculations/engine";
import { defaultSettings } from "@/lib/storage/local-store";
import type { OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
import { optionTx, stockTx } from "./helpers";

// ── lifecycleToEvent ──────────────────────────────────────────────────────────

function makeLifecycle(overrides: Partial<OptionLifecycle> = {}): OptionLifecycle {
  return {
    id: "opt-test",
    underlyingSymbol: "AMD",
    optionType: "put",
    direction: "short",
    strategy: "CASH_SECURED_PUT",
    openDate: "2025-01-02",
    closeDate: "2025-01-31",
    expirationDate: "2025-01-31",
    strikePrice: 50,
    contracts: 1,
    sharesControlled: 100,
    premiumReceived: 150,
    closeCost: 0,
    fees: 0,
    netOptionPnl: 150,
    capitalDeployed: 5000,
    status: "expired",
    linkedTransactionIds: ["tx-sto", "tx-exp"],
    linkedStockLotIds: [],
    explanation: "Test lifecycle",
    warnings: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<RealizedPnLEvent> = {}): RealizedPnLEvent {
  return {
    id: "pnl-test",
    date: "2025-01-31",
    symbol: "AMD",
    strategy: "CASH_SECURED_PUT",
    grossProceeds: 150,
    costBasis: 0,
    optionPremium: 150,
    fees: 0,
    realizedPnl: 150,
    quantity: 100,
    capitalDeployed: 5000,
    roiPercent: 3,
    annualizedRoiPercent: null,
    holdingDays: 29,
    linkedTransactionIds: ["tx-sto", "tx-exp"],
    explanation: "",
    warnings: [],
    ...overrides,
  };
}

describe("lifecycleToEvent", () => {
  it("returns the real event when linked tx ids intersect", () => {
    const lifecycle = makeLifecycle();
    const event = makeEvent();
    const result = lifecycleToEvent(lifecycle, [event]);
    expect(result).toBe(event);
  });

  it("prefers non-COVERED_CALL_ASSIGNMENT_STOCK over assignment-stock event", () => {
    const lifecycle = makeLifecycle({ linkedTransactionIds: ["tx-sto", "tx-asgn"] });
    const stockEvent = makeEvent({ id: "pnl-stock", strategy: "COVERED_CALL_ASSIGNMENT_STOCK", linkedTransactionIds: ["tx-asgn"] });
    const premiumEvent = makeEvent({ id: "pnl-prem", strategy: "COVERED_CALL_ASSIGNMENT", linkedTransactionIds: ["tx-sto"] });
    const result = lifecycleToEvent(lifecycle, [stockEvent, premiumEvent]);
    expect(result.id).toBe("pnl-prem");
  });

  it("falls back to COVERED_CALL_ASSIGNMENT_STOCK if no other candidate", () => {
    const lifecycle = makeLifecycle({ linkedTransactionIds: ["tx-asgn"] });
    const stockEvent = makeEvent({ id: "pnl-stock", strategy: "COVERED_CALL_ASSIGNMENT_STOCK", linkedTransactionIds: ["tx-asgn"] });
    const result = lifecycleToEvent(lifecycle, [stockEvent]);
    expect(result.id).toBe("pnl-stock");
  });

  it("builds a synthetic event when no events share tx ids", () => {
    const lifecycle = makeLifecycle({ linkedTransactionIds: ["tx-x"] });
    const unrelated = makeEvent({ linkedTransactionIds: ["tx-unrelated"] });
    const result = lifecycleToEvent(lifecycle, [unrelated]);
    // Synthetic event has a derived id
    expect(result.id).toBe("synthetic-opt-test");
    expect(result.symbol).toBe("AMD");
    expect(result.realizedPnl).toBe(150); // netOptionPnl + (assignmentStockPnl ?? 0)
    expect(result.holdingDays).toBe(29);
    expect(result.linkedTransactionIds).toEqual(["tx-x"]);
  });

  it("synthetic fallback has correct shape for expired long option", () => {
    const lifecycle = makeLifecycle({
      direction: "long",
      strategy: "UNKNOWN",
      netOptionPnl: -50,
      linkedTransactionIds: ["tx-bto"],
    });
    const result = lifecycleToEvent(lifecycle, []);
    expect(result.id).toBe("synthetic-opt-test");
    expect(result.strategy).toBe("LONG_OPTION");
    expect(result.realizedPnl).toBe(-50);
  });
});

// ── inferOpenerAction ─────────────────────────────────────────────────────────

describe("inferOpenerAction", () => {
  it("maps SELL_TO_CLOSE → BUY_TO_OPEN", () => {
    expect(inferOpenerAction("SELL_TO_CLOSE")).toBe("BUY_TO_OPEN");
  });

  it("maps BUY_TO_CLOSE → SELL_TO_OPEN", () => {
    expect(inferOpenerAction("BUY_TO_CLOSE")).toBe("SELL_TO_OPEN");
  });

  it("maps EXPIRATION → SELL_TO_OPEN", () => {
    expect(inferOpenerAction("EXPIRATION")).toBe("SELL_TO_OPEN");
  });

  it("maps ASSIGNMENT → SELL_TO_OPEN", () => {
    expect(inferOpenerAction("ASSIGNMENT")).toBe("SELL_TO_OPEN");
  });

  it("maps stock SELL → BUY", () => {
    expect(inferOpenerAction("SELL")).toBe("BUY");
  });
});

// ── buildManualOpenTransaction ────────────────────────────────────────────────

describe("buildManualOpenTransaction", () => {
  const baseInput = {
    baseId: "test-close",
    openDate: "2025-01-02",
    symbol: "AMD",
    underlyingSymbol: "AMD",
    optionType: "put" as const,
    strikePrice: 50,
    expirationDate: "2025-01-31",
    pricePerContract: 1.5,
    contracts: 1,
    fees: 0,
    sourceBroker: "Robinhood",
    accountName: "Test",
  };

  it("SELL_TO_OPEN: grossAmount positive (credit), netAmount = grossAmount - fees", () => {
    const tx = buildManualOpenTransaction({ ...baseInput, action: "SELL_TO_OPEN" });
    // 1.5 per contract × 1 contract × 100 = 150
    expect(tx.grossAmount).toBe(150);
    expect(tx.netAmount).toBe(150); // fees = 0
    expect(tx.action).toBe("SELL_TO_OPEN");
  });

  it("BUY_TO_OPEN: grossAmount negative (debit), netAmount = grossAmount - fees", () => {
    const tx = buildManualOpenTransaction({ ...baseInput, action: "BUY_TO_OPEN" });
    expect(tx.grossAmount).toBe(-150);
    expect(tx.netAmount).toBe(-150);
    expect(tx.action).toBe("BUY_TO_OPEN");
  });

  it("fees reduce netAmount correctly for SELL_TO_OPEN", () => {
    const tx = buildManualOpenTransaction({ ...baseInput, action: "SELL_TO_OPEN", fees: 5 });
    expect(tx.grossAmount).toBe(150);
    expect(tx.netAmount).toBe(145); // 150 - 5
    expect(tx.fees).toBe(5);
  });

  it("fees reduce netAmount correctly for BUY_TO_OPEN", () => {
    const tx = buildManualOpenTransaction({ ...baseInput, action: "BUY_TO_OPEN", fees: 5 });
    expect(tx.grossAmount).toBe(-150);
    expect(tx.netAmount).toBe(-155); // -150 - 5
  });

  it("inherits correct matcher-key fields", () => {
    const tx = buildManualOpenTransaction({ ...baseInput, action: "SELL_TO_OPEN" });
    expect(tx.symbol).toBe("AMD");
    expect(tx.optionType).toBe("put");
    expect(tx.strikePrice).toBe(50);
    expect(tx.expirationDate).toBe("2025-01-31");
    expect(tx.instrumentType).toBe("option");
    expect(tx.importBatchId).toBe("manual");
    expect(tx.tags).toContain("manual");
    expect(tx.status).toBe("normalized");
    expect(tx.id).toMatch(/^manual-/);
  });

  it("quantity equals contracts input", () => {
    const tx = buildManualOpenTransaction({ ...baseInput, action: "SELL_TO_OPEN", contracts: 3 });
    expect(tx.quantity).toBe(3);
    expect(tx.grossAmount).toBe(450); // 1.5 × 3 × 100
  });

  it("stock path: builds a BUY stock opener with correct fields and debit signs", () => {
    const tx = buildManualOpenTransaction({
      kind: "stock",
      baseId: "sell-close",
      openDate: "2025-01-02",
      symbol: "AMD",
      underlyingSymbol: "AMD",
      action: "BUY",
      pricePerShare: 10,
      shares: 100,
      fees: 0,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });
    expect(tx.instrumentType).toBe("stock");
    expect(tx.action).toBe("BUY");
    expect(tx.optionType).toBeNull();
    expect(tx.strikePrice).toBeUndefined();
    expect(tx.expirationDate).toBeUndefined();
    expect(tx.quantity).toBe(100);
    expect(tx.price).toBe(10);
    // BUY is a debit: gross negative, net = gross − fees (still negative)
    expect(tx.grossAmount).toBe(-1000);
    expect(tx.netAmount).toBe(-1000);
    expect(tx.importBatchId).toBe("manual");
    expect(tx.tags).toContain("manual");
    expect(tx.id).toMatch(/^manual-/);
  });

  it("stock path: fees increase the debit magnitude of netAmount", () => {
    const tx = buildManualOpenTransaction({
      kind: "stock",
      baseId: "sell-close",
      openDate: "2025-01-02",
      symbol: "AMD",
      underlyingSymbol: "AMD",
      action: "BUY",
      pricePerShare: 10,
      shares: 100,
      fees: 5,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });
    expect(tx.grossAmount).toBe(-1000);
    expect(tx.netAmount).toBe(-1005); // −1000 − 5
    expect(tx.fees).toBe(5);
  });
});

// ── HIGH-VALUE INTEGRATION TEST: orphan stock sell + manual buy opener resolves ─

describe("integration: orphan stock sell + manual buy opener resolves", () => {
  it("stock SELL with no prior BUY is unresolved (costBasis null), then resolves after adding the opener", () => {
    const sell = stockTx("sell-1", "2025-02-15", "SELL", "AMD", 100, 12);

    // Before: orphan SELL → SWING_TRADE with costBasis null
    const before = calculateDashboard([sell], defaultSettings);
    const orphanEvent = before.realizedEvents.find((e) => e.strategy === "SWING_TRADE");
    expect(orphanEvent).toBeDefined();
    expect(orphanEvent!.costBasis).toBeNull();
    expect(orphanEvent!.warnings).toContain("Missing cost basis");

    // Add the manual BUY opener before the sell date
    const opener = buildManualOpenTransaction({
      kind: "stock",
      baseId: "sell-1",
      openDate: "2025-01-15",
      symbol: "AMD",
      underlyingSymbol: "AMD",
      action: "BUY",
      pricePerShare: 10,
      shares: 100,
      fees: 0,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });

    // After: SELL now has a known basis and the expected P&L (proceeds − basis − fees)
    const after = calculateDashboard([opener, sell], defaultSettings);
    const resolved = after.realizedEvents.find((e) => e.strategy === "SWING_TRADE");
    expect(resolved).toBeDefined();
    expect(resolved!.costBasis).toBe(1000); // 100 × 10
    // proceeds 1200 − basis 1000 − fees 0 = 200
    expect(resolved!.realizedPnl).toBe(200);
    expect(resolved!.warnings).not.toContain("Missing cost basis");
  });
});

// ── HIGH-VALUE INTEGRATION TEST: orphan close + manual opener resolves ────────

describe("integration: orphan close + manual opener resolves cycle", () => {
  it("confirms orphan close is unresolved before adding opener", () => {
    // An EXPIRATION with no matching STO is an orphan close
    const result = calculateDashboard([
      optionTx("exp-1", "2025-01-31", "EXPIRATION", "AMD", "put", 50, "2025-01-31", 0),
    ], defaultSettings);

    // Should produce a DATA_ISSUE event (unresolved option close)
    const dataIssue = result.realizedEvents.find((e) => e.strategy === "DATA_ISSUE");
    expect(dataIssue).toBeDefined();

    // The orphan lifecycle should be absent (no lifecycle without opener)
    const closedLifecycles = result.optionLifecycles.filter(
      (l) => l.status === "closed" || l.status === "expired"
    );
    expect(closedLifecycles).toHaveLength(0);
  });

  it("adding the manual opener via buildManualOpenTransaction resolves the cycle", () => {
    const expiration = optionTx("exp-1", "2025-01-31", "EXPIRATION", "AMD", "put", 50, "2025-01-31", 0);

    // Build the manual STO opener that matches the EXPIRATION's key
    const manualOpener = buildManualOpenTransaction({
      baseId: "exp-1",
      openDate: "2025-01-02",
      symbol: "AMD",
      underlyingSymbol: "AMD",
      optionType: "put",
      strikePrice: 50,
      expirationDate: "2025-01-31",
      action: "SELL_TO_OPEN",
      pricePerContract: 1.5,
      contracts: 1,
      fees: 0,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });

    // Run the engine with both transactions
    const result = calculateDashboard([manualOpener, expiration], defaultSettings);

    // DATA_ISSUE should be gone
    const dataIssue = result.realizedEvents.find((e) => e.strategy === "DATA_ISSUE");
    expect(dataIssue).toBeUndefined();

    // Should now have one expired/closed lifecycle
    const closedLifecycles = result.optionLifecycles.filter(
      (l) => l.status === "expired" || l.status === "closed"
    );
    expect(closedLifecycles).toHaveLength(1);

    const lifecycle = closedLifecycles[0];
    expect(lifecycle.status).toBe("expired");
    // Premium received = 1.5 × 1 × 100 = 150; kept on expiration
    expect(lifecycle.netOptionPnl).toBe(150);
    // netOptionPnl = premiumReceived - fees = 150 - 0
    expect(lifecycle.premiumReceived).toBe(150);

    // The realized P&L event should reflect the full premium
    const optionEvent = result.realizedEvents.find(
      (e) => e.strategy === "CASH_SECURED_PUT"
    );
    expect(optionEvent).toBeDefined();
    expect(optionEvent!.realizedPnl).toBe(150);
  });

  it("a SELL_TO_CLOSE orphan with a BUY_TO_OPEN opener resolves as a closed long", () => {
    // STC without a matching BTO is an orphan
    const stc = optionTx("stc-1", "2025-02-15", "SELL_TO_CLOSE", "AAPL", "call", 200, "2025-03-01", 300);

    const manualBTO = buildManualOpenTransaction({
      baseId: "stc-1",
      openDate: "2025-01-15",
      symbol: "AAPL",
      underlyingSymbol: "AAPL",
      optionType: "call",
      strikePrice: 200,
      expirationDate: "2025-03-01",
      action: "BUY_TO_OPEN",
      pricePerContract: 2.0, // $200 debit
      contracts: 1,
      fees: 0,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });

    const result = calculateDashboard([manualBTO, stc], defaultSettings);

    // No unresolved
    const dataIssue = result.realizedEvents.find((e) => e.strategy === "DATA_ISSUE");
    expect(dataIssue).toBeUndefined();

    // Should have one closed lifecycle
    const closed = result.optionLifecycles.filter((l) => l.status === "closed");
    expect(closed).toHaveLength(1);
    // Net P&L: proceeds 300 - cost 200 = +100
    expect(closed[0].netOptionPnl).toBe(100);
  });
});

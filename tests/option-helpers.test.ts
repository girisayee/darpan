import { describe, expect, it } from "vitest";
import {
  inferOpenerAction,
  buildManualOpenTransaction,
  lifecycleShareDetail,
} from "@/lib/utils/option-helpers";
import { calculateDashboard } from "@/lib/calculations/engine";
import { defaultSettings } from "@/lib/storage/local-store";
import type { OptionLifecycle, RealizedPnLEvent, TaxLot } from "@/types/trading";
import { optionTx, stockTx } from "./helpers";

// ── lifecycleShareDetail (pure) ───────────────────────────────────────────────

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

describe("lifecycleShareDetail", () => {
  it("CC called-away with known basis → P&L and ROI off the stock event", () => {
    const lc = makeLifecycle({
      id: "opt-cc",
      optionType: "call",
      direction: "short",
      strategy: "COVERED_CALL",
      strikePrice: 48,
      contracts: 2,
      sharesControlled: 200,
      status: "assigned",
    });
    // proceeds = 48 × 200 = 9600; basis 9850 → pnl −250
    const stockEvent = makeEvent({
      id: "pnl-opt-cc-assignment-stock",
      strategy: "COVERED_CALL_ASSIGNMENT_STOCK",
      grossProceeds: 9600,
      costBasis: 9850,
      realizedPnl: -250,
      quantity: 200,
    });

    const detail = lifecycleShareDetail(lc, [stockEvent], []);
    expect(detail).not.toBeNull();
    expect(detail!.kind).toBe("called-away");
    if (detail!.kind === "called-away") {
      expect(detail!.shares).toBe(200);
      expect(detail!.costBasis).toBe(9850);
      expect(detail!.proceeds).toBe(9600);
      expect(detail!.pnl).toBe(-250);
      expect(detail!.roiPercent).toBeCloseTo((-250 / 9850) * 100, 6);
      expect(detail!.basisMissing).toBe(false);
    }
  });

  it("CC called-away with missing basis → basisMissing true, roi null", () => {
    const lc = makeLifecycle({
      id: "opt-cc",
      optionType: "call",
      direction: "short",
      strategy: "COVERED_CALL",
      strikePrice: 48,
      contracts: 2,
      sharesControlled: 200,
      status: "assigned",
    });
    const stockEvent = makeEvent({
      id: "pnl-opt-cc-assignment-stock",
      strategy: "COVERED_CALL_ASSIGNMENT_STOCK",
      grossProceeds: 9600,
      costBasis: null,
      realizedPnl: 9600, // inflated: basis fell back to 0
      quantity: 200,
    });

    const detail = lifecycleShareDetail(lc, [stockEvent], []);
    expect(detail!.kind).toBe("called-away");
    if (detail!.kind === "called-away") {
      expect(detail!.costBasis).toBeNull();
      expect(detail!.proceeds).toBe(9600);
      expect(detail!.pnl).toBe(9600);
      expect(detail!.roiPercent).toBeNull();
      expect(detail!.basisMissing).toBe(true);
    }
  });

  it("put assigned → acquired shares with effective basis from the lot", () => {
    const lc = makeLifecycle({
      id: "opt-csp",
      optionType: "put",
      direction: "short",
      strategy: "CASH_SECURED_PUT",
      status: "assigned",
    });
    const lot = {
      id: "lot-opt-csp-assignment",
      symbol: "AMD",
      source: "CASH_SECURED_PUT_ASSIGNMENT",
      originalQuantity: 100,
      costBasisTotal: 4850,
      costBasisPerShare: 48.5,
      linkedTransactionIds: ["tx-sto"],
    } as unknown as TaxLot;

    const detail = lifecycleShareDetail(lc, [], [lot]);
    expect(detail!.kind).toBe("acquired");
    if (detail!.kind === "acquired") {
      expect(detail!.shares).toBe(100);
      expect(detail!.costBasisTotal).toBe(4850);
      expect(detail!.costBasisPerShare).toBe(48.5);
    }
  });

  it("non-assigned lifecycle → null", () => {
    const expired = makeLifecycle({ status: "expired" });
    expect(lifecycleShareDetail(expired, [], [])).toBeNull();
    const closed = makeLifecycle({ status: "closed", optionType: "call" });
    expect(lifecycleShareDetail(closed, [], [])).toBeNull();
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

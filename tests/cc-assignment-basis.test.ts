import { describe, expect, it } from "vitest";
import { calculateDashboard } from "@/lib/calculations/engine";
import { assignmentShareDetail, buildManualOpenTransaction, lifecycleShareDetail } from "@/lib/utils/option-helpers";
import { buildOrphanRows } from "@/components/dashboard/ReviewFixPanel";
import { defaultSettings } from "@/lib/storage/local-store";
import type { RealizedPnLEvent, TaxLot, TradeTransaction } from "@/types/trading";

// Build a multi-contract option transaction (the optionTx test helper hardcodes
// quantity:1; a covered call over 200 shares needs 2 contracts).
function ccOptionTx(
  id: string,
  date: string,
  action: "SELL_TO_OPEN" | "ASSIGNMENT" | "EXPIRATION",
  symbol: string,
  strike: number,
  expiration: string,
  contracts: number,
  amount: number,
  fees = 0
): TradeTransaction {
  return {
    id,
    sourceBroker: "Robinhood",
    accountName: "Test",
    tradeDate: date,
    settlementDate: date,
    symbol,
    underlyingSymbol: symbol,
    instrumentType: "option",
    action,
    quantity: contracts,
    price: Math.abs(amount) / (contracts * 100),
    grossAmount: amount,
    fees,
    netAmount: amount,
    optionType: "call",
    strikePrice: strike,
    expirationDate: expiration,
    rawDescription: `${action} ${symbol} ${strike}C ${expiration}`,
    importBatchId: "test",
    tags: [],
    status: "normalized",
  };
}

// ── HIGH-VALUE INTEGRATION TEST: covered-call assignment missing share basis ──
//
// Mirrors the IREN case: a covered call (SELL_TO_OPEN call) + ASSIGNMENT with NO
// underlying stock BUY produces an inflated stock P&L (= strike × shares, because
// cost basis is unknown). Entering the opening share purchase(s) via the
// Review & fix flow resolves it to the correct (here negative) called-away P&L.
describe("integration: covered-call assignment missing share cost basis", () => {
  const STRIKE = 48;
  const CONTRACTS = 2;
  const SHARES = CONTRACTS * 100; // 200
  const PROCEEDS = STRIKE * SHARES; // 9600

  function buildBaseTxs(): TradeTransaction[] {
    return [
      ccOptionTx("o1", "2026-02-01", "SELL_TO_OPEN", "IREN", STRIKE, "2026-02-27", CONTRACTS, 100),
      ccOptionTx("o2", "2026-02-27", "ASSIGNMENT", "IREN", STRIKE, "2026-02-27", CONTRACTS, 0),
    ];
  }

  it("before: stock event has null cost basis and inflated P&L (= proceeds)", () => {
    const before = calculateDashboard(buildBaseTxs(), defaultSettings);

    const stockEvent = before.realizedEvents.find(
      (e) => e.strategy === "COVERED_CALL_ASSIGNMENT_STOCK"
    );
    expect(stockEvent).toBeDefined();
    expect(stockEvent!.costBasis).toBeNull();
    // With no opener, basis falls back to 0 → assignment stock P&L = full proceeds.
    expect(stockEvent!.realizedPnl).toBe(PROCEEDS);
    expect(stockEvent!.warnings).toContain("Missing cost basis");

    const assignedLifecycle = before.optionLifecycles.find(
      (l) => l.status === "assigned"
    );
    expect(assignedLifecycle).toBeDefined();
    expect(assignedLifecycle!.assignmentStockPnl).toBe(PROCEEDS);
  });

  it("after: entering two share-buy lots resolves to the correct (negative) P&L", () => {
    // Two manual BUY lots dated before assignment: 100 @ 49.5 + 100 @ 49 = 9850 basis.
    const lotA = buildManualOpenTransaction({
      kind: "stock",
      baseId: "pnl-opt-o1-assignment-stock-lot0",
      openDate: "2026-01-10",
      symbol: "IREN",
      underlyingSymbol: "IREN",
      action: "BUY",
      pricePerShare: 49.5,
      shares: 100,
      fees: 0,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });
    const lotB = buildManualOpenTransaction({
      kind: "stock",
      baseId: "pnl-opt-o1-assignment-stock-lot1",
      openDate: "2026-01-15",
      symbol: "IREN",
      underlyingSymbol: "IREN",
      action: "BUY",
      pricePerShare: 49,
      shares: 100,
      fees: 0,
      sourceBroker: "Robinhood",
      accountName: "Test",
    });

    const BASIS = 100 * 49.5 + 100 * 49; // 9850
    const after = calculateDashboard([...buildBaseTxs(), lotA, lotB], defaultSettings);

    const stockEvent = after.realizedEvents.find(
      (e) => e.strategy === "COVERED_CALL_ASSIGNMENT_STOCK"
    );
    expect(stockEvent).toBeDefined();
    expect(stockEvent!.costBasis).toBe(BASIS); // 9850, not null
    expect(stockEvent!.realizedPnl).toBe(PROCEEDS - BASIS); // 9600 − 9850 = −250 (loss)
    expect(stockEvent!.warnings).not.toContain("Missing cost basis");

    const assignedLifecycle = after.optionLifecycles.find(
      (l) => l.status === "assigned"
    );
    expect(assignedLifecycle).toBeDefined();
    expect(assignedLifecycle!.assignmentStockPnl).toBe(PROCEEDS - BASIS);

    // The consumed share lots are folded into the lifecycle's linked tx ids so the
    // "manual" badge picks them up.
    expect(assignedLifecycle!.linkedTransactionIds).toContain(lotA.id);
    expect(assignedLifecycle!.linkedTransactionIds).toContain(lotB.id);

    // No open lots remain for that symbol (all 200 shares were called away).
    const openLots = after.taxLots.filter(
      (l) => l.symbol === "IREN" && l.remainingQuantity > 0
    );
    expect(openLots).toHaveLength(0);
  });

  it("orphan detection: buildOrphanRows surfaces the missing-basis assignment", () => {
    const before = calculateDashboard(buildBaseTxs(), defaultSettings);
    const rows = buildOrphanRows(before);

    const ccRow = rows.find((r) => r.symbol === "IREN" && r.kind === "stock");
    expect(ccRow).toBeDefined();
    expect(ccRow!.qty).toBe(SHARES); // shares called away
    expect(ccRow!.date).toBe("2026-02-27"); // assignment date
    expect(ccRow!.reason).toMatch(/covered-call assignment/i);
  });

  it("drawer: assignmentShareDetail surfaces called-away share basis, P&L, and ROI", () => {
    const lotA = buildManualOpenTransaction({
      kind: "stock", baseId: "lotA", openDate: "2026-01-10", symbol: "IREN",
      underlyingSymbol: "IREN", action: "BUY", pricePerShare: 49.5, shares: 100,
      fees: 0, sourceBroker: "Robinhood", accountName: "Test",
    });
    const lotB = buildManualOpenTransaction({
      kind: "stock", baseId: "lotB", openDate: "2026-01-15", symbol: "IREN",
      underlyingSymbol: "IREN", action: "BUY", pricePerShare: 49, shares: 100,
      fees: 0, sourceBroker: "Robinhood", accountName: "Test",
    });
    const after = calculateDashboard([...buildBaseTxs(), lotA, lotB], defaultSettings);

    // assignmentShareDetail accepts the option-premium (COVERED_CALL_ASSIGNMENT) event.
    const premiumEvent = after.realizedEvents.find((e) => e.strategy === "COVERED_CALL_ASSIGNMENT");
    expect(premiumEvent).toBeDefined();

    const detail = assignmentShareDetail(premiumEvent!, after.realizedEvents, after.taxLots);
    expect(detail).not.toBeNull();
    expect(detail!.kind).toBe("called-away");
    if (detail!.kind === "called-away") {
      expect(detail!.shares).toBe(SHARES); // 200
      expect(detail!.costBasis).toBe(9850);
      expect(detail!.proceeds).toBe(PROCEEDS); // 9600
      expect(detail!.pnl).toBe(PROCEEDS - 9850); // −250
      expect(detail!.roiPercent).toBeCloseTo(((PROCEEDS - 9850) / 9850) * 100, 6);
    }
  });

  it("drawer (lifecycle-driven): lifecycleShareDetail returns resolved called-away numbers", () => {
    const lotA = buildManualOpenTransaction({
      kind: "stock", baseId: "lotA", openDate: "2026-01-10", symbol: "IREN",
      underlyingSymbol: "IREN", action: "BUY", pricePerShare: 49.5, shares: 100,
      fees: 0, sourceBroker: "Robinhood", accountName: "Test",
    });
    const lotB = buildManualOpenTransaction({
      kind: "stock", baseId: "lotB", openDate: "2026-01-15", symbol: "IREN",
      underlyingSymbol: "IREN", action: "BUY", pricePerShare: 49, shares: 100,
      fees: 0, sourceBroker: "Robinhood", accountName: "Test",
    });
    const after = calculateDashboard([...buildBaseTxs(), lotA, lotB], defaultSettings);

    const assignedLifecycle = after.optionLifecycles.find((l) => l.status === "assigned");
    expect(assignedLifecycle).toBeDefined();

    const detail = lifecycleShareDetail(assignedLifecycle!, after.realizedEvents, after.taxLots);
    expect(detail).not.toBeNull();
    expect(detail!.kind).toBe("called-away");
    if (detail!.kind === "called-away") {
      expect(detail!.shares).toBe(SHARES); // 200
      expect(detail!.costBasis).toBe(9850);
      expect(detail!.proceeds).toBe(PROCEEDS); // 9600
      expect(detail!.pnl).toBe(PROCEEDS - 9850); // −250
      expect(detail!.roiPercent).toBeCloseTo(((PROCEEDS - 9850) / 9850) * 100, 6);
      expect(detail!.basisMissing).toBe(false);
    }
  });

  it("drawer (lifecycle-driven, basisMissing): inflated proceeds-only, basisMissing flag set", () => {
    const before = calculateDashboard(buildBaseTxs(), defaultSettings);
    const assignedLifecycle = before.optionLifecycles.find((l) => l.status === "assigned");
    expect(assignedLifecycle).toBeDefined();

    const detail = lifecycleShareDetail(assignedLifecycle!, before.realizedEvents, before.taxLots);
    expect(detail!.kind).toBe("called-away");
    if (detail!.kind === "called-away") {
      expect(detail!.costBasis).toBeNull();
      expect(detail!.proceeds).toBe(PROCEEDS); // 9600
      expect(detail!.pnl).toBe(PROCEEDS); // inflated: basis fell back to 0
      expect(detail!.roiPercent).toBeNull();
      expect(detail!.basisMissing).toBe(true);
    }
  });
});

describe("assignmentShareDetail: put assignment + non-assignment", () => {
  it("put assignment → acquired shares with effective cost basis from the lot", () => {
    const putEvent = {
      id: "pnl-csp1-put-assignment",
      strategy: "PUT_ASSIGNMENT",
      linkedTransactionIds: ["p1", "p2"],
    } as unknown as RealizedPnLEvent;
    const lot = {
      id: "lot-csp1-assignment",
      symbol: "ABC",
      source: "CASH_SECURED_PUT_ASSIGNMENT",
      originalQuantity: 100,
      costBasisTotal: 4500,
      costBasisPerShare: 45,
      linkedTransactionIds: ["p1"],
    } as unknown as TaxLot;

    const detail = assignmentShareDetail(putEvent, [], [lot]);
    expect(detail).not.toBeNull();
    expect(detail!.kind).toBe("acquired");
    if (detail!.kind === "acquired") {
      expect(detail!.shares).toBe(100);
      expect(detail!.costBasisTotal).toBe(4500);
      expect(detail!.costBasisPerShare).toBe(45);
    }
  });

  it("non-assignment event → null", () => {
    const swing = { id: "pnl-x", strategy: "SWING_TRADE", linkedTransactionIds: [] } as unknown as RealizedPnLEvent;
    expect(assignmentShareDetail(swing, [], [])).toBeNull();
  });
});

// Regression: covered calls that EXPIRED (never assigned) but were written against shares
// that were never imported must still be surfaced as fixable — one row per symbol, since
// sequential covered calls share the same underlying block of shares.
describe("buildOrphanRows: expired covered call missing underlying shares", () => {
  it("surfaces ONE stock orphan per symbol (not one per call)", () => {
    const txs: TradeTransaction[] = [
      ccOptionTx("c1", "2026-01-05", "SELL_TO_OPEN", "NFLX", 104, "2026-01-30", 2, 200),
      ccOptionTx("c1x", "2026-01-30", "EXPIRATION", "NFLX", 104, "2026-01-30", 2, 0),
      ccOptionTx("c2", "2026-02-02", "SELL_TO_OPEN", "NFLX", 101, "2026-02-27", 2, 150),
      ccOptionTx("c2x", "2026-02-27", "EXPIRATION", "NFLX", 101, "2026-02-27", 2, 0),
    ];
    const result = calculateDashboard(txs, defaultSettings);
    const rows = buildOrphanRows(result).filter((r) => r.symbol === "NFLX");

    expect(rows).toHaveLength(1); // not 2 — sequential CCs share the same 200 shares
    expect(rows[0].kind).toBe("stock");
    expect(rows[0].qty).toBe(200); // max sharesControlled
    expect(rows[0].date).toBe("2026-01-05"); // earliest CC open — opener must predate it
    expect(rows[0].reason).toMatch(/covered call/i);
  });
});

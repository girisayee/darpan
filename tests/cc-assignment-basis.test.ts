import { describe, expect, it } from "vitest";
import { calculateDashboard } from "@/lib/calculations/engine";
import { buildManualOpenTransaction } from "@/lib/utils/option-helpers";
import { buildOrphanRows } from "@/components/dashboard/ReviewFixPanel";
import { defaultSettings } from "@/lib/storage/local-store";
import type { TradeTransaction } from "@/types/trading";

// Build a multi-contract option transaction (the optionTx test helper hardcodes
// quantity:1; a covered call over 200 shares needs 2 contracts).
function ccOptionTx(
  id: string,
  date: string,
  action: "SELL_TO_OPEN" | "ASSIGNMENT",
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
});

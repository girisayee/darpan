import { describe, expect, it } from "vitest";
import {
  createStockLotLedger,
  estimateTaxes,
  findPotentialWashSaleCandidates,
  summarizeTaxYear,
} from "@/lib/tax";
import { normalizeAppSettings } from "@/lib/storage/local-store";
import { stockTx } from "./helpers";

describe("Taxes workspace calculations", () => {
  it("fills in tax assumptions for settings saved before Taxes existed", () => {
    const restored = normalizeAppSettings({ showSampleData: true });

    expect(restored.taxEstimate.confirmed).toBe(false);
    expect(restored.taxEstimate.taxableAccountIds).toEqual([]);
    expect(restored.showSampleData).toBe(false);
  });

  it("keeps FIFO stock basis isolated by account", () => {
    const ledger = createStockLotLedger([
      { ...stockTx("a-buy", "2026-01-02", "BUY", "XYZ", 10, 100), accountId: "taxable-a" },
      { ...stockTx("b-buy", "2026-01-03", "BUY", "XYZ", 10, 200), accountId: "taxable-b" },
      { ...stockTx("a-sell", "2026-02-01", "SELL", "XYZ", 10, 150), accountId: "taxable-a" },
    ]);

    expect(ledger.dispositions).toHaveLength(1);
    expect(ledger.dispositions[0]).toMatchObject({
      account: { accountId: "taxable-a" },
      costBasisCents: 100_000,
      proceedsCents: 150_000,
      gainLossCents: 50_000,
      term: "SHORT_TERM",
    });
    expect(ledger.lots.find((lot) => lot.account.accountId === "taxable-b")?.remainingQuantity).toBe(10);
  });

  it("nets long-term losses against short-term gains before estimating components", () => {
    const ledger = createStockLotLedger([
      stockTx("short-buy", "2026-01-02", "BUY", "XYZ", 100, 100),
      stockTx("short-sell", "2026-03-02", "SELL", "XYZ", 100, 200),
      stockTx("long-buy", "2024-01-02", "BUY", "ABC", 100, 100),
      stockTx("long-sell", "2026-03-02", "SELL", "ABC", 100, 80),
    ]);
    const summary = summarizeTaxYear(ledger.dispositions, 2026);
    const estimate = estimateTaxes(summary, {
      shortTermFederalRatePercent: 24,
      longTermFederalRatePercent: 15,
      filingStatus: "SINGLE",
      projectedMagiCents: 30_000_000,
      otherNetInvestmentIncomeCents: 0,
      stateLocalEffectiveRatePercent: 4,
    });

    expect(summary.shortTerm.netGainLossCents).toBe(1_000_000);
    expect(summary.longTerm.netGainLossCents).toBe(-200_000);
    expect(estimate.taxableShortTermGainCents).toBe(800_000);
    expect(estimate.taxableLongTermGainCents).toBe(0);
    expect(estimate.federalCents).toBe(192_000);
    expect(estimate.niitCents).toBe(30_400);
    expect(estimate.stateLocalCents).toBe(32_000);
    expect(estimate.totalTaxCents).toBe(254_400);
  });

  it("flags potential wash sales without adjusting the estimated loss", () => {
    const transactions = [
      { ...stockTx("buy", "2026-01-02", "BUY", "XYZ", 10, 100), accountId: "taxable-a" },
      { ...stockTx("sell", "2026-01-15", "SELL", "XYZ", 10, 80), accountId: "taxable-a" },
      { ...stockTx("replacement", "2026-02-10", "BUY", "XYZ", 10, 90), accountId: "taxable-a" },
      { ...stockTx("other-account", "2026-02-10", "BUY", "XYZ", 10, 90), accountId: "taxable-b" },
    ];
    const ledger = createStockLotLedger(transactions);
    const candidates = findPotentialWashSaleCandidates(ledger.dispositions, transactions);
    const summary = summarizeTaxYear(ledger.dispositions, 2026);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].replacementPurchaseTransactionId).toBe("replacement");
    expect(summary.netCapitalGainLossCents).toBe(-20_000);
  });

  it("excludes a sale with missing basis from the estimate", () => {
    const ledger = createStockLotLedger([stockTx("sell", "2026-05-02", "SELL", "XYZ", 10, 100)]);
    const summary = summarizeTaxYear(ledger.dispositions, 2026);
    const estimate = estimateTaxes(summary, {
      filingStatus: "SINGLE",
      projectedMagiCents: 0,
      otherNetInvestmentIncomeCents: 0,
    });

    expect(summary.includedDispositionCount).toBe(0);
    expect(summary.excludedDispositionCount).toBe(1);
    expect(estimate.incompleteFlags).toContain("UNKNOWN_BASIS_DISPOSITIONS_EXCLUDED");
    expect(estimate.totalTaxCents).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { entrySource, isManualEntry, stampCreatedAt } from "@/lib/entries/entry-meta";
import type { TradeTransaction } from "@/types/trading";

const tx = (over: Partial<TradeTransaction>): TradeTransaction =>
  ({
    id: "t1",
    sourceBroker: "Robinhood",
    accountName: "Main",
    tradeDate: "2026-01-02",
    symbol: "AMD",
    instrumentType: "stock",
    action: "BUY",
    quantity: 1,
    price: 10,
    grossAmount: -10,
    fees: 0,
    netAmount: -10,
    optionType: null,
    rawDescription: "",
    importBatchId: "import-2026-01-02T00:00:00.000Z",
    tags: [],
    status: "normalized",
    ...over,
  }) as TradeTransaction;

describe("entrySource", () => {
  it("labels a manual-batch row as Manual", () => {
    expect(entrySource(tx({ importBatchId: "manual" })).label).toBe("Manual");
  });
  it("labels a manual-tagged row as Manual (even if imported batch)", () => {
    const s = entrySource(tx({ tags: ["manual"] }));
    expect(s.kind).toBe("manual");
    expect(s.label).toBe("Manual");
  });
  it("labels an imported row with its broker", () => {
    const s = entrySource(tx({ sourceBroker: "SoFi" }));
    expect(s).toMatchObject({ kind: "imported", broker: "SoFi", edited: false, label: "SoFi" });
  });
  it("marks an edited imported row", () => {
    const s = entrySource(tx({ sourceBroker: "SoFi", editedAt: "2026-06-27T00:00:00.000Z" }));
    expect(s.edited).toBe(true);
    expect(s.label).toBe("SoFi · edited");
  });
  it("editing a manual row stays Manual (no edited suffix)", () => {
    const s = entrySource(tx({ importBatchId: "manual", editedAt: "2026-06-27T00:00:00.000Z" }));
    expect(s.label).toBe("Manual");
  });
  it("falls back to 'Imported' when broker is blank", () => {
    expect(entrySource(tx({ sourceBroker: "" })).broker).toBe("Imported");
  });
});

describe("isManualEntry", () => {
  it("is true for manual batch or tag, false otherwise", () => {
    expect(isManualEntry(tx({ importBatchId: "manual" }))).toBe(true);
    expect(isManualEntry(tx({ tags: ["manual"] }))).toBe(true);
    expect(isManualEntry(tx({}))).toBe(false);
  });
});

describe("stampCreatedAt", () => {
  it("sets createdAt when missing", () => {
    expect(stampCreatedAt(tx({}), "2026-06-27T12:00:00.000Z").createdAt).toBe("2026-06-27T12:00:00.000Z");
  });
  it("preserves an existing createdAt", () => {
    const r = stampCreatedAt(tx({ createdAt: "2026-01-01T00:00:00.000Z" }), "2026-06-27T12:00:00.000Z");
    expect(r.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

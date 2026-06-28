import { describe, expect, it } from "vitest";
import { parseTransactionsCsv } from "@/lib/import/robinhood";

describe("parseTransactionsCsv — broker-agnostic", () => {
  it("auto-detects Fidelity-style columns and broker", () => {
    const csv = [
      "Run Date,Action,Symbol,Description,Quantity,Price ($),Commission ($),Amount ($)",
      "06/24/2026,YOU BOUGHT,MU,MICRON TECHNOLOGY,10,1000.00,0,-10000.00",
    ].join("\n");
    const p = parseTransactionsCsv(csv);
    expect(p.detectedBroker).toBe("Fidelity");
    expect(p.columnMap.tradeDate).toBe("Run Date");
    expect(p.columnMap.amount).toBe("Amount ($)");
    const row = p.rows[0];
    expect(row.symbol).toBe("MU");
    expect(row.action).toBe("BUY");
    expect(row.quantity).toBe(10);
    expect(row.netAmount).toBeCloseTo(-10000, 2);
  });

  it("normalizes broker action synonyms (sold, reinvestment)", () => {
    const csv = [
      "Date,Action,Symbol,Quantity,Amount",
      "2026-01-02,Sold,AAPL,5,1000",
      "2026-01-03,Reinvestment,VTI,1,-50",
    ].join("\n");
    const p = parseTransactionsCsv(csv);
    expect(p.rows[0].action).toBe("SELL");
    // Dividend reinvestment buys shares — must be BUY, not DIVIDEND.
    expect(p.rows[1].action).toBe("BUY");
  });

  it("lets an explicit columnMap override auto-detection", () => {
    const csv = ["When,What,Ticker,Shares,Net", "2026-02-01,buy,TSLA,3,-600"].join("\n");
    const auto = parseTransactionsCsv(csv);
    expect(auto.columnMap.tradeDate).toBeUndefined(); // "When" is not a known synonym
    expect(auto.columnMap.action).toBeUndefined(); // "What" is not a known synonym

    const mapped = parseTransactionsCsv(csv, {
      columnMap: { tradeDate: "When", action: "What", symbol: "Ticker", quantity: "Shares", amount: "Net" },
    });
    const row = mapped.rows[0];
    expect(row.tradeDate).toBe("2026-02-01");
    expect(row.action).toBe("BUY");
    expect(row.symbol).toBe("TSLA");
    expect(row.netAmount).toBeCloseTo(-600, 2);
  });

  it("exposes the source columns for the mapping UI", () => {
    const csv = "Date,Action,Symbol,Quantity,Amount\n2026-01-02,buy,AAPL,5,-100";
    expect(parseTransactionsCsv(csv).sourceColumns).toEqual(["Date", "Action", "Symbol", "Quantity", "Amount"]);
  });
});

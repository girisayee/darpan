import { describe, expect, it } from "vitest";
import { allColumns, columnsFor, toPositionRows } from "@/components/dashboard/positions/columns";
import type { CalculationResult, OptionLifecycle } from "@/types/trading";

const lifecycle = (changes: Partial<OptionLifecycle>): OptionLifecycle => ({
  id: "synthetic-long", underlyingSymbol: "TEST", optionType: "call", direction: "long",
  strategy: "UNKNOWN", openDate: "2026-01-02", closeDate: "2026-01-10",
  expirationDate: "2026-02-01", strikePrice: 100, contracts: 1, sharesControlled: 100,
  premiumReceived: 600, closeCost: 400, fees: 0, netOptionPnl: 200,
  status: "closed", linkedTransactionIds: [], linkedStockLotIds: [], explanation: "", warnings: [],
  ...changes,
});

describe("Positions presentation data", () => {
  it("keeps open option cashflow separate from realized results", () => {
    const openHeaders = allColumns(false, "active").map((column) => column.header);
    const closedHeaders = allColumns(false, "closed").map((column) => column.header);
    expect(openHeaders).toContain("Premium / debit");
    expect(openHeaders).not.toContain("Realized P&L");
    expect(openHeaders).not.toContain("Closed");
    expect(closedHeaders).toContain("Realized P&L");
    expect(closedHeaders).toContain("Trade ROI");
    expect(columnsFor("swing", false, "active").map((column) => column.header)).not.toContain("Realized P&L");
  });

  it("shows the original debit for a closed long option rather than sale proceeds", () => {
    const result = { optionLifecycles: [lifecycle({})] } as CalculationResult;
    const [row] = toPositionRows(result, "long", "closed");
    expect(row.cost).toBe(400);
    expect(row.pnl).toBe(200);
    expect(row.roc).toBe(50);
  });

  it("keeps opted-in open stock lots as basis-only holdings", () => {
    const result = {
      optionLifecycles: [], realizedEvents: [],
      taxLots: [{ id: "synthetic-lot", symbol: "TEST", status: "open", remainingQuantity: 12,
        costBasisPerShare: 25, openDate: "2026-01-02" }],
    } as unknown as CalculationResult;
    const [row] = toPositionRows(result, "swing", "active", true);
    expect(row.qty).toBe("12 sh");
    expect(row.costBasisPerShare).toBe(25);
    expect(row.event).toBeUndefined();
    expect(columnsFor("swing", false, "active").map((column) => column.header)).toEqual(["Position", "Basis / share", "Opened"]);
  });
});

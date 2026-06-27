import { describe, expect, it } from "vitest";
import { calculateDashboard } from "@/lib/calculations/engine";
import { defaultSettings } from "@/lib/storage/local-store";
import { filterResult, type DashboardFilters } from "@/lib/selectors/filter-result";
import { stockTx } from "../helpers";

const ALL: DashboardFilters = { symbol: "ALL", strategy: "ALL", year: "ALL", month: "ALL", accountIds: [] };

describe("filterResult", () => {
  it("forwards cost-basis settings when recomputing filtered aggregates", () => {
    // Two BUY lots at different prices then a SELL of one lot's worth. Under LIFO the
    // most recent (higher) lot is consumed, so the realized cost basis is 2000 and the
    // gain is 1000. If settings were dropped during the filtered recompute, the
    // fallback to FIFO would consume the cheaper lot (basis 1000) and overstate the gain.
    const settings = { ...defaultSettings, costBasisMethod: "LIFO" as const };
    const transactions = [
      stockTx("b1", "2026-02-01", "BUY", "ZZZ", 100, 10),
      stockTx("b2", "2026-02-02", "BUY", "ZZZ", 100, 20),
      stockTx("s1", "2026-02-27", "SELL", "ZZZ", 100, 30)
    ];
    const base = calculateDashboard(transactions, settings);

    const filtered = filterResult(base, ALL, settings);

    // LIFO basis 2000, proceeds 3000 → gain 1000. FIFO fallback would yield 2000.
    expect(filtered.aggregates.totalRealizedPnl).toBeCloseTo(1000, 2);
  });
});

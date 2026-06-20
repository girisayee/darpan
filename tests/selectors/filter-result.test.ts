import { describe, expect, it } from "vitest";
import { calculateDashboard } from "@/lib/calculations/engine";
import { defaultSettings } from "@/lib/storage/local-store";
import { filterResult, type DashboardFilters } from "@/lib/selectors/filter-result";
import { optionTx } from "../helpers";

const ALL: DashboardFilters = { symbol: "ALL", strategy: "ALL", year: "ALL", month: "ALL", account: "ALL" };

describe("filterResult", () => {
  it("applies manual cost-basis settings when recomputing filtered aggregates", () => {
    // Covered call on a symbol absent from defaultSettings, assigned with no opening
    // stock lot: the per-call manual override ($50/sh) is the only source of cost
    // basis. If settings are dropped during the filtered recompute, the fallback to
    // defaultSettings has no override for this symbol, basis collapses to 0, and P&L
    // is overstated (the SNOW-style phantom gain).
    const settings = {
      ...defaultSettings,
      manualCostBasisPerShare: { ...defaultSettings.manualCostBasisPerShare, ZZZ: 50 }
    };
    const transactions = [
      optionTx("o1", "2026-02-01", "SELL_TO_OPEN", "ZZZ", "call", 35, "2026-02-27", 100),
      optionTx("o2", "2026-02-27", "ASSIGNMENT", "ZZZ", "call", 35, "2026-02-27", 0)
    ];
    const base = calculateDashboard(transactions, settings);

    const filtered = filterResult(base, ALL, settings);

    // strike 3500 - basis 5000 + premium 100 = -1400 (override applied)
    // Without forwarding settings, default basis 0 would yield +3600.
    expect(filtered.aggregates.totalRealizedPnl).toBeCloseTo(-1400, 2);
  });
});

import { describe, expect, it } from "vitest";
import { ytdReturn } from "@/lib/benchmark/compare";

const mkCloses = (pairs: [string, number][]) =>
  pairs.map(([date, close]) => ({ date, close }));

describe("ytdReturn", () => {
  it("measures from the year-open close (first on/after Jan 1), ignoring prior-year bars", () => {
    // QQQ: year-open 613.12 → latest 706.52 ≈ 15.2% YTD, matching published figures.
    // The prior-December bar (623.89) is a worse Dec-31 proxy and must not be the base.
    const closes = mkCloses([
      ["2025-12-26", 623.89],
      ["2026-01-02", 613.12],
      ["2026-06-26", 706.52],
    ]);
    const r = ytdReturn(closes, 2026)!;
    expect(r.baselineDate).toBe("2026-01-02");
    expect(r.baselineClose).toBe(613.12);
    expect(r.endDate).toBe("2026-06-26");
    expect(r.returnPct).toBeCloseTo(15.23, 1);
  });

  it("caps the end at Dec 31 for a past year and starts at that year's open", () => {
    const closes = mkCloses([
      ["2024-12-27", 90],
      ["2025-01-02", 100],
      ["2025-12-31", 130],
      ["2026-03-01", 150],
    ]);
    const r = ytdReturn(closes, 2025)!;
    expect(r.baselineDate).toBe("2025-01-02");
    expect(r.baselineClose).toBe(100);
    expect(r.endDate).toBe("2025-12-31");
    expect(r.returnPct).toBeCloseTo(30, 5);
  });

  it("returns null with fewer than two in-year closes", () => {
    expect(ytdReturn(mkCloses([["2025-12-26", 690], ["2026-01-02", 683]]), 2026)).toBeNull();
    expect(ytdReturn(mkCloses([["2026-01-02", 613]]), 2026)).toBeNull();
  });
});

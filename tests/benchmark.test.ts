import { describe, expect, it } from "vitest";
import { benchmarkStartISO, capitalMatchedReturn, ytdReturn } from "@/lib/benchmark/compare";

const mkCloses = (pairs: [string, number][]) =>
  pairs.map(([date, close]) => ({ date, close }));

describe("ytdReturn", () => {
  it("measures from the prior year-end close, not the first in-year close", () => {
    // Market dropped over the new-year gap (690.31 → 683.17). Measuring from the
    // first in-year close would overstate; the true YTD baseline is the prior close.
    const closes = mkCloses([
      ["2025-12-26", 690.31],
      ["2026-01-02", 683.17],
      ["2026-06-18", 746.74],
    ]);
    const r = ytdReturn(closes, 2026)!;
    expect(r.baselineDate).toBe("2025-12-26");
    expect(r.endDate).toBe("2026-06-18");
    expect(r.returnPct).toBeCloseTo(8.17, 1);
  });

  it("caps the end at Dec 31 for a past year", () => {
    const closes = mkCloses([
      ["2024-12-27", 100],
      ["2025-06-30", 120],
      ["2025-12-31", 130],
      ["2026-03-01", 150],
    ]);
    const r = ytdReturn(closes, 2025)!;
    expect(r.baselineClose).toBe(100);
    expect(r.endDate).toBe("2025-12-31");
    expect(r.returnPct).toBeCloseTo(30, 5);
  });

  it("returns null without a prior-year baseline or any in-year close", () => {
    expect(ytdReturn(mkCloses([["2026-01-02", 683], ["2026-06-18", 746]]), 2026)).toBeNull();
    expect(ytdReturn(mkCloses([["2025-12-26", 690]]), 2026)).toBeNull();
  });
});

describe("benchmarkStartISO", () => {
  it("returns the earliest month as a valid YYYY-MM-01 ISO date", () => {
    const iso = benchmarkStartISO([
      { year: 2025, month: 1 },
      { year: 2025, month: 2 },
      { year: 2026, month: 3 },
    ]);
    expect(iso).toBe("2025-01-01");
  });

  it("zero-pads single-digit months", () => {
    expect(benchmarkStartISO([{ year: 2025, month: 3 }])).toBe("2025-03-01");
    expect(benchmarkStartISO([{ year: 2025, month: 12 }])).toBe("2025-12-01");
  });

  it("picks the earliest even when input is out of order or crosses years", () => {
    const iso = benchmarkStartISO([
      { year: 2026, month: 2 },
      { year: 2024, month: 11 },
      { year: 2025, month: 6 },
    ]);
    expect(iso).toBe("2024-11-01");
  });

  it("returns null for an empty array", () => {
    expect(benchmarkStartISO([])).toBeNull();
  });

  it("never produces a non-ISO string from a formatted label (regression)", () => {
    // The bug: callers passed a human label like "Jan 25" + "-01" → "Jan 25-01".
    // benchmarkStartISO takes numeric year/month, so output always matches the
    // strict YYYY-MM-DD shape the /api/benchmark route validates.
    const iso = benchmarkStartISO([{ year: 2025, month: 1 }]);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("capitalMatchedReturn", () => {
  it("returns correct returnPct and dollarPnl for a gain", () => {
    const closes = mkCloses([
      ["2024-01-02", 400],
      ["2024-01-03", 420],
    ]);
    const result = capitalMatchedReturn(closes, 10000);
    expect(result).not.toBeNull();
    expect(result!.startClose).toBe(400);
    expect(result!.endClose).toBe(420);
    // (420-400)/400 * 100 = 5%
    expect(result!.returnPct).toBeCloseTo(5, 5);
    // 10000 * 5/100 = 500
    expect(result!.dollarPnl).toBeCloseTo(500, 5);
  });

  it("returns correct returnPct and dollarPnl for a loss", () => {
    const closes = mkCloses([
      ["2024-01-02", 500],
      ["2024-01-09", 450],
    ]);
    const result = capitalMatchedReturn(closes, 20000);
    expect(result).not.toBeNull();
    // (450-500)/500 * 100 = -10%
    expect(result!.returnPct).toBeCloseTo(-10, 5);
    // 20000 * -10/100 = -2000
    expect(result!.dollarPnl).toBeCloseTo(-2000, 5);
  });

  it("returns null when fewer than 2 valid closes", () => {
    expect(capitalMatchedReturn([], 10000)).toBeNull();
    expect(capitalMatchedReturn(mkCloses([["2024-01-02", 400]]), 10000)).toBeNull();
  });

  it("returns null when start close is zero", () => {
    const closes = mkCloses([
      ["2024-01-02", 0],
      ["2024-01-03", 400],
    ]);
    // 0 is filtered out (close > 0), leaving only 1 valid — should be null
    expect(capitalMatchedReturn(closes, 10000)).toBeNull();
  });

  it("returns null when start close is negative", () => {
    const closes = mkCloses([
      ["2024-01-02", -1],
      ["2024-01-03", 400],
    ]);
    // negative filtered out by close > 0, leaving 1 — null
    expect(capitalMatchedReturn(closes, 10000)).toBeNull();
  });

  it("sorts closes by date so earliest is start", () => {
    // Provide out-of-order dates
    const closes = mkCloses([
      ["2024-03-01", 600],
      ["2024-01-01", 400],
      ["2024-02-01", 500],
    ]);
    const result = capitalMatchedReturn(closes, 1000);
    expect(result).not.toBeNull();
    expect(result!.startClose).toBe(400);
    expect(result!.endClose).toBe(600);
    // (600-400)/400 * 100 = 50%
    expect(result!.returnPct).toBeCloseTo(50, 5);
    expect(result!.dollarPnl).toBeCloseTo(500, 5);
  });

  it("dollarPnl scales linearly with averageDeployedCapital", () => {
    const closes = mkCloses([
      ["2024-01-02", 100],
      ["2024-01-03", 110],
    ]);
    const r1 = capitalMatchedReturn(closes, 5000);
    const r2 = capitalMatchedReturn(closes, 10000);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    // Same returnPct
    expect(r1!.returnPct).toBeCloseTo(r2!.returnPct, 5);
    // Dollar P&L doubles
    expect(r2!.dollarPnl).toBeCloseTo(r1!.dollarPnl * 2, 5);
  });
});

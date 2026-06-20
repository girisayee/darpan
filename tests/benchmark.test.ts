import { describe, expect, it } from "vitest";
import { capitalMatchedReturn } from "@/lib/benchmark/compare";

const mkCloses = (pairs: [string, number][]) =>
  pairs.map(([date, close]) => ({ date, close }));

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

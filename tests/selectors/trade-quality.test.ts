import { tradeQuality } from "@/lib/selectors/trade-quality";
import type { RealizedPnLEvent } from "@/types/trading";

const ev = (realizedPnl: number): RealizedPnLEvent =>
  ({ realizedPnl } as unknown as RealizedPnLEvent);

test("computes profit factor, expectancy, payoff, win rate", () => {
  const out = tradeQuality([ev(300), ev(200), ev(-100), ev(-150)]);
  expect(out.totalTrades).toBe(4);
  expect(out.wins).toBe(2);
  expect(out.losses).toBe(2);
  expect(out.winRate).toBeCloseTo(0.5, 5);
  expect(out.grossProfit).toBe(500);
  expect(out.grossLoss).toBe(-250);
  expect(out.profitFactor).toBeCloseTo(2.0, 5);   // 500 / 250
  expect(out.averageWin).toBe(250);
  expect(out.averageLoss).toBe(-125);
  expect(out.payoffRatio).toBeCloseTo(2.0, 5);    // 250 / 125
  expect(out.expectancy).toBeCloseTo(62.5, 5);    // (300+200-100-150)/4
});

test("no losses -> profitFactor and payoffRatio null, no NaN", () => {
  const out = tradeQuality([ev(100), ev(50)]);
  expect(out.profitFactor).toBeNull();
  expect(out.payoffRatio).toBeNull();
  expect(out.winRate).toBe(1);
});

test("empty -> all null/zero, no NaN", () => {
  const out = tradeQuality([]);
  expect(out.totalTrades).toBe(0);
  expect(out.winRate).toBeNull();
  expect(out.profitFactor).toBeNull();
  expect(out.expectancy).toBeNull();
  expect(Number.isNaN(out.grossProfit)).toBe(false);
});

test("zero-pnl trades count in total but not win/loss", () => {
  const out = tradeQuality([ev(100), ev(0), ev(-100)]);
  expect(out.totalTrades).toBe(3);
  expect(out.wins).toBe(1);
  expect(out.losses).toBe(1);
  expect(out.expectancy).toBeCloseTo(0, 5);
});

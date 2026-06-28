import { premiumStats } from "@/lib/selectors/premium-capture";
import type { OptionLifecycle } from "@/types/trading";

const lc = (o: Partial<OptionLifecycle>): OptionLifecycle =>
  ({
    premiumReceived: 0,
    netOptionPnl: 0,
    strategy: "COVERED_CALL",
    optionType: "call",
    status: "expired",
    ...o,
  } as OptionLifecycle);

test("capture rate overall and per strategy", () => {
  const out = premiumStats([
    lc({ strategy: "COVERED_CALL", optionType: "call", premiumReceived: 100, netOptionPnl: 80 }),
    lc({ strategy: "CASH_SECURED_PUT", optionType: "put", premiumReceived: 200, netOptionPnl: 200 }),
  ]);
  expect(out.premiumCollected).toBe(300);
  expect(out.netOptionPnl).toBe(280);
  expect(out.captureRate).toBeCloseTo(280 / 300, 5);
  expect(out.captureCoveredCall).toBeCloseTo(0.8, 5);
  expect(out.captureCashSecuredPut).toBeCloseTo(1.0, 5);
});

test("assignment rate over terminal lifecycles, split by type", () => {
  const out = premiumStats([
    lc({ optionType: "put", status: "assigned" }),
    lc({ optionType: "put", status: "expired" }),
    lc({ optionType: "call", status: "assigned" }),
    lc({ optionType: "call", status: "open" }), // excluded from terminal
  ]);
  expect(out.counts.terminal).toBe(3);
  expect(out.assignmentRate).toBeCloseTo(2 / 3, 5);
  expect(out.assignmentRatePut).toBeCloseTo(0.5, 5);   // 1 assigned of 2 terminal puts
  expect(out.assignmentRateCall).toBeCloseTo(1.0, 5);  // 1 assigned of 1 terminal call
});

test("zero premium and empty -> nulls, no NaN", () => {
  expect(premiumStats([]).captureRate).toBeNull();
  const out = premiumStats([lc({ premiumReceived: 0, netOptionPnl: 0, status: "open" })]);
  expect(out.captureRate).toBeNull();
  expect(out.assignmentRate).toBeNull(); // no terminal lifecycles
});

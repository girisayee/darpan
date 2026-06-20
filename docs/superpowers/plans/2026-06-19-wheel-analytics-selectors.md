# Wheel analytics selectors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 1 `now`-tier wheel analytics as pure, unit-tested selector functions that surface metrics the engine already produces (profit factor, expectancy, payoff ratio, premium capture, assignment rate, concentration/HHI, annualized ROC, capital turnover, income/day, goal run-rate).

**Architecture:** Each metric group is a pure function in `lib/selectors/`, consuming existing `CalculationResult` sub-objects (`realizedEvents`, `optionLifecycles`, `aggregates`, `monthlyReturns`) and returning a plain typed object. No UI, no I/O, no engine changes. A final barrel (`analytics.ts`) composes them into one `WheelAnalytics` object the redesign UI will consume. This is the data foundation for the Overview and Performance screens (spec §6, §7.2, §7.4).

**Tech Stack:** TypeScript 5.7, Vitest 4 (globals enabled — do NOT import `test`/`expect`), path alias `@/` → repo root.

## Global Constraints

- Vitest globals are on: write `test(...)`/`expect(...)` directly; never import them. (`vitest.config.ts`: `globals: true`, `include: ["tests/**/*.test.ts"]`.)
- Import via the `@/` alias (e.g. `@/lib/selectors/trade-quality`, `@/types/trading`).
- Pure functions only: no Date.now(), no network, no mutation of inputs. Deterministic given inputs.
- Every monetary/ratio result that can divide by zero must return `null` (never `NaN`/`Infinity`), following the existing `goalPace` pattern (`annualGoal > 0 ? … : 0`).
- Percentages from the engine (`roiPercent`, `annualizedRoiPercent`) are already in **percent units** (e.g. `23.4` not `0.234`). Rates this plan computes fresh (winRate, captureRate, assignmentRate, HHI, shares) are **fractions 0..1** unless a field name ends in `Percent`.
- No new dependencies. No changes outside `lib/selectors/` and `tests/selectors/`.
- Run a single test file with: `npx vitest run tests/selectors/<file>.test.ts`. Run all with `npm test`.
- End every commit message with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Execution model (per-task)

Tasks 1–5 are **independent** (distinct files) and may run **in parallel** via separate subagents. Task 6 depends on 1–5. Task 7 (review) is last. Recommended model per task is noted in its header.

## File Structure

- Create `lib/selectors/trade-quality.ts` — profit factor, expectancy, payoff ratio, win/loss stats (Task 1)
- Create `lib/selectors/premium-capture.ts` — premium capture rate + assignment rate (Task 2)
- Create `lib/selectors/allocation.ts` — concentration (HHI, top-N share) by symbol & strategy (Task 3)
- Create `lib/selectors/capital-efficiency.ts` — annualized ROC, capital turnover, income/day (Task 4)
- Modify `lib/selectors/goal-pace.ts` — add `projectedYearEnd`, `requiredMonthly` (Task 5)
- Create `lib/selectors/analytics.ts` — `wheelAnalytics(result)` barrel composing all of the above (Task 6)
- Tests mirror each under `tests/selectors/`.

---

### Task 1: Trade-quality selector

**Model:** Sonnet.

**Files:**
- Create: `lib/selectors/trade-quality.ts`
- Test: `tests/selectors/trade-quality.test.ts`

**Interfaces:**
- Consumes: `RealizedPnLEvent[]` from `@/types/trading` (uses `.realizedPnl`).
- Produces:
  ```ts
  export interface TradeQuality {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number | null;       // fraction 0..1
    grossProfit: number;          // sum of positive pnl
    grossLoss: number;            // sum of negative pnl (<= 0)
    averageWin: number | null;
    averageLoss: number | null;   // <= 0
    profitFactor: number | null;  // grossProfit / |grossLoss|; null if no losses
    payoffRatio: number | null;   // averageWin / |averageLoss|; null if missing side
    expectancy: number | null;    // mean realizedPnl; null if no trades
  }
  export function tradeQuality(events: RealizedPnLEvent[]): TradeQuality;
  ```

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectors/trade-quality.test.ts`
Expected: FAIL — cannot find module `@/lib/selectors/trade-quality`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { RealizedPnLEvent } from "@/types/trading";

export interface TradeQuality {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  averageWin: number | null;
  averageLoss: number | null;
  profitFactor: number | null;
  payoffRatio: number | null;
  expectancy: number | null;
}

export function tradeQuality(events: RealizedPnLEvent[]): TradeQuality {
  const total = events.length;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sum = 0;

  for (const e of events) {
    const p = e.realizedPnl;
    sum += p;
    if (p > 0) {
      wins += 1;
      grossProfit += p;
    } else if (p < 0) {
      losses += 1;
      grossLoss += p;
    }
  }

  const averageWin = wins > 0 ? grossProfit / wins : null;
  const averageLoss = losses > 0 ? grossLoss / losses : null;

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: total > 0 ? wins / total : null,
    grossProfit,
    grossLoss,
    averageWin,
    averageLoss,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
    payoffRatio:
      averageWin !== null && averageLoss !== null && averageLoss !== 0
        ? averageWin / Math.abs(averageLoss)
        : null,
    expectancy: total > 0 ? sum / total : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectors/trade-quality.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/trade-quality.ts tests/selectors/trade-quality.test.ts
git commit -m "feat(analytics): trade-quality selector (profit factor, expectancy, payoff)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Premium-capture & assignment selector

**Model:** Sonnet.

**Files:**
- Create: `lib/selectors/premium-capture.ts`
- Test: `tests/selectors/premium-capture.test.ts`

**Interfaces:**
- Consumes: `OptionLifecycle[]` from `@/types/trading` (uses `.premiumReceived`, `.netOptionPnl`, `.strategy`, `.optionType`, `.status`).
- Produces:
  ```ts
  export interface PremiumStats {
    premiumCollected: number;            // sum premiumReceived
    netOptionPnl: number;                // sum netOptionPnl
    captureRate: number | null;          // netOptionPnl / premiumCollected; fraction
    captureCoveredCall: number | null;
    captureCashSecuredPut: number | null;
    assignmentRate: number | null;       // assigned / terminal; fraction
    assignmentRateCall: number | null;
    assignmentRatePut: number | null;
    counts: { total: number; terminal: number; assigned: number; calls: number; puts: number };
  }
  export function premiumStats(lifecycles: OptionLifecycle[]): PremiumStats;
  ```
  "terminal" = status in `expired | closed | assigned` (excludes `open`, `unresolved`).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectors/premium-capture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { OptionLifecycle } from "@/types/trading";

export interface PremiumStats {
  premiumCollected: number;
  netOptionPnl: number;
  captureRate: number | null;
  captureCoveredCall: number | null;
  captureCashSecuredPut: number | null;
  assignmentRate: number | null;
  assignmentRateCall: number | null;
  assignmentRatePut: number | null;
  counts: { total: number; terminal: number; assigned: number; calls: number; puts: number };
}

const TERMINAL = new Set(["expired", "closed", "assigned"]);

function capture(list: OptionLifecycle[]): number | null {
  const prem = list.reduce((s, l) => s + l.premiumReceived, 0);
  if (prem === 0) return null;
  const net = list.reduce((s, l) => s + l.netOptionPnl, 0);
  return net / prem;
}

function assignRate(list: OptionLifecycle[]): number | null {
  const terminal = list.filter((l) => TERMINAL.has(l.status));
  if (terminal.length === 0) return null;
  const assigned = terminal.filter((l) => l.status === "assigned").length;
  return assigned / terminal.length;
}

export function premiumStats(lifecycles: OptionLifecycle[]): PremiumStats {
  const premiumCollected = lifecycles.reduce((s, l) => s + l.premiumReceived, 0);
  const netOptionPnl = lifecycles.reduce((s, l) => s + l.netOptionPnl, 0);
  const terminal = lifecycles.filter((l) => TERMINAL.has(l.status));

  return {
    premiumCollected,
    netOptionPnl,
    captureRate: premiumCollected === 0 ? null : netOptionPnl / premiumCollected,
    captureCoveredCall: capture(lifecycles.filter((l) => l.strategy === "COVERED_CALL")),
    captureCashSecuredPut: capture(lifecycles.filter((l) => l.strategy === "CASH_SECURED_PUT")),
    assignmentRate: assignRate(lifecycles),
    assignmentRateCall: assignRate(lifecycles.filter((l) => l.optionType === "call")),
    assignmentRatePut: assignRate(lifecycles.filter((l) => l.optionType === "put")),
    counts: {
      total: lifecycles.length,
      terminal: terminal.length,
      assigned: terminal.filter((l) => l.status === "assigned").length,
      calls: lifecycles.filter((l) => l.optionType === "call").length,
      puts: lifecycles.filter((l) => l.optionType === "put").length,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectors/premium-capture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/premium-capture.ts tests/selectors/premium-capture.test.ts
git commit -m "feat(analytics): premium-capture & assignment-rate selector" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Allocation / concentration selector

**Model:** Sonnet.

**Files:**
- Create: `lib/selectors/allocation.ts`
- Test: `tests/selectors/allocation.test.ts`

**Interfaces:**
- Consumes: `DashboardAggregates["symbolBreakdown"]` and `["strategyBreakdown"]` (uses `.symbol`/`.strategy` + `.capital`).
- Produces:
  ```ts
  export interface Concentration {
    hhi: number;                              // 0..1 (sum of squared shares)
    topShare: number;                         // largest single share 0..1
    topN: { key: string; share: number }[];  // sorted desc
    level: "low" | "moderate" | "high";       // hhi<=0.15 low, <=0.25 moderate, else high
  }
  export interface AllocationStats { bySymbol: Concentration; byStrategy: Concentration; }
  export function allocation(
    symbolBreakdown: { symbol: string; capital: number }[],
    strategyBreakdown: { strategy: string; capital: number }[],
    topN?: number, // default 5
  ): AllocationStats;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { allocation } from "@/lib/selectors/allocation";

test("HHI, top share and level by symbol", () => {
  const out = allocation(
    [
      { symbol: "A", capital: 5000 },
      { symbol: "B", capital: 3000 },
      { symbol: "C", capital: 2000 },
    ],
    [],
  );
  // shares .5,.3,.2 -> hhi .25+.09+.04 = .38 -> high
  expect(out.bySymbol.hhi).toBeCloseTo(0.38, 5);
  expect(out.bySymbol.topShare).toBeCloseTo(0.5, 5);
  expect(out.bySymbol.level).toBe("high");
  expect(out.bySymbol.topN[0]).toEqual({ key: "A", share: 0.5 });
});

test("evenly spread -> lower HHI / level", () => {
  const out = allocation(
    Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, capital: 1000 })),
    [],
  );
  expect(out.bySymbol.hhi).toBeCloseTo(0.1, 5); // 10 * 0.1^2
  expect(out.bySymbol.level).toBe("low");
});

test("negative capital clamped, zero total -> safe empty", () => {
  const out = allocation([{ symbol: "X", capital: -100 }], []);
  expect(out.bySymbol.hhi).toBe(0);
  expect(out.bySymbol.topShare).toBe(0);
  expect(out.bySymbol.level).toBe("low");
  expect(out.bySymbol.topN).toEqual([]);
});

test("respects topN limit and computes strategy concentration", () => {
  const out = allocation(
    [],
    [
      { strategy: "COVERED_CALL", capital: 4000 },
      { strategy: "CASH_SECURED_PUT", capital: 4000 },
    ],
    1,
  );
  expect(out.byStrategy.hhi).toBeCloseTo(0.5, 5); // .5^2 + .5^2
  expect(out.byStrategy.topN).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectors/allocation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface Concentration {
  hhi: number;
  topShare: number;
  topN: { key: string; share: number }[];
  level: "low" | "moderate" | "high";
}
export interface AllocationStats {
  bySymbol: Concentration;
  byStrategy: Concentration;
}

function concentration(
  items: { key: string; capital: number }[],
  topN: number,
): Concentration {
  const weights = items.map((i) => ({ key: i.key, capital: Math.max(0, i.capital) }));
  const total = weights.reduce((s, w) => s + w.capital, 0);
  if (total <= 0) {
    return { hhi: 0, topShare: 0, topN: [], level: "low" };
  }
  const shares = weights
    .map((w) => ({ key: w.key, share: w.capital / total }))
    .sort((a, b) => b.share - a.share);
  const hhi = shares.reduce((s, x) => s + x.share * x.share, 0);
  const level = hhi <= 0.15 ? "low" : hhi <= 0.25 ? "moderate" : "high";
  return { hhi, topShare: shares[0]?.share ?? 0, topN: shares.slice(0, topN), level };
}

export function allocation(
  symbolBreakdown: { symbol: string; capital: number }[],
  strategyBreakdown: { strategy: string; capital: number }[],
  topN = 5,
): AllocationStats {
  return {
    bySymbol: concentration(
      symbolBreakdown.map((b) => ({ key: b.symbol, capital: b.capital })),
      topN,
    ),
    byStrategy: concentration(
      strategyBreakdown.map((b) => ({ key: b.strategy, capital: b.capital })),
      topN,
    ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectors/allocation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/allocation.ts tests/selectors/allocation.test.ts
git commit -m "feat(analytics): allocation/concentration selector (HHI, top-N share)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Capital-efficiency selector

**Model:** Sonnet.

**Files:**
- Create: `lib/selectors/capital-efficiency.ts`
- Test: `tests/selectors/capital-efficiency.test.ts`

**Interfaces:**
- Consumes: `RealizedPnLEvent[]` (uses `.annualizedRoiPercent`, `.capitalDeployed`) and `MonthlyCapitalReturn[]` (uses `.closedTradeCapital`, `.averageDeployedCapital`, `.optionsPremiumPnl`, `.capitalDays`).
- Produces:
  ```ts
  export interface CapitalEfficiency {
    annualizedRoc: number | null;   // capital-weighted mean of event annualizedRoiPercent (percent units)
    capitalTurnover: number | null; // sum(closedTradeCapital) / mean(averageDeployedCapital)
    incomePerDay: number | null;    // sum(optionsPremiumPnl) / sum(capitalDays)
  }
  export function capitalEfficiency(
    events: RealizedPnLEvent[],
    monthly: MonthlyCapitalReturn[],
  ): CapitalEfficiency;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { capitalEfficiency } from "@/lib/selectors/capital-efficiency";
import type { RealizedPnLEvent, MonthlyCapitalReturn } from "@/types/trading";

const ev = (annualizedRoiPercent: number | null, capitalDeployed: number | null): RealizedPnLEvent =>
  ({ annualizedRoiPercent, capitalDeployed } as unknown as RealizedPnLEvent);

const mo = (o: Partial<MonthlyCapitalReturn>): MonthlyCapitalReturn =>
  ({
    closedTradeCapital: 0,
    averageDeployedCapital: 0,
    optionsPremiumPnl: 0,
    capitalDays: 0,
    ...o,
  } as MonthlyCapitalReturn);

test("capital-weighted annualized ROC, turnover, income/day", () => {
  const out = capitalEfficiency(
    [ev(20, 10000), ev(40, 5000)],
    [
      mo({ closedTradeCapital: 10000, averageDeployedCapital: 10000, optionsPremiumPnl: 400, capitalDays: 200 }),
      mo({ closedTradeCapital: 20000, averageDeployedCapital: 20000, optionsPremiumPnl: 500, capitalDays: 100 }),
    ],
  );
  // weighted ROC = (20*10000 + 40*5000) / 15000 = 26.666...
  expect(out.annualizedRoc).toBeCloseTo(26.6667, 3);
  // turnover = 30000 / mean(10000,20000)=15000 = 2
  expect(out.capitalTurnover).toBeCloseTo(2, 5);
  // income/day = 900 / 300 = 3
  expect(out.incomePerDay).toBeCloseTo(3, 5);
});

test("ignores events lacking ann ROC or capital; empty -> nulls", () => {
  const out = capitalEfficiency([ev(null, 1000), ev(30, null)], []);
  expect(out.annualizedRoc).toBeNull();
  expect(out.capitalTurnover).toBeNull();
  expect(out.incomePerDay).toBeNull();
});

test("zero denominators -> null, no NaN", () => {
  const out = capitalEfficiency(
    [],
    [mo({ closedTradeCapital: 5000, averageDeployedCapital: 0, optionsPremiumPnl: 100, capitalDays: 0 })],
  );
  expect(out.capitalTurnover).toBeNull();
  expect(out.incomePerDay).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectors/capital-efficiency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { RealizedPnLEvent, MonthlyCapitalReturn } from "@/types/trading";

export interface CapitalEfficiency {
  annualizedRoc: number | null;
  capitalTurnover: number | null;
  incomePerDay: number | null;
}

export function capitalEfficiency(
  events: RealizedPnLEvent[],
  monthly: MonthlyCapitalReturn[],
): CapitalEfficiency {
  // Capital-weighted mean of per-event annualized ROI%.
  let weightSum = 0;
  let weighted = 0;
  for (const e of events) {
    if (e.annualizedRoiPercent === null || e.capitalDeployed === null) continue;
    if (e.capitalDeployed <= 0) continue;
    weighted += e.annualizedRoiPercent * e.capitalDeployed;
    weightSum += e.capitalDeployed;
  }
  const annualizedRoc = weightSum > 0 ? weighted / weightSum : null;

  // Turnover = total closed capital / mean monthly average deployed.
  const totalClosed = monthly.reduce((s, m) => s + m.closedTradeCapital, 0);
  const deployedMonths = monthly.filter((m) => m.averageDeployedCapital > 0);
  const meanDeployed =
    deployedMonths.length > 0
      ? deployedMonths.reduce((s, m) => s + m.averageDeployedCapital, 0) / deployedMonths.length
      : 0;
  const capitalTurnover = meanDeployed > 0 ? totalClosed / meanDeployed : null;

  // Income per capital-day from option premium.
  const totalPremiumPnl = monthly.reduce((s, m) => s + m.optionsPremiumPnl, 0);
  const totalCapitalDays = monthly.reduce((s, m) => s + m.capitalDays, 0);
  const incomePerDay = totalCapitalDays > 0 ? totalPremiumPnl / totalCapitalDays : null;

  return { annualizedRoc, capitalTurnover, incomePerDay };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectors/capital-efficiency.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/capital-efficiency.ts tests/selectors/capital-efficiency.test.ts
git commit -m "feat(analytics): capital-efficiency selector (ann ROC, turnover, income/day)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Goal run-rate extension

**Model:** Haiku.

**Files:**
- Modify: `lib/selectors/goal-pace.ts` (extend `GoalPaceResult` + `goalPace`)
- Modify: `tests/selectors/goal-pace.test.ts` (append cases)

**Interfaces:**
- Consumes: existing `GoalPaceInput` (`annualGoal`, `monthlyRealized`, `monthIndex`).
- Produces (added fields on `GoalPaceResult`):
  ```ts
  projectedYearEnd: number; // actual / monthsElapsed * 12 (monthsElapsed = monthIndex+1); 0 if none
  requiredMonthly: number;  // max(0, annualGoal-actual) / remainingMonths; 0 if no months remain
  ```
  Existing fields (`cumulative`, `actual`, `target`, `aheadBy`, `pct`) are unchanged.

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
test("projects year-end and required monthly from pace", () => {
  const result = goalPace({
    annualGoal: 50000,
    monthlyRealized: [5000, 5000, 5000, 5000, 5000, 6940],
    monthIndex: 5,
  });
  // monthsElapsed = 6, actual = 31940
  expect(result.projectedYearEnd).toBeCloseTo(63880, 5); // 31940 / 6 * 12
  // remaining = 6, required = (50000 - 31940) / 6
  expect(result.requiredMonthly).toBeCloseTo(3010, 5);
});

test("final month: no remaining -> requiredMonthly 0, no NaN", () => {
  const result = goalPace({
    annualGoal: 12000,
    monthlyRealized: Array(12).fill(1000),
    monthIndex: 11,
  });
  expect(result.requiredMonthly).toBe(0);
  expect(Number.isNaN(result.requiredMonthly)).toBe(false);
  expect(result.projectedYearEnd).toBeCloseTo(12000, 5);
});

test("goal already met -> requiredMonthly clamps to 0", () => {
  const result = goalPace({ annualGoal: 1000, monthlyRealized: [5000], monthIndex: 0 });
  expect(result.requiredMonthly).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectors/goal-pace.test.ts`
Expected: FAIL — `projectedYearEnd`/`requiredMonthly` are `undefined`.

- [ ] **Step 3: Modify implementation**

In `lib/selectors/goal-pace.ts`, add the two fields to `GoalPaceResult`:

```ts
export interface GoalPaceResult {
  cumulative: number[];
  actual: number;
  target: number;
  aheadBy: number;
  pct: number;
  projectedYearEnd: number;
  requiredMonthly: number;
}
```

and compute them at the end of `goalPace` before `return` (reuse the existing `actual`):

```ts
  const monthsElapsed = monthIndex + 1;
  const remainingMonths = 12 - monthsElapsed;
  const projectedYearEnd = monthsElapsed > 0 ? (actual / monthsElapsed) * 12 : 0;
  const requiredMonthly =
    remainingMonths > 0 ? Math.max(0, annualGoal - actual) / remainingMonths : 0;

  return { cumulative, actual, target, aheadBy, pct, projectedYearEnd, requiredMonthly };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectors/goal-pace.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/goal-pace.ts tests/selectors/goal-pace.test.ts
git commit -m "feat(analytics): goal run-rate projection + required monthly" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Analytics barrel (`wheelAnalytics`)

**Model:** Sonnet. **Depends on Tasks 1–4** (imports their exports). Run after they land.

**Files:**
- Create: `lib/selectors/analytics.ts`
- Test: `tests/selectors/analytics.test.ts`

**Interfaces:**
- Consumes: `CalculationResult` from `@/types/trading`; the four selectors from Tasks 1–4.
- Produces:
  ```ts
  export interface WheelAnalytics {
    tradeQuality: TradeQuality;
    premium: PremiumStats;
    allocation: AllocationStats;
    capitalEfficiency: CapitalEfficiency;
  }
  export function wheelAnalytics(result: CalculationResult): WheelAnalytics;
  ```
  Trade quality excludes `DATA_ISSUE` events (they are not real trades).

- [ ] **Step 1: Write the failing test**

```ts
import { wheelAnalytics } from "@/lib/selectors/analytics";
import type { CalculationResult } from "@/types/trading";

const result = {
  realizedEvents: [
    { realizedPnl: 300, strategy: "COVERED_CALL", annualizedRoiPercent: 20, capitalDeployed: 10000 },
    { realizedPnl: -100, strategy: "CASH_SECURED_PUT", annualizedRoiPercent: 10, capitalDeployed: 5000 },
    { realizedPnl: -999, strategy: "DATA_ISSUE", annualizedRoiPercent: null, capitalDeployed: null },
  ],
  optionLifecycles: [
    { premiumReceived: 100, netOptionPnl: 80, strategy: "COVERED_CALL", optionType: "call", status: "expired" },
  ],
  monthlyReturns: [
    { closedTradeCapital: 10000, averageDeployedCapital: 10000, optionsPremiumPnl: 80, capitalDays: 40 },
  ],
  aggregates: {
    symbolBreakdown: [{ symbol: "A", capital: 8000 }, { symbol: "B", capital: 2000 }],
    strategyBreakdown: [{ strategy: "COVERED_CALL", capital: 10000 }],
  },
} as unknown as CalculationResult;

test("composes the four selectors and excludes DATA_ISSUE from trade quality", () => {
  const out = wheelAnalytics(result);
  expect(out.tradeQuality.totalTrades).toBe(2); // DATA_ISSUE excluded
  expect(out.premium.captureRate).toBeCloseTo(0.8, 5);
  expect(out.allocation.bySymbol.topShare).toBeCloseTo(0.8, 5);
  expect(out.capitalEfficiency.incomePerDay).toBeCloseTo(2, 5); // 80 / 40
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectors/analytics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CalculationResult } from "@/types/trading";
import { tradeQuality, type TradeQuality } from "@/lib/selectors/trade-quality";
import { premiumStats, type PremiumStats } from "@/lib/selectors/premium-capture";
import { allocation, type AllocationStats } from "@/lib/selectors/allocation";
import { capitalEfficiency, type CapitalEfficiency } from "@/lib/selectors/capital-efficiency";

export interface WheelAnalytics {
  tradeQuality: TradeQuality;
  premium: PremiumStats;
  allocation: AllocationStats;
  capitalEfficiency: CapitalEfficiency;
}

export function wheelAnalytics(result: CalculationResult): WheelAnalytics {
  const tradeEvents = result.realizedEvents.filter((e) => e.strategy !== "DATA_ISSUE");
  return {
    tradeQuality: tradeQuality(tradeEvents),
    premium: premiumStats(result.optionLifecycles),
    allocation: allocation(
      result.aggregates.symbolBreakdown.map((b) => ({ symbol: b.symbol, capital: b.capital })),
      result.aggregates.strategyBreakdown.map((b) => ({ strategy: b.strategy, capital: b.capital })),
    ),
    capitalEfficiency: capitalEfficiency(result.realizedEvents, result.monthlyReturns),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectors/analytics.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/analytics.ts tests/selectors/analytics.test.ts
git commit -m "feat(analytics): wheelAnalytics barrel composing selectors" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full-suite verification & review

**Model:** Opus (review). **Depends on Tasks 1–6.**

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS — all new selector tests plus the pre-existing suite (`tests/calculations.test.ts`, `tests/import.test.ts`, etc.) green. No regressions.

- [ ] **Step 2: Typecheck the new code**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/selectors/*` or `tests/selectors/*`.

- [ ] **Step 3: Review checklist (no code changes unless a defect is found)**
  - Every selector returns `null` (not `NaN`/`Infinity`) on zero denominators.
  - Percent-vs-fraction conventions match the Global Constraints (fresh rates are fractions; `annualizedRoc` stays in percent units).
  - No input arrays are mutated (selectors copy before sorting — verify `allocation` sorts a derived array, which it does).
  - Public types exported for UI consumption: `TradeQuality`, `PremiumStats`, `Concentration`, `AllocationStats`, `CapitalEfficiency`, `WheelAnalytics`, extended `GoalPaceResult`.

- [ ] **Step 4: Commit (only if a defect was fixed)**

```bash
git add -A
git commit -m "test(analytics): verification fixes for selector suite" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (author)

- **Spec coverage (§6 `now`-tier):** profit factor, expectancy, payoff (T1); premium capture overall+per-strategy, assignment rate call/put (T2); concentration HHI + top-N share by symbol & strategy (T3); portfolio annualized ROC, capital turnover, income/day (T4); run-rate projection + required monthly (T5). Win rate is included in T1. Net P&L / premium collected / YTD ROI already exist in `aggregates` and need no selector. Max drawdown, Sortino, Calmar are `derived`-tier and belong to a later plan (Performance/risk), not this one — intentionally out of scope.
- **Placeholder scan:** none — every step has complete test + implementation code and exact commands.
- **Type consistency:** `TradeQuality`, `PremiumStats`, `AllocationStats`/`Concentration`, `CapitalEfficiency`, `WheelAnalytics` names are used identically in their defining task and in T6/T7. `allocation()` signature (positional `symbolBreakdown`, `strategyBreakdown`, `topN`) matches its call in T6.
- **Next plans (not this one):** Aurora design system + `KpiCard` consolidation; Overview/Performance UI wiring `wheelAnalytics`; risk selectors (drawdown/Sortino/Calmar); benchmark + logo subsystems; wheel cycle-linking engine.

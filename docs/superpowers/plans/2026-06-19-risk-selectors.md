# Risk selectors (Plan C) — Implementation Plan

> Execute via subagent-driven-development. Task C1 (pure selectors, TDD) then C2 (wire into Performance).

**Goal:** Add risk-adjusted metrics — max drawdown, Sortino, Calmar — as pure tested functions, and surface them in the Performance (Capital & ROI) tab.

**Tech Stack:** TypeScript, Vitest globals, `@/` alias.

## Global Constraints
- Vitest globals (no test/expect imports); `@/` alias; pure functions; null (never NaN/Infinity) on zero denominators.
- `realizedRoiPercent`/`averageMonthlyRoi` are PERCENT units; `maxDrawdownPct` is a FRACTION (0–1).
- Gates: `npm test`, `npm run typecheck`, `npx next lint`, `npx next build`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure
- Create `lib/selectors/risk.ts` + `tests/selectors/risk.test.ts` (C1).
- Modify `components/dashboard/DashboardApp.tsx` CapitalTab — add a risk strip (C2).

---

### Task C1: risk.ts (maxDrawdown, sortino, calmar, riskMetrics)

**Files:** Create `lib/selectors/risk.ts`, `tests/selectors/risk.test.ts`.

**Produces:**
```ts
export interface DrawdownResult { maxDrawdown: number; maxDrawdownPct: number | null; peakIndex: number; troughIndex: number; }
export function maxDrawdown(equity: number[]): DrawdownResult;
export function sortino(returns: number[], mar?: number): number | null;
export function calmar(annualizedReturnPct: number | null, maxDrawdownFraction: number | null): number | null;
export interface RiskMetrics { maxDrawdown: number; maxDrawdownPct: number | null; sortino: number | null; calmar: number | null; }
export function riskMetrics(result: import("@/types/trading").CalculationResult): RiskMetrics;
```

- [ ] **Step 1: failing test** (`tests/selectors/risk.test.ts`)
```ts
import { maxDrawdown, sortino, calmar, riskMetrics } from "@/lib/selectors/risk";
import type { CalculationResult } from "@/types/trading";

test("maxDrawdown finds the largest peak-to-trough decline", () => {
  const d = maxDrawdown([0, 10, 7, 12, 5, 9]);
  expect(d.maxDrawdown).toBe(7);          // peak 12 -> trough 5
  expect(d.maxDrawdownPct).toBeCloseTo(7 / 12, 5);
  expect(d.peakIndex).toBe(3);
  expect(d.troughIndex).toBe(4);
});

test("maxDrawdown: no drawdown -> pct null; empty -> safe zeros", () => {
  expect(maxDrawdown([0, 5, 10]).maxDrawdown).toBe(0);
  expect(maxDrawdown([0, 5, 10]).maxDrawdownPct).toBeNull();
  const e = maxDrawdown([]);
  expect(e.maxDrawdown).toBe(0);
  expect(e.maxDrawdownPct).toBeNull();
});

test("sortino uses downside deviation only", () => {
  // mean 1.2; downside sq [0,0,1,0,4] mean 1 -> dev 1 -> 1.2/1
  expect(sortino([2, 3, -1, 4, -2], 0)).toBeCloseTo(1.2, 5);
});

test("sortino: no downside or empty -> null (no NaN)", () => {
  expect(sortino([1, 2, 3], 0)).toBeNull();
  expect(sortino([], 0)).toBeNull();
});

test("calmar = annualized return / max drawdown; null-safe", () => {
  expect(calmar(18, 0.5833)).toBeCloseTo(0.18 / 0.5833, 4);
  expect(calmar(18, null)).toBeNull();
  expect(calmar(null, 0.5)).toBeNull();
  expect(calmar(18, 0)).toBeNull();
});

test("riskMetrics composes from result", () => {
  const result = {
    aggregates: {
      monthlyRealizedPnl: [
        { month: "1", pnl: 0, cumulative: 0 },
        { month: "2", pnl: 10, cumulative: 10 },
        { month: "3", pnl: -3, cumulative: 7 },
        { month: "4", pnl: 5, cumulative: 12 },
        { month: "5", pnl: -7, cumulative: 5 },
        { month: "6", pnl: 4, cumulative: 9 },
      ],
      averageMonthlyRoi: 1.5,
    },
    monthlyReturns: [
      { realizedRoiPercent: 2 }, { realizedRoiPercent: 3 }, { realizedRoiPercent: -1 },
      { realizedRoiPercent: 4 }, { realizedRoiPercent: -2 }, { realizedRoiPercent: 1 },
    ],
  } as unknown as CalculationResult;
  const r = riskMetrics(result);
  expect(r.maxDrawdown).toBe(7);
  expect(r.maxDrawdownPct).toBeCloseTo(7 / 12, 5);
  expect(r.sortino).toBeCloseTo(1.278, 2);   // mean 7/6, downside dev sqrt(5/6)
  expect(r.calmar).toBeCloseTo((1.5 * 12 / 100) / (7 / 12), 3);
});
```

- [ ] **Step 2: run, expect FAIL** — `npx vitest run tests/selectors/risk.test.ts`.

- [ ] **Step 3: implement** (`lib/selectors/risk.ts`)
```ts
import type { CalculationResult } from "@/types/trading";

export interface DrawdownResult {
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  peakIndex: number;
  troughIndex: number;
}

export function maxDrawdown(equity: number[]): DrawdownResult {
  let peak = -Infinity;
  let curPeakIdx = 0;
  let maxDD = 0;
  let peakIndex = 0;
  let troughIndex = 0;
  let peakValAtMax = 0;
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (v > peak) {
      peak = v;
      curPeakIdx = i;
    }
    const dd = peak - v;
    if (dd > maxDD) {
      maxDD = dd;
      troughIndex = i;
      peakIndex = curPeakIdx;
      peakValAtMax = peak;
    }
  }
  return {
    maxDrawdown: maxDD,
    maxDrawdownPct: peakValAtMax > 0 ? maxDD / peakValAtMax : null,
    peakIndex,
    troughIndex,
  };
}

export function sortino(returns: number[], mar = 0): number | null {
  if (returns.length === 0) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const downsideSq =
    returns.reduce((s, r) => {
      const d = Math.min(0, r - mar);
      return s + d * d;
    }, 0) / returns.length;
  const downsideDev = Math.sqrt(downsideSq);
  if (downsideDev === 0) return null;
  return (mean - mar) / downsideDev;
}

export function calmar(
  annualizedReturnPct: number | null,
  maxDrawdownFraction: number | null,
): number | null {
  if (annualizedReturnPct === null) return null;
  if (maxDrawdownFraction === null || maxDrawdownFraction === 0) return null;
  return annualizedReturnPct / 100 / maxDrawdownFraction;
}

export interface RiskMetrics {
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  sortino: number | null;
  calmar: number | null;
}

export function riskMetrics(result: CalculationResult): RiskMetrics {
  const equity = result.aggregates.monthlyRealizedPnl.map((m) => m.cumulative);
  const returns = result.monthlyReturns.map((m) => m.realizedRoiPercent ?? 0);
  const dd = maxDrawdown(equity);
  const annualizedReturnPct =
    result.aggregates.averageMonthlyRoi === null ? null : result.aggregates.averageMonthlyRoi * 12;
  return {
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPct: dd.maxDrawdownPct,
    sortino: sortino(returns, 0),
    calmar: calmar(annualizedReturnPct, dd.maxDrawdownPct),
  };
}
```

- [ ] **Step 4: run, expect PASS** — `npx vitest run tests/selectors/risk.test.ts`.
- [ ] **Step 5: commit** — `git add lib/selectors/risk.ts tests/selectors/risk.test.ts` + message `feat(analytics): risk selectors (max drawdown, Sortino, Calmar)`.

---

### Task C2: wire risk strip into Performance (CapitalTab)

**Files:** Modify `components/dashboard/DashboardApp.tsx` `CapitalTab`.
- `import { riskMetrics } from "@/lib/selectors/risk";` and compute `const risk = riskMetrics(result);` in CapitalTab.
- Add three KpiCards (shared component) to the Capital readout (or a small dedicated "Risk" MetricGroup below the readout):
  - Max drawdown: value `risk.maxDrawdownPct === null ? "—" : formatPercent(-(risk.maxDrawdownPct * 100), 1)`, tone `risk.maxDrawdownPct ? "negative" : "neutral"`, tooltip "Largest peak-to-trough decline in cumulative realized equity."
  - Sortino: value `risk.sortino === null ? "—" : formatNumber(risk.sortino, 2)`, tone "neutral", tooltip "Downside-deviation-adjusted return (monthly ROI, MAR 0)."
  - Calmar: value `risk.calmar === null ? "—" : formatNumber(risk.calmar, 2)`, tone "neutral", tooltip "Annualized return divided by max drawdown."
- Gates: `npm run typecheck`, `npx next lint`, `npx next build`, `npm test`. No commit by implementer (controller commits C2 with C1 or separately).

## Self-review note
maxDrawdownPct is a fraction → ×100 and negated for display. sortino/calmar are ratios → formatNumber, "—" on null. All zero-denominator paths return null. The riskMetrics composer reads `aggregates.monthlyRealizedPnl[].cumulative` and `monthlyReturns[].realizedRoiPercent`, both already present in CalculationResult.

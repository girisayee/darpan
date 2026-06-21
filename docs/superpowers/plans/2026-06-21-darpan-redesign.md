# Darpan Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and re-organize the existing trading-performance app into "Darpan" — a phone-first, four-tab experience (Home / Performance / Tickers / Positions) that surfaces the engine's full analytics, without touching the calculation engine's math.

**Architecture:** The calculation engine (`lib/calculations/engine.ts`) and all existing selectors stay as-is. We add three pure selectors (`daily-pnl`, `leaderboard`, `strategy-analytics`), rework the shell/navigation, and recompose the dashboard tabs. Existing reusable pieces are leveraged: `DataTable` (already has search + pagination + sort), `SegmentedControl` and `MonthlyRoiTable` (in `components/dashboard/tabs/shared.tsx`), `KpiCard` (its `helper` prop carries the dual $/% line), `BuyingPowerGauge`, `BenchmarkComparison`, `wheelAnalytics`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 3 (Aurora tokens in `app/globals.css` + `tailwind.config.ts`), lucide-react icons, Recharts (available), Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-06-21-darpan-redesign-design.md`

## Global Constraints

- Engine math is frozen — no edits to `lib/calculations/engine.ts` or import logic. New code is additive selectors + UI only.
- Do NOT add: max drawdown, Sortino, Calmar, payoff-ratio surfacing; live option marks; discipline streak / `dailyLossLimit`; social leaderboard. (Spec §1 non-goals, §8.)
- Brand name is exactly `Darpan`. Tagline "The mirror for your trades." Hook "It doesn't flatter. It reflects."
- Tabs, in order: `Home`, `Performance`, `Tickers`, `Positions`. Overflow (Import/Settings/account/theme/export) lives behind a `⋯` menu.
- Dark-first; every change must work in light + dark (Aurora tokens, never hardcoded hex).
- Tests live in `tests/**/*.test.ts`, node env, run via `npx vitest run <path>`. Pure logic is unit-tested (TDD). UI is verified via `npm run typecheck` + `npm run lint` + `npm run build` (no jsdom configured — do not author component render tests).
- Numeric displays use `tabular-nums` and the existing `formatCurrency`/`formatPercent` helpers (`lib/utils/format.ts`).
- Reuse `filterResult` for any strategy/period scoping so screens stay consistent with global aggregates.

---

## Phase 1 — New pure selectors (TDD)

### Task 1: Daily-P&L selector

**Files:**
- Create: `lib/selectors/daily-pnl.ts`
- Test: `tests/selectors/daily-pnl.test.ts`

**Interfaces:**
- Consumes: `RealizedPnLEvent` from `@/types/trading`.
- Produces: `interface DailyPnl { date: string; pnl: number; events: RealizedPnLEvent[] }` and `function dailyPnl(events: RealizedPnLEvent[]): DailyPnl[]` (ascending by date, `DATA_ISSUE` excluded). Consumed by the calendar heatmap (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// tests/selectors/daily-pnl.test.ts
import { describe, it, expect } from "vitest";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import type { RealizedPnLEvent } from "@/types/trading";

function ev(date: string, realizedPnl: number, strategy = "SWING_TRADE"): RealizedPnLEvent {
  return {
    id: `${date}-${realizedPnl}`, date, symbol: "X", strategy: strategy as RealizedPnLEvent["strategy"],
    grossProceeds: 0, costBasis: null, optionPremium: 0, fees: 0, realizedPnl, quantity: 1,
    capitalDeployed: null, roiPercent: null, annualizedRoiPercent: null, holdingDays: null,
    linkedTransactionIds: [], explanation: "", warnings: [],
  };
}

describe("dailyPnl", () => {
  it("returns [] for no events", () => {
    expect(dailyPnl([])).toEqual([]);
  });
  it("sums multiple events on the same calendar day", () => {
    const out = dailyPnl([ev("2026-06-12", 100), ev("2026-06-12", -40)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: "2026-06-12", pnl: 60 });
    expect(out[0].events).toHaveLength(2);
  });
  it("sorts days ascending and excludes DATA_ISSUE", () => {
    const out = dailyPnl([ev("2026-06-12", 10), ev("2026-01-03", 5), ev("2026-02-02", 999, "DATA_ISSUE")]);
    expect(out.map((d) => d.date)).toEqual(["2026-01-03", "2026-06-12"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/selectors/daily-pnl.test.ts`
Expected: FAIL — cannot find module `@/lib/selectors/daily-pnl`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/selectors/daily-pnl.ts
import type { RealizedPnLEvent } from "@/types/trading";

export interface DailyPnl {
  date: string; // YYYY-MM-DD
  pnl: number;
  events: RealizedPnLEvent[];
}

export function dailyPnl(events: RealizedPnLEvent[]): DailyPnl[] {
  const map = new Map<string, DailyPnl>();
  for (const e of events) {
    if (e.strategy === "DATA_ISSUE") continue;
    const key = e.date.slice(0, 10);
    const bucket = map.get(key) ?? { date: key, pnl: 0, events: [] };
    bucket.pnl += e.realizedPnl;
    bucket.events.push(e);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/selectors/daily-pnl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/daily-pnl.ts tests/selectors/daily-pnl.test.ts
git commit -m "feat(selectors): add daily-P&L binning for the calendar heatmap"
```

### Task 2: Leaderboard selector

**Files:**
- Create: `lib/selectors/leaderboard.ts`
- Test: `tests/selectors/leaderboard.test.ts`

**Interfaces:**
- Consumes: `CalculationResult` (`aggregates.symbolBreakdown`).
- Produces: `interface LeaderboardRow { symbol: string; pnl: number; roiPercent: number | null; trades: number; winRate: number | null }`, `interface Leaderboard { winners: LeaderboardRow[]; losers: LeaderboardRow[] }`, `function leaderboard(result: CalculationResult, limit?: number): Leaderboard`. Consumed by the Tickers screen (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// tests/selectors/leaderboard.test.ts
import { describe, it, expect } from "vitest";
import { leaderboard } from "@/lib/selectors/leaderboard";
import type { CalculationResult } from "@/types/trading";

function res(breakdown: CalculationResult["aggregates"]["symbolBreakdown"]): CalculationResult {
  return { aggregates: { symbolBreakdown: breakdown } } as CalculationResult;
}
const row = (symbol: string, pnl: number) => ({ symbol, pnl, capital: 0, roiPercent: 0, trades: 1, winRate: 0 });

describe("leaderboard", () => {
  it("splits winners (pnl>0 desc) and losers (pnl<0 asc)", () => {
    const out = leaderboard(res([row("A", 100), row("B", -50), row("C", 300), row("D", -200)]));
    expect(out.winners.map((r) => r.symbol)).toEqual(["C", "A"]);
    expect(out.losers.map((r) => r.symbol)).toEqual(["D", "B"]);
  });
  it("excludes zero-pnl symbols and respects limit", () => {
    const out = leaderboard(res([row("A", 10), row("Z", 0), row("B", 20), row("C", 30)]), 2);
    expect(out.winners.map((r) => r.symbol)).toEqual(["C", "B"]);
    expect(out.losers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/selectors/leaderboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/selectors/leaderboard.ts
import type { CalculationResult } from "@/types/trading";

export interface LeaderboardRow {
  symbol: string;
  pnl: number;
  roiPercent: number | null;
  trades: number;
  winRate: number | null;
}

export interface Leaderboard {
  winners: LeaderboardRow[];
  losers: LeaderboardRow[];
}

export function leaderboard(result: CalculationResult, limit = 5): Leaderboard {
  const rows: LeaderboardRow[] = (result.aggregates.symbolBreakdown ?? []).map((b) => ({
    symbol: b.symbol, pnl: b.pnl, roiPercent: b.roiPercent, trades: b.trades, winRate: b.winRate,
  }));
  const winners = rows.filter((r) => r.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, limit);
  const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, limit);
  return { winners, losers };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/selectors/leaderboard.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/leaderboard.ts tests/selectors/leaderboard.test.ts
git commit -m "feat(selectors): add per-symbol leaderboard (winners/losers)"
```

### Task 3: Strategy-scoped analytics selector

**Files:**
- Create: `lib/selectors/strategy-analytics.ts`
- Test: `tests/selectors/strategy-analytics.test.ts`

**Interfaces:**
- Consumes: `CalculationResult`, `tradeQuality` (`@/lib/selectors/trade-quality`), `premiumStats` (`@/lib/selectors/premium-capture`).
- Produces: `type StrategyKey = "csp" | "cc" | "long" | "swing"`, `interface StrategyAnalytics { key: StrategyKey; quality: TradeQuality; premium: PremiumStats | null; pnl: number; capitalAtRisk: number }`, `function strategyAnalytics(result: CalculationResult, key: StrategyKey): StrategyAnalytics`. Consumed by the Positions hub (Task 14) and Home strip (Task 12).

- [ ] **Step 1: Write the failing test**

```ts
// tests/selectors/strategy-analytics.test.ts
import { describe, it, expect } from "vitest";
import { strategyAnalytics } from "@/lib/selectors/strategy-analytics";
import type { CalculationResult, RealizedPnLEvent } from "@/types/trading";

function ev(strategy: string, realizedPnl: number): RealizedPnLEvent {
  return {
    id: `${strategy}-${realizedPnl}`, date: "2026-06-01", symbol: "X",
    strategy: strategy as RealizedPnLEvent["strategy"], grossProceeds: 0, costBasis: null,
    optionPremium: 0, fees: 0, realizedPnl, quantity: 1, capitalDeployed: null, roiPercent: null,
    annualizedRoiPercent: null, holdingDays: null, linkedTransactionIds: [], explanation: "", warnings: [],
  };
}
function res(events: RealizedPnLEvent[]): CalculationResult {
  return { realizedEvents: events, optionLifecycles: [], taxLots: [] } as unknown as CalculationResult;
}

describe("strategyAnalytics", () => {
  it("scopes events to the swing strategy and sums pnl", () => {
    const out = strategyAnalytics(res([ev("SWING_TRADE", 100), ev("COVERED_CALL", 999)]), "swing");
    expect(out.pnl).toBe(100);
    expect(out.quality.totalTrades).toBe(1);
    expect(out.premium).toBeNull();
  });
  it("includes assignment events under their parent strategy", () => {
    const out = strategyAnalytics(res([ev("CASH_SECURED_PUT", 50), ev("PUT_ASSIGNMENT", -20)]), "csp");
    expect(out.pnl).toBe(30);
    expect(out.quality.totalTrades).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/selectors/strategy-analytics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/selectors/strategy-analytics.ts
import type { CalculationResult } from "@/types/trading";
import { tradeQuality, type TradeQuality } from "@/lib/selectors/trade-quality";
import { premiumStats, type PremiumStats } from "@/lib/selectors/premium-capture";

export type StrategyKey = "csp" | "cc" | "long" | "swing";

export interface StrategyAnalytics {
  key: StrategyKey;
  quality: TradeQuality;
  premium: PremiumStats | null; // null for swing (no short-premium concept)
  pnl: number;
  capitalAtRisk: number; // sum of capitalDeployed across currently-open positions
}

const EVENT_STRATEGIES: Record<StrategyKey, string[]> = {
  csp: ["CASH_SECURED_PUT", "PUT_ASSIGNMENT"],
  cc: ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT", "COVERED_CALL_ASSIGNMENT_STOCK"],
  long: ["LONG_OPTION"],
  swing: ["SWING_TRADE"],
};

export function strategyAnalytics(result: CalculationResult, key: StrategyKey): StrategyAnalytics {
  const events = result.realizedEvents.filter((e) => EVENT_STRATEGIES[key].includes(e.strategy));
  const quality = tradeQuality(events);
  const pnl = events.reduce((s, e) => s + e.realizedPnl, 0);

  let premium: PremiumStats | null = null;
  let capitalAtRisk = 0;

  if (key === "csp" || key === "cc") {
    const stratEnum = key === "csp" ? "CASH_SECURED_PUT" : "COVERED_CALL";
    const lcs = result.optionLifecycles.filter((l) => l.strategy === stratEnum);
    premium = premiumStats(lcs);
    capitalAtRisk = lcs
      .filter((l) => l.status === "open")
      .reduce((s, l) => s + (l.capitalDeployed ?? l.strikePrice * l.sharesControlled), 0);
  } else if (key === "long") {
    const lcs = result.optionLifecycles.filter((l) => l.direction === "long");
    premium = premiumStats(lcs);
    capitalAtRisk = lcs
      .filter((l) => l.status === "open")
      .reduce((s, l) => s + (l.capitalDeployed ?? 0), 0);
  } else {
    // swing: open stock lots' remaining cost
    capitalAtRisk = result.taxLots
      .filter((l) => l.status !== "closed")
      .reduce((s, l) => s + l.remainingQuantity * l.costBasisPerShare, 0);
  }

  return { key, quality, premium, pnl, capitalAtRisk };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/selectors/strategy-analytics.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/selectors/strategy-analytics.ts tests/selectors/strategy-analytics.test.ts
git commit -m "feat(selectors): add per-strategy analytics scoping"
```

---

## Phase 2 — Brand & shell

### Task 4: Logo mark + rebrand strings

**Files:**
- Create: `components/common/Logo.tsx`
- Modify: `app/layout.tsx` (metadata title/description), `package.json:2` (`"name": "darpan"`), `README.md` if it references the old name.

**Interfaces:**
- Produces: `function Logo({ size?: number, showWordmark?: boolean }): JSX.Element` — the aurora-gradient rounded square containing the mirrored performance-line SVG + optional "Darpan" wordmark. Consumed by `AppShell` (Task 5).

- [ ] **Step 1: Create the Logo component**

```tsx
// components/common/Logo.tsx
export function Logo({ size = 24, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const inner = Math.round(size * 0.6);
  return (
    <span className="flex items-center gap-2 select-none">
      <span
        className="inline-flex items-center justify-center rounded-[6px] bg-aurora"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3,10 9,5 13,8 21,3" stroke="#fff" strokeWidth="1.8" />
          <polyline points="3,14 9,19 13,16 21,21" stroke="#fff" strokeWidth="1.8" strokeOpacity="0.4" />
        </svg>
      </span>
      {showWordmark && <span className="text-[14px] font-semibold text-foreground">Darpan</span>}
    </span>
  );
}
```

- [ ] **Step 2: Update app metadata + package name**

In `app/layout.tsx`, set `export const metadata` `title: "Darpan"`, `description: "The mirror for your trades."`. In `package.json` line 2, change `"name": "positioniq"` to `"name": "darpan"`.

- [ ] **Step 3: Verify build + typecheck**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/common/Logo.tsx app/layout.tsx package.json
git commit -m "feat(brand): add Darpan logo mark and rebrand metadata"
```

### Task 5: AppShell — 4-tab desktop bar, overflow menu, account dropdown, bottom nav

**Files:**
- Modify: `components/shell/AppShell.tsx`
- Create: `components/shell/BottomNav.tsx`
- Create: `components/shell/OverflowMenu.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 4); existing `AppShellProps` (extend, do not break).
- Produces: an `AppShell` that renders (a) desktop top bar: `Logo` + 4 nav items + right cluster `[year select, ⋯]`; (b) on `< md`, the primary nav collapses — top bar shows `Logo` + `⋯` only, and a fixed `BottomNav` renders the 4 tabs. `OverflowMenu` houses account switch (dropdown), theme toggle, Import, Export, Settings.

- [ ] **Step 1: Build the OverflowMenu**

```tsx
// components/shell/OverflowMenu.tsx
"use client";
import { ChevronDown, FileDown, Moon, Settings, Sun, Upload, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { Theme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";

export function OverflowMenu(props: {
  accounts: string[]; account: string; onAccount: (a: string) => void;
  theme: Theme; onToggleTheme: () => void;
  onImport: () => void; onExport: () => void; onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/[0.06] hover:text-foreground";
  return (
    <div className="relative">
      <button type="button" aria-label="More" onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/40">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-56 rounded-[12px] border border-hairline bg-surface py-1 shadow-lg">
            <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-wide text-dim">Account</div>
            {props.accounts.map((a) => (
              <button key={a} role="menuitemradio" aria-checked={a === props.account} className={cn(item, a === props.account && "text-foreground")}
                onClick={() => { props.onAccount(a); setOpen(false); }}>
                {a === "ALL" ? "All accounts" : a}
              </button>
            ))}
            <div className="my-1 border-t border-hairline-soft" />
            <button className={item} onClick={() => { props.onToggleTheme(); }}>
              {props.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {props.theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button className={item} onClick={() => { props.onImport(); setOpen(false); }}><Upload className="h-4 w-4" />Import trades</button>
            <button className={item} onClick={() => { props.onExport(); setOpen(false); }}><FileDown className="h-4 w-4" />Export backup</button>
            <button className={item} onClick={() => { props.onSettings(); setOpen(false); }}><Settings className="h-4 w-4" />Settings</button>
            <ChevronDown className="hidden" />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the BottomNav (phone)**

```tsx
// components/shell/BottomNav.tsx
"use client";
import { LayoutGrid, LineChart, Trophy, Layers } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home: LayoutGrid, Performance: LineChart, Tickers: Trophy, Positions: Layers,
};

export function BottomNav({ tabs, activeTab, onSelectTab }: { tabs: readonly string[]; activeTab: string; onSelectTab: (t: string) => void; }) {
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface md:hidden">
      {tabs.map((tab) => {
        const Icon = ICONS[tab] ?? LayoutGrid;
        const active = tab === activeTab;
        return (
          <button key={tab} type="button" onClick={() => onSelectTab(tab)} aria-current={active ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center gap-1 py-2 text-[10px]", active ? "text-accent" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />
            {tab}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Rework AppShell to compose them**

Replace the header body in `components/shell/AppShell.tsx`: left = `<Logo />` + a `<nav className="hidden md:flex gap-1">` rendering the 4 tab pills (keep existing `handleKeyDown` arrow-cycling); right = `<select>` year (wrap in `hidden sm:block`) + `<OverflowMenu .../>`. Remove the inline account pill and the standalone theme/import/export/settings `IconButton`s (they now live in `OverflowMenu`). Render `<BottomNav .../>` after the header. Add `pb-16 md:pb-0` to the page content wrapper (in `DashboardApp`) so the fixed bottom nav doesn't cover content.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean build.

- [ ] **Step 5: Preview verification**

Start preview, confirm: desktop shows 4 tabs + `⋯`; narrow viewport (`preview_resize` ~390px) hides the top pills and shows the bottom tab bar; `⋯` opens account/theme/import/export/settings.

- [ ] **Step 6: Commit**

```bash
git add components/shell/
git commit -m "feat(shell): Darpan 4-tab shell with mobile bottom nav and overflow menu"
```

### Task 6: Wire the new tab set in DashboardApp

**Files:**
- Modify: `components/dashboard/DashboardApp.tsx`

**Interfaces:**
- Produces: `const TABS = ["Home", "Performance", "Tickers", "Positions"] as const` passed to `AppShell`; tab-panel switch renders the new screen components (Tasks 12–15) plus the existing Import/Settings modal-style panels. The header highlights the real active tab (drop the old "show Overview while in Import/Settings" hack — Import/Settings open from the `⋯` menu and render over the panel area with a back affordance).

- [ ] **Step 1: Update the tab constant + switch**

In `DashboardApp.tsx`, set `TABS` to the four names, default `activeTab = "Home"`. Map: `Home → <HomeTab .../>`, `Performance → <PerformanceTab .../>`, `Tickers → <TickersTab .../>`, `Positions → <PositionsTab .../>`. Keep `Import`/`Settings` branches. Pass the active filtered `CalculationResult` (via existing `filterResult` usage) into each.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: fails only where new tab components don't yet exist — create thin placeholders returning `null` to compile, then proceed; real implementations land in Tasks 12–15.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/DashboardApp.tsx components/dashboard/tabs/
git commit -m "feat(nav): switch DashboardApp to Home/Performance/Tickers/Positions"
```

---

## Phase 3 — Shared UI pieces

### Task 7: CalendarHeatmap component

**Files:**
- Create: `components/dashboard/CalendarHeatmap.tsx`
- Test (logic helper): `tests/selectors/heatmap-scale.test.ts`

**Interfaces:**
- Consumes: `DailyPnl[]` (Task 1).
- Produces: `function CalendarHeatmap({ days, mode, onSelectDay }: { days: DailyPnl[]; mode: "year" | "month"; onSelectDay: (d: DailyPnl) => void }): JSX.Element` and an exported pure helper `function intensity(pnl: number, maxAbs: number): number` (0.2–1.0) used for cell opacity. Color: `pos`/`neg` tokens via inline `rgb(var(--pos)/α)`; build a small util in the component.

- [ ] **Step 1: Write the failing test for the intensity helper**

```ts
// tests/selectors/heatmap-scale.test.ts
import { describe, it, expect } from "vitest";
import { intensity } from "@/components/dashboard/CalendarHeatmap";

describe("intensity", () => {
  it("floors at 0.2 and tops at 1.0", () => {
    expect(intensity(0, 100)).toBeCloseTo(0.2);
    expect(intensity(100, 100)).toBeCloseTo(1.0);
    expect(intensity(-50, 100)).toBeCloseTo(0.6);
  });
  it("returns floor when maxAbs is 0", () => {
    expect(intensity(0, 0)).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/selectors/heatmap-scale.test.ts`
Expected: FAIL — module/export not found.

- [ ] **Step 3: Implement the component + helper**

```tsx
// components/dashboard/CalendarHeatmap.tsx
"use client";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";

export function intensity(pnl: number, maxAbs: number): number {
  if (maxAbs <= 0) return 0.2;
  return 0.2 + 0.8 * Math.min(1, Math.abs(pnl) / maxAbs);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function CalendarHeatmap({ days, mode, onSelectDay }: {
  days: DailyPnl[]; mode: "year" | "month"; onSelectDay: (d: DailyPnl) => void;
}) {
  const byKey = new Map(days.map((d) => [d.date, d]));
  const maxAbs = days.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0);
  const color = (pnl: number) =>
    `rgb(var(--${pnl >= 0 ? "pos" : "neg"}) / ${intensity(pnl, maxAbs).toFixed(2)})`;

  // Determine the year from data (fallback: latest day) and months present.
  const year = days.length ? days[days.length - 1].date.slice(0, 4) : `${new Date().getFullYear()}`;
  const monthsToRender = mode === "year"
    ? Array.from(new Set(days.map((d) => Number(d.date.slice(5, 7))))).sort((a, b) => a - b)
    : [days.length ? Number(days[days.length - 1].date.slice(5, 7)) : 1];

  const cell = (key: string) => {
    const d = byKey.get(key);
    if (!d) return <div key={key} className="aspect-square rounded-[4px] bg-background" />;
    return (
      <button key={key} type="button" title={key} onClick={() => onSelectDay(d)}
        className="aspect-square rounded-[4px] border border-transparent hover:border-accent"
        style={{ background: color(d.pnl) }} />
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {monthsToRender.map((m) => {
        const mm = String(m).padStart(2, "0");
        const dim = new Date(Number(year), m, 0).getDate();
        return (
          <div key={m} className="grid items-center gap-1" style={{ gridTemplateColumns: `30px repeat(31, 1fr)` }}>
            <span className="text-[10px] text-muted-foreground">{MONTHS[m - 1]}</span>
            {Array.from({ length: 31 }, (_, i) => {
              const day = i + 1;
              if (day > dim) return <div key={i} />;
              return cell(`${year}-${mm}-${String(day).padStart(2, "0")}`);
            })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/selectors/heatmap-scale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/CalendarHeatmap.tsx tests/selectors/heatmap-scale.test.ts
git commit -m "feat(home): add calendar heatmap (year + month modes)"
```

### Task 8: Day-detail panel

**Files:**
- Create: `components/dashboard/DayDetail.tsx`

**Interfaces:**
- Consumes: `DailyPnl | null`.
- Produces: `function DayDetail({ day }: { day: DailyPnl | null }): JSX.Element` — header (date + signed total) and one row per `RealizedPnLEvent` (symbol + strategy label + signed P&L). Empty state "Select a day to see its trades." Reuse `label`, `signedMoney` from `tabs/shared.tsx`, `formatDisplayDate` from `lib/utils/format.ts`.

- [ ] **Step 1: Implement**

```tsx
// components/dashboard/DayDetail.tsx
"use client";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { formatDisplayDate } from "@/lib/utils/format";

export function DayDetail({ day }: { day: DailyPnl | null }) {
  if (!day) return <p className="text-[12px] text-muted-foreground">Select a day to see its trades.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-foreground">{formatDisplayDate(day.date)}</span>
        <span className="text-[12px] font-medium">{signedMoney(day.pnl)}</span>
      </div>
      {day.events.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded-[8px] bg-surface-inset px-2.5 py-1.5">
          <span className="text-[11px] text-foreground">{e.symbol} <span className="text-muted-foreground">{label(e.strategy)}</span></span>
          <span className="text-[11px]">{signedMoney(e.realizedPnl)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/DayDetail.tsx
git commit -m "feat(home): add calendar day-detail panel"
```

### Task 9: Leaderboard component

**Files:**
- Create: `components/dashboard/Leaderboard.tsx`

**Interfaces:**
- Consumes: `Leaderboard` (Task 2), `TickerLogo`, `formatCurrency`/`formatPercent`.
- Produces: `function LeaderboardPanels({ data }: { data: Leaderboard }): JSX.Element` — two columns ("Money makers" / "Account killers"), each row: logo, symbol, `winRate%·trades` sub, signed P&L, ROI%.

- [ ] **Step 1: Implement**

```tsx
// components/dashboard/Leaderboard.tsx
"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Leaderboard, LeaderboardRow } from "@/lib/selectors/leaderboard";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";

function Row({ r }: { r: LeaderboardRow }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-hairline-soft py-2 last:border-0">
      <TickerLogo symbol={r.symbol} size={22} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-foreground">{r.symbol}</div>
        <div className="text-[10px] text-muted-foreground">
          {r.winRate != null ? `${Math.round(r.winRate * 100)}% win` : "—"} · {r.trades} trades
        </div>
      </div>
      <div className="text-right">
        <div className="text-[12px] font-medium tabular-nums">{signedMoney(r.pnl)}</div>
        <div className="text-[10px] tabular-nums">{signedPercent(r.roiPercent)}</div>
      </div>
    </div>
  );
}

export function LeaderboardPanels({ data }: { data: Leaderboard }) {
  const Panel = ({ title, icon, rows, empty }: { title: string; icon: React.ReactNode; rows: LeaderboardRow[]; empty: string }) => (
    <div className="rounded-[12px] border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">{icon}{title}</div>
      {rows.length ? rows.map((r) => <Row key={r.symbol} r={r} />) : <p className="py-3 text-[11px] text-muted-foreground">{empty}</p>}
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel title="Money makers" icon={<ArrowUpRight className="h-3.5 w-3.5 text-pos" />} rows={data.winners} empty="No winners yet." />
      <Panel title="Account killers" icon={<ArrowDownRight className="h-3.5 w-3.5 text-neg" />} rows={data.losers} empty="No losers — clean run." />
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint`

```bash
git add components/dashboard/Leaderboard.tsx
git commit -m "feat(tickers): add money-makers / account-killers leaderboard"
```

### Task 10: By-strategy strip + strategy-metrics grid helpers

**Files:**
- Create: `components/dashboard/StrategyStrip.tsx`
- Create: `components/dashboard/StrategyMetrics.tsx`

**Interfaces:**
- Consumes: `CalculationResult`, `strategyAnalytics` (Task 3), `KpiCard`, `formatCurrency`/`formatPercent`.
- Produces:
  - `function StrategyStrip({ result, onOpen }: { result: CalculationResult; onOpen: (k: StrategyKey) => void }): JSX.Element` — 4 compact cards (CSP/CC/Long/Swing) showing P&L + ROI% + win%, each clickable → `onOpen(key)`.
  - `function StrategyMetrics({ a }: { a: StrategyAnalytics }): JSX.Element` — the per-strategy metric grid; CSP/CC include premium-capture/assignment metrics, swing/long use win/avg-win/avg-loss/profit-factor.

- [ ] **Step 1: Implement StrategyStrip**

```tsx
// components/dashboard/StrategyStrip.tsx
"use client";
import type { CalculationResult } from "@/types/trading";
import { strategyAnalytics, type StrategyKey } from "@/lib/selectors/strategy-analytics";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatPercent } from "@/lib/utils/format";

const LABELS: Record<StrategyKey, string> = { csp: "Cash-secured puts", cc: "Covered calls", long: "Long options", swing: "Swing" };

export function StrategyStrip({ result, onOpen }: { result: CalculationResult; onOpen: (k: StrategyKey) => void }) {
  const keys: StrategyKey[] = ["csp", "cc", "long", "swing"];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {keys.map((k) => {
        const a = strategyAnalytics(result, k);
        const roi = result.aggregates.strategyBreakdown.find((b) => b.pnl === a.pnl)?.roiPercent ?? null;
        return (
          <button key={k} type="button" onClick={() => onOpen(k)}
            className="rounded-[10px] border border-hairline bg-surface p-3 text-left hover:border-accent">
            <div className="text-[10.5px] text-muted-foreground">{LABELS[k]}</div>
            <div className="text-[16px] font-medium tabular-nums">{signedMoney(a.pnl)}</div>
            <div className="text-[9.5px] text-dim">ROI {formatPercent(roi)} · {a.quality.winRate != null ? `${Math.round(a.quality.winRate * 100)}%` : "—"} win</div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement StrategyMetrics**

```tsx
// components/dashboard/StrategyMetrics.tsx
"use client";
import type { StrategyAnalytics } from "@/lib/selectors/strategy-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-[16px] font-medium tabular-nums text-foreground">{value}</div>
    </div>
  );
}
const pctFrac = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function StrategyMetrics({ a }: { a: StrategyAnalytics }) {
  const q = a.quality;
  const cells: { label: string; value: string }[] = [
    { label: "Realized P&L", value: formatCurrency(a.pnl) },
    { label: "Win rate", value: pctFrac(q.winRate) },
    { label: "Expectancy", value: q.expectancy != null ? formatCurrency(q.expectancy) : "—" },
  ];
  if (a.premium && (a.key === "csp" || a.key === "cc")) {
    cells.push(
      { label: "Premium collected", value: formatCurrency(a.premium.premiumCollected) },
      { label: "Capture rate", value: formatPercent((a.key === "csp" ? a.premium.captureCashSecuredPut : a.premium.captureCoveredCall) != null ? ((a.key === "csp" ? a.premium.captureCashSecuredPut! : a.premium.captureCoveredCall!) * 100) : null) },
      { label: a.key === "csp" ? "Assignment · put" : "Assignment · call", value: pctFrac(a.key === "csp" ? a.premium.assignmentRatePut : a.premium.assignmentRateCall) },
      { label: "Capital at risk", value: formatCurrency(a.capitalAtRisk) },
    );
  } else {
    cells.push(
      { label: "Profit factor", value: q.profitFactor != null ? q.profitFactor.toFixed(2) : "—" },
      { label: "Avg win", value: q.averageWin != null ? formatCurrency(q.averageWin) : "—" },
      { label: "Avg loss", value: q.averageLoss != null ? formatCurrency(q.averageLoss) : "—" },
      { label: "Trades", value: String(q.totalTrades) },
    );
  }
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{cells.map((c) => <Cell key={c.label} {...c} />)}</div>;
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint`

```bash
git add components/dashboard/StrategyStrip.tsx components/dashboard/StrategyMetrics.tsx
git commit -m "feat(strategy): add by-strategy strip and per-strategy metric grids"
```

---

## Phase 4 — Screens

### Task 11: Positions table column sets

**Files:**
- Create: `components/dashboard/positions/columns.tsx`

**Interfaces:**
- Consumes: `Column<PositionRow>` from `DataTable`, `TickerLogo`, `StatusChip`, `signedMoney`.
- Produces: `interface PositionRow { sym: string; detail: string; status: "active" | "closed"; tag: string; warm: boolean; when: string; pnl: number; premium?: number; capital?: number; cost?: number; qty?: string; costBasis?: string }` and `function columnsFor(key: StrategyKey): Column<PositionRow>[]` — CSP/CC: Position·Stage·Premium·Capital·When·P&L; Long: Position·Stage·Cost·When·P&L; Swing: Position·Stage·Qty·Cost basis·When·P&L. Also `function toPositionRows(result, key, state): PositionRow[]` mapping lifecycles/events to rows.

- [ ] **Step 1: Implement columns + row mapping**

Provide `columnsFor` returning the per-strategy `Column<PositionRow>[]` (Position cell = `TickerLogo` + status dot + `sym`/`detail`; numeric columns `align:"right"`, `value` returns the number, `render` uses `signedMoney`/`formatCurrency`). Provide `toPositionRows(result, key, state)`: for CSP/CC/Long, map `result.optionLifecycles` filtered by strategy/direction and by `state` (`open` → active, terminal → closed; `state === "all"` → both) into rows (`when` = days-to-expiry for active, days-held for closed; `tag`/`warm` from `status`); for Swing, map open tax lots + closed `RealizedPnLEvent` (`strategy === "SWING_TRADE"`).

```tsx
// components/dashboard/positions/columns.tsx — shape (fill all four column sets)
import type { Column } from "@/components/tables/DataTable";
import type { CalculationResult } from "@/types/trading";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatCurrency } from "@/lib/utils/format";

export interface PositionRow {
  sym: string; detail: string; status: "active" | "closed"; tag: string; warm: boolean;
  when: string; pnl: number; premium?: number; capital?: number; cost?: number; qty?: string; costBasis?: string;
}

const position = (): Column<PositionRow> => ({
  key: "position", header: "Position", value: (r) => r.sym,
  render: (r) => (
    <span className="flex items-center gap-2">
      <TickerLogo symbol={r.sym} size={20} />
      <span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${r.status === "active" ? "bg-accent" : "bg-dim"}`} />{r.sym}
        </span>
        <span className="block text-[9.5px] text-muted-foreground">{r.detail}</span>
      </span>
    </span>
  ),
});
const stage = (): Column<PositionRow> => ({ key: "stage", header: "Stage", value: (r) => r.tag,
  render: (r) => <span className={r.warm ? "text-warn" : "text-muted-foreground"}>{r.tag}</span> });
const when = (): Column<PositionRow> => ({ key: "when", header: "When", align: "right", value: (r) => r.when });
const pnl = (): Column<PositionRow> => ({ key: "pnl", header: "P&L", align: "right", value: (r) => r.pnl, render: (r) => signedMoney(r.pnl) });
const money = (key: keyof PositionRow, header: string): Column<PositionRow> => ({
  key, header, align: "right", value: (r) => (r[key] as number | undefined) ?? null,
  render: (r) => (r[key] != null ? formatCurrency(r[key] as number) : <span className="opacity-50">—</span>),
});
const text = (key: keyof PositionRow, header: string): Column<PositionRow> => ({
  key, header, align: "right", value: (r) => (r[key] as string | undefined) ?? "",
});

export function columnsFor(key: StrategyKey): Column<PositionRow>[] {
  if (key === "csp" || key === "cc") return [position(), stage(), money("premium", "Premium"), money("capital", "Capital"), when(), pnl()];
  if (key === "long") return [position(), stage(), money("cost", "Cost"), when(), pnl()];
  return [position(), stage(), text("qty", "Qty"), text("costBasis", "Cost basis"), when(), pnl()];
}

// toPositionRows: implement the lifecycle/event → PositionRow mapping described above.
export function toPositionRows(result: CalculationResult, key: StrategyKey, state: "all" | "active" | "closed"): PositionRow[] {
  // ... map per the Step-1 description; filter by state.
  return [];
}
```

(The implementer fills `toPositionRows` per the description; the column sets above are complete.)

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint`

```bash
git add components/dashboard/positions/columns.tsx
git commit -m "feat(positions): strategy-specific table columns + row mapping"
```

### Task 12: Home screen

**Files:**
- Create: `components/dashboard/tabs/HomeTab.tsx`

**Interfaces:**
- Consumes: filtered `CalculationResult`, `AppSettings`, `tradeQuality`, `goalPace`, `dailyPnl`, `CalendarHeatmap`, `DayDetail`, `StrategyStrip`, `BuyingPowerGauge`, `KpiCard`, `SegmentedControl`. A prop `onOpenStrategy: (k: StrategyKey) => void` (navigates to Positions).
- Produces: `function HomeTab(props): JSX.Element`.

- [ ] **Step 1: Implement composition**

Sections in order: (1) period header — year + `SegmentedControl<"YTD"|"Month">`; (2) verdict strip — 4 `KpiCard`s: Net P&L · YTD (`aggregates.currentYearRealizedPnl`, `helper` = `formatPercent(aggregates.ytdRoi)` + " on capital", tone by sign), Expectancy (`tradeQuality(events).expectancy`, helper "avg per trade"), Profit factor (`.profitFactor.toFixed(2)`, helper "$ won ÷ lost"), Win rate (`${Math.round(winRate*100)}%`, helper `${wins} / ${total} trades`); (3) `<StrategyStrip result onOpen={onOpenStrategy} />`; (4) card with `<SegmentedControl>` YTD↔Month switching `<CalendarHeatmap mode>` over `dailyPnl(result.realizedEvents)`, plus `<DayDetail day={selected} />` (local `useState`); (5) bottom row grid — equity curve (Recharts line of `aggregates.monthlyRealizedPnl` cumulative; or reuse the existing equity chart from `PerformanceTab` if present), `<BuyingPowerGauge>`, and a small "ahead of pace" readout from `goalPace`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 3: Preview verification**

Confirm Home defaults to YTD, calendar toggles year↔month, clicking a day populates DayDetail, strategy strip cards navigate to Positions.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/tabs/HomeTab.tsx
git commit -m "feat(home): YTD home with verdict strip, calendar, strategy strip, buying power"
```

### Task 13: Tickers screen

**Files:**
- Create: `components/dashboard/tabs/TickersTab.tsx`

**Interfaces:**
- Consumes: filtered `CalculationResult`, `leaderboard`, `LeaderboardPanels`, `DataTable`, `TickerLogo`.
- Produces: `function TickersTab(props): JSX.Element`.

- [ ] **Step 1: Implement**

Render `<LeaderboardPanels data={leaderboard(result)} />` then a full sortable `<DataTable searchable pageSize={25}>` over `aggregates.symbolBreakdown` with columns Symbol (logo+symbol), Net P&L (`signedMoney`), ROI% (`signedPercent`), Trades, Win rate (`%`). Use `defaultSort` by `pnl` desc.

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add components/dashboard/tabs/TickersTab.tsx
git commit -m "feat(tickers): leaderboard + full sortable symbol table"
```

### Task 14: Positions screen (strategy hub)

**Files:**
- Create: `components/dashboard/tabs/PositionsTab.tsx`

**Interfaces:**
- Consumes: filtered `CalculationResult`, `strategyAnalytics`, `StrategyMetrics`, `columnsFor`/`toPositionRows` (Task 11), `DataTable`, `SegmentedControl`, `ReviewFixPanel`. Accepts optional `initialStrategy?: StrategyKey` (set when navigating from Home strip).
- Produces: `function PositionsTab(props): JSX.Element`.

- [ ] **Step 1: Implement**

State: `segment: "all" | StrategyKey` (default `"all"` or `initialStrategy`), `state: "all" | "active" | "closed"` (default `"active"`). "All strategies" view = 4 summary tiles (reuse `StrategyStrip` styling) → clicking sets `segment`. Per-strategy view = strategy name + `SegmentedControl<"All"|"Active"|"Closed">` + `<StrategyMetrics a={strategyAnalytics(result, segment)} />` + `<DataTable searchable pageSize={5} columns={columnsFor(segment)} rows={toPositionRows(result, segment, state)} />`. Keep the unresolved-data "Review & fix" banner (`ReviewFixPanel`) when the strategy has unresolved items.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 3: Preview verification**

Confirm: segment switching changes columns (Premium/Capital for CSP/CC, Qty/Cost basis for Swing), All/Active/Closed filters rows, search + pager work.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/tabs/PositionsTab.tsx
git commit -m "feat(positions): strategy-segmented hub with active/closed drill"
```

### Task 15: Performance screen

**Files:**
- Create or rework: `components/dashboard/tabs/PerformanceTab.tsx`

**Interfaces:**
- Consumes: filtered `CalculationResult`, `AppSettings`, `BenchmarkComparison`, `goalPace`, `capitalEfficiency`, `allocation`, `MonthlyRoiTable`, `KpiCard`.
- Produces: `function PerformanceTab(props): JSX.Element`.

- [ ] **Step 1: Implement**

Sections: (1) `<BenchmarkComparison>` (existing); (2) goal card from `goalPace`; (3) clean equity curve (cumulative P&L — reuse existing chart, **remove any drawdown shading / deepest-dip label**); (4) Capital deployed grid — `KpiCard`s for Avg deployed (`aggregates.averageDeployedCapital`), Peak deployed (`aggregates.peakDeployedCapital`), Return on capital (`capitalEfficiency(...).annualizedRoc`), Buying power used (deployed ÷ `settings.maxBuyingPower`), Capital turnover (`.capitalTurnover`), Income/day (`.incomePerDay`), Capital-days (Σ `monthlyReturns[].capitalDays`), Concentration (`allocation(...).bySymbol.hhi` + level); (5) `<MonthlyRoiTable rows={result.monthlyReturns} />`. **Do not render** max drawdown, Sortino, Calmar, or payoff ratio.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 3: Grep guard — confirm risk ratios are absent from UI**

Run: `git grep -nE "Sortino|Calmar|drawdown|payoff" -- components/`
Expected: no matches in rendered components (the `lib/selectors/risk.ts` file may remain unused).

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/tabs/PerformanceTab.tsx
git commit -m "feat(performance): benchmark, capital-deployed block, monthly breakdown; drop risk ratios"
```

---

## Phase 5 — Cleanup & full verification

### Task 16: Remove dead Overview/Options/Swing tabs and stale strings

**Files:**
- Delete: `components/dashboard/tabs/OverviewTab.tsx`, `components/dashboard/tabs/OptionsTab.tsx`, `components/dashboard/tabs/SwingTradesTab.tsx` (only after their content is fully covered by Home/Positions/Performance).
- Grep: remaining `RealizedEdge` / `positioniq` references.

- [ ] **Step 1: Confirm no imports of the old tabs remain**

Run: `git grep -nE "OverviewTab|OptionsTab|SwingTradesTab"`
Expected: only the files themselves; if other refs exist, fix first.

- [ ] **Step 2: Delete the dead tab files**

```bash
git rm components/dashboard/tabs/OverviewTab.tsx components/dashboard/tabs/OptionsTab.tsx components/dashboard/tabs/SwingTradesTab.tsx
```

- [ ] **Step 3: Replace residual brand strings**

Run: `git grep -nE "RealizedEdge|positioniq"` and replace user-facing occurrences with `Darpan`. (Leave `lib/import/robinhood.ts` `sourceBroker` values alone — those are data, not brand.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove legacy tabs and residual RealizedEdge strings"
```

### Task 17: Full suite + responsive smoke

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: all selector tests pass (daily-pnl, leaderboard, strategy-analytics, heatmap-scale).

- [ ] **Step 2: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Preview smoke (desktop + phone widths)**

Start preview; with `preview_resize`, verify at ~1280px (top bar, 4 tabs) and ~390px (bottom nav, no overflow, bottom-sheet day detail). Click through all four tabs, the Home strategy-strip → Positions jump, and a Positions Active/Closed/All toggle.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: darpan redesign full verification pass"
```

---

## Self-Review (completed by author)

- **Spec coverage:** Brand (T4), shell+mobile nav (T5/T6), Home incl. YTD calendar + strategy strip + buying power (T7/T8/T10/T12), Performance incl. capital block + monthly breakdown, risk ratios dropped (T15), Tickers leaderboard + table (T9/T13), Positions strategy hub + active/closed + strategy columns (T11/T14), DataTable search/pagination (reused — noted, not rebuilt), three new selectors (T1–T3). All spec §5–§7 sections map to a task.
- **Dropped items honored:** no streak/`dailyLossLimit`; risk ratios excluded with a grep guard (T15.3) and non-goal constraint.
- **Type consistency:** `StrategyKey` ("csp"|"cc"|"long"|"swing") defined in T3 and reused in T10/T11/T14; `DailyPnl` from T1 used in T7/T8/T12; `Leaderboard`/`LeaderboardRow` from T2 used in T9/T13; `PositionRow`/`columnsFor` from T11 used in T14.
- **Test env:** all authored tests are pure-logic in `tests/**/*.test.ts` (node env, matches `vitest.config.ts`); UI tasks verify via typecheck/lint/build/preview (no jsdom).
- **Known fill-in:** `toPositionRows` (T11) is described, not fully coded — it is mechanical lifecycle/event mapping; the column sets and row interface are complete.

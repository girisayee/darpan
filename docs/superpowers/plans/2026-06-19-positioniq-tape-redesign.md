# PositionIQ "Tape" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the PositionIQ dashboard into the dark-first, light-capable "Tape" trading-terminal identity — monospace numerics, gold accent, ticker rail, a global period-first filter bar — without changing the calculation engine.

**Architecture:** This is primarily a presentation refactor of an existing Next.js App Router app. The data layer (`lib/calculations`, `lib/import`, `lib/storage`, API routes) is unchanged. Work flows: design tokens → shared UI primitives → app shell + global filter bar → per-screen assembly → forms → QA. A handful of tasks carry real logic (theme persistence, a `topMovers` selector, preset→period mapping) and are built test-first; the rest are styling tasks verified by running the app against the mockups and keeping the existing test suite green.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.7, Tailwind CSS 3.4, `next/font`, lucide-react, recharts, Vitest + @testing-library/react.

**Visual source of truth:** `docs/redesign/tape/mockups/index.html` (open in a browser). **Token & component contract:** `docs/redesign/tape/README.md`. When a styling step says "match mockup N", lift the exact markup/classes from that screen in the gallery and bind them to Tailwind utilities mapped to the tokens.

## Global Constraints

- Product name is **PositionIQ** in all user-facing strings and code identifiers. Remove `RealizedEdge`/`realizededge.*`.
- Both **light and dark** themes required; every token pair must pass 4.5:1 contrast.
- Fonts: **Space Grotesk** (sans/UI) + **JetBrains Mono** (all numbers, `tabular-nums`) via `next/font/google` only — no `<link>` tags, no system-font fallback as the primary.
- **No `box-shadow`** anywhere; **no gradients**. Depth = surface tint + 1px hairline.
- Radius scale: 8 (controls) · 10 (tiles) · 12 (panels) · 14 (frame) · 999 (pills).
- Motion 120–160ms; **respect `prefers-reduced-motion`** (ticker rail must freeze).
- Accessibility floor per README §9: visible gold focus rings, `aria-label` on icon buttons, sign + chip redundancy for color, theme persists across reloads.
- Do **not** modify `lib/calculations/**`; existing Vitest suite must stay green after every task.
- Conventional commits; commit at the end of every task. Work on a branch, never commit to `main`/`master` directly.

---

## File Structure

**Create:**
- `lib/theme/use-theme.ts` — persisted light/dark hook.
- `lib/selectors/top-movers.ts` — derive ticker-rail data from a `CalculationResult`.
- `lib/filters/period.ts` — preset ↔ `{year, month}` mapping + types.
- `components/shell/AppHeader.tsx` — wordmark + `TickerRail` + icon buttons.
- `components/shell/TickerRail.tsx`
- `components/shell/TabNav.tsx`
- `components/shell/FilterBar.tsx`
- `components/dashboard/StatStrip.tsx`
- `components/dashboard/HeroReadout.tsx`
- `components/common/StatusChip.tsx`
- Test files alongside under `tests/` mirroring existing convention.

**Modify:**
- `app/layout.tsx` (fonts), `app/globals.css` (tokens, remove gradients), `tailwind.config.ts` (colors, fonts, remove `shadow-panel`).
- `components/dashboard/KpiCard.tsx` → becomes `Readout` (mono value, no shadow).
- `components/tables/DataTable.tsx` (restyle; keep API + sort logic).
- `components/charts/DashboardCharts.tsx` (Tape palette).
- `components/dashboard/DashboardApp.tsx` (the monolith: shell, filter state lift, remove drag/customize + `defaultDateRange` select, re-assemble each tab). Consider extracting tab bodies into `components/dashboard/tabs/*` if a step calls for it.
- `README.md` (rename to PositionIQ where stale), `docs/DESIGN.md` (note the new system).

---

### Task 0: Branch + green baseline

**Files:** none (repo state).

- [ ] **Step 1: Create a working branch**

```bash
git checkout -b redesign/tape
```

- [ ] **Step 2: Establish the baseline is green**

Run: `npm install && npm run test && npm run lint && npm run build`
Expected: all pass. If anything fails on a clean checkout, STOP and report — do not start on a red baseline.

- [ ] **Step 3: Commit the branch point** (no-op commit optional; skip if nothing to commit).

---

### Task 1: Fonts via next/font

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css:46-51` (the `button,input,select,textarea { font: inherit }` block stays; add base font on `body`)

**Interfaces:**
- Produces: CSS variables `--font-sans` and `--font-mono` on `<html>`, consumed by Tailwind in Task 2.

- [ ] **Step 1: Wire `next/font` in the root layout**

```tsx
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

const sans = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Default body to the sans variable** — in `globals.css` `body { ... }` add `font-family: var(--font-sans), system-ui, sans-serif;`

- [ ] **Step 3: Verify** — Run `npm run dev`, load `/`. Expected: UI now renders in Space Grotesk (visibly different from the old system font). No console errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: load Space Grotesk + JetBrains Mono via next/font"
```

---

### Task 2: Tape color tokens + Tailwind wiring

**Files:**
- Modify: `app/globals.css:5-44` (`:root`, `.dark`, `body`)
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: Tailwind utilities `bg-surface`, `border-hairline`, `text-muted-foreground`, `text-brand`, `text-pos`, `text-neg`, `text-warn`, `font-mono`, `font-sans`, radius defaults. Consumed by every later task.

- [ ] **Step 1: Replace the token blocks** in `globals.css` with the hex values from README §3, as CSS variables (use raw hex, e.g. `--surface: #121A24;`). Define the dark set under `:root` (dark is default) and the light set under `.light` (see Task 3 for which class is toggled — use `.light` on `<html>` for day, default = dark).

- [ ] **Step 2: Remove decorative backgrounds** — delete the two `radial-gradient`s and collapse `body` background to `background: var(--bg);`. Remove the header gradient overlay class usage in `DashboardApp.tsx` (the `bg-[linear-gradient(...)]` on the header) in Task 8.

- [ ] **Step 3: Update `tailwind.config.ts`** — map colors to the vars and add fonts; delete `shadow-panel`:

```ts
theme: {
  extend: {
    colors: {
      background: "var(--bg)",
      surface: "var(--surface)",
      "surface-inset": "var(--surface-inset)",
      hairline: "var(--hairline)",
      "hairline-soft": "var(--hairline-soft)",
      foreground: "var(--text)",
      "muted-foreground": "var(--text-muted)",
      dim: "var(--text-dim)",
      brand: "var(--brand)",
      pos: "var(--pos)",
      neg: "var(--neg)",
      warn: "var(--warn)",
    },
    fontFamily: {
      sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "monospace"],
    },
    borderRadius: { md: "8px", lg: "12px", xl: "14px" },
  },
},
```

Replace the old `border`/`card`/`primary`/`success`/`danger` color names as you touch each component, OR temporarily alias them (`card: "var(--surface)"`, `primary: "var(--brand)"`, `success: "var(--pos)"`, `danger: "var(--neg)"`, `border: "var(--hairline)"`) so the app keeps compiling between tasks. Aliasing is recommended to avoid a giant single-task rename.

- [ ] **Step 4: Verify** — `npm run dev`. Expected: dark graphite background, no gradients, no floating shadows; existing components still render (colors shifted). `npm run build` passes.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat: Tape color tokens, drop gradients and panel shadow"
```

---

### Task 3: Persisted theme (light/dark)

**Files:**
- Create: `lib/theme/use-theme.ts`
- Test: `tests/theme/use-theme.test.ts`
- Modify: `components/dashboard/DashboardApp.tsx` (replace the `dark` `useState`/`useEffect` at lines ~82, 92-94)

**Interfaces:**
- Produces: `useTheme(): { theme: "dark" | "light"; toggle: () => void }`. Persists to `localStorage["positioniq.theme"]`; applies `document.documentElement.classList.toggle("light", theme === "light")`. Initial value = stored value, else `prefers-color-scheme`.

- [ ] **Step 1: Write the failing test**

```ts
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/lib/theme/use-theme";

beforeEach(() => localStorage.clear());

test("toggle persists the chosen theme", () => {
  const { result } = renderHook(() => useTheme());
  const start = result.current.theme;
  act(() => result.current.toggle());
  expect(result.current.theme).not.toBe(start);
  expect(localStorage.getItem("positioniq.theme")).toBe(result.current.theme);
});

test("reads persisted theme on init", () => {
  localStorage.setItem("positioniq.theme", "light");
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe("light");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- use-theme`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `use-theme.ts`**

```ts
"use client";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "positioniq.theme";

function initial(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem(KEY, theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- use-theme`
Expected: PASS (both tests).

- [ ] **Step 5: Swap `DashboardApp` to use it** — remove the local `dark` state + its `useEffect`; call `const { theme, toggle } = useTheme();` and use `theme`/`toggle` for the header toggle button (final placement in Task 8).

- [ ] **Step 6: Commit**

```bash
git add lib/theme/use-theme.ts tests/theme/use-theme.test.ts components/dashboard/DashboardApp.tsx
git commit -m "feat: persist light/dark theme, fix toggle reset bug"
```

---

### Task 4: Restyle DataTable + StatusChip

**Files:**
- Modify: `components/tables/DataTable.tsx`
- Create: `components/common/StatusChip.tsx`
- Test: existing DataTable tests (if any) must still pass; add `tests/common/status-chip.test.tsx`.

**Interfaces:**
- `Column<T>` API and sort behavior UNCHANGED.
- Produces: `StatusChip({ kind })` where `kind: "open"|"closed"|"expired"|"assigned"|"ok"|"unresolved"|"zero-basis"`.

- [ ] **Step 1: Build `StatusChip`** — map each kind to `{ label, classes }` using semantic tokens at low alpha (see mockup chips). Example: `open → bg-brand/10 text-brand`, `ok/expired → bg-pos/10 text-pos`, `unresolved → bg-warn/15 text-warn`, `assigned/closed → bg-dim/15 text-dim`, `zero-basis → bg-neg/10 text-neg`.

- [ ] **Step 2: Restyle the table** to match mockups 04–09: `bg-surface` wrapper, `rounded-lg`, no shadow; `thead` cells `text-[9.5px] uppercase tracking-[.05em] text-muted-foreground` with the existing sort button/icon; `tbody` numeric cells `font-mono tabular-nums text-dim`, text cells `font-sans`; row dividers `border-hairline-soft`; hover `bg-brand/[.04]`; right-align where `column.align === "right"`. Keep `table-sticky` header.

- [ ] **Step 3: Verify** — `npm run test` (sort logic still green) and visually compare the Trades/Tax Lots tables to mockups 08/09 in `npm run dev`.

- [ ] **Step 4: Commit**

```bash
git add components/tables/DataTable.tsx components/common/StatusChip.tsx tests/common/status-chip.test.tsx
git commit -m "feat: Tape DataTable styling + StatusChip"
```

---

### Task 5: Readout (restyle KpiCard)

**Files:**
- Modify: `components/dashboard/KpiCard.tsx` (export `KpiCard` AND a thin `Readout` alias; keep the existing prop API: `label, value, helper, tooltip, tone`).

- [ ] **Step 1: Restyle** to match the cluster/strip tiles: `bg-surface border border-hairline rounded-[10px] p-3`, label = uppercase 10px muted, value = `font-mono tabular-nums` colored by tone (`text-pos`/`text-neg`/`text-foreground`), keep the accessible info tooltip. Remove `shadow-panel`, remove the `hover:-translate-y-0.5` lift.
- [ ] **Step 2: Verify** — render Overview/Capital cards in dev; compare to mockups 01/04.
- [ ] **Step 3: Commit** — `git commit -am "feat: Tape Readout (restyled KpiCard)"`

---

### Task 6: topMovers selector + TickerRail

**Files:**
- Create: `lib/selectors/top-movers.ts`, `components/shell/TickerRail.tsx`
- Test: `tests/selectors/top-movers.test.ts`

**Interfaces:**
- Produces: `topMovers(result: CalculationResult, limit?: number): { symbol: string; pnl: number }[]` — from `result.aggregates.symbolBreakdown`, sorted by `Math.abs(pnl)` desc, sliced to `limit` (default 8). Empty in → empty out.
- `TickerRail({ movers })` renders nothing when `movers.length === 0`.

- [ ] **Step 1: Write the failing test**

```ts
import { topMovers } from "@/lib/selectors/top-movers";

const r = (b: { symbol: string; pnl: number }[]) => ({ aggregates: { symbolBreakdown: b } } as any);

test("sorts by absolute pnl and caps to limit", () => {
  const out = topMovers(r([
    { symbol: "A", pnl: 100 }, { symbol: "B", pnl: -900 }, { symbol: "C", pnl: 50 },
  ]), 2);
  expect(out.map((m) => m.symbol)).toEqual(["B", "A"]);
});

test("empty breakdown yields empty array", () => {
  expect(topMovers(r([]))).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test -- top-movers` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { CalculationResult } from "@/types/trading";

export function topMovers(result: CalculationResult, limit = 8) {
  return [...(result.aggregates.symbolBreakdown ?? [])]
    .map((b) => ({ symbol: b.symbol, pnl: b.pnl }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, limit);
}
```

(Confirm `symbolBreakdown` item shape in `types/trading.ts`; adjust field names if they differ.)

- [ ] **Step 4: Run test to verify it passes** — `npm run test -- top-movers` → PASS.

- [ ] **Step 5: Build `TickerRail`** — marquee of `SYMBOL` (sans) + signed mono value (`text-pos`/`text-neg`), per mockup header. Wrap the scroll animation in `motion-safe:` (Tailwind) so `prefers-reduced-motion` yields a static, horizontally-scrollable strip. Tooltip/`aria-label`: "Top movers by realized P&L".

- [ ] **Step 6: Commit** — `git add lib/selectors/top-movers.ts components/shell/TickerRail.tsx tests/selectors/top-movers.test.ts && git commit -m "feat: ticker rail from realized P&L (top movers)"`

---

### Task 7: Period mapping + FilterBar

**Files:**
- Create: `lib/filters/period.ts`, `components/shell/FilterBar.tsx`
- Test: `tests/filters/period.test.ts`

**Interfaces:**
- Produces:
  - `type Preset = "ALL" | "YTD" | "THIS_YEAR" | "LAST_YEAR";`
  - `periodFromPreset(preset: Preset, currentYear: number): { year: string; month: string }`
  - `FilterBar({ year, month, symbol, strategy, account, years, symbols, accounts, onChange })` where `onChange(next: Partial<{year,month,symbol,strategy,account}>)`.

- [ ] **Step 1: Write the failing test**

```ts
import { periodFromPreset } from "@/lib/filters/period";

test("preset maps to year/month", () => {
  expect(periodFromPreset("ALL", 2026)).toEqual({ year: "ALL", month: "ALL" });
  expect(periodFromPreset("THIS_YEAR", 2026)).toEqual({ year: "2026", month: "ALL" });
  expect(periodFromPreset("LAST_YEAR", 2026)).toEqual({ year: "2025", month: "ALL" });
  expect(periodFromPreset("YTD", 2026)).toEqual({ year: "2026", month: "ALL" });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test -- period` → FAIL.

- [ ] **Step 3: Implement `period.ts`**

```ts
export type Preset = "ALL" | "YTD" | "THIS_YEAR" | "LAST_YEAR";

export function periodFromPreset(preset: Preset, currentYear: number): { year: string; month: string } {
  switch (preset) {
    case "ALL": return { year: "ALL", month: "ALL" };
    case "LAST_YEAR": return { year: String(currentYear - 1), month: "ALL" };
    case "YTD":
    case "THIS_YEAR":
    default: return { year: String(currentYear), month: "ALL" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm run test -- period` → PASS.

- [ ] **Step 5: Build `FilterBar`** to match mockup 03: year stepper (`‹ year ›`, steps within `years`), 13-cell month rail (`repeat(13,1fr)`, active = `bg-brand/15 text-brand`), preset pills (active = `border-brand/50 text-brand bg-brand/10`), Symbol/Strategy/Account selects, and removable active chips for each non-`ALL` filter plus the live `→ N closed · ±$X` summary. All handlers call `onChange`. Every cell/pill/chip is a real `<button>` with a gold `focus-visible` ring.

- [ ] **Step 6: Commit** — `git add lib/filters/period.ts components/shell/FilterBar.tsx tests/filters/period.test.ts && git commit -m "feat: period-first global FilterBar"`

---

### Task 8: App shell (header + tab nav + filter bar), lift filter state

**Files:**
- Create: `components/shell/AppHeader.tsx`, `components/shell/TabNav.tsx`
- Modify: `components/dashboard/DashboardApp.tsx` (header block ~128-161, nav ~170-184, filter block ~154-160)

**Interfaces:**
- Consumes: `useTheme` (Task 3), `TickerRail`+`topMovers` (Task 6), `FilterBar`+`periodFromPreset` (Task 7).
- `DashboardApp` keeps `symbol/strategy/year/month/account` state (already present) and now also threads them into `FilterBar`. **Delete** `settings.defaultDateRange` `Select` from the header.

- [ ] **Step 1: `AppHeader`** — gold wordmark square + "POSITIONIQ" + `<TickerRail movers={topMovers(baseResult)} />` + icon buttons (theme `toggle`, Import, Settings, Export) per mockup 01. Remove the old gradient overlay and `shadow-panel`.
- [ ] **Step 2: `TabNav`** — the 7 analytical tabs; container `overflow-x-auto` with `flex-nowrap` (no wrap); active tab = `text-foreground border-b-2 border-brand`; visible focus ring.
- [ ] **Step 3: Mount the shell** in `DashboardApp` above the tab `section`; render `<FilterBar .../>` under `TabNav`. Wire `onChange` to the existing setters. Remove the `defaultDateRange` select and its `updateSettings` call.
- [ ] **Step 4: Verify** — dev: header, ticker (from sample data), tabs, filter bar all present and applying across tabs (switch tabs, change month, confirm tables/KPIs recompute). `npm run build` passes.
- [ ] **Step 5: Commit** — `git commit -am "feat: Tape app shell + global filter bar wired"`

---

### Task 9: Remove drag/customize infra + build Overview primitives

**Files:**
- Modify: `components/dashboard/DashboardApp.tsx` (delete `overviewSections` drag machinery: `OverviewLayoutItem`, `loadOverviewLayout`/`saveOverviewLayout`, `LayoutToolbar`, `DashboardSection`, drag state, the two `overviewLayoutKey` constants ~73-75)
- Create: `components/dashboard/StatStrip.tsx`, `components/dashboard/HeroReadout.tsx`

**Interfaces:**
- `StatStrip({ items, moreCount, onMore })`; `HeroReadout({ label, value, tone, spark, pills })` (spark = number[] → inline SVG polyline).

- [ ] **Step 1: Delete drag/customize** code and the `localStorage` layout keys (both `positioniq.*` and legacy `realizededge.*`). Overview becomes a fixed, ordered layout.
- [ ] **Step 2: Build `HeroReadout`** (big mono value + sparkline + pill row) and `StatStrip` (divided metrics + `+N more`) per mockup 01.
- [ ] **Step 3: Verify** — app compiles; no references to removed symbols (`npm run build`, `npm run lint`).
- [ ] **Step 4: Commit** — `git commit -am "refactor: remove Overview drag/customize; add HeroReadout + StatStrip"`

---

### Task 10: Assemble Overview

**Files:** Modify `components/dashboard/DashboardApp.tsx` (`OverviewTab`, `PerformanceSnapshot`, `GoalProgressCard`, `Insights`).

- [ ] **Step 1: Compose** Overview to match mockups 01/02: `HeroReadout` + `InstrumentCluster` (2×2 of `Readout`) on top; two restyled `GoalBar`s; one `StatStrip` with the curated metrics (Avg win/Avg loss/Best symbol/Best strategy + `+N more` revealing the remainder); two insight cards (brand/neg left-accent). Curate the old 17-KPI list down — keep the full set available behind "+N more".
- [ ] **Step 2: Verify** — dev: Overview matches mockup in both themes (toggle). Check responsive at ~768px (cluster + strip stack cleanly, no overlap).
- [ ] **Step 3: Commit** — `git commit -am "feat: Tape Overview screen"`

---

### Task 11: Capital & ROI + chart palette

**Files:** Modify `components/dashboard/DashboardApp.tsx` (`CapitalTab`, `MonthlyRoiTable`), `components/charts/DashboardCharts.tsx`.

- [ ] **Step 1:** 6-up `Readout` row, then the monthly ROI chart, then the monthly ledger table — mockup 04.
- [ ] **Step 2: Recolor charts** — recharts series to `--pos`/`--neg`, axis/grid to `--hairline`, tick labels mono `--text-muted`. Read colors from CSS vars via `getComputedStyle` or pass hex per theme. Remove any shadow/gradient fills.
- [ ] **Step 3: Verify** against mockup 04 in both themes. **Commit** — `git commit -am "feat: Tape Capital & ROI + chart palette"`

---

### Task 12: Covered Calls + Cash-Secured Puts

**Files:** Modify `components/dashboard/DashboardApp.tsx` (`OptionsTab`, `OptionCycleTable`, `EventsTable`).

- [ ] **Step 1:** 4 exposure `Readout`s with the current-capital/collateral tile emphasized (brand label), then Open cycles table (with a "live" chip), then results table with `StatusChip` outcomes — mockups 05/06. The single `OptionsTab` handles both via `optionType`; ensure copy swaps (capital↔collateral, "Covered call ROI"↔"Return on collateral").
- [ ] **Step 2: Verify** both tabs vs mockups 05/06. **Commit** — `git commit -am "feat: Tape covered calls + cash-secured puts"`

---

### Task 13: Swing / Tax Lots / Trades

**Files:** Modify `components/dashboard/DashboardApp.tsx` (`EventsTable` use for Swing, `TaxLotsTab`, `TradesTab`).

- [ ] **Step 1: Swing** — summary `StatStrip` + ledger `DataTable`; rows open the drawer (mockup 07).
- [ ] **Step 2: Tax Lots** — lots table with `StatusChip` (mockup 08).
- [ ] **Step 3: Trades** — warning-tinted issue banner + search field (mockup 09) + dense blotter; keep the existing search/issue-filter logic.
- [ ] **Step 4: Verify** all three vs mockups; confirm horizontal scroll + "scroll for more →" hint on wide tables. **Commit** — `git commit -am "feat: Tape swing, tax lots, trades screens"`

---

### Task 14: Detail drawer

**Files:** Modify the `DetailDrawer` in `components/dashboard/DashboardApp.tsx` (extract to `components/dashboard/DetailDrawer.tsx` if cleaner).

- [ ] **Step 1: Rebuild** per mockup 10: header (symbol + strategy chip + close), hero P&L + ROI, calculation waterfall (proceeds − cost basis − fees = realized), 3×2 meta grid, basis-allocation note with brand left-accent. Backdrop scrim `rgba(8,11,16,.74)`.
- [ ] **Step 2: Interaction** — Esc closes, backdrop click closes, focus moves into the drawer on open and returns to the triggering row on close; trap focus while open.
- [ ] **Step 3: Verify** — open from a Swing/Capital row; check keyboard + both themes. **Commit** — `git commit -am "feat: Tape detail drawer with focus management"`

---

### Task 15: Import + Settings forms

**Files:** Modify `ImportTab`, `SettingsTab`, `SettingsPanel`, `Toggle`, `Segmented`, `Select`, `IconButton` in `components/dashboard/DashboardApp.tsx`.

- [ ] **Step 1:** Apply tokens to all form controls — `bg-surface`, 1px `border-hairline`, gold `focus-visible` ring, mono for numeric inputs (annual goal, basis overrides), restyled segmented cost-basis control and the three capital-calc selects. Keep all logic. Surface the theme toggle here too if not in the header.
- [ ] **Step 2: Verify** Import (paste → parse → preview KPIs) and Settings render cleanly in both themes; backup export/import still works. **Commit** — `git commit -am "feat: Tape Import + Settings forms"`

---

### Task 16: Final QA + cleanup

**Files:** repo-wide.

- [ ] **Step 1: Grep for leftovers** — search for `RealizedEdge`, `realizededge`, `shadow-panel`, `shadow-`, `radial-gradient`, `linear-gradient`, `hover:-translate`. Expected: none in app/components (mockup docs may keep their own styles). Fix any hits.
- [ ] **Step 2: Manual matrix** — for each of the 7 tabs + Import + Settings + drawer: verify against the mockup in **dark and light**, at **~1440px and ~768px**, with **keyboard-only** navigation (visible focus everywhere), and with **reduced motion** on (ticker rail static). Note any deltas and fix.
- [ ] **Step 3: Green gates** — Run `npm run lint && npm run test && npm run build`. Expected: all pass.
- [ ] **Step 4: Update docs** — refresh `docs/DESIGN.md` to describe the Tape system (or point to `docs/redesign/tape/README.md`); fix any stale "RealizedEdge" in `README.md`.
- [ ] **Step 5: Commit** — `git commit -am "chore: Tape redesign QA pass + docs"`

---

## Self-Review

**Spec coverage** (README → task):
- Naming → Tasks 1/16. Typography → Task 1. Tokens → Task 2. Theme persistence → Task 3. Elevation/radius/motion → Tasks 2/4/5. Ticker rail → Task 6. Filter bar → Tasks 7/8. Components (Readout/StatStrip/HeroReadout/DataTable/StatusChip/Drawer/shell) → Tasks 4/5/8/9/14. Screens 1–10 → Tasks 10–15. A11y floor → Tasks 6/7/14/16. "What's removed" → Tasks 2/8/9. ✅ No uncovered spec sections.
- **Placeholders:** logic tasks (3, 6, 7) carry full test + impl code; styling tasks defer markup to the mockup gallery by explicit global instruction. No "TBD"/"handle edge cases".
- **Type consistency:** `periodFromPreset`, `topMovers`, `useTheme` signatures match between their defining task and their consumer (Task 8). `Column<T>` unchanged. Confirm `symbolBreakdown` field names against `types/trading.ts` during Task 6 (flagged inline).

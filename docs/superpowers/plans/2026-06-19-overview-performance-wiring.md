# Overview + Performance analytics wiring (Plan B) — Implementation Plan

> Execute via subagent-driven-development. One cohesive UI task (Overview + Performance re-skin + tabpanel a11y + a small MetricGroup component) with build/lint/typecheck/test gates.

**Goal:** Replace the Overview's flat 17-tile grid with a curated, grouped, accessible cockpit, and enrich the "Capital & ROI" (Performance) tab — both wired to the `wheelAnalytics` selectors built in the analytics plan — so the new metrics (profit factor, expectancy, payoff, premium capture, assignment rate, annualized ROC, capital turnover, income/day, concentration, goal run-rate) become visible. Route every tile through the shared `KpiCard` (Aurora variants + non-color sign).

**Architecture:** `components/dashboard/DashboardApp.tsx` holds `OverviewTab` and `CapitalTab`. Add a small `MetricGroup` presentational component. Pull metrics from `wheelAnalytics(result)` (`lib/selectors/analytics.ts`) and the already-extended `goalPace` (run-rate). No engine changes.

**Tech Stack:** Next 16, React 19, Tailwind (Aurora tokens), shared `KpiCard` with `variant`.

## Global Constraints (UNITS — read carefully)
- `formatPercent(v)` renders `v.toFixed(2)+"%"` — it does NOT scale. So:
  - `wheelAnalytics.tradeQuality.winRate`, `premium.captureRate`, `premium.assignmentRate`, `allocation.bySymbol.topShare`/`.hhi` are FRACTIONS (0–1) → multiply by 100 before `formatPercent`.
  - `capitalEfficiency.annualizedRoc`, `aggregates.ytdRoi`, `aggregates.averageMonthlyRoi`, monthly `realizedRoiPercent` are ALREADY percent → pass straight to `formatPercent`.
  - `tradeQuality.expectancy`, `averageWin`, `averageLoss`, `premium.premiumCollected`, `capitalEfficiency.incomePerDay` are DOLLARS → `formatCurrency`.
  - `tradeQuality.profitFactor`, `payoffRatio`, `capitalEfficiency.capitalTurnover` are RATIOS → `formatNumber(v, 2)` (turnover: `formatNumber(v,1)+"×"`). When a ratio/percent source is `null`, render `"—"` (not "N/A%").
- Tone: P&L/ROI/expectancy/income → `tone(value)` (pos/neg/neutral, the existing helper). Win rate, premium collected, capture, turnover, profit factor → `tone="neutral"` (these aren't inherently good/bad by sign). KpiCard already renders the non-color arrow for pos/neg tones.
- Every tile MUST be a `KpiCard` (no hand-rolled tiles). Keep tooltips.
- Verification gate (all pass): `npm run typecheck`, `npx next lint`, `npx next build`, `npm test` (71). End commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure
- Create `components/dashboard/MetricGroup.tsx` — labeled section wrapper + responsive KpiCard grid.
- Modify `components/dashboard/DashboardApp.tsx` — rewrite `OverviewTab` body and `CapitalTab` readout; add `wheelAnalytics` import; add tabpanel ARIA on the content `<section>` (line ~151) and pass `panelId` to `TabNav`.

---

### Task B1: MetricGroup component
**Files:** Create `components/dashboard/MetricGroup.tsx`; (no separate test — presentational, covered by build + visual).
**Produces:**
```tsx
export function MetricGroup({ label, children, cols = 4 }: { label?: string; children: React.ReactNode; cols?: 2 | 3 | 4 }): JSX.Element
```
- Renders an optional muted 12px sentence-case `label` then a grid: `style={{ display:"grid", gap:"10px", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))" }}` (use 130px min for `cols`-dense compact groups). Each child is a `KpiCard`. Wrap in `bg-surface border border-hairline rounded-[12px] p-3` cards is NOT needed — KpiCard renders its own surface via the `compact`/`standard` variant card; ensure the group just lays them out. Keep it minimal.

### Task B2: Overview re-skin (wire wheelAnalytics + goal run-rate)
**Files:** Modify `OverviewTab` in `components/dashboard/DashboardApp.tsx` (replace lines ~199-266: the `allKpis` array and the flat grid). Keep the `GoalSpotlight` hero (lines 229-240) and `Insights` (268-276).
- Add at top of `OverviewTab`: `const a = wheelAnalytics(result);` (import `wheelAnalytics` from `@/lib/selectors/analytics`).
- Below the GoalSpotlight hero, render a run-rate line using the existing `pace` (now has `projectedYearEnd`, `requiredMonthly`): a small muted row — `Projected year-end {formatCurrency(pace.projectedYearEnd)} · needs {formatCurrency(pace.requiredMonthly)}/mo`.
- HERO ROW — `MetricGroup` (4 KpiCards, `variant="hero"` on the first or all standard; use `variant="standard"`):
  1. `label="Net P&L · YTD"` value `formatCurrency(result.aggregates.currentYearRealizedPnl)` tone `tone(currentYearRealizedPnl)` helper "Calendar-year realized" tooltip as today.
  2. `label="Annualized ROC"` value `formatPercent(a.capitalEfficiency.annualizedRoc)` (already percent; if null → "—") tone `tone(a.capitalEfficiency.annualizedRoc ?? 0)` helper "Capital-weighted".
  3. `label="Premium collected"` value `formatCurrency(a.premium.premiumCollected)` tone "neutral" helper `${a.premium.captureRate==null?"—":formatPercent(a.premium.captureRate*100,0)} capture`.
  4. `label="Win rate"` value `a.tradeQuality.winRate==null?"—":formatPercent(a.tradeQuality.winRate*100,0)` tone "neutral" helper `PF ${a.tradeQuality.profitFactor==null?"—":formatNumber(a.tradeQuality.profitFactor,1)} · exp ${a.tradeQuality.expectancy==null?"—":formatCurrency(a.tradeQuality.expectancy)}`.
- GROUP "Income" (compact KpiCards): Option premium `formatCurrency(aggregates.totalOptionsPremium)` tone pos-if-positive; Stock P&L `formatCurrency(aggregates.totalStockTradingPnl)` tone by sign; Income/day `a.capitalEfficiency.incomePerDay==null?"—":formatCurrency(...)` tone neutral.
- GROUP "Returns & efficiency": YTD ROI `formatPercent(aggregates.ytdRoi)` tone; Avg monthly ROI `formatPercent(aggregates.averageMonthlyRoi)` tone; Capital turnover `a.capitalEfficiency.capitalTurnover==null?"—":formatNumber(...,1)+"×"` neutral.
- GROUP "Trade quality & risk": Profit factor `…profitFactor==null?"—":formatNumber(…,2)` neutral; Expectancy `formatCurrency(expectancy)` tone; Payoff ratio `…payoffRatio==null?"—":formatNumber(…,2)` neutral; Assignment rate `…assignmentRate==null?"—":formatPercent(assignmentRate*100,0)` neutral.
- GROUP "Allocation": Top symbol `aggregates.bestSymbol ?? "—"` + as helper the share `formatPercent(a.allocation.bySymbol.topShare*100,0)`; Concentration `a.allocation.bySymbol.level` (capitalize) neutral; Premium capture `…captureRate*100` neutral.
- "Show more" disclosure (use React state `useState(false)` inside OverviewTab): a button row "Show more / Show less"; when open, a final MetricGroup "More" with: Tax-year P&L, All-time Net P&L (totalRealizedPnl), Avg deployed, Peak deployed, Avg win, Avg loss, Best/Worst strategy, Closed trades count — all via KpiCard. (Move the long tail here so the default view is curated.)
- Keep the Aurora look: groups separated by the existing hairline dividers (`<div className="h-px bg-hairline" />`) is optional; prefer MetricGroup spacing.

### Task B3: Performance (Capital & ROI) enrichment
**Files:** Modify `CapitalTab` in `components/dashboard/DashboardApp.tsx` (lines ~282-315). Keep the `MonthlyRoiChart`, `MonthlyRoiTable`, `EventsTable`.
- Add `const a = wheelAnalytics(result);`.
- REPLACE the 6-up readout (lines 288-295) — DELETE the synthetic `efficiency` (line 284 `50 + averageMonthlyRoi*8`). New KpiCards (all shared component, correct units):
  - Annualized ROC `formatPercent(a.capitalEfficiency.annualizedRoc)` tone.
  - YTD ROI `formatPercent(aggregates.ytdRoi)` tone.
  - Profit factor `…profitFactor==null?"—":formatNumber(…,2)` neutral.
  - Expectancy `formatCurrency(a.tradeQuality.expectancy)` tone.
  - Premium capture `…captureRate*100` (formatPercent, 0) neutral.
  - Capital turnover `…capitalTurnover==null?"—":formatNumber(…,1)+"×"` neutral.
  - Avg deployed `formatCurrency(aggregates.averageDeployedCapital)` neutral.
  - Peak deployed `formatCurrency(aggregates.peakDeployedCapital)` neutral.
  (Lay out as a responsive grid of KpiCards, ~4 per row.)

### Task B4: Complete the tabpanel ARIA
**Files:** Modify `DashboardApp` (lines ~123-127 TabNav usage, ~151 content section).
- Give the content `<section>` `role="tabpanel"`, `id="dashboard-tabpanel"`, `tabIndex={0}`, `aria-label={activeTab}`.
- Pass `panelId="dashboard-tabpanel"` to `<TabNav>` (the prop added in Plan A).

### Steps (one task cycle — interdependent, do together, then gate)
- [ ] Implement B1–B4.
- [ ] `npm run typecheck` → clean.
- [ ] `npx next lint` → clean.
- [ ] `npx next build` → clean.
- [ ] `npm test` → 71 passed.
- [ ] Report status + gate results + files changed. Do NOT git commit (controller commits).

## Self-review note
Highest risk is unit conversion (fraction vs percent) — every fraction source is ×100 before `formatPercent` above; `annualizedRoc`/`ytdRoi`/`averageMonthlyRoi` are passed straight. Second risk is null handling — every nullable ratio/percent renders "—". The shared `KpiCard` guarantees signs + tooltips, fixing the old hand-rolled-tile a11y gap. Visual verification: dev-server screenshots (light + dark) if the environment allows, else a checklist.

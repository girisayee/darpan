# Aurora shell + Overview fidelity (D1) — Implementation Plan

> Rebuild the app's PRESENTATION to match the approved Aurora mockups. The data layer (selectors, engine, wheelAnalytics, riskMetrics) is done and reused unchanged. This is a layout/shell/theme rebuild, executed as one cohesive task with build/lint/typecheck/test gates + dev-server SSR verification.

**Goal:** Make the running app look like the approved Aurora mockups — dark-first, a unified chrome (gradient logo + inline nav pills + multi-account switcher), the 4-tab IA (Overview · Wheels · Performance · Trades), and the Overview rebuilt to the mockup composition.

**Tech Stack:** Next 16, React 19, Tailwind (Aurora tokens already in `app/globals.css` / `tailwind.config.ts`), lucide-react.

## Global Constraints
- USE THE TOKENS, not hardcoded hex. In dark mode the tokens already equal the mockup palette: `bg-background`=#0D1016, `bg-surface`=#141A23, `bg-surface-inset`=#11161E, `border-hairline`=#222B39, `text-foreground`=#F4F6FA, `text-muted-foreground`=#8A93A3, `text-dim`=#5E6877, `accent`=#6E8BFF, `pos`=#34D399, `neg`=#FB7185, `warn`=#E3A857. The signature gradient is `bg-aurora` (`linear-gradient(135deg, accent-2, accent)`). Light mode must still work (tokens handle it) but DARK IS THE DEFAULT.
- Keep all existing data wiring (`wheelAnalytics`, `goalPace`, `riskMetrics`, `filterResult`, the store). Do not change selectors/engine.
- Every metric tile stays a shared `KpiCard`. Toned values keep their +/- arrow.
- Gates (all pass): `npm run typecheck`, `npm run lint`, `npm test`, `npx next build`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Files
- Modify `lib/theme/use-theme.ts` + `tests/theme/use-theme.test.ts` + `app/layout.tsx` — dark-first default.
- Create `components/shell/AppShell.tsx` — the unified chrome (logo + nav pills + account switcher + actions).
- Modify `components/dashboard/DashboardApp.tsx` — use AppShell, switch to the 4-tab IA + routing, rebuild OverviewTab composition.
- Likely retire/absorb `components/shell/AppHeader.tsx` and `components/shell/TabNav.tsx` into AppShell (or keep TabNav rendering the pills inside AppShell).

---

### Task D1: dark-first + chrome + IA + Overview

**1) Dark-first theme** (`lib/theme/use-theme.ts`, `app/layout.tsx`, tests)
- `getServerSnapshot()` → return `"dark"` (was "light"), so SSR + first hydration render dark (matching the default) with no flip for the common case.
- The no-flash script in `app/layout.tsx`: set `.dark` unless the user explicitly chose light — `var t=localStorage.getItem('positioniq.theme'); if(t!=='light'){document.documentElement.classList.add('dark');}`.
- `resolveInitialTheme(stored, prefersDark)`: make it dark-first — `if (stored==='light'||stored==='dark') return stored; return 'dark';` (ignore system; dark default). Update the two now-wrong tests in `tests/theme/use-theme.test.ts`: `resolveInitialTheme(null,false)` → `'dark'`; `resolveInitialTheme('garbage',false)` → `'dark'` (keep the `'light'`/`'dark'` stored cases and the `(null,true)→'dark'` case).

**2) AppShell chrome** (`components/shell/AppShell.tsx`) — match the mockup top bar:
- A header row: `flex items-center justify-between px-4 py-3 border-b border-hairline`.
- LEFT group (`flex items-center gap-4`):
  - Logo mark: a `h-5 w-5 rounded-[6px] bg-aurora` block, then `RealizedEdge` in `text-[14px] font-semibold text-foreground`.
  - Nav pills (the 4 tabs): a `flex gap-1`; each tab a button. Active: `bg-surface-inset text-foreground rounded-[8px] px-3 py-[6px] text-[12.5px]`. Inactive: `text-muted-foreground px-3 py-[6px] text-[12.5px] hover:text-foreground`. Keep the roving-tabindex/arrow-key ARIA pattern (reuse TabNav's logic or render `role=tablist`/`tab` with `aria-controls="dashboard-tabpanel"`).
- RIGHT group (`flex items-center gap-1`):
  - Account switcher pill: `inline-flex items-center gap-1.5 text-[12px] text-muted-foreground bg-surface border border-hairline rounded-[8px] px-2.5 py-[5px]` with a `Wallet` icon + a label `{accountSummary}` + a `ChevronDown` icon. For now it can render the existing account state as a compact `<select>` styled as the pill, OR a button showing `"{accounts.length-1} accounts"` that cycles/opens — minimal is fine; wire to the existing `account`/`setAccount`. Label like `All accounts` when account==="ALL" else the account name.
  - Theme toggle (Sun/Moon), Import, Settings icon-buttons (reuse the IconButton style from the old AppHeader: `h-8 w-8 rounded-[8px] text-muted-foreground hover:text-foreground`).
- Props: `{ tabs, activeTab, onSelectTab, accounts, account, onAccount, theme, onToggleTheme, onImport, onSettings, onExport }`.

**3) IA + routing** (`DashboardApp.tsx`): primary tabs become `["Overview","Wheels","Performance","Trades"]`. Routing for D1:
- Overview → rebuilt `OverviewTab` (below).
- Wheels → INTERIM for D1: render the existing Covered Calls + Cash-Secured Puts + Tax Lots content stacked under section headers (reuse `OptionsTab` for call + put and `TaxLotsTab`). A short note comment `// D2 replaces this with the campaign/triage view`. (Full Wheels fidelity is D2.)
- Performance → the existing enriched `CapitalTab` (B).
- Trades → the existing `TradesTab` + the Swing ledger (render `SwingTab` below the blotter, or keep Trades as-is for D1 with a note).
- Keep Import/Settings as chrome actions (not primary tabs). Keep the FilterBar as a secondary row directly under the chrome (functional filters; restyle only if trivial). Keep `role="tabpanel" id="dashboard-tabpanel"` on the content section.

**4) Overview composition** — rebuild `OverviewTab` to the `aurora_overview_full` mockup, using tokens (these already exist from B; re-arrange/restyle to match):
- Goal-hero CARD: `bg-surface border border-hairline rounded-[14px] p-4`. Top row: left `Annual goal · {year}` (`text-[12px] text-muted-foreground`) + the big value `formatCurrency(pace.actual)` (`text-[30px] font-semibold`) with `/ {annualGoal}` (`text-dim`); right an ahead/behind pill (`bg-pos/15 text-pos` or `bg-neg/15 text-neg`, rounded-8, with a TrendingUp/Down icon). A gradient progress bar: track `bg-background rounded-full h-2`, fill `bg-aurora` at `pace.pct%`. Below: a muted row `{pct}% of goal` · `Projected year-end {formatCurrency(pace.projectedYearEnd)}` · `needs {formatCurrency(pace.requiredMonthly)}/mo`. (You may keep the existing GoalSpotlight trajectory SVG inside this card, or simplify to the bar — prefer keeping the card styling matching the mockup.)
- HERO KPI row: 4 `KpiCard variant="hero"` in a `grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5`: Net P&L · YTD, Annualized ROC, Premium collected (helper = capture), Win rate (helper = `PF · exp`). (Same data/units as B.)
- Grouped sections via `MetricGroup` + `KpiCard variant="compact"`: Income · Returns & efficiency · Trade quality & risk · Allocation (same metrics/units as B).
- "Needs attention" insights: render each as a card `bg-surface border border-hairline border-l-[3px] rounded-[10px] p-2.5` with the left border colored by severity (`border-l-neg` expiries, `border-l-warn` unresolved) + a `Review →`/`Resolve →` accent link. Reuse the existing `Insights` data logic; restyle to these cards.
- A "Show more" disclosure for the long tail (as B).

### Steps
- [ ] Implement (1)-(4).
- [ ] `npm run typecheck` clean · `npm run lint` clean · `npm test` (79) · `npx next build` clean.
- [ ] Report status + gate results + files changed. Do NOT git commit.

## Self-review note
Dark default is the single biggest visual lever (getServerSnapshot "dark" + no-flash default-dark + resolveInitialTheme dark-first with updated tests). The chrome (logo+pills+switcher) and Overview card composition are token-based so they render the mockup palette in dark mode automatically. Wheels/Performance/Trades full fidelity are D2-D4; D1 routes them to existing content so nothing breaks. Verify on the running dev server: dark canvas, chrome present, Overview matches the mockup, no hydration error.

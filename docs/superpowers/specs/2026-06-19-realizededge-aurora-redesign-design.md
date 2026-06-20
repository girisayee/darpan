# RealizedEdge — Aurora redesign & wheel-analytics design spec

Date: 2026-06-19
Status: Draft for review
Supersedes (visually): the "Quiet" design system (`docs/redesign/quiet/`)

---

## 1. Summary

RealizedEdge (a.k.a. PositionIQ) is a local-first, single-user dashboard for tracking the options **wheel** strategy (cash-secured puts → assignment → covered calls → called away) plus swing trades and tax lots. The existing app is well-built but under-delivers on three fronts: the Overview reads as a flat 17-tile metric dump rather than an at-a-glance cockpit; the wheel — the product's signature — is fractured across three unlinked tabs so the lifecycle is never legible; and the visual language ("Quiet", muted grays + hairlines) reads as dated.

This redesign:

1. Adopts a new visual system, **"Aurora"** — dark-first, high-contrast, vivid accent, bold numerals, depth from color/elevation rather than gray hairlines (full light + dark parity).
2. Reorganizes the IA around the wheel: **Overview · Wheels · Performance · Trades**, plus utility surfaces (Import, Settings, Onboarding).
3. Adds the analytics a serious wheel trader needs (profit factor, expectancy, annualized ROC, premium capture, assignment rate, concentration, drawdown/Sortino, run-rate projection, capital-matched benchmark) — most computable from data the engine already produces.
4. Makes the app **broker-agnostic** via a universal file importer (CSV/Excel). **v1 is file-import only**; broker auto-sync is explicitly deferred.
5. Adds two reference-data subsystems consistent with the local-first promise: **ticker logos** (offline-first, opt-in online) and a **SPY/QQQ benchmark** (keyless, cached).

This spec is intentionally scoped to a single redesign initiative delivered in phases (§11). It is large but cohesive; each phase below could become its own implementation plan.

---

## 2. Goals & non-goals

### Goals
- A modern, scannable cockpit with a clear hierarchy and curated metrics.
- The wheel legible as one connected lifecycle per ticker, with a ratcheting adjusted cost basis.
- A credible analytics layer (capital efficiency, risk-adjusted return, allocation, goal pacing).
- Broker-agnostic file import that "just works" with any broker's export.
- Preserve and strengthen the local-first / "your data never leaves your machine" promise.
- Fix the accessibility, consistency, and data-handling issues from the current build.

### Non-goals (deferred / out of scope for this initiative)
- Broker API auto-sync (SnapTrade/Plaid-style) — later.
- Live/real-time unrealized P&L on open equity positions (requires a live quote feed) — later. (The benchmark subsystem fetches only SPY/QQQ EOD prices, see §9.)
- Sector/correlation analytics requiring a symbol→sector map — later (optional enrichment).
- Options-chain / Greeks / entry-signal analytics (IV rank, delta, POP) — out of scope.
- Tax filing, wash-sale handling — out of scope (unchanged from today).
- Cloud sync / multi-device — out of scope (stays local SQLite).

---

## 3. Current-state baseline (what we build on)

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind + CSS-variable tokens, Recharts, SQLite (`node:sqlite`), PapaParse.
- **Engine:** `lib/calculations/engine.ts` → `calculateDashboard(transactions, settings)` produces `realizedEvents`, `taxLots`, `optionLifecycles`, `capitalUsage`, `monthlyReturns`, `aggregates`.
- **Types:** `types/trading.ts` (`TradeTransaction`, `RealizedPnLEvent`, `OptionLifecycle`, `TaxLot`, `MonthlyCapitalReturn`, `DashboardAggregates`, `AppSettings`).
- **Persistence:** `app/api/store/route.ts` (GET/PUT/DELETE), client sync in `lib/storage/server-store-client.ts`.
- **Key existing facts to exploit:** `TradeTransaction` already carries `sourceBroker` and `accountName` (multi-account groundwork); `DashboardAggregates` already computes `winRate`, `averageWin`, `averageLoss`, `symbolBreakdown`, `strategyBreakdown`, `monthlyRealizedPnl` (cumulative) — much of the "new" analytics is surfacing latent values, not new math.
- **Known issues to fix:** Overview tiles are hand-rolled (bypass shared `KpiCard`, drop tooltips + sign convention) at `components/dashboard/DashboardApp.tsx`; the "Cap. Efficiency" tile is a synthetic score (`50 + avgMonthlyRoi*8`); tables default to ascending date with `-999` null-sort sentinels and no pagination; "Clear local data" fires without confirmation; the `DetailDrawer` reintroduces uppercase wide-tracked eyebrows the design contract removed.

---

## 4. Visual design system — "Aurora"

Dark-first, high-contrast, one vivid accent, bold numerals. Depth comes from surface color + 1px borders + restrained elevation, not gray hairlines. Full light + dark parity is mandatory; tokens drive both. Tokens are CSS variables (extend `app/globals.css` + `tailwind.config.ts`); the values below are the dark theme with light-theme equivalents in parentheses where they differ materially.

### Color tokens (dark / light)
- `--bg`: #0D1016 / #FBFCFD — app canvas
- `--surface`: #141A23 / #FFFFFF — cards, panels
- `--surface-inset`: #11161E / #F4F6FA — wells, progress tracks, table zebra
- `--border`: #222B39 / #ECEEF2 — card/table borders (1px, used deliberately, not everywhere)
- `--border-strong`: #2C3647 / #DCE0E6 — emphasis / dashed dropzones
- `--text`: #F4F6FA / #0B1220 — primary, used for hero numerals
- `--text-2`: #EAEDF2 / #1A2230 — standard body
- `--text-muted`: #8A93A3 / #5A6472 — labels
- `--text-faint`: #5E6877 / #9AA2AD — captions/hints
- `--accent`: #6E8BFF / #4F46E5 — active states, progress, links
- `--accent-grad`: linear-gradient(135deg,#7C5CFF,#3D8BFF) — used sparingly (logo mark, goal progress bar). Single decorative gradient; not used on data surfaces.
- `--pos`: #34D399 / #0B7A55 — gains (on values + progress only)
- `--neg`: #FB7185 / #D6453D — losses (on values only)
- `--warn`: #E3A857 / #B45309 — caution / data-quality (zero-basis, near-expiry, unresolved)

### Typography
- Family: Inter (retain). Weights **400, 500, 600** (600 is new — used for hero numerals and key values; this is the deliberate departure from "Quiet" that fixes the dated feel). Tabular numerals (`font-variant-numeric: tabular-nums`) on all numbers.
- Scale: hero numeral 30–38/600 (tight `letter-spacing:-0.5px`); section value 20–23/600; KPI value 16–21/500–600; body 13–14/400; label 11.5–12/400 muted, **sentence case** (no uppercase, no wide tracking — fixes the DetailDrawer drift).

### Shape, spacing, motion
- Radius: controls 8–9px · cards 12px · panels/windows 14–18px · pills 999px · progress 999px.
- Borders: 1px solid `--border`, used on cards/tables for definition (Aurora leans on borders + surface contrast, unlike Quiet's hairline minimalism). Featured/active items may use `--accent` at 1.5px.
- Elevation: avoid heavy shadows; in light theme a single soft shadow on raised cards is allowed (`0 1px 2px rgba(16,24,40,.05)`), none in dark.
- Tone signaling: `--pos`/`--neg` on values **and always paired with a sign** (`+`/`−`) or arrow glyph — color is never the sole signal (WCAG 1.4.1). `--accent` for progress/active only.
- Motion: ≤150ms ease; honor `prefers-reduced-motion`.

### Shared components (consolidation requirement)
Every metric tile routes through **one** `KpiCard` with variants: `hero` (large numeral), `standard`, `compact`, `exposure` (accent-bordered live capital). This guarantees tooltips, helper text, tone signs, and border rules are consistent (the current three-implementations problem is eliminated). Other shared components: `AppChrome` (top bar + tab nav + account switcher), `MetricGroup` (labeled section), `DataTable` (sortable, paginated, sticky header, newest-first default), `StatusChip`, `WheelStepper`, `TickerAvatar` (§8), `DetailDrawer`, `Sparkline`, `BenchmarkBars`, `Gauge`/`ProgressBar`, `EmptyState`.

---

## 5. Information architecture

Top-level tabs (in `AppChrome`): **Overview · Wheels · Performance · Trades.** Header-right: **account switcher** (multi-account/multi-broker), Import, Settings, theme toggle. Onboarding is a first-run state, not a tab.

| Tab | Purpose | Replaces |
|-----|---------|----------|
| Overview | At-a-glance cockpit: goal hero, curated hero KPIs, grouped sections, "needs attention" insights | Old Overview |
| Wheels | The flagship: per-ticker wheel campaigns + triage; campaign detail with ratcheting ACB | Covered Calls + Cash-Secured Puts + Tax Lots (linked) |
| Performance | Equity curve, capital-efficiency ranking, risk strip, income calendar, benchmark | Capital & ROI |
| Trades | Hardened transaction blotter + swing trades | Swing Trades + Trades |

Tax lots become a sub-view reachable from Wheels and Settings (the assigned-share leg of a wheel), not a standalone primary tab — but the Tax-lots table/spec (§7.5) is retained.

ARIA tab pattern completed: `role="tablist"`/`tab`/`tabpanel`, `aria-controls`, roving-tabindex arrow-key navigation. A persistent **unresolved-count badge** appears on the Trades tab.

---

## 6. Metrics catalog (exact definitions)

Each metric lists formula, source, and **tier** (`now` = computable from existing engine outputs; `derived` = compute from existing data, new math; `engine` = needs cycle-linking; `new-data` = needs an input we don't have). Tiers map to the build phases in §11.

### Income & returns
- **Net P&L (realized)** = `sum(realizedEvents.realizedPnl)`. [now]
- **Premium collected (gross)** = `sum(optionLifecycles.premiumReceived)`. [now]
- **Premium capture rate** = `sum(netOptionPnl) / sum(premiumReceived)`, overall and per strategy (CC vs CSP). [now]
- **Income / day (theta proxy)** = `sum(option netOptionPnl) / sum(capital-days)`; per-cycle variant `netOptionPnl / holdingDays`. [now]
- **Dividends / total income** = dividends = `sum(netAmount where action = DIVIDEND)`; total income = premium + dividends + realized stock P&L. [derived]
- **ROC (per event)** = `realizedPnl / capitalDeployed`. [now]
- **Annualized ROC (per event)** = `roiPercent × 365 / holdingDays`. [now]
- **Portfolio annualized ROC** = capital-weighted mean of event `annualizedRoiPercent` (interim: `ytdRoi × 365 / elapsedDays`). Headline judgment metric. [now]
- **YTD ROI / avg monthly ROI** = retained from current engine. [now]

### Trade quality
- **Win rate** = winners / total closed. Always displayed beside expectancy + profit factor. [now]
- **Profit factor** = `sum(positive realizedPnl) / |sum(negative realizedPnl)|`; render "—" when no losses (don't show ∞). Healthy band ~1.75–4. [now]
- **Expectancy ($/trade)** = `(winRate × avgWin) + ((1 − winRate) × avgLoss)` (avgLoss negative). [now]
- **Payoff ratio** = `avgWin / |avgLoss|`. [now]
- **Avg holding period by strategy** = `mean(holdingDays)` grouped by strategy. [now]

### Capital efficiency & allocation
- **Capital turnover** = `sum(closedTradeCapital) / averageDeployedCapital` per period. [now]
- **Buying-power utilization** = `deployed / accountSize`. Requires a user-entered account size / buying power (Settings). Interim if absent: show deployed vs peak-observed. [new-data]
- **Concentration (HHI + top-N share)** = `share_i = capital_i / totalDeployed`; `HHI = Σ share_i²`; classify low/moderate/high. [now]
- **Sector allocation** = group deployed capital by `sector(symbol)`. [new-data, optional]
- **Assignment rate** = `count(lifecycles.status = assigned) / count(lifecycles)`, split call/put. [now]

### Risk-adjusted
- **Max drawdown** = max peak-to-trough of cumulative realized equity (monthly series now; daily incl. cash later). [derived]
- **Sortino** = `(annualizedReturn − MAR) / downsideDeviation(periodicReturns)`, MAR = 0 (configurable). [derived]
- **Calmar** = `annualizedReturn / maxDrawdown`. [derived]

### Goal pacing
- **Run-rate projection** = `cumulativeYTD / monthsElapsed × 12`. [now]
- **Required monthly** = `(annualGoal − cumulativeYTD) / monthsRemaining`. [now]
- **Ahead/behind pace** = `cumulativeYTD − (annualGoal × monthsElapsed / 12)`. [now] (retained, extended with the two above)

### Wheel-native
- **Adjusted cost basis (per ticker campaign)** = `assignmentPricePerShare − (cumulativePremiums + dividends) / shares`; ratchets down each cycle. [engine]
- **Recovery to breakeven (assigned, underwater)** = progress of `(premiums collected since assignment) / (assignmentBasis − marketPrice) × shares`; show as a bar + estimated CC cycles remaining. [engine]

### Benchmark
- **Capital-matched benchmark** (see §9.3): for each capital deployment of amount `C` on date `d`, `units = C / SPY_adjClose(d)`; benchmark value at `t` = `Σ units_i × SPY_adjClose(t)`; compare to the wheel account value over the identical window. v1 method. (Money-weighted/IRR = v2.) [new-subsystem]

Remove the synthetic "Cap. Efficiency" score entirely; replace with real annualized ROC + utilization.

---

## 7. Screen specs

Reference mockups were produced and approved in the design session (Aurora theme). This section captures the content/behavior contract per screen.

### 7.1 Onboarding / first-run
Trigger: zero stored transactions. Replaces the all-zeros cockpit. Centered card: value prop, primary **Import your trades** action, secondary **Explore with sample data**, a 3-step (Import → Review → Track) row, and a "100% local" reassurance line. When sample data is active, a persistent dismissible "Viewing sample data" banner is shown app-wide (the current silent `showSampleData` flag flip is replaced by a visible boundary).

### 7.2 Overview
- **Goal hero:** annual goal, YTD realized, % of goal, ahead/behind pill, trajectory sparkline (cumulative vs target), **projected year-end + required-monthly**. Accent gradient on the progress bar only.
- **Hero KPI row (4, `hero`/`standard` variant):** Net P&L · Annualized ROC · Premium collected (capture %) · Win rate (profit factor · expectancy). All signed + toned.
- **Grouped sections (`MetricGroup` + `compact` cards):** Income · Returns & efficiency · Trade quality & risk. Ordered by importance; long tail (extremes, etc.) behind a "Show more" disclosure.
- **Needs attention:** action-oriented insights (near-term expiries, unresolved/duplicate imports, repeated-loss symbols), each deep-linking to the relevant filtered view. (Retain current insight logic; restyle.)

### 7.3 Wheels (flagship)
- **Header strip:** active wheels · capital at risk · premium YTD.
- **Triage chips:** Roll/close soon · Working · Watch · Assigned/recovering, with counts and color. Rules over DTE, ITM/OTM, % captured. (Rules user-tunable in a later pass; ship sensible defaults.)
- **Wheel list:** one row per open wheel; columns: position (ticker avatar + contract + account/broker tag), stage, DTE (urgency-colored), captured (bar), suggested action chip. Row → campaign detail.
- **Campaign cards (alt view):** per-ticker card with `WheelStepper` (Sold put → Assigned → Covered call → Called away, current highlighted), cycles, premium, ACB, price, annualized ROC, recovery bar when underwater.
- **Campaign detail:** hero stats; ACB-vs-market ratchet chart; chronological cycle ledger (date, leg, premium, result, running ACB) including rolls; a forward "next call idea" helper derived from ACB + DTE heuristics. This is the screen the cycle-linking engine work (§8.3) exists to power.

### 7.4 Performance
Equity curve vs goal pace · capital-efficiency ranking of open positions (by annualized ROC: symbol, capital, DTE, capture) · risk strip (Sortino, Calmar, concentration, assignment rate) · buying-power utilization bar with healthy-band marker · income calendar heatmap (daily P&L, best-day/streak callouts) · benchmark bars (you vs QQQ vs SPY, §9).

### 7.5 Trades (blotter)
Search + type/unresolved filters · newest-first default sort · null values sort to the **end** (remove `-999` sentinels) · text+color status chips · **pagination (or virtualization) with a visible row count** · unresolved-filter banner with clear escape hatch. Swing trades fold in as a filter/section.

### 7.6 Tax lots (sub-view)
Summary tiles (open lots, cost basis, unrealized, zero-basis count) · a zero-basis alert with an **inline "Set basis" fix** (not buried in Settings) · table with distinct `partial`/`open`/`closed`/`zero-basis` states (stop collapsing `partially_closed` → `closed`).

### 7.7 Import (file-only)
Hero drag-drop for CSV/Excel from any broker → auto-column-detection → editable mapping → preview (with duplicate/unresolved counts) → save. Manual-entry path. "Supported: Schwab, Fidelity, IBKR, Robinhood, Tastytrade, …" line. A muted "Automatic broker sync — coming later" row. Post-save: confirmation summary + undo-last-import. (See §10.)

### 7.8 Settings
General (goal, include-fees, annualize, account size for utilization) · capital-calculation selectors **with a live impact preview** ("CSP ROI 2.0% → 2.4%") before commit · cost-basis method · reference-data toggles (online logos default OFF; benchmark enable + indices) · data (export/import) · **danger zone** with a typed/confirm step for "clear all data".

### 7.9 DetailDrawer (cross-screen)
Retain its excellent a11y (focus trap, Esc, restore-focus, reduced-motion). Fix: sentence-case labels (remove uppercase/wide-tracking), Aurora tokens, calculation waterfall retained and extended to more surfaces.

### 7.10 Mobile
Single-column reflow; goal hero compresses; hero KPIs 2-up; groups collapse behind disclosure; bottom tab bar (Overview/Wheels/Performance/Trades). DetailDrawer goes full-screen on narrow viewports.

---

## 8. Ticker logo subsystem

Decision: **offline-first with an opt-in online tier (default OFF).** `TickerAvatar(ticker, size)` resolves in order:

1. **Local cache** — `logo_cache(ticker TEXT PRIMARY KEY, source TEXT, mime TEXT, bytes BLOB, fetched_at INTEGER)` (or an app-data `logos/{TICKER}.png` dir).
2. **Bundled pack** — ship `nvstly/icons` `ticker_icons/{TICKER}.png` in `/public/logos`, synced at build time via `scripts/sync-logos` (no runtime fetch of raw.githubusercontent). Normalize ticker to uppercase.
3. **Optional online enrichment** (only if `settings.fetchLogosOnline === true`) — `https://img.logo.dev/ticker/{TICKER}?token={PUBLISHABLE_TOKEN}&size=128&format=png&retina=true`, fetched through a server route (`app/api/logo/[ticker]/route.ts`) so the token stays server-side; the bytes are written to `logo_cache` (one-time per ticker). Render the required logo.dev attribution while on the free tier.
4. **Monogram fallback** — deterministic SVG: `hue = hashTicker(ticker) % 360`, `bg = hsl(hue,60%,46%)`, 1–2 uppercase initials, WCAG-contrast text, rounded square. Universal; covers every miss.

**Privacy:** default experience makes zero network calls. The online tier is the only outbound path and is opt-in, off by default, server-routed, lazily fetched (only for displayed logos — never batch-prefetch the portfolio), and permanently cached. Settings copy states it "sends ticker symbols to logo.dev."

**Licensing:** logos are trademarks; displayed only to identify holdings (nominative fair use). Add an in-app line: "Company logos are trademarks of their respective owners." **Open risk:** the bundled pack's repo license is unstated — resolve before any commercial distribution (see §13).

---

## 9. Benchmark subsystem (SPY/QQQ)

Decision: **keyless Stooq (primary) + Yahoo v8 (fallback), total-return adjusted, cached, capital-matched.**

### 9.1 Sources
- Primary — **Stooq CSV:** `https://stooq.com/q/d/l/?s=spy.us&i=d` (and `qqq.us`). `Close` is already split+dividend adjusted → store `Close` as `adj_close`. Optional `&d1=YYYYMMDD&d2=YYYYMMDD` for the missing tail.
- Fallback — **Yahoo v8 chart:** `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=15y&events=div%2Csplit`; read `indicators.adjclose[0].adjclose` paired with `timestamp[]`; realistic User-Agent; retry with backoff on 401/429.
- Ruled out: Alpha Vantage (adjusted is premium-only in 2026); Polygon `adjusted=true` (split-only, not total return).

### 9.2 Storage & refresh
- `benchmark_prices(symbol TEXT, date TEXT, adj_close REAL, PRIMARY KEY(symbol, date))`.
- On app open: if `max(date)` for a symbol predates the last completed US trading day, fetch only the missing tail and upsert; else serve from SQLite. Refresh cadence: once/day. All fetching is server-side. **Fail-soft:** if both sources are unreachable, render from cache with a "prices as of <date>" note.
- Always store/compare the **adjusted** close (total return); price-only understates buy-and-hold.

### 9.3 Method (capital-matched)
For each capital deployment `(amount C, date d)` derived from `capitalUsage`: `units = C / SPY_adjClose(d)`. Benchmark value at `t` = `Σ units_i × SPY_adjClose(t)`; compared to the wheel account value over the identical window. This correctly handles uneven capital deployment, unlike a single start-to-end index return. (v2: money-weighted/IRR.)

### 9.4 Privacy
The request carries only fixed public tickers + a date range — never the user's positions, quantities, or P&L. Indistinguishable across users. No-key sources avoid any per-user vendor identifier. Documented in Settings/About.

---

## 10. Broker-agnostic import (file-only, v1)

Replace the Robinhood-specific paste flow with a universal importer:

- **Parse:** CSV/Excel (PapaParse for CSV; a light XLSX reader for Excel).
- **Column mapping:** auto-detect columns → app fields (`tradeDate`, `symbol`, `action`, `quantity`, `price`, `fees`, `optionType`, `strike`, `expiration`, …); user can correct unmapped/ambiguous columns; **save mappings as per-broker presets** keyed by header signature so repeat imports are one-click.
- **Normalize:** to existing `TradeTransaction` (keep `sourceBroker`/`accountName`; infer broker from preset or let the user tag it). Reuse existing normalization/strategy-classification.
- **Review/commit:** preview with imported/skipped-duplicate/unresolved/warning counts (retain current logic), explicit **confirmation + undo-last-import**.
- **Multi-account:** account switcher aggregates or filters by `(sourceBroker, accountName)`. v1 derives accounts from distinct values; a light `accounts` table can come later.

The old Robinhood-only parser becomes one preset among many. Broker auto-sync is a clearly-labeled "coming later" affordance.

---

## 11. Build sequence (phases)

Each phase is independently shippable and could be its own implementation plan.

- **Phase 0 — Foundation.** Aurora tokens (light+dark) in `globals.css`/`tailwind.config.ts`; consolidate all tiles into one `KpiCard` with variants; `AppChrome` + completed ARIA tab pattern; accessibility pass (signs/arrows on toned values, focus discipline app-wide, contrast audit); guard destructive actions; remove synthetic "Cap. Efficiency".
- **Phase 1 — Quick-win analytics + Overview/Trades/TaxLots/Settings re-skin.** Surface `now`-tier metrics (profit factor, expectancy, payoff, capture, assignment rate, annualized ROC, income/day, concentration, run-rate); equity curve; curated grouped Overview; onboarding/empty + sample-data banner; harden Trades (newest-first, null-sort-to-end, pagination, row count, unresolved badge); Tax-lots summary + inline zero-basis fix; Settings impact preview; DetailDrawer de-drift.
- **Phase 2 — Broker-agnostic import + multi-account + logos.** Universal CSV/Excel importer + column mapper + presets; account switcher; remove RH-only framing; ticker logo subsystem (bundled + monogram + opt-in online, §8).
- **Phase 3 — Derived metrics + benchmark + Performance.** Max drawdown, Sortino, Calmar; benchmark subsystem (§9) + capital-matched comparison; full Performance page incl. income calendar.
- **Phase 4 — Wheel engine (flagship).** Cycle-linking + roll-chain attribution + ratcheting ACB engine module; Wheels tab (triage list, campaign cards, campaign detail); recovery tracking.
- **Deferred / v2+.** Broker auto-sync; live unrealized prices; sector map + true buying-power utilization; money-weighted/IRR benchmark; user-tunable triage rules; (out of scope: options-chain/Greeks, tax/wash-sale).

---

## 12. Data-model & file changes (summary)

- `types/trading.ts`: extend `AppSettings` (`fetchLogosOnline: boolean` default false, `benchmarkEnabled`, `benchmarkIndices`, `accountSize?`, default sort); add `WheelCycle`/`Campaign` types (Phase 4); add `BenchmarkPoint`.
- New tables: `benchmark_prices`, `logo_cache` (+ saved import mappings, e.g. `import_presets`).
- New engine module: `lib/calculations/wheel-cycles.ts` (cycle linking, ACB ratchet, recovery) — keep `engine.ts` focused; this is a new bounded unit consuming `optionLifecycles` + `taxLots` + `capitalUsage`.
- New libs: `lib/import/universal-csv.ts` (+ presets), `lib/reference/logos.ts`, `lib/reference/benchmark.ts`; server routes `app/api/logo/[ticker]/route.ts`, `app/api/benchmark/route.ts`.
- New selectors: `lib/selectors/risk.ts` (drawdown/Sortino/Calmar), `lib/selectors/allocation.ts` (HHI/turnover), extend `lib/selectors/goal-pace.ts` (run-rate/required-monthly).
- Components: `TickerAvatar`, `WheelStepper`, `BenchmarkBars`, `MetricGroup`, `EmptyState`, `AppChrome`, refactored `KpiCard`, `DataTable` (pagination), restyled `DetailDrawer`.

---

## 13. Risks & open questions

- **Bundled logo-pack license** is unstated in the repo; resolve (open an issue / locate a LICENSE) before any commercial release. Mitigation: monogram-only mode is always available and license-clean.
- **Unofficial benchmark endpoints** (Stooq/Yahoo) can throttle/change shape. Mitigation: dual-source + daily-only cadence + permanent cache + fail-soft to cached rows.
- **Buying-power utilization** needs a user-entered account size to be accurate; absent that, show a clearly-labeled interim (deployed vs peak). Confirm we want the Settings input.
- **Free data-tier commercial terms:** if RealizedEdge is ever distributed (not single-user-local), the no-key sources' personal-use posture and logo trademark use must be re-reviewed.
- **Wheel cycle-linking edge cases:** rolls across expirations, partial assignments, multiple lots per ticker, same ticker across accounts — the engine module must define grouping keys (suggest `(account, underlying)` with explicit roll-chain links). Flag ambiguous chains rather than guessing.

---

## 14. Acceptance criteria (high level)
- New user with no data sees onboarding, not a zero cockpit; sample-data boundary is always visible.
- Overview shows a curated hero + grouped metrics; every toned value carries a sign; all tiles share one component.
- Wheels shows a per-ticker lifecycle with a ratcheting ACB and a triage queue.
- Performance shows annualized ROC, profit factor, drawdown/Sortino, concentration, and a capital-matched SPY/QQQ benchmark.
- Import accepts a CSV/Excel from at least 3 different brokers via mapping; no Robinhood-specific UI remains; broker sync is absent but signposted.
- App is fully functional offline; the only outbound calls are opt-in logos (default off) and the benchmark price fetch (public tickers only); both cache locally and fail soft.
- Accessibility: ARIA tabs complete, focus discipline app-wide, contrast ≥ 4.5:1 both themes, destructive actions guarded.

# Darpan — redesign design spec

Status: draft for review · 2026-06-21 · branch `redesign/aurora`

## 1. Summary

Darpan (formerly RealizedEdge / package `positioniq`) is a broker-agnostic
trading-performance tracker for eager short-term retail traders (day, swing,
options-wheel). The analytics engine is already deep and correct; this is a
**presentation redesign**, not an engine rewrite. We reorganize the information
architecture around four tabs, make it phone-first responsive, surface metrics
that are computed-but-hidden today, rebrand, and add two small new
computations (daily-P&L binning and a per-symbol leaderboard selector).

Brand: **Darpan** — Sanskrit दर्पण, "mirror." Tagline "The mirror for your
trades." Hook "It doesn't flatter. It reflects." Logo mark = aurora-gradient
rounded square containing a performance line and its faint mirrored reflection.

Design language stays the existing **Aurora** dark-first system (near-black
`--bg`, surface layering, Inter, `pos`/`neg`/`warn` semantic colors, aurora
gradient accent). No token overhaul — extend, don't replace.

### Goals
- Phone-first navigation that doesn't overflow (today's header never collapses).
- A "game tape" Home that leads with year-to-date performance.
- Expose the engine's full depth, organized so nothing is lost.
- Strategy-first Positions with active/closed drill-down.
- A per-symbol "ticker leaderboard."

### Non-goals (this spec)
- No changes to the calculation engine's math or the import pipeline.
- No live market data / unrealized option marks (not available; do not fabricate).
- No social/public leaderboard (self-leaderboard only).
- Risk ratios (max drawdown, Sortino, Calmar, payoff ratio) are **out** — dropped
  by product decision; do not surface them.

## 2. Information architecture

Four primary tabs, replacing the current flat `["Overview","Options","Swing
trades","Performance"]` pill row. Import / Settings / account switch / theme move
out of the top row into an overflow (`⋯`) menu.

| Tab | Purpose | Replaces |
|-----|---------|----------|
| **Home** | YTD verdict + P&L calendar + by-strategy strip + buying power + streak | Overview |
| **Performance** | Equity curve, benchmark, capital-deployed metrics, monthly breakdown | Performance |
| **Tickers** | Per-symbol leaderboard (Money makers / Account killers) + full table | new |
| **Positions** | Strategy-segmented book → metrics → Active/Closed/All drill | Options + Swing trades |

Account switch, year selector, Import, Settings, theme toggle, export → `⋯` menu
(year selector may stay inline on desktop). `DashboardApp`'s tab state expands to
these four plus modal-style `Import`/`Settings`.

## 3. Shell & responsive navigation

Rework `components/shell/AppShell.tsx`:

- **Desktop (≥ `md`)**: top bar — logo + wordmark left, 4 nav items, right cluster
  = year selector + `⋯`. Keyboard arrow-key tab cycling retained.
- **Phone (< `md`)**: top bar shows logo + `⋯` only; primary nav becomes a
  **fixed bottom tab bar** (thumb zone), 4 destinations, icon + label, active
  state changes both icon and label color. Icons: Home `layout-grid`,
  Performance `chart-line`, Tickers `trophy`, Positions `stack-2`.
- **Drill-downs on phone** use bottom sheets (e.g. tap a calendar day → sheet with
  that day's trades), not full-page navigation.
- Replace the cycling account button with a proper dropdown inside `⋯`.

## 4. Brand & tokens

- Wordmark "Darpan"; mark as above. Add to `AppShell` header and as favicon.
- Keep `app/globals.css` token set and `tailwind.config.ts` (`bg-aurora`, `pos`,
  `neg`, `warn`, radii). Add a `font-variant-numeric: tabular-nums` utility for
  all numeric cells (already used ad hoc; standardize).
- Light + dark parity required (dark is default).

## 5. Screens

### 5.1 Home

Default period = **YTD** (toggle: YTD / Month). Sections top-to-bottom:

1. **Period header** — year + `YTD | Month` segmented toggle. (The old `$/%/R`
   unit toggle is removed.)
2. **Verdict strip** (4 cards), each showing the value **and** a quiet secondary
   line (dual $/% — no global unit toggle):
   - Net P&L · YTD — `aggregates.currentYearRealizedPnl`; secondary `ytdRoi` →
     "+14.8% on capital".
   - Expectancy — `tradeQuality().expectancy`; secondary "avg per trade".
   - Profit factor — `tradeQuality().profitFactor`; secondary "$ won ÷ lost".
   - Win rate — `tradeQuality().winRate`; secondary "wins / total".
3. **By-strategy strip** — 4 compact cards (CSP, Covered calls, Long options,
   Swing) showing P&L + ROI% + win%, from `aggregates.strategyBreakdown[]` +
   per-strategy `tradeQuality`. Each card links to that strategy in Positions.
4. **P&L calendar** — YTD = full-year heatmap (month rows × day cells, colored by
   daily realized P&L); Month = single-month grid with per-day $ amounts. Click a
   day → day-detail (that day's `RealizedPnLEvent`s). Needs new daily-P&L selector
   (§7.1).
5. **Bottom row** — Equity curve (YTD, `aggregates.cumulativeRealizedPnl` +
   goal-pace line from `goalPace()`); **Buying-power gauge** (reuse
   `BuyingPowerGauge`, fed by deployed vs `settings.maxBuyingPower`, avg/peak from
   `aggregates.averageDeployedCapital`/`peakDeployedCapital`).

### 5.2 Performance

1. **Benchmark** — "You vs the market" capital-matched, You / VTI / SPY / QQQ via
   `benchmark/compare.ts capitalMatchedReturn` + existing `BenchmarkComparison`.
2. **Goal** — net realized P&L + goal progress + ahead/behind, from `goalPace()`.
3. **Equity curve** — clean cumulative P&L (no drawdown shading).
4. **Capital deployed** block — Avg deployed, Peak deployed, Return on capital
   (`capitalEfficiency().annualizedRoc`), Buying power used, Capital turnover
   (`capitalEfficiency().capitalTurnover`), Income/day
   (`capitalEfficiency().incomePerDay`), Capital-days
   (`MonthlyCapitalReturn.capitalDays` summed), Concentration
   (`allocation().bySymbol.hhi` + level).
5. **Monthly breakdown** table — per month: P&L, ROI%, avg capital deployed, and
   **ROI by strategy** (CSP/CC/Swing), from `MonthlyCapitalReturn[]`
   (`realizedPnl`, `realizedRoiPercent`, `averageDeployedCapital`,
   `coveredCallRoiPercent`, `cashSecuredPutRoiPercent`, `swingTradeRoiPercent`).

### 5.3 Tickers

- **Leaderboard** — two columns, "Money makers" (top by net P&L) and "Account
  killers" (bottom), each row: ticker logo, symbol, win% + trade count, net P&L,
  ROI%. Timeframe toggle (Week / Month / YTD / All-time). From
  `aggregates.symbolBreakdown[]` (symbol, pnl, roiPercent, trades, winRate).
- **Full symbol table** below — every symbol, sortable, with search + pagination
  (shared DataTable, §6).
- Annotate ranking by trade count so a single lucky trade can't top the board.

### 5.4 Positions (strategy-segmented)

- **Segment bar**: All strategies · Cash-secured puts · Covered calls · Long
  options · Swing.
- **All view**: 4 strategy summary tiles (P&L, ROI%, win%, trade count) →
  click-through to a strategy.
- **Per-strategy view**: strategy name + **All / Active / Closed** toggle, then a
  strategy-specific metric grid, then a positions table.
  - Metric grids (per strategy):
    - CSP / CC: Realized P&L, ROI (ann.), Premium collected, Capture rate,
      Assignment rate (put/call), Win rate, Capital at risk, Income/day (CSP) or
      Avg held (CC). From `premiumStats()` (`captureCashSecuredPut`,
      `captureCoveredCall`, `assignmentRatePut`, `assignmentRateCall`,
      `premiumCollected`) + `tradeQuality()` scoped to strategy.
    - Long options: Realized P&L, ROI, Win rate, Avg held, Capital, Trades, Avg
      win, Avg loss.
    - Swing: Realized P&L, ROI, Win rate, Avg held, Trades, Profit factor, Avg
      win, Avg loss.
  - **Strategy-specific table columns** (premium is meaningless for swing):
    - CSP / CC: Position · Stage/Result/Status · Premium · Capital · When · P&L
    - Long options: Position · Stage · Cost · When · P&L
    - Swing: Position · Stage · Qty · Cost basis · When · P&L
  - "When" = DTE for active, days-held for closed. P&L header = Unrealized
    (active) / Realized (closed) / P&L (all). Status dot distinguishes
    active/closed in the All view. Warm tag color for "Roll soon" / "Assigned".
  - Open positions sourced from `OptionLifecycle` (status `open`) + open swing
    tax lots; closed from `RealizedPnLEvent` / closed `OptionLifecycle`.
- Unresolved-data "Review & fix" banner per strategy (reuse `ReviewFixPanel`),
  replacing today's scattered per-tab Fix buttons.

## 6. Shared components

- **DataTable** (extend `components/tables/DataTable.tsx`): add **search** (filter
  by symbol/text) and **pagination** (page size 5–25, `n–m of N` + prev/next).
  Column definitions are passed per-usage so Positions can vary columns by
  strategy. Backs Positions tables, the Tickers full table, and the trade ledger.
  Short tables (monthly breakdown, summary strips) are not paged.
- **MetricCard** (extend `KpiCard`): support a primary value + optional quiet
  secondary line (dual $/%).
- **SegmentedControl**: shared pill toggle (period, state, timeframe, units).
- **CalendarHeatmap** (new): year-grid and month-grid modes; cells colored by
  daily P&L; day-click callback.
- **StrategyHub** (new): the Positions segment + per-strategy metrics + table
  composition.
- **Leaderboard** (new): Money makers / Account killers columns.

## 7. New computations (the only engine additions)

### 7.1 Daily P&L selector
`lib/selectors/daily-pnl.ts` — bin `RealizedPnLEvent[]` by calendar day → `{ date,
pnl, events[] }`. Powers the calendar heatmap and day-detail. Pure function over
existing events; respects active filters via `filterResult`.

### 7.2 Leaderboard selector
`lib/selectors/leaderboard.ts` — rank `aggregates.symbolBreakdown[]` by net P&L
for top (Money makers) and bottom (Account killers), carrying win% and trade
count; accept a timeframe filter. Mostly a thin sort/format over existing data.

## 8. Open questions / risks
- **Trademark + domain**: "Darpan" needs a real USPTO clearance (Nice classes 9 +
  36) + .com / app-store availability check before any public launch. Clean in our
  web scan, not legally cleared.
- Per-strategy `tradeQuality`/`premiumStats` scoping must reuse `filterResult` to
  stay consistent with global aggregates.

## 9. Rollout phasing (suggested)
1. Shell + responsive nav + rebrand + Aurora token tidy.
2. DataTable search/pagination + SegmentedControl + MetricCard dual value.
3. Positions strategy hub (highest-value restored depth).
4. Tickers leaderboard + full table.
5. Home (calendar heatmap, daily-P&L selector, buying-power gauge,
   by-strategy strip).
6. Performance (capital block, monthly breakdown, benchmark/equity cleanup).

Each phase ships independently; the engine is untouched throughout except the
two additive selectors in §7.

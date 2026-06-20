# Aurora mockup fidelity + kill-list (D-converge)

Make the app match the approved Aurora mockups exactly, and DELETE everything not in them. Dark tokens already match the mockup palette; use token classes only.

## GLOBAL KILL LIST (remove these — not in any mockup)
- The **FilterBar** row (year/month/symbol/strategy dropdowns). Account filtering stays — via the chrome account switcher only. Remove the FilterBar component usage and the year/month/symbol/strategy state; pass those to `filterResult` as constant `"ALL"` (keep `account`). Do not delete `filterResult`.
- The **footer** disclaimer line ("RealizedEdge is for personal tracking…"). Gone.
- The old **GoalSpotlight radial monthly gauge** + the monthly-target block. The Overview hero is the mockup card (below), not the two-column spotlight.
- The Overview **"Trade quality & risk" group, "Allocation" group, and the "Show more" long-tail** — not in the final Overview mockup. (Their metrics live on Performance instead.)
- Any **table column or KPI tile not named in a mockup below**.

## FILE STRUCTURE (split for parallel work)
Split the tab bodies out of `components/dashboard/DashboardApp.tsx` into `components/dashboard/tabs/`:
`OverviewTab.tsx`, `WheelsTab.tsx`, `PerformanceTab.tsx`, `TradesTab.tsx`. Shared helpers (`tone`, `label`, `signedMoney`, `signedPercent`, `EventsTable`, `OptionCycleTable`, `MonthlyRoiTable`, `DataTable` columns, `taxLotStatusChip`, etc.) move to `components/dashboard/tabs/shared.tsx` (or stay exported where sensible). `DashboardApp` keeps: store wiring, AppShell, the 4-tab routing, the DetailDrawer, Import/Settings. Each tab component takes the props it needs (`result`, and callbacks). Keep `role="tabpanel" id="dashboard-tabpanel"`.

## OVERVIEW (→ aurora_overview_full mockup)
- **Goal-hero card** (`bg-surface border border-hairline rounded-[14px] p-4`): `Annual goal · {year}` (muted 12px); big `formatCurrency(pace.actual)` (30px/600) + `/ {annualGoal}` (dim); ahead/behind pill (`bg-pos/15 text-pos` / `bg-neg/15 text-neg`, TrendingUp/Down lucide icon, `+{formatCurrency(|aheadBy|)} ahead/behind`); a thin `bg-aurora` gradient progress bar at `pace.pct%` on a `bg-background` track; a muted footer row `{formatPercent(pace.pct,0)} of goal · Projected year-end {formatCurrency(pace.projectedYearEnd)} · needs {formatCurrency(pace.requiredMonthly)}/mo`. (Keep an optional small trajectory sparkline if trivial; the radial gauge is killed.)
- **Hero KPI row** — 4 `KpiCard variant="hero"` in a `grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5`:
  1. `Net P&L · YTD` = `formatCurrency(aggregates.currentYearRealizedPnl)`, tone by sign.
  2. `Annualized ROC` = `formatPercent(capitalEfficiency.annualizedRoc)` (already %), tone by sign, "—" if null.
  3. `Premium` = `formatCurrency(premium.premiumCollected)`, helper `{captureRate*100→formatPercent(...,0)} capture`.
  4. `Win · PF` = `{winRate*100→formatPercent(...,0)}`, helper `PF {profitFactor→formatNumber(,1) or "—"} · exp {expectancy→formatCurrency}`.
- **Group "Income"** (`MetricGroup` + `variant="compact"`): Option premium `formatCurrency(aggregates.totalOptionsPremium)`; Stock P&L `formatCurrency(aggregates.totalStockTradingPnl)`; **Dividends** `formatCurrency(dividends)` where `dividends = sum(transactions.filter(t=>t.action==="DIVIDEND").netAmount)` (compute in OverviewTab); Income / day `capitalEfficiency.incomePerDay==null?"—":formatCurrency(...)`.
- **Group "Returns & risk"**: YTD ROI `formatPercent(aggregates.ytdRoi)` (guard null→"—"); Expectancy `formatCurrency(tradeQuality.expectancy)`; **Max drawdown** `riskMetrics(result).maxDrawdownPct==null?"—":formatPercent(-(pct*100),1)` tone negative; **Utilization** — `aggregates.peakDeployedCapital>0 ? formatPercent((averageDeployedCapital/peakDeployedCapital)*100,0) : "—"` (proxy until account buying-power exists; tooltip notes it's deployed-vs-peak).
- **Needs attention** insights (existing data logic) as left-border accent cards.
- NOTHING else on Overview.

## WHEELS (→ wheels_triage_list mockup) — replaces the interim stacked view
- **Header strip**: `Active wheels {N} · Capital at risk {formatCurrency(...)} · Premium · YTD {formatCurrency(premium.premiumCollected)}` (N = count of open optionLifecycles' distinct underlyings, capital at risk = sum open capital).
- **Triage chips** (filter pills): `All` · `Roll / close soon` · `Working` · `Assigned`. Bucket open `optionLifecycles` (status==="open") by DTE: `daysToExpiry = expirationDate - today`; DTE ≤ 7 → "Roll / close soon" (neg), assigned-leg/underwater → "Assigned" (info), else "Working" (pos). Each chip shows a count; clicking filters the table.
- **Open-wheels table** (token-styled rows, not the old DataTable header): columns `Position` (ticker bold + `{optionType==='call'?'CC':'CSP'} ${strikePrice}` muted; second line `{accountName} · {contracts*100 if call holding}`), `Stage` (Sold put / Covered call / Assigned, from optionType+status, accent text), `DTE` (number; neg color if ≤7, warn if ≤14), `Capital` (`formatCurrency(capitalDeployed or strike*shares)`), `Action` chip (Roll/close soon→neg pill, Working→muted pill). 
- DATA GAP: "% captured" and ITM/OTM need live option marks we don't have → OMIT the captured bar (or render "—"); do not fabricate. Note this in a code comment.
- Below the table, fold the **Tax Lots** ledger as a secondary section ("Assigned shares / tax lots") reusing the existing tax-lot table — this keeps tax lots reachable in the 4-tab IA.

## PERFORMANCE (→ aurora_performance mockup)
- Top KPI strip (4 compact KpiCards): Net P&L · YTD, Annualized ROC, Profit factor, Max drawdown.
- **Equity curve** (recharts line): cumulative realized P&L (`aggregates.monthlyRealizedPnl[].cumulative`) vs goal-pace line; reuse a recharts ResponsiveContainer with an explicit height wrapper (`h-[200px]`) to avoid the width(-1) warning.
- **Capital-efficiency ranking** table: open positions ranked by annualized ROC — columns Symbol, Strategy(CC/CSP), Capital, DTE, (Ann. ROC if computable from event annualizedRoiPercent for the underlying else "—"). From open optionLifecycles.
- **Risk strip** (compact KpiCards): Sortino, Calmar, Concentration (`allocation.bySymbol.level`), Assignment rate (`premium.assignmentRate*100`).
- **Buying-power utilization** bar: deployed vs peak (proxy), with the healthy-band note; "—" if no data.
- Keep the **Monthly ROI** chart + monthly ledger table (they're useful and chart-shaped like the mockup). 
- DATA GAP: SPY/QQQ **benchmark** + **income calendar** need the deferred subsystems → render a small "Benchmark vs SPY/QQQ — coming soon" placeholder card, do not fabricate.

## TRADES (→ aurora_trades_blotter mockup)
- Search input + type filter chips (`All` · `Options` · `Stock` · `Unresolved {n}`).
- Table: **newest-first** by date; columns Date, Symbol, Action (labelled), Qty, Net (signedMoney), Status (StatusChip). Null-safe sort (missing values last; no -999 sentinels).
- Pagination footer: `1–{pageSize} of {total}` + Prev/Next; render at most `pageSize` (e.g. 50) rows.
- Unresolved count badge on the Trades nav pill (pass count up to AppShell) — optional if trivial.

## Constraints
- Token classes only; every metric tile is the shared `KpiCard`; toned values keep the +/- arrow; nulls render "—"; fraction selectors ×100 before `formatPercent`, already-% passed straight.
- Gates: `npm run typecheck`, `npm run lint`, `npm test`, `npx next build`. Reuse all existing selectors/engine; no new data sources.

# Architecture

Darpan is a Next.js App Router application with a client-rendered dashboard, local API
routes, SQLite persistence, and a pure calculation engine. Everything runs and stores
locally; nothing is sent off-device.

## High-level flow

```text
Robinhood CSV / pasted rows
  -> lib/import/robinhood.ts            (parse + normalize to TradeTransaction[])
  -> app/api/import/robinhood/route.ts
  -> lib/db/database.ts                 (SQLite: data/darpan.sqlite)
  -> app/api/store/route.ts             (GET/PUT/DELETE)
  -> lib/storage/server-store-client.ts (client snapshot via useSyncExternalStore)
  -> components/dashboard/DashboardApp.tsx
  -> lib/calculations/engine.ts         (calculateDashboard -> CalculationResult)
  -> lib/selectors/*                    (derive per-view data)
  -> tabs + charts + tables + KPIs
```

## Persistence

SQLite is accessed in `lib/db/database.ts` via Node's built-in `node:sqlite`
(`process.getBuiltinModule`). Tables:

- `transactions` — each normalized `TradeTransaction` as a JSON payload plus query metadata.
- `settings` — a single `app` JSON payload.

The database file is `data/darpan.sqlite`. On first use, if it is absent but an
older-named database file exists, the helper renames it forward — those legacy filenames
exist purely for that one-time migration.

`lib/storage/local-store.ts` holds `defaultSettings`, backup create/parse, and a localStorage
migration path (the current key plus older-named legacy keys) used as a fallback. The theme
preference (`darpan.theme`) is the one thing intentionally kept in `localStorage`, set before
paint by the no-flash script in `app/layout.tsx`. Trading data itself lives in SQLite.

## API routes

`app/api/store/route.ts`
- `GET` — returns transactions and settings.
- `PUT` — replaces transactions and/or settings.
- `DELETE` — clears transactions and resets settings.

`app/api/import/robinhood/route.ts`
- `POST` — parses raw CSV text and writes rows to SQLite (`mode: "replace" | "append"`).
  Duplicate rows are preserved; duplicate ids are returned as warning metadata.

`app/api/benchmark/route.ts`
- Fetches benchmark closes (SPY/QQQ/VTI) for capital-matched comparison; see
  `lib/benchmark/{compare,fetch}.ts`.

## Calculation engine

`lib/calculations/engine.ts` is the domain core. Main export:

- `calculateDashboard(transactions, settings, today?) => CalculationResult`

`CalculationResult` contains: sorted `transactions`, `realizedEvents` (per-close P&L with
explanations), `taxLots`, `optionLifecycles`, `capitalUsage`, `monthlyReturns`,
`positionCapital`, `aggregates` (totals, win rate, strategy/symbol breakdowns, deployed
capital), `unresolvedTransactions`, `duplicateTransactionIds`, and `warnings`.

Key behaviors:
- Same-day opens are processed before closes.
- Stock lots use FIFO / LIFO / AVERAGE per settings.
- A stock sell with no covering buy is left unresolved (`costBasis === null`) and surfaced in
  Review & fix, where the user supplies the opener.
- Option lifecycles are keyed by underlying, option type, strike, and expiration.
- A put assignment creates a stock tax lot; its stock P&L realizes when the shares are sold.

## Selectors

Pure functions in `lib/selectors/` derive view data from a `CalculationResult` (or its
events), so the engine stays UI-agnostic:

- `trade-quality` — win rate, profit factor, payoff ratio, expectancy, avg win/loss.
- `premium-capture` — premium collected, capture rate (CC/CSP), assignment rates.
- `capital-efficiency` — annualized return on capital, capital turnover, income/day.
- `allocation` — symbol/strategy concentration (HHI + level).
- `goal-pace` — YTD vs. annual goal, projection, required monthly run-rate.
- `daily-pnl` — bins realized events by calendar day (powers the calendar heatmap).
- `leaderboard` — ranks symbols into winners/losers (Tickers).
- `strategy-analytics` — scopes quality/premium/capital metrics to one strategy (Positions).
- `filter-result` — period / strategy / account scoping (recomputes from filtered rows).

Risk ratios (max drawdown, Sortino, Calmar, payoff) are intentionally not computed or
surfaced.

## UI structure

`components/dashboard/DashboardApp.tsx` owns the active tab, filters (year/account), the
detail-drawer selection, and Import/Settings panels. `components/shell/AppShell.tsx` renders
the brand, the desktop tab bar + `OverflowMenu`, and the mobile `BottomNav`.

Repeated primitives: `KpiCard` (label/value/helper with tooltip), `DataTable` (sortable +
searchable + paginated, per-usage column definitions), `SegmentedControl`, `CalendarHeatmap`,
`BuyingPowerGauge`, and `DetailDrawer` (event- and lifecycle-aware P&L breakdown).

## Types

Domain contracts live in `types/trading.ts`. When changing a type, check the parser, DB
save/load, the engine, selectors, the tables/charts that consume it, and the backup payload.

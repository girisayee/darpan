# Architecture

Darpan is a Next.js App Router application with a client-rendered dashboard, session-gated
API routes, Postgres persistence (Drizzle ORM), Auth.js Google SSO, and a pure calculation
engine. It is hosted and multi-user: every request resolves a signed-in user, and all
trading data is scoped to that user's id.

## High-level flow

```text
Robinhood CSV / pasted rows
  -> lib/import/robinhood.ts            (parse + normalize to TradeTransaction[])
  -> app/api/import/robinhood/route.ts  (auth() -> session.user.id)
  -> lib/db/database.ts                 (Drizzle/Postgres, scoped by userId)
  -> app/api/store/route.ts             (GET/PUT/DELETE, auth-gated)
  -> lib/storage/server-store-client.ts (client snapshot via useSyncExternalStore)
  -> components/dashboard/DashboardApp.tsx
  -> lib/calculations/engine.ts         (calculateDashboard -> CalculationResult)
  -> lib/selectors/*                    (derive per-view data)
  -> tabs + charts + tables + KPIs
```

## Authentication

Auth.js v5 (`next-auth@beta`) is configured in `auth.ts`:

- **Provider:** Google OAuth. `allowDangerousEmailAccountLinking` is enabled so a Google
  account links to a pre-existing user row with the same email (e.g. one seeded by the
  SQLite→Postgres migration) — safe for this single-provider, allowlisted, email-verified app.
- **Adapter:** `@auth/drizzle-adapter` over the `user` / `account` / `session` /
  `verificationToken` tables in `lib/db/schema.ts`.
- **Sessions:** JWT strategy (not database sessions) — required for the planned Phase B
  Credentials provider. The `jwt`/`session` callbacks thread the user id onto
  `session.user.id` (typed via `types/next-auth.d.ts`).
- **Allowlist:** the `signIn` callback calls `isAllowedEmail` (`lib/auth/allowlist.ts`),
  which checks the comma-separated, case-insensitive `ALLOWED_EMAILS` env var and denies
  everyone when it is unset.
- **Route handler:** `app/api/auth/[...nextauth]/route.ts`. Sign-in UI: `app/signin/page.tsx`.
  `app/page.tsx` is a server component that redirects unauthenticated visitors to `/signin`.

## Persistence

Postgres is accessed in `lib/db/database.ts` through Drizzle ORM (`lib/db/client.ts`,
postgres-js driver). Every helper (`listDbTransactions`, `replaceDbTransactions`,
`getDbSettings`, `saveDbSettings`, `clearDbData`) takes `userId` as its first argument and
filters/writes only that user's rows. Schema in `lib/db/schema.ts`:

- `transactions` — each normalized `TradeTransaction` as a JSONB `payload` plus query
  metadata (`userId`, `tradeDate`, `symbol`, `status`, `importBatchId`), indexed by
  `(userId, tradeDate)`.
- `settings` — one JSONB `value` row per `userId` (upserted via `onConflictDoUpdate`).
- `user` / `account` / `session` / `verificationToken` — Auth.js adapter tables.

`lib/storage/local-store.ts` holds only `defaultSettings` and backup create/parse helpers.
The theme preference (`darpan.theme`) is the one thing kept in `localStorage`, set before
paint by the no-flash script in `app/layout.tsx`. All trading data lives in Postgres.

## API routes

Every data route calls `auth()` and returns `401` when there is no `session.user.id`.

`app/api/store/route.ts`
- `GET` — returns the signed-in user's transactions and settings.
- `PUT` — replaces the user's transactions and/or settings.
- `DELETE` — clears the user's transactions and resets settings.

`app/api/import/robinhood/route.ts`
- `POST` — parses raw CSV text and writes rows for the signed-in user
  (`mode: "replace" | "append"`). Duplicate rows are preserved; duplicate ids are returned as
  warning metadata.

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

Domain contracts live in `types/trading.ts` (session/user augmentation in
`types/next-auth.d.ts`). When changing a type, check the parser, DB save/load, the engine,
selectors, the tables/charts that consume it, and the backup payload.

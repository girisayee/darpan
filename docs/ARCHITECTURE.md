# Architecture

PositionIQ is a Next.js App Router application with a client-heavy dashboard, local API routes, and SQLite persistence.

## High-Level Flow

```text
Robinhood CSV
  -> lib/import/robinhood.ts
  -> app/api/import/robinhood/route.ts
  -> lib/db/database.ts
  -> SQLite data/positioniq.sqlite
  -> /api/store
  -> lib/storage/server-store-client.ts
  -> components/dashboard/DashboardApp.tsx
  -> lib/calculations/engine.ts
  -> UI tables/charts/KPIs
```

## Persistence

SQLite is accessed from `lib/db/database.ts` using Node's built-in `node:sqlite` module through `process.getBuiltinModule`.

Tables:

- `transactions`: stores each normalized `TradeTransaction` as JSON payload plus query metadata.
- `settings`: stores one `app` JSON payload.

Current DB path:

- `data/positioniq.sqlite`

Legacy migration:

- If `data/positioniq.sqlite` does not exist but `data/realizededge.sqlite` does, the DB helper renames the legacy file.

Do not move transaction/settings persistence back to browser localStorage.

## API Routes

`app/api/store/route.ts`

- `GET`: returns transactions and settings.
- `PUT`: replaces transactions and/or settings.
- `DELETE`: clears transactions and resets settings.

`app/api/import/robinhood/route.ts`

- `POST`: parses raw CSV text and writes rows to SQLite.
- `mode: "replace"` imports into a fresh transaction set.
- `mode: "append"` appends to existing rows.
- Duplicate rows are preserved; duplicate ids are warning metadata.

## Client Store

`lib/storage/server-store-client.ts` exposes a tiny external store used through `useSyncExternalStore`.

It keeps the client snapshot in sync with `/api/store` responses and merges settings with `defaultSettings` so new settings get defaults when old DBs/backups are loaded.

## Calculation Engine

`lib/calculations/engine.ts` is the domain core.

Main export:

- `calculateDashboard(transactions, settings, today?)`

Important outputs:

- sorted transactions
- realized P&L events
- tax lots
- option lifecycles
- capital usage intervals
- monthly returns
- aggregate dashboard stats
- warnings and unresolved transactions

Important behaviors:

- Transaction sorting processes same-day opens before closes.
- Stock lots use FIFO/LIFO/AVERAGE based on settings.
- Manual per-symbol basis overrides can fill missing stock basis.
- Exact-match zero-basis manual lots support fractional dividend-share sales.
- Option lifecycles are keyed by underlying, option type, strike, and expiration.
- Put assignment creates a stock tax lot; stock P&L is realized later when shares are sold.

## UI Structure

`components/dashboard/DashboardApp.tsx` is the main container. It owns:

- active view state
- filters
- settings updates
- transaction replacement
- overview layout persistence
- drawer selection

Repeated UI primitives:

- `KpiCard`: card with visible hover/focus tooltip.
- `DataTable`: sortable table.
- `MonthlyRoiChart`: Recharts-based monthly ROI bar chart.

## Types

Domain contracts live in `types/trading.ts`. Keep this file aligned with:

- parser output
- database payloads
- calculation engine inputs/outputs
- UI table/chart expectations
- backup payloads

When changing a type, check parser, DB save/load, tests, and dashboard rendering.

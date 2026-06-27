# Agent Guide

Fast-start guide for coding agents and contributors working in this repo.

## Product snapshot

Darpan is a hosted, multi-user Next.js dashboard for short-term retail traders. It imports
Robinhood-style CSV activity, reconstructs realized P&L / option income / capital usage in a
pure calculation engine, and presents it across four tabs: **Home**, **Performance**,
**Tickers**, **Positions** (Import and Settings live behind a `⋯` overflow menu). Sign-in is
Google SSO gated by an email allowlist; all data is isolated per user.

The product, package, UI, and docs name is **Darpan**. The no-flash theme script in
`app/layout.tsx` keeps the older app-name `localStorage` theme key as a one-time fallback —
never reintroduce old branding anywhere else.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 3 (the "Aurora" dark-first token
set in `app/globals.css` + `tailwind.config.ts`) · Recharts · Vitest (Node env).

## Where to start

- App entry: `app/page.tsx`, `app/layout.tsx`
- Shell / nav: `components/shell/AppShell.tsx` (desktop top bar + `OverflowMenu` + mobile `BottomNav`)
- Main container: `components/dashboard/DashboardApp.tsx` (tab state, filters, drawer, import/settings)
- Tabs: `components/dashboard/tabs/{HomeTab,PerformanceTab,TickersTab,PositionsTab}.tsx`
- Shared tab helpers: `components/dashboard/tabs/shared.tsx` (`SegmentedControl`, `MonthlyRoiTable`, tone/format helpers, `ClosedCyclesTable`)
- Reusable UI: `KpiCard`, `MetricGroup`, `BuyingPowerGauge`, `CalendarHeatmap`, `DayDetail`,
  `Leaderboard`, `StrategyStrip`, `StrategyMetrics`, `DetailDrawer`, `ReviewFixPanel`,
  `common/{StatusChip,InfoTooltip,TickerLogo,Logo}.tsx`, `tables/DataTable.tsx`
  (sortable + searchable + paginated), `dashboard/positions/columns.tsx`
- Domain types: `types/trading.ts`
- Calculation engine: `lib/calculations/engine.ts` (`calculateDashboard`)
- Selectors (pure, derive view data from a `CalculationResult`): `lib/selectors/*`
  — `trade-quality`, `premium-capture`, `allocation`, `capital-efficiency`, `goal-pace`,
  `top-movers`, `daily-pnl`, `leaderboard`, `strategy-analytics`, `filter-result`, `analytics`
- Robinhood CSV parser: `lib/import/robinhood.ts`
- Benchmarks: `lib/benchmark/{compare,fetch}.ts` (capital-matched SPY/QQQ/VTI)
- Persistence: Postgres via Drizzle in `lib/db/database.ts` (every helper takes `userId`);
  schema `lib/db/schema.ts`; client `lib/db/client.ts`; client bridge `lib/storage/server-store-client.ts`;
  `lib/storage/local-store.ts` holds `defaultSettings` and backup create/parse
- Auth: `auth.ts` (NextAuth v5, Google provider, Drizzle adapter, JWT sessions);
  allowlist `lib/auth/allowlist.ts` (`ALLOWED_EMAILS`); route handler `app/api/auth/[...nextauth]/route.ts`;
  session type augmentation `types/next-auth.d.ts`
- API routes: `app/api/store/route.ts`, `app/api/import/robinhood/route.ts`, `app/api/benchmark/route.ts`
- Tests: `tests/**/*.test.ts`

Read `docs/ARCHITECTURE.md` and `docs/FEATURES.md` before broad changes.

## Run and verify

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run (tests/**/*.test.ts, Node env)
npm run build       # next build
```

Tests run in a **Node** environment (`vitest.config.ts`) — unit-test pure logic
(selectors, engine) under `tests/`. There is no jsdom setup, so verify UI via
typecheck/lint/build and the running dev server rather than component render tests.

## Important invariants

- The calculation engine (`lib/calculations/engine.ts`) and the Robinhood importer are the
  domain core — change their math only deliberately, and update/extend tests when you do.
- Transactions and settings persist in Postgres through `/api/store`, always scoped by
  `session.user.id`. Every data route must call `auth()` and 401 when unauthenticated —
  never return or write cross-user rows. Do not commit `.env.local`, `data/*.sqlite`, or user
  CSVs — they contain secrets / personal financial data.
- Preserve imported rows unless the user explicitly asks to dedupe; duplicate ids are
  informational warnings (they can be genuinely separate executions).
- A stock sell with no matching opening buy yields an unresolved `SWING_TRADE` event
  (`costBasis === null`, "Missing cost basis" warning); the opener is added via Review & fix.
- Same-day option open/close rows must process opens before closes.
- A "Dividend Reinvestment" row carries Trans Code `Buy` — it's a (fractional) stock
  purchase, not a cash dividend. `normalizeAction` honors a literal `BUY`/`SELL` code
  before the description-text fallback; don't reorder that.
- A stock sell that exceeds its opening lots keeps the matched cost basis (and warns
  "Missing cost basis for N of M shares"); basis is null only when nothing matched.
  A put assignment with no sell-to-open is suppressed (not a DATA_ISSUE) when open
  stock lots already cover the assigned shares.
- Do **not** surface max drawdown, Sortino, Calmar, payoff ratio, a discipline streak, live
  option marks, or a social leaderboard — these were explicitly cut from the product.
- **Return on capital has one definition**: realized P&L ÷ time-weighted average
  deployed capital (dollar-days ÷ days), via `lib/selectors/return-on-capital.ts`.
  Home, Performance ("Your return" + the RoC KPI), and `aggregates.returnOnCapital`
  all read it; the monthly table and per-symbol RoC use the same formula. Annualized
  is always RoC × (365 ÷ days), shown only as an explicitly-labeled secondary — never
  the headline. Tickers' "Peak-capital ROI" (÷ peak concurrent capital) is a separate,
  labeled metric, not a second RoC. Don't reintroduce alternative denominators.
- `winRate` convention is inconsistent by source and easy to get wrong: `tradeQuality().winRate`
  is a **fraction (0–1)**, while `aggregates.winRate` and `symbolBreakdown[].winRate` are a
  **percent (0–100)**. `formatPercent` does not multiply — it appends `%`.
- Positions: the combined "All strategies" board lists **option plays only** (CSP/CC/Long);
  Swing shows **closed** positions only. Per-strategy and combined views default to **All**.
- Chart axes use month abbreviations (`monthTick`); tooltips use `monthLabel` ("Jun '26").
  Dates everywhere use `formatDisplayDate`.

## Editing style

- Keep changes scoped; follow existing component and token patterns.
- Use the Aurora CSS tokens (`rgb(var(--pos))`, `text-muted-foreground`, etc.) — never
  hardcode hex; everything must work in light and dark.
- Numeric cells use `tabular-nums` and the helpers in `lib/utils/format.ts`.
- Prefer typed selectors over ad hoc logic for domain behavior; add tests when calculation,
  import, or persistence behavior changes.
- Keep the UI dense, professional, and readable — generous metric type, not marketing copy.

## Data privacy

Treat imported CSVs, the SQLite DB, backups, and transaction contents as private financial
data. Use small synthetic examples in tests and docs — never paste real transaction data.

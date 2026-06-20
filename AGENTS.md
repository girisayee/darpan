# Agent Guide

This file is the fast-start guide for future coding agents working in this repo.

## Product Snapshot

PositionIQ is a local-first Next.js dashboard for personal trading analytics. It imports Robinhood-style CSV activity, normalizes transactions into SQLite, and calculates realized P&L, option income, current CC/CSP exposure, tax lots, monthly ROI, and goal progress.

The current product, UI, package, and documentation name is `PositionIQ`. Keep `realizededge` references only where they are explicitly legacy migration keys or paths.

## Where To Start

- App entry: `app/page.tsx`
- Main UI: `components/dashboard/DashboardApp.tsx`
- Chart UI: `components/charts/DashboardCharts.tsx`
- KPI card/tooltip pattern: `components/dashboard/KpiCard.tsx`
- Table component: `components/tables/DataTable.tsx`
- Domain types: `types/trading.ts`
- Calculation engine: `lib/calculations/engine.ts`
- Robinhood CSV parser: `lib/import/robinhood.ts`
- SQLite persistence: `lib/db/database.ts`
- Client store bridge: `lib/storage/server-store-client.ts`
- API routes: `app/api/store/route.ts`, `app/api/import/robinhood/route.ts`
- Tests: `tests/calculations.test.ts`, `tests/import.test.ts`

Read these docs before broad changes:

- `docs/FEATURES.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/OPERATIONS.md`

## Run And Verify

Use these checks before handing off meaningful code changes:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

For frontend changes, verify in the in-app browser at `http://localhost:3000/` when the dev server is running.

## Important Invariants

- Do not store trading data in `localStorage`. Transactions and settings live in local SQLite through `/api/store`.
- Do not commit `data/*.sqlite` or user CSV files. They contain personal financial data.
- Preserve Robinhood import rows unless the user explicitly asks to dedupe. Duplicate warnings are informational; duplicates can represent real separate executions.
- Assignment stock settlement rows from Robinhood are intentionally ignored to avoid double counting the linked option assignment.
- Assignment events still exist in the ledger and calculations, but the dashboard should not promote separate assignment stat cards or chart series.
- LEU-style same-day option open/close rows must process opens before closes.
- A stock sell with no matching opening buy yields an unresolved SWING_TRADE event (`costBasis === null`, "Missing cost basis" warning); the opener is added via Review & fix.
- Current covered-call capital uses known stock basis when available and strike exposure as a fallback for open-cycle display.
- The annual realized P&L goal is configurable in settings and defaults to `40000`.

## Editing Style

- Keep changes scoped and follow existing component patterns.
- Use `apply_patch` for manual edits.
- Prefer typed helpers over ad hoc string logic for domain behavior.
- Add or update tests when calculation, import, or persistence behavior changes.
- Keep UI dense, professional, and dashboard-like. Avoid marketing-page patterns.
- Keep user-visible wording concise and practical.

## Data Privacy

Treat imported CSVs, SQLite DBs, backups, and transaction contents as private financial data. Do not paste large raw transaction data into docs, tests, or final responses. Use small synthetic examples for tests and documentation.

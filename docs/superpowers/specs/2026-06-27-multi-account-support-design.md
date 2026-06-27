# Multi-account support — design

**Date:** 2026-06-27
**Status:** Approved design. **Implementation deferred** until the in-flight DB rewrite (schema.ts / database.ts / migrations / store API) is committed, to avoid dueling migrations.
**Model:** relational — `tradingAccounts` table + `transactions.accountId` FK.

## Goals

- Every user has trading accounts. On first sign-in they get **one default account** they can **rename but not delete**; they can **add** more.
- **Import** maps the whole batch to the user's default account by default; the user can **change the mapped account** (one dropdown) before saving.
- A user can **edit a position's account** from the detail drawer.
- An **app-level account selector** defaults to **All accounts**, is **always shown**, and lets the user select one or more individual accounts.

## Current state (what we build on)

- Account is just a string today: `TradeTransaction.payload.accountName` (default = broker name). `filterResult` already filters by a single `account`; `AppShell` has a single-select switcher. No accounts entity.
- The DB `account` table is **Auth.js OAuth** — not broker accounts. The broker table must be named differently (`tradingAccounts`).
- `transactions` is `{ userId, payload(jsonb), tradeDate, symbol, status, importBatchId }` — account currently lives only inside `payload`.

## Data model

New table (Drizzle, Postgres), aligned with the DB session's migration tooling:

```
tradingAccounts:
  id         text pk ($defaultFn uuid)
  userId     text not null → users.id (cascade)
  name       text not null
  isDefault  boolean not null default false
  createdAt  timestamp default now
  index(userId)
```

- Exactly one `isDefault = true` per user (enforced app-side; optional partial unique index `(userId) where isDefault`).
- `transactions.accountId text → tradingAccounts.id` (nullable through migration, then backfilled). Index `(userId, accountId)`.
- **Canonical = the column.** For the client (which reads `payload` objects and filters in JS), `accountId` is **also mirrored into `payload`** and kept in sync on every write, so `filterResult` and the UI work without a join.

## Migration (one-off, after the DB rewrite lands)

1. Create `tradingAccounts`; add `transactions.accountId` (nullable).
2. Per user: create **one default account** named after their most common existing `accountName` (fallback `"Main account"`), `isDefault = true`; set every transaction's `accountId` (column + `payload.accountId`) to it.
3. New users: auto-create a default account (`"Main account"`) — at user creation (auth callback) or lazily on first store load, whichever fits the DB session's auth wiring.

## Accounts API (CRUD, per-user, auth-scoped)

- `list` — accounts for the session user.
- `create(name)` — add a non-default account.
- `rename(id, name)` — allowed for any account, including the default.
- `delete(id)` — **default is never deletable**. Deleting a non-default account **reassigns its transactions to the default** (no orphans), then removes it. *(Flagged for review: alternative is to block deletion when the account has trades.)*

## App-level selector

- Replace `AppShell`'s single-select with a **multi-select dropdown**: "All accounts" (default) + a checkbox per account. **Always shown.**
- Selection lives in the **URL** (`?accounts=id1,id2`), consistent with the existing `?year=`; absent = all. Shareable and survives reload.
- `filterResult`: change the `account` filter from one string to a **set of accountIds** (empty/"ALL" = all); keep a transaction when `payload.accountId` ∈ selected.

## Import mapping

- The redesigned `ImportTab` gains a single **account dropdown** at the top of the review (defaults to the user's default account).
- On "Import selected", every imported row is written with the chosen `accountId` (column + `payload.accountId`). *(Per-row override is out of scope — see decision.)*

## Positions editing (detail drawer)

- `DetailDrawer` gains an **account dropdown** for the open position/trade. Changing it updates the `accountId` on the underlying transaction(s) via the store. For an option lifecycle that spans multiple linked transactions, **all linked transactions** are updated together.

## Build order (each its own plan → implementation)

1. **Model + migration + accounts CRUD API + Settings management UI** (the schema-heavy, collision-zone slice).
2. **App-level multi-select selector + `filterResult` by accountId set.**
3. **Import batch account mapping.**
4. **Positions detail-drawer account editing.**

Slices 2–4 depend on Slice 1's schema.

## Testing

- Migration backfill: existing rows all land on the seeded default account.
- Accounts API: default rename works; default delete blocked; non-default delete reassigns its trades to the default.
- New-user default-account auto-creation.
- `filterResult`: multi-account filtering (subset, all, none-selected = all).
- Import writes the chosen accountId to all saved rows; drawer edit updates all linked transactions.

## Decisions captured

- **Backfill:** single default account per user (named after the existing broker), all rows assigned. ✔
- **Import mapping:** whole-batch, changeable (no per-row override). ✔
- **Selector:** always shown, defaults to All accounts, multi-select. ✔
- **Edit account:** via the detail drawer. ✔

## Dependencies / risks

- **Collision:** Slice 1 edits `schema.ts`, `database.ts`, the store API, and adds a migration — the same surface the other session is rewriting. Build only after that lands; align the table + migration with their tooling (e.g. `drizzle-kit push` vs versioned migrations).
- The store API (`/api/store`) currently does a delete-then-reinsert of all a user's transactions on save; account edits ride that path, so they inherit whatever fix resolves the current "unable to store" (auth/session) issue.

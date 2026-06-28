# Manage entries (transactions admin) — Design

**Date:** 2026-06-27 · **Status:** Approved (implementing unattended)

A full-screen admin to manage every transaction (manual + imported) with search,
sort, filter, "date added", inline editing of any field, and a manual-vs-imported
(·edited) indicator.

## Decisions (locked)
- **Placement:** new route `/entries` in the `(app)` group, opened from the ⋯ menu
  alongside Import/Settings. No new primary tab.
- **Edited tracking:** badge + `editedAt` date. An imported row the user changes
  reads "{broker} · edited"; a purely manual row reads "Manual".
- **Edit power:** full admin — edit every field on any row, delete any row (confirm).

## Data model
Two optional payload fields on `TradeTransaction`:
- `createdAt?: string` — date added (ISO). Stamped once, preserved across saves.
- `editedAt?: string` — set when the user edits the row.

Persistence rewrites all rows on every save and the DB `updatedAt` resets each
time, so "date added" must live in the payload, not a DB timestamp:
- `replaceDbTransactions` stamps `createdAt = t.createdAt ?? now` per row — a single
  choke point that covers import + manual-add + edits, and preserves existing values.
- One-time backfill of existing rows: `createdAt` from the import-batch ISO
  (`importBatchId` = `import-<iso>`) when parseable, else the row's DB `updatedAt`.

## Source / edited classifier (pure, tested) — `lib/entries/entry-meta.ts`
- `entrySource(t)` → `{ kind: "manual" | "imported", broker?, edited, label }`
  - manual = `importBatchId === "manual"` or `tags` includes `"manual"` → label "Manual"
  - else imported → broker = `sourceBroker`; label = `editedAt ? "{broker} · edited" : broker`
- `stampCreatedAt(t, nowIso)` → returns `t` with `createdAt` set when missing.

## UI — `components/dashboard/EntriesAdmin.tsx` (client)
Route page `app/(app)/entries/page.tsx` wires `useDashboard()` →
`storedTransactions`, `accounts`, `updateTransaction`, `deleteTransaction`.
- `DataTable` (existing — search, column sort, pagination) over all stored rows.
  Columns: Source badge · Date · Symbol(+detail) · Action · Qty · Price · Amount ·
  Account · Added · Status.
- Filter chips above: Source (All/Manual/Imported/Edited), Account, Status.
- Row → edit modal: Date, Account, Action, Symbol, Quantity, Price, Amount, Fees,
  Option type/Strike/Expiration, Status, Notes. Save → if the row is imported, set
  `editedAt = now`, then `updateTransaction`. Delete → confirm → `deleteTransaction`.
- ⋯ menu gains "Manage entries" → `router.push("/entries")` (OverflowMenu prop +
  AppShell passthrough + DashboardShell wiring).

No engine changes. The existing Settings → Manual entries panel stays (subset);
this admin supersedes it functionally.

## Testing
Unit tests for `entrySource` (manual / imported / imported·edited) and
`stampCreatedAt` (sets when missing, preserves when present). UI verified via
typecheck/lint/build (no jsdom).

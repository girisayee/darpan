# Import UI redesign — design

**Date:** 2026-06-27
**Status:** Approved (design + mockup approved by user)
**Component:** `components/dashboard/tabs/ImportTab.tsx`

## Problem

The current Import tab is a two-pane paste/parse/save flow: paste or upload CSV → click **Parse Rows** → click **Save Import** (which appends *all* parsed rows). It's not intuitive — no drag/drop, a manual parse step, no row-level control, and duplicates/warnings are only surfaced as separate KPI tiles and a warnings list.

## Goals

- **Drag-and-drop** files (or browse, or paste) — multiple files supported.
- **Auto-parse** as soon as files are loaded (no separate Parse step).
- **Per-row review** with clear status: New / Duplicate / Warning / Ignored.
- **Import all or selected** rows, with a live selected count.
- **Flag duplicates and warnings** inline.
- Import is **append-only** (never overwrite); only selected rows are sent.

## Design

One screen, top-to-bottom:

1. **Dropzone** — large dashed drop area ("Drop Robinhood CSV files here, or browse"). Click opens the file picker (`accept=".csv"`, `multiple`). A "paste CSV instead" toggle reveals the textarea for power users. Dropping/selecting/pasting triggers parse immediately.
2. **Summary chips** — color-coded counts: New, Duplicates, Warnings, Ignored, plus "N rows parsed from M file(s)".
3. **Review table** — one row per parsed transaction: selection checkbox, status badge, Date, Symbol, Action, Qty, Net (or the warning reason for flagged rows). A header select-all checkbox and a search box. Scrollable (max-height) — no pagination.
4. **Action bar** — "Import N selected" primary button (count live, disabled at 0) + "Select all new" secondary. After a successful import, show a success state with "Import more files".

### Row status + default selection

Derived from `parseRobinhoodInput`'s output (`rows`, `duplicateIds`, `issues`):

| Status | Condition | Default | Selectable |
|---|---|---|---|
| Duplicate | `duplicateIds` includes `row.id` | unchecked | yes |
| Ignored | `row.status === "ignored"` | unchecked | no |
| Warning | `row.status === "unresolved"` or an `issue` targets its row | **checked** (amber) | yes |
| New | otherwise | **checked** | yes |

"Select all new" checks all New + Warning rows and unchecks Duplicate/Ignored. Per-row warning messages come from `issues` (mapped by `rowIndex`), shown as muted inline text / title.

### Multiple files

Each dropped file is parsed with `parseRobinhoodInput(fileText, [...existing, ...accumulatedRows])` and the results merged (rows, issues, duplicateIds), so duplicates are detected across files and against existing data.

### Data flow / contract

`ImportTab` keeps its existing prop contract: `existing: TradeTransaction[]` and `onSave(rows)`. "Import N selected" calls `onSave(selectedRows)`; the page already wires `onSave` to `replaceTransactions([...storedTransactions, ...rows])` (append). No change to the parser, store, or API.

### Structure

Rewrite `ImportTab.tsx` into focused pieces in the same file (or co-located): `Dropzone`, `SummaryChips`, `ReviewTable` (with `ReviewRow`). The old `TradesPreview` / `ImportIssues` / KPI-tile layout and `IconButton` are removed.

## Out of scope / dependency

Persistence runs through `PUT /api/store`, which the user reported failing ("unable to store"). That is an **auth/session** issue separate from this redesign — this work covers the import UX up to calling `onSave`. If the save endpoint is still broken, the final import won't persist; that's tracked separately.

## Testing

- `tsc --noEmit`, `eslint` clean; dev-server smoke test of `/import` (200, no overlay).
- Manual: drop a CSV → auto-parses → chips + table render; toggling rows updates the selected count; duplicates/ignored excluded by default; "Import N selected" calls `onSave` with exactly the checked rows.

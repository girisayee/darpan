# Generic broker-agnostic CSV import — design

**Date:** 2026-06-27
**Status:** Approved — building.
**Approach:** auto-detect columns/broker from headers + a user-confirmable mapping step.

## Problem

The import parser (`lib/import/robinhood.ts`) is Robinhood-tuned: Robinhood action codes (STO/BTC/OASGN…), the Robinhood disclaimer footer, and `accountName = "Robinhood"`. It already does header-synonym column detection and returns a `columnMap`, but unknown brokers fall through silently.

## Goals

- Import CSVs from any brokerage: best-effort auto-detect which column is which, and let the user **confirm/correct the mapping** before saving.
- "Understand the CSV": detect the column→field mapping, a best-effort broker hint, and normalize action/instrument values across brokers.
- Keep everything from the redesigned import (drag/drop, auto-parse, summary chips, selectable rows, duplicate/warning flags, account picker).

## Design

### Parser (generalized, same file)

- **`parseTransactionsCsv(raw, opts)`** where `opts = { existing?, accountName?, columnMap? }`. `parseRobinhoodInput` becomes a thin wrapper (keeps the `/api/import/robinhood` route + `scripts/append-robinhood-csv.ts` working).
- **Column detection**: expand `columnCandidates` with broad cross-broker synonyms (Robinhood, Fidelity, Schwab, E*TRADE, Vanguard, IBKR). An explicit `opts.columnMap` (from the UI) overrides auto-detection per field.
- **Value normalization (broker-agnostic)**: action synonyms — `buy/bought/purchase/reinvest`→BUY, `sell/sold`→SELL, `sell to open`/STO→SELL_TO_OPEN, `buy to close`/BTC→BUY_TO_CLOSE, `buy to open`/BTO, `sell to close`/STC, assignment/expiration/dividend/fee/transfer; keep the existing option strike/expiration/type inference from columns **or** the description.
- **Preamble/footer stripping** generalized: drop leading non-CSV preamble lines and known disclaimer footers, not just Robinhood's.
- **`ImportPreview` gains**: `sourceColumns: string[]` (the file's actual headers, for the mapping dropdowns) and `detectedBroker?: string` (best-effort hint). `columnMap` (target→source) already returned.

### Import UI (`ImportTab`)

- After a file loads and auto-parses, render a **"Detected columns"** panel above the review: one row per target field (Date, Symbol, Action, Qty, Price, Amount, Fees, Option type, Strike, Expiration, Description), each a `<select>` of `sourceColumns` + "— none —", pre-filled from `columnMap`. Required fields (Date, Action, Quantity, Amount, and Symbol-or-Description) are marked; if any is unmapped, show a warning.
- Changing a dropdown updates a local override map and **re-parses** (all loaded files use the same override — assumes one broker per import batch).
- A "Looks like: <broker>" hint when detected. Summary chips, selectable table, and the account dropdown (Slice 3) follow unchanged.

### Components / units

- `lib/import/robinhood.ts`: `parseTransactionsCsv`, `detectColumns`, generalized normalizers; `parseRobinhoodInput` wrapper.
- `ImportTab`: a `ColumnMapping` sub-panel; thread `columnMap` override through `buildParsed` → `parseTransactionsCsv`.

## Out of scope (YAGNI, easy follow-ups)

- Remembering a saved mapping per broker/header-signature.
- Non-CSV formats (XLSX, OFX/QFX).

## Testing

- Detection across sample headers from several brokers (Robinhood, Fidelity, Schwab).
- Action-synonym normalization (bought/sold/STO/BTC/…).
- Parsing with an explicit `columnMap` override (UI correction wins).
- Required-field-unmapped → warning surfaced.
- Existing Robinhood fixtures still pass via the wrapper.

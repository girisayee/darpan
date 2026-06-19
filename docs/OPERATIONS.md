# Operations

## Common Commands

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Run all checks before completing meaningful changes.

## Local Dev Server

The app usually runs at:

```text
http://localhost:3000/
```

If the port is occupied, use another port:

```bash
npm run dev -- --port 3001
```

## Browser Verification

After frontend changes, verify the relevant screen in the in-app browser.

Useful checks:

- no console errors from the app
- nav labels match intended surfaces
- top actions still open utility views
- goal values and chart labels update from settings
- tooltip hover/focus behavior works
- tables do not overlap or clip important text

## Data Files

SQLite and imported CSV/backups can contain private financial data.

Do not commit:

- `data/*.sqlite`
- downloaded Robinhood CSVs
- generated personal backups

Use synthetic data in tests.

## Test Strategy

Calculation changes:

- Add or update `tests/calculations.test.ts`.
- Cover same-day ordering, cost basis, assignments, open option cycles, ROI/capital, and manual basis edge cases.

Import changes:

- Add or update `tests/import.test.ts`.
- Cover Robinhood headers, option descriptions, footer stripping, assignment stock-leg ignoring, duplicates, and unresolved rows.

UI-only changes:

- Run lint/typecheck/build.
- Verify in browser when layout, navigation, charts, or interactions change.

## Troubleshooting

If old settings or DB rows seem stale:

- `/api/store` returns the current persisted settings and transactions.
- `DELETE /api/store` clears local transactions and resets settings.
- Settings are merged with `defaultSettings`, so adding a new setting should not break old DBs.

If calculations look off:

- Check raw normalized transactions in the Trades tab.
- Check unresolved imports and duplicate warnings.
- Check tax lots and manual basis overrides.
- Check option lifecycle status and same-day ordering.

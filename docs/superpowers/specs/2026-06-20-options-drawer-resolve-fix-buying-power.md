# Options detail drawer · Review & fix unresolved · Buying-power gauge

Date: 2026-06-20
Branch: `redesign/aurora`

Three user-requested improvements, scoped from a brainstorming pass:

1. The **Options** tab has no detail drawer (every other tab does) — wire it.
2. Let the user **fix and manage unresolved trades** — specifically, *add the missing opening leg* for orphan closes (AMZN/CAN), via a dedicated **Review & fix** panel.
3. Overview shows **two stacked progress bars** (annual-goal + buying-power) which feels heavy — demote buying power to a **compact ring-gauge** so the goal banner is the only dominant bar.

## Context (verified)

- Transactions persist through `saveStore({ transactions })` (`server-store-client`). `DashboardApp` derives `allTransactions = sample + stored` → `baseResult = calculateDashboard(...)` via `useMemo`. **Appending a transaction and saving recalculates everything automatically** — no manual recompute wiring needed.
- The option matcher keys on `symbol|optionType|strike|expiration`. An added opener that inherits those four fields from the orphan close is guaranteed to match and resolve the cycle.
- `OptionLifecycle` and `RealizedPnLEvent` both carry `linkedTransactionIds` → a closed cycle maps to its realized event by intersection.
- `DashboardApp` already holds `selectedEvent`/`setSelectedEvent` and renders `DetailDrawer`. `SwingTradesTab` and `PerformanceTab` receive `onSelectEvent`; **`OptionsTab` does not** (`DashboardApp.tsx:147`).
- Overview's "Resolve →" link calls `onReviewTrades("unresolved")` → `openTrades` which currently just `setActiveTab("Import")` — effectively a dead end (`DashboardApp.tsx:98-100`).

## Feature 1 — Options detail drawer

- Pass `onSelectEvent={setSelectedEvent}` to `<OptionsTab>` in `DashboardApp`.
- In `OptionsTab`, make **closed-cycle rows** clickable (cursor + keyboard-activatable). On activate, resolve the lifecycle → a `RealizedPnLEvent`:
  - Find events whose `linkedTransactionIds` intersect the lifecycle's. Prefer the option-premium event over a `COVERED_CALL_ASSIGNMENT_STOCK` event.
  - If none found, build a synthetic `RealizedPnLEvent` from the lifecycle (symbol, strategy, `realizedPnl = netOptionPnl + (assignmentStockPnl ?? 0)`, `optionPremium = premiumReceived`, `holdingDays`, `capitalDeployed`, `linkedTransactionIds`, `explanation`) so the drawer always opens.
  - Call `onSelectEvent(event)`.
- `ClosedCyclesTable` gains an optional `onRowClick?(lifecycle)` (kept generic; Swing's table is untouched).
- **Out of scope:** open-position rows (no realized P&L) and unresolved rows (route to Feature 2) do not open this drawer.

## Feature 2 — Review & fix: add the missing opening leg

### Panel
- New `components/dashboard/ReviewFixPanel.tsx` — a right-side drawer (reuse the `DetailDrawer` scrim/animation/focus-trap pattern; extract shared chrome if cheap, otherwise mirror it) titled **"Review & fix data issues"**.
- Props: `{ open, onClose, result, onAddTransaction(tx) }`.
- Body lists the **orphan option closes** — the same set surfaced in `OptionsTab`'s "Unresolved closes" (DATA_ISSUE realized events whose source tx is an option close action). For each: symbol, action label, option type · strike · expiration, close date, qty (or "—").
- Each row has an **"Add opening trade"** disclosure that expands an inline form.

### Add-opening-leg form
- **Read-only, inherited from the close (guarantees matcher key):** underlying symbol, call/put, strike, expiration.
- **Inferred + editable** opener action:
  - close `SELL_TO_CLOSE` → opener `BUY_TO_OPEN` (long)
  - close `BUY_TO_CLOSE` → opener `SELL_TO_OPEN` (short)
  - close `EXPIRATION`/`ASSIGNMENT` → opener `SELL_TO_OPEN` (short; typical wheel)
- **User inputs:** open date (date, required, must be ≤ close date), premium/price **per contract** (number, required, ≥0), # contracts (number, required, ≥1; prefilled from close qty when > 0), fees (number, optional, default 0).
- **Validation:** inline errors; submit disabled until valid.
- **On submit**, build a `TradeTransaction`:
  - `id`: `manual-<crypto.randomUUID()>`
  - `sourceBroker`: inherit from the close's tx (fallback "Robinhood")
  - `accountName`: inherit from the close's tx (fallback first account / "")
  - `tradeDate` = open date; `symbol`, `underlyingSymbol`, `optionType`, `strikePrice`, `expirationDate` from the close; `instrumentType: "option"`
  - `action` = inferred opener; `quantity` = contracts; `price` = per-contract premium
  - `grossAmount` = price × contracts × 100 × (sign: credit for SELL_TO_OPEN, debit for BUY_TO_OPEN); `fees`; `netAmount` = grossAmount − fees (credit) / − (debit) — match the sign convention used by the importer for option opens (verify against `lib/import/robinhood.ts`).
  - `rawDescription`: `"Manually added opening leg for <symbol> <type> $<strike> <exp>"`
  - `importBatchId: "manual"`, `tags: ["manual"]`, `status: "normalized"`
  - call `onAddTransaction(tx)` → `DashboardApp` appends to stored transactions and `saveStore`.
- After save: the engine re-runs; the cycle leaves "unresolved" and appears in **Closed**. The panel reflects the now-shorter unresolved list (it reads from live `result`). Show a brief success affirmation on the resolved row.

### Wiring
- `DashboardApp`: replace `openTrades` dead-end with state `reviewFixOpen`; `onReviewTrades` opens the panel. Add `onAddTransaction` = append + `saveStore`. Render `<ReviewFixPanel/>`.
- `OptionsTab` "Unresolved closes" section header gets a **"Fix →"** button that opens the same panel (passed down as an `onReviewFix` callback). Single panel, two entry points (Overview + Options) — consistent with "dedicated panel."

### Manual badge
- Any transaction with `tags.includes("manual")` (or `importBatchId === "manual"`) is "manual."
- A closed cycle whose `linkedTransactionIds` include a manual tx shows a small **"manual"** pill in `ClosedCyclesTable` and in the `DetailDrawer` header. Compute a `Set<manualTxId>` from `result.transactions` and thread it where needed.

### Out of scope (this pass)
- Editing/reclassifying existing rows; deleting/dismissing rows; duplicate management. (User selected add-opener only.)

## Feature 3 — Buying-power ring gauge

- New `components/dashboard/BuyingPowerGauge.tsx` — a compact card: a small **SVG ring** (~56px, ~6px stroke) filled to utilization %, with the **integer %** centered, beside a label "Buying power" and helper `formatCurrency(deployed) / formatCurrency(maxBP) used · healthy 40–80%`.
- Band color (reuse existing thresholds from `OverviewTab`): `< 40` warn, `40–80` pos, `≥ 80` neg; ring track `bg-background`. Null/zero maxBP → ring muted + value "—".
- `OverviewTab`: **remove** the full-width buying-power bar block (lines ~223–248) and render `<BuyingPowerGauge>` immediately **after the hero KPI row** (before "By strategy"). Keep the `maxBP`/`currentDeployed`/`util` computation; move it into the gauge or pass as props.
- Accessibility: `role="img"` + `aria-label` describing "Buying power N% used, $X of $Y".

## Testing

- Pure helpers get unit tests (Vitest):
  - `lifecycleToEvent(lifecycle, events)` bridge: real-event match preferred; synthetic fallback shape correct.
  - `inferOpenerAction(closeAction)` mapping.
  - `buildManualOpenTransaction(input)` — correct fields, sign conventions, key fields inherited (so a round-trip through `calculateDashboard` with a fixture orphan close + the built opener produces a **closed** lifecycle with expected `netOptionPnl`). This is the high-value test: prove an orphan close + added opener resolves.
- Existing suites stay green. Gates: `npm test`, `npm run typecheck`, `npm run lint` (only the pre-existing `_issueFilter` warning), `npx next build`.

## Non-goals / known limitations

- Browser visual QA is environment-blocked here; verify via SSR/build + review, flag for the user's eyes.
- The `_issueFilter` lint warning is pre-existing; `onReviewTrades` rewire will likely clear it (the param becomes used) — fix opportunistically.

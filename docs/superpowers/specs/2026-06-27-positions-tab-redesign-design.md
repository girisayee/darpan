# Positions tab redesign — design

**Date:** 2026-06-27
**Status:** Approved for planning
**Component:** `components/dashboard/tabs/PositionsTab.tsx`

## Problem

The current Positions tab opens on a combined "All positions" view fronted by a 4-tile `StrategyStrip` (CSP / CC / Long / Swing). Two issues:

1. **Options and swing trades aren't clearly separated** — they share one combined table, and swing is reached only by clicking its tile.
2. **It's not obvious what you're looking at on landing** — the page leads with a strip of tiles rather than the positions themselves, and the options-vs-swing split isn't apparent.

## Goals

- Cleanly separate **options** from **swing trades**.
- Make both categories — and their state — **obvious the moment the page loads**, without a click.
- **Scale to long lists**: only one category's table renders at a time (avoids an unwieldy stacked-list page).

## Non-goals

- No change to the calculation engine, the detail drawers, the `DataTable` component, or the per-strategy column definitions.
- No change to how transactions are imported or stored.

## Layout (top to bottom)

### 1. Two category tab-cards (side by side)

Replaces `StrategyStrip`. Two cards: **Options** and **Swing trades**. Each card is a clickable tab and shows:

- **Headline count** — number of *active/open* positions in that category (e.g. "12 active", "5 open").
- **Realized P&L** — total realized P&L for the category, colored green/red (same number `StrategyStrip` shows today via `strategyAnalytics(...).pnl`).
- **One-line sub-text** — category composition:
  - Options: `{n} CSP · {n} CC · {n} long` (active counts per sub-strategy, summing to the headline count).
  - Swing: `{totalTrades} trades · {winRate}% win` (from `tradeQuality`).

The **active** card carries a 2px accent border (`border-accent`); the inactive card uses the standard hairline border. Default active tab on load: **Options**.

This is what satisfies "obvious on landing": both categories' counts and P&L are visible before any interaction, and the active border shows which list is below.

> **Mixed semantics note (intentional):** headline count reflects *open* positions while P&L reflects *realized* (closed) results — this mirrors the existing `StrategyStrip` convention and the app's mental model. Kept for consistency.

### 2. Sub-filters for the active tab

- **Options tab:** a chip row `All · CSP · CC · Long` (default **All**), plus the existing `All / Active / Closed` state `SegmentedControl`.
- **Swing tab:** just the `All / Active / Closed` state control (no chip row).

### 3. Full metrics row (kept — per user choice)

Renders `StrategyMetrics` for the active tab + active chip:

- **Options / All** → new aggregate options metrics (see "New selector" below): Realized P&L, Win rate, Expectancy, Premium collected, Capital at risk, Trades.
- **Options / CSP | CC | Long** → existing `strategyAnalytics(result, key)` metrics (unchanged, includes capture rate + assignment rate for CSP/CC).
- **Swing** → existing `strategyAnalytics(result, "swing")` metrics (profit factor, avg win/loss, trades).

Capture rate and assignment rates are strategy-specific, so they appear only when a specific CSP/CC chip is selected — not in the aggregate "All options" view. This avoids blending per-strategy ratios into a meaningless average.

### 4. Positions table

A single `DataTable`, searchable, paginated, row-click opens the existing detail drawer (`onSelectLifecycle` for option rows, `onSelectEvent` for swing rows). Data wiring:

| Active tab / chip | Rows | Columns | Metrics |
|---|---|---|---|
| Options / All | `toAllPositionRows(result, state)` | `allColumns` (incl. Strategy column) | `optionsAnalytics(result)` |
| Options / CSP\|CC\|Long | `toPositionRows(result, key, state)` | `columnsFor(key)` | `strategyAnalytics(result, key)` |
| Swing | `toPositionRows(result, "swing", state, settings.showSwingOpenPositions)` | `columnsFor("swing")` | `strategyAnalytics(result, "swing")` |

## New code

### Selector: `optionsAnalytics(result)`

In `lib/selectors/strategy-analytics.ts`. Aggregates across CSP + CC + Long:

```ts
export interface OptionsAggregateAnalytics {
  key: "options";
  quality: TradeQuality;       // tradeQuality over csp+cc+long realized events
  premium: PremiumStats | null; // premiumStats over short (csp+cc) lifecycles
  pnl: number;                  // sum of csp+cc+long realized P&L
  capitalAtRisk: number;        // sum capitalDeployed across all OPEN option lifecycles
}

export function optionsAnalytics(result: CalculationResult): OptionsAggregateAnalytics;
```

- `events` = `realizedEvents` whose `strategy` is in `csp ∪ cc ∪ long` enums (reuse `STRATEGY_EVENT_ENUMS`).
- `premium` = `premiumStats` over short option lifecycles (CSP + CC strategies).
- `capitalAtRisk` = sum `capitalDeployed` over all open option lifecycles (any strategy/direction).

### `StrategyMetrics` aggregate mode

Extend its prop type to `StrategyAnalytics | OptionsAggregateAnalytics`. When `a.key === "options"`, render the aggregate cell set: Realized P&L, Win rate, Expectancy, Premium collected, Capital at risk, Trades. All other keys render exactly as today.

## Reused as-is

`StrategyMetrics` (existing branches), `DataTable`, `SegmentedControl`, `columnsFor`, `toPositionRows`, `toAllPositionRows`, `allColumns`, both detail drawers, `tradeQuality`, `premiumStats`.

## Removed

- `StrategyStrip` usage in `PositionsTab` (the component file may remain if referenced elsewhere — verify; if unused after this change, delete it).
- The `← All strategies` back-navigation button (no longer a drill-in/drill-out model — the two tabs are always present).

## Behavior details

### Deep-link (`initialStrategy` prop)

Preserve the existing prop contract so no caller changes are needed:

- `csp` / `cc` / `long` → Options tab active, that chip selected.
- `swing` → Swing tab active.
- `undefined` → Options tab active, All chip selected (default).

### Open swing positions

On the Positions/Swing tab, open swing lots appear **only when `settings.showSwingOpenPositions` is enabled** (call `toPositionRows(..., "swing", state, settings.showSwingOpenPositions)`). The swing card's "open" count is gated on the same flag so it stays consistent with the table: when the setting is off, the card reads "0 open" and the Active list is empty (only realized/closed swing trades show).

> An earlier draft always showed open lots regardless of the setting; this was reverted so the Positions tab respects the global `showSwingOpenPositions` preference like the rest of the app.

## Testing

- **Selector unit test:** `optionsAnalytics` aggregates P&L, trade count, premium, and capital-at-risk correctly across a fixture with CSP + CC + Long + Swing events (swing excluded from the aggregate).
- **Render checks (manual via preview):**
  - Landing shows both tab-cards with correct counts/P&L; Options active by default.
  - Switching to Swing renders swing metrics + swing table; open lots show only when `showSwingOpenPositions` is on, and the card's "open" count matches.
  - Options chips filter both the metrics row and the table; "All" shows the Strategy column.
  - State control (All/Active/Closed) filters rows within the active tab.
  - Deep-links from other tabs land on the right tab + chip.
  - Empty states render sensible copy per tab/filter.

# Return-on-Capital Consistency — Design

**Date:** 2026-06-27
**Status:** Approved (executing unattended)

## Problem

"Return on capital" is computed six different ways across the app, so the same
concept shows different numbers in different sections (most visibly Home's
"% on capital" vs Performance's "Your return"). The Darpan investor — a
capital-efficiency-minded options/wheel + swing trader — needs one trustworthy
RoC.

Current denominators in use:
1. Per closed trade — the trade's own deployed capital.
2. Monthly ROI table — time-weighted (capital-days ÷ days in month).
3. Home `ytdRoi` — time-weighted over the whole elapsed year (capital-days ÷ calendar days since Jan 1).
4. Performance "Your return" — mean of each month's average deployment.
5. Performance "Return on capital" KPI — capital-weighted mean of per-trade **annualized** ROI.
6. Tickers "Return on capital" — symbol P&L ÷ **peak** concurrent capital.

## Decisions (locked)

- **Canonical denominator:** time-weighted average deployed capital = deployed
  **dollar-days ÷ days in the window**. (`A` chosen.)
- **Tickers:** standard RoC column **plus** a separate, explicitly-labeled
  "Peak-capital ROI" column (today's `peakConcurrentCapital`). (`B` chosen.)
- **Annualization:** period RoC is the headline everywhere; annualized appears
  only as an explicitly-labeled secondary, computed one way: `RoC × (365 ÷ days
  in window)`. (`A` chosen.)

## Canonical metric

**Building block — deployed dollar-days** over a window `[start, end]` (inclusive
ISO dates), optionally filtered (by symbol/strategy):

```
dollarDays(usage, start, end) = Σ over rows  amount × overlapDays(row.[start,end], [start,end])
```

This is algebraically identical to summing point-in-time deployed capital over
each day in the window (just summed row-first), so it matches the engine's
existing per-month `capitalDays`.

```
avgDeployed     = dollarDays ÷ daysInclusive(start, end)
returnOnCapital = avgDeployed > 0 ? (P&L ÷ avgDeployed) × 100 : null
annualizedRoC   = returnOnCapital × (365 ÷ daysInclusive(start, end))
```

Same formula at every scope; only the window and the filter change.

## Windows

- **Portfolio / period (Home, Performance, monthly):** computed from
  `result.monthlyReturns` as `Σ capitalDays ÷ Σ periodDays`, where `periodDays`
  is each month's counted day span (asOf-adjusted for the current month). This
  is the monthly table's own basis, so portfolio and monthly RoC stay mutually
  consistent, and Home and Performance read the **same** field.
- **Per symbol (Tickers):** the symbol's active span — first deployment →
  min(asOf, last close) — scoped to that symbol's `capitalUsage` rows.

## Components / data flow

New pure selector `lib/selectors/return-on-capital.ts`:
- `dollarDays(usage, start, end)`, `daysInclusive(start, end)`
- `portfolioReturnOnCapital(monthly) → { pnl, avgDeployed, periodDays, roc, annualizedRoc }`
- `symbolReturnOnCapital(usage, symbol, pnl, asOf) → { roc, avgDeployed, ... }`

Engine (`lib/calculations/engine.ts`):
- Add `periodDays` to each `MonthlyCapitalReturn` (the day count
  `capitalForMonth` already derives).
- `aggregates.averageDeployedCapital` → time-weighted (`Σ capitalDays ÷ Σ periodDays`).
- Add `aggregates.returnOnCapital` and `aggregates.annualizedReturnOnCapital`
  via the shared selector.
- Remove `ytdRoi` / `averageYtdDeployedCapital` (superseded).

`lib/selectors/capital-efficiency.ts`:
- `annualizedRoc` → derive from the canonical period RoC (× 365 ÷ periodDays),
  not the capital-weighted per-event mean.
- `capitalTurnover` denominator → the time-weighted `averageDeployedCapital`.

Surfaces:
- **HomeTab** "% on capital" → `aggregates.returnOnCapital`.
- **PerformanceTab** "Your return" → `aggregates.returnOnCapital` (identical to Home);
  "Return on capital" KPI → `returnOnCapital` with `annualizedReturnOnCapital` as a labeled secondary;
  "Avg deployed" → time-weighted `averageDeployedCapital`.
- **TickersTab** "Return on capital" → `symbolReturnOnCapital`; add separate
  "Peak-capital ROI" column (existing `peakCapitalRoi`).
- **Monthly ROI table** (`shared.tsx`) → `realizedRoiPercent` (already canonical);
  drop the `closedTradeRoiPercent` column tied to the retired setting.

Retire the **`monthlyRoiDenominator`** setting (`AppSettings`, `defaultSettings`,
the Settings control, `closedTradeRoiPercent`): pure variation-generator.
`settings.annualizedReturn` stays (toggles whether labeled annualized figures show).

## Testing

- Unit tests for `dollarDays` / `daysInclusive` / `portfolioReturnOnCapital` /
  `symbolReturnOnCapital` (including overlap and asOf edges).
- **Consistency test:** on one dataset, Home-period RoC == Performance "Your return"
  == `aggregates.returnOnCapital`; and `annualizedReturnOnCapital == roc × 365/periodDays`.
- Keep existing engine/selector suites green; update those asserting removed fields.
```
# Superseded

This historical design used time-weighted average deployed capital as the RoC denominator.
The current product definition is Realized RoC: realized P&L divided by peak concurrent
capital behind positions realized in the period. Inferred open positions remain exposure
only. It is not a standard portfolio return; see `AGENTS.md` and
`lib/selectors/return-on-capital.ts`.

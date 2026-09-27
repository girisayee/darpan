# Home and Performance redesign — implementation handoff

Status: selected design direction, 27 September 2026. This document is for the next implementation agent. The user selected the editorial Home and a focused Performance page that **opens on Trades**. Daily view is secondary and has **no bar chart below the calendar**. Performance shows an Options vs Stocks return breakdown above the trade list.

## Reference mockups

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Home | [home-desktop.png](home-desktop.png) | [home-mobile.png](home-mobile.png) |
| Performance — **default Trades** | [performance-trades-desktop.png](performance-trades-desktop.png) | [performance-trades-mobile.png](performance-trades-mobile.png) |
| Performance — Daily view | [performance-daily-desktop.png](performance-daily-desktop.png) | [performance-daily-mobile.png](performance-daily-mobile.png) |

The images are layout and hierarchy references, **not data fixtures**. All shown amounts, symbols and dates are synthetic. Some example numbers differ between the Home and Performance images. The implementation must derive every displayed value from the signed-in user's filtered `CalculationResult`. Desktop images were made before Taxes was added to the main navigation: **keep the current five-tab shell, including Taxes**. Match the Aurora token system in both dark and light themes rather than copying pixels or hardcoded colors.

## Product decision

- **Home answers “How am I doing in the selected year?”** Show realized P&L and realized RoC prominently, cumulative realized P&L against goal pace, annual goal progress, quality metrics, strategy/instrument contribution and directional benchmark context. Make the P&L chart the dominant visual.
- **Performance answers “What happened in this month?”** Open the latest month with realized closes in the selected year, with `Trades` selected by default. Show a compact month navigator, month P&L/RoC/trade count, Options vs Stocks realized returns, and the month trade ledger.
- **Daily view** is the sibling state of that same month. Show one seven-column calendar and a selected-day detail panel. There is no additional daily bar chart or full trade ledger on this state.
- Keep open-position exposure and buying power out of the Home performance hierarchy. Open positions already have the Positions tab. Relocate the existing buying-power gauge to Positions so the feature is not lost.
- Retain Tickers, Positions, Taxes, Import, Settings, account selection, year selection, amount masking and the existing detail drawer.

## Screen specification

### Home

1. **Header and period.** Use the current app shell. For the current selected year label the view “Year-to-date performance”; for a past year use “{year} performance” and avoid “YTD”. Global account/year filters still govern all figures.
2. **Hero.** Two unequal blocks: realized net P&L and realized RoC. The RoC tooltip must say realized P&L divided by peak concurrent capital behind positions realized in the period. Open exposure is excluded. When RoC has no valid denominator, display an em dash and explanation.
3. **Cumulative realized P&L.** A daily or close-date **step line**, with a visible zero baseline and month-abbreviation ticks. Its label must be “Cumulative realized P&L”, never “Equity curve”; no mark-to-market values exist. Actual data stops at the last observed close. If `trackAgainstGoal` is enabled and the annual goal is positive, add a quiet dashed elapsed-year goal-pace line. Its September value is the September pace, not the full December goal. Tooltip shows date, actual cumulative P&L and goal pace. If goal tracking is off, retain the actual chart and remove only the goal line and goal card.
4. **Goal.** Progress to the configured annual realized P&L goal, with actual/goal values and clear percent. Render only when the existing setting enables it. Do not imply that the goal is a market return.
5. **Quality row.** Expectancy, profit factor and win rate, using existing `tradeQuality` semantics and the correct 0–1-to-percent conversion for its win rate. Label the unit accurately: current `tradeQuality` works on realized events, while the Performance ledger groups some legs into one trade. Do not silently claim that event-based quality is per grouped trade. If the team elects to unify the definition, implement and test a grouped-trade selector deliberately.
6. **Contribution and context.** Keep a compact realized contribution panel and the adjusted SPY/QQQ/VTI comparison. The comparison is directional; its percentage methodology differs from Darpan RoC. If strategy contribution is included below the first viewport, use existing strategy data and group assignment presentation carefully. Do not duplicate a second large monthly view on Home.
7. **Omitted from Home.** Daily heatmap, open-position list and buying-power gauge. Keep access to active positions through the Positions tab.

### Performance: default Trades

1. **Month selector.** Show the 12 months of the selected year as a low-profile horizontal strip, with signed P&L and a tiny zero-baseline bar. Current/future months without data are subdued; future months are disabled. Selected month has a clear non-color-only state. On mobile this strip scrolls horizontally with the selected month brought into view; do not shrink all 12 months into one row.
2. **Default selection.** On initial navigation, select the latest month containing a realized close under the global year/account filters. If the selected year has no closes, choose the current month for the current year or January for a past year and show the empty state. Changing global year invalidates an out-of-year month. Changing accounts retains the selected month and shows its empty state if needed. Do not jump the user to a different month unexpectedly.
3. **Month header.** Full month/year, previous/next navigation, realized P&L, realized RoC and grouped closed-trade count. Read month P&L/RoC from `monthlyReturns`; use `monthlyTrades` for the grouped count. RoC uses the app's capped peak-concurrent realized-capital denominator. Show `—` with a tooltip when unavailable.
4. **Subview switch.** `Trades` is the first, default selection; `Daily view` is secondary. Preserve the selected month when switching. Persist `month` and `view` in the URL while preserving existing `year` and `accounts` parameters, so Back/Forward and links reproduce the state. `view=trades` may be omitted from the URL as the default. Search text and sort can remain local state; retain them while a trade drawer opens.
5. **Options vs Stocks.** Put two balanced, informational comparison cards immediately above the ledger. Each shows category realized P&L and category realized RoC. Use signed values and a small zero-baseline comparison bar; avoid pie charts because losses and gains can coexist. The two **P&L** amounts must sum to the month P&L. Category **RoCs do not add** and need an info tooltip explaining each uses peak concurrent realized capital in that category. Do not make these cards filters: a grouped covered-call assignment can contribute option premium and stock-sale P&L while appearing as one ledger trade. Avoid counts on these category cards for the same reason.
6. **Category attribution.** Build a pure selector from `realizedEvents`, not `monthlyReturns.optionsPremiumPnl` alone. Options includes `COVERED_CALL`, `CASH_SECURED_PUT`, `PUT_ASSIGNMENT`, `COVERED_CALL_ASSIGNMENT` and `LONG_OPTION`. Stocks includes `SWING_TRADE` and `COVERED_CALL_ASSIGNMENT_STOCK`. Exclude `DATA_ISSUE`. This preserves the option/stock split of a covered-call assignment and includes long options. Use a category-scoped peak-concurrent capital calculation for each RoC, following existing return-on-capital interval/reuse rules; apply the configured max-buying-power cap consistently. Shared assignment basis may participate in both category denominators, but must not be double-counted in the portfolio/month headline. If a category denominator is unavailable or zero, display `—`, never a fabricated rate.
7. **Trade ledger.** Search symbol/strategy, choose all days or one close date, and sort newest/highest/lowest P&L. Desktop: columns Close date, Symbol, Strategy, Realized P&L, and RoC where accurately available. Mobile: stacked tappable rows with symbol/strategy, P&L, date and optional RoC. Use `monthlyTrades` so both legs of a covered-call assignment remain one row. Never display an option-leg RoC as the RoC of the combined assignment; calculate a valid grouped value or show `—`. Each row opens the existing event/lifecycle `DetailDrawer`. Closing or backing out restores the month, view, search, sort and scroll. No duplicate month cards or large monthly bar chart below the strip.

### Performance: Daily view

1. Same month strip and month header; only the subview body changes.
2. Build a **seven-column calendar** for the selected month, aligned to actual weekdays, with neutral no-trade days, color/contrast for gain/loss magnitude, selected-day outline and a concise legend. The existing `CalendarHeatmap` is a 31-column year strip; create a monthly calendar component or extend it intentionally. On mobile, use date plus color, and let the selected-day panel carry full amounts rather than squeezing dollars into narrow cells.
3. Daily totals derive from `dailyPnl` over the filtered realized events and must sum to the month P&L. The selected-day trade list derives from the **grouped** `monthlyTrades` rows for that date, so an assignment does not appear twice. Selecting a day updates the adjacent desktop panel or the below-calendar mobile panel. Selecting a grouped trade opens the existing drawer.
4. If no day is selected, select the latest realized day in that month; if there are none, show a clear prompt/empty state. When changing months, reset to that month's latest realized day. No bar chart under the calendar, no second full ledger on this state.

## Data and UI integration map

| Area | Existing source | Work |
| --- | --- | --- |
| Global year/account scope and five-tab nav | `components/dashboard/DashboardShell.tsx`, `components/shell/AppShell.tsx`, `BottomNav.tsx` | Preserve current filter and nav behavior; add URL-backed Performance month/view state without dropping query parameters. |
| Home | `components/dashboard/tabs/HomeTab.tsx` | Recompose hierarchy; move annual goal, cumulative chart and `BenchmarkComparison` here; remove calendar/open-positions/exposure blocks. |
| Performance | `components/dashboard/tabs/PerformanceTab.tsx`, `app/(app)/performance/page.tsx` | Replace goal/chart + monthly chart/cards with month strip, default Trades state, category breakdown and Daily state. Pass event/lifecycle drawer callbacks from `useDashboard`. |
| Monthly trade grouping | `lib/selectors/monthly-trades.ts` | Reuse grouped lifecycle rows; add typed per-month/day view models as needed. |
| Category returns | `lib/selectors/return-on-capital.ts`, `types/trading.ts` | Add a pure month instrument-attribution selector and tests; avoid changes to engine math unless tests prove necessary. |
| Daily P&L | `lib/selectors/daily-pnl.ts`, `components/dashboard/CalendarHeatmap.tsx` | Reuse daily total selector; add responsive seven-column month calendar and grouped day list. |
| Detail drawer | `components/dashboard/DetailDrawer.tsx`, `MonthDetailBody.tsx` | Keep trade details and focus/back behavior. The new month page is inline; retire the month drawer entry point only after trade detail works. |
| Goal/benchmark/quality | `lib/selectors/goal-pace.ts`, `components/dashboard/BenchmarkComparison.tsx`, `lib/selectors/trade-quality.ts` | Reuse calculations; verify labels and conditional display. |
| Buying power | `components/dashboard/BuyingPowerGauge.tsx`, `PositionsTab.tsx` | Move the existing gauge to Positions so the Home redesign does not remove it. |
| Docs | `docs/FEATURES.md`, `docs/ARCHITECTURE.md` | Update screen descriptions and remove stale Home/Performance claims. `FEATURES.md` also contains older persistence/product-boundary text; avoid spreading it. |

The repo currently contains unrelated in-progress changes, including Taxes and account work. Preserve them. Do not replace whole shell or domain files to implement this design.

## Implementation sequence

1. Add pure selectors/view models for monthly category P&L/RoC, month slots, and grouped day lists. Unit-test those before UI wiring.
2. Build reusable month strip, instrument comparison and month calendar primitives using Aurora tokens, signed formatting helpers and tabular numerals.
3. Recompose Home. Extract/move the cumulative P&L chart and benchmark instead of cloning calculations. Keep actual cumulative chart when goal tracking is off. Move buying-power gauge to Positions.
4. Recompose Performance around URL-backed month/view state. Default to Trades; wire search/date/sort, selected day and existing detail drawer. Remove the redundant monthly cards/chart and old month drawer launch path only after the replacement is functional.
5. Implement responsive layouts and light theme. Preserve the current five-item mobile bottom navigation and safe-area padding.
6. Update docs, run checks, and inspect the running app at desktop and phone widths with synthetic/sample data plus an empty account/year. Do not capture or commit personal account values.

## Acceptance checks

- Performance opens on **Trades**. Refresh and browser Back/Forward preserve month and view. Global year/account changes maintain correct scoping and do not drop other URL parameters.
- For each month, Options P&L + Stocks P&L equals monthly realized P&L, including long options and covered-call assignments. Test a positive month, a negative month, a mixed-sign month, a zero month and an assignment split.
- Category and monthly RoC use peak concurrent realized capital with sequential reuse, overlapping positions, cap and unavailable-denominator behavior; category rates are not presented as additive. No extra risk ratios are introduced.
- Trade count uses grouped closed trades. A covered-call assignment is one ledger row and one selected-day row; its option and stock P&L components still appear in the appropriate attribution totals.
- Daily totals sum to monthly realized P&L. Calendar weekday placement and month boundaries are correct, including February/leap year. Selected day and ledger date filter refer to the same closes.
- Home actual cumulative realized P&L ends at the displayed Home P&L. Goal pace is elapsed-year progress, and hiding goal tracking removes only the goal overlay/card. “Equity curve” is not shown.
- Amount masking covers hero values, chart axes/tooltips, month strip, category cards, calendar/day panel and ledger. Light and dark themes use tokens and maintain contrast.
- Keyboard and screen-reader path: month buttons, subview tabs, dates, ledger rows and drawer are operable with visible focus, accessible names and focus return. Color is never the sole carrier of sign/selection. Tap targets are at least 44px. Mobile has no horizontal page overflow or bottom-nav overlap.
- Empty data, no trades in a month, missing basis, unavailable benchmark, goal disabled and no realized capital have clear states with no fake zero rate.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; visually verify the running app at desktop and mobile widths. Add selector tests for new accounting behavior; UI has no jsdom setup.

## Copyable brief for the implementation agent

> Implement the selected Home and Performance redesign in `docs/design/home-performance-redesign/HANDOFF.md` using the six PNG mockups beside it. Preserve current five-tab navigation, auth/data privacy and unrelated working-tree edits. Performance defaults to Trades and shows Options vs Stocks realized P&L/RoC above the month ledger; Daily view has one calendar and selected-day detail, without a second bar chart. Use typed selectors and the existing realized-capital definition, reconcile option/stock attribution including assignment legs, keep grouped trades in the ledger, and run the documented verification checks.

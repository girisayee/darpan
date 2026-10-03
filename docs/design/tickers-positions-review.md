# Tickers and Positions — design review

> **Implementation update (2 October 2026):** The selected third Tickers concept is now
> the live Highlights view, showing five Biggest wins and five Biggest losses with a
> page-level search and an All symbols directory. Positions
> search spans options and stocks. Stock trades shows lots still open that were opened
> in the selected year, plus trades closed that year. The September review below is
> retained as design history; [current features](../FEATURES.md) and
> [design QA](../../design-qa.md) describe the implemented behavior.

Reviewed the signed-in local Darpan app on 27 September 2026 at desktop and 390 px phone widths. These are design recommendations and a static prototype, not production changes. The [interactive mockups](../../public/design/tickers-positions-mockups.html) show Tickers and Positions at desktop and phone widths, including the Stock trades state. All prototype values and symbols are synthetic.

## Verdict

Both screens need a hierarchy change. The visual system is credible and the underlying tables and detail drawers are useful. The pages make the user work too hard to reach those tables. Tickers puts ten noninteractive leaderboard entries before the same symbols in the table. Positions puts an exposure gauge, two large category cards, multiple filters, and six or seven metric cards before the open book.

I would keep the **Tickers** and **Positions** navigation names. They are concise and distinct from Home's year performance and Monthly's trade review. I would remove the leaderboard panels, shrink the Positions summary, and separate open exposure from realized history within the default All view.

## Evidence from the running app

| Screen | Observed | Consequence | Priority |
| --- | --- | --- | --- |
| Tickers | Five Money Makers and five Account Killers appear above the full symbol table. The ten entries repeat table data and do not open symbol detail. | Primary search, sort, and symbol detail start below the first phone viewport. The prominent entries look tappable but are inert. | High |
| Tickers, phone | The desktop table extends beyond the 390 px viewport; Trades and Win rate sit to the right of the visible area. | Scanning a symbol requires horizontal navigation, and the table has no visible affordance for it. | High |
| Positions | Category cards mix an **active/open count** with **realized P&L** in the same tile. The full realized metrics grid appears above the position list. | The visible timeframes are easy to conflate, and the actual book starts low on the page. | High |
| Positions, All | Open options share a generic **P&L** column with closed trades. The open lifecycle row uses net option cashflow, while closed rows use realized results. | An open premium amount can read like a realized gain. | High |
| Positions, Active | The table retains a **Closed** column even though every value is empty. Historical realized metrics remain visible above the active rows. | Valuable horizontal space is wasted and the metric scope looks tied to the active filter. | Medium |
| Positions, Stock trades | With open stock holdings disabled, **Active** produces an empty table below historical metrics. | The state implies there are no holdings, when the app has simply not opted into displaying open stock lots. | Medium |
| Positions, phone | The gauge, category cards, filters, and metric tiles occupy most of the first screen. | Only a sliver of the table is visible before scrolling. | High |

The current symbol row and trade detail drawer are worth retaining. Table sorting, search, signed values, RoC tooltips, and row-to-drawer navigation are sound foundations. This review does not recommend adding another chart. Ranking and inspection are the jobs here; a large chart would push the evidence further down.

## Recommended Tickers screen

1. Put the heading, selected year, and **All symbols / Winners / Losers** control above the list. Winners and Losers mean positive and negative *realized* net P&L; zero belongs only in All.
2. Lead with one searchable, sortable table. Retain Symbol, realized P&L, realized RoC, closed event count, and win rate. Keep P&L as the default sort. The source remains `aggregates.symbolBreakdown`; do not create a second leaderboard data path.
3. Make the entire symbol row open the existing symbol drawer. On phone, render each row as a two-line list item: symbol and closed trade/win context at left, P&L and RoC at right. Keep all useful data visible without horizontal scroll.
4. Preserve the existing RoC definition and unavailable-value treatment. The optional header count must describe the same filtered result as the table.
5. Remove the separate Money Makers and Account Killers panels. A filtered list provides the same discovery without duplicating ten rows.

## Recommended Positions screen

1. Keep **Options** and **Stock trades** as the top category switch, but use a compact segmented control. Keep `All` as the default state. In All, show **Open options** first and **Closed options** second. This preserves the current default while making current positions immediately useful.
2. Replace the large gauge card with a compact **Inferred open exposure** line. Show the amount against configured max and an explanatory tooltip. Values above 100% must show the overage in text; do not imply this is a live broker balance or a standard portfolio return.
3. Give open and closed rows different columns. Open options: position, strategy, stage, expiry, DTE, and premium received for short options or debit/cost for long options. Closed options: close date, realized P&L, and trade ROI where valid; distinguish trade ROI from headline realized RoC. Never label an open cashflow as realized P&L. Remove the empty Closed column from active rows.
4. Put **Closed trade results** directly above the closed ledger as a compact three-value strip: realized P&L, win rate, closed count. Move expectancy, profit factor, premium capture, and assignment details into an expandable “More closed trade stats” area. Keep strategy-specific measures scoped to their strategy; do not blend capture or assignment rates across all options.
5. When Stock trades is selected and `showSwingOpenPositions` is off, show closed stock trades and explain that open stock holdings are disabled in Settings. Omit the Active state in this condition. If enabled, show open lots separately with shares and cost basis, without inventing unrealized P&L or a live mark.
6. On phone, use two-line position rows instead of a horizontally clipped table. The first visible open option should appear within the first viewport after the compact controls. Keep the five-item bottom navigation and existing drawer behavior.

## Implementation boundaries

- Reuse `TickersTab`, `PositionsTab`, `toAllPositionRows`, `toPositionRows`, `optionsAnalytics`, `strategyAnalytics`, and the detail drawer. Add a responsive list presentation and conditional column sets rather than changing calculation math.
- The Options All filter should group open and closed rows while preserving search, strategy filters, sort, pagination, and deep links. Search should apply to both groups. A state selection can show only the relevant group.
- Only closed results feed the realized stats strip. Switching All/Active/Closed must never relabel those historical metrics as active-position metrics.
- Preserve amount masking, current account/year scope, Aurora light/dark tokens, keyboard row access, clear focus states, and tabular numerals. Put a visible label or tooltip on every non-obvious return or exposure definition.
- No new market data, live option marks, drawdown, Sortino, Calmar, payoff ratio, or social ranking is part of this design.

## Acceptance checks for an implementation agent

- At 390 px, Tickers shows the first symbol rows without scrolling past duplicate panels and no horizontal page overflow. All five symbol measures remain available in each row or its detail.
- Ticker filters and sorting operate on the same filtered account/year dataset, and selecting a row opens the existing drawer with focus return.
- Positions defaults to Options / All. Open positions appear before closed history. Active-only has no empty Closed column; closed rows show realized P&L and correctly defined trade ROI where available.
- Open options show premium received or debit/cost with the right sign and label. No open row presents this cashflow as realized P&L.
- Closed-trade stats remain clearly scoped to closed results across All, Active, and Closed states. Stock trades with open lots disabled does not offer a misleading Active empty state.
- Exposure can exceed the configured max, is described as inferred, and is never treated as an account balance. Amount masking and empty states work throughout.
- Check both themes, desktop and phone widths, keyboard/screen-reader path, and the existing drawer/back behavior. Run the repo's typecheck, lint, test, and build gates after implementation.

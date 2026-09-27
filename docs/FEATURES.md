# Features

Darpan is built around realized trading analytics for short-term traders, not live portfolio
management. Everything below is computed from your imported activity.

## Core workflow

1. Import broker CSV activity (upload or paste) via the **⋯** menu → Import. The parser is
   broker-agnostic — Robinhood, Fidelity, Schwab, E*TRADE, Vanguard, and IBKR exports are
   auto-detected, and a column-mapping step handles anything it can't map on its own.
2. Rows are normalized into stock, option, cash, fee, dividend, transfer, and unknown
   transactions; anything uninterpretable is kept as **unresolved**, not discarded.
3. Imported transactions and settings persist in per-user Postgres records.
4. The dashboard reconstructs realized P&L, option lifecycles, tax lots, capital usage, and
   monthly returns, and presents them across five tabs.
5. Resolve gaps (e.g. a sale missing its opening buy) through **Review & fix**.

Sample data is on by default so the dashboard is populated before you import; disable it in
Settings.

## Navigation

Five primary tabs. On desktop they sit in the top bar; on a phone they become a fixed bottom
tab bar. Import, Settings, account switch, theme toggle, and backup export live behind the
**⋯** overflow menu.

### Home

Realized results for the selected year and accounts:
- **Headline:** realized net P&L and realized RoC, using peak concurrent capital behind
  positions realized in the period.
- **Cumulative realized P&L** — a close-date step line with an optional elapsed-year goal
  pace overlay. The actual line stops at the last realized close; it is not an equity curve.
- **Annual goal** — progress against the configured realized P&L target, shown only while
  goal tracking is enabled.
- **Quality:** expectancy, profit factor, and win rate over realized events. Assignment
  legs can be grouped into one trade in the Monthly ledger, so these units differ.
- **Contribution and context:** realized Options/Stocks P&L and a directional comparison
  with adjusted SPY/QQQ/VTI returns.

### Monthly

- **Month strip and summary** — select a month in the chosen year to see realized P&L,
  realized RoC, and grouped closed-trade count in one compact panel.
- **Trades (default)** — Options/Stocks P&L and category RoC share that panel as figures,
  followed by a grouped ledger with symbol/strategy search, close-date filtering, and P&L
  sorting. There are no extra category charts.
  A covered-call assignment appears once in the ledger while its option and stock P&L
  appear in their respective category totals. Select a trade for its detail drawer.
- **Daily view** — a weekday-aligned monthly calendar and selected-day grouped trades.
  There is no additional daily bar chart or full ledger in this view.
- Month and view persist in the URL alongside year/account filters, so links and browser
  Back/Forward restore the selected view.

### Tickers

- **Leaderboard** — "Money makers" and "Account killers": your symbols ranked by net P&L,
  annotated with win rate and trade count so a single lucky trade can't top the board.
- **Full symbol table** — every symbol you've traded, sortable and searchable (net P&L, RoC,
  trades, win rate).

### Positions

Your book organized **by strategy**: All strategies, Cash-secured puts, Covered calls, Long
options, Swing.
- The **All strategies** board lists option plays (CSP/CC/Long) with an Active / Closed / All
  filter (default All) and a per-strategy summary tile row.
- Each **strategy drill-down** shows its own metric set — e.g. premium collected, capture
  rate, and assignment rate for options; profit factor and avg win/loss for swing — plus an
  Active / Closed / All table.
- Tables carry strategy-appropriate columns (Premium + Capital for CSP/CC, Cost for long
  options, Qty + Cost basis for swing) along with **Opened** and **Closed** dates.
- **Swing** shows closed positions only (open share lots aren't tracked as positions).
- Click any position for a full P&L breakdown drawer.
- The buying-power gauge shows current deployed capital against configured max buying power.

### Taxes

- **Tax reserve snapshot** — estimated short-term and long-term federal components,
  NIIT, and state/local tax using editable planning assumptions.
- **Realized activity** — disposition rows with proceeds, adjusted basis, gain/loss,
  holding term, and a detail audit.
- **Open lots** — reconstructed stock lots for the selected taxable accounts.
- **Review** — missing-basis and unsupported activity is excluded from the estimate;
  potential exact-ticker wash sales are flagged for broker-record review.

## Goal tracking

The annual realized P&L goal (`annualRealizedPnlGoal`, default `$40,000`) drives the
Home goal card and elapsed-year pace overlay on the cumulative realized P&L chart.

## Capital & collateral

- **Covered calls** use linked stock cost basis when known, falling back to strike exposure
  for open cycles with missing basis.
- **Cash-secured puts** use conservative collateral (strike × shares) by default, or net
  collateral after premium when configured.
- **Swing trades** use cost basis while open.

Cost-basis method and the put-collateral denominator are configurable in Settings.

Realized RoC uses realized P&L divided by peak concurrent capital behind positions realized in
the selected period. Sequential rolls and trades reuse the same capital; genuinely overlapping
positions add. Inferred open positions stay in exposure metrics only because no authoritative
holdings/equity snapshot is available. Covered-call stock basis is de-duplicated when its
underlying stock or assignment interval also realizes in scope. Portfolio and monthly capital
are capped at configured max buying power when notional intervals imply leverage. Time-weighted
average realized capital uses those scoped realized rows and the same cap. Capital-weighted
trade ROI is shown separately and sums capital on closed
trades. Because the app lacks portfolio equity and complete external cash flows, neither metric
is presented as Modified Dietz or a standard portfolio return.

## Import support

The parser is broker-agnostic. It auto-detects the source broker from the header signature
(Robinhood, Fidelity, Schwab, E*TRADE, Vanguard, IBKR) and maps common header synonyms
(`Date`/`Activity Date`/`Run Date`/`Trade Date`, `Action`/`Trans Code`/`Side`, `Symbol`,
`Quantity`, `Price`, `Amount`, `Fees`, option `Type`/`Strike`/`Expiration`, etc.) onto a
canonical field set. Transaction codes for stock buy/sell, `STO`, `BTC`, `BTO`, `STC`,
`OASGN`, `OEXP`, dividends, fees, transfers, and unknown/misc are recognized. When a column
isn't detected automatically, a mapping step lets you assign it by hand. Unrecognized rows
are preserved as unresolved.

## Backup

Export a JSON backup (transactions + settings) from the **⋯** menu or Settings. Sample data
is generated by the app and is not part of the backup.

## Product boundaries

- No broker API or live broker sync.
- No live prices, option marks, or Greeks.
- No max-drawdown / Sortino / Calmar / payoff-ratio surfacing, no discipline streak, and no
  social leaderboard — deliberately out of scope.
- Potential wash sales are screening flags only; no automatic wash-sale adjustment or
  tax filing. Verify estimates against official brokerage and tax documents.

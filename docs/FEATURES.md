# Features

PositionIQ is built around realized trading analytics rather than live portfolio management.

## Core Workflows

- Import Robinhood CSV activity from upload or pasted text.
- Normalize stock, option, cash, fee, dividend, transfer, and unknown rows.
- Store imported transactions and settings in local SQLite.
- Review unresolved import rows and duplicate warnings.
- Track realized P&L across stock sales, covered calls, cash-secured puts, option expirations, buy-to-close cycles, and assignments.
- Inspect tax lots and per-event P&L explanations.
- View monthly realized P&L, ROI, deployed capital, and goal progress.
- Use top header actions for Import, Settings, backup export, and theme toggle.

## Current Dashboard Tabs

- `Overview`: goal cards, performance snapshot, KPI matrix, and insights. Sections are rearrangeable and hideable.
- `Capital & ROI`: monthly ROI, capital efficiency KPIs, charts, monthly ROI table, and capital efficiency ledger.
- `Covered Calls`: option-cycle stats, current open covered-call capital, open covered calls, all covered-call cycles, and covered-call results.
- `Cash-Secured Puts`: option-cycle stats, current open CSP collateral, open CSPs, all CSP cycles, and CSP results.
- `Swing Trades`: realized stock-trade ledger.
- `Tax Lots`: open/closed/partially closed tax lots.
- `Trades`: normalized transaction list.

Import and Settings are header actions, not primary tabs.

## Goal Tracking

The annual realized P&L goal is stored in settings as `annualRealizedPnlGoal`.

- Default: `$40,000`.
- YTD goal card compares current-year realized P&L against the annual goal.
- Monthly target card uses annual goal divided by 12.
- Monthly P&L chart uses the same monthly target line.

## Current Capital Views

The CC/CSP tabs emphasize currently open capital rather than closed-event capital.

- Covered calls: current capital uses linked stock basis when known. For open covered calls with missing stock basis, the display falls back to strike exposure.
- Cash-secured puts: current collateral uses strike times controlled shares by default, or net collateral after premium when configured.

## Import Support

The Robinhood parser recognizes common headers including:

- `Activity Date`, `Process Date`, `Settle Date`
- `Instrument`
- `Description`
- `Trans Code`
- `Quantity`
- `Price`
- `Amount`

Supported transaction codes include stock buy/sell, `STO`, `BTC`, `BTO`, `STC`, `OASGN`, `OEXP`, dividends, fees, transfers, and unknown/misc activity.

## Known Product Boundaries

- No Robinhood API integration.
- No cloud sync.
- No live prices or Greeks.
- No tax filing or wash-sale handling.
- Results are for personal analysis and should be checked against official brokerage/tax documents.

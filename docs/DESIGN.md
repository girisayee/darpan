# Design Guidelines

> **Note:** The UI now follows the **Quiet** design system. See `docs/redesign/quiet/README.md` for the current visual contract (tokens, typography, spacing, and component inventory). The earlier Tape direction has been superseded.

The UI should feel like a modern fintech dashboard: dense, professional, scannable, and useful for repeated review.

## Visual Direction

- Favor restrained panels, clear tables, and compact cards.
- Use icons for recognizable actions and section identity.
- Keep cards at modest radius and avoid nested cards.
- Avoid marketing-style hero sections, oversized decorative areas, and ornamental backgrounds.
- Keep copy short and operational.

## Navigation

Primary tabs are for analytical work areas only:

- Overview
- Capital & ROI
- Covered Calls
- Cash-Secured Puts
- Swing Trades
- Tax Lots
- Trades

Utility actions live in the header:

- Import
- Settings
- Export backup
- Theme toggle

## Overview Layout

Overview sections can be rearranged and hidden. Layout is intentionally stored in localStorage because it is UI preference only, not financial data.

Sections:

- Performance Snapshot
- Metric Matrix
- Insights
- Charts
- Realized Ledger

## KPI Cards

Use `KpiCard` for metric tiles. It includes:

- label
- value
- helper text
- visual tooltip through an info button
- tone icon

Always provide useful tooltip text. Do not rely on `aria-label` alone for visible tooltips.

## Assignment Display Policy

Assignments are valid accounting events and should remain in ledgers, calculations, tax lots, and explanations.

The dashboard should not show separate assignment stat cards or separate assignment chart series. Fold assignment effects into the appropriate option bucket for high-level stat displays.

## CC/CSP Current Capital

The CC/CSP tabs should answer the user's live exposure question first.

- Show current open covered-call capital/collateral.
- Show open cycles before all historical cycles.
- Keep closed-event ROI and P&L tables below current exposure.

## Responsive Behavior

- Use stable grid dimensions and avoid text overlap.
- Keep tables horizontally scrollable where needed.
- Avoid dynamic text that causes large layout jumps.
- Use icon buttons for compact controls and provide `title`/accessible labels.

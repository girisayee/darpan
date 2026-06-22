# Darpan

**The mirror for your trades.** It doesn't flatter — it reflects.

Darpan is a personal, local-first dashboard for short-term traders who track their own
performance. It imports your broker activity (Robinhood-style CSV), reconstructs realized
P&L, option income, and capital usage, and shows it back to you across four focused views:
**Home**, **Performance**, **Tickers**, and **Positions**.

Darpan does not connect to any broker and sends nothing to the cloud. You import a CSV (or
paste rows); everything is computed and stored locally.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL Next.js prints. The app ships with sample data so the dashboard is
populated before you import anything; turn it off in Settings once you import your own.

## What it does

A short-term trader's "game tape." The four tabs:

- **Home** — year-to-date verdict at a glance: Net P&L, Expectancy, Profit factor, Win
  rate, a daily-P&L calendar heatmap (year or month), your capital deployed vs. your
  configured max, your open option positions, and a by-strategy snapshot.
- **Performance** — equity curve, capital-matched benchmark vs. SPY / QQQ / VTI, annual
  goal pacing, capital-deployed metrics (return on capital, utilization, turnover,
  income/day, concentration), and a monthly P&L breakdown (chart + by-strategy ROI table).
- **Tickers** — a per-symbol leaderboard ("Money makers" / "Account killers") plus a full
  sortable, searchable table of every symbol you've traded.
- **Positions** — your book organized by strategy (Cash-secured puts, Covered calls, Long
  options, Swing), each with its own metrics and an Active / Closed / All drill-down. Click
  any position for a full P&L breakdown.

Import and Settings live behind the **⋯** menu in the top bar. On a phone, the four tabs
become a bottom tab bar.

## How it computes P&L

- **Stock / swing sale:** net proceeds − allocated cost basis − fees. Partial sales
  allocate basis by the configured method (FIFO / LIFO / average).
- **Covered call / cash-secured put (expired or bought to close):** premium received −
  buy-to-close cost − fees.
- **Covered-call assignment:** strike proceeds − allocated share basis + net premium − fees.
- **Cash-secured put assignment:** creates a stock lot at an effective basis of strike −
  net premium + fees; stock P&L is realized when those shares are later sold.

ROI is shown as `—` when the capital base is unknown or zero. Annualized ROI is the simple
`ROI × (365 / holding days)`.

## Data & privacy

- Imported transactions and settings persist in a local SQLite file (`data/darpan.sqlite`),
  read/written only through the app's local API routes.
- The SQLite file and any CSVs are git-ignored — they contain personal financial data.
- Export a JSON backup (transactions + settings) any time from the **⋯** menu or Settings.

## Documentation

- [`AGENTS.md`](AGENTS.md) — fast-start guide for coding agents and contributors.
- [`docs/FEATURES.md`](docs/FEATURES.md) — capability catalogue, screen by screen.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow, persistence, engine, and UI structure.

## Known limitations

- No broker API, cloud sync, or multi-user support.
- No live prices, option marks, or Greeks — only realized results from your imported data.
- No wash-sale handling or tax filing. Verify against official brokerage and tax documents.

Darpan is for personal tracking and analysis only.

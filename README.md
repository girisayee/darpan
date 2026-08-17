# Darpan

**The mirror for your trades.** It doesn't flatter — it reflects.

Darpan is a hosted, multi-user dashboard for short-term traders who track their own
performance. It imports your broker activity — Robinhood, Fidelity, Schwab, E*TRADE,
Vanguard, and IBKR CSV exports are auto-detected — reconstructs realized
P&L, option income, and capital usage, and shows it back to you across four focused views:
**Home**, **Performance**, **Tickers**, and **Positions**.

Sign-in is Google SSO, and every trader's data is isolated per account. Who can sign in is
governed entirely by your Google OAuth configuration (while the OAuth app is in "Testing",
that's the test users you add in Google Cloud Console). Darpan does not connect to any
broker — you import a CSV (or paste rows); everything is computed server-side and stored in
your own row-scoped Postgres records.

## Run locally

```bash
npm install
# 1. Start Postgres (docker-compose provisions a local instance)
docker compose up -d
# 2. Apply the schema
npx drizzle-kit push
# 3. Start the app
npm run dev
```

Open the local URL Next.js prints. The app ships with sample data so the dashboard is
populated before you import anything; turn it off in Settings once you import your own.

## Configuration

All configuration is via environment variables (see [`.env.example`](.env.example); real
values live in `.env.local`, which is git-ignored):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (postgres-js). |
| `AUTH_SECRET` | Auth.js session/JWT signing secret. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client credentials. |
| `AUTH_URL` | App origin, e.g. `http://localhost:3000`. |
| `AUTH_TRUST_HOST` | `true` when running behind a proxy / non-localhost host. |

**Google OAuth setup:** create an OAuth 2.0 Client (Web application) in the Google Cloud
console, configure the consent screen, and add the redirect URI
`<host>/api/auth/callback/google` (e.g. `http://localhost:3000/api/auth/callback/google`).
Put the client id/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. Control who may sign in
from the OAuth consent screen (add test users while the app is in "Testing", or publish it
to open sign-in to any Google account).

## What it does

A short-term trader's "game tape." The four tabs:

- **Home** — year-to-date verdict at a glance: Net P&L, Expectancy, Profit factor, Win
  rate, a daily-P&L calendar heatmap (year or month), your capital deployed vs. your
  configured max, your open option positions, and a by-strategy snapshot.
- **Performance** — equity curve, directional comparison with adjusted YTD SPY / QQQ / VTI
  returns, annual
  goal pacing, capital-deployed metrics (Realized RoC, trade ROI, utilization, turnover,
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

Portfolio equity and complete external cash flows are not available, so the app does not
claim to calculate Modified Dietz or a standard portfolio return. Its headline **Realized
RoC** is realized P&L divided by peak concurrent capital behind realized positions. Inferred
open positions remain exposure only. Covered-call basis is de-duplicated when the underlying
shares also realize, and the portfolio denominator is capped at configured max buying power.
A separate capital-weighted
trade ROI divides P&L by summed capital across closed trades.

## Data & privacy

- Imported transactions and settings persist in Postgres, scoped by the signed-in user's id
  and read/written only through the app's session-gated API routes — no account ever sees
  another's rows.
- `.env.local` (Google OAuth secrets, DB credentials) and any CSVs are git-ignored — they
  contain personal/financial data.
- Export a JSON backup (transactions + settings) any time from the **⋯** menu or Settings.

## Documentation

- [`AGENTS.md`](AGENTS.md) — fast-start guide for coding agents and contributors.
- [`docs/FEATURES.md`](docs/FEATURES.md) — capability catalogue, screen by screen.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow, persistence, engine, and UI structure.

## Known limitations

- No broker API integration — data comes from imported CSVs only.
- No live prices, option marks, or Greeks — only realized results from your imported data.
- No wash-sale handling or tax filing. Verify against official brokerage and tax documents.

Darpan is for personal tracking and analysis only.

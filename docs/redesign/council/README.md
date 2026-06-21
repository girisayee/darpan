# PositionIQ Redesign Council

Date: 2026-06-20

Purpose: research the current PositionIQ experience and propose mockup options before changing production UI.

## Council

- Trader workflow lead: focuses on short-term trader questions, urgency, open positions, and realized edge.
- Mobile IA lead: focuses on phone use, responsive shell, menu structure, filters, import, and settings.
- Visual identity lead: focuses on logo, brand tone, ticker leaderboard, chart rhythm, and attractiveness.
- Product guardrail lead: keeps the app local-first, accounting-accurate, dense, and useful for repeat review.

## Current Observations

PositionIQ already has strong capabilities: Robinhood CSV import, SQLite storage, realized P&L, option-cycle handling, goal progress, capital/ROI views, tax lots, and review/fix workflows.

The presentation is the weak layer:

- The app shell still shows `RealizedEdge` instead of `PositionIQ`.
- Navigation is compact on desktop but fragile on phones because logo, tabs, filters, and utilities all share one row.
- The Overview is metric-rich, but it does not immediately answer the trader's short-term questions: Am I on pace this month? What needs attention? Which tickers helped or hurt? Where is capital concentrated?
- The existing `topMovers` and allocation selectors can power a trader-friendly leaderboard and concentration summary, but those stories are not currently surfaced.
- Import and Settings are correctly utility workflows, but they need better mobile organization.

## Audience Lens

Target user: an eager retail trader reviewing short-term results, mostly realized P&L, option income, swing trades, and capital efficiency. They are not asking for a pro quote terminal. They want fast confidence: what is working, what needs action, and whether the month/year is on track.

Design implication: make the app feel like a performance cockpit, not a marketing page and not a brokerage clone. Numbers stay primary, but the information hierarchy should be more emotional and actionable.

## Shared Redesign Principles

- PositionIQ name and mark everywhere user-facing.
- Goal progress remains the emotional center, but month-to-date status gets more prominence.
- Surface a ticker leaderboard using user's realized P&L, not live quote data.
- Make open-position urgency visible from Overview.
- Use a responsive shell: desktop command bar, mobile compact header plus overflow sheet.
- Keep local data privacy and accounting behavior unchanged.
- Preserve dense dashboard ergonomics: tables, drilldowns, filters, and exact numbers still matter.

## Mockup Options

Open [mockups/index.html](mockups/index.html) in a browser to view the original three-option comparison.

Open [mockups/trader-cockpit-screens.html](mockups/trader-cockpit-screens.html) to view the expanded Option A screen pack.

Open [branding.md](branding.md) for the naming and branding council brief. Open [mockups/brand-directions.html](mockups/brand-directions.html) to compare the top brand candidates in the Trader Cockpit shell.

### Option A: Trader Cockpit

Best for making the app immediately attractive to active short-term traders.

Core idea: turn Overview into a command center with a large P&L readout, MTD pace, action queue, ticker leaderboard, and compact strategy cards.

Expanded mockup screens:

1. Cockpit Overview: MTD pace, annual goal, deployed capital, win profile, realized top movers, action queue, and recent realized events.
2. Options Action Desk: open option capital, roll/close urgency, open positions, and closed lifecycle results.
3. Performance Lab: goal-paced charts, benchmark comparison, strategy contribution, and monthly ledger.
4. Realized Event Detail Drawer: row drilldown with the P&L formula, lifecycle context, and explanation text.
5. Mobile Cockpit Flow: phone overview, overflow menu, and option card list.
6. Import, Review, and Settings: utility workflows styled as cockpit tools while keeping data warnings prominent.

Desktop structure:

1. Brand and global nav in a tight command bar.
2. Secondary filter bar for year, account, and strategy.
3. Hero band: MTD P&L, annual goal progress, deployed capital, win profile.
4. Top movers leaderboard by realized P&L.
5. Action queue for expiring/rolling options and unresolved rows.
6. Recent realized events ledger.

Mobile structure:

1. Compact `PIQ` mark, theme, import, and overflow menu.
2. Horizontally scrollable tabs below header.
3. Hero P&L card first, then action queue, then leaderboard.
4. Tables collapse into tappable row cards.

Tradeoffs:

- Highest energy and most trader-native.
- Requires the most new UI composition.
- Must keep visual restraint so it does not become Tape-heavy.

### Option B: Income Journal Pro

Best for users who think of the app as a steady options-income tracker.

Core idea: keep the Quiet system but improve hierarchy: goal, consistency, premium engine, monthly story, and strategy outcomes.

Desktop structure:

1. Calm PositionIQ wordmark and lean nav.
2. Annual goal and monthly goal as twin progress readouts.
3. Premium collected, months on target, return on capital, expectancy.
4. Strategy lanes for CSP, covered calls, swing trades, and long options.
5. Monthly P&L chart and recent realized events.

Mobile structure:

1. Goal progress first.
2. Monthly pace card second.
3. Strategy lanes stack into two-column cards.
4. Settings become collapsible sections.

Tradeoffs:

- Safest evolution from current Quiet direction.
- Less flashy, but likely easiest to ship cleanly.
- Strong for goal tracking and repeat review.

### Option C: Mobile Pulse

Best if phone experience is the redesign anchor.

Core idea: design the phone view first, then scale up. The first screen answers today's status, this month's pace, and what to tap next.

Mobile structure:

1. Sticky compact header: mark, title, quick import, overflow.
2. Bottom or second-row tab rail: Overview, Options, Swing, Performance.
3. Pulse stack: MTD P&L, expiring soon, top winners/losers, deployed capital, recent closes.
4. Overflow sheet owns account, year, export, import, settings.
5. DataTable gains mobile card mode.

Desktop structure:

1. Same information model, expanded into columns.
2. Header utilities remain inline.
3. Leaderboard and action queue sit beside the hero.

Tradeoffs:

- Most responsive and practical on phones.
- Requires shell/menu and table work before visual polish feels complete.
- Desktop may feel less distinctive unless paired with Option A or B visual language.

## Naming Update

The user rejected both `RealizedEdge` and `PositionIQ`. Future redesign work should treat both as placeholder legacy names until a new brand is selected.

Current naming finalists to explore visually:

1. `Edda`: most distinctive brand candidate; tagline `Your trading saga.`
2. `Artha`: strongest Indian/Hindu-inspired candidate; tagline `Purpose behind every trade.`
3. `Lakshya`: goal/target-oriented candidate; tagline `Keep your trades on target.`
4. `TradeTape`: highest-energy Trader Cockpit fit.
5. `CloseBook`: most honest realized-performance fit.
6. `CaptureDesk`: strongest options-income/action workflow fit.

See [branding.md](branding.md) for council rationale, risks, and naming territories.

## Recommended Path

Use Option A as the north-star desktop experience, Option C as the required mobile behavior, and Option B as the restraint filter.

In plain terms: build a trader cockpit, make it phone-native, and keep the Quiet discipline.

## First Implementation Slice After Approval

1. Rename header mark from `RealizedEdge` to `PositionIQ` and redesign logo/menu shell.
2. Add responsive shell behavior: mobile overflow menu and scrollable tab rail.
3. Add Top Movers leaderboard from `topMovers(result)`.
4. Add Overview action queue for option DTE and unresolved fixes.
5. Add MTD pace card and win profile card.
6. Add mobile DataTable card mode only where tables are currently painful.

## Data Stories To Promote

- MTD realized P&L vs monthly target.
- Annual realized P&L vs goal.
- Top winners and losers by realized P&L.
- Open option positions needing action soon.
- Premium collected and capture/close outcome where available.
- Win rate, profit factor, expectancy.
- Deployed capital and buying-power utilization.
- Concentration by symbol.
- Recent realized events with drilldown.

## Guardrails

- Do not show live quote-like data unless it is actually available.
- Label ticker rail as realized P&L movers, not market movers.
- Do not store financial data in localStorage.
- Do not hide review/fix warnings behind pretty visuals.
- Keep assignment accounting policy unchanged.
- Keep tables accessible and horizontally usable even before mobile card mode lands.

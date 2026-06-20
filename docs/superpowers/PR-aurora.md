# PR: Aurora redesign foundation — wheel analytics, dark design system, analytics-wired cockpit

**Branch:** `redesign/aurora` → base `redesign/tape` (the current app state; retarget to `main` if/when that becomes the integration branch).

> This file is the ready-to-use PR body. There is no git remote or `gh` CLI in the dev environment, so the PR could not be opened automatically — see "How to open this PR" at the bottom.

## Summary
Implements the first, verified slice of the approved Aurora redesign (spec: `docs/superpowers/specs/2026-06-19-realizededge-aurora-redesign-design.md`), executed as options A→B→C:

- **A — Aurora design system:** re-valued the CSS-variable token set to the dark-first, high-contrast "Aurora" palette (full light + dark parity), added `--accent-2` / `--border-strong` / `bg-aurora` gradient foundation, consolidated the shared `KpiCard` (variants `hero`/`standard`/`compact`/`exposure` + a non-color +/- arrow for tone, fixing a WCAG 1.4.1 gap), completed the `TabNav` ARIA pattern (roving tabindex, arrow/Home/End, `aria-controls` → tabpanel), and rebranded the wordmark/title/footer to **RealizedEdge**.
- **B — Overview + Performance wiring:** replaced the flat 17-tile Overview with a curated hero KPI row + grouped sections (Income / Returns & efficiency / Trade quality & risk / Allocation) + a "Show more" disclosure, all via the shared `KpiCard`; enriched the Capital & ROI tab; **removed the synthetic "Cap. Efficiency" score** (`50 + avgMonthlyRoi*8`); added the tabpanel ARIA wiring + a `MetricGroup` component.
- **C — risk selectors:** added max drawdown, Sortino, and Calmar as pure tested functions and surfaced them as a Performance risk strip.
- **Analytics foundation (prerequisite, same branch):** pure, tested selectors for profit factor, expectancy, payoff ratio, premium capture, assignment rate, annualized ROC, capital turnover, income/day, concentration (HHI), and goal run-rate projection — most computed from data the engine already produced.

## New metrics now visible
Profit factor · expectancy · payoff ratio · annualized ROC · premium capture rate · assignment rate · income/day · capital turnover · symbol/strategy concentration (HHI) · goal run-rate + required-monthly · max drawdown · Sortino · Calmar.

## Files of note
- `lib/selectors/{trade-quality,premium-capture,allocation,capital-efficiency,risk,analytics}.ts` (+ extended `goal-pace.ts`) and their `tests/selectors/*` — pure functions, TDD.
- `app/globals.css`, `tailwind.config.ts` — Aurora tokens.
- `components/dashboard/KpiCard.tsx`, `components/shell/TabNav.tsx`, `components/shell/AppHeader.tsx`, `components/dashboard/MetricGroup.tsx`, `components/dashboard/DashboardApp.tsx` — design system + cockpit.
- `package.json` + `tsconfig.json` — added `typecheck` script + `vitest/globals` types.

## Verification
- ✅ `npm test` — **79 passed** (13 files).
- ✅ `npm run typecheck` (`tsc --noEmit`) — clean.
- ✅ `npm run lint` (`eslint .`) — clean.
- ✅ `npx next build` — clean.
- ✅ Adversarial Opus review per task + a final whole-branch review → **READY TO MERGE** (0 Critical / 0 correctness-Important).
- ✅ SSR smoke on the dev server: Overview returns HTTP 200 and renders all new labels (Annualized ROC, Premium collected, Win rate, Returns & efficiency, Trade quality, Show more, Projected year-end) with no runtime-error signatures.

## ⚠️ Visual QA still needed (could not run here)
Browser launch is **EPERM-blocked** in this environment, so no screenshots were taken. Please verify in a browser before merge:
- [ ] Overview in **light** and **dark** themes (toggle in header) — Aurora palette, contrast, hero numerals.
- [ ] **Capital & ROI** tab (client-only — not covered by `next build`): the 8 KPI tiles + the new Risk strip (Max drawdown / Sortino / Calmar) render with correct values and "—" for nulls.
- [ ] Keyboard: Tab to the tab bar, arrow keys move between tabs, focus follows.
- [ ] Every gain/loss value shows a +/- arrow (not color alone).

## Notes for the reviewer
- **Pre-existing working-tree changes:** the branch incorporates an existing `filterResult` selector extraction (`lib/selectors/filter-result.ts`) that `DashboardApp` depends on. Other unrelated local edits (a Robinhood plural-assignment import fix + test, `docs/FEATURES.md`) were intentionally **left uncommitted** and are not part of this PR.
- **Aurora gradient tokens** (`accent-2`, `border-strong`, `bg-aurora`) and the `exposure` KpiCard variant are committed as design-system foundation for the deferred screens (Wheels, per-strategy) and are not all consumed yet.
- **Latent (non-blocking):** `aggregates.winRate` (engine, counts DATA_ISSUE, 0–100) and `tradeQuality.winRate` (selector, excludes DATA_ISSUE, 0–1) differ; only the selector version is displayed. Align when the engine field is next touched.

## Deferred (future PRs, per the spec's phased plan)
Broker-agnostic universal CSV/Excel import + file-only import screen; ticker-logo subsystem (offline pack + monogram + opt-in logo.dev); SPY/QQQ benchmark subsystem (Stooq + Yahoo, capital-matched); wheel cycle-linking engine + the flagship Wheels tab; full Aurora re-skin of the remaining screens (Trades, Tax lots, Settings, onboarding) + mobile.

## How to open this PR (no remote/gh in this env)
```bash
# 1) add a remote (example)
git remote add origin <your-repo-url>
# 2) push the branch
git push -u origin redesign/aurora
# 3) open the PR (install GitHub CLI, or use the web UI)
gh pr create --base redesign/tape --head redesign/aurora --title "Aurora redesign foundation — wheel analytics, dark design system, analytics-wired cockpit" --body-file docs/superpowers/PR-aurora.md
```

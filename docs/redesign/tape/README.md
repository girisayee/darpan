# PositionIQ — "Tape" redesign · design system

This is the visual contract for the redesign. The pixel reference is [`mockups/index.html`](./mockups/index.html) — open it in a browser. The build sequence is [`../../superpowers/plans/2026-06-19-positioniq-tape-redesign.md`](../../superpowers/plans/2026-06-19-positioniq-tape-redesign.md).

**Direction in one line:** a refined trading terminal. Numbers are the product, so they get a characterful monospace face, a dark-first (but light-capable) graphite palette, a single gold accent, and a ticker rail as the signature element. Hierarchy comes from surface tint + hairlines, never drop shadows.

---

## 1. Naming

The product is **PositionIQ** everywhere user-facing and in code identifiers. Retire "RealizedEdge": migrate the legacy localStorage key `realizededge.overview-layout.v1` is being deleted with the drag feature (see plan), so no migration needed; rename any remaining `realizededge.*` references to `positioniq.*`. The repo folder name can stay.

## 2. Typography

| Role | Family | Loaded via | Notes |
|------|--------|-----------|-------|
| UI / labels / headings | **Space Grotesk** (400, 500, 700) | `next/font/google` → `--font-sans` | Default body font. |
| All numbers / readouts / table figures | **JetBrains Mono** (400, 500, 700) | `next/font/google` → `--font-mono` | `font-variant-numeric: tabular-nums` ALWAYS. Every currency, %, count, date, strike, ROI. |

**Type scale** (px / weight):
- Hero readout (Net P&L): 40 / 700 mono
- Drawer hero: 32 / 700 mono
- Section number / KPI value: 17–20 / 500 mono
- Stat-strip / table number: 12.5–15 / 400–500 mono
- Section title: 13 / 500 sans
- Label (eyebrow): 10–10.5 / sans, `text-transform: uppercase`, `letter-spacing: .12em`, muted color
- Body / helper: 11.5–13 / 400 sans
- Minimum font size anywhere: 10px

**Rule:** text is Space Grotesk; anything numeric is JetBrains Mono. A symbol ticker like `NVDA` is sans; the `+9,120` next to it is mono.

## 3. Color tokens

Defined as CSS variables in `app/globals.css`, surfaced through Tailwind (`tailwind.config.ts`). Both themes are required. Implementation detail: tokens are stored as space-separated RGB channels (e.g. `242 180 59`) and consumed via `rgb(var(--x) / <alpha-value>)` so Tailwind opacity modifiers (`bg-brand/10`, `ring-pos/40`, etc.) work correctly; the hex values in the tables below are the human-readable reference colors.

### Dark (default — "night")
| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#0C1118` | page background |
| `--surface` | `#121A24` | panels, cards, tiles |
| `--surface-inset` | `#0C1118` | inset wells (progress tracks) |
| `--hairline` | `#1F2A37` | borders, dividers |
| `--hairline-soft` | `#16202B` | inner row dividers |
| `--text` | `#E6EDF3` | primary text |
| `--text-muted` | `#76879B` | labels, secondary |
| `--text-dim` | `#9FB0C2` | tertiary numbers |
| `--brand` | `#F2B43B` | gold accent (active state, signature) |
| `--pos` | `#34D399` | gains |
| `--neg` | `#F87171` | losses |
| `--warn` | `#FBBF24` | unresolved / warnings |

### Light ("day")
| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#F4F6F8` | page background (cool, NOT cream) |
| `--surface` | `#FFFFFF` | panels |
| `--surface-inset` | `#EEF1F4` | inset wells |
| `--hairline` | `#E2E7EC` | borders |
| `--hairline-soft` | `#EDF0F3` | inner dividers |
| `--text` | `#0C1118` | primary text |
| `--text-muted` | `#5C6B7A` | labels |
| `--text-dim` | `#3A4654` | tertiary numbers |
| `--brand` | `#B7791F` | gold (darkened for contrast on light) |
| `--pos` | `#157F4F` | gains |
| `--neg` | `#D64545` | losses |
| `--warn` | `#B45309` | warnings |

Status-chip fills use the semantic color at low alpha (e.g. `rgba(52,211,153,.12)` for positive) with the solid color as text. Keep the same alpha pattern across themes.

## 4. Form, space, motion

- **Elevation:** no `box-shadow`. Delete the `shadow-panel` token and every `shadow-*` usage. Depth = `--surface` on `--bg` + 1px `--hairline`.
- **Radius:** controls/chips 8px · tiles 10px · panels 12px · outer app frame 14px · pills/rail-cells 999px.
- **Borders:** 1px hairlines. Accent strips (insight cards, drawer note) use a 2px `border-left` in `--brand` or `--neg` with `border-radius: 0 12px 12px 0` (no rounded corner on the accented side).
- **Spacing:** panel padding 11–17px; section gap 12px; page padding 16px. Vertical rhythm in multiples of 4.
- **Motion:** 120–160ms ease on hover/active/tab change. The ticker rail marquee scrolls slowly; **must** freeze and become a static/scrollable strip under `prefers-reduced-motion: reduce`. All transitions respect reduced-motion.
- **Remove:** the two body radial gradients + linear gradient and the header gradient overlay. Flat `--bg` only.

## 5. Signature — the ticker rail (HONEST DATA)

There are **no real-time market prices** in this app (README "Known Limitations"). The rail therefore shows **top movers by realized P&L**, derived entirely from the user's own data — `result.aggregates.symbolBreakdown` (symbol + summed realized P&L), sorted by absolute P&L, top ~8. Symbol in sans, signed value in mono (`--pos`/`--neg`). It is a tape of *your results*, never a quote feed. If `symbolBreakdown` is empty, render nothing (no skeleton, no fake tickers). Label tooltip: "Top movers by realized P&L".

## 6. Global filter bar (period-first)

Lives in the app shell, directly under the tab nav, rendered once in `DashboardApp`. The selected period + filters drive the existing `filterResult(...)` and apply to **all 7 analytical tabs**.

**Controls (left → right):**
1. **Year stepper** — `‹ 2026 ›`, mono. Steps within the range of years present in the data.
2. **Month rail** — 13 cells `[All][Jan]…[Dec]`, mono, in a `repeat(13, 1fr)` grid. Active cell = `--brand` text on `rgba(brand,.16)` fill. Approved control (chosen over a dropdown for scan speed).
3. **Presets** — pill group `All time · YTD · This year · Last year`. A preset sets year+month together: All time → `{year:"ALL", month:"ALL"}`; YTD & This year → `{year:<current>, month:"ALL"}`; Last year → `{year:<current-1>, month:"ALL"}`. Selecting an explicit month deactivates the preset highlight.
4. **Entity selects** — Symbol, Strategy, Account (compact selects, existing option lists).
5. **Active chips** — one removable gold chip per non-`ALL` filter; `×` resets that filter to `ALL`. A live summary follows: `→ N closed events · ±$X realized` for the current selection.

**Consolidation:** this REPLACES both the old header `defaultDateRange` `Select` AND the separate year/month `FilterSelect`s ([`DashboardApp.tsx:142-160`](../../../components/dashboard/DashboardApp.tsx)). One coherent period model; delete the duplicate control.

## 7. Component inventory

Restyle in place where possible; new components are small. Signatures the build plan relies on:

- **`TickerRail`** — `{ movers: { symbol: string; pnl: number }[] }`. Marquee + reduced-motion guard. Source data via a new selector `topMovers(result, limit=8)`.
- **`FilterBar`** — `{ year, month, symbol, strategy, account, preset, years, symbols, accounts, onChange(next) }`. Owns the year stepper, month rail, presets, selects, chips. Pure presentation over lifted state.
- **`Readout`** (replaces/extends `KpiCard` at `components/dashboard/KpiCard.tsx`) — `{ label, value, helper?, tone?: 'positive'|'negative'|'neutral', tooltip? }`. Mono value, no shadow, optional info tooltip (keep current accessible tooltip pattern). Tone tints the value color only.
- **`StatStrip`** — `{ items: { label, value, tone? }[], moreCount?, onMore? }`. The horizontal divided strip with `+N more` disclosure. Replaces the 17-card "Metric Matrix".
- **`HeroReadout`** — `{ label, value, tone, spark?: number[], pills?: string[] }`. The big Net-P&L block + inline SVG sparkline + pill row.
- **`InstrumentCluster`** — 2×2 grid of small `Readout`s.
- **`GoalBar`** — `{ title, target, actual, tone }`. Restyle of `GoalProgressCard` (flat track `--surface-inset`, brand/pos fill).
- **`DataTable`** (`components/tables/DataTable.tsx`) — keep sorting logic + `Column<T>` API unchanged. Restyle: mono `--text-dim` numerics, sans headers in `--text-muted` uppercase, `--hairline-soft` row dividers, `hover:bg` brand-tint, right-aligned numeric columns, horizontal scroll on a wrapper with a "scroll for more →" hint when overflowed. Add an optional `statusChip` render helper.
- **`StatusChip`** — `{ kind: 'open'|'closed'|'expired'|'assigned'|'ok'|'unresolved'|'zero-basis' }` → semantic pill.
- **`DetailDrawer`** — restyle existing drawer: header (symbol sans + strategy chip), hero P&L + ROI, calculation waterfall (proceeds − basis − fees = realized), 3×2 meta grid, basis-allocation note with brand left-accent. Right-side panel, ~64% width / min 380px, hairline left border, backdrop scrim `rgba(8,11,16,.74)`. Esc + backdrop-click + visible focus.
- **App shell** — header (gold square wordmark "POSITIONIQ" + `TickerRail` + icon buttons: theme toggle, Import, Settings, Export) and tab nav (no `flex-wrap`; horizontal scroll on overflow; active tab = `--text` + 2px `--brand` underline).

## 8. Per-screen notes (see mockup numbers)

1. **Overview (01/02)** — HeroReadout + InstrumentCluster (top), two GoalBars, StatStrip (curated; rest behind "+N more"), two insight cards. **No drag handles, no customize toolbar, no hide/restore.**
2. **Filter bar (03)** — shell, applies everywhere.
3. **Capital & ROI (04)** — 6 `Readout`s, the monthly ROI chart (restyle `DashboardCharts` to Tape palette: `--pos`/`--neg` bars, hairline axis, mono labels), monthly ledger `DataTable`.
4. **Covered calls (05)** — 4 exposure `Readout`s (Current CC capital emphasized with brand label), Open cycles table (live), then results table. Exposure-first per existing `DESIGN.md`.
5. **Cash-secured puts (06)** — structural twin of CC; copy swaps to collateral / return on collateral; results show expired/assigned chips. Same `OptionsTab` component, `optionType` prop.
6. **Swing (07)** — summary StatStrip + ledger table; rows open `DetailDrawer`.
7. **Tax lots (08)** — lots table with `StatusChip` (open/closed/zero-basis).
8. **Trades (09)** — issue banner (warning tint) + search field + dense blotter with status chips + scroll hint.
9. **Detail drawer (10)** — explanation panel above.
10. **Import / Settings** — no mockup; apply tokens to existing forms. Inputs: `--surface` bg, 1px `--hairline`, gold focus ring (`focus-visible:ring` in `--brand` at ~40% alpha), mono for numeric inputs. Settings keeps the segmented cost-basis control (restyled), the three capital-calc selects, and Backup actions. Settings is also where the theme preference lives if not in the header.

## 9. Accessibility floor (non-negotiable)

- Visible keyboard focus on every interactive element (tabs, month cells, presets, chips, rows, icon buttons) — gold focus ring.
- Icon-only buttons keep `aria-label`; tooltips are not the only label.
- Color is never the sole signal: gains/losses also carry `+`/`−` signs; status uses text chips.
- `prefers-reduced-motion` respected (ticker rail especially).
- Contrast: all text/!bg pairs ≥ 4.5:1 (the token pairs above are chosen to pass in both themes).
- Theme preference persists across reloads (fixes the current bug).

## 10. What's removed

- Body + header gradients.
- `shadow-panel` and all drop shadows.
- The 17-tile "Metric Matrix" (→ HeroReadout + cluster + StatStrip).
- Drag-to-reorder / hide-restore / "Customize Overview" toolbar and its `overviewLayout` localStorage + all drag state in `DashboardApp.tsx`.
- The redundant header `defaultDateRange` select (→ folded into `FilterBar` presets).
- Default system font (→ `next/font`).

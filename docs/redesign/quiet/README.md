# PositionIQ — "Quiet" design system (supersedes "Tape")

The "Tape" terminal direction (`docs/redesign/tape/`) was built and rejected as too heavy/cluttered. **Quiet** replaces it: minimal, light-first, one typeface, whitespace over borders. Keep all the structure/components/data wiring from the Tape build — this is a re-skin (tokens, fonts, weights, spacing, border usage, ticker removal, filter simplification), not a re-architecture.

## Principles
- Calm and minimal. Hierarchy from size / weight / color / whitespace — NOT from boxes, borders, or bold.
- One typeface. One restrained accent. Color used sparingly.
- Remove decoration: no ticker rail, no monospace, no gold, no drop shadows, no gradients, no per-tile borders.

## Typography
- **Inter** only, via `next/font` (`--font-sans`). Weights 400, 500, 600. Remove Space Grotesk and JetBrains Mono entirely.
- Numbers are Inter with `font-variant-numeric: tabular-nums` (apply a `.nums`/utility or `tabular-nums` class wherever figures align).
- Scale (px / weight): hero number 36/500 · drawer hero 30/500 · section value 20/500 · table + secondary 13–14/400–500 · nav/body 13.5/400 · label (eyebrow) 12/400 muted, sentence case (NO uppercase, NO wide tracking). Never 700.

## Color tokens (RGB channel triplets in globals.css; Tailwind `rgb(var(--x) / <alpha-value>)`)
### Light (primary)
| token | hex | use |
|---|---|---|
| `--bg` | #FBFBFC | page |
| `--surface` | #FFFFFF | the few raised areas (drawer, dropdown menus) |
| `--ink` (foreground) | #17181B | primary text/numbers |
| `--muted` | #6E7178 | labels, secondary |
| `--faint` | #9A9DA4 | tertiary/hints |
| `--hairline` | #ECEDEF | dividers, the rare border |
| `--accent` | #2F6BE4 | progress fill, active nav/control (sparingly) |
| `--pos` | #18895A | gains (on values only) |
| `--neg` | #C2453B | losses (on values only) |

### Dark (calm, not terminal)
| token | hex |
|---|---|
| `--bg` | #0E0F12 |
| `--surface` | #16181D |
| `--ink` | #E8E9EC |
| `--muted` | #8A8F98 |
| `--faint` | #5A5F68 |
| `--hairline` | #23262C |
| `--accent` | #5B8DEF |
| `--pos` | #34B27B |
| `--neg` | #E06A60 |

Map Tailwind: `background→--bg`, `foreground→--ink`, `muted-foreground→--muted`, `faint→--faint`, `hairline→--hairline`, `accent→--accent`, `pos→--pos`, `neg→--neg`, `surface→--surface`. Keep legacy aliases (card→surface, border→hairline, primary→accent, success→pos, danger→neg) so nothing breaks mid-migration. Brand/gold tokens are removed.

## Form, space, motion
- No `box-shadow`, no gradients. Depth = whitespace + hairlines. Most "cards" become borderless groups separated by a single `--hairline` rule or just space.
- Radius: controls 8px · the few panels (drawer, menus) 12px · progress bars 3px.
- Spacing: generous — section gaps 22–32px, comfortable label→value gaps. Let it breathe.
- Accent restraint: `--accent` only for progress fills + active states. `--pos`/`--neg` only on monetary/ROI values, muted.
- Motion: ≤120ms, `prefers-reduced-motion` respected. No marquee.

## Removed vs Tape
- The ticker rail (`TickerRail`) — removed from the header. (Keep `topMovers` selector + tests; just don't render the rail. Drop the marquee keyframe.)
- All `font-mono`/JetBrains Mono usage → Inter tabular.
- Gold/`--brand` accent → calm `--accent` blue.
- 13-cell month rail in `FilterBar` → compact Year + Month dropdowns + quiet preset text links + entity dropdowns; active filters as subtle text, not gold chips.
- Heavy weights (700), oversized hero (40px), uppercase-tracked labels, per-tile borders.

## Screens
Same composition as before, lighter: Overview = hero P&L + a quiet sub-line + a borderless metric row + slim goal rows + a curated "more metrics" disclosure + minimal insights. Tables = the restyled DataTable, lighter (Inter, hairline row rules, no heavy headers). Drawer = same content, Inter, calmer. Forms = Inter, hairline inputs, accent focus ring. Match the approved mockup `direction_quiet_minimal`.

## Voice & framing — income journal
The app documents the realized results of someone **learning to sell options + do light short-term swing trading to build a steady income**. Tone: calm, plain-language, encouraging — a progress journal, not a pro terminal. Favor income-forward human labels where accurate ("Premium collected" = the income engine; a "months on target" consistency read; "ahead/behind pace" on the goal) over clinical jargon — but keep financial terms correct (realized P&L stays realized P&L where precision matters; don't relabel losses as "income"). The goal hero (annual + monthly income target + pace) is the emotional center; consistency/steadiness matters more than any single big number.

## Accessibility (unchanged floor)
Visible focus rings (accent), aria-labels on icon buttons, color never the sole signal (keep +/− signs + text status chips), reduced-motion respected, theme persists.

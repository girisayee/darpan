# Aurora design system (Plan A) — Implementation Plan

> Execute via subagent-driven-development. This is one cohesive, interdependent change (tokens ↔ tailwind ↔ shared components), so it is a single implementation task with build/lint/test gates, not parallel sub-tasks.

**Goal:** Re-skin the app's design-system layer from "Quiet" (muted, light-first) to "Aurora" (dark-first, high-contrast, vivid accent, bold numerals) by re-valuing CSS-variable tokens and upgrading the shared primitives — with full light + dark parity — without breaking the running app.

**Architecture:** The whole app already styles itself through CSS-variable tokens mapped in `tailwind.config.ts`. Re-valuing the tokens propagates Aurora everywhere with low risk; component changes are limited to the shared primitives (`KpiCard`, `TabNav`, `AppHeader`).

**Tech Stack:** Next.js 16, Tailwind 3.4 (`rgb(var(--x) / <alpha-value>)` tokens), Inter via next/font, lucide-react icons.

## Global Constraints
- Keep existing token NAMES (`--bg`, `--surface`, `--surface-inset`, `--hairline`, `--hairline-soft`, `--text`, `--text-muted`, `--text-dim`, `--accent`, `--pos`, `--neg`, `--warn`, `--spotlight`) so every existing `bg-surface`/`border-hairline`/`text-muted-foreground` usage keeps working — only change VALUES and ADD new tokens. Tokens are space-separated RGB channel triplets (no `#`, no `rgb()`), e.g. `--bg: 13 16 22;`.
- Full light + dark parity: every token defined in both `:root` (light) and `.dark` (dark).
- Tone is never color-only: toned numbers carry a sign/arrow glyph (WCAG 1.4.1).
- Two type weights in play become three: 400/500/600. 600 (`font-semibold`) is for hero numerals only.
- No gradients except one accent gradient on progress fills. No shadows in dark; at most one soft shadow on raised cards in light.
- Verification gate (all must pass): `npm test` (71 tests), `npx next lint`, `npx next build`. End commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Task A: Aurora tokens + primitives

**Files:**
- Modify: `app/globals.css` (re-value `:root` + `.dark`, add tokens)
- Modify: `tailwind.config.ts` (map new tokens + accent gradient)
- Modify: `components/dashboard/KpiCard.tsx` (variants + non-color sign)
- Modify: `components/shell/TabNav.tsx` (keyboard a11y)
- Modify: `components/shell/AppHeader.tsx` (wordmark → RealizedEdge)

### Step 1 — `app/globals.css`: replace the two token blocks exactly

`:root` (Aurora light):
```
  --bg:              251 252 253;
  --surface:         255 255 255;
  --surface-inset:   244 246 250;
  --hairline:        236 238 242;
  --hairline-soft:   242 244 247;
  --border-strong:   220 224 230;
  --text:            11 18 32;
  --text-muted:      90 100 114;
  --text-dim:        154 162 173;
  --accent:          79 70 229;
  --accent-2:        124 92 255;
  --pos:             11 122 85;
  --neg:             214 69 61;
  --warn:            180 83 9;
  --spotlight:       13 16 22;
```

`.dark` (Aurora dark — the default look):
```
  --bg:              13 16 22;
  --surface:         20 26 35;
  --surface-inset:   17 22 30;
  --hairline:        34 43 57;
  --hairline-soft:   26 31 40;
  --border-strong:   44 54 71;
  --text:            244 246 250;
  --text-muted:      138 147 163;
  --text-dim:        94 104 119;
  --accent:          110 139 255;
  --accent-2:        124 92 255;
  --pos:             52 211 153;
  --neg:             251 113 133;
  --warn:            227 168 87;
  --spotlight:       13 16 22;
```

### Step 2 — `tailwind.config.ts`: add token mappings + accent gradient
Add to `colors`: `"border-strong": "rgb(var(--border-strong) / <alpha-value>)"`, `"accent-2": "rgb(var(--accent-2) / <alpha-value>)"`. Add to `extend`: `backgroundImage: { aurora: "linear-gradient(135deg, rgb(var(--accent-2)), rgb(var(--accent)))" }`. Keep everything else.

### Step 3 — `components/dashboard/KpiCard.tsx`: variants + non-color sign
Extend the props (keep all existing ones and the `Readout` alias; default behavior unchanged for current callers except the new sign glyph on toned values):
```ts
type Variant = "hero" | "standard" | "compact" | "exposure";
// add optional: variant?: Variant;  (default "standard")
```
- Value sizing by variant: hero → `text-[30px] font-semibold tracking-[-0.01em]`; standard → `text-[20px] font-medium` (current); compact → `text-[16px] font-medium`; exposure → like standard.
- `exposure` wraps the card in `rounded-[12px] border border-accent/40 bg-surface px-3 py-2.5`.
- Non-color sign: when `tone==="positive"` render a small `ArrowUpRight` (lucide) before the value; when `tone==="negative"` render `ArrowDownRight`; both `aria-hidden`, `h-3.5 w-3.5`, inheriting the tone color. Neutral renders no glyph. This is the WCAG non-color signal and must appear for every toned value.
- Keep the Info tooltip behavior intact.

### Step 4 — `components/shell/TabNav.tsx`: complete the ARIA tab pattern
- Roving tabindex: the active tab has `tabIndex={0}`, all others `tabIndex={-1}`.
- `onKeyDown`: ArrowRight/ArrowLeft move to next/previous tab (wrapping), Home → first, End → last; each calls `onSelect(tab)` and focuses the newly selected tab button. Use a ref array to focus.
- Add optional prop `panelId?: string`; when provided set `aria-controls={panelId}` on each tab. Keep `role="tablist"`/`role="tab"`/`aria-selected` and the Aurora active underline (`after:bg-accent`).

### Step 5 — `components/shell/AppHeader.tsx`: wordmark
- Change the wordmark text from `PositionIQ` to `RealizedEdge`. (Account switcher is wired in Plan B where account data is available.) Everything else already adopts Aurora via tokens.

### Step 6 — Gates
- `npm test` → 71 passed.
- `npx next lint` → no new errors.
- `npx next build` → builds clean (catches type errors across app).
- Report status, the three gate results, and files changed. Do NOT git commit (controller commits).

## Self-review note
This change is values + additive props; no existing token name or KpiCard prop is removed, so existing callers compile unchanged. Risk is purely visual; final verification includes a dev-server smoke + (if the environment permits) light/dark screenshots, else a visual checklist for the user.

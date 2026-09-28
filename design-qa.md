# Tickers and Positions design QA

final result: passed

## Visual evidence

- Source visual truth: [`public/design/tickers-positions-mockups.html`](public/design/tickers-positions-mockups.html), Tickers and Positions in desktop and mobile states. Prototype data is synthetic.
- Rendered implementation: `http://localhost:3000/tickers?year=2026` and `http://localhost:3000/positions?year=2026`, signed in, selected year 2026, Options / All for Positions.
- Implementation screenshot path: in-app browser captures from this QA pass (tab 6, not persisted as files because the signed-in screen contains private financial data). Source captures came from in-app browser tab 5. Source and implementation captures were emitted together for each full-view comparison.
- Desktop comparison: source and implementation were inspected at 1280 CSS px width, with 720–800 CSS px browser heights. Equal-size follow-up browser captures were 1265 × 712 pixels after scrollbar/canvas cropping. The source app is inset inside the prototype page, so composition was judged within its app frame.
- Phone comparison: source's 390 × 844 CSS app frame was compared with the rendered app at a 390 × 844 CSS viewport. The source frame is embedded in a wider prototype canvas; alignment was judged from the app content boundary rather than the outer canvas. Browser capture density differed between the framed prototype and live app, so no pixel-difference score was used.
- Focused comparisons: the Tickers controls and first rows; the Positions exposure line, filters, first open row, and phone bottom navigation. The source and rendered screens were viewed in the same comparison calls. The financial values and symbols were intentionally not compared because the source uses synthetic data.

## Findings and comparison history

1. **[P1, fixed] Historical closed options could appear in the wrong year.** A 2025 browser pass initially showed later-year assignments in the closed ledger while the 2025 realized summary was empty. Closed rows are now restricted by their actual close year. The subsequent 2025 phone capture showed a closed-only view, no current exposure or Active state, and a closed count matching the ledger.
2. **[P2, fixed] Phone subtitle wrapped and repeated the scope indirectly.** The first Positions comparison showed a two-line generic subtitle, adding height above the open book. The copy now names the selected year directly. The revised phone capture shows it on one line and leaves the first open option in the initial viewport.
3. **[P2, fixed] Phone repeated the expiry sort hint.** The first Positions comparison showed both a helper by the section heading and the mobile sort control. The helper is now desktop-only. The revised phone capture shows one sort cue and no duplicate text.

No actionable P0, P1, or P2 visual differences remain. The live Positions phone layout keeps global search and a real sort control above the open list, so the first row starts lower than in the illustrative mockup. It remains visible without scrolling. Open premium/debit amounts use neutral text rather than the mockup's gain green to keep cashflow distinct from realized P&L.

## Fidelity and behavior checks

| Surface | Result |
| --- | --- |
| Typography | The app uses its existing Inter family and Aurora type scale. Headings, labels, metric figures, and tabular numerals remain legible at desktop and phone widths. Long phone metadata wraps within rows. |
| Spacing and layout | Both screens put the primary list before redundant summary content. Tickers has no duplicate leaderboard. Positions shows open options before the closed ledger. At 390 px, neither page has horizontal document overflow or a clipped persistent control. |
| Colors and tokens | Dark and light themes were viewed in the signed-in app. Borders, surfaces, accent controls, positive/negative results, warning exposure, and muted copy retain readable contrast. The original dark preference was restored after the check. |
| Assets and icons | Existing Darpan branding, ticker logos, Lucide controls, and bottom navigation are retained. The mockup has no product imagery requiring replacement. |
| Copy and content | Realized RoC, trade ROI, event win rate, open premium/debit, inferred exposure, and historical-year scope are labeled distinctly. No open cashflow is labeled as realized P&L. |
| Interactions | Tickers filters, search, sort, empty state, row drawer, and focus return; Positions category/strategy/status controls, search, mobile sort, masking, drawer focus return, and historical year were exercised. |
| Console and build | No new browser errors after the implementation stabilized. Earlier hot-reload parse errors during editing were resolved. Typecheck, lint, 194 Vitest cases, and production build passed. |

## Remaining limits

- The prototype's company-name subtitles are illustrative; live Tickers uses available symbols and existing logos without inventing security names.
- Live account data differs from synthetic mockup content, so numerical alignment and exact row counts were not fidelity targets.

## Implementation checklist

- [x] Single responsive Tickers list with All / Winners / Losers.
- [x] Positions open and closed groups with separate cashflow and realized columns.
- [x] Compact exposure and closed-result summaries with accurate scope labels.
- [x] Phone layouts, light/dark themes, drawer interactions, historical years, and full repository checks.

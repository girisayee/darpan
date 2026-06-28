# Per-section routes — design

**Date:** 2026-06-27
**Status:** Approved for planning (approach + decisions confirmed)
**Approach:** A — shared App Router layout + React context

## Problem

The dashboard is a single page at `/` ([app/page.tsx](../../../app/page.tsx) → `DashboardApp`). Sections (Home / Performance / Tickers / Positions, plus Import / Settings) switch via a client-side `activeTab` state — no URLs, so sections aren't deep-linkable, shareable, or reachable via browser back/forward.

## Goals

- Real per-section routes: `/home`, `/performance`, `/tickers`, `/positions`, `/import`, `/settings`; `/` redirects to `/home`.
- Key view state in the URL: the **year** filter (`?year=`) and the **Positions sub-view** (`?view=options|swing`, `?strategy=csp|cc|long`). Deep-linkable and survives reload.
- No regression in behavior: same data, filters, detail drawer, review/fix panel, theme, export.

## Non-goals

- No change to the calculation engine, selectors, data store, or the tab components' internal logic (beyond wiring nav to the router).
- Detail drawer / review-fix panel state stays in-memory (not URL-encoded).

## Architecture

### Route group with a shared layout

```
app/page.tsx                      → redirect("/home")
app/(app)/layout.tsx              → server: auth() → redirect /signin if no user;
                                     renders <DashboardShell user={…}>{children}</DashboardShell>
app/(app)/home/page.tsx           → <HomeSection/>
app/(app)/performance/page.tsx    → <PerformanceSection/>
app/(app)/tickers/page.tsx        → <TickersSection/>
app/(app)/positions/page.tsx      → <PositionsSection/>
app/(app)/import/page.tsx         → <ImportSection/>
app/(app)/settings/page.tsx       → <SettingsSection/>
```

The `(app)` route group adds no path segment; it exists only to share `layout.tsx`. Because the layout does not remount on section navigation, the shell and all shared state persist across section switches (no flicker, no reload of the store).

### `DashboardShell` (client provider) — `components/dashboard/DashboardShell.tsx`

Holds everything `DashboardApp` holds today, exposed via a `DashboardContext`:

- **Store/theme:** `useSyncExternalStore(subscribe/get/server)` + `loadStore()` on mount; `useTheme()`.
- **Filters:** `year` read from `useSearchParams().get("year") ?? "2026"`; `setYear` writes via `router.replace` preserving other params. `account` stays in provider state (persists across nav via the layout). `years` / `accounts` derived from data.
- **Derived:** `allTransactions`, `baseResult = calculateDashboard(...)`, `result = filterResult(base, {year, account, …})`, `manualTransactions`.
- **Drawer / review-fix:** `selectedEvent | selectedLifecycle | selectedSymbol`, `reviewFixOpen`, and their setters/closers.
- **Mutations:** `updateSettings`, `replaceTransactions`, `addTransactions`, `updateTransaction`, `deleteTransaction`, `downloadBackup`.
- **Renders:** the `<main>` wrapper, `<AppShell>` (active section from `usePathname`; nav/import/settings handlers call `router.push`), the loading/error banners, `{children}`, `<DetailDrawer>`, `<ReviewFixPanel>`.

A `useDashboard()` hook returns the context; sections consume it.

### Section pages (client) — `components/dashboard/sections/*`

Each page is a thin `"use client"` wrapper that calls `useDashboard()` and renders the existing tab component, passing context values + router-backed nav callbacks. Tab components' prop APIs are unchanged:

- **HomeSection:** `<HomeTab … onOpenStrategy={(k)=>router.push(positionsHref(k))} onOpenPositions={()=>router.push("/positions")} onSelectEvent onSelectLifecycle/>`
- **PerformanceSection:** `<PerformanceTab result settings/>`
- **TickersSection:** `<TickersTab result onSelectSymbol/>`
- **PositionsSection:** reads `view`/`strategy` from `useSearchParams`, passes to `PositionsTab`; `PositionsTab` writes `view`/`strategy` to the URL via `router.replace` on tab/chip change (replacing today's in-memory `initialStrategy`). `onReviewFix` opens the panel via context.
- **ImportSection / SettingsSection:** render the extracted `ImportTab` / `SettingsTab`.

### Extractions

`ImportTab`, `SettingsTab`, and their private primitives (`TradesPreview`, `ImportIssues`, `SettingsPanel`, `Toggle`, `Segmented`, `Select`, `IconButton`, `downloadBackup`) currently live inside `DashboardApp.tsx`. Move them to their own files (`components/dashboard/tabs/ImportTab.tsx`, `SettingsTab.tsx`, and a small `settings-ui.tsx`/`import-ui.tsx` for shared primitives) so the section pages can import them. `DashboardApp.tsx` is removed once its contents move to `DashboardShell` + the extracted files.

### URL helpers

A tiny `positionsHref(strategy)` maps `csp|cc|long → /positions?view=options&strategy=<k>` and `swing → /positions?view=swing`. The Positions deep-link (`initialStrategy`) contract is preserved through the URL instead of a prop.

## Auth

`app/(app)/layout.tsx` runs `auth()` once and redirects to `/signin` when unauthenticated, replacing the per-page check in the old `app/page.tsx`. `user` is passed into `DashboardShell`.

## Testing / verification

- `tsc --noEmit` and `eslint` clean across all new/changed files.
- `next build` succeeds (catches App Router/server-client boundary mistakes).
- Dev-server smoke test per route: `/`, `/home`, `/performance`, `/tickers`, `/positions`, `/positions?view=swing`, `/positions?view=options&strategy=cc`, `/import`, `/settings`, `/?year=2025` → each returns 200 with no error overlay.
- Manual behavior parity: nav switches sections without full reload; year/positions params survive reload and are shareable; detail drawer + review-fix still open; export still downloads.

## Risks

- Largest change to the app's core shell; server/client component boundaries in App Router are the main hazard (context is client-only, so section pages and `DashboardShell` are `"use client"`; only `layout.tsx`/`page.tsx` redirect shells are server).
- Verification is partly blind this session (no live screenshot), so leans on `next build` + per-route HTTP smoke tests; final visual check is the user's.

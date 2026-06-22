# Aurora UI Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore detail-drawer click interactivity, make Positions default to active-open view, and restructure Home tab with a monthly P&L bar chart instead of equity curve + annual goal.

**Architecture:** Three independent feature slices with clear prop interfaces. columns.tsx gains source-object refs and `toAllPositionRows`. PositionsTab gains drawer callbacks and an All-strategy segmented table. HomeTab drops MiniEquityCurve + goal-pace card, adds MonthlyPnlBar + keeps gauge.

**Tech Stack:** React, TypeScript, Recharts (BarChart/Bar/Cell), Tailwind w/ Aurora CSS tokens, existing DataTable/SegmentedControl primitives.

## Global Constraints

- Dark+light via Aurora CSS tokens only — `rgb(var(--token))` pattern, no hardcoded hex
- tabular-nums + existing format helpers (formatCurrency, formatPercent, formatDisplayDate, formatNumber)
- Round displayed numbers
- Do NOT touch: Leaderboard.tsx, BuyingPowerGauge.tsx, PerformanceTab.tsx, TickersTab.tsx
- Build must stay green after each commit

---

### Task 1: Detail-drawer source refs in columns.tsx + DayDetail + prop wiring

**Files:**
- Modify: `components/dashboard/positions/columns.tsx`
- Modify: `components/dashboard/DayDetail.tsx`
- Modify: `components/dashboard/tabs/HomeTab.tsx`
- Modify: `components/dashboard/tabs/PositionsTab.tsx`
- Modify: `components/dashboard/DashboardApp.tsx`

**Interfaces:**
- Produces: `PositionRow.lifecycle?: OptionLifecycle`, `PositionRow.event?: RealizedPnLEvent`
- Produces: `DayDetail` props `onSelect?: (e: RealizedPnLEvent) => void`
- Produces: `HomeTab` prop `onSelectEvent: (e: RealizedPnLEvent) => void`
- Produces: `PositionsTab` props `onSelectEvent` and `onSelectLifecycle`

- [ ] **Step 1: Add source refs to PositionRow and toPositionRows in columns.tsx**

In `PositionRow` interface add:
```ts
lifecycle?: OptionLifecycle;
event?: RealizedPnLEvent;
```

Add imports at top of columns.tsx:
```ts
import type { CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
```
(remove the old `CalculationResult` from the existing import if present)

In `toPositionRows`:
- For csp/cc map: set `lifecycle: lc` on every returned row object
- For long map: set `lifecycle: lc` on every returned row object
- For swing closedRows: set `event: e` on each returned row
- For swing activeRows (tax-lot rows): omit both (they remain undefined)

- [ ] **Step 2: Make DayDetail rows clickable**

Replace the `div` event row with a `button`:
```tsx
{day.events.map((e) => (
  <button
    key={e.id}
    type="button"
    onClick={() => onSelect?.(e)}
    className="flex w-full items-center justify-between rounded-[8px] bg-surface-inset px-2.5 py-1.5 text-left transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
  >
    <span className="text-[11px] text-foreground">{e.symbol} <span className="text-muted-foreground">{label(e.strategy)}</span></span>
    <span className="text-[11px]">{signedMoney(e.realizedPnl)}</span>
  </button>
))}
```

Add `onSelect?: (e: RealizedPnLEvent) => void` to DayDetail props. Import `RealizedPnLEvent` from `@/types/trading`.

- [ ] **Step 3: Add onSelectEvent prop to HomeTab and thread it to DayDetail**

Add to HomeTab props:
```ts
onSelectEvent: (e: RealizedPnLEvent) => void;
```

Pass to DayDetail:
```tsx
<DayDetail day={selectedDay} onSelect={onSelectEvent} />
```

- [ ] **Step 4: Add drawer callbacks to PositionsTab and wire onRowClick**

Add to PositionsTab props:
```ts
onSelectEvent: (e: RealizedPnLEvent) => void;
onSelectLifecycle: (l: OptionLifecycle) => void;
```

Import `OptionLifecycle, RealizedPnLEvent` from `@/types/trading`.

In the per-strategy DataTable, add `onRowClick`:
```tsx
onRowClick={(row) => {
  if (row.lifecycle) onSelectLifecycle(row.lifecycle);
  else if (row.event) onSelectEvent(row.event);
}}
```

- [ ] **Step 5: Wire callbacks in DashboardApp**

In DashboardApp, pass props to HomeTab:
```tsx
<HomeTab
  result={result}
  settings={settings}
  year={year}
  onOpenStrategy={openStrategyInPositions}
  onSelectEvent={setSelectedEvent}
/>
```

Pass to PositionsTab:
```tsx
<PositionsTab
  result={result}
  initialStrategy={positionsInitialStrategy}
  onReviewFix={() => setReviewFixOpen(true)}
  onSelectEvent={setSelectedEvent}
  onSelectLifecycle={setSelectedLifecycle}
/>
```

- [ ] **Step 6: Typecheck + lint + commit**

```bash
cd C:/Users/gsayeenathan/Documents/RealizedEdge && npm run typecheck && npm run lint
git add components/dashboard/positions/columns.tsx components/dashboard/DayDetail.tsx components/dashboard/tabs/HomeTab.tsx components/dashboard/tabs/PositionsTab.tsx components/dashboard/DashboardApp.tsx
git commit -m "feat(drawers): restore click-to-open across Positions and Home day-detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Positions default — All strategy segmented table with active-open default

**Files:**
- Modify: `components/dashboard/positions/columns.tsx`
- Modify: `components/dashboard/tabs/PositionsTab.tsx`

**Interfaces:**
- Consumes: `PositionRow` with `lifecycle?` and `event?` from Task 1
- Produces: `allColumns: Column<PositionRow>[]`, `toAllPositionRows(result, state)`

- [ ] **Step 1: Add strategyLabel field and allColumns/toAllPositionRows to columns.tsx**

Add to `PositionRow`:
```ts
strategyLabel?: string;
```

Add after `columnsFor`:
```ts
export const allColumns: Column<PositionRow>[] = [
  position(),
  {
    key: "strategyLabel",
    header: "Strategy",
    value: (r) => r.strategyLabel ?? "",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground">{r.strategyLabel ?? "—"}</span>
    ),
  },
  stage(),
  when(),
  pnl(),
];

export function toAllPositionRows(
  result: CalculationResult,
  state: "all" | "active" | "closed"
): PositionRow[] {
  const labels: Record<StrategyKey, string> = {
    csp: "Cash-secured puts",
    cc: "Covered calls",
    long: "Long options",
    swing: "Swing",
  };
  return (["csp", "cc", "long", "swing"] as StrategyKey[]).flatMap((k) =>
    toPositionRows(result, k, state).map((row) => ({
      ...row,
      strategyLabel: labels[k],
    }))
  );
}
```

- [ ] **Step 2: Update PositionsTab segment==="all" branch to show segmented table**

Update the `segment === "all"` branch to render StrategyStrip + segmented control + all-positions table:

```tsx
if (segment === "all") {
  const allStateKey = allStateFilter.toLowerCase() as "all" | "active" | "closed";
  const allRows = toAllPositionRows(result, allStateKey);
  return (
    <div className="space-y-5 py-2">
      <StrategyStrip result={result} onOpen={handleOpenStrategy} />
      {onReviewFix && result.realizedEvents.some((e) => e.strategy === "DATA_ISSUE") && (
        <div className="flex items-center justify-between rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2">
          <span className="text-[12px] text-warn">Some trades have unresolved data issues.</span>
          <button type="button" onClick={onReviewFix} className="text-[12px] font-medium text-warn underline">
            Review &amp; fix
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">All positions</span>
        <SegmentedControl<StateFilter>
          value={allStateFilter}
          options={["All", "Active", "Closed"]}
          onChange={setAllStateFilter}
        />
      </div>
      <DataTable
        rows={allRows}
        columns={allColumns}
        empty={`No ${allStateFilter.toLowerCase()} positions.`}
        searchable
        pageSize={8}
        onRowClick={(row) => {
          if (row.lifecycle) onSelectLifecycle(row.lifecycle);
          else if (row.event) onSelectEvent(row.event);
        }}
      />
    </div>
  );
}
```

Add `const [allStateFilter, setAllStateFilter] = useState<StateFilter>("Active");` near the top of the component.

Add `allColumns, toAllPositionRows` to the import from columns.

- [ ] **Step 3: Typecheck + lint + commit**

```bash
cd C:/Users/gsayeenathan/Documents/RealizedEdge && npm run typecheck && npm run lint
git add components/dashboard/positions/columns.tsx components/dashboard/tabs/PositionsTab.tsx
git commit -m "feat(positions): default all-strategies view with active/closed segmented table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Home — remove equity curve + goal pace, add Monthly P&L bar chart

**Files:**
- Modify: `components/dashboard/tabs/HomeTab.tsx`

**Interfaces:**
- Consumes: `result.monthlyReturns` array with `{ year, month, realizedPnl }` fields

- [ ] **Step 1: Remove MiniEquityCurve component and associated imports/state**

Delete the entire `MiniEquityCurve` function from HomeTab.tsx.

Remove from imports:
- `Line`, `LineChart` from recharts (keep CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer — they'll be used by the new BarChart but check overlap)
- `TrendingDown`, `TrendingUp` from lucide-react
- `goalPace` from `@/lib/selectors/goal-pace`

Remove from the component body:
- `const pace = goalPace(...)` 
- `const isAhead = pace.aheadBy >= 0`
- `const monthIndex = ...`
- `const monthlyRealized = ...`

Remove the entire bottom row including the equity curve card and goal pace card (`{/* ── Bottom row: equity curve + buying power + goal pace ── */}` section).

- [ ] **Step 2: Add Monthly P&L bar chart using Recharts BarChart**

Add imports:
```ts
import { BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
```

Add color constants (same pattern as existing):
```ts
const C_NEG = "rgb(var(--neg))";
```

Add the `MonthlyPnlBar` component:
```tsx
function MonthlyPnlBar({ result }: { result: CalculationResult }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const data = useMemo(
    () =>
      result.monthlyReturns.map((m) => ({
        month: `${m.year}-${String(m.month).padStart(2, "0")}`,
        pnl: m.realizedPnl,
      })),
    [result.monthlyReturns]
  );

  if (!mounted) {
    return <div className="h-[160px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke={C_HAIRLINE} opacity={1} />
          <XAxis
            dataKey="month"
            tick={TICK_STYLE}
            tickFormatter={(v: string) => v.slice(5)}
            axisLine={{ stroke: C_HAIRLINE }}
            tickLine={false}
          />
          <YAxis
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1000 || v <= -1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
            }
            width={48}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatCurrency(typeof value === "number" ? value : Number(value)),
              "Monthly P&L",
            ]}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ fill: C_HAIRLINE, fillOpacity: 0.3 }}
          />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.pnl >= 0 ? C_POS : C_NEG}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Replace bottom row in HomeTab JSX**

Replace the `{/* ── Bottom row: equity curve + buying power + goal pace ── */}` section with:
```tsx
{/* ── Bottom row: monthly P&L bar chart + buying power ── */}
<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
  {/* Monthly P&L bar chart */}
  <div className="rounded-[14px] border border-hairline bg-surface p-4">
    <div className="mb-2 text-[12px] font-medium text-foreground">Monthly P&amp;L</div>
    <MonthlyPnlBar result={result} />
  </div>

  {/* Buying power gauge */}
  <BuyingPowerGauge deployed={currentDeployed} maxBP={maxBP} />
</div>
```

- [ ] **Step 4: Clean up remaining unused variables in HomeTab**

Remove `annualGoal` variable if it's now unused (it was only used for MiniEquityCurve + goal pace card). Keep `settings` prop only if still used somewhere (for `maxBP`).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
cd C:/Users/gsayeenathan/Documents/RealizedEdge && npm run typecheck && npm run lint
git add components/dashboard/tabs/HomeTab.tsx
git commit -m "feat(home): replace equity curve with monthly P&L bar chart, remove goal-pace card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Full verification

- [ ] **Run all checks**

```bash
cd C:/Users/gsayeenathan/Documents/RealizedEdge && npm run typecheck && npm run lint && npm run build && npx vitest run
```

Expected: all pass.

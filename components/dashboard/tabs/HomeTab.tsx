"use client";

import { useState, useSyncExternalStore, useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { BuyingPowerGauge } from "@/components/dashboard/BuyingPowerGauge";
import { CalendarHeatmap } from "@/components/dashboard/CalendarHeatmap";
import { DayDetail } from "@/components/dashboard/DayDetail";
import { StrategyStrip } from "@/components/dashboard/StrategyStrip";
import { SegmentedControl } from "@/components/dashboard/tabs/shared";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import { tradeQuality } from "@/lib/selectors/trade-quality";
import { currentDeployedCapital, tone } from "@/components/dashboard/tabs/shared";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult, RealizedPnLEvent } from "@/types/trading";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";

const C_POS      = "rgb(var(--pos))";
const C_NEG      = "rgb(var(--neg))";
const C_MUTED    = "rgb(var(--text-muted))";
const C_HAIRLINE = "rgb(var(--hairline))";
const C_SURFACE  = "rgb(var(--surface))";

const TICK_STYLE = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fill: C_MUTED,
} as const;

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: C_SURFACE,
  border: `1px solid ${C_HAIRLINE}`,
  borderRadius: 8,
  boxShadow: "none",
  padding: "8px 12px",
};

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  color: C_MUTED,
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  color: C_MUTED,
  marginBottom: 4,
};

type CalMode = "YTD" | "Month";

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

export function HomeTab({
  result,
  settings,
  year,
  onOpenStrategy,
  onSelectEvent,
}: {
  result: CalculationResult;
  settings: AppSettings;
  year?: string;
  onOpenStrategy: (k: StrategyKey) => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
}) {
  const [calMode, setCalMode] = useState<CalMode>("YTD");
  const [selectedDay, setSelectedDay] = useState<DailyPnl | null>(null);

  const nonIssueEvents = result.realizedEvents.filter((e) => e.strategy !== "DATA_ISSUE");
  const quality = tradeQuality(nonIssueEvents);

  const maxBP = settings.maxBuyingPower ?? 125000;
  const currentDeployed = currentDeployedCapital(result);

  const days = useMemo(() => dailyPnl(result.realizedEvents), [result.realizedEvents]);
  const calModeToHeatmap = calMode === "YTD" ? "year" : "month";

  // Use sum of filtered monthly returns so the card tracks the selected year,
  // not the system year (which would show $0 for historical year selections).
  const ytdPnl = result.monthlyReturns.reduce((s, m) => s + m.realizedPnl, 0);
  const ytdRoi = result.aggregates.ytdRoi;

  return (
    <div className="space-y-5 py-2">
      {/* ── Verdict strip — 4 KPI cards ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiCard
          label="Net P&L · YTD"
          value={formatCurrency(ytdPnl)}
          helper={`${ytdRoi != null ? formatPercent(ytdRoi) : "—"} on capital`}
          tooltip="Calendar-year realized P&L across all closed events."
          tone={tone(ytdPnl)}
          variant="hero"
        />
        <KpiCard
          label="Expectancy"
          value={quality.expectancy != null ? formatCurrency(quality.expectancy) : "—"}
          helper="avg per trade"
          tooltip="Mean realized P&L per closed event."
          tone={tone(quality.expectancy ?? 0)}
          variant="hero"
        />
        <KpiCard
          label="Profit factor"
          value={quality.profitFactor != null ? quality.profitFactor.toFixed(2) : "—"}
          helper="$ won ÷ lost"
          tooltip="Gross profit divided by gross loss."
          tone={tone((quality.profitFactor ?? 1) - 1)}
          variant="hero"
        />
        <KpiCard
          label="Win rate"
          value={quality.winRate != null ? `${Math.round(quality.winRate * 100)}%` : "—"}
          helper={`${quality.wins} / ${quality.totalTrades} trades`}
          tooltip="Share of closed events that were profitable."
          tone="neutral"
          variant="hero"
        />
      </div>

      {/* ── By-strategy strip ── */}
      <StrategyStrip result={result} onOpen={onOpenStrategy} />

      {/* ── Calendar heatmap card ── */}
      <div className="rounded-[14px] border border-hairline bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-foreground">Daily P&amp;L</span>
          <SegmentedControl<CalMode>
            value={calMode}
            options={["YTD", "Month"]}
            onChange={setCalMode}
          />
        </div>
        <CalendarHeatmap
          days={days}
          mode={calModeToHeatmap}
          year={year}
          onSelectDay={setSelectedDay}
        />
        {days.length > 0 && (
          <div className="mt-3 border-t border-hairline-soft pt-3">
            <DayDetail day={selectedDay} onSelect={onSelectEvent} />
          </div>
        )}
      </div>

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
    </div>
  );
}

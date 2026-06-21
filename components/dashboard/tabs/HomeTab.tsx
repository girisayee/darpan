"use client";

import { useState, useSyncExternalStore, useMemo } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { BuyingPowerGauge } from "@/components/dashboard/BuyingPowerGauge";
import { CalendarHeatmap } from "@/components/dashboard/CalendarHeatmap";
import { DayDetail } from "@/components/dashboard/DayDetail";
import { StrategyStrip } from "@/components/dashboard/StrategyStrip";
import { SegmentedControl } from "@/components/dashboard/tabs/shared";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import { tradeQuality } from "@/lib/selectors/trade-quality";
import { goalPace } from "@/lib/selectors/goal-pace";
import { currentDeployedCapital, tone } from "@/components/dashboard/tabs/shared";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult } from "@/types/trading";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";
import { cn } from "@/lib/utils/cn";

const C_POS      = "rgb(var(--pos))";
const C_MUTED    = "rgb(var(--text-muted))";
const C_HAIRLINE = "rgb(var(--hairline))";
const C_SURFACE  = "rgb(var(--surface))";
const C_GOAL_PACE = "rgb(var(--text-muted))";

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

function MiniEquityCurve({ result, annualGoal }: { result: CalculationResult; annualGoal: number }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const data = useMemo(() => {
    return result.monthlyReturns.map((m, i) => ({
      month: `${m.year}-${String(m.month).padStart(2, "0")}`,
      cumulative: result.monthlyReturns.slice(0, i + 1).reduce((sum, x) => sum + x.realizedPnl, 0),
      goalPace: annualGoal > 0 ? (annualGoal * (i + 1)) / 12 : undefined,
    }));
  }, [result.monthlyReturns, annualGoal]);

  if (!mounted) {
    return <div className="h-[160px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
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
            formatter={(value: unknown, name: string | number | undefined) => [
              formatCurrency(typeof value === "number" ? value : Number(value)),
              name === "goalPace" ? "Goal pace" : "Cumulative P&L",
            ]}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ stroke: C_HAIRLINE, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke={C_POS}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: C_POS, fill: C_SURFACE }}
          />
          {annualGoal > 0 && (
            <Line
              type="monotone"
              dataKey="goalPace"
              stroke={C_GOAL_PACE}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              opacity={0.6}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HomeTab({
  result,
  settings,
  onOpenStrategy,
}: {
  result: CalculationResult;
  settings: AppSettings;
  onOpenStrategy: (k: StrategyKey) => void;
}) {
  const [calMode, setCalMode] = useState<CalMode>("YTD");
  const [selectedDay, setSelectedDay] = useState<DailyPnl | null>(null);

  const nonIssueEvents = result.realizedEvents.filter((e) => e.strategy !== "DATA_ISSUE");
  const quality = tradeQuality(nonIssueEvents);

  const annualGoal = settings.annualRealizedPnlGoal;
  const monthlyRealized = result.monthlyReturns.map((m) => m.realizedPnl);
  const monthIndex = result.monthlyReturns.length > 0 ? result.monthlyReturns.length - 1 : 0;
  const pace = goalPace({ annualGoal, monthlyRealized, monthIndex });
  const isAhead = pace.aheadBy >= 0;

  const maxBP = settings.maxBuyingPower ?? 125000;
  const currentDeployed = currentDeployedCapital(result);

  const days = useMemo(() => dailyPnl(result.realizedEvents), [result.realizedEvents]);
  const calModeToHeatmap = calMode === "YTD" ? "year" : "month";

  const ytdPnl = result.aggregates.currentYearRealizedPnl;
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
          onSelectDay={setSelectedDay}
        />
        {days.length > 0 && (
          <div className="mt-3 border-t border-hairline-soft pt-3">
            <DayDetail day={selectedDay} />
          </div>
        )}
      </div>

      {/* ── Bottom row: equity curve + buying power + goal pace ── */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Equity curve */}
        <div className="rounded-[14px] border border-hairline bg-surface p-4">
          <div className="mb-2 text-[12px] font-medium text-foreground">Equity curve</div>
          <MiniEquityCurve result={result} annualGoal={annualGoal} />
        </div>

        {/* Right column: buying power + goal pace */}
        <div className="flex flex-col gap-3">
          <BuyingPowerGauge deployed={currentDeployed} maxBP={maxBP} />

          {annualGoal > 0 && (
            <div className="rounded-[12px] border border-hairline bg-surface p-3">
              <div className="text-[11px] text-muted-foreground">Annual goal · pace</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[20px] font-semibold tabular-nums leading-none text-foreground">
                  {formatCurrency(pace.actual)}
                </span>
                <span className="text-[12px] tabular-nums text-dim">
                  / {formatCurrency(annualGoal)}
                </span>
              </div>
              <span
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1 rounded-[6px] px-2 py-[3px] text-[10px] font-semibold",
                  isAhead ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"
                )}
              >
                {isAhead ? (
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                )}
                {formatCurrency(Math.abs(pace.aheadBy))}{" "}
                {isAhead ? "ahead" : "behind"}
              </span>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                Projected {formatCurrency(pace.projectedYearEnd)} · needs {formatCurrency(pace.requiredMonthly)}/mo
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

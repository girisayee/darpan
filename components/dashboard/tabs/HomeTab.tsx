"use client";

import { useState, useMemo } from "react";
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

type CalMode = "YTD" | "Month";

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

  // Sum filtered monthly returns so the card tracks the selected year (not the system year).
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

      {/* ── Calendar heatmap + capital deployed ── */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
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

        <BuyingPowerGauge deployed={currentDeployed} maxBP={maxBP} />
      </div>
    </div>
  );
}

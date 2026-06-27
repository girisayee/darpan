"use client";

import { useState, useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { BuyingPowerGauge } from "@/components/dashboard/BuyingPowerGauge";
import { CalendarHeatmap } from "@/components/dashboard/CalendarHeatmap";
import { DayDetail } from "@/components/dashboard/DayDetail";
import { StrategyStrip, type StrategyTarget } from "@/components/dashboard/StrategyStrip";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney, currentDeployedCapital, tone } from "@/components/dashboard/tabs/shared";
import { dailyPnl } from "@/lib/selectors/daily-pnl";
import { tradeQuality } from "@/lib/selectors/trade-quality";
import { toAllPositionRows } from "@/components/dashboard/positions/columns";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { AppSettings, CalculationResult, OptionLifecycle, RealizedPnLEvent } from "@/types/trading";
import type { DailyPnl } from "@/lib/selectors/daily-pnl";

function MetricCard(props: {
  label: string;
  value: string;
  helper: string;
  tooltip: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-3.5">
      <KpiCard {...props} variant="standard" />
    </div>
  );
}

function OpenPositions({
  result,
  onSelect,
  onViewAll,
}: {
  result: CalculationResult;
  onSelect: (l: OptionLifecycle) => void;
  onViewAll: () => void;
}) {
  const open = toAllPositionRows(result, "active").filter((r) => r.lifecycle);
  const rows = [...open].sort((a, b) => (b.warm ? 1 : 0) - (a.warm ? 1 : 0)).slice(0, 6);

  return (
    <div className="rounded-[14px] border border-hairline bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-foreground">
          Open positions <span className="text-muted-foreground">· {open.length}</span>
        </span>
        <button
          type="button"
          onClick={onViewAll}
          className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          View all →
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No open positions.</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <button
              key={`${r.sym}-${i}`}
              type="button"
              onClick={() => r.lifecycle && onSelect(r.lifecycle)}
              className="flex items-center gap-3 border-b border-hairline-soft py-2.5 text-left last:border-0 hover:bg-accent/[0.04]"
            >
              <TickerLogo symbol={r.sym} size={24} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-foreground">
                  {r.sym} <span className="font-normal text-muted-foreground">{r.detail}</span>
                </div>
                <div className="text-[12px]">
                  <span className={r.warm ? "text-warn" : "text-muted-foreground"}>{r.tag}</span>
                  <span className="text-muted-foreground"> · {r.when}</span>
                </div>
              </div>
              <div className="text-[13px] font-medium tabular-nums">{signedMoney(r.pnl)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HomeTab({
  result,
  settings,
  year,
  onOpenStrategy,
  onOpenPositions,
  onSelectEvent,
  onSelectLifecycle,
}: {
  result: CalculationResult;
  settings: AppSettings;
  year?: string;
  onOpenStrategy: (k: StrategyTarget) => void;
  onOpenPositions: () => void;
  onSelectEvent: (e: RealizedPnLEvent) => void;
  onSelectLifecycle: (l: OptionLifecycle) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<DailyPnl | null>(null);

  const nonIssueEvents = result.realizedEvents.filter((e) => e.strategy !== "DATA_ISSUE");
  const quality = tradeQuality(nonIssueEvents);

  const maxBP = settings.maxBuyingPower ?? 125000;
  const currentDeployed = currentDeployedCapital(result);

  const days = useMemo(() => dailyPnl(result.realizedEvents), [result.realizedEvents]);

  const ytdPnl = result.monthlyReturns.reduce((s, m) => s + m.realizedPnl, 0);
  const returnOnCapital = result.aggregates.returnOnCapital;

  return (
    <div className="space-y-5 py-2">
      {/* ── Verdict KPIs ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Net P&L · YTD"
          value={formatCurrency(ytdPnl)}
          helper={`${returnOnCapital != null ? formatPercent(returnOnCapital) : "—"} on capital`}
          tooltip="Calendar-year realized P&L across all closed events."
          tone={tone(ytdPnl)}
        />
        <MetricCard
          label="Expectancy"
          value={quality.expectancy != null ? formatCurrency(quality.expectancy) : "—"}
          helper="avg per trade"
          tooltip="Mean realized P&L per closed event."
          tone={tone(quality.expectancy ?? 0)}
        />
        <MetricCard
          label="Profit factor"
          value={quality.profitFactor != null ? quality.profitFactor.toFixed(2) : "—"}
          helper="$ won ÷ lost"
          tooltip="Gross profit divided by gross loss."
          tone={tone((quality.profitFactor ?? 1) - 1)}
        />
        <MetricCard
          label="Win rate"
          value={quality.winRate != null ? `${Math.round(quality.winRate * 100)}%` : "—"}
          helper={`${quality.wins} / ${quality.totalTrades} trades`}
          tooltip="Share of closed events that were profitable."
          tone="neutral"
        />
      </div>

      {/* ── Calendar (left) + right rail: capital deployed + open positions ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,1fr)]">
        <div className="rounded-[14px] border border-hairline bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-foreground">Daily P&amp;L · YTD</span>
          </div>
          <CalendarHeatmap days={days} mode="year" year={year} onSelectDay={setSelectedDay} />
          {days.length > 0 && (
            <div className="mt-3 border-t border-hairline-soft pt-3">
              <DayDetail day={selectedDay} onSelect={onSelectEvent} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <BuyingPowerGauge deployed={currentDeployed} maxBP={maxBP} />
          <OpenPositions result={result} onSelect={onSelectLifecycle} onViewAll={onOpenPositions} />
        </div>
      </div>

      {/* ── By-strategy strip ── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-muted-foreground">By strategy · YTD</span>
          <span className="text-[12px] text-muted-foreground">tap to open →</span>
        </div>
        <StrategyStrip result={result} onOpen={onOpenStrategy} />
      </div>
    </div>
  );
}

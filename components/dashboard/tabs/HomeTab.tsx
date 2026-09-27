"use client";

import { useMemo } from "react";
import { BenchmarkComparison } from "@/components/dashboard/BenchmarkComparison";
import { CumulativePnlChart } from "@/components/dashboard/CumulativePnlChart";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import { annualInstrumentPnl, cumulativeRealizedPnl } from "@/lib/selectors/performance-view";
import { tradeQuality } from "@/lib/selectors/trade-quality";
import { formatMaskedCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AppSettings, CalculationResult } from "@/types/trading";

const ROC_DESCRIPTION = "Realized P&L divided by peak concurrent capital behind positions realized in this period. Open exposure is excluded.";
const PNL_DISPLAY_PRECISION = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function valueTone(value: number) {
  return value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-foreground";
}

function QualityCard({ label, value, detail, tooltip, positive }: {
  label: string; value: string; detail: string; tooltip: string; positive?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-hairline bg-surface p-4">
      <div className="flex items-center gap-1 text-body font-medium text-muted-foreground">
        {label}<InfoTooltip text={tooltip} label={label} />
      </div>
      <div className={cn("mt-2 text-[25px] font-semibold leading-none tabular-nums sm:text-[29px]", positive ? "text-pos" : "text-foreground")}>{value}</div>
      <p className="mt-2 text-caption text-muted-foreground">{detail}</p>
    </div>
  );
}

function InstrumentContribution({ options, stocks, masked }: { options: number; stocks: number; masked: boolean }) {
  const max = Math.max(Math.abs(options), Math.abs(stocks), 1);
  const rows = [{ label: "Options", value: options }, { label: "Stocks", value: stocks }];
  return (
    <section className="rounded-[14px] border border-hairline bg-surface p-4">
      <h2 className="text-strong font-medium text-foreground">Realized P&amp;L by instrument</h2>
      <div className="mt-3 space-y-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 text-body sm:grid-cols-[72px_minmax(0,1fr)_auto]">
            <span className="text-foreground">{label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-inset" aria-hidden="true">
              <div className={cn("h-full rounded-full", value >= 0 ? "bg-accent" : "bg-neg")} style={{ width: `${Math.abs(value) / max * 100}%` }} />
            </div>
            <span className={cn("min-w-[74px] text-right font-medium tabular-nums", valueTone(value))}>{formatMaskedCurrency(value, masked, PNL_DISPLAY_PRECISION)}</span>
          </div>
        ))}
      </div>
      {options === 0 && stocks === 0 && <p className="mt-3 text-caption text-muted-foreground">No realized closes in this period.</p>}
    </section>
  );
}

export function HomeTab({ result, settings, year }: {
  result: CalculationResult; settings: AppSettings; year?: string;
}) {
  const selectedYear = Number(year) || new Date().getFullYear();
  const isCurrentYear = selectedYear === new Date().getFullYear();
  const realizedPnl = result.monthlyReturns.reduce((sum, month) => sum + month.realizedPnl, 0);
  const roc = result.aggregates.returnOnCapital;
  const quality = useMemo(() => tradeQuality(result.realizedEvents.filter((event) => event.strategy !== "DATA_ISSUE")), [result.realizedEvents]);
  const showGoal = (settings.trackAgainstGoal ?? true) && settings.annualRealizedPnlGoal > 0;
  const chart = useMemo(() => cumulativeRealizedPnl(
    result.realizedEvents, selectedYear, showGoal ? settings.annualRealizedPnlGoal : undefined
  ), [result.realizedEvents, selectedYear, showGoal, settings.annualRealizedPnlGoal]);
  const contribution = useMemo(() => annualInstrumentPnl(result, selectedYear), [result, selectedYear]);
  const goalPercent = showGoal ? (realizedPnl / settings.annualRealizedPnlGoal) * 100 : 0;

  return (
    <div className="space-y-4 py-2 sm:space-y-5">
      <header>
        <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">
          {isCurrentYear ? "Year-to-date performance" : `${selectedYear} performance`}
        </h1>
        <p className="mt-1 text-body text-muted-foreground">Realized trading results for the selected accounts and year.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-[1.15fr_1fr]" aria-label="Realized performance">
        <div className="rounded-[14px] border border-hairline bg-surface p-5 sm:p-6">
          <div className="text-body font-medium text-muted-foreground">Realized net P&amp;L</div>
          <div className={cn("mt-3 break-words text-[38px] font-semibold leading-none tracking-tight tabular-nums sm:text-[50px]", valueTone(realizedPnl))}>
            {formatMaskedCurrency(realizedPnl, settings.maskAmounts, PNL_DISPLAY_PRECISION)}
          </div>
        </div>
        <div className="rounded-[14px] border border-hairline bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-1 text-body font-medium text-muted-foreground">Realized RoC <InfoTooltip text={ROC_DESCRIPTION} label="Realized RoC" /></div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className={cn("text-[38px] font-semibold leading-none tracking-tight tabular-nums sm:text-[50px]", roc === null ? "text-muted-foreground" : valueTone(roc))}>
              {roc === null ? "—" : settings.maskAmounts ? "••••" : formatPercent(roc, 1)}
            </div>
            <p className="max-w-[230px] border-l border-hairline pl-4 text-caption leading-relaxed text-muted-foreground">
              {roc === null ? "No realized capital denominator is available for this period." : "Realized P&L divided by peak concurrent realized capital."}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-hairline bg-surface p-4 sm:p-5">
        <CumulativePnlChart data={chart} year={selectedYear} currentYear={isCurrentYear} goal={showGoal ? settings.annualRealizedPnlGoal : null} maskAmounts={settings.maskAmounts} />
      </section>

      <div className={cn("grid gap-3", showGoal ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        {showGoal && (
          <section className="rounded-[14px] border border-hairline bg-surface p-4">
            <div className="text-body font-medium text-muted-foreground">Annual realized P&amp;L goal</div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-[25px] font-semibold leading-none tabular-nums text-foreground sm:text-[29px]">{settings.maskAmounts ? "••••" : formatPercent(goalPercent, 0)}</span>
              <span className="text-caption tabular-nums text-muted-foreground">{formatMaskedCurrency(realizedPnl, settings.maskAmounts, PNL_DISPLAY_PRECISION)} / {formatMaskedCurrency(settings.annualRealizedPnlGoal, settings.maskAmounts, PNL_DISPLAY_PRECISION)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-inset" role="progressbar" aria-label="Annual realized P&L goal progress" aria-valuenow={settings.maskAmounts ? undefined : Math.max(0, Math.min(100, goalPercent))} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-pos" style={{ width: settings.maskAmounts ? "0%" : `${Math.max(0, Math.min(100, goalPercent))}%` }} />
            </div>
          </section>
        )}
        <QualityCard label="Expectancy" value={quality.expectancy === null ? "—" : formatMaskedCurrency(quality.expectancy, settings.maskAmounts)} detail="Per realized event" tooltip="Mean realized P&L per realized event. Some assignment legs are grouped into one trade in the Monthly ledger." positive={(quality.expectancy ?? 0) > 0} />
        <QualityCard label="Profit factor" value={quality.profitFactor === null ? "—" : quality.profitFactor.toFixed(2)} detail="Across realized events" tooltip="Gross profit divided by absolute gross loss across realized events. Unavailable when there are no losses." positive={(quality.profitFactor ?? 0) > 1} />
        <QualityCard label="Win rate" value={quality.winRate === null ? "—" : formatPercent(quality.winRate * 100, 0)} detail={`${quality.wins} of ${quality.totalTrades} realized events`} tooltip="Share of realized events with positive P&L. This differs from grouped trade counts in the Monthly ledger." />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InstrumentContribution options={contribution.options} stocks={contribution.stocks} masked={settings.maskAmounts} />
        <BenchmarkComparison key={selectedYear} year={selectedYear} />
      </div>
    </div>
  );
}

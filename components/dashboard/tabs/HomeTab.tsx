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

function QualityMetric({ label, value, detail, tooltip, positive }: {
  label: string; value: string; detail: string; tooltip: string; positive?: boolean;
}) {
  return (
    <div className="min-w-0 border-l border-hairline pl-3 first:border-l-0 first:pl-0 sm:pl-5">
      <div className="flex min-h-[34px] items-center gap-1 text-caption font-medium text-muted-foreground min-[380px]:min-h-0">
        {label}<InfoTooltip text={tooltip} label={label} />
      </div>
      <div className={cn("mt-2 break-words text-[24px] font-semibold leading-none tabular-nums sm:text-[29px]", positive ? "text-pos" : "text-foreground")}>{value}</div>
      <p className="mt-2 text-caption leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

function PnlSummary({ total, options, stocks, masked, hasCloses }: { total: number; options: number; stocks: number; masked: boolean; hasCloses: boolean }) {
  const rows = [{ label: "Options", value: options }, { label: "Stocks", value: stocks }];
  const maxMagnitude = Math.max(1, Math.abs(options), Math.abs(stocks));
  return (
    <section className="rounded-[14px] border border-hairline bg-surface p-4 sm:p-5" aria-label="Realized P&L and instrument breakdown">
      <h2 className="text-body font-medium text-muted-foreground">Realized net P&amp;L</h2>
      <div className={cn("mt-2 break-words text-[38px] font-semibold leading-none tracking-tight tabular-nums sm:text-[46px]", valueTone(total))}>
        {formatMaskedCurrency(total, masked, PNL_DISPLAY_PRECISION)}
      </div>
      {hasCloses ? (
        <div className="mt-4 grid grid-cols-[50px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-hairline pt-3" aria-label="Options plus Stocks realized P&L breakdown">
          {rows.map(({ label, value }) => (
            <div key={label} className="contents">
              <span className="text-caption font-medium text-muted-foreground">{label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-surface-inset" aria-hidden="true">
                {!masked && <div className={cn("h-full rounded-full", value < 0 ? "bg-neg" : "bg-pos")} style={{ width: `${Math.abs(value) / maxMagnitude * 100}%` }} />}
              </div>
              <span className={cn("text-right text-[15px] font-semibold leading-tight tabular-nums min-[380px]:text-[17px] sm:text-[19px]", valueTone(value))}>
                {!masked && value > 0 && "+"}{formatMaskedCurrency(value, masked, PNL_DISPLAY_PRECISION)}
              </span>
            </div>
          ))}
        </div>
      ) : <p className="mt-4 border-t border-hairline pt-3 text-caption text-muted-foreground">No realized closes in this period.</p>}
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
    <div className="space-y-3 py-2 sm:space-y-4">
      <header>
        <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">
          {isCurrentYear ? "Year-to-date performance" : `${selectedYear} performance`}
        </h1>
      </header>

      <section className="grid gap-3 lg:grid-cols-2" aria-label="Realized performance">
        <PnlSummary total={realizedPnl} options={contribution.options} stocks={contribution.stocks} masked={settings.maskAmounts} hasCloses={quality.totalTrades > 0} />
        <BenchmarkComparison key={selectedYear} year={selectedYear} roc={quality.totalTrades > 0 ? roc : null} masked={settings.maskAmounts} rocDescription={ROC_DESCRIPTION} />
      </section>

      <section className="rounded-[14px] border border-hairline bg-surface p-4 sm:p-5">
        <CumulativePnlChart data={chart} year={selectedYear} currentYear={isCurrentYear} goal={showGoal ? settings.annualRealizedPnlGoal : null} maskAmounts={settings.maskAmounts} />
      </section>

      <div className={cn("grid gap-3", showGoal && "lg:grid-cols-[minmax(260px,1fr)_minmax(0,3fr)]")}>
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
        <section className="grid min-w-0 grid-cols-3 rounded-[14px] border border-hairline bg-surface p-4" aria-label="Trade quality">
          <QualityMetric label="Expectancy" value={quality.expectancy === null ? "—" : formatMaskedCurrency(quality.expectancy, settings.maskAmounts)} detail="Per event" tooltip="Mean realized P&L per realized event. Some assignment legs are grouped into one trade in the Monthly ledger." positive={(quality.expectancy ?? 0) > 0} />
          <QualityMetric label="Profit factor" value={quality.profitFactor === null ? "—" : quality.profitFactor.toFixed(2)} detail="Gross win ÷ loss" tooltip="Gross profit divided by absolute gross loss across realized events. Unavailable when there are no losses." positive={(quality.profitFactor ?? 0) > 1} />
          <QualityMetric label="Win rate" value={quality.winRate === null ? "—" : formatPercent(quality.winRate * 100, 0)} detail={`${quality.wins} of ${quality.totalTrades} events`} tooltip="Share of realized events with positive P&L. This differs from grouped trade counts in the Monthly ledger." />
        </section>
      </div>
    </div>
  );
}

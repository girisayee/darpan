"use client";

import {
  AlertTriangle,
  Download,
  FileDown,
  FileUp,
  RefreshCcw,
  Search,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MonthlyRoiChart } from "@/components/charts/DashboardCharts";
import { DetailDrawer } from "@/components/dashboard/DetailDrawer";
import { GoalSpotlight } from "@/components/dashboard/GoalSpotlight";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { AppHeader } from "@/components/shell/AppHeader";
import { FilterBar } from "@/components/shell/FilterBar";
import { TabNav } from "@/components/shell/TabNav";
import { StatusChip } from "@/components/common/StatusChip";
import { Column, DataTable } from "@/components/tables/DataTable";
import { calculateDashboard } from "@/lib/calculations/engine";
import { parseRobinhoodInput, type ImportPreview } from "@/lib/import/robinhood";
import { sampleTransactions } from "@/lib/sample-data/sample-transactions";
import { goalPace } from "@/lib/selectors/goal-pace";
import { wheelAnalytics } from "@/lib/selectors/analytics";
import { riskMetrics } from "@/lib/selectors/risk";
import { filterResult } from "@/lib/selectors/filter-result";
import {
  createBackup,
  parseBackup
} from "@/lib/storage/local-store";
import { clearStore, getServerSnapshot, getStoreSnapshot, loadStore, saveStore, subscribeStore } from "@/lib/storage/server-store-client";
import { useTheme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type {
  AppSettings,
  CalculationResult,
  MonthlyCapitalReturn,
  OptionLifecycle,
  RealizedPnLEvent,
  TaxLot,
  TradeTransaction
} from "@/types/trading";

const tabs = [
  "Overview",
  "Capital & ROI",
  "Covered Calls",
  "Cash-Secured Puts",
  "Swing Trades",
  "Tax Lots",
  "Trades"
] as const;

type PrimaryTab = (typeof tabs)[number];
type Tab = PrimaryTab | "Import" | "Settings";
type TradeIssueFilter = "unresolved" | "duplicates" | null;


export function DashboardApp() {
  const store = useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerSnapshot);
  const settings = store.settings;
  const storedTransactions = store.transactions;
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const { theme, toggle } = useTheme();
  const [symbol, setSymbol] = useState("ALL");
  const [strategy, setStrategy] = useState("ALL");
  const [year, setYear] = useState("ALL");
  const [month, setMonth] = useState("ALL");
  const [account, setAccount] = useState("ALL");
  const [selectedEvent, setSelectedEvent] = useState<RealizedPnLEvent | null>(null);
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeIssueFilter, setTradeIssueFilter] = useState<TradeIssueFilter>(null);

  useEffect(() => {
    void loadStore();
  }, []);

  const allTransactions = useMemo(
    () => [...(settings.showSampleData ? sampleTransactions : []), ...storedTransactions],
    [settings.showSampleData, storedTransactions]
  );

  const baseResult = useMemo(() => calculateDashboard(allTransactions, settings), [allTransactions, settings]);
  const result = useMemo(() => filterResult(baseResult, { symbol, strategy, year, month, account }, settings), [baseResult, symbol, strategy, year, month, account, settings]);
  const symbols = useMemo(() => ["ALL", ...new Set(allTransactions.map((transaction) => transaction.symbol).filter(Boolean).sort())], [allTransactions]);
  const years = useMemo(() => ["ALL", ...new Set(allTransactions.map((transaction) => transaction.tradeDate.slice(0, 4)).filter(Boolean).sort())], [allTransactions]);
  const accounts = useMemo(() => ["ALL", ...new Set(allTransactions.map((transaction) => transaction.accountName).filter(Boolean).sort())], [allTransactions]);

  function updateSettings(next: AppSettings) {
    void saveStore({ settings: { ...next, showSampleData: false } });
  }

  function replaceTransactions(next: TradeTransaction[]) {
    void saveStore({ transactions: next });
  }

  function openTrades(issueFilter: TradeIssueFilter, search = "") {
    setTradeIssueFilter(issueFilter);
    setTradeSearch(search);
    setActiveTab("Trades");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <AppHeader
        theme={theme}
        onToggleTheme={toggle}
        onImport={() => setActiveTab("Import")}
        onSettings={() => setActiveTab("Settings")}
        onExport={() => downloadBackup(allTransactions, settings)}
      />

      {!store.loaded && (
        <div className="rounded-lg border border-hairline bg-surface p-3 text-sm text-muted-foreground">Loading SQLite data...</div>
      )}
      {store.error && (
        <div className="rounded-lg border border-neg/30 bg-neg/10 p-3 text-sm text-neg">{store.error}</div>
      )}

      <div className="rounded-[14px] border border-hairline bg-surface overflow-hidden">
        <TabNav
          tabs={tabs}
          active={activeTab}
          onSelect={(t) => setActiveTab(t as Tab)}
          panelId="dashboard-tabpanel"
        />
        <div className="p-4">
          <FilterBar
            year={year}
            month={month}
            symbol={symbol}
            strategy={strategy}
            account={account}
            years={years}
            symbols={symbols}
            accounts={accounts}
            summaryCount={result.realizedEvents.length}
            summaryPnl={result.aggregates.totalRealizedPnl}
            onChange={(partial) => {
              if (partial.year !== undefined) setYear(partial.year);
              if (partial.month !== undefined) setMonth(partial.month);
              if (partial.symbol !== undefined) setSymbol(partial.symbol);
              if (partial.strategy !== undefined) setStrategy(partial.strategy);
              if (partial.account !== undefined) setAccount(partial.account);
            }}
          />
        </div>
      </div>

      <section
        className="min-h-[60vh]"
        role="tabpanel"
        id="dashboard-tabpanel"
        tabIndex={0}
        aria-label={activeTab}
      >
        {activeTab === "Overview" && <OverviewTab result={result} settings={settings} onReviewTrades={openTrades} />}
        {activeTab === "Capital & ROI" && <CapitalTab result={result} onSelectEvent={setSelectedEvent} />}
        {activeTab === "Covered Calls" && <OptionsTab result={result} optionType="call" onSelectEvent={setSelectedEvent} />}
        {activeTab === "Cash-Secured Puts" && <OptionsTab result={result} optionType="put" onSelectEvent={setSelectedEvent} />}
        {activeTab === "Swing Trades" && <SwingTab result={result} onSelectEvent={setSelectedEvent} />}
        {activeTab === "Tax Lots" && <TaxLotsTab result={result} />}
        {activeTab === "Trades" && <TradesTab result={result} search={tradeSearch} onSearchChange={setTradeSearch} issueFilter={tradeIssueFilter} onIssueFilterChange={setTradeIssueFilter} />}
        {activeTab === "Import" && <ImportTab existing={storedTransactions} onSave={(rows) => replaceTransactions([...storedTransactions, ...rows])} />}
        {activeTab === "Settings" && <SettingsTab transactions={storedTransactions} settings={settings} onChange={updateSettings} onImport={(rows, importedSettings) => { void saveStore({ transactions: rows, settings: importedSettings }); }} onClear={() => { void clearStore(); }} />}
      </section>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        RealizedEdge is for personal tracking and analysis only. Verify results against official brokerage and tax documents.
      </footer>

      <DetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} transactions={result.transactions} />
    </main>
  );
}

function OverviewTab({
  result,
  settings,
  onReviewTrades
}: {
  result: CalculationResult;
  settings: AppSettings;
  onReviewTrades: (issueFilter: TradeIssueFilter, search?: string) => void;
}) {
  const strategyStats = displayStrategyBreakdown(result);
  const bestStrategy = strategyStats[0];
  const worstStrategy = [...strategyStats].sort((a, b) => a.pnl - b.pnl)[0];
  const latest = result.monthlyReturns.at(-1);

  // Goal-pace inputs
  const annualGoal = settings.annualRealizedPnlGoal;
  const monthlyRealized = result.monthlyReturns.map((m) => m.realizedPnl);
  const monthIndex = result.monthlyReturns.length > 0 ? result.monthlyReturns.length - 1 : 0;
  const pace = goalPace({ annualGoal, monthlyRealized, monthIndex });

  const monthlyTarget = annualGoal / 12;
  const monthlyActual = result.monthlyReturns.at(-1)?.realizedPnl ?? 0;
  const currentYear = latest?.year ?? new Date().getFullYear();
  const currentMonthIndex = latest ? latest.month - 1 : new Date().getMonth();
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = MONTH_NAMES[currentMonthIndex] ?? "—";

  // wheelAnalytics selectors
  const a = wheelAnalytics(result);
  const [showMore, setShowMore] = useState(false);

  // Mirror the null-check inside Insights to avoid rendering an orphaned divider
  const hasInsights =
    result.aggregates.symbolBreakdown.some((row) => row.pnl < 0 && row.trades > 1) ||
    result.optionLifecycles.some((c) => c.status === "open" && c.expirationDate <= addDaysIso(new Date(), 14)) ||
    result.unresolvedTransactions.length > 0 ||
    result.duplicateTransactionIds.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Goal-hero Spotlight (intentional dark block in both themes) ── */}
      <div className="py-5">
        <GoalSpotlight
          pace={pace}
          year={currentYear}
          annualGoal={annualGoal}
          monthlyActual={monthlyActual}
          monthlyTarget={monthlyTarget}
          monthLabel={monthLabel}
          monthIndex={currentMonthIndex}
        />
      </div>

      {/* ── Run-rate line ── */}
      <p className="text-[12px] text-muted-foreground">
        Projected year-end {formatCurrency(pace.projectedYearEnd)} · needs {formatCurrency(pace.requiredMonthly)}/mo
      </p>

      {/* ── Hairline ── */}
      <div className="h-px bg-hairline" />

      {/* ── Hero row ── */}
      <MetricGroup cols={4}>
        <KpiCard
          label="Net P&L · YTD"
          value={formatCurrency(result.aggregates.currentYearRealizedPnl)}
          helper="Calendar-year realized"
          tooltip="Current calendar-year realized P&L across all closed events."
          tone={tone(result.aggregates.currentYearRealizedPnl)}
          variant="hero"
        />
        <KpiCard
          label="Annualized ROC"
          value={a.capitalEfficiency.annualizedRoc === null ? "—" : formatPercent(a.capitalEfficiency.annualizedRoc)}
          helper="Capital-weighted"
          tooltip="Capital-weighted mean of per-event annualized ROI."
          tone={tone(a.capitalEfficiency.annualizedRoc ?? 0)}
          variant="hero"
        />
        <KpiCard
          label="Premium collected"
          value={formatCurrency(a.premium.premiumCollected)}
          helper={a.premium.captureRate === null ? "—" : `${formatPercent(a.premium.captureRate * 100, 0)} capture`}
          tooltip="Total premium received from opening option sales."
          tone="neutral"
          variant="hero"
        />
        <KpiCard
          label="Win rate"
          value={a.tradeQuality.winRate === null ? "—" : formatPercent(a.tradeQuality.winRate * 100, 0)}
          helper={`PF ${a.tradeQuality.profitFactor === null ? "—" : formatNumber(a.tradeQuality.profitFactor, 1)} · exp ${a.tradeQuality.expectancy === null ? "—" : formatCurrency(a.tradeQuality.expectancy)}`}
          tooltip="Win rate: fraction of realized events that closed profitable."
          tone="neutral"
          variant="hero"
        />
      </MetricGroup>

      {/* ── Income group ── */}
      <MetricGroup label="Income" cols={3}>
        <KpiCard
          label="Options premium"
          value={formatCurrency(result.aggregates.totalOptionsPremium)}
          helper="Closed option premium P&L"
          tooltip="Net realized option premium from all closed cycles."
          tone={tone(result.aggregates.totalOptionsPremium)}
          variant="compact"
        />
        <KpiCard
          label="Stock P&L"
          value={formatCurrency(result.aggregates.totalStockTradingPnl)}
          helper="Realized stock sales"
          tooltip="Realized P&L from stock sales (swings and assignments)."
          tone={tone(result.aggregates.totalStockTradingPnl)}
          variant="compact"
        />
        <KpiCard
          label="Income / day"
          value={a.capitalEfficiency.incomePerDay === null ? "—" : formatCurrency(a.capitalEfficiency.incomePerDay)}
          helper="Option premium per capital-day"
          tooltip="Total option premium P&L divided by total capital-days."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Returns & efficiency group ── */}
      <MetricGroup label="Returns & efficiency" cols={3}>
        <KpiCard
          label="YTD ROI"
          value={result.aggregates.ytdRoi === null ? "—" : formatPercent(result.aggregates.ytdRoi)}
          helper="YTD P&L / YTD avg deployed capital"
          tooltip="YTD realized P&L divided by average deployed capital."
          tone={tone(result.aggregates.ytdRoi ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Avg monthly ROI"
          value={result.aggregates.averageMonthlyRoi === null ? "—" : formatPercent(result.aggregates.averageMonthlyRoi)}
          helper="Average of months with known capital"
          tooltip="Only months with known capital are included."
          tone={tone(result.aggregates.averageMonthlyRoi ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Capital turnover"
          value={a.capitalEfficiency.capitalTurnover === null ? "—" : `${formatNumber(a.capitalEfficiency.capitalTurnover, 1)}×`}
          helper="Total closed capital / mean deployed"
          tooltip="How many times the average deployed capital was cycled through closed trades."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Trade quality & risk group ── */}
      <MetricGroup label="Trade quality & risk" cols={4}>
        <KpiCard
          label="Profit factor"
          value={a.tradeQuality.profitFactor === null ? "—" : formatNumber(a.tradeQuality.profitFactor, 2)}
          helper="Gross profit / gross loss"
          tooltip="Ratio of gross profit to gross loss. >1 means net profitable."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Expectancy"
          value={a.tradeQuality.expectancy === null ? "—" : formatCurrency(a.tradeQuality.expectancy)}
          helper="Mean P&L per trade"
          tooltip="Average realized P&L per closed event."
          tone={tone(a.tradeQuality.expectancy ?? 0)}
          variant="compact"
        />
        <KpiCard
          label="Payoff ratio"
          value={a.tradeQuality.payoffRatio === null ? "—" : formatNumber(a.tradeQuality.payoffRatio, 2)}
          helper="Avg win / avg loss"
          tooltip="Average winning trade divided by average losing trade magnitude."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Assignment rate"
          value={a.premium.assignmentRate === null ? "—" : formatPercent(a.premium.assignmentRate * 100, 0)}
          helper="Assigned / terminal options"
          tooltip="Fraction of terminal option contracts that resulted in assignment."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Allocation group ── */}
      <MetricGroup label="Allocation" cols={3}>
        <KpiCard
          label="Top symbol"
          value={result.aggregates.bestSymbol ?? "—"}
          helper={a.allocation.bySymbol.topShare > 0 ? `${formatPercent(a.allocation.bySymbol.topShare * 100, 0)} of capital` : "No data"}
          tooltip="Symbol with the largest cumulative realized P&L."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Concentration"
          value={a.allocation.bySymbol.level.charAt(0).toUpperCase() + a.allocation.bySymbol.level.slice(1)}
          helper={`HHI ${formatNumber(a.allocation.bySymbol.hhi, 2)}`}
          tooltip="Herfindahl-Hirschman Index measures portfolio concentration by symbol capital."
          tone="neutral"
          variant="compact"
        />
        <KpiCard
          label="Premium capture"
          value={a.premium.captureRate === null ? "—" : formatPercent(a.premium.captureRate * 100, 0)}
          helper="Net option P&L / premium received"
          tooltip="How much of the collected premium was retained as net P&L."
          tone="neutral"
          variant="compact"
        />
      </MetricGroup>

      {/* ── Show more disclosure ── */}
      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="font-sans text-[12px] text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
        >
          {showMore ? "Show less" : "Show more"}
        </button>

        {showMore && (
          <div className="mt-4">
            <MetricGroup label="More" cols={4}>
              <KpiCard
                label="Tax year P&L"
                value={formatCurrency(result.aggregates.currentYearRealizedPnl)}
                helper="Calendar-year realized P&L"
                tooltip="Current calendar-year realized P&L."
                tone={tone(result.aggregates.currentYearRealizedPnl)}
                variant="compact"
              />
              <KpiCard
                label="All-time Net P&L"
                value={formatCurrency(result.aggregates.totalRealizedPnl)}
                helper="All-time realized P&L"
                tooltip="All-time total realized P&L across all closed events."
                tone={tone(result.aggregates.totalRealizedPnl)}
                variant="compact"
              />
              <KpiCard
                label="Avg deployed"
                value={formatCurrency(result.aggregates.averageDeployedCapital)}
                helper="Avg monthly capital-days denominator"
                tooltip="Average deployed capital uses daily capital exposure."
                tone="neutral"
                variant="compact"
              />
              <KpiCard
                label="Peak deployed"
                value={formatCurrency(result.aggregates.peakDeployedCapital)}
                helper="Highest daily deployed capital"
                tooltip="Highest deployed capital observed in a month."
                tone="neutral"
                variant="compact"
              />
              <KpiCard
                label="Avg win"
                value={a.tradeQuality.averageWin === null ? "—" : formatCurrency(a.tradeQuality.averageWin)}
                helper="Average profitable event"
                tooltip="Mean P&L of all winning realized events."
                tone={tone(a.tradeQuality.averageWin ?? 0)}
                variant="compact"
              />
              <KpiCard
                label="Avg loss"
                value={a.tradeQuality.averageLoss === null ? "—" : formatCurrency(a.tradeQuality.averageLoss)}
                helper="Average losing event"
                tooltip="Mean P&L of all losing realized events."
                tone={tone(a.tradeQuality.averageLoss ?? 0)}
                variant="compact"
              />
              <KpiCard
                label="Best strategy"
                value={bestStrategy ? label(bestStrategy.strategy) : "—"}
                helper="Highest strategy P&L"
                tooltip="Strategy group with the largest cumulative realized P&L."
                tone="neutral"
                variant="compact"
              />
              <KpiCard
                label="Worst strategy"
                value={worstStrategy ? label(worstStrategy.strategy) : "—"}
                helper="Lowest strategy P&L"
                tooltip="Strategy group with the smallest cumulative realized P&L."
                tone="neutral"
                variant="compact"
              />
              <KpiCard
                label="Closed trades"
                value={formatNumber(result.realizedEvents.length)}
                helper="Total realized P&L events"
                tooltip="Count of all realized P&L events in the current view."
                tone="neutral"
                variant="compact"
              />
            </MetricGroup>
          </div>
        )}
      </div>

      {/* ── Insights (divider suppressed when empty) ── */}
      {hasInsights && (
        <>
          <div className="h-px bg-hairline" />
          <div className="py-5">
            <Insights result={result} onReviewTrades={onReviewTrades} />
          </div>
        </>
      )}
    </div>
  );
}


function CapitalTab({ result, onSelectEvent }: { result: CalculationResult; onSelectEvent: (event: RealizedPnLEvent) => void }) {
  const latest = result.monthlyReturns.at(-1);
  const a = wheelAnalytics(result);
  const risk = riskMetrics(result);
  return (
    <div className="space-y-3">
      {/* 8-up KpiCard readout */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Annualized ROC"
          value={a.capitalEfficiency.annualizedRoc === null ? "—" : formatPercent(a.capitalEfficiency.annualizedRoc)}
          helper="Capital-weighted annualized return"
          tooltip="Capital-weighted mean of per-event annualized ROI."
          tone={tone(a.capitalEfficiency.annualizedRoc ?? 0)}
        />
        <KpiCard
          label="YTD ROI"
          value={result.aggregates.ytdRoi === null ? "—" : formatPercent(result.aggregates.ytdRoi)}
          helper="Current-year capital return"
          tooltip="YTD realized P&L divided by average deployed capital."
          tone={tone(result.aggregates.ytdRoi ?? 0)}
        />
        <KpiCard
          label="Profit factor"
          value={a.tradeQuality.profitFactor === null ? "—" : formatNumber(a.tradeQuality.profitFactor, 2)}
          helper="Gross profit / gross loss"
          tooltip="Ratio of gross profit to gross loss. >1 means net profitable."
          tone="neutral"
        />
        <KpiCard
          label="Expectancy"
          value={a.tradeQuality.expectancy === null ? "—" : formatCurrency(a.tradeQuality.expectancy)}
          helper="Mean P&L per trade"
          tooltip="Average realized P&L per closed event."
          tone={tone(a.tradeQuality.expectancy ?? 0)}
        />
        <KpiCard
          label="Premium capture"
          value={a.premium.captureRate === null ? "—" : formatPercent(a.premium.captureRate * 100, 0)}
          helper="Net option P&L / premium received"
          tooltip="How much of the collected premium was retained as net P&L."
          tone="neutral"
        />
        <KpiCard
          label="Capital turnover"
          value={a.capitalEfficiency.capitalTurnover === null ? "—" : `${formatNumber(a.capitalEfficiency.capitalTurnover, 1)}×`}
          helper="Total closed capital / mean deployed"
          tooltip="How many times the average deployed capital was cycled through closed trades."
          tone="neutral"
        />
        <KpiCard
          label="Avg Deployed"
          value={formatCurrency(result.aggregates.averageDeployedCapital)}
          helper="Capital-days / days"
          tooltip="Average deployed capital uses daily capital exposure."
          tone="neutral"
        />
        <KpiCard
          label="Peak Deployed"
          value={formatCurrency(result.aggregates.peakDeployedCapital)}
          helper="Largest daily exposure"
          tooltip="Highest deployed capital observed in a month."
          tone="neutral"
        />
      </div>

      {/* Risk metrics group */}
      <MetricGroup label="Risk" cols={3}>
        <KpiCard
          label="Max Drawdown"
          value={risk.maxDrawdownPct === null ? "—" : formatPercent(-(risk.maxDrawdownPct * 100), 1)}
          helper="Peak-to-trough equity decline"
          tooltip="Largest peak-to-trough decline in cumulative realized equity."
          tone={risk.maxDrawdownPct ? "negative" : "neutral"}
        />
        <KpiCard
          label="Sortino"
          value={risk.sortino === null ? "—" : formatNumber(risk.sortino, 2)}
          helper="Downside-adj. return ratio"
          tooltip="Downside-deviation-adjusted return (monthly ROI, MAR 0)."
          tone="neutral"
        />
        <KpiCard
          label="Calmar"
          value={risk.calmar === null ? "—" : formatNumber(risk.calmar, 2)}
          helper="Ann. return / max drawdown"
          tooltip="Annualized return divided by max drawdown."
          tone="neutral"
        />
      </MetricGroup>

      {/* Monthly ROI bar chart */}
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-sans text-[13px] font-medium text-foreground">Monthly realized ROI</h3>
          <span className="font-sans text-[11px] tabular-nums text-muted-foreground">{latest?.year ?? ""}</span>
        </div>
        <div className="mt-3">
          <MonthlyRoiChart result={result} />
        </div>
      </section>

      {/* Monthly ledger DataTable */}
      <MonthlyRoiTable rows={result.monthlyReturns} />

      {/* Events ledger */}
      <EventsTable title="Capital Efficiency Ledger" rows={result.realizedEvents} onSelectEvent={onSelectEvent} />
    </div>
  );
}

function OptionsTab({ result, optionType, onSelectEvent }: { result: CalculationResult; optionType: "call" | "put"; onSelectEvent: (event: RealizedPnLEvent) => void }) {
  const lifecycles = result.optionLifecycles.filter((cycle) => cycle.optionType === optionType);
  const openLifecycles = lifecycles.filter((cycle) => cycle.status === "open");
  const strategies = optionType === "call" ? ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT"] : ["CASH_SECURED_PUT", "PUT_ASSIGNMENT"];
  const events = result.realizedEvents.filter((event) => strategies.includes(event.strategy));
  const currentCapital = openOptionCapital(openLifecycles);
  const openContracts = openLifecycles.reduce((sum, row) => sum + row.contracts, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Premium Collected" value={formatCurrency(lifecycles.reduce((sum, row) => sum + row.premiumReceived, 0))} helper="Gross opening premiums" tooltip="Total premium received from opening option sales." tone="positive" />
        <KpiCard label="Buy-to-Close Cost" value={formatCurrency(lifecycles.reduce((sum, row) => sum + row.closeCost, 0))} helper="Costs to close positions" tooltip="Total debit paid to close option positions." tone="negative" />
        <KpiCard label={optionType === "call" ? "Covered Call ROI" : "Return on Collateral"} value={formatPercent(weightedRoi(events))} helper="P&L / known capital" tooltip="Net realized option-cycle P&L divided by capital or collateral." tone={tone(weightedRoi(events) ?? 0)} />
        {/* Exposure tile — calm accent to emphasize live capital/collateral */}
        <section className="bg-surface border border-accent/20 rounded-[10px] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="w-full">
              <div className="text-[12px] font-medium text-muted-foreground">
                {optionType === "call" ? "Current CC capital" : "Current CSP collateral"}
              </div>
              <div className="mt-2 font-sans text-xl font-medium tabular-nums text-foreground">
                {formatCurrency(currentCapital)}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {formatNumber(openContracts)} open {openContracts === 1 ? "contract" : "contracts"}
          </p>
        </section>
      </div>
      {/* Open cycles — "live" chip signals real-time open positions */}
      <OptionCycleTable
        title={optionType === "call" ? "Open Covered Calls" : "Open Cash-Secured Puts"}
        rows={openLifecycles}
        empty="No open option cycles in this tab."
        showCurrentExposure
        showLiveChip
      />
      {/* Results — tape-styled heading, shared EventsTable unchanged */}
      <section className="space-y-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          {optionType === "call" ? "Covered Call Results" : "Cash-Secured Put Results"}
        </h2>
        <EventsTable rows={events} onSelectEvent={onSelectEvent} />
      </section>
    </div>
  );
}

function SwingTab({ result, onSelectEvent }: { result: CalculationResult; onSelectEvent: (event: RealizedPnLEvent) => void }) {
  const swingEvents = result.realizedEvents.filter((event) => event.strategy === "SWING_TRADE");
  const swingPnl = swingEvents.reduce((sum, ev) => sum + ev.realizedPnl, 0);
  const closedCount = swingEvents.length;
  const winners = swingEvents.filter((ev) => ev.realizedPnl > 0).length;
  const winRate = closedCount > 0 ? (winners / closedCount) * 100 : null;

  // Avg hold — only include events that have a holdingDays value
  const eventsWithDays = swingEvents.filter((ev) => ev.holdingDays != null);
  const avgHold = eventsWithDays.length > 0
    ? eventsWithDays.reduce((sum, ev) => sum + (ev.holdingDays ?? 0), 0) / eventsWithDays.length
    : null;

  const stripItems = [
    { label: "Swing P&L", value: formatCurrency(swingPnl), tone: tone(swingPnl) },
    { label: "Closed Swings", value: formatNumber(closedCount), tone: "neutral" as const },
    { label: "Win Rate", value: winRate !== null ? `${formatNumber(winRate, 0)}%` : "N/A", tone: winRate !== null ? tone(winRate - 50) : "neutral" as const },
    ...(avgHold !== null ? [{ label: "Avg Hold", value: `${formatNumber(Math.round(avgHold), 0)} d`, tone: "neutral" as const }] : []),
  ];

  return (
    <div className="space-y-3">
      <StatStrip items={stripItems} />
      <EventsTable title="Swing Trade Ledger" rows={swingEvents} onSelectEvent={onSelectEvent} />
    </div>
  );
}

function tradeStatusChip(row: TradeTransaction) {
  const kindMap: Record<string, "ok" | "unresolved" | "closed"> = {
    normalized: "ok",
    unresolved: "unresolved",
    ignored: "closed",
  };
  return <StatusChip kind={kindMap[row.status] ?? "ok"} />;
}

function taxLotStatusChip(row: TaxLot) {
  // Detect zero-basis: per-share basis is 0 (or effectively 0) for an open lot
  if (row.costBasisPerShare === 0 && row.status === "open") {
    return <StatusChip kind="zero-basis" />;
  }
  // TaxLotStatus: "open" | "closed" | "partially_closed"
  // StatusChip kinds: "open"|"closed"|"expired"|"assigned"|"ok"|"unresolved"|"zero-basis"
  const kindMap: Record<string, "open" | "closed"> = {
    open: "open",
    closed: "closed",
    partially_closed: "closed",
  };
  return <StatusChip kind={kindMap[row.status] ?? "closed"} />;
}

function TaxLotsTab({ result }: { result: CalculationResult }) {
  const columns: Column<TaxLot>[] = [
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    { key: "openDate", header: "Open Date", value: (row) => row.openDate },
    { key: "closeDate", header: "Close Date", value: (row) => row.closeDate ?? "" },
    { key: "source", header: "Source", value: (row) => row.source, render: (row) => label(row.source) },
    { key: "originalQuantity", header: "Original Qty", value: (row) => row.originalQuantity, align: "right" },
    { key: "remainingQuantity", header: "Remaining", value: (row) => row.remainingQuantity, align: "right" },
    { key: "costBasisTotal", header: "Cost Basis", value: (row) => row.costBasisTotal, render: (row) => formatCurrency(row.costBasisTotal), align: "right" },
    { key: "costBasisPerShare", header: "Per Share", value: (row) => row.costBasisPerShare, render: (row) => formatCurrency(row.costBasisPerShare, { maximumFractionDigits: 2 }), align: "right" },
    { key: "status", header: "Status", value: (row) => row.status, render: (row) => taxLotStatusChip(row), align: "right" },
    { key: "notes", header: "Notes", value: (row) => row.notes ?? "" }
  ];
  return (
    <section className="space-y-2">
      <h2 className="font-sans text-[13px] font-medium text-foreground">Tax Lots</h2>
      <DataTable rows={result.taxLots} columns={columns} empty="No tax lots yet." />
    </section>
  );
}

function TradesTab({
  result,
  search,
  onSearchChange,
  issueFilter,
  onIssueFilterChange
}: {
  result: CalculationResult;
  search: string;
  onSearchChange: (value: string) => void;
  issueFilter: TradeIssueFilter;
  onIssueFilterChange: (value: TradeIssueFilter) => void;
}) {
  const duplicateIds = new Set(result.duplicateTransactionIds);
  const rows = result.transactions.filter((row) => {
    if (issueFilter === "unresolved" && row.status !== "unresolved" && row.action !== "OTHER") return false;
    if (issueFilter === "duplicates" && !duplicateIds.has(row.id)) return false;
    return [row.id, row.rawDescription, row.symbol, row.action, row.status, row.notes ?? ""].join(" ").toLowerCase().includes(search.toLowerCase());
  });

  const columns: Column<TradeTransaction>[] = [
    { key: "tradeDate", header: "Date", value: (row) => row.tradeDate },
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    { key: "instrumentType", header: "Instrument", value: (row) => row.instrumentType },
    { key: "action", header: "Action", value: (row) => row.action, render: (row) => label(row.action) },
    { key: "quantity", header: "Qty", value: (row) => row.quantity, align: "right" },
    { key: "price", header: "Price", value: (row) => row.price, render: (row) => formatCurrency(row.price, { maximumFractionDigits: 2 }), align: "right" },
    { key: "netAmount", header: "Net", value: (row) => row.netAmount, render: (row) => signedMoney(row.netAmount), align: "right" },
    { key: "optionType", header: "Option", value: (row) => row.optionType ?? "" },
    { key: "strikePrice", header: "Strike", value: (row) => row.strikePrice ?? 0, render: (row) => row.strikePrice ? formatCurrency(row.strikePrice, { maximumFractionDigits: 2 }) : "N/A", align: "right" },
    { key: "expirationDate", header: "Expiration", value: (row) => row.expirationDate ?? "" },
    { key: "rawDescription", header: "Raw Description", value: (row) => row.rawDescription },
    { key: "status", header: "Status", value: (row) => row.status, render: (row) => tradeStatusChip(row), align: "right" }
  ];
  return (
    <div className="space-y-3">
      {issueFilter && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-sans text-[12px] text-warn">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
            {issueFilter === "unresolved" ? "Showing unresolved rows that need classification or an ignore decision." : "Showing likely duplicate rows preserved during import."}
          </span>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-warn/30 bg-surface px-3 py-1.5 font-sans text-[11px] font-semibold text-warn hover:bg-warn/10"
            onClick={() => onIssueFilterChange(null)}
          >
            Clear filter
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-accent/40">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search trades…"
          className="w-full bg-transparent font-sans text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <DataTable rows={rows} columns={columns} empty="No transactions match the filters." />
    </div>
  );
}

function ImportTab({ existing, onSave }: { existing: TradeTransaction[]; onSave: (rows: TradeTransaction[]) => void }) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const normalizedRows = preview?.rows ?? [];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <h2 className="font-sans text-[13px] font-medium text-foreground">Robinhood Import</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <IconButton label="Upload CSV" onClick={() => fileInput.current?.click()} icon={<FileUp className="h-4 w-4" />} />
          <IconButton label="Parse Rows" onClick={() => setPreview(parseRobinhoodInput(raw, existing))} icon={<RefreshCcw className="h-4 w-4" />} />
          <IconButton label="Save Import" onClick={() => { if (preview) onSave(normalizedRows); }} icon={<Download className="h-4 w-4" />} disabled={!preview} />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setRaw(await file.text());
          }}
        />
        <textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          className="mt-4 h-80 w-full resize-none rounded-md border border-hairline bg-surface p-3 font-sans text-xs tabular-nums text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/40"
          placeholder="Paste Robinhood transaction CSV here"
        />
      </section>
      <section className="space-y-4">
        {preview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="Imported Rows" value={formatNumber(preview.rows.length)} helper="Parsed row count" tooltip="Rows read from pasted or uploaded CSV." />
              <KpiCard label="Skipped Duplicates" value={formatNumber(preview.duplicateIds.length)} helper="Likely duplicate rows" tooltip="Duplicate detection uses date, symbol, action, quantity, price, amount, and raw description." tone={preview.duplicateIds.length ? "negative" : "neutral"} />
              <KpiCard label="Unresolved" value={formatNumber(preview.rows.filter((row) => row.status === "unresolved").length)} helper="Needs classification" tooltip="Rows with missing or ambiguous fields." tone={preview.rows.some((row) => row.status === "unresolved") ? "negative" : "neutral"} />
              <KpiCard label="Warnings" value={formatNumber(preview.issues.length)} helper="Validation messages" tooltip="Missing fields, unknown actions, or duplicates." tone={preview.issues.length ? "negative" : "neutral"} />
            </div>
            <TradesPreview rows={preview.rows} />
            <ImportIssues issues={preview.issues} />
          </>
        ) : (
          <div className="rounded-xl border border-hairline bg-surface p-8 font-sans text-sm text-muted-foreground">No import preview yet.</div>
        )}
      </section>
    </div>
  );
}

function SettingsTab({
  transactions,
  settings,
  onChange,
  onImport,
  onClear
}: {
  transactions: TradeTransaction[];
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onImport: (rows: TradeTransaction[], settings: AppSettings) => void;
  onClear: () => void;
}) {
  const backupInput = useRef<HTMLInputElement | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingsPanel title="General">
        <Toggle label="Include fees in P&L" checked={settings.includeFees} onChange={(checked) => onChange({ ...settings, includeFees: checked })} />
        <Toggle label="Annualized return" checked={settings.annualizedReturn} onChange={(checked) => onChange({ ...settings, annualizedReturn: checked })} />
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">Annual realized P&amp;L goal</span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.annualRealizedPnlGoal}
              onChange={(event) => onChange({ ...settings, annualRealizedPnlGoal: Math.max(0, Number(event.target.value) || 0) })}
              className="h-10 w-full bg-transparent px-2 font-sans text-[13px] tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
            Monthly pace: {formatCurrency(settings.annualRealizedPnlGoal / 12)}
          </span>
        </label>
        <div className="rounded-md border border-hairline bg-surface-inset p-3 font-sans text-[11.5px] text-muted-foreground">
          Imported trade data is stored in the local SQLite database at <span className="font-sans text-[11px] tabular-nums">data/positioniq.sqlite</span>.
        </div>
      </SettingsPanel>
      <SettingsPanel title="Cost Basis">
        <Segmented value={settings.costBasisMethod} values={["FIFO", "LIFO", "AVERAGE"]} onChange={(value) => onChange({ ...settings, costBasisMethod: value as AppSettings["costBasisMethod"] })} />
        <div className="rounded-md border border-hairline bg-surface-inset p-3">
          <div className="font-sans text-[12px] font-medium text-foreground">Manual basis overrides</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(settings.manualCostBasisPerShare)
              .filter(([symbol]) => symbol !== "PAYPAL")
              .map(([symbol, basis]) => (
                <div key={symbol} className="flex items-center justify-between rounded-md border border-hairline bg-surface px-3 py-2">
                  <span className="font-sans text-[11px] font-medium text-foreground">{symbol}</span>
                  <span className="font-sans text-[11px] tabular-nums text-muted-foreground">{formatCurrency(basis, { maximumFractionDigits: 2 })}/share</span>
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-md border border-hairline bg-surface-inset p-3">
          <div className="font-sans text-[12px] font-medium text-foreground">Zero-basis lots</div>
          <div className="mt-2 grid gap-2">
            {settings.manualZeroBasisLots.map((lot) => (
              <div key={`${lot.symbol}-${lot.quantity}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-surface px-3 py-2">
                <span className="font-sans text-[11px] font-medium text-foreground">{lot.symbol}</span>
                <span className="font-sans text-[11px] tabular-nums text-muted-foreground">{formatNumber(lot.quantity, 5)} shares at $0 basis</span>
                {lot.note && <span className="w-full font-sans text-[11px] text-muted-foreground">{lot.note}</span>}
              </div>
            ))}
          </div>
        </div>
      </SettingsPanel>
      <SettingsPanel title="Capital Calculation">
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">Covered call denominator</span>
          <Select value={settings.coveredCallDenominator} onChange={(value) => onChange({ ...settings, coveredCallDenominator: value as AppSettings["coveredCallDenominator"] })}>
            <option value="UNDERLYING_COST_BASIS">Underlying stock cost basis</option>
            <option value="CURRENT_MARKET_VALUE">Current market value if available</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">Cash-secured put denominator</span>
          <Select value={settings.cashSecuredPutDenominator} onChange={(value) => onChange({ ...settings, cashSecuredPutDenominator: value as AppSettings["cashSecuredPutDenominator"] })}>
            <option value="CONSERVATIVE_COLLATERAL">Conservative collateral: strike * shares</option>
            <option value="NET_COLLATERAL_AFTER_PREMIUM">Net collateral after premium</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">Monthly ROI denominator</span>
          <Select value={settings.monthlyRoiDenominator} onChange={(value) => onChange({ ...settings, monthlyRoiDenominator: value as AppSettings["monthlyRoiDenominator"] })}>
            <option value="AVERAGE_DEPLOYED_CAPITAL">Average deployed capital</option>
            <option value="PEAK_DEPLOYED_CAPITAL">Peak deployed capital</option>
            <option value="CLOSED_TRADE_CAPITAL">Closed trade capital</option>
          </Select>
        </label>
      </SettingsPanel>
      <SettingsPanel title="Backup">
        <div className="flex flex-wrap gap-2">
          <IconButton label="Export backup" onClick={() => downloadBackup(transactions, settings)} icon={<FileDown className="h-4 w-4" />} />
          <IconButton label="Import backup" onClick={() => backupInput.current?.click()} icon={<FileUp className="h-4 w-4" />} />
          <IconButton label="Clear local data" onClick={onClear} icon={<X className="h-4 w-4" />} danger />
        </div>
        <input
          ref={backupInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const backup = parseBackup(await file.text());
            onImport(backup.transactions, backup.settings);
          }}
        />
      </SettingsPanel>
    </div>
  );
}

function EventsTable({ title, rows, onSelectEvent }: { title?: string; rows: RealizedPnLEvent[]; onSelectEvent: (event: RealizedPnLEvent) => void }) {
  const columns: Column<RealizedPnLEvent>[] = [
    { key: "date", header: "Date", value: (row) => row.date },
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    { key: "strategy", header: "Strategy", value: (row) => row.strategy, render: (row) => label(row.strategy) },
    { key: "quantity", header: "Qty", value: (row) => row.quantity, align: "right" },
    { key: "grossProceeds", header: "Proceeds", value: (row) => row.grossProceeds, render: (row) => formatCurrency(row.grossProceeds), align: "right" },
    { key: "costBasis", header: "Cost Basis", value: (row) => row.costBasis ?? 0, render: (row) => formatCurrency(row.costBasis), align: "right" },
    { key: "optionPremium", header: "Premium", value: (row) => row.optionPremium, render: (row) => signedMoney(row.optionPremium), align: "right" },
    { key: "realizedPnl", header: "Realized P&L", value: (row) => row.realizedPnl, render: (row) => signedMoney(row.realizedPnl), align: "right" },
    { key: "capitalDeployed", header: "Capital", value: (row) => row.capitalDeployed ?? 0, render: (row) => formatCurrency(row.capitalDeployed), align: "right" },
    { key: "roiPercent", header: "ROI %", value: (row) => row.roiPercent ?? -999, render: (row) => signedPercent(row.roiPercent), align: "right" },
    { key: "annualizedRoiPercent", header: "Annualized", value: (row) => row.annualizedRoiPercent ?? -999, render: (row) => signedPercent(row.annualizedRoiPercent), align: "right" },
    { key: "warnings", header: "Warnings", value: (row) => row.warnings.length, render: (row) => row.warnings.length ? row.warnings.length : "None", align: "right" }
  ];
  return (
    <section className="space-y-3">
      {title && <h2 className="font-sans text-[13px] font-medium text-foreground">{title}</h2>}
      <DataTable rows={rows} columns={columns} onRowClick={onSelectEvent} empty="No realized P&L events yet." />
    </section>
  );
}

function MonthlyRoiTable({ rows }: { rows: MonthlyCapitalReturn[] }) {
  const columns: Column<MonthlyCapitalReturn>[] = [
    { key: "month", header: "Month", value: (row) => `${row.year}-${String(row.month).padStart(2, "0")}` },
    { key: "realizedPnl", header: "Realized P&L", value: (row) => row.realizedPnl, render: (row) => signedMoney(row.realizedPnl), align: "right" },
    { key: "averageDeployedCapital", header: "Average Capital", value: (row) => row.averageDeployedCapital, render: (row) => formatCurrency(row.averageDeployedCapital), align: "right" },
    { key: "peakDeployedCapital", header: "Peak Capital", value: (row) => row.peakDeployedCapital, render: (row) => formatCurrency(row.peakDeployedCapital), align: "right" },
    { key: "capitalDays", header: "Capital Days", value: (row) => row.capitalDays, render: (row) => formatCurrency(row.capitalDays), align: "right" },
    { key: "realizedRoiPercent", header: "Monthly ROI %", value: (row) => row.realizedRoiPercent ?? -999, render: (row) => signedPercent(row.realizedRoiPercent), align: "right" },
    { key: "closedTradeRoiPercent", header: "Closed Trade ROI", value: (row) => row.closedTradeRoiPercent ?? -999, render: (row) => signedPercent(row.closedTradeRoiPercent), align: "right" },
    { key: "coveredCallRoiPercent", header: "CC ROI", value: (row) => row.coveredCallRoiPercent ?? -999, render: (row) => signedPercent(row.coveredCallRoiPercent), align: "right" },
    { key: "cashSecuredPutRoiPercent", header: "CSP ROI", value: (row) => row.cashSecuredPutRoiPercent ?? -999, render: (row) => signedPercent(row.cashSecuredPutRoiPercent), align: "right" },
    { key: "swingTradeRoiPercent", header: "Swing ROI", value: (row) => row.swingTradeRoiPercent ?? -999, render: (row) => signedPercent(row.swingTradeRoiPercent), align: "right" }
  ];
  return <DataTable rows={rows} columns={columns} empty="No monthly ROI rows yet." />;
}

function OptionCycleTable({ title, rows, empty, showCurrentExposure = false, showLiveChip = false }: { title: string; rows: OptionLifecycle[]; empty: string; showCurrentExposure?: boolean; showLiveChip?: boolean }) {
  const columns: Column<OptionLifecycle>[] = [
    { key: "openDate", header: "Open Date", value: (row) => row.openDate },
    { key: "closeDate", header: "Close Date", value: (row) => row.closeDate ?? "" },
    { key: "underlyingSymbol", header: "Symbol", value: (row) => row.underlyingSymbol },
    { key: "contracts", header: "Contracts", value: (row) => row.contracts, align: "right" },
    { key: "strikePrice", header: "Strike", value: (row) => row.strikePrice, render: (row) => formatCurrency(row.strikePrice, { maximumFractionDigits: 2 }), align: "right" },
    { key: "expirationDate", header: "Expiration", value: (row) => row.expirationDate },
    { key: "premiumReceived", header: "Premium", value: (row) => row.premiumReceived, render: (row) => formatCurrency(row.premiumReceived), align: "right" },
    { key: "closeCost", header: "BTC Cost", value: (row) => row.closeCost, render: (row) => formatCurrency(row.closeCost), align: "right" },
    { key: "netOptionPnl", header: "Net Option P&L", value: (row) => row.netOptionPnl, render: (row) => signedMoney(row.netOptionPnl), align: "right" },
    {
      key: "capitalDeployed",
      header: showCurrentExposure ? "Current Exposure" : "Capital",
      value: (row) => optionCycleCapital(row, showCurrentExposure),
      render: (row) => formatCurrency(optionCycleCapital(row, showCurrentExposure)),
      align: "right"
    },
    {
      key: "status",
      header: "Status",
      value: (row) => row.status,
      render: (row) => {
        const kindMap = {
          open: "open",
          closed: "closed",
          expired: "expired",
          assigned: "assigned",
          unresolved: "unresolved",
        } as const;
        return <StatusChip kind={kindMap[row.status] ?? "closed"} />;
      },
      align: "right"
    }
  ];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-sans text-[13px] font-medium text-foreground">{title}</h2>
        {showLiveChip && (
          <span className="inline-flex items-center rounded-full bg-pos/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-pos">
            live
          </span>
        )}
      </div>
      <DataTable rows={rows} columns={columns} empty={empty} />
    </section>
  );
}

function TradesPreview({ rows }: { rows: TradeTransaction[] }) {
  const columns: Column<TradeTransaction>[] = [
    { key: "tradeDate", header: "Date", value: (row) => row.tradeDate },
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    { key: "action", header: "Action", value: (row) => row.action, render: (row) => label(row.action) },
    { key: "quantity", header: "Qty", value: (row) => row.quantity, align: "right" },
    { key: "netAmount", header: "Net", value: (row) => row.netAmount, render: (row) => signedMoney(row.netAmount), align: "right" },
    { key: "status", header: "Status", value: (row) => row.status },
    { key: "rawDescription", header: "Raw", value: (row) => row.rawDescription }
  ];
  return <DataTable rows={rows} columns={columns} empty="No parsed rows." />;
}

function ImportIssues({ issues }: { issues: ImportPreview["issues"] }) {
  if (!issues.length) return <div className="rounded-xl border border-hairline bg-surface p-4 font-sans text-[12px] text-muted-foreground">No import warnings.</div>;
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <h3 className="font-sans text-[13px] font-medium text-foreground">Unresolved Imports</h3>
      <div className="mt-3 space-y-2">
        {issues.map((issue, index) => (
          <div key={index} className="rounded-md border border-hairline bg-surface-inset p-3 font-sans text-[11.5px] text-muted-foreground">
            Row {issue.rowIndex + 1}: {issue.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function Insights({ result, onReviewTrades }: { result: CalculationResult; onReviewTrades: (issueFilter: TradeIssueFilter, search?: string) => void }) {
  const repeatedLosses = result.aggregates.symbolBreakdown.filter((row) => row.pnl < 0 && row.trades > 1).map((row) => row.symbol);
  const openCycles = result.optionLifecycles.filter((cycle) => cycle.status === "open");
  const nearTermCutoff = addDaysIso(new Date(), 14);
  const nearTermCycles = openCycles.filter((cycle) => cycle.expirationDate <= nearTermCutoff);
  const nearTermContracts = nearTermCycles.reduce((sum, cycle) => sum + cycle.contracts, 0);
  const repeatedLosersText = repeatedLosses.length
    ? `${repeatedLosses.slice(0, 4).join(", ")}${repeatedLosses.length > 4 ? ` +${repeatedLosses.length - 4}` : ""} have repeated losses`
    : null;

  const nearTermText = nearTermCycles.length
    ? `${formatNumber(nearTermContracts)} ${nearTermContracts === 1 ? "contract" : "contracts"} expiring within 14 days · ${formatCurrency(
        nearTermCycles.reduce((sum, cycle) => sum + optionCycleCapital(cycle, true), 0)
      )} exposure`
    : null;

  const unresolvedCount = result.unresolvedTransactions.length;
  const duplicateCount = result.duplicateTransactionIds.length;

  const lines: { text: string; action?: { label: string; onClick: () => void } }[] = [];

  if (repeatedLosersText) {
    lines.push({
      text: repeatedLosersText,
      action: { label: "Review trades →", onClick: () => onReviewTrades(null, repeatedLosses[0]) }
    });
  }
  if (nearTermText) {
    lines.push({ text: nearTermText });
  }
  if (unresolvedCount > 0) {
    lines.push({
      text: `${formatNumber(unresolvedCount)} unresolved ${unresolvedCount === 1 ? "row" : "rows"} need classification.`,
      action: { label: "Review rows →", onClick: () => onReviewTrades("unresolved") }
    });
  }
  if (duplicateCount > 0) {
    lines.push({
      text: `${formatNumber(duplicateCount)} potential duplicate ${duplicateCount === 1 ? "row" : "rows"} preserved.`,
      action: { label: "Review rows →", onClick: () => onReviewTrades("duplicates") }
    });
  }

  if (lines.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Insights">
      {lines.map((line, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground">
          <span>{line.text}</span>
          {line.action && (
            <button
              type="button"
              onClick={line.action.onClick}
              className="text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
            >
              {line.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}


function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-hairline bg-surface px-3 font-sans text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      {children}
    </select>
  );
}

function IconButton({ label: buttonLabel, icon, onClick, disabled, danger }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={buttonLabel}
      aria-label={buttonLabel}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-hairline bg-surface px-3 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
        danger && "border-neg/30 text-neg hover:bg-neg/10"
      )}
    >
      {icon}
      <span>{buttonLabel}</span>
    </button>
  );
}

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-hairline bg-surface p-4">
      <h2 className="font-sans text-[13px] font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label: toggleLabel, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-3 py-2.5 transition-colors hover:bg-surface-inset">
      <span className="font-sans text-[12.5px] text-foreground">{toggleLabel}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-accent focus-visible:ring-2 focus-visible:ring-accent/40" />
    </label>
  );
}

function Segmented({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="grid rounded-md border border-hairline bg-surface-inset p-1" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}>
      {values.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            "rounded px-3 py-2 font-sans text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            value === item
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label(item)}
        </button>
      ))}
    </div>
  );
}


function downloadBackup(transactions: TradeTransaction[], settings: AppSettings) {
  const blob = new Blob([JSON.stringify(createBackup(transactions, settings), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `positioniq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function signedMoney(value: number) {
  return <span className={cn(value > 0 && "text-pos", value < 0 && "text-neg")}>{formatCurrency(value)}</span>;
}

function signedPercent(value: number | null) {
  return <span className={cn((value ?? 0) > 0 && "text-pos", (value ?? 0) < 0 && "text-neg")}>{formatPercent(value)}</span>;
}

function tone(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function label(value: string | null | undefined) {
  if (!value) return "N/A";
  if (value === "ALL") return "All";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}


function weightedRoi(events: RealizedPnLEvent[]) {
  const pnl = events.reduce((sum, row) => sum + row.realizedPnl, 0);
  const capital = events.reduce((sum, row) => sum + (row.capitalDeployed ?? 0), 0);
  return capital > 0 ? (pnl / capital) * 100 : null;
}

function displayStrategyBreakdown(result: CalculationResult) {
  const rows = new Map<string, { strategy: string; pnl: number; capital: number; roiPercent: number | null }>();
  for (const row of result.aggregates.strategyBreakdown) {
    const strategy = displayStrategy(row.strategy);
    if (!strategy) continue;
    const current = rows.get(strategy) ?? { strategy, pnl: 0, capital: 0, roiPercent: null };
    current.pnl += row.pnl;
    current.capital += row.capital;
    current.roiPercent = current.capital > 0 ? (current.pnl / current.capital) * 100 : null;
    rows.set(strategy, current);
  }
  return [...rows.values()].sort((a, b) => b.pnl - a.pnl);
}

function displayStrategy(strategy: string) {
  if (strategy === "COVERED_CALL_ASSIGNMENT") return "COVERED_CALL";
  if (strategy === "PUT_ASSIGNMENT") return "CASH_SECURED_PUT";
  if (strategy === "DATA_ISSUE" || strategy === "OTHER") return null;
  return strategy;
}

function openOptionCapital(lifecycles: OptionLifecycle[]) {
  return lifecycles.reduce((sum, row) => sum + optionCycleCapital(row, true), 0);
}

function optionCycleCapital(lifecycle: OptionLifecycle, useExposureFallback = false) {
  const recorded = lifecycle.capitalDeployed ?? 0;
  if (!useExposureFallback || recorded > 0) return recorded;
  return lifecycle.strikePrice * lifecycle.sharesControlled;
}

function addDaysIso(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}


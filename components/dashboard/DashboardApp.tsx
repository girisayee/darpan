"use client";

import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarDays,
  ChevronUp,
  CircleDollarSign,
  Download,
  FileDown,
  FileUp,
  Gauge,
  RefreshCcw,
  Search,
  Settings,
  Target,
  TrendingDown,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OverviewCharts } from "@/components/charts/DashboardCharts";
import { HeroReadout } from "@/components/dashboard/HeroReadout";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { AppHeader } from "@/components/shell/AppHeader";
import { FilterBar } from "@/components/shell/FilterBar";
import { TabNav } from "@/components/shell/TabNav";
import { Column, DataTable } from "@/components/tables/DataTable";
import { calculateDashboard } from "@/lib/calculations/engine";
import { parseRobinhoodInput, type ImportPreview } from "@/lib/import/robinhood";
import { sampleTransactions } from "@/lib/sample-data/sample-transactions";
import {
  createBackup,
  parseBackup
} from "@/lib/storage/local-store";
import { clearStore, getServerSnapshot, getStoreSnapshot, loadStore, saveStore, subscribeStore } from "@/lib/storage/server-store-client";
import { topMovers } from "@/lib/selectors/top-movers";
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
  const result = useMemo(() => filterResult(baseResult, { symbol, strategy, year, month, account }), [baseResult, symbol, strategy, year, month, account]);
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
        movers={topMovers(baseResult)}
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

      <section className="min-h-[60vh]">
        {activeTab === "Overview" && <OverviewTab result={result} settings={settings} onReviewTrades={openTrades} />}
        {activeTab === "Capital & ROI" && <CapitalTab result={result} settings={settings} onSelectEvent={setSelectedEvent} />}
        {activeTab === "Covered Calls" && <OptionsTab result={result} optionType="call" onSelectEvent={setSelectedEvent} />}
        {activeTab === "Cash-Secured Puts" && <OptionsTab result={result} optionType="put" onSelectEvent={setSelectedEvent} />}
        {activeTab === "Swing Trades" && <EventsTable title="Swing Trade Ledger" rows={result.realizedEvents.filter((event) => event.strategy === "SWING_TRADE")} onSelectEvent={setSelectedEvent} />}
        {activeTab === "Tax Lots" && <TaxLotsTab result={result} />}
        {activeTab === "Trades" && <TradesTab result={result} search={tradeSearch} onSearchChange={setTradeSearch} issueFilter={tradeIssueFilter} onIssueFilterChange={setTradeIssueFilter} />}
        {activeTab === "Import" && <ImportTab existing={storedTransactions} onSave={(rows) => replaceTransactions([...storedTransactions, ...rows])} />}
        {activeTab === "Settings" && <SettingsTab transactions={storedTransactions} settings={settings} onChange={updateSettings} onImport={(rows, importedSettings) => { void saveStore({ transactions: rows, settings: importedSettings }); }} onClear={() => { void clearStore(); }} />}
      </section>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        PositionIQ is for personal tracking and analysis only. Verify results against official brokerage and tax documents.
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
  const [showMoreKpis, setShowMoreKpis] = useState(false);
  const strategyStats = displayStrategyBreakdown(result);
  const bestStrategy = strategyStats[0];
  const worstStrategy = [...strategyStats].sort((a, b) => a.pnl - b.pnl)[0];
  const latest = result.monthlyReturns.at(-1);

  // All KPIs — curated 4 shown in strip, rest revealed via "+N more"
  const allKpis = [
    { label: "Total P&L", value: formatCurrency(result.aggregates.totalRealizedPnl), helper: "Closed realized events", tooltip: "All-time total realized P&L across all closed events.", numeric: result.aggregates.totalRealizedPnl },
    { label: "Tax Year P&L", value: formatCurrency(result.aggregates.currentYearRealizedPnl), helper: "Calendar-year realized P&L", tooltip: "Current calendar-year realized P&L.", numeric: result.aggregates.currentYearRealizedPnl },
    { label: "Monthly ROI", value: formatPercent(latest?.realizedRoiPercent), helper: "Latest month: P&L / avg deployed capital", tooltip: "Monthly realized P&L divided by average deployed capital.", numeric: latest?.realizedRoiPercent ?? 0 },
    { label: "YTD ROI", value: formatPercent(result.aggregates.ytdRoi), helper: "YTD P&L / YTD avg deployed capital", tooltip: "YTD realized P&L divided by average deployed capital.", numeric: result.aggregates.ytdRoi ?? 0 },
    { label: "Avg Monthly ROI", value: formatPercent(result.aggregates.averageMonthlyRoi), helper: "Average of months with known capital", tooltip: "Only months with known capital are included.", numeric: result.aggregates.averageMonthlyRoi ?? 0 },
    { label: "Avg Deployed", value: formatCurrency(result.aggregates.averageDeployedCapital), helper: "Avg monthly capital-days denominator", tooltip: "Average deployed capital uses daily capital exposure.", numeric: 0 },
    { label: "Peak Deployed", value: formatCurrency(result.aggregates.peakDeployedCapital), helper: "Highest daily deployed capital", tooltip: "Highest deployed capital observed in a month.", numeric: 0 },
    { label: "Options Premium", value: formatCurrency(result.aggregates.totalOptionsPremium), helper: "Closed option premium P&L", tooltip: "Net realized option premium from all closed cycles.", numeric: result.aggregates.totalOptionsPremium },
    { label: "Stock P&L", value: formatCurrency(result.aggregates.totalStockTradingPnl), helper: "Realized stock sales", tooltip: "Realized P&L from stock sales (swings and assignments).", numeric: result.aggregates.totalStockTradingPnl },
    { label: "Win Rate", value: formatPercent(result.aggregates.winRate), helper: "Winning events / total events", tooltip: "Fraction of realized events that closed profitable.", numeric: result.aggregates.winRate ?? 0 },
    { label: "Avg Win", value: formatCurrency(result.aggregates.averageWin), helper: "Average profitable event", tooltip: "Mean P&L of all winning realized events.", numeric: result.aggregates.averageWin ?? 0 },
    { label: "Avg Loss", value: formatCurrency(result.aggregates.averageLoss), helper: "Average losing event", tooltip: "Mean P&L of all losing realized events.", numeric: result.aggregates.averageLoss ?? 0 },
    { label: "Best Symbol", value: result.aggregates.bestSymbol ?? "N/A", helper: "Highest symbol P&L", tooltip: "Symbol with the largest cumulative realized P&L.", numeric: 0 },
    { label: "Worst Symbol", value: result.aggregates.worstSymbol ?? "N/A", helper: "Lowest symbol P&L", tooltip: "Symbol with the smallest (most negative) cumulative realized P&L.", numeric: 0 },
    { label: "Best Strategy", value: label(bestStrategy?.strategy), helper: "Highest strategy P&L", tooltip: "Strategy group with the largest cumulative realized P&L.", numeric: 0 },
    { label: "Worst Strategy", value: label(worstStrategy?.strategy), helper: "Lowest strategy P&L", tooltip: "Strategy group with the smallest cumulative realized P&L.", numeric: 0 },
    { label: "Closed Trades", value: formatNumber(result.realizedEvents.length), helper: "Total realized P&L events", tooltip: "Count of all realized P&L events in the current view.", numeric: 0 },
  ];

  // Curated 4 shown in StatStrip
  const stripItems = [
    { label: "Avg Win", value: formatCurrency(result.aggregates.averageWin), tone: tone(result.aggregates.averageWin ?? 0) },
    { label: "Avg Loss", value: formatCurrency(result.aggregates.averageLoss), tone: tone(result.aggregates.averageLoss ?? 0) },
    { label: "Best Symbol", value: result.aggregates.bestSymbol ?? "N/A", tone: "neutral" as const },
    { label: "Best Strategy", value: label(bestStrategy?.strategy), tone: "neutral" as const },
  ];
  const moreKpis = allKpis; // All KPIs revealed in the expanded grid
  const moreCount = moreKpis.length;

  // Sparkline: cumulative realized P&L per month
  const spark = result.monthlyReturns.map((m) => m.realizedPnl);
  // Cumulative
  const cumulativeSpark = spark.reduce<number[]>((acc, v) => {
    acc.push((acc.at(-1) ?? 0) + v);
    return acc;
  }, []);

  const annualGoal = settings.annualRealizedPnlGoal;
  const monthlyGoal = annualGoal / 12;

  return (
    <div className="space-y-3">
      {/* ── Hero row: HeroReadout + 2×2 Instrument Cluster ── */}
      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <HeroReadout
          label="Net realized P&L · all time"
          value={formatCurrency(result.aggregates.totalRealizedPnl)}
          tone={tone(result.aggregates.totalRealizedPnl)}
          spark={cumulativeSpark.length >= 2 ? cumulativeSpark : undefined}
          pills={[
            `${formatNumber(result.realizedEvents.length)} closed`,
            `${formatPercent(result.aggregates.winRate)} win`,
            `${formatCurrency(result.aggregates.averageDeployedCapital)} deployed`,
          ]}
        />
        {/* 2×2 Instrument Cluster */}
        <div className="grid grid-cols-2 gap-2">
          <KpiCard
            label="YTD ROI"
            value={formatPercent(result.aggregates.ytdRoi)}
            helper="YTD P&L / avg deployed capital"
            tooltip="YTD realized P&L divided by average deployed capital."
            tone={tone(result.aggregates.ytdRoi ?? 0)}
          />
          <KpiCard
            label="Monthly ROI"
            value={formatPercent(latest?.realizedRoiPercent)}
            helper="Latest month realized ROI"
            tooltip="Monthly realized P&L divided by average deployed capital."
            tone={tone(latest?.realizedRoiPercent ?? 0)}
          />
          <KpiCard
            label="Options Premium"
            value={formatCurrency(result.aggregates.totalOptionsPremium)}
            helper="Closed option premium P&L"
            tooltip="Net realized option premium from all closed cycles."
            tone={tone(result.aggregates.totalOptionsPremium)}
          />
          <KpiCard
            label="Stock P&L"
            value={formatCurrency(result.aggregates.totalStockTradingPnl)}
            helper="Realized stock sales"
            tooltip="Realized P&L from stock sales."
            tone={tone(result.aggregates.totalStockTradingPnl)}
          />
        </div>
      </div>

      {/* ── Goal Bars ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <GoalBar
          title="YTD goal"
          targetLabel={formatCurrency(annualGoal)}
          target={annualGoal}
          actual={result.aggregates.currentYearRealizedPnl}
          helper={`${formatCurrency(Math.max(0, annualGoal - result.aggregates.currentYearRealizedPnl))} to target`}
        />
        <GoalBar
          title="Monthly target"
          targetLabel={formatCurrency(monthlyGoal)}
          target={monthlyGoal}
          actual={latest?.realizedPnl ?? 0}
          helper={`${formatCurrency(latest?.realizedPnl ?? 0)} of ${formatCurrency(monthlyGoal)} this month`}
        />
      </div>

      {/* ── Curated StatStrip + expanded KPI grid ── */}
      <StatStrip
        items={stripItems}
        moreCount={moreCount}
        onMore={() => setShowMoreKpis((v) => !v)}
      />
      {showMoreKpis && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {moreKpis.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} helper={kpi.helper} tooltip={kpi.tooltip} tone={tone(kpi.numeric)} />
          ))}
          <div className="col-span-full flex justify-end">
            <button
              type="button"
              onClick={() => setShowMoreKpis(false)}
              className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-3 py-1.5 font-sans text-[12px] text-brand hover:bg-surface-inset"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Collapse
            </button>
          </div>
        </div>
      )}

      {/* ── Insights (two-card layout) ── */}
      <Insights result={result} onReviewTrades={onReviewTrades} />
    </div>
  );
}

/** Tape-styled flat goal bar — no shadow, surface-inset track, semantic fill */
function GoalBar({
  title,
  targetLabel,
  target,
  actual,
  helper
}: {
  title: string;
  targetLabel: string;
  target: number;
  actual: number;
  helper: string;
}) {
  const progress = target > 0 ? Math.max(0, Math.min(100, (actual / target) * 100)) : 0;
  const fillClass =
    actual < 0
      ? "bg-neg"
      : actual >= target
        ? "bg-pos"
        : "bg-brand";
  const pctClass =
    actual < 0
      ? "text-neg"
      : actual >= target
        ? "text-pos"
        : "text-foreground";
  return (
    <section className="rounded-xl border border-hairline bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-[10px] uppercase tracking-[.12em] text-text-muted">
          {title} · {targetLabel}
        </span>
        <span className={cn("font-mono text-[12px] font-medium tabular-nums", pctClass)}>
          {formatNumber(progress, 0)}%
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-inset">
        <div className={cn("h-full rounded-full transition-all", fillClass)} style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 font-mono text-[11px] tabular-nums text-text-muted">{helper}</div>
    </section>
  );
}


function CapitalTab({ result, settings, onSelectEvent }: { result: CalculationResult; settings: AppSettings; onSelectEvent: (event: RealizedPnLEvent) => void }) {
  const latest = result.monthlyReturns.at(-1);
  const bestMonth = [...result.monthlyReturns].sort((a, b) => (b.realizedRoiPercent ?? -999) - (a.realizedRoiPercent ?? -999))[0];
  const worstMonth = [...result.monthlyReturns].sort((a, b) => (a.realizedRoiPercent ?? 999) - (b.realizedRoiPercent ?? 999))[0];
  const efficiency = result.aggregates.averageMonthlyRoi === null ? null : Math.max(0, Math.min(100, 50 + result.aggregates.averageMonthlyRoi * 8));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Monthly ROI %" value={formatPercent(latest?.realizedRoiPercent)} helper="Latest month realized ROI" tooltip="Monthly realized P&L divided by average deployed capital." tone={tone(latest?.realizedRoiPercent ?? 0)} />
        <KpiCard label="YTD ROI %" value={formatPercent(result.aggregates.ytdRoi)} helper="Current-year capital return" tooltip="YTD realized P&L divided by average deployed capital." tone={tone(result.aggregates.ytdRoi ?? 0)} />
        <KpiCard label="Average Monthly ROI" value={formatPercent(result.aggregates.averageMonthlyRoi)} helper="Mean of monthly ROI values" tooltip="Only months with known capital are included." tone={tone(result.aggregates.averageMonthlyRoi ?? 0)} />
        <KpiCard label="Average Deployed Capital" value={formatCurrency(result.aggregates.averageDeployedCapital)} helper="Capital-days / days" tooltip="Average deployed capital uses daily capital exposure." />
        <KpiCard label="Peak Deployed Capital" value={formatCurrency(result.aggregates.peakDeployedCapital)} helper="Largest daily exposure" tooltip="Highest deployed capital observed in a month." />
        <KpiCard label="Capital Efficiency" value={efficiency === null ? "N/A" : formatNumber(efficiency, 0)} helper="Directional score" tooltip="Simple score based on average monthly ROI." tone={tone((efficiency ?? 50) - 50)} />
        <KpiCard label="Best ROI Month" value={bestMonth ? `${bestMonth.year}-${String(bestMonth.month).padStart(2, "0")}` : "N/A"} helper={formatPercent(bestMonth?.realizedRoiPercent)} tooltip="Month with highest ROI." tone="positive" />
        <KpiCard label="Worst ROI Month" value={worstMonth ? `${worstMonth.year}-${String(worstMonth.month).padStart(2, "0")}` : "N/A"} helper={formatPercent(worstMonth?.realizedRoiPercent)} tooltip="Month with lowest ROI." tone="negative" />
      </div>
      <OverviewCharts result={result} annualGoal={settings.annualRealizedPnlGoal} />
      <MonthlyRoiTable rows={result.monthlyReturns} />
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
        <KpiCard
          label={optionType === "call" ? "Current CC Capital" : "Current CSP Collateral"}
          value={formatCurrency(currentCapital)}
          helper={`${formatNumber(openContracts)} open ${openContracts === 1 ? "contract" : "contracts"}`}
          tooltip={optionType === "call" ? "Stock capital currently tied to open covered calls. If basis is missing, strike exposure is used as a proxy." : "Collateral currently tied to open cash-secured puts."}
        />
      </div>
      <OptionCycleTable title={optionType === "call" ? "Open Covered Calls" : "Open Cash-Secured Puts"} rows={openLifecycles} empty="No open option cycles in this tab." showCurrentExposure />
      <OptionCycleTable title={optionType === "call" ? "All Covered Call Cycles" : "All Cash-Secured Put Cycles"} rows={lifecycles} empty="No option cycles yet." />
      <EventsTable title={optionType === "call" ? "Covered Call Results" : "Cash-Secured Put Results"} rows={events} onSelectEvent={onSelectEvent} />
    </div>
  );
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
    { key: "status", header: "Status", value: (row) => row.status, render: (row) => label(row.status) },
    { key: "notes", header: "Notes", value: (row) => row.notes ?? "" }
  ];
  return <DataTable rows={result.taxLots} columns={columns} empty="No tax lots yet." />;
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
    { key: "status", header: "Status", value: (row) => row.status }
  ];
  return (
    <div className="space-y-3">
      {issueFilter && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
          <span>{issueFilter === "unresolved" ? "Showing unresolved rows that need classification or an ignore decision." : "Showing likely duplicate rows preserved during import."}</span>
          <button
            type="button"
            className="rounded-md border border-warning/30 bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            onClick={() => onIssueFilterChange(null)}
          >
            Clear issue filter
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-panel">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search trades" className="w-full bg-transparent text-sm outline-none" />
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
      <section className="rounded-lg border bg-card p-4 shadow-panel">
        <h2 className="text-lg font-semibold">Robinhood Import</h2>
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
          className="mt-4 h-80 w-full resize-none rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/40"
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
          <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground shadow-panel">No import preview yet.</div>
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
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Annual realized P&L goal</span>
          <div className="flex items-center rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/30">
            <span className="text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.annualRealizedPnlGoal}
              onChange={(event) => onChange({ ...settings, annualRealizedPnlGoal: Math.max(0, Number(event.target.value) || 0) })}
              className="h-10 w-full bg-transparent px-2 text-sm outline-none"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Monthly pace: {formatCurrency(settings.annualRealizedPnlGoal / 12)}
          </span>
        </label>
        <div className="rounded-md border bg-muted/45 p-3 text-sm text-muted-foreground">
          Imported trade data is stored in the local SQLite database at <span className="font-mono">data/positioniq.sqlite</span>.
        </div>
      </SettingsPanel>
      <SettingsPanel title="Cost Basis">
        <Segmented value={settings.costBasisMethod} values={["FIFO", "LIFO", "AVERAGE"]} onChange={(value) => onChange({ ...settings, costBasisMethod: value as AppSettings["costBasisMethod"] })} />
        <div className="rounded-md border bg-muted/45 p-3">
          <div className="text-sm font-medium">Manual basis overrides</div>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(settings.manualCostBasisPerShare)
              .filter(([symbol]) => symbol !== "PAYPAL")
              .map(([symbol, basis]) => (
                <div key={symbol} className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="font-mono text-xs font-semibold">{symbol}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(basis, { maximumFractionDigits: 2 })}/share</span>
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-md border bg-muted/45 p-3">
          <div className="text-sm font-medium">Zero-basis lots</div>
          <div className="mt-2 grid gap-2 text-sm">
            {settings.manualZeroBasisLots.map((lot) => (
              <div key={`${lot.symbol}-${lot.quantity}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                <span className="font-mono text-xs font-semibold">{lot.symbol}</span>
                <span className="tabular-nums text-muted-foreground">{formatNumber(lot.quantity, 5)} shares at $0 basis</span>
                {lot.note && <span className="w-full text-xs text-muted-foreground">{lot.note}</span>}
              </div>
            ))}
          </div>
        </div>
      </SettingsPanel>
      <SettingsPanel title="Capital Calculation">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Covered call denominator</span>
          <Select value={settings.coveredCallDenominator} onChange={(value) => onChange({ ...settings, coveredCallDenominator: value as AppSettings["coveredCallDenominator"] })}>
            <option value="UNDERLYING_COST_BASIS">Underlying stock cost basis</option>
            <option value="CURRENT_MARKET_VALUE">Current market value if available</option>
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Cash-secured put denominator</span>
          <Select value={settings.cashSecuredPutDenominator} onChange={(value) => onChange({ ...settings, cashSecuredPutDenominator: value as AppSettings["cashSecuredPutDenominator"] })}>
            <option value="CONSERVATIVE_COLLATERAL">Conservative collateral: strike * shares</option>
            <option value="NET_COLLATERAL_AFTER_PREMIUM">Net collateral after premium</option>
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Monthly ROI denominator</span>
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

function EventsTable({ title, rows, onSelectEvent }: { title: string; rows: RealizedPnLEvent[]; onSelectEvent: (event: RealizedPnLEvent) => void }) {
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
      <h2 className="text-lg font-semibold">{title}</h2>
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

function OptionCycleTable({ title, rows, empty, showCurrentExposure = false }: { title: string; rows: OptionLifecycle[]; empty: string; showCurrentExposure?: boolean }) {
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
    { key: "status", header: "Status", value: (row) => row.status }
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
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
  if (!issues.length) return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-panel">No import warnings.</div>;
  return (
    <div className="rounded-lg border bg-card p-4 shadow-panel">
      <h3 className="font-semibold">Unresolved Imports</h3>
      <div className="mt-3 space-y-2">
        {issues.map((issue, index) => (
          <div key={index} className="rounded-md border bg-muted/45 p-3 text-sm">
            Row {issue.rowIndex + 1}: {issue.message}
          </div>
        ))}
      </div>
    </div>
  );
}

type InsightItem = {
  title: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "warning" | "primary";
  icon: React.ElementType;
  actionLabel?: string;
  onAction?: () => void;
};

function Insights({ result, onReviewTrades }: { result: CalculationResult; onReviewTrades: (issueFilter: TradeIssueFilter, search?: string) => void }) {
  const repeatedLosses = result.aggregates.symbolBreakdown.filter((row) => row.pnl < 0 && row.trades > 1).map((row) => row.symbol);
  const openCycles = result.optionLifecycles.filter((cycle) => cycle.status === "open");
  const openContracts = openCycles.reduce((sum, cycle) => sum + cycle.contracts, 0);
  const openCapital = openOptionCapital(openCycles);
  const openPremium = openCycles.reduce((sum, cycle) => sum + cycle.premiumReceived - cycle.closeCost, 0);
  const nearTermCutoff = addDaysIso(new Date(), 14);
  const nearTermCycles = openCycles.filter((cycle) => cycle.expirationDate <= nearTermCutoff);
  const nearTermContracts = nearTermCycles.reduce((sum, cycle) => sum + cycle.contracts, 0);
  const missingBasisEvents = result.realizedEvents.filter((event) => event.warnings.some((warning) => /missing cost basis|capital deployed/i.test(warning)));
  const negativeMonths = result.monthlyReturns.filter((row) => row.realizedPnl < 0);
  const profitableMonths = result.monthlyReturns.filter((row) => row.realizedPnl > 0);
  const highCapital = [...result.monthlyReturns].sort((a, b) => b.averageDeployedCapital - a.averageDeployedCapital)[0];
  const topThreeSymbolPnl = result.aggregates.symbolBreakdown.slice(0, 3).reduce((sum, row) => sum + Math.max(0, row.pnl), 0);
  const positiveSymbolPnl = result.aggregates.symbolBreakdown.reduce((sum, row) => sum + Math.max(0, row.pnl), 0);
  const concentration = positiveSymbolPnl > 0 ? (topThreeSymbolPnl / positiveSymbolPnl) * 100 : null;
  const workingInsights: InsightItem[] = [
    {
      title: "Positive Months",
      value: `${formatNumber(profitableMonths.length)} / ${formatNumber(result.monthlyReturns.length)}`,
      detail: profitableMonths.length ? "Most recent profitable month is included in the monthly chart trend." : "No positive realized-P&L months yet in this view.",
      tone: profitableMonths.length ? "positive" as const : "neutral" as const,
      icon: CalendarDays
    },
    {
      title: "Open Premium Base",
      value: formatCurrency(openPremium),
      detail: `${formatNumber(openContracts)} open ${openContracts === 1 ? "contract" : "contracts"} currently carrying premium.`,
      tone: openPremium > 0 ? "positive" as const : "neutral" as const,
      icon: CircleDollarSign
    },
    {
      title: "Capital Context",
      value: highCapital ? `${highCapital.year}-${String(highCapital.month).padStart(2, "0")}` : "N/A",
      detail: highCapital ? `${formatCurrency(highCapital.averageDeployedCapital)} average deployed. ${highCapitalInsight(result)}` : "No capital usage data yet.",
      tone: "primary" as const,
      icon: Gauge
    }
  ];
  const attentionInsights: InsightItem[] = [
    {
      title: "Data Cleanup",
      value: formatNumber(result.unresolvedTransactions.length),
      detail: result.unresolvedTransactions.length ? "Unresolved rows are skipped by calculations until classified or ignored." : "No unresolved rows in this view.",
      tone: result.unresolvedTransactions.length ? "warning" as const : "neutral" as const,
      icon: AlertTriangle,
      actionLabel: result.unresolvedTransactions.length ? "Review rows" : undefined,
      onAction: result.unresolvedTransactions.length ? () => onReviewTrades("unresolved") : undefined
    },
    {
      title: "Duplicate Review",
      value: formatNumber(result.duplicateTransactionIds.length),
      detail: result.duplicateTransactionIds.length ? "Potential duplicate rows are preserved. Review before deleting because split fills can look duplicated." : "No duplicate warnings in this view.",
      tone: result.duplicateTransactionIds.length ? "warning" as const : "neutral" as const,
      icon: Brain,
      actionLabel: result.duplicateTransactionIds.length ? "Review rows" : undefined,
      onAction: result.duplicateTransactionIds.length ? () => onReviewTrades("duplicates") : undefined
    },
    {
      title: "Open Option Exposure",
      value: formatCurrency(openCapital),
      detail: `${formatNumber(openContracts)} open ${openContracts === 1 ? "contract" : "contracts"} across CC/CSP cycles.`,
      tone: openCapital > 0 ? "primary" as const : "neutral" as const,
      icon: CircleDollarSign
    },
    {
      title: "Near-Term Expirations",
      value: formatNumber(nearTermContracts),
      detail: nearTermCycles.length ? `${nearTermCycles.map((cycle) => `${cycle.underlyingSymbol} ${cycle.expirationDate}`).join(", ")} within 14 days.` : "No open option expirations in the next 14 days.",
      tone: nearTermContracts ? "warning" as const : "neutral" as const,
      icon: CalendarDays
    },
    {
      title: "Basis Review",
      value: formatNumber(missingBasisEvents.length),
      detail: missingBasisEvents.length ? "Some realized events have missing or fallback capital basis. Check cost-basis overrides." : "Realized events have usable basis or explicit fallbacks.",
      tone: missingBasisEvents.length ? "warning" as const : "neutral" as const,
      icon: Target
    },
    {
      title: "Negative Months",
      value: formatNumber(negativeMonths.length),
      detail: negativeMonths.length ? `${negativeMonths.map((row) => `${row.year}-${String(row.month).padStart(2, "0")}`).join(", ")} closed below zero.` : "No negative realized-P&L months in this view.",
      tone: negativeMonths.length ? "negative" as const : "neutral" as const,
      icon: TrendingDown
    },
    {
      title: "Repeated Losses",
      value: repeatedLosses.length ? repeatedLosses.join(", ") : "None",
      detail: repeatedLosses.length ? "These symbols have repeated losing events in the current filters." : "No repeated symbol losses in the current view.",
      tone: repeatedLosses.length ? "warning" as const : "neutral" as const,
      icon: Brain
    },
    {
      title: "P&L Concentration",
      value: formatPercent(concentration, 0),
      detail: "Share of positive symbol P&L coming from the top three symbols.",
      tone: (concentration ?? 0) > 75 ? "warning" as const : "primary" as const,
      icon: Gauge
    }
  ];
  // Compose the two featured insight cards (Tape mockup style)
  const repeatedLosersText = repeatedLosses.length
    ? `${repeatedLosses.slice(0, 4).join(", ")}${repeatedLosses.length > 4 ? ` +${repeatedLosses.length - 4}` : ""} down across 2+ closes`
    : "No repeated symbol losses in the current view.";

  const nearTermText = nearTermCycles.length
    ? `${formatNumber(nearTermContracts)} ${nearTermContracts === 1 ? "contract" : "contracts"} · ${formatCurrency(
        nearTermCycles.reduce((sum, cycle) => sum + optionCycleCapital(cycle, true), 0)
      )} exposure`
    : "No open option expirations in the next 14 days.";

  return (
    <div className="space-y-3">
      {/* ── Two featured insight cards (Tape layout) ── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Repeated losers — neg accent */}
        <div className="flex-1 rounded-r-xl border border-hairline border-l-0 bg-surface pl-0 overflow-hidden">
          <div className="flex h-full border-l-2 border-neg rounded-r-xl">
            <div className="flex-1 px-4 py-3">
              <div className="font-sans text-[12.5px] font-medium text-foreground">Repeated losers</div>
              <div className="mt-1 font-sans text-[11.5px] text-text-muted">
                {repeatedLosses.length > 0 ? (
                  <>
                    {repeatedLosersText}{" "}
                    <button
                      type="button"
                      onClick={() => onReviewTrades(null, repeatedLosses[0])}
                      className="text-neg underline-offset-2 hover:underline"
                    >
                      — review
                    </button>
                  </>
                ) : (
                  repeatedLosersText
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Expiring soon — brand accent */}
        <div className="flex-1 rounded-r-xl border border-hairline border-l-0 bg-surface pl-0 overflow-hidden">
          <div className="flex h-full border-l-2 border-brand rounded-r-xl">
            <div className="flex-1 px-4 py-3">
              <div className="font-sans text-[12.5px] font-medium text-foreground">Expiring ≤14 days</div>
              <div className="mt-1 font-mono text-[11.5px] tabular-nums text-text-muted">{nearTermText}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Full insight grid (all working + attention signals) ── */}
      <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="grid gap-px bg-hairline xl:grid-cols-[0.8fr_1.2fr]">
          <InsightGroup title="What's Working" items={workingInsights} />
          <InsightGroup title="Needs Attention" items={attentionInsights} />
        </div>
      </section>
    </div>
  );
}

function InsightGroup({ title, items }: { title: string; items: InsightItem[] }) {
  return (
    <section className="bg-surface">
      <div className="border-b border-hairline bg-surface-inset px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[.12em] text-text-muted">{title}</div>
      <div className="grid gap-px bg-hairline md:grid-cols-2 xl:grid-cols-3">
        {items.map((insight) => (
          <InsightCard key={insight.title} {...insight} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({
  title,
  value,
  detail,
  tone: insightTone,
  icon: Icon,
  actionLabel,
  onAction
}: {
  title: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "warning" | "primary";
  icon: React.ElementType;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article className="group relative flex min-h-40 flex-col bg-surface p-4 transition hover:bg-surface-inset">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          insightTone === "positive" && "bg-pos",
          insightTone === "negative" && "bg-neg",
          insightTone === "warning" && "bg-warn",
          insightTone === "primary" && "bg-brand",
          insightTone === "neutral" && "bg-hairline"
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="font-sans text-[10px] font-semibold uppercase tracking-[.12em] text-text-muted">{title}</div>
        <span
          className={cn(
            "rounded-md border p-2 transition group-hover:scale-105",
            insightTone === "positive" && "border-pos/25 bg-pos/10 text-pos",
            insightTone === "negative" && "border-neg/25 bg-neg/10 text-neg",
            insightTone === "warning" && "border-warn/25 bg-warn/10 text-warn",
            insightTone === "primary" && "border-brand/25 bg-brand/10 text-brand",
            insightTone === "neutral" && "border-hairline bg-surface-inset text-text-muted"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div
        className={cn(
          "mt-3 font-mono text-xl font-medium tabular-nums",
          insightTone === "positive" && "text-pos",
          insightTone === "negative" && "text-neg",
          insightTone === "warning" && "text-warn",
          insightTone === "primary" && "text-brand",
          insightTone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </div>
      <p className="mt-2 font-sans text-[11.5px] leading-5 text-text-muted">{detail}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 font-sans text-[11px] font-semibold text-foreground hover:bg-surface-inset"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </article>
  );
}

function DetailDrawer({ event, onClose, transactions }: { event: RealizedPnLEvent | null; onClose: () => void; transactions: TradeTransaction[] }) {
  if (!event) return null;
  const linked = transactions.filter((transaction) => event.linkedTransactionIds.includes(transaction.id));
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onClick={onClose}>
      <aside className="scrollbar-thin h-full w-full max-w-xl overflow-auto bg-card p-5 shadow-2xl" onClick={(click) => click.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">How this was calculated</p>
            <h2 className="mt-1 text-2xl font-semibold">{event.symbol} {label(event.strategy)}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border p-2 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Metric label="Proceeds" value={formatCurrency(event.grossProceeds)} />
          <Metric label="Cost Basis" value={formatCurrency(event.costBasis)} />
          <Metric label="Premium" value={signedMoney(event.optionPremium)} />
          <Metric label="Fees" value={formatCurrency(event.fees)} />
          <Metric label="Capital Deployed" value={formatCurrency(event.capitalDeployed)} />
          <Metric label="ROI Formula" value={`${formatCurrency(event.realizedPnl)} / ${formatCurrency(event.capitalDeployed)}`} />
          <Metric label="Final Realized P&L" value={signedMoney(event.realizedPnl)} />
          <Metric label="ROI %" value={signedPercent(event.roiPercent)} />
        </div>
        <section className="mt-5 rounded-lg border p-4">
          <h3 className="font-semibold">Explanation</h3>
          <p className="mt-2 text-sm text-muted-foreground">{event.explanation}</p>
        </section>
        <section className="mt-5 rounded-lg border p-4">
          <h3 className="font-semibold">Linked Transactions</h3>
          <div className="mt-2 space-y-2">
            {linked.map((transaction) => (
              <div key={transaction.id} className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="font-medium">{transaction.tradeDate} · {transaction.symbol} · {label(transaction.action)}</div>
                <div className="text-muted-foreground">{transaction.rawDescription}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-5 rounded-lg border p-4">
          <h3 className="font-semibold">Warnings</h3>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            {event.warnings.length ? event.warnings.map((warning) => <div key={warning}>{warning}</div>) : <div>None</div>}
          </div>
        </section>
      </aside>
    </div>
  );
}


function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40">
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
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
        danger && "border-danger/30 text-danger hover:bg-danger/10"
      )}
    >
      {icon}
      <span>{buttonLabel}</span>
    </button>
  );
}

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow-panel">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Settings className="h-4 w-4" /> {title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label: toggleLabel, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <span>{toggleLabel}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  );
}

function Segmented({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-3 rounded-md border bg-muted p-1">
      {values.map((item) => (
        <button key={item} type="button" onClick={() => onChange(item)} className={cn("rounded px-3 py-2 text-sm font-medium text-muted-foreground", value === item && "bg-card text-foreground shadow-sm")}>
          {label(item)}
        </button>
      ))}
    </div>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{metricLabel}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function filterResult(result: CalculationResult, filters: { symbol: string; strategy: string; year: string; month: string; account: string }): CalculationResult {
  const eventFilter = (event: RealizedPnLEvent) =>
    (filters.symbol === "ALL" || event.symbol === filters.symbol) &&
    (filters.strategy === "ALL" || event.strategy === filters.strategy) &&
    (filters.year === "ALL" || event.date.slice(0, 4) === filters.year) &&
    (filters.month === "ALL" || event.date.slice(5, 7) === filters.month);
  const transactionFilter = (transaction: TradeTransaction) =>
    (filters.symbol === "ALL" || transaction.symbol === filters.symbol) &&
    (filters.year === "ALL" || transaction.tradeDate.slice(0, 4) === filters.year) &&
    (filters.month === "ALL" || transaction.tradeDate.slice(5, 7) === filters.month) &&
    (filters.account === "ALL" || transaction.accountName === filters.account);
  const nextEvents = result.realizedEvents.filter(eventFilter);
  const nextTransactions = result.transactions.filter(transactionFilter);
  const recalculated = calculateDashboard(nextTransactions);
  return { ...recalculated, realizedEvents: nextEvents };
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
  return <span className={cn(value > 0 && "text-success", value < 0 && "text-danger")}>{formatCurrency(value)}</span>;
}

function signedPercent(value: number | null) {
  return <span className={cn((value ?? 0) > 0 && "text-success", (value ?? 0) < 0 && "text-danger")}>{formatPercent(value)}</span>;
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

function highCapitalInsight(result: CalculationResult) {
  const rows = result.monthlyReturns.filter((row) => row.averageDeployedCapital > 0);
  if (!rows.length) return "Capital efficiency insight: N/A.";
  const highPnl = [...rows].sort((a, b) => b.realizedPnl - a.realizedPnl)[0];
  const highRoi = [...rows].sort((a, b) => (b.realizedRoiPercent ?? -999) - (a.realizedRoiPercent ?? -999))[0];
  if (highPnl && highRoi && highPnl !== highRoi) {
    return `${highPnl.year}-${String(highPnl.month).padStart(2, "0")} drove P&L, while ${highRoi.year}-${String(highRoi.month).padStart(2, "0")} had stronger ROI.`;
  }
  return "P&L and ROI leaders are aligned in the current view.";
}

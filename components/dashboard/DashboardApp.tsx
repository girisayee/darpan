"use client";

import {
  Download,
  FileUp,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DetailDrawer } from "@/components/dashboard/DetailDrawer";
import { ReviewFixPanel } from "@/components/dashboard/ReviewFixPanel";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { OverviewTab } from "@/components/dashboard/tabs/OverviewTab";
import { OptionsTab } from "@/components/dashboard/tabs/OptionsTab";
import { PerformanceTab } from "@/components/dashboard/tabs/PerformanceTab";
import { SwingTradesTab } from "@/components/dashboard/tabs/SwingTradesTab";
import { AppShell } from "@/components/shell/AppShell";
import { Column, DataTable } from "@/components/tables/DataTable";
import { calculateDashboard } from "@/lib/calculations/engine";
import { parseRobinhoodInput, type ImportPreview } from "@/lib/import/robinhood";
import { sampleTransactions } from "@/lib/sample-data/sample-transactions";
import { filterResult } from "@/lib/selectors/filter-result";
import { createBackup } from "@/lib/storage/local-store";
import {
  getServerSnapshot,
  getStoreSnapshot,
  loadStore,
  saveStore,
  subscribeStore
} from "@/lib/storage/server-store-client";
import { useTheme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDisplayDate, formatNumber } from "@/lib/utils/format";
import type {
  AppSettings,
  OptionLifecycle,
  RealizedPnLEvent,
  TradeTransaction
} from "@/types/trading";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { ManualEntryCard } from "@/components/dashboard/ReviewFixPanel";

const tabs = [
  "Overview",
  "Options",
  "Swing trades",
  "Performance",
] as const;

type PrimaryTab = (typeof tabs)[number];
type Tab = PrimaryTab | "Import" | "Settings";

export function DashboardApp() {
  const store = useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerSnapshot);
  const settings = store.settings;
  const storedTransactions = store.transactions;
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const { theme, toggle } = useTheme();
  const [account, setAccount] = useState("ALL");
  const [year, setYear] = useState("2026");
  const [selectedEvent, setSelectedEvent] = useState<RealizedPnLEvent | null>(null);
  const [selectedLifecycle, setSelectedLifecycle] = useState<OptionLifecycle | null>(null);
  const [reviewFixOpen, setReviewFixOpen] = useState(false);

  useEffect(() => {
    void loadStore();
  }, []);

  const allTransactions = useMemo(
    () => [...(settings.showSampleData ? sampleTransactions : []), ...storedTransactions],
    [settings.showSampleData, storedTransactions]
  );

  const baseResult = useMemo(
    () => calculateDashboard(allTransactions, settings),
    [allTransactions, settings]
  );

  const result = useMemo(
    () => filterResult(baseResult, { symbol: "ALL", strategy: "ALL", year, month: "ALL", account }, settings),
    [baseResult, year, account, settings]
  );

  const accounts = useMemo(
    () => ["ALL", ...new Set(allTransactions.map((t) => t.accountName).filter(Boolean).sort())],
    [allTransactions]
  );

  const years = useMemo(() => {
    const fromData = new Set(allTransactions.map((t) => t.tradeDate.slice(0, 4)).filter(Boolean));
    fromData.add("2026");
    return [...fromData].sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);

  function updateSettings(next: AppSettings) {
    void saveStore({ settings: { ...next, showSampleData: false } });
  }

  function replaceTransactions(next: TradeTransaction[]) {
    void saveStore({ transactions: next });
  }

  function addTransactions(txs: TradeTransaction[]) {
    void saveStore({ transactions: [...storedTransactions, ...txs] });
  }

  function updateTransaction(updated: TradeTransaction) {
    void saveStore({ transactions: storedTransactions.map((t) => t.id === updated.id ? updated : t) });
  }

  function deleteTransaction(id: string) {
    void saveStore({ transactions: storedTransactions.filter((t) => t.id !== id) });
  }

  const manualTransactions = useMemo(
    () => storedTransactions.filter((t) => t.importBatchId === "manual" || t.tags.includes("manual")),
    [storedTransactions]
  );

  const primaryTabs = tabs as readonly string[];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-0 sm:px-6 lg:px-8">
      {/* Unified chrome: logo + nav pills + account switcher + actions */}
      <AppShell
        tabs={primaryTabs}
        activeTab={activeTab === "Import" || activeTab === "Settings" ? "Overview" : activeTab}
        onSelectTab={(t) => setActiveTab(t as Tab)}
        years={years}
        year={year}
        onYear={setYear}
        accounts={accounts}
        account={account}
        onAccount={setAccount}
        theme={theme}
        onToggleTheme={toggle}
        onImport={() => setActiveTab("Import")}
        onSettings={() => setActiveTab("Settings")}
        onExport={() => downloadBackup(allTransactions, settings)}
      />

      {!store.loaded && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface p-3 text-sm text-muted-foreground">
          Loading SQLite data...
        </div>
      )}
      {store.error && (
        <div className="mt-3 rounded-lg border border-neg/30 bg-neg/10 p-3 text-sm text-neg">
          {store.error}
        </div>
      )}

      <section
        className="min-h-[60vh] py-4 pb-16 md:pb-0"
        role="tabpanel"
        id="dashboard-tabpanel"
        tabIndex={0}
        aria-label={activeTab}
      >
        {activeTab === "Overview" && (
          <OverviewTab
            result={result}
            settings={settings}
          />
        )}
        {activeTab === "Options" && (
          <OptionsTab
            result={result}
            onSelectLifecycle={setSelectedLifecycle}
            onReviewFix={() => setReviewFixOpen(true)}
          />
        )}
        {activeTab === "Swing trades" && (
          <SwingTradesTab
            result={result}
            onSelectEvent={setSelectedEvent}
            onReviewFix={() => setReviewFixOpen(true)}
          />
        )}
        {activeTab === "Performance" && (
          <PerformanceTab result={result} annualGoal={settings.annualRealizedPnlGoal} onSelectEvent={setSelectedEvent} />
        )}
        {activeTab === "Import" && (
          <ImportTab
            existing={storedTransactions}
            onSave={(rows) => replaceTransactions([...storedTransactions, ...rows])}
          />
        )}
        {activeTab === "Settings" && (
          <SettingsTab
            settings={settings}
            onChange={updateSettings}
            manualTransactions={manualTransactions}
            onUpdateTransaction={updateTransaction}
            onDeleteTransaction={deleteTransaction}
          />
        )}
      </section>

      <DetailDrawer
        event={selectedEvent}
        lifecycle={selectedLifecycle}
        onClose={() => {
          setSelectedEvent(null);
          setSelectedLifecycle(null);
        }}
        transactions={result.transactions}
        events={result.realizedEvents}
        taxLots={result.taxLots}
        onReviewFix={() => {
          setSelectedEvent(null);
          setSelectedLifecycle(null);
          setReviewFixOpen(true);
        }}
      />

      <ReviewFixPanel
        open={reviewFixOpen}
        onClose={() => setReviewFixOpen(false)}
        result={result}
        onAddTransactions={addTransactions}
        manualTransactions={manualTransactions}
        onUpdateTransaction={updateTransaction}
        onDeleteTransaction={deleteTransaction}
      />
    </main>
  );
}

// ── Import tab ────────────────────────────────────────────────────────────────

function ImportTab({
  existing,
  onSave,
}: {
  existing: TradeTransaction[];
  onSave: (rows: TradeTransaction[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const normalizedRows = preview?.rows ?? [];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Robinhood Import
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <IconButton
            label="Upload CSV"
            onClick={() => fileInput.current?.click()}
            icon={<FileUp className="h-4 w-4" />}
          />
          <IconButton
            label="Parse Rows"
            onClick={() => setPreview(parseRobinhoodInput(raw, existing))}
            icon={<RefreshCcw className="h-4 w-4" />}
          />
          <IconButton
            label="Save Import"
            onClick={() => {
              if (preview) onSave(normalizedRows);
            }}
            icon={<Download className="h-4 w-4" />}
            disabled={!preview}
          />
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
              <KpiCard
                label="Imported Rows"
                value={formatNumber(preview.rows.length)}
                helper="Parsed row count"
                tooltip="Rows read from pasted or uploaded CSV."
              />
              <KpiCard
                label="Skipped Duplicates"
                value={formatNumber(preview.duplicateIds.length)}
                helper="Likely duplicate rows"
                tooltip="Duplicate detection uses date, symbol, action, quantity, price, amount, and raw description."
                tone={preview.duplicateIds.length ? "negative" : "neutral"}
              />
              <KpiCard
                label="Unresolved"
                value={formatNumber(
                  preview.rows.filter((r) => r.status === "unresolved").length
                )}
                helper="Needs classification"
                tooltip="Rows with missing or ambiguous fields."
                tone={
                  preview.rows.some((r) => r.status === "unresolved")
                    ? "negative"
                    : "neutral"
                }
              />
              <KpiCard
                label="Warnings"
                value={formatNumber(preview.issues.length)}
                helper="Validation messages"
                tooltip="Missing fields, unknown actions, or duplicates."
                tone={preview.issues.length ? "negative" : "neutral"}
              />
            </div>
            <TradesPreview rows={preview.rows} />
            <ImportIssues issues={preview.issues} />
          </>
        ) : (
          <div className="rounded-xl border border-hairline bg-surface p-8 font-sans text-sm text-muted-foreground">
            No import preview yet.
          </div>
        )}
      </section>
    </div>
  );
}

function TradesPreview({ rows }: { rows: TradeTransaction[] }) {
  const columns: Column<TradeTransaction>[] = [
    {
      key: "tradeDate",
      header: "Date",
      value: (row) => row.tradeDate,
      render: (row) => formatDisplayDate(row.tradeDate),
    },
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    {
      key: "action",
      header: "Action",
      value: (row) => row.action,
      render: (row) => label(row.action),
    },
    {
      key: "quantity",
      header: "Qty",
      value: (row) => row.quantity,
      align: "right",
    },
    {
      key: "netAmount",
      header: "Net",
      value: (row) => row.netAmount,
      render: (row) => signedMoney(row.netAmount),
      align: "right",
      tooltip: "Gross amount − fees.",
    },
    { key: "status", header: "Status", value: (row) => row.status },
    { key: "rawDescription", header: "Raw", value: (row) => row.rawDescription },
  ];
  return <DataTable rows={rows} columns={columns} empty="No parsed rows." searchable pageSize={25} />;
}

function ImportIssues({ issues }: { issues: ImportPreview["issues"] }) {
  if (!issues.length) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-4 font-sans text-[12px] text-muted-foreground">
        No import warnings.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <h3 className="font-sans text-[13px] font-medium text-foreground">
        Unresolved Imports
      </h3>
      <div className="mt-3 space-y-2">
        {issues.map((issue, index) => (
          <div
            key={index}
            className="rounded-md border border-hairline bg-surface-inset p-3 font-sans text-[11.5px] text-muted-foreground"
          >
            Row {issue.rowIndex + 1}: {issue.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  settings,
  onChange,
  manualTransactions,
  onUpdateTransaction,
  onDeleteTransaction,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  manualTransactions: TradeTransaction[];
  onUpdateTransaction: (updated: TradeTransaction) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingsPanel title="General">
        <Toggle
          label="Include fees in P&L"
          checked={settings.includeFees}
          onChange={(checked) => onChange({ ...settings, includeFees: checked })}
        />
        <Toggle
          label="Annualized return"
          checked={settings.annualizedReturn}
          onChange={(checked) =>
            onChange({ ...settings, annualizedReturn: checked })
          }
        />
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Annual realized P&amp;L goal
          </span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.annualRealizedPnlGoal}
              onChange={(event) =>
                onChange({
                  ...settings,
                  annualRealizedPnlGoal: Math.max(0, Number(event.target.value) || 0),
                })
              }
              className="h-10 w-full bg-transparent px-2 font-sans text-[13px] tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
            Monthly pace: {formatCurrency(settings.annualRealizedPnlGoal / 12)}
          </span>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Max buying power
          </span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.maxBuyingPower ?? 125000}
              onChange={(event) =>
                onChange({
                  ...settings,
                  maxBuyingPower: Math.max(0, Number(event.target.value) || 0),
                })
              }
              className="h-10 w-full bg-transparent px-2 font-sans text-[13px] tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
            Used for buying-power utilization
          </span>
        </label>
        <div className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">Cost basis method</span>
          <Segmented
            value={settings.costBasisMethod}
            values={["FIFO", "LIFO", "AVERAGE"]}
            onChange={(value) =>
              onChange({ ...settings, costBasisMethod: value as AppSettings["costBasisMethod"] })
            }
          />
        </div>
      </SettingsPanel>
      <SettingsPanel title="Capital Calculation">
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Covered call denominator
          </span>
          <Select
            value={settings.coveredCallDenominator}
            onChange={(value) =>
              onChange({
                ...settings,
                coveredCallDenominator: value as AppSettings["coveredCallDenominator"],
              })
            }
          >
            <option value="UNDERLYING_COST_BASIS">Underlying stock cost basis</option>
            <option value="CURRENT_MARKET_VALUE">Current market value if available</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Cash-secured put denominator
          </span>
          <Select
            value={settings.cashSecuredPutDenominator}
            onChange={(value) =>
              onChange({
                ...settings,
                cashSecuredPutDenominator: value as AppSettings["cashSecuredPutDenominator"],
              })
            }
          >
            <option value="CONSERVATIVE_COLLATERAL">Conservative collateral: strike * shares</option>
            <option value="NET_COLLATERAL_AFTER_PREMIUM">Net collateral after premium</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Monthly ROI denominator
          </span>
          <Select
            value={settings.monthlyRoiDenominator}
            onChange={(value) =>
              onChange({
                ...settings,
                monthlyRoiDenominator: value as AppSettings["monthlyRoiDenominator"],
              })
            }
          >
            <option value="AVERAGE_DEPLOYED_CAPITAL">Average deployed capital</option>
            <option value="PEAK_DEPLOYED_CAPITAL">Peak deployed capital</option>
            <option value="CLOSED_TRADE_CAPITAL">Closed trade capital</option>
          </Select>
        </label>
      </SettingsPanel>
      <div className="lg:col-span-2">
        <SettingsPanel title="Manual entries">
          {manualTransactions.length === 0 ? (
            <p className="font-sans text-[12px] text-muted-foreground">
              No manually-added transactions yet.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="font-sans text-[11.5px] text-muted-foreground">
                {manualTransactions.length} manually-added transaction{manualTransactions.length !== 1 ? "s" : ""}.
              </p>
              {manualTransactions.map((tx) => (
                <ManualEntryCard
                  key={tx.id}
                  tx={tx}
                  onUpdate={onUpdateTransaction}
                  onDelete={onDeleteTransaction}
                />
              ))}
            </div>
          )}
        </SettingsPanel>
      </div>
    </div>
  );
}

// ── Shared UI primitives (Settings/Import only) ───────────────────────────────

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-hairline bg-surface px-3 font-sans text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
    </select>
  );
}

function IconButton({
  label: buttonLabel,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
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

function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-hairline bg-surface p-4">
      <h2 className="font-sans text-[13px] font-medium text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label: toggleLabel,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-3 py-2.5 transition-colors hover:bg-surface-inset">
      <span className="font-sans text-[12.5px] text-foreground">
        {toggleLabel}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent focus-visible:ring-2 focus-visible:ring-accent/40"
      />
    </label>
  );
}

function Segmented({
  value,
  values,
  onChange,
}: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="grid rounded-md border border-hairline bg-surface-inset p-1"
      style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}
    >
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

// ── Utilities ─────────────────────────────────────────────────────────────────

function downloadBackup(transactions: TradeTransaction[], settings: AppSettings) {
  const blob = new Blob(
    [JSON.stringify(createBackup(transactions, settings), null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `positioniq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

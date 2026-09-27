"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DetailDrawer, type SymbolSummary } from "@/components/dashboard/DetailDrawer";
import { ReviewFixPanel } from "@/components/dashboard/ReviewFixPanel";
import { AppShell } from "@/components/shell/AppShell";
import { calculateDashboard } from "@/lib/calculations/engine";
import { sampleTransactions } from "@/lib/sample-data/sample-transactions";
import { filterResult } from "@/lib/selectors/filter-result";
import { createBackup } from "@/lib/storage/local-store";
import {
  getServerSnapshot,
  getStoreSnapshot,
  loadStore,
  saveStore,
  subscribeStore,
} from "@/lib/storage/server-store-client";
import { useTheme } from "@/lib/theme/use-theme";
import type {
  AppSettings,
  CalculationResult,
  OptionLifecycle,
  RealizedPnLEvent,
  TradeTransaction,
  TradingAccount,
} from "@/types/trading";

const PRIMARY_TABS = ["Home", "Monthly", "Tickers", "Positions", "Taxes"] as const;

type DashboardContextValue = {
  result: CalculationResult;
  dataLoaded: boolean;
  settings: AppSettings;
  year: string;
  selectedAccountIds: string[];
  storedTransactions: TradeTransaction[];
  manualTransactions: TradeTransaction[];
  onSelectEvent: (e: RealizedPnLEvent | null) => void;
  onSelectLifecycle: (l: OptionLifecycle | null) => void;
  onSelectSymbol: (s: SymbolSummary | null) => void;
  openReviewFix: () => void;
  updateSettings: (s: AppSettings) => void;
  replaceTransactions: (t: TradeTransaction[]) => void;
  addTransactions: (t: TradeTransaction[]) => void;
  updateTransaction: (t: TradeTransaction) => void;
  deleteTransaction: (id: string) => void;
  accounts: TradingAccount[];
  defaultAccountId: string | null;
  createAccount: (name: string) => Promise<void>;
  renameAccount: (id: string, name: string) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardShell");
  return ctx;
}

/** Map a pathname to the primary nav pill that should read as active. */
function pathToTab(pathname: string): string {
  if (pathname.startsWith("/monthly") || pathname.startsWith("/performance")) return "Monthly";
  if (pathname.startsWith("/tickers")) return "Tickers";
  if (pathname.startsWith("/positions")) return "Positions";
  if (pathname.startsWith("/taxes")) return "Taxes";
  return "Home"; // /, /import, /settings all show the Home pill
}

function tabHref(tab: string, year: string, accounts: string): string {
  const path = tab === "Home" ? "/" : `/${tab.toLowerCase()}`;
  const params = new URLSearchParams({ year });
  if (accounts) params.set("accounts", accounts);
  return `${path}?${params.toString()}`;
}

export function DashboardShell({
  user,
  children,
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  children: ReactNode;
}) {
  const store = useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerSnapshot);
  const settings = store.settings;
  const storedTransactions = store.transactions;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, toggle } = useTheme();
  const year = searchParams.get("year") ?? "2026";
  const accountsParam = searchParams.get("accounts") ?? "";
  const selectedAccountIds = accountsParam ? accountsParam.split(",").filter(Boolean) : [];
  const [selectedEvent, setSelectedEvent] = useState<RealizedPnLEvent | null>(null);
  const [selectedLifecycle, setSelectedLifecycle] = useState<OptionLifecycle | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolSummary | null>(null);
  const [reviewFixOpen, setReviewFixOpen] = useState(false);

  useEffect(() => {
    void loadStore();
  }, []);

  const [accountList, setAccountList] = useState<TradingAccount[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: TradingAccount[] }) => {
        if (!cancelled) setAccountList(d.accounts ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const defaultAccountId = accountList.find((a) => a.isDefault)?.id ?? accountList[0]?.id ?? null;

  async function mutateAccounts(promise: Promise<Response>) {
    const r = await promise;
    if (r.ok) setAccountList(((await r.json()) as { accounts: TradingAccount[] }).accounts);
  }
  const createAccount = (name: string) =>
    mutateAccounts(
      fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    );
  const renameAccount = (id: string, name: string) =>
    mutateAccounts(
      fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    );
  const deleteAccount = (id: string) =>
    mutateAccounts(fetch(`/api/accounts/${id}`, { method: "DELETE" }));

  const allTransactions = useMemo(
    () => [...(settings.showSampleData ? sampleTransactions : []), ...storedTransactions],
    [settings.showSampleData, storedTransactions]
  );

  const baseResult = useMemo(
    () => calculateDashboard(allTransactions, settings),
    [allTransactions, settings]
  );

  const result = useMemo(
    () => filterResult(baseResult, { symbol: "ALL", strategy: "ALL", year, month: "ALL", accountIds: selectedAccountIds }, settings),
    // accountsParam is the stable string form of selectedAccountIds
    [baseResult, year, accountsParam, settings] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const years = useMemo(() => {
    const fromData = new Set(allTransactions.map((t) => t.tradeDate.slice(0, 4)).filter(Boolean));
    fromData.add("2026");
    return [...fromData].sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);

  const manualTransactions = useMemo(
    () => storedTransactions.filter((t) => t.importBatchId === "manual" || t.tags.includes("manual")),
    [storedTransactions]
  );

  function setYear(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", next);
    if (pathname === "/monthly" || pathname === "/performance") params.delete("month");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setSelectedAccounts(ids: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (ids.length) params.set("accounts", ids.join(","));
    else params.delete("accounts");
    router.replace(`${pathname}?${params.toString()}`);
  }

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
    void saveStore({ transactions: storedTransactions.map((t) => (t.id === updated.id ? updated : t)) });
  }
  function deleteTransaction(id: string) {
    void saveStore({ transactions: storedTransactions.filter((t) => t.id !== id) });
  }
  function assignAccount(transactionIds: string[], accountId: string) {
    const idSet = new Set(transactionIds);
    void saveStore({
      transactions: storedTransactions.map((t) => (idSet.has(t.id) ? { ...t, accountId } : t)),
    });
  }

  const activeTab = pathToTab(pathname);

  const ctx: DashboardContextValue = {
    result,
    dataLoaded: store.loaded,
    settings,
    year,
    selectedAccountIds,
    storedTransactions,
    manualTransactions,
    onSelectEvent: setSelectedEvent,
    onSelectLifecycle: setSelectedLifecycle,
    onSelectSymbol: setSelectedSymbol,
    openReviewFix: () => setReviewFixOpen(true),
    updateSettings,
    replaceTransactions,
    addTransactions,
    updateTransaction,
    deleteTransaction,
    accounts: accountList,
    defaultAccountId,
    createAccount,
    renameAccount,
    deleteAccount,
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-0 sm:px-6 lg:px-8">
      <AppShell
        tabs={PRIMARY_TABS}
        activeTab={activeTab}
        onSelectTab={(t) => router.push(tabHref(t, year, accountsParam))}
        years={years}
        year={year}
        onYear={setYear}
        accounts={accountList}
        selectedAccountIds={selectedAccountIds}
        onSelectAccounts={setSelectedAccounts}
        theme={theme}
        onToggleTheme={toggle}
        onImport={() => router.push("/import")}
        onSettings={() => router.push("/settings")}
        onManageEntries={() => router.push("/entries")}
        onExport={() => downloadBackup(allTransactions, settings)}
        user={user}
        maskAmounts={settings.maskAmounts ?? false}
        onToggleMaskAmounts={() => updateSettings({ ...settings, maskAmounts: !settings.maskAmounts })}
      />

      {!store.loaded && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface p-3 text-sm text-muted-foreground">
          Loading your data…
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
        <DashboardContext.Provider value={ctx}>{children}</DashboardContext.Provider>
      </section>

      <DetailDrawer
        event={selectedEvent}
        lifecycle={selectedLifecycle}
        symbol={selectedSymbol}
        onClose={() => {
          setSelectedEvent(null);
          setSelectedLifecycle(null);
          setSelectedSymbol(null);
        }}
        onBack={() => {
          setSelectedEvent(null);
          setSelectedLifecycle(null);
        }}
        transactions={result.transactions}
        events={result.realizedEvents}
        optionLifecycles={result.optionLifecycles}
        taxLots={result.taxLots}
        onSelectEvent={setSelectedEvent}
        onSelectLifecycle={setSelectedLifecycle}
        onReviewFix={() => {
          setSelectedEvent(null);
          setSelectedLifecycle(null);
          setSelectedSymbol(null);
          setReviewFixOpen(true);
        }}
        accounts={accountList}
        onAssignAccount={assignAccount}
        maskAmounts={settings.maskAmounts ?? false}
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

function downloadBackup(transactions: TradeTransaction[], settings: AppSettings) {
  const blob = new Blob(
    [JSON.stringify(createBackup(transactions, settings), null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `darpan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

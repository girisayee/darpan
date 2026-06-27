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
} from "@/types/trading";

const PRIMARY_TABS = ["Home", "Performance", "Tickers", "Positions"] as const;

type DashboardContextValue = {
  result: CalculationResult;
  settings: AppSettings;
  year: string;
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
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardShell");
  return ctx;
}

/** Map a pathname to the primary nav pill that should read as active. */
function pathToTab(pathname: string): string {
  if (pathname.startsWith("/performance")) return "Performance";
  if (pathname.startsWith("/tickers")) return "Tickers";
  if (pathname.startsWith("/positions")) return "Positions";
  return "Home"; // /home, /import, /settings all show the Home pill
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
  const [account, setAccount] = useState("ALL");
  const year = searchParams.get("year") ?? "2026";
  const [selectedEvent, setSelectedEvent] = useState<RealizedPnLEvent | null>(null);
  const [selectedLifecycle, setSelectedLifecycle] = useState<OptionLifecycle | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolSummary | null>(null);
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

  const manualTransactions = useMemo(
    () => storedTransactions.filter((t) => t.importBatchId === "manual" || t.tags.includes("manual")),
    [storedTransactions]
  );

  function setYear(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", next);
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

  const activeTab = pathToTab(pathname);

  const ctx: DashboardContextValue = {
    result,
    settings,
    year,
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
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-0 sm:px-6 lg:px-8">
      <AppShell
        tabs={PRIMARY_TABS}
        activeTab={activeTab}
        onSelectTab={(t) => router.push(`/${t.toLowerCase()}`)}
        years={years}
        year={year}
        onYear={setYear}
        accounts={accounts}
        account={account}
        onAccount={setAccount}
        theme={theme}
        onToggleTheme={toggle}
        onImport={() => router.push("/import")}
        onSettings={() => router.push("/settings")}
        onExport={() => downloadBackup(allTransactions, settings)}
        user={user}
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
        capitalUsage={result.capitalUsage}
        onSelectEvent={setSelectedEvent}
        onSelectLifecycle={setSelectedLifecycle}
        onReviewFix={() => {
          setSelectedEvent(null);
          setSelectedLifecycle(null);
          setSelectedSymbol(null);
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

import type { AppSettings, TradeTransaction } from "@/types/trading";
import { defaultSettings, normalizeAppSettings } from "@/lib/storage/local-store";

type StoreSnapshot = {
  transactions: TradeTransaction[];
  settings: AppSettings;
  loaded: boolean;
  error: string | null;
};

let snapshot: StoreSnapshot = {
  transactions: [],
  settings: normalizeAppSettings(defaultSettings),
  loaded: false,
  error: null
};

const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreSnapshot() {
  return snapshot;
}

export function getServerSnapshot() {
  return snapshot;
}

export function loadStore() {
  if (loading) return loading;
  loading = fetch("/api/store", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Unable to load SQLite store.");
      return response.json() as Promise<{ transactions: TradeTransaction[]; settings: AppSettings }>;
    })
    .then((data) => {
      snapshot = {
        transactions: data.transactions,
        settings: normalizeAppSettings(data.settings),
        loaded: true,
        error: null
      };
      emit();
    })
    .catch((error: Error) => {
      snapshot = { ...snapshot, loaded: true, error: error.message };
      emit();
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export async function saveStore(next: { transactions?: TradeTransaction[]; settings?: AppSettings }) {
  const response = await fetch("/api/store", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next)
  });
  if (!response.ok) throw new Error("Unable to save SQLite store.");
  const data = (await response.json()) as { transactions: TradeTransaction[]; settings: AppSettings };
  snapshot = {
    transactions: data.transactions,
    settings: normalizeAppSettings(data.settings),
    loaded: true,
    error: null
  };
  emit();
}

export async function clearStore() {
  const response = await fetch("/api/store", { method: "DELETE" });
  if (!response.ok) throw new Error("Unable to clear SQLite store.");
  const data = (await response.json()) as { transactions: TradeTransaction[]; settings: AppSettings };
  snapshot = {
    transactions: data.transactions,
    settings: normalizeAppSettings(data.settings),
    loaded: true,
    error: null
  };
  emit();
}

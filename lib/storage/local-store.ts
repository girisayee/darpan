import type { AppSettings, TradeTransaction } from "@/types/trading";

const TRANSACTIONS_KEY = "darpan.transactions.v1";
const SETTINGS_KEY = "darpan.settings.v1";

// Legacy localStorage keys, read once to migrate previously-saved data into the
// current keys. Kept solely for that migration — never written to.
const LEGACY_TRANSACTION_KEYS = ["positioniq.transactions.v1", "realizededge.transactions.v1"];
const LEGACY_SETTINGS_KEYS = ["positioniq.settings.v1", "realizededge.settings.v1"];

export const defaultSettings: AppSettings = {
  showSampleData: true,
  defaultDateRange: "ALL",
  includeFees: true,
  annualRealizedPnlGoal: 40000,
  maxBuyingPower: 125000,
  costBasisMethod: "FIFO",
  coveredCallDenominator: "UNDERLYING_COST_BASIS",
  cashSecuredPutDenominator: "CONSERVATIVE_COLLATERAL",
  monthlyRoiDenominator: "AVERAGE_DEPLOYED_CAPITAL",
  annualizedReturn: true
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  transactions: TradeTransaction[];
  settings: AppSettings;
};

function readFirst(keys: string[]): string | null {
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

export function loadTransactions(): TradeTransaction[] {
  if (typeof window === "undefined") return [];
  const raw = readFirst([TRANSACTIONS_KEY, ...LEGACY_TRANSACTION_KEYS]);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TradeTransaction[];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: TradeTransaction[]) {
  window.localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;
  const raw = readFirst([SETTINGS_KEY, ...LEGACY_SETTINGS_KEYS]);
  if (!raw) return defaultSettings;
  try {
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearLocalData() {
  for (const key of [TRANSACTIONS_KEY, SETTINGS_KEY, ...LEGACY_TRANSACTION_KEYS, ...LEGACY_SETTINGS_KEYS]) {
    window.localStorage.removeItem(key);
  }
}

export function createBackup(transactions: TradeTransaction[], settings: AppSettings): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    settings
  };
}

export function parseBackup(raw: string): BackupPayload {
  const parsed = JSON.parse(raw) as BackupPayload;
  if (parsed.version !== 1 || !Array.isArray(parsed.transactions) || !parsed.settings) {
    throw new Error("Backup file is not a Darpan v1 backup.");
  }
  return parsed;
}

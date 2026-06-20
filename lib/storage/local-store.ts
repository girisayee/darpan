import type { AppSettings, TradeTransaction } from "@/types/trading";

const TRANSACTIONS_KEY = "positioniq.transactions.v1";
const SETTINGS_KEY = "positioniq.settings.v1";
const LEGACY_TRANSACTIONS_KEY = "realizededge.transactions.v1";
const LEGACY_SETTINGS_KEY = "realizededge.settings.v1";

export const defaultSettings: AppSettings = {
  showSampleData: true,
  defaultDateRange: "ALL",
  includeFees: true,
  annualRealizedPnlGoal: 40000,
  maxBuyingPower: 125000,
  costBasisMethod: "FIFO",
  manualCostBasisPerShare: {
    IREN: 49.25,
    AGQ: 74.3,
    SLV: 36.85,
    PYPL: 79,
    PAYPAL: 79
  },
  manualZeroBasisLots: [
    {
      symbol: "PYPL",
      quantity: 0.11481,
      note: "Dividend share with zero cost basis."
    }
  ],
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

export function loadTransactions(): TradeTransaction[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TRANSACTIONS_KEY) ?? window.localStorage.getItem(LEGACY_TRANSACTIONS_KEY);
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
  const raw = window.localStorage.getItem(SETTINGS_KEY) ?? window.localStorage.getItem(LEGACY_SETTINGS_KEY);
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
  window.localStorage.removeItem(TRANSACTIONS_KEY);
  window.localStorage.removeItem(SETTINGS_KEY);
  window.localStorage.removeItem(LEGACY_TRANSACTIONS_KEY);
  window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
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
    throw new Error("Backup file is not a PositionIQ v1 backup.");
  }
  return parsed;
}

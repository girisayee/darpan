import type { AppSettings, TradeTransaction } from "@/types/trading";

export const defaultSettings: AppSettings = {
  showSampleData: true,
  defaultDateRange: "ALL",
  includeFees: true,
  annualRealizedPnlGoal: 40000,
  maxBuyingPower: 125000,
  costBasisMethod: "FIFO",
  coveredCallDenominator: "UNDERLYING_COST_BASIS",
  cashSecuredPutDenominator: "CONSERVATIVE_COLLATERAL",
  annualizedReturn: true,
  showSwingOpenPositions: false
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  transactions: TradeTransaction[];
  settings: AppSettings;
};

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

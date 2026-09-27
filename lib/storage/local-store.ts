import type { AppSettings, TaxEstimateSettings, TradeTransaction } from "@/types/trading";

export const defaultTaxEstimateSettings: TaxEstimateSettings = {
  shortTermRate: 24,
  longTermRate: 15,
  filingStatus: "single",
  projectedMagi: null,
  otherNetInvestmentIncome: 0,
  stateLocalRate: null,
  taxableAccountIds: [],
  confirmed: false,
};

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
  trackAgainstGoal: true,
  showSwingOpenPositions: false,
  maskAmounts: false,
  taxEstimate: defaultTaxEstimateSettings,
};

const FILING_STATUSES = new Set<TaxEstimateSettings["filingStatus"]>([
  "single",
  "married_joint",
  "married_separate",
  "head_of_household",
]);

function rate(value: unknown, fallback: number | null): number | null {
  if (value === null && fallback === null) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : fallback;
}

function dollars(value: unknown, fallback: number | null): number | null {
  if (value === null && fallback === null) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

export function normalizeTaxEstimateSettings(value: unknown): TaxEstimateSettings {
  const raw = value && typeof value === "object"
    ? value as Partial<TaxEstimateSettings>
    : {};
  return {
    shortTermRate: rate(raw.shortTermRate, defaultTaxEstimateSettings.shortTermRate)!,
    longTermRate: rate(raw.longTermRate, defaultTaxEstimateSettings.longTermRate)!,
    filingStatus: FILING_STATUSES.has(raw.filingStatus as TaxEstimateSettings["filingStatus"])
      ? raw.filingStatus as TaxEstimateSettings["filingStatus"]
      : defaultTaxEstimateSettings.filingStatus,
    projectedMagi: dollars(raw.projectedMagi, null),
    otherNetInvestmentIncome: dollars(raw.otherNetInvestmentIncome, defaultTaxEstimateSettings.otherNetInvestmentIncome)!,
    stateLocalRate: rate(raw.stateLocalRate, null),
    taxableAccountIds: Array.isArray(raw.taxableAccountIds)
      ? [...new Set(raw.taxableAccountIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [],
    confirmed: raw.confirmed === true,
  };
}

/** Merge settings read from older JSONB rows while deeply normalizing tax assumptions. */
export function normalizeAppSettings(value: unknown, showSampleData = false): AppSettings {
  const raw = value && typeof value === "object" ? value as Partial<AppSettings> : {};
  return {
    ...defaultSettings,
    ...raw,
    showSampleData,
    taxEstimate: normalizeTaxEstimateSettings(raw.taxEstimate),
  };
}

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

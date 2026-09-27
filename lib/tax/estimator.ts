import type {
  FilingStatus,
  TaxEstimate,
  TaxEstimateIncompleteFlag,
  TaxEstimateInputs,
  TaxYearSummary,
} from "./types";

const NIIT_RATE_PERCENT = 3.8;

export const NIIT_THRESHOLDS_CENTS: Readonly<Record<FilingStatus, number>> = Object.freeze({
  SINGLE: 20_000_000,
  HEAD_OF_HOUSEHOLD: 20_000_000,
  MARRIED_FILING_JOINTLY: 25_000_000,
  MARRIED_FILING_SEPARATELY: 12_500_000,
  QUALIFYING_SURVIVING_SPOUSE: 25_000_000,
});

/** Planning estimate only: it intentionally does not model brackets, carryovers, or state-specific rules. */
export function estimateTaxes(
  summary: TaxYearSummary,
  inputs: TaxEstimateInputs,
): TaxEstimate {
  const flags = new Set<TaxEstimateIncompleteFlag>(summary.incompleteFlags);
  const taxable = netCapitalBuckets(
    summary.shortTerm.netGainLossCents,
    summary.longTerm.netGainLossCents,
  );

  const shortRate = validatedRate(
    inputs.shortTermFederalRatePercent,
    taxable.shortTermGainCents > 0,
    "SHORT_TERM_FEDERAL_RATE_REQUIRED",
    flags,
  );
  const longRate = validatedRate(
    inputs.longTermFederalRatePercent,
    taxable.longTermGainCents > 0,
    "LONG_TERM_FEDERAL_RATE_REQUIRED",
    flags,
  );
  const federalShortTermCents = taxable.shortTermGainCents === 0
    ? 0
    : shortRate === null ? null : taxAtRate(taxable.shortTermGainCents, shortRate);
  const federalLongTermCents = taxable.longTermGainCents === 0
    ? 0
    : longRate === null ? null : taxAtRate(taxable.longTermGainCents, longRate);
  const federalCents = federalShortTermCents === null || federalLongTermCents === null
    ? null
    : federalShortTermCents + federalLongTermCents;

  const niit = estimateNiit(summary, inputs, flags);
  const positiveNetCapitalGain = Math.max(0, summary.netCapitalGainLossCents);
  const stateRate = validatedStateRate(inputs.stateLocalEffectiveRatePercent, positiveNetCapitalGain > 0, flags);
  const stateLocalCents = positiveNetCapitalGain === 0
    ? 0
    : stateRate === null ? null : taxAtRate(positiveNetCapitalGain, stateRate);

  if (summary.netCapitalGainLossCents < 0) {
    flags.add("CAPITAL_LOSS_DEDUCTION_NOT_ESTIMATED");
  }

  const components = [federalCents, niit.niitCents, stateLocalCents];
  const knownTaxSubtotalCents = components.reduce<number>((sum, component) => sum + (component ?? 0), 0);
  const incompleteFlags = Object.freeze([...flags]);
  const isComplete = incompleteFlags.length === 0 && components.every((component) => component !== null);

  return Object.freeze({
    taxYear: summary.taxYear,
    taxableShortTermGainCents: taxable.shortTermGainCents,
    taxableLongTermGainCents: taxable.longTermGainCents,
    federalShortTermCents,
    federalLongTermCents,
    federalCents,
    niitCents: niit.niitCents,
    stateLocalCents,
    knownTaxSubtotalCents,
    totalTaxCents: isComplete ? knownTaxSubtotalCents : null,
    niitThresholdCents: niit.thresholdCents,
    netInvestmentIncomeCents: niit.netInvestmentIncomeCents,
    magiExcessCents: niit.magiExcessCents,
    isComplete,
    incompleteFlags,
  });
}

function netCapitalBuckets(
  shortTermNetCents: number,
  longTermNetCents: number,
): { shortTermGainCents: number; longTermGainCents: number } {
  if (shortTermNetCents >= 0 && longTermNetCents >= 0) {
    return { shortTermGainCents: shortTermNetCents, longTermGainCents: longTermNetCents };
  }
  if (shortTermNetCents < 0 && longTermNetCents > 0) {
    const net = shortTermNetCents + longTermNetCents;
    return { shortTermGainCents: 0, longTermGainCents: Math.max(0, net) };
  }
  if (shortTermNetCents > 0 && longTermNetCents < 0) {
    const net = shortTermNetCents + longTermNetCents;
    return { shortTermGainCents: Math.max(0, net), longTermGainCents: 0 };
  }
  return { shortTermGainCents: 0, longTermGainCents: 0 };
}

function estimateNiit(
  summary: TaxYearSummary,
  inputs: TaxEstimateInputs,
  flags: Set<TaxEstimateIncompleteFlag>,
): {
  niitCents: number | null;
  thresholdCents: number | null;
  netInvestmentIncomeCents: number | null;
  magiExcessCents: number | null;
} {
  if (!inputs.filingStatus) flags.add("NIIT_FILING_STATUS_REQUIRED");
  if (inputs.projectedMagiCents === undefined) flags.add("NIIT_PROJECTED_MAGI_REQUIRED");
  if (inputs.otherNetInvestmentIncomeCents === undefined) flags.add("NIIT_OTHER_INCOME_REQUIRED");
  if (
    (inputs.projectedMagiCents !== undefined && (!Number.isFinite(inputs.projectedMagiCents) || inputs.projectedMagiCents < 0)) ||
    (inputs.otherNetInvestmentIncomeCents !== undefined && !Number.isFinite(inputs.otherNetInvestmentIncomeCents))
  ) {
    flags.add("INVALID_NIIT_INPUT");
  }

  const hasInvalidInput = flags.has("INVALID_NIIT_INPUT");
  if (!inputs.filingStatus || inputs.projectedMagiCents === undefined || inputs.otherNetInvestmentIncomeCents === undefined || hasInvalidInput) {
    return {
      niitCents: null,
      thresholdCents: inputs.filingStatus ? NIIT_THRESHOLDS_CENTS[inputs.filingStatus] : null,
      netInvestmentIncomeCents: null,
      magiExcessCents: null,
    };
  }

  const thresholdCents = NIIT_THRESHOLDS_CENTS[inputs.filingStatus];
  const netInvestmentIncomeCents = Math.max(
    0,
    summary.netCapitalGainLossCents + Math.round(inputs.otherNetInvestmentIncomeCents),
  );
  const magiExcessCents = Math.max(0, Math.round(inputs.projectedMagiCents) - thresholdCents);
  return {
    niitCents: taxAtRate(Math.min(netInvestmentIncomeCents, magiExcessCents), NIIT_RATE_PERCENT),
    thresholdCents,
    netInvestmentIncomeCents,
    magiExcessCents,
  };
}

function validatedRate(
  rate: number | undefined,
  required: boolean,
  requiredFlag: "SHORT_TERM_FEDERAL_RATE_REQUIRED" | "LONG_TERM_FEDERAL_RATE_REQUIRED",
  flags: Set<TaxEstimateIncompleteFlag>,
): number | null {
  if (!required) return 0;
  if (rate === undefined) {
    flags.add(requiredFlag);
    return null;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    flags.add("INVALID_FEDERAL_RATE");
    return null;
  }
  return rate;
}

function validatedStateRate(
  rate: number | undefined,
  required: boolean,
  flags: Set<TaxEstimateIncompleteFlag>,
): number | null {
  if (!required) return 0;
  if (rate === undefined) {
    flags.add("STATE_LOCAL_RATE_REQUIRED");
    return null;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    flags.add("INVALID_STATE_LOCAL_RATE");
    return null;
  }
  return rate;
}

function taxAtRate(amountCents: number, ratePercent: number): number {
  return Math.round((amountCents * ratePercent) / 100);
}

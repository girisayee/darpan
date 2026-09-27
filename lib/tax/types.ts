export type StockLotMethod = "FIFO" | "LIFO";

export type TaxHoldingTerm = "SHORT_TERM" | "LONG_TERM" | "UNKNOWN";

export type TaxDispositionCategory =
  | "STOCK"
  | "OPTION"
  | "OPTION_ASSIGNMENT_ADJUSTMENT"
  | "UNSUPPORTED";

export type TaxDispositionInclusion =
  | "INCLUDED"
  | "EXCLUDED_UNKNOWN_BASIS"
  | "EXCLUDED_UNSUPPORTED";

export type TaxAccount = {
  readonly key: string;
  readonly accountId?: string;
  readonly accountName: string;
};

export type StockTaxLot = {
  readonly id: string;
  readonly account: TaxAccount;
  readonly symbol: string;
  readonly acquiredDate: string;
  readonly originalQuantity: number;
  readonly remainingQuantity: number;
  readonly originalBasisCents: number;
  readonly remainingBasisCents: number;
  readonly sourceTransactionId: string;
  readonly status: "OPEN" | "PARTIALLY_CLOSED" | "CLOSED";
};

export type TaxDisposition = {
  readonly id: string;
  readonly source: "STOCK_LEDGER" | "CALCULATION_EVENT";
  readonly sourceEventId?: string;
  readonly category: TaxDispositionCategory;
  readonly inclusion: TaxDispositionInclusion;
  readonly exclusionReason?: string;
  readonly account: TaxAccount;
  readonly symbol: string;
  readonly acquiredDate: string | null;
  readonly disposedDate: string;
  readonly quantity: number;
  readonly proceedsCents: number;
  readonly costBasisCents: number | null;
  readonly feesCents: number;
  readonly gainLossCents: number | null;
  readonly term: TaxHoldingTerm;
  readonly linkedTransactionIds: readonly string[];
};

export type TaxDomainIssueCode =
  | "INVALID_DATE"
  | "INVALID_QUANTITY"
  | "UNKNOWN_BASIS"
  | "UNSUPPORTED_REALIZED_EVENT"
  | "AMBIGUOUS_ACCOUNT";

export type TaxDomainIssue = {
  readonly code: TaxDomainIssueCode;
  readonly message: string;
  readonly transactionId?: string;
  readonly eventId?: string;
};

export type StockLotLedger = {
  readonly method: StockLotMethod;
  readonly lots: readonly StockTaxLot[];
  readonly dispositions: readonly TaxDisposition[];
  readonly issues: readonly TaxDomainIssue[];
};

export type TaxDispositionBuildResult = {
  readonly dispositions: readonly TaxDisposition[];
  readonly issues: readonly TaxDomainIssue[];
};

export type PotentialWashSaleCandidate = {
  readonly id: string;
  readonly lossDispositionId: string;
  readonly replacementPurchaseTransactionId: string;
  readonly account: TaxAccount;
  readonly symbol: string;
  readonly lossDisposedDate: string;
  readonly replacementPurchaseDate: string;
  readonly daysFromSale: number;
  readonly lossCents: number;
  readonly lossQuantity: number;
  readonly replacementQuantity: number;
};

export type TaxTermSummary = {
  readonly proceedsCents: number;
  readonly costBasisCents: number;
  readonly realizedGainCents: number;
  readonly realizedLossCents: number;
  readonly netGainLossCents: number;
  readonly dispositionCount: number;
};

export type TaxCategorySummary = TaxTermSummary;

export type TaxSummaryIncompleteFlag =
  | "UNKNOWN_BASIS_DISPOSITIONS_EXCLUDED"
  | "UNKNOWN_HOLDING_PERIOD"
  | "UNSUPPORTED_EVENTS_EXCLUDED";

export type TaxYearSummary = {
  readonly taxYear: number;
  readonly shortTerm: TaxTermSummary;
  readonly longTerm: TaxTermSummary;
  readonly total: TaxTermSummary;
  readonly byCategory: Readonly<Partial<Record<TaxDispositionCategory, TaxCategorySummary>>>;
  readonly includedDispositionCount: number;
  readonly excludedDispositionCount: number;
  readonly excludedProceedsCents: number;
  readonly netCapitalGainLossCents: number;
  readonly incompleteFlags: readonly TaxSummaryIncompleteFlag[];
};

export type FilingStatus =
  | "SINGLE"
  | "HEAD_OF_HOUSEHOLD"
  | "MARRIED_FILING_JOINTLY"
  | "MARRIED_FILING_SEPARATELY"
  | "QUALIFYING_SURVIVING_SPOUSE";

export type TaxEstimateInputs = {
  /** User-entered marginal rate, expressed as a percent (for example, 24). */
  readonly shortTermFederalRatePercent?: number;
  /** User-entered long-term capital-gain rate, expressed as a percent. */
  readonly longTermFederalRatePercent?: number;
  readonly filingStatus?: FilingStatus;
  readonly projectedMagiCents?: number;
  readonly otherNetInvestmentIncomeCents?: number;
  /** User-entered combined state/local effective rate, expressed as a percent. */
  readonly stateLocalEffectiveRatePercent?: number;
};

export type TaxEstimateIncompleteFlag =
  | TaxSummaryIncompleteFlag
  | "SHORT_TERM_FEDERAL_RATE_REQUIRED"
  | "LONG_TERM_FEDERAL_RATE_REQUIRED"
  | "INVALID_FEDERAL_RATE"
  | "NIIT_FILING_STATUS_REQUIRED"
  | "NIIT_PROJECTED_MAGI_REQUIRED"
  | "NIIT_OTHER_INCOME_REQUIRED"
  | "INVALID_NIIT_INPUT"
  | "STATE_LOCAL_RATE_REQUIRED"
  | "INVALID_STATE_LOCAL_RATE"
  | "CAPITAL_LOSS_DEDUCTION_NOT_ESTIMATED";

export type TaxEstimate = {
  readonly taxYear: number;
  readonly taxableShortTermGainCents: number;
  readonly taxableLongTermGainCents: number;
  readonly federalShortTermCents: number | null;
  readonly federalLongTermCents: number | null;
  readonly federalCents: number | null;
  readonly niitCents: number | null;
  readonly stateLocalCents: number | null;
  /** Sum of every component that could be calculated. */
  readonly knownTaxSubtotalCents: number;
  /** Null whenever any tax component or source disposition is incomplete. */
  readonly totalTaxCents: number | null;
  readonly niitThresholdCents: number | null;
  readonly netInvestmentIncomeCents: number | null;
  readonly magiExcessCents: number | null;
  readonly isComplete: boolean;
  readonly incompleteFlags: readonly TaxEstimateIncompleteFlag[];
};

export type SourceBroker = "Robinhood";

export type InstrumentType = "stock" | "option" | "cash" | "other";

export type TradeAction =
  | "BUY"
  | "SELL"
  | "SELL_TO_OPEN"
  | "BUY_TO_CLOSE"
  | "BUY_TO_OPEN"
  | "SELL_TO_CLOSE"
  | "ASSIGNMENT"
  | "EXPIRATION"
  | "DIVIDEND"
  | "FEE"
  | "TRANSFER"
  | "OTHER";

export type TransactionStatus = "normalized" | "unresolved" | "ignored";
export type OptionType = "call" | "put" | null;
export type Strategy =
  | "COVERED_CALL"
  | "CASH_SECURED_PUT"
  | "COVERED_CALL_ASSIGNMENT"
  | "COVERED_CALL_ASSIGNMENT_STOCK"
  | "PUT_ASSIGNMENT"
  | "SWING_TRADE"
  | "LONG_OPTION"
  | "DATA_ISSUE";

export type CostBasisMethod = "FIFO" | "LIFO" | "AVERAGE";

export type TradingAccount = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type TradeTransaction = {
  id: string;
  sourceBroker: SourceBroker;
  accountName: string;
  /** Owning trading account (multi-account support). Mirrors transactions.accountId. */
  accountId?: string;
  tradeDate: string;
  settlementDate?: string;
  symbol: string;
  instrumentType: InstrumentType;
  action: TradeAction;
  quantity: number;
  price: number;
  grossAmount: number;
  fees: number;
  netAmount: number;
  optionType: OptionType;
  strikePrice?: number;
  expirationDate?: string;
  underlyingSymbol?: string;
  rawDescription: string;
  importBatchId: string;
  notes?: string;
  tags: string[];
  status: TransactionStatus;
  /**
   * Optional manual override of the TOTAL cost basis of the shares this opener leads to
   * (e.g. a broker-adjusted basis for shares acquired via a cash-secured-put assignment).
   * When set, the engine uses it instead of the wheel-derived basis (strike − premium).
   */
  costBasisOverride?: number;
};

export type RealizedPnLEvent = {
  id: string;
  date: string;
  symbol: string;
  strategy: Strategy;
  grossProceeds: number;
  costBasis: number | null;
  optionPremium: number;
  fees: number;
  realizedPnl: number;
  quantity: number;
  capitalDeployed: number | null;
  roiPercent: number | null;
  annualizedRoiPercent: number | null;
  holdingDays: number | null;
  linkedTransactionIds: string[];
  explanation: string;
  warnings: string[];
};

export type TaxLotSource = "STOCK_BUY" | "CASH_SECURED_PUT_ASSIGNMENT" | "MANUAL_ADJUSTMENT";
export type TaxLotStatus = "open" | "closed" | "partially_closed";

export type TaxLot = {
  id: string;
  symbol: string;
  openDate: string;
  closeDate?: string;
  source: TaxLotSource;
  originalQuantity: number;
  remainingQuantity: number;
  costBasisTotal: number;
  costBasisPerShare: number;
  linkedTransactionIds: string[];
  status: TaxLotStatus;
  notes?: string;
};

export type OptionLifecycle = {
  id: string;
  underlyingSymbol: string;
  optionType: Exclude<OptionType, null>;
  /** "short" = sold-to-open (CC/CSP); "long" = bought-to-open (speculative long call/put). */
  direction: "long" | "short";
  strategy: "COVERED_CALL" | "CASH_SECURED_PUT" | "UNKNOWN";
  openDate: string;
  closeDate?: string;
  expirationDate: string;
  strikePrice: number;
  contracts: number;
  sharesControlled: number;
  premiumReceived: number;
  closeCost: number;
  fees: number;
  netOptionPnl: number;
  capitalDeployed?: number;
  /**
   * For assigned covered calls only: realized gain/loss from the called-away share sale
   * = (strike × sharesControlled) − allocated stock cost basis.
   * null / undefined for all other outcomes.
   */
  assignmentStockPnl?: number | null;
  /** Carried from the opening transaction's costBasisOverride (broker-adjusted basis). */
  costBasisOverride?: number;
  status: "open" | "expired" | "closed" | "assigned" | "unresolved";
  linkedTransactionIds: string[];
  linkedStockLotIds: string[];
  explanation: string;
  warnings: string[];
};

export type CapitalUsage = {
  id: string;
  strategy: Strategy;
  symbol: string;
  startDate: string;
  endDate: string;
  capitalType: "STOCK_CAPITAL" | "OPTION_COLLATERAL" | "ASSIGNMENT_COLLATERAL" | "SWING_TRADE_CAPITAL";
  amount: number;
  quantity: number;
  linkedTransactionIds: string[];
  notes?: string;
};

export type MonthlyCapitalReturn = {
  month: number;
  year: number;
  startingCapitalDeployed: number;
  endingCapitalDeployed: number;
  averageDeployedCapital: number;
  peakDeployedCapital: number;
  capitalDays: number;
  /** Days this month contributed to the period (asOf-adjusted for the current month). */
  periodDays: number;
  realizedPnl: number;
  realizedRoiPercent: number | null;
  closedTradeCapital: number;
  optionsPremiumPnl: number;
  stockTradingPnl: number;
  assignmentPnl: number;
  coveredCallCapital: number;
  cashSecuredPutCollateral: number;
  swingTradeCapital: number;
  assignmentCapital: number;
  peakCoveredCallCapital: number;
  peakCashSecuredPutCollateral: number;
  peakSwingTradeCapital: number;
  peakAssignmentCapital: number;
  coveredCallRoiPercent: number | null;
  cashSecuredPutRoiPercent: number | null;
  swingTradeRoiPercent: number | null;
  assignmentRoiPercent: number | null;
  warnings: string[];
};

export type PositionCapitalRecord = {
  id: string;
  symbol: string;
  strategy: Strategy;
  openDate: string;
  closeDate: string;
  capitalAmount: number | null;
  realizedPnl: number;
  roiPercent: number | null;
  annualizedRoiPercent: number | null;
  holdingDays: number | null;
  linkedTransactionIds: string[];
  explanation: string;
  warnings: string[];
};

export type DashboardAggregates = {
  totalRealizedPnl: number;
  currentYearRealizedPnl: number;
  monthlyRealizedPnl: Array<{ month: string; pnl: number; cumulative: number }>;
  cumulativeRealizedPnl: number;
  totalOptionsPremium: number;
  totalStockTradingPnl: number;
  totalAssignmentPnl: number;
  winRate: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  bestSymbol: string | null;
  worstSymbol: string | null;
  bestStrategy: string | null;
  worstStrategy: string | null;
  averageMonthlyRoi: number | null;
  /** Canonical period return on capital: realized P&L ÷ time-weighted avg deployed capital. */
  returnOnCapital: number | null;
  /** returnOnCapital annualized: × (365 ÷ period days). Labeled as annualized wherever shown. */
  annualizedReturnOnCapital: number | null;
  /** Time-weighted average deployed capital (dollar-days ÷ period days). */
  averageDeployedCapital: number;
  peakDeployedCapital: number;
  strategyBreakdown: Array<{ strategy: Strategy; pnl: number; capital: number; roiPercent: number | null }>;
  symbolBreakdown: Array<{ symbol: string; pnl: number; capital: number; roiPercent: number | null; trades: number; winRate: number | null }>;
  warnings: string[];
};

export type AppSettings = {
  showSampleData: boolean;
  defaultDateRange: "ALL" | "YTD" | "THIS_YEAR" | "LAST_YEAR";
  includeFees: boolean;
  annualRealizedPnlGoal: number;
  maxBuyingPower: number;
  costBasisMethod: CostBasisMethod;
  coveredCallDenominator: "UNDERLYING_COST_BASIS" | "CURRENT_MARKET_VALUE" | "ASSIGNMENT_PROCEEDS";
  cashSecuredPutDenominator: "CONSERVATIVE_COLLATERAL" | "NET_COLLATERAL_AFTER_PREMIUM";
  annualizedReturn: boolean;
  /** Show open swing stock lots as active positions. Off by default. */
  showSwingOpenPositions: boolean;
};

export type CalculationResult = {
  transactions: TradeTransaction[];
  realizedEvents: RealizedPnLEvent[];
  taxLots: TaxLot[];
  optionLifecycles: OptionLifecycle[];
  capitalUsage: CapitalUsage[];
  monthlyReturns: MonthlyCapitalReturn[];
  positionCapital: PositionCapitalRecord[];
  aggregates: DashboardAggregates;
  unresolvedTransactions: TradeTransaction[];
  duplicateTransactionIds: string[];
  warnings: string[];
};

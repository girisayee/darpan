import type {
  AppSettings,
  CalculationResult,
  CapitalUsage,
  DashboardAggregates,
  MonthlyCapitalReturn,
  OptionLifecycle,
  PositionCapitalRecord,
  RealizedPnLEvent,
  Strategy,
  TaxLot,
  TradeTransaction
} from "@/types/trading";
import { compactMonth } from "@/lib/utils/format";
import { defaultSettings } from "@/lib/storage/local-store";
import { portfolioReturnOnCapital } from "@/lib/selectors/return-on-capital";

type MutableLot = TaxLot & { remainingCostBasis: number };
type MutableLifecycle = OptionLifecycle;

const dayMs = 24 * 60 * 60 * 1000;

export function calculateDashboard(
  transactions: TradeTransaction[],
  settings: AppSettings = defaultSettings,
  today = new Date()
): CalculationResult {
  const warnings: string[] = [];
  const sorted = [...transactions].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      actionSortPriority(a.action) - actionSortPriority(b.action) ||
      a.id.localeCompare(b.id)
  );
  const duplicateTransactionIds = detectDuplicates(sorted);
  if (duplicateTransactionIds.length) warnings.push("Imported data appears duplicated.");

  const taxLots: MutableLot[] = [];
  const realizedEvents: RealizedPnLEvent[] = [];
  // Per-key queue of open lifecycles. A key maps to an ordered list of open
  // lifecycles; openers append to the end, closers pop from the front (FIFO).
  const optionMap = new Map<string, MutableLifecycle[]>();
  const optionLifecycles: MutableLifecycle[] = [];
  const capitalUsage: CapitalUsage[] = [];
  const positionCapital: PositionCapitalRecord[] = [];
  const unresolvedTransactions = sorted.filter((transaction) => transaction.status === "unresolved" || transaction.action === "OTHER");
  const lastDate = sorted.at(-1)?.tradeDate ?? isoDate(today);
  const asOfDate = maxDate(lastDate, isoDate(today));

  for (const transaction of sorted) {
    if (transaction.status === "ignored") continue;
    if (transaction.status === "unresolved" || transaction.action === "OTHER") {
      warnings.push(`Unknown transaction type: ${transaction.rawDescription}`);
      continue;
    }
    if (!transaction.tradeDate) warnings.push(`Missing trade open date on ${transaction.id}`);
    if (transaction.instrumentType === "stock") {
      handleStockTransaction(transaction, taxLots, realizedEvents, capitalUsage, positionCapital, settings);
    }
    if (transaction.instrumentType === "option") {
      handleOptionTransaction(transaction, taxLots, realizedEvents, optionMap, optionLifecycles, capitalUsage, positionCapital, settings, lastDate);
    }
  }

  finalizeOpenLots(taxLots);
  addOpenOptionCapitalUsage(optionLifecycles, capitalUsage, settings, asOfDate);
  const monthlyReturns = calculateMonthlyReturns(realizedEvents, capitalUsage, warnings, asOfDate);
  const aggregates = calculateAggregates(realizedEvents, monthlyReturns, warnings, asOfDate);

  return {
    transactions: sorted,
    realizedEvents,
    taxLots,
    optionLifecycles,
    capitalUsage,
    monthlyReturns,
    positionCapital,
    aggregates,
    unresolvedTransactions,
    duplicateTransactionIds,
    warnings
  };
}

function addOpenOptionCapitalUsage(lifecycles: MutableLifecycle[], usage: CapitalUsage[], settings: AppSettings, asOfDate: string) {
  for (const lifecycle of lifecycles) {
    if (lifecycle.status !== "open") continue;
    const capital = currentOpenOptionCapital(lifecycle, settings);
    if (capital <= 0) continue;
    const strategy: Strategy = lifecycle.optionType === "call" ? "COVERED_CALL" : "CASH_SECURED_PUT";
    usage.push({
      id: `cap-${lifecycle.id}-open`,
      strategy,
      symbol: lifecycle.underlyingSymbol,
      startDate: lifecycle.openDate,
      endDate: minDate(asOfDate, lifecycle.expirationDate),
      capitalType: lifecycle.optionType === "call" ? "STOCK_CAPITAL" : "OPTION_COLLATERAL",
      amount: capital,
      quantity: lifecycle.sharesControlled,
      linkedTransactionIds: lifecycle.linkedTransactionIds,
      notes: lifecycle.optionType === "call" ? "Current stock capital tied to open covered call." : "Current collateral tied to open cash-secured put."
    });
  }
}

function handleStockTransaction(
  transaction: TradeTransaction,
  lots: MutableLot[],
  events: RealizedPnLEvent[],
  usage: CapitalUsage[],
  positionCapital: PositionCapitalRecord[],
  settings: AppSettings
) {
  if (transaction.action === "BUY") {
    const costBasis = Math.abs(transaction.netAmount || transaction.grossAmount || transaction.quantity * transaction.price);
    lots.push({
      id: `lot-${transaction.id}`,
      symbol: transaction.symbol,
      openDate: transaction.tradeDate,
      source: "STOCK_BUY",
      originalQuantity: transaction.quantity,
      remainingQuantity: transaction.quantity,
      costBasisTotal: costBasis,
      remainingCostBasis: costBasis,
      costBasisPerShare: costBasis / transaction.quantity,
      linkedTransactionIds: [transaction.id],
      status: "open",
      notes: "Created from stock purchase."
    });
    return;
  }

  if (transaction.action === "SELL") {
    const proceeds = Math.abs(transaction.netAmount || transaction.grossAmount || transaction.quantity * transaction.price);
    const allocation = allocateLots(lots, transaction.symbol, transaction.quantity, settings, transaction.tradeDate);
    const fees = settings.includeFees ? transaction.fees : 0;
    const realizedPnl = proceeds - allocation.costBasis - fees;
    // Some shares matched an opening lot iff not everything is missing. A partial
    // shortfall keeps the matched basis (so the trade isn't read as "no opener");
    // basis is null only when nothing could be matched at all.
    const matchedSome = allocation.missingQuantity < transaction.quantity;
    const holdingDays = allocation.openDate ? dateDiffDays(allocation.openDate, transaction.tradeDate) : null;
    const roiPercent = allocation.costBasis > 0 ? (realizedPnl / allocation.costBasis) * 100 : null;
    const annualizedRoiPercent = roiPercent !== null && settings.annualizedReturn && holdingDays && holdingDays > 0 ? roiPercent * (365 / holdingDays) : null;
    const warnings = allocation.warnings;
    const event: RealizedPnLEvent = {
      id: `pnl-${transaction.id}`,
      date: transaction.tradeDate,
      symbol: transaction.symbol,
      strategy: "SWING_TRADE",
      grossProceeds: proceeds,
      costBasis: matchedSome ? allocation.costBasis : null,
      optionPremium: 0,
      fees,
      realizedPnl,
      quantity: transaction.quantity,
      capitalDeployed: matchedSome ? allocation.costBasis : null,
      roiPercent,
      annualizedRoiPercent,
      holdingDays,
      linkedTransactionIds: [transaction.id, ...allocation.linkedTransactionIds],
      explanation: `Sold ${transaction.quantity} shares of ${transaction.symbol}. Proceeds were ${money(proceeds)} and allocated ${settings.costBasisMethod} cost basis was ${money(allocation.costBasis)}.`,
      warnings
    };
    events.push(event);
    usage.push({
      id: `cap-${transaction.id}`,
      strategy: "SWING_TRADE",
      symbol: transaction.symbol,
      startDate: allocation.openDate ?? transaction.tradeDate,
      endDate: transaction.tradeDate,
      capitalType: "SWING_TRADE_CAPITAL",
      amount: allocation.costBasis,
      quantity: transaction.quantity,
      linkedTransactionIds: event.linkedTransactionIds,
      notes: `Stock capital for ${settings.costBasisMethod} lot sale.`
    });
    positionCapital.push(eventToPosition(event, allocation.openDate ?? transaction.tradeDate));
  }
}

function handleOptionTransaction(
  transaction: TradeTransaction,
  lots: MutableLot[],
  events: RealizedPnLEvent[],
  optionMap: Map<string, MutableLifecycle[]>,
  lifecycles: MutableLifecycle[],
  usage: CapitalUsage[],
  positionCapital: PositionCapitalRecord[],
  settings: AppSettings,
  fallbackEndDate: string
) {
  const warnings = optionWarnings(transaction);
  if (transaction.action === "SELL_TO_OPEN") {
    const lifecycle = createLifecycle(transaction, warnings, lots, settings);
    const key = optionKey(transaction);
    const queue = optionMap.get(key) ?? [];
    queue.push(lifecycle);
    optionMap.set(key, queue);
    lifecycles.push(lifecycle);
    return;
  }

  if (transaction.action === "BUY_TO_OPEN") {
    const lifecycle = createLongLifecycle(transaction, warnings, settings);
    const key = optionKey(transaction);
    const queue = optionMap.get(key) ?? [];
    queue.push(lifecycle);
    optionMap.set(key, queue);
    lifecycles.push(lifecycle);
    return;
  }

  // For closing actions, find the oldest open lifecycle with a compatible direction
  // (FIFO). BUY_TO_CLOSE and ASSIGNMENT close SHORT positions; SELL_TO_CLOSE closes
  // LONG positions; EXPIRATION closes whichever direction is open first.
  const queue = optionMap.get(optionKey(transaction)) ?? [];
  let lifecycle: MutableLifecycle | undefined;
  if (transaction.action === "BUY_TO_CLOSE" || transaction.action === "ASSIGNMENT") {
    const idx = queue.findIndex((lc) => lc.status === "open" && lc.direction === "short");
    if (idx !== -1) { lifecycle = queue[idx]; queue.splice(idx, 1); }
  } else if (transaction.action === "SELL_TO_CLOSE") {
    const idx = queue.findIndex((lc) => lc.status === "open" && lc.direction === "long");
    if (idx !== -1) { lifecycle = queue[idx]; queue.splice(idx, 1); }
  } else if (transaction.action === "EXPIRATION") {
    const idx = queue.findIndex((lc) => lc.status === "open");
    if (idx !== -1) { lifecycle = queue[idx]; queue.splice(idx, 1); }
  }
  if (!lifecycle) {
    // A put assignment with no recorded sell-to-open would normally be flagged.
    // But if the shares it delivered are already accounted for by open stock lots
    // (e.g. a manual opening buy the user added for cost basis), the missing
    // opener is benign — suppress the data-issue rather than nag about it.
    const underlying = transaction.underlyingSymbol || transaction.symbol;
    const assignedShares = (transaction.quantity || 0) * 100;
    const coveredByLots =
      transaction.action === "ASSIGNMENT" &&
      transaction.optionType === "put" &&
      assignedShares > 0 &&
      openShareQuantity(lots, underlying) >= assignedShares;
    if (!coveredByLots) {
      events.push(unresolvedOptionEvent(transaction, "Option trade could not be linked to an opening option trade."));
    }
    return;
  }

  lifecycle.closeDate = transaction.tradeDate;
  lifecycle.linkedTransactionIds.push(transaction.id);
  lifecycle.fees += settings.includeFees ? transaction.fees : 0;

  if (transaction.action === "BUY_TO_CLOSE") {
    lifecycle.status = "closed";
    lifecycle.closeCost = Math.abs(transaction.grossAmount || transaction.netAmount);
    lifecycle.netOptionPnl = lifecycle.premiumReceived - lifecycle.closeCost - lifecycle.fees;
    addOptionRealizedEvent(lifecycle, transaction.tradeDate, events, usage, positionCapital, settings, "closed");
    return;
  }

  if (transaction.action === "SELL_TO_CLOSE") {
    lifecycle.status = "closed";
    // For a long (BTO) position: proceeds received on close minus cost paid to open.
    // lifecycle.fees was already updated on line above (close-leg fees accumulated).
    const proceeds = Math.abs(transaction.grossAmount || transaction.netAmount);
    lifecycle.closeCost = lifecycle.premiumReceived; // cost paid to open (stored in premiumReceived)
    lifecycle.premiumReceived = proceeds;            // repurpose field: closing proceeds for display
    lifecycle.netOptionPnl = proceeds - lifecycle.closeCost - lifecycle.fees;
    addOptionRealizedEvent(lifecycle, transaction.tradeDate, events, usage, positionCapital, settings, "closed");
    return;
  }

  if (transaction.action === "EXPIRATION") {
    lifecycle.status = "expired";
    if (lifecycle.direction === "long") {
      // Long option expires worthless: lose the entire debit paid plus fees.
      lifecycle.netOptionPnl = -(lifecycle.premiumReceived + lifecycle.fees);
    } else {
      // Short option expires worthless: keep all premium minus fees.
      lifecycle.netOptionPnl = lifecycle.premiumReceived - lifecycle.fees;
    }
    addOptionRealizedEvent(lifecycle, transaction.tradeDate, events, usage, positionCapital, settings, "expired");
    return;
  }

  if (transaction.action === "ASSIGNMENT") {
    lifecycle.status = "assigned";
    lifecycle.netOptionPnl = lifecycle.premiumReceived - lifecycle.closeCost - lifecycle.fees;
    if (lifecycle.optionType === "call") {
      handleCoveredCallAssignment(transaction, lifecycle, lots, events, usage, positionCapital, settings);
    } else {
      handlePutAssignment(transaction, lifecycle, lots, events, usage, positionCapital, settings);
    }
    return;
  }

  if (!lifecycle.closeDate) {
    lifecycle.closeDate = fallbackEndDate;
  }
}

function createLifecycle(transaction: TradeTransaction, warnings: string[], lots: MutableLot[], settings: AppSettings): MutableLifecycle {
  const optionType = transaction.optionType ?? "call";
  const contracts = Math.abs(transaction.quantity);
  const sharesControlled = contracts * 100;
  // Use GROSS premium: option P&L formulas subtract `fees` separately, so reading the
  // fee-inclusive netAmount here would double-count fees (importer/manual builders set
  // netAmount = gross − fees). grossAmount is the pre-fee credit/debit.
  const premium = Math.abs(transaction.grossAmount || transaction.netAmount);
  const stockBasis =
    optionType === "call"
      ? costBasisForOpenShares(lots, transaction.underlyingSymbol || transaction.symbol, sharesControlled, settings)
      : undefined;
  const collateral =
    optionType === "put"
      ? settings.cashSecuredPutDenominator === "NET_COLLATERAL_AFTER_PREMIUM"
        ? strikeCollateral(transaction, sharesControlled) - premium
        : strikeCollateral(transaction, sharesControlled)
      : undefined;
  if (optionType === "call" && !stockBasis) warnings.push("Option trade could not be linked to underlying stock lot");
  // A covered call is backed by the underlying shares. Record those open lots' opening
  // transactions on the lifecycle so a year filter (which re-runs the engine on a
  // date-filtered transaction set) preserves a prior-year share purchase that supplies the
  // basis — otherwise the cross-year link is lost and the "no underlying lot" warning returns.
  const underlying = transaction.underlyingSymbol || transaction.symbol;
  const backingLots =
    optionType === "call" && stockBasis
      ? lots.filter((lot) => lot.symbol === underlying && lot.remainingQuantity > 0)
      : [];
  const backingTxIds = unique(backingLots.flatMap((lot) => lot.linkedTransactionIds));
  return {
    id: `opt-${transaction.id}`,
    underlyingSymbol: transaction.underlyingSymbol || transaction.symbol,
    optionType,
    direction: "short" as const,
    strategy: optionType === "call" ? "COVERED_CALL" : "CASH_SECURED_PUT",
    openDate: transaction.tradeDate,
    expirationDate: transaction.expirationDate || transaction.tradeDate,
    strikePrice: transaction.strikePrice || 0,
    contracts,
    sharesControlled,
    premiumReceived: premium,
    closeCost: 0,
    fees: transaction.fees,
    netOptionPnl: premium - transaction.fees,
    capitalDeployed: stockBasis ?? collateral,
    costBasisOverride: transaction.costBasisOverride,
    status: "open",
    linkedTransactionIds: [transaction.id, ...backingTxIds],
    linkedStockLotIds: backingLots.map((lot) => lot.id),
    explanation: `Opened ${optionType === "call" ? "covered call" : "cash-secured put"} on ${transaction.symbol} for ${money(premium)} premium.`,
    warnings
  };
}

function createLongLifecycle(transaction: TradeTransaction, warnings: string[], settings: AppSettings): MutableLifecycle {
  const optionType = transaction.optionType ?? "call";
  const contracts = Math.abs(transaction.quantity);
  const sharesControlled = contracts * 100;
  // For a long option, the debit paid to open is treated as cost basis.
  const costPaid = Math.abs(transaction.grossAmount || transaction.netAmount);
  const openFees = settings.includeFees ? transaction.fees : 0;
  return {
    id: `opt-${transaction.id}`,
    underlyingSymbol: transaction.underlyingSymbol || transaction.symbol,
    optionType,
    direction: "long" as const,
    strategy: "UNKNOWN",
    openDate: transaction.tradeDate,
    expirationDate: transaction.expirationDate || transaction.tradeDate,
    strikePrice: transaction.strikePrice || 0,
    contracts,
    sharesControlled,
    // premiumReceived stores the cost paid to open the long position.
    // On SELL_TO_CLOSE, the engine swaps it to hold the closing proceeds.
    premiumReceived: costPaid,
    closeCost: 0,
    fees: openFees,
    netOptionPnl: -(costPaid + openFees),
    capitalDeployed: costPaid,
    status: "open",
    linkedTransactionIds: [transaction.id],
    linkedStockLotIds: [],
    explanation: `Opened long ${optionType} on ${transaction.underlyingSymbol || transaction.symbol} for ${money(costPaid)} debit.`,
    warnings
  };
}

function addOptionRealizedEvent(
  lifecycle: MutableLifecycle,
  closeDate: string,
  events: RealizedPnLEvent[],
  usage: CapitalUsage[],
  positionCapital: PositionCapitalRecord[],
  settings: AppSettings,
  outcome: "closed" | "expired"
) {
  const strategy: Strategy =
    lifecycle.direction === "long"
      ? "LONG_OPTION"
      : lifecycle.optionType === "call"
        ? "COVERED_CALL"
        : "CASH_SECURED_PUT";
  const capital = optionCapital(lifecycle, settings);
  const roiPercent = capital > 0 ? (lifecycle.netOptionPnl / capital) * 100 : null;
  const holdingDays = dateDiffDays(lifecycle.openDate, closeDate);
  const annualizedRoiPercent = roiPercent !== null && settings.annualizedReturn && holdingDays > 0 ? roiPercent * (365 / holdingDays) : null;
  const warnings = [...lifecycle.warnings];
  if (!capital) warnings.push("Capital deployed cannot be calculated for this option trade.");
  const event: RealizedPnLEvent = {
    id: `pnl-${lifecycle.id}-${outcome}`,
    date: closeDate,
    symbol: lifecycle.underlyingSymbol,
    strategy,
    grossProceeds: lifecycle.premiumReceived,
    costBasis: lifecycle.closeCost,
    optionPremium: lifecycle.netOptionPnl,
    fees: lifecycle.fees,
    realizedPnl: lifecycle.netOptionPnl,
    quantity: lifecycle.sharesControlled,
    capitalDeployed: capital || null,
    roiPercent,
    annualizedRoiPercent,
    holdingDays,
    linkedTransactionIds: lifecycle.linkedTransactionIds,
    explanation: `${strategyLabel(strategy)} ${outcome}. Premium received was ${money(lifecycle.premiumReceived)}, buy-to-close cost was ${money(lifecycle.closeCost)}, and net option P&L was ${money(lifecycle.netOptionPnl)}.`,
    warnings
  };
  events.push(event);
  usage.push({
    id: `cap-${lifecycle.id}-${outcome}`,
    strategy,
    symbol: lifecycle.underlyingSymbol,
    startDate: lifecycle.openDate,
    endDate: closeDate,
    capitalType:
      lifecycle.direction === "long"
        ? "OPTION_COLLATERAL"
        : lifecycle.optionType === "call"
          ? "STOCK_CAPITAL"
          : "OPTION_COLLATERAL",
    amount: capital,
    quantity: lifecycle.sharesControlled,
    linkedTransactionIds: lifecycle.linkedTransactionIds,
    notes:
      lifecycle.direction === "long"
        ? "Debit paid to open long option position."
        : lifecycle.optionType === "call"
          ? "Underlying stock cost basis used for covered call denominator."
          : "Strike times shares used as conservative put collateral."
  });
  positionCapital.push(eventToPosition(event, lifecycle.openDate));
}

function handleCoveredCallAssignment(
  transaction: TradeTransaction,
  lifecycle: MutableLifecycle,
  lots: MutableLot[],
  events: RealizedPnLEvent[],
  usage: CapitalUsage[],
  positionCapital: PositionCapitalRecord[],
  settings: AppSettings
) {
  const proceeds = lifecycle.strikePrice * lifecycle.sharesControlled;
  const allocation = allocateLots(lots, lifecycle.underlyingSymbol, lifecycle.sharesControlled, settings, transaction.tradeDate);
  lifecycle.linkedStockLotIds = allocation.linkedLotIds;
  // Fold the consumed stock-lot transactions into the lifecycle's linked ids so the
  // "manual" badge (ClosedCyclesTable manualTxIds check) and the drawer bridge pick up
  // manually-added share buys that supplied the cost basis.
  lifecycle.linkedTransactionIds = unique([
    ...lifecycle.linkedTransactionIds,
    ...allocation.linkedTransactionIds,
  ]);
  const allLinkedIds = lifecycle.linkedTransactionIds;
  const holdingDays = allocation.openDate ? dateDiffDays(allocation.openDate, transaction.tradeDate) : null;
  const warnings = [...lifecycle.warnings, ...allocation.warnings];
  if (!allocation.costBasisKnown) warnings.push("Missing cost basis");

  // ── Event 1: option-premium side (COVERED_CALL_ASSIGNMENT) ─────────────────
  // realizedPnl is the option premium net of fees only; the stock-sale gain/loss
  // is split into a separate COVERED_CALL_ASSIGNMENT_STOCK event below so that
  // totalStockTradingPnl receives it without creating a SWING_TRADE event.
  const optionPnl = lifecycle.netOptionPnl;
  const capital = allocation.costBasisKnown ? allocation.costBasis : null;
  const roiPercent = capital !== null && capital > 0 ? (optionPnl / capital) * 100 : null;
  const annualizedRoiPercent = roiPercent !== null && settings.annualizedReturn && holdingDays && holdingDays > 0 ? roiPercent * (365 / holdingDays) : null;
  const assignmentEvent: RealizedPnLEvent = {
    id: `pnl-${lifecycle.id}-assignment`,
    date: transaction.tradeDate,
    symbol: lifecycle.underlyingSymbol,
    strategy: "COVERED_CALL_ASSIGNMENT",
    grossProceeds: lifecycle.premiumReceived,
    costBasis: lifecycle.closeCost,
    optionPremium: lifecycle.netOptionPnl,
    fees: lifecycle.fees,
    realizedPnl: optionPnl,
    quantity: lifecycle.sharesControlled,
    capitalDeployed: capital,
    roiPercent,
    annualizedRoiPercent,
    holdingDays,
    linkedTransactionIds: allLinkedIds,
    explanation: `Assigned ${lifecycle.sharesControlled} shares of ${lifecycle.underlyingSymbol} at ${money(lifecycle.strikePrice)} strike. Net option premium (premium minus fees) was ${money(optionPnl)}. Stock sale gain/loss is tracked separately.`,
    warnings
  };
  events.push(assignmentEvent);

  // ── Attach share-sale P&L onto the lifecycle for UI display ────────────────
  // assignmentStockPnl = proceeds − stock cost basis (the called-away gain/loss).
  lifecycle.assignmentStockPnl = proceeds - allocation.costBasis;

  // ── Event 2: share-sale side (COVERED_CALL_ASSIGNMENT_STOCK) ───────────────
  // Carries the proceeds − stock cost basis gain/loss so it flows into
  // totalStockTradingPnl and monthly stockTradingPnl. NOT a SWING_TRADE event,
  // so it does not appear in the Swing-trades tab.
  const stockPnl = proceeds - allocation.costBasis;
  const stockEvent: RealizedPnLEvent = {
    id: `pnl-${lifecycle.id}-assignment-stock`,
    date: transaction.tradeDate,
    symbol: lifecycle.underlyingSymbol,
    strategy: "COVERED_CALL_ASSIGNMENT_STOCK",
    grossProceeds: proceeds,
    costBasis: allocation.costBasisKnown ? allocation.costBasis : null,
    optionPremium: 0,
    fees: 0,
    realizedPnl: stockPnl,
    quantity: lifecycle.sharesControlled,
    capitalDeployed: null,
    roiPercent: null,
    annualizedRoiPercent: null,
    holdingDays,
    linkedTransactionIds: allLinkedIds,
    explanation: `Called-away stock sale for ${lifecycle.sharesControlled} shares of ${lifecycle.underlyingSymbol}. Strike proceeds were ${money(proceeds)}, allocated stock basis was ${money(allocation.costBasis)}.`,
    warnings: [...allocation.warnings]
  };
  events.push(stockEvent);

  // ── Capital usage ───────────────────────────────────────────────────────────
  usage.push({
    id: `cap-${lifecycle.id}-assignment`,
    strategy: "COVERED_CALL_ASSIGNMENT",
    symbol: lifecycle.underlyingSymbol,
    startDate: allocation.openDate ?? lifecycle.openDate,
    endDate: transaction.tradeDate,
    capitalType: "ASSIGNMENT_COLLATERAL",
    amount: allocation.costBasis,
    quantity: lifecycle.sharesControlled,
    linkedTransactionIds: allLinkedIds,
    notes: "Underlying stock capital tied up until covered call assignment."
  });
  positionCapital.push(eventToPosition(assignmentEvent, allocation.openDate ?? lifecycle.openDate));
  positionCapital.push(eventToPosition(stockEvent, allocation.openDate ?? lifecycle.openDate));
}

function handlePutAssignment(
  transaction: TradeTransaction,
  lifecycle: MutableLifecycle,
  lots: MutableLot[],
  events: RealizedPnLEvent[],
  usage: CapitalUsage[],
  positionCapital: PositionCapitalRecord[],
  settings: AppSettings
) {
  const grossAssignedCost = lifecycle.strikePrice * lifecycle.sharesControlled;
  const derivedBasis = grossAssignedCost - lifecycle.netOptionPnl + lifecycle.fees;
  // A manual cost-basis override (e.g. the broker-adjusted basis) wins over the
  // wheel-derived strike − premium basis.
  const effectiveBasis = lifecycle.costBasisOverride ?? derivedBasis;
  const lot: MutableLot = {
    id: `lot-${lifecycle.id}-assignment`,
    symbol: lifecycle.underlyingSymbol,
    openDate: transaction.tradeDate,
    source: "CASH_SECURED_PUT_ASSIGNMENT",
    originalQuantity: lifecycle.sharesControlled,
    remainingQuantity: lifecycle.sharesControlled,
    costBasisTotal: effectiveBasis,
    remainingCostBasis: effectiveBasis,
    costBasisPerShare: effectiveBasis / lifecycle.sharesControlled,
    linkedTransactionIds: lifecycle.linkedTransactionIds,
    status: "open",
    notes: lifecycle.costBasisOverride != null
      ? `Put assignment basis manually set to ${money(effectiveBasis)} (broker-adjusted).`
      : `Put assignment basis = strike purchase cost ${money(grossAssignedCost)} - premium ${money(lifecycle.netOptionPnl)}.`
  };
  lots.push(lot);
  lifecycle.linkedStockLotIds = [lot.id];
  const capital = optionCapital(lifecycle, settings);
  const roiPercent = capital > 0 ? (lifecycle.netOptionPnl / capital) * 100 : null;
  const holdingDays = dateDiffDays(lifecycle.openDate, transaction.tradeDate);
  const annualizedRoiPercent = roiPercent !== null && settings.annualizedReturn && holdingDays > 0 ? roiPercent * (365 / holdingDays) : null;
  const event: RealizedPnLEvent = {
    id: `pnl-${lifecycle.id}-put-assignment`,
    date: transaction.tradeDate,
    symbol: lifecycle.underlyingSymbol,
    strategy: "PUT_ASSIGNMENT",
    grossProceeds: lifecycle.premiumReceived,
    costBasis: grossAssignedCost,
    optionPremium: lifecycle.netOptionPnl,
    fees: lifecycle.fees,
    realizedPnl: lifecycle.netOptionPnl,
    quantity: lifecycle.sharesControlled,
    capitalDeployed: capital || null,
    roiPercent,
    annualizedRoiPercent,
    holdingDays,
    linkedTransactionIds: lifecycle.linkedTransactionIds,
    explanation: `Cash-secured put assignment bought ${lifecycle.sharesControlled} shares of ${lifecycle.underlyingSymbol}. Gross assigned cost was ${money(grossAssignedCost)} and effective stock basis became ${money(effectiveBasis)} after premium.`,
    warnings: lifecycle.warnings
  };
  events.push(event);
  usage.push({
    id: `cap-${lifecycle.id}-put-assignment`,
    strategy: "PUT_ASSIGNMENT",
    symbol: lifecycle.underlyingSymbol,
    startDate: lifecycle.openDate,
    endDate: transaction.tradeDate,
    capitalType: "OPTION_COLLATERAL",
    amount: capital,
    quantity: lifecycle.sharesControlled,
    linkedTransactionIds: lifecycle.linkedTransactionIds,
    notes: "Collateral tied up for cash-secured put assignment."
  });
  positionCapital.push(eventToPosition(event, lifecycle.openDate));
}

type Allocation = {
  costBasis: number;
  costBasisKnown: boolean;
  /** Shares the sell could not match to an opening lot (0 when fully covered). */
  missingQuantity: number;
  linkedTransactionIds: string[];
  linkedLotIds: string[];
  openDate: string | null;
  warnings: string[];
};

/** Total currently-open share quantity for a symbol across all lots. */
function openShareQuantity(lots: MutableLot[], symbol: string): number {
  return lots
    .filter((lot) => lot.symbol === symbol && lot.remainingQuantity > 0)
    .reduce((sum, lot) => sum + lot.remainingQuantity, 0);
}

function allocateLots(lots: MutableLot[], symbol: string, quantity: number, settings: AppSettings, closeDate: string): Allocation {
  const method = settings.costBasisMethod;
  const available = lots.filter((lot) => lot.symbol === symbol && lot.remainingQuantity > 0);
  const warnings: string[] = [];
  const availableQuantity = available.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const missingQuantity = Math.max(0, quantity - availableQuantity);
  const costBasisKnown = missingQuantity <= 0;
  if (!costBasisKnown) {
    // Keep "Missing cost basis" as the prefix (callers/tests match on it) but say
    // how much is uncovered so a small shortfall reads as a partial gap, not a
    // wholesale missing opener.
    const qty = (n: number) => Number(n.toFixed(4));
    warnings.push(
      availableQuantity > 0
        ? `Missing cost basis for ${qty(missingQuantity)} of ${qty(quantity)} shares`
        : "Missing cost basis",
    );
  }

  if (method === "LIFO") available.sort((a, b) => b.openDate.localeCompare(a.openDate));
  else available.sort((a, b) => a.openDate.localeCompare(b.openDate));

  if (method === "AVERAGE") {
    const totalQty = available.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
    const totalBasis = available.reduce((sum, lot) => sum + lot.remainingCostBasis, 0);
    const avg = totalQty > 0 ? totalBasis / totalQty : 0;
    let remaining = quantity;
    const linkedTransactionIds: string[] = [];
    const linkedLotIds: string[] = [];
    let openDate: string | null = null;
    for (const lot of available) {
      if (remaining <= 0) break;
      const used = Math.min(lot.remainingQuantity, remaining);
      lot.remainingQuantity -= used;
      lot.remainingCostBasis -= used * avg;
      lot.closeDate = lot.remainingQuantity === 0 ? closeDate : undefined;
      lot.status = lot.remainingQuantity === 0 ? "closed" : "partially_closed";
      linkedTransactionIds.push(...lot.linkedTransactionIds);
      linkedLotIds.push(lot.id);
      openDate ??= lot.openDate;
      remaining -= used;
    }
    return {
      costBasis: avg * Math.min(quantity, availableQuantity),
      costBasisKnown,
      missingQuantity,
      linkedTransactionIds: unique(linkedTransactionIds),
      linkedLotIds: unique(linkedLotIds),
      openDate,
      warnings
    };
  }

  let remaining = quantity;
  let costBasis = 0;
  const linkedTransactionIds: string[] = [];
  const linkedLotIds: string[] = [];
  let openDate: string | null = null;
  for (const lot of available) {
    if (remaining <= 0) break;
    const used = Math.min(lot.remainingQuantity, remaining);
    const lotCost = used * lot.costBasisPerShare;
    costBasis += lotCost;
    lot.remainingQuantity -= used;
    lot.remainingCostBasis -= lotCost;
    lot.closeDate = lot.remainingQuantity === 0 ? closeDate : undefined;
    lot.status = lot.remainingQuantity === 0 ? "closed" : "partially_closed";
    linkedTransactionIds.push(...lot.linkedTransactionIds);
    linkedLotIds.push(lot.id);
    openDate ??= lot.openDate;
    remaining -= used;
  }
  return { costBasis, costBasisKnown, missingQuantity, linkedTransactionIds: unique(linkedTransactionIds), linkedLotIds: unique(linkedLotIds), openDate, warnings };
}

export function calculateMonthlyReturns(
  events: RealizedPnLEvent[],
  usage: CapitalUsage[],
  warnings: string[] = [],
  asOfDate?: string
): MonthlyCapitalReturn[] {
  const monthKeys = new Set<string>();
  for (const event of events) monthKeys.add(event.date.slice(0, 7));
  for (const record of usage) {
    const months = monthsBetween(record.startDate, record.endDate);
    for (const month of months) monthKeys.add(month);
  }
  const sortedKeys = [...monthKeys].sort();
  return sortedKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const monthlyEvents = events.filter((event) => event.date.startsWith(key));
    const capital = capitalForMonth(usage, year, month, asOfDate);
    const realizedPnl = sum(monthlyEvents.map((event) => event.realizedPnl));
    const closedTradeCapital = sum(monthlyEvents.map((event) => event.capitalDeployed ?? 0));
    const optionsPremiumPnl = sum(monthlyEvents.filter((event) => ["COVERED_CALL", "CASH_SECURED_PUT", "PUT_ASSIGNMENT"].includes(event.strategy)).map((event) => event.realizedPnl));
    const stockTradingPnl = sum(monthlyEvents.filter((event) => event.strategy === "SWING_TRADE" || event.strategy === "COVERED_CALL_ASSIGNMENT_STOCK").map((event) => event.realizedPnl));
    const assignmentPnl = sum(monthlyEvents.filter((event) => event.strategy === "COVERED_CALL_ASSIGNMENT").map((event) => event.realizedPnl));
    const strategyCapital = {
      coveredCallCapital: averageCapitalByStrategy(usage, year, month, asOfDate, "COVERED_CALL"),
      cashSecuredPutCollateral: averageCapitalByStrategy(usage, year, month, asOfDate, "CASH_SECURED_PUT"),
      swingTradeCapital: averageCapitalByStrategy(usage, year, month, asOfDate, "SWING_TRADE"),
      assignmentCapital: averageCapitalByStrategy(usage, year, month, asOfDate, "COVERED_CALL_ASSIGNMENT") + averageCapitalByStrategy(usage, year, month, asOfDate, "PUT_ASSIGNMENT"),
      peakCoveredCallCapital: peakCapitalByStrategy(usage, year, month, asOfDate, "COVERED_CALL"),
      peakCashSecuredPutCollateral: peakCapitalByStrategy(usage, year, month, asOfDate, "CASH_SECURED_PUT"),
      peakSwingTradeCapital: peakCapitalByStrategy(usage, year, month, asOfDate, "SWING_TRADE"),
      peakAssignmentCapital: peakCapitalByStrategy(usage, year, month, asOfDate, "COVERED_CALL_ASSIGNMENT") + peakCapitalByStrategy(usage, year, month, asOfDate, "PUT_ASSIGNMENT")
    };
    const rowWarnings: string[] = [];
    if (realizedPnl !== 0 && capital.averageDeployedCapital === 0) {
      rowWarnings.push("Average deployed capital is zero, so ROI is unavailable.");
      warnings.push("Average deployed capital is zero");
    }
    return {
      month,
      year,
      startingCapitalDeployed: pointInTimeCapital(usage, `${key}-01`),
      endingCapitalDeployed: pointInTimeCapital(usage, capital.endDate),
      averageDeployedCapital: capital.averageDeployedCapital,
      peakDeployedCapital: capital.peakDeployedCapital,
      capitalDays: capital.capitalDays,
      periodDays: capital.days,
      realizedPnl,
      realizedRoiPercent: capital.averageDeployedCapital > 0 ? (realizedPnl / capital.averageDeployedCapital) * 100 : null,
      closedTradeCapital,
      optionsPremiumPnl,
      stockTradingPnl,
      assignmentPnl,
      ...strategyCapital,
      coveredCallRoiPercent: ratioForStrategy(monthlyEvents, strategyCapital.coveredCallCapital, "COVERED_CALL"),
      cashSecuredPutRoiPercent: ratioForStrategy(monthlyEvents, strategyCapital.cashSecuredPutCollateral, "CASH_SECURED_PUT"),
      swingTradeRoiPercent: ratioForStrategy(monthlyEvents, strategyCapital.swingTradeCapital, "SWING_TRADE"),
      assignmentRoiPercent: ratioForStrategy(monthlyEvents, strategyCapital.assignmentCapital, "COVERED_CALL_ASSIGNMENT", "PUT_ASSIGNMENT"),
      warnings: rowWarnings
    };
  });
}

function calculateAggregates(events: RealizedPnLEvent[], monthly: MonthlyCapitalReturn[], warnings: string[], asOfDate: string): DashboardAggregates {
  const totalRealizedPnl = sum(events.map((event) => event.realizedPnl));
  const currentYear = Number(asOfDate.slice(0, 4));
  const currentYearRealizedPnl = sum(events.filter((event) => Number(event.date.slice(0, 4)) === currentYear).map((event) => event.realizedPnl));
  let cumulative = 0;
  const monthlyRealizedPnl = monthly.map((row) => {
    cumulative += row.realizedPnl;
    return { month: compactMonth(row.year, row.month), pnl: row.realizedPnl, cumulative };
  });
  const wins = events.filter((event) => event.realizedPnl > 0);
  const losses = events.filter((event) => event.realizedPnl < 0);
  const strategyBreakdown = groupBreakdown(events, "strategy");
  const symbolBreakdown = groupBreakdown(events, "symbol").map((row) => ({
    symbol: row.symbol,
    pnl: row.pnl,
    capital: row.capital,
    roiPercent: row.roiPercent,
    trades: row.trades,
    winRate: row.winRate
  }));
  const monthlyWithRoi = monthly.filter((row) => row.realizedRoiPercent !== null);
  const roc = portfolioReturnOnCapital(monthly);
  return {
    totalRealizedPnl,
    currentYearRealizedPnl,
    monthlyRealizedPnl,
    cumulativeRealizedPnl: cumulative,
    totalOptionsPremium: sum(events.filter((event) => ["COVERED_CALL", "CASH_SECURED_PUT", "PUT_ASSIGNMENT"].includes(event.strategy)).map((event) => event.realizedPnl)),
    totalStockTradingPnl: sum(events.filter((event) => event.strategy === "SWING_TRADE" || event.strategy === "COVERED_CALL_ASSIGNMENT_STOCK").map((event) => event.realizedPnl)),
    totalAssignmentPnl: sum(events.filter((event) => event.strategy === "COVERED_CALL_ASSIGNMENT").map((event) => event.realizedPnl)),
    winRate: events.length ? (wins.length / events.length) * 100 : null,
    averageWin: wins.length ? sum(wins.map((event) => event.realizedPnl)) / wins.length : null,
    averageLoss: losses.length ? sum(losses.map((event) => event.realizedPnl)) / losses.length : null,
    bestSymbol: symbolBreakdown[0]?.symbol ?? null,
    worstSymbol: [...symbolBreakdown].sort((a, b) => a.pnl - b.pnl)[0]?.symbol ?? null,
    bestStrategy: strategyBreakdown[0]?.strategy ?? null,
    worstStrategy: [...strategyBreakdown].sort((a, b) => a.pnl - b.pnl)[0]?.strategy ?? null,
    averageMonthlyRoi: monthlyWithRoi.length ? sum(monthlyWithRoi.map((row) => row.realizedRoiPercent ?? 0)) / monthlyWithRoi.length : null,
    returnOnCapital: roc.roc,
    annualizedReturnOnCapital: roc.annualizedRoc,
    averageDeployedCapital: roc.avgDeployed,
    peakDeployedCapital: Math.max(0, ...monthly.map((row) => row.peakDeployedCapital)),
    strategyBreakdown,
    symbolBreakdown,
    warnings: unique(warnings)
  };
}

function groupBreakdown(events: RealizedPnLEvent[], key: "strategy"): Array<{ strategy: Strategy; pnl: number; capital: number; roiPercent: number | null; trades: number; winRate: number | null }>;
function groupBreakdown(events: RealizedPnLEvent[], key: "symbol"): Array<{ symbol: string; pnl: number; capital: number; roiPercent: number | null; trades: number; winRate: number | null }>;
function groupBreakdown(events: RealizedPnLEvent[], key: "strategy" | "symbol") {
  const map = new Map<string, RealizedPnLEvent[]>();
  for (const event of events) {
    const group = event[key];
    map.set(group, [...(map.get(group) ?? []), event]);
  }
  return [...map.entries()]
    .map(([group, rows]) => {
      const pnl = sum(rows.map((row) => row.realizedPnl));
      const capital = sum(rows.map((row) => row.capitalDeployed ?? 0));
      const wins = rows.filter((row) => row.realizedPnl > 0).length;
      return {
        [key]: group,
        pnl,
        capital,
        roiPercent: capital > 0 ? (pnl / capital) * 100 : null,
        trades: rows.length,
        winRate: rows.length ? (wins / rows.length) * 100 : null
      };
    })
    .sort((a, b) => b.pnl - a.pnl);
}

function optionCapital(lifecycle: MutableLifecycle, settings: AppSettings) {
  if (lifecycle.capitalDeployed !== undefined) return lifecycle.capitalDeployed;
  if (lifecycle.optionType === "put") {
    const conservative = lifecycle.strikePrice * lifecycle.sharesControlled;
    return settings.cashSecuredPutDenominator === "NET_COLLATERAL_AFTER_PREMIUM" ? conservative - lifecycle.premiumReceived : conservative;
  }
  return lifecycle.strikePrice * lifecycle.sharesControlled || 0;
}

function currentOpenOptionCapital(lifecycle: MutableLifecycle, settings: AppSettings) {
  const capital = optionCapital(lifecycle, settings);
  if (capital > 0) return capital;
  return lifecycle.strikePrice * lifecycle.sharesControlled || 0;
}

function costBasisForOpenShares(lots: MutableLot[], symbol: string, quantity: number, settings: AppSettings) {
  const method = settings.costBasisMethod;
  const openLots = lots.filter((lot) => lot.symbol === symbol && lot.remainingQuantity > 0);
  if (!openLots.length) return 0;
  const ordered = [...openLots].sort((a, b) => (method === "LIFO" ? b.openDate.localeCompare(a.openDate) : a.openDate.localeCompare(b.openDate)));
  if (method === "AVERAGE") {
    const totalQty = sum(openLots.map((lot) => lot.remainingQuantity));
    const totalBasis = sum(openLots.map((lot) => lot.remainingCostBasis));
    return totalQty > 0 ? (totalBasis / totalQty) * Math.min(quantity, totalQty) : 0;
  }
  let remaining = quantity;
  let basis = 0;
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const used = Math.min(lot.remainingQuantity, remaining);
    basis += used * lot.costBasisPerShare;
    remaining -= used;
  }
  return basis;
}

function strikeCollateral(transaction: TradeTransaction, sharesControlled: number) {
  return (transaction.strikePrice || 0) * sharesControlled;
}

function optionKey(transaction: Pick<TradeTransaction, "underlyingSymbol" | "symbol" | "optionType" | "strikePrice" | "expirationDate">) {
  return [transaction.underlyingSymbol || transaction.symbol, transaction.optionType ?? "unknown", transaction.strikePrice ?? 0, transaction.expirationDate ?? ""].join("|");
}

function optionWarnings(transaction: TradeTransaction) {
  const warnings: string[] = [];
  if (!transaction.optionType) warnings.push("Missing option type for options");
  if (!transaction.strikePrice) warnings.push("Missing option strike");
  if (!transaction.expirationDate) warnings.push("Missing expiration");
  return warnings;
}

function unresolvedOptionEvent(transaction: TradeTransaction, warning: string): RealizedPnLEvent {
  return {
    id: `pnl-unresolved-${transaction.id}`,
    date: transaction.tradeDate,
    symbol: transaction.underlyingSymbol || transaction.symbol,
    strategy: "DATA_ISSUE",
    grossProceeds: transaction.netAmount,
    costBasis: null,
    optionPremium: 0,
    fees: transaction.fees,
    realizedPnl: 0,
    quantity: transaction.quantity,
    capitalDeployed: null,
    roiPercent: null,
    annualizedRoiPercent: null,
    holdingDays: null,
    linkedTransactionIds: [transaction.id],
    explanation: "This option transaction could not be linked to an opening trade.",
    warnings: [warning]
  };
}

function eventToPosition(event: RealizedPnLEvent, openDate: string): PositionCapitalRecord {
  return {
    id: `pos-${event.id}`,
    symbol: event.symbol,
    strategy: event.strategy,
    openDate,
    closeDate: event.date,
    capitalAmount: event.capitalDeployed,
    realizedPnl: event.realizedPnl,
    roiPercent: event.roiPercent,
    annualizedRoiPercent: event.annualizedRoiPercent,
    holdingDays: event.holdingDays,
    linkedTransactionIds: event.linkedTransactionIds,
    explanation: event.explanation,
    warnings: event.warnings
  };
}

function capitalForMonth(usage: CapitalUsage[], year: number, month: number, asOfDate?: string) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthDays = daysInMonth(year, month);
  const asOfMonth = asOfDate?.slice(0, 7);
  const asOfDay = asOfDate ? Number(asOfDate.slice(8, 10)) : monthDays;
  const days =
    asOfMonth === undefined || monthKey < asOfMonth
      ? monthDays
      : monthKey === asOfMonth
        ? Math.min(monthDays, Math.max(1, asOfDay))
        : 0;
  let capitalDays = 0;
  let peakDeployedCapital = 0;
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const deployed = pointInTimeCapital(usage, date);
    capitalDays += deployed;
    peakDeployedCapital = Math.max(peakDeployedCapital, deployed);
  }
  return {
    endDate: `${monthKey}-${String(days || monthDays).padStart(2, "0")}`,
    capitalDays,
    days,
    averageDeployedCapital: days > 0 ? capitalDays / days : 0,
    peakDeployedCapital
  };
}

function averageCapitalByStrategy(usage: CapitalUsage[], year: number, month: number, asOfDate: string | undefined, ...strategies: Strategy[]) {
  const strategyUsage = usage.filter((row) => strategies.includes(row.strategy));
  return capitalForMonth(strategyUsage, year, month, asOfDate).averageDeployedCapital;
}

function peakCapitalByStrategy(usage: CapitalUsage[], year: number, month: number, asOfDate: string | undefined, ...strategies: Strategy[]) {
  const strategyUsage = usage.filter((row) => strategies.includes(row.strategy));
  return capitalForMonth(strategyUsage, year, month, asOfDate).peakDeployedCapital;
}

function pointInTimeCapital(usage: CapitalUsage[], date: string) {
  return sum(
    usage
      .filter((row) => row.startDate <= date && row.endDate >= date)
      .map((row) => row.amount)
  );
}

function ratioForStrategy(events: RealizedPnLEvent[], capital: number, ...strategies: Strategy[]) {
  if (capital <= 0) return null;
  const pnl = sum(events.filter((event) => strategies.includes(event.strategy)).map((event) => event.realizedPnl));
  return pnl === 0 ? null : (pnl / capital) * 100;
}

function monthsBetween(start: string, end: string) {
  const months: string[] = [];
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth();
  while (year < endDate.getUTCFullYear() || (year === endDate.getUTCFullYear() && month <= endDate.getUTCMonth())) {
    months.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

function detectDuplicates(transactions: TradeTransaction[]) {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const transaction of transactions) {
    const key = [
      transaction.tradeDate,
      transaction.symbol,
      transaction.action,
      transaction.quantity,
      transaction.price,
      transaction.netAmount,
      transaction.rawDescription
    ].join("|");
    if (seen.has(key)) duplicates.push(transaction.id);
    else seen.set(key, transaction.id);
  }
  return duplicates;
}

function actionSortPriority(action: TradeTransaction["action"]) {
  const priority: Partial<Record<TradeTransaction["action"], number>> = {
    BUY: 10,
    SELL_TO_OPEN: 20,
    BUY_TO_OPEN: 20,
    BUY_TO_CLOSE: 30,
    SELL_TO_CLOSE: 30,
    EXPIRATION: 40,
    ASSIGNMENT: 40,
    SELL: 50
  };
  return priority[action] ?? 90;
}

function finalizeOpenLots(lots: MutableLot[]) {
  for (const lot of lots) {
    if (lot.remainingQuantity <= 0) lot.status = "closed";
    else if (lot.remainingQuantity < lot.originalQuantity) lot.status = "partially_closed";
    else lot.status = "open";
    lot.costBasisTotal = lot.remainingCostBasis;
    lot.costBasisPerShare = lot.remainingQuantity > 0 ? lot.remainingCostBasis / lot.remainingQuantity : lot.costBasisPerShare;
  }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateDiffDays(start: string, end: string) {
  return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / dayMs));
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function minDate(...dates: string[]) {
  return dates.filter(Boolean).sort()[0] ?? "";
}

function maxDate(...dates: string[]) {
  return dates.filter(Boolean).sort().at(-1) ?? "";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function strategyLabel(strategy: Strategy) {
  return strategy.replaceAll("_", " ").toLowerCase();
}

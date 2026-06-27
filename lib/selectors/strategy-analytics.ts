import type { CalculationResult } from "@/types/trading";
import { tradeQuality, type TradeQuality } from "@/lib/selectors/trade-quality";
import { premiumStats, type PremiumStats } from "@/lib/selectors/premium-capture";

export type StrategyKey = "csp" | "cc" | "long" | "swing";

export interface StrategyAnalytics {
  key: StrategyKey;
  quality: TradeQuality;
  premium: PremiumStats | null; // null for swing (no short-premium concept)
  pnl: number;
  capitalAtRisk: number; // sum of capitalDeployed across currently-open positions
}

export const STRATEGY_EVENT_ENUMS: Record<StrategyKey, string[]> = {
  csp: ["CASH_SECURED_PUT", "PUT_ASSIGNMENT"],
  cc: ["COVERED_CALL", "COVERED_CALL_ASSIGNMENT", "COVERED_CALL_ASSIGNMENT_STOCK"],
  long: ["LONG_OPTION"],
  swing: ["SWING_TRADE"],
};

/** @deprecated Use STRATEGY_EVENT_ENUMS */
const EVENT_STRATEGIES = STRATEGY_EVENT_ENUMS;

/** Aggregate option metrics across CSP + CC + long, for the Positions "All options" view. */
export interface OptionsAggregateAnalytics {
  key: "options";
  quality: TradeQuality;
  premium: PremiumStats | null; // short-premium (CSP + CC) lifecycles
  pnl: number;
  capitalAtRisk: number; // sum of capitalDeployed across all currently-open option lifecycles
}

const OPTION_EVENT_ENUMS = [
  ...STRATEGY_EVENT_ENUMS.csp,
  ...STRATEGY_EVENT_ENUMS.cc,
  ...STRATEGY_EVENT_ENUMS.long,
];

export function optionsAnalytics(result: CalculationResult): OptionsAggregateAnalytics {
  const events = result.realizedEvents.filter((e) => OPTION_EVENT_ENUMS.includes(e.strategy));
  const quality = tradeQuality(events);
  const pnl = events.reduce((s, e) => s + e.realizedPnl, 0);

  // Premium reflects short positions only (CSP + CC); long options pay a debit, not collect premium.
  const shortLcs = result.optionLifecycles.filter(
    (l) => l.strategy === "CASH_SECURED_PUT" || l.strategy === "COVERED_CALL"
  );
  const premium = shortLcs.length > 0 ? premiumStats(shortLcs) : null;

  // Capital at risk across every open option lifecycle; short uses strike collateral as fallback.
  const capitalAtRisk = result.optionLifecycles
    .filter((l) => l.status === "open")
    .reduce(
      (s, l) =>
        s + (l.capitalDeployed ?? (l.direction === "short" ? l.strikePrice * l.sharesControlled : 0)),
      0
    );

  return { key: "options", quality, premium, pnl, capitalAtRisk };
}

export function strategyAnalytics(result: CalculationResult, key: StrategyKey): StrategyAnalytics {
  const events = result.realizedEvents.filter((e) => EVENT_STRATEGIES[key].includes(e.strategy));
  const quality = tradeQuality(events);
  const pnl = events.reduce((s, e) => s + e.realizedPnl, 0);

  let premium: PremiumStats | null = null;
  let capitalAtRisk = 0;

  if (key === "csp" || key === "cc") {
    const stratEnum = key === "csp" ? "CASH_SECURED_PUT" : "COVERED_CALL";
    const lcs = result.optionLifecycles.filter((l) => l.strategy === stratEnum);
    premium = premiumStats(lcs);
    capitalAtRisk = lcs
      .filter((l) => l.status === "open")
      .reduce((s, l) => s + (l.capitalDeployed ?? l.strikePrice * l.sharesControlled), 0);
  } else if (key === "long") {
    const lcs = result.optionLifecycles.filter((l) => l.direction === "long");
    premium = premiumStats(lcs);
    capitalAtRisk = lcs
      .filter((l) => l.status === "open")
      .reduce((s, l) => s + (l.capitalDeployed ?? 0), 0);
  } else {
    // swing: open stock lots' remaining cost
    capitalAtRisk = result.taxLots
      .filter((l) => l.status !== "closed")
      .reduce((s, l) => s + l.remainingQuantity * l.costBasisPerShare, 0);
  }

  return { key, quality, premium, pnl, capitalAtRisk };
}

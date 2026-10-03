import type { OptionLifecycle } from "@/types/trading";

export interface PremiumStats {
  premiumCollected: number;
  netOptionPnl: number;
  captureRate: number | null;
  captureCoveredCall: number | null;
  captureCashSecuredPut: number | null;
  assignmentRate: number | null;
  assignmentRateCall: number | null;
  assignmentRatePut: number | null;
  counts: { total: number; terminal: number; assigned: number; calls: number; puts: number };
}

const TERMINAL = new Set(["expired", "closed", "assigned"]);

function premiumIsRealized(lifecycle: OptionLifecycle) {
  return lifecycle.status === "expired" || lifecycle.status === "closed" ||
    (lifecycle.status === "assigned" && lifecycle.optionType === "call");
}

function capture(list: OptionLifecycle[]): number | null {
  const prem = list.reduce((s, l) => s + l.premiumReceived, 0);
  if (prem === 0) return null;
  const net = list.reduce((s, l) => s + l.netOptionPnl, 0);
  return net / prem;
}

function assignRate(list: OptionLifecycle[]): number | null {
  const terminal = list.filter((l) => TERMINAL.has(l.status));
  if (terminal.length === 0) return null;
  const assigned = terminal.filter((l) => l.status === "assigned").length;
  return assigned / terminal.length;
}

export function premiumStats(lifecycles: OptionLifecycle[]): PremiumStats {
  const terminal = lifecycles.filter((l) => TERMINAL.has(l.status));
  const realized = terminal.filter(premiumIsRealized);
  const premiumCollected = realized.reduce((s, l) => s + l.premiumReceived, 0);
  const netOptionPnl = realized.reduce((s, l) => s + l.netOptionPnl, 0);

  return {
    premiumCollected,
    netOptionPnl,
    captureRate: premiumCollected === 0 ? null : netOptionPnl / premiumCollected,
    captureCoveredCall: capture(realized.filter((l) => l.strategy === "COVERED_CALL")),
    captureCashSecuredPut: capture(realized.filter((l) => l.strategy === "CASH_SECURED_PUT")),
    assignmentRate: assignRate(terminal),
    assignmentRateCall: assignRate(terminal.filter((l) => l.optionType === "call")),
    assignmentRatePut: assignRate(terminal.filter((l) => l.optionType === "put")),
    counts: {
      total: realized.length,
      terminal: terminal.length,
      assigned: terminal.filter((l) => l.status === "assigned").length,
      calls: realized.filter((l) => l.optionType === "call").length,
      puts: realized.filter((l) => l.optionType === "put").length,
    },
  };
}

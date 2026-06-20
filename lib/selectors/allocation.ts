export interface Concentration {
  hhi: number;
  topShare: number;
  topN: { key: string; share: number }[];
  level: "low" | "moderate" | "high";
}
export interface AllocationStats {
  bySymbol: Concentration;
  byStrategy: Concentration;
}

function concentration(
  items: { key: string; capital: number }[],
  topN: number,
): Concentration {
  const weights = items.map((i) => ({ key: i.key, capital: Math.max(0, i.capital) }));
  const total = weights.reduce((s, w) => s + w.capital, 0);
  if (total <= 0) {
    return { hhi: 0, topShare: 0, topN: [], level: "low" };
  }
  const shares = weights
    .map((w) => ({ key: w.key, share: w.capital / total }))
    .sort((a, b) => b.share - a.share);
  const hhi = shares.reduce((s, x) => s + x.share * x.share, 0);
  const level = hhi <= 0.15 ? "low" : hhi <= 0.25 ? "moderate" : "high";
  return { hhi, topShare: shares[0]?.share ?? 0, topN: shares.slice(0, topN), level };
}

export function allocation(
  symbolBreakdown: { symbol: string; capital: number }[],
  strategyBreakdown: { strategy: string; capital: number }[],
  topN = 5,
): AllocationStats {
  return {
    bySymbol: concentration(
      symbolBreakdown.map((b) => ({ key: b.symbol, capital: b.capital })),
      topN,
    ),
    byStrategy: concentration(
      strategyBreakdown.map((b) => ({ key: b.strategy, capital: b.capital })),
      topN,
    ),
  };
}

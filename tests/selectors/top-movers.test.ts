import { topMovers } from "@/lib/selectors/top-movers";

const r = (b: { symbol: string; pnl: number }[]) =>
  ({ aggregates: { symbolBreakdown: b } } as any);

test("sorts by absolute pnl and caps to limit", () => {
  const out = topMovers(
    r([
      { symbol: "A", pnl: 100 },
      { symbol: "B", pnl: -900 },
      { symbol: "C", pnl: 50 },
    ]),
    2
  );
  expect(out.map((m) => m.symbol)).toEqual(["B", "A"]);
});

test("empty breakdown yields empty array", () => {
  expect(topMovers(r([]))).toEqual([]);
});

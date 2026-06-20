import { allocation } from "@/lib/selectors/allocation";

test("HHI, top share and level by symbol", () => {
  const out = allocation(
    [
      { symbol: "A", capital: 5000 },
      { symbol: "B", capital: 3000 },
      { symbol: "C", capital: 2000 },
    ],
    [],
  );
  // shares .5,.3,.2 -> hhi .25+.09+.04 = .38 -> high
  expect(out.bySymbol.hhi).toBeCloseTo(0.38, 5);
  expect(out.bySymbol.topShare).toBeCloseTo(0.5, 5);
  expect(out.bySymbol.level).toBe("high");
  expect(out.bySymbol.topN[0]).toEqual({ key: "A", share: 0.5 });
});

test("evenly spread -> lower HHI / level", () => {
  const out = allocation(
    Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, capital: 1000 })),
    [],
  );
  expect(out.bySymbol.hhi).toBeCloseTo(0.1, 5); // 10 * 0.1^2
  expect(out.bySymbol.level).toBe("low");
});

test("negative capital clamped, zero total -> safe empty", () => {
  const out = allocation([{ symbol: "X", capital: -100 }], []);
  expect(out.bySymbol.hhi).toBe(0);
  expect(out.bySymbol.topShare).toBe(0);
  expect(out.bySymbol.level).toBe("low");
  expect(out.bySymbol.topN).toEqual([]);
});

test("respects topN limit and computes strategy concentration", () => {
  const out = allocation(
    [],
    [
      { strategy: "COVERED_CALL", capital: 4000 },
      { strategy: "CASH_SECURED_PUT", capital: 4000 },
    ],
    1,
  );
  expect(out.byStrategy.hhi).toBeCloseTo(0.5, 5); // .5^2 + .5^2
  expect(out.byStrategy.topN).toHaveLength(1);
});

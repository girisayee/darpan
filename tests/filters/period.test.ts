import { periodFromPreset } from "@/lib/filters/period";

test("preset maps to year/month", () => {
  expect(periodFromPreset("ALL", 2026)).toEqual({ year: "ALL", month: "ALL" });
  expect(periodFromPreset("THIS_YEAR", 2026)).toEqual({ year: "2026", month: "ALL" });
  expect(periodFromPreset("LAST_YEAR", 2026)).toEqual({ year: "2025", month: "ALL" });
  expect(periodFromPreset("YTD", 2026)).toEqual({ year: "2026", month: "ALL" });
});

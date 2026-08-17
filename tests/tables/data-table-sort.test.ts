import { describe, it, expect } from "vitest";
import { compareOn, type Column } from "@/components/tables/DataTable";

type Row = { id: string; closeDate?: string; openDate?: string };

const closeCol: Column<Row> = { key: "closeDate", header: "Closed", value: (r) => r.closeDate ?? "" };
const openCol: Column<Row> = { key: "openDate", header: "Opened", value: (r) => r.openDate ?? "" };

/** Mirror the Positions default: primary open desc, tiebreak close desc. */
function sortPositions(rows: Row[]): string[] {
  return [...rows]
    .sort((a, b) => {
      const primary = compareOn(openCol, a, b, "desc");
      return primary !== 0 ? primary : compareOn(closeCol, a, b, "desc");
    })
    .map((r) => r.id);
}

describe("positions sort: open date desc, then close date desc", () => {
  it("orders by most recent open date first", () => {
    const rows: Row[] = [
      { id: "old", closeDate: "2026-01-10", openDate: "2026-01-01" },
      { id: "new", closeDate: "2026-03-10", openDate: "2026-03-01" },
      { id: "mid", closeDate: "2026-02-10", openDate: "2026-02-01" },
    ];
    expect(sortPositions(rows)).toEqual(["new", "mid", "old"]);
  });

  it("breaks ties on the same open date by close date desc", () => {
    const rows: Row[] = [
      { id: "closedEarlier", closeDate: "2026-02-10", openDate: "2026-01-01" },
      { id: "closedLater", closeDate: "2026-03-10", openDate: "2026-01-01" },
    ];
    expect(sortPositions(rows)).toEqual(["closedLater", "closedEarlier"]);
  });

  it("mixes active and closed positions strictly by open date", () => {
    const rows: Row[] = [
      { id: "closed", closeDate: "2026-03-10", openDate: "2026-03-01" },
      { id: "activeOld", openDate: "2026-01-01" },
      { id: "activeNew", openDate: "2026-05-01" },
    ];
    expect(sortPositions(rows)).toEqual(["activeNew", "closed", "activeOld"]);
  });
});

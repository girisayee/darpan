import { describe, it, expect } from "vitest";
import { intensity } from "@/components/dashboard/CalendarHeatmap";

describe("intensity", () => {
  it("floors at 0.2 and tops at 1.0", () => {
    expect(intensity(0, 100)).toBeCloseTo(0.2);
    expect(intensity(100, 100)).toBeCloseTo(1.0);
    expect(intensity(-50, 100)).toBeCloseTo(0.6);
  });
  it("returns floor when maxAbs is 0", () => {
    expect(intensity(0, 0)).toBeCloseTo(0.2);
  });
});

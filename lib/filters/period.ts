export type Preset = "ALL" | "YTD" | "THIS_YEAR" | "LAST_YEAR";

export function periodFromPreset(
  preset: Preset,
  currentYear: number
): { year: string; month: string } {
  switch (preset) {
    case "ALL":
      return { year: "ALL", month: "ALL" };
    case "LAST_YEAR":
      return { year: String(currentYear - 1), month: "ALL" };
    case "YTD":
    case "THIS_YEAR":
    default:
      return { year: String(currentYear), month: "ALL" };
  }
}

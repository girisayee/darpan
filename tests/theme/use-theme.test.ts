import { describe, expect, test } from "vitest";
import { resolveInitialTheme, nextTheme } from "@/lib/theme/use-theme";

describe("resolveInitialTheme", () => {
  test('returns "light" when stored is "light" (even if prefersDark=true)', () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  test('returns "dark" when stored is "dark" (even if prefersDark=false)', () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  test('returns "dark" when stored is null and prefersDark is true', () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
  });

  test('returns "light" when stored is null and prefersDark is false', () => {
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  test('returns "light" when stored is garbage and prefersDark is false', () => {
    expect(resolveInitialTheme("garbage", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  test('flips "dark" to "light"', () => {
    expect(nextTheme("dark")).toBe("light");
  });

  test('flips "light" to "dark"', () => {
    expect(nextTheme("light")).toBe("dark");
  });
});

import { describe, expect, test } from "vitest";
import { resolveInitialTheme, nextTheme } from "@/lib/theme/use-theme";

describe("resolveInitialTheme", () => {
  test('returns "light" when stored is "light"', () => {
    expect(resolveInitialTheme("light", false)).toBe("light");
  });

  test('returns "dark" when stored is "dark"', () => {
    expect(resolveInitialTheme("dark", true)).toBe("dark");
  });

  test('returns "light" when stored is null and prefersLight is true', () => {
    expect(resolveInitialTheme(null, true)).toBe("light");
  });

  test('returns "dark" when stored is null and prefersLight is false', () => {
    expect(resolveInitialTheme(null, false)).toBe("dark");
  });

  test('returns "dark" when stored is garbage and prefersLight is false', () => {
    expect(resolveInitialTheme("garbage", false)).toBe("dark");
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

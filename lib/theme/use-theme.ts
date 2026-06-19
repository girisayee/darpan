"use client";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "positioniq.theme";

/**
 * Pure helper: resolve the initial theme from a stored string and a media query result.
 * Returns stored when it is exactly "light" or "dark"; otherwise uses prefersDark.
 * Light is the default (prefersDark=false → "light").
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

/**
 * Pure helper: flip the theme.
 */
export function nextTheme(t: Theme): Theme {
  return t === "dark" ? "light" : "dark";
}

/**
 * React hook: persists theme to localStorage and applies the .dark class on <html>.
 * Light is the default (no class); dark mode adds the .dark class.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    return resolveInitialTheme(stored, prefersDark);
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => nextTheme(t)) };
}

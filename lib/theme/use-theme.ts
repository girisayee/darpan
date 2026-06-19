"use client";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "positioniq.theme";

/**
 * Pure helper: resolve the initial theme from a stored string and a media query result.
 * Returns stored when it is exactly "light" or "dark"; otherwise uses prefersLight.
 */
export function resolveInitialTheme(stored: string | null, prefersLight: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersLight ? "light" : "dark";
}

/**
 * Pure helper: flip the theme.
 */
export function nextTheme(t: Theme): Theme {
  return t === "dark" ? "light" : "dark";
}

/**
 * React hook: persists theme to localStorage and applies the .light class on <html>.
 * Dark is the default (no class); light mode adds the .light class.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem(KEY);
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches ?? false;
    return resolveInitialTheme(stored, prefersLight);
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => nextTheme(t)) };
}

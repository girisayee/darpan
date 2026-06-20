"use client";
import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const KEY = "positioniq.theme";

/**
 * Pure helper: resolve the initial theme from a stored string and a media query result.
 * Returns stored when it is exactly "light" or "dark"; otherwise uses prefersDark.
 * Light is the default (prefersDark=false → "light"). Mirrors the no-flash script in the
 * root layout, which is the code path that actually runs at startup.
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

// ── External theme store ───────────────────────────────────────────────────────
// The source of truth is the `.dark` class on <html>, set before paint by the
// no-flash inline script in the root layout. useSyncExternalStore reads it in a
// hydration-safe way (server + first client render use getServerSnapshot → "light",
// matching the SSR HTML), so there is no hydration mismatch and no setState-in-effect.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

/**
 * React hook: returns the active theme and a toggle that flips the `.dark` class,
 * persists the choice, and notifies subscribers.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = nextTheme(getSnapshot());
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore storage failures (e.g. private mode) */
    }
    for (const listener of listeners) listener();
  }

  return { theme, toggle };
}

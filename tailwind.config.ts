import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        /* ── New design-system tokens ── */
        background:       "var(--bg)",
        surface:          "var(--surface)",
        "surface-inset":  "var(--surface-inset)",
        hairline:         "var(--hairline)",
        "hairline-soft":  "var(--hairline-soft)",
        foreground:       "var(--text)",
        "muted-foreground": "var(--text-muted)",
        dim:              "var(--text-dim)",
        brand:            "var(--brand)",
        pos:              "var(--pos)",
        neg:              "var(--neg)",
        warn:             "var(--warn)",

        /* ── Legacy aliases (keep existing components compiling) ── */
        card:               "var(--surface)",
        border:             "var(--hairline)",
        primary:            "var(--brand)",
        "primary-foreground": "var(--bg)",
        success:            "var(--pos)",
        danger:             "var(--neg)",
        warning:            "var(--warn)",
        muted:              "var(--surface-inset)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { md: "8px", lg: "12px", xl: "14px" },
    },
  },
  plugins: [],
};

export default config;

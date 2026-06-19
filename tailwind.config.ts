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
        background:         "rgb(var(--bg) / <alpha-value>)",
        surface:            "rgb(var(--surface) / <alpha-value>)",
        "surface-inset":    "rgb(var(--surface-inset) / <alpha-value>)",
        hairline:           "rgb(var(--hairline) / <alpha-value>)",
        "hairline-soft":    "rgb(var(--hairline-soft) / <alpha-value>)",
        foreground:         "rgb(var(--text) / <alpha-value>)",
        "muted-foreground": "rgb(var(--text-muted) / <alpha-value>)",
        dim:                "rgb(var(--text-dim) / <alpha-value>)",
        brand:              "rgb(var(--brand) / <alpha-value>)",
        pos:                "rgb(var(--pos) / <alpha-value>)",
        neg:                "rgb(var(--neg) / <alpha-value>)",
        warn:               "rgb(var(--warn) / <alpha-value>)",

        /* ── Legacy aliases (keep existing components compiling) ── */
        card:                 "rgb(var(--surface) / <alpha-value>)",
        border:               "rgb(var(--hairline) / <alpha-value>)",
        primary:              "rgb(var(--brand) / <alpha-value>)",
        "primary-foreground": "rgb(var(--bg) / <alpha-value>)",
        success:              "rgb(var(--pos) / <alpha-value>)",
        danger:               "rgb(var(--neg) / <alpha-value>)",
        warning:              "rgb(var(--warn) / <alpha-value>)",
        muted:                "rgb(var(--surface-inset) / <alpha-value>)",
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

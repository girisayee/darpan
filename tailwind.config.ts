import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        /* ── Design-system tokens ── */
        background:         "rgb(var(--bg) / <alpha-value>)",
        surface:            "rgb(var(--surface) / <alpha-value>)",
        "surface-inset":    "rgb(var(--surface-inset) / <alpha-value>)",
        hairline:           "rgb(var(--hairline) / <alpha-value>)",
        "hairline-soft":    "rgb(var(--hairline-soft) / <alpha-value>)",
        foreground:         "rgb(var(--text) / <alpha-value>)",
        "muted-foreground": "rgb(var(--text-muted) / <alpha-value>)",
        dim:                "rgb(var(--text-dim) / <alpha-value>)",
        accent:             "rgb(var(--accent) / <alpha-value>)",
        "accent-2":         "rgb(var(--accent-2) / <alpha-value>)",
        "border-strong":    "rgb(var(--border-strong) / <alpha-value>)",
        pos:                "rgb(var(--pos) / <alpha-value>)",
        neg:                "rgb(var(--neg) / <alpha-value>)",
        warn:               "rgb(var(--warn) / <alpha-value>)",

      },
      backgroundImage: {
        aurora: "linear-gradient(135deg, rgb(var(--accent-2)), rgb(var(--accent)))",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { md: "8px", lg: "12px", xl: "14px" },
      keyframes: {},
      animation: {},
    },
  },
  plugins: [],
};

export default config;

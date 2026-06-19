"use client";

import { periodFromPreset, type Preset } from "@/lib/filters/period";

// ── Month label map ──────────────────────────────────────────────────────────
const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

const MONTH_VALUES = [
  "ALL",
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
] as const;

const STRATEGY_OPTIONS = [
  "ALL",
  "COVERED_CALL",
  "CASH_SECURED_PUT",
  "SWING_TRADE",
] as const;

const STRATEGY_LABELS: Record<string, string> = {
  ALL: "All",
  COVERED_CALL: "Covered Call",
  CASH_SECURED_PUT: "Cash-Secured Put",
  SWING_TRADE: "Swing Trade",
};

const PRESETS: { label: string; value: Preset }[] = [
  { label: "All time", value: "ALL" },
  { label: "YTD", value: "YTD" },
  { label: "This year", value: "THIS_YEAR" },
  { label: "Last year", value: "LAST_YEAR" },
];

// ── Props ────────────────────────────────────────────────────────────────────
export interface FilterBarProps {
  year: string;
  month: string;
  symbol: string;
  strategy: string;
  account: string;
  years: string[];
  symbols: string[];
  accounts: string[];
  onChange: (
    next: Partial<{
      year: string;
      month: string;
      symbol: string;
      strategy: string;
      account: string;
    }>
  ) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function deriveActivePreset(
  year: string,
  month: string
): Preset | null {
  const now = new Date().getFullYear();
  if (year === "ALL" && month === "ALL") return "ALL";
  if (month !== "ALL") return null; // explicit month → no preset active
  if (year === String(now)) return "THIS_YEAR"; // YTD and THIS_YEAR both → same state; highlight THIS_YEAR
  if (year === String(now - 1)) return "LAST_YEAR";
  return null;
}

function activeChips(
  year: string,
  month: string,
  symbol: string,
  strategy: string,
  account: string
): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  if (year !== "ALL" && month !== "ALL") {
    // Combined: "Jun 2026"
    chips.push({
      key: "year+month",
      label: `${MONTH_LABELS[month] ?? month} ${year}`,
    });
  } else {
    if (year !== "ALL") chips.push({ key: "year", label: year });
    if (month !== "ALL")
      chips.push({ key: "month", label: MONTH_LABELS[month] ?? month });
  }
  if (symbol !== "ALL") chips.push({ key: "symbol", label: symbol });
  if (strategy !== "ALL")
    chips.push({ key: "strategy", label: STRATEGY_LABELS[strategy] ?? strategy });
  if (account !== "ALL") chips.push({ key: "account", label: account });
  return chips;
}

// ── Component ────────────────────────────────────────────────────────────────
export function FilterBar({
  year,
  month,
  symbol,
  strategy,
  account,
  years,
  symbols,
  accounts,
  onChange,
}: FilterBarProps) {
  const now = new Date().getFullYear();
  const activePreset = deriveActivePreset(year, month);

  // Steps only through actual calendar years (not "ALL")
  const calendarYears = years.filter((y) => y !== "ALL");
  const currentIndex = calendarYears.indexOf(year);

  const canStepBack = currentIndex > 0;
  const canStepForward = currentIndex < calendarYears.length - 1;

  function stepYear(dir: -1 | 1) {
    if (dir === -1 && canStepBack) {
      onChange({ year: calendarYears[currentIndex - 1] });
    }
    if (dir === 1 && canStepForward) {
      onChange({ year: calendarYears[currentIndex + 1] });
    }
  }

  function handlePreset(preset: Preset) {
    onChange(periodFromPreset(preset, now));
  }

  function removeChip(key: string) {
    if (key === "year+month") {
      onChange({ year: "ALL", month: "ALL" });
    } else if (key === "year") {
      onChange({ year: "ALL" });
    } else if (key === "month") {
      onChange({ month: "ALL" });
    } else if (key === "symbol") {
      onChange({ symbol: "ALL" });
    } else if (key === "strategy") {
      onChange({ strategy: "ALL" });
    } else if (key === "account") {
      onChange({ account: "ALL" });
    }
  }

  const chips = activeChips(year, month, symbol, strategy, account);

  return (
    <div
      className="rounded-lg border border-hairline bg-surface p-[13px_15px]"
      role="search"
      aria-label="Period and filter controls"
    >
      {/* ── Row 1: Year stepper + Month rail ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-[14px]">
        {/* Year stepper */}
        <div>
          <div className="text-[10px] uppercase tracking-[.12em] text-muted-foreground mb-[5px]">
            Year
          </div>
          <div className="inline-flex items-center gap-[10px] rounded-[8px] border border-hairline px-[10px] py-[5px]">
            <button
              type="button"
              onClick={() => stepYear(-1)}
              disabled={currentIndex <= 0 && year !== "ALL"}
              aria-label="Previous year"
              className={[
                "text-[13px] leading-none text-dim transition-colors",
                canStepBack
                  ? "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-sm"
                  : "opacity-30 cursor-default",
              ].join(" ")}
            >
              ‹
            </button>
            <span className="font-mono text-[13px] text-foreground tabular-nums">
              {year === "ALL" ? "All" : year}
            </span>
            <button
              type="button"
              onClick={() => stepYear(1)}
              disabled={!canStepForward}
              aria-label="Next year"
              className={[
                "text-[13px] leading-none text-dim transition-colors",
                canStepForward
                  ? "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-sm"
                  : "opacity-30 cursor-default",
              ].join(" ")}
            >
              ›
            </button>
          </div>
        </div>

        {/* Month rail */}
        <div className="flex-1 min-w-[300px]">
          <div className="text-[10px] uppercase tracking-[.12em] text-muted-foreground mb-[5px]">
            Month
          </div>
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: "repeat(13, 1fr)" }}
            role="group"
            aria-label="Month filter"
          >
            {MONTH_VALUES.map((mv) => {
              const isActive = mv === month;
              const label = mv === "ALL" ? "All" : (MONTH_LABELS[mv] ?? mv);
              return (
                <button
                  key={mv}
                  type="button"
                  onClick={() =>
                    onChange({ month: mv === "ALL" ? "ALL" : mv })
                  }
                  aria-pressed={isActive}
                  aria-label={label}
                  className={[
                    "font-mono text-[11px] rounded-[999px] px-[4px] py-[3px] text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                    isActive
                      ? "bg-brand/15 text-brand"
                      : "text-dim hover:bg-surface-inset hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 2: Presets + Entity selects ───────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-[8px] mt-[13px] pt-[12px] border-t border-hairline-soft"
      >
        <span className="text-[10px] uppercase tracking-[.12em] text-muted-foreground mr-[2px]">
          Quick
        </span>

        {/* Preset pills */}
        {PRESETS.map(({ label, value }) => {
          const isActive = activePreset === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handlePreset(value)}
              aria-pressed={isActive}
              className={[
                "rounded-[999px] border px-[9px] py-[3px] text-[11px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                isActive
                  ? "border-brand/50 text-brand bg-brand/10"
                  : "border-hairline text-dim hover:border-brand/30 hover:text-foreground",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}

        {/* Divider */}
        <span
          className="w-px h-[18px] bg-hairline mx-[4px] shrink-0"
          aria-hidden="true"
        />

        {/* Symbol select */}
        <label className="sr-only" htmlFor="filterbar-symbol">Symbol</label>
        <select
          id="filterbar-symbol"
          value={symbol}
          onChange={(e) => onChange({ symbol: e.target.value })}
          className={[
            "text-[11px] text-dim border border-hairline rounded-[8px] px-[9px] py-[5px]",
            "bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
            "cursor-pointer",
          ].join(" ")}
        >
          <option value="ALL">Symbol: All</option>
          {symbols
            .filter((s) => s !== "ALL")
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </select>

        {/* Strategy select */}
        <label className="sr-only" htmlFor="filterbar-strategy">Strategy</label>
        <select
          id="filterbar-strategy"
          value={strategy}
          onChange={(e) => onChange({ strategy: e.target.value })}
          className={[
            "text-[11px] text-dim border border-hairline rounded-[8px] px-[9px] py-[5px]",
            "bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
            "cursor-pointer",
          ].join(" ")}
        >
          {STRATEGY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              Strategy: {STRATEGY_LABELS[s]}
            </option>
          ))}
        </select>

        {/* Account select */}
        <label className="sr-only" htmlFor="filterbar-account">Account</label>
        <select
          id="filterbar-account"
          value={account}
          onChange={(e) => onChange({ account: e.target.value })}
          className={[
            "text-[11px] text-dim border border-hairline rounded-[8px] px-[9px] py-[5px]",
            "bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
            "cursor-pointer",
          ].join(" ")}
        >
          <option value="ALL">Account: All</option>
          {accounts
            .filter((a) => a !== "ALL")
            .map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
        </select>
      </div>

      {/* ── Row 3: Active chips ────────────────────────────────────────── */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-[7px] mt-[12px]">
          <span className="text-[10px] uppercase tracking-[.12em] text-muted-foreground mr-[2px]">
            Active
          </span>
          {chips.map(({ key, label }) => (
            <span
              key={key}
              className="inline-flex items-center gap-[4px] rounded-[999px] border border-brand/40 bg-brand/10 text-brand text-[10px] px-[8px] py-[2px]"
            >
              {label}
              <button
                type="button"
                onClick={() => removeChip(key)}
                aria-label={`Remove ${label} filter`}
                className={[
                  "leading-none text-[10px] opacity-70 hover:opacity-100 transition-opacity",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 rounded-sm",
                ].join(" ")}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { periodFromPreset, type Preset } from "@/lib/filters/period";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

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
  /** Number of closed realized events for the current filter selection */
  summaryCount?: number;
  /** Total realized P&L for the current filter selection */
  summaryPnl?: number;
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
  if (month !== "ALL") return null;
  if (year === String(now)) return "THIS_YEAR";
  if (year === String(now - 1)) return "LAST_YEAR";
  return null;
}

function activeFilterNote(
  year: string,
  month: string,
  symbol: string,
  strategy: string,
  account: string
): string | null {
  const parts: string[] = [];
  if (year !== "ALL" && month !== "ALL") {
    parts.push(`${MONTH_LABELS[month] ?? month} ${year}`);
  } else {
    if (year !== "ALL") parts.push(year);
    if (month !== "ALL") parts.push(MONTH_LABELS[month] ?? month);
  }
  if (symbol !== "ALL") parts.push(symbol);
  if (strategy !== "ALL") parts.push(STRATEGY_LABELS[strategy] ?? strategy);
  if (account !== "ALL") parts.push(account);
  return parts.length > 0 ? `· ${parts.join(" · ")}` : null;
}

// ── Quiet select wrapper ─────────────────────────────────────────────────────
function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "font-sans text-[13px] text-foreground border border-hairline rounded-[8px] px-[10px] py-[6px]",
          "bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          "cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
        )}
      >
        {children}
      </select>
    </>
  );
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
  summaryCount,
  summaryPnl,
  onChange,
}: FilterBarProps) {
  const now = new Date().getFullYear();
  const activePreset = deriveActivePreset(year, month);

  function handlePreset(preset: Preset) {
    onChange(periodFromPreset(preset, now));
  }

  const filterNote = activeFilterNote(year, month, symbol, strategy, account);

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2"
      role="search"
      aria-label="Period and filter controls"
    >
      {/* ── Year dropdown ─────────────────────────────────────────────── */}
      <FilterSelect
        id="filterbar-year"
        label="Year"
        value={year}
        onChange={(v) => onChange({ year: v })}
      >
        <option value="ALL">All years</option>
        {years
          .filter((y) => y !== "ALL")
          .map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
      </FilterSelect>

      {/* ── Month dropdown ────────────────────────────────────────────── */}
      <FilterSelect
        id="filterbar-month"
        label="Month"
        value={month}
        onChange={(v) => onChange({ month: v })}
      >
        {MONTH_VALUES.map((mv) => (
          <option key={mv} value={mv}>
            {mv === "ALL" ? "All months" : (MONTH_LABELS[mv] ?? mv)}
          </option>
        ))}
      </FilterSelect>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <span className="w-px h-4 bg-hairline shrink-0" aria-hidden="true" />

      {/* ── Preset text links ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {PRESETS.map(({ label, value }) => {
          const isActive = activePreset === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handlePreset(value)}
              aria-pressed={isActive}
              className={cn(
                "font-sans text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm",
                isActive
                  ? "text-accent font-[500]"
                  : "text-muted-foreground hover:text-foreground font-[400]"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <span className="w-px h-4 bg-hairline shrink-0" aria-hidden="true" />

      {/* ── Entity dropdowns ──────────────────────────────────────────── */}
      <FilterSelect
        id="filterbar-symbol"
        label="Symbol"
        value={symbol}
        onChange={(v) => onChange({ symbol: v })}
      >
        <option value="ALL">Symbol: All</option>
        {symbols
          .filter((s) => s !== "ALL")
          .map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
      </FilterSelect>

      <FilterSelect
        id="filterbar-strategy"
        label="Strategy"
        value={strategy}
        onChange={(v) => onChange({ strategy: v })}
      >
        {STRATEGY_OPTIONS.map((s) => (
          <option key={s} value={s}>
            Strategy: {STRATEGY_LABELS[s]}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        id="filterbar-account"
        label="Account"
        value={account}
        onChange={(v) => onChange({ account: v })}
      >
        <option value="ALL">Account: All</option>
        {accounts
          .filter((a) => a !== "ALL")
          .map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
      </FilterSelect>

      {/* ── Active filter note + live summary ─────────────────────────── */}
      {(filterNote || summaryCount !== undefined) && (
        <span className="ml-auto font-sans text-[12px] text-muted-foreground tabular-nums shrink-0">
          {filterNote && <span>{filterNote}</span>}
          {summaryCount !== undefined && summaryPnl !== undefined && (
            <span className="ml-2">
              {formatNumber(summaryCount)} closed · {summaryPnl >= 0 ? "+" : ""}{formatCurrency(summaryPnl)}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

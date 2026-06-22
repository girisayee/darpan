export function formatCurrency(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    ...options
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

export function compactMonth(year: number, month: number) {
  const mon = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC"
  });
  return `${mon} '${String(year).slice(2)}`;
}

/** "2026-06" → "Jun" — short month label for chart axis ticks. */
export function monthTick(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC"
  });
}

/** "2026-06" → "Jun '26" — month label for chart tooltips (matches compactMonth). */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  return compactMonth(Number(m[1]), Number(m[2]));
}

/**
 * Display formatter for date strings. Abbreviated month, day (when present), 2-digit year:
 *   "2026-01-30" → "Jan 30, '26"  (full date)
 *   "2026-01"    → "Jan '26"      (year-month only)
 * Use ONLY for display — keep the raw ISO string as the sort key so ordering stays
 * chronological (lexicographic on ISO), not alphabetical on the formatted label.
 * Returns "—" for null/empty and falls back to the raw value if unparseable.
 */
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (full) {
    const monthDay = new Date(`${full[1]}-${full[2]}-${full[3]}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
    return `${monthDay}, '${full[1].slice(2)}`;
  }
  const ym = /^(\d{4})-(\d{2})$/.exec(value);
  if (ym) return compactMonth(Number(ym[1]), Number(ym[2]));
  return value;
}

import { emptyTermSummary, freezeTermSummary, type MutableTaxTermSummary } from "./helpers";
import type {
  TaxCategorySummary,
  TaxDisposition,
  TaxDispositionCategory,
  TaxSummaryIncompleteFlag,
  TaxYearSummary,
} from "./types";

export function summarizeTaxYear(
  dispositions: readonly TaxDisposition[],
  taxYear: number,
): TaxYearSummary {
  const shortTerm = emptyTermSummary();
  const longTerm = emptyTermSummary();
  const total = emptyTermSummary();
  const categories = new Map<TaxDispositionCategory, MutableTaxTermSummary>();
  const flags = new Set<TaxSummaryIncompleteFlag>();
  let includedDispositionCount = 0;
  let excludedDispositionCount = 0;
  let excludedProceedsCents = 0;

  for (const disposition of dispositions) {
    if (Number(disposition.disposedDate.slice(0, 4)) !== taxYear) continue;
    if (disposition.inclusion !== "INCLUDED" || disposition.gainLossCents === null) {
      excludedDispositionCount += 1;
      excludedProceedsCents += disposition.proceedsCents;
      if (disposition.inclusion === "EXCLUDED_UNKNOWN_BASIS") {
        flags.add("UNKNOWN_BASIS_DISPOSITIONS_EXCLUDED");
      }
      if (disposition.inclusion === "EXCLUDED_UNSUPPORTED") {
        flags.add("UNSUPPORTED_EVENTS_EXCLUDED");
      }
      continue;
    }

    if (disposition.term === "UNKNOWN") {
      excludedDispositionCount += 1;
      excludedProceedsCents += disposition.proceedsCents;
      flags.add("UNKNOWN_HOLDING_PERIOD");
      continue;
    }

    includedDispositionCount += 1;
    const termTarget = disposition.term === "SHORT_TERM" ? shortTerm : longTerm;
    addDisposition(termTarget, disposition);
    addDisposition(total, disposition);
    const categoryTarget = categories.get(disposition.category) ?? emptyTermSummary();
    addDisposition(categoryTarget, disposition);
    categories.set(disposition.category, categoryTarget);
  }

  const byCategory: Partial<Record<TaxDispositionCategory, TaxCategorySummary>> = {};
  for (const [category, categorySummary] of categories) {
    byCategory[category] = freezeTermSummary(categorySummary);
  }

  const frozenShortTerm = freezeTermSummary(shortTerm);
  const frozenLongTerm = freezeTermSummary(longTerm);
  const frozenTotal = freezeTermSummary(total);
  return Object.freeze({
    taxYear,
    shortTerm: frozenShortTerm,
    longTerm: frozenLongTerm,
    total: frozenTotal,
    byCategory: Object.freeze(byCategory),
    includedDispositionCount,
    excludedDispositionCount,
    excludedProceedsCents,
    netCapitalGainLossCents: frozenTotal.netGainLossCents,
    incompleteFlags: Object.freeze([...flags]),
  });
}

function addDisposition(target: MutableTaxTermSummary, disposition: TaxDisposition): void {
  const gainLoss = disposition.gainLossCents ?? 0;
  target.proceedsCents += disposition.proceedsCents;
  target.costBasisCents += disposition.costBasisCents ?? 0;
  target.realizedGainCents += Math.max(0, gainLoss);
  target.realizedLossCents += Math.min(0, gainLoss);
  target.netGainLossCents += gainLoss;
  target.dispositionCount += 1;
}

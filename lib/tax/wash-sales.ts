import type { TradeTransaction } from "@/types/trading";
import { accountFor, isIsoDate, normalizeQuantity } from "./helpers";
import type { PotentialWashSaleCandidate, TaxDisposition } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Flags simple exact-security wash-sale candidates. This is intentionally a screening
 * helper, not a tax determination: it does not match quantities, options, IRAs, spouses,
 * or substantially-identical securities.
 */
export function findPotentialWashSaleCandidates(
  dispositions: readonly TaxDisposition[],
  transactions: readonly TradeTransaction[],
): readonly PotentialWashSaleCandidate[] {
  const purchases = transactions.filter((transaction) =>
    transaction.status === "normalized" &&
    transaction.instrumentType === "stock" &&
    transaction.action === "BUY" &&
    normalizeQuantity(transaction.quantity) > 0 &&
    isIsoDate(transaction.tradeDate),
  );
  const candidates: PotentialWashSaleCandidate[] = [];

  for (const disposition of dispositions) {
    if (
      disposition.inclusion !== "INCLUDED" ||
      disposition.category !== "STOCK" ||
      disposition.gainLossCents === null ||
      disposition.gainLossCents >= 0 ||
      !isIsoDate(disposition.disposedDate)
    ) continue;

    for (const purchase of purchases) {
      if (
        purchase.symbol !== disposition.symbol ||
        accountFor(purchase).key !== disposition.account.key ||
        disposition.linkedTransactionIds.includes(purchase.id)
      ) continue;
      const daysFromSale = dateDiffDays(disposition.disposedDate, purchase.tradeDate);
      if (Math.abs(daysFromSale) > 30) continue;
      candidates.push(Object.freeze({
        id: `wash-candidate-${disposition.id}-${purchase.id}`,
        lossDispositionId: disposition.id,
        replacementPurchaseTransactionId: purchase.id,
        account: disposition.account,
        symbol: disposition.symbol,
        lossDisposedDate: disposition.disposedDate,
        replacementPurchaseDate: purchase.tradeDate,
        daysFromSale,
        lossCents: Math.abs(disposition.gainLossCents),
        lossQuantity: disposition.quantity,
        replacementQuantity: normalizeQuantity(purchase.quantity),
      }));
    }
  }

  candidates.sort((a, b) =>
    a.lossDisposedDate.localeCompare(b.lossDisposedDate) ||
    a.replacementPurchaseDate.localeCompare(b.replacementPurchaseDate) ||
    a.id.localeCompare(b.id),
  );
  return Object.freeze(candidates);
}

function dateDiffDays(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS,
  );
}

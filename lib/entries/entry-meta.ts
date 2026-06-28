import type { TradeTransaction } from "@/types/trading";

export type EntryKind = "manual" | "imported";

export type EntrySource = {
  kind: EntryKind;
  /** Broker label for imported rows (e.g. "Robinhood", "SoFi"); undefined for manual. */
  broker?: string;
  /** True when an imported row has been edited by the user. */
  edited: boolean;
  /** Display label: "Manual", "{broker}", or "{broker} · edited". */
  label: string;
};

/** True when the row was created by the user rather than imported from a broker file. */
export function isManualEntry(t: Pick<TradeTransaction, "importBatchId" | "tags">): boolean {
  return t.importBatchId === "manual" || (t.tags?.includes("manual") ?? false);
}

/**
 * Classify a transaction's origin for the entries admin. A purely manual row is
 * "Manual"; an imported row shows its broker, and "· edited" once the user has
 * changed it (editedAt set). Editing a manual row stays "Manual".
 */
export function entrySource(
  t: Pick<TradeTransaction, "importBatchId" | "tags" | "sourceBroker" | "editedAt">,
): EntrySource {
  if (isManualEntry(t)) return { kind: "manual", edited: false, label: "Manual" };
  const broker = t.sourceBroker?.trim() || "Imported";
  const edited = Boolean(t.editedAt);
  return { kind: "imported", broker, edited, label: edited ? `${broker} · edited` : broker };
}

/** Return the row with `createdAt` set to `nowIso` when it is missing; otherwise unchanged. */
export function stampCreatedAt(t: TradeTransaction, nowIso: string): TradeTransaction {
  return t.createdAt ? t : { ...t, createdAt: nowIso };
}

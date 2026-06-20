"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { inferOpenerAction, buildManualOpenTransaction } from "@/lib/utils/option-helpers";
import type { CalculationResult, TradeAction, TradeTransaction } from "@/types/trading";

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPTION_CLOSE_ACTIONS = new Set([
  "SELL_TO_CLOSE",
  "BUY_TO_CLOSE",
  "EXPIRATION",
  "ASSIGNMENT",
]);

interface OrphanRow {
  eventId: string;
  date: string;
  symbol: string;
  action: TradeAction;
  optionType: "call" | "put" | null;
  strikePrice: number | null;
  expirationDate: string | null;
  qty: number;
  sourceTx: TradeTransaction | undefined;
}

function buildOrphanRows(result: CalculationResult): OrphanRow[] {
  const txById = new Map<string, TradeTransaction>(
    result.transactions.map((t) => [t.id, t])
  );
  const rows: OrphanRow[] = [];
  for (const event of result.realizedEvents) {
    if (event.strategy !== "DATA_ISSUE") continue;
    const txId = event.linkedTransactionIds[0];
    const tx = txId ? txById.get(txId) : undefined;
    if (tx && !OPTION_CLOSE_ACTIONS.has(tx.action)) continue;
    if (!tx && event.quantity === 0) continue;
    rows.push({
      eventId: event.id,
      date: event.date,
      symbol: event.symbol,
      action: (tx?.action ?? "UNKNOWN") as TradeAction,
      optionType: tx?.optionType ?? null,
      strikePrice: tx?.strikePrice ?? null,
      expirationDate: tx?.expirationDate ?? null,
      qty: Math.abs(event.quantity || tx?.quantity || 0),
      sourceTx: tx,
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

function actionLabel(action: TradeAction | string): string {
  const map: Record<string, string> = {
    SELL_TO_CLOSE: "STC",
    BUY_TO_CLOSE: "BTC",
    EXPIRATION: "Expiration",
    ASSIGNMENT: "Assignment",
  };
  return map[action] ?? action;
}

function openerActionLabel(action: "BUY_TO_OPEN" | "SELL_TO_OPEN"): string {
  return action === "BUY_TO_OPEN" ? "Buy to Open (long)" : "Sell to Open (short)";
}

// ── Add-opening-leg form ──────────────────────────────────────────────────────

interface FormState {
  openerAction: "BUY_TO_OPEN" | "SELL_TO_OPEN";
  openDate: string;
  premium: string;
  contracts: string;
  fees: string;
}

interface FormErrors {
  openDate?: string;
  premium?: string;
  contracts?: string;
}

function validateForm(
  state: FormState,
  closeDate: string
): FormErrors {
  const errs: FormErrors = {};
  if (!state.openDate) {
    errs.openDate = "Open date is required.";
  } else if (state.openDate > closeDate) {
    errs.openDate = `Open date must be on or before close date (${closeDate}).`;
  }
  const premNum = Number(state.premium);
  if (state.premium === "" || isNaN(premNum) || premNum < 0) {
    errs.premium = "Premium must be ≥ 0.";
  }
  const ctrNum = Number(state.contracts);
  if (state.contracts === "" || isNaN(ctrNum) || !Number.isInteger(ctrNum) || ctrNum < 1) {
    errs.contracts = "Contracts must be a whole number ≥ 1.";
  }
  return errs;
}

function AddOpenForm({
  row,
  onSubmit,
}: {
  row: OrphanRow;
  onSubmit: (tx: TradeTransaction) => void;
}) {
  const inferredAction = row.action && OPTION_CLOSE_ACTIONS.has(row.action)
    ? inferOpenerAction(row.action as TradeAction)
    : "SELL_TO_OPEN";

  const [state, setState] = useState<FormState>({
    openerAction: inferredAction,
    openDate: "",
    premium: "",
    contracts: row.qty > 0 ? String(row.qty) : "1",
    fees: "0",
  });

  const [submitted, setSubmitted] = useState(false);

  const errors = submitted ? validateForm(state, row.date) : {};
  const isValid = Object.keys(validateForm(state, row.date)).length === 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) return;

    const tx = buildManualOpenTransaction({
      baseId: row.eventId,
      openDate: state.openDate,
      symbol: row.symbol,
      underlyingSymbol: row.sourceTx?.underlyingSymbol ?? row.symbol,
      optionType: row.optionType ?? "put",
      strikePrice: row.strikePrice ?? 0,
      expirationDate: row.expirationDate ?? row.date,
      action: state.openerAction,
      pricePerContract: Number(state.premium),
      contracts: Number(state.contracts),
      fees: Number(state.fees) || 0,
      sourceBroker: row.sourceTx?.sourceBroker ?? "Robinhood",
      accountName: row.sourceTx?.accountName ?? "",
    });
    onSubmit(tx);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-hairline bg-surface-inset p-3">
      <div className="font-sans text-[11.5px] font-medium text-foreground">Add opening trade</div>

      {/* Read-only inherited fields */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ReadOnlyField label="Symbol" value={row.symbol} />
        <ReadOnlyField label="Type" value={row.optionType ? row.optionType.charAt(0).toUpperCase() + row.optionType.slice(1) : "—"} />
        <ReadOnlyField label="Strike" value={row.strikePrice ? `$${row.strikePrice.toFixed(2)}` : "—"} />
        <ReadOnlyField label="Expiration" value={row.expirationDate ?? "—"} />
      </div>

      {/* Opener action (editable) */}
      <div className="grid gap-1">
        <label className="font-sans text-[11px] text-muted-foreground">
          Opening action
        </label>
        <select
          value={state.openerAction}
          onChange={(e) => setState((s) => ({ ...s, openerAction: e.target.value as FormState["openerAction"] }))}
          className="h-9 rounded-md border border-hairline bg-surface px-2.5 font-sans text-[12px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <option value="SELL_TO_OPEN">{openerActionLabel("SELL_TO_OPEN")}</option>
          <option value="BUY_TO_OPEN">{openerActionLabel("BUY_TO_OPEN")}</option>
        </select>
      </div>

      {/* User inputs */}
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField
          label="Open date"
          type="date"
          value={state.openDate}
          onChange={(v) => setState((s) => ({ ...s, openDate: v }))}
          error={errors.openDate}
          max={row.date}
        />
        <FormField
          label="Premium per contract ($)"
          type="number"
          value={state.premium}
          onChange={(v) => setState((s) => ({ ...s, premium: v }))}
          error={errors.premium}
          min="0"
          step="0.01"
          placeholder="e.g. 1.50"
        />
        <FormField
          label="Contracts"
          type="number"
          value={state.contracts}
          onChange={(v) => setState((s) => ({ ...s, contracts: v }))}
          error={errors.contracts}
          min="1"
          step="1"
        />
        <FormField
          label="Fees ($, optional)"
          type="number"
          value={state.fees}
          onChange={(v) => setState((s) => ({ ...s, fees: v }))}
          min="0"
          step="0.01"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent/15 px-3 font-sans text-[12px] font-medium text-accent transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add opener
        </button>
      </div>
    </form>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-sans text-[10.5px] text-muted-foreground">{label}</span>
      <span className="font-sans text-[12px] text-foreground">{value}</span>
    </div>
  );
}

function FormField({
  label,
  type,
  value,
  onChange,
  error,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <label className="font-sans text-[11px] text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 rounded-md border bg-surface px-2.5 font-sans text-[12px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          error ? "border-neg/60" : "border-hairline"
        )}
      />
      {error && (
        <span className="font-sans text-[10.5px] text-neg">{error}</span>
      )}
    </div>
  );
}

// ── OrphanRowCard ─────────────────────────────────────────────────────────────

function OrphanRowCard({
  row,
  onAddTransaction,
}: {
  row: OrphanRow;
  onAddTransaction: (tx: TradeTransaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolved, setResolved] = useState(false);

  // Only rows with the full matcher key (type + strike + expiration) can build a
  // valid opener — otherwise we'd synthesize a junk leg (strike 0) that never matches.
  const fixable =
    row.optionType != null &&
    row.strikePrice != null &&
    row.strikePrice > 0 &&
    !!row.expirationDate;

  function handleSubmit(tx: TradeTransaction) {
    onAddTransaction(tx);
    setResolved(true);
    setExpanded(false);
  }

  const typeParts: string[] = [];
  if (row.optionType) typeParts.push(row.optionType.charAt(0).toUpperCase() + row.optionType.slice(1));
  if (row.strikePrice) typeParts.push(`$${row.strikePrice.toFixed(2)}`);
  if (row.expirationDate) typeParts.push(row.expirationDate);

  return (
    <div className={cn(
      "rounded-lg border bg-surface p-3 transition-colors",
      resolved ? "border-pos/30 bg-pos/5" : "border-hairline"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-sans text-[13px] font-medium text-foreground">{row.symbol}</span>
            <span className="font-sans text-[11px] text-muted-foreground">{actionLabel(row.action)}</span>
            {row.qty > 0 && (
              <span className="font-sans text-[11px] tabular-nums text-muted-foreground">× {row.qty}</span>
            )}
          </div>
          {typeParts.length > 0 && (
            <div className="font-sans text-[11px] text-muted-foreground">
              {typeParts.join(" · ")}
            </div>
          )}
          <div className="font-sans text-[11px] tabular-nums text-muted-foreground">{row.date}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {resolved ? (
            <span className="inline-flex items-center rounded-full bg-pos/15 px-2 py-0.5 font-sans text-[11px] font-medium text-pos">
              Added
            </span>
          ) : fixable ? (
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-hairline bg-surface px-2.5 font-sans text-[11.5px] font-medium text-accent transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-expanded={expanded}
            >
              {expanded ? "Cancel" : "Add opening trade"}
            </button>
          ) : (
            <span className="font-sans text-[11px] text-muted-foreground">
              Missing option details
            </span>
          )}
        </div>
      </div>

      {expanded && !resolved && fixable && (
        <AddOpenForm row={row} onSubmit={handleSubmit} />
      )}
    </div>
  );
}

// ── ReviewFixPanel ────────────────────────────────────────────────────────────

export function ReviewFixPanel({
  open,
  onClose,
  result,
  onAddTransaction,
}: {
  open: boolean;
  onClose: () => void;
  result: CalculationResult;
  onAddTransaction: (tx: TradeTransaction) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus management
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    } else {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;

    function getFocusable() {
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.closest("[hidden]"));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  const orphans = buildOrphanRows(result);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Review & fix data issues"
        className="motion-safe:animate-[slideIn_160ms_ease] relative z-10 h-full w-[64%] min-w-[380px] overflow-y-auto bg-surface border-l border-hairline"
        style={{ maxWidth: "640px", background: "rgb(var(--surface))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-hairline pb-4">
            <div>
              <h2 className="font-sans text-[16px] font-medium text-foreground">
                Review &amp; fix data issues
              </h2>
              <p className="mt-1 font-sans text-[11.5px] text-muted-foreground">
                Add a missing opening leg to resolve orphan option closes.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg border border-hairline p-2 text-muted-foreground transition hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="mt-4 space-y-3">
            {orphans.length === 0 ? (
              <div className="rounded-lg border border-pos/30 bg-pos/5 p-4 font-sans text-[12.5px] text-pos">
                No unresolved closes — all option trades are matched.
              </div>
            ) : (
              <>
                <p className="font-sans text-[12px] text-muted-foreground">
                  {orphans.length} unresolved close{orphans.length !== 1 ? "s" : ""} need an opening leg.
                </p>
                {orphans.map((row) => (
                  <OrphanRowCard
                    key={row.eventId}
                    row={row}
                    onAddTransaction={onAddTransaction}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Slide-in animation (reuse DetailDrawer keyframe) */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0.7; }
          to   { transform: translateX(0);    opacity: 1;   }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[slideIn_160ms_ease\\] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

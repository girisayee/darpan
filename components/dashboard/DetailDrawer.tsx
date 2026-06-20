"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type { RealizedPnLEvent, TradeTransaction } from "@/types/trading";

// ---------- helpers ----------

function signedCurrency(value: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const formatted = formatCurrency(Math.abs(value), { maximumFractionDigits: 2, ...opts });
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

function toneClass(value: number | null | undefined) {
  if (value === null || value === undefined) return "text-foreground";
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-foreground";
}

/** Human-readable label for a strategy key. */
function strategyLabel(strategy: string) {
  if (!strategy) return "N/A";
  const labels: Record<string, string> = {
    COVERED_CALL: "Covered call",
    COVERED_CALL_ASSIGNMENT: "CC assignment",
    COVERED_CALL_ASSIGNMENT_STOCK: "CC assignment (stock sale)",
    CASH_SECURED_PUT: "Cash-secured put",
    PUT_ASSIGNMENT: "Put assignment",
    SWING_TRADE: "Swing trade",
    DATA_ISSUE: "Data issue",
  };
  return labels[strategy] ?? strategy.toLowerCase().replace(/_/g, " ");
}

// ---------- MetaCell ----------

function MetaCell({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="font-sans text-[11px] font-normal text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-sans text-[12.5px] font-medium tabular-nums text-foreground", valueClass)}>
        {value}
      </div>
    </div>
  );
}

// ---------- DetailDrawer ----------

export function DetailDrawer({
  event,
  onClose,
  transactions,
}: {
  event: RealizedPnLEvent | null;
  onClose: () => void;
  transactions: TradeTransaction[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Capture the element that had focus before the drawer opened
  useEffect(() => {
    if (event) {
      previousFocusRef.current = document.activeElement;
      // Move focus into the drawer after paint
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    } else {
      // Return focus when the drawer closes
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    }
  }, [event]);

  // Esc closes
  useEffect(() => {
    if (!event) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  // Focus trap: keep Tab within the panel
  useEffect(() => {
    if (!event || !panelRef.current) return;
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
  }, [event]);

  if (!event) return null;

  // Derived values — null-safe throughout
  const grossProceeds = event.grossProceeds ?? 0;
  const costBasis = event.costBasis ?? 0;
  const fees = event.fees ?? 0;
  const realizedPnl = event.realizedPnl ?? 0;
  const roiPercent = event.roiPercent ?? null;
  const annualizedRoiPercent = event.annualizedRoiPercent ?? null;
  const holdingDays = event.holdingDays ?? null;
  const capitalDeployed = event.capitalDeployed ?? null;

  // Find linked transactions for the basis note
  const linked = transactions.filter((tx) =>
    event.linkedTransactionIds.includes(tx.id)
  );

  // Basis note: derive lot info from explanation or linked transactions
  const hasBasisNote = !!event.explanation && event.explanation.trim().length > 0;

  // Opening date — earliest linked transaction date or fall back to event.date
  const openDate =
    linked.length > 0
      ? linked.reduce<string>((earliest, tx) =>
          tx.tradeDate < earliest ? tx.tradeDate : earliest
        , linked[0].tradeDate)
      : null;

  return (
    /* Backdrop scrim */
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      {/* Panel — clicks inside do NOT close */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.symbol} realized P&L detail`}
        className="motion-safe:animate-[slideIn_160ms_ease] relative z-10 h-full w-[64%] min-w-[380px] overflow-y-auto bg-surface border-l border-hairline"
        style={{ maxWidth: "640px", background: "rgb(var(--surface))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {/* ── Header ── */}
          <div
            className="flex items-start justify-between gap-3 border-b border-hairline pb-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-sans text-[16px] font-medium text-foreground">
                  {event.symbol}
                </span>
                {/* Strategy chip — accent-tinted pill, safe kind mapping */}
                <span
                  className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-accent"
                >
                  {strategyLabel(event.strategy)}
                </span>
              </div>
              <div className="mt-1 font-sans text-[11px] tabular-nums text-muted-foreground">
                Closed {event.date}
                {event.quantity ? ` · ${formatNumber(event.quantity)} shares` : ""}
              </div>
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

          {/* ── Hero: Realized P&L + ROI ── */}
          <div className="flex items-baseline gap-3 mt-4 mb-2">
            <div>
              <div className="font-sans text-[11px] text-muted-foreground">
                Realized P&amp;L
              </div>
              <div
                className={cn(
                  "font-sans text-[30px] font-medium tabular-nums mt-1",
                  toneClass(realizedPnl)
                )}
              >
                {signedCurrency(realizedPnl)}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-sans text-[11px] text-muted-foreground">
                ROI
              </div>
              <div
                className={cn(
                  "font-sans text-[18px] font-medium tabular-nums mt-1",
                  toneClass(roiPercent)
                )}
              >
                {roiPercent !== null
                  ? `${roiPercent >= 0 ? "+" : ""}${formatPercent(roiPercent)}`
                  : "N/A"}
              </div>
            </div>
          </div>

          {/* ── Calculation waterfall ── */}
          <div className="font-sans text-[11px] text-muted-foreground mt-4">
            How this was calculated
          </div>
          <div className="mt-1.5">
            {/* Gross proceeds */}
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Gross proceeds</span>
              <span className={cn("font-sans tabular-nums font-medium", toneClass(grossProceeds))}>
                {signedCurrency(grossProceeds)}
              </span>
            </div>
            {/* Cost basis */}
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">
                Allocated cost basis
                {event.explanation?.match(/\b(FIFO|LIFO|AVERAGE)\b/i)
                  ? ` (${event.explanation.match(/\b(FIFO|LIFO|AVERAGE)\b/i)![0]})`
                  : ""}
              </span>
              <span className="font-sans tabular-nums font-medium text-neg">
                {costBasis !== 0 ? `−${formatCurrency(Math.abs(costBasis), { maximumFractionDigits: 2 })}` : "$0.00"}
              </span>
            </div>
            {/* Fees */}
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Fees</span>
              <span className="font-sans tabular-nums font-medium text-foreground">
                {fees !== 0
                  ? `−${formatCurrency(Math.abs(fees), { maximumFractionDigits: 2 })}`
                  : "$0.00"}
              </span>
            </div>
            {/* Total row */}
            <div className="flex items-center justify-between border-t border-hairline pt-2.5 mt-0.5 font-sans text-[13px]">
              <span className="text-foreground font-medium">Realized P&amp;L</span>
              <span
                className={cn(
                  "font-sans tabular-nums font-medium",
                  toneClass(realizedPnl)
                )}
              >
                {signedCurrency(realizedPnl)}
              </span>
            </div>
          </div>

          {/* ── 3×2 meta grid ── */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-y divide-hairline border border-hairline rounded-lg overflow-hidden">
            <MetaCell
              label="Opened"
              value={openDate ?? "N/A"}
            />
            <MetaCell
              label="Holding"
              value={
                holdingDays !== null
                  ? `${formatNumber(holdingDays)} days`
                  : "N/A"
              }
            />
            <MetaCell
              label="Capital"
              value={
                capitalDeployed !== null
                  ? formatCurrency(capitalDeployed)
                  : "N/A"
              }
            />
            <MetaCell
              label="Annualized"
              value={
                annualizedRoiPercent !== null
                  ? `${annualizedRoiPercent >= 0 ? "+" : ""}${formatPercent(annualizedRoiPercent)}`
                  : "N/A"
              }
              valueClass={toneClass(annualizedRoiPercent)}
            />
            <MetaCell
              label="Cost method"
              value={
                event.explanation?.match(/\b(FIFO|LIFO|AVERAGE)\b/i)?.[0] ?? "N/A"
              }
            />
            <MetaCell
              label="Warnings"
              value={
                event.warnings.length > 0
                  ? String(event.warnings.length)
                  : "None"
              }
              valueClass={event.warnings.length > 0 ? "text-warn" : "text-pos"}
            />
          </div>

          {/* ── Basis-allocation note ── */}
          {hasBasisNote && (
            <div className="mt-3.5 rounded-r-xl border-y border-r border-l-2 border-hairline border-l-accent bg-surface px-3 py-2.5">
              <div className="font-sans text-[12px] font-medium text-foreground">
                Basis allocation
              </div>
              <div className="mt-1 font-sans text-[11px] tabular-nums text-muted-foreground leading-relaxed">
                {event.explanation}
              </div>
            </div>
          )}

          {/* ── Warnings (if any) ── */}
          {event.warnings.length > 0 && (
            <div className="mt-3.5 space-y-1.5">
              <div className="font-sans text-[11px] text-muted-foreground">
                Warnings
              </div>
              {event.warnings.map((w, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 font-sans text-[11.5px] text-warn"
                >
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Hidden animation keyframes via a style tag — only injected once */}
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

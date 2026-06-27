"use client";

import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDisplayDate, formatNumber, formatPercent } from "@/lib/utils/format";
import type { CalculationResult, CapitalUsage, OptionLifecycle, RealizedPnLEvent, TaxLot, TradeTransaction } from "@/types/trading";
import { assignmentShareDetail, lifecycleShareDetail } from "@/lib/utils/option-helpers";
import { peakCapitalRoi, peakConcurrentCapital } from "@/lib/selectors/symbol-capital";
import { TickerLogo } from "@/components/common/TickerLogo";

/** Summary row for a single symbol, as produced by the calculation engine. */
export type SymbolSummary = CalculationResult["aggregates"]["symbolBreakdown"][number];

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

/** Strategy label for an option lifecycle by direction + optionType. */
function lifecycleStrategyLabel(lc: OptionLifecycle) {
  if (lc.direction === "long") {
    return lc.optionType === "call" ? "Long call" : "Long put";
  }
  return lc.optionType === "call" ? "Covered call" : "Cash-secured put";
}

/** Outcome label from lifecycle status. */
function outcomeLabel(status: OptionLifecycle["status"]) {
  if (status === "assigned") return "Assigned";
  if (status === "expired") return "Expired";
  if (status === "closed") return "Closed";
  return status;
}

function signedPercentText(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${formatPercent(value)}`;
}

// ---------- shared row primitives ----------

/** A label/value waterfall row. */
function Row({
  label,
  value,
  valueClass,
  bold,
  topBorder,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  bold?: boolean;
  topBorder?: boolean;
  helper?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2.5 font-sans text-[13px]",
        topBorder
          ? "border-t border-hairline pt-2.5 mt-0.5"
          : "border-b border-hairline-soft"
      )}
    >
      <span className={cn(bold ? "text-foreground font-medium" : "text-dim")}>
        {label}
        {helper ? (
          <span className="ml-1 text-[11px] text-muted-foreground">{helper}</span>
        ) : null}
      </span>
      <span className={cn("font-sans tabular-nums font-medium", valueClass ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

/** Section heading used in both views. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 font-sans text-[11px] text-muted-foreground">{children}</div>
  );
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
  lifecycle,
  symbol,
  onClose,
  onBack,
  transactions,
  events = [],
  optionLifecycles = [],
  taxLots = [],
  capitalUsage = [],
  onReviewFix,
  onSelectEvent,
  onSelectLifecycle,
}: {
  event?: RealizedPnLEvent | null;
  lifecycle?: OptionLifecycle | null;
  symbol?: SymbolSummary | null;
  onClose: () => void;
  /** When present, the active event/lifecycle view shows a back arrow that returns to the symbol view. */
  onBack?: () => void;
  transactions: TradeTransaction[];
  events?: RealizedPnLEvent[];
  optionLifecycles?: OptionLifecycle[];
  taxLots?: TaxLot[];
  capitalUsage?: CapitalUsage[];
  onReviewFix?: () => void;
  onSelectEvent?: (e: RealizedPnLEvent) => void;
  onSelectLifecycle?: (l: OptionLifecycle) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // The drawer is open when an event (stock/swing), a lifecycle (option), or a symbol is set.
  const open = !!event || !!lifecycle || !!symbol;

  // Capture the element that had focus before the drawer opened
  useEffect(() => {
    if (open) {
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
  }, [open]);

  // Esc closes
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

  // Focus trap: keep Tab within the panel
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

  const ariaLabel = lifecycle
    ? `${lifecycle.underlyingSymbol} option cycle detail`
    : event
      ? `${event.symbol} realized P&L detail`
      : `${symbol!.symbol} activity detail`;

  // A drill-in view (event/lifecycle on top of a symbol) shows a back arrow.
  const backHandler = symbol && (event || lifecycle) ? onBack : undefined;

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
        aria-label={ariaLabel}
        className="motion-safe:animate-[slideIn_160ms_ease] relative z-10 h-full w-[64%] min-w-[380px] overflow-y-auto bg-surface border-l border-hairline"
        style={{ maxWidth: "640px", background: "rgb(var(--surface))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {lifecycle ? (
            <OptionCycleBody
              lifecycle={lifecycle}
              transactions={transactions}
              events={events}
              taxLots={taxLots}
              onClose={onClose}
              onBack={backHandler}
              onReviewFix={onReviewFix}
              closeButtonRef={closeButtonRef}
            />
          ) : event ? (
            <EventDetailBody
              event={event}
              transactions={transactions}
              events={events}
              taxLots={taxLots}
              onClose={onClose}
              onBack={backHandler}
              closeButtonRef={closeButtonRef}
            />
          ) : (
            <SymbolDetailBody
              summary={symbol!}
              events={events}
              optionLifecycles={optionLifecycles}
              capitalUsage={capitalUsage}
              onClose={onClose}
              onSelectEvent={onSelectEvent}
              onSelectLifecycle={onSelectLifecycle}
              closeButtonRef={closeButtonRef}
            />
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

// ---------- EventDetailBody (stock / swing waterfall — unchanged) ----------

function EventDetailBody({
  event,
  transactions,
  events,
  taxLots,
  onClose,
  onBack,
  closeButtonRef,
}: {
  event: RealizedPnLEvent;
  transactions: TradeTransaction[];
  events: RealizedPnLEvent[];
  taxLots: TaxLot[];
  onClose: () => void;
  onBack?: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
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

  // Manual badge: any linked tx has importBatchId "manual" or tags includes "manual"
  const hasManualTx = linked.some(
    (tx) => tx.importBatchId === "manual" || tx.tags.includes("manual")
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

  // Share-leg detail for assignment events (called-away CC shares / put-acquired shares)
  const shareDetail = assignmentShareDetail(event, events, taxLots);

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                aria-label="Back to symbol"
                onClick={onBack}
                className="-ml-1 rounded-lg p-1 text-muted-foreground transition hover:bg-surface-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <TickerLogo symbol={event.symbol} size={24} />
            <span className="font-sans text-[16px] font-medium text-foreground">
              {event.symbol}
            </span>
            {/* Strategy chip — accent-tinted pill, safe kind mapping */}
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-accent">
              {strategyLabel(event.strategy)}
            </span>
            {hasManualTx && (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-accent">
                manual
              </span>
            )}
          </div>
          <div className="mt-1 font-sans text-[11px] tabular-nums text-muted-foreground">
            Closed {formatDisplayDate(event.date)}
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
          <div className="font-sans text-[11px] text-muted-foreground">ROI</div>
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
          <span className={cn("font-sans tabular-nums font-medium", toneClass(realizedPnl))}>
            {signedCurrency(realizedPnl)}
          </span>
        </div>
      </div>

      {/* ── Shares section (assignment share leg) ── */}
      {shareDetail && shareDetail.kind === "called-away" && (
        <div className="mt-4">
          <div className="font-sans text-[11px] text-muted-foreground">
            Called-away shares
          </div>
          <div className="mt-1.5">
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Shares sold at strike</span>
              <span className="font-sans tabular-nums font-medium text-foreground">
                {formatNumber(shareDetail.shares)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Share cost basis</span>
              <span className="font-sans tabular-nums font-medium text-neg">
                {shareDetail.costBasis != null
                  ? `−${formatCurrency(Math.abs(shareDetail.costBasis), { maximumFractionDigits: 2 })}`
                  : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Strike proceeds</span>
              <span className="font-sans tabular-nums font-medium text-pos">
                {`+${formatCurrency(shareDetail.proceeds, { maximumFractionDigits: 2 })}`}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-hairline pt-2.5 mt-0.5 font-sans text-[13px]">
              <span className="text-foreground font-medium">Assignment P&amp;L (shares)</span>
              <span className={cn("font-sans tabular-nums font-medium", toneClass(shareDetail.pnl))}>
                {signedCurrency(shareDetail.pnl)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 font-sans text-[13px]">
              <span className="text-dim">Share ROI</span>
              <span className={cn("font-sans tabular-nums font-medium", toneClass(shareDetail.roiPercent))}>
                {shareDetail.roiPercent !== null
                  ? `${shareDetail.roiPercent >= 0 ? "+" : ""}${formatPercent(shareDetail.roiPercent)}`
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>
      )}
      {shareDetail && shareDetail.kind === "acquired" && (
        <div className="mt-4">
          <div className="font-sans text-[11px] text-muted-foreground">
            Shares acquired
          </div>
          <div className="mt-1.5">
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Shares purchased at strike</span>
              <span className="font-sans tabular-nums font-medium text-foreground">
                {formatNumber(shareDetail.shares)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-hairline-soft py-2.5 font-sans text-[13px]">
              <span className="text-dim">Cost basis / share</span>
              <span className="font-sans tabular-nums font-medium text-foreground">
                {formatCurrency(shareDetail.costBasisPerShare, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-hairline pt-2.5 mt-0.5 font-sans text-[13px]">
              <span className="text-foreground font-medium">Total cost basis</span>
              <span className="font-sans tabular-nums font-medium text-foreground">
                {formatCurrency(shareDetail.costBasisTotal, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="py-2 font-sans text-[11px] text-muted-foreground">
              Strike purchase cost net of premium received.
            </div>
          </div>
        </div>
      )}

      {/* ── 3×2 meta grid ── */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-y divide-hairline border border-hairline rounded-lg overflow-hidden">
        <MetaCell label="Opened" value={openDate ? formatDisplayDate(openDate) : "N/A"} />
        <MetaCell
          label="Holding"
          value={holdingDays !== null ? `${formatNumber(holdingDays)} days` : "N/A"}
        />
        <MetaCell
          label="Capital"
          value={capitalDeployed !== null ? formatCurrency(capitalDeployed) : "N/A"}
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
          value={event.explanation?.match(/\b(FIFO|LIFO|AVERAGE)\b/i)?.[0] ?? "N/A"}
        />
        <MetaCell
          label="Warnings"
          value={event.warnings.length > 0 ? String(event.warnings.length) : "None"}
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
          <div className="font-sans text-[11px] text-muted-foreground">Warnings</div>
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
    </>
  );
}

// ---------- OptionCycleBody (lifecycle-driven) ----------

function OptionCycleBody({
  lifecycle,
  transactions,
  events,
  taxLots,
  onClose,
  onBack,
  onReviewFix,
  closeButtonRef,
}: {
  lifecycle: OptionLifecycle;
  transactions: TradeTransaction[];
  events: RealizedPnLEvent[];
  taxLots: TaxLot[];
  onClose: () => void;
  onBack?: () => void;
  onReviewFix?: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const lc = lifecycle;
  const share = lifecycleShareDetail(lc, events, taxLots);

  // ── Numbers ────────────────────────────────────────────────────────────────
  const capital = lc.capitalDeployed ?? 0;
  const assignmentStockPnl = lc.assignmentStockPnl ?? 0;
  const total = lc.netOptionPnl + (share ? assignmentStockPnl : 0);
  const cycleRoi = capital > 0 ? (total / capital) * 100 : null;
  const optionRoi = capital > 0 ? (lc.netOptionPnl / capital) * 100 : null;

  const isShort = lc.direction === "short";
  const endDate = lc.closeDate ?? lc.expirationDate;
  const heldDays =
    lc.openDate && endDate
      ? Math.round(
          (new Date(endDate + "T00:00:00").getTime() -
            new Date(lc.openDate + "T00:00:00").getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : null;

  // Annualized from option ROI when we have ROI and a positive holding period.
  const annualized =
    optionRoi !== null && heldDays != null && heldDays > 0
      ? optionRoi * (365 / heldDays)
      : null;

  const expiredWorthless = lc.closeCost === 0 && lc.status === "expired";

  // Manual badge: any linked tx (incl. lifecycle.linkedTransactionIds) is manual.
  const linkedIds = new Set(lc.linkedTransactionIds);
  const hasManualTx = transactions.some(
    (tx) =>
      linkedIds.has(tx.id) &&
      (tx.importBatchId === "manual" || tx.tags.includes("manual"))
  );

  const contractsNote = `${lc.contracts} contract${lc.contracts !== 1 ? "s" : ""} · ${formatNumber(lc.sharesControlled)} sh · strike ${formatCurrency(lc.strikePrice, { maximumFractionDigits: 2 })} · exp ${formatDisplayDate(lc.expirationDate)}`;

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <button
                type="button"
                aria-label="Back to symbol"
                onClick={onBack}
                className="-ml-1 rounded-lg p-1 text-muted-foreground transition hover:bg-surface-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <TickerLogo symbol={lc.underlyingSymbol} size={24} />
            <span className="font-sans text-[16px] font-medium text-foreground">
              {lc.underlyingSymbol}
            </span>
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-accent">
              {lifecycleStrategyLabel(lc)}
            </span>
            <span className="inline-flex items-center rounded-full bg-surface-inset px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-muted-foreground">
              {outcomeLabel(lc.status)}
            </span>
            {hasManualTx && (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-accent">
                manual
              </span>
            )}
          </div>
          <div className="mt-1 font-sans text-[11px] tabular-nums text-muted-foreground">
            {contractsNote}
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

      {/* ── Hero: total realized + cycle ROI ── */}
      <div className="flex items-baseline gap-3 mt-4 mb-2">
        <div>
          <div className="font-sans text-[11px] text-muted-foreground">Total realized</div>
          <div
            className={cn(
              "font-sans text-[30px] font-medium tabular-nums mt-1",
              toneClass(total)
            )}
          >
            {signedCurrency(total)}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="font-sans text-[11px] text-muted-foreground">Cycle ROI</div>
          <div
            className={cn(
              "font-sans text-[18px] font-medium tabular-nums mt-1",
              toneClass(cycleRoi)
            )}
          >
            {signedPercentText(cycleRoi)}
          </div>
        </div>
      </div>

      {/* ── Option trade ── */}
      <SectionLabel>Option trade</SectionLabel>
      <div className="mt-1.5">
        <Row
          label={isShort ? "Premium collected" : "Premium paid"}
          value={signedCurrency(isShort ? lc.premiumReceived : -lc.premiumReceived)}
          valueClass={toneClass(isShort ? lc.premiumReceived : -lc.premiumReceived)}
        />
        <Row
          label={expiredWorthless ? "Expired worthless" : "Buy-to-close cost"}
          value={
            expiredWorthless
              ? "$0.00"
              : `−${formatCurrency(Math.abs(lc.closeCost), { maximumFractionDigits: 2 })}`
          }
          valueClass="text-neg"
        />
        <Row
          label="Fees"
          value={
            lc.fees !== 0
              ? `−${formatCurrency(Math.abs(lc.fees), { maximumFractionDigits: 2 })}`
              : "$0.00"
          }
        />
        <Row
          label="Net option P&L"
          bold
          topBorder
          value={signedCurrency(lc.netOptionPnl)}
          valueClass={toneClass(lc.netOptionPnl)}
        />
        <Row
          label="Option ROI"
          helper={
            capital > 0
              ? `on ${formatCurrency(capital)} ${isShort ? "collateral" : "cost"}`
              : undefined
          }
          value={signedPercentText(optionRoi)}
          valueClass={toneClass(optionRoi)}
        />
        <Row
          label="Held"
          value={
            heldDays != null
              ? `${formatDisplayDate(lc.openDate)} → ${formatDisplayDate(endDate)} · ${formatNumber(heldDays)} days`
              : "—"
          }
        />
      </div>

      {/* ── Underlying shares (only if there is a share leg) ── */}
      {share && share.kind === "called-away" && (
        <>
          <SectionLabel>Underlying shares</SectionLabel>
          <div className="mt-1.5">
            <Row label="Shares" value={formatNumber(share.shares)} />
            <Row
              label="Share cost basis"
              value={
                share.basisMissing
                  ? "Not entered"
                  : `−${formatCurrency(Math.abs(share.costBasis ?? 0), { maximumFractionDigits: 2 })}`
              }
              valueClass={share.basisMissing ? "text-warn" : "text-neg"}
            />
            <Row
              label="Sold at strike"
              value={`+${formatCurrency(share.proceeds, { maximumFractionDigits: 2 })}`}
              valueClass="text-pos"
            />
            <Row
              label="Assignment P&L (shares)"
              bold
              topBorder
              value={signedCurrency(share.pnl)}
              valueClass={toneClass(share.pnl)}
            />
            <Row
              label="Share ROI"
              value={signedPercentText(share.roiPercent)}
              valueClass={toneClass(share.roiPercent)}
            />
          </div>
          {share.basisMissing && (
            <div className="mt-3 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2.5">
              <div className="font-sans text-[11.5px] text-warn leading-relaxed">
                Showing strike proceeds only — enter your share purchase to see the
                true gain/loss.
              </div>
              {onReviewFix && (
                <button
                  type="button"
                  onClick={onReviewFix}
                  className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-hairline bg-surface px-2.5 font-sans text-[11.5px] font-medium text-accent transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Enter share cost basis →
                </button>
              )}
            </div>
          )}
        </>
      )}
      {share && share.kind === "acquired" && (
        <>
          <SectionLabel>Underlying shares</SectionLabel>
          <div className="mt-1.5">
            <Row
              label="Shares purchased at strike"
              value={formatNumber(share.shares)}
            />
            <Row
              label="Cost basis / share"
              value={formatCurrency(share.costBasisPerShare, { maximumFractionDigits: 2 })}
            />
            <Row
              label="Total cost basis"
              bold
              topBorder
              value={formatCurrency(share.costBasisTotal, { maximumFractionDigits: 2 })}
            />
            <div className="py-2 font-sans text-[11px] text-muted-foreground">
              Strike purchase net of premium received — now held as a stock lot.
            </div>
          </div>
        </>
      )}

      {/* ── Total (only if there is a share leg) ── */}
      {share && (
        <>
          <SectionLabel>Total</SectionLabel>
          <div className="mt-1.5">
            <Row
              label="Option P&L"
              value={signedCurrency(lc.netOptionPnl)}
              valueClass={toneClass(lc.netOptionPnl)}
            />
            <Row
              label="Share P&L"
              value={signedCurrency(assignmentStockPnl)}
              valueClass={toneClass(assignmentStockPnl)}
            />
            <Row
              label="Total realized"
              bold
              topBorder
              value={signedCurrency(total)}
              valueClass={toneClass(total)}
            />
          </div>
        </>
      )}

      {/* ── Meta grid ── */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-y divide-hairline border border-hairline rounded-lg overflow-hidden">
        <MetaCell label="Opened" value={lc.openDate ? formatDisplayDate(lc.openDate) : "—"} />
        <MetaCell
          label="Held"
          value={heldDays != null ? `${formatNumber(heldDays)} days` : "—"}
        />
        <MetaCell
          label="Capital"
          value={capital > 0 ? formatCurrency(capital) : "—"}
        />
        <MetaCell
          label="Annualized"
          value={annualized !== null ? signedPercentText(annualized) : "N/A"}
          valueClass={annualized !== null ? toneClass(annualized) : undefined}
        />
        <MetaCell
          label="Warnings"
          value={lc.warnings.length > 0 ? String(lc.warnings.length) : "None"}
          valueClass={lc.warnings.length > 0 ? "text-warn" : "text-pos"}
        />
        <MetaCell label="Outcome" value={outcomeLabel(lc.status)} />
      </div>

      {/* ── Warnings ── */}
      {lc.warnings.length > 0 && (
        <div className="mt-3.5 space-y-1.5">
          <div className="font-sans text-[11px] text-muted-foreground">Warnings</div>
          {lc.warnings.map((w, i) => (
            <div
              key={i}
              className="rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 font-sans text-[11.5px] text-warn"
            >
              {w}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- SymbolDetailBody (per-ticker activity list) ----------

/** A clickable activity row inside the symbol drawer. */
function ActivityRow({
  onClick,
  title,
  subtitle,
  badge,
  amount,
  amountClass,
}: {
  onClick?: () => void;
  title: string;
  subtitle: string;
  badge?: string;
  amount: React.ReactNode;
  amountClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 border-b border-hairline-soft px-1 py-2.5 text-left font-sans text-[13px] transition-colors",
        onClick
          ? "hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          : "cursor-default"
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{title}</span>
          {badge && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium leading-none text-accent">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
          {subtitle}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className={cn("tabular-nums font-medium", amountClass ?? "text-foreground")}>
          {amount}
        </span>
        {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </span>
    </button>
  );
}

function SymbolDetailBody({
  summary,
  events,
  optionLifecycles,
  capitalUsage,
  onClose,
  onSelectEvent,
  onSelectLifecycle,
  closeButtonRef,
}: {
  summary: SymbolSummary;
  events: RealizedPnLEvent[];
  optionLifecycles: OptionLifecycle[];
  capitalUsage: CapitalUsage[];
  onClose: () => void;
  onSelectEvent?: (e: RealizedPnLEvent) => void;
  onSelectLifecycle?: (l: OptionLifecycle) => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const symbolEvents = events
    .filter((e) => e.symbol === summary.symbol)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const symbolCycles = optionLifecycles
    .filter((l) => l.underlyingSymbol === summary.symbol)
    .sort((a, b) => {
      const aEnd = a.closeDate ?? a.expirationDate;
      const bEnd = b.closeDate ?? b.expirationDate;
      return aEnd < bEnd ? 1 : -1;
    });

  // Option cycles already account for premium + assignment legs, so realized
  // events linked to those same transactions would double-list the trade.
  // Keep only events that aren't part of any of this symbol's cycles.
  const cycleTxIds = new Set(symbolCycles.flatMap((l) => l.linkedTransactionIds));
  const standaloneEvents = symbolEvents.filter(
    (e) => !e.linkedTransactionIds.some((id) => cycleTxIds.has(id))
  );

  const avgPnl = summary.trades > 0 ? summary.pnl / summary.trades : null;
  const peakRoi = peakCapitalRoi(capitalUsage, summary.symbol, summary.pnl);
  const peakCapital = peakConcurrentCapital(capitalUsage, summary.symbol);

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TickerLogo symbol={summary.symbol} size={24} />
            <span className="font-sans text-[16px] font-medium text-foreground">
              {summary.symbol}
            </span>
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-medium leading-none text-accent">
              {summary.trades} {summary.trades === 1 ? "trade" : "trades"}
            </span>
          </div>
          <div className="mt-1 font-sans text-[11px] tabular-nums text-muted-foreground">
            Realized activity across all strategies
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

      {/* ── Hero: Net P&L + ROI ── */}
      <div className="flex items-baseline gap-3 mt-4 mb-2">
        <div>
          <div className="font-sans text-[11px] text-muted-foreground">Net P&amp;L</div>
          <div
            className={cn(
              "font-sans text-[30px] font-medium tabular-nums mt-1",
              toneClass(summary.pnl)
            )}
          >
            {signedCurrency(summary.pnl)}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="font-sans text-[11px] text-muted-foreground">Return on capital</div>
          <div
            className={cn(
              "font-sans text-[18px] font-medium tabular-nums mt-1",
              toneClass(peakRoi)
            )}
          >
            {signedPercentText(peakRoi)}
          </div>
        </div>
      </div>

      {/* ── Meta grid ── */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-y divide-hairline border border-hairline rounded-lg overflow-hidden">
        <MetaCell label="Trades" value={formatNumber(summary.trades)} />
        <MetaCell
          label="Win rate"
          value={summary.winRate != null ? formatPercent(summary.winRate, 0) : "N/A"}
        />
        <MetaCell
          label="Avg P&L / trade"
          value={avgPnl != null ? signedCurrency(avgPnl) : "N/A"}
          valueClass={avgPnl != null ? toneClass(avgPnl) : undefined}
        />
        <MetaCell
          label="Capital deployed"
          value={peakCapital > 0 ? formatCurrency(peakCapital) : "—"}
        />
        <MetaCell
          label="Capital cycled"
          value={summary.capital > 0 ? formatCurrency(summary.capital) : "—"}
        />
        <MetaCell
          label="Turnover ROI"
          value={signedPercentText(summary.roiPercent)}
          valueClass={toneClass(summary.roiPercent)}
        />
      </div>

      {/* ── Capital ROI note ── */}
      <div className="mt-3 rounded-r-xl border-y border-r border-l-2 border-hairline border-l-accent bg-surface px-3 py-2.5">
        <div className="font-sans text-[11px] tabular-nums text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Return on capital</span> is P&amp;L
          over the most cash this symbol tied up at once
          {peakCapital > 0 ? ` (${formatCurrency(peakCapital)})` : ""} — recycling the same
          collateral across cycles doesn&apos;t inflate it.{" "}
          <span className="font-medium text-foreground">Turnover ROI</span> divides by capital
          summed across every closed cycle, so it reads lower the more you reuse collateral.
        </div>
      </div>

      {/* ── Option cycles ── */}
      {symbolCycles.length > 0 && (
        <>
          <SectionLabel>Option cycles</SectionLabel>
          <div className="mt-1.5">
            {symbolCycles.map((lc) => {
              const total = lc.netOptionPnl + (lc.assignmentStockPnl ?? 0);
              return (
                <ActivityRow
                  key={lc.id}
                  onClick={onSelectLifecycle ? () => onSelectLifecycle(lc) : undefined}
                  title={lifecycleStrategyLabel(lc)}
                  badge={outcomeLabel(lc.status)}
                  subtitle={`${formatDisplayDate(lc.openDate)} → ${formatDisplayDate(lc.closeDate ?? lc.expirationDate)}`}
                  amount={signedCurrency(total)}
                  amountClass={toneClass(total)}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ── Stock trades (events not already part of an option cycle) ── */}
      {standaloneEvents.length > 0 && (
        <>
          <SectionLabel>Stock trades</SectionLabel>
          <div className="mt-1.5">
            {standaloneEvents.map((ev) => (
              <ActivityRow
                key={ev.id}
                onClick={onSelectEvent ? () => onSelectEvent(ev) : undefined}
                title={strategyLabel(ev.strategy)}
                subtitle={`Closed ${formatDisplayDate(ev.date)}${ev.quantity ? ` · ${formatNumber(ev.quantity)} sh` : ""}`}
                amount={signedCurrency(ev.realizedPnl)}
                amountClass={toneClass(ev.realizedPnl)}
              />
            ))}
          </div>
        </>
      )}

      {symbolCycles.length === 0 && standaloneEvents.length === 0 && (
        <div className="mt-4 rounded-lg border border-hairline bg-surface-inset px-3 py-6 text-center font-sans text-[12px] text-muted-foreground">
          No realized activity for this symbol.
        </div>
      )}
    </>
  );
}


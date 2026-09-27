"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ChevronsUpDown,
  Info,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import { TickerLogo } from "@/components/common/TickerLogo";
import { calculateDashboard } from "@/lib/calculations/engine";
import { defaultSettings } from "@/lib/storage/local-store";
import {
  buildTaxDispositions,
  createStockLotLedger,
  estimateTaxes,
  findPotentialWashSaleCandidates,
  summarizeTaxYear,
  type FilingStatus,
  type PotentialWashSaleCandidate,
  type StockTaxLot,
  type TaxDisposition,
  type TaxDispositionCategory,
  type TaxEstimate,
  type TaxHoldingTerm,
  type TaxYearSummary,
} from "@/lib/tax";
import { cn } from "@/lib/utils/cn";
import { formatDisplayDate, formatMaskedCurrency, formatPercent } from "@/lib/utils/format";
import type { AppSettings, TaxEstimateSettings, TradeTransaction, TradingAccount } from "@/types/trading";

type TaxView = "realized" | "lots";
type ActivityStatus = "calculated" | "needs_basis" | "unsupported" | "potential_wash";
type ActivitySortKey = "disposedDate" | "symbol" | "gainLossCents" | "term";

type ActivityRow = {
  id: string;
  accountName: string;
  symbol: string;
  disposedDate: string;
  quantity: number;
  proceedsCents: number;
  costBasisCents: number | null;
  gainLossCents: number | null;
  term: TaxHoldingTerm | "MIXED";
  status: ActivityStatus;
  category: TaxDispositionCategory | "COMBINED";
  linkedTransactionIds: string[];
  slices: TaxDisposition[];
  washSaleCandidates: PotentialWashSaleCandidate[];
};

type TaxWorkspace = {
  dispositions: TaxDisposition[];
  lots: StockTaxLot[];
  issueCount: number;
  potentialWashCandidates: PotentialWashSaleCandidate[];
};

const FILING_STATUS_LABELS: Record<TaxEstimateSettings["filingStatus"], string> = {
  single: "Single",
  married_joint: "Married filing jointly",
  married_separate: "Married filing separately",
  head_of_household: "Head of household",
};

export function TaxesTab({
  settings,
  year,
  selectedAccountIds,
  transactions,
  accounts,
  onChangeSettings,
  onReviewIssues,
}: {
  settings: AppSettings;
  year: string;
  selectedAccountIds: string[];
  transactions: TradeTransaction[];
  accounts: TradingAccount[];
  onChangeSettings: (settings: AppSettings) => void;
  onReviewIssues: () => void;
}) {
  const [view, setView] = useState<TaxView>("realized");
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [desktopAudit, setDesktopAudit] = useState(false);
  const profile = settings.taxEstimate ?? defaultSettings.taxEstimate;
  const taxYear = Number(year) || new Date().getUTCFullYear();

  const scopedTransactions = useMemo(() => {
    const confirmedIds = profile.taxableAccountIds;
    const globalIds = selectedAccountIds;
    return transactions.filter((transaction) => {
      if (transaction.tags.includes("sample")) return false;
      if (!profile.confirmed || confirmedIds.length === 0) return false;
      if (!transaction.accountId || !confirmedIds.includes(transaction.accountId)) return false;
      if (globalIds.length > 0 && (!transaction.accountId || !globalIds.includes(transaction.accountId))) return false;
      return true;
    });
  }, [profile.confirmed, profile.taxableAccountIds, selectedAccountIds, transactions]);

  const workspace = useMemo(
    () => buildWorkspace(scopedTransactions, settings),
    [scopedTransactions, settings],
  );
  const summary = useMemo(
    () => summarizeTaxYear(workspace.dispositions, taxYear),
    [taxYear, workspace.dispositions],
  );
  const estimate = useMemo(
    () => estimateTaxes(summary, {
      shortTermFederalRatePercent: profile.shortTermRate,
      longTermFederalRatePercent: profile.longTermRate,
      filingStatus: toTaxFilingStatus(profile.filingStatus),
      projectedMagiCents: profile.projectedMagi == null ? undefined : dollarsToCents(profile.projectedMagi),
      otherNetInvestmentIncomeCents: dollarsToCents(profile.otherNetInvestmentIncome),
      stateLocalEffectiveRatePercent: profile.stateLocalRate == null ? undefined : profile.stateLocalRate,
    }),
    [profile, summary],
  );
  const potentialWashCandidatesForYear = useMemo(
    () => workspace.potentialWashCandidates.filter((candidate) => Number(candidate.lossDisposedDate.slice(0, 4)) === taxYear),
    [taxYear, workspace.potentialWashCandidates],
  );
  const activity = useMemo(
    () => groupActivity(workspace.dispositions, taxYear, potentialWashCandidatesForYear),
    [taxYear, workspace.dispositions, potentialWashCandidatesForYear],
  );
  const openLots = useMemo(
    () => workspace.lots.filter((lot) => lot.remainingQuantity > 0),
    [workspace.lots],
  );
  const excludedRows = activity.filter((row) => row.status === "needs_basis" || row.status === "unsupported");
  const basisKnownCount = activity.filter((row) => row.costBasisCents != null).length;
  const latestImportDate = transactions.filter((transaction) => !transaction.tags.includes("sample")).reduce(
    (latest, transaction) => transaction.tradeDate > latest ? transaction.tradeDate : latest,
    "",
  );
  const taxInputIssue = !profile.confirmed || profile.projectedMagi == null || profile.stateLocalRate == null;
  const potentialWashCount = activity.filter((row) => row.status === "potential_wash").length;
  const potentialWashRow = activity.find((row) => row.status === "potential_wash") ?? null;
  const needsAttention = excludedRows.length > 0 || workspace.issueCount > 0 || potentialWashCount > 0 || taxInputIssue;

  const reviewPotentialWash = () => {
    setView("realized");
    if (potentialWashRow) setSelected(potentialWashRow);
  };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setDesktopAudit(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const shouldLock = assumptionsOpen || (selected !== null && !desktopAudit);
    if (!shouldLock) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = priorOverflow; };
  }, [assumptionsOpen, desktopAudit, selected]);

  const saveProfile = (next: TaxEstimateSettings) => {
    onChangeSettings({ ...settings, taxEstimate: next });
    setAssumptionsOpen(false);
  };

  return (
    <div className="space-y-3 py-1">
      <header>
        <h1 className="font-sans text-[28px] font-semibold leading-tight text-foreground">Taxes</h1>
        <p className="mt-1 font-sans text-body text-muted-foreground">
          Estimated from imported realized activity{latestImportDate ? ` through ${formatLongDate(latestImportDate)}` : ""}
        </p>
      </header>

      <ReadinessBanner
        excludedCount={excludedRows.length}
        domainIssueCount={workspace.issueCount}
        potentialWashCount={potentialWashCount}
        needsSetup={taxInputIssue}
        onReview={excludedRows.length > 0 || workspace.issueCount > 0
          ? onReviewIssues
          : potentialWashCount > 0
            ? reviewPotentialWash
            : () => setAssumptionsOpen(true)}
      />

      <TaxReserveSnapshot
        summary={summary}
        estimate={estimate}
        profile={profile}
        hasPotentialWash={potentialWashCount > 0}
        maskAmounts={settings.maskAmounts}
      />

      <AssumptionsPanel
        profile={profile}
        accountCount={profile.taxableAccountIds.length}
        onEdit={() => setAssumptionsOpen(true)}
      />

      <div className="grid gap-3 xl:grid-cols-12 xl:items-start">
        {selected && desktopAudit && (
          <aside className="hidden xl:col-span-3 xl:col-start-10 xl:row-start-1 xl:block">
            <TaxAuditPanel auditId="tax-disposition-audit-desktop" row={selected} onClose={() => setSelected(null)} maskAmounts={settings.maskAmounts} />
          </aside>
        )}

        <section className={cn("min-w-0", selected ? "xl:col-span-9 xl:col-start-1 xl:row-start-1" : "xl:col-span-12")}>
          <TaxViewTabs view={view} onChange={setView} />
          {view === "lots" ? (
            <OpenLotsTable lots={openLots} maskAmounts={settings.maskAmounts} />
          ) : (
            <ActivityTable
              rows={activity}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              maskAmounts={settings.maskAmounts}
              basisKnownCount={basisKnownCount}
              excludedCount={excludedRows.length}
              potentialWashCount={potentialWashCount}
              onReviewPotentialWash={reviewPotentialWash}
              title="Realized activity"
            />
          )}
        </section>
      </div>

      <p className="flex items-start gap-1.5 font-sans text-caption text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Planning estimate only—not tax advice or a tax return. Reconcile with broker records and tax documents.
      </p>

      {selected && !desktopAudit && (
        <div className="xl:hidden">
          <div className="fixed inset-0 z-40 bg-background/70" aria-hidden="true" onClick={() => setSelected(null)} />
          <div className="fixed inset-x-2 bottom-2 top-16 z-50 overflow-auto rounded-[12px] bg-surface sm:left-auto sm:w-[min(92vw,620px)]">
            <TaxAuditPanel auditId="tax-disposition-audit-dialog" row={selected} onClose={() => setSelected(null)} maskAmounts={settings.maskAmounts} dialog />
          </div>
        </div>
      )}

      {assumptionsOpen && (
        <AssumptionsDialog
          initial={profile}
          accounts={accounts}
          onCancel={() => setAssumptionsOpen(false)}
          onSave={saveProfile}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {selected
          ? `${selected.status === "potential_wash" ? "Potential wash-sale" : "Disposition"} details opened for ${selected.symbol}.`
          : needsAttention ? "Tax estimate needs review." : "Tax estimate updated."}
      </span>
    </div>
  );
}

function buildWorkspace(transactions: TradeTransaction[], settings: AppSettings): TaxWorkspace {
  const grouped = new Map<string, TradeTransaction[]>();
  for (const transaction of transactions) {
    const key = transaction.accountId ?? `name:${transaction.accountName || "Unassigned"}`;
    const rows = grouped.get(key) ?? [];
    rows.push(transaction);
    grouped.set(key, rows);
  }

  const dispositions: TaxDisposition[] = [];
  const lots: StockTaxLot[] = [];
  let issueCount = 0;
  const taxSettings: AppSettings = { ...settings, includeFees: true, costBasisMethod: "FIFO" };
  for (const accountTransactions of grouped.values()) {
    const ledger = createStockLotLedger(accountTransactions, "FIFO");
    const result = calculateDashboard(accountTransactions, taxSettings);
    const built = buildTaxDispositions(result, ledger);
    dispositions.push(...built.dispositions);
    lots.push(...ledger.lots);
    issueCount += built.issues.length;
  }
  const potentialWashCandidates = [...findPotentialWashSaleCandidates(dispositions, transactions)];
  return { dispositions, lots, issueCount, potentialWashCandidates };
}

function groupActivity(
  dispositions: TaxDisposition[],
  taxYear: number,
  potentialWashCandidates: readonly PotentialWashSaleCandidate[],
): ActivityRow[] {
  const grouped = new Map<string, TaxDisposition[]>();
  const washCandidatesByDisposition = new Map<string, PotentialWashSaleCandidate[]>();
  for (const candidate of potentialWashCandidates) {
    const candidates = washCandidatesByDisposition.get(candidate.lossDispositionId) ?? [];
    candidates.push(candidate);
    washCandidatesByDisposition.set(candidate.lossDispositionId, candidates);
  }
  for (const disposition of dispositions) {
    if (Number(disposition.disposedDate.slice(0, 4)) !== taxYear) continue;
    const saleTransactionId = disposition.source === "STOCK_LEDGER"
      ? disposition.linkedTransactionIds.at(-1) ?? disposition.id
      : disposition.sourceEventId ?? disposition.id;
    const calculationLifecycleKey = disposition.source === "CALCULATION_EVENT" && disposition.linkedTransactionIds.length > 0
      ? `${disposition.disposedDate}|${disposition.symbol}|${[...disposition.linkedTransactionIds].sort().join(",")}`
      : saleTransactionId;
    const key = `${disposition.account.key}|${calculationLifecycleKey}`;
    const slices = grouped.get(key) ?? [];
    slices.push(disposition);
    grouped.set(key, slices);
  }

  return [...grouped.entries()].map(([id, slices]) => {
    const allIncluded = slices.every((slice) => slice.inclusion === "INCLUDED" && slice.gainLossCents !== null);
    const hasUnknownBasis = slices.some((slice) => slice.inclusion === "EXCLUDED_UNKNOWN_BASIS");
    const hasUnsupported = slices.some((slice) => slice.inclusion === "EXCLUDED_UNSUPPORTED");
    const rowWashCandidates = slices.flatMap((slice) => washCandidatesByDisposition.get(slice.id) ?? []);
    const hasPotentialWash = rowWashCandidates.length > 0;
    const terms = new Set(slices.filter((slice) => slice.term !== "UNKNOWN").map((slice) => slice.term));
    const categories = new Set(slices.map((slice) => slice.category));
    const combinedAssignment = categories.has("OPTION_ASSIGNMENT_ADJUSTMENT") && categories.has("STOCK");
    return {
      id,
      accountName: slices[0].account.accountName,
      symbol: slices[0].symbol,
      disposedDate: slices[0].disposedDate,
      quantity: combinedAssignment ? Math.max(...slices.map((slice) => slice.quantity)) : sum(slices.map((slice) => slice.quantity)),
      proceedsCents: sum(slices.map((slice) => slice.proceedsCents)),
      costBasisCents: allIncluded ? sum(slices.map((slice) => slice.costBasisCents ?? 0)) : null,
      gainLossCents: allIncluded ? sum(slices.map((slice) => slice.gainLossCents ?? 0)) : null,
      term: terms.size > 1 ? "MIXED" : [...terms][0] ?? "UNKNOWN",
      status: hasUnknownBasis ? "needs_basis" : hasUnsupported ? "unsupported" : hasPotentialWash ? "potential_wash" : "calculated",
      category: combinedAssignment ? "COMBINED" : [...categories][0] ?? "UNSUPPORTED",
      linkedTransactionIds: [...new Set(slices.flatMap((slice) => [...slice.linkedTransactionIds]))],
      slices,
      washSaleCandidates: rowWashCandidates,
    } satisfies ActivityRow;
  }).sort((a, b) => b.disposedDate.localeCompare(a.disposedDate) || a.symbol.localeCompare(b.symbol));
}

function ReadinessBanner({
  excludedCount,
  domainIssueCount,
  potentialWashCount,
  needsSetup,
  onReview,
}: {
  excludedCount: number;
  domainIssueCount: number;
  potentialWashCount: number;
  needsSetup: boolean;
  onReview: () => void;
}) {
  const hasIssue = excludedCount > 0 || domainIssueCount > 0 || potentialWashCount > 0 || needsSetup;
  const body = excludedCount > 0
    ? `${excludedCount} ${excludedCount === 1 ? "disposition" : "dispositions"} excluded — missing or unsupported tax data`
    : domainIssueCount > 0
      ? `${domainIssueCount} imported ${domainIssueCount === 1 ? "record needs" : "records need"} accounting review`
    : potentialWashCount > 0
      ? `${potentialWashCount} potential wash ${potentialWashCount === 1 ? "sale needs" : "sales need"} broker-record review`
    : needsSetup
      ? "Complete tax assumptions to include NIIT and state/local estimates"
      : "All included dispositions are classified";
  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-[10px] border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between",
      hasIssue ? "border-warn/30 bg-warn/10" : "border-pos/25 bg-pos/[0.06]",
    )}>
      <div className="flex min-w-0 items-center gap-3">
        {hasIssue
          ? <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          : <ShieldCheck className="h-4 w-4 shrink-0 text-pos" aria-hidden="true" />}
        <span className={cn("shrink-0 font-sans text-body font-medium", hasIssue ? "text-warn" : "text-pos")}>
          {hasIssue ? "Needs review" : "Reviewed"}
        </span>
        <span className="hidden h-4 w-px bg-hairline sm:block" aria-hidden="true" />
        <span className="line-clamp-2 font-sans text-body text-foreground sm:line-clamp-none sm:truncate">{body}</span>
      </div>
      {hasIssue && (
        <button
          type="button"
          onClick={onReview}
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-accent/30 bg-accent/15 px-3 py-1.5 font-sans text-body font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {excludedCount > 0
            ? `Review ${excludedCount} ${excludedCount === 1 ? "issue" : "issues"}`
            : domainIssueCount > 0
              ? `Review ${domainIssueCount} ${domainIssueCount === 1 ? "issue" : "issues"}`
            : potentialWashCount > 0
              ? `Review ${potentialWashCount} ${potentialWashCount === 1 ? "issue" : "issues"}`
              : "Edit assumptions"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function TaxReserveSnapshot({
  summary,
  estimate,
  profile,
  hasPotentialWash,
  maskAmounts,
}: {
  summary: TaxYearSummary;
  estimate: TaxEstimate;
  profile: TaxEstimateSettings;
  hasPotentialWash: boolean;
  maskAmounts: boolean;
}) {
  const completeForDisplay = estimate.isComplete && !hasPotentialWash;
  const subtotalCents = estimate.totalTaxCents ?? estimate.knownTaxSubtotalCents;
  const cushionCents = completeForDisplay && estimate.totalTaxCents != null
    ? Math.round(estimate.totalTaxCents * 1.07)
    : null;
  const components = [
    {
      label: "Short-term federal",
      value: estimate.federalShortTermCents,
      helper: `${formatMaskedCents(estimate.taxableShortTermGainCents, maskAmounts)} × ${formatPercent(profile.shortTermRate, 0)}`,
      tooltip: "Estimated federal tax on the short-term taxable bucket after capital-gain netting, using your planning ordinary rate.",
    },
    {
      label: "Long-term federal",
      value: estimate.federalLongTermCents,
      helper: `${formatMaskedCents(estimate.taxableLongTermGainCents, maskAmounts)} × ${formatPercent(profile.longTermRate, 0)}`,
      tooltip: "Estimated federal tax on the long-term taxable bucket after capital-gain netting, using your planning long-term rate.",
    },
    {
      label: "Estimated NIIT",
      value: estimate.niitCents,
      helper: estimate.niitCents == null ? "Needs income inputs" : "Calculated automatically · 3.8% test",
      tooltip: "Estimates 3.8% of the lesser of net investment income or projected modified adjusted gross income above the filing-status threshold.",
    },
    {
      label: "State & local",
      value: estimate.stateLocalCents,
      helper: profile.stateLocalRate == null ? "Add an effective rate" : `User planning rate · ${formatEffectiveRate(profile.stateLocalRate)}`,
      tooltip: "Applies your user-supplied combined effective state and local rate to positive net capital gain.",
    },
  ];
  return (
    <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface" aria-labelledby="tax-reserve-snapshot-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div>
          <h2 id="tax-reserve-snapshot-title" className="font-sans text-strong font-medium text-foreground">Tax reserve snapshot</h2>
          <p className="mt-0.5 font-sans text-caption text-muted-foreground">Estimated trading-gain tax components for this scope</p>
        </div>
        {hasPotentialWash && (
          <span className="inline-flex items-center gap-1 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 font-sans text-caption font-medium text-warn">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Potential wash-sale review pending
          </span>
        )}
      </div>

      <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-[minmax(250px,1.6fr)_repeat(4,minmax(130px,1fr))]">
        <div className="bg-accent/[0.06] px-4 py-4 shadow-[inset_3px_0_0_rgb(var(--accent))] sm:col-span-2 xl:col-span-1">
          <p className="font-sans text-body font-medium text-accent">
            {completeForDisplay ? "Estimated tax total" : "Estimated tax subtotal"}
          </p>
          <p className="mt-1.5 font-sans text-[30px] font-semibold tabular-nums leading-none text-accent">
            {formatMaskedCents(subtotalCents, maskAmounts)}
          </p>
          <p className={cn("mt-2 font-sans text-caption", hasPotentialWash ? "text-warn" : "text-muted-foreground")}>
            {cushionCents != null
              ? `Suggested reserve with 7% cushion ${formatMaskedCents(cushionCents, maskAmounts)}`
              : hasPotentialWash
                ? "Federal + NIIT + state/local · wash review pending"
                : "Only components with complete assumptions are included"}
          </p>
        </div>
        {components.map((component) => (
          <div key={component.label} className="bg-surface px-4 py-4">
            <p className="inline-flex items-center gap-1 font-sans text-caption font-medium text-muted-foreground">
              {component.label}<InfoTooltip text={component.tooltip} label={`${component.label} formula`} side="bottom" />
            </p>
            <p className={cn(
              "mt-1.5 font-sans text-[22px] font-semibold tabular-nums leading-none",
              component.value == null ? "text-warn" : component.value === 0 ? "text-muted-foreground" : "text-foreground",
            )}>
              {component.value == null ? "Not estimated" : formatMaskedCents(component.value, maskAmounts)}
            </p>
            <p className="mt-2 font-sans text-caption text-muted-foreground">{component.helper}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline bg-surface-inset/50 px-4 py-2.5 font-sans text-caption text-muted-foreground">
        <span className="font-medium text-foreground">Realized capital-gain inputs</span>
        <span>Net <strong className="font-medium tabular-nums text-foreground">{formatMaskedCents(summary.netCapitalGainLossCents, maskAmounts)}</strong></span>
        <span>Short-term <strong className="font-medium tabular-nums text-foreground">{formatMaskedCents(summary.shortTerm.netGainLossCents, maskAmounts)}</strong></span>
        <span>Long-term <strong className="font-medium tabular-nums text-foreground">{formatMaskedCents(summary.longTerm.netGainLossCents, maskAmounts)}</strong></span>
        <span className="ml-auto inline-flex items-center gap-1"><Info className="h-3.5 w-3.5" aria-hidden="true" /> Planning estimate—not a tax return.</span>
      </div>
    </section>
  );
}

function AssumptionsPanel({
  profile,
  accountCount,
  onEdit,
}: {
  profile: TaxEstimateSettings;
  accountCount: number;
  onEdit: () => void;
}) {
  const rows = [
    ["Filing status", FILING_STATUS_LABELS[profile.filingStatus]],
    ["Ordinary / ST", formatPercent(profile.shortTermRate, 0)],
    ["LTCG", formatPercent(profile.longTermRate, 0)],
    ["State & local", profile.stateLocalRate == null ? "Not estimated" : formatEffectiveRate(profile.stateLocalRate)],
    ["Scope", profile.confirmed ? `${accountCount} taxable ${accountCount === 1 ? "account" : "accounts"}` : "Needs confirmation"],
  ];
  return (
    <section className="rounded-[12px] border border-hairline bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-sans text-body font-medium text-foreground">Estimate assumptions</h2>
          <p className="mt-0.5 font-sans text-micro text-muted-foreground">Planning inputs—not filing rules</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 font-sans text-caption font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
        </button>
      </div>
      <dl className="mt-3 grid gap-px overflow-hidden rounded-md bg-hairline sm:grid-cols-2 lg:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-surface-inset/60 px-3 py-2.5">
            <dt className="font-sans text-micro text-muted-foreground">{label}</dt>
            <dd className={cn("mt-0.5 truncate font-sans text-caption font-medium tabular-nums", value === "Not estimated" || value === "Needs confirmation" ? "text-warn" : "text-foreground")}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TaxViewTabs({ view, onChange }: { view: TaxView; onChange: (view: TaxView) => void }) {
  const tabs: Array<[TaxView, string]> = [
    ["realized", "Realized activity"],
    ["lots", "Open lots"],
  ];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const moveFocus = (index: number) => {
    const next = tabs[index]?.[0];
    if (!next) return;
    onChange(next);
    tabRefs.current[index]?.focus();
  };
  return (
    <div className="scrollbar-thin mb-0 flex overflow-x-auto border-b border-hairline" role="tablist" aria-label="Tax workspace views">
      {tabs.map(([value, label], index) => (
        <button
          key={value}
          ref={(element) => { tabRefs.current[index] = element; }}
          type="button"
          role="tab"
          aria-selected={view === value}
          tabIndex={view === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveFocus((index + 1) % tabs.length);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveFocus((index - 1 + tabs.length) % tabs.length);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveFocus(0);
            } else if (event.key === "End") {
              event.preventDefault();
              moveFocus(tabs.length - 1);
            }
          }}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2 font-sans text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
            view === value ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ActivityTable({
  rows,
  selectedId,
  onSelect,
  maskAmounts,
  basisKnownCount,
  excludedCount,
  potentialWashCount,
  onReviewPotentialWash,
  title,
}: {
  rows: ActivityRow[];
  selectedId: string | null;
  onSelect: (row: ActivityRow) => void;
  maskAmounts: boolean;
  basisKnownCount: number;
  excludedCount: number;
  potentialWashCount: number;
  onReviewPotentialWash: () => void;
  title: string;
}) {
  const [sort, setSort] = useState<{ key: ActivitySortKey; direction: "asc" | "desc" }>({ key: "disposedDate", direction: "desc" });
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const aValue = a[sort.key];
    const bValue = b[sort.key];
    const comparison = typeof aValue === "number" && typeof bValue === "number"
      ? aValue - bValue
      : String(aValue ?? "").localeCompare(String(bValue ?? ""));
    return sort.direction === "asc" ? comparison : -comparison;
  }), [rows, sort]);
  const headers: Array<{ label: string; key?: ActivitySortKey; align?: "right" }> = [
    { label: "Disposed", key: "disposedDate" },
    { label: "Symbol", key: "symbol" },
    { label: "Account" },
    { label: "Quantity", align: "right" },
    { label: "Proceeds", align: "right" },
    { label: "Adjusted basis", align: "right" },
    { label: "Gain / loss", key: "gainLossCents", align: "right" },
    { label: "Term", key: "term" },
    { label: "Status" },
  ];
  return (
    <div className="rounded-b-[12px] border border-t-0 border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="font-sans text-strong font-medium text-foreground">{title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-accent/25 bg-accent/[0.06] px-2 py-1 font-sans text-caption tabular-nums text-accent">
            {basisKnownCount} of {rows.length} realized {rows.length === 1 ? "row has" : "rows have"} basis · {excludedCount} excluded
          </span>
          {potentialWashCount > 0 && (
            <button
              type="button"
              onClick={onReviewPotentialWash}
              aria-label={`Review ${potentialWashCount} potential wash ${potentialWashCount === 1 ? "sale" : "sales"}`}
              className="inline-flex items-center gap-1 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 font-sans text-caption tabular-nums text-warn hover:bg-warn/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn/40"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Review {potentialWashCount} potential wash {potentialWashCount === 1 ? "sale" : "sales"}
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-hairline px-4 py-8 text-center font-sans text-body text-muted-foreground">
          No realized taxable activity for this year and account scope.
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto border-t border-hairline">
          <table className="table-sticky min-w-[920px] w-full border-separate border-spacing-0 text-body">
            <thead>
              <tr className="text-left text-caption text-muted-foreground">
                {headers.map((header) => {
                  const active = header.key === sort.key;
                  const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                  return (
                    <th
                      key={header.label}
                      aria-sort={header.key ? (active ? (sort.direction === "asc" ? "ascending" : "descending") : "none") : undefined}
                      className={cn("border-b border-hairline-soft px-3 py-2.5 font-normal", header.align === "right" && "text-right")}
                    >
                      {header.key ? (
                        <button
                          type="button"
                          onClick={() => setSort((current) => ({
                            key: header.key!,
                            direction: current.key === header.key && current.direction === "desc" ? "asc" : "desc",
                          }))}
                          className={cn("inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", header.align === "right" && "flex-row-reverse")}
                        >
                          {header.label}<SortIcon className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : header.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const selected = selectedId === row.id;
                return (
                  <tr
                    key={row.id}
                    aria-selected={selected || undefined}
                    onClick={() => onSelect(row)}
                    className={cn(
                      "cursor-pointer border-b border-hairline-soft transition-colors hover:bg-accent/[0.04]",
                      selected && "bg-accent/[0.08] shadow-[inset_2px_0_0_rgb(var(--accent))]",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-foreground">{formatDisplayDate(row.disposedDate)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 font-medium text-foreground"><TickerLogo symbol={row.symbol} size={18} />{row.symbol}</span>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">{row.accountName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQuantity(row.quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatMaskedCents(row.proceedsCents, maskAmounts)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.costBasisCents == null ? "—" : formatMaskedCents(row.costBasisCents, maskAmounts)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", gainTone(row.gainLossCents))}>{row.gainLossCents == null ? "—" : formatMaskedCents(row.gainLossCents, maskAmounts)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{termLabel(row.term)}</td>
                    <td className="px-3 py-2.5">
                      <ActivityStatusChip
                        status={row.status}
                        symbol={row.symbol}
                        onActivate={() => onSelect(row)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpenLotsTable({ lots, maskAmounts }: { lots: StockTaxLot[]; maskAmounts: boolean }) {
  const rows = [...lots].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.acquiredDate.localeCompare(b.acquiredDate));
  return (
    <div className="rounded-b-[12px] border border-t-0 border-hairline bg-surface">
      <div className="px-4 py-3">
        <h2 className="font-sans text-strong font-medium text-foreground">Open acquisition lots</h2>
        <p className="mt-0.5 font-sans text-caption text-muted-foreground">Remaining imported basis—the foundation for future loss-harvest analysis.</p>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-hairline px-4 py-8 text-center font-sans text-body text-muted-foreground">No open stock lots in this account scope.</div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto border-t border-hairline">
          <table className="min-w-[760px] w-full text-body">
            <thead><tr className="text-left text-caption text-muted-foreground">
              {["Symbol", "Account", "Acquired", "Remaining quantity", "Remaining basis", "Basis / share", "Status"].map((header) => <th key={header} className="border-b border-hairline-soft px-3 py-2.5 font-normal">{header}</th>)}
            </tr></thead>
            <tbody>{rows.map((lot) => (
              <tr key={lot.id} className="border-b border-hairline-soft last:border-0">
                <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2 font-medium text-foreground"><TickerLogo symbol={lot.symbol} size={18} />{lot.symbol}</span></td>
                <td className="px-3 py-2.5 text-muted-foreground">{lot.account.accountName}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{formatDisplayDate(lot.acquiredDate)}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{formatQuantity(lot.remainingQuantity)}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{formatMaskedCents(lot.remainingBasisCents, maskAmounts)}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{formatMaskedCents(Math.round(lot.remainingBasisCents / lot.remainingQuantity), maskAmounts)}</td>
                <td className="px-3 py-2.5"><span className="rounded-full bg-accent/10 px-2 py-0.5 text-micro font-medium text-accent">{lot.status === "OPEN" ? "Open" : "Partial"}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TaxAuditPanel({ auditId, row, onClose, maskAmounts, dialog = false }: { auditId: string; row: ActivityRow; onClose: () => void; maskAmounts: boolean; dialog?: boolean }) {
  const matches = row.slices.filter((slice) => slice.acquiredDate && slice.costBasisCents != null);
  const washLossSlices = [...new Map(row.washSaleCandidates.map((candidate) => [candidate.lossDispositionId, candidate])).values()];
  const replacementPurchases = [...new Map(row.washSaleCandidates.map((candidate) => [candidate.replacementPurchaseTransactionId, candidate])).values()];
  const washLossCents = sum(washLossSlices.map((candidate) => candidate.lossCents));
  const washLossQuantity = sum(washLossSlices.map((candidate) => candidate.lossQuantity));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `${auditId}-title`;
  const washExplanationId = `${auditId}-wash-explanation`;

  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog) closeRef.current?.focus();
    else panelRef.current?.focus();
    return () => priorFocus?.focus();
  }, [dialog, row.id]);

  return (
    <section id={auditId} ref={panelRef} tabIndex={-1} onKeyDown={dialog ? (event) => trapDialogKeyDown(event, panelRef, onClose) : undefined} className="min-h-full rounded-[12px] border border-hairline bg-surface p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" role={dialog ? "dialog" : "region"} aria-modal={dialog || undefined} aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-sans text-strong font-medium text-foreground">Disposition audit</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close disposition audit" className="rounded-md p-1 text-muted-foreground hover:bg-surface-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <TickerLogo symbol={row.symbol} size={28} />
        <div><p className="font-sans text-strong font-semibold text-foreground">{row.symbol}</p><p className="font-sans text-caption text-muted-foreground">{row.accountName}</p></div>
      </div>
      <dl className="mt-3 space-y-2 font-sans text-body">
        <AuditLine
          label={row.category === "COMBINED" ? "Called away" : row.category === "STOCK" ? "Sold" : "Closed"}
          value={`${formatQuantity(row.quantity)} ${row.category === "STOCK" || row.category === "COMBINED" ? "shares" : "units"} on ${formatLongDate(row.disposedDate)}`}
        />
        <AuditLine label="Proceeds" value={formatMaskedCents(row.proceedsCents, maskAmounts)} />
        <AuditLine label="Classification" value={row.category === "COMBINED" ? "Stock sale + option premium" : categoryLabel(row.category)} />
        <AuditLine label="Matching method" value={row.category === "STOCK" ? "FIFO lots" : "Linked lifecycle"} />
        <AuditLine label="Source transactions" value={String(row.linkedTransactionIds.length)} />
      </dl>
      <div className="my-4 border-t border-hairline" />
      <h3 className="font-sans text-body font-medium text-foreground">
        {row.category === "COMBINED" ? "Economic event legs" : row.category === "STOCK" ? "Acquisition lots matched (FIFO)" : "Lifecycle detail"}
      </h3>
      {row.category === "COMBINED" ? (
        <div className="mt-3 space-y-2">
          {row.slices.map((slice) => (
            <div key={slice.id} className="rounded-md border border-hairline bg-surface-inset p-2.5">
              <div className="flex items-center justify-between gap-3 font-sans text-caption">
                <span className="font-medium text-foreground">{categoryLabel(slice.category)}</span>
                <span className={cn("tabular-nums", gainTone(slice.gainLossCents))}>{slice.gainLossCents == null ? "Excluded" : formatMaskedCents(slice.gainLossCents, maskAmounts)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 font-sans text-micro text-muted-foreground">
                <span>Proceeds {formatMaskedCents(slice.proceedsCents, maskAmounts)}</span>
                <span>Basis {slice.costBasisCents == null ? "—" : formatMaskedCents(slice.costBasisCents, maskAmounts)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : matches.length > 0 ? (
        <div className="relative mt-3 space-y-2 pl-5 before:absolute before:bottom-4 before:left-[6px] before:top-4 before:w-px before:bg-border-strong">
          {matches.map((match) => (
            <div key={match.id} className="relative rounded-md border border-hairline bg-surface-inset p-2.5 before:absolute before:-left-[19px] before:top-4 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-surface before:bg-muted-foreground">
              <div className="grid grid-cols-2 gap-2 font-sans text-caption">
                <div><span className="block text-muted-foreground">Acquired</span><span className="tabular-nums text-foreground">{formatDisplayDate(match.acquiredDate)}</span></div>
                <div><span className="block text-muted-foreground">Quantity</span><span className="tabular-nums text-foreground">{formatQuantity(match.quantity)} shares</span></div>
                <div><span className="block text-muted-foreground">Term</span><span className="text-foreground">{termLabel(match.term)}</span></div>
                <div><span className="block text-muted-foreground">Basis</span><span className="tabular-nums text-foreground">{formatMaskedCents(match.costBasisCents ?? 0, maskAmounts)}</span></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-warn/30 bg-warn/10 p-3 font-sans text-caption text-foreground">
          {row.status === "needs_basis" ? "No opening lot is available for this disposition. It is excluded from the estimate." : "This event is classified from its linked option lifecycle."}
        </div>
      )}
      <div className="mt-4 space-y-2 border-t border-hairline pt-3">
        <AuditLine label="Adjusted basis" value={row.costBasisCents == null ? "—" : formatMaskedCents(row.costBasisCents, maskAmounts)} strong />
        <AuditLine label="Recognized gain" value={row.gainLossCents == null ? "Excluded" : formatMaskedCents(row.gainLossCents, maskAmounts)} strong />
      </div>
      {row.status === "potential_wash" && (
        <section aria-labelledby={washExplanationId} className="mt-4 rounded-md border border-warn/30 bg-warn/10 p-3 font-sans text-caption text-foreground">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
            <div>
              <h3 id={washExplanationId} className="font-medium text-warn">Why this may be a wash sale</h3>
              <p className="mt-1.5">
                You sold {formatQuantity(washLossQuantity)} {row.symbol} {washLossQuantity === 1 ? "share" : "shares"} at a loss of {formatMaskedCents(washLossCents, maskAmounts)} on {formatLongDate(row.disposedDate)}.
              </p>
              <ul className="mt-2 space-y-1.5">
                {replacementPurchases.map((candidate) => (
                  <li key={candidate.replacementPurchaseTransactionId} className="flex gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>
                      Imported activity shows a purchase of {formatQuantity(candidate.replacementQuantity)} {row.symbol} {candidate.replacementQuantity === 1 ? "share" : "shares"} {relativePurchaseTiming(candidate.daysFromSale)}, on {formatLongDate(candidate.replacementPurchaseDate)}.
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Buying the same or a substantially identical security within 30 days before or after a loss sale can cause some or all of the loss to be deferred and added to the replacement shares&apos; cost basis.
              </p>
              <p className="mt-2 text-muted-foreground">
                <span className="font-medium text-foreground">Why only potential:</span>{" "}Darpan only checks exact-ticker purchases in the same imported account. Wash-sale rules can also involve substantially identical securities and activity in other accounts. Compare all account records or consult a tax professional. No adjustment has been applied to this estimate yet.
              </p>
            </div>
          </div>
        </section>
      )}
      <p className="mt-4 flex items-start gap-1.5 font-sans text-caption text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Calculated from imported activity · verify against broker records.</p>
      <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((current) => !current)} className="mt-4 flex w-full items-center justify-center gap-1 rounded-md border border-hairline bg-surface px-3 py-2 font-sans text-body font-medium text-foreground hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
        {detailsOpen ? "Hide source details" : "Open calculation details"} <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-90")} />
      </button>
      {detailsOpen && (
        <div className="mt-2 rounded-md border border-hairline bg-surface-inset p-3 font-sans text-caption text-muted-foreground">
          <p className="text-foreground">Recognized gain = proceeds − adjusted basis.</p>
          <p className="mt-1 break-words">Source IDs: {row.linkedTransactionIds.join(", ")}</p>
        </div>
      )}
    </section>
  );
}

function AuditLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className={cn("text-right tabular-nums text-foreground", strong && "font-medium")}>{value}</dd></div>;
}

function ActivityStatusChip({ status, symbol, onActivate }: { status: ActivityStatus; symbol: string; onActivate: () => void }) {
  const config = {
    calculated: { label: "Calculated", icon: CheckCircle2, classes: "border-accent/25 bg-accent/[0.06] text-accent hover:bg-accent/10" },
    needs_basis: { label: "Needs basis · Excluded", icon: CircleHelp, classes: "border-warn/30 bg-warn/10 text-warn hover:bg-warn/15" },
    unsupported: { label: "Unsupported · Excluded", icon: AlertTriangle, classes: "border-warn/30 bg-warn/10 text-warn hover:bg-warn/15" },
    potential_wash: { label: "Potential wash", icon: AlertTriangle, classes: "border-warn/30 bg-warn/10 text-warn hover:bg-warn/15" },
  }[status];
  const Icon = config.icon;
  const classes = cn("inline-flex whitespace-nowrap items-center gap-1 rounded-md border px-2 py-1 text-micro font-medium", config.classes);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      aria-label={`Open ${symbol} ${status === "potential_wash" ? "potential wash-sale" : "disposition"} details`}
      className={cn(classes, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40")}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />{config.label}<ChevronRight className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function AssumptionsDialog({
  initial,
  accounts,
  onCancel,
  onSave,
}: {
  initial: TaxEstimateSettings;
  accounts: TradingAccount[];
  onCancel: () => void;
  onSave: (settings: TaxEstimateSettings) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<TaxEstimateSettings>(() => ({
    ...initial,
    taxableAccountIds: initial.taxableAccountIds.length > 0 ? [...initial.taxableAccountIds] : accounts.map((account) => account.id),
  }));
  const inputClass = "h-10 w-full rounded-md border border-hairline bg-surface px-3 font-sans text-body tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const setNumber = (key: "shortTermRate" | "longTermRate" | "otherNetInvestmentIncome", value: string) => setDraft((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  const toggleAccount = (id: string) => setDraft((current) => ({ ...current, taxableAccountIds: current.taxableAccountIds.includes(id) ? current.taxableAccountIds.filter((value) => value !== id) : [...current.taxableAccountIds, id] }));

  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => priorFocus?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-3">
      <section ref={dialogRef} onKeyDown={(event) => trapDialogKeyDown(event, dialogRef, onCancel)} role="dialog" aria-modal="true" aria-labelledby="tax-assumptions-title" className="max-h-[92vh] w-full max-w-[680px] overflow-auto rounded-[14px] border border-hairline bg-surface p-5 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div><h2 id="tax-assumptions-title" className="font-sans text-lead font-semibold text-foreground">Tax estimate assumptions</h2><p className="mt-0.5 font-sans text-caption text-muted-foreground">Used only for planning estimates in Darpan.</p></div>
          <button ref={closeRef} type="button" onClick={onCancel} aria-label="Close assumptions" className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <FormField label="Ordinary / short-term rate" helper="Your planning marginal rate.">
            <PercentInput value={draft.shortTermRate} onChange={(value) => setNumber("shortTermRate", value)} inputClass={inputClass} />
          </FormField>
          <FormField label="Long-term capital gains rate" helper="Use 0%, 15%, 20%, or your planning rate.">
            <PercentInput value={draft.longTermRate} onChange={(value) => setNumber("longTermRate", value)} inputClass={inputClass} />
          </FormField>
          <FormField label="Filing status" helper="Sets the statutory NIIT threshold.">
            <select value={draft.filingStatus} onChange={(event) => setDraft((current) => ({ ...current, filingStatus: event.target.value as TaxEstimateSettings["filingStatus"] }))} className={inputClass}>
              {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
          <FormField label="Projected modified adjusted gross income for NIIT" helper="Stored privately; select the masked value and type to replace it.">
            <CurrencyInput sensitive value={draft.projectedMagi} onChange={(value) => setDraft((current) => ({ ...current, projectedMagi: value === "" ? null : Math.max(0, Number(value) || 0) }))} inputClass={inputClass} />
          </FormField>
          <FormField label="Other net investment income" helper="Interest, dividends, and other NII outside imported trades.">
            <CurrencyInput value={draft.otherNetInvestmentIncome} onChange={(value) => setNumber("otherNetInvestmentIncome", value)} inputClass={inputClass} />
          </FormField>
          <FormField label="State & local effective rate" helper="User-supplied planning rate; Darpan does not infer state law.">
            <PercentInput value={draft.stateLocalRate ?? ""} onChange={(value) => setDraft((current) => ({ ...current, stateLocalRate: value === "" ? null : Math.max(0, Number(value) || 0) }))} inputClass={inputClass} />
          </FormField>
        </div>

        <fieldset className="mt-5 rounded-[10px] border border-hairline p-3">
          <legend className="px-1 font-sans text-body font-medium text-foreground">Taxable account scope</legend>
          <p className="mb-2 font-sans text-caption text-muted-foreground">Only checked accounts feed the estimate. Exclude IRAs and other tax-advantaged accounts.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.map((account) => (
              <label key={account.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-hairline px-3 py-2 font-sans text-body text-foreground hover:bg-surface-inset">
                <input type="checkbox" checked={draft.taxableAccountIds.includes(account.id)} onChange={() => toggleAccount(account.id)} className="h-4 w-4 accent-accent" />
                <span className="truncate">{account.name}</span>
              </label>
            ))}
            {accounts.length === 0 && <p className="font-sans text-caption text-muted-foreground">No broker accounts are configured yet.</p>}
          </div>
        </fieldset>

        <div className="mt-5 rounded-md border border-warn/25 bg-warn/[0.06] p-3 font-sans text-caption text-foreground">
          NIIT is 3.8% of the lesser of net investment income or projected modified adjusted gross income above the filing-status threshold. State/local uses only the rate you provide.
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-2 font-sans text-body font-medium text-muted-foreground hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">Cancel</button>
          <button type="button" disabled={accounts.length > 0 && draft.taxableAccountIds.length === 0} onClick={() => onSave({ ...draft, confirmed: true })} className="rounded-md border border-accent/30 bg-accent/15 px-3 py-2 font-sans text-body font-medium text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40">Save assumptions</button>
        </div>
      </section>
    </div>
  );
}

function FormField({ label, helper, children }: { label: string; helper: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="font-sans text-caption font-medium text-foreground">{label}</span>{children}<span className="font-sans text-micro text-muted-foreground">{helper}</span></label>;
}

function CurrencyInput({ value, onChange, inputClass, sensitive = false }: { value: number | null; onChange: (value: string) => void; inputClass: string; sensitive?: boolean }) {
  return <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-muted-foreground">$</span><input type={sensitive ? "password" : "number"} inputMode={sensitive ? "decimal" : undefined} autoComplete={sensitive ? "off" : undefined} min="0" step="1000" value={value ?? ""} onFocus={sensitive ? (event) => event.currentTarget.select() : undefined} onChange={(event) => onChange(event.target.value)} className={cn(inputClass, "pl-7")} /></div>;
}

function PercentInput({ value, onChange, inputClass }: { value: number | string; onChange: (value: string) => void; inputClass: string }) {
  return <div className="relative"><input type="number" min="0" max="100" step="0.1" value={value} onChange={(event) => onChange(event.target.value)} className={cn(inputClass, "pr-8")} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body text-muted-foreground">%</span></div>;
}

function trapDialogKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  dialogRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab" || !dialogRef.current) return;
  const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1) ?? first;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function toTaxFilingStatus(status: TaxEstimateSettings["filingStatus"]): FilingStatus {
  return {
    single: "SINGLE",
    married_joint: "MARRIED_FILING_JOINTLY",
    married_separate: "MARRIED_FILING_SEPARATELY",
    head_of_household: "HEAD_OF_HOUSEHOLD",
  }[status] as FilingStatus;
}

function formatMaskedCents(cents: number, masked: boolean): string {
  return formatMaskedCurrency(cents / 100, masked);
}

function formatEffectiveRate(value: number): string {
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 4 }).format(value)}%`;
}

function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

function formatLongDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function relativePurchaseTiming(daysFromSale: number): string {
  if (daysFromSale === 0) return "on the same day as the loss sale";
  const days = Math.abs(daysFromSale);
  return `${days} ${days === 1 ? "day" : "days"} ${daysFromSale < 0 ? "before" : "after"} the loss sale`;
}

function termLabel(term: ActivityRow["term"]): string {
  if (term === "SHORT_TERM") return "Short";
  if (term === "LONG_TERM") return "Long";
  if (term === "MIXED") return "Mixed";
  return "—";
}

function categoryLabel(category: ActivityRow["category"] | TaxDispositionCategory): string {
  if (category === "STOCK") return "Stock disposition";
  if (category === "OPTION") return "Option lifecycle";
  if (category === "OPTION_ASSIGNMENT_ADJUSTMENT") return "Option premium";
  if (category === "COMBINED") return "Assignment event";
  return "Unsupported event";
}

function gainTone(value: number | null): string {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-muted-foreground";
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

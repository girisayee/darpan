"use client";

import { useMemo, useState } from "react";
import { Column, DataTable } from "@/components/tables/DataTable";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney, label } from "@/components/dashboard/tabs/shared";
import { entrySource, isManualEntry } from "@/lib/entries/entry-meta";
import { formatCurrency, formatDisplayDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type {
  OptionType,
  TradeAction,
  TradeTransaction,
  TradingAccount,
  TransactionStatus,
} from "@/types/trading";

const ACTIONS: TradeAction[] = [
  "BUY", "SELL", "SELL_TO_OPEN", "BUY_TO_CLOSE", "BUY_TO_OPEN", "SELL_TO_CLOSE",
  "ASSIGNMENT", "EXPIRATION", "DIVIDEND", "FEE", "TRANSFER", "OTHER",
];
const STATUSES: TransactionStatus[] = ["normalized", "unresolved", "ignored"];
type SourceFilter = "all" | "manual" | "imported" | "edited";

function SourceBadge({ t }: { t: TradeTransaction }) {
  const s = entrySource(t);
  const tone =
    s.kind === "manual"
      ? "bg-accent/12 text-accent"
      : s.edited
        ? "bg-warn/15 text-warn"
        : "bg-surface-inset text-muted-foreground";
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-medium", tone)}>
      {s.label}
    </span>
  );
}

export function EntriesAdmin({
  transactions,
  accounts,
  onUpdate,
  onDelete,
}: {
  transactions: TradeTransaction[];
  accounts: TradingAccount[];
  onUpdate: (t: TradeTransaction) => void;
  onDelete: (id: string) => void;
}) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [accountId, setAccountId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [editing, setEditing] = useState<TradeTransaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TradeTransaction | null>(null);

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name]));
    return (t: TradeTransaction) => (t.accountId && map.get(t.accountId)) || t.accountName || "—";
  }, [accounts]);

  const rows = useMemo(() => {
    return transactions.filter((t) => {
      const s = entrySource(t);
      if (source === "manual" && s.kind !== "manual") return false;
      if (source === "imported" && s.kind !== "imported") return false;
      if (source === "edited" && !s.edited) return false;
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (status !== "all" && t.status !== status) return false;
      return true;
    });
  }, [transactions, source, accountId, status]);

  const columns: Column<TradeTransaction>[] = [
    {
      key: "source",
      header: "Source",
      value: (t) => entrySource(t).label,
      render: (t) => <SourceBadge t={t} />,
    },
    {
      key: "tradeDate",
      header: "Date",
      value: (t) => t.tradeDate ?? "",
      render: (t) => <span className="tabular-nums text-muted-foreground">{t.tradeDate ? formatDisplayDate(t.tradeDate) : "—"}</span>,
    },
    {
      key: "symbol",
      header: "Symbol",
      value: (t) => t.symbol,
      render: (t) => (
        <span className="inline-flex items-center gap-2">
          <TickerLogo symbol={t.symbol} size={20} />
          <span className="font-medium text-foreground">{t.symbol || "—"}</span>
          {t.optionType && (
            <span className="text-micro text-muted-foreground">
              ${t.strikePrice ?? "?"} {t.optionType}
            </span>
          )}
        </span>
      ),
    },
    { key: "action", header: "Action", value: (t) => t.action, render: (t) => <span className="text-muted-foreground">{label(t.action)}</span> },
    { key: "quantity", header: "Qty", value: (t) => t.quantity, align: "right" },
    { key: "price", header: "Price", value: (t) => t.price, render: (t) => formatCurrency(t.price), align: "right" },
    { key: "netAmount", header: "Amount", value: (t) => t.netAmount, render: (t) => signedMoney(t.netAmount), align: "right" },
    { key: "account", header: "Account", value: (t) => accountName(t), render: (t) => <span className="text-muted-foreground">{accountName(t)}</span> },
    {
      key: "createdAt",
      header: "Added",
      value: (t) => t.createdAt ?? "",
      render: (t) => <span className="tabular-nums text-muted-foreground">{t.createdAt ? formatDisplayDate(t.createdAt.slice(0, 10)) : "—"}</span>,
      tooltip: "When this row was added to the app.",
    },
    { key: "status", header: "Status", value: (t) => t.status, render: (t) => <span className="text-muted-foreground">{label(t.status)}</span> },
    {
      key: "actions",
      header: "",
      value: () => "",
      align: "right",
      render: (t) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(t); }}
          className="rounded-md px-2 py-1 text-micro font-medium text-neg hover:bg-neg/10"
        >
          Delete
        </button>
      ),
    },
  ];

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-caption font-medium transition-colors",
      active ? "border-accent bg-accent/15 text-accent" : "border-hairline text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-4 py-2">
      <div>
        <h1 className="text-lead font-semibold text-foreground">Manage entries</h1>
        <p className="text-caption text-muted-foreground">
          Every transaction across all accounts — search, sort, edit, or delete. {transactions.length} total.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "manual", "imported", "edited"] as SourceFilter[]).map((s) => (
          <button key={s} type="button" onClick={() => setSource(s)} className={chip(source === s)}>
            {s === "all" ? "All sources" : label(s)}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-hairline" />
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-caption text-foreground">
          <option value="all">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-caption text-foreground">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        empty="No entries match these filters."
        defaultSort={{ key: "createdAt", direction: "desc" }}
        tiebreak={{ key: "tradeDate", direction: "desc" }}
        searchable
        searchPlaceholder="Search symbol or description…"
        pageSize={25}
        onRowClick={(t) => setEditing(t)}
      />

      {editing && (
        <EditModal
          tx={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSave={(next) => { onUpdate(next); setEditing(null); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          tx={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-micro text-muted-foreground">{l}</span>
      {children}
    </label>
  );
}

const inputCls = "h-9 rounded-md border border-hairline bg-surface px-2.5 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

function EditModal({
  tx,
  accounts,
  onClose,
  onSave,
}: {
  tx: TradeTransaction;
  accounts: TradingAccount[];
  onClose: () => void;
  onSave: (t: TradeTransaction) => void;
}) {
  const [draft, setDraft] = useState<TradeTransaction>({ ...tx });
  const set = <K extends keyof TradeTransaction>(k: K, v: TradeTransaction[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  function save() {
    // Keep gross in step with the entered net unless the user has fees; the engine
    // reads netAmount first for proceeds/cost basis.
    const next: TradeTransaction = { ...draft, grossAmount: draft.netAmount };
    if (!isManualEntry(tx)) next.editedAt = new Date().toISOString();
    onSave(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-[14px] border border-hairline bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-strong font-semibold text-foreground">Edit entry</h2>
        <p className="mt-0.5 text-micro text-muted-foreground">{tx.symbol} · {label(tx.action)} · {entrySource(tx).label}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" className={inputCls} value={draft.tradeDate} onChange={(e) => set("tradeDate", e.target.value)} /></Field>
          <Field label="Account">
            <select className={inputCls} value={draft.accountId ?? ""} onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); set("accountId", e.target.value || undefined); if (a) set("accountName", a.name); }}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Action">
            <select className={inputCls} value={draft.action} onChange={(e) => set("action", e.target.value as TradeAction)}>
              {ACTIONS.map((a) => <option key={a} value={a}>{label(a)}</option>)}
            </select>
          </Field>
          <Field label="Symbol"><input className={inputCls} value={draft.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} /></Field>
          <Field label="Quantity"><input type="number" step="any" className={inputCls} value={draft.quantity} onChange={(e) => set("quantity", num(e.target.value))} /></Field>
          <Field label="Price"><input type="number" step="any" className={inputCls} value={draft.price} onChange={(e) => set("price", num(e.target.value))} /></Field>
          <Field label="Amount (net)"><input type="number" step="any" className={inputCls} value={draft.netAmount} onChange={(e) => set("netAmount", num(e.target.value))} /></Field>
          <Field label="Fees"><input type="number" step="any" className={inputCls} value={draft.fees} onChange={(e) => set("fees", num(e.target.value))} /></Field>
          <Field label="Option type">
            <select className={inputCls} value={draft.optionType ?? ""} onChange={(e) => set("optionType", (e.target.value || null) as OptionType)}>
              <option value="">None (stock/cash)</option>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={draft.status} onChange={(e) => set("status", e.target.value as TransactionStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </Field>
          {draft.optionType && (
            <>
              <Field label="Strike"><input type="number" step="any" className={inputCls} value={draft.strikePrice ?? ""} onChange={(e) => set("strikePrice", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
              <Field label="Expiration"><input type="date" className={inputCls} value={draft.expirationDate ?? ""} onChange={(e) => set("expirationDate", e.target.value || undefined)} /></Field>
            </>
          )}
          <div className="col-span-2">
            <Field label="Notes"><input className={inputCls} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} /></Field>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-hairline px-4 py-2 text-body font-medium text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={save} className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white hover:opacity-90">Save</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ tx, onCancel, onConfirm }: { tx: TradeTransaction; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-[14px] border border-hairline bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-strong font-semibold text-foreground">Delete entry?</h2>
        <p className="mt-1 text-caption text-muted-foreground">
          {tx.tradeDate} · {tx.symbol} · {label(tx.action)} · {formatCurrency(tx.netAmount)}. This can&rsquo;t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-4 py-2 text-body font-medium text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-neg px-4 py-2 text-body font-medium text-white hover:opacity-90">Delete</button>
        </div>
      </div>
    </div>
  );
}

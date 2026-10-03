"use client";

import { useMemo, useState } from "react";
import type { PositionRow } from "@/components/dashboard/positions/columns";
import { signedMoney } from "@/components/dashboard/tabs/shared";
import { formatDisplayDate, formatMaskedCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type SortKey = "date-asc" | "date-desc" | "pnl-desc" | "pnl-asc" | "symbol";

export function PositionMobileList({
  rows,
  kind,
  status,
  maskAmounts,
  onSelect,
  empty,
}: {
  rows: PositionRow[];
  kind: "options" | "swing";
  status: "active" | "closed";
  maskAmounts: boolean;
  onSelect: (row: PositionRow) => void;
  empty: string;
}) {
  const [sort, setSort] = useState<SortKey>(status === "active" && kind === "options" ? "date-asc" : "date-desc");
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sort === "symbol") return a.sym.localeCompare(b.sym);
    if (sort === "pnl-desc") return b.pnl - a.pnl;
    if (sort === "pnl-asc") return a.pnl - b.pnl;
    const date = (row: PositionRow) => status === "active" && kind === "options"
      ? row.expirationDate ?? ""
      : status === "closed" ? row.closeDate ?? "" : row.openDate ?? "";
    return sort === "date-asc" ? date(a).localeCompare(date(b)) : date(b).localeCompare(date(a));
  }), [rows, sort, kind, status]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <div className="space-y-2 md:hidden">
      {rows.length > 1 && (
        <div className="flex justify-end">
          <label className="flex items-center gap-2 text-caption text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(event) => { setSort(event.target.value as SortKey); setPage(0); }}
              className="h-9 rounded-md border border-hairline bg-surface px-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <option value="date-asc">{status === "active" && kind === "options" ? "Nearest expiry" : "Oldest first"}</option>
              <option value="date-desc">{status === "active" && kind === "options" ? "Latest expiry" : "Newest first"}</option>
              {status === "closed" && <option value="pnl-desc">Highest P&amp;L</option>}
              {status === "closed" && <option value="pnl-asc">Lowest P&amp;L</option>}
              <option value="symbol">Symbol A–Z</option>
            </select>
          </label>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        {paged.length === 0 ? (
          <div className="p-5 text-body text-muted-foreground">{empty}</div>
        ) : paged.map((row, index) => {
          const cashflow = row.cost ?? row.premium;
          const cashflowLabel = row.cost != null ? "Debit paid" : "Premium received";
          const activeOption = status === "active" && kind === "options";
          const activeStock = status === "active" && kind === "swing";
          const content = <>
              <span className="min-w-0">
                <span className="block text-strong font-semibold text-foreground">{row.sym} <span className="font-normal text-muted-foreground">{row.detail}</span></span>
                <span className="mt-1 block text-caption leading-5 text-muted-foreground">
                  {activeOption
                    ? <>{row.strategyLabel ?? row.tag} · {row.tag} · Expires {row.expirationDate ? formatDisplayDate(row.expirationDate) : "—"}{row.dte != null ? ` · ${row.dte} DTE` : ""}</>
                    : activeStock
                      ? <>Opened {row.openDate ? formatDisplayDate(row.openDate) : "—"}</>
                      : <>Closed {row.closeDate ? formatDisplayDate(row.closeDate) : "—"}{row.roc != null ? ` · Trade ROI ${formatPercent(row.roc, 1)}` : ""}</>}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {activeStock ? (
                  <span className="block text-strong font-semibold text-foreground">{row.costBasisPerShare == null ? "—" : formatMaskedCurrency(row.costBasisPerShare, maskAmounts)}</span>
                ) : activeOption ? (
                  <span className="block text-strong font-semibold text-foreground">{formatMaskedCurrency(cashflow ?? null, maskAmounts)}</span>
                ) : (
                  <span className={cn("block text-strong font-semibold", row.pnl > 0 ? "text-pos" : row.pnl < 0 ? "text-neg" : "text-foreground")}>
                    {signedMoney(row.pnl, maskAmounts)}
                  </span>
                )}
                <span className="mt-1 block text-caption text-muted-foreground">{activeStock ? "Basis / share" : activeOption ? cashflowLabel : "Realized P&L"}</span>
              </span>
            </>;
          const className = "flex w-full items-start justify-between gap-3 border-b border-hairline-soft px-3.5 py-3 text-left last:border-0";
          const key = `${row.sym}-${row.openDate}-${row.closeDate}-${index}`;
          return activeStock
            ? <div key={key} className={className}>{content}</div>
            : <button key={key} type="button" onClick={() => onSelect(row)} className={`${className} hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40`}>{content}</button>;
        })}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1 text-caption text-muted-foreground">
          <span className="tabular-nums">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded px-2 py-1 text-accent disabled:opacity-40">Previous</button>
            <span className="tabular-nums">{safePage + 1} / {totalPages}</span>
            <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} className="rounded px-2 py-1 text-accent disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

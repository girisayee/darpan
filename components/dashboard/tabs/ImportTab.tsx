"use client";

import { FileText, Search, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { parseRobinhoodInput } from "@/lib/import/robinhood";
import { formatDisplayDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { TradeTransaction } from "@/types/trading";

type RowStatus = "new" | "warning" | "duplicate" | "ignored";

type Parsed = {
  rows: TradeTransaction[];
  dupIds: Set<string>;
  warningsByRowId: Map<string, string[]>;
  fileCount: number;
};

/** Parse one or more Robinhood CSV texts, merging results and detecting
 * duplicates both across files and against the existing data. */
function buildParsed(texts: string[], existing: TradeTransaction[]): Parsed {
  const rows: TradeTransaction[] = [];
  const dupIds = new Set<string>();
  const warningsByRowId = new Map<string, string[]>();
  for (const text of texts) {
    const preview = parseRobinhoodInput(text, [...existing, ...rows]);
    preview.duplicateIds.forEach((id) => dupIds.add(id));
    preview.issues.forEach((issue) => {
      const row = preview.rows[issue.rowIndex];
      if (!row) return;
      const list = warningsByRowId.get(row.id) ?? [];
      list.push(issue.message);
      warningsByRowId.set(row.id, list);
    });
    preview.rows.forEach((r) => rows.push(r));
  }
  return { rows, dupIds, warningsByRowId, fileCount: texts.length };
}

function statusOf(row: TradeTransaction, p: Parsed): RowStatus {
  if (p.dupIds.has(row.id)) return "duplicate";
  if (row.status === "ignored") return "ignored";
  if (row.status === "unresolved" || p.warningsByRowId.has(row.id)) return "warning";
  return "new";
}

const STATUS_BADGE: Record<RowStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-pos/15 text-pos" },
  warning: { label: "Warning", cls: "bg-warn/15 text-warn" },
  duplicate: { label: "Duplicate", cls: "bg-accent/15 text-accent" },
  ignored: { label: "Ignored", cls: "bg-surface-inset text-muted-foreground" },
};

function Chip({ dot, label: text, count, tone }: { dot: string; label: string; count: number; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1 text-caption text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      <span className={cn("font-semibold tabular-nums", tone)}>{count}</span> {text}
    </span>
  );
}

export function ImportTab({
  existing,
  onSave,
}: {
  existing: TradeTransaction[];
  onSave: (rows: TradeTransaction[]) => void;
}) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function applyParsed(p: Parsed) {
    setParsed(p);
    // Pre-select New + Warning rows; leave Duplicate / Ignored off.
    const next = new Set<string>();
    for (const row of p.rows) {
      const s = statusOf(row, p);
      if (s === "new" || s === "warning") next.add(row.id);
    }
    setSelected(next);
    setImportedCount(null);
  }

  async function ingestFiles(files: File[]) {
    const csvs = files.filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv");
    if (!csvs.length) return;
    const texts = await Promise.all(csvs.map((f) => f.text()));
    applyParsed(buildParsed(texts, existing));
  }

  function ingestPaste(text: string) {
    setPasteText(text);
    if (text.trim()) applyParsed(buildParsed([text], existing));
    else setParsed(null);
  }

  const rows = useMemo(() => parsed?.rows ?? [], [parsed]);

  const counts = useMemo(() => {
    const c = { new: 0, warning: 0, duplicate: 0, ignored: 0 };
    if (parsed) for (const r of rows) c[statusOf(r, parsed)] += 1;
    return c;
  }, [parsed, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.tradeDate} ${r.symbol} ${label(r.action)} ${r.rawDescription}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const selectableIds = useMemo(
    () => (parsed ? rows.filter((r) => statusOf(r, parsed) !== "ignored").map((r) => r.id) : []),
    [parsed, rows]
  );
  const allSelectableChecked = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelectableChecked ? new Set() : new Set(selectableIds));
  }
  function selectRecommended() {
    if (!parsed) return;
    const next = new Set<string>();
    for (const r of rows) {
      const s = statusOf(r, parsed);
      if (s === "new" || s === "warning") next.add(r.id);
    }
    setSelected(next);
  }
  function reset() {
    setParsed(null);
    setSelected(new Set());
    setSearch("");
    setPasteText("");
    setImportedCount(null);
  }

  function doImport() {
    const toImport = rows.filter((r) => selected.has(r.id));
    if (!toImport.length) return;
    onSave(toImport);
    setImportedCount(toImport.length);
    setParsed(null);
    setSelected(new Set());
    setPasteText("");
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void ingestFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => fileInput.current?.click()}
        className={cn(
          "cursor-pointer rounded-[14px] border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragOver ? "border-accent bg-accent/10" : "border-hairline bg-surface hover:border-accent/50"
        )}
      >
        <UploadCloud className="mx-auto h-7 w-7 text-muted-foreground" />
        <div className="mt-2 text-strong font-medium text-foreground">Drop Robinhood CSV files here</div>
        <div className="mt-1 text-caption text-muted-foreground">
          or <span className="text-accent underline">browse</span> · multiple files OK ·{" "}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPaste((v) => !v);
            }}
            className="text-accent underline"
          >
            paste CSV instead
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void ingestFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {showPaste && (
        <textarea
          value={pasteText}
          onChange={(e) => ingestPaste(e.target.value)}
          className="h-40 w-full resize-none rounded-md border border-hairline bg-surface p-3 font-sans text-xs tabular-nums text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/40"
          placeholder="Paste Robinhood transaction CSV here — it parses automatically"
        />
      )}

      {/* Success state */}
      {importedCount !== null && (
        <div className="flex items-center justify-between rounded-[12px] border border-pos/30 bg-pos/10 px-4 py-3">
          <span className="text-strong text-pos">
            Imported {importedCount} transaction{importedCount === 1 ? "" : "s"}.
          </span>
          <button type="button" onClick={reset} className="text-body font-medium text-foreground underline">
            Import more
          </button>
        </div>
      )}

      {/* Review */}
      {parsed && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip dot="rgb(var(--pos))" label="new" count={counts.new} tone="text-pos" />
            <Chip dot="rgb(var(--accent))" label="duplicates" count={counts.duplicate} tone="text-accent" />
            <Chip dot="rgb(var(--warn))" label="warnings" count={counts.warning} tone="text-warn" />
            <Chip dot="rgb(var(--text-muted))" label="ignored" count={counts.ignored} />
            <span className="text-caption text-muted-foreground">
              {rows.length} rows parsed from {parsed.fileCount} file{parsed.fileCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-body text-muted-foreground">Review &amp; select rows to import</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rows…"
                className="w-48 rounded-md border border-hairline bg-surface py-1.5 pl-8 pr-2 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-hairline">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-hairline text-micro uppercase tracking-wide text-muted-foreground">
                    <th className="w-9 px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-accent"
                        checked={allSelectableChecked}
                        onChange={toggleAll}
                        aria-label="Select all importable rows"
                      />
                    </th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Symbol</th>
                    <th className="px-2 py-2 text-left">Action</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const status = statusOf(r, parsed);
                    const badge = STATUS_BADGE[status];
                    const warnings = parsed.warningsByRowId.get(r.id);
                    const selectable = status !== "ignored";
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b border-hairline text-caption last:border-b-0",
                          status === "warning" && "bg-warn/[0.04]"
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-accent disabled:opacity-40"
                            checked={selected.has(r.id)}
                            disabled={!selectable}
                            onChange={() => toggle(r.id)}
                            aria-label={`Select ${r.symbol} ${r.tradeDate}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-micro font-semibold", badge.cls)}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-2 py-2 tabular-nums text-muted-foreground">
                          {r.tradeDate ? formatDisplayDate(r.tradeDate) : "—"}
                        </td>
                        <td className="px-2 py-2 font-medium text-foreground">{r.symbol || "—"}</td>
                        <td className="px-2 py-2 text-muted-foreground">{label(r.action)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-foreground">{r.quantity || "—"}</td>
                        <td className="px-2 py-2 text-right">
                          {warnings?.length ? (
                            <span className="text-micro text-warn" title={warnings.join("; ")}>
                              {warnings[0]}
                            </span>
                          ) : (
                            signedMoney(r.netAmount)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-body text-muted-foreground">
                        No rows match “{search}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-caption text-muted-foreground">
              {selected.size} of {rows.length} selected · duplicates &amp; ignored excluded by default
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectRecommended}
                className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-surface-inset"
              >
                Select recommended
              </button>
              <button
                type="button"
                onClick={doImport}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-body font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-3.5 w-3.5" />
                Import {selected.size} selected
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

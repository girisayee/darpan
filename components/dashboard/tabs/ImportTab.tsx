"use client";

import { Download, FileUp, RefreshCcw } from "lucide-react";
import { useRef, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Column, DataTable } from "@/components/tables/DataTable";
import { label, signedMoney } from "@/components/dashboard/tabs/shared";
import { parseRobinhoodInput, type ImportPreview } from "@/lib/import/robinhood";
import { formatDisplayDate, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { TradeTransaction } from "@/types/trading";

export function ImportTab({
  existing,
  onSave,
}: {
  existing: TradeTransaction[];
  onSave: (rows: TradeTransaction[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const normalizedRows = preview?.rows ?? [];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <h2 className="font-sans text-[13px] font-medium text-foreground">
          Robinhood Import
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <IconButton
            label="Upload CSV"
            onClick={() => fileInput.current?.click()}
            icon={<FileUp className="h-4 w-4" />}
          />
          <IconButton
            label="Parse Rows"
            onClick={() => setPreview(parseRobinhoodInput(raw, existing))}
            icon={<RefreshCcw className="h-4 w-4" />}
          />
          <IconButton
            label="Save Import"
            onClick={() => {
              if (preview) onSave(normalizedRows);
            }}
            icon={<Download className="h-4 w-4" />}
            disabled={!preview}
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setRaw(await file.text());
          }}
        />
        <textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          className="mt-4 h-80 w-full resize-none rounded-md border border-hairline bg-surface p-3 font-sans text-xs tabular-nums text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/40"
          placeholder="Paste Robinhood transaction CSV here"
        />
      </section>
      <section className="space-y-4">
        {preview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard
                label="Imported Rows"
                value={formatNumber(preview.rows.length)}
                helper="Parsed row count"
                tooltip="Rows read from pasted or uploaded CSV."
              />
              <KpiCard
                label="Skipped Duplicates"
                value={formatNumber(preview.duplicateIds.length)}
                helper="Likely duplicate rows"
                tooltip="Duplicate detection uses date, symbol, action, quantity, price, amount, and raw description."
                tone={preview.duplicateIds.length ? "negative" : "neutral"}
              />
              <KpiCard
                label="Unresolved"
                value={formatNumber(
                  preview.rows.filter((r) => r.status === "unresolved").length
                )}
                helper="Needs classification"
                tooltip="Rows with missing or ambiguous fields."
                tone={
                  preview.rows.some((r) => r.status === "unresolved")
                    ? "negative"
                    : "neutral"
                }
              />
              <KpiCard
                label="Warnings"
                value={formatNumber(preview.issues.length)}
                helper="Validation messages"
                tooltip="Missing fields, unknown actions, or duplicates."
                tone={preview.issues.length ? "negative" : "neutral"}
              />
            </div>
            <TradesPreview rows={preview.rows} />
            <ImportIssues issues={preview.issues} />
          </>
        ) : (
          <div className="rounded-xl border border-hairline bg-surface p-8 font-sans text-sm text-muted-foreground">
            No import preview yet.
          </div>
        )}
      </section>
    </div>
  );
}

function TradesPreview({ rows }: { rows: TradeTransaction[] }) {
  const columns: Column<TradeTransaction>[] = [
    {
      key: "tradeDate",
      header: "Date",
      value: (row) => row.tradeDate,
      render: (row) => formatDisplayDate(row.tradeDate),
    },
    { key: "symbol", header: "Symbol", value: (row) => row.symbol },
    {
      key: "action",
      header: "Action",
      value: (row) => row.action,
      render: (row) => label(row.action),
    },
    {
      key: "quantity",
      header: "Qty",
      value: (row) => row.quantity,
      align: "right",
    },
    {
      key: "netAmount",
      header: "Net",
      value: (row) => row.netAmount,
      render: (row) => signedMoney(row.netAmount),
      align: "right",
      tooltip: "Gross amount − fees.",
    },
    { key: "status", header: "Status", value: (row) => row.status },
    { key: "rawDescription", header: "Raw", value: (row) => row.rawDescription },
  ];
  return <DataTable rows={rows} columns={columns} empty="No parsed rows." searchable pageSize={25} />;
}

function ImportIssues({ issues }: { issues: ImportPreview["issues"] }) {
  if (!issues.length) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-4 font-sans text-[12px] text-muted-foreground">
        No import warnings.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <h3 className="font-sans text-[13px] font-medium text-foreground">
        Unresolved Imports
      </h3>
      <div className="mt-3 space-y-2">
        {issues.map((issue, index) => (
          <div
            key={index}
            className="rounded-md border border-hairline bg-surface-inset p-3 font-sans text-[11.5px] text-muted-foreground"
          >
            Row {issue.rowIndex + 1}: {issue.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  label: buttonLabel,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={buttonLabel}
      aria-label={buttonLabel}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-hairline bg-surface px-3 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
        danger && "border-neg/30 text-neg hover:bg-neg/10"
      )}
    >
      {icon}
      <span>{buttonLabel}</span>
    </button>
  );
}

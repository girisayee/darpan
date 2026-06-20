"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";

export type Column<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
};

export function DataTable<T>({
  rows,
  columns,
  onRowClick,
  empty = "No rows to show.",
  defaultSort
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  empty?: string;
  defaultSort?: { key: string; direction: "asc" | "desc" };
}) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>(
    defaultSort ?? { key: columns[0]?.key ?? "", direction: "asc" }
  );

  const sorted = useMemo(() => {
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return rows;
    return [...rows].sort((a, b) => {
      const av = column.value(a);
      const bv = column.value(b);
      // Missing / empty values always sort last, regardless of direction
      const aEmpty = av == null || av === "" || av === -Infinity;
      const bEmpty = bv == null || bv === "" || bv === -Infinity;
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, rows, sort]);

  if (!rows.length) {
    return <div className="rounded-lg border border-hairline bg-surface p-6 text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <div className="flex flex-col gap-0 rounded-lg border border-hairline bg-surface">
      <div className="scrollbar-thin overflow-auto">
        <table className="table-sticky min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.key === column.key;
                const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th
                    key={column.key}
                    className={cn(
                      "border-b border-hairline-soft px-3 py-2.5 text-left",
                      column.align === "right" && "text-right"
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 text-[11.5px] font-normal normal-case tracking-normal text-muted-foreground",
                        column.align === "right" && "flex-row-reverse"
                      )}
                      onClick={() => {
                        setSort((current) => ({
                          key: column.key,
                          direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc"
                        }));
                      }}
                    >
                      {column.header}
                      <Icon className="h-3 w-3 shrink-0" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  "border-b border-hairline-soft last:border-0 transition-colors duration-[120ms]",
                  onRowClick && "cursor-pointer hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                )}
                onClick={() => onRowClick?.(row)}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2.5 align-top",
                      column.align === "right"
                        ? "text-right tabular-nums text-foreground"
                        : "font-sans"
                    )}
                  >
                    {column.render ? column.render(row) : column.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

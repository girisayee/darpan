"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
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
  defaultSort,
  pageSize,
  searchable = false,
  searchPlaceholder = "Search…"
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  empty?: string;
  defaultSort?: { key: string; direction: "asc" | "desc" };
  /** When set, rows are paginated at this size with a prev/next footer. */
  pageSize?: number;
  /** When true, shows a search box that filters rows across all column values. */
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>(
    defaultSort ?? { key: columns[0]?.key ?? "", direction: "asc" }
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((column) => {
        const v = column.value(row);
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [rows, columns, searchable, query]);

  const sorted = useMemo(() => {
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return filtered;
    return [...filtered].sort((a, b) => {
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
  }, [columns, filtered, sort]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // Clamp without setState-in-render: derive the effective page from current state.
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const paged = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  if (!rows.length) {
    return <div className="rounded-lg border border-hairline bg-surface p-6 text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {searchable && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            aria-label="Search table"
            className="h-9 w-full max-w-[280px] rounded-md border border-hairline bg-surface pl-8 pr-2.5 font-sans text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>
      )}

      <div className="flex flex-col gap-0 rounded-lg border border-hairline bg-surface">
        {sorted.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No matches.</div>
        ) : (
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
                            setPage(0);
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
                {paged.map((row, rowIndex) => (
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
        )}

        {pageSize && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-hairline-soft px-3 py-2">
            <span className="font-sans text-[11.5px] tabular-nums text-muted-foreground">
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
                className="rounded p-1 text-muted-foreground hover:bg-accent/[0.06] disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[4rem] text-center font-sans text-[11.5px] tabular-nums text-muted-foreground">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="Next page"
                className="rounded p-1 text-muted-foreground hover:bg-accent/[0.06] disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

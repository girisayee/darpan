"use client";

import { cn } from "@/lib/utils/cn";

type StatItem = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
};

type StatStripProps = {
  items: StatItem[];
  moreCount?: number;
  onMore?: () => void;
};

export function StatStrip({ items, moreCount, onMore }: StatStripProps) {
  return (
    <div
      className="bg-surface border border-hairline rounded-xl overflow-hidden"
      role="list"
      aria-label="Key statistics"
    >
      <div className="flex flex-wrap divide-x divide-hairline-soft">
        {items.map((item) => (
          <div
            key={item.label}
            role="listitem"
            className="flex min-w-[100px] flex-1 flex-col gap-0.5 px-4 py-3"
          >
            <span className="font-sans text-[10px] uppercase tracking-[.12em] text-text-muted">
              {item.label}
            </span>
            <span
              className={cn(
                "font-mono text-[13px] font-medium tabular-nums",
                item.tone === "positive" && "text-pos",
                item.tone === "negative" && "text-neg",
                (!item.tone || item.tone === "neutral") && "text-foreground"
              )}
            >
              {item.value}
            </span>
          </div>
        ))}

        {moreCount != null && moreCount > 0 && (
          <div className="flex items-center px-4 py-3">
            <button
              type="button"
              onClick={onMore}
              className={cn(
                "font-sans text-[12px] font-medium text-brand",
                "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              )}
              aria-label={`Show ${moreCount} more statistics`}
            >
              +{moreCount} more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

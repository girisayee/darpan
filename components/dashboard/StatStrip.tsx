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
  showingMore?: boolean;
};

export function StatStrip({ items, moreCount, onMore, showingMore }: StatStripProps) {
  return (
    <div
      className="flex flex-wrap items-start gap-x-10 gap-y-4"
      role="list"
      aria-label="Key statistics"
    >
      {items.map((item) => (
        <div key={item.label} role="listitem" className="flex flex-col gap-0.5">
          <span className="text-[12px] text-muted-foreground">{item.label}</span>
          <span
            className={cn(
              "text-[20px] font-medium tabular-nums leading-snug",
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
        <div className="flex items-end pb-0.5" style={{ alignSelf: "flex-end" }}>
          <button
            type="button"
            onClick={onMore}
            className="text-[13px] text-accent rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label={showingMore ? "Collapse extra metrics" : `Show ${moreCount} more metrics`}
          >
            {showingMore ? "← Fewer metrics" : "More metrics →"}
          </button>
        </div>
      )}
    </div>
  );
}

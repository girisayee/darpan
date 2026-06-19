"use client";

import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "positive" | "negative" | "neutral";

export function KpiCard({
  label,
  value,
  helper,
  tooltip,
  tone = "neutral"
}: {
  label: string;
  value: string;
  helper: string;
  tooltip: string;
  tone?: Tone;
}) {
  const tooltipId = useId();
  const Icon = tone === "positive" ? TrendingUp : tone === "negative" ? TrendingDown : Info;
  return (
    <section className="bg-surface border border-hairline rounded-[10px] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground">
            {label}
            <span className="group/tooltip relative inline-flex">
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
                aria-label={`About ${label}: ${tooltip}`}
                aria-describedby={tooltipId}
                title={tooltip}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span
                id={tooltipId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-64 -translate-x-1/2 rounded-md border border-hairline bg-foreground px-3 py-2 text-xs font-medium normal-case leading-5 text-background opacity-0 transition group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
              >
                {tooltip}
              </span>
            </span>
          </div>
          <div
            className={cn(
              "mt-2 text-xl font-mono font-medium tabular-nums",
              tone === "positive" && "text-pos",
              tone === "negative" && "text-neg",
              tone === "neutral" && "text-foreground"
            )}
          >
            {value}
          </div>
        </div>
        <span
          className={cn(
            "rounded-lg border p-2",
            tone === "positive" && "border-pos/25 bg-pos/10 text-pos",
            tone === "negative" && "border-neg/25 bg-neg/10 text-neg",
            tone === "neutral" && "border-hairline bg-surface-inset text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{helper}</p>
    </section>
  );
}

// Tape design-system alias
export const Readout = KpiCard;

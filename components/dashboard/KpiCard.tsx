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
    <section className="rounded-lg border bg-card/95 p-4 shadow-panel transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
            <span className="group/tooltip relative inline-flex">
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={`About ${label}: ${tooltip}`}
                aria-describedby={tooltipId}
                title={tooltip}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span
                id={tooltipId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-64 -translate-x-1/2 rounded-md border bg-foreground px-3 py-2 text-xs font-medium normal-case leading-5 text-background opacity-0 shadow-lg transition group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
              >
                {tooltip}
              </span>
            </span>
          </div>
          <div
            className={cn(
              "mt-2 text-2xl font-semibold tabular-nums",
              tone === "positive" && "text-success",
              tone === "negative" && "text-danger",
              tone === "neutral" && "text-foreground"
            )}
          >
            {value}
          </div>
        </div>
        <span
          className={cn(
            "rounded-md border p-2",
            tone === "positive" && "border-success/25 bg-success/10 text-success",
            tone === "negative" && "border-danger/25 bg-danger/10 text-danger",
            tone === "neutral" && "border-border bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">{helper}</p>
    </section>
  );
}

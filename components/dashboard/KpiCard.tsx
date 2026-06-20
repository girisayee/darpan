"use client";

import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "positive" | "negative" | "neutral";
type Variant = "hero" | "standard" | "compact" | "exposure";

export function KpiCard({
  label,
  value,
  helper,
  tooltip,
  tone = "neutral",
  variant = "standard",
}: {
  label: string;
  value: string;
  helper: string;
  tooltip: string;
  tone?: Tone;
  variant?: Variant;
}) {
  const tooltipId = useId();

  const valueClass = cn(
    "tabular-nums leading-snug flex items-center gap-0.5",
    variant === "hero"    && "text-[30px] font-semibold tracking-[-0.01em]",
    variant === "compact" && "text-[16px] font-medium",
    (variant === "standard" || variant === "exposure") && "text-[20px] font-medium",
    tone === "positive" && "text-pos",
    tone === "negative" && "text-neg",
    tone === "neutral"  && "text-foreground"
  );

  const inner = (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
        {label}
        <span className="group/tooltip relative inline-flex">
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground outline-none opacity-60 transition hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label={`About ${label}: ${tooltip}`}
            aria-describedby={tooltipId}
            title={tooltip}
          >
            <Info className="h-3 w-3" aria-hidden="true" />
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
      <div className={valueClass}>
        {tone === "positive" && (
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {tone === "negative" && (
          <ArrowDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {value}
      </div>
      <div className="text-[12px] text-muted-foreground">{helper}</div>
    </div>
  );

  if (variant === "exposure") {
    return (
      <div className="rounded-[12px] border border-accent/40 bg-surface px-3 py-2.5">
        {inner}
      </div>
    );
  }

  return inner;
}

// Alias
export const Readout = KpiCard;

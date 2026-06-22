"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { InfoTooltip } from "@/components/common/InfoTooltip";

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
  const valueClass = cn(
    "tabular-nums leading-snug flex items-center gap-0.5",
    variant === "hero"    && "text-[30px] font-semibold tracking-[-0.01em]",
    variant === "compact" && "text-[19px] font-medium",
    (variant === "standard" || variant === "exposure") && "text-[22px] font-medium",
    tone === "positive" && "text-pos",
    tone === "negative" && "text-neg",
    tone === "neutral"  && "text-foreground"
  );

  const inner = (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground">
        {label}
        <InfoTooltip text={tooltip} label={label} />
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
      <div className="text-[12px] text-muted-foreground mt-0.5">{helper}</div>
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

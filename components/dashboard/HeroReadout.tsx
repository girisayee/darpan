"use client";

import { cn } from "@/lib/utils/cn";

type HeroReadoutProps = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  ytdBadge?: string;
  ytdBadgeTone?: "positive" | "negative";
  subLine?: string;
};

export function HeroReadout({ label, value, tone = "neutral", ytdBadge, ytdBadgeTone = "positive", subLine }: HeroReadoutProps) {
  const valueClass = cn(
    "mt-1 text-[36px] font-medium tracking-tight tabular-nums leading-none",
    tone === "positive" && "text-pos",
    tone === "negative" && "text-neg",
    tone === "neutral" && "text-foreground"
  );

  return (
    <div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className={valueClass}>{value}</span>
        {ytdBadge && (
          <span className={cn("text-[13px] tabular-nums", ytdBadgeTone === "negative" ? "text-neg" : "text-pos")}>{ytdBadge}</span>
        )}
      </div>
      {subLine && (
        <div className="mt-1.5 text-[13px] tabular-nums text-muted-foreground">{subLine}</div>
      )}
    </div>
  );
}

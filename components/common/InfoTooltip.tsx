"use client";

import { Info } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Small info affordance with a hover/focus popover (and a native `title` fallback so it
 * still works inside clipping scroll containers like table bodies). Used for metric-card
 * labels and table column headers to explain how a value is calculated.
 */
export function InfoTooltip({
  text,
  label,
  side = "top",
}: {
  text: string;
  label?: string;
  side?: "top" | "bottom";
}) {
  const id = useId();
  return (
    <span className="group/tooltip relative inline-flex">
      <button
        type="button"
        // Don't let the click bubble to a sortable header button behind it.
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground outline-none opacity-50 transition hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={label ? `About ${label}: ${text}` : text}
        aria-describedby={id}
        title={text}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none fixed inset-x-4 top-4 z-50 rounded-md border border-hairline bg-foreground px-3 py-2 text-xs font-medium normal-case leading-5 text-background opacity-0 transition group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 sm:absolute sm:left-1/2 sm:right-auto sm:w-max sm:max-w-64 sm:-translate-x-1/2",
          side === "top" ? "sm:bottom-full sm:top-auto sm:mb-2" : "sm:top-full sm:mt-2"
        )}
      >
        {text}
      </span>
    </span>
  );
}

"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";

// ── Ring geometry ─────────────────────────────────────────────────────────────

const RING_SIZE = 56;
const STROKE = 6;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(util: number | null): string {
  if (util === null) return "text-muted-foreground";
  if (util >= 80) return "text-neg";
  if (util >= 40) return "text-pos";
  return "text-warn";
}

// ── BuyingPowerGauge ──────────────────────────────────────────────────────────

export function BuyingPowerGauge({
  deployed,
  maxBP,
}: {
  /** Current open capital deployed (dollars). */
  deployed: number;
  /** Max buying power setting (dollars). Zero or null → unknown. */
  maxBP: number | null | undefined;
}) {
  const valid = maxBP != null && maxBP > 0;
  const util = valid ? (deployed / maxBP!) * 100 : null;
  const clampedPct = util !== null ? Math.max(0, Math.min(100, util)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - clampedPct / 100);
  const colorClass = ringColor(util);
  const intPct = util !== null ? Math.round(util) : null;

  const ariaLabel =
    util !== null
      ? `Capital deployed ${formatCurrency(deployed)}, ${intPct}% of ${formatCurrency(maxBP!)} max`
      : "Capital deployed: no max configured";

  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-hairline bg-surface p-3">
      {/* Ring SVG */}
      <div className="shrink-0" role="img" aria-label={ariaLabel}>
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          fill="none"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-background opacity-60"
          />
          {/* Fill arc */}
          {valid && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className={cn("transition-all duration-500", colorClass)}
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
            />
          )}
          {/* Center label */}
          <text
            x="50%"
            y="50%"
            dominantBaseline="central"
            textAnchor="middle"
            className={cn(
              "font-sans text-[11px] font-semibold tabular-nums",
              valid ? colorClass : "text-muted-foreground"
            )}
            fill="currentColor"
          >
            {intPct !== null ? `${intPct}%` : "—"}
          </text>
        </svg>
      </div>

      {/* Text */}
      <div className="min-w-0">
        <div className="font-sans text-[12.5px] font-medium text-muted-foreground">
          Capital deployed
        </div>
        <div className="mt-0.5 font-sans text-[14px] font-medium tabular-nums text-foreground">
          {valid
            ? `${formatCurrency(deployed)} / ${formatCurrency(maxBP!)}`
            : "—"}
        </div>
        <div className="mt-0.5 font-sans text-[11.5px] text-muted-foreground">
          of configured max
        </div>
      </div>
    </div>
  );
}

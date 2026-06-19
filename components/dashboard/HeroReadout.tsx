"use client";

import { cn } from "@/lib/utils/cn";

type HeroReadoutProps = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  spark?: number[];
  pills?: string[];
};

function buildPolyline(values: number[], width = 80, height = 28): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return points.join(" ");
}

export function HeroReadout({ label, value, tone = "neutral", spark, pills }: HeroReadoutProps) {
  const valueClass = cn(
    "mt-1 font-mono text-[40px] font-bold tabular-nums leading-none",
    tone === "positive" && "text-pos",
    tone === "negative" && "text-neg",
    tone === "neutral" && "text-foreground"
  );

  const sparkStroke =
    tone === "positive"
      ? "rgb(var(--pos))"
      : tone === "negative"
        ? "rgb(var(--neg))"
        : "rgb(var(--text-muted))";

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4">
      <div className="text-[10px] font-sans uppercase tracking-[.12em] text-text-muted">{label}</div>
      <div className={valueClass}>{value}</div>

      {spark && spark.length >= 2 && (
        <svg
          viewBox={`0 0 80 28`}
          width={80}
          height={28}
          aria-hidden="true"
          className="mt-2 block"
          style={{ overflow: "visible" }}
        >
          <polyline
            points={buildPolyline(spark)}
            fill="none"
            stroke={sparkStroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}

      {pills && pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-hairline bg-surface-inset px-2.5 py-1 font-sans text-[10.5px] text-text-muted"
            >
              {pill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

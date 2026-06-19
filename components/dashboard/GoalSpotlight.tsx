"use client";

import type { GoalPaceResult } from "@/lib/selectors/goal-pace";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

// Fixed on-dark palette — intentional hero block in both themes
const C = {
  bg: "#16181F",
  border: "rgba(255,255,255,0.08)",
  text: "#F2F3F6",
  muted: "#9AA0AC",
  accent: "#6E8BFF",
  pos: "#34D399",
  neg: "#E0533B",
  track: "#2A2D36",
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface GoalSpotlightProps {
  pace: GoalPaceResult;
  year: number;
  annualGoal: number;
  monthlyActual: number;
  monthlyTarget: number;
  monthLabel: string;
  monthIndex: number;
}

export function GoalSpotlight({
  pace,
  year,
  annualGoal,
  monthlyActual,
  monthlyTarget,
  monthLabel,
  monthIndex,
}: GoalSpotlightProps) {
  const isAhead = pace.aheadBy >= 0;

  // Monthly gauge
  const monthPct = monthlyTarget > 0 ? Math.max(0, Math.min(1, monthlyActual / monthlyTarget)) : 0;

  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: "16px",
        padding: "24px",
        color: C.text,
      }}
    >
      {/* Two-column grid — stack on narrow */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: "24px",
          alignItems: "start",
        }}
        className="flex-col-on-narrow"
      >
        {/* Left: Annual goal */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Label row */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: C.muted,
              }}
            >
              Annual goal · {year}
            </span>
            {/* Pace pill */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "999px",
                background: isAhead ? "rgba(52,211,153,0.15)" : "rgba(224,83,59,0.15)",
                color: isAhead ? C.pos : C.neg,
              }}
            >
              {isAhead ? "▲" : "▼"} {formatCurrency(Math.abs(pace.aheadBy))} {isAhead ? "ahead of" : "behind"} pace
            </span>
          </div>

          {/* Big number */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "32px",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                color: C.text,
              }}
            >
              {formatCurrency(pace.actual)}
            </span>
            <span style={{ fontSize: "13px", color: C.muted, fontVariantNumeric: "tabular-nums" }}>
              of {formatCurrency(annualGoal)} · {formatPercent(pace.pct)}
            </span>
          </div>

          {/* Trajectory SVG */}
          <TrajectoryChart
            cumulative={pace.cumulative}
            annualGoal={annualGoal}
            monthIndex={monthIndex}
          />
        </div>

        {/* Right: Monthly target */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: C.muted,
            }}
          >
            Monthly · {monthLabel}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Radial gauge */}
            <RadialGauge pct={monthPct} />

            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                  color: C.text,
                }}
              >
                {formatCurrency(monthlyActual)}
              </span>
              <span style={{ fontSize: "12px", color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                of {formatCurrency(monthlyTarget)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive override via a style tag */}
      <style>{`
        @media (max-width: 640px) {
          .flex-col-on-narrow {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Trajectory chart ──────────────────────────────────────────────────────────

function TrajectoryChart({
  cumulative,
  annualGoal,
  monthIndex,
}: {
  cumulative: number[];
  annualGoal: number;
  monthIndex: number;
}) {
  const W = 340;
  const H = 80;
  const PAD = { t: 6, r: 8, b: 20, l: 8 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // Normalize: x = month 0..11, y = 0..annualGoal
  const maxY = Math.max(annualGoal, ...(cumulative.length ? cumulative : [0]));
  const scaleX = (m: number) => PAD.l + (m / 11) * chartW;
  const scaleY = (v: number) => PAD.t + chartH - (maxY > 0 ? (v / maxY) * chartH : 0);

  // Target line: 0 → annualGoal (straight dashed)
  const tx0 = scaleX(0);
  const ty0 = scaleY(0);
  const tx1 = scaleX(11);
  const ty1 = scaleY(annualGoal);

  // Actual cumulative polyline — only months with data
  const actualPoints: [number, number][] = cumulative.slice(0, monthIndex + 1).map((v, i) => [
    scaleX(i),
    scaleY(v),
  ]);
  // Extend with a leading zero if needed
  if (actualPoints.length === 0) {
    actualPoints.push([scaleX(0), scaleY(0)]);
  }

  const polylineD = actualPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaD = `${polylineD} L ${actualPoints[actualPoints.length - 1][0].toFixed(1)} ${(PAD.t + chartH).toFixed(1)} L ${actualPoints[0][0].toFixed(1)} ${(PAD.t + chartH).toFixed(1)} Z`;

  // Current dot
  const dotX = actualPoints[actualPoints.length - 1][0];
  const dotY = actualPoints[actualPoints.length - 1][1];

  // X-axis ticks: Jan · currentMonth · Dec · goal label
  const currentMonthLabel = MONTHS[monthIndex] ?? "Dec";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      style={{ display: "block", overflow: "visible" }}
      aria-label="Annual goal trajectory"
    >
      <defs>
        <linearGradient id="sg-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Target dashed line */}
      <line
        x1={tx0} y1={ty0}
        x2={tx1} y2={ty1}
        stroke={C.muted}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.5"
      />

      {/* Actual area fill */}
      <path d={areaD} fill="url(#sg-area-grad)" />

      {/* Actual cumulative line */}
      <path d={polylineD} stroke={C.accent} strokeWidth="1.5" fill="none" strokeLinejoin="round" />

      {/* Dot at current month */}
      <circle cx={dotX} cy={dotY} r="3" fill={C.accent} />

      {/* X-axis ticks */}
      <text x={PAD.l} y={H - 4} fontSize="9" fill={C.muted} textAnchor="start">Jan</text>
      {monthIndex > 0 && monthIndex < 11 && (
        <text x={dotX} y={H - 4} fontSize="9" fill={C.accent} textAnchor="middle">{currentMonthLabel}</text>
      )}
      <text x={W - PAD.r} y={H - 4} fontSize="9" fill={C.muted} textAnchor="end">Dec · {formatCurrency(annualGoal)}</text>
    </svg>
  );
}

// ── Radial gauge ─────────────────────────────────────────────────────────────

function RadialGauge({ pct }: { pct: number }) {
  const R = 28;
  const cx = 34;
  const cy = 34;
  const strokeW = 5;
  const circumference = 2 * Math.PI * R;
  const filled = pct * circumference;

  const centerLabel = `${Math.round(pct * 100)}%`;

  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-label={`Monthly target ${centerLabel} complete`}>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={C.track}
        strokeWidth={strokeW}
      />
      {/* Fill — starts at top (−90°) */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={C.pos}
        strokeWidth={strokeW}
        strokeDasharray={`${filled.toFixed(2)} ${circumference.toFixed(2)}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Center label */}
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="600"
        style={{ fontVariantNumeric: "tabular-nums" }}
        fill={C.text}
      >
        {centerLabel}
      </text>
    </svg>
  );
}

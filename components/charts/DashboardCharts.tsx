"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { CalculationResult } from "@/types/trading";
import { formatPercent } from "@/lib/utils/format";

// Quiet palette — consumed via CSS variables so both themes work automatically.
// recharts props only accept string colors, so we use the rgb(var(…)) form.
const C_POS       = "rgb(var(--pos))";
const C_NEG       = "rgb(var(--neg))";
const C_HAIRLINE  = "rgb(var(--hairline))";
const C_MUTED     = "rgb(var(--text-muted))";
const C_SURFACE   = "rgb(var(--surface))";

const TICK_STYLE = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fill: C_MUTED
} as const;

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: C_SURFACE,
  border: `1px solid ${C_HAIRLINE}`,
  borderRadius: 8,
  boxShadow: "none",
  padding: "8px 12px"
};

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  color: C_MUTED
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  color: C_MUTED,
  marginBottom: 4
};


/** Custom bar shape that colors positive values --pos and negative values --neg */
function RoiBar(props: { x?: number; y?: number; width?: number; height?: number; value?: number | [number, number] }) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!width || !height) return null;
  const numValue = Array.isArray(value) ? value[1] - value[0] : value;
  const fill = numValue >= 0 ? C_POS : C_NEG;
  return <rect x={x} y={y} width={width} height={Math.abs(height)} rx={2} fill={fill} />;
}

/** Capital & ROI tab: standalone monthly-ROI bar chart used only in CapitalTab */
export function MonthlyRoiChart({ result }: { result: CalculationResult }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const data = useMemo(
    () =>
      result.monthlyReturns.map((row) => ({
        month: `${row.year}-${String(row.month).padStart(2, "0")}`,
        roi: row.realizedRoiPercent
      })),
    [result.monthlyReturns]
  );

  if (!mounted) {
    return <div className="h-[150px] animate-pulse rounded-md bg-surface-inset" />;
  }

  return (
    <div style={{ height: 150 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke={C_HAIRLINE} opacity={1} />
          <XAxis dataKey="month" tick={TICK_STYLE} axisLine={{ stroke: C_HAIRLINE }} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={(value: unknown) => [formatPercent(typeof value === "number" ? value : Number(value)), "ROI"]}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ fill: `rgb(var(--hairline) / 0.2)` }}
          />
          <Bar
            dataKey="roi"
            radius={[2, 2, 0, 0]}
            /* positive bars → --pos, negative → --neg via Cell list */
            fill={C_POS}
            shape={RoiBar}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


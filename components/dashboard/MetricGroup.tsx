import React from "react";

export function MetricGroup({
  label,
  children,
  cols = 4,
}: {
  label?: string;
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}): React.ReactElement {
  const minWidth = cols <= 2 ? "130px" : "150px";
  return (
    <div className="space-y-2">
      {label && (
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: "10px",
          gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))`,
        }}
      >
        {React.Children.map(children, (child) =>
          child ? (
            <div className="rounded-xl border border-hairline bg-surface p-3">
              {child}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

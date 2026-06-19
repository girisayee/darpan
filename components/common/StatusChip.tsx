import { cn } from "@/lib/utils/cn";

export type StatusKind =
  | "open"
  | "closed"
  | "expired"
  | "assigned"
  | "ok"
  | "unresolved"
  | "zero-basis";

const KIND_MAP: Record<StatusKind, { label: string; classes: string }> = {
  open:        { label: "Open",       classes: "bg-brand/10 text-brand" },
  ok:          { label: "OK",         classes: "bg-pos/10 text-pos" },
  expired:     { label: "Expired",    classes: "bg-pos/10 text-pos" },
  unresolved:  { label: "Unresolved", classes: "bg-warn/15 text-warn" },
  assigned:    { label: "Assigned",   classes: "bg-dim/15 text-dim" },
  closed:      { label: "Closed",     classes: "bg-dim/15 text-dim" },
  "zero-basis":{ label: "Zero Basis", classes: "bg-neg/10 text-neg" },
};

export function StatusChip({ kind }: { kind: StatusKind }) {
  const { label, classes } = KIND_MAP[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        classes
      )}
    >
      {label}
    </span>
  );
}

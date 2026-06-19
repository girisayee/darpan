"use client";

import { FileDown, Moon, Settings, Sun, Upload } from "lucide-react";
import type { Theme } from "@/lib/theme/use-theme";
import { TickerRail } from "@/components/shell/TickerRail";
import { cn } from "@/lib/utils/cn";

interface Mover {
  symbol: string;
  pnl: number;
}

interface AppHeaderProps {
  movers: Mover[];
  theme: Theme;
  onToggleTheme: () => void;
  onImport: () => void;
  onSettings: () => void;
  onExport: () => void;
}

function IconButton({
  label: buttonLabel,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={buttonLabel}
      aria-label={buttonLabel}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-hairline",
        "bg-surface text-muted-foreground transition-colors",
        "hover:border-brand/40 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      )}
    >
      {icon}
    </button>
  );
}

export function AppHeader({
  movers,
  theme,
  onToggleTheme,
  onImport,
  onSettings,
  onExport,
}: AppHeaderProps) {
  return (
    <header className="flex items-center gap-3 rounded-[14px] border border-hairline bg-surface px-4 py-3">
      {/* Gold wordmark square */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand text-[11px] font-bold text-[#0C1118] select-none"
        aria-hidden="true"
      >
        PI
      </div>

      {/* Product name */}
      <span className="font-sans text-[13px] font-semibold tracking-[.06em] text-foreground uppercase shrink-0">
        POSITIONIQ
      </span>

      {/* Ticker rail — grows to fill remaining space */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <TickerRail movers={movers} />
      </div>

      {/* Icon buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <IconButton
          label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
          icon={
            theme === "dark"
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />
          }
        />
        <IconButton
          label="Import trades"
          onClick={onImport}
          icon={<Upload className="h-4 w-4" />}
        />
        <IconButton
          label="Settings"
          onClick={onSettings}
          icon={<Settings className="h-4 w-4" />}
        />
        <IconButton
          label="Export backup"
          onClick={onExport}
          icon={<FileDown className="h-4 w-4" />}
        />
      </div>
    </header>
  );
}

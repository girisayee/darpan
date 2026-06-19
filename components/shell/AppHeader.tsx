"use client";

import { FileDown, Moon, Settings, Sun, Upload } from "lucide-react";
import type { Theme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";

interface AppHeaderProps {
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
        "inline-flex h-8 w-8 items-center justify-center rounded-[8px]",
        "text-muted-foreground transition-colors",
        "hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      )}
    >
      {icon}
    </button>
  );
}

export function AppHeader({
  theme,
  onToggleTheme,
  onImport,
  onSettings,
  onExport,
}: AppHeaderProps) {
  return (
    <header className="flex items-center gap-4 border-b border-hairline px-4 py-3">
      {/* Wordmark */}
      <span className="font-sans text-[15px] font-semibold tracking-tight text-foreground shrink-0 select-none">
        PositionIQ
      </span>

      {/* Spacer */}
      <div className="flex-1" aria-hidden="true" />

      {/* Icon buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
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

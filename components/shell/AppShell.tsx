"use client";

import { ChevronDown, FileDown, Moon, Settings, Sun, Upload, Wallet } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import type { Theme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";

interface AppShellProps {
  tabs: readonly string[];
  activeTab: string;
  onSelectTab: (tab: string) => void;
  accounts: string[];
  account: string;
  onAccount: (account: string) => void;
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

export function AppShell({
  tabs,
  activeTab,
  onSelectTab,
  accounts,
  account,
  onAccount,
  theme,
  onToggleTheme,
  onImport,
  onSettings,
  onExport,
}: AppShellProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") {
      next = (index + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = tabs.length - 1;
    }
    if (next !== null) {
      e.preventDefault();
      onSelectTab(tabs[next]);
      buttonRefs.current[next]?.focus();
    }
  }

  const accountLabel =
    account === "ALL"
      ? "All accounts"
      : account;

  // Cycle through accounts on click
  function handleAccountCycle() {
    const idx = accounts.indexOf(account);
    const next = accounts[(idx + 1) % accounts.length];
    onAccount(next ?? accounts[0] ?? "ALL");
  }

  return (
    <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
      {/* LEFT: logo + nav pills */}
      <div className="flex items-center gap-4">
        {/* Logo mark */}
        <div className="flex items-center gap-2 shrink-0 select-none">
          <span className="inline-block h-5 w-5 rounded-[6px] bg-aurora" aria-hidden="true" />
          <span className="text-[14px] font-semibold text-foreground">RealizedEdge</span>
        </div>

        {/* Nav pills */}
        <nav
          role="tablist"
          aria-label="Main navigation"
          className="flex gap-1"
        >
          {tabs.map((tab, index) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                ref={(el) => { buttonRefs.current[index] = el; }}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                aria-controls="dashboard-tabpanel"
                onClick={() => onSelectTab(tab)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={cn(
                  "whitespace-nowrap rounded-[8px] px-3 py-[6px] text-[12.5px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  isActive
                    ? "bg-surface-inset text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </div>

      {/* RIGHT: account switcher + actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Account switcher pill */}
        <button
          type="button"
          onClick={handleAccountCycle}
          aria-label={`Active account: ${accountLabel}. Click to switch.`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[8px] border border-hairline bg-surface",
            "px-2.5 py-[5px] text-[12px] text-muted-foreground",
            "hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          )}
        >
          <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{accountLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>

        {/* Theme toggle */}
        <IconButton
          label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
          icon={
            theme === "dark"
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />
          }
        />

        {/* Import */}
        <IconButton
          label="Import trades"
          onClick={onImport}
          icon={<Upload className="h-4 w-4" />}
        />

        {/* Export */}
        <IconButton
          label="Export backup"
          onClick={onExport}
          icon={<FileDown className="h-4 w-4" />}
        />

        {/* Settings */}
        <IconButton
          label="Settings"
          onClick={onSettings}
          icon={<Settings className="h-4 w-4" />}
        />
      </div>
    </header>
  );
}

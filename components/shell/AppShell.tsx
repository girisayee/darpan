"use client";

import { useRef, type KeyboardEvent } from "react";
import type { Theme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/common/Logo";
import { OverflowMenu } from "@/components/shell/OverflowMenu";
import { BottomNav } from "@/components/shell/BottomNav";

interface AppShellProps {
  tabs: readonly string[];
  activeTab: string;
  onSelectTab: (tab: string) => void;
  years: string[];
  year: string;
  onYear: (year: string) => void;
  accounts: string[];
  account: string;
  onAccount: (account: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onImport: () => void;
  onSettings: () => void;
  onExport: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}

export function AppShell({
  tabs,
  activeTab,
  onSelectTab,
  years,
  year,
  onYear,
  accounts,
  account,
  onAccount,
  theme,
  onToggleTheme,
  onImport,
  onSettings,
  onExport,
  user,
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

  return (
    <>
      <header className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-3">
        {/* LEFT: logo + nav pills (desktop only) */}
        <div className="flex items-center gap-3.5">
          <Logo size={30} showWordmark />

          {/* Divider */}
          <span aria-hidden="true" className="hidden md:block h-5 w-px bg-hairline" />

          {/* Nav pills — hidden on mobile, shown md+ */}
          <nav
            role="tablist"
            aria-label="Main navigation"
            className="hidden md:flex gap-1"
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
                    "whitespace-nowrap rounded-[8px] px-3.5 py-[6px] text-strong font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-surface-inset hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT: year selector + overflow menu */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Year selector — hidden on very small screens */}
          <div className="hidden sm:block">
            <select
              value={year}
              onChange={(e) => onYear(e.target.value)}
              aria-label="Filter by year"
              className={cn(
                "rounded-[8px] border border-hairline bg-surface",
                "px-2.5 py-[5px] text-body text-muted-foreground",
                "hover:text-foreground transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              )}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Overflow menu (account switch, theme, import, export, settings) */}
          <OverflowMenu
            accounts={accounts}
            account={account}
            onAccount={onAccount}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onImport={onImport}
            onExport={onExport}
            onSettings={onSettings}
            user={user}
          />
        </div>
      </header>

      {/* Bottom nav — only visible on mobile (md:hidden is inside BottomNav) */}
      <BottomNav tabs={tabs} activeTab={activeTab} onSelectTab={onSelectTab} />
    </>
  );
}

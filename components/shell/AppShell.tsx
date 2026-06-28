"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import type { Theme } from "@/lib/theme/use-theme";
import type { TradingAccount } from "@/types/trading";
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
  accounts: TradingAccount[];
  selectedAccountIds: string[];
  onSelectAccounts: (ids: string[]) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onImport: () => void;
  onSettings: () => void;
  onExport: () => void;
  onManageEntries: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}

/** Always-visible multi-select account filter. Empty selection = all accounts. */
function AccountSelect({
  accounts,
  selected,
  onChange,
}: {
  accounts: TradingAccount[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const allMode = selected.length === 0;
  const labelText = allMode
    ? "All accounts"
    : selected.length === 1
      ? (accounts.find((a) => a.id === selected[0])?.name ?? "1 account")
      : `${selected.length} accounts`;

  function toggle(id: string) {
    if (allMode) {
      onChange([id]);
      return;
    }
    const set = new Set(selected);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = [...set];
    onChange(next.length === accounts.length ? [] : next);
  }

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-[8px] border border-hairline bg-surface px-2.5 py-[5px] text-body text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-details-marker]:hidden">
        {labelText}
        <ChevronDown className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute right-0 z-50 mt-1 w-56 rounded-[10px] border border-hairline bg-surface p-1 shadow-lg">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-body hover:bg-accent/[0.06]",
            allMode ? "text-accent" : "text-muted-foreground hover:text-foreground"
          )}
        >
          All accounts {allMode && <Check className="h-3.5 w-3.5" />}
        </button>
        {accounts.length > 0 && <div className="my-1 border-t border-hairline-soft" />}
        {accounts.map((a) => (
          <label
            key={a.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-body text-muted-foreground hover:bg-accent/[0.06] hover:text-foreground"
          >
            <input
              type="checkbox"
              checked={!allMode && selected.includes(a.id)}
              onChange={() => toggle(a.id)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span className="truncate">{a.name}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export function AppShell({
  tabs,
  activeTab,
  onSelectTab,
  years,
  year,
  onYear,
  accounts,
  selectedAccountIds,
  onSelectAccounts,
  theme,
  onToggleTheme,
  onImport,
  onSettings,
  onExport,
  onManageEntries,
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
          <nav role="tablist" aria-label="Main navigation" className="hidden md:flex gap-1">
            {tabs.map((tab, index) => {
              const isActive = tab === activeTab;
              return (
                <button
                  key={tab}
                  ref={(el) => {
                    buttonRefs.current[index] = el;
                  }}
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

        {/* RIGHT: account selector + year selector + overflow menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:block">
            <AccountSelect accounts={accounts} selected={selectedAccountIds} onChange={onSelectAccounts} />
          </div>
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
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Overflow menu (theme, import, export, settings, sign out) */}
          <OverflowMenu
            theme={theme}
            onToggleTheme={onToggleTheme}
            onImport={onImport}
            onExport={onExport}
            onSettings={onSettings}
            onManageEntries={onManageEntries}
            user={user}
          />
        </div>
      </header>

      {/* Bottom nav — only visible on mobile (md:hidden is inside BottomNav) */}
      <BottomNav tabs={tabs} activeTab={activeTab} onSelectTab={onSelectTab} />
    </>
  );
}

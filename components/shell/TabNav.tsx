"use client";

import { cn } from "@/lib/utils/cn";

interface TabNavProps {
  tabs: readonly string[];
  active: string;
  onSelect: (tab: string) => void;
}

export function TabNav({ tabs, active, onSelect }: TabNavProps) {
  return (
    <nav
      role="tablist"
      aria-label="Main navigation"
      className="flex overflow-x-auto border-b border-hairline"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="flex flex-nowrap items-stretch gap-0">
        {tabs.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab)}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-4 py-[10px]",
                "font-sans text-[13px] font-medium transition-colors duration-[140ms]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:rounded-sm",
                isActive
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-brand after:rounded-t-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import { useRef, KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";

interface TabNavProps {
  tabs: readonly string[];
  active: string;
  onSelect: (tab: string) => void;
  panelId?: string;
}

export function TabNav({ tabs, active, onSelect, panelId }: TabNavProps) {
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
      onSelect(tabs[next]);
      buttonRefs.current[next]?.focus();
    }
  }

  return (
    <nav
      role="tablist"
      aria-label="Main navigation"
      className="flex overflow-x-auto border-b border-hairline"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="flex flex-nowrap items-stretch gap-0">
        {tabs.map((tab, index) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              ref={(el) => { buttonRefs.current[index] = el; }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              aria-controls={panelId}
              onClick={() => onSelect(tab)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-4 py-[10px]",
                "font-sans transition-colors duration-[140ms]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:rounded-sm",
                isActive
                  ? "text-[13.5px] font-[500] text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px] after:bg-accent after:rounded-t-sm"
                  : "text-[13.5px] font-[400] text-muted-foreground hover:text-foreground"
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

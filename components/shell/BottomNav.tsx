"use client";
import { LayoutGrid, LineChart, Trophy, Layers } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home: LayoutGrid, Performance: LineChart, Tickers: Trophy, Positions: Layers,
};

export function BottomNav({ tabs, activeTab, onSelectTab }: { tabs: readonly string[]; activeTab: string; onSelectTab: (t: string) => void; }) {
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface md:hidden">
      {tabs.map((tab) => {
        const Icon = ICONS[tab] ?? LayoutGrid;
        const active = tab === activeTab;
        return (
          <button key={tab} type="button" onClick={() => onSelectTab(tab)} aria-current={active ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center gap-1 py-2 text-micro", active ? "text-accent" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />
            {tab}
          </button>
        );
      })}
    </nav>
  );
}

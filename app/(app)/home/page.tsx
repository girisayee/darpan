"use client";

import { useRouter } from "next/navigation";
import { HomeTab } from "@/components/dashboard/tabs/HomeTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";
import type { StrategyTarget } from "@/components/dashboard/StrategyStrip";

function positionsHref(k: StrategyTarget) {
  if (k === "swing") return "/positions?view=swing";
  if (k === "options") return "/positions?view=options";
  return `/positions?view=options&strategy=${k}`;
}

export default function HomePage() {
  const d = useDashboard();
  const router = useRouter();
  return (
    <HomeTab
      result={d.result}
      settings={d.settings}
      year={d.year}
      onOpenStrategy={(k) => router.push(positionsHref(k))}
      onOpenPositions={() => router.push("/positions")}
      onSelectEvent={d.onSelectEvent}
      onSelectLifecycle={d.onSelectLifecycle}
    />
  );
}

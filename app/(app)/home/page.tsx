"use client";

import { useRouter } from "next/navigation";
import { HomeTab } from "@/components/dashboard/tabs/HomeTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";
import type { StrategyKey } from "@/lib/selectors/strategy-analytics";

function positionsHref(k: StrategyKey) {
  return k === "swing" ? "/positions?view=swing" : `/positions?view=options&strategy=${k}`;
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

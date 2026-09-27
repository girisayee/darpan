"use client";

import { HomeTab } from "@/components/dashboard/tabs/HomeTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function HomePage() {
  const d = useDashboard();
  return (
    <HomeTab
      result={d.result}
      settings={d.settings}
      year={d.year}
    />
  );
}

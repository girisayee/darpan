"use client";

import { PerformanceTab } from "@/components/dashboard/tabs/PerformanceTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function MonthlyPage() {
  const d = useDashboard();
  return (
    <PerformanceTab
      result={d.result}
      settings={d.settings}
      year={d.year}
      dataLoaded={d.dataLoaded}
      onSelectEvent={d.onSelectEvent}
      onSelectLifecycle={d.onSelectLifecycle}
    />
  );
}

"use client";

import { PositionsTab } from "@/components/dashboard/tabs/PositionsTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function PositionsPage() {
  const d = useDashboard();
  return (
    <PositionsTab
      result={d.result}
      allYearsResult={d.allYearsResult}
      settings={d.settings}
      year={d.year}
      onReviewFix={d.openReviewFix}
      onSelectEvent={d.onSelectEvent}
      onSelectLifecycle={d.onSelectLifecycle}
    />
  );
}

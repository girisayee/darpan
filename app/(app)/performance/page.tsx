"use client";

import { PerformanceTab } from "@/components/dashboard/tabs/PerformanceTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function PerformancePage() {
  const d = useDashboard();
  return <PerformanceTab result={d.result} settings={d.settings} />;
}

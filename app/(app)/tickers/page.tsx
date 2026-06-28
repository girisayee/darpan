"use client";

import { TickersTab } from "@/components/dashboard/tabs/TickersTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function TickersPage() {
  const d = useDashboard();
  return <TickersTab result={d.result} onSelectSymbol={d.onSelectSymbol} settings={d.settings} />;
}

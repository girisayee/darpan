"use client";

import { TaxesTab } from "@/components/dashboard/tabs/TaxesTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function TaxesPage() {
  const dashboard = useDashboard();
  return (
    <TaxesTab
      settings={dashboard.settings}
      year={dashboard.year}
      selectedAccountIds={dashboard.selectedAccountIds}
      transactions={dashboard.storedTransactions}
      accounts={dashboard.accounts}
      onChangeSettings={dashboard.updateSettings}
      onReviewIssues={dashboard.openReviewFix}
    />
  );
}

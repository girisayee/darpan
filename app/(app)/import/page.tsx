"use client";

import { ImportTab } from "@/components/dashboard/tabs/ImportTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function ImportPage() {
  const d = useDashboard();
  return (
    <ImportTab
      existing={d.storedTransactions}
      onSave={(rows) => d.replaceTransactions([...d.storedTransactions, ...rows])}
      accounts={d.accounts}
      defaultAccountId={d.defaultAccountId}
      onCreateAccount={d.createAccount}
    />
  );
}

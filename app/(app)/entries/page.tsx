"use client";

import { EntriesAdmin } from "@/components/dashboard/EntriesAdmin";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function EntriesPage() {
  const d = useDashboard();
  return (
    <EntriesAdmin
      transactions={d.storedTransactions}
      accounts={d.accounts}
      onUpdate={d.updateTransaction}
      onDelete={d.deleteTransaction}
    />
  );
}

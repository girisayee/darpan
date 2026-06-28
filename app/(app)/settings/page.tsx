"use client";

import { SettingsTab } from "@/components/dashboard/tabs/SettingsTab";
import { useDashboard } from "@/components/dashboard/DashboardShell";

export default function SettingsPage() {
  const d = useDashboard();
  return (
    <SettingsTab
      settings={d.settings}
      onChange={d.updateSettings}
      accounts={d.accounts}
      onCreateAccount={d.createAccount}
      onRenameAccount={d.renameAccount}
      onDeleteAccount={d.deleteAccount}
    />
  );
}

"use client";

import { useState } from "react";
import { label } from "@/components/dashboard/tabs/shared";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AppSettings, TradingAccount } from "@/types/trading";

export function SettingsTab({
  settings,
  onChange,
  accounts,
  onCreateAccount,
  onRenameAccount,
  onDeleteAccount,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  accounts: TradingAccount[];
  onCreateAccount: (name: string) => void;
  onRenameAccount: (id: string, name: string) => void;
  onDeleteAccount: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingsPanel title="General">
        <Toggle
          label="Include fees in P&L"
          checked={settings.includeFees}
          onChange={(checked) => onChange({ ...settings, includeFees: checked })}
        />
        <Toggle
          label="Annualized return"
          checked={settings.annualizedReturn}
          onChange={(checked) =>
            onChange({ ...settings, annualizedReturn: checked })
          }
        />
        <Toggle
          label="Show open stock positions"
          checked={settings.showSwingOpenPositions}
          onChange={(checked) =>
            onChange({ ...settings, showSwingOpenPositions: checked })
          }
        />
        <Toggle
          label="Track against goal"
          checked={settings.trackAgainstGoal ?? true}
          onChange={(checked) => onChange({ ...settings, trackAgainstGoal: checked })}
        />
        <label className="grid gap-1">
          <span className="font-sans text-caption text-muted-foreground">
            Annual realized P&amp;L goal
          </span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-body tabular-nums text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.annualRealizedPnlGoal}
              onChange={(event) =>
                onChange({
                  ...settings,
                  annualRealizedPnlGoal: Math.max(0, Number(event.target.value) || 0),
                })
              }
              className="h-10 w-full bg-transparent px-2 font-sans text-strong tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-caption tabular-nums text-muted-foreground">
            Monthly pace: {formatCurrency(settings.annualRealizedPnlGoal / 12)}
          </span>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-caption text-muted-foreground">
            Max buying power
          </span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-body tabular-nums text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.maxBuyingPower ?? 125000}
              onChange={(event) =>
                onChange({
                  ...settings,
                  maxBuyingPower: Math.max(0, Number(event.target.value) || 0),
                })
              }
              className="h-10 w-full bg-transparent px-2 font-sans text-strong tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-caption tabular-nums text-muted-foreground">
            Used for buying-power utilization
          </span>
        </label>
        <div className="grid gap-1">
          <span className="font-sans text-caption text-muted-foreground">Cost basis method</span>
          <Segmented
            value={settings.costBasisMethod}
            values={["FIFO", "LIFO", "AVERAGE"]}
            onChange={(value) =>
              onChange({ ...settings, costBasisMethod: value as AppSettings["costBasisMethod"] })
            }
          />
        </div>
      </SettingsPanel>
      <SettingsPanel title="Capital Calculation">
        <label className="grid gap-1">
          <span className="font-sans text-caption text-muted-foreground">
            Covered call denominator
          </span>
          <Select
            value={settings.coveredCallDenominator}
            onChange={(value) =>
              onChange({
                ...settings,
                coveredCallDenominator: value as AppSettings["coveredCallDenominator"],
              })
            }
          >
            <option value="UNDERLYING_COST_BASIS">Underlying stock cost basis</option>
            <option value="CURRENT_MARKET_VALUE">Current market value if available</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-caption text-muted-foreground">
            Cash-secured put denominator
          </span>
          <Select
            value={settings.cashSecuredPutDenominator}
            onChange={(value) =>
              onChange({
                ...settings,
                cashSecuredPutDenominator: value as AppSettings["cashSecuredPutDenominator"],
              })
            }
          >
            <option value="CONSERVATIVE_COLLATERAL">Conservative collateral: strike * shares</option>
            <option value="NET_COLLATERAL_AFTER_PREMIUM">Net collateral after premium</option>
          </Select>
        </label>
      </SettingsPanel>
      <div className="lg:col-span-2">
        <ManageAccountsPanel
          accounts={accounts}
          onCreate={onCreateAccount}
          onRename={onRenameAccount}
          onDelete={onDeleteAccount}
        />
      </div>
    </div>
  );
}

function ManageAccountsPanel({
  accounts,
  onCreate,
  onRename,
  onDelete,
}: {
  accounts: TradingAccount[];
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  return (
    <SettingsPanel title="Accounts">
      <p className="font-sans text-[11.5px] text-muted-foreground">
        Broker accounts your trades belong to. The default account can be renamed but not deleted; deleting another
        account moves its trades to the default.
      </p>
      <div className="space-y-2">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} onRename={onRename} onDelete={onDelete} />
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New account name"
          className="h-9 flex-1 rounded-md border border-hairline bg-surface px-3 font-sans text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => {
            const n = newName.trim();
            if (n) {
              onCreate(n);
              setNewName("");
            }
          }}
          className="h-9 rounded-md border border-hairline bg-surface px-3 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add account
        </button>
      </div>
    </SettingsPanel>
  );
}

function AccountRow({
  account,
  onRename,
  onDelete,
}: {
  account: TradingAccount;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(account.name);
  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const n = name.trim();
          if (n && n !== account.name) onRename(account.id, n);
          else setName(account.name);
        }}
        className="h-9 flex-1 rounded-md border border-hairline bg-surface px-3 font-sans text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      {account.isDefault ? (
        <span className="rounded-full bg-accent/15 px-2.5 py-1 font-sans text-[10.5px] font-medium text-accent">
          Default
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onDelete(account.id)}
          className="rounded-md border border-neg/30 px-3 py-1.5 font-sans text-[12px] font-medium text-neg transition-colors hover:bg-neg/10"
        >
          Delete
        </button>
      )}
    </div>
  );
}

function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-hairline bg-surface p-4">
      <h2 className="font-sans text-strong font-medium text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label: toggleLabel,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-3 py-2.5 transition-colors hover:bg-surface-inset">
      <span className="font-sans text-body text-foreground">
        {toggleLabel}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent focus-visible:ring-2 focus-visible:ring-accent/40"
      />
    </label>
  );
}

function Segmented({
  value,
  values,
  onChange,
}: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="grid rounded-md border border-hairline bg-surface-inset p-1"
      style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}
    >
      {values.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            "rounded px-3 py-2 font-sans text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            value === item
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label(item)}
        </button>
      ))}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-hairline bg-surface px-3 font-sans text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
    </select>
  );
}

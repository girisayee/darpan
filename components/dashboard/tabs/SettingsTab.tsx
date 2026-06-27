"use client";

import { label } from "@/components/dashboard/tabs/shared";
import { ManualEntryCard } from "@/components/dashboard/ReviewFixPanel";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AppSettings, TradeTransaction } from "@/types/trading";

export function SettingsTab({
  settings,
  onChange,
  manualTransactions,
  onUpdateTransaction,
  onDeleteTransaction,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  manualTransactions: TradeTransaction[];
  onUpdateTransaction: (updated: TradeTransaction) => void;
  onDeleteTransaction: (id: string) => void;
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
          label="Show open swing positions"
          checked={settings.showSwingOpenPositions}
          onChange={(checked) =>
            onChange({ ...settings, showSwingOpenPositions: checked })
          }
        />
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Annual realized P&amp;L goal
          </span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">$</span>
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
              className="h-10 w-full bg-transparent px-2 font-sans text-[13px] tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
            Monthly pace: {formatCurrency(settings.annualRealizedPnlGoal / 12)}
          </span>
        </label>
        <label className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            Max buying power
          </span>
          <div className="flex items-center rounded-md border border-hairline bg-surface px-3 focus-within:ring-2 focus-within:ring-accent/40">
            <span className="font-sans text-[12px] tabular-nums text-muted-foreground">$</span>
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
              className="h-10 w-full bg-transparent px-2 font-sans text-[13px] tabular-nums text-foreground outline-none"
            />
          </div>
          <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
            Used for buying-power utilization
          </span>
        </label>
        <div className="grid gap-1">
          <span className="font-sans text-[11.5px] text-muted-foreground">Cost basis method</span>
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
          <span className="font-sans text-[11.5px] text-muted-foreground">
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
          <span className="font-sans text-[11.5px] text-muted-foreground">
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
        <SettingsPanel title="Manual entries">
          {manualTransactions.length === 0 ? (
            <p className="font-sans text-[12px] text-muted-foreground">
              No manually-added transactions yet.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="font-sans text-[11.5px] text-muted-foreground">
                {manualTransactions.length} manually-added transaction{manualTransactions.length !== 1 ? "s" : ""}.
              </p>
              {manualTransactions.map((tx) => (
                <ManualEntryCard
                  key={tx.id}
                  tx={tx}
                  onUpdate={onUpdateTransaction}
                  onDelete={onDeleteTransaction}
                />
              ))}
            </div>
          )}
        </SettingsPanel>
      </div>
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
      <h2 className="font-sans text-[13px] font-medium text-foreground">
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
      <span className="font-sans text-[12.5px] text-foreground">
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
            "rounded px-3 py-2 font-sans text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
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
      className="h-10 rounded-md border border-hairline bg-surface px-3 font-sans text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
    </select>
  );
}

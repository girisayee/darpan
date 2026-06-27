"use client";
import { ChevronDown, FileDown, LogOut, Moon, Settings, Sun, Upload, MoreHorizontal } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import type { Theme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";

export function OverflowMenu(props: {
  accounts: string[]; account: string; onAccount: (a: string) => void;
  theme: Theme; onToggleTheme: () => void;
  onImport: () => void; onExport: () => void; onSettings: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-strong text-muted-foreground hover:bg-accent/[0.06] hover:text-foreground";
  return (
    <div className="relative">
      <button type="button" aria-label="More" onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/40">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-56 rounded-[12px] border border-hairline bg-surface py-1 shadow-lg">
            {props.user?.email && (
              <>
                <div className="px-3 py-2 text-body text-muted-foreground truncate">{props.user.email}</div>
                <div className="my-1 border-t border-hairline-soft" />
              </>
            )}
            <div className="px-3 py-1.5 text-micro uppercase tracking-wide text-dim">Account</div>
            {props.accounts.map((a) => (
              <button key={a} role="menuitemradio" aria-checked={a === props.account} className={cn(item, a === props.account && "text-foreground")}
                onClick={() => { props.onAccount(a); setOpen(false); }}>
                {a === "ALL" ? "All accounts" : a}
              </button>
            ))}
            <div className="my-1 border-t border-hairline-soft" />
            <button className={item} onClick={() => { props.onToggleTheme(); }}>
              {props.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {props.theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button className={item} onClick={() => { props.onImport(); setOpen(false); }}><Upload className="h-4 w-4" />Import trades</button>
            <button className={item} onClick={() => { props.onExport(); setOpen(false); }}><FileDown className="h-4 w-4" />Export backup</button>
            <button className={item} onClick={() => { props.onSettings(); setOpen(false); }}><Settings className="h-4 w-4" />Settings</button>
            {props.user && (
              <>
                <div className="my-1 border-t border-hairline-soft" />
                <button className={item} onClick={() => signOut({ callbackUrl: "/signin" })}>
                  <LogOut className="h-4 w-4" />Sign out
                </button>
              </>
            )}
            <ChevronDown className="hidden" />
          </div>
        </>
      )}
    </div>
  );
}

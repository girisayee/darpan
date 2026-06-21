"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Leaderboard, LeaderboardRow } from "@/lib/selectors/leaderboard";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";

function Row({ r }: { r: LeaderboardRow }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-hairline-soft py-2 last:border-0">
      <TickerLogo symbol={r.symbol} size={22} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-foreground">{r.symbol}</div>
        <div className="text-[10px] text-muted-foreground">
          {r.winRate != null ? `${Math.round(r.winRate)}% win` : "—"} · {r.trades} trades
        </div>
      </div>
      <div className="text-right">
        <div className="text-[12px] font-medium tabular-nums">{signedMoney(r.pnl)}</div>
        <div className="text-[10px] tabular-nums">{signedPercent(r.roiPercent)}</div>
      </div>
    </div>
  );
}

function Panel({ title, icon, rows, empty }: { title: string; icon: React.ReactNode; rows: LeaderboardRow[]; empty: string }) {
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">{icon}{title}</div>
      {rows.length ? rows.map((r) => <Row key={r.symbol} r={r} />) : <p className="py-3 text-[11px] text-muted-foreground">{empty}</p>}
    </div>
  );
}

export function LeaderboardPanels({ data }: { data: Leaderboard }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel title="Money makers" icon={<ArrowUpRight className="h-3.5 w-3.5 text-pos" />} rows={data.winners} empty="No winners yet." />
      <Panel title="Account killers" icon={<ArrowDownRight className="h-3.5 w-3.5 text-neg" />} rows={data.losers} empty="No losers — clean run." />
    </div>
  );
}

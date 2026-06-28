"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Leaderboard, LeaderboardRow } from "@/lib/selectors/leaderboard";
import { TickerLogo } from "@/components/common/TickerLogo";
import { signedMoney, signedPercent } from "@/components/dashboard/tabs/shared";

function Row({ r, maskAmounts }: { r: LeaderboardRow; maskAmounts: boolean }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-hairline-soft py-2 last:border-0">
      <TickerLogo symbol={r.symbol} size={20} />
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-foreground">{r.symbol}</div>
        <div className="text-caption text-muted-foreground">
          {r.winRate != null ? `${Math.round(r.winRate)}% win` : "—"} · {r.trades} trades
        </div>
      </div>
      <div className="text-right">
        <div className="text-body font-medium tabular-nums">{signedMoney(r.pnl, maskAmounts)}</div>
        <div className="text-caption tabular-nums">{signedPercent(r.peakRoiPercent)}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  rows,
  empty,
  maskAmounts,
}: {
  title: string;
  icon: React.ReactNode;
  rows: LeaderboardRow[];
  empty: string;
  maskAmounts: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-caption font-medium uppercase tracking-wide">{icon}{title}</div>
      {rows.length ? rows.map((r) => <Row key={r.symbol} r={r} maskAmounts={maskAmounts} />) : <p className="py-3 text-caption text-muted-foreground">{empty}</p>}
    </div>
  );
}

export function LeaderboardPanels({ data, maskAmounts = false }: { data: Leaderboard; maskAmounts?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel title="Money makers" icon={<ArrowUpRight className="h-3.5 w-3.5 text-pos" />} rows={data.winners} empty="No winners yet." maskAmounts={maskAmounts} />
      <Panel title="Account killers" icon={<ArrowDownRight className="h-3.5 w-3.5 text-neg" />} rows={data.losers} empty="No losers — clean run." maskAmounts={maskAmounts} />
    </div>
  );
}

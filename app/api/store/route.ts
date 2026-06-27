import { NextResponse } from "next/server";
import type { AppSettings, TradeTransaction } from "@/types/trading";
import { clearDbData, getDbSettings, listDbTransactions, replaceDbTransactions, saveDbSettings } from "@/lib/db/database";

export const runtime = "nodejs";

const DEV_USER = "dev-user";

export async function GET() {
  const [txns, s] = await Promise.all([listDbTransactions(DEV_USER), getDbSettings(DEV_USER)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { transactions?: TradeTransaction[]; settings?: AppSettings };
  if (Array.isArray(body.transactions)) await replaceDbTransactions(DEV_USER, body.transactions);
  if (body.settings) await saveDbSettings(DEV_USER, body.settings);
  const [txns, s] = await Promise.all([listDbTransactions(DEV_USER), getDbSettings(DEV_USER)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function DELETE() {
  await clearDbData(DEV_USER);
  return NextResponse.json({ transactions: [], settings: await getDbSettings(DEV_USER) });
}

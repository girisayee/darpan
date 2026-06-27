import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AppSettings, TradeTransaction } from "@/types/trading";
import { clearDbData, getDbSettings, listDbTransactions, replaceDbTransactions, saveDbSettings } from "@/lib/db/database";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const [txns, s] = await Promise.all([listDbTransactions(userId), getDbSettings(userId)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const body = (await request.json()) as { transactions?: TradeTransaction[]; settings?: AppSettings };
  if (Array.isArray(body.transactions)) await replaceDbTransactions(userId, body.transactions);
  if (body.settings) await saveDbSettings(userId, body.settings);
  const [txns, s] = await Promise.all([listDbTransactions(userId), getDbSettings(userId)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  await clearDbData(userId);
  return NextResponse.json({ transactions: [], settings: await getDbSettings(userId) });
}

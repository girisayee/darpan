import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createTradingAccount, ensureDefaultAccount, listTradingAccounts } from "@/lib/db/database";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  await ensureDefaultAccount(userId); // lazy create for new/existing users
  return NextResponse.json({ accounts: await listTradingAccounts(userId) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const body = (await request.json()) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name) return new Response("Name required", { status: 400 });
  await createTradingAccount(userId, name);
  return NextResponse.json({ accounts: await listTradingAccounts(userId) });
}

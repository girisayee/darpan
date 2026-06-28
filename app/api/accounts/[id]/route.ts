import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteTradingAccount, listTradingAccounts, renameTradingAccount } from "@/lib/db/database";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const body = (await request.json()) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name) return new Response("Name required", { status: 400 });
  await renameTradingAccount(userId, id, name);
  return NextResponse.json({ accounts: await listTradingAccounts(userId) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  try {
    await deleteTradingAccount(userId, id);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Cannot delete account", { status: 400 });
  }
  return NextResponse.json({ accounts: await listTradingAccounts(userId) });
}

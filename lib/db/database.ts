import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transactions, settings } from "@/lib/db/schema";
import { defaultSettings } from "@/lib/storage/local-store";
import type { AppSettings, TradeTransaction } from "@/types/trading";

export async function listDbTransactions(userId: string): Promise<TradeTransaction[]> {
  const rows = await db
    .select({ payload: transactions.payload })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(transactions.tradeDate);
  return rows.map((r) => r.payload as TradeTransaction);
}

export async function replaceDbTransactions(userId: string, txns: TradeTransaction[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    if (txns.length) {
      await tx.insert(transactions).values(
        txns.map((t) => ({
          id: t.id,
          userId,
          payload: t,
          tradeDate: t.tradeDate,
          symbol: t.symbol,
          status: t.status,
          importBatchId: t.importBatchId,
        }))
      );
    }
  });
}

export async function getDbSettings(userId: string): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  if (!rows.length) return { ...defaultSettings, showSampleData: false };
  return { ...defaultSettings, showSampleData: false, ...(rows[0].value as Partial<AppSettings>) };
}

export async function saveDbSettings(userId: string, s: AppSettings): Promise<void> {
  const value = { ...s, showSampleData: false };
  await db
    .insert(settings)
    .values({ userId, value })
    .onConflictDoUpdate({ target: settings.userId, set: { value, updatedAt: new Date() } });
}

export async function clearDbData(userId: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await saveDbSettings(userId, { ...defaultSettings, showSampleData: false });
}

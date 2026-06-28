import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transactions, tradingAccounts, settings } from "@/lib/db/schema";
import { defaultSettings } from "@/lib/storage/local-store";
import { stampCreatedAt } from "@/lib/entries/entry-meta";
import type { AppSettings, TradeTransaction, TradingAccount } from "@/types/trading";

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
      // "Date added" must live in the payload: this rewrites all rows on every
      // save and the DB updatedAt resets each time, so stamp createdAt once here
      // (preserving any existing value) — the single choke point for import,
      // manual-add, and edits.
      const now = new Date().toISOString();
      await tx.insert(transactions).values(
        txns.map((raw) => {
          const t = stampCreatedAt(raw, now);
          return {
            id: t.id,
            userId,
            accountId: t.accountId ?? null,
            payload: t,
            tradeDate: t.tradeDate,
            symbol: t.symbol,
            status: t.status,
            importBatchId: t.importBatchId,
          };
        })
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

// ── Trading accounts ─────────────────────────────────────────────────────────

function toAccount(row: { id: string; name: string; isDefault: boolean }): TradingAccount {
  return { id: row.id, name: row.name, isDefault: row.isDefault };
}

export async function listTradingAccounts(userId: string): Promise<TradingAccount[]> {
  const rows = await db
    .select({ id: tradingAccounts.id, name: tradingAccounts.name, isDefault: tradingAccounts.isDefault })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId))
    .orderBy(desc(tradingAccounts.isDefault), tradingAccounts.name);
  return rows.map(toAccount);
}

/** Guarantee the user has a default account; create "Main account" if none exist. Returns it. */
export async function ensureDefaultAccount(userId: string): Promise<TradingAccount> {
  const existing = await listTradingAccounts(userId);
  const current = existing.find((a) => a.isDefault) ?? existing[0];
  if (current) return current;
  const [created] = await db
    .insert(tradingAccounts)
    .values({ userId, name: "Main account", isDefault: true })
    .returning({ id: tradingAccounts.id, name: tradingAccounts.name, isDefault: tradingAccounts.isDefault });
  return toAccount(created);
}

export async function createTradingAccount(userId: string, name: string): Promise<TradingAccount> {
  const [row] = await db
    .insert(tradingAccounts)
    .values({ userId, name: name.trim() || "Account", isDefault: false })
    .returning({ id: tradingAccounts.id, name: tradingAccounts.name, isDefault: tradingAccounts.isDefault });
  return toAccount(row);
}

export async function renameTradingAccount(userId: string, id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  await db
    .update(tradingAccounts)
    .set({ name: clean })
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)));
}

/** Delete a non-default account, reassigning its transactions to the default. */
export async function deleteTradingAccount(userId: string, id: string): Promise<void> {
  const [acct] = await db
    .select({ id: tradingAccounts.id, isDefault: tradingAccounts.isDefault })
    .from(tradingAccounts)
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)))
    .limit(1);
  if (!acct) return;
  if (acct.isDefault) throw new Error("Cannot delete the default account.");
  const def = await ensureDefaultAccount(userId);
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        accountId: def.id,
        payload: sql`jsonb_set(payload, '{accountId}', to_jsonb(${def.id}::text), true)`,
      })
      .where(and(eq(transactions.userId, userId), eq(transactions.accountId, id)));
    await tx.delete(tradingAccounts).where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)));
  });
}

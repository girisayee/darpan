/**
 * One-off migration: copy transactions + settings from the legacy local SQLite
 * database (data/darpan.sqlite) into Postgres, scoped to a single user.
 *
 * Run with the DB credentials loaded from .env.local:
 *
 *   node --env-file=.env.local --import tsx scripts/migrate-sqlite-to-postgres.ts [email]
 *
 * If no email is passed, the first entry in ALLOWED_EMAILS is used. The target
 * user row is created if it does not yet exist; when the user later signs in
 * with Google, allowDangerousEmailAccountLinking attaches the account to this
 * same row, so the migrated data is already in place.
 *
 * Idempotent: re-running replaces the target user's transactions + settings.
 */
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users, transactions as txTable, settings as settingsTable } from "@/lib/db/schema";
import type { AppSettings, TradeTransaction } from "@/types/trading";

type SqliteDb = {
  prepare: (sql: string) => { all: (...p: unknown[]) => unknown[]; get: (...p: unknown[]) => unknown };
};

function openSqlite(file: string): SqliteDb {
  const sqlite = (globalThis as unknown as {
    process: { getBuiltinModule: (id: string) => unknown };
  }).process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (filename: string) => SqliteDb;
  };
  return new sqlite.DatabaseSync(file);
}

async function main() {
  const targetEmail = (process.argv[2] ?? (process.env.ALLOWED_EMAILS ?? "").split(",")[0] ?? "").trim();
  if (!targetEmail) throw new Error("No target email. Pass one as an argument or set ALLOWED_EMAILS.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (run with --env-file=.env.local).");

  const sqlitePath = path.join(process.cwd(), "data", "darpan.sqlite");
  const sqlite = openSqlite(sqlitePath);

  const txRows = sqlite
    .prepare("SELECT payload FROM transactions ORDER BY trade_date ASC, id ASC")
    .all() as Array<{ payload: string }>;
  const txns = txRows.map((r) => JSON.parse(r.payload) as TradeTransaction);

  const settingsRow = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("app") as
    | { value: string }
    | undefined;
  const settings: AppSettings | null = settingsRow ? (JSON.parse(settingsRow.value) as AppSettings) : null;

  console.log(`SQLite: ${txns.length} transactions, settings ${settings ? "present" : "absent"}`);

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  try {
    // Find-or-create the target user by email.
    const existing = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1);
    let userId: string;
    if (existing.length) {
      userId = existing[0].id;
      console.log(`Using existing user ${targetEmail} (${userId}).`);
    } else {
      const inserted = await db.insert(users).values({ email: targetEmail }).returning({ id: users.id });
      userId = inserted[0].id;
      console.log(`Created user ${targetEmail} (${userId}).`);
    }

    await db.transaction(async (tx) => {
      await tx.delete(txTable).where(eq(txTable.userId, userId));
      if (txns.length) {
        await tx.insert(txTable).values(
          txns.map((t) => ({
            id: t.id,
            userId,
            payload: t,
            tradeDate: t.tradeDate,
            symbol: t.symbol,
            status: t.status,
            importBatchId: t.importBatchId,
          })),
        );
      }
    });

    if (settings) {
      const value = { ...settings, showSampleData: false };
      await db
        .insert(settingsTable)
        .values({ userId, value })
        .onConflictDoUpdate({ target: settingsTable.userId, set: { value, updatedAt: new Date() } });
    }

    const count = await db.select({ id: txTable.id }).from(txTable).where(eq(txTable.userId, userId));
    console.log(`Postgres: user ${targetEmail} now has ${count.length} transactions.`);
  } finally {
    await client.end();
  }
}

main().then(
  () => {
    console.log("Migration complete.");
    process.exit(0);
  },
  (err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  },
);

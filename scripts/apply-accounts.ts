/**
 * One-off, idempotent migration for multi-account support.
 *
 *   npx tsx scripts/apply-accounts.ts
 *
 * 1. Backs up all transactions to data/accounts-backup-<stamp>.json.
 * 2. Additive DDL (IF NOT EXISTS): trading_accounts table + index + FK, and a
 *    nullable transactions.accountId column + FK.
 * 3. Backfill: per user, ensure one isDefault account (named after their most
 *    common existing accountName, fallback "Main account"); set accountId on any
 *    rows still NULL, and mirror accountId into payload.
 *
 * Additive only — never drops or deletes. Safe to re-run.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch {
    /* no .env.local */
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (.env.local).");
  const sql = postgres(url, { prepare: false });

  try {
    // 1) Backup
    const all = await sql`SELECT id, "userId", payload, "tradeDate", symbol, status, "importBatchId" FROM transactions`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(process.cwd(), "data", `accounts-backup-${stamp}.json`);
    writeFileSync(backupPath, JSON.stringify(all, null, 2), "utf8");
    console.log(`Backed up ${all.length} transactions → ${backupPath}`);

    // 2) Additive DDL
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "trading_accounts" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" text NOT NULL,
        "name" text NOT NULL,
        "isDefault" boolean DEFAULT false NOT NULL,
        "createdAt" timestamp DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "trading_accounts_user_idx" ON "trading_accounts" USING btree ("userId");
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "accountId" text;
      DO $$ BEGIN
        ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_userId_user_id_fk"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE cascade;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_trading_accounts_id_fk"
          FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE set null;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("DDL applied (idempotent).");

    // 3) Backfill per user
    const users = await sql<{ userId: string }[]>`SELECT id AS "userId" FROM "user"`;
    for (const { userId } of users) {
      const nameRows = await sql<{ acct: string | null; c: number }[]>`
        SELECT payload->>'accountName' AS acct, count(*)::int AS c
        FROM transactions WHERE "userId" = ${userId}
        GROUP BY payload->>'accountName' ORDER BY c DESC`;
      const defaultName = (nameRows.find((r) => r.acct)?.acct ?? "Main account").trim() || "Main account";

      const existing = await sql<{ id: string }[]>`
        SELECT id FROM trading_accounts WHERE "userId" = ${userId} AND "isDefault" = true LIMIT 1`;
      let accountId: string;
      if (existing.length) {
        accountId = existing[0].id;
      } else {
        const id = randomUUID();
        await sql`INSERT INTO trading_accounts ("id","userId","name","isDefault") VALUES (${id}, ${userId}, ${defaultName}, true)`;
        accountId = id;
        console.log(`  user ${userId}: created default account "${defaultName}" (${accountId})`);
      }

      const res = await sql`
        UPDATE transactions
        SET "accountId" = ${accountId},
            payload = jsonb_set(payload, '{accountId}', to_jsonb(${accountId}::text), true)
        WHERE "userId" = ${userId} AND "accountId" IS NULL`;
      console.log(`  user ${userId}: assigned accountId to ${res.count} transactions`);
    }

    // 4) Verify
    const accts = await sql`SELECT "userId", name, "isDefault" FROM trading_accounts`;
    const nullLeft = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM transactions WHERE "accountId" IS NULL`;
    console.log(`\nAccounts: ${accts.length}; transactions still unassigned: ${nullLeft[0].c}`);
    for (const a of accts) console.log(`  ${a.userId} · ${a.name}${a.isDefault ? " (default)" : ""}`);
  } finally {
    await sql.end();
  }
}

main().then(
  () => {
    console.log("Done.");
    process.exit(0);
  },
  (err) => {
    console.error("FAILED:", err);
    process.exit(1);
  }
);

/**
 * Additive broker CSV importer (out-of-band, bypasses the HTTP/auth layer).
 *
 * Parses a broker CSV with the app's own parser and INSERTS the rows for a
 * user (find-or-create by email). Additive only — it NEVER deletes existing
 * rows, and duplicate ids are skipped (onConflictDoNothing), so it is safe to
 * re-run.
 *
 *   npx tsx scripts/append-transactions-csv.ts <csv-path> [email]
 *
 * With no <csv-path> it just prints the users table + per-user transaction
 * counts (read-only inspection).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users, transactions as txTable } from "../lib/db/schema";
import { parseTransactionsCsv } from "../lib/import/transactions";
import type { TradeTransaction } from "../types/trading";

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
  const csvPath = process.argv[2];
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (expected in .env.local).");

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);
  try {
    // Inspect: list every user + their transaction count.
    const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
    console.log(`Users (${allUsers.length}):`);
    for (const u of allUsers) {
      const c = await db.select({ id: txTable.id }).from(txTable).where(eq(txTable.userId, u.id));
      console.log(`  ${u.email ?? "(no email)"}  ${u.id}  → ${c.length} transactions`);
    }

    if (!csvPath) {
      console.log("No CSV path given — inspection only.");
      return;
    }

    const targetEmail = (process.argv[3] ?? "").trim();
    if (!targetEmail) throw new Error("No target email. Pass one as the 2nd arg.");

    const found = allUsers.find((u) => u.email === targetEmail);
    let userId: string;
    if (found) {
      userId = found.id;
      console.log(`\nTarget: ${targetEmail} (${userId}).`);
    } else {
      const ins = await db.insert(users).values({ email: targetEmail }).returning({ id: users.id });
      userId = ins[0].id;
      console.log(`\nCreated user ${targetEmail} (${userId}).`);
    }

    const existing = (
      await db.select({ payload: txTable.payload }).from(txTable).where(eq(txTable.userId, userId))
    ).map((r) => r.payload as TradeTransaction);
    console.log(`Existing for target: ${existing.length}`);

    const raw = readFileSync(csvPath, "utf8");
    const preview = parseTransactionsCsv(raw, { existing });
    console.log(`Parsed ${preview.rows.length} rows (duplicates flagged: ${preview.duplicateIds.length}).`);
    for (const r of preview.rows) {
      console.log(`  + ${r.tradeDate} ${r.symbol} ${r.action} qty=${r.quantity} status=${r.status}`);
    }
    if (!preview.rows.length) {
      console.log("Nothing to insert.");
      return;
    }

    const inserted = await db
      .insert(txTable)
      .values(
        preview.rows.map((t) => ({
          id: t.id,
          userId,
          payload: t,
          tradeDate: t.tradeDate,
          symbol: t.symbol,
          status: t.status,
          importBatchId: t.importBatchId,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: txTable.id });

    console.log(`Inserted ${inserted.length} new rows (skipped ${preview.rows.length - inserted.length} already present).`);

    const after = await db.select({ id: txTable.id }).from(txTable).where(eq(txTable.userId, userId));
    console.log(`Total now for target: ${after.length}`);
  } finally {
    await client.end();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("FAILED:", err);
    process.exit(1);
  }
);

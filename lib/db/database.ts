import "server-only";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import type { AppSettings, TradeTransaction } from "@/types/trading";
import { defaultSettings } from "@/lib/storage/local-store";

type DatabaseSyncType = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[];
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => unknown;
  };
};

const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "darpan.sqlite");
// Older database filenames, renamed to the current path on first use. Migration only.
const legacyDbPaths = [path.join(dbDir, "positioniq.sqlite"), path.join(dbDir, "realizededge.sqlite")];

let db: DatabaseSyncType | null = null;

function resolveDbPath() {
  if (existsSync(dbPath)) return dbPath;
  const legacy = legacyDbPaths.find((p) => existsSync(p));
  if (!legacy) return dbPath;
  try {
    renameSync(legacy, dbPath);
    return dbPath;
  } catch {
    return legacy;
  }
}

function getDatabase() {
  if (db) return db;
  mkdirSync(dbDir, { recursive: true });
  const sqlite = (globalThis as unknown as { process: { getBuiltinModule: (id: string) => unknown } }).process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (filename: string) => DatabaseSyncType;
  };
  db = new sqlite.DatabaseSync(resolveDbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      trade_date TEXT,
      symbol TEXT,
      status TEXT,
      import_batch_id TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

export function listDbTransactions(): TradeTransaction[] {
  const rows = getDatabase().prepare("SELECT payload FROM transactions ORDER BY trade_date ASC, id ASC").all() as Array<{ payload: string }>;
  return rows.map((row) => JSON.parse(row.payload) as TradeTransaction);
}

export function replaceDbTransactions(transactions: TradeTransaction[]) {
  const database = getDatabase();
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM transactions").run();
    const insert = database.prepare(`
      INSERT INTO transactions (id, payload, trade_date, symbol, status, import_batch_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const transaction of transactions) {
      insert.run(
        transaction.id,
        JSON.stringify(transaction),
        transaction.tradeDate,
        transaction.symbol,
        transaction.status,
        transaction.importBatchId
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getDbSettings(): AppSettings {
  const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get("app") as { value: string } | undefined;
  if (!row) return { ...defaultSettings, showSampleData: false };
  return { ...defaultSettings, showSampleData: false, ...(JSON.parse(row.value) as Partial<AppSettings>) };
}

export function saveDbSettings(settings: AppSettings) {
  getDatabase()
    .prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
    .run("app", JSON.stringify({ ...settings, showSampleData: false }));
}

export function clearDbData() {
  const database = getDatabase();
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM transactions").run();
    saveDbSettings({ ...defaultSettings, showSampleData: false });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

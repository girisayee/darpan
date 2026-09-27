import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  primaryKey,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({ pk: primaryKey({ columns: [vt.identifier, vt.token] }) })
);

// Broker / trading accounts owned by a user (distinct from the Auth.js `account`
// OAuth table above). Every user has exactly one isDefault account.
export const tradingAccounts = pgTable(
  "trading_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("isDefault").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow(),
  },
  (t) => ({ byUser: index("trading_accounts_user_idx").on(t.userId) })
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("accountId").references(() => tradingAccounts.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    tradeDate: text("tradeDate"),
    symbol: text("symbol"),
    status: text("status"),
    importBatchId: text("importBatchId"),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (t) => ({ byUser: index("transactions_user_trade_idx").on(t.userId, t.tradeDate) })
);

export const settings = pgTable(
  "settings",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (table) => ({
    taxEstimateObject: check(
      "settings_tax_estimate_object_check",
      sql`NOT (${table.value} ? 'taxEstimate') OR jsonb_typeof(${table.value}->'taxEstimate') = 'object'`,
    ),
  }),
);

// Global (not per-user) cache of index/ETF close-price series for the benchmark
// comparison. Durable so a transient Alpha Vantage rate-limit always has a
// stale-but-usable fallback, and so a redeploy doesn't lose the cache.
export const benchmarkCache = pgTable("benchmark_cache", {
  symbol: text("symbol").primaryKey(),
  fetchedAt: timestamp("fetchedAt", { mode: "date" }).notNull(),
  points: jsonb("points").notNull(),
});

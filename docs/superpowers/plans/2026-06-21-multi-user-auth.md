# Multi-user Auth & Per-user Portfolios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google SSO (allowlisted) and make every transaction/setting owned by a signed-in user, replacing the local SQLite store with managed Postgres.

**Architecture:** Auth.js v5 (Google provider, Drizzle adapter, **JWT sessions**) on a standard Next.js Node server; Postgres via Drizzle ORM; routes gated server-side via `auth()`; all data queries scoped by `session.user.id`. JWT (not database sessions) because Phase B adds a Credentials provider for the admin, which Auth.js only supports with JWT.

**Tech Stack:** `next-auth@5`, `@auth/drizzle-adapter`, `drizzle-orm`, `drizzle-kit`, `postgres` (postgres-js driver), Postgres, Next.js 16 App Router, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-multi-user-auth-design.md`

## Global Constraints

- Stack is fixed: Auth.js v5, Drizzle ORM, Postgres. SQLite (`node:sqlite`) is removed.
- Sign-in is Google-only and restricted to `ALLOWED_EMAILS` (comma-separated env, case-insensitive).
- Every read/write of `transactions`/`settings` is scoped by `session.user.id`; no endpoint returns another user's rows. Unauthenticated API calls return `401`.
- Self-service only — no advisor/admin roles, account sharing, billing, or broker sync.
- Cloud-agnostic: no Vercel/AWS/Azure-specific code; no Dockerfile in this plan.
- Secrets only via env (`.env.example` documents them); never commit real secrets or `.env`.
- Runtime (real Google OAuth + reachable Postgres) is verified manually in a dev/cloud environment. In this repo, each task verifies with `npm run typecheck`, `npm run lint`, `npm run build`, and (where noted) `npx vitest run`. Tests are Node-env under `tests/`.

## File structure

- `lib/db/schema.ts` (new) — Drizzle tables: auth (`users`,`accounts`,`sessions`,`verificationTokens`) + app (`transactions`,`settings`).
- `lib/db/client.ts` (new) — postgres-js client + `drizzle()` instance.
- `lib/db/database.ts` (rewrite) — user-scoped async query helpers (replaces SQLite).
- `drizzle.config.ts` (new) — drizzle-kit config.
- `lib/auth/allowlist.ts` (new) — `isAllowedEmail` predicate (unit-tested).
- `auth.ts` (new, repo root) — NextAuth config (`handlers/auth/signIn/signOut`).
- `types/next-auth.d.ts` (new) — augment `Session.user.id`.
- `app/api/auth/[...nextauth]/route.ts` (new) — auth route handlers.
- `app/signin/page.tsx` (new) — sign-in screen.
- `app/page.tsx` (modify) — server gate → redirect to `/signin` when unauthenticated.
- `app/api/store/route.ts`, `app/api/import/robinhood/route.ts` (modify) — session-scoped.
- `components/shell/OverflowMenu.tsx`, `components/dashboard/DashboardApp.tsx`, `components/shell/AppShell.tsx` (modify) — surface user + sign-out.
- `lib/storage/local-store.ts` (modify) — drop localStorage data migration (keep `defaultSettings`, backup, theme key).
- `.env.example` (new), `README.md`/`AGENTS.md`/`docs/ARCHITECTURE.md` (modify).

---

## Phase 1 — Postgres + Drizzle data layer

### Task 1: Install deps, Drizzle config, DB client

**Files:** Create `lib/db/client.ts`, `drizzle.config.ts`, `.env.example`. Modify `package.json`.

**Interfaces:** Produces `db` (Drizzle instance) from `@/lib/db/client`, typed against the schema in Task 2.

- [ ] **Step 1: Install dependencies**

```bash
npm install next-auth@^5 @auth/drizzle-adapter drizzle-orm postgres
npm install -D drizzle-kit
```

- [ ] **Step 2: Create the DB client**

```ts
// lib/db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: Create drizzle-kit config**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 4: Create `.env.example`**

```bash
# .env.example
DATABASE_URL=postgres://user:pass@localhost:5432/darpan
AUTH_SECRET=generate-with-`npx auth secret`
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
ALLOWED_EMAILS=you@example.com,teammate@example.com
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
```

- [ ] **Step 5: Verify & commit**

Run: `npm run typecheck` (schema.ts not present yet → `client.ts` import of `./schema` fails; proceed to Task 2 before typecheck passes). Commit after Task 2 compiles.

```bash
git add package.json package-lock.json lib/db/client.ts drizzle.config.ts .env.example
git commit -m "feat(db): add drizzle + postgres client and env scaffolding"
```

### Task 2: Drizzle schema (auth + app tables)

**Files:** Create `lib/db/schema.ts`.

**Interfaces:** Produces `users, accounts, sessions, verificationTokens, transactions, settings` table objects consumed by the adapter (Task 5) and query helpers (Task 3).

- [ ] **Step 1: Write the schema**

```ts
// lib/db/schema.ts
import { pgTable, text, timestamp, integer, jsonb, primaryKey, index } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable("account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
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
}, (a) => ({ pk: primaryKey({ columns: [a.provider, a.providerAccountId] }) }));

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verificationToken", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (vt) => ({ pk: primaryKey({ columns: [vt.identifier, vt.token] }) }));

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  tradeDate: text("tradeDate"),
  symbol: text("symbol"),
  status: text("status"),
  importBatchId: text("importBatchId"),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (t) => ({ byUser: index("transactions_user_trade_idx").on(t.userId, t.tradeDate) }));

export const settings = pgTable("settings", {
  userId: text("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate` → writes SQL to `./drizzle`. (Requires no DB; generates from schema.)

- [ ] **Step 3: Verify & commit**

Run: `npm run typecheck` (now `client.ts` resolves) and `npm run lint`. Expected: pass.

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): drizzle schema for auth + per-user transactions/settings"
```

### Task 3: Rewrite query helpers (user-scoped, async)

**Files:** Rewrite `lib/db/database.ts`. Modify `lib/db/database.ts` consumers in Task 7.

**Interfaces:** Produces async helpers:
`listDbTransactions(userId: string): Promise<TradeTransaction[]>`,
`replaceDbTransactions(userId: string, txns: TradeTransaction[]): Promise<void>`,
`getDbSettings(userId: string): Promise<AppSettings>`,
`saveDbSettings(userId: string, settings: AppSettings): Promise<void>`,
`clearDbData(userId: string): Promise<void>`.

- [ ] **Step 1: Rewrite `lib/db/database.ts`**

```ts
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
```

- [ ] **Step 2: Verify & commit**

Run: `npm run typecheck`. Expected: API route call-sites (still passing the old sync signatures) now error — that's expected; they're fixed in Task 7. To keep the tree compiling between phases, temporarily update the two route files to `await` the helpers with a literal `"dev-user"` id; the real session id lands in Task 7. Then `npm run lint`, `npm run build`.

```bash
git add lib/db/database.ts app/api/store/route.ts app/api/import/robinhood/route.ts
git commit -m "feat(db): user-scoped async query helpers over postgres"
```

---

## Phase 2 — Authentication

### Task 4: Allowlist predicate (TDD)

**Files:** Create `lib/auth/allowlist.ts`, `tests/auth/allowlist.test.ts`.

**Interfaces:** Produces `isAllowedEmail(email: string | null | undefined): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth/allowlist.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAllowedEmail } from "@/lib/auth/allowlist";

describe("isAllowedEmail", () => {
  const original = process.env.ALLOWED_EMAILS;
  beforeEach(() => { process.env.ALLOWED_EMAILS = "Alice@Example.com, bob@x.io"; });
  afterEach(() => { process.env.ALLOWED_EMAILS = original; });

  it("allows a listed email case-insensitively", () => {
    expect(isAllowedEmail("alice@example.com")).toBe(true);
    expect(isAllowedEmail("BOB@X.IO")).toBe(true);
  });
  it("rejects unlisted, empty, and null", () => {
    expect(isAllowedEmail("eve@evil.com")).toBe(false);
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });
  it("rejects everyone when ALLOWED_EMAILS is unset", () => {
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowedEmail("alice@example.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `npx vitest run tests/auth/allowlist.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/auth/allowlist.ts
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run tests/auth/allowlist.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/allowlist.ts tests/auth/allowlist.test.ts
git commit -m "feat(auth): allowlist predicate for sign-in restriction"
```

### Task 5: Auth.js config + route handler + session type

**Files:** Create `auth.ts` (repo root), `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`.

**Interfaces:** Produces `auth`, `signIn`, `signOut`, `handlers` from `@/auth`; `auth()` returns a session whose `session.user.id` is the DB user id.

- [ ] **Step 1: Create `auth.ts`**

```ts
// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db/client";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { isAllowedEmail } from "@/lib/auth/allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ user }) {
      return isAllowedEmail(user.email);
    },
    async jwt({ token, user }) {
      // `user` is present only on first sign-in (from the adapter).
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
```

(JWT session strategy — see Architecture. The adapter still persists Google users in Postgres; the JWT carries the user id. Phase B extends the `jwt`/`session` callbacks with `role`.)

- [ ] **Step 2: Augment the session type**

```ts
// types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```

- [ ] **Step 3: Create the route handler**

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Verify & commit**

Run: `npm run typecheck && npm run lint && npm run build`. Expected: pass (build does not require live OAuth/DB).

```bash
git add auth.ts app/api/auth types/next-auth.d.ts
git commit -m "feat(auth): NextAuth Google + drizzle adapter, allowlist gate, session id"
```

### Task 6: Sign-in screen + server gate

**Files:** Create `app/signin/page.tsx`. Modify `app/page.tsx`.

**Interfaces:** Consumes `auth`, `signIn` from `@/auth`. Produces a `/signin` route and an authenticated `/` that redirects unauthenticated users.

- [ ] **Step 1: Create the sign-in page**

```tsx
// app/signin/page.tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Logo } from "@/components/common/Logo";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex flex-col items-center gap-3">
        <Logo size={44} showWordmark />
        <p className="text-[13px] text-muted-foreground">The mirror for your trades.</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-[10px] border border-hairline bg-surface px-4 py-2.5 text-[13px] font-medium text-foreground hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Continue with Google
        </button>
      </form>
      <p className="text-[11px] text-muted-foreground">Access is invite-only.</p>
    </main>
  );
}
```

- [ ] **Step 2: Gate `app/page.tsx`**

Convert the page to a server component that redirects unauthenticated users, then renders the existing client dashboard. (Read the current `app/page.tsx` first; if it is `"use client"`, move its body into the existing `DashboardApp` client component and make `page.tsx` server-only as below.)

```tsx
// app/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return <DashboardApp />;
}
```

- [ ] **Step 3: Verify & commit**

Run: `npm run typecheck && npm run lint && npm run build`. Expected: pass.

```bash
git add app/signin app/page.tsx
git commit -m "feat(auth): sign-in screen and server-side route gate"
```

---

## Phase 3 — Scope by user + UI

### Task 7: Session-scope the API routes

**Files:** Modify `app/api/store/route.ts`, `app/api/import/robinhood/route.ts`.

**Interfaces:** Consumes `auth` from `@/auth` and the Task 3 helpers. Each handler resolves `session.user.id` or returns `401`.

- [ ] **Step 1: Scope `/api/store`**

Read the current file, then wrap each handler. Pattern for every method:

```ts
import { auth } from "@/auth";
// ...
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const [transactions, settings] = await Promise.all([
    listDbTransactions(userId),
    getDbSettings(userId),
  ]);
  return Response.json({ transactions, settings });
}
```

Apply the same `auth()` guard + `userId` threading to `PUT` (→ `replaceDbTransactions(userId, …)` / `saveDbSettings(userId, …)`) and `DELETE` (→ `clearDbData(userId)`). Remove the temporary `"dev-user"` literal from Task 3.

- [ ] **Step 2: Scope `/api/import/robinhood`**

Same guard; thread `userId` into the import write (`replaceDbTransactions` / append path).

- [ ] **Step 3: Verify & commit**

Run: `npm run typecheck && npm run lint && npm run build`. Expected: pass.

```bash
git add app/api/store/route.ts app/api/import/robinhood/route.ts
git commit -m "feat(auth): scope store + import endpoints to the signed-in user"
```

### Task 8: User menu + sign-out; drop localStorage data migration

**Files:** Modify `components/dashboard/DashboardApp.tsx`, `components/shell/AppShell.tsx`, `components/shell/OverflowMenu.tsx`, `lib/storage/local-store.ts`.

**Interfaces:** Consumes the session user (name/email/image). Produces a visible signed-in identity + a working sign-out in the `⋯` menu.

- [ ] **Step 1: Pass the user down**

In `app/page.tsx`, pass `user={{ name, email, image }}` from `session.user` into `DashboardApp`; thread it through `AppShell` into `OverflowMenu` as a `user` prop (type `{ name?: string | null; email?: string | null; image?: string | null }`).

- [ ] **Step 2: Render identity + sign-out in `OverflowMenu`**

Add, above the existing menu items, a non-interactive header row showing the user's email (and avatar if `image`), then a divider, then a sign-out item:

```tsx
"use client";
import { signOut } from "next-auth/react";
// ...inside the menu, first item group:
<div className="px-3 py-2 text-[12px] text-muted-foreground truncate">{user?.email}</div>
<div className="my-1 border-t border-hairline-soft" />
<button className={item} onClick={() => signOut({ callbackUrl: "/signin" })}>
  <i className="..." /> Sign out
</button>
```

(Use the existing `item` class pattern already in `OverflowMenu`.)

- [ ] **Step 3: Drop localStorage data migration in `local-store.ts`**

Remove `loadTransactions`, `saveTransactions`, `loadSettings`, `saveSettings`, `clearLocalData`, and the legacy key arrays (data is server-side now). Keep `defaultSettings`, `BackupPayload`, `createBackup`, `parseBackup`. Remove any now-unused imports in callers (verify none reference the removed functions; the server store client uses `/api/store`, not these).

- [ ] **Step 4: Verify & commit**

Run: `npm run typecheck && npm run lint && npm run build && npx vitest run`. Expected: all pass.

```bash
git add components/dashboard/DashboardApp.tsx components/shell/AppShell.tsx components/shell/OverflowMenu.tsx lib/storage/local-store.ts
git commit -m "feat(auth): show signed-in user + sign-out; drop local data store"
```

---

## Phase 4 — Config & docs

### Task 9: Docs + env + OAuth setup notes

**Files:** Modify `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`. (`.env.example` already created in Task 1.)

- [ ] **Step 1: Update docs**

- README: replace the "local SQLite / runs on localhost, no auth" framing with: hosted multi-user, Google sign-in (allowlisted), Postgres; add a "Configuration" section listing the env vars and the Google OAuth setup (consent screen, redirect URI `…/api/auth/callback/google`), and a "Run locally" note (set `DATABASE_URL`, run `npx drizzle-kit push`, `npm run dev`).
- AGENTS.md: update persistence/invariants — data is Postgres scoped by `session.user.id`; auth via `auth.ts`; never return cross-user rows; allowlist via `ALLOWED_EMAILS`.
- ARCHITECTURE.md: replace the SQLite persistence section with Postgres + Drizzle + Auth.js (adapter tables, session strategy, route gating).

- [ ] **Step 2: Verify & commit**

Run: `npm run build`. Expected: pass.

```bash
git add README.md AGENTS.md docs/ARCHITECTURE.md
git commit -m "docs: document multi-user auth, Postgres, and OAuth setup"
```

---

## Manual runtime verification (outside CI)

After the tasks, in a dev environment with services:
1. Create a Postgres DB; set `DATABASE_URL`; run `npx drizzle-kit push` (or apply `./drizzle` migrations).
2. Create Google OAuth credentials; set `AUTH_GOOGLE_ID/SECRET`, `AUTH_SECRET`, `ALLOWED_EMAILS`, `AUTH_URL`; add redirect URI `http://localhost:3000/api/auth/callback/google`.
3. `npm run dev` → `/` redirects to `/signin` → "Continue with Google" → allowlisted email signs in; a non-allowlisted email is rejected.
4. Import a CSV; confirm the data is yours; sign in as a second allowlisted user and confirm an empty, isolated portfolio.

## Self-review

- **Spec coverage:** Google SSO (T5), allowlist (T4/T5), Postgres+Drizzle replacing SQLite (T1–T3), per-user scoping of data + endpoints (T3/T7), sign-in screen + gate (T6), user menu/sign-out (T8), drop local migration (T8), env/secrets + OAuth + docs (T1/T9). Migration-by-backup and non-goals are documented in the spec; no code task needed.
- **Placeholders:** none — the one deliberate temporary (`"dev-user"` in Task 3) is explicitly removed in Task 7.
- **Type consistency:** helper signatures in Task 3 (`userId: string`, async) match call-sites in Task 7; `session.user.id` is provided by the Task 5 callback and the Task 5 type augmentation; schema table names in Task 2 match the adapter wiring in Task 5 and queries in Task 3.

---

## Phase B — Admin (non-SSO credentials admin) — roadmap

Built after Phase A is verified; will be expanded into bite-sized tasks (with full code) before execution. Decisions locked with the user:

- **Credentials provider** for a single admin from env: `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt via `bcryptjs`); verified in `authorize()`. Added alongside Google in `auth.ts`. (JWT sessions — already chosen in Phase A — make this possible.)
- **Roles:** `role: "user" | "admin"` carried in the JWT (`jwt`/`session` callbacks); Google users → `user`, the credentials admin → `admin`.
- **Allowlist moves to the DB:** new `allowlist` table (email, addedBy, createdAt); the Google `signIn` callback checks it instead of `ALLOWED_EMAILS`. The env admin bootstraps access (signs in, adds the first emails). `ALLOWED_EMAILS` is retired once this lands.
- **`/admin` screen + `/api/admin/*`** guarded by `role === "admin"`: list users, invite/revoke allowlisted emails, deactivate a user.
- **Read-only "view as user":** admin can load any user's portfolio read-only (a target user id honored by `/api/store` GET only when `role === "admin"`); all writes (PUT/DELETE/import) are blocked while viewing, with a "Viewing `<email>` — read-only" banner + exit.
- **Sign-in page** gains a collapsible "Admin sign in" email/password form below the Google button.
- New deps: `bcryptjs` (+ `@types/bcryptjs`). New env: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`.

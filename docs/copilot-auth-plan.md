# Darpan — Multi-user Auth Implementation Plan (Copilot-ready)

> **Status:** Tasks 1-2 complete (Postgres + Drizzle schema deployed). Tasks 3-9 pending.
> **Branch:** `redesign/aurora`
> **Verify after every phase:** `npm run typecheck && npm run lint && npm run build`

## What's already done

- Postgres running via Docker (`docker-compose.yml`, image `postgres:16-alpine`, db/user/pass: `darpan`)
- Drizzle ORM installed: `drizzle-orm`, `postgres` (postgres-js driver), `drizzle-kit` (dev)
- Auth deps installed: `next-auth@beta` (v5), `@auth/drizzle-adapter`
- Schema created at `lib/db/schema.ts` — 6 tables: `user`, `account`, `session`, `verificationToken`, `transactions`, `settings`
- DB client at `lib/db/client.ts` — lazy postgres-js connection, drizzle instance
- Migration applied: `drizzle/0000_eminent_havok.sql` — all tables live in Postgres
- `.env.example` documents all env vars; `.env.local` has real credentials (gitignored)

## What needs to happen

Replace the SQLite-backed `lib/db/database.ts` with user-scoped Postgres queries, wire Auth.js Google SSO with allowlist, gate the app behind login, scope all API routes to the signed-in user, and surface sign-out in the UI.

---

## Phase 1 — Data Layer Cutover (Task 3)

### Goal
Rewrite `lib/db/database.ts` from synchronous `node:sqlite` to async Drizzle/Postgres, scoped by `userId`.

### Files to modify
- `lib/db/database.ts` — full rewrite
- `app/api/store/route.ts` — make calls async, use temp `"dev-user"` userId
- `app/api/import/robinhood/route.ts` — same

### What to do

**1. Rewrite `lib/db/database.ts`**

Replace the entire file. New signatures (all async, all take `userId: string` as first param):

```typescript
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

Remove all `node:sqlite`, `node:fs`, `existsSync`, `mkdirSync`, `renameSync` imports and the entire SQLite setup code.

**2. Temporarily update API routes to compile**

In `app/api/store/route.ts`, add `await` to every call and pass `"dev-user"` as userId:

```typescript
import { NextResponse } from "next/server";
import type { AppSettings, TradeTransaction } from "@/types/trading";
import { clearDbData, getDbSettings, listDbTransactions, replaceDbTransactions, saveDbSettings } from "@/lib/db/database";

export const runtime = "nodejs";

const DEV_USER = "dev-user";

export async function GET() {
  const [txns, s] = await Promise.all([listDbTransactions(DEV_USER), getDbSettings(DEV_USER)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { transactions?: TradeTransaction[]; settings?: AppSettings };
  if (Array.isArray(body.transactions)) await replaceDbTransactions(DEV_USER, body.transactions);
  if (body.settings) await saveDbSettings(DEV_USER, body.settings);
  const [txns, s] = await Promise.all([listDbTransactions(DEV_USER), getDbSettings(DEV_USER)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function DELETE() {
  await clearDbData(DEV_USER);
  return NextResponse.json({ transactions: [], settings: await getDbSettings(DEV_USER) });
}
```

In `app/api/import/robinhood/route.ts`, same pattern — add `await`, pass `DEV_USER`:

```typescript
import { NextResponse } from "next/server";
import { parseRobinhoodInput } from "@/lib/import/robinhood";
import { getDbSettings, listDbTransactions, replaceDbTransactions } from "@/lib/db/database";

export const runtime = "nodejs";

const DEV_USER = "dev-user";

export async function POST(request: Request) {
  const body = (await request.json()) as { raw?: string; mode?: "replace" | "append" };
  const existing = body.mode === "append" ? await listDbTransactions(DEV_USER) : [];
  const raw = Array.isArray(body.raw) ? body.raw.join("\n") : String(body.raw ?? "");
  const preview = parseRobinhoodInput(raw, existing);
  const rows = preview.rows;
  const nextTransactions = body.mode === "append" ? [...existing, ...rows] : rows;
  await replaceDbTransactions(DEV_USER, nextTransactions);
  return NextResponse.json({
    transactions: nextTransactions,
    settings: await getDbSettings(DEV_USER),
    summary: {
      parsedRows: preview.rows.length,
      savedRows: rows.length,
      duplicateRows: preview.duplicateIds.length,
      unresolvedRows: rows.filter((row) => row.status === "unresolved").length,
      ignoredRows: rows.filter((row) => row.status === "ignored").length,
      warningCount: preview.issues.length,
    },
  });
}
```

**3. Verify**

```bash
npm run typecheck && npm run lint && npm run build
```

**4. Commit**

```
feat(db): user-scoped async query helpers over postgres
```

---

## Phase 2 — Authentication (Tasks 4-6)

### Task 4: Allowlist predicate (TDD)

**Create `lib/auth/allowlist.ts`:**

```typescript
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
```

**Create `tests/auth/allowlist.test.ts`:**

```typescript
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

**Run:** `npx vitest run tests/auth/allowlist.test.ts` — must pass.

**Commit:** `feat(auth): allowlist predicate for sign-in restriction`

---

### Task 5: Auth.js config + route handler + session type

**Create `auth.ts` (repo root):**

```typescript
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

**Create `types/next-auth.d.ts`:**

```typescript
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```

**Create `app/api/auth/[...nextauth]/route.ts`:**

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

**Verify:** `npm run typecheck && npm run lint && npm run build`

**Commit:** `feat(auth): NextAuth Google + drizzle adapter, allowlist gate, session id`

---

### Task 6: Sign-in screen + server gate

**Create `app/signin/page.tsx`:**

```tsx
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

**Modify `app/page.tsx`** — convert to server component with auth gate:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return <DashboardApp />;
}
```

**Verify:** `npm run typecheck && npm run lint && npm run build`

**Commit:** `feat(auth): sign-in screen and server-side route gate`

---

## Phase 3 — Scope by User + UI (Tasks 7-8)

### Task 7: Session-scope the API routes

Remove the `DEV_USER` constant from both route files and replace with real session auth.

**Modify `app/api/store/route.ts`:**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AppSettings, TradeTransaction } from "@/types/trading";
import { clearDbData, getDbSettings, listDbTransactions, replaceDbTransactions, saveDbSettings } from "@/lib/db/database";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const [txns, s] = await Promise.all([listDbTransactions(userId), getDbSettings(userId)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const body = (await request.json()) as { transactions?: TradeTransaction[]; settings?: AppSettings };
  if (Array.isArray(body.transactions)) await replaceDbTransactions(userId, body.transactions);
  if (body.settings) await saveDbSettings(userId, body.settings);
  const [txns, s] = await Promise.all([listDbTransactions(userId), getDbSettings(userId)]);
  return NextResponse.json({ transactions: txns, settings: s });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  await clearDbData(userId);
  return NextResponse.json({ transactions: [], settings: await getDbSettings(userId) });
}
```

**Modify `app/api/import/robinhood/route.ts`:**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseRobinhoodInput } from "@/lib/import/robinhood";
import { getDbSettings, listDbTransactions, replaceDbTransactions } from "@/lib/db/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const body = (await request.json()) as { raw?: string; mode?: "replace" | "append" };
  const existing = body.mode === "append" ? await listDbTransactions(userId) : [];
  const raw = Array.isArray(body.raw) ? body.raw.join("\n") : String(body.raw ?? "");
  const preview = parseRobinhoodInput(raw, existing);
  const rows = preview.rows;
  const nextTransactions = body.mode === "append" ? [...existing, ...rows] : rows;
  await replaceDbTransactions(userId, nextTransactions);
  return NextResponse.json({
    transactions: nextTransactions,
    settings: await getDbSettings(userId),
    summary: {
      parsedRows: preview.rows.length,
      savedRows: rows.length,
      duplicateRows: preview.duplicateIds.length,
      unresolvedRows: rows.filter((row) => row.status === "unresolved").length,
      ignoredRows: rows.filter((row) => row.status === "ignored").length,
      warningCount: preview.issues.length,
    },
  });
}
```

**Verify:** `npm run typecheck && npm run lint && npm run build`

**Commit:** `feat(auth): scope store + import endpoints to the signed-in user`

---

### Task 8: User menu + sign-out; drop localStorage data migration

**8a. Pass user info from server to client**

Modify `app/page.tsx` to pass the user:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const { name, email, image } = session.user;
  return <DashboardApp user={{ name: name ?? null, email: email ?? null, image: image ?? null }} />;
}
```

**8b. Thread user through DashboardApp → AppShell → OverflowMenu**

Add a `user` prop to `DashboardApp`:

```typescript
// At the top of DashboardApp component signature, add:
export function DashboardApp({ user }: { user?: { name?: string | null; email?: string | null; image?: string | null } }) {
```

Pass `user` to `AppShell`:

```tsx
<AppShell
  // ...existing props...
  user={user}
/>
```

Add `user` to `AppShellProps` interface and pass to `OverflowMenu`:

```typescript
// In AppShellProps, add:
user?: { name?: string | null; email?: string | null; image?: string | null };
```

```tsx
<OverflowMenu
  // ...existing props...
  user={user}
/>
```

**8c. Update OverflowMenu with sign-out**

Add `user` to the props, add `signOut` from `next-auth/react`, render user info + sign-out button:

```tsx
"use client";
import { ChevronDown, FileDown, LogOut, Moon, Settings, Sun, Upload, MoreHorizontal } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import type { Theme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils/cn";

export function OverflowMenu(props: {
  accounts: string[]; account: string; onAccount: (a: string) => void;
  theme: Theme; onToggleTheme: () => void;
  onImport: () => void; onExport: () => void; onSettings: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/[0.06] hover:text-foreground";
  return (
    <div className="relative">
      <button type="button" aria-label="More" onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/40">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-56 rounded-[12px] border border-hairline bg-surface py-1 shadow-lg">
            {props.user?.email && (
              <>
                <div className="px-3 py-2 text-[12px] text-muted-foreground truncate">{props.user.email}</div>
                <div className="my-1 border-t border-hairline-soft" />
              </>
            )}
            <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-wide text-dim">Account</div>
            {props.accounts.map((a) => (
              <button key={a} role="menuitemradio" aria-checked={a === props.account} className={cn(item, a === props.account && "text-foreground")}
                onClick={() => { props.onAccount(a); setOpen(false); }}>
                {a === "ALL" ? "All accounts" : a}
              </button>
            ))}
            <div className="my-1 border-t border-hairline-soft" />
            <button className={item} onClick={() => { props.onToggleTheme(); }}>
              {props.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {props.theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button className={item} onClick={() => { props.onImport(); setOpen(false); }}><Upload className="h-4 w-4" />Import trades</button>
            <button className={item} onClick={() => { props.onExport(); setOpen(false); }}><FileDown className="h-4 w-4" />Export backup</button>
            <button className={item} onClick={() => { props.onSettings(); setOpen(false); }}><Settings className="h-4 w-4" />Settings</button>
            {props.user && (
              <>
                <div className="my-1 border-t border-hairline-soft" />
                <button className={item} onClick={() => signOut({ callbackUrl: "/signin" })}>
                  <LogOut className="h-4 w-4" />Sign out
                </button>
              </>
            )}
            <ChevronDown className="hidden" />
          </div>
        </>
      )}
    </div>
  );
}
```

**8d. Clean up `lib/storage/local-store.ts`**

Remove localStorage read/write functions that are now server-side. Keep: `defaultSettings`, `BackupPayload`, `createBackup`, `parseBackup`.

Delete these exports: `loadTransactions`, `saveTransactions`, `loadSettings`, `saveSettings`, `clearLocalData`, and the private `readFirst` helper + all the key constants (`TRANSACTIONS_KEY`, `SETTINGS_KEY`, `LEGACY_TRANSACTION_KEYS`, `LEGACY_SETTINGS_KEYS`).

The cleaned file should be:

```typescript
import type { AppSettings, TradeTransaction } from "@/types/trading";

export const defaultSettings: AppSettings = {
  showSampleData: true,
  defaultDateRange: "ALL",
  includeFees: true,
  annualRealizedPnlGoal: 40000,
  maxBuyingPower: 125000,
  costBasisMethod: "FIFO",
  coveredCallDenominator: "UNDERLYING_COST_BASIS",
  cashSecuredPutDenominator: "CONSERVATIVE_COLLATERAL",
  monthlyRoiDenominator: "AVERAGE_DEPLOYED_CAPITAL",
  annualizedReturn: true,
  showSwingOpenPositions: false
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  transactions: TradeTransaction[];
  settings: AppSettings;
};

export function createBackup(transactions: TradeTransaction[], settings: AppSettings): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    settings
  };
}

export function parseBackup(raw: string): BackupPayload {
  const parsed = JSON.parse(raw) as BackupPayload;
  if (parsed.version !== 1 || !Array.isArray(parsed.transactions) || !parsed.settings) {
    throw new Error("Backup file is not a Darpan v1 backup.");
  }
  return parsed;
}
```

Check that no other file imports the removed functions. If `lib/storage/server-store-client.ts` or `DashboardApp.tsx` imports them, remove those imports (they should already use `/api/store` fetch calls).

**Verify:** `npm run typecheck && npm run lint && npm run build && npx vitest run`

**Commit:** `feat(auth): show signed-in user + sign-out; drop local data store`

---

## Phase 4 — Config & Docs (Task 9)

### Update documentation

**Modify `README.md`:**
- Replace "local SQLite / no auth" framing with: hosted multi-user, Google sign-in (allowlisted), Postgres
- Add "Configuration" section: list env vars from `.env.example`, Google OAuth setup (consent screen, redirect URI `<host>/api/auth/callback/google`)
- Add "Run locally" section: `DATABASE_URL`, `npx drizzle-kit push`, `npm run dev`

**Modify `AGENTS.md`:**
- Update persistence: data is Postgres, scoped by `session.user.id`
- Auth via `auth.ts`; never return cross-user rows
- Allowlist via `ALLOWED_EMAILS` env

**Modify `docs/ARCHITECTURE.md`:**
- Replace SQLite persistence section with Postgres + Drizzle + Auth.js
- Document: adapter tables, JWT session strategy, route gating pattern

**Verify:** `npm run build`

**Commit:** `docs: document multi-user auth, Postgres, and OAuth setup`

---

## Manual Runtime Verification

After all phases, with services running:

1. Ensure Postgres is up: `docker compose up -d`
2. Ensure `.env.local` has: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS=giri.sayee@gmail.com`, `AUTH_URL=http://localhost:3000`
3. Google console redirect URI: `http://localhost:3000/api/auth/callback/google`
4. `npm run dev` → `/` redirects to `/signin` → "Continue with Google" → allowlisted email signs in
5. Import a CSV; confirm data appears
6. Sign in as a second allowlisted user → empty, isolated portfolio

---

## Critical Constraints

- **Auth.js v5 is installed as `next-auth@beta`** — not `next-auth@^5` (ETARGET error)
- **JWT sessions** (not database sessions) — required for Phase B admin Credentials provider
- **`formatPercent` does NOT multiply** — just appends `%`
- **`symbolBreakdown[].winRate`** is already 0-100 (percent), NOT 0-1
- **`tradeQuality().winRate`** IS 0-1 (fraction) — only place that multiplies by 100
- **`server-only`** import in `database.ts` prevents client-side import
- **Never commit `.env.local`** — contains real Google OAuth secrets
- **`defaultSettings` in `local-store.ts`** is imported by `database.ts` — do not delete it

## Dependency Graph

```
Task 3 (database.ts rewrite)
  └─ Task 4 (allowlist) ─── can run in parallel with Task 3
      └─ Task 5 (auth.ts + route + types) ─── depends on Task 4
          └─ Task 6 (sign-in page + gate) ─── depends on Task 5
              └─ Task 7 (scope routes) ─── depends on Task 3 + Task 6
                  └─ Task 8 (user menu + cleanup) ─── depends on Task 7
                      └─ Task 9 (docs) ─── depends on Task 8
```

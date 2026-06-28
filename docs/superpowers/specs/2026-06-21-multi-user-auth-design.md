# Multi-user auth & per-user portfolios — design spec

Status: approved design · 2026-06-21 · branch `redesign/aurora`

## 1. Summary

Turn Darpan from a local-first, single-user SQLite app into an authenticated,
multi-tenant web app. Users sign in with Google (allowlisted emails only); each user
owns their own transactions and settings, scoped by `user_id`, and sees/manages only
their own portfolio. Hosting is **cloud-agnostic** — a standard Next.js (Node) server
plus managed Postgres — deployable later to AWS, Azure, or anywhere that runs Node
(Docker packaging is a later, separate step).

### Goals
- Google SSO sign-in, restricted to an allowlist of approved emails.
- Every transaction and settings row scoped to the signed-in user; no cross-user reads.
- Replace the single-file SQLite store with managed Postgres.
- Self-service: a user imports their own broker CSV and owns the resulting accounts.

### Non-goals (explicitly out)
- Advisor/admin roles, account sharing, or per-account permissions.
- Billing, broker API sync, email/password auth, social providers other than Google.
- Docker/IaC and a specific cloud's services (decided at deploy time).

## 2. Stack

- **Auth: Auth.js v5 (`next-auth@5`)** — Google provider, **JWT sessions**,
  `@auth/drizzle-adapter`. App Router integration (`auth.ts` exporting
  `handlers/auth/signIn/signOut`). JWT (not database sessions) so the Phase B admin
  Credentials provider works (Auth.js only supports Credentials with JWT).
- **DB: Postgres** via **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`, `postgres` driver).
  Replaces `node:sqlite` in `lib/db/database.ts`.
- **Allowlist:** a `signIn` callback that rejects any Google email not in `ALLOWED_EMAILS`
  (comma-separated env var). Simple now; can graduate to a DB table later.

## 3. Data model (Drizzle schema, Postgres)

Auth.js adapter tables (standard): `users` (id, name, email, emailVerified, image),
`accounts` (OAuth links), `sessions` (sessionToken, userId, expires),
`verificationTokens`.

App tables, each owned by a user:

- `transactions`
  - `id text primary key`
  - `userId text not null references users(id) on delete cascade`
  - `payload jsonb not null` — the full `TradeTransaction` (keeps the engine's shape)
  - `tradeDate text`, `symbol text`, `status text`, `importBatchId text` — query metadata
  - `updatedAt timestamptz default now()`
  - index on `(userId, tradeDate)`
- `settings`
  - `userId text primary key references users(id) on delete cascade`
  - `value jsonb not null` — the user's `AppSettings`
  - `updatedAt timestamptz default now()`

`accountName` on each transaction stays as the user's broker-account label (the existing
account switcher keeps working, now within a single user's data).

## 4. Auth flow

- `auth.ts` (repo root or `lib/auth.ts`): NextAuth config — `GoogleProvider`,
  `DrizzleAdapter(db)`, `session: { strategy: "jwt" }`, callbacks:
  - `signIn({ user })` → return `ALLOWED_EMAILS.includes(user.email)`.
  - `session({ session, user })` → attach `session.user.id = user.id`.
- `app/api/auth/[...nextauth]/route.ts` → `export const { GET, POST } = handlers`.
- `middleware.ts` → wrap with `auth`; unauthenticated requests to app routes redirect to
  `/signin`; allow `/signin`, `/api/auth/*`, and static assets.
- `app/signin/page.tsx` → minimal branded screen (logo + tagline "the mirror for your
  trades" + "Continue with Google" button calling `signIn("google")`). Shows an
  "access is invite-only" note when sign-in is rejected by the allowlist.

## 5. Data access & API

- `lib/db/database.ts` → Drizzle client + query helpers, all taking `userId`:
  `listDbTransactions(userId)`, `replaceDbTransactions(userId, txns)`,
  `getDbSettings(userId)`, `saveDbSettings(userId, settings)`, `clearDbData(userId)`.
- `app/api/store/route.ts` and `app/api/import/robinhood/route.ts`: call `auth()` to get
  the session; `401` if none; pass `session.user.id` into every query. A user can never
  read or write another user's rows.
- `lib/storage/server-store-client.ts` (client snapshot via `useSyncExternalStore`) is
  unchanged in shape — it still calls `/api/store`, which is now user-scoped server-side.
- Remove the legacy localStorage transaction/settings migration in `local-store.ts`
  (data now lives server-side per user); keep `defaultSettings`, backup create/parse, and
  the `darpan.theme` UI preference.

## 6. UI

- Sign-in screen (above).
- The signed-in user (avatar/email) + **Sign out** added to the existing `⋯`
  `OverflowMenu`; `signOut()` clears the session and returns to `/signin`.
- No other screen changes — Home/Performance/Tickers/Positions render the session user's
  data unchanged.

## 7. Config & secrets

Env vars: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`,
`ALLOWED_EMAILS`, `AUTH_URL` (and `AUTH_TRUST_HOST=true` behind a proxy). A
`.env.example` documents them; real secrets never committed. Google Cloud OAuth consent
screen + authorized redirect URIs (`http://localhost:3000/api/auth/callback/google` for
dev, the deployed URL for prod).

## 8. Migration of existing data

No bespoke migration: reuse the existing **JSON backup**. Export the current
`data/darpan.sqlite` once via the app's backup, then import it after first sign-in. The
SQLite code path is removed once Postgres is in place.

## 9. Local development

Developers run Postgres locally (Docker `postgres` container or a Neon dev branch) and set
`DATABASE_URL`. `drizzle-kit` generates/pushes the schema. Google OAuth uses the localhost
redirect URI. Without these, the app cannot run — but `typecheck`/`lint`/`build` and the
pure unit tests do not require live services.

## 10. Testing

- Unit-test the pure pieces: the allowlist predicate (`isAllowedEmail`) and any
  query-builder/scoping helpers that can be exercised without a live DB.
- Engine/selector tests are unaffected (they take in-memory data).
- Auth + DB integration (real Google login, real Postgres) is verified manually against a
  dev database/credentials — call out that this can't be unit-tested in CI without service
  containers.

## 11. Build order (phasing)
1. **DB layer:** add Drizzle + Postgres, define schema (auth + app tables), generate
   migrations, rewrite `lib/db/database.ts` query helpers to take `userId`. App still
   builds; API routes temporarily pass a fixed dev user id.
2. **Auth:** add Auth.js + Google + Drizzle adapter + allowlist + session id callback +
   `app/api/auth/[...nextauth]` + middleware + `/signin` page.
3. **Scope by user:** API routes read `userId` from the session; remove the fixed dev id;
   add the user menu + sign-out; drop the localStorage data migration.
4. **Config & docs:** `.env.example`, README/AGENTS/ARCHITECTURE updates, OAuth setup notes.

## 12. Open risks
- Auth.js v5 is the current major line; pin the version and follow its App Router adapter
  docs precisely (API surface differs from v4).
- Runtime (OAuth + DB) can't be fully verified in this dev environment; final wiring
  (Google credentials, a reachable Postgres, redirect URIs) happens in your cloud.

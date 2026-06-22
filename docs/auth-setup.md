# Local dev & Google SSO setup

## Local Postgres (Docker)

```bash
docker compose up -d        # start Postgres (darpan-postgres on localhost:5432)
docker compose ps           # check it's healthy
docker compose down         # stop it (data persists in the darpan-pgdata volume)
docker compose down -v      # stop AND wipe the database
```

`.env.local` already has:

```
DATABASE_URL=postgres://darpan:darpan@localhost:5432/darpan
```

Once the auth/DB code lands, create the tables with:

```bash
npx drizzle-kit push        # apply the schema to the running Postgres
```

## Google SSO setup

You need a Google OAuth "Web application" client. One-time steps:

1. **Google Cloud Console** → https://console.cloud.google.com → create a project (e.g. "Darpan").
2. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - App name **Darpan**, your support email, developer email. Save.
   - Scopes: the defaults (`openid`, `email`, `profile`) are enough — add nothing.
   - **Test users:** add the Google accounts that will sign in (e.g. `giri.sayee@gmail.com`).
     While the app is in "Testing" status, only listed test users can sign in — no Google
     verification needed (up to 100 users). That's fine for an allowlisted tool.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**, name "Darpan local".
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`
   - (For production later, add your deployed origin and `https://YOUR_DOMAIN/api/auth/callback/google`.)
   - Create → copy the **Client ID** and **Client secret**.
4. **Fill `.env.local`:**

   ```
   AUTH_GOOGLE_ID=<client id>
   AUTH_GOOGLE_SECRET=<client secret>
   ALLOWED_EMAILS=giri.sayee@gmail.com        # comma-separated; who may sign in
   AUTH_URL=http://localhost:3000
   AUTH_TRUST_HOST=true
   ```

5. **Generate the Auth.js secret:**

   ```bash
   npx auth secret            # writes AUTH_SECRET to .env.local
   # or: openssl rand -base64 32   (paste into AUTH_SECRET)
   ```

6. **Run it:** `docker compose up -d` then `npm run dev` → visit `http://localhost:3000`
   → redirected to `/signin` → "Continue with Google".

### Notes
- `ALLOWED_EMAILS` is the app-level gate (the Auth.js `signIn` callback). The Google
  "Test users" list is a separate Google-level gate while the consent screen is in Testing.
  Keep both in sync for the people who should have access.
- Never commit `.env.local` (it's git-ignored). For production, set the same vars as secrets
  in your host (AWS Secrets Manager / Azure Key Vault / etc.) and use the production redirect URI.

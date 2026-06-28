import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local dev env (DATABASE_URL) so drizzle-kit can connect.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});

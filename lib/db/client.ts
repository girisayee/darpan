import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// postgres-js connects lazily (on first query), so importing this at build time is safe.
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });

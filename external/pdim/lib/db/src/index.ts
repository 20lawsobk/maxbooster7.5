import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep a small idle pool so reconnections are fast after a DB blip.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Absorb pool-level connection errors so they never become an unhandled
// 'error' event that would crash the process.  The next query will re-acquire
// a fresh client automatically.
pool.on("error", (err) => {
  console.error("[DB] Pool idle-client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";

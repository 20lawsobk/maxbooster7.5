import { Pool } from "pg";

const databaseUrl =
  process.env.DNS_API_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_PRIMARY_URL ||
  process.env.DATABASE_URL;
export const schema = process.env.DNS_API_DB_SCHEMA || "public";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
  throw new Error("DNS_API_DB_SCHEMA must be a lowercase PostgreSQL schema identifier");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 5_000,
});

export function hasDnsApiDatabaseConfiguration(): boolean {
  return Boolean(databaseUrl);
}

pool.on("error", (err) => {
  const code = (err as NodeJS.ErrnoException).code || "unknown";
  console.error(`[dns-api] database pool error (${code}); details omitted`);
});

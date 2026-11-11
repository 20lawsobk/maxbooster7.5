import { Pool } from "pg";

const databaseUrl =
  process.env.DNS_API_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_PRIMARY_URL ||
  process.env.DATABASE_URL;
const schema = process.env.DNS_API_DB_SCHEMA || "public";
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

pool.on("connect", (client) => {
  // Set the isolated schema after PostgreSQL accepts the connection. Some
  // managed poolers reject startup `options`; a queued SET avoids that protocol
  // incompatibility while remaining first in this client's query queue.
  void client.query(`SET search_path TO ${schema}, public`).catch((err) => {
    const code = (err as NodeJS.ErrnoException).code || "unknown";
    console.error(`[dns-api] could not initialize schema search_path (${code})`);
    void client.end().catch(() => undefined);
  });
});

pool.on("error", (err) => {
  const code = (err as NodeJS.ErrnoException).code || "unknown";
  console.error(`[dns-api] database pool error (${code}); details omitted`);
});

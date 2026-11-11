import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

export const DNS_API_SCHEMA = "dns_os";
export const DNS_API_MIGRATION_FILES = ["001_init.sql", "002_audit.sql"];
const API_TABLES = ["tenants", "zones", "records", "audit_log"];
const LOCK_KEY = [1_977_008_800, 5];

class SafeMigrationError extends Error {}

function databaseUrlFromEnvironment(env = process.env) {
  return env.NEON_DATABASE_URL || env.NEON_PRIMARY_URL || env.DATABASE_URL || "";
}

function isMainModule() {
  return process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export async function applyDnsApiSchemaMigrations(pool, {
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  dryRun = false,
} = {}) {
  let phase = "acquire_connection";
  const client = await pool.connect();
  let lockHeld = false;
  try {
    phase = "acquire_migration_lock";
    const lock = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired",
      LOCK_KEY,
    );
    if (!lock.rows[0]?.acquired) {
      throw new SafeMigrationError(
        "Another DNS OS migration holds the namespace lock; no changes were made.",
      );
    }
    lockHeld = true;

    phase = "inspect_existing_schemas";
    const catalog = await client.query(
      "SELECT n.nspname AS schema_name, c.relname AS relation_name " +
        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
        "WHERE n.nspname = ANY($1) AND c.relkind IN ('r', 'p', 'v', 'm')",
      [["public", DNS_API_SCHEMA]],
    );
    const existingNames = new Set(
      catalog.rows.map((row) => `${row.schema_name}.${row.relation_name}`),
    );
    const publicConflicts = API_TABLES.filter((name) => existingNames.has(`public.${name}`));
    if (publicConflicts.length) {
      throw new SafeMigrationError(
        "Existing public DNS API tables were found; no schema changes were made.",
      );
    }
    const hasLedger = existingNames.has(`${DNS_API_SCHEMA}.schema_migrations`);
    const existingDnsObjects = [...existingNames].filter((name) =>
      name.startsWith(`${DNS_API_SCHEMA}.`) &&
      name !== `${DNS_API_SCHEMA}.schema_migrations`,
    );
    if (!hasLedger && existingDnsObjects.length) {
      throw new SafeMigrationError(
        "DNS OS schema objects exist without a migration ledger; manual review is required.",
      );
    }

    const appliedVersions = hasLedger
      ? new Set((await client.query(
          `SELECT version FROM ${DNS_API_SCHEMA}.schema_migrations`,
        )).rows.map((row) => row.version))
      : new Set();
    if (dryRun) {
      return {
        schema: DNS_API_SCHEMA,
        tables: [...API_TABLES],
        pending: DNS_API_MIGRATION_FILES
          .map((filename) => filename.replace(/\.sql$/, ""))
          .filter((version) => !appliedVersions.has(version)),
        schemaExists: existingNames.has(`${DNS_API_SCHEMA}.schema_migrations`),
      };
    }

    phase = "create_isolated_schema";
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${DNS_API_SCHEMA}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${DNS_API_SCHEMA}.schema_migrations (` +
        "version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );

    for (const filename of DNS_API_MIGRATION_FILES) {
      const version = filename.replace(/\.sql$/, "");
      phase = `migration_${version}`;
      await client.query("BEGIN");
      try {
        const applied = await client.query(
          `SELECT 1 FROM ${DNS_API_SCHEMA}.schema_migrations WHERE version = $1`,
          [version],
        );
        if (applied.rowCount) {
          await client.query("COMMIT");
          console.log(`[dns-api:migrate] ${version} already applied`);
          continue;
        }
        await client.query(`SET LOCAL search_path TO ${DNS_API_SCHEMA}, public`);
        const sql = await fs.readFile(
          path.join(root, "dns-os", "db", "migrations", filename),
          "utf8",
        );
        await client.query(sql);
        await client.query(
          `INSERT INTO ${DNS_API_SCHEMA}.schema_migrations (version) VALUES ($1)`,
          [version],
        );
        await client.query("COMMIT");
        console.log(`[dns-api:migrate] applied ${version}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }

    phase = "verify_schema";
    const verification = await client.query(
      "SELECT table_name FROM information_schema.tables " +
        "WHERE table_schema = $1 AND table_name = ANY($2)",
      [DNS_API_SCHEMA, API_TABLES],
    );
    const present = new Set(verification.rows.map((row) => row.table_name));
    const missing = API_TABLES.filter((name) => !present.has(name));
    if (missing.length) {
      throw new SafeMigrationError(
        "Migration finished without all required DNS API tables; readiness remains blocked.",
      );
    }
    return { schema: DNS_API_SCHEMA, tables: [...API_TABLES] };
  } catch (error) {
    if (error && typeof error === "object") {
      Object.defineProperty(error, "phase", { value: phase, configurable: true });
    }
    throw error;
  } finally {
    if (lockHeld) {
      await client.query("SELECT pg_advisory_unlock($1, $2)", LOCK_KEY).catch(() => undefined);
    }
    client.release();
  }
}

if (isMainModule()) {
  const dryRun = process.argv.includes("--dry-run");
  const connectionString = databaseUrlFromEnvironment();
  if (!connectionString) {
    console.error("[dns-api:migrate] No configured application database; no changes made.");
    process.exitCode = 1;
  } else {
    const pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
      application_name: "maxbooster-dns-os-migration",
    });
    try {
      const result = await applyDnsApiSchemaMigrations(pool, { dryRun });
      if (dryRun) {
        console.log(
          `[dns-api:migrate] dry-run: database reachable; isolated ${result.schema} schema; ` +
            `pending=${result.pending.join(",") || "none"}; no changes made`,
        );
      } else {
        console.log(
          `[dns-api:migrate] verified isolated ${result.schema} schema (${result.tables.length} tables)`,
        );
      }
    } catch (error) {
      if (error instanceof SafeMigrationError) {
        console.error(`[dns-api:migrate] blocked: ${error.message}`);
      } else {
        const code = error?.code || "migration_failed";
        const category = code === "57014"
          ? "database canceled the statement (timeout or external cancellation)"
          : code === "42501"
            ? "database role lacks required schema or extension permission"
            : code === "55P03"
              ? "database lock was unavailable"
              : "database rejected the operation";
        console.error(
          `[dns-api:migrate] failed during ${error?.phase || "migration"} ` +
            `(${String(code)}): ${category}; connection details omitted`,
        );
      }
      process.exitCode = 1;
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
}

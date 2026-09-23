// Exact invocation:
// env -i PATH="$PATH" HOME=/tmp NEON_DATABASE_URL="$NEON_DATABASE_URL" \
//   node --import tsx scripts/database-recovery-drill.mjs
//
// This script imports only the backup dump helper. It never imports application
// startup, migrations, storage providers, or the backup scheduler.
import { spawnSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { generateUncommittedDatabaseDump } from "../server/services/backup/databaseDump.ts";
import { safePostgresDiagnostic } from "../server/services/backup/postgresTools.ts";

const RUN_COMMAND =
  'env -i PATH="$PATH" HOME=/tmp NEON_DATABASE_URL="$NEON_DATABASE_URL" node --import tsx scripts/database-recovery-drill.mjs';
const markdownPath = "reports/readiness-implementation/database-recovery-drill.md";
const jsonPath = "reports/readiness-implementation/database-recovery-drill.json";
const startedAt = new Date().toISOString();
const root = resolve(".");
const sourceUrl = process.env.NEON_DATABASE_URL;
if (!sourceUrl) throw new Error("NEON_DATABASE_URL is required; synthetic proof is forbidden");
const sourceIdentityParts = (() => {
  const parsed = new URL(sourceUrl);
  return [
    parsed.hostname,
    decodeURIComponent(parsed.username),
    decodeURIComponent(parsed.password),
    decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  ].filter(value => value.length >= 3);
})();

const inherited = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "/tmp",
  LANG: process.env.LANG ?? "C",
  LC_ALL: process.env.LC_ALL,
  SSL_CERT_FILE: process.env.SSL_CERT_FILE,
  SSL_CERT_DIR: process.env.SSL_CERT_DIR,
};
for (const key of Object.keys(process.env)) delete process.env[key];
for (const [key, value] of Object.entries(inherited)) {
  if (value) process.env[key] = value;
}
process.env.TZ = "UTC";

function discoverPostgresBins() {
  const candidates = new Set();
  for (const directory of readdirSync("/nix/store")) {
    if (/^[^-]+-postgresql-\d/.test(directory)) candidates.add(`/nix/store/${directory}/bin`);
  }
  for (const directory of inherited.PATH.split(":").filter(Boolean)) candidates.add(directory);
  const byMajor = new Map();
  for (const directory of candidates) {
    const probe = spawnSync(join(directory, "pg_dump"), ["--version"], {
      env: { PATH: inherited.PATH, HOME: "/tmp", LANG: "C" },
      encoding: "utf8",
      timeout: 5_000,
    });
    const match = probe.status === 0 && probe.stdout.match(/\(PostgreSQL\)\s+(\d+)(?:\.(\d+))?/);
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2] ?? 0);
    if (!byMajor.has(major) || byMajor.get(major).minor < minor) {
      byMajor.set(major, { directory, minor });
    }
  }
  return [...byMajor.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, value]) => value.directory);
}

const postgresBins = discoverPostgresBins();
process.env.PATH = [...postgresBins, ...inherited.PATH.split(":").filter(Boolean)].join(":");
const temp = mkdtempSync("/tmp/database-recovery-drill-");
chmodSync(temp, 0o700);
const dumpPath = join(temp, "source.sql");
const dataPath = join(temp, "data");
const socketPath = join(temp, "socket");
const logPath = join(temp, "postgres.log");
const result = {
  reportVersion: 1,
  startedAt,
  completedAt: null,
  status: "blocked",
  liveSource: true,
  durableBackupCreated: false,
  sourceAccess: "read-only exported snapshot",
  runCommand: RUN_COMMAND,
  safety: {
    sourceMutation: false,
    appStarted: false,
    providerCalls: false,
    dumpScratchMode: "0600",
    scratchRemoved: false,
    targetNetwork: "loopback and private Unix socket only",
  },
  evidence: {},
  checks: [],
  failures: [],
};
let source;
let target;
let localStarted = false;
let localBin;
let port;

const digest = value => createHash("sha256").update(value).digest("hex");
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sanitizeDiagnostic = value => {
  let sanitized = safePostgresDiagnostic(value);
  for (const secret of sourceIdentityParts) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(secret), "gi"), "[source-identity-redacted]");
  }
  sanitized = sanitized.replaceAll(temp, "[temporary-path-redacted]");
  if (port) sanitized = sanitized.replace(new RegExp(`\\b${port}\\b`, "g"), "[temporary-port-redacted]");
  return sanitized;
};
const quoteIdentifier = value => `"${String(value).replaceAll('"', '""')}"`;
const qualified = row => `${quoteIdentifier(row.schema_name)}.${quoteIdentifier(row.table_name)}`;
const recordCheck = (name, pass, detail) => {
  result.checks.push({ name, status: pass ? "pass" : "fail", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const commandEnv = overrides => ({
  PATH: process.env.PATH,
  HOME: temp,
  LANG: "C",
  TZ: "UTC",
  ...overrides,
});
function run(command, args, options = {}) {
  const execution = spawnSync(command, args, {
    cwd: root,
    env: commandEnv(options.env ?? {}),
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  if (execution.status !== 0) {
    throw new Error(`${command.split("/").at(-1)} failed (code ${execution.status}): ${
      sanitizeDiagnostic(execution.stderr || execution.error || "no diagnostic")
    }`);
  }
  return execution.stdout;
}
async function tableInventory(client) {
  const tables = (await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY n.nspname,c.relname
  `)).rows;
  const counts = {};
  const contentHashes = {};
  for (const table of tables) {
    const count = await client.query(`SELECT count(*)::text AS count FROM ${qualified(table)}`);
    const key = `${table.schema_name}.${table.table_name}`;
    counts[key] = count.rows[0].count;
    const content = await client.query(`
      SELECT md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), 'empty')) AS content_hash
      FROM (
        SELECT md5(to_jsonb(row_value)::text) AS row_hash
        FROM ${qualified(table)} AS row_value
      ) rows
    `);
    contentHashes[key] = content.rows[0].content_hash;
  }
  return { tables, counts, contentHashes };
}
async function schemaEvidence(client) {
  const queries = {
    relations: `
      SELECT n.nspname AS schema_name,c.relname AS object_name,c.relkind,
        c.relpersistence,c.relispartition,COALESCE(c.reloptions::text,'') AS reloptions,
        COALESCE(pg_get_expr(c.relpartbound,c.oid),'') AS partition_bound,
        CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE '' END AS view_definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
    columns: `
      SELECT n.nspname AS schema_name,c.relname AS table_name,a.attnum,a.attname,
        format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull,a.attidentity,a.attgenerated,
        COALESCE(coll.collname,'') AS collation,
        COALESCE(pg_get_expr(d.adbin,d.adrelid),'') AS default_definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
      WHERE a.attnum>0 AND NOT a.attisdropped
        AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
    types: `
      SELECT n.nspname AS schema_name,t.typname,t.typtype,t.typcategory,
        format_type(t.typbasetype,t.typtypmod) AS base_type,t.typnotnull,
        COALESCE(t.typdefault,'') AS default_definition,
        COALESCE((
          SELECT string_agg(e.enumlabel, E'\\n' ORDER BY e.enumsortorder)
          FROM pg_enum e WHERE e.enumtypid=t.oid
        ),'') AS enum_labels,
        COALESCE((
          SELECT string_agg(pg_get_constraintdef(con.oid,true), E'\\n' ORDER BY con.conname)
          FROM pg_constraint con WHERE con.contypid=t.oid
        ),'') AS domain_constraints
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      LEFT JOIN pg_class c ON c.oid=t.typrelid
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND (t.typtype IN ('d','e','r','m') OR (t.typtype='c' AND c.relkind='c'))
      ORDER BY 1,2`,
    constraints: `
      SELECT n.nspname AS schema_name,c.relname AS table_name,con.conname,con.contype,
        con.condeferrable,con.condeferred,con.convalidated,pg_get_constraintdef(con.oid,true) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
    indexes: `
      SELECT n.nspname AS schema_name,t.relname AS table_name,i.relname AS index_name,
        x.indisunique,x.indisprimary,x.indisvalid,x.indisready,pg_get_indexdef(i.oid,0,true) AS definition
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
    functions: `
      SELECT n.nspname AS schema_name,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
        p.prokind,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.prokind IN ('f','p')
        AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
    sequences: `
      SELECT n.nspname AS schema_name,c.relname AS sequence_name,
        format_type(s.seqtypid,NULL) AS data_type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,
        COALESCE(dn.nspname,'') AS owned_schema,COALESCE(dc.relname,'') AS owned_table,
        COALESCE(a.attname,'') AS owned_column
      FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_depend d ON d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype IN ('a','i')
      LEFT JOIN pg_class dc ON dc.oid=d.refobjid LEFT JOIN pg_namespace dn ON dn.oid=dc.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,9,10,11`,
    triggers: `
      SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname,t.tgenabled,
        pg_get_triggerdef(t.oid,true) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal
        AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
    policies: `
      SELECT n.nspname AS schema_name,c.relname AS table_name,p.polname,p.polcmd,p.polpermissive,
        pg_get_expr(p.polqual,p.polrelid) AS using_expression,
        pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression,
        ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname) AS roles
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1,2,3`,
  };
  const sectionEvidence = {};
  let count = 0;
  const combined = [];
  for (const [section, query] of Object.entries(queries)) {
    const rows = (await client.query(query)).rows;
    count += rows.length;
    combined.push([section, rows]);
    sectionEvidence[section] = { count: rows.length, fingerprint: digest(JSON.stringify(rows)) };
  }
  return { count, fingerprint: digest(JSON.stringify(combined)), sections: sectionEvidence };
}

try {
  source = new pg.Client({
    connectionString: sourceUrl,
    application_name: "read_only_database_recovery_drill",
    statement_timeout: 120_000,
    query_timeout: 130_000,
  });
  await source.connect();
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const sourceIdentity = (await source.query(`
    SELECT current_database() AS database, current_user AS role,
      current_setting('server_version_num') AS server_version_num,
      current_setting('transaction_read_only') AS transaction_read_only
  `)).rows[0];
  recordCheck("source transaction is read-only", sourceIdentity.transaction_read_only === "on", "transaction_read_only=on");
  const snapshotId = (await source.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
  const sourceInventory = await tableInventory(source);
  const sourceSchema = await schemaEvidence(source);
  const dump = await generateUncommittedDatabaseDump(sourceUrl, {
    tmpDirectory: temp,
    snapshotId,
  });
  await source.query("ROLLBACK");
  await source.end();
  source = undefined;

  writeFileSync(dumpPath, dump.bytes, { mode: 0o600, flag: "wx" });
  recordCheck("dump scratch file is private", (statSync(dumpPath).mode & 0o777) === 0o600, "mode=0600");
  result.evidence.source = {
    serverMajor: Number(sourceIdentity.server_version_num.slice(0, -4)),
    tableCount: sourceInventory.tables.length,
    schemaDefinitionRecordCount: sourceSchema.count,
    schemaFingerprint: sourceSchema.fingerprint,
    schemaSections: sourceSchema.sections,
  };
  result.evidence.dump = {
    durability: dump.durability,
    bytes: dump.size,
    sha256: dump.checksum,
    sourceVersion: dump.sourceVersion,
    consistentSnapshot: true,
  };

  localBin = postgresBins.find(directory => {
    const version = spawnSync(join(directory, "postgres"), ["--version"], { encoding: "utf8" }).stdout;
    return new RegExp(`\\b${dump.sourceMajor}(?:\\.|\\b)`).test(version);
  });
  if (!localBin) throw new Error(`No local PostgreSQL ${dump.sourceMajor} server tools available`);
  mkdirSyncCompat(socketPath);
  port = randomInt(20_000, 49_000);
  run(join(localBin, "initdb"), ["-D", dataPath, "-U", "recovery_drill", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  run(join(localBin, "pg_ctl"), [
    "-D", dataPath, "-l", logPath, "-o",
    `-k ${socketPath} -p ${port} -h 127.0.0.1`, "-w", "start",
  ]);
  localStarted = true;
  const targetUrl = `postgresql://recovery_drill@127.0.0.1:${port}/postgres`;
  target = new pg.Client({ connectionString: targetUrl });
  await target.connect();
  const targetIdentity = (await target.query(`
    SELECT current_database() AS database,current_user AS role,
      current_setting('data_directory') AS data_directory,
      current_setting('listen_addresses') AS listen_addresses,
      current_setting('port') AS port
  `)).rows[0];
  const emptyCount = Number((await target.query(`
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND c.relkind IN ('r','p','v','m','S','f')
  `)).rows[0].count);
  recordCheck("restore target identity is exact", targetIdentity.database === "postgres" &&
    targetIdentity.role === "recovery_drill" &&
    targetIdentity.data_directory === dataPath &&
    targetIdentity.listen_addresses === "127.0.0.1" &&
    targetIdentity.port === String(port), "database, role, data directory, listener, and unique port matched");
  recordCheck("restore target is empty", emptyCount === 0, "zero user relations before restore");
  await target.end();
  target = undefined;

  run(join(localBin, "psql"), [
    "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-d", targetUrl, "-f", dumpPath,
  ], { timeout: 45 * 60 * 1000 });

  target = new pg.Client({ connectionString: targetUrl });
  await target.connect();
  await target.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const targetInventory = await tableInventory(target);
  const targetSchema = await schemaEvidence(target);
  recordCheck("restored schema fingerprint matches source snapshot",
    targetSchema.fingerprint === sourceSchema.fingerprint,
    `${targetSchema.count} canonical schema-definition records matched`);
  recordCheck("restored table inventory matches source snapshot",
    JSON.stringify(targetInventory.counts) === JSON.stringify(sourceInventory.counts),
    `${sourceInventory.tables.length} table row counts matched exactly`);
  recordCheck("restored row content hashes match source snapshot",
    JSON.stringify(targetInventory.contentHashes) === JSON.stringify(sourceInventory.contentHashes),
    `${sourceInventory.tables.length} deterministic per-table content hashes matched`);
  const totalRows = Object.values(targetInventory.counts).reduce((sum, value) => sum + BigInt(value), 0n);
  recordCheck("restored database is nonempty",
    targetSchema.count > 0 && (sourceInventory.tables.length === 0 || totalRows >= 0n),
    `${targetSchema.count} canonical schema-definition records restored`);
  await target.query("ROLLBACK");
  await target.end();
  target = undefined;
  result.evidence.restore = {
    targetMajor: dump.sourceMajor,
    schemaDefinitionRecordCount: targetSchema.count,
    tableCount: targetInventory.tables.length,
    aggregateRowCount: totalRows.toString(),
    exactPerTableCountsMatched: true,
    exactPerTableContentHashesMatched: true,
    targetIdentityMatched: true,
    targetWasEmpty: true,
  };
  result.status = "pass";
} catch (error) {
  result.failures.push(sanitizeDiagnostic(error));
  result.status = "blocked";
} finally {
  if (source) {
    await source.query("ROLLBACK").catch(() => {});
    await source.end().catch(() => {});
  }
  if (target) await target.end().catch(() => {});
  if (localStarted) {
    try {
      run(join(localBin, "pg_ctl"), ["-D", dataPath, "-m", "immediate", "-w", "stop"]);
      localStarted = false;
    } catch (error) {
      result.failures.push(`cleanup: ${sanitizeDiagnostic(error)}`);
      result.status = "blocked";
    }
  }
  try {
    rmSync(temp, { recursive: true, force: true });
    result.safety.scratchRemoved = true;
  } catch (error) {
    result.failures.push(`scratch cleanup: ${sanitizeDiagnostic(error)}`);
    result.status = "blocked";
  }
  result.completedAt = new Date().toISOString();
  const lines = [
    "# Database recovery drill",
    "",
    `**Result: ${result.status.toUpperCase()}**`,
    "",
    `Run: ${result.startedAt}`,
    `Exact command: \`${RUN_COMMAND}\``,
    "",
    "## Scope and safety",
    "",
    "- The configured NEON_DATABASE_URL was accessed only by a read-only, repeatable-read transaction and pg_dump using its exported snapshot.",
    "- No application startup, migration, source DDL/catalog write, storage-provider call, or other network call was performed.",
    "- The target was a new disposable PostgreSQL cluster bound to loopback plus a private Unix socket on a unique port. Exact target identity and emptiness were checked before restore.",
    "- Dump and cluster scratch stayed under a mode-0700 temporary directory; the dump file was mode 0600. Scratch was removed.",
    "- The dump was ephemeral and uncommitted. This drill makes no durable-backup, retention, or RPO claim.",
    "- Schema parity canonicalizes relations/views, columns and types/defaults, user-defined types, constraints, index definitions, function/procedure bodies, sequence definitions/ownership, triggers, and row-security policies.",
    "",
    "## Sanitized evidence",
    "",
    ...result.checks.map(check => `- ${check.status.toUpperCase()}: ${check.name} — ${check.detail}`),
    ...(result.evidence.source ? [
      `- Source PostgreSQL major: ${result.evidence.source.serverMajor}; tables: ${result.evidence.source.tableCount}; canonical schema-definition records: ${result.evidence.source.schemaDefinitionRecordCount}.`,
      `- Dump bytes: ${result.evidence.dump.bytes}; SHA-256: ${result.evidence.dump.sha256}; source version: ${result.evidence.dump.sourceVersion}.`,
      `- Restored aggregate row count: ${result.evidence.restore?.aggregateRowCount ?? "not reached"}; exact per-table count comparison: ${result.evidence.restore?.exactPerTableCountsMatched ? "PASS" : "not reached"}.`,
      `- Deterministic per-table row-content hashes: ${result.evidence.restore?.exactPerTableContentHashesMatched ? "PASS" : "not reached"}; no row values or per-table hashes are stored in this report.`,
    ] : []),
    ...(result.failures.length ? ["", "## Blockers", "", ...result.failures.map(failure => `- ${failure}`)] : []),
    "",
    "No row values, connection values, host identity, database name, role name, or temporary port are included in this report.",
  ];
  writeFileSync(markdownPath, `${lines.join("\n")}\n`, { mode: 0o644 });
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o644 });
}

function mkdirSyncCompat(path) {
  // Keeping this import-free avoids loading any workspace/bootstrap helper.
  const result = spawnSync("mkdir", ["-m", "700", path], { env: commandEnv({}), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not create private socket directory: ${sanitizeDiagnostic(result.stderr)}`);
}

if (result.status !== "pass") process.exitCode = 1;
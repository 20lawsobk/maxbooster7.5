// Run ONLY via: env -i PATH="$PATH" HOME=/tmp node scripts/readiness-isolated-rehearsal.mjs
// No workspace config, dotenv, server bootstrap, or shared database is loaded.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

if (Object.keys(process.env).some(k => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|NODE_OPTIONS/.test(k))) {
  throw new Error("Refusing inherited database/runtime configuration; invoke under env -i.");
}
const root = resolve(".");
const temp = mkdtempSync("/tmp/readiness-pg-");
const env = { PATH: process.env.PATH, HOME: temp, LANG: "C", TZ: "UTC" };
const report = [
  "# Isolated PostgreSQL migration rehearsal", "",
  `Run: ${new Date().toISOString()}`,
  "Safety: every subprocess receives an allowlisted environment (PATH, temporary HOME, LANG, TZ). No workspace database environment or credentials are read. PostgreSQL listens ONLY on a private temporary Unix socket; port 55439; trust auth for synthetic local role rehearsal. No TCP listener.",
  "Baseline: fresh SQL generated from a TEMP copy of shared/schema.ts excluding only the readiness re-export. Full schema independently generated/applied in a second isolated database for structural catalog parity. Historical migrations were NOT replayed: their provenance is incomplete. This is not proof of upgrade compatibility with the shared database.",
  "Scope: real PostgreSQL SQL/invariant checks plus real injected session/factor repositories. No provider calls, app startup, full build, installation, or shared database access.",
  'Rerun: `env -i PATH="$PATH" HOME=/tmp node scripts/readiness-isolated-rehearsal.mjs`',
  ""
];
let started = false;
let client;
let failures = 0;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 120000, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")}: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const digest = text => createHash("sha256").update(text).digest("hex");
async function check(name, fn) {
  try { await fn(); report.push(`- PASS: ${name}`); }
  catch (error) { failures++; report.push(`- FAIL: ${name}: ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message); }
try {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const exportLine = 'export * from "./readiness-schema";';
  assert(schema.split(exportLine).length === 2, "Expected exactly one readiness re-export");
  const baselineSchema = schema.replace(exportLine, "");
  const readinessSchema = readFileSync("shared/readiness-schema.ts", "utf8");
  const imports = [...baselineSchema.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
  assert(imports.every(x => ["drizzle-orm", "drizzle-orm/pg-core", "drizzle-zod", "zod"].includes(x)), "Unexpected schema import: baseline safety review required");
  assert(!/process\.env|dotenv|require\s*\(|import\s*\(/.test(schema + readinessSchema), "Schema contains runtime/environment access");
  assert([...readinessSchema.matchAll(/from\s+["']([^"']+)["']/g)].every(m => ["drizzle-orm", "drizzle-orm/pg-core", "./schema"].includes(m[1])), "Unexpected readiness import");
  report.push(`Schema SHA256: ${digest(schema)}`);
  report.push(`Readiness schema SHA256: ${digest(readinessSchema)}`);
  mkdirSync(join(temp, "schema"));
  symlinkSync(join(root, "node_modules"), join(temp, "node_modules"), "dir");
  writeFileSync(join(temp, "schema/schema.ts"), baselineSchema);
  const config = join(temp, "drizzle.json");
  writeFileSync(config, JSON.stringify({ dialect: "postgresql", schema: join(temp, "schema/schema.ts"), out: join(temp, "baseline") }));
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate", `--config=${config}`]);
  writeFileSync(join(temp, "schema/schema.ts"), schema);
  writeFileSync(join(temp, "schema/readiness-schema.ts"), readinessSchema);
  writeFileSync(config, JSON.stringify({ dialect: "postgresql", schema: join(temp, "schema/schema.ts"), out: join(temp, "full") }));
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate", `--config=${config}`]);
  run("initdb", ["-D", join(temp, "data"), "-U", "rehearsal", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", join(temp, "data"), "-l", join(temp, "postgres.log"), "-o", `-k ${temp} -p 55439 -h ''`, "-w", "start"]);
  started = true;
  client = new pg.Client({ host: temp, port: 55439, user: "rehearsal", database: "postgres", password: "local-synthetic-only" });
  await client.connect();
  const identity = (await client.query("SELECT version(), current_database(), current_user, current_setting('data_directory') AS data_directory, current_setting('unix_socket_directories') AS socket, current_setting('port') AS port, current_setting('listen_addresses') AS listen_addresses, pg_postmaster_start_time()")).rows[0];
  report.push("Server identity:", "```json", JSON.stringify(identity, null, 2), "```");
  for (const file of readdirSync(join(temp, "baseline")).filter(f => f.endsWith(".sql")).sort()) {
    const text = readFileSync(join(temp, "baseline", file), "utf8");
    await client.query(text);
    report.push(`Baseline applied: ${file}, SHA256 ${digest(text)}`);
  }
  const migrations = readdirSync("migrations").filter(f => /^\d+.*\.sql$/.test(f) && Number(f.split("_")[0]) >= 20).sort();
  report.push(`Finance-named migration in snapshot: ${migrations.filter(f => /finance/i.test(f)).join(", ") || "none; finance-specific migration coverage pending if another worker adds one"}.`);
  report.push("", "## Migration results");
  for (const file of migrations) {
    const text = readFileSync(join("migrations", file), "utf8");
    await check(`${file} SHA256 ${digest(text)}`, async () => {
      await client.query("BEGIN");
      try { await client.query(text); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    });
  }
  report.push("", "## Database checks");
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  report.push(`Public tables: ${tables.length}.`);
  const expected = [...new Set(migrations.flatMap(f => [...readFileSync(join("migrations", f), "utf8").matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/gi)].map(m => m[1])))];
  report.push(`Readiness table inventory (${expected.length}): ${expected.sort().join(", ")}.`);
  const missing = expected.filter(t => !tables.includes(t));
  report.push(`Missing new migration tables: ${missing.length ? missing.join(", ") : "none"}.`);
  await check("All readiness migration tables present, including 0094", async () => {
    assert(migrations.includes("0094_client_sync_receipts.sql"), "0094 not enumerated");
    assert(missing.length === 0, `Missing tables: ${missing}`);
  });
  await check("Drizzle structural parity: columns/defaults/nullability, constraints, indexes for every readiness table", async () => {
    await client.query("CREATE DATABASE schema_parity");
    const parity = new pg.Client({ host: temp, port: 55439, user: "rehearsal", database: "schema_parity", password: "local-synthetic-only" });
    await parity.connect();
    try {
      for (const file of readdirSync(join(temp, "full")).filter(f => f.endsWith(".sql")).sort()) {
        const text = readFileSync(join(temp, "full", file), "utf8");
        await parity.query(text);
        report.push(`Full Drizzle SQL SHA256: ${digest(text)}`);
      }
      const queries = {
        columns: `SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required, pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname`,
        constraints: `SELECT c.relname AS table_name, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) AND con.contype <> 't' ORDER BY c.relname,con.contype,pg_get_constraintdef(con.oid)`,
        indexes: `SELECT t.relname AS table_name, i.indisunique AS unique, pg_get_indexdef(i.indexrelid,0,true) AS definition FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=ANY($1) ORDER BY t.relname,pg_get_indexdef(i.indexrelid,0,true)`,
      };
      for (const [kind, query] of Object.entries(queries)) {
        const normalize = rows => rows.map(row => JSON.stringify(row)).sort();
        const actual = normalize((await client.query(query, [expected])).rows);
        const declared = normalize((await parity.query(query, [expected])).rows);
        const onlyActual = actual.filter(x => !declared.includes(x));
        const onlyDeclared = declared.filter(x => !actual.includes(x));
        assert(!onlyActual.length && !onlyDeclared.length, `${kind} mismatch: SQL-only ${JSON.stringify(onlyActual)}; Drizzle-only ${JSON.stringify(onlyDeclared)}`);
        report.push(`Parity ${kind}: ${actual.length} catalog records matched across ${expected.length} tables (including constraint/index names and definitions).`);
      }
    } finally { await parity.end(); }
  });
  await check("Migration-only commerce triggers installed and enabled", async () => {
    const triggers = (await client.query("SELECT tgname, tgenabled, tgdeferrable, tginitdeferred FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'commerce_%' ORDER BY tgname")).rows;
    assert(triggers.length === 3 && triggers.every(t => t.tgenabled === "O"), "Expected three enabled commerce triggers");
    assert(triggers.some(t => t.tgname === "commerce_balanced_journal" && t.tgdeferrable && t.tginitdeferred), "Missing deferred balance trigger");
    report.push("Migration-only trigger definitions excluded from structural Drizzle parity; validated separately and exercised by ledger checks.");
  });
  await client.query("INSERT INTO users (id,email,password) VALUES ('rehearsal-user','rehearsal@example.invalid','not-a-credential')");
  await check("Session epoch issue/revoke/concurrency, factor CAS, transaction rollback (real repositories / real PostgreSQL)", async () => {
    const output = run(process.execPath, ["--import", "tsx", "scripts/readiness-isolated-security.ts", temp]);
    report.push(output.trim());
  });
  await check("Webhook receipts survive reconnect and deduplicate", async () => {
    await client.query("INSERT INTO commerce_webhook_receipts(event_id,event_type) VALUES ('evt-local','test')");
    await client.end();
    client = new pg.Client({ host: temp, port: 55439, user: "rehearsal", database: "postgres", password: "local-synthetic-only" });
    await client.connect();
    const result = await client.query("INSERT INTO commerce_webhook_receipts(event_id,event_type) VALUES ('evt-local','test') ON CONFLICT DO NOTHING RETURNING event_id");
    assert(result.rowCount === 0, "duplicate receipt inserted");
    assert((await client.query("SELECT count(*)::int AS n FROM commerce_webhook_receipts WHERE event_id='evt-local'")).rows[0].n === 1, "receipt missing");
  });
  await check("Commerce balanced commit and unbalanced deferred-constraint rollback", async () => {
    await client.query("BEGIN");
    await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES ('balanced','usd','test'); INSERT INTO commerce_entries VALUES ('balanced',1,'cash',NULL,100),('balanced',2,'seller',NULL,-100)");
    await client.query("COMMIT");
    await client.query("BEGIN");
    let rejected = false;
    try {
      await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES ('unbalanced','usd','test'); INSERT INTO commerce_entries VALUES ('unbalanced',1,'cash',NULL,100)");
      await client.query("COMMIT");
    } catch (error) { rejected = /Unbalanced commerce journal/.test(error.message); await client.query("ROLLBACK"); }
    assert(rejected, "unbalanced commit was accepted");
    assert((await client.query("SELECT 1 FROM commerce_journals WHERE id='unbalanced'")).rowCount === 0, "partial journal survived rollback");
  });
  await check("Backup catalog state constraint and lease-owner fencing (SQL checks, not backup/provider execution)", async () => {
    await client.query("INSERT INTO runtime_backup_catalog(key,name,size,checksum,state) VALUES ('local','local',12,'synthetic-checksum','pending')");
    let rejected = false;
    try { await client.query("UPDATE runtime_backup_catalog SET state='invalid' WHERE key='local'"); }
    catch (error) { rejected = error.code === "23514"; }
    assert(rejected, "invalid backup state accepted");
    await client.query("INSERT INTO runtime_backup_runs(day,owner,target_identity,state) VALUES ('2099-01-01','owner-a','isolated-local','running')");
    const wrong = await client.query("UPDATE runtime_backup_runs SET state='complete' WHERE day='2099-01-01' AND owner='owner-b' AND lease_until>now() RETURNING day");
    assert(wrong.rowCount === 0, "incorrect lease owner completed run");
    const verified = await client.query("UPDATE runtime_backup_catalog SET state='verified' WHERE key='local' AND state='pending' AND EXISTS(SELECT 1 FROM runtime_backup_runs WHERE day='2099-01-01' AND owner='owner-a' AND state='running' AND lease_until>now()) RETURNING key");
    assert(verified.rowCount === 1, "valid owner could not verify catalog");
  });
  await check("Commerce ledger rejects DELETE and preserves all rows", async () => {
    const before = (await client.query("SELECT * FROM commerce_entries ORDER BY journal_id,line")).rows;
    let rejected = false;
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM commerce_entries WHERE journal_id='balanced' AND line=2");
      await client.query("COMMIT");
    } catch (error) { rejected = /Commerce journals are append-only/.test(error.message); await client.query("ROLLBACK"); }
    assert(rejected, "DELETE did not raise append-only rejection");
    assert(JSON.stringify(before) === JSON.stringify((await client.query("SELECT * FROM commerce_entries ORDER BY journal_id,line")).rows), "DELETE changed ledger rows");
  });
  await check("Commerce ledger rejects UPDATE journal identity and preserves both journals and entries", async () => {
    await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES ('identity-target','usd','test')");
    const snapshot = async () => JSON.stringify([
      (await client.query("SELECT * FROM commerce_entries ORDER BY journal_id,line")).rows,
      (await client.query("SELECT * FROM commerce_journals ORDER BY id")).rows,
    ]);
    const before = await snapshot();
    for (const statement of [
      "UPDATE commerce_entries SET journal_id='identity-target' WHERE journal_id='balanced'",
      "UPDATE commerce_journals SET id='renamed-target' WHERE id='identity-target'",
    ]) {
      let rejected = false;
      await client.query("BEGIN");
      try { await client.query(statement); await client.query("COMMIT"); }
      catch (error) { rejected = /Commerce journals are append-only/.test(error.message); await client.query("ROLLBACK"); }
      assert(rejected, "UPDATE identity did not raise append-only rejection");
      assert(before === await snapshot(), "UPDATE identity changed ledger rows");
    }
  });
  report.push("", "## Release gates", "Local beta gate: all checks must pass. Shared/prod migration remains BLOCKED pending operator approval, a verified backup and legacy-data/upgrade rehearsal. Schema push alone cannot install migration-only commerce triggers/functions. No provider delivery or full application readiness claim.");
  report.push("", "Limits: fresh empty-schema rehearsal only; no legacy-data conversion, full repository commerce flows, remote backup contents/checksums/restore, provider delivery, HTTP authorization, load, or live migrations tested. SQL deduplication is not provider exactly-once proof. Files added after the recorded migration snapshot require rerun.");
} catch (error) {
  failures++;
  report.push("", `BLOCKER: ${error.stack}`);
} finally {
  if (client) await client.end().catch(() => {});
  if (started) {
    try { run("pg_ctl", ["-D", join(temp, "data"), "-m", "immediate", "-w", "stop"]); report.push("", "Cleanup: local PostgreSQL stopped successfully."); }
    catch (error) { failures++; report.push(`CLEANUP FAILURE: ${error.message}`); }
  }
  if (!started || !runStatus()) {
    rmSync(temp, { recursive: true, force: true });
    report.push("Cleanup: temporary data/config/socket/log directory removed.");
  }
  report.push(`\nFailures: ${failures}`);
  report.push(`Isolated beta gate: ${failures ? "FAIL" : "PASS"}. Production/live-DB gate: NOT AUTHORIZED by this rehearsal.`);
  writeFileSync("reports/readiness-implementation/migration-rehearsal.md", report.join("\n") + "\n");
  writeFileSync("reports/readiness-implementation/resume-schema.md", report.join("\n") + "\n");
  console.log(report.join("\n"));
  process.exitCode = failures ? 1 : 0;
}
function runStatus() {
  return spawnSync("pg_ctl", ["-D", join(temp, "data"), "status"], { env, encoding: "utf8" }).status === 0;
}
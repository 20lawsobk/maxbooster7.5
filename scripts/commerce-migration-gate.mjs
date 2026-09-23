#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const COMMERCE_MIGRATIONS = Object.freeze([
  Object.freeze({
    filename: "0022_commerce_webhook_receipts.sql",
    sha256: "b9fe9c9b890a350e12b6482b8f32ad0c409050a150794c5f0cc8b5cdc525405f",
    objects: Object.freeze({
      tables: ["commerce_webhook_inbox", "commerce_webhook_receipts"],
      indexes: ["commerce_webhook_inbox_pkey", "commerce_webhook_receipts_pkey"],
      functions: [],
      triggers: [],
    }),
  }),
  Object.freeze({
    filename: "0023_commerce_settlement.sql",
    sha256: "3f1ca96deba38c5f1584cd4eaef72727005d50ddf5ce48879c5002f26d52f58c",
    objects: Object.freeze({
      tables: [
        "commerce_allocations", "commerce_draws", "commerce_entries", "commerce_journals",
        "commerce_operations", "commerce_schedules", "commerce_sources", "commerce_statements",
      ],
      indexes: [
        "commerce_allocations_pkey", "commerce_allocations_source_id_user_id_key",
        "commerce_draws_pkey", "commerce_entries_account", "commerce_entries_pkey",
        "commerce_journals_pkey", "commerce_operations_pending", "commerce_operations_pkey",
        "commerce_schedules_pkey", "commerce_sources_payment_intent_key", "commerce_sources_pkey",
        "commerce_statements_funding_ref_key", "commerce_statements_pkey",
      ],
      functions: ["commerce_check_journal", "commerce_immutable_journal"],
      triggers: ["commerce_balanced_journal", "commerce_entries_immutable", "commerce_journals_immutable"],
    }),
  }),
]);

export const RECOVERY_ATTESTATION_PROTOCOL = Object.freeze({
  version: 1,
  required: Object.freeze({
    evidenceRecord: ["id", "generation", "retainedAt"],
    source: ["fingerprint", "dumpSchemaDigest", "dumpSha256", "capturedAt"],
    restore: ["sourceFingerprint", "targetFingerprint", "dumpSchemaDigest", "restoredSchemaDigest", "verifiedAt"],
    storedObject: ["bucket", "key", "generation", "sha256", "privacy", "retentionUntil", "verifiedAt"],
  }),
  privacy: "private",
});

const LOCK_KEY = "commerce-sql-0022-0023";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const q = value => {
  if (!IDENTIFIER.test(value)) throw new Error("Unsafe SQL identifier");
  return `"${value}"`;
};
const allNames = key => COMMERCE_MIGRATIONS.flatMap(item => item.objects[key]);
const normalize = (value, schema) => String(value ?? "")
  .replaceAll(`"${schema}".`, "")
  .replaceAll(`${schema}.`, "")
  .replace(/\s+/g, " ")
  .trim();

export function sanitizeError(error) {
  return String(error?.message ?? error)
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s)]+/gi, "[database-url-redacted]")
    .replace(/\b(host|hostname|user|password|database)=\S+/gi, "$1=[redacted]");
}

export async function loadExactMigrations({ directory = "migrations" } = {}) {
  const loaded = [];
  for (const migration of COMMERCE_MIGRATIONS) {
    const sql = await readFile(`${directory}/${migration.filename}`, "utf8");
    const digest = sha256(sql);
    if (digest !== migration.sha256) {
      throw new Error(`Refusing changed migration ${migration.filename}: SHA-256 mismatch`);
    }
    loaded.push({ ...migration, sql });
  }
  return loaded;
}

export function validateRecoveryAttestation(attestation, {
  now = new Date(),
  maxAgeMs = 24 * 60 * 60 * 1000,
  targetFingerprint,
} = {}) {
  const fail = reason => ({ ok: false, reason });
  if (!attestation || attestation.protocolVersion !== RECOVERY_ATTESTATION_PROTOCOL.version) {
    return fail("recovery attestation protocol version is missing or unsupported");
  }
  for (const [section, fields] of Object.entries(RECOVERY_ATTESTATION_PROTOCOL.required)) {
    if (!attestation[section] || fields.some(field => typeof attestation[section][field] !== "string" || !attestation[section][field])) {
      return fail(`recovery attestation ${section} evidence is incomplete`);
    }
  }
  const { evidenceRecord, source, restore, storedObject } = attestation;
  if (!/^[1-9][0-9]*$/.test(evidenceRecord.generation)) {
    return fail("retained recovery evidence generation is invalid");
  }
  if (source.fingerprint !== restore.sourceFingerprint) return fail("restore source fingerprint does not match dump source");
  if (restore.targetFingerprint === restore.sourceFingerprint) {
    return fail("restore target fingerprint does not prove a separate restore target");
  }
  if (source.dumpSchemaDigest !== restore.dumpSchemaDigest ||
      source.dumpSchemaDigest !== restore.restoredSchemaDigest) {
    return fail("source, dump, and restored schema digests do not match");
  }
  if (source.dumpSha256 !== storedObject.sha256) return fail("stored object digest does not match the verified dump");
  if (storedObject.privacy !== "private") return fail("backup object is not attested private");
  if (!/^[1-9][0-9]*$/.test(storedObject.generation)) return fail("immutable bucket object generation is missing");
  const times = [
    evidenceRecord.retainedAt, source.capturedAt, restore.verifiedAt, storedObject.verifiedAt,
  ].map(value => Date.parse(value));
  if (times.some(value => !Number.isFinite(value))) return fail("attestation timestamps are invalid");
  const nowMs = now.getTime();
  if (times.some(value => value > nowMs + 60_000 || nowMs - value > maxAgeMs)) {
    return fail("recovery evidence is stale or future-dated");
  }
  if (!(Date.parse(storedObject.retentionUntil) > nowMs)) return fail("backup retention does not cover the apply time");
  if (targetFingerprint && restore.sourceFingerprint !== targetFingerprint) {
    return fail("connected target fingerprint does not match the backed-up source");
  }
  return { ok: true };
}

export async function computeTargetFingerprint(client) {
  const { rows: [row] } = await client.query(`
    SELECT current_database() AS database_name,
      current_setting('server_version_num') AS server_version_num,
      COALESCE(inet_server_addr()::text, 'local') AS server_address,
      COALESCE(inet_server_port()::text, 'local') AS server_port
  `);
  return sha256(JSON.stringify(row));
}

async function catalogSignature(client, schema) {
  const tables = allNames("tables");
  const indexes = allNames("indexes");
  const functions = allNames("functions");
  const triggers = allNames("triggers");
  const { rows } = await client.query(`
    WITH selected_tables AS (
      SELECT c.oid, c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind IN ('r','p') AND c.relname=ANY($2::text[])
    )
    SELECT 'table' AS kind, t.relname AS name,
      jsonb_build_object(
        'columns', (SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
          a.attnotnull,COALESCE(pg_get_expr(d.adbin,d.adrelid),'')) ORDER BY a.attnum)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
        'constraints', (SELECT COALESCE(jsonb_agg(jsonb_build_array(con.contype,con.condeferrable,
          con.condeferred,pg_get_constraintdef(con.oid,true)) ORDER BY con.conname),'[]')
          FROM pg_constraint con WHERE con.conrelid=t.oid)
      )::text AS definition
    FROM selected_tables t
    UNION ALL
    SELECT 'index', i.relname, pg_get_indexdef(i.oid,0,true)
      FROM pg_class i JOIN pg_namespace n ON n.oid=i.relnamespace
      WHERE n.nspname=$1 AND i.relkind='i' AND i.relname=ANY($3::text[])
    UNION ALL
    SELECT 'function', p.proname, pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=$1 AND p.proname=ANY($4::text[])
        AND pg_get_function_identity_arguments(p.oid)=''
    UNION ALL
    SELECT 'trigger', tg.tgname, pg_get_triggerdef(tg.oid,true)
      FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND NOT tg.tgisinternal AND tg.tgname=ANY($5::text[])
    UNION ALL
    SELECT 'collision:' || c.relkind, c.relname, c.relkind::text
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND c.relkind NOT IN ('r','p')
    UNION ALL
    SELECT 'collision:' || c.relkind, c.relname, c.relkind::text
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($3::text[]) AND c.relkind<>'i'
    ORDER BY 1,2
  `, [schema, tables, indexes, functions, triggers]);
  return rows.map(row => ({
    kind: row.kind,
    name: row.name,
    definition: normalize(row.definition, schema),
  }));
}

function migrationRows(signature, migration) {
  const allowed = new Set(Object.entries(migration.objects).flatMap(([kind, names]) =>
    names.map(name => `${kind === "tables" ? "table" : kind.slice(0, -1)}:${name}`)));
  return signature.filter(row => allowed.has(`${row.kind}:${row.name}`));
}

export async function inspectCommerceTarget(client, {
  schema = "public",
  expectedSignature,
} = {}) {
  const actual = await catalogSignature(client, schema);
  const statuses = [];
  for (const migration of COMMERCE_MIGRATIONS) {
    const migrationNames = new Set(Object.values(migration.objects).flat());
    const collisions = actual.filter(row => row.kind.startsWith("collision:") && migrationNames.has(row.name));
    if (collisions.length) {
      statuses.push({ filename: migration.filename, sha256: migration.sha256, status: "incompatible",
        reason: "object name is occupied by an incompatible catalog kind" });
      continue;
    }
    const actualRows = migrationRows(actual, migration);
    const expectedRows = expectedSignature ? migrationRows(expectedSignature, migration) : [];
    const expectedCount = Object.values(migration.objects).reduce((sum, names) => sum + names.length, 0);
    if (actualRows.length === 0) {
      statuses.push({ filename: migration.filename, sha256: migration.sha256, status: "pending" });
    } else if (actualRows.length !== expectedCount) {
      statuses.push({ filename: migration.filename, sha256: migration.sha256, status: "incompatible",
        reason: "partial object collision" });
    } else if (!expectedSignature) {
      statuses.push({ filename: migration.filename, sha256: migration.sha256, status: "unverified-existing",
        reason: "exact expected catalog signature was not supplied" });
    } else if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) {
      statuses.push({ filename: migration.filename, sha256: migration.sha256, status: "incompatible",
        reason: "catalog signature mismatch" });
    } else {
      statuses.push({ filename: migration.filename, sha256: migration.sha256, status: "applied-exact" });
    }
  }
  return { schema, statuses, signature: actual };
}

export async function buildExpectedSignature(client, {
  schema = `commerce_expected_${process.pid}`,
  migrations,
} = {}) {
  const loaded = migrations ?? await loadExactMigrations();
  await client.query("BEGIN");
  try {
    await client.query(`CREATE SCHEMA ${q(schema)}`);
    await client.query(`SET LOCAL search_path TO ${q(schema)}, pg_catalog`);
    for (const migration of loaded) await client.query(migration.sql);
    return await catalogSignature(client, schema);
  } finally {
    await client.query("ROLLBACK");
  }
}

function assertSafeTarget(target) {
  if (!target || !["isolated-rehearsal", "approved-non-live"].includes(target.classification)) {
    throw new Error("Apply is forbidden: target must be explicitly classified as isolated-rehearsal or approved-non-live");
  }
}

function validateManifest(manifest) {
  if (!manifest || manifest.protocolVersion !== 1 || !Array.isArray(manifest.receipts)) {
    throw new Error("Externally stored migration receipt manifest is missing or invalid");
  }
  for (const receipt of manifest.receipts) {
    if (!receipt.filename || !receipt.sha256) throw new Error("Migration receipt lacks exact filename or digest");
    const pinned = COMMERCE_MIGRATIONS.find(item => item.filename === receipt.filename);
    if (pinned && pinned.sha256 !== receipt.sha256) {
      throw new Error(`External receipt conflicts with pinned digest for ${receipt.filename}`);
    }
  }
}

export async function applyCommerceMigrations({
  client,
  operatorApply = false,
  target,
  recoveryAttestation,
  receiptStore,
  expectedSignature,
  migrations,
  now = new Date(),
  lockTimeoutMs = 5_000,
  statementTimeoutMs = 30_000,
}) {
  if (!operatorApply) throw new Error("Explicit operator apply flag is required");
  assertSafeTarget(target);
  if (!receiptStore?.load || !receiptStore?.store) {
    throw new Error("Dedicated external receipt manifest store is required");
  }
  const loaded = migrations ?? await loadExactMigrations();
  const targetFingerprint = await computeTargetFingerprint(client);
  const recovery = validateRecoveryAttestation(recoveryAttestation, { now, targetFingerprint });
  if (!recovery.ok) throw new Error(`Recovery gate blocked: ${recovery.reason}`);
  const manifest = await receiptStore.load();
  validateManifest(manifest);

  const before = await inspectCommerceTarget(client, { expectedSignature });
  const bad = before.statuses.find(item => item.status === "incompatible" || item.status === "unverified-existing");
  if (bad) throw new Error(`Preflight blocked ${bad.filename}: ${bad.reason}`);
  const pending = new Set(before.statuses.filter(item => item.status === "pending").map(item => item.filename));
  if (!pending.size) return { status: "already-applied", newlyApplied: [], targetFingerprint };
  const contradictoryReceipt = manifest.receipts.find(receipt => pending.has(receipt.filename));
  if (contradictoryReceipt) {
    throw new Error(`External receipt/catalog contradiction for ${contradictoryReceipt.filename}`);
  }

  await client.query("BEGIN");
  let committed = false;
  try {
    await client.query(`SET LOCAL lock_timeout = '${Number(lockTimeoutMs)}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${Number(statementTimeoutMs)}ms'`);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [LOCK_KEY]);
    const inside = await inspectCommerceTarget(client, { expectedSignature });
    if (JSON.stringify(inside.statuses) !== JSON.stringify(before.statuses)) {
      throw new Error("Prerequisite/catalog state changed while acquiring the migration lock");
    }
    for (const migration of loaded) {
      if (pending.has(migration.filename)) await client.query(migration.sql);
    }
    const post = await inspectCommerceTarget(client, {
      expectedSignature: expectedSignature ?? await signatureFromLoadedInTransaction(client, loaded),
    });
    if (post.statuses.some(item => item.status !== "applied-exact")) {
      throw new Error("Postcondition failed: resulting catalog does not exactly match expected schema");
    }
    await client.query("COMMIT");
    committed = true;
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
  }

  const newlyApplied = loaded.filter(item => pending.has(item.filename))
    .map(item => ({ filename: item.filename, sha256: item.sha256, appliedAt: now.toISOString() }));
  const retained = {
    ...manifest,
    receipts: [...manifest.receipts, ...newlyApplied.filter(receipt =>
      !manifest.receipts.some(old => old.filename === receipt.filename && old.sha256 === receipt.sha256))],
  };
  await receiptStore.store(retained);
  return { status: "applied", newlyApplied, targetFingerprint };
}

async function signatureFromLoadedInTransaction(client, loaded) {
  const schema = `commerce_postcondition_${process.pid}`;
  await client.query("SAVEPOINT commerce_expected");
  try {
    await client.query(`CREATE SCHEMA ${q(schema)}`);
    await client.query(`SET LOCAL search_path TO ${q(schema)}, pg_catalog`);
    for (const migration of loaded) await client.query(migration.sql);
    return await catalogSignature(client, schema);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT commerce_expected");
    await client.query("SET LOCAL search_path TO public, pg_catalog");
  }
}

export async function runCommerceRehearsal({ client, secondClient, applyOptions }) {
  assertSafeTarget(applyOptions?.target);
  if (applyOptions.target.classification !== "isolated-rehearsal") {
    throw new Error("Rehearsal requires an isolated-rehearsal target");
  }
  const expectedSignature = await buildExpectedSignature(client, { migrations: applyOptions.migrations });
  const applied = await applyCommerceMigrations({ ...applyOptions, client, expectedSignature });
  const checks = [];
  const count = async table => Number((await client.query(`SELECT count(*) AS count FROM ${q(table)}`)).rows[0].count);

  await client.query("BEGIN");
  const before = await count("commerce_journals");
  await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES ('gate-rollback','usd','rehearsal')");
  await client.query("ROLLBACK");
  checks.push({ name: "rollback-proof", pass: await count("commerce_journals") === before });

  await client.query("BEGIN");
  await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES ('gate-balanced','usd','rehearsal')");
  await client.query("INSERT INTO commerce_entries(journal_id,line,account,amount_cents) VALUES ('gate-balanced',1,'a',1),('gate-balanced',2,'b',-1)");
  await client.query("COMMIT");
  checks.push({ name: "balanced-commit", pass: true });

  let unbalancedRejected = false;
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES ('gate-unbalanced','usd','rehearsal')");
    await client.query("INSERT INTO commerce_entries(journal_id,line,account,amount_cents) VALUES ('gate-unbalanced',1,'a',1)");
    await client.query("COMMIT");
  } catch {
    unbalancedRejected = true;
    await client.query("ROLLBACK").catch(() => {});
  }
  checks.push({ name: "unbalanced-commit-rejected", pass: unbalancedRejected });

  let immutableRejected = false;
  try {
    await client.query("BEGIN");
    await client.query("UPDATE commerce_entries SET amount_cents=2 WHERE journal_id='gate-balanced' AND line=1");
    await client.query("COMMIT");
  } catch {
    immutableRejected = true;
    await client.query("ROLLBACK").catch(() => {});
  }
  checks.push({ name: "immutable-journal", pass: immutableRejected });

  if (secondClient) {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [LOCK_KEY]);
    const competing = (await secondClient.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [LOCK_KEY],
    )).rows[0].acquired;
    if (competing) await secondClient.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [LOCK_KEY]);
    await client.query("ROLLBACK");
    checks.push({ name: "concurrent-lock-exclusion", pass: competing === false });
  }
  if (checks.some(check => !check.pass)) throw new Error("Commerce rehearsal postcondition failed");
  return { status: "pass", applied, checks };
}

async function cli() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has("--rehearse") ? "rehearse" : args.has("--apply") ? "apply" : "preflight";
  if (mode === "apply" && !args.has("--apply-commerce-sql-0022-0023")) {
    throw new Error("Apply requires --apply-commerce-sql-0022-0023");
  }
  const url = process.env.COMMERCE_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("COMMERCE_MIGRATION_DATABASE_URL is required");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, application_name: "commerce_migration_gate" });
  await client.connect();
  try {
    if (mode === "preflight") {
      await client.query("BEGIN READ ONLY");
      const report = await inspectCommerceTarget(client);
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ mode, ...report }, null, 2));
      if (report.statuses.some(item => !["pending", "applied-exact"].includes(item.status))) process.exitCode = 1;
      return;
    }
    throw new Error(`${mode} is library-coordinated only: provide verified recovery and external receipt-store adapters`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch(error => {
    console.error(`commerce-migration-gate: ${sanitizeError(error)}`);
    process.exitCode = 1;
  });
}
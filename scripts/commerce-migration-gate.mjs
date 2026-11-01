#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createRecoveryStorage,
  recoveryPrivateStoreInternals,
} from "./recovery-private-store.mjs";

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
  version: 2,
  required: Object.freeze({
    evidenceRecord: ["reportSha256", "completedAt"],
    source: ["schemaFingerprint", "dumpSha256"],
    restore: ["schemaFingerprint", "verifiedAt"],
    storedObject: ["name", "generation", "sha256", "privacy", "retention", "verifiedAt"],
    manifestObject: ["name", "generation", "sha256"],
  }),
  privacy: "private Replit App Storage; authenticated access required",
  retention: "retained-until-explicit-delete",
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
  targetSchemaFingerprint,
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
  const { evidenceRecord, source, restore, storedObject, manifestObject } = attestation;
  if (source.schemaFingerprint !== restore.schemaFingerprint) {
    return fail("source and restored schema fingerprints do not match");
  }
  if (source.dumpSha256 !== storedObject.sha256) return fail("stored object digest does not match the verified dump");
  if (storedObject.privacy !== RECOVERY_ATTESTATION_PROTOCOL.privacy) return fail("backup object is not attested private");
  if (storedObject.retention !== RECOVERY_ATTESTATION_PROTOCOL.retention) {
    return fail("backup object does not use the supported retained-until-delete contract");
  }
  if (![storedObject.generation, manifestObject.generation].every(value => /^[1-9][0-9]*$/.test(value))) {
    return fail("immutable stored-object generation is missing");
  }
  const times = [
    evidenceRecord.completedAt, restore.verifiedAt, storedObject.verifiedAt,
  ].map(value => Date.parse(value));
  if (times.some(value => !Number.isFinite(value))) return fail("attestation timestamps are invalid");
  const nowMs = now.getTime();
  if (times.some(value => value > nowMs + 60_000 || nowMs - value > maxAgeMs)) {
    return fail("recovery evidence is stale or future-dated");
  }
  if (targetSchemaFingerprint && source.schemaFingerprint !== targetSchemaFingerprint) {
    return fail("connected target schema does not match the backed-up source");
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

const SCHEMA_EVIDENCE_QUERIES = Object.freeze({
  relations: `SELECT n.nspname AS schema_name,c.relname AS object_name,c.relkind,
    c.relpersistence,c.relispartition,COALESCE(c.reloptions::text,'') AS reloptions,
    COALESCE(pg_get_expr(c.relpartbound,c.oid),'') AS partition_bound,
    CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE '' END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,3`,
  columns: `SELECT n.nspname AS schema_name,c.relname AS table_name,a.attnum,a.attname,
    format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull,a.attidentity,a.attgenerated,
    COALESCE(coll.collname,'') AS collation,
    COALESCE(pg_get_expr(d.adbin,d.adrelid),'') AS default_definition
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
    WHERE a.attnum>0 AND NOT a.attisdropped
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,3`,
  types: `SELECT n.nspname AS schema_name,t.typname,t.typtype,t.typcategory,
    format_type(t.typbasetype,t.typtypmod) AS base_type,t.typnotnull,
    COALESCE(t.typdefault,'') AS default_definition,
    COALESCE((SELECT string_agg(e.enumlabel,E'\\n' ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid=t.oid),'') AS enum_labels,
    COALESCE((SELECT string_agg(pg_get_constraintdef(con.oid,true),E'\\n' ORDER BY con.conname)
      FROM pg_constraint con WHERE con.contypid=t.oid),'') AS domain_constraints
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND (t.typtype IN ('d','e','r','m') OR (t.typtype='c' AND c.relkind='c')) ORDER BY 1,2`,
  constraints: `SELECT n.nspname AS schema_name,c.relname AS table_name,con.conname,con.contype,
    con.condeferrable,con.condeferred,con.convalidated,pg_get_constraintdef(con.oid,true) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,3`,
  indexes: `SELECT n.nspname AS schema_name,t.relname AS table_name,i.relname AS index_name,
    x.indisunique,x.indisprimary,x.indisvalid,x.indisready,pg_get_indexdef(i.oid,0,true) AS definition
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,3`,
  functions: `SELECT n.nspname AS schema_name,p.proname,
    pg_get_function_identity_arguments(p.oid) AS arguments,p.prokind,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p')
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,3`,
  sequences: `SELECT n.nspname AS schema_name,c.relname AS sequence_name,
    format_type(s.seqtypid,NULL) AS data_type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,
    COALESCE(dn.nspname,'') AS owned_schema,COALESCE(dc.relname,'') AS owned_table,
    COALESCE(a.attname,'') AS owned_column
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_depend d ON d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype IN ('a','i')
    LEFT JOIN pg_class dc ON dc.oid=d.refobjid LEFT JOIN pg_namespace dn ON dn.oid=dc.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,9,10,11`,
  triggers: `SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname,t.tgenabled,
    pg_get_triggerdef(t.oid,true) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,2,3`,
  policies: `SELECT n.nspname AS schema_name,c.relname AS table_name,p.polname,p.polcmd,p.polpermissive,
    pg_get_expr(p.polqual,p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression,
    ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname) AS roles
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1,2,3`,
});

export async function computeSchemaEvidence(client) {
  const combined = [];
  let count = 0;
  for (const [section, query] of Object.entries(SCHEMA_EVIDENCE_QUERIES)) {
    const rows = (await client.query(query)).rows;
    count += rows.length;
    combined.push([section, rows]);
  }
  const tableCount = Number((await client.query(`
    SELECT count(*) AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
  `)).rows[0].count);
  return { count, tableCount, fingerprint: sha256(JSON.stringify(combined)) };
}

const collect = async stream => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export async function verifyRecoveryEvidence({
  reportPath = "reports/readiness-implementation/database-recovery-drill.json",
  bucket,
  now = new Date(),
  downloadPath,
}) {
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes);
  const retained = report?.evidence?.retained;
  const dump = report?.evidence?.dump;
  const source = report?.evidence?.source;
  const restore = report?.evidence?.restore;
  if (!retained?.dumpObject || !retained?.manifestObject || !dump || !source || !restore) {
    throw new Error("Recovery evidence lacks retained dump, manifest, source, or restore detail");
  }
  if (retained.storageContract?.privacy !== RECOVERY_ATTESTATION_PROTOCOL.privacy ||
      retained.storageContract?.retention !== RECOVERY_ATTESTATION_PROTOCOL.retention) {
    throw new Error("Recovery evidence does not use the supported private retained App Storage contract");
  }
  const manifestRemote = bucket.file(retained.manifestObject.name, {
    generation: retained.manifestObject.generation,
  });
  const [manifestMetadata] = await manifestRemote.getMetadata();
  if (String(manifestMetadata.generation) !== retained.manifestObject.generation) {
    throw new Error("Stored recovery manifest generation mismatch");
  }
  const manifestBytes = await collect(manifestRemote.createReadStream({ validation: "crc32c" }));
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== retained.manifestObject.sha256) {
    throw new Error("Stored recovery manifest SHA-256 mismatch");
  }
  const manifest = JSON.parse(manifestBytes);
  if (manifest?.dump?.name !== retained.dumpObject.name ||
      manifest?.dump?.generation !== retained.dumpObject.generation ||
      manifest?.dump?.sha256 !== dump.sha256 ||
      manifest?.snapshotEvidence?.schemaFingerprint !== source.schemaFingerprint ||
      manifest?.snapshotEvidence?.schemaDefinitionRecordCount !== source.schemaDefinitionRecordCount ||
      manifest?.snapshotEvidence?.tableCount !== source.tableCount) {
    throw new Error("Stored recovery manifest is not bound to the reported dump and source schema");
  }
  const object = {
    ...retained.dumpObject,
    sha256: dump.sha256,
  };
  const readback = await recoveryPrivateStoreInternals.downloadAndVerify(
    bucket, object, downloadPath, dump.sha256,
  );
  if (readback.sha256 !== retained.readback?.sha256 ||
      readback.bytes !== retained.readback?.bytes) {
    throw new Error("Authenticated generation-bound dump readback does not match retained evidence");
  }
  if (restore.schemaDefinitionRecordCount !== source.schemaDefinitionRecordCount ||
      restore.tableCount !== source.tableCount ||
      restore.exactPerTableCountsMatched !== true ||
      restore.exactPerTableContentHashesMatched !== true ||
      restore.targetWasEmpty !== true) {
    throw new Error("Recovery drill does not prove an exact isolated restore");
  }
  const attestation = {
    protocolVersion: RECOVERY_ATTESTATION_PROTOCOL.version,
    evidenceRecord: {
      reportSha256: sha256(reportBytes),
      completedAt: report.completedAt,
    },
    source: { schemaFingerprint: source.schemaFingerprint, dumpSha256: dump.sha256 },
    restore: { schemaFingerprint: source.schemaFingerprint, verifiedAt: report.completedAt },
    storedObject: {
      name: object.name,
      generation: object.generation,
      sha256: object.sha256,
      privacy: retained.storageContract.privacy,
      retention: retained.storageContract.retention,
      verifiedAt: now.toISOString(),
    },
    manifestObject: {
      name: retained.manifestObject.name,
      generation: retained.manifestObject.generation,
      sha256: manifestSha256,
    },
  };
  const valid = validateRecoveryAttestation(attestation, { now });
  if (!valid.ok) throw new Error(`Recovery gate blocked: ${valid.reason}`);
  return { attestation, manifest, report, readback };
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
    SELECT 'collision:' || c.relkind::text, c.relname, c.relkind::text
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND c.relkind NOT IN ('r','p')
    UNION ALL
    SELECT 'collision:' || c.relkind::text, c.relname, c.relkind::text
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

export function catalogObjectKind(collection) {
  const kinds = { tables: "table", indexes: "index", functions: "function", triggers: "trigger" };
  const kind = kinds[collection];
  if (!kind) throw new Error(`Unsupported catalog collection ${collection}`);
  return kind;
}

function migrationRows(signature, migration) {
  const allowed = new Set(Object.entries(migration.objects).flatMap(([kind, names]) =>
    names.map(name => `${catalogObjectKind(kind)}:${name}`)));
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
  if (!target || !["isolated-rehearsal", "approved-live"].includes(target.classification)) {
    throw new Error("Apply is forbidden: target must be explicitly classified as isolated-rehearsal or approved-live");
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
  sourceRevision,
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
  const recovery = validateRecoveryAttestation(recoveryAttestation, {
    now,
    targetSchemaFingerprint: target?.schemaFingerprint,
  });
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
    try {
      await client.query("COMMIT");
      committed = true;
    } catch {
      throw new Error("Commit outcome is ambiguous; stop and inspect the catalog before any retry");
    }
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
  }

  const newlyApplied = loaded.filter(item => pending.has(item.filename))
    .map(item => ({
      filename: item.filename,
      sha256: item.sha256,
      appliedAt: now.toISOString(),
      sourceRevision,
    }));
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

    await client.query(`
      INSERT INTO commerce_webhook_inbox(event_id,event_type,payload)
      VALUES ('gate-lease','rehearsal','{}'::jsonb)
    `);
    await client.query("BEGIN");
    await client.query("SELECT event_id FROM commerce_webhook_inbox WHERE event_id='gate-lease' FOR UPDATE");
    const skipped = await secondClient.query(`
      SELECT event_id FROM commerce_webhook_inbox
      WHERE event_id='gate-lease' FOR UPDATE SKIP LOCKED
    `);
    await client.query("ROLLBACK");
    checks.push({ name: "lease-skip-locked-concurrency", pass: skipped.rowCount === 0 });
  }
  await client.query(`
    INSERT INTO commerce_webhook_receipts(event_id,event_type)
    VALUES ('gate-receipt','rehearsal')
  `);
  let duplicateReceiptRejected = false;
  try {
    await client.query(`
      INSERT INTO commerce_webhook_receipts(event_id,event_type)
      VALUES ('gate-receipt','rehearsal')
    `);
  } catch {
    duplicateReceiptRejected = true;
  }
  checks.push({ name: "receipt-idempotency-constraint", pass: duplicateReceiptRejected });
  if (checks.some(check => !check.pass)) throw new Error("Commerce rehearsal postcondition failed");
  return { status: "pass", applied, checks };
}

const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 180_000,
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command.split("/").at(-1)} failed (code ${result.status})`);
  }
  return result.stdout;
};

async function postgresBinForMajor(major) {
  const entries = await readdir("/nix/store");
  const candidates = entries
    .filter(name => name.includes(`postgresql-${major}.`) && !name.includes("-lib-"))
    .map(name => `/nix/store/${name}/bin`);
  for (const directory of candidates) {
    const probe = spawnSync(join(directory, "initdb"), ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (probe.status === 0 && probe.stdout.includes(` ${major}.`)) return directory;
  }
  throw new Error(`No compatible PostgreSQL ${major} server tools are available for isolated rehearsal`);
}

export function isolatedPgCtlStartArgs({ directory, data, socket, port }) {
  return [
    "-D", data,
    "-l", join(directory, "postgres.log"),
    "-w", "start",
    "-o", `-F -k ${socket} -h '' -p ${port}`,
  ];
}

async function startIsolatedRestore({ directory, dumpPath, major, pg }) {
  const bin = await postgresBinForMajor(major);
  const data = join(directory, "pgdata");
  const socket = join(directory, "socket");
  await writeFile(join(directory, ".private"), "", { mode: 0o600 });
  await chmod(directory, 0o700);
  await import("node:fs/promises").then(fs => fs.mkdir(socket, { mode: 0o700 }));
  runCommand(join(bin, "initdb"), [
    "-D", data, "-U", "commerce_rehearsal", "--auth=trust", "--no-locale", "--encoding=UTF8",
  ]);
  const port = 20_000 + (process.pid % 20_000);
  runCommand(join(bin, "pg_ctl"), isolatedPgCtlStartArgs({ directory, data, socket, port }));
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    runCommand(join(bin, "pg_ctl"), ["-D", data, "-w", "stop", "-m", "fast"]);
  };
  try {
    const connection = {
      host: socket,
      port,
      user: "commerce_rehearsal",
      database: "postgres",
      application_name: "commerce_isolated_rehearsal",
    };
    runCommand(join(bin, "psql"), [
      "-X", "--set", "ON_ERROR_STOP=1", "-h", socket, "-p", String(port),
      "-U", "commerce_rehearsal", "-d", "postgres", "-f", dumpPath,
    ], { timeout: 300_000 });
    const client = new pg.Client(connection);
    const secondClient = new pg.Client({ ...connection, application_name: "commerce_rehearsal_concurrency" });
    await client.connect();
    await secondClient.connect();
    return {
      client,
      secondClient,
      stop: async () => {
        await Promise.allSettled([client.end(), secondClient.end()]);
        stop();
      },
    };
  } catch (error) {
    stop();
    throw error;
  }
}

function externalReceiptStore(bucket, binding) {
  let storedObject;
  return {
    async load() {
      return { protocolVersion: 1, ...binding, receipts: [] };
    },
    async store(manifest) {
      const body = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
      const digest = sha256(body);
      const name = `private-commerce-migration-receipts/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${digest}.json`;
      const file = bucket.file(name);
      await file.save(body, {
        resumable: false,
        validation: "crc32c",
        preconditionOpts: { ifGenerationMatch: 0 },
        contentType: "application/json",
        metadata: { purpose: "commerce-migration-live-receipt", sha256: digest },
      });
      const [metadata] = await file.getMetadata();
      const generation = String(metadata.generation ?? "");
      if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Receipt object lacks an immutable generation");
      const retained = bucket.file(name, { generation });
      const readback = await collect(retained.createReadStream({ validation: "crc32c" }));
      if (sha256(readback) !== digest || !readback.equals(body)) {
        throw new Error("External migration receipt generation readback mismatch");
      }
      storedObject = { name, generation, sha256: digest, size: String(body.length) };
    },
    result() {
      return storedObject;
    },
  };
}

async function writeOperationalReport(report) {
  const path = "reports/readiness-implementation/commerce-migration-live-receipt.json";
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  const markdown = [
    "# Commerce migration live receipt",
    "",
    `**Status: ${report.status.toUpperCase()}**`,
    "",
    `- Database effect: ${report.databaseEffect}.`,
    `- Exact migrations newly applied: ${report.apply?.newlyApplied?.length ?? 0}.`,
    `- Backup binding: report ${report.backup.reportSha256}; dump generation ${report.backup.dumpGeneration}; manifest generation ${report.backup.manifestGeneration}.`,
    `- Isolated PostgreSQL rehearsal checks: ${report.rehearsal.passed}/${report.rehearsal.total} passed.`,
    `- Live catalog postconditions: ${report.livePostconditions.passed}/${report.livePostconditions.total} passed.`,
    `- External retained receipt: ${report.externalReceipt ? `generation ${report.externalReceipt.generation}, SHA-256 ${report.externalReceipt.sha256}` : "not written"}.`,
    "",
    "No database URL, role, host, row value, or credential is included in this receipt.",
    "",
  ].join("\n");
  await writeFile("reports/readiness-implementation/commerce-migration-gate.md", markdown, { mode: 0o600 });
}

async function cli() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  if (apply && !args.has("--apply-commerce-sql-0022-0023")) {
    throw new Error("Apply requires --apply-commerce-sql-0022-0023");
  }
  const url = process.env.NEON_DATABASE_URL ?? process.env.COMMERCE_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is required");
  const { default: pg } = await import("pg");
  const loaded = await loadExactMigrations();
  if (!apply) {
    const client = new pg.Client({ connectionString: url, application_name: "commerce_migration_read_only_preflight" });
    await client.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const report = await inspectCommerceTarget(client);
      const schema = await computeSchemaEvidence(client);
      await client.query("ROLLBACK");
      console.log(JSON.stringify({
        mode: "preflight",
        statuses: report.statuses,
        schemaFingerprint: schema.fingerprint,
        tableCount: schema.tableCount,
      }, null, 2));
      if (report.statuses.some(item => !["pending", "applied-exact"].includes(item.status))) process.exitCode = 1;
      return;
    } finally {
      await client.end();
    }
  }

  const temp = await mkdtemp(join(tmpdir(), "commerce-migration-gate-"));
  await chmod(temp, 0o700);
  const dumpPath = join(temp, "retained-source.sql");
  let isolated;
  let live;
  const startedAt = new Date();
  const operational = {
    reportVersion: 1,
    startedAt: startedAt.toISOString(),
    completedAt: null,
    status: "blocked",
    databaseEffect: "not-attempted",
    exactApprovedFiles: loaded.map(({ filename, sha256: digest }) => ({ filename, sha256: digest })),
    backup: {},
    rehearsal: { passed: 0, total: 0 },
    livePostconditions: { passed: 0, total: COMMERCE_MIGRATIONS.length },
    apply: null,
    externalReceipt: null,
    failures: [],
  };
  try {
    console.error("commerce-migration-gate: verifying retained backup generations");
    const { bucket, bucketId } = await createRecoveryStorage({
      bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID,
    });
    const verified = await verifyRecoveryEvidence({ bucket, downloadPath: dumpPath, now: startedAt });
    operational.backup = {
      reportSha256: verified.attestation.evidenceRecord.reportSha256,
      dumpSha256: verified.attestation.source.dumpSha256,
      dumpGeneration: verified.attestation.storedObject.generation,
      manifestGeneration: verified.attestation.manifestObject.generation,
      sourceSchemaFingerprint: verified.attestation.source.schemaFingerprint,
      storage: "private-retained-app-storage",
    };

    console.error("commerce-migration-gate: restoring isolated rehearsal database");
    isolated = await startIsolatedRestore({
      directory: temp,
      dumpPath,
      major: verified.report.evidence.source.serverMajor,
      pg,
    });
    const restoredSchema = await computeSchemaEvidence(isolated.client);
    if (restoredSchema.fingerprint !== verified.attestation.source.schemaFingerprint) {
      throw new Error("Downloaded retained restore schema does not match the backed-up source");
    }
    const expectedSignature = await buildExpectedSignature(isolated.client, { migrations: loaded });
    const rehearsalStore = {
      manifest: { protocolVersion: 1, receipts: [] },
      async load() { return this.manifest; },
      async store(value) { this.manifest = value; },
    };
    const rehearsal = await runCommerceRehearsal({
      client: isolated.client,
      secondClient: isolated.secondClient,
      applyOptions: {
        operatorApply: true,
        target: {
          classification: "isolated-rehearsal",
          schemaFingerprint: restoredSchema.fingerprint,
        },
        recoveryAttestation: verified.attestation,
        receiptStore: rehearsalStore,
        migrations: loaded,
        sourceRevision: verified.manifest.sourceRevision,
      },
    });
    operational.rehearsal = {
      passed: rehearsal.checks.filter(check => check.pass).length,
      total: rehearsal.checks.length,
      checks: rehearsal.checks,
    };
    console.error("commerce-migration-gate: isolated rehearsal passed");
    await isolated.stop();
    isolated = undefined;

    live = new pg.Client({
      connectionString: url,
      application_name: "commerce_migration_exact_0022_0023",
      statement_timeout: 120_000,
      query_timeout: 130_000,
    });
    await live.connect();
    console.error("commerce-migration-gate: running live read-only fingerprint preflight");
    await live.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const liveSchema = await computeSchemaEvidence(live);
    const liveBefore = await inspectCommerceTarget(live, { expectedSignature });
    await live.query("ROLLBACK");
    if (liveSchema.fingerprint !== verified.attestation.source.schemaFingerprint ||
        liveSchema.count !== verified.report.evidence.source.schemaDefinitionRecordCount ||
        liveSchema.tableCount !== verified.report.evidence.source.tableCount) {
      throw new Error("Live read-only source fingerprint no longer matches the retained backup");
    }
    if (liveBefore.statuses.some(item => !["pending", "applied-exact"].includes(item.status))) {
      throw new Error("Live catalog has a partial or incompatible commerce object collision");
    }
    const sourceRevision = verified.manifest.sourceRevision;
    const receiptStore = externalReceiptStore(bucket, {
      sourceRevision,
      backup: {
        reportSha256: operational.backup.reportSha256,
        dumpSha256: operational.backup.dumpSha256,
        dumpGeneration: operational.backup.dumpGeneration,
        manifestGeneration: operational.backup.manifestGeneration,
      },
      targetFingerprint: await computeTargetFingerprint(live),
      bucketBinding: sha256(bucketId),
    });
    const applied = await applyCommerceMigrations({
      client: live,
      operatorApply: true,
      target: { classification: "approved-live", schemaFingerprint: liveSchema.fingerprint },
      recoveryAttestation: verified.attestation,
      receiptStore,
      expectedSignature,
      migrations: loaded,
      sourceRevision,
      now: new Date(),
    });
    operational.databaseEffect = applied.status === "applied" ? "committed" : "already-applied";
    console.error(`commerce-migration-gate: live transaction ${operational.databaseEffect}`);
    operational.apply = {
      status: applied.status,
      newlyApplied: applied.newlyApplied,
      targetFingerprint: applied.targetFingerprint,
      sourceRevision,
    };
    operational.externalReceipt = receiptStore.result() ?? null;
    const after = await inspectCommerceTarget(live, { expectedSignature });
    operational.livePostconditions = {
      passed: after.statuses.filter(item => item.status === "applied-exact").length,
      total: after.statuses.length,
      statuses: after.statuses,
    };
    if (operational.livePostconditions.passed !== operational.livePostconditions.total) {
      throw new Error("Live post-commit catalog verification failed; do not retry");
    }
    if (applied.status === "applied" && !operational.externalReceipt) {
      throw new Error("Live commit succeeded but external receipt retention failed; do not retry");
    }
    operational.status = "pass";
    console.error("commerce-migration-gate: retained receipt and postconditions passed");
  } catch (error) {
    operational.failures.push(sanitizeError(error));
    if (/ambiguous|commit succeeded/i.test(String(error?.message))) {
      operational.databaseEffect = "ambiguous-stop-no-retry";
    }
    throw error;
  } finally {
    operational.completedAt = new Date().toISOString();
    await live?.end().catch(() => {});
    await isolated?.stop().catch(() => {});
    await writeOperationalReport(operational);
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch(error => {
    console.error(`commerce-migration-gate: ${sanitizeError(error)}`);
    process.exitCode = 1;
  });
}
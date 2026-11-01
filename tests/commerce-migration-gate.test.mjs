import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCE_MIGRATIONS,
  loadExactMigrations,
  sanitizeError,
  validateRecoveryAttestation,
  applyCommerceMigrations,
  catalogObjectKind,
  isolatedPgCtlStartArgs,
} from "../scripts/commerce-migration-gate.mjs";

const now = new Date("2026-06-01T12:00:00.000Z");
const attestation = {
  protocolVersion: 2,
  evidenceRecord: {
    reportSha256: "a".repeat(64),
    completedAt: "2026-06-01T11:46:00.000Z",
  },
  source: {
    schemaFingerprint: "schema-digest",
    dumpSha256: "dump-digest",
  },
  restore: {
    schemaFingerprint: "schema-digest",
    verifiedAt: "2026-06-01T11:40:00.000Z",
  },
  storedObject: {
    name: "database/dump",
    generation: "42",
    sha256: "dump-digest",
    privacy: "private Replit App Storage; authenticated access required",
    retention: "retained-until-explicit-delete",
    verifiedAt: "2026-06-01T11:45:00.000Z",
  },
  manifestObject: {
    name: "database/manifest",
    generation: "43",
    sha256: "b".repeat(64),
  },
};

test("pins exact commerce migration filenames and file digests", async () => {
  const loaded = await loadExactMigrations();
  assert.deepEqual(loaded.map(({ filename, sha256 }) => ({ filename, sha256 })),
    COMMERCE_MIGRATIONS.map(({ filename, sha256 }) => ({ filename, sha256 })));
  assert.match(loaded[0].sql, /commerce_webhook_receipts/);
  assert.match(loaded[1].sql, /commerce_balanced_journal/);
});

test("recovery gate validates evidence, not a pass boolean", () => {
  assert.deepEqual(validateRecoveryAttestation(attestation, {
    now,
    targetSchemaFingerprint: "schema-digest",
  }), { ok: true });
  assert.equal(validateRecoveryAttestation({ status: "pass" }, { now }).ok, false);
  assert.match(validateRecoveryAttestation({
    ...attestation,
    storedObject: { ...attestation.storedObject, generation: "" },
  }, { now }).reason, /evidence is incomplete|generation/);
  assert.match(validateRecoveryAttestation({
    ...attestation,
    restore: { ...attestation.restore, schemaFingerprint: "wrong" },
  }, { now }).reason, /schema fingerprints/);
  assert.match(validateRecoveryAttestation({
    ...attestation,
    storedObject: { ...attestation.storedObject, retention: "fixed-retention-required" },
  }, { now }).reason, /retained-until-delete/);
  assert.match(validateRecoveryAttestation(attestation, {
    now: new Date("2026-06-03T12:00:01.000Z"),
  }).reason, /stale/);
});

test("apply stays fail-closed before making any SQL change", async () => {
  let queries = 0;
  const client = { query: async () => { queries++; throw new Error("must not query"); } };
  await assert.rejects(applyCommerceMigrations({
    client,
    operatorApply: false,
    target: { classification: "approved-live" },
  }), /Explicit operator apply flag/);
  assert.equal(queries, 0);

  await assert.rejects(applyCommerceMigrations({
    client,
    operatorApply: true,
    target: { classification: "production" },
  }), /Apply is forbidden/);
  assert.equal(queries, 0);

  await assert.rejects(applyCommerceMigrations({
    client,
    operatorApply: true,
    target: { classification: "approved-live" },
  }), /external receipt manifest/);
  assert.equal(queries, 0);
});

test("diagnostics redact database URLs and keyword credentials", () => {
  const output = sanitizeError(new Error(
    "failed postgresql://operator:secret@private.example/db host=private.example password=secret",
  ));
  assert.doesNotMatch(output, /operator|secret|private\.example/);
  assert.match(output, /\[database-url-redacted\]/);
});

test("isolated PostgreSQL daemon redirects output so spawnSync can return", () => {
  const args = isolatedPgCtlStartArgs({
    directory: "/tmp/private-gate",
    data: "/tmp/private-gate/data",
    socket: "/tmp/private-gate/socket",
    port: 23456,
  });
  assert.deepEqual(args.slice(2, 4), ["-l", "/tmp/private-gate/postgres.log"]);
  assert.ok(args.includes("start"));
});

test("catalog signature compares indexes instead of dropping them as indexe", () => {
  assert.equal(catalogObjectKind("tables"), "table");
  assert.equal(catalogObjectKind("indexes"), "index");
  assert.equal(catalogObjectKind("functions"), "function");
  assert.equal(catalogObjectKind("triggers"), "trigger");
  assert.throws(() => catalogObjectKind("unknown"), /Unsupported catalog collection/);
});
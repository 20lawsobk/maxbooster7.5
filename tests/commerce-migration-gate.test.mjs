import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCE_MIGRATIONS,
  loadExactMigrations,
  sanitizeError,
  validateRecoveryAttestation,
  applyCommerceMigrations,
} from "../scripts/commerce-migration-gate.mjs";

const now = new Date("2026-06-01T12:00:00.000Z");
const attestation = {
  protocolVersion: 1,
  evidenceRecord: {
    id: "restore-proof-2026-06-01",
    generation: "7",
    retainedAt: "2026-06-01T11:46:00.000Z",
  },
  source: {
    fingerprint: "source-fingerprint",
    dumpSchemaDigest: "schema-digest",
    dumpSha256: "dump-digest",
    capturedAt: "2026-06-01T11:30:00.000Z",
  },
  restore: {
    sourceFingerprint: "source-fingerprint",
    targetFingerprint: "separate-restore-target",
    dumpSchemaDigest: "schema-digest",
    restoredSchemaDigest: "schema-digest",
    verifiedAt: "2026-06-01T11:40:00.000Z",
  },
  storedObject: {
    bucket: "private-backups",
    key: "database/dump",
    generation: "42",
    sha256: "dump-digest",
    privacy: "private",
    retentionUntil: "2026-07-01T00:00:00.000Z",
    verifiedAt: "2026-06-01T11:45:00.000Z",
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
    targetFingerprint: "source-fingerprint",
  }), { ok: true });
  assert.equal(validateRecoveryAttestation({ status: "pass" }, { now }).ok, false);
  assert.match(validateRecoveryAttestation({
    ...attestation,
    storedObject: { ...attestation.storedObject, generation: "" },
  }, { now }).reason, /evidence is incomplete|generation/);
  assert.match(validateRecoveryAttestation({
    ...attestation,
    restore: { ...attestation.restore, restoredSchemaDigest: "wrong" },
  }, { now }).reason, /schema digests/);
  assert.match(validateRecoveryAttestation({
    ...attestation,
    restore: { ...attestation.restore, targetFingerprint: "source-fingerprint" },
  }, { now }).reason, /separate restore target/);
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
    target: { classification: "approved-non-live" },
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
    target: { classification: "approved-non-live" },
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
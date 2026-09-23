// Unit tests only: fakeSDK boundaries exercise fail-closed policy and immutable
// object behavior. They make no network call and are not live retention proof.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { CRC32C } from "@google-cloud/storage";
import {
  createRecoveryStorage,
  retainAndReadBackRecoveryDump,
  verifyPrivateRetainedBucket,
} from "../scripts/recovery-private-store.mjs";

const crc32c = bytes => {
  const crc = new CRC32C();
  crc.update(bytes);
  return crc.toString();
};

function fakeSDK({ publicMember = false, retentionPeriod = 86400 } = {}) {
  const objects = new Map();
  const writes = [];
  let generation = 100;
  const metadataFor = (name, bytes) => ({
    name,
    generation: String(++generation),
    crc32c: crc32c(bytes),
    size: String(bytes.length),
  });
  const files = new Map();
  const file = (name, options = {}) => {
    const api = {
      async save(bytes, saveOptions) {
        assert.equal(saveOptions.preconditionOpts.ifGenerationMatch, 0);
        assert.equal(objects.has(name), false);
        const value = Buffer.from(bytes);
        objects.set(name, { bytes: value, metadata: metadataFor(name, value) });
        writes.push({ name, options: saveOptions });
      },
      async getMetadata() {
        return [objects.get(name).metadata];
      },
      createReadStream(readOptions) {
        assert.equal(readOptions.validation, "crc32c");
        const stored = objects.get(name);
        assert.equal(options.generation, stored.metadata.generation);
        return Readable.from(stored.bytes);
      },
    };
    files.set(name, api);
    return api;
  };
  const bucket = {
    iam: {
      async getPolicy() {
        return [{ bindings: publicMember ? [{ role: "roles/viewer", members: ["allUsers"] }] : [] }];
      },
    },
    async getMetadata() {
      return [{
        iamConfiguration: {
          publicAccessPrevention: "enforced",
          uniformBucketLevelAccess: { enabled: true },
        },
        retentionPolicy: { retentionPeriod, isLocked: true },
      }];
    },
    async upload(path, options) {
      assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
      assert.equal(options.validation, "crc32c");
      const bytes = await readFile(path);
      objects.set(options.destination, {
        bytes,
        metadata: metadataFor(options.destination, bytes),
      });
      writes.push({ name: options.destination, options });
      return [file(options.destination)];
    },
    file,
  };
  return { bucket, objects, writes };
}

test("fakeSDK: storage uses explicit bucket or validated sidecar default", async () => {
  let constructorOptions;
  class FakeStorage {
    constructor(options) { constructorOptions = options; }
    bucket(name) { return { name }; }
  }
  const explicit = await createRecoveryStorage({
    bucketId: "private-recovery-bucket",
    StorageClass: FakeStorage,
    fetchImpl: () => { throw new Error("must not fetch"); },
  });
  assert.equal(explicit.bucketId, "private-recovery-bucket");
  assert.equal(constructorOptions.credentials.type, "external_account");

  const selected = await createRecoveryStorage({
    StorageClass: FakeStorage,
    fetchImpl: async () => ({ ok: true, json: async () => ({ bucketId: "verified-default" }) }),
  });
  assert.equal(selected.bucketId, "verified-default");
});

test("fakeSDK: policy verification fails closed before any write", async () => {
  const fake = fakeSDK({ publicMember: true });
  await assert.rejects(
    verifyPrivateRetainedBucket(fake.bucket, 86400),
    /public member/,
  );
  assert.equal(fake.writes.length, 0);
  await assert.rejects(
    verifyPrivateRetainedBucket(fakeSDK({ retentionPeriod: 3600 }).bucket, 86400),
    /approved duration/,
  );
});

test("fakeSDK: create-only retained dump is restored from generation readback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recovery-private-store-test-"));
  try {
    const dumpPath = join(directory, "source.sql");
    const readbackPath = join(directory, "readback.sql");
    const bytes = Buffer.from("CREATE TABLE proof(id integer);\n");
    await writeFile(dumpPath, bytes, { mode: 0o600 });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const fake = fakeSDK();
    await verifyPrivateRetainedBucket(fake.bucket, 86400);
    const result = await retainAndReadBackRecoveryDump({
      bucket: fake.bucket,
      dumpPath,
      readbackPath,
      dumpSha256: sha256,
      sourceMajor: 16,
      sourceRevision: "a".repeat(40),
      currentSourceHash: "b".repeat(64),
      snapshotEvidence: {
        tableCount: 1,
        rowCountsSha256: "c".repeat(64),
        rowContentHashesSha256: "d".repeat(64),
        schemaDefinitionRecordCount: 2,
        schemaFingerprint: "e".repeat(64),
      },
      now: new Date("2026-01-02T03:04:05.000Z"),
      uuid: "fixed-id",
    });
    assert.deepEqual(await readFile(readbackPath), bytes);
    assert.equal(result.readback.sha256, sha256);
    assert.match(result.dumpObject.name, /^private-database-recovery\//);
    assert.equal(fake.writes.length, 2);
    assert.ok(fake.writes.every(write => write.options.preconditionOpts.ifGenerationMatch === 0));
    const manifest = JSON.parse(fake.objects.get(result.manifestObject.name).bytes);
    assert.equal(manifest.dump.generation, result.dumpObject.generation);
    assert.equal(manifest.consistentSnapshot, true);
    assert.equal(manifest.currentSourceHash, "b".repeat(64));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
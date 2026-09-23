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
  verifyManagedPrivateStorage,
} from "../scripts/recovery-private-store.mjs";

const crc32c = bytes => {
  const crc = new CRC32C();
  crc.update(bytes);
  return crc.toString();
};

function fakeSDK() {
  const objects = new Map();
  const writes = [];
  const deletes = [];
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
      async delete(deleteOptions) {
        assert.equal(deleteOptions.preconditionOpts.ifGenerationMatch, options.generation);
        deletes.push({ name, generation: options.generation });
        objects.delete(name);
      },
    };
    files.set(name, api);
    return api;
  };
  const bucket = {
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
  return { bucket, objects, writes, deletes };
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

test("fakeSDK: managed privacy uses a random canary, anonymous denial, then cleanup", async () => {
  const fake = fakeSDK();
  const canary = Buffer.from("nonsensitive-random-canary");
  let probed = false;
  const result = await verifyManagedPrivateStorage({
    bucket: fake.bucket,
    bucketId: "private-recovery-bucket",
    uuid: "fixed-canary",
    canaryBytes: canary,
    fetchImpl: async (url, options) => {
      probed = true;
      assert.match(url, /^https:\/\/storage\.googleapis\.com\/private-recovery-bucket\//);
      assert.equal(options.redirect, "manual");
      assert.equal(fake.deletes.length, 0);
      return { status: 403, redirected: false };
    },
  });
  assert.equal(probed, true);
  assert.equal(result.retention, "retained-until-explicit-delete");
  assert.equal(result.fixedDurationLocked, false);
  assert.equal(result.canaryRemoved, true);
  assert.equal(fake.deletes.length, 1);
  assert.equal(fake.objects.size, 0);
});

test("fakeSDK: anonymous success fails privacy verification but canary is removed after probe", async () => {
  const fake = fakeSDK();
  await assert.rejects(verifyManagedPrivateStorage({
    bucket: fake.bucket,
    bucketId: "private-recovery-bucket",
    canaryBytes: Buffer.from("nonsensitive-random-canary"),
    fetchImpl: async () => ({ status: 200, redirected: false }),
  }), /unexpected status 200/);
  assert.equal(fake.deletes.length, 1);
  assert.equal(fake.objects.size, 0);
});

test("fakeSDK: a failed anonymous request still occurs before canary cleanup", async () => {
  const fake = fakeSDK();
  await assert.rejects(verifyManagedPrivateStorage({
    bucket: fake.bucket,
    bucketId: "private-recovery-bucket",
    canaryBytes: Buffer.from("nonsensitive-random-canary"),
    fetchImpl: async () => {
      assert.equal(fake.deletes.length, 0);
      throw new Error("probe transport failed");
    },
  }), /probe transport failed/);
  assert.equal(fake.deletes.length, 1);
  assert.equal(fake.objects.size, 0);
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
    assert.equal(manifest.storageContract.retention, "retained-until-explicit-delete");
    assert.equal(manifest.storageContract.fixedDurationLocked, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
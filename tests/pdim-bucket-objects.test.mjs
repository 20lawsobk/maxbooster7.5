import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configuredPdimBucketObjects,
  PDIM_GCS_READ_RETRY_OPTIONS,
  PDIM_GCS_READ_TIMEOUT_MS,
  PDIM_GCS_WRITE_TIMEOUT_MS,
  PdimBucketObjects,
} from "../server/lib/pdimBucketObjects.ts";

function notFound() {
  return Object.assign(new Error("No such object"), { code: 404 });
}

function fakeBucket({ metadata, downloads }) {
  const calls = [];
  const baseFile = {
    metadata: {},
    async save(_bytes, options) {
      calls.push(["save", options]);
      this.metadata.generation = "saved-generation";
    },
    async getMetadata() {
      const next = metadata.shift();
      calls.push(["metadata", next]);
      if (next instanceof Error) throw next;
      const value = typeof next === "function" ? await next() : await next;
      return [typeof value === "string" ? { generation: value } : value];
    },
  };
  return {
    calls,
    bucket: {
      file(key, options) {
        if (!options) return baseFile;
        calls.push(["download", key, options.generation]);
        return {
          async download() {
            const next = downloads.shift();
            if (next instanceof Error) throw next;
            return [typeof next === "function" ? await next() : await next];
          },
        };
      },
    },
  };
}

test("pinned reads follow a confirmed concurrent generation replacement", async () => {
  const fixture = fakeBucket({
    metadata: ["11", "12", "12"],
    downloads: [notFound(), Buffer.from("latest")],
  });
  const store = new PdimBucketObjects(fixture.bucket);

  const result = await store.read("namespace/HEAD");

  assert.equal(result.generation, "12");
  assert.equal(result.bytes.toString(), "latest");
  assert.deepEqual(
    fixture.calls.filter(([kind]) => kind === "download").map(([, , generation]) => generation),
    ["11", "12"],
  );
});

test("a stable generation 404 remains a hard read failure", async () => {
  const fixture = fakeBucket({
    metadata: ["11", "11"],
    downloads: [notFound()],
  });
  const store = new PdimBucketObjects(fixture.bucket);

  await assert.rejects(store.read("namespace/HEAD"), error =>
    error.code === "PDIM_STORAGE_READ_FAILURE" && error.category === "not_found");
});

test("storage permission and service errors are categorized without provider text", async () => {
  const forbidden = Object.assign(new Error("sensitive provider response"), { code: 403 });
  const metadataFixture = fakeBucket({ metadata: [forbidden], downloads: [] });
  await assert.rejects(new PdimBucketObjects(metadataFixture.bucket).read("private/key"), error =>
    error.code === "PDIM_STORAGE_READ_FAILURE" &&
    error.category === "access_denied" &&
    !error.message.includes("sensitive provider response"));

  const unavailable = Object.assign(new Error("sensitive provider response"), { code: 503 });
  const downloadFixture = fakeBucket({ metadata: ["11"], downloads: [unavailable] });
  await assert.rejects(new PdimBucketObjects(downloadFixture.bucket).read("private/key"), error =>
    error.code === "PDIM_STORAGE_READ_FAILURE" &&
    error.category === "service_unavailable" &&
    !error.message.includes("sensitive provider response"));
});

test("a genuinely missing object is reported as missing, not initialized", async () => {
  const fixture = fakeBucket({
    metadata: [notFound()],
    downloads: [],
  });
  const store = new PdimBucketObjects(fixture.bucket);

  assert.equal(await store.read("namespace/HEAD"), null);
});

test("deletion during a pinned read remains a missing-object result", async () => {
  const fixture = fakeBucket({
    metadata: ["11", notFound()],
    downloads: [notFound()],
  });
  const store = new PdimBucketObjects(fixture.bucket);

  assert.equal(await store.read("namespace/HEAD"), null);
});

test("slow metadata reads fail at the configured deadline without exposing provider details", async () => {
  const fixture = fakeBucket({
    metadata: [() => new Promise(resolve => setTimeout(() => resolve({ generation: "11" }), 120))],
    downloads: [],
  });
  const store = new PdimBucketObjects(fixture.bucket);
  const startedAt = performance.now();

  await assert.rejects(
    store.read("namespace/HEAD", { phase: "journal_frame", sequence: 3, deadlineAt: startedAt + 15 }),
    error => error.code === "PDIM_READ_TIMEOUT" &&
      error.phase === "journal_frame" && error.sequence === 3,
  );
  assert.ok(performance.now() - startedAt < 100);
  assert.equal(fixture.calls.filter(([kind]) => kind === "download").length, 0);
});

test("slow generation-pinned downloads fail at the same bounded read deadline", async () => {
  const fixture = fakeBucket({
    metadata: ["11"],
    downloads: [() => new Promise(resolve => setTimeout(() => resolve(Buffer.from("late")), 120))],
  });
  const store = new PdimBucketObjects(fixture.bucket);
  const startedAt = performance.now();

  await assert.rejects(
    store.read("namespace/HEAD", { phase: "snapshot_shard", ordinal: 2, deadlineAt: startedAt + 15 }),
    error => error.code === "PDIM_READ_TIMEOUT" &&
      error.phase === "snapshot_shard" && error.ordinal === 2,
  );
  assert.ok(performance.now() - startedAt < 100);
});

test("configured PDIM storage bounds writes and isolates recovery read settings", async () => {
  const calls = [];
  const normalFixture = fakeBucket({
    metadata: ["10"],
    downloads: [Buffer.from("normal-read")],
  });
  const readFixture = fakeBucket({
    metadata: ["11"],
    downloads: [Buffer.from("recovery-read")],
  });
  const store = await configuredPdimBucketObjects({
    env: { Replit_storage_bucket_id: "configured-bucket" },
    storageFactory: async options => {
      calls.push(options);
      return {
        bucket: calls.length === 1 ? normalFixture.bucket : readFixture.bucket,
        bucketId: options.bucketId,
      };
    },
  });

  assert.equal((await store.read("namespace/HEAD")).bytes.toString(), "normal-read");
  assert.equal((await store.read("namespace/HEAD", {
    phase: "journal_frame", sequence: 1, deadlineAt: performance.now() + 1_000,
  })).bytes.toString(), "recovery-read");
  await store.write("namespace/HEAD", Buffer.from("write"), "11");
  assert.equal(calls[1].timeoutMs, PDIM_GCS_READ_TIMEOUT_MS);
  assert.deepEqual(calls[1].retryOptions, PDIM_GCS_READ_RETRY_OPTIONS);
  assert.deepEqual(calls[0], {
    bucketId: "configured-bucket",
    timeoutMs: PDIM_GCS_WRITE_TIMEOUT_MS,
  });
  assert.equal(normalFixture.calls.filter(([kind]) => kind === "save").length, 1);
  const writeOptions = normalFixture.calls.find(([kind]) => kind === "save")[1];
  assert.equal(writeOptions.timeout, PDIM_GCS_WRITE_TIMEOUT_MS);
  assert.equal(writeOptions.preconditionOpts.ifGenerationMatch, "11");
});

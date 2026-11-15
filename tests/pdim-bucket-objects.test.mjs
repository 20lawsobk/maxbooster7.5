import { test } from "node:test";
import assert from "node:assert/strict";
import { PdimBucketObjects } from "../server/lib/pdimBucketObjects.ts";

function notFound() {
  return Object.assign(new Error("No such object"), { code: 404 });
}

function fakeBucket({ metadata, downloads }) {
  const calls = [];
  const baseFile = {
    async getMetadata() {
      const next = metadata.shift();
      calls.push(["metadata", next]);
      if (next instanceof Error) throw next;
      return [{ generation: next }];
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
            return [next];
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

  await assert.rejects(store.read("namespace/HEAD"), error => error.code === 404);
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

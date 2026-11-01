import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable, Readable } from "node:stream";
import { archivePdimStaging } from "../scripts/archive-pdim-staging.mjs";

function bucketFixture(corrupt = false) {
  const objects = new Map();
  return { file(name) {
    return {
      name,
      createWriteStream() {
        const chunks = [];
        return new Writable({
          write(chunk, _enc, done) { chunks.push(Buffer.from(chunk)); done(); },
          final(done) { objects.set(name, Buffer.concat(chunks)); done(); },
        });
      },
      async save(bytes) { objects.set(name, Buffer.from(bytes)); },
      async getMetadata() { return [{ generation: "1", size: String(objects.get(name).length) }]; },
      createReadStream() { return Readable.from([corrupt ? Buffer.from("corrupt") : objects.get(name)]); },
      async download() { return [objects.get(name)]; },
    };
  } };
}

for (const mode of ["archive-only", "verified-removal", "corrupt-readback"]) {
  test(`staging archival: ${mode}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdim-archive-test-"));
    const name = "local-pdim-store.json.async-999999999-1";
    try {
      await writeFile(join(directory, name), "retained fixture");
      await writeFile(join(directory, "local-pdim-store.json"), "active fixture");
      const operation = archivePdimStaging({
        directory, bucket: bucketFixture(mode === "corrupt-readback"), prefix: "isolated-test",
        removeVerified: mode !== "archive-only", progress() {},
      });
      if (mode === "corrupt-readback") await assert.rejects(operation, /readback mismatch/);
      else assert.equal((await operation).length, 1);
      assert.equal(await readFile(join(directory, "local-pdim-store.json"), "utf8"), "active fixture");
      if (mode === "verified-removal") await assert.rejects(readFile(join(directory, name)), { code: "ENOENT" });
      else assert.equal(await readFile(join(directory, name), "utf8"), "retained fixture");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

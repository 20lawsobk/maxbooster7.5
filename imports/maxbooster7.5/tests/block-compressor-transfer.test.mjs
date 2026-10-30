import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { brotliDecompressSync } from "node:zlib";

test("real compression worker transfers exact owned buffers for pooled and large results", { timeout: 20000 }, async () => {
  const worker = new Worker(new URL("../server/workers/blockCompressor.cjs", import.meta.url));
  try {
    const [ready] = await once(worker, "message");
    assert.equal(ready.ready, true);
    let id = 0;
    async function request(type, data) {
      const pending = once(worker, "message");
      const current = ++id;
      worker.postMessage({ id: current, type, data });
      const [reply] = await pending;
      assert.equal(reply.id, current);
      assert.equal(reply.error, undefined);
      assert.equal(reply.result.byteOffset, 0);
      assert.equal(reply.result.buffer.byteLength, reply.result.byteLength);
      return Buffer.from(reply.result);
    }
    for (const input of [Buffer.alloc(0), Buffer.from("small pooled result"), Buffer.alloc(65536, 42), randomBytes(32768)]) {
      const encoded = await request("compress", input);
      assert.deepEqual(brotliDecompressSync(encoded), input);
      assert.deepEqual(await request("decompress", encoded), input);
    }
  } finally {
    await worker.terminate();
  }
});

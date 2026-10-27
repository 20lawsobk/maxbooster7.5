import { test } from "node:test";
import assert from "node:assert/strict";
import { ReplitChunkStore } from "../external/pdim/artifacts/api-server/src/pocket-dimension/fabric/storage/ReplitChunkStore.ts";

test("Replit deletion requests idempotent absence and retains the physical node namespace", async () => {
  const store = new ReplitChunkStore("node-a");
  const calls = [];
  store.client = { delete: async (...args) => { calls.push(args); return { ok: true, value: null }; } };
  await store.deleteChunk("abcd");
  assert.deepEqual(calls, [["fabric-chunks/node-a/ab/abcd", { ignoreNotFound: true }]]);
});

test("resolved SDK deletion errors reject before accounting can be credited", async () => {
  const store = new ReplitChunkStore("node-a");
  store.client = { delete: async () => ({ ok: false, error: { message: "permission denied", statusCode: 403 } }) };
  await assert.rejects(store.deleteChunk("abcd"), /deleteChunk failed: permission denied/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { PocketDimension } from "../server/pocket-dimension/index.ts";

function fixture() {
  const values = new Map();
  let failDelete = false;
  const storage = {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); return "OK"; },
    del: async (...keys) => {
      if (failDelete && keys.some(key => key.startsWith("pdim:chunk:"))) throw new Error("owned backing unavailable");
      return keys.reduce((count, key) => count + Number(values.delete(key)), 0);
    },
  };
  const open = async () => {
    const pocket = new PocketDimension({ id: "delete-fixture", name: "delete-fixture", enableDeduplication: true,
      enableVersioning: false, storage });
    await pocket.open(); return pocket;
  };
  return { values, open, fail: value => { failDelete = value; } };
}

test("pocket deletion persists immediately and retains chunks still referenced by another entry", async () => {
  const target = fixture(), pocket = await target.open();
  const data = Buffer.from("shared deterministic private storage fixture".repeat(30));
  await pocket.write("a", data); await pocket.write("b", data);
  const chunkKeys = [...target.values.keys()].filter(key => key.startsWith("pdim:chunk:"));
  assert.ok(chunkKeys.length > 0);
  assert.equal(await pocket.delete("a"), true);
  const reopened = await target.open();
  await assert.rejects(reopened.read("a"), /Entry not found/);
  assert.ok((await reopened.read("b")).equals(data));
  assert.ok(chunkKeys.every(key => target.values.has(key)));
  assert.equal(await reopened.delete("b"), true);
  assert.ok(chunkKeys.every(key => !target.values.has(key)));
  assert.equal((await target.open()).getMetadata().totalSize, 0);
});

test("failed physical reclamation resumes from a persisted receipt after reopening", async () => {
  const target = fixture(), pocket = await target.open();
  await pocket.write("a", Buffer.from("reclamation failure fixture".repeat(30)));
  target.fail(true);
  await assert.rejects(pocket.delete("a"), /owned backing unavailable/);
  assert.ok([...target.values.keys()].some(key => key.startsWith("pdim:delete:")));
  const reopened = await target.open();
  await assert.rejects(reopened.read("a"), /Entry not found/);
  target.fail(false);
  assert.equal(await reopened.delete("a"), true);
  assert.ok([...target.values.keys()].every(key => !key.startsWith("pdim:chunk:") && !key.startsWith("pdim:delete:")));
  assert.equal((await target.open()).getMetadata().totalSize, 0);
});

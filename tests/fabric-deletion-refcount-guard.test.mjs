import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = await readFile(new URL("../external/pdim/lib/db/src/fabricDeletion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const { DurableDeletionOutbox } = loaded.exports;

function fixture(initialCount) {
  let chunk = initialCount === null ? null : {
    id: "chunk", ref_count: initialCount, node_ids: ["node"], size_bytes: 5,
  };
  const job = { object_id: "object", ordinal: 0, chunk_id: "chunk", state: "pending", location: null, done_nodes: [] };
  let removed = 0;
  const sql = (strings, ...values) => ({ text: strings.join("?"), values });
  const execute = async ({ text, values }) => {
    if (text.includes("SELECT object_id,ordinal FROM fabric_deletion_chunks")) return [{ object_id: job.object_id, ordinal: 0 }];
    if (text.includes("SELECT * FROM fabric_deletion_chunks")) return [{ ...job }];
    if (text.includes("UPDATE fabric_chunks") && text.includes("SET ref_count=ref_count-1")) {
      if (!chunk || (text.includes("ref_count > 0") && chunk.ref_count <= 0)) return [];
      chunk.ref_count -= 1;
      return [{ ...chunk }];
    }
    if (text.includes("UPDATE fabric_deletion_chunks SET state='complete'")) { job.state = "complete"; return []; }
    if (text.includes("DELETE FROM fabric_chunks")) { chunk = null; return []; }
    if (text.includes("UPDATE fabric_deletion_chunks SET state=")) {
      job.state = values[0]; job.location = JSON.parse(values[1]); return [];
    }
    if (text.includes("SELECT done_nodes,location FROM fabric_deletion_chunks")) return [{ ...job }];
    if (text.includes("UPDATE fabric_storage_nodes")) return [{ id: "node" }];
    if (text.includes("UPDATE fabric_deletion_chunks SET done_nodes")) {
      job.done_nodes.push(...JSON.parse(values[0])); return [];
    }
    return [];
  };
  const db = { execute, transaction: async work => work({ execute }) };
  const outbox = new DurableDeletionOutbox(db, async (_id, work) => work(), sql);
  return {
    outbox, job, get count() { return chunk?.ref_count ?? null; },
    get removed() { return removed; },
    remove: async () => { removed++; },
  };
}

test("zero reference count fails closed without deleting physical bytes or completing journal", async () => {
  const state = fixture(0);
  await assert.rejects(state.outbox.drainChunk("chunk", state.remove), /Deletion chunk reference missing or invalid/);
  assert.equal(state.count, 0);
  assert.equal(state.removed, 0);
  assert.equal(state.job.state, "pending");
});

test("missing chunk index fails closed instead of silently completing journal", async () => {
  const state = fixture(null);
  await assert.rejects(state.outbox.drainChunk("chunk", state.remove), /Deletion chunk reference missing or invalid/);
  assert.equal(state.removed, 0);
  assert.equal(state.job.state, "pending");
});

test("shared chunk decrements one reference and retains physical bytes", async () => {
  const state = fixture(2);
  await state.outbox.drainChunk("chunk", state.remove);
  assert.equal(state.count, 1);
  assert.equal(state.removed, 0);
  assert.equal(state.job.state, "complete");
});

test("last valid reference removes physical bytes and records completion", async () => {
  const state = fixture(1);
  await state.outbox.drainChunk("chunk", state.remove);
  assert.equal(state.count, null);
  assert.equal(state.removed, 1);
  assert.equal(state.job.state, "complete");
  assert.deepEqual(state.job.done_nodes, ["node"]);
});

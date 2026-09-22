import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "fabric-deletion-test-"));
let state;
function seed(refs = 1) {
  state = {
    object: { id: "object", chunk_ids: ["chunk"] },
    outbox: null, job: null,
    chunk: { id: "chunk", ref_count: refs, node_ids: ["a", "b"], size_bytes: 10 },
    usage: { a: 10, b: 10 },
  };
}
async function execute({ text, values: v }) {
  if (text.startsWith("DELETE FROM fabric_objects")) {
    const old = state.object; state.object = null; return old ? [old] : [];
  }
  if (text.startsWith("INSERT INTO fabric_deletion_objects")) {
    state.outbox = JSON.parse(v[1]); return [];
  }
  if (text.startsWith("INSERT INTO fabric_deletion_chunks")) {
    state.job = { object_id: v[0], ordinal: v[1], chunk_id: v[2], state: "pending", done_nodes: [] }; return [];
  }
  if (text.startsWith("SELECT object_id,ordinal FROM")) return state.job?.state !== "complete" ? [structuredClone(state.job)] : [];
  if (text.startsWith("SELECT * FROM fabric_deletion_chunks")) return [structuredClone(state.job)];
  if (text.startsWith("UPDATE fabric_chunks")) { state.chunk.ref_count--; return [structuredClone(state.chunk)]; }
  if (text.startsWith("DELETE FROM fabric_chunks")) { state.chunk = null; return []; }
  if (text.startsWith("UPDATE fabric_deletion_chunks SET state=?")) {
    state.job.state = v[0]; state.job.location = JSON.parse(v[1]); return [];
  }
  if (text.startsWith("SELECT done_nodes")) return [{ done_nodes: [...state.job.done_nodes] }];
  if (text.startsWith("UPDATE fabric_storage_nodes")) { state.usage[v[1]] -= v[0]; return [{ id: v[1] }]; }
  if (text.startsWith("UPDATE fabric_deletion_chunks SET done_nodes")) {
    state.job.done_nodes.push(...JSON.parse(v[0])); return [];
  }
  if (text.startsWith("UPDATE fabric_deletion_chunks SET state='complete'")) { state.job.state = "complete"; return []; }
  if (text.startsWith("SELECT 1 FROM fabric_deletion_chunks")) return state.job.state === "complete" ? [] : [{}];
  if (text.startsWith("DELETE FROM fabric_segments")) return [];
  if (text.startsWith("DELETE FROM fabric_deletion_chunks")) { state.job = null; return []; }
  if (text.startsWith("DELETE FROM fabric_deletion_objects")) { state.outbox = null; return []; }
  throw new Error(`Unmocked query: ${text}`);
}
globalThis.fixtureDb = {
  execute,
  async transaction(fn) {
    const before = structuredClone(state);
    try { return await fn({ execute }); }
    catch (err) { state = before; throw err; }
  },
};
try {
  const output = join(dir, "repository.mjs");
  await build({
    entryPoints: ["external/pdim/artifacts/api-server/src/pocket-dimension/fabric/infra/DeletionOutbox.ts"],
    bundle: true, platform: "node", format: "esm", outfile: output,
    plugins: [{ name: "fixtures-only", setup(b) {
      b.onResolve({ filter: /lib\/db\.js|^drizzle-orm$/ }, args => ({ path: args.path, namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({
        contents: args.path === "drizzle-orm"
          ? `export const sql=(s,...values)=>({text:s.join("?").replace(/\\s+/g," ").trim(),values});`
          : `export const db=globalThis.fixtureDb;`,
      }));
    } }],
  });
  const { DeletionOutbox } = await import(pathToFileURL(output));
  const outbox = new DeletionOutbox();
  seed();
  await outbox.claim("object");
  assert.equal(state.object, null);
  assert.equal(state.outbox.id, "object");
  let unavailable = true;
  const calls = [];
  async function remove(node) {
    calls.push(node);
    if (node === "b" && unavailable) throw new Error("node offline");
  }
  await assert.rejects(outbox.drainChunk("chunk", remove), /node offline/);
  assert.deepEqual(state.usage, { a: 0, b: 10 });
  assert.equal(state.job.state, "released");
  assert.equal(state.chunk, null);
  unavailable = false;
  await outbox.drainChunk("chunk", remove);
  assert.deepEqual(calls, ["a", "b", "b"]);
  assert.deepEqual(state.usage, { a: 0, b: 0 });
  await outbox.finish("object");
  assert.equal(state.outbox, null);
  seed(2);
  await outbox.claim("object");
  await outbox.drainChunk("chunk", async () => { throw new Error("Shared chunk must not be physically deleted"); });
  assert.equal(state.chunk.ref_count, 1);
  assert.deepEqual(state.usage, { a: 10, b: 10 });
  console.log("PASS D5: durable claim; node failure retains usage/progress; retry accounts once; shared reference preserved");
} finally {
  await rm(dir, { recursive: true, force: true });
}
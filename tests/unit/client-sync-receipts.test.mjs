import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("transactional receipt repository deduplicates, binds payload/owner and rolls back uncertain commits", async () => {
  const compiled = await build({
    entryPoints: ["server/repositories/clientSyncReceipts.ts"], bundle: true, write: false,
    platform: "node", format: "esm",
    plugins: [{ name: "no-live-database", setup(b) {
      b.onResolve({ filter: /\/db\.js$|^drizzle-orm$/ }, args => ({ path: args.path, namespace: "boundary" }));
      b.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: args.path === "drizzle-orm"
        ? `export function sql(strings,...values){return {text:strings.join("?"),values}}; sql.join=values=>values;`
        : "export const db = {};" }));
    } }],
  });
  const { createReceiptRepository, operationFingerprint } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  let state = { effects: 0, rows: new Map() };
  let failInsert = false;
  let tail = Promise.resolve();
  const execute = (working, statement) => {
    const args = statement.values;
    if (/advisory_xact_lock/.test(statement.text)) return { rows: [] };
    if (/SELECT payload_hash/.test(statement.text)) return { rows: [working.rows.get(`${args[0]}:${args[1]}`)].filter(Boolean) };
    if (/INSERT INTO/.test(statement.text)) {
      if (failInsert) throw Error("connection failed before commit");
      working.rows.set(`${args[0]}:${args[1]}`, { payload_hash: args[2], receipt: JSON.parse(args[3]) });
      return { rows: [] };
    }
    throw Error(`Unexpected test SQL: ${statement.text}`);
  };
  const repository = createReceiptRepository({
    transaction(handler) {
      const operation = tail.then(async () => {
        const working = structuredClone(state);
        const result = await handler({
          execute: async statement => execute(working, statement),
          mutate: () => { working.effects++; },
        });
        state = working;
        return result;
      });
      tail = operation.catch(() => {});
      return operation;
    },
    execute: async statement => execute(state, statement),
  });
  const operation = { id: "operation-1", type: "project.create", payload: { title: "Real command" } };
  const apply = owner => repository.apply(owner, operation, async tx => {
    tx.mutate();
    return { success: true, data: { projectId: "committed-id" } };
  });
  const [first, retry] = await Promise.all([apply("A"), apply("A")]);
  assert.deepEqual(first, retry);
  assert.equal(first.receipt, true);
  assert.equal(first.outcome, "applied");
  assert.equal(state.effects, 1);
  await apply("B");
  assert.equal(state.effects, 2);
  await assert.rejects(repository.apply("A", { ...operation, payload: { title: "changed" } }, async () => {
    throw Error("must never run");
  }), /different payload/);
  assert.equal(state.effects, 2);
  failInsert = true;
  await assert.rejects(repository.apply("A", { ...operation, id: "uncertain" }, async tx => {
    tx.mutate();
    return { success: true };
  }), /before commit/);
  assert.equal(state.effects, 2);
  assert.equal(state.rows.has("A:uncertain"), false);
  failInsert = false;
  await repository.apply("A", { ...operation, id: "uncertain" }, async tx => {
    tx.mutate(); return { success: true };
  });
  assert.equal(state.effects, 3);
  assert.equal(operationFingerprint({ ...operation, payload: { a: 1, b: 2 } }),
    operationFingerprint({ ...operation, payload: { b: 2, a: 1 } }));
  const clientCode = await build({
    entryPoints: ["client/src/lib/offline/operationFingerprint.ts"], bundle: true, write: false, format: "esm",
  });
  const client = await import(`data:text/javascript;base64,${Buffer.from(clientCode.outputFiles[0].text).toString("base64")}`);
  const structured = { ...operation, payload: { z: [1, { "é": true, A: "value" }], a: null } };
  assert.equal(await client.operationFingerprint(structured), operationFingerprint(structured));
});
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../external/pdim/lib/db/src/fabricDeletion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { DurableDeletionOutbox } = loaded.exports;

function fixture({ missing = '', firstFailure = false } = {}) {
  const queries = [];
  let failures = 0;
  const sql = (strings, ...values) => ({ text: strings.join('?'), values });
  const execute = async ({ text }) => {
    queries.push(text);
    if (missing && text.includes(missing) && (!firstFailure || failures++ === 0)) {
      throw new Error(`relation ${missing} does not exist`);
    }
    return [];
  };
  const db = { execute, transaction: async work => work({ execute }) };
  return { queries, outbox: new DurableDeletionOutbox(db, async (_key, work) => work(), sql) };
}

test('startup checks migrated tables and columns without creating schema', async () => {
  const { queries, outbox } = fixture();
  await outbox.initialize();
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => /^SELECT /i.test(query)));
  assert.ok(queries.some(query => query.includes('fabric_deletion_objects')));
  assert.ok(queries.some(query => query.includes('fabric_deletion_chunks')));
  assert.ok(queries.some(query => query.includes('fabric_chunks')));
  assert.ok(queries.some(query => query.includes('ref_count')));
  await outbox.initialize();
  assert.equal(queries.length, 3, 'successful readiness check should be cached');
});

test('missing migration fails closed and never creates a table at runtime', async () => {
  const { queries, outbox } = fixture({ missing: 'fabric_deletion_chunks' });
  await assert.rejects(outbox.initialize(), /does not exist/);
  assert.ok(queries.every(query => /^SELECT /i.test(query)));
  await assert.rejects(outbox.pendingObjects(), /does not exist/);
  assert.ok(queries.every(query => /^SELECT /i.test(query)));
});

test('failed readiness is retryable after migration becomes available', async () => {
  const { queries, outbox } = fixture({ missing: 'fabric_deletion_chunks', firstFailure: true });
  await assert.rejects(outbox.initialize(), /does not exist/);
  await outbox.initialize();
  assert.ok(queries.filter(query => query.includes('fabric_deletion_chunks')).length >= 2);
  assert.ok(queries.every(query => /^SELECT /i.test(query)));
});

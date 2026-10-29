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

function fixture({ claimed = false, pending = false, segments = true, failJournal = false } = {}) {
  const queries = [];
  const sql = (strings, ...values) => ({ text: strings.join('?'), values });
  const execute = async ({ text }) => {
    queries.push(text);
    if (text.includes('SELECT 1 FROM fabric_deletion_objects')) {
      if (failJournal) throw new Error('deletion journal unavailable');
      return claimed ? [{ present: 1 }] : [];
    }
    if (text.includes('SELECT 1 FROM fabric_deletion_chunks')) return pending ? [{ present: 1 }] : [];
    return [];
  };
  const db = { execute, transaction: async work => work({ execute }) };
  return { queries, outbox: new DurableDeletionOutbox(db, async (_key, work) => work(), sql, { segments }) };
}

test('missing deletion journal never removes live object segments', async () => {
  const { queries, outbox } = fixture();
  assert.equal(await outbox.finish('still-live'), false);
  assert.deepEqual(queries, ['SELECT 1 FROM fabric_deletion_objects WHERE object_id=? FOR UPDATE']);
});

test('unfinished journal retains all metadata and segments', async () => {
  const { queries, outbox } = fixture({ claimed: true, pending: true });
  assert.equal(await outbox.finish('pending'), false);
  assert.equal(queries.filter(query => query.startsWith('DELETE')).length, 0);
});

test('claimed and fully drained journal cleans segments and journal in order', async () => {
  const { queries, outbox } = fixture({ claimed: true });
  assert.equal(await outbox.finish('drained'), true);
  assert.deepEqual(queries.filter(query => query.startsWith('DELETE')), [
    'DELETE FROM fabric_segments WHERE object_id=?',
    'DELETE FROM fabric_deletion_chunks WHERE object_id=?',
    'DELETE FROM fabric_deletion_objects WHERE object_id=?',
  ]);
});

test('non-segmented fabric does not delete segments', async () => {
  const { queries, outbox } = fixture({ claimed: true, segments: false });
  assert.equal(await outbox.finish('drained'), true);
  assert.equal(queries.some(query => query.includes('DELETE FROM fabric_segments')), false);
});

test('journal lookup outage fails closed before any delete', async () => {
  const { queries, outbox } = fixture({ failJournal: true });
  await assert.rejects(outbox.finish('still-live'), /deletion journal unavailable/);
  assert.equal(queries.some(query => query.startsWith('DELETE')), false);
});

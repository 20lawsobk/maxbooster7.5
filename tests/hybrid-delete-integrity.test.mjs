import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the committed service method, not a rewritten policy approximation.
const source = fs.readFileSync('server/services/hybridStorageService.ts', 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'HybridStorageService');
assert.ok(service, 'HybridStorageService class exists');
const method = service.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === 'delete');
assert.ok(method, 'HybridStorageService.delete method exists');
const js = ts.transpileModule(`class TestStorage { ${method.getText(ast)} }; globalThis.TestStorage = TestStorage;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const context = vm.createContext({ logger: { info() {}, warn() {} } });
vm.runInContext(js, context);

function setup({ owner = 'alice', primaryPublic = false, duplicate = false, duplicatePublic = false, pocketResult = true } = {}) {
  const hash = 'sha256-a';
  const primary = { key: 'primary', userId: owner, contentHash: hash, isDeduplicated: false, isPublic: primaryPublic };
  const entries = [['primary', primary]];
  if (duplicate) entries.push(['duplicate', {
    key: 'duplicate', userId: 'bob', contentHash: hash,
    isDeduplicated: true, deduplicationRef: 'primary', isPublic: duplicatePublic,
  }]);
  const index = new Map(entries);
  const hashIndex = new Map([[hash, entries.map(([key]) => key)]]);
  const publicIndex = new Map();
  if (primaryPublic) publicIndex.set(hash, 'primary');
  if (duplicatePublic) publicIndex.set(hash, 'duplicate');
  const events = { deleted: [], saved: 0 };
  const s = new context.TestStorage();
  Object.assign(s, {
    initialize: async () => {}, fileIndex: index, contentHashIndex: hashIndex,
    publicContentHashes: publicIndex,
    coldPocket: { async delete(key) {
      events.deleted.push(key);
      if (pocketResult instanceof Error) throw pocketResult;
      return pocketResult;
    } },
    saveIndex: async () => { events.saved++; },
  });
  return { s, index, hashIndex, publicIndex, events };
}

test('shared primary cannot be removed while deduplicated file references its bytes', async () => {
  const { s, index, events } = setup({ duplicate: true });
  assert.equal(await s.delete('alice', 'primary'), false);
  assert.equal(index.has('primary'), true);
  assert.equal(index.get('duplicate').deduplicationRef, 'primary');
  assert.deepEqual(events.deleted, []);
  assert.equal(events.saved, 0);
});

test('public shared primary cannot be removed even if another account references it', async () => {
  const { s, index, publicIndex } = setup({ duplicate: true, primaryPublic: true });
  assert.equal(await s.delete('alice', 'primary'), false);
  assert.equal(index.has('primary'), true);
  assert.equal(publicIndex.get('sha256-a'), 'primary');
});

test('single primary deletion requires acknowledged physical deletion', async () => {
  const { s, index, events } = setup();
  assert.equal(await s.delete('alice', 'primary'), true);
  assert.equal(index.has('primary'), false);
  assert.deepEqual(events.deleted, ['storage/primary']);
  assert.equal(events.saved, 1);
});

test('backend rejection cannot report deletion success or discard metadata', async () => {
  const { s, index, events } = setup({ pocketResult: new Error('PDIM unavailable') });
  await assert.rejects(() => s.delete('alice', 'primary'), /PDIM unavailable/);
  assert.equal(index.has('primary'), true);
  assert.equal(events.saved, 0);
});

test('backend false cannot report deletion success or discard metadata', async () => {
  const { s, index, events } = setup({ pocketResult: false });
  assert.equal(await s.delete('alice', 'primary'), false);
  assert.equal(index.has('primary'), true);
  assert.equal(events.saved, 0);
});

test('removing a deduplicated reference does not delete primary bytes', async () => {
  const { s, index, events, hashIndex } = setup({ duplicate: true });
  assert.equal(await s.delete('bob', 'duplicate'), true);
  assert.equal(index.has('primary'), true);
  assert.equal(index.has('duplicate'), false);
  assert.deepEqual(events.deleted, []);
  assert.deepEqual(hashIndex.get('sha256-a'), ['primary']);
});

test('removing public duplicate does not leave dangling public hash', async () => {
  const { s, publicIndex } = setup({ duplicate: true, duplicatePublic: true });
  assert.equal(await s.delete('bob', 'duplicate'), true);
  assert.equal(publicIndex.has('sha256-a'), false);
});

test('public hash reselects surviving public primary', async () => {
  const { s, publicIndex } = setup({ duplicate: true, primaryPublic: true, duplicatePublic: true });
  assert.equal(await s.delete('bob', 'duplicate'), true);
  assert.equal(publicIndex.get('sha256-a'), 'primary');
});

test('wrong account cannot delete another account file', async () => {
  const { s, index, events } = setup();
  await assert.rejects(() => s.delete('bob', 'primary'), /Access denied/);
  assert.equal(index.has('primary'), true);
  assert.deepEqual(events.deleted, []);
});

test('unknown key returns false without backend operations', async () => {
  const { s, events } = setup();
  assert.equal(await s.delete('alice', 'missing'), false);
  assert.deepEqual(events.deleted, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync('server/services/hybridStorageService.ts', 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'HybridStorageService');
assert.ok(service, 'production HybridStorageService must exist');
function getMethod(name) {
  const node = service.members.find(member => ts.isMethodDeclaration(member) && member.name?.getText(ast) === name);
  assert.ok(node, 'production ' + name + ' must exist');
  return node.getText(ast);
}
const upload = getMethod('upload');
const commit = getMethod('commitUploadIndex');
assert.equal((upload.match(/await this\.commitUploadIndex\(/g) || []).length, 3, 'all upload branches must use rollback-safe registration');
assert.doesNotMatch(upload, /this\.fileIndex\.set\(/, 'upload must not bypass index registration');
const js = ts.transpileModule(
  'class TestStorage { ' + commit + '\n' + upload + ' }; globalThis.TestStorage = TestStorage;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function setup({ saveError = null } = {}) {
  const ctx = vm.createContext({ logger: { info() {} }, Buffer });
  vm.runInContext(js, ctx);
  const storage = new ctx.TestStorage();
  let saves = 0, writes = 0, sequence = 0;
  Object.assign(storage, {
    fileIndex: new Map(),
    contentHashIndex: new Map(),
    publicContentHashes: new Map(),
    initialize: async () => {},
    computeContentHash: bytes => createHash('sha256').update(bytes).digest('hex'),
    generateFileKey: userId => 'users/' + userId + '/generated-' + (++sequence),
    determineInitialTier: () => 'cold',
    coldPocket: { write: async () => { writes++; return { compressedSize: 4 }; } },
    saveIndex: async () => { saves++; if (saveError) throw saveError; },
  });
  return { storage, get saves() { return saves; }, get writes() { return writes; } };
}
const bytes = Buffer.from('same bytes');
const hash = createHash('sha256').update(bytes).digest('hex');
const send = (f, user, options) => f.storage.upload(user, 'a.txt', bytes, 'text/plain', options);

test('fresh primary upload persists ownership and public indexes', async () => {
  const f = setup();
  const result = await send(f, 'owner', { isPublic: true });
  assert.equal(result.isDeduplicated, false);
  assert.equal(f.storage.fileIndex.get(result.key).userId, 'owner');
  assert.deepEqual(Array.from(f.storage.contentHashIndex.get(hash)), [result.key]);
  assert.equal(f.storage.publicContentHashes.get(hash), result.key);
  assert.equal(f.writes, 1);
  assert.equal(f.saves, 1);
});

test('failed primary index persistence rejects and rolls back all indexes', async () => {
  const failure = new Error('simulated PDIM index outage');
  const f = setup({ saveError: failure });
  await assert.rejects(() => send(f, 'owner', { isPublic: true }), error => error === failure);
  assert.equal(f.storage.fileIndex.size, 0);
  assert.equal(f.storage.contentHashIndex.size, 0);
  assert.equal(f.storage.publicContentHashes.size, 0);
  assert.equal(f.writes, 1, 'orphan bytes require durable SQL cleanup');
  assert.equal(f.saves, 1);
});

test('failed deduplicated upload does not leave phantom alias', async () => {
  const f = setup();
  const primary = await send(f, 'owner');
  f.storage.saveIndex = async () => { throw new Error('index unavailable'); };
  await assert.rejects(() => send(f, 'second'), /index unavailable/);
  assert.deepEqual(Array.from(f.storage.contentHashIndex.get(hash)), [primary.key]);
  assert.equal(f.storage.fileIndex.size, 1);
  assert.equal(f.writes, 1);
});

test('failed public deduplication preserves existing public pointer', async () => {
  const f = setup();
  const primary = await send(f, 'owner', { isPublic: true });
  f.storage.saveIndex = async () => { throw new Error('index unavailable'); };
  await assert.rejects(() => send(f, 'second', { isPublic: true }), /index unavailable/);
  assert.equal(f.storage.publicContentHashes.get(hash), primary.key);
  assert.deepEqual(Array.from(f.storage.contentHashIndex.get(hash)), [primary.key]);
});

test('key collision fails before any persistence attempt', async () => {
  const f = setup();
  const entry = { key: 'duplicate-key', contentHash: hash };
  await f.storage.commitUploadIndex(entry);
  const before = f.saves;
  await assert.rejects(() => f.storage.commitUploadIndex({ ...entry }), /key collision/);
  assert.equal(f.saves, before);
  assert.equal(f.storage.fileIndex.get(entry.key), entry);
});

test('failed save removes only its own hash entry, not a sibling', async () => {
  const f = setup();
  const sibling = { key: 'sibling', contentHash: hash };
  f.storage.saveIndex = async () => {
    f.storage.fileIndex.set(sibling.key, sibling);
    f.storage.contentHashIndex.set(hash, [...f.storage.contentHashIndex.get(hash), sibling.key]);
    throw new Error('save failure');
  };
  await assert.rejects(() => f.storage.commitUploadIndex({ key: 'failed', contentHash: hash }), /save failure/);
  assert.deepEqual(Array.from(f.storage.contentHashIndex.get(hash)), [sibling.key]);
  assert.equal(f.storage.fileIndex.has('failed'), false);
  assert.equal(f.storage.fileIndex.get('sibling'), sibling);
});

test('failed public pointer change restores earlier pointer', async () => {
  const f = setup();
  f.storage.publicContentHashes.set(hash, 'older-primary');
  f.storage.saveIndex = async () => { throw new Error('save failure'); };
  await assert.rejects(() => f.storage.commitUploadIndex({ key: 'new-primary', contentHash: hash }, 'new-primary'), /save failure/);
  assert.equal(f.storage.publicContentHashes.get(hash), 'older-primary');
  assert.equal(f.storage.fileIndex.size, 0);
});

test('colliding new upload key never overwrites previously persisted primary bytes', async () => {
  const f = setup();
  const stored = new Map();
  f.storage.generateFileKey = () => 'users/owner/reused-key';
  f.storage.coldPocket.write = async (path, data) => {
    stored.set(path, Buffer.from(data));
    return { compressedSize: data.length };
  };
  const original = Buffer.from('original-owner-data');
  const different = Buffer.from('other-content-must-not-overwrite');
  const first = await f.storage.upload('owner', 'first.txt', original, 'text/plain');
  const beforeMetadata = f.storage.fileIndex.get(first.key);
  await assert.rejects(
    () => f.storage.upload('owner', 'second.txt', different, 'text/plain'),
    /key collision/,
  );
  assert.deepEqual(stored.get('storage/' + first.key), original, 'existing bytes must remain unchanged');
  assert.equal(f.storage.fileIndex.get(first.key), beforeMetadata);
  assert.deepEqual(Array.from(f.storage.contentHashIndex.get(beforeMetadata.contentHash)), [first.key]);
});

test('colliding alias key is rejected without changing ownership indexes', async () => {
  const f = setup();
  f.storage.generateFileKey = () => 'users/owner/reused-key';
  const first = await send(f, 'owner');
  const before = f.saves;
  await assert.rejects(() => send(f, 'owner'), /key collision/);
  assert.equal(f.saves, before);
  assert.equal(f.storage.fileIndex.size, 1);
  assert.deepEqual(Array.from(f.storage.contentHashIndex.get(hash)), [first.key]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const file = fileURLToPath(new URL('../server/routes/storage.ts', import.meta.url));
const source = readFileSync(file, 'utf8');
const ast = ts.createSourceFile('storage.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let callbackSource;
function walk(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(ast) === 'router' && node.expression.name.text === 'post' &&
      node.arguments[0]?.getText(ast) === '"/upload"') {
    callbackSource = node.arguments.at(-1).getText(ast);
  }
  ts.forEachChild(node, walk);
}
walk(ast);
assert.ok(callbackSource, 'The authenticated /upload callback must exist');
const js = ts.transpileModule(`const uploadHandler = ${callbackSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function execute({ storageRowMissing = false, trackThrows = false, insertConflict = false,
  urlThrows = false, uploadThrows = false, missingFile = false, missingUser = false } = {}) {
  const calls = { upload: 0, delete: 0, insert: 0, url: 0, notified: 0 };
  const userStorage = { id: 'storage-id', userId: 'user-id' };
  const userStorageFiles = { id: 'file-id' };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () =>
      storageRowMissing ? [] : [{ id: 'storage-row-1' }] }) }) }),
    insert: (table) => ({ values: () => ({ onConflictDoNothing: () => ({
      returning: async () => {
        if (table === userStorage) return storageRowMissing ? [] : [{ id: 'storage-row-1' }];
        calls.insert++;
        if (trackThrows) throw new Error('SQL response lost after commit');
        return insertConflict ? [] : [{ id: 'receipt-1' }];
      },
      then: (resolve, reject) => {
        if (table === userStorageFiles) {
          calls.insert++;
          if (trackThrows) return Promise.reject(new Error('SQL response lost after commit')).then(resolve, reject);
        }
        return Promise.resolve(undefined).then(resolve, reject);
      },
    }) }) }),
  };
  const storageService = {
    uploadFile: async () => { calls.upload++; if (uploadThrows) throw new Error('storage unavailable'); return 'users/owner-1/audio/uuid/song.wav'; },
    deleteFile: async () => { calls.delete++; },
    getDownloadUrl: async () => { calls.url++; if (urlThrows) throw new Error('URL backend details'); return '/download'; },
  };
  const res = {
    statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const req = {
    file: missingFile ? undefined : { buffer: Buffer.from('abc'), originalname: 'song.wav', mimetype: 'audio/wav', size: 3 },
    body: { category: 'audio' }, user: missingUser ? undefined : { id: 'owner-1' },
  };
  const ctx = { Buffer, db, storageService, userStorage, userStorageFiles,
    eq: (a, b) => ({ a, b }), sanitizeCategory: x => x, sanitizeFileName: x => x,
    logger: { info() {}, warn() {}, error() {} }, randomUUID: () => 'uuid',
    setImmediate: () => { calls.notified++; }, notificationService: {},
  };
  const handler = vm.runInNewContext(`${js}\nuploadHandler`, ctx);
  await handler(req, res);
  return { res, calls };
}

test('missing user storage row fails closed, without reporting upload success', async () => {
  const { res, calls } = await execute({ storageRowMissing: true });
  assert.equal(res.statusCode, 500);
  assert.notEqual(res.body?.success, true);
  assert.equal(calls.delete, 0);
  assert.equal(calls.url, 0);
});

test('SQL receipt failure preserves bytes for reconciliation, never deletes', async () => {
  const { res, calls } = await execute({ trackThrows: true });
  assert.equal(res.statusCode, 500);
  assert.equal(calls.insert, 1);
  assert.equal(calls.delete, 0);
});

test('conflicting receipt cannot report success for untracked upload', async () => {
  const { res, calls } = await execute({ insertConflict: true });
  assert.notEqual(res.statusCode, 200);
  assert.notEqual(res.body?.success, true);
  assert.equal(calls.delete, 0);
});

test('successful upload requires a persisted receipt and returns URL', async () => {
  const { res, calls } = await execute();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(calls.insert, 1);
  assert.equal(calls.url, 1);
  assert.equal(calls.delete, 0);
});

test('URL lookup failure after receipt does not destroy bytes or expose provider details', async () => {
  const { res, calls } = await execute({ urlThrows: true });
  assert.equal(res.statusCode, 500);
  assert.equal(calls.insert, 1);
  assert.equal(calls.delete, 0);
  assert.doesNotMatch(res.body?.error ?? '', /backend details/);
});

test('storage write failure never fabricates a receipt or success', async () => {
  const { res, calls } = await execute({ uploadThrows: true });
  assert.equal(res.statusCode, 500);
  assert.equal(calls.insert, 0);
  assert.equal(calls.delete, 0);
});

test('missing file is rejected before writing', async () => {
  const { res, calls } = await execute({ missingFile: true });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.upload, 0);
});

test('missing authenticated user is rejected before writing', async () => {
  const { res, calls } = await execute({ missingUser: true });
  assert.equal(res.statusCode, 401);
  assert.equal(calls.upload, 0);
});

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

async function execute({ missingFile = false, missingUser = false, writeThrows = false,
  urlThrows = false } = {}) {
  const calls = { upload: 0, insert: 0, url: 0 };
  const userStorage = { id: 'storage-id', userId: 'user-id' };
  const userStorageFiles = { id: 'file-id' };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'storage-row-1' }] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({
      returning: async () => { calls.insert++; return [{ id: 'receipt-1' }]; },
      then: (resolve, reject) => { calls.insert++; return Promise.resolve(undefined).then(resolve, reject); },
    }) }) }),
  };
  const storageService = {
    uploadFile: async () => {
      calls.upload++;
      if (writeThrows) throw new Error('PRIVATE provider connection secret');
      return 'users/owner-1/audio/uuid/song.wav';
    },
    getDownloadUrl: async () => {
      calls.url++;
      if (urlThrows) throw new Error('PRIVATE signed URL backend detail');
      return '/download';
    },
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
  const ctx = { Error, Buffer, db, storageService, userStorage, userStorageFiles,
    eq: (a, b) => ({ a, b }), sanitizeCategory: x => x, sanitizeFileName: x => x,
    logger: { info() {}, warn() {}, error() {} }, randomUUID: () => 'uuid',
    setImmediate: () => {}, notificationService: {},
  };
  const handler = vm.runInNewContext(`${js}\nuploadHandler`, ctx);
  await handler(req, res);
  return { res, calls };
}

test('missing authenticated user returns 401 before storage writes', async () => {
  const { res, calls } = await execute({ missingUser: true });
  assert.equal(res.statusCode, 401);
  assert.equal(calls.upload, 0);
});

test('storage backend errors are not disclosed to HTTP clients', async () => {
  const { res } = await execute({ writeThrows: true });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body?.error, 'Upload failed');
});

test('download URL provider errors are not disclosed after SQL receipt', async () => {
  const { res, calls } = await execute({ urlThrows: true });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body?.error, 'Upload failed');
  assert.equal(calls.insert, 1);
});

test('missing file returns 400 without storage writes', async () => {
  const { res, calls } = await execute({ missingFile: true });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.upload, 0);
});

test('valid tracked upload still succeeds', async () => {
  const { res, calls } = await execute();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(calls.insert, 1);
  assert.equal(calls.url, 1);
});

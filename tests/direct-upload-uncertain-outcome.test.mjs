import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const file = fileURLToPath(new URL('../server/routes/uploads.ts', import.meta.url));
const source = readFileSync(file, 'utf8');
const ast = ts.createSourceFile('uploads.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let callbackSource;
function walk(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(ast) === 'router' && node.expression.name.text === 'put' &&
      node.arguments[0]?.getText(ast) === '"/direct/:token"') {
    callbackSource = node.arguments.at(-1).getText(ast);
  }
  ts.forEachChild(node, walk);
}
walk(ast);
assert.ok(callbackSource, 'The direct-upload PUT handler must be present');
const js = ts.transpileModule(`const directUploadHandler = ${callbackSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function execute({ trackedBefore = false, storageRow = 'storage-row', insertThrows = false,
  urlThrows = false, uploadThrows = false } = {}) {
  const calls = { upload: 0, delete: 0, downloadUrl: 0, insert: 0 };
  const payload = { u: 'owner-1', k: 'users/owner-1/audio/token-id/song.wav', n: 'song.wav',
    s: 3, ct: 'audio/wav', c: 'audio' };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => trackedBefore ? [{ id: 'tracked' }] : [] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => {
      calls.insert++;
      if (insertThrows) throw new Error('insert outcome unknown');
      return [{ id: 'tracked' }];
    } }) }) }),
  };
  const storageService = {
    uploadFileAtKey: async () => { calls.upload++; if (uploadThrows) throw new Error('write outcome unknown'); },
    getDownloadUrl: async () => { calls.downloadUrl++; if (urlThrows) throw new Error('URL provider unavailable'); return '/download'; },
    deleteFile: async () => { calls.delete++; },
  };
  const response = {
    locals: { directUploadPayload: payload },
    statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const context = { Buffer, db, storageService, userStorageFiles: { id: 'id', fileKey: 'fileKey' },
    eq: (a, b) => ({ a, b }), logger: { error() {} },
    ensureUserStorageRow: async () => storageRow,
  };
  const handler = vm.runInNewContext(`${js}\ndirectUploadHandler`, context);
  await handler({ body: Buffer.from('abc') }, response);
  return { response, calls };
}

test('a download URL provider error after SQL commit cannot delete the tracked bytes', async () => {
  const { response, calls } = await execute({ urlThrows: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.insert, 1);
  assert.equal(calls.delete, 0);
});

test('missing storage row after writing cannot delete an uncertain concurrent winner', async () => {
  const { response, calls } = await execute({ storageRow: null });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.upload, 1);
  assert.equal(calls.delete, 0);
});

test('an ambiguous SQL insert error retains the object for reconciliation', async () => {
  const { response, calls } = await execute({ insertThrows: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.delete, 0);
});

test('an ambiguous byte-store write failure does not delete a concurrent write', async () => {
  const { response, calls } = await execute({ uploadThrows: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.delete, 0);
});

test('already-used token returns conflict without touching storage', async () => {
  const { response, calls } = await execute({ trackedBefore: true });
  assert.equal(response.statusCode, 409);
  assert.equal(calls.upload, 0);
  assert.equal(calls.delete, 0);
});

test('successful upload still returns the tracked file and URL', async () => {
  const { response, calls } = await execute();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body?.success, true);
  assert.equal(response.body?.file?.url, '/download');
  assert.equal(calls.insert, 1);
  assert.equal(calls.delete, 0);
});

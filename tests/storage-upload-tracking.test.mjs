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
assert.ok(callbackSource, 'The authenticated storage upload callback must be present');
const js = ts.transpileModule('const uploadHandler = ' + callbackSource + ';', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function execute({ storageRow = 'storage-row', insertThrows = false,
  conflict = false, urlThrows = false, writeThrows = false, noFile = false } = {}) {
  const calls = { upload: 0, delete: 0, track: 0, downloadUrl: 0 };
  const userStorage = { id: 'storage-id', userId: 'storage-user' };
  const userStorageFiles = { id: 'file-id', userId: 'file-user', sizeBytes: 'size' };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => storageRow ? [{ id: storageRow }] : [] }) }) }),
    insert: (table) => ({ values: () => ({ onConflictDoNothing: () => ({
      returning: async () => {
        if (table === userStorage) return storageRow ? [{ id: storageRow }] : [];
        calls.track++;
        if (insertThrows) throw new Error('SQL insert outcome unknown');
        return conflict ? [] : [{ id: 'tracked-file' }];
      },
      then: (resolve, reject) => {
        calls.track++;
        if (insertThrows) return Promise.reject(new Error('SQL insert outcome unknown')).then(resolve, reject);
        return Promise.resolve(undefined).then(resolve, reject);
      },
    }) }) }),
  };
  const storageService = {
    uploadFile: async () => { calls.upload++; if (writeThrows) throw new Error('write outcome unknown'); return 'users/owner-1/audio/random/song.wav'; },
    getDownloadUrl: async () => { calls.downloadUrl++; if (urlThrows) throw new Error('URL unavailable'); return '/download'; },
    deleteFile: async () => { calls.delete++; },
  };
  const response = {
    statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const context = { db, storageService, userStorage, userStorageFiles,
    eq: (a, b) => ({ a, b }), and: (...args) => args, isNull: () => null,
    sum: () => null, randomUUID: () => 'generated-id',
    sanitizeCategory: () => 'audio', sanitizeFileName: () => 'song.wav',
    logger: { info() {}, error() {}, warn() {} },
    setImmediate: () => {},
  };
  const handler = vm.runInNewContext(js + '\nuploadHandler', context);
  const req = { user: { id: 'owner-1' }, body: {}, file: noFile ? undefined : {
    buffer: Buffer.from('abc'), originalname: 'song.wav', mimetype: 'audio/wav', size: 3,
  } };
  await handler(req, response);
  return { response, calls };
}

test('missing file fails before writing bytes', async () => {
  const { response, calls } = await execute({ noFile: true });
  assert.equal(response.statusCode, 400);
  assert.equal(calls.upload, 0);
});

test('missing storage ownership row cannot report successful upload', async () => {
  const { response, calls } = await execute({ storageRow: null });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.upload, 1);
  assert.equal(calls.delete, 0);
});

test('ambiguous SQL tracking failure must preserve bytes for reconciliation', async () => {
  const { response, calls } = await execute({ insertThrows: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.track, 1);
  assert.equal(calls.delete, 0);
});

test('a no-op tracking insert cannot report success', async () => {
  const { response, calls } = await execute({ conflict: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.track, 1);
  assert.equal(calls.delete, 0);
});

test('failed URL generation after committed receipt preserves bytes', async () => {
  const { response, calls } = await execute({ urlThrows: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.track, 1);
  assert.equal(calls.delete, 0);
});

test('ambiguous byte write does not trigger destructive cleanup', async () => {
  const { response, calls } = await execute({ writeThrows: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.delete, 0);
});

test('successful tracked upload returns a download URL', async () => {
  const { response, calls } = await execute();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body?.success, true);
  assert.equal(response.body?.file?.url, '/download');
  assert.equal(calls.track, 1);
  assert.equal(calls.delete, 0);
});

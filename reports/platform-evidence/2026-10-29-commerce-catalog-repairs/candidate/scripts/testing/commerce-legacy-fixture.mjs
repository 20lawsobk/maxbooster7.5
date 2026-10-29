// Execute the legacy beat-sale integration suite on an owned Unix-socket database.
// No application credentials, running app or provider transport are inherited.
import { mkdtemp, mkdir, symlink, writeFile, readFile, readdir, rm, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Fail closed before importing the fixture or allocating any owned resources.
// A positional Vitest filter must agree with the registered, static config include;
// otherwise a selector token could be present in evidence without being executed.
const [report, selectorFlag, subject, ...extra] = process.argv.slice(2);
if (!report || !path.isAbsolute(report)) throw new Error('Pass an absolute JUnit report path');
if (selectorFlag !== '--subject-file' || !subject || extra.length) {
  throw new Error('Pass exactly --subject-file tests/unit/beat-sale-money-loop.test.ts after the JUnit path');
}
if (subject !== 'tests/unit/beat-sale-money-loop.test.ts') {
  throw new Error('The subject must be the registered repository-relative legacy beat suite');
}
const root = await realpath(process.cwd());
const configFile = 'vitest.beat-loop.config.ts';
for (const file of [subject, configFile]) {
  const absolute = path.join(root, file);
  if (await realpath(absolute) !== absolute || !(await stat(absolute)).isFile()) {
    throw new Error('The subject and config must be regular files inside the repository without symlink redirection');
  }
}
const configSource = await readFile(path.join(root, configFile), 'utf8');
const { default: ts } = await import('typescript');
const syntax = ts.createSourceFile(configFile, configSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function properties(object, allowed) {
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('Legacy Vitest selection must be static');
  const result = new Map();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)
      || !allowed.has(property.name.text) || result.has(property.name.text)) {
      throw new Error('Unsupported legacy Vitest config may ignore the subject selector');
    }
    result.set(property.name.text, property.initializer);
  }
  return result;
}
const exports = syntax.statements.filter(statement => ts.isExportAssignment(statement));
const declaration = exports.length === 1 && exports[0].expression;
const imports = syntax.statements.filter(statement => ts.isImportDeclaration(statement)
  && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === 'vitest/config');
const bindings = imports.length === 1 && imports[0].importClause?.namedBindings;
const definesConfig = bindings && ts.isNamedImports(bindings) && bindings.elements.length === 1
  && bindings.elements[0].name.text === 'defineConfig' && !bindings.elements[0].propertyName;
if (!definesConfig || !syntax.statements.every(statement => ts.isImportDeclaration(statement) || exports.includes(statement))
  || syntax.parseDiagnostics.length || !declaration || !ts.isCallExpression(declaration)
  || !ts.isIdentifier(declaration.expression) || declaration.expression.text !== 'defineConfig'
  || declaration.arguments.length !== 1) {
  throw new Error('Legacy Vitest selection must use a static defineConfig object');
}
const configProperties = properties(declaration.arguments[0], new Set(['test', 'resolve']));
const testProperties = properties(configProperties.get('test'), new Set([
  'include', 'setupFiles', 'fileParallelism', 'maxWorkers', 'testTimeout', 'hookTimeout',
]));
const include = testProperties.get('include');
if (!include || !ts.isArrayLiteralExpression(include) || include.elements.length !== 1
  || !ts.isStringLiteral(include.elements[0]) || include.elements[0].text !== subject) {
  throw new Error('Legacy Vitest include does not execute the selected subject');
}
const command = ['node_modules/vitest/vitest.mjs', 'run', subject, '--config', configFile,
  '--reporter=verbose', '--reporter=junit', `--outputFile=${path.resolve(report)}`];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
console.log('Legacy subject selection: ' + JSON.stringify({
  schemaVersion: 1, subject, subjectSha256: sha256(await readFile(path.join(root, subject))),
  config: configFile, configSha256: sha256(configSource),
  adapterSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  command: [process.execPath, ...command],
}));
const { startDisposablePostgres } = await import('../../tests/payment-processing/helpers-database-postgres.mjs');
const temp = await mkdtemp(path.join(os.tmpdir(), 'beat-sale-verification-'));
const base = { PATH: process.env.PATH, HOME: temp, LANG: 'C', TZ: 'UTC',
  ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}) };
let cluster;
let child;
let redis;
let testFinished = false;
try {
  cluster = await startDisposablePostgres();
  await mkdir(path.join(temp, 'schema'));
  await symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
  await writeFile(path.join(temp, 'schema/schema.ts'), (await readFile('shared/schema.ts', 'utf8')).replace('export * from "./readiness-schema";', ''));
  const config = path.join(temp, 'drizzle.json');
  await writeFile(config, JSON.stringify({ dialect: 'postgresql', schema: path.join(temp, 'schema/schema.ts'), out: path.join(temp, 'generated') }));
  execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'generate', `--config=${config}`], { env: base, stdio: 'pipe', timeout: 60_000 });
  const baselineMigrations = (await readdir(path.join(temp, 'generated'))).filter(f => f.endsWith('.sql')).sort();
  if (!baselineMigrations.length) throw new Error('Drizzle produced no baseline SQL despite exiting zero');
  for (const file of baselineMigrations) {
    await cluster.pool.query(await readFile(path.join(temp, 'generated', file), 'utf8'));
  }
  for (const file of (await readdir('migrations')).filter(f => /^\d+.*\.sql$/.test(f) && Number(f.split('_')[0]) >= 20).sort()) {
    await cluster.pool.query(await readFile(path.join('migrations', file), 'utf8'));
  }
  const url = new URL(`postgresql://${cluster.pool.options.user}@localhost/postgres`);
  url.searchParams.set('host', cluster.pool.options.host);
  // Vitest itself forks workers; retain the transport guard without the app
  // rehearsal's child-process prohibition. Every worker inherits this preload.
  const guard = path.join(temp, 'loopback-guard.mjs');
  await writeFile(guard, (await readFile('scripts/readiness-egress-guard.mjs', 'utf8'))
    .replaceAll('"./lib/isolated-codec-process.mjs"', JSON.stringify(path.join(root, 'scripts/lib/isolated-codec-process.mjs')))
    .split('for (const method of [')[0] + '\nsyncBuiltinESMExports();\n');
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const redisPort = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  redis = spawn('redis-server', ['--bind', '127.0.0.1', '--port', String(redisPort), '--save', '', '--appendonly', 'no', '--dir', temp],
    { env: base, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Disposable Redis did not become ready')), 15_000);
    redis.stdout.on('data', chunk => { if (String(chunk).includes('Ready to accept connections')) { clearTimeout(timer); resolve(); } });
    redis.once('error', error => { clearTimeout(timer); reject(error); });
    redis.once('exit', code => { clearTimeout(timer); reject(new Error(`Disposable Redis exited ${code}`)); });
  });
  const env = { ...base, NODE_ENV: 'test', READINESS_ISOLATED_PG: '1', READINESS_EGRESS_GUARD: '1',
    BEAT_LOOP_TEST_DATABASE_URL: url.href, NODE_OPTIONS: `--import=${guard}`, REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    ENABLE_BACKUPS: 'false', ENABLE_FAN_DELIVERY_WORKER: 'false', ACME_ENABLED: 'false', DNS_NODE_LOCAL: '0' };
  const code = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, command, { env, detached: true, stdio: 'inherit' });
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }, 180_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (status, signal) => { testFinished = true; clearTimeout(timer); resolve(signal ? 124 : status ?? 1); });
  });
  process.exitCode = code;
} finally {
  if (child && !testFinished) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  try {
    if (redis && redis.exitCode === null && redis.signalCode === null) {
      const exited = new Promise(resolve => redis.once('exit', resolve));
      const timer = setTimeout(() => { try { process.kill(-redis.pid, 'SIGKILL'); } catch {} }, 5_000);
      try { process.kill(-redis.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await exited;
      clearTimeout(timer);
    }
  } finally {
    try { if (cluster) await cluster.stop(); }
    finally { await rm(temp, { recursive: true, force: true }); }
  }
  console.log('Fixture cleanup complete: owned PostgreSQL and Redis stopped; temporary files removed.');
}

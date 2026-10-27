// Rehearse the HTTP integration suites against a disposable application/database.
// Invoke from the repository root under env -i; never point these mutations at
// the developer server, a shared database, or a provider-backed deployment.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';
import { createOwnedProcessTracker } from '../../script/deployment/owned-processes.mjs';

const forbidden = Object.keys(process.env).filter(key => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|REDIS|STRIPE|RESEND|SENDGRID|TWILIO|AWS|SENTRY|TOKEN|SECRET|KEY|NODE_OPTIONS/i.test(key));
if (forbidden.length) throw new Error(`Refusing inherited application configuration: ${forbidden.join(', ')}`);
const requested = process.argv.slice(2);
if (requested.some(file => !/^tests\/[A-Za-z0-9_./-]+\.test\.ts$/.test(file) || file.includes('..'))) {
  throw new Error('Optional arguments must be repository-relative tests/*.test.ts paths');
}
const root = process.cwd();
const reportDirectory = path.resolve(process.env.MAXBOOSTER_TEST_REPORT_DIR || 'reports/test-verification/integration-browser/http');
fs.mkdirSync(reportDirectory, { recursive: true });
const temporary = fs.mkdtempSync('/tmp/maxbooster-http-tests-');
const home = path.join(temporary, 'home');
fs.mkdirSync(home);
const env = { PATH: process.env.PATH, HOME: home, LANG: 'C', TZ: 'UTC', ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}) };
const summary = { startedAt: new Date().toISOString(), scope: 'Disposable PostgreSQL and real source application; all external TCP/TLS and UDP denied', sourceRevision: '', requestedFiles: requested, status: 'running', productionReady: false };
let client, app, appOwnership, testOwnership, ownershipPoll, pgStarted = false;
const clean = source => source.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, 'postgresql://[redacted]')
  .replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9_]+/g, '[redacted-stripe-key]')
  .replace(/((?:session[_-]?secret|authorization|access[_-]?token|refresh[_-]?token)["' :=]+)[^\s,"'}<>]+/gi, '$1[redacted]');
function run(command, args, childEnv = env) {
  const result = spawnSync(command, args, { cwd: root, env: childEnv, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  fs.appendFileSync(path.join(temporary, 'setup.txt'), `${command} ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}\n`);
  if (result.status !== 0) throw new Error(`Fixture command failed: ${path.basename(command)} (${result.status}): ${clean(result.stderr || '').slice(-1200)}`);
  return result.stdout;
}
async function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer(); listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); });
  });
}
async function waitForApp(base) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null || app.signalCode !== null) throw new Error('Disposable application exited before route registration');
    try {
      const response = await fetch(`${base}/api/csrf-token`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200 && typeof (await response.json()).csrfToken === 'string') return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Disposable application did not register routes within 120 seconds');
}
try {
  summary.sourceRevision = run('git', ['rev-parse', 'HEAD']).trim();
  const testFiles = [...fs.readFileSync('vitest.integration.config.ts', 'utf8').matchAll(/"(tests\/[^"]+\.test\.ts)"/g)].map(match => match[1]);
  summary.testSourceSha256 = Object.fromEntries([...testFiles, 'vitest.integration.config.ts', 'scripts/testing/integration-browser.mjs'].map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const ports = new Set();
  const port = async () => { let value; do { value = await availablePort(); } while (ports.has(value)); ports.add(value); return value; };
  const pgPort = await port(), appPort = await port(), pdimPort = await port();
  const fixtureCwd = path.join(temporary, 'cwd'); fs.mkdirSync(fixtureCwd);
  for (const member of ['node_modules', 'dist', 'package.json', 'shared', 'external', 'tsconfig.json', 'tsconfig.server.json']) {
    fs.symlinkSync(path.join(root, member), path.join(fixtureCwd, member));
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'));
  fs.mkdirSync(path.join(temporary, 'schema'));
  const schema = fs.readFileSync('shared/schema.ts', 'utf8');
  const reexport = 'export * from "./readiness-schema";';
  if (schema.split(reexport).length !== 2) throw new Error('Unexpected readiness schema export count');
  fs.writeFileSync(path.join(temporary, 'schema/schema.ts'), schema.replace(reexport, ''));
  const config = path.join(temporary, 'drizzle.json');
  fs.writeFileSync(config, JSON.stringify({ dialect: 'postgresql', schema: path.join(temporary, 'schema/schema.ts'), out: path.join(temporary, 'generated') }));
  run(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'generate', `--config=${config}`]);
  const baselineMigrations = fs.readdirSync(path.join(temporary, 'generated')).filter(file => file.endsWith('.sql')).sort();
  if (!baselineMigrations.length) throw new Error('Drizzle produced no baseline SQL despite exiting zero; inspect the retained setup output');
  run('initdb', ['-D', path.join(temporary, 'pg'), '-U', 'test_fixture', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', path.join(temporary, 'pg'), '-l', path.join(temporary, 'postgres.txt'), '-o', `-h 127.0.0.1 -k ${temporary} -p ${pgPort} -c shared_buffers=32MB -c max_connections=40`, '-w', 'start']);
  pgStarted = true;
  const databaseUrl = `postgresql://test_fixture@127.0.0.1:${pgPort}/postgres`;
  client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  for (const file of baselineMigrations) {
    await client.query(fs.readFileSync(path.join(temporary, 'generated', file), 'utf8'));
  }
  for (const file of fs.readdirSync('migrations').filter(file => /^\d+.*\.sql$/.test(file) && Number(file.split('_')[0]) >= 20).sort()) {
    await client.query(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }
  const fixtureToken = randomBytes(32).toString('hex');
  await client.query('CREATE TABLE maxbooster_test_fixture_proof (token text PRIMARY KEY)');
  await client.query('INSERT INTO maxbooster_test_fixture_proof(token) VALUES ($1)', [fixtureToken]);
  summary.ephemeralDatabase = 'pass';
  const common = { ...env, DATABASE_URL: databaseUrl, SESSION_SECRET: randomBytes(48).toString('hex'),
    READINESS_ISOLATED_PG: '1', READINESS_EGRESS_GUARD: '1', READINESS_LOCAL_CODECS: '1', MAXCORE_LOCAL: '0', TEST_EXPECT_MAXCORE_UNAVAILABLE: '1',
    STRIPE_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString('hex')}`,
    MAXCORE_API_URL: 'http://127.0.0.1:9', MAXCORE_BASE_URL: 'http://127.0.0.1:9',
    MAXCORE_PRIVATE_STATE_DIR: path.join(temporary, 'maxcore-state'),
    ...(process.env.MAXBOOSTER_PYTHON ? { MAXBOOSTER_PYTHON: process.env.MAXBOOSTER_PYTHON } : {}),
    LOCAL_PDIM_PORT: String(pdimPort), LOCAL_PDIM_STORE_FILE: path.join(temporary, 'pdim.json'),
    ENABLE_BACKUPS: 'false', ENABLE_FAN_DELIVERY_WORKER: 'false', ACME_ENABLED: 'false', DNS_NODE_LOCAL: '0',
    DISABLE_CLUSTER: 'true', DB_POOL_SIZE: '2', DB_CONNECTION_TIMEOUT: '2000',
    PORT: String(appPort), APP_PORT: String(appPort), APP_URL: `http://localhost:${appPort}`, PUBLIC_APP_URL: `http://localhost:${appPort}` };
  const fullGuard = path.join(root, 'scripts/readiness-egress-guard.mjs');
  const appFd = fs.openSync(path.join(temporary, 'app.txt'), 'w');
  app = spawn(process.execPath, ['--max-old-space-size=1024', '--import', fullGuard, '--import', 'tsx', path.join(root, 'server/index.ts')], {
    cwd: fixtureCwd, env: { ...common, NODE_ENV: 'production' }, stdio: ['ignore', appFd, appFd], detached: true,
  });
  fs.closeSync(appFd);
  appOwnership = createOwnedProcessTracker(app.pid);
  ownershipPoll = setInterval(() => { appOwnership.capture(); testOwnership?.capture(); }, 200); ownershipPoll.unref();
  const base = `http://127.0.0.1:${appPort}`;
  await waitForApp(base); summary.applicationRoutes = 'pass';
  // Vitest itself forks workers, and the supervisor integration launches local
  // runtimes. Retain the TCP/TLS/UDP guard while allowing tracked subprocesses.
  const testGuard = path.join(temporary, 'loopback-guard.mjs');
  fs.writeFileSync(testGuard, fs.readFileSync(fullGuard, 'utf8').split('for (const method of [')[0]
    .replace('"./lib/isolated-codec-process.mjs"', JSON.stringify(path.join(root, 'scripts/lib/isolated-codec-process.mjs')))
    + '\nsyncBuiltinESMExports();\n');
  fs.mkdirSync(path.join(temporary, 'python-guard'));
  fs.writeFileSync(path.join(temporary, 'python-guard/sitecustomize.py'), "import socket\n_original=socket.socket.connect\ndef _local(self,address):\n    if isinstance(address,tuple) and address[0] not in ('localhost','127.0.0.1','::1'):\n        raise OSError('isolated-test-egress-denied')\n    return _original(self,address)\nsocket.socket.connect=_local\n");
  // Direct SQL tests also exercise disk-backed audit logs. Move worker cwd
  // before importing subjects so their WAL cannot share the developer app's
  // source-root directory. Keep Vite's module/test root at the real checkout.
  const cwdSetup = path.join(temporary, 'worker-cwd.mjs');
  fs.writeFileSync(cwdSetup, `process.chdir(${JSON.stringify(fixtureCwd)});\n`);
  const vitestConfig = path.join(temporary, 'vitest.config.mjs');
  fs.appendFileSync(cwdSetup, `
// Model Replit's trusted local TLS terminator without changing Secure cookies.
import { createHash as fixtureHash } from 'node:crypto';
import { expect as fixtureExpect } from 'vitest';
const fixtureOrigin = ${JSON.stringify(base)};
const fixtureFile = fixtureExpect.getState().testPath;
if (!fixtureFile) throw new Error('Cannot establish the per-file client identity');
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== fixtureOrigin) return originalFetch(input, init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  // Intentional hostile probes need their own client: a real IP ban must not
  // poison the subsequent legitimate-user journey. This selector is consumed
  // only by this owned loopback fixture and never reaches the application.
  const client = headers.get('x-maxbooster-fixture-client') || 'default';
  headers.delete('x-maxbooster-fixture-client');
  const address = fixtureHash('sha256').update(fixtureFile + ':' + client).digest();
  const fixtureIp = '198.18.' + address[0] + '.' + address[1];
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-forwarded-for', fixtureIp);
  return originalFetch(input, {...init, headers});
};
`);
  fs.writeFileSync(vitestConfig, `import path from 'node:path';\nimport base from ${JSON.stringify(path.join(root, 'vitest.integration.config.ts'))};\nexport default {...base, root:${JSON.stringify(root)}, test:{...base.test, pool:'forks', setupFiles:[${JSON.stringify(cwdSetup)}, ...[].concat(base.test.setupFiles || []).map(file=>path.resolve(${JSON.stringify(root)}, file))]}};\n`);
  summary.workerWorkingDirectory = 'temporary fixture; source root used only for module/test resolution';
  summary.trustedProxy = 'Exact loopback fixture origin receives TLS forwarding and stable TEST-NET identities per file/client; hostile probes use distinct clients, production blocking and rate limits retained';
  const testFd = fs.openSync(path.join(temporary, 'vitest.txt'), 'w');
  const test = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', vitestConfig,
    '--maxWorkers=1', '--reporter=junit', `--outputFile=${path.join(reportDirectory, 'integration.junit.xml')}`, ...requested], {
    cwd: root, env: { ...common, NODE_ENV: 'test', TEST_BASE_URL: base, MAXBOOSTER_ISOLATED_FIXTURE_TOKEN: fixtureToken, NODE_OPTIONS: `--import=${testGuard}`, PYTHONPATH: path.join(temporary, 'python-guard') },
    stdio: ['ignore', testFd, testFd], detached: true,
  });
  fs.closeSync(testFd); testOwnership = createOwnedProcessTracker(test.pid);
  let killTimeout;
  const timeout = setTimeout(() => { summary.timedOut = true; test.kill('SIGTERM'); killTimeout = setTimeout(() => test.kill('SIGKILL'), 5000); killTimeout.unref(); }, 20 * 60 * 1000); timeout.unref();
  const result = await new Promise(resolve => test.once('exit', (code, signal) => resolve({ code, signal })));
  clearTimeout(timeout); clearTimeout(killTimeout);
  summary.exitCode = result.code; summary.signal = result.signal;
  summary.status = result.code === 0 ? 'passed' : 'failed';
  process.exitCode = result.code === 0 ? 0 : 1;
} catch (error) {
  summary.status = 'failed'; summary.error = clean(String(error.message)); process.exitCode = 1;
} finally {
  clearInterval(ownershipPoll);
  if (testOwnership) summary.testProcessCleanup = await testOwnership.stop({ graceMs: 2000, descendantGraceMs: 2000 });
  if (appOwnership) summary.appProcessCleanup = await appOwnership.stop({ graceMs: 28000, descendantGraceMs: 2000 });
  if (summary.testProcessCleanup?.remaining.length || summary.appProcessCleanup?.remaining.length) { summary.status = 'failed'; process.exitCode = 1; }
  await client?.end().catch(() => {});
  if (pgStarted) {
    const stop = spawnSync('pg_ctl', ['-D', path.join(temporary, 'pg'), '-m', 'immediate', '-w', 'stop'], { env, encoding: 'utf8', timeout: 30000 });
    summary.postgresCleanup = stop.status === 0 ? 'pass' : 'failed';
    if (stop.status !== 0) { process.exitCode = 1; summary.status = 'failed'; }
  }
  for (const [source, target] of [['setup.txt', 'http-setup.txt'], ['app.txt', 'http-app.txt'], ['vitest.txt', 'http-vitest.txt']]) {
    const file = path.join(temporary, source);
    if (fs.existsSync(file)) fs.writeFileSync(path.join(reportDirectory, target), clean(fs.readFileSync(file, 'utf8')));
  }
  for (const name of ['integration.vitest.json', 'integration.junit.xml']) {
    const file = path.join(reportDirectory, name);
    if (fs.existsSync(file)) fs.writeFileSync(file, clean(fs.readFileSync(file, 'utf8')));
  }
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(reportDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  console.log(JSON.stringify(summary, null, 2));
}

// Runs the original PDIM HTTP/load assertions against a disposable local app.
// No model/dataset downloads, production DB, object storage or provider secrets.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { startDisposablePostgres } from '../../tests/payment-processing/helpers-database-postgres.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] || path.join(root, 'reports/test-verification/subsystems'));
const forbidden = Object.keys(process.env).filter(key => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|REDIS|STRIPE|RESEND|SENDGRID|TWILIO|AWS|SENTRY|TOKEN|SECRET|KEY|NODE_OPTIONS/i.test(key));
if (forbidden.length) throw Error(`Run this isolated fixture in a clean environment; refusing: ${forbidden.join(', ')}`);
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdim-smoke-isolated-'));
const base = { PATH: process.env.PATH, HOME: path.join(temp, 'home'), LANG: 'C', CI: '1',
  ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}) };
fs.mkdirSync(base.HOME);
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
const setupLog = fs.openSync(path.join(out, 'pdim-smoke-setup.txt'), 'w');
const serverLog = fs.openSync(path.join(out, 'pdim-smoke-server.txt'), 'w');
const result = { scope: 'Original PDIM HTTP assertions, real disposable PostgreSQL/fabric; loopback only',
  source: 'external/pdim/scripts/src/smoke-load-test.ts', status: 'running',
  startedAt: new Date().toISOString(), productionDatabaseUsed: false,
  startup: 'Dedicated real-app fixture; dataset schedulers and logical corpus auto-push not started' };
fs.writeFileSync(path.join(out, 'pdim-smoke-results.json'), JSON.stringify(result, null, 2) + '\n');
let database, server, testChild;

function run(command, args) {
  const child = spawnSync(command, args, { cwd: root, env: base, stdio: ['ignore', setupLog, setupLog], timeout: 60_000 });
  if (child.status !== 0) throw Error(`Fixture setup command failed: ${path.basename(command)} (exit ${child.status})`);
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(resolve => child.once('close', resolve));
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  const timeout = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
  await ended; clearTimeout(timeout);
}

try {
  database = await startDisposablePostgres();
  const connection = database.pool.options;
  const url = new URL(`postgresql://${encodeURIComponent(connection.user)}@localhost/${connection.database}`);
  url.searchParams.set('host', connection.host); url.searchParams.set('port', String(connection.port));
  fs.writeFileSync(path.join(temp, 'drizzle.json'), JSON.stringify({ dialect: 'postgresql',
    schema: path.join(root, 'external/pdim/lib/db/src/schema/index.ts'), out: path.join(temp, 'schema') }));
  run(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'generate', `--config=${path.join(temp, 'drizzle.json')}`]);
  for (const file of fs.readdirSync(path.join(temp, 'schema')).filter(file => file.endsWith('.sql')).sort()) {
    await database.pool.query(fs.readFileSync(path.join(temp, 'schema', file), 'utf8'));
  }
  // Reuse the transport guard, allowing only loopback/Unix socket traffic.
  const guard = fs.readFileSync(path.join(root, 'scripts/readiness-egress-guard.mjs'), 'utf8')
    .split('for (const method of [')[0] + '\nsyncBuiltinESMExports();\n';
  fs.writeFileSync(path.join(temp, 'loopback-guard.mjs'), guard);
  const fixture = `import app from ${JSON.stringify(path.join(root, 'external/pdim/artifacts/api-server/src/app.ts'))};
    import { initializeFabric } from ${JSON.stringify(path.join(root, 'external/pdim/artifacts/api-server/src/pocket-dimension/fabric/index.ts'))};
    import { redisManager } from ${JSON.stringify(path.join(root, 'external/pdim/artifacts/api-server/src/redis/manager.ts'))};
    (async()=>{await initializeFabric(); await redisManager.bootstrapSystemInstances(); await redisManager.initialize();
      const server=app.listen(0,'127.0.0.1',()=>require('fs').writeFileSync('address.json',JSON.stringify(server.address())));
    })().catch(e=>{console.error(e);process.exit(1)});`;
  await build({ stdin: { contents: fixture, resolveDir: root, sourcefile: 'pdim-smoke-fixture.ts', loader: 'ts' },
    outfile: path.join(temp, 'server.cjs'), bundle: true, packages: 'external', platform: 'node', format: 'cjs', logLevel: 'silent',
    alias: { '@workspace/db': path.join(root, 'external/pdim/lib/db/src/index.ts'),
      '@workspace/db/schema': path.join(root, 'external/pdim/lib/db/src/schema/index.ts'),
      '@workspace/api-zod': path.join(root, 'external/pdim/lib/api-zod/src/index.ts') } });
  server = spawn(process.execPath, ['server.cjs'], { cwd: temp, detached: true, stdio: ['ignore', serverLog, serverLog], env: {
    ...base, DATABASE_URL: url.toString(), NODE_ENV: 'test',
    NODE_OPTIONS: `--import=${path.join(temp, 'loopback-guard.mjs')}`,
    READINESS_EGRESS_GUARD: '1', AGENT_TOKEN: 'isolated-agent-fixture', TRAINING_API_KEY: 'isolated-training-fixture',
  } });
  const addressFile = path.join(temp, 'address.json');
  const until = Date.now() + 60_000;
  while (!fs.existsSync(addressFile)) {
    if (server.exitCode !== null) throw Error(`PDIM fixture exited before listening (${server.exitCode})`);
    if (Date.now() >= until) throw Error('PDIM fixture did not listen within 60 seconds');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const address = JSON.parse(fs.readFileSync(addressFile, 'utf8'));
  const log = fs.openSync(path.join(out, 'pdim-smoke.txt'), 'w');
  testChild = spawn(process.execPath, ['--import', 'tsx', path.join(root, result.source)], {
    cwd: root, detached: true, stdio: ['ignore', log, log], env: { ...base,
      API_BASE: `http://127.0.0.1:${address.port}`, NODE_OPTIONS: `--import=${path.join(temp, 'loopback-guard.mjs')}`,
      READINESS_EGRESS_GUARD: '1' } });
  fs.closeSync(log);
  const timeout = setTimeout(() => { try { process.kill(-testChild.pid, 'SIGKILL'); } catch {} }, 240_000);
  const code = await new Promise((resolve, reject) => { testChild.once('close', resolve); testChild.once('error', reject); });
  clearTimeout(timeout);
  const text = fs.readFileSync(path.join(out, 'pdim-smoke.txt'), 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  fs.writeFileSync(path.join(out, 'pdim-smoke.txt'), text.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:<ephemeral>'));
  const counts = /Results: (\d+)\/(\d+) passed/.exec(text);
  Object.assign(result, { status: code === 0 ? 'passed' : 'failed', exitCode: code,
    passedTests: counts ? Number(counts[1]) : 0, totalTests: counts ? Number(counts[2]) : null });
} catch (error) {
  Object.assign(result, { status: 'failed', error: error instanceof Error ? error.message : String(error) });
} finally {
  await stop(testChild); await stop(server);
  if (database) await database.stop();
  fs.closeSync(setupLog); fs.closeSync(serverLog);
  fs.rmSync(temp, { recursive: true, force: true });
  result.cleanup = 'Owned test/server processes stopped; disposable PostgreSQL and temporary fabric removed';
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'pdim-smoke-results.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result));
process.exitCode = result.status === 'passed' ? 0 : 1;

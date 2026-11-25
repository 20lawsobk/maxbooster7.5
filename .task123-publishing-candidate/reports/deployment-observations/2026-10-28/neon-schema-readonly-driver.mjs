import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const root = '/workspace/maxbooster7.5';
const require = createRequire(root + '/package.json');
const { neon, neonConfig } = require('@neondatabase/serverless');
const { fetch, EnvHttpProxyAgent } = require('undici');
const dispatcher = new EnvHttpProxyAgent();
const report = { schemaVersion: 1, observedAt: new Date().toISOString(), scope: 'Read-only schema metadata through the configured DATABASE_URL Neon binding; no application rows or credentials retained', productionReady: false, status: 'running' };
try {
  const connection = process.env.DATABASE_URL;
  if (!connection || !new URL(connection).hostname.endsWith('.neon.tech')) throw Object.assign(new Error(), { code: 'SELECTED_NEON_BINDING_UNAVAILABLE' });
  const [{ is }, { PgTable, getTableConfig }, schema, { compareSchema }] = await Promise.all([
    import(pathToFileURL(require.resolve('drizzle-orm')).href),
    import(pathToFileURL(require.resolve('drizzle-orm/pg-core')).href),
    import(pathToFileURL(root + '/shared/schema.ts').href),
    import(pathToFileURL(root + '/scripts/check-neon-schema.mjs').href),
  ]);
  const expected = Object.values(schema).filter(value => is(value, PgTable)).map(table => {
    const config = getTableConfig(table);
    return { schema: config.schema ?? 'public', name: config.name, columns: config.columns.map(column => column.name) };
  });
  neonConfig.fetchFunction = (url, options) => fetch(url, { ...options, dispatcher, signal: AbortSignal.timeout(15000) });
  const sql = neon(connection);
  const results = await sql.transaction([
    sql`SELECT current_setting('transaction_read_only') AS read_only`,
    sql`SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`,
  ], { readOnly: true, isolationLevel: 'RepeatableRead' });
  if (results[0]?.[0]?.read_only !== 'on' || !expected.length) throw Object.assign(new Error(), { code: 'READ_ONLY_OR_SCHEMA_NOT_ESTABLISHED' });
  Object.assign(report, { status: 'observed', readOnly: true, checkedTables: expected.length, drift: compareSchema(expected, results[1]), schemaSourceSha256: createHash('sha256').update(fs.readFileSync(root + '/shared/schema.ts')).digest('hex') });
} catch (error) {
  Object.assign(report, { status: 'failed', errorCode: typeof error.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'READ_ONLY_CHECK_FAILED' });
} finally {
  await dispatcher.close();
  report.finishedAt = new Date().toISOString();
  const out = root + '/reports/deployment-observations/2026-10-28';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(out + '/neon-schema-readonly.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, readOnly: report.readOnly, checkedTables: report.checkedTables, driftTables: report.drift?.length, errorCode: report.errorCode }));
  process.exitCode = report.status === 'observed' && !report.drift.length ? 0 : 1;
}

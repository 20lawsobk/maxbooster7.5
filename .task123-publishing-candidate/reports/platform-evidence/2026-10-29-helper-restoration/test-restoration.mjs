// Own disposable SQL only; validates exact restoration, never product readiness.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { withFixtureAccountPolicyState, FIXTURE_ACCOUNT_POLICY_DENIALS } from '../../../tests/helpers-http-fixture.ts';
const output = path.dirname(new URL(import.meta.url).pathname);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maxbooster-policy-helper-'));
const startedAt = new Date().toISOString();
const events = [];
let client, started = false;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Owned fixture command ${command} failed: ${result.status}`);
}
const listener = net.createServer();
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
try {
  run('initdb', ['-D', path.join(temporary, 'pg'), '-U', 'test_fixture', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', path.join(temporary, 'pg'), '-l', path.join(temporary, 'postgres.log'), '-o', `-h 127.0.0.1 -k ${temporary} -p ${port} -c shared_buffers=16MB -c max_connections=10`, '-w', 'start']);
  started = true;
  const token = randomBytes(32).toString('hex');
  process.env.DATABASE_URL = `postgresql://test_fixture@127.0.0.1:${port}/postgres`;
  process.env.TEST_BASE_URL = 'http://127.0.0.1:1';
  process.env.READINESS_ISOLATED_PG = '1';
  process.env.MAXBOOSTER_ISOLATED_FIXTURE_TOKEN = token;
  client = new pg.Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  await client.query('CREATE TABLE maxbooster_test_fixture_proof(token text PRIMARY KEY)');
  await client.query('INSERT INTO maxbooster_test_fixture_proof(token) VALUES($1)', [token]);
  await client.query(`CREATE TABLE users(id text PRIMARY KEY, email text UNIQUE, role text,
      subscription_status text,subscription_tier text,trial_ends_at timestamp,
      subscription_ends_at timestamp,two_factor_enabled boolean)`);
  const email = 'policy_helper@maxbooster-test.invalid';
  await client.query(`INSERT INTO users VALUES('owned-policy-user',$1,'user','trialing','pro',
    '2050-01-01 01:02:03.123456','2050-02-01 02:03:04.654321',false)`, [email]);
  const snapshot = async () => (await client.query(`SELECT id,role,subscription_status,subscription_tier,
      trial_ends_at::text AS trial_ends_at,subscription_ends_at::text AS subscription_ends_at,two_factor_enabled
      FROM users WHERE email=$1`, [email])).rows[0];
  const original = await snapshot();
  for (const denied of FIXTURE_ACCOUNT_POLICY_DENIALS) {
    for (const fail of [false, true]) {
      const callback = async () => {
        const row = await snapshot();
        assert.equal(row.subscription_tier, 'monthly');
        assert.equal(row.subscription_status, ['suspended','banned'].includes(denied.state) ? denied.state : 'active');
        assert.equal(row.two_factor_enabled, denied.state === 'mfa-required');
        assert.equal(row.trial_ends_at !== null, denied.state === 'trial-expired');
        assert.equal(row.subscription_ends_at !== null, denied.state === 'subscription-expired');
        if (fail) throw new Error('intentional assertion failure');
      };
      if (fail) await assert.rejects(withFixtureAccountPolicyState(email, denied.state, callback), /intentional assertion failure/);
      else await withFixtureAccountPolicyState(email, denied.state, callback);
      assert.deepEqual(await snapshot(), original);
      events.push({ state: denied.state, callback: fail ? 'expected-failure' : 'success', exactOriginalSqlRestored: true });
    }
  }
  await assert.rejects(withFixtureAccountPolicyState(email, 'unknown-state', async () => assert.fail('must not execute')), /Unsupported fixture/);
  assert.deepEqual(await snapshot(), original);
  events.push({ state: 'unknown-state', rejectedBeforeMutation: true });
  process.env.MAXBOOSTER_ISOLATED_FIXTURE_TOKEN = 'wrong-proof';
  await assert.rejects(withFixtureAccountPolicyState(email, 'suspended', async () => assert.fail('must not execute')), /ownership proof mismatch/);
  assert.deepEqual(await snapshot(), original);
  events.push({ state: 'wrong-owned-proof', rejectedBeforeMutation: true });
  process.env.MAXBOOSTER_ISOLATED_FIXTURE_TOKEN = token;
  const originalError = new Error('owned callback failure before restoration');
  let combined;
  try {
    await withFixtureAccountPolicyState(email, 'suspended', async () => {
      // Fault injection is restricted to this disposable database's table.
      await client.query('DROP TABLE users');
      throw originalError;
    });
  } catch (error) { combined = error; }
  assert.ok(combined instanceof AggregateError);
  assert.equal(combined.errors[0], originalError);
  assert.match(combined.errors[1].message, /relation .*users.* does not exist/i);
  events.push({ state: 'callback-and-restoration-failure', bothOriginalErrorsPreserved: true });
} finally {
  if (client) await client.end();
  if (started) run('pg_ctl', ['-D', path.join(temporary, 'pg'), '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.writeFileSync(path.join(output, 'helper-sql-acceptance.json'), JSON.stringify({ startedAt,
    finishedAt: new Date().toISOString(), helperSha256: createHash('sha256').update(fs.readFileSync(new URL('../../../tests/helpers-http-fixture.ts', import.meta.url))).digest('hex'),
    scope: 'Owned helper restoration/failure semantics only; not feature acceptance',
    status: events.length === 13 ? 'PASS' : 'FAIL', checks: events, ownedPostgresStopped: started, temporaryDirectoryRemoved: !fs.existsSync(temporary), productionReady: false }, null, 2) + '\n');
}

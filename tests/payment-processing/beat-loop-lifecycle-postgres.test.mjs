import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { startDisposablePostgres, loadDatabaseSubject } from './helpers-database-postgres.mjs';

// Real orchestration, PostgreSQL, transactions and codecs; renderer/storage/social
// ports use fixtures. No app database, live payments or public posts are touched.
test('Beat Money Loop lifecycle on a disposable PostgreSQL database', { timeout: 120000 }, async t => {
  const pg = await startDisposablePostgres();
  const root = await mkdtemp(path.join(tmpdir(), 'beat-loop-lifecycle-'));
  const previous = { fetch: globalThis.fetch, admin: process.env.ADMIN_EMAIL,
    base: process.env.PUBLIC_BASE_URL, duration: process.env.BEAT_DURATION_SECONDS };
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [['ADMIN_EMAIL', previous.admin], ['PUBLIC_BASE_URL', previous.base], ['BEAT_DURATION_SECONDS', previous.duration]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete globalThis.__beatLoopFixture;
    await pg.stop(); await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'schema'));
  await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'schema/schema.ts'), (await readFile('shared/schema.ts', 'utf8')).replace('export * from "./readiness-schema";', ''));
  await writeFile(path.join(root, 'drizzle.json'), JSON.stringify({ dialect: 'postgresql', schema: path.join(root, 'schema/schema.ts'), out: path.join(root, 'generated') }));
  execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'generate', `--config=${path.join(root, 'drizzle.json')}`], {
    env: { PATH: process.env.PATH, HOME: root }, stdio: 'pipe', timeout: 45000,
  });
  for (const file of (await readdir(path.join(root, 'generated'))).filter(f => f.endsWith('.sql')).sort()) {
    await pg.pool.query(await readFile(path.join(root, 'generated', file), 'utf8'));
  }
  for (const file of (await readdir('migrations')).filter(f => /^\d+.*\.sql$/.test(f) && Number(f.split('_')[0]) >= 20).sort()) {
    await pg.pool.query(await readFile(path.join('migrations', file), 'utf8'));
  }
  const assets = new Map(); const requests = []; let failAudio = false; let postsCreated = 1;
  let blockAudio; let silentAudio = false;
  const wav = Buffer.alloc(160044);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(160000, 40);
  for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(Math.round(6000 * Math.sin((i - 44) / 2 * Math.PI * 220 / 4000)), i);
  const png = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=purple:s=64x64', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']);
  process.env.ADMIN_EMAIL = 'admin@fixture.invalid'; process.env.PUBLIC_BASE_URL = 'https://fixture.invalid'; process.env.BEAT_DURATION_SECONDS = '10';
  const fixture = globalThis.__beatLoopFixture = {
    db: drizzle(pg.pool), pool: pg.pool,
    storage: {
      async uploadFile(bytes, category, filename) { const key = `${category}/${filename}`; assets.set(key, Buffer.from(bytes)); return key; },
      async uploadGeneratedFile(bytes, owner, category, filename) { const key = `users/${owner}/${category}/${filename}`; assets.set(key, Buffer.from(bytes)); return key; },
      async downloadFile(key) { assert(assets.has(key), 'requested durable fixture asset must exist'); return assets.get(key); },
      async deleteFile(key) { assets.delete(key); },
      async getDownloadUrl(key) { return `/api/storage/file/${encodeURIComponent(key)}`; },
    },
    async prepare(endpoint, body) { requests.push({ endpoint, body }); return { ...body, awareness: { snapshot_id: 'public-fixture-scan', awareness: 'Current public music signals', expires_at: Date.now() / 1000 + 60 } }; },
    async infer() { return { hook: 'Find your next sound.', body: 'Preview this original beat and explore the license.', cta: 'License this beat.' }; },
    async dispatch() { return { success: true, message: 'Fixture dispatch', results: { postsCreated, platformsUsed: postsCreated ? ['instagram'] : [], errors: [] } }; },
  };
  globalThis.fetch = async (url, init) => {
    const value = String(url);
    if (value.endsWith('/api/health')) return Response.json({ ok: true });
    if (value.endsWith('/api/generate/audio')) {
      if (blockAudio) await blockAudio;
      const body = JSON.parse(init.body); assert.equal(body.owner_id, 'loop-admin'); assert.equal(body.instrument, 'ensemble');
      assert.equal(body.awareness.snapshot_id, 'public-fixture-scan');
      return failAudio ? Response.json({ error: 'Renderer unavailable' }, { status: 503 }) : Response.json({ wav_b64: (silentAudio ? Buffer.concat([wav.subarray(0,44), Buffer.alloc(wav.length - 44)]) : wav).toString('base64'), backend: 'fixture-audio', bpm: 128, key: 'D minor', genre: 'house', mood: 'bright' });
    }
    if (value.endsWith('/api/generate/image')) {
      const body = JSON.parse(init.body); assert.equal(body.owner_id, 'loop-admin'); assert.equal(body.awareness.snapshot_id, 'public-fixture-scan');
      assert.equal(init.headers['X-MaxCore-User-Id'], 'loop-admin');
      return Response.json({ url: '/uploads/images/fixture.png' });
    }
    if (value.endsWith('/uploads/images/fixture.png')) return new Response(png, { headers: { 'content-type': 'image/png' } });
    throw new Error(`Unexpected fixture transport: ${value}`);
  };
  const service = (await loadDatabaseSubject('server/services/beatMoneyLoopService.ts', {
    '../db.js': 'export const {db,pool}=globalThis.__beatLoopFixture;',
    '../logger.js': 'export const logger={info(){},warn(){},error(){}};',
    './storageService.js': 'export const storageService=globalThis.__beatLoopFixture.storage;',
    './audioSourceAuthorization.js': 'export async function authorizeAudioSource(){throw new Error("Unexpected existing image grant");}',
    '../infrastructure/distributedCache.js': 'export const distributedCache={invalidatePattern:async()=>{}};',
    './unifiedAIController.js': 'export const MaxCoreAIClient={infer:(...args)=>globalThis.__beatLoopFixture.infer(...args)};',
    './awarenessContext.js': 'export async function getAwarenessContext(){return {contextString:"Public fixture signals"};}',
    './generationAwareness.js': 'export const prepareGenerationAwareness=(...args)=>globalThis.__beatLoopFixture.prepare(...args);',
    './adaptiveGenerationEngine.js': 'export async function recordGeneration(){}',
    './advertisingDispatchService.js': 'export const advertisingDispatchService={activateCampaign:(...args)=>globalThis.__beatLoopFixture.dispatch(...args)};',
    '../instrument.js': 'export function captureSentryException(){}',
    './maxcoreConnector.js': 'export const getMaxcoreOrigin=()=>"http://maxcore.fixture";export const getMaxcoreOriginOrDefault=getMaxcoreOrigin;export const getMaxcoreGenerationKey=()=>"fixture-private-channel";export const getMaxcoreGenerationHeaders=()=>({Authorization:"Bearer fixture-private-channel"});export const isAllowedMaxcoreMediaPath=p=>/^\\/uploads\\//.test(p);',
  })).beatMoneyLoopService;
  await pg.pool.query("INSERT INTO users(id,email,password,role) VALUES('loop-admin','admin@fixture.invalid','fixture','admin'),('buyer','buyer@fixture.invalid','fixture','user')");
  // Promotion's expensive video renderer is a port; actual preview extraction and
  // artifact decoding above still execute, and real campaign/creative rows persist.
  service._renderAdVideo = async () => ({ absPath: '/fixture/ad.mp4', storageUrl: 'https://fixture.invalid/ad.mp4' });
  let first;
  await t.test('concurrent initialization creates exactly one paused state row', async () => {
    const states = await Promise.all(Array.from({ length: 12 }, () => service._ensureStateRow()));
    assert(states.every(s => s.id === 'singleton' && s.enabled === false));
    assert.equal((await pg.pool.query('SELECT count(*)::int AS n FROM beat_money_loop_state')).rows[0].n, 1);
    assert.equal((await service.tick()).reason, 'disabled');
  });
  await t.test('generates decoded audio, a shorter private preview, awareness artwork, atomic listing and royalty ownership', async () => {
    first = await service.runCycle('manual', { genre: 'house', key: 'D minor' });
    assert.equal(first.status, 'awaiting_sale'); assert.equal(first.advertised, true);
    const listing = (await pg.pool.query("SELECT * FROM listings WHERE metadata->>'beatId'=$1", [first.beatId])).rows[0];
    assert.equal(listing.user_id, 'loop-admin'); assert.equal(listing.metadata.key, 'D minor'); assert.equal(listing.metadata.bpm, 128);
    assert.notEqual(listing.audio_url, listing.preview_url); assert(listing.artwork_url);
    assert(listing.artwork_url.startsWith('/api/storage/public/storefronts'));
    const full = assets.get(listing.audio_url.slice('/api/marketplace/audio/'.length));
    const preview = assets.get(listing.preview_url.slice('/api/marketplace/audio/'.length));
    assert(full.length > preview.length && preview.length > 1024);
    assert.equal((await pg.pool.query('SELECT percentage FROM royalty_splits WHERE release_id=$1', [first.beatId])).rows[0].percentage, 100);
    assert(requests.some(r => r.endpoint === '/api/generate/image'));
    assert.equal((await service.getStatus()).nextRunAt, null, 'manual run must not reschedule a paused loop');
  });
  await t.test('a second replica cannot run or orphan an active cycle while its database lock is held', async () => {
    const lock = await pg.pool.connect();
    try {
      await lock.query("SELECT pg_advisory_lock(hashtextextended('beat-money-loop:cycle',0))");
      await pg.pool.query("INSERT INTO beat_money_loop_cycles(id,status,started_at,triggered_by) VALUES('active-old','generating',now()-interval '2 days','schedule')");
      await assert.rejects(service.runCycle('manual'), /another worker/);
      await service.recoverOrphanedCycles();
      assert.equal((await pg.pool.query("SELECT status FROM beat_money_loop_cycles WHERE id='active-old'")).rows[0].status, 'generating');
    } finally { await lock.query("SELECT pg_advisory_unlock(hashtextextended('beat-money-loop:cycle',0))"); lock.release(); }
    await service.recoverOrphanedCycles();
    assert.equal((await pg.pool.query("SELECT status FROM beat_money_loop_cycles WHERE id='active-old'")).rows[0].status, 'failed');
    assert.equal(service.isCycleInFlight(), false);
  });
  await t.test('only a completed marketplace settlement marks sold; replay does not duplicate seller earnings', async () => {
    const listing = (await pg.pool.query("SELECT id FROM listings WHERE metadata->>'beatId'=$1", [first.beatId])).rows[0];
    await pg.pool.query("INSERT INTO orders(id,user_id,seller_id,listing_id,license_type,amount,currency,status) VALUES('sale','buyer','loop-admin',$1,'basic',29.99,'usd','pending')", [listing.id]);
    assert.equal(await service.recordMarketplaceSale('sale'), false);
    await pg.pool.query("UPDATE orders SET status='completed' WHERE id='sale'");
    assert.equal(await service.recordMarketplaceSale('sale'), false);
    await pg.pool.query("INSERT INTO commerce_sources(id,kind,currency,gross_cents,fee_cents) VALUES('sale','marketplace','usd',2999,300)");
    await pg.pool.query("INSERT INTO commerce_allocations(id,source_id,user_id,currency,amount_cents,reversed_cents) VALUES('seller-allocation','sale','loop-admin','usd',2699,0)");
    assert.equal(await service.recordMarketplaceSale('sale'), true);
    await service.recordMarketplaceSale('sale'); await service.analyseRecentCycles(); await service.analyseRecentCycles();
    let row = (await pg.pool.query('SELECT status,revenue_cents FROM beat_money_loop_cycles WHERE id=$1', [first.cycleId])).rows[0];
    assert.equal(row.status, 'sold'); assert.equal(row.revenue_cents, 2699);
    await pg.pool.query("UPDATE commerce_allocations SET reversed_cents=500 WHERE id='seller-allocation'");
    await service.analyseRecentCycles();
    row = (await pg.pool.query('SELECT revenue_cents FROM beat_money_loop_cycles WHERE id=$1', [first.cycleId])).rows[0];
    assert.equal(row.revenue_cents, 2199); assert.equal((await service.getStatus()).totalRevenueCents, 2199);
  });
  await t.test('zero published posts is reported honestly while retaining the payable listing', async () => {
    postsCreated = 0;
    const result = await service.runCycle('manual');
    assert.equal(result.status, 'awaiting_sale'); assert.equal(result.advertised, false); assert.match(result.note, /No social posts/);
  });
  await t.test('concurrent manual requests cannot overlap and pause clears queued cycles', async () => {
    let release;
    blockAudio = new Promise(resolve => { release = resolve; });
    const active = service.runCycle('manual');
    assert.equal(service.isCycleInFlight(), true);
    await assert.rejects(service.runCycle('manual'), /already in-flight/);
    service._pendingQueue.push({ genre: 'house' });
    await service.disable(); assert.equal(service._pendingQueue.length, 0);
    release(); blockAudio = undefined;
    assert.equal((await active).status, 'awaiting_sale');
    assert.equal((await service.getStatus()).nextRunAt, null);
  });
  await t.test('listing failure rolls back beat and royalty rows and removes public/audio uploads', async () => {
    const counts = async () => (await pg.pool.query('SELECT (SELECT count(*) FROM beats)::int AS beats, (SELECT count(*) FROM listings)::int AS listings, (SELECT count(*) FROM royalty_splits)::int AS splits')).rows[0];
    const before = await counts();
    const publicKeys = () => [...assets.keys()].filter(k => !k.startsWith('users/')).sort();
    const keys = publicKeys();
    await pg.pool.query("CREATE FUNCTION fixture_reject_listing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture listing rejected'; END $$; CREATE TRIGGER fixture_reject_listing BEFORE INSERT ON listings FOR EACH ROW EXECUTE FUNCTION fixture_reject_listing()");
    try {
      assert.equal((await service.runCycle('manual')).status, 'failed');
      assert.deepEqual(await counts(), before); assert.deepEqual(publicKeys(), keys);
    } finally { await pg.pool.query('DROP TRIGGER fixture_reject_listing ON listings; DROP FUNCTION fixture_reject_listing()'); }
  });
  await t.test('silent audio is rejected before listing even without renderer quality metadata', async () => {
    silentAudio = true;
    const before = (await pg.pool.query('SELECT count(*) AS n FROM listings')).rows[0].n;
    const result = await service.runCycle('manual');
    assert.equal(result.status, 'failed'); assert.match(result.error, /silent or too quiet/);
    assert.equal((await pg.pool.query('SELECT count(*) AS n FROM listings')).rows[0].n, before);
    silentAudio = false;
  });
  await t.test('renderer failure lists nothing, releases the slot and records backoff', async () => {
    failAudio = true;
    const before = Number((await pg.pool.query('SELECT count(*) AS n FROM listings')).rows[0].n);
    const result = await service.runCycle('manual'); assert.equal(result.status, 'failed'); assert.equal(service.isCycleInFlight(), false);
    assert.equal(Number((await pg.pool.query('SELECT count(*) AS n FROM listings')).rows[0].n), before);
    const status = await service.getStatus(); assert.equal(status.failedCycles, 3); assert.equal(status.currentCadenceMs, 12 * 60 * 60 * 1000);
    await service.disable(); assert.equal((await service.tick()).reason, 'disabled');
  });
});

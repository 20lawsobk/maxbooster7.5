import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("real SQL deletion journals survive node/commit failures and fence concurrent releases", { timeout: 60_000 }, async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "fabric-deletion-postgres-"));
  let database;
  try {
    database = await startDisposablePostgres();
    await database.pool.query(`
      CREATE TABLE fabric_objects (id text PRIMARY KEY, chunk_ids jsonb NOT NULL);
      CREATE TABLE fabric_chunks (id text PRIMARY KEY, ref_count integer NOT NULL, node_ids jsonb NOT NULL, size_bytes bigint NOT NULL);
      CREATE TABLE fabric_storage_nodes (id text PRIMARY KEY, used_bytes bigint NOT NULL);
      CREATE TABLE fabric_segments (object_id text NOT NULL);
    `);
    await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
    const contents = `
      import assert from 'node:assert/strict';
      import { DeletionOutbox } from ${JSON.stringify(path.join(root, "external/pdim/artifacts/api-server/src/pocket-dimension/fabric/infra/DeletionOutbox.ts"))};
      import { pool } from '@workspace/db';
      const outbox = new DeletionOutbox();
      const query = (text) => pool.query(text);
      async function seed(refs=1) {
        await query('TRUNCATE fabric_objects,fabric_chunks,fabric_storage_nodes,fabric_segments,fabric_deletion_objects,fabric_deletion_chunks');
        await query(\`INSERT INTO fabric_objects VALUES ('object','["chunk"]');
          INSERT INTO fabric_chunks VALUES ('chunk',\${refs},'["a","b"]',10);
          INSERT INTO fabric_storage_nodes VALUES ('a',10),('b',10);\`);
      }
      async function usage() {
        return (await query('SELECT id,used_bytes::integer AS used FROM fabric_storage_nodes ORDER BY id')).rows;
      }
      (async()=>{ try {
        await outbox.initialize();
        await seed();
        await Promise.all([outbox.claim('object'),new DeletionOutbox().claim('object')]);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_objects')).rows[0].n,0);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_deletion_objects')).rows[0].n,1);
        const calls=[];
        await assert.rejects(outbox.drainChunk('chunk',async node=>{calls.push(node);if(node==='b')throw Error('node offline')}),/node offline/);
        assert.deepEqual(await usage(),[{id:'a',used:0},{id:'b',used:10}]);
        assert.deepEqual((await query('SELECT state,done_nodes FROM fabric_deletion_chunks')).rows,[{state:'released',done_nodes:['a']}]);
        const restored = new DeletionOutbox();
        await restored.claim('object');
        await restored.drainChunk('chunk',async node=>{calls.push(node)});
        assert.deepEqual(calls,['a','b','b']);
        assert.equal(await restored.finish('object'),true);
        assert.deepEqual(await usage(),[{id:'a',used:0},{id:'b',used:0}]);

        await seed(2);
        await outbox.claim('object');
        await outbox.drainChunk('chunk',async()=>{throw Error('shared bytes cannot be deleted')});
        assert.equal((await query('SELECT ref_count FROM fabric_chunks')).rows[0].ref_count,1);
        assert.deepEqual(await usage(),[{id:'a',used:10},{id:'b',used:10}]);
        await outbox.finish('object');

        await seed();
        await outbox.claim('object');
        let releaseFence, announceFence;
        const fenceEntered = new Promise(resolve=>{announceFence=resolve});
        const holdFence = new Promise(resolve=>{releaseFence=resolve});
        const writer = outbox.withChunkLock('chunk',async()=>{announceFence();await holdFence});
        await fenceEntered;
        const fencedDeletes=[];
        const deletion = new DeletionOutbox().drainChunk('chunk',async node=>{fencedDeletes.push(node)});
        try {
          const deadline=Date.now()+2000;
          let waiters=0;
          while(Date.now()<deadline && !waiters) {
            waiters=(await query("SELECT count(*)::integer AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n;
            if(!waiters)await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.ok(waiters>0,'another worker must wait behind the same content fence');
          assert.deepEqual(fencedDeletes,[],'physical deletion cannot run inside another worker write');
        } finally {releaseFence()}
        await Promise.all([writer,deletion]);
        assert.deepEqual(fencedDeletes,['a','b']);
        await outbox.finish('object');

        await seed();
        await query(\`CREATE FUNCTION fail_deletion_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'claim fixture failure'; END $$;
          CREATE TRIGGER claim_failure BEFORE INSERT ON fabric_deletion_chunks FOR EACH ROW EXECUTE FUNCTION fail_deletion_claim();\`);
        await assert.rejects(outbox.claim('object'),error=>error.cause?.message.includes('claim fixture failure'));
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_objects')).rows[0].n,1);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_deletion_objects')).rows[0].n,0);
        await query('DROP TRIGGER claim_failure ON fabric_deletion_chunks; DROP FUNCTION fail_deletion_claim()');

        await outbox.claim('object');
        const concurrentCalls=[];
        await Promise.all([outbox.drainChunk('chunk',async node=>{concurrentCalls.push(node)}),
          new DeletionOutbox().drainChunk('chunk',async node=>{concurrentCalls.push(node)})]);
        assert.deepEqual(concurrentCalls,['a','b']);
        assert.deepEqual(await usage(),[{id:'a',used:0},{id:'b',used:0}]);
        await outbox.finish('object');

        await seed();
        await outbox.claim('object');
        await query(\`CREATE FUNCTION fail_deletion_accounting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'accounting fixture failure'; END $$;
          CREATE TRIGGER accounting_failure BEFORE UPDATE ON fabric_storage_nodes FOR EACH ROW EXECUTE FUNCTION fail_deletion_accounting();\`);
        const removed=new Set(), retries=[];
        const remove=async node=>{removed.delete(node);retries.push(node)};
        await assert.rejects(outbox.drainChunk('chunk',remove),error=>error.cause?.message.includes('accounting fixture failure'));
        assert.deepEqual((await query('SELECT done_nodes FROM fabric_deletion_chunks')).rows,[{done_nodes:[]}]);
        assert.deepEqual(await usage(),[{id:'a',used:10},{id:'b',used:10}]);
        await query('DROP TRIGGER accounting_failure ON fabric_storage_nodes; DROP FUNCTION fail_deletion_accounting()');
        await new DeletionOutbox().drainChunk('chunk',remove);
        assert.deepEqual(retries,['a','a','b']);
        assert.deepEqual(await usage(),[{id:'a',used:0},{id:'b',used:0}]);
        assert.equal(await outbox.finish('object'),true);
        console.log('Verified atomic claim rollback, shared references, restart retry, concurrent release fencing, and accounting commit retry');
      } finally { await pool.end(); } })().catch(error=>{console.error(error);process.exitCode=1});
    `;
    const fixture = path.join(scratch, "fixture.cjs");
    await build({ stdin: { contents, resolveDir: root, sourcefile: "fabric-deletion-fixture.ts", loader: "ts" },
      bundle: true, packages: "external", platform: "node", format: "cjs", outfile: fixture,
      alias: { "@workspace/db": path.join(root, "external/pdim/lib/db/src/index.ts") }, logLevel: "silent" });
    const options = database.pool.options;
    const url = new URL(`postgresql://${encodeURIComponent(options.user)}@localhost/${options.database}`);
    url.searchParams.set("host", options.host); url.searchParams.set("port", String(options.port));
    const child = spawnSync(process.execPath, [fixture], { cwd: scratch, encoding: "utf8", timeout: 45_000,
      env: { PATH: process.env.PATH, HOME: scratch, NODE_ENV: "test", DATABASE_URL: url.toString(),
        ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}) } });
    assert.equal(child.status, 0, child.stderr || child.stdout || child.error?.message);
    assert.match(child.stdout, /Verified atomic claim rollback/);
  } finally {
    await database?.stop();
    await rm(scratch, { recursive: true, force: true });
  }
});

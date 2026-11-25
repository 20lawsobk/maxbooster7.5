/** Owned process fixture: real current-format SQL + canonical local PDIM only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { startLocalPdimServer, stopLocalPdimServer, openConsistentPdimSnapshot } from "../../server/lib/localPdimServer.js";
import { HybridStorageService } from "../../server/services/hybridStorageService.js";
import { HybridStorageRepository } from "../../server/services/hybridStorageRepository.js";
import { HybridImmutableByteStore } from "../../server/services/hybridImmutableByteStore.js";
import { SocialMediaJobRepository } from "../../server/services/socialMediaJobRepository.js";
import { PocketDimensionChunkStore } from "../../server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.js";
import { MigrationOutbox } from "../../server/pocket-dimension/fabric/infra/MigrationOutbox.js";
import { withFabricCatalogLock } from "../../server/pocket-dimension/fabric/infra/DeletionOutbox.js";
import { pool } from "../../server/db.js";

const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const mode = process.argv[2], state = process.env.JOINT_EXPECTED_FILE!, bundle = process.env.JOINT_BUNDLE_DIR!;
const exec = async (cmd: string, ...args: unknown[]) => {
  const response = await fetch(process.env.PDIM_EXEC_URL!, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) throw Error(`Owned PDIM command rejected: ${String(result.error)}`);
  return result;
};
let denyDeletion = false;
const authority = { get: async (key: string) => (await exec("MGET", key))[0], set: (key: string, value: string) => exec("SET", key, value),
  setnx: (key: string, value: string) => exec("SETNX", key, value), del: (...keys: string[]) => {
    if (denyDeletion) throw Error("Owned interrupted physical deletion"); return exec("DEL", ...keys);
  } };
const service = new HybridStorageService({ repository: new HybridStorageRepository(pool), byteStore: new HybridImmutableByteStore(authority),
  loadLegacy: async () => null, openPocket: async () => ({ read: async () => { throw Error("Legacy bytes forbidden in current-format fixture"); },
    write: async () => { throw Error("Legacy writes forbidden"); }, delete: async () => { throw Error("Legacy deletion forbidden"); } }) });
const owner = { eval: (script: string, count: number, ...args: unknown[]) => exec("EVAL", script, count, ...args) };
const replica = (node: string) => new PocketDimensionChunkStore(node, () => owner as any);
const jobs = new SocialMediaJobRepository(pool);
try {
  await startLocalPdimServer();
  await service.initialize();
  if (mode === "source") {
    const pairId = process.env.JOINT_PAIR_ID!;
    await exec("SET", "recovery:pair-id", pairId);
    const privateBytes = Buffer.from("Current private audio 音楽 🎹 fixture bytes\0\xff"), publicBytes = Buffer.from("Current public artwork fixture");
    const a = await service.upload("joint-owner-a", "audio.wav", privateBytes, "audio/wav");
    const b = await service.upload("joint-owner-b", "same.wav", privateBytes, "audio/wav");
    assert.equal(b.isDeduplicated, true);
    const visible = await service.upload("joint-owner-a", "poster.png", publicBytes, "image/png", { isPublic: true });
    const deleted = await service.upload("joint-owner-a", "deleted.bin", Buffer.from("deleted content"), "application/octet-stream");
    await service.delete("joint-owner-a", deleted.key);
    await pool.query(`CREATE FUNCTION joint_pending_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.metadata->>'originalName'='pending.bin' AND NEW.state='active' THEN RAISE EXCEPTION 'Owned pending publication'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER joint_pending_publication BEFORE UPDATE ON hybrid_storage_files FOR EACH ROW EXECUTE FUNCTION joint_pending_publication()`);
    await assert.rejects(service.upload("joint-owner-a", "pending.bin", Buffer.from("pending durable bytes"), "application/octet-stream"));
    await pool.query("DROP TRIGGER joint_pending_publication ON hybrid_storage_files;DROP FUNCTION joint_pending_publication()");
    const pending = (await pool.query("SELECT key FROM hybrid_storage_files WHERE state='uploading'")).rows[0].key;
    const deleting = await service.upload("joint-owner-b", "deleting.bin", Buffer.from("retry deletion bytes"), "application/octet-stream");
    denyDeletion = true; await assert.rejects(service.delete("joint-owner-b", deleting.key), /interrupted physical deletion/); denyDeletion = false;
    const done = await jobs.create("video", "joint-done-job", "joint-owner-a");
    await jobs.finish(done, { status: "done", result: { url: `/api/storage/hybrid/file/${encodeURIComponent(a.key)}` } });
    await jobs.create("music-video", "joint-expired-job", "joint-owner-b");
    await pool.query("UPDATE social_media_jobs SET lease_expires_at=now()-interval '1 minute' WHERE id='joint-expired-job'");
    const replicaBytes = Buffer.from("current fabric migration replica"), chunkId = digest(replicaBytes), sourceKey = `${chunkId}.${randomUUID()}`;
    await replica("joint-node-a").putChunk(sourceKey, replicaBytes);
    await pool.query("INSERT INTO fabric_storage_nodes(id,capacity_bytes,used_bytes,healthy) VALUES('joint-node-a','1000000',$1,true),('joint-node-b','1000000','0',true)", [String(replicaBytes.length)]);
    await pool.query("INSERT INTO fabric_chunks(id,object_id,node_ids,size_bytes,checksum,physical_keys) VALUES($1,'joint-object','[\"joint-node-a\"]',$2,$1,$3)",
      [chunkId, String(replicaBytes.length), JSON.stringify({ "joint-node-a": sourceKey })]);
    await withFabricCatalogLock(() => new MigrationOutbox(replica).begin(chunkId, "joint-node-a", "joint-node-b"));
    const retiredKey = `${digest(Buffer.from("retired replica"))}.${randomUUID()}`;
    await replica("joint-retired-node").putChunk(retiredKey, Buffer.from("retired replica"));
    await replica("joint-retired-node").deleteChunk(retiredKey);
    const expected = { pairId, a: a.key, b: b.key, visible: visible.key, deleted: deleted.key, pending, deleting: deleting.key,
      privateHash: digest(privateBytes), publicHash: digest(publicBytes), pendingHash: digest(Buffer.from("pending durable bytes")), chunkId,
      replicaHash: digest(replicaBytes), replicaBytes: replicaBytes.length, retiredKey };
    fs.writeFileSync(state, JSON.stringify(expected), { mode: 0o600, flag: "wx" });
    // Every fixture writer has settled. No scheduled application workers run in
    // this process; the canonical AOF has acknowledged each mutation.
    const checkpoint = await openConsistentPdimSnapshot();
    try {
      const bytes = fs.readFileSync(checkpoint.fd);
      assert.equal(bytes.length, checkpoint.bytes);
      fs.writeFileSync(`${bundle}/pdim.json`, bytes, { mode: 0o600, flag: "wx" });
      console.log(`JOINT_RESULT ${JSON.stringify({ writersDrained: true, pinnedSnapshot: true, snapshotBytes: bytes.length,
        snapshotSha256: digest(bytes), activeFiles: 3, pendingUploads: 1, pendingDeletes: 1, mediaJobs: 2, migrationIntents: 1,
        permanentReplicaTombstones: 1, checkpoint: checkpoint.recoveryPoint })}`);
    } finally { fs.closeSync(checkpoint.fd); }
  } else {
    const expected = JSON.parse(fs.readFileSync(state, "utf8"));
    assert.equal(await exec("GET", "recovery:pair-id"), expected.pairId);
    assert.equal((await pool.query("SELECT pair_id FROM joint_recovery_marker")).rows[0].pair_id, expected.pairId);
    assert.equal(digest(await service.read("joint-owner-a", expected.a)), expected.privateHash);
    assert.equal(digest(await service.read("joint-owner-b", expected.b)), expected.privateHash);
    await assert.rejects(service.read("joint-owner-b", expected.a), /Access denied/);
    assert.equal(digest(await service.read("visitor", expected.visible)), expected.publicHash);
    const physical = (await pool.query("SELECT blob_key FROM hybrid_storage_files WHERE key=ANY($1) ORDER BY key", [[expected.a, expected.b]])).rows;
    assert.equal(physical.length, 2); assert.equal(physical[0].blob_key, physical[1].blob_key);
    assert.equal(await service.getMetadata(expected.deleted), undefined);
    assert.equal(await service.getMetadata(expected.pending), undefined);
    assert.equal(await service.getMetadata(expected.deleting), undefined);
    await assert.rejects(service.recoverPendingUpload("joint-owner-b", expected.pending), /Access denied/);
    assert.equal(await service.recoverPendingUpload("joint-owner-a", expected.pending), true);
    assert.equal(digest(await service.read("joint-owner-a", expected.pending)), expected.pendingHash);
    assert.equal(await service.delete("joint-owner-b", expected.deleting), true);
    assert.equal(await service.getMetadata(expected.deleting), undefined);
    assert.equal((await jobs.get("video", "joint-done-job", "joint-owner-a"))?.status, "done");
    assert.equal(await jobs.get("video", "joint-done-job", "joint-owner-b"), undefined);
    assert.equal((await jobs.get("music-video", "joint-expired-job", "joint-owner-b"))?.status, "error");
    await assert.rejects(replica("joint-retired-node").putChunk(expected.retiredKey, Buffer.from("late stale write")), /permanently deleted/);
    assert.equal(await replica("joint-retired-node").hasChunk(expected.retiredKey), false);
    await withFabricCatalogLock(async () => {
      const outbox = new MigrationOutbox(replica), pending = await outbox.pending(); assert.equal(pending.length, 1);
      await outbox.resume(pending[0]); assert.equal((await outbox.pending()).length, 0);
    });
    const location = (await pool.query("SELECT node_ids,physical_keys FROM fabric_chunks WHERE id=$1", [expected.chunkId])).rows[0];
    assert.deepEqual(location.node_ids, ["joint-node-b"]);
    assert.equal(digest(await replica("joint-node-b").getChunk(location.physical_keys["joint-node-b"])), expected.replicaHash);
    assert.deepEqual((await pool.query("SELECT id,used_bytes FROM fabric_storage_nodes ORDER BY id")).rows,
      [{ id: "joint-node-a", used_bytes: "0" }, { id: "joint-node-b", used_bytes: String(expected.replicaBytes) }]);
    await service.delete("joint-owner-a", expected.a);
    assert.equal(digest(await service.read("joint-owner-b", expected.b)), expected.privateHash, "deleting restored primary cannot remove another owner's dedup bytes");
    console.log(`JOINT_RESULT ${JSON.stringify({ currentSqlMetadataRecovered: true, currentPdimBytesRecovered: true,
      exactContentHashesVerified: 4, foreignOwnerDenials: 3, deletedFilesNotResurrected: 2, pendingUploadRecovered: true,
      pendingDeleteRecovered: true, mediaJobOwnershipAndExpiryVerified: true, migrationIntentRecovered: true,
      migrationAccountingVerified: true, permanentTombstoneVerified: true, crossOwnerDedupPreserved: true })}`);
  }
} finally { await stopLocalPdimServer(); await pool.end(); }

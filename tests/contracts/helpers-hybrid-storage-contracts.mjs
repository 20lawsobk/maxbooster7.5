// Reused behavior assertions: bundled Node subjects and instrumented direct TS subjects.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { startDisposablePostgres } from "../payment-processing/helpers-database-postgres.mjs";
import { contractCleanup } from "./helpers-contract-hooks.mjs";
export function defineHybridStorageContracts(hooks, loadSubjects) {
  const { describe, beforeAll, afterAll, test } = hooks;
  describe("hybrid metadata is shared across independent services without lost updates", () => {
    const cleanup = contractCleanup(afterAll);
    let database, HybridStorageService, HybridStorageRepository, HybridImmutableByteStore, parseLegacyHybridIndex;
    let blobs, legacyBlobs, legacy, legacyReads, failDelete, authority, service, first, second;
    beforeAll(async () => {
      database = await startDisposablePostgres();
      cleanup(() => database.stop());
      const migration = await readFile("migrations/0097_hybrid_storage_metadata.sql", "utf8");
      await database.pool.query(migration);
      await database.pool.query(migration);
      ({ HybridStorageService, HybridStorageRepository, HybridImmutableByteStore, parseLegacyHybridIndex } = await loadSubjects(cleanup));
      blobs = new Map();
      legacyBlobs = new Map();
      legacy = null;
      legacyReads = 0;
      failDelete = false;
      const bytes = {
        async write(key, data) { legacyBlobs.set(key, Buffer.from(data)); return { compressedSize: data.length }; },
        async read(key) { if (!legacyBlobs.has(key))
          throw Error("Missing fixture bytes"); return Buffer.from(legacyBlobs.get(key)); },
        async delete(key) { if (failDelete)
          throw Error("Fixture deletion outage"); return legacyBlobs.delete(key); },
      };
      authority = {
        async get(key) { return blobs.get(key) ?? null; },
        async set(key, value) { blobs.set(key, value); return "OK"; },
        async setnx(key, value) { if (blobs.has(key))
          return 0; blobs.set(key, value); return 1; },
        async del(...keys) { if (failDelete)
          throw Error("Fixture deletion outage"); keys.forEach(key => blobs.delete(key)); },
      };
      const repository = () => new HybridStorageRepository(database.pool);
      service = (repo = repository()) => new HybridStorageService({ repository: repo, byteStore: new HybridImmutableByteStore(authority), openPocket: async () => bytes,
        loadLegacy: async () => { legacyReads++; return legacy; } });
      first = service();
      second = service();
      await Promise.all([first.initialize(), second.initialize()]);
      assert.equal(legacyReads, 1, "A common SQL import marker serializes independent workers");
    });
    test("concurrent writes, fresh reads, unique same-name keys and ownership", async () => {
      const uploaded = await Promise.all(Array.from({ length: 24 }, (_, n) => (n % 2 ? first : second).upload(n < 12 ? "owner-a" : "owner-b", "same.wav", Buffer.from(`content-${n}`), "audio/wav")));
      assert.equal(new Set(uploaded.map(row => row.key)).size, 24);
      assert.equal((await first.listFiles("owner-a")).length, 12);
      assert.equal((await second.listFiles("owner-b")).length, 12);
      assert.equal((await second.getMetadata(uploaded[0].key)).userId, "owner-a");
      await assert.rejects(second.read("owner-b", uploaded[0].key), /Access denied/);
      await assert.rejects(second.delete("owner-b", uploaded[0].key), /Access denied/);
      await Promise.all(Array.from({ length: 20 }, () => second.read("owner-a", uploaded[0].key)));
      assert.equal((await first.getMetadata(uploaded[0].key)).accessCount, 20, "Atomic touches do not lose increments");
      await Promise.all(uploaded.map((row, n) => (n % 2 ? second : first).delete(n < 12 ? "owner-a" : "owner-b", row.key)));
      assert.deepEqual(await second.listFiles("owner-a"), []);
      assert.equal(blobs.size, 0);
    });
    test("public bytes have independent ownership records", async () => {
      const a = await first.upload("owner-a", "same.bin", Buffer.from("same"), "application/octet-stream", { isPublic: true });
      const b = await second.upload("owner-b", "same.bin", Buffer.from("same"), "application/octet-stream");
      assert.equal(b.isDeduplicated, true, "Shared immutable bytes retain distinct ownership records");
      assert.equal((await second.read("visitor", a.key)).toString(), "same");
      await first.delete("owner-a", a.key);
      assert.equal((await first.read("owner-b", b.key)).toString(), "same");
      await second.delete("owner-b", b.key);
    });
    test("concurrent final deletion and dedup admission preserve every successful upload", async () => {
      for (let iteration = 0; iteration < 12; iteration++) {
        const data = Buffer.from(`dedup-race-${iteration}`);
        const original = await first.upload("owner-a", "race.bin", data, "application/octet-stream");
        const [, copy] = await Promise.all([first.delete("owner-a", original.key),
          second.upload("owner-b", "race.bin", data, "application/octet-stream")]);
        assert.deepEqual(await service().read("owner-b", copy.key), data);
        await second.delete("owner-b", copy.key);
      }
      assert.equal(blobs.size, 0);
    });
    test("independent immutable handles reject missing/corrupt bytes and replacement", async () => {
      const key = `hybrid:v2:${randomUUID()}`, data = Buffer.from("integrity receipt");
      const a = new HybridImmutableByteStore(authority), b = new HybridImmutableByteStore(authority);
      await a.write(key, data);
      assert.deepEqual(await b.read(key), data);
      await assert.rejects(b.write(key, Buffer.from("replacement")), /replacement refused/);
      const manifest = JSON.parse(blobs.get(key)), chunkKey = `${key}:chunk:${manifest.chunks[0].hash}`;
      const original = blobs.get(chunkKey);
      blobs.delete(chunkKey);
      await assert.rejects(b.write(key, data), /chunk missing/);
      blobs.set(chunkKey, Buffer.from("corrupt").toString("base64"));
      await assert.rejects(b.write(key, data), /checksum mismatch/);
      blobs.set(chunkKey, original);
      await b.delete(key);
    });
    test("metadata publication failures retain invisible recoverable intents and never ACK", async () => {
      await database.pool.query(`CREATE FUNCTION fail_hybrid_publish() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN IF NEW.state='active' THEN RAISE EXCEPTION 'Fixture publication outage'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER fail_hybrid_publish BEFORE UPDATE ON hybrid_storage_files FOR EACH ROW EXECUTE FUNCTION fail_hybrid_publish()`);
      await assert.rejects(first.upload("owner-a", "recover.bin", Buffer.from("recover"), "application/octet-stream"), /Fixture publication outage/);
      assert.deepEqual(await second.listFiles("owner-a"), []);
      const pending = (await database.pool.query("SELECT key,state FROM hybrid_storage_files WHERE state='uploading'")).rows;
      assert.equal(pending.length, 1);
      await database.pool.query("DROP TRIGGER fail_hybrid_publish ON hybrid_storage_files; DROP FUNCTION fail_hybrid_publish()");
      await assert.rejects(second.recoverPendingUpload("other-owner", pending[0].key), /Access denied/);
      await second.recoverPendingUpload("owner-a", pending[0].key);
      assert.equal((await first.read("owner-a", pending[0].key)).toString(), "recover");
      await first.delete("owner-a", pending[0].key);
    });
    test("physical delete failure remains durable and retryable from another worker", async () => {
      const upload = await first.upload("owner-a", "delete.bin", Buffer.from("delete"), "application/octet-stream");
      failDelete = true;
      await assert.rejects(first.delete("owner-a", upload.key), /Fixture deletion outage/);
      assert.equal(await second.getMetadata(upload.key), undefined);
      assert.equal((await database.pool.query("SELECT state FROM hybrid_storage_files WHERE key=$1", [upload.key])).rows[0].state, "deleting");
      failDelete = false;
      assert.equal(await second.delete("owner-a", upload.key), true);
      assert.equal(await first.delete("owner-a", upload.key), false);
    });
    test("empty analytics, missing objects and download authority have explicit outcomes", async () => {
      const analytics = await first.getAnalytics();
      assert.equal(analytics.totalFiles, 0);
      assert.equal(analytics.overallCompressionRatio, 1);
      assert.equal(analytics.costSavingsPercent, 0);
      assert.deepEqual(analytics.recommendations, []);
      assert.equal((await first.getTierBreakdown()).cold.compressionRatio, 1);
      assert.equal((await first.getDeduplicationStats()).savingsPercent, 0);
      assert.equal(await first.exists("missing"), false);
      await assert.rejects(first.read("owner", "missing"), /File not found/);
      await assert.rejects(first.getDownloadUrl("owner", "missing"), /File not found/);
      assert.equal(await first.recoverPendingUpload("owner", "missing"), false);
      assert.equal(await first.tierDown("missing"), false);
      assert.equal(await first.migrateFile("owner", "missing", "cold", "pocket-dimension"), false);
    });
    test("invalid uploads never create an intent and zero-byte files remain readable", async () => {
      const count = async () => Number((await database.pool.query("SELECT count(*) AS n FROM hybrid_storage_files")).rows[0].n);
      const before = await count();
      for (const args of [["", "file", Buffer.from("x"), "a/b"], ["owner", "", Buffer.from("x"), "a/b"],
        ["owner", "file", "not bytes", "a/b"], ["owner", "file", Buffer.from("x"), ""]]) {
        await assert.rejects(first.upload(...args), /Invalid hybrid upload/);
      }
      assert.equal(await count(), before);
      const empty = await first.upload("empty-owner", "empty.bin", Buffer.alloc(0), "application/octet-stream");
      assert.equal(empty.compressionRatio, 1);
      assert.deepEqual(await second.read("empty-owner", empty.key), Buffer.alloc(0));
      const emptyCopy = await second.upload("empty-copy", "empty.bin", Buffer.alloc(0), "application/octet-stream");
      assert.equal(emptyCopy.isDeduplicated, true);
      assert.equal(emptyCopy.compressionRatio, 1);
      assert.equal(await first.recoverPendingUpload("empty-owner", empty.key), true);
      await second.delete("empty-owner", empty.key);
      assert.deepEqual(await first.read("empty-copy", emptyCopy.key), Buffer.alloc(0));
      await first.delete("empty-copy", emptyCopy.key);
    });
    test("folder and tier filters preserve owner boundaries and stable download URLs", async () => {
      const a = await first.upload("filter-a", "space name.wav", Buffer.from("filter-private"), "audio/wav", { folder: "takes/one" });
      const b = await second.upload("filter-b", "public.wav", Buffer.from("filter-public"), "audio/wav", { isPublic: true });
      assert.match(a.key, /^filter-a\/takes\/one\/.+-space_name.wav$/);
      assert.deepEqual((await second.listFiles("filter-a", { tier: "cold", location: "pocket-dimension", folder: "takes/one" })).map(row => row.key), [a.key]);
      assert.deepEqual(await first.listFiles("filter-a", { tier: "hot" }), []);
      assert.deepEqual(await first.listFiles("filter-a", { location: "replit" }), []);
      assert.deepEqual(await first.listFiles("filter-a", { folder: "elsewhere" }), []);
      assert.deepEqual(new Set((await first.listFiles("filter-a", { includePublic: true })).map(row => row.key)), new Set([a.key, b.key]));
      await assert.rejects(second.getDownloadUrl("filter-b", a.key), /Access denied/);
      assert.equal(await first.getDownloadUrl("visitor", b.key), `/api/storage/hybrid/file/${encodeURIComponent(b.key)}`);
      assert.equal(await second.exists(a.key), true);
      assert.equal(await first.tierDown(a.key), false);
      await assert.rejects(first.migrateFile("foreign", a.key, "cold", "pocket-dimension"), /Access denied/);
      assert.equal(await second.migrateFile("filter-a", a.key, "hot", "replit"), true);
      assert.equal((await first.getMetadata(a.key)).location, "pocket-dimension");
      await first.delete("filter-a", a.key);
      await first.delete("filter-b", b.key);
    });
    test("physical analytics count shared bytes once and scope logical ownership", async () => {
      const data = Buffer.from("shared analytics");
      const a = await first.upload("analytics-a", "a", data, "application/octet-stream");
      const b = await first.upload("analytics-a", "b", data, "application/octet-stream");
      const c = await second.upload("analytics-b", "c", data, "application/octet-stream");
      await second.read("analytics-a", a.key);
      const all = await first.getAnalytics();
      assert.equal(all.totalFiles, 3);
      assert.equal(all.totalSizeBytes, data.length * 3);
      assert.equal(all.physicalSizeBytes, a.compressedSize);
      assert.equal(all.deduplication.totalDuplicates, 2);
      assert.equal(all.deduplication.spaceSaved, data.length * 2);
      assert.equal(all.deduplication.crossUserDuplicates, 2);
      assert.equal(all.tierBreakdown.cold.count, 1);
      assert.equal(all.tierBreakdown.cold.compressionRatio, data.length / a.compressedSize);
      assert.equal(all.accessPatterns.mostAccessed[0].key, a.key);
      assert.equal((await second.getAnalytics("analytics-b")).totalFiles, 1);
      assert.equal((await second.getDeduplicationStats("analytics-a")).crossUserDuplicates, 0);
      await first.delete("analytics-a", a.key);
      await first.delete("analytics-a", b.key);
      await first.delete("analytics-b", c.key);
    });
    test("cleanup recommendations and deletion honor age, access and owner", async () => {
      const uploads = await Promise.all(Array.from({ length: 12 }, (_, n) => first.upload("cleanup-a", String(n), Buffer.from(`cleanup-${n}`), "application/octet-stream")));
      const foreign = await first.upload("cleanup-b", "foreign", Buffer.from("cleanup-foreign"), "application/octet-stream");
      const old = new Date(Date.now() - 120 * 86400000).toISOString();
      await database.pool.query("UPDATE hybrid_storage_files SET metadata=jsonb_set(metadata,'{lastAccessed}',to_jsonb($1::text))", [old]);
      await second.read("cleanup-a", uploads[0].key);
      const analytics = await first.getAnalytics("cleanup-a");
      assert.equal(analytics.recommendations[0].type, "cleanup");
      assert.equal(analytics.recommendations[0].affectedKeys.length, 10);
      assert.equal(analytics.recommendations[0].potentialSavings, uploads.slice(1).reduce((n, row) => n + row.sizeBytes, 0));
      for (const age of [-1, NaN, Infinity]) await assert.rejects(first.cleanup("cleanup-a", { olderThanDays: age }), /Invalid cleanup age/);
      const cleaned = await first.cleanup("cleanup-a");
      assert.equal(cleaned.deletedCount, 11);
      assert.equal(cleaned.freedBytes, uploads.slice(1).reduce((n, row) => n + row.sizeBytes, 0));
      assert.equal(await second.exists(foreign.key), true);
      assert.equal(await second.exists(uploads[0].key), true);
      assert.deepEqual(await second.cleanup("cleanup-a", { olderThanDays: 1 }), { deletedCount: 0, freedBytes: 0 });
      await first.delete("cleanup-a", uploads[0].key);
      await first.delete("cleanup-b", foreign.key);
    });
    test("legacy hot-tier decisions only migrate old, infrequently used physical entries", async () => {
      const rows = await Promise.all(Array.from({ length: 4 }, (_, n) => first.upload("tier-owner", String(n), Buffer.from(`tier-${n}`), "application/octet-stream")));
      const old = new Date(Date.now() - 31 * 86400000).toISOString();
      for (const [n, row] of rows.entries()) await database.pool.query(`UPDATE hybrid_storage_files SET metadata=metadata || $2::jsonb WHERE key=$1`, [row.key,
        JSON.stringify({ tier: "hot", lastAccessed: n === 2 ? new Date().toISOString() : old, accessCount: n === 1 ? 5 : 0, isDeduplicated: n === 3 })]);
      assert.deepEqual(await first.runAutoTiering(), { tieredDown: 1, tieredUp: 0 });
      assert.equal((await second.getMetadata(rows[0].key)).tier, "cold");
      assert.equal((await second.getMetadata(rows[1].key)).tier, "hot");
      assert.equal((await second.getMetadata(rows[2].key)).tier, "hot");
      assert.equal(await second.tierDown(rows[3].key), false);
      assert.equal((await first.getTierBreakdown("tier-owner")).hot.count, 3);
      assert.deepEqual(await first.optimizeStorage("tier-owner"), { tieredDown: 0, tieredUp: 0, deduplicated: 0 });
      for (const row of rows) await first.delete("tier-owner", row.key);
    });
    test("SQL publication and duplicate-key failures reject without partial committed rows", async () => {
      const repo = new HybridStorageRepository(database.pool);
      await assert.rejects(repo.activate("missing", 1), /lost its pending record/);
      assert.equal(await repo.markCold("missing"), false);
      const upload = await first.upload("sql-owner", "original", Buffer.from("sql conflict"), "application/octet-stream");
      const metadata = await first.getMetadata(upload.key);
      await assert.rejects(repo.beginUpload(metadata, `hybrid:v2:${randomUUID()}`), /duplicate key/);
      assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM hybrid_storage_files WHERE key=$1", [upload.key])).rows[0].n, 1);
      assert.equal((await second.read("sql-owner", upload.key)).toString(), "sql conflict");
      assert.equal(await repo.markCold(upload.key, "foreign"), false);
      await first.delete("sql-owner", upload.key);
    });
    test("invalid byte receipts and corrupted pending data never become visible", async () => {
      let receipt = -1;
      const badStore = { async write() { return { compressedSize: receipt }; }, async read() { return Buffer.from("wrong bytes"); }, async delete() { return true; } };
      const instance = new HybridStorageService({ repository: new HybridStorageRepository(database.pool), byteStore: badStore, openPocket: async () => badStore, loadLegacy: async () => null });
      for (receipt of [-1, NaN, 0.5]) await assert.rejects(instance.upload("receipt-owner", "bad", Buffer.from("intended bytes"), "application/octet-stream"), /Invalid stored byte receipt/);
      assert.deepEqual(await first.listFiles("receipt-owner"), []);
      const pending = (await database.pool.query("SELECT key FROM hybrid_storage_files WHERE user_id='receipt-owner'")).rows;
      assert.equal(pending.length, 3);
      await assert.rejects(instance.recoverPendingUpload("receipt-owner", pending[0].key), /pending upload integrity/);
      await database.pool.query("UPDATE hybrid_storage_files SET state='deleting' WHERE key=$1", [pending[0].key]);
      assert.equal(await instance.recoverPendingUpload("receipt-owner", pending[0].key), false);
      await database.pool.query("DELETE FROM hybrid_storage_files WHERE user_id='receipt-owner'");
    });
    test("deduplicated and active reads verify full content before acknowledgement", async () => {
      const upload = await first.upload("integrity-owner", "source", Buffer.from("verify actual bytes"), "application/octet-stream");
      const badStore = { async read() { return Buffer.from("different bytes"); }, async write() { throw Error("Unexpected rewrite"); }, async delete() { return true; } };
      const instance = new HybridStorageService({ repository: new HybridStorageRepository(database.pool), byteStore: badStore, openPocket: async () => badStore, loadLegacy: async () => null });
      await assert.rejects(instance.upload("integrity-copy", "copy", Buffer.from("verify actual bytes"), "application/octet-stream"), /deduplicated bytes failed verification/);
      await assert.rejects(instance.read("integrity-owner", upload.key), /stored file integrity/);
      assert.deepEqual(await first.listFiles("integrity-copy"), []);
      await database.pool.query("DELETE FROM hybrid_storage_files WHERE user_id='integrity-copy'");
      await first.delete("integrity-owner", upload.key);
    });
    test("immutable publication needs a confirmed manifest and rejects corrupt metadata", async () => {
      const key = `hybrid:v2:${randomUUID()}`;
      const store = new HybridImmutableByteStore(authority);
      await assert.rejects(store.read("unsafe-key"), /Invalid immutable/);
      await assert.rejects(store.read(key), /not found/);
      assert.equal(await store.delete(key), false);
      for (const manifest of [{}, { version: 1, bytes: -1 }, { version: 1, bytes: 0, sha256: "z".repeat(64) }]) {
        blobs.set(key, JSON.stringify(manifest));
        await assert.rejects(store.read(key), /Corrupt immutable hybrid manifest/);
      }
      blobs.delete(key);
      const unconfirmed = new HybridImmutableByteStore({ ...authority, async setnx(target, value) { if (target.includes(":chunk:")) return authority.setnx(target, value); return 0; } });
      await assert.rejects(unconfirmed.write(key, Buffer.from("unconfirmed")), /publication was not confirmed/);
      assert.equal(blobs.has(key), false);
      for (const blobKey of blobs.keys()) if (blobKey.startsWith(`${key}:chunk:`)) blobs.delete(blobKey);
      await store.write(key, Buffer.from("manifest hash check"));
      const manifest = JSON.parse(blobs.get(key));
      blobs.set(key, JSON.stringify({ ...manifest, sha256: "0".repeat(64) }));
      await assert.rejects(store.read(key), /content integrity/);
      blobs.set(key, JSON.stringify(manifest));
      await store.delete(key);
      assert.equal(blobs.size, 0);
    });
    test("legacy parser rejects public-map corruption and cyclic or unresolved ownership", async () => {
      const row = { key: "legacy/a", userId: "legacy", originalName: "a", mimeType: "application/octet-stream", sizeBytes: 1,
        compressedSize: 1, contentHash: "hash", tier: "cold", location: "pocket-dimension", accessCount: 0,
        createdAt: new Date(), lastAccessed: new Date(), isPublic: false, isDeduplicated: false };
      const index = { files: { [row.key]: row }, contentHashes: { hash: [row.key] }, publicHashes: {} };
      assert.throws(() => parseLegacyHybridIndex(JSON.stringify({ ...index, publicHashes: { hash: 7 } })), /public-hash references/);
      assert.throws(() => parseLegacyHybridIndex(JSON.stringify({ ...index, publicHashes: { wrongHash: row.key } })), /public-hash references/);
      assert.equal(parseLegacyHybridIndex(JSON.stringify({ ...index, publicHashes: { hash: row.key } }))[0].blobKey, "storage/legacy/a");
      for (const deduplicationRef of [undefined, row.key, "missing"]) {
        assert.throws(() => parseLegacyHybridIndex(JSON.stringify({ ...index, files: { [row.key]: { ...row, isDeduplicated: true, deduplicationRef } } })), /deduplication.*reference/);
      }
      const other = { ...row, key: "legacy/b", contentHash: "other" };
      assert.throws(() => parseLegacyHybridIndex(JSON.stringify({ ...index, files: { [row.key]: { ...row, isDeduplicated: true, deduplicationRef: other.key }, [other.key]: other } })), /unresolved hybrid deduplication/);
    });
    test("verified containers reject inconsistent headers and decoded lengths", async () => {
      const key = `hybrid:v2:${randomUUID()}`, data = Buffer.from("container payload");
      const store = new HybridImmutableByteStore(authority);
      for (const [originalBytes, isDelta, chunkBytes, error] of [[data.length + 1, false, data.length, /header mismatch/],
        [data.length, true, data.length, /header mismatch/], [data.length + 1, false, data.length + 1, /decoded length mismatch/]]) {
        const header = Buffer.from(JSON.stringify({ profile: "lossless-max-dedup", contentClass: "unknown", codec: "store", isDelta, originalBytes }));
        const prefix = Buffer.alloc(9); prefix.write("PDCF"); prefix.writeUInt8(1, 4); prefix.writeUInt32LE(header.length, 5);
        const encoded = Buffer.concat([prefix, header, data]);
        const hash = createHash("sha256").update(encoded).digest("hex");
        blobs.set(`${key}:chunk:${hash}`, encoded.toString("base64"));
        blobs.set(key, JSON.stringify({ version: 1, bytes: chunkBytes, compressedSize: encoded.length,
          sha256: createHash("sha256").update(data).digest("hex"), chunks: [{ hash, bytes: chunkBytes }] }));
        await assert.rejects(store.read(key), error);
        await store.delete(key);
      }
      assert.equal(blobs.size, 0);
    });
    test("rollback transport failures preserve the original error and release SQL clients", async () => {
      const upload = await first.upload("rollback-owner", "existing", Buffer.from("rollback source"), "application/octet-stream");
      let releases = 0;
      const pool = { query: (...args) => database.pool.query(...args), async connect() {
        const client = await database.pool.connect();
        return { query(text, values) { return text === "ROLLBACK" ? Promise.reject(Error("Fixture rollback transport outage")) : client.query(text, values); },
          release() { releases++; client.release(Error("Fixture closed connection")); } };
      } };
      const repo = new HybridStorageRepository(pool);
      await database.pool.query("TRUNCATE hybrid_storage_imports");
      await assert.rejects(repo.importLegacy(async () => { throw Error("Fixture legacy load outage"); }), /Fixture legacy load outage/);
      await assert.rejects(repo.beginUpload(await first.getMetadata(upload.key), `hybrid:v2:${randomUUID()}`), /duplicate key/);
      await assert.rejects(repo.beginDelete(upload.key, "foreign"), /Access denied/);
      assert.equal(releases, 3);
      assert.equal((await first.read("rollback-owner", upload.key)).toString(), "rollback source");
      await first.delete("rollback-owner", upload.key);
    });
    test("a deletion waiting on the content lock observes a completed concurrent deletion", async () => {
      const upload = await first.upload("delete-race-owner", "race", Buffer.from("locked deletion"), "application/octet-stream");
      const row = (await database.pool.query("SELECT blob_key FROM hybrid_storage_files WHERE key=$1", [upload.key])).rows[0];
      const blocker = await database.pool.connect();
      let pending;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`hybrid-content:${upload.contentHash}`]);
        pending = new HybridStorageRepository(database.pool).beginDelete(upload.key, "delete-race-owner");
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          blocked = Number((await database.pool.query("SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()")).rows[0].n) > 0;
          if (blocked) break;
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.equal(blocked, true, "The deleting transaction must have read the row and reached the shared content lock");
        await database.pool.query("DELETE FROM hybrid_storage_files WHERE key=$1", [upload.key]);
        await blocker.query("COMMIT");
        assert.deepEqual(await pending, { found: false });
      } finally { await blocker.query("ROLLBACK"); blocker.release(); }
      await new HybridImmutableByteStore(authority).delete(row.blob_key);
      assert.equal(await second.exists(upload.key), false);
    });
    test("legacy aliases retain the original blob after primary deletion and cannot resurrect", async () => {
      await database.pool.query("TRUNCATE hybrid_storage_files,hybrid_storage_imports");
      const data = Buffer.from("legacy bytes"), hash = createHash("sha256").update(data).digest("hex");
      const base = { key: "old-owner/primary", userId: "old-owner", originalName: "old.bin", mimeType: "application/octet-stream",
        sizeBytes: data.length, compressedSize: data.length, contentHash: hash, tier: "cold", location: "pocket-dimension",
        accessCount: 0, createdAt: new Date(), lastAccessed: new Date(), isPublic: false, isDeduplicated: false };
      const alias = { ...base, key: "alias-owner/copy", userId: "alias-owner", isDeduplicated: true, deduplicationRef: base.key };
      legacy = JSON.stringify({ files: { [base.key]: base, [alias.key]: alias }, contentHashes: { [hash]: [base.key, alias.key] }, publicHashes: {} });
      legacyBlobs.set(`storage/${base.key}`, data);
      const imported = service();
      await imported.initialize();
      await imported.delete(base.userId, base.key);
      assert.equal((await service().read(alias.userId, alias.key)).toString(), "legacy bytes");
      await imported.delete(alias.userId, alias.key);
      const restarted = service();
      await restarted.initialize();
      assert.deepEqual(await restarted.listFiles(alias.userId), []);
      assert.equal(blobs.size + legacyBlobs.size, 0);
    });
    test("unknown legacy references abort the entire import and retain the source", async () => {
      await database.pool.query("TRUNCATE hybrid_storage_files,hybrid_storage_imports");
      legacy = JSON.stringify({ files: {}, contentHashes: { hash: ["missing"] }, publicHashes: {} });
      const retained = legacy;
      await assert.rejects(service().initialize(), /ownership index/);
      assert.equal(legacy, retained);
      assert.equal((await database.pool.query("SELECT count(*)::integer AS n FROM hybrid_storage_imports")).rows[0].n, 0);
      assert.equal((await database.pool.query("SELECT count(*)::integer AS n FROM hybrid_storage_files")).rows[0].n, 0);
    });
  });
}

// Same real PostgreSQL/owned-file contracts run through both test frameworks.
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startDisposablePostgres } from "../payment-processing/helpers-database-postgres.mjs";
import { contractCleanup } from "./helpers-contract-hooks.mjs";
export function defineSocialMediaJobContracts(hooks, loadSubjects) {
  const { describe, beforeAll, afterAll, test } = hooks;
  describe("social media jobs share PostgreSQL status and fence interrupted render workers", () => {
    const cleanup = contractCleanup(afterAll);
    let pool, SocialMediaJobRepository, keepMediaJobAlive, createVideoJobPollHandler, createMusicVideoJobPollHandler;
    let first, second, result, invoke;
    beforeAll(async () => {
      const cluster = await startDisposablePostgres();
      cleanup(() => cluster.stop());
      pool = cluster.pool;
      await pool.query("CREATE TABLE users(id varchar PRIMARY KEY); INSERT INTO users(id) VALUES('owner'),('foreign')");
      await pool.query(await readFile("migrations/0098_social_media_jobs.sql", "utf8"));
      // Migration is additive and repeatable; no configured database is involved.
      await pool.query(await readFile("migrations/0098_social_media_jobs.sql", "utf8"));
      ({ SocialMediaJobRepository, keepMediaJobAlive, createVideoJobPollHandler, createMusicVideoJobPollHandler } = await loadSubjects());
      first = new SocialMediaJobRepository(pool);
      second = new SocialMediaJobRepository(pool);
      result = { success: true, url: "/api/files/owned-video", thumbnail_url: "/api/files/owned-poster", metadata: { duration: 12 } };
      invoke = async (handler, id, owner = "owner") => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await handler({ params: { jobId: id }, user: owner ? { id: owner } : undefined }, res);
        return res;
      };
    });
    test("a second worker polls a real committed video result with the same public response contract", async () => {
      const lease = await first.create("video", "video_owned", "owner");
      const handler = createVideoJobPollHandler(second);
      assert.equal((await invoke(handler, lease.id)).body.status, "processing");
      assert.equal(await first.finish(lease, { status: "done", result }), true);
      const polled = await invoke(handler, lease.id);
      assert.equal(polled.statusCode, 200);
      assert.equal(polled.body.status, "completed");
      assert.equal(polled.body.url, result.url);
      assert.equal(polled.body.video_url, result.url);
      assert.equal(polled.body.thumbnail_url, result.thumbnail_url);
      assert.deepEqual(polled.body.metadata, result.metadata);
    });
    test("music-video status survives a new repository instance and handlers isolate owner/family/auth", async () => {
      const lease = await first.create("music-video", "mvjob_owned", "owner");
      assert.equal(await first.finish(lease, { status: "done", result }), true);
      const handler = createMusicVideoJobPollHandler(new SocialMediaJobRepository(pool));
      assert.equal((await invoke(handler, lease.id)).body.videoUrl, result.url);
      assert.equal((await invoke(handler, lease.id)).body.thumbnailUrl, result.thumbnail_url);
      assert.equal((await invoke(handler, lease.id, "foreign")).statusCode, 404);
      assert.equal((await invoke(createVideoJobPollHandler(second), lease.id)).statusCode, 404);
      assert.equal((await invoke(handler, lease.id, null)).statusCode, 401);
    });
    test("foreign polls cannot expire another owner's row; owned polls persist an explicit interruption", async () => {
      const lease = await first.create("music-video", "mvjob_interrupted", "owner");
      await pool.query("UPDATE social_media_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [lease.id]);
      assert.equal(await second.get("music-video", lease.id, "foreign"), undefined);
      assert.equal((await pool.query("SELECT status FROM social_media_jobs WHERE id=$1", [lease.id])).rows[0].status, "processing");
      const response = await invoke(createMusicVideoJobPollHandler(second), lease.id);
      assert.equal(response.body.status, "failed");
      assert.match(response.body.error, /worker stopped/);
      assert.equal(await first.heartbeat(lease), false);
      assert.equal(await first.finish(lease, { status: "done", result }), false);
      assert.equal((await first.get("music-video", lease.id, "owner")).status, "error");
    });
    test("lease expiry fences a stalled writer even before another worker polls", async () => {
      const lease = await first.create("video", "video_late", "owner");
      await pool.query("UPDATE social_media_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [lease.id]);
      assert.equal(await first.finish(lease, { status: "done", result }), false);
      assert.equal((await invoke(createVideoJobPollHandler(second), lease.id)).statusCode, 500);
    });
    test("forged tokens and duplicate terminal writes cannot overwrite acknowledged results", async () => {
      const lease = await first.create("video", "video_fenced", "owner");
      assert.equal(await second.finish({ ...lease, token: "wrong" }, { status: "error", error: "forged" }), false);
      assert.equal(await first.finish(lease, { status: "done", result }), true);
      assert.equal(await second.finish(lease, { status: "error", error: "late" }), false);
      assert.equal((await second.get("video", lease.id, "owner")).result.url, result.url);
      await assert.rejects(first.create("video", lease.id, "owner"), /duplicate key/);
    });
    test("concurrent terminal writers acknowledge exactly one immutable outcome", async () => {
      const lease = await first.create("video", "video_completion_race", "owner");
      const outcomes = await Promise.all([
        first.finish(lease, { status: "done", result }),
        second.finish(lease, { status: "error", error: "racing failure" }),
      ]);
      assert.equal(outcomes.filter(Boolean).length, 1);
      const row = await first.get("video", lease.id, "owner");
      assert.equal(row.status, outcomes[0] ? "done" : "error");
      if (outcomes[0])
        assert.equal(row.result.url, result.url);
      else
        assert.equal(row.error, "racing failure");
    });
    test("completed jobs require actual asset references and cannot persist an oversized result", async () => {
      const lease = await first.create("video", "video_validation", "owner");
      await assert.rejects(first.finish(lease, { status: "done", result: { success: true } }), /durable asset URL/);
      for (const url of [{}, 42, "", "javascript:alert(1)", "file:///tmp/private.mp4", "//foreign.test/video", "https://user:password@foreign.test/video"]) {
        await assert.rejects(first.finish(lease, { status: "done", result: { url } }), /durable asset URL/);
      }
      await assert.rejects(first.finish(lease, { status: "done", result: { url: result.url, excess: "x".repeat(1048576) } }), /too large/);
      assert.equal((await second.get("video", lease.id, "owner")).status, "processing");
    });
    test("polling never reports corrupt persisted URL values as completed media", async () => {
      const lease = await first.create("music-video", "mvjob_corrupt", "owner");
      await pool.query("UPDATE social_media_jobs SET status='done',result='{}'::jsonb WHERE id=$1", [lease.id]);
      const response = await invoke(createMusicVideoJobPollHandler(second), lease.id);
      assert.equal(response.body.status, "failed");
      assert.equal(response.body.success, false);
    });
    test("real heartbeat extends ownership and the timer stops after shutdown", async () => {
      const lease = await first.create("video", "video_alive", "owner");
      await pool.query("UPDATE social_media_jobs SET lease_expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1", [lease.id]);
      let failures = 0;
      let heartbeats = 0;
      let heartbeatInFlight;
      const observed = { heartbeat(value) { heartbeats++; heartbeatInFlight = first.heartbeat(value); return heartbeatInFlight; } };
      const stop = keepMediaJobAlive(observed, lease, () => failures++, 5);
      try {
        const deadline = Date.now() + 2000;
        let remaining = 0;
        while (remaining < 30 && Date.now() < deadline) {
          remaining = Number((await pool.query("SELECT extract(epoch FROM lease_expires_at-clock_timestamp()) AS remaining FROM social_media_jobs WHERE id=$1", [lease.id])).rows[0].remaining);
          if (remaining < 30)
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(remaining > 30);
        assert.equal(failures, 0);
      }
      finally {
        stop();
      }
      await heartbeatInFlight;
      const stoppedCount = heartbeats;
      await new Promise(resolve => setTimeout(resolve, 25));
      assert.equal(heartbeats, stoppedCount);
    });
    test("new admissions bound stale metadata cleanup without pruning healthy rendering jobs", async () => {
      const stale = await first.create("video", "video_stale", "owner");
      await first.finish(stale, { status: "error", error: "old" });
      await pool.query("UPDATE social_media_jobs SET updated_at=clock_timestamp()-interval '8 days' WHERE id=$1", [stale.id]);
      const active = await first.create("video", "video_not_stale", "owner");
      assert.equal(await second.get("video", stale.id, "owner"), undefined);
      await pool.query("UPDATE social_media_jobs SET updated_at=clock_timestamp()-interval '8 days' WHERE id=$1", [active.id]);
      await pool.query(`INSERT INTO social_media_jobs(id,family,owner_id,status,lease_token,updated_at)
   SELECT 'retention_'||value,'video','owner','error','old-token',clock_timestamp()-interval '8 days'
   FROM generate_series(1,105) AS value`);
      await first.create("video", "video_triggers_prune", "owner");
      assert.equal(Number((await pool.query("SELECT count(*) FROM social_media_jobs WHERE id LIKE 'retention_%'")).rows[0].count), 5);
      assert.equal((await second.get("video", active.id, "owner")).status, "processing");
    });
    test("database outage returns an explicit retryable polling error", async () => {
      const unavailable = new SocialMediaJobRepository({ query: async () => { throw new Error("database unavailable: private fixture connection diagnostic"); } });
      const video = await invoke(createVideoJobPollHandler(unavailable), "video_owned");
      assert.equal(video.statusCode, 503);
      assert.deepEqual(video.body, { success: false, status: "error", message: "Job status is temporarily unavailable" });
      const music = await invoke(createMusicVideoJobPollHandler(unavailable), "mvjob_owned");
      assert.equal(music.statusCode, 503);
      assert.deepEqual(music.body, { success: false, error: "Job status is temporarily unavailable" });
    });
    test("terminal validation rejects malformed URLs and accepts explicit HTTP assets without weakening ownership", async () => {
      const lease = await first.create("video", "video_url_boundaries", "owner");
      await assert.rejects(first.finish(lease, { status: "processing" }), /terminal media status/);
      for (const value of [" https://asset.invalid/video", "https://asset.invalid/video ", "https://[", "https://:password@asset.invalid/video"]) {
        await assert.rejects(first.finish(lease, { status: "done", result: { video_url: value } }), /durable asset URL/);
      }
      await assert.rejects(first.finish(lease, { status: "done", result: { video_url: "" } }), /durable asset URL/);
      const circular = { url: "/api/files/owned" }; circular.self = circular;
      await assert.rejects(first.finish(lease, { status: "done", result: circular }), /circular/i);
      assert.equal((await second.get("video", lease.id, "owner")).status, "processing");
      assert.equal(await first.finish(lease, { status: "done", result: { video_url: "https://asset.invalid/owned-video", thumbnailUrl: "/owned-poster" } }), true);
      const response = await invoke(createVideoJobPollHandler(second), lease.id);
      assert.equal(response.body.url, "https://asset.invalid/owned-video");
      assert.equal(response.body.thumbnail_url, "/owned-poster");
      assert.deepEqual(response.body.metadata, {});
      const http = await first.create("music-video", "mvjob_http_asset", "owner");
      assert.equal((await invoke(createMusicVideoJobPollHandler(second), http.id)).body.status, "processing");
      assert.equal(await first.finish(http, { status: "done", result: { url: "http://asset.invalid/owned-video" } }), true);
      const music = await invoke(createMusicVideoJobPollHandler(second), http.id);
      assert.equal(music.body.videoUrl, "http://asset.invalid/owned-video");
      assert.equal(music.body.thumbnailUrl, null);
      assert.equal((await invoke(createVideoJobPollHandler(second), http.id, null)).statusCode, 401);
    });
    test("legacy incomplete rows have explicit private polling failures and fallback metadata", async () => {
      for (const [id, status, result, error] of [
        ["video_legacy_empty", "done", {}, null],
        ["video_legacy_null", "done", null, null],
        ["video_legacy_error", "error", null, null],
      ]) {
        const lease = await first.create("video", id, "owner");
        await pool.query("UPDATE social_media_jobs SET status=$2,result=$3::jsonb,error=$4 WHERE id=$1", [lease.id, status, result === null ? null : JSON.stringify(result), error]);
        const response = await invoke(createVideoJobPollHandler(second), lease.id);
        assert.equal(response.statusCode, 500);
        assert.equal(response.body.status, "error");
        assert.equal(typeof response.body.error, "string");
        assert.equal((await invoke(createVideoJobPollHandler(second), lease.id, "foreign")).statusCode, 404);
      }
      const lease = await first.create("video", "video_no_thumbnail", "owner");
      assert.equal(await first.finish(lease, { status: "done", result: { url: "/api/files/owned-no-poster" } }), true);
      assert.equal((await invoke(createVideoJobPollHandler(second), lease.id)).body.thumbnail_url, null);
      const music = await first.create("music-video", "mvjob_thumbnail_alias", "owner");
      assert.equal(await first.finish(music, { status: "done", result: { video_url: "/api/files/owned-music", thumbnailUrl: "/owned-poster" } }), true);
      assert.equal((await invoke(createMusicVideoJobPollHandler(second), music.id)).body.thumbnailUrl, "/owned-poster");
      const failed = await first.create("video", "video_default_error", "owner");
      assert.equal(await first.finish(failed, { status: "error" }), true);
      assert.equal((await second.get("video", failed.id, "owner")).error, "Video generation failed");
    });
    test("lost leases and database failures stop heartbeat renewal exactly once", async () => {
      const waitFor = async predicate => {
        const deadline = Date.now() + 2000;
        while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(predicate(), true, "Owned heartbeat must settle within its bounded fixture deadline");
      };
      const expired = await first.create("video", "video_heartbeat_expired", "owner");
      await pool.query("UPDATE social_media_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired.id]);
      let failures = 0;
      const stop = keepMediaJobAlive(first, expired, () => failures++, 2);
      try { await waitFor(() => failures === 1); await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(failures, 1); }
      finally { stop(); }
      const unavailable = new SocialMediaJobRepository({ query: async () => { throw new Error("owned database unavailable"); } });
      failures = 0;
      const stopUnavailable = keepMediaJobAlive(unavailable, expired, () => failures++, 2);
      try { await waitFor(() => failures === 1); await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(failures, 1); }
      finally { stopUnavailable(); }
    });
    test("queued heartbeat callbacks cannot renew or notify after cancellation", async () => {
      // The manual interval is an external scheduler boundary. Replaying an
      // already-queued callback verifies cancellation and single-flight guards.
      const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
      let tick, cleared = 0, selectedDelay;
      const handle = { unref() {} };
      globalThis.setInterval = (callback, delay) => { tick = callback; selectedDelay = delay; return handle; };
      globalThis.clearInterval = timer => { if (timer === handle) cleared++; else originalClear(timer); };
      try {
        for (const rejection of [false, true]) {
          let release, calls = 0, failures = 0;
          const pending = new Promise((resolve, reject) => { release = rejection ? reject : resolve; });
          const authority = { heartbeat() { calls++; return pending; } };
          const stop = keepMediaJobAlive(authority, { id: "owned", family: "video", ownerId: "owner", token: "owned-token" }, () => failures++);
          assert.equal(selectedDelay, 10_000);
          tick(); tick();
          assert.equal(calls, 1, "A slow authority permits only one heartbeat in flight");
          stop();
          release(rejection ? new Error("owned transport interrupted") : false);
          await new Promise(resolve => setImmediate(resolve));
          tick();
          assert.equal(calls, 1, "An already-queued callback remains inert after stop");
          assert.equal(failures, 0, "A completion after cancellation cannot notify a stopped owner");
        }
        assert.ok(cleared >= 2);
      } finally { globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear; }
    });
  });
  describe("scene validation releases actual owned staged uploads on every early 400 branch", () => {
    const cleanup = contractCleanup(afterAll);
    let directory, rejectInvalidMusicVideoSceneRequest;
    beforeAll(async () => {
      ({ rejectInvalidMusicVideoSceneRequest } = await loadSubjects());
      directory = await mkdtemp(path.join(tmpdir(), "social-video-upload-cleanup-"));
      cleanup(() => rm(directory, { recursive: true, force: true }));
    });
    const cases = [
      { name: "missing direction", body: { topic: "" }, audio: true, error: /topic, hook, or body/ },
      { name: "URL direction", body: { topic: "https://example.invalid/video" }, audio: true, error: /URL topics/ },
      { name: "unsupported platform", body: { platform: "invalid" }, audio: true, error: /supported platform/ },
      { name: "missing audio", body: {}, audio: false, error: /audio file is required/ },
    ];
    for (const [index, scenario] of cases.entries()) {
      test(scenario.name, async () => {
        const fields = ["images", "reference_voice", ...(scenario.audio ? ["audio"] : [])];
        const files = {};
        const paths = [];
        for (const field of fields) {
          const filePath = path.join(directory, `${index}-${field}`);
          await writeFile(filePath, "owned upload fixture");
          paths.push(filePath);
          files[field] = [{ path: filePath }];
        }
        const req = { body: { ai_generate_scenes: "true", topic: "Owned test song", platform: "tiktok", ...scenario.body }, files };
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        assert.equal(await rejectInvalidMusicVideoSceneRequest(req, res, ["tiktok"]), true);
        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, scenario.error);
        for (const filePath of paths)
          await assert.rejects(stat(filePath), { code: "ENOENT" });
      });
    }
    test("valid and non-scene requests retain their staged files for the real renderer", async () => {
      const filePath = path.join(directory, "valid-audio");
      await writeFile(filePath, "retained input");
      const req = { body: { ai_generate_scenes: "true", topic: "Owned test song", platform: "tiktok" }, files: { audio: [{ path: filePath }] } };
      const unexpectedResponse = { status() { throw new Error("Valid scene request must reach its renderer"); } };
      assert.equal(await rejectInvalidMusicVideoSceneRequest(req, unexpectedResponse, ["tiktok"]), false);
      assert.equal(await readFile(filePath, "utf8"), "retained input");
      req.body.ai_generate_scenes = "false";
      assert.equal(await rejectInvalidMusicVideoSceneRequest(req, unexpectedResponse, ["tiktok"]), false);
      assert.equal(await readFile(filePath, "utf8"), "retained input");
    });
    test("cleanup handles single, array and absent multipart paths including missing files", async () => {
      const single = path.join(directory, "single-upload"), array = path.join(directory, "array-upload");
      await writeFile(single, "owned single upload"); await writeFile(array, "owned array upload");
      const invokeInvalid = async request => {
        const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        assert.equal(await rejectInvalidMusicVideoSceneRequest(request, response, ["tiktok"]), true);
        assert.equal(response.code, 400);
      };
      await invokeInvalid({ body: { ai_generate_scenes: "true" }, file: { path: single }, files: [{ path: array }, { path: path.join(directory, "already-removed") }, {}, null] });
      for (const filePath of [single, array]) await assert.rejects(stat(filePath), { code: "ENOENT" });
      await invokeInvalid({ body: { ai_generate_scenes: "true" }, file: { path: path.join(directory, "single-already-removed") } });
      await invokeInvalid({ body: { ai_generate_scenes: "true", topic: "Owned song", platform: 7 }, files: {} });
      const noResponse = { status() { throw new Error("Missing scene mode is a no-op"); } };
      assert.equal(await rejectInvalidMusicVideoSceneRequest({}, noResponse, ["tiktok"]), false);
    });
  });
}

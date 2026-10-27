import { test } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { startDisposablePostgres, loadDatabaseSubject } from "./payment-processing/helpers-database-postgres.mjs";

test("publish-now and schedule edits never reset a real racing worker claim or uncertain delivery", async t => {
  const cluster = await startDisposablePostgres();
  t.after(() => cluster.stop());
  const { pool } = cluster;
  await pool.query(`CREATE TABLE posts(id varchar PRIMARY KEY,user_id varchar NOT NULL,status text,engagement jsonb,
    scheduled_at timestamp,published_at timestamp,platform text,content text,media_urls text[],campaign_id varchar,
    approval_status text,submitted_by varchar,reviewed_by varchar,reviewed_at timestamp,rejection_reason text,
    platform_post_id text,created_at timestamp DEFAULT now());`);
  globalThis.__socialPublishNowDb = drizzle(pool);
  t.after(() => { delete globalThis.__socialPublishNowDb; });
  const subject = await loadDatabaseSubject("server/services/socialPostingRepository.ts", {
    "../db.js": "export const db=globalThis.__socialPublishNowDb;",
  });
  const seed = async (id, status = "pending", engagement = {}) => {
    await pool.query("INSERT INTO posts(id,user_id,status,engagement,scheduled_at,platform,content,media_urls) VALUES($1,'owner',$2,$3::jsonb,now()+interval '1 day','twitter','test','{}') ON CONFLICT(id) DO UPDATE SET status=excluded.status,engagement=excluded.engagement", [id, status, JSON.stringify(engagement)]);
  };
  const updates = { platforms: ["twitter"], content: { text: "updated" }, mediaUrls: [], scheduledTime: new Date(), createdBy: "manual" };
  await t.test("owned immediate admission advances the due time without claiming provider success", async () => {
    await seed("immediate");
    assert.equal(await subject.requestImmediateSocialPost("attacker", "immediate"), undefined);
    assert.ok(await subject.requestImmediateSocialPost("owner", "immediate"));
    const { rows: [row] } = await pool.query("SELECT status,scheduled_at,published_at FROM posts WHERE id='immediate'");
    assert.equal(row.status, "pending"); assert.equal(row.published_at, null);
    assert.ok(row.scheduled_at.getTime() <= Date.now());
  });
  await t.test("worker claim winning the row lock rejects both subsequent admission paths", async () => {
    await seed("race");
    const worker = await pool.connect();
    try {
      await worker.query("BEGIN");
      await worker.query("UPDATE posts SET status='posting' WHERE id='race'");
      const immediate = subject.requestImmediateSocialPost("owner", "race");
      const schedule = subject.updateQueuedSocialPost("owner", "race", "pending", updates);
      await worker.query("COMMIT");
      assert.equal(await immediate, undefined); assert.equal(await schedule, undefined);
      assert.equal((await pool.query("SELECT status FROM posts WHERE id='race'")).rows[0].status, "posting");
    } finally { await worker.query("ROLLBACK"); worker.release(); }
  });
  await t.test("only one SQL dispatcher claims after duplicate immediate admissions", async () => {
    await seed("duplicate");
    await Promise.all(Array.from({ length: 6 }, () => subject.requestImmediateSocialPost("owner", "duplicate")));
    const claims = await Promise.all(Array.from({ length: 6 }, () => subject.claimSocialPost("duplicate")));
    assert.equal(claims.filter(Boolean).length, 1);
  });
  await t.test("all receipt representations and terminal states remain fenced", async () => {
    for (const [index, engagement] of [
      { postingResults: [{ outcome: "unknown" }] }, { results: [{ outcome: "started" }] },
      [{ outcome: "confirmed", success: true }], { postingResults: [{ success: true }] },
      { postingRecoveryRequired: true },
    ].entries()) {
      const id = `receipt-${index}`; await seed(id, "pending", engagement);
      assert.equal(await subject.requestImmediateSocialPost("owner", id), undefined);
      assert.equal(await subject.updateQueuedSocialPost("owner", id, "pending", updates), undefined);
    }
    for (const status of ["posting", "completed", "published"]) {
      await seed(status, status);
      assert.equal(await subject.requestImmediateSocialPost("owner", status), undefined);
      assert.equal(await subject.updateQueuedSocialPost("owner", status, status, updates), undefined);
    }
  });
  await t.test("schedule updates require the observed status and retain owned normalized content", async () => {
    await seed("schedule", "draft");
    assert.equal(await subject.updateQueuedSocialPost("owner", "schedule", "pending", updates), undefined);
    assert.equal(await subject.updateQueuedSocialPost("attacker", "schedule", "draft", updates), undefined);
    assert.ok(await subject.updateQueuedSocialPost("owner", "schedule", "draft", updates));
    const { rows: [row] } = await pool.query("SELECT status,engagement FROM posts WHERE id='schedule'");
    assert.equal(row.status, "pending"); assert.deepEqual(row.engagement.content, updates.content);
  });
});

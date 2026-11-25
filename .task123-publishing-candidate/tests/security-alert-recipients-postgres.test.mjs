import { test } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { startDisposablePostgres, loadDatabaseSubject } from "./payment-processing/helpers-database-postgres.mjs";

test("security alerts use real administrator recipients and retain honest delivery outcomes", { timeout: 60_000 }, async t => {
  const cluster = await startDisposablePostgres();
  t.after(() => cluster.stop());
  const { pool } = cluster;
  await pool.query(`
    CREATE TABLE users(id varchar PRIMARY KEY,role text NOT NULL);
    CREATE TABLE notifications(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id),type text NOT NULL,title text NOT NULL,
      message text,is_read boolean DEFAULT false,action_url text,metadata jsonb,created_at timestamp DEFAULT now());
    CREATE TABLE ip_blacklist(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),ip text NOT NULL,
      reason text NOT NULL,severity text,threat_id varchar,blocked_at timestamp DEFAULT now(),
      expires_at timestamp,is_active boolean DEFAULT true,block_count integer DEFAULT 1,metadata jsonb,created_at timestamp DEFAULT now());
    CREATE TABLE security_threats(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),threat_type text NOT NULL,
      severity text NOT NULL,source_ip text,user_id varchar,session_id varchar,path text,method text,
      indicators jsonb,confidence real,status text,healing_actions jsonb,detected_at timestamp DEFAULT now(),
      resolved_at timestamp,metadata jsonb,created_at timestamp DEFAULT now());
    INSERT INTO users VALUES('admin-one','admin'),('admin-two','admin'),('ordinary-user','user');
  `);
  globalThis.__securityAlertWarnings = [];
  t.after(() => { delete globalThis.__securityAlertWarnings; });
  const { SelfHealingSecurityEngine, selfHealingEngine } = await loadDatabaseSubject(
    "server/services/selfHealingSecurityEngine.ts", {
      "../db.js": `export const db={select(){const chain={from(){return chain},where(){return chain},async limit(){return []}};return chain}};`,
      "../logger.js": `export const logger={info(){},error(){},warn(...args){globalThis.__securityAlertWarnings.push(args)}};`,
    });
  await selfHealingEngine.ready();
  selfHealingEngine.stop();
  t.after(() => selfHealingEngine.stop());

  async function trigger(ip) {
    const engine = new SelfHealingSecurityEngine({ database: drizzle(pool), autoStart: false, initialLoadAttempts: 1 });
    await engine.start();
    try {
      const completed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Owned security pipeline did not complete")), 5_000);
        engine.once("threat_healed", result => { clearTimeout(timer); resolve(result); });
      });
      engine.processSecurityEvent({ type: "request", category: "api", source: { ip, userAgent: "OwnedSecurityFixture" },
        payload: { path: "/api/search", method: "GET", query: { q: "' UNION SELECT password FROM users --" } } });
      const result = await completed;
      assert.equal(engine.isIpBlocked(ip), true, "Notification delivery cannot disable IP mitigation");
      const persisted = (await pool.query("SELECT healing_actions FROM security_threats ORDER BY created_at DESC LIMIT 1")).rows[0];
      assert.ok(persisted, "Threat recovery evidence remains durable");
      return { outcome: result.actionOutcomes.find(action => action.type === "alert"),
        persisted: persisted.healing_actions.find(action => action.type === "alert") };
    } finally { engine.stop(); }
  }

  await t.test("two actual admins receive FK-valid inbox alerts while an ordinary user does not", async () => {
    const result = await trigger("192.0.2.71");
    const rows = (await pool.query("SELECT user_id,type FROM notifications ORDER BY user_id")).rows;
    assert.deepEqual(rows, [{ user_id: "admin-one", type: "security_alert" }, { user_id: "admin-two", type: "security_alert" }]);
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM users")).rows[0].n, 3, "No invented system account");
    for (const outcome of [result.outcome, result.persisted]) {
      assert.equal(outcome.status, "completed");
      assert.equal(outcome.alertSent, true);
      assert.equal(outcome.recipientCount, 2);
      assert.equal(outcome.alertDelivery, "inbox");
    }
  });

  await t.test("no-admin installations retain threat and structured-log evidence without claiming an inbox delivery", async () => {
    await pool.query("TRUNCATE notifications; UPDATE users SET role='user'");
    const result = await trigger("192.0.2.72");
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM notifications")).rows[0].n, 0);
    for (const outcome of [result.outcome, result.persisted]) {
      assert.equal(outcome.alertSent, false);
      assert.equal(outcome.recipientCount, 0);
      assert.equal(outcome.alertDelivery, "structured_log");
    }
    assert.ok(globalThis.__securityAlertWarnings.some(args => args[1]?.includes("no administrator recipients")));
  });

  await t.test("a real notification-write failure is recorded as failed and does not leak database diagnostics", async () => {
    await pool.query(`UPDATE users SET role='admin' WHERE id LIKE 'admin-%';
      CREATE FUNCTION fail_security_notification() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private_db_diagnostic_marker'; END $$;
      CREATE TRIGGER fail_security_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_security_notification()`);
    const result = await trigger("192.0.2.73");
    for (const outcome of [result.outcome, result.persisted]) {
      assert.equal(outcome.status, "failed");
      assert.notEqual(outcome.alertSent, true);
      assert.equal(outcome.error, "Error: Security alert persistence failed");
    }
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM notifications")).rows[0].n, 0);
    assert.ok(!JSON.stringify(globalThis.__securityAlertWarnings).includes("private_db_diagnostic_marker"));
    await pool.query("DROP TRIGGER fail_security_notification ON notifications; DROP FUNCTION fail_security_notification()");
  });

  await t.test("an unavailable recipient query cannot create a false delivery acknowledgement", async () => {
    await pool.query("ALTER TABLE users RENAME COLUMN role TO temporarily_unavailable_role");
    try {
      const result = await trigger("192.0.2.74");
      assert.equal(result.outcome.status, "failed");
      assert.notEqual(result.outcome.alertSent, true);
      assert.equal(result.persisted.error, "Error: Security alert persistence failed");
    } finally { await pool.query("ALTER TABLE users RENAME COLUMN temporarily_unavailable_role TO role"); }
  });
});

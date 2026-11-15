// Synthetic local SQL only. Never load application DB defaults or provider adapters.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createErasureRequests } from "../server/services/accountErasureRequests";
import { createErasureWorkflowRepository, type ErasureApproval } from "../server/services/accountErasureWorkflow";
import { createSessionAuthority } from "../server/services/sessionAuthority";

assert(!Object.keys(process.env).some(k => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|NODE_OPTIONS/.test(k)),
  "Refusing inherited database/runtime configuration");
const host = process.argv[2];
assert.match(host, /^\/tmp\/readiness-pg-[A-Za-z0-9]+$/);
const pool = new pg.Pool({
  host, port: 55439, user: "rehearsal", database: "postgres",
  password: "local-synthetic-only", max: 12, statement_timeout: 15000,
});
const requests = createErasureRequests(pool);
const repository = createErasureWorkflowRepository(pool);
let assertions = 0;
async function check(name: string, work: () => Promise<void>) {
  await work();
  assertions++;
  console.log(`- PASS local erasure/digest: ${name}`);
}
async function makeCase(userId: string): Promise<ErasureApproval> {
  await pool.query("INSERT INTO users (id,email,password) VALUES ($1,$2,'synthetic-only')", [userId, `${userId}@example.invalid`]);
  await requests.request(userId);
  // Synthetic fixture, NOT retention approval or a production bypass.
  const { rows: [row] } = await pool.query(
    "UPDATE account_erasure_requests SET not_before=now()-interval '1 second' WHERE user_id=$1 RETURNING request_id", [userId]);
  return {
    requestId: row.request_id, userId, policyVersion: "synthetic-policy", inventoryVersion: "synthetic-inventory",
    approvedBy: "synthetic-reviewer", approvalRef: "synthetic-approval", validUntil: Date.now() + 60000,
    notBefore: 0, legalHold: false, inventoryComplete: true, writesFenced: true,
    systems: [{ id: "synthetic-objects", eligibleAfter: 0, legalHold: false }],
  };
}
async function waitForLock(pid: number) {
  for (let i = 0; i < 100; i++) {
    const { rows: [state] } = await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid]);
    if (state?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Concurrent transaction never reached lock wait");
}

try {
  const { rows: [identity] } = await pool.query(
    "SELECT current_setting('data_directory') AS data, current_setting('listen_addresses') AS listen, current_database() AS db");
  assert.equal(identity.data, `${host}/data`);
  assert.equal(identity.listen, "");
  assert.equal(identity.db, "postgres");

  await check("request + epoch revocation roll back atomically", async () => {
    await pool.query("INSERT INTO users(id,email,password) VALUES ('erasure-rollback','erasure-rollback@example.invalid','synthetic')");
    const authority = createSessionAuthority(pool);
    assert.equal(await authority.issue("erasure-rollback"), "1");
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await createErasureRequests(tx).request("erasure-rollback");
      assert.equal((await tx.query("SELECT generation FROM auth_session_epochs WHERE user_id='erasure-rollback'")).rows[0].generation, "2");
      await tx.query("ROLLBACK");
    } finally { tx.release(); }
    assert.equal(await authority.issue("erasure-rollback"), "1");
    assert.equal(await requests.status("erasure-rollback"), null);
  });

  await check("concurrent requests preserve cycle/date and every committed revocation", async () => {
    const a = await makeCase("erasure-duplicates");
    const before = (await pool.query("SELECT requested_at FROM account_erasure_requests WHERE user_id=$1", [a.userId])).rows[0];
    const authority = createSessionAuthority(pool);
    const generation = BigInt(await authority.issue(a.userId));
    await Promise.all(Array.from({ length: 8 }, () => requests.request(a.userId)));
    const row = (await pool.query("SELECT request_id,requested_at FROM account_erasure_requests WHERE user_id=$1", [a.userId])).rows[0];
    assert.equal(row.request_id, a.requestId);
    assert.equal(row.requested_at.getTime(), before.requested_at.getTime());
    assert.equal(BigInt(await authority.issue(a.userId)), generation + 8n);
  });

  await check("eight competing claims yield one owner; retry reclaim fences stale receipts", async () => {
    const a = await makeCase("erasure-claims");
    assert.equal(await repository.prepare(a), 1);
    assert.equal(await repository.prepare(a), 0);
    const leases = Array.from({ length: 8 }, () => randomUUID());
    const claimed = await Promise.all(leases.map(lease => repository.claim(a, "synthetic-objects", lease)));
    assert.equal(claimed.filter(Boolean).length, 1);
    const firstLease = leases[claimed.indexOf(true)];
    assert.equal(await requests.cancel(a.userId), false);
    assert.equal((await requests.status(a.userId))?.status, "processing");
    await assert.rejects(repository.acknowledge(a.requestId, "synthetic-objects", randomUUID(), "wrong-owner"), /stale lease/);
    await repository.retry(a.requestId, "synthetic-objects", firstLease);
    assert.equal(await repository.claim(a, "synthetic-objects", randomUUID()), false);
    await pool.query("UPDATE account_erasure_steps SET retry_at=now()-interval '1 second' WHERE request_id=$1", [a.requestId]);
    const secondLease = randomUUID();
    assert.equal(await repository.claim(a, "synthetic-objects", secondLease), true);
    await assert.rejects(repository.acknowledge(a.requestId, "synthetic-objects", firstLease, "stale"), /stale lease/);
    await pool.query("UPDATE account_erasure_steps SET lease_until=now()-interval '1 second' WHERE request_id=$1", [a.requestId]);
    await assert.rejects(repository.acknowledge(a.requestId, "synthetic-objects", secondLease, "expired"), /stale lease/);
    const thirdLease = randomUUID();
    assert.equal(await repository.claim(a, "synthetic-objects", thirdLease), true);
    await repository.acknowledge(a.requestId, "synthetic-objects", thirdLease, "synthetic-receipt");
    assert.equal(await repository.claim(a, "synthetic-objects", randomUUID()), false);
    const row = (await pool.query("SELECT status,attempts,receipt_ref FROM account_erasure_steps WHERE request_id=$1", [a.requestId])).rows[0];
    assert.deepEqual(row, { status: "acknowledged", attempts: 3, receipt_ref: "synthetic-receipt" });
    assert.equal((await requests.status(a.userId))?.status, "processing"); // never false completion
  });

  await check("exact inventory and approval matching plus DB not-before gate", async () => {
    const a = await makeCase("erasure-matching");
    await repository.prepare(a);
    for (const mismatch of [
      { policyVersion: "different" }, { inventoryVersion: "different" },
      { approvalRef: "different" }, { approvedBy: "different" }, { userId: "unowned" },
      { systems: [...a.systems, { id: "unplanned", eligibleAfter: 0, legalHold: false }] },
    ]) {
      assert.equal(await repository.claim({ ...a, ...mismatch }, "synthetic-objects", randomUUID()), false);
    }
    await pool.query("UPDATE account_erasure_requests SET not_before=now()+interval '1 day' WHERE request_id=$1", [a.requestId]);
    assert.equal(await repository.claim(a, "synthetic-objects", randomUUID()), false);
    assert.equal((await requests.status(a.userId))?.status, "pending_policy");
  });

  for (const winner of ["cancel", "claim"] as const) {
    await check(`${winner} wins locked race: cancellation/claim cannot both commit; reopen isolates old inventory`, async () => {
      const a = await makeCase(`erasure-race-${winner}`);
      await repository.prepare(a);
      const first = await pool.connect();
      const second = await pool.connect();
      let pending: Promise<boolean> | undefined;
      try {
        const pid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await first.query("BEGIN");
        if (winner === "cancel") {
          assert.equal(await createErasureRequests(first).cancel(a.userId), true);
          pending = createErasureWorkflowRepository(second).claim(a, "synthetic-objects", randomUUID());
        } else {
          assert.equal(await createErasureWorkflowRepository(first).claim(a, "synthetic-objects", randomUUID()), true);
          pending = createErasureRequests(second).cancel(a.userId);
        }
        // Attach a rejection handler while inspecting the deterministic lock barrier.
        pending.catch(() => {});
        await waitForLock(pid);
        await first.query("COMMIT");
        assert.equal(await pending, false);
      } finally {
        await first.query("ROLLBACK");
        if (pending) await pending.catch(() => {});
        first.release(); second.release();
      }
      if (winner === "cancel") {
        await requests.request(a.userId);
        const row = (await pool.query("SELECT request_id,status,policy_version,completed_at FROM account_erasure_requests WHERE user_id=$1", [a.userId])).rows[0];
        assert.notEqual(row.request_id, a.requestId);
        assert.equal(row.status, "pending_policy");
        assert.equal(row.policy_version, null);
        assert.equal(row.completed_at, null);
        assert.equal(await repository.claim(a, "synthetic-objects", randomUUID()), false);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_erasure_steps WHERE request_id=$1", [a.requestId])).rows[0].n, 1);
      }
    });
  }

  await check("receipt/status constraints and digest frequency/state/FK constraints reject invalid rows", async () => {
    const a = await makeCase("erasure-constraints");
    await repository.prepare(a);
    await assert.rejects(pool.query("UPDATE account_erasure_steps SET status='acknowledged' WHERE request_id=$1", [a.requestId]),
      (error: { code?: string }) => error.code === "23514");
    await assert.rejects(pool.query("UPDATE account_erasure_steps SET status='completed' WHERE request_id=$1", [a.requestId]),
      (error: { code?: string }) => error.code === "23514");
    const insert = `INSERT INTO integration_notification_digest
      (id,user_id,type,title,message,frequency,due_at,state) VALUES ($1,$2,'synthetic','synthetic','synthetic',$3,now(),$4)`;
    await pool.query(insert, [randomUUID(), a.userId, "daily", "pending"]);
    for (const [frequency, state, user, code] of [
      ["monthly", "pending", a.userId, "23514"],
      ["daily", "completed", a.userId, "23514"],
      ["weekly", "pending", "missing-user", "23503"],
    ]) {
      await assert.rejects(pool.query(insert, [randomUUID(), user, frequency, state]),
        (error: { code?: string }) => error.code === code);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM integration_notification_digest")).rows[0].n, 1);
  });
  console.log(`${assertions} local erasure/digest checks passed; no deletion adapters or provider calls executed.`);
} finally {
  await pool.end();
}
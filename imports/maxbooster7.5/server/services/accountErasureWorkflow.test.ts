import { test } from "node:test";
import assert from "node:assert/strict";
import { createErasureWorkflow, createErasureWorkflowRepository, validateErasureApproval,
  type ErasureApproval, type ErasureWorkflowRepository } from "./accountErasureWorkflow.js";
import { createErasureHandlers } from "./accountErasureHandlers.js";
import { createErasureRequests } from "./accountErasureRequests.js";
import type { Request, Response, NextFunction } from "express";

const approval = (): ErasureApproval => ({
  requestId: "00000000-0000-0000-0000-000000000001", userId: "subject",
  policyVersion: "policy-1", inventoryVersion: "inventory-1",
  approvedBy: "reviewer", approvalRef: "approval-1", validUntil: 2000,
  notBefore: 500, legalHold: false, inventoryComplete: true, writesFenced: true,
  systems: [{ id: "objects", eligibleAfter: 500, legalHold: false }],
});

test("approval gate rejects missing authority, expiry, holds, retention, incomplete inventory and unfenced writes", () => {
  validateErasureApproval(approval(), approval().requestId, 1000);
  for (const change of [
    { policyVersion: "" }, { approvedBy: "" }, { approvalRef: "" }, { validUntil: 1000 },
    { notBefore: 1001 }, { legalHold: true }, { inventoryComplete: false },
    { writesFenced: false }, { systems: [] },
    { systems: [{ id: "objects", eligibleAfter: 1001, legalHold: false }] },
    { systems: [{ id: "objects", eligibleAfter: 500, legalHold: true }] },
    { systems: [...approval().systems, ...approval().systems] },
  ]) {
    assert.throws(() => validateErasureApproval({ ...approval(), ...change }, approval().requestId, 1000), /blocked/);
  }
  assert.throws(() => validateErasureApproval(approval(), "another-request", 1000), /blocked/);
});

function workflowFixture() {
  const calls: string[] = [];
  let review = approval();
  let receiptValid = true;
  let failure = false;
  let claimed = true;
  const keys: string[] = [];
  const repository: ErasureWorkflowRepository = {
    prepare: async () => { calls.push("prepare"); return 1; },
    claim: async () => { calls.push("claim"); return claimed; },
    acknowledge: async () => { calls.push("ack"); },
    retry: async () => { calls.push("retry"); },
  };
  const authority = {
    review: async () => { calls.push("review"); return structuredClone(review); },
    verifyReceipt: async () => { calls.push("verify"); return receiptValid; },
  };
  const adapters = new Map([["objects", { erase: async ({ idempotencyKey }: { idempotencyKey: string }) => {
    calls.push("erase"); keys.push(idempotencyKey);
    if (failure) throw new Error("provider ambiguous timeout");
    return { receiptRef: "receipt-1" };
  } }]]);
  return {
    calls, keys, repository, authority, adapters,
    workflow: createErasureWorkflow(repository, authority, adapters, () => 1000),
    setReview: (a: ErasureApproval) => { review = a; },
    setValid: (v: boolean) => { receiptValid = v; },
    setFailure: (v: boolean) => { failure = v; },
    setClaim: (v: boolean) => { claimed = v; },
  };
}

test("all adapters required, unknown systems denied, authority outage fails closed", async () => {
  const f = workflowFixture();
  f.setReview({ ...approval(), systems: [...approval().systems, { id: "backups", eligibleAfter: 0, legalHold: false }] });
  await assert.rejects(f.workflow.prepare(approval().requestId), /adapter unavailable/);
  assert.deepEqual(f.calls, ["review"]);
  f.setReview(approval());
  await assert.rejects(f.workflow.attempt(approval().requestId, "unowned"), /outside/);
  f.authority.review = async () => { throw new Error("authority offline"); };
  await assert.rejects(f.workflow.attempt(approval().requestId, "objects"), /offline/);
  assert.ok(!f.calls.includes("erase"));
});

test("claimed step rechecks authority, verifies receipt and never marks request completed", async () => {
  const f = workflowFixture();
  await f.workflow.prepare(approval().requestId);
  const result = await f.workflow.attempt(approval().requestId, "objects");
  assert.deepEqual(result, { claimed: true, acknowledged: true });
  assert.deepEqual(f.calls, ["review", "prepare", "review", "claim", "review", "erase", "verify", "ack"]);
  assert.equal("complete" in f.workflow, false);
});

test("hold introduced during claim prevents adapter execution", async () => {
  const f = workflowFixture();
  f.repository.claim = async () => { f.setReview({ ...approval(), legalHold: true }); return true; };
  await assert.rejects(f.workflow.attempt(approval().requestId, "objects"), /blocked/);
  assert.ok(!f.calls.includes("erase"));
  assert.equal(f.calls.at(-1), "retry");
});

test("ambiguous provider outcome retries with same key; unverifiable receipt is not acknowledged", async () => {
  const f = workflowFixture();
  f.setFailure(true);
  await assert.rejects(f.workflow.attempt(approval().requestId, "objects"), /ambiguous/);
  f.setFailure(false); f.setValid(false);
  await assert.rejects(f.workflow.attempt(approval().requestId, "objects"), /verified/);
  assert.equal(f.keys[0], f.keys[1]);
  assert.equal(f.calls.filter(c => c === "retry").length, 2);
  assert.ok(!f.calls.includes("ack"));
  f.setValid(true);
  await f.workflow.attempt(approval().requestId, "objects");
  assert.equal(f.keys[0], f.keys[2]);
});

test("lost claim does not execute; lost ACK and retry persistence failure surface errors", async () => {
  const f = workflowFixture();
  f.setClaim(false);
  assert.deepEqual(await f.workflow.attempt(approval().requestId, "objects"), { claimed: false });
  assert.ok(!f.calls.includes("erase"));
  f.setClaim(true);
  f.repository.acknowledge = async () => { throw new Error("ACK DB offline"); };
  await assert.rejects(f.workflow.attempt(approval().requestId, "objects"), /ACK DB offline/);
  assert.equal(f.calls.at(-1), "retry");
  f.repository.retry = async () => { throw new Error("retry DB offline"); };
  await assert.rejects(f.workflow.attempt(approval().requestId, "objects"), /retry DB offline/);
});

test("real SQL repository binds subjects, snapshot, leases and receipts; zero-row ACK/retry rejected", async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  let rows: Array<Record<string, unknown>> = [{}];
  const repository = createErasureWorkflowRepository({ query: async (sql, values) => {
    statements.push({ sql, values }); return { rows };
  } });
  await repository.prepare(approval());
  assert.match(statements[0].sql, /status = 'pending_policy'/);
  assert.match(statements[0].sql, /FOR UPDATE/);
  assert.deepEqual(statements[0].values.slice(0, 5), [approval().requestId, "subject", "inventory-1", "policy-1", ["objects"]]);
  assert.equal(await repository.claim(approval(), "objects", "lease"), true);
  assert.match(statements[1].sql, /generation = auth_session_epochs.generation \+ 1/);
  assert.match(statements[1].sql, /cardinality/);
  assert.match(statements[1].sql, /lease_until < now\(\)/);
  await repository.acknowledge(approval().requestId, "objects", "lease", "receipt-1");
  assert.match(statements[2].sql, /lease_id = \$3/);
  assert.match(statements[2].sql, /lease_until > now\(\)/);
  rows = [];
  assert.equal(await repository.claim(approval(), "objects", "lease"), false);
  await assert.rejects(repository.acknowledge(approval().requestId, "objects", "old", "receipt-1"), /stale lease/);
  await assert.rejects(repository.retry(approval().requestId, "objects", "old"), /stale lease/);
  assert.ok(statements.every(s => !s.sql.includes("status = 'completed'")));
});

test("real request repository atomically revokes, creates new cycle only after cancellation, propagates outages", async () => {
  const statements: string[] = [];
  const requests = createErasureRequests({ query: async (sql, values) => {
    statements.push(sql); assert.deepEqual(values, ["subject"]);
    return { rows: [{ user_id: "subject", status: "pending_policy" }] };
  } });
  await requests.request("subject");
  assert.match(statements[0], /generation = auth_session_epochs.generation \+ 1/);
  assert.match(statements[0], /request_id = CASE WHEN account_erasure_requests.status = 'cancelled'/);
  assert.match(statements[0], /THEN gen_random_uuid\(\)/);
  await requests.cancel("subject");
  assert.match(statements[1], /status = 'pending_policy'/);
  const offline = createErasureRequests({ query: async () => { throw new Error("offline"); } });
  await assert.rejects(offline.request("subject"), /offline/);
  await assert.rejects(offline.status("subject"), /offline/);
  await assert.rejects(offline.cancel("subject"), /offline/);
});

async function invoke(options: {
  action?: "request" | "status" | "cancel"; password?: string | null;
  body?: unknown; stamp?: number; stampUser?: string; authenticated?: boolean;
  dbFailure?: boolean; destroyFailure?: boolean; cancellable?: boolean;
}) {
  const calls: string[] = [];
  let code = 200;
  let output: unknown;
  let error: unknown;
  const handlers = createErasureHandlers({
    now: () => 1_000_000,
    getUser: async id => ({ id, password: options.password === undefined ? "hash" : options.password }),
    comparePassword: async password => password === "correct",
    requests: {
      request: async id => {
        calls.push(`request:${id}`);
        if (options.dbFailure) throw new Error("DB offline");
        return { status: "pending_policy" };
      },
      status: async id => { calls.push(`status:${id}`); return null; },
      cancel: async id => { calls.push(`cancel:${id}`); return options.cancellable ?? true; },
    },
  });
  const req = {
    user: options.authenticated === false ? undefined : { id: "subject" },
    body: options.body,
    session: {
      reauthenticatedAt: options.stamp, reauthenticatedUserId: options.stampUser,
      destroy: (cb: (error?: Error) => void) => {
        calls.push("destroy"); cb(options.destroyFailure ? new Error("destroy failed") : undefined);
      },
    },
  } as unknown as Request;
  const res = {
    status: (value: number) => { code = value; return res; },
    json: (value: unknown) => { output = value; return res; },
  } as unknown as Response;
  await handlers[options.action ?? "request"](req, res, ((e: unknown) => { error = e; }) as NextFunction);
  return { calls, code, output, error };
}

test("real handlers require principal and local proof, ignore attacker subject, acknowledge only after revocation/destroy", async () => {
  assert.equal((await invoke({ authenticated: false })).code, 401);
  assert.equal((await invoke({})).code, 403);
  assert.equal((await invoke({ body: { password: "wrong" } })).code, 403);
  const result = await invoke({ body: { password: "correct", userId: "victim" } });
  assert.equal(result.code, 202);
  assert.equal((result.output as { erased: boolean }).erased, false);
  assert.deepEqual(result.calls, ["request:subject", "destroy"]);
  for (const options of [{ dbFailure: true }, { destroyFailure: true }]) {
    const failed = await invoke({ body: { password: "correct" }, ...options });
    assert.ok(failed.error); assert.equal(failed.output, undefined);
  }
});

test("real passwordless handler requires owner-bound recent nonfuture OAuth stamp", async () => {
  for (const options of [
    {}, { stamp: 999_999, stampUser: "victim" }, { stamp: 1_000_001, stampUser: "subject" },
    { stamp: 700_000, stampUser: "subject" }, { stamp: NaN, stampUser: "subject" },
  ]) {
    const result = await invoke({ password: "", ...options });
    assert.equal(result.code, 403); assert.deepEqual(result.calls, []);
  }
  assert.equal((await invoke({ password: "", stamp: 999_999, stampUser: "subject" })).code, 202);
});

test("status/cancellation only access caller; started/noncancellable requests return conflict", async () => {
  assert.deepEqual((await invoke({ action: "status", body: { userId: "victim" } })).calls, ["status:subject"]);
  assert.deepEqual((await invoke({ action: "cancel", body: { userId: "victim" } })).calls, ["cancel:subject"]);
  assert.equal((await invoke({ action: "cancel", cancellable: false })).code, 409);
  assert.equal((await invoke({ action: "status", authenticated: false })).code, 401);
  assert.equal((await invoke({ action: "cancel", authenticated: false })).code, 401);
});
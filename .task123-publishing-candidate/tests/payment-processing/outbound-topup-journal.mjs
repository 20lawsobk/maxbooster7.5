import test from "node:test";
import assert from "node:assert/strict";
import { needsTopupCleanupReconciliation, topupExitCode } from "./helpers-topup-cleanup.mjs";

test("lost top-up create response remains unresolved through a later successful run", () => {
  const interrupted = {
    runTag: "owned-unique-tag", phase: "test_topup_creation",
    status: "BLOCKED", resourceId: null, cleanup: "UNRESOLVED",
  };
  const saved = JSON.parse(JSON.stringify(interrupted));
  assert.equal(needsTopupCleanupReconciliation(saved), true);
  assert.equal(topupExitCode({ status: "PASS", cleanup: "PASS", previousRuns: [saved] }), 1);
});

test("legacy creation-in-flight journal cannot masquerade as no cleanup needed", () => {
  assert.equal(topupExitCode({
    status: "PASS", cleanup: "PASS",
    previousRuns: [{ phase: "test_topup_creation", resourceId: null, cleanup: "NOT_NEEDED" }],
  }), 1);
});

test("preflight-only blocker and verified owned cleanup retain distinct verdicts", () => {
  assert.equal(topupExitCode({ status: "BLOCKED", phase: "credential_guard", cleanup: "NOT_NEEDED" }), 2);
  assert.equal(topupExitCode({ status: "PASS", phase: "owned_topup_retrieval", resourceId: "tu_owned", cleanup: "PASS" }), 0);
});
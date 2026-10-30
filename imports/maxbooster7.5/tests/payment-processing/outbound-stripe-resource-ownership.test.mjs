import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogProductOwnedByRun } from "./helpers-stripe-resource-ownership.mjs";

test("referenced shared or another run's products are never cleanup-owned", () => {
  assert.equal(catalogProductOwnedByRun({ id: "prod_shared", metadata: {} }, "run-owned"), false);
  assert.equal(catalogProductOwnedByRun({ metadata: { inboundTestRunId: "different" } }, "run-owned"), false);
  assert.equal(catalogProductOwnedByRun({ deleted: true, metadata: { inboundTestRunId: "run-owned" } }, "run-owned"), false);
  assert.equal(catalogProductOwnedByRun({ metadata: { inboundTestRunId: "run-owned" } }, "run-owned"), true);
});

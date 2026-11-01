import { test } from "node:test";
import assert from "node:assert/strict";
import { dependencyLedger, sastGate, inspectReadiness } from "./security-readiness.mjs";

test("duplicate occurrences stay separate and root matches do not invent shipped provenance", () => {
  const finding = { id: "advisory", package: { name: "example", version: "1" }, severity: { level: "high" } };
  const rows = dependencyLedger({ vulnerabilities: [finding, finding] }, { packages: { "node_modules/example": { version: "1", dev: true } } });
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].occurrence, rows[1].occurrence);
  assert.equal(rows[0].rootLockCandidates[0].dev, true);
  assert.equal(rows[0].artifactAttribution, "unresolved");
  assert.throws(() => dependencyLedger({}, {}), /missing/);
});

test("empty incomplete SAST fails; completion also requires revision and coverage", () => {
  assert.ok(sastGate({ incomplete: true, results: [] }, "release").length);
  assert.ok(sastGate({ incomplete: false, results: [] }, "release").length);
  const complete = { incomplete: false, results: [], coverage: { revision: "release", ruleset: "reviewed-rules@digest", languages: ["typescript"], files: 20 } };
  assert.deepEqual(sastGate(complete, "release"), []);
  assert.ok(sastGate(complete, "other-release").length);
});

test("actual scanner input retains all 206 occurrences and blocks false clean attestation", () => {
  const result = inspectReadiness(process.cwd(), "not-a-release-attestation");
  assert.equal(result.occurrences.length, 206);
  assert.equal(result.occurrences.filter(row => row.severity === "critical").length, 3);
  assert.equal(result.ready, false);
  assert.ok(result.failures.some(failure => failure.includes("SAST completion")));
  assert.match(result.evidence["package-lock.json"], /^[a-f0-9]{64}$/);
});
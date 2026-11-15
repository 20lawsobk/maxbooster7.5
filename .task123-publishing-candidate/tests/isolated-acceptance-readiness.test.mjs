import assert from "node:assert/strict";
import test from "node:test";
import { isExpectedIsolatedReadiness } from "../scripts/lib/isolated-acceptance-readiness.mjs";
const sealed = () => ({ status: "degraded", unifiedAwareness: { ready: false }, subsystems: [
  { name: "database", status: "ok" }, { name: "redis", status: "ok" }, { name: "routes", status: "ok" },
  { name: "audit", status: "unknown" }, { name: "automation", status: "ok" }, { name: "maxcore", status: "unknown" },
] });
test("sealed ML absence is asserted explicitly without establishing full readiness", () => {
  assert.equal(isExpectedIsolatedReadiness(503, sealed()), true);
  assert.equal(isExpectedIsolatedReadiness(200, sealed()), false);
  const actualReady = sealed(); actualReady.unifiedAwareness.ready = true;
  assert.equal(isExpectedIsolatedReadiness(503, actualReady), false);
});
for (const name of ["database", "redis", "routes", "audit", "automation"]) {
  test(`unrelated ${name} failures cannot hide behind expected ML absence`, () => {
    const body = sealed(); body.subsystems.find(value => value.name === name).status = "down";
    assert.equal(isExpectedIsolatedReadiness(503, body), false);
  });
}
test("missing or malformed dependency evidence fails closed", () => {
  const body = sealed(); body.subsystems = body.subsystems.filter(value => value.name !== "redis");
  assert.equal(isExpectedIsolatedReadiness(503, body), false);
  assert.equal(isExpectedIsolatedReadiness(503, {}), false);
});

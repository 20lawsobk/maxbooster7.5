import test from "node:test";
import assert from "node:assert/strict";
import {
  assessHeavyRun,
  assertSanitizedEnvironment,
  runtimeIsolationPolicy,
} from "../../scripts/lib/productionSimulationPolicy.mjs";

const GIB = 1024 ** 3;

test("requires the production 4 CPU / 8 GiB profile and safe headroom", () => {
  const profile = {
    configured: { cpu: 4, memoryBytes: 8 * GIB, imageHardLimitBytes: 8 * GIB },
    observed: {
      cpuQuota: 4,
      memoryLimitBytes: 8 * GIB,
      memoryHeadroomBytes: 5 * GIB,
      diskAvailableBytes: 40 * GIB,
    },
  };
  assert.equal(assessHeavyRun(profile, 8 * GIB, { networkNamespaceAvailable: true }).safe, true);
  profile.observed.memoryHeadroomBytes = 3 * GIB;
  assert.equal(assessHeavyRun(profile, 8 * GIB, { networkNamespaceAvailable: true }).safe, false);
});

test("fails before heavy work when a native-child network namespace is unavailable", () => {
  const profile = {
    configured: { cpu: 4, memoryBytes: 8 * GIB, imageHardLimitBytes: 8 * GIB },
    observed: {
      cpuQuota: 4,
      memoryLimitBytes: 8 * GIB,
      memoryHeadroomBytes: 6 * GIB,
      diskAvailableBytes: 40 * GIB,
    },
  };
  const result = assessHeavyRun(profile, 8 * GIB, { networkNamespaceAvailable: false });
  assert.equal(result.safe, false);
  assert.match(result.reasons.join(" "), /network namespace creation is unavailable/);
});

test("rejects inherited provider and database credentials", () => {
  assert.doesNotThrow(() => assertSanitizedEnvironment({ PATH: "/bin", CI: "true" }));
  assert.throws(() => assertSanitizedEnvironment({ DATABASE_URL: "postgresql://live" }), /not sanitized/);
  assert.throws(() => assertSanitizedEnvironment({ OPENAI_API_KEY: "secret" }), /not sanitized/);
});

test("runtime policy covers native descendants, not only Node", () => {
  assert.match(runtimeIsolationPolicy.transport, /every native\/Python descendant/);
  assert.match(runtimeIsolationPolicy.transport, /network namespace/);
});
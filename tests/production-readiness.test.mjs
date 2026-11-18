import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { configuredPortSpecs, httpHealthy } from "../scripts/wait-configured-ports.mjs";
import { runProductionStartupReadiness } from "../scripts/testing/production-readiness.mjs";

const roots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "production-readiness-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    engines: { node: ">=24.0.0" },
    scripts: {
      prod: "node scripts/start-production.mjs",
      start: "node scripts/start-production.mjs",
      "deployment:build": "bash build.sh",
      "deployment:start": "bash start.sh",
    },
  }));
  fs.writeFileSync(path.join(root, ".nvmrc"), "24\n");
  fs.writeFileSync(path.join(root, ".node-version"), "24\n");
  for (const relativePath of [
    "start.sh",
    "scripts/port-contract.sh",
    "scripts/wait-configured-ports.mjs",
    "dist/build-complete.json",
  ]) {
    fs.writeFileSync(path.join(root, relativePath), "fixture\n");
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test("production readiness passes without Git, writes, secrets or service calls", async () => {
  const root = makeRoot();
  let buildValidationCount = 0;
  const env = {
    NODE_ENV: "development",
    DATABASE_URL: "must-not-be-read-or-reported",
    PORT: "5000",
  };
  const before = fs.readdirSync(root).sort();
  const report = await runProductionStartupReadiness({
    root,
    env,
    nodeVersion: "v24.22.3",
    validateBuild: () => { buildValidationCount++; },
  });

  assert.equal(report.ready, true);
  assert.equal(report.kind, "maxbooster-production-startup-readiness");
  assert.equal(buildValidationCount, 1);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
  assert.doesNotMatch(JSON.stringify(report), /must-not-be-read-or-reported/);
  assert.ok(report.checks.every(check => check.status === "PASS"));
});

test("readiness fails closed for a runtime that disagrees with the pinned Node major", async () => {
  const root = makeRoot();
  const report = await runProductionStartupReadiness({
    root,
    nodeVersion: "v22.23.4",
    validateBuild() {},
  });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find(check => check.id === "node-runtime").status, "FAIL");
});

test("readiness fails closed when the build contract rejects stale artifacts", async () => {
  const root = makeRoot();
  const report = await runProductionStartupReadiness({
    root,
    nodeVersion: "v24.22.3",
    validateBuild() { throw new Error("source changed after build"); },
  });
  const check = report.checks.find(item => item.id === "build-integrity");
  assert.equal(report.ready, false);
  assert.equal(check.status, "FAIL");
  assert.match(check.evidence, /source changed after build/);
});

test("readiness rejects port collisions and missing listener contracts", async () => {
  const root = makeRoot();
  const collision = await runProductionStartupReadiness({
    root,
    env: { PORT: "8080" },
    nodeVersion: "v24.22.3",
    validateBuild() {},
  });
  assert.equal(collision.ready, false);
  assert.match(collision.checks.find(item => item.id === "production-port-contract").evidence, /share a configured port/);

  fs.rmSync(path.join(root, "scripts/wait-configured-ports.mjs"));
  const missing = await runProductionStartupReadiness({
    root,
    nodeVersion: "v24.22.3",
    validateBuild() {},
  });
  assert.equal(missing.ready, false);
  assert.equal(missing.checks.find(item => item.id === "production-files").status, "FAIL");
});

test("production listener specifications require health endpoints instead of TCP-only readiness", () => {
  const specs = configuredPortSpecs({
    NODE_ENV: "production",
    MAXBOOSTER_DEV_PORTS: "0",
  });
  assert.equal(specs.length, 12);
  assert.deepEqual(
    Object.fromEntries(specs.filter(item => item.httpPath).map(item => [item.name, item.httpPath])),
    {
      "web application": "/ready",
      "DNS API": "/ready",
      "local DNS health": "/health",
      "MaxCore diffusion gateway": "/health",
      "MaxCore API": "/healthz",
      "MaxCore model API": "/api/ready",
      "MaxCore model health": "/healthz",
      "MaxCore proxy sidecar": "/health",
    },
  );
});

test("health probes release every response body while requiring HTTP 200", async () => {
  const originalFetch = globalThis.fetch;
  const released = [];
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.redirect, "manual");
      return {
        status: released.length === 0 ? 200 : 503,
        body: { cancel: async () => { released.push(true); } },
      };
    };
    assert.equal(await httpHealthy(5000, "/ready"), true);
    assert.equal(await httpHealthy(5000, "/ready"), false);
    assert.equal(released.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

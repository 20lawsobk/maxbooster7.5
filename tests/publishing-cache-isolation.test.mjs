import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublishingCacheEnvironment } from "../script/lib/deploymentPackRecovery.mjs";

test("publishing child cache isolation preserves inherited locations and caller environment", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publishing-cache-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldCache = path.join(root, ".cache");
  fs.mkdirSync(oldCache);
  fs.writeFileSync(path.join(oldCache, "sentinel"), "preserve");
  const env = {
    DEPLOY_PACK: "1", PUBLISH_PAYLOAD_CLEANUP: "1", PUBLISH_BUILD_ROOT: root,
    HOME: root, XDG_CACHE_HOME: oldCache, npm_config_cache: oldCache,
    NODE_COMPILE_CACHE: oldCache, BOOSTERSTATE_CARGO_HOME: oldCache,
  };
  const before = { ...env };
  const isolated = createPublishingCacheEnvironment(root, env);
  t.after(() => fs.rmSync(isolated.directory, { recursive: true, force: true }));
  assert.deepEqual(env, before);
  assert.equal(isolated.env.HOME, root);
  assert.equal(fs.statSync(isolated.directory).mode & 0o777, 0o700);
  for (const key of ["XDG_CACHE_HOME", "npm_config_cache", "NPM_CONFIG_CACHE", "NODE_COMPILE_CACHE",
    "BOOSTERSTATE_CARGO_HOME", "PIP_CACHE_DIR", "UV_CACHE_DIR"]) {
    assert.ok(isolated.env[key].startsWith(isolated.directory + "/"), key);
    assert.ok(!isolated.env[key].startsWith(root + "/"), key);
  }
  assert.equal(fs.readFileSync(path.join(oldCache, "sentinel"), "utf8"), "preserve");
});

test("cache isolation rejects unauthorized simulation and mismatched publishing roots", () => {
  assert.throws(() => createPublishingCacheEnvironment("/tmp/example", { DEPLOY_PACK: "1" }), /authorized root/);
  assert.throws(() => createPublishingCacheEnvironment("/tmp/example", {
    DEPLOY_PACK: "1", PUBLISH_PAYLOAD_CLEANUP: "1", PUBLISH_BUILD_ROOT: "/tmp/other",
  }), /authorization refused/);
});

test("Nix subprocess accounting precedes cleanup and budget uses the cleaned measurement", () => {
  const source = fs.readFileSync("script/build.ts", "utf8");
  assert.ok(source.indexOf("const nix = isDeployBuild ? getNixClosureSize()") < source.indexOf("const cleaned = cleanPublishingPayload("));
  assert.match(source, /publishingMeasurement = cleaned\.measurement/);
  assert.match(source, /publishingMeasurement \?\? measurePublishingPayload/);
  assert.ok(source.indexOf("assertPublishingPayloadClean(root, publishingDockerignore)") > source.indexOf("packTransaction?.complete()"));
});
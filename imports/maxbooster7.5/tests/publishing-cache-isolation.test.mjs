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

test("historical publishing owns packing; ordinary compilation cannot launch a second packer", async () => {
  const {buildPlan}=await import("../script/deployment/plans.mjs");
  const plan=buildPlan();
  const source=plan.find(task=>task.id==="source");
  assert.deepEqual(new Set(source.deps),new Set(["pack_node","pack_python","pack_maxcore","pack_pdim"]));
  assert.deepEqual(plan.find(task=>task.id==="remainder").deps,["source"]);
  assert.deepEqual(plan.find(task=>task.id==="finalize").deps,["remainder"]);
  const bootstrap=fs.readFileSync("script/deployment/bootstrap.sh","utf8");
  assert.ok(bootstrap.indexOf("isolate_publishing_caches") < bootstrap.indexOf('for candidate'));
  assert.ok(bootstrap.indexOf("--recover") < bootstrap.indexOf('for manager in npm pnpm'));
  assert.ok(bootstrap.indexOf("--recover") < bootstrap.lastIndexOf('exec "$tools/node"'));
  assert.match(fs.readFileSync("script/deployment/publishing-context.sh","utf8"),/export PUBLISH_SHELL_PACKS_CAPSULES=1/);
  assert.match(fs.readFileSync("build.sh","utf8"),/bash .*image-size-gate\.sh/);
});

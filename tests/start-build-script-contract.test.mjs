import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const pkg = JSON.parse(read("package.json"));
const launcher = read("scripts/start.mjs");
const build = read("script/build.ts");
const start = read("start.sh");

test("npm start routes development and production through explicit modes", () => {
  assert.equal(pkg.scripts.start, "node scripts/start.mjs");
  assert.equal(pkg.scripts["start:dev"], "bash scripts/start-dev.sh");
  assert.equal(pkg.scripts["start:production"], "bash start.sh");
  assert.match(launcher, /MAXBOOSTER_START_MODE/);
  assert.match(launcher, /NODE_ENV === "production"/);
  assert.match(launcher, /REPLIT_DEPLOYMENT_ID/);
  assert.match(launcher, /scripts\/start-dev\.sh/);
  assert.match(launcher, /start\.sh/);
});

test("ordinary builds do not install nested workspaces over the network", () => {
  assert.match(build, /isDeployBuild \|\| process\.env\.SYNC_SUBSYSTEM_DEPENDENCIES === "1"/);
  assert.match(build, /bash script\/sync-subsystem-dependencies\.sh/);
  assert.match(build, /curl -fSL/);
  assert.match(build, /set -o pipefail/);
  assert.match(build, /fs\.existsSync\(path\.join\(root, "python_runtime"\)\)/);
});

test("start supports a source build without a prepared deployment executive", () => {
  assert.match(start, /using source-compatible startup/);
  assert.match(start, /scripts\/boot-stub-server\.mjs/);
  assert.match(start, /pdim-restore\.mjs" critical/);
  assert.match(start, /scripts\/port-contract\.sh/);
  assert.match(start, /scripts\/check-port-contract\.ts/);
  assert.match(start, /pdim-restore\.mjs" background/);
});

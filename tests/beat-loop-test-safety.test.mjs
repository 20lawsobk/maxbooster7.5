import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("beat integration suite fails without an explicit disposable DB", () => {
  const result = spawnSync("node_modules/.bin/vitest", [
    "run", "--config", "vitest.beat-loop.config.ts",
  ], {
    env: { PATH: process.env.PATH, HOME: "/tmp", NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /must explicitly identify a disposable database/);
});

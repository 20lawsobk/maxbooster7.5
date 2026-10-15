import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateBuild, writeBuildContract } from "../scripts/start-production.mjs";

test("production startup rejects missing, altered and stale build output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-build-contract-"));
  try {
    assert.throws(() => validateBuild(root), /Run npm run build/);
    fs.mkdirSync(path.join(root, "dist/public"), { recursive: true });
    for (const file of ["package.json", "package-lock.json", "vite.config.ts", "start.sh",
      "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs",
      "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html"]) {
      fs.writeFileSync(path.join(root, file), "fixture");
    }
    writeBuildContract(root);
    assert.doesNotThrow(() => validateBuild(root));
    fs.writeFileSync(path.join(root, "dist/index.mjs"), "modified");
    assert.throws(() => validateBuild(root), /Changed since build/);
    writeBuildContract(root);
    fs.mkdirSync(path.join(root, "server"));
    fs.writeFileSync(path.join(root, "server/new.ts"), "// new source");
    assert.throws(() => validateBuild(root), /Source file list changed/);
    assert.throws(() => writeBuildContract(root, {}), /changed during compilation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

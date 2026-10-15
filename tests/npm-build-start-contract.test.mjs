import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateBuild, writeBuildContract } from "../scripts/start-production.mjs";

test("embedded production MaxCore has a compiled entry and excludes the dashboard", () => {
  const build = fs.readFileSync("script/build.ts", "utf8");
  const supervisor = fs.readFileSync("server/services/maxcoreLocalSupervisor.ts", "utf8");
  const app = fs.readFileSync("external/maxcore/artifacts/api-server/src/app.ts", "utf8");
  assert.match(build, /external\/maxcore\/artifacts\/api-server/);
  assert.match(supervisor, /production \? process\.execPath : TSX_BIN/);
  assert.match(supervisor, /production \? "production" : "development"/);
  assert.match(supervisor, /MAXBOOSTER_EMBEDDED: "1"/);
  assert.match(supervisor, /MAXBOOSTER_PYTHON: process\.env\.MAXBOOSTER_PYTHON/);
  assert.match(supervisor, /path\.resolve\(process\.cwd\(\), "python_runtime", "bin", "python3"\)/);
  const start = supervisor.slice(supervisor.indexOf("export async function startMaxcoreLocal"));
  assert.ok(start.indexOf('if (process.env.NODE_ENV === "production")') < start.indexOf("if (fs.existsSync(TSX_BIN))"));
  assert.match(start, /Never attempt network installation/);
  assert.match(app, /NODE_ENV === "production" && process\.env\.MAXBOOSTER_EMBEDDED !== "1"/);
});

test("production startup rejects missing, altered and stale build output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-build-contract-"));
  try {
    assert.throws(() => validateBuild(root), /Run npm run build/);
    fs.mkdirSync(path.join(root, "dist/public"), { recursive: true });
    fs.mkdirSync(path.join(root, "external/maxcore/artifacts/api-server/dist"), { recursive: true });
    for (const file of ["package.json", "package-lock.json", "vite.config.ts", "start.sh",
      "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs",
      "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
      "external/maxcore/artifacts/api-server/dist/index.mjs"]) {
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

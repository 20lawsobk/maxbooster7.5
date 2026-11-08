import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fixture(t, pathType) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `deployment-${pathType}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync("build.sh", path.join(root, "build.sh"));
  fs.mkdirSync(path.join(root, "script/deployment"), { recursive: true });
  fs.writeFileSync(path.join(root, "script/deployment/ffmpeg-path.sh"),
    "resolve_ffmpeg(){ return 0; }\nverify_ffmpeg_capabilities(){ return 0; }\n");
  fs.mkdirSync(path.join(root, "script"), { recursive: true });
  fs.writeFileSync(path.join(root, "script/sync-subsystem-dependencies.sh"), "#!/bin/sh\nexit 0\n");
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules/.cache"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules/.vite"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules/.cache/sentinel"), "npm cache input");
  fs.writeFileSync(path.join(root, "node_modules/.vite/sentinel"), "vite cache input");
  if (pathType === "fast") {
    fs.mkdirSync(path.join(root, "dist/public"), { recursive: true });
    fs.writeFileSync(path.join(root, "dist/public/index.html"), "prebuilt frontend");
    fs.writeFileSync(path.join(root, "dist/index.mjs"), "prebuilt server");
    fs.writeFileSync(path.join(root, "dist/cluster.mjs"), "prebuilt cluster");
  } else {
    fs.mkdirSync(path.join(root, "client"), { recursive: true });
    fs.mkdirSync(path.join(root, "server"), { recursive: true });
  }
  const calls = path.join(root, "npm-calls");
  fs.writeFileSync(path.join(root, "bin/npm"), `#!/bin/sh
echo "$*" >> "$NPM_CALLS"
if [ "$1" = "ci" ]; then
  mkdir -p "$BUILD_ROOT/node_modules/@sentry/node" "$BUILD_ROOT/node_modules/exceljs" \\
    "$BUILD_ROOT/node_modules/pino" "$BUILD_ROOT/node_modules/express" "$BUILD_ROOT/node_modules/drizzle-orm"
fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  mkdir -p "$BUILD_ROOT/dist/public"
  printf 'built frontend' > "$BUILD_ROOT/dist/public/index.html"
  printf 'built server' > "$BUILD_ROOT/dist/index.mjs"
  printf 'built cluster' > "$BUILD_ROOT/dist/cluster.mjs"
fi
exit 0
`, { mode: 0o755 });
  return { root, calls };
}

for (const pathType of ["fast", "slow"]) {
  test(`${pathType} deployment dependency path runs locked install, compile policy, and fail-closed checks`, t => {
    const { root, calls } = fixture(t, pathType);
    const state = path.join(root, "state");
    fs.mkdirSync(state);
    const result = spawnSync("bash", [path.join(root, "build.sh"), "--executive-task", "dependencies"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
        BUILD_ROOT: root,
        NPM_CALLS: calls,
        DEPLOY_STATE_DIR: state,
      },
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const commands = fs.readFileSync(calls, "utf8").trim().split("\n");
    assert.match(commands[0], pathType === "fast"
      ? /^ci --omit=dev --no-audit --no-fund$/
      : /^ci --no-audit --no-fund$/);
    if (pathType === "slow") {
      assert.equal(commands[1], "run build");
      assert.equal(commands[2], "prune --omit=dev --no-audit --no-fund");
      assert.equal(fs.readFileSync(path.join(state, "build-path"), "utf8"), "0");
    } else {
      assert.equal(commands[1], "run security:audit");
      assert.equal(fs.readFileSync(path.join(state, "build-path"), "utf8"), "1");
    }
    assert.deepEqual(commands.slice(-2), ["run security:audit", "run verify:dependency-security"]);
    assert.equal(fs.readFileSync(path.join(root, "node_modules/.cache/sentinel"), "utf8"), "npm cache input");
    assert.equal(fs.readFileSync(path.join(root, "node_modules/.vite/sentinel"), "utf8"), "vite cache input");
    assert.doesNotMatch(commands.join("\n"), /security-fix\.ts/);
  });
}

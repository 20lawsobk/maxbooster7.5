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

function pruneFixture(t, failOn = "") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-prune-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync("build.sh", path.join(root, "build.sh"));
  fs.mkdirSync(path.join(root, "script/lib"), { recursive: true });
  fs.copyFileSync(
    "script/lib/pruneRuntimeNodeModules.mjs",
    path.join(root, "script/lib/pruneRuntimeNodeModules.mjs"),
  );
  fs.mkdirSync(path.join(root, "state"), { recursive: true });
  for (const marker of ["app-capsule-ready", "packer-ready"]) {
    fs.writeFileSync(path.join(root, `state/${marker}`), "ready\n");
  }
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/publish-capsules.mjs"), "fixture\n");
  fs.mkdirSync(path.join(root, "node_modules/example"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules/example/package.json"), "{}\n");
  fs.mkdirSync(path.join(root, "shared"), { recursive: true });
  fs.writeFileSync(path.join(root, "shared/social-platform-optimization.json"), "registry\n");
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.writeFileSync(path.join(root, "server/source-marker.ts"), "keep until source phase\n");
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });

  const calls = path.join(root, "npm-calls");
  fs.writeFileSync(path.join(root, "bin/npm"), `#!/bin/sh
echo "$*" >> "$NPM_CALLS"
if [ -n "$FAIL_ON" ] && [ "$*" = "$FAIL_ON" ]; then exit 23; fi
exit 0
`, { mode: 0o755 });
  return { root, calls, failOn };
}

for (const pathType of ["fast", "slow"]) {
  test(`${pathType} deployment dependency path runs its locked install and compile policy`, t => {
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
    assert.match(commands[0], /^ci --include=dev --no-audit --no-fund$/);
    if (pathType === "slow") {
      assert.equal(commands[1], "run build");
      assert.equal(fs.readFileSync(path.join(state, "build-path"), "utf8").trim(), "0");
    } else {
      assert.equal(fs.readFileSync(path.join(state, "build-path"), "utf8").trim(), "1");
    }
    assert.equal(commands.length, pathType === "slow" ? 2 : 1);
    assert.equal(fs.readFileSync(path.join(root, "node_modules/.cache/sentinel"), "utf8"), "npm cache input");
    assert.equal(fs.readFileSync(path.join(root, "node_modules/.vite/sentinel"), "utf8"), "vite cache input");
    assert.doesNotMatch(commands.join("\n"), /security-fix\.ts/);
  });
}

test("production pruning runs both security gates before stripping and source removal", t => {
  const { root, calls } = pruneFixture(t);
  const result = spawnSync("bash", [path.join(root, "build.sh"), "--executive-task", "prune"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
      DEPLOY_STATE_DIR: path.join(root, "state"),
      NPM_CALLS: calls,
    },
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n"), [
    "prune --omit=dev --no-audit --no-fund",
    "run security:audit",
    "run verify:dependency-security",
  ]);
  assert.equal(
    fs.readFileSync(path.join(root, "state/social-platform-optimization.json"), "utf8"),
    "registry\n",
  );
  assert.equal(fs.readFileSync(path.join(root, "server/source-marker.ts"), "utf8"),
    "keep until source phase\n");
});

for (const gate of ["run security:audit", "run verify:dependency-security"]) {
  test(`production pruning fails closed when ${gate} fails`, t => {
    const { root, calls, failOn } = pruneFixture(t, gate);
    const result = spawnSync("bash", [path.join(root, "build.sh"), "--executive-task", "prune"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
        DEPLOY_STATE_DIR: path.join(root, "state"),
        NPM_CALLS: calls,
        FAIL_ON: failOn,
      },
    });
    assert.notEqual(result.status, 0, result.stdout);
    assert.ok(fs.existsSync(path.join(root, "server/source-marker.ts")),
      "source must remain when a security gate fails");
    const commands = fs.readFileSync(calls, "utf8").trim().split("\n");
    assert.ok(commands.includes(gate));
    if (gate === "run security:audit") {
      assert.equal(commands.includes("run verify:dependency-security"), false);
    }
  });
}

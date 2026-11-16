import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPlan } from "../script/deployment/plans.mjs";
import {
  bindBuildShutdownSignals,
  executeBuildPhase,
  orderBuildPlan,
  runSequentialBuild,
} from "../script/deployment/sequential-build.mjs";

test("sequential build runs the real plan in dependency order with no overlap", async () => {
  const started = [];
  let active = 0;
  let peak = 0;
  const events = [];
  let stateDirectory;
  const ordered = orderBuildPlan(buildPlan());

  await runSequentialBuild({
    tasks: buildPlan(),
    root: process.cwd(),
    log: (line) => events.push(line),
    executeTask: async (task, context) => {
      stateDirectory = context.stateDirectory;
      assert.ok(fs.statSync(context.stateDirectory).isDirectory());
      active++;
      peak = Math.max(peak, active);
      started.push(task.id);
      await Promise.resolve();
      active--;
    },
  });

  assert.equal(peak, 1);
  assert.deepEqual(started, ordered.map((task) => task.id));
  assert.equal(started.length, 18);
  assert.ok(stateDirectory);
  assert.equal(fs.existsSync(stateDirectory), false, "temporary task state is cleaned up");
  assert.match(events[0], /no executive scheduler/);
  assert.match(events.at(-1), /all 18 phases completed/);
  for (const task of buildPlan()) {
    assert.ok(
      task.deps.every((dependency) => started.indexOf(dependency) < started.indexOf(task.id)),
      `${task.id} must run after its dependencies`,
    );
  }
});

test("sequential build stops immediately after a failed phase", async () => {
  const started = [];
  const failure = Object.assign(new Error("fixture phase failed"), { exitCode: 23 });
  let stateDirectory;

  await assert.rejects(
    runSequentialBuild({
      tasks: [
        { id: "first", deps: [] },
        { id: "second", deps: ["first"] },
        { id: "third", deps: ["second"] },
      ],
      log: () => {},
      executeTask: async (task, context) => {
        started.push(task.id);
        stateDirectory = context.stateDirectory;
        if (task.id === "second") throw failure;
      },
    }),
    (error) => error === failure,
  );
  assert.deepEqual(started, ["first", "second"]);
  assert.ok(stateDirectory);
  assert.equal(fs.existsSync(stateDirectory), false, "temporary task state is cleaned up after failure");
});

test("build plan rejects unknown dependencies, duplicate tasks, and cycles", () => {
  assert.throws(
    () => orderBuildPlan([{ id: "a", deps: ["missing"] }]),
    /invalid dependency/,
  );
  assert.throws(
    () => orderBuildPlan([{ id: "a", deps: [] }, { id: "a", deps: [] }]),
    /invalid or duplicate task/,
  );
  assert.throws(
    () => orderBuildPlan([
      { id: "a", deps: ["b"] },
      { id: "b", deps: ["a"] },
    ]),
    /dependency cycle/,
  );
});

test("phase dispatcher runs the requested shell phase with isolated executor settings", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sequential-phase-"));
  const stateDirectory = path.join(root, "state");
  fs.mkdirSync(stateDirectory);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const output = path.join(root, "phase.json");
  fs.writeFileSync(path.join(root, "build.sh"), `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == "--executive-task" ]]
[[ "$2" == "fixture" ]]
[[ -d "$DEPLOY_STATE_DIR" ]]
node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({
  state: process.env.DEPLOY_STATE_DIR,
  taskCpu: process.env.DEPLOY_TASK_CPU ?? null,
  buildBudget: process.env.DEPLOY_BUILD_BUDGET_SECONDS ?? null,
  args: process.argv.slice(2)
}))' ${JSON.stringify(output)} "$@"
`);

  const savedEnvironment = {
    DEPLOY_TASK_CPU: process.env.DEPLOY_TASK_CPU,
    DEPLOY_BUILD_BUDGET_SECONDS: process.env.DEPLOY_BUILD_BUDGET_SECONDS,
  };
  process.env.DEPLOY_TASK_CPU = "99";
  process.env.DEPLOY_BUILD_BUDGET_SECONDS = "1";
  try {
    await executeBuildPhase(
      {
        id: "fixture",
        command: "bash",
        args: ["build.sh", "--executive-task", "fixture"],
      },
      { root, stateDirectory },
    );
  } finally {
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), {
    state: stateDirectory,
    taskCpu: null,
    buildBudget: null,
    args: ["--executive-task", "fixture"],
  });
});

test("phase dispatcher reports the actual failed phase exit code", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sequential-phase-failure-"));
  const stateDirectory = path.join(root, "state");
  fs.mkdirSync(stateDirectory);
  fs.writeFileSync(path.join(root, "build.sh"), 'exit 37\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await assert.rejects(
    executeBuildPhase(
      {
        id: "fixture",
        command: "bash",
        args: ["build.sh", "--executive-task", "fixture"],
      },
      { root, stateDirectory },
    ),
    (error) => error.exitCode === 37 && /Build phase fixture failed: exit=37/.test(error.message),
  );
});

test("SIGTERM stops a sequential phase's complete process tree before the runner exits", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sequential-phase-signal-"));
  const stateDirectory = path.join(root, "state");
  const childPidFile = path.join(root, "child.pid");
  const runnerFile = path.join(root, "runner.mjs");
  fs.mkdirSync(stateDirectory);
  fs.writeFileSync(
    path.join(root, "build.sh"),
    `#!/usr/bin/env bash
set -Eeuo pipefail
sleep 120 &
child=$!
printf '%s' "$child" > ${JSON.stringify(childPidFile)}
wait "$child"
`,
  );
  fs.writeFileSync(
    runnerFile,
    `import { runSequentialBuild, bindBuildShutdownSignals } from ${JSON.stringify(
      new URL("../script/deployment/sequential-build.mjs", import.meta.url).href,
    )};
const controller = new AbortController();
const unbind = bindBuildShutdownSignals(controller);
try {
  await runSequentialBuild({
    tasks: [{id:"fixture", deps:[], command:"bash", args:["build.sh","--executive-task","fixture"]}],
    root: ${JSON.stringify(root)},
    signal: controller.signal,
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
} finally {
  unbind();
}
`,
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const runner = spawn(process.execPath, [runnerFile], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  t.after(() => {
    if (runner.exitCode === null && runner.pid) {
      try {
        process.kill(-runner.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  });
  const output = [];
  runner.stdout.on("data", (chunk) => output.push(chunk.toString()));
  runner.stderr.on("data", (chunk) => output.push(chunk.toString()));
  const exited = new Promise((resolve) => runner.once("exit", resolve));

  for (let attempt = 0; attempt < 100 && !fs.existsSync(childPidFile); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(fs.existsSync(childPidFile), "phase process should start");
  const childPid = Number(fs.readFileSync(childPidFile, "utf8"));
  runner.kill("SIGTERM");
  let timeout;
  const [code, exitSignal] = await Promise.race([
    exited.then((value) => [value, null]),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("runner did not drain after SIGTERM")),
        10_000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));

  assert.equal(code, 143);
  assert.equal(exitSignal, null);
  assert.match(output.join(""), /Build interrupted by SIGTERM/);
  let childAlive = false;
  try {
    const stat = fs.readFileSync(`/proc/${childPid}/stat`, "utf8");
    childAlive = !/^\d+ \(.*\) Z/.test(stat);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert.equal(childAlive, false, "the phase descendant must be stopped before runner exit");
});

test("sequential runner contains no executive import or build budget admission", () => {
  const runner = fs.readFileSync(
    new URL("../script/deployment/sequential-build.mjs", import.meta.url),
    "utf8",
  );
  const bootstrap = fs.readFileSync("script/deployment/bootstrap.sh", "utf8");
  assert.doesNotMatch(runner, /from ["'][^"']*executive\.mjs["']/);
  assert.doesNotMatch(runner, /coordinateBuildPlan|runExecutive|validatePlan/);
  assert.match(bootstrap, /sequential-build\.mjs/);
  assert.doesNotMatch(bootstrap, /executive\.mjs|coordinateBuildPlan|runExecutive/);
});

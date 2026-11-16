import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./plans.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function orderBuildPlan(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("Build plan must contain at least one task");
  }

  const pending = new Map();
  for (const task of tasks) {
    if (
      !task ||
      typeof task.id !== "string" ||
      !/^[a-z][a-z0-9_]*$/.test(task.id) ||
      pending.has(task.id) ||
      !Array.isArray(task.deps) ||
      task.deps.some((dependency) => typeof dependency !== "string") ||
      new Set(task.deps).size !== task.deps.length
    ) {
      throw new Error("Build plan contains an invalid or duplicate task");
    }
    pending.set(task.id, task);
  }

  for (const task of pending.values()) {
    for (const dependency of task.deps) {
      if (!pending.has(dependency) || dependency === task.id) {
        throw new Error(
          `Build task ${task.id} has an invalid dependency: ${dependency}`,
        );
      }
    }
  }

  const completed = new Set();
  const ordered = [];
  while (pending.size > 0) {
    const next = [...pending.values()].find((task) =>
      task.deps.every((dependency) => completed.has(dependency)),
    );
    if (!next) throw new Error("Build plan contains a dependency cycle");
    pending.delete(next.id);
    completed.add(next.id);
    ordered.push(next);
  }

  return ordered;
}

export function executeBuildPhase(task, { root, stateDirectory }) {
  if (
    task.command !== "bash" ||
    !Array.isArray(task.args) ||
    task.args.length !== 3 ||
    task.args[0] !== "build.sh" ||
    task.args[1] !== "--executive-task" ||
    task.args[2] !== task.id
  ) {
    throw new Error(`Build task ${task.id} is not a permitted build phase`);
  }

  const env = { ...process.env, DEPLOY_STATE_DIR: stateDirectory };
  delete env.DEPLOY_TASK_CPU;
  delete env.DEPLOY_BUILD_BUDGET_SECONDS;
  delete env.DEPLOY_EXECUTIVE_STARTED_SECONDS;

  const result = spawnSync("bash", ["build.sh", "--executive-task", task.id], {
    cwd: root,
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const signal = result.signal ? ` signal=${result.signal}` : "";
    const exitCode = result.status ??
      (result.signal && os.constants.signals[result.signal]
        ? 128 + os.constants.signals[result.signal]
        : 1);
    throw Object.assign(
      new Error(`Build phase ${task.id} failed: exit=${exitCode}${signal}`),
      { exitCode },
    );
  }
}

export async function runSequentialBuild({
  tasks = buildPlan(),
  root = ROOT,
  executeTask = executeBuildPhase,
  log = console.log,
} = {}) {
  const ordered = orderBuildPlan(tasks);
  const stateDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "maxbooster-sequential-build-"),
  );
  const started = Date.now();

  log(
    "[build] Sequential mode: phases follow declared dependencies; " +
      "no executive scheduler, global/task budget, capacity admission, or retries.",
  );

  try {
    for (const [index, task] of ordered.entries()) {
      const taskStarted = Date.now();
      log(`[build] starting ${task.id} (${index + 1}/${ordered.length})`);
      await executeTask(task, { root, stateDirectory });
      log(
        `[build] completed ${task.id} in ` +
          `${((Date.now() - taskStarted) / 1000).toFixed(1)}s`,
      );
    }

    log(
      `[build] all ${ordered.length} phases completed in ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  } finally {
    fs.rmSync(stateDirectory, { recursive: true, force: true });
  }
}

async function main(args) {
  if (args.length === 1 && args[0] === "--check") {
    const ordered = orderBuildPlan(buildPlan());
    console.log(
      `[build] Sequential plan verified; ${ordered.length} ordered phases; ` +
        "no build phases executed.",
    );
    return;
  }
  if (args.length !== 0) {
    throw new Error("Usage: sequential-build.mjs [--check]");
  }
  await runSequentialBuild();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("[build] FAILED:", error.message);
    process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
  });
}

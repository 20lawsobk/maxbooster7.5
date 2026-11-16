import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./plans.mjs";
import { createOwnedProcessTracker } from "./owned-processes.mjs";

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

function interruptionError(signal) {
  const reason = signal?.reason;
  if (reason instanceof Error && Number.isInteger(reason.exitCode)) return reason;

  const signalName =
    reason?.signal ??
    (reason?.message?.match(/\b(SIGTERM|SIGINT|SIGHUP)\b/)?.[1] ?? "SIGTERM");
  const signalNumber = os.constants.signals[signalName];
  return Object.assign(
    new Error(reason?.message ?? `Build interrupted by ${signalName}`),
    {
      code: "BUILD_INTERRUPTED",
      signal: signalName,
      exitCode: signalNumber ? 128 + signalNumber : 1,
    },
  );
}

async function stopOwnedProcess(tracker, child) {
  if (!child.pid) return;

  const result = await tracker.stop({
    graceMs: 2000,
    descendantGraceMs: 1000,
    pollMs: 25,
  });

  if (result.remaining.length) {
    for (const pid of result.remaining) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    throw new Error(
      `Build phase process tree did not stop: ${result.remaining.join(",")}`,
    );
  }
}

export async function executeBuildPhase(
  task,
  { root, stateDirectory, signal },
) {
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

  if (signal?.aborted) throw interruptionError(signal);

  const child = spawn("bash", ["build.sh", "--executive-task", task.id], {
    cwd: root,
    env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  const tracker = child.pid ? createOwnedProcessTracker(child.pid) : null;
  let closed = false;
  let stopping;
  let stopError;
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, exitSignal) => {
      closed = true;
      resolve({ code, signal: exitSignal });
    });
  });

  const stop = () => {
    if (!stopping && tracker) {
      stopping = stopOwnedProcess(tracker, child).catch((error) => {
        stopError = error;
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (killError) {
          if (killError.code !== "ESRCH") stopError = killError;
        }
      });
    }
    return stopping ?? Promise.resolve();
  };

  const onAbort = () => {
    void stop();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const ownershipPoll = tracker
    ? setInterval(() => {
        try {
          tracker.capture();
        } catch (error) {
          stopError ??= error;
          void stop();
        }
      }, 250)
    : null;
  ownershipPoll?.unref();

  try {
    const result = await completion;
    if (tracker) await stop();
    if (stopError) throw stopError;
    if (signal?.aborted) throw interruptionError(signal);
    if (result.code !== 0) {
      const signalDetail = result.signal ? ` signal=${result.signal}` : "";
      const exitCode = result.code ??
        (result.signal && os.constants.signals[result.signal]
          ? 128 + os.constants.signals[result.signal]
          : 1);
      throw Object.assign(
        new Error(`Build phase ${task.id} failed: exit=${exitCode}${signalDetail}`),
        { exitCode },
      );
    }
  } catch (error) {
    if (signal?.aborted) {
      if (!closed) await stop();
      if (stopError) throw stopError;
      throw interruptionError(signal);
    }
    if (!closed) await stop();
    if (stopError) throw stopError;
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (ownershipPoll) clearInterval(ownershipPoll);
  }
}

export function bindBuildShutdownSignals(controller, emitter = process) {
  const bindings = ["SIGINT", "SIGTERM", "SIGHUP"].map((signalName) => {
    const handler = () => {
      if (controller.signal.aborted) return;
      const signalNumber = os.constants.signals[signalName];
      controller.abort(Object.assign(
        new Error(`Build interrupted by ${signalName}`),
        {
          code: "BUILD_INTERRUPTED",
          signal: signalName,
          exitCode: signalNumber ? 128 + signalNumber : 1,
        },
      ));
    };
    emitter.on(signalName, handler);
    return [signalName, handler];
  });

  return () => {
    for (const [signalName, handler] of bindings) {
      emitter.off(signalName, handler);
    }
  };
}

export async function runSequentialBuild({
  tasks = buildPlan(),
  root = ROOT,
  executeTask = executeBuildPhase,
  log = console.log,
  signal,
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
      if (signal?.aborted) throw interruptionError(signal);
      const taskStarted = Date.now();
      log(`[build] starting ${task.id} (${index + 1}/${ordered.length})`);
      await executeTask(task, { root, stateDirectory, signal });
      if (signal?.aborted) throw interruptionError(signal);
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
  const controller = new AbortController();
  const unbindSignals = bindBuildShutdownSignals(controller);
  try {
    await runSequentialBuild({ signal: controller.signal });
  } finally {
    unbindSignals();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("[build] FAILED:", error.message);
    process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
  });
}

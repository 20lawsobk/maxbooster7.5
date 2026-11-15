import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {performance} from "node:perf_hooks";
import {setTimeout as delay} from "node:timers/promises";
import {
  DEDICATED_DEPLOYMENT_LIMITS,
  liveCapacity,
} from "./capacity.mjs";
import {buildPlan, startPlan} from "./plans.mjs";
import {createOwnedProcessTracker} from "./owned-processes.mjs";

const now = () => performance.now();

function signalGroup(pid, signal) {
  if (!Number.isInteger(pid) || pid < 2) return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function liveGroup(pid) {
  if (!Number.isInteger(pid) || pid < 2) return [];
  const members = [];

  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;

    try {
      const match = fs.readFileSync(`/proc/${name}/stat`, "utf8")
        .match(/^\d+ \(.*\) (.*)$/s);

      if (!match) continue;

      const fields = match[1].trim().split(/\s+/);
      if (
        Number(fields[2]) === pid &&
        !["Z", "X"].includes(fields[0])
      ) members.push(Number(name));
    } catch (error) {
      if (!["ENOENT", "ESRCH", "EACCES"].includes(error.code)) throw error;
    }
  }

  return members;
}

async function bounded(operation, ms, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(
          Error(`${label} timed out after ${ms}ms`),
          {code: "DEPLOY_OPERATION_TIMEOUT"},
        )), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopJob(job) {
  const graceMs = job.task.application ? 26000 : 5000;
  let trackerError;

  try {
    if (job.owned) {
      const result = await bounded(
        () => job.owned.stop({graceMs, descendantGraceMs: 2000}),
        graceMs + 5000,
        `Cleanup for ${job.task.id}`,
      );

      if (result?.remaining?.length) {
        throw Error(`Live owned descendants: ${result.remaining.join(",")}`);
      }
    }
  } catch (error) {
    trackerError = error;
  }

  signalGroup(job.child.pid, "SIGTERM");

  const deadline = now() + (job.owned ? 250 : graceMs);
  while (liveGroup(job.child.pid).length && now() < deadline) {
    await delay(50);
  }

  let remaining = liveGroup(job.child.pid);

  if (remaining.length) {
    signalGroup(job.child.pid, "SIGKILL");
    const killDeadline = now() + 1500;

    while (
      (remaining = liveGroup(job.child.pid)).length &&
      now() < killDeadline
    ) await delay(50);
  }

  if (remaining.length) {
    throw Error(`Live task group members: ${remaining.join(",")}`);
  }

  if (trackerError) throw trackerError;
}

export function bindShutdownSignals(controller, emitter = process) {
  const bindings = ["SIGINT", "SIGTERM", "SIGHUP"].map(signalName => {
    const handler = () => {
      if (controller.signal.aborted) return;

      controller.abort(Object.assign(
        Error(`Executive interrupted by ${signalName}`),
        {
          code: "DEPLOY_EXECUTIVE_SIGNAL",
          signal: signalName,
          signalOrigin: "unknown",
          signalScope: "executive",
          resumePolicy: "not-auto-resumed-ambiguous-origin",
        },
      ));
    };

    emitter.on(signalName, handler);
    return [signalName, handler];
  });

  return () => {
    for (const [name, handler] of bindings) emitter.off(name, handler);
  };
}

export function validatePlan(tasks) {
  if (!Array.isArray(tasks)) throw Error("Plan must be an array");
  const map = new Map();

  for (const task of tasks) {
    if (
      !task || typeof task.id !== "string" ||
      !task.id || map.has(task.id)
    ) throw Error("Invalid or duplicate task ID");

    if (
      typeof task.command !== "string" || !task.command ||
      !Array.isArray(task.args) ||
      task.args.some(arg => typeof arg !== "string") ||
      !Array.isArray(task.deps) ||
      task.deps.some(id => typeof id !== "string") ||
      ![task.cpu, task.io, task.memoryMB].every(
        n => Number.isFinite(n) && n >= 0,
      )
    ) throw Error(`Invalid task ${task.id}`);

    if (
      task.elasticCPU &&
      (!Number.isInteger(task.maxCPU) || task.maxCPU < 1)
    ) throw Error(`Invalid maxCPU for ${task.id}`);

    for (const [key, min, max] of [
      ["maxRetries", 0, 2],
      ["retryBackoffMs", 0, 30000],
    ]) {
      if (
        task[key] !== undefined &&
        (!Number.isInteger(task[key]) || task[key] < min || task[key] > max)
      ) throw Error(`Invalid ${key} for ${task.id}`);
    }

    if (
      task.timeoutMs !== undefined &&
      (!Number.isFinite(task.timeoutMs) || task.timeoutMs <= 0)
    ) throw Error(`Invalid timeout for ${task.id}`);

    if (
      task.retryOnSignals !== undefined &&
      (
        !Array.isArray(task.retryOnSignals) ||
        task.retryOnSignals.some(s => !["SIGTERM", "SIGHUP"].includes(s))
      )
    ) throw Error(`Invalid retry signals for ${task.id}`);

    map.set(task.id, task);
  }

  const visiting = new Set();
  const done = new Set();

  function visit(id) {
    if (!map.has(id)) throw Error(`Unknown prerequisite ${id}`);
    if (visiting.has(id)) throw Error(`Dependency cycle at ${id}`);
    if (done.has(id)) return;

    visiting.add(id);
    map.get(id).deps.forEach(visit);
    visiting.delete(id);
    done.add(id);
  }

  tasks.forEach(task => visit(task.id));
}

export function coordinateBuildPlan(tasks) {
  validatePlan(tasks);

  const result = tasks.map(task => ({...task, deps: [...task.deps]}));
  const map = new Map(result.map(task => [task.id, task]));

  const rules = {
    app_capsule: ["dependencies"],
    packer: ["dependencies"],
    prune: ["app_capsule", "packer"],
    pack_node: ["prune"],
    source: [
      "assets", "rust", "pack_node",
      "pack_python", "pack_maxcore", "pack_pdim",
    ],
    remainder: ["source"],
    finalize: ["remainder"],
  };

  for (const [id, dependencies] of Object.entries(rules)) {
    const task = map.get(id);
    if (!task) continue;

    for (const dependency of dependencies) {
      if (!map.has(dependency)) {
        throw Error(`Build phase ${id} requires phase ${dependency}`);
      }

      if (!task.deps.includes(dependency)) task.deps.push(dependency);
    }
  }

  validatePlan(result);
  return result;
}

export async function runExecutive(tasks, {
  cwd = process.cwd(),
  env = process.env,
  capacity = liveCapacity,
  budgetMs = 1800000,
  pollMs = 500,
  admissionTimeoutMs = 120000,
  log = console.log,
  signal,
  readiness,
} = {}) {
  validatePlan(tasks);

  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw Error("Invalid executive budget");
  }
  if (!Number.isFinite(pollMs) || pollMs <= 0) {
    throw Error("Invalid poll interval");
  }
  if (!Number.isFinite(admissionTimeoutMs) || admissionTimeoutMs <= 0) {
    throw Error("Invalid admission timeout");
  }

  const started = now();
  const done = new Set();
  const pending = new Map(tasks.map(task => [task.id, task]));
  const active = new Map();
  const children = new Set();
  const attempts = new Map(tasks.map(task => [task.id, 0]));
  const retryAt = new Map();
  const firstStartedAt = new Map();
  const durations = new Map();
  const failed = new Set();

  let failure = null;
  let primaryError = null;
  let lastReport = -Infinity;
  let lastProbe = -Infinity;
  let admissionBlockedAt = null;
  let admissionBlock = null;
  let ready = false;
  let notify = () => {};

  const successors = new Map(tasks.map(task => [task.id, []]));
  for (const task of tasks) {
    for (const dependency of task.deps) {
      successors.get(dependency).push(task.id);
    }
  }

  const priorities = new Map();
  function rank(id) {
    if (!priorities.has(id)) {
      priorities.set(id, 1 + successors.get(id).reduce(
        (highest, next) => Math.max(highest, rank(next)), 0,
      ));
    }
    return priorities.get(id);
  }

  const ordered = [...tasks].sort((a, b) => rank(b.id) - rank(a.id));

  const checkpoint = () => tasks.map(task => {
    const job = active.get(task.id);
    const base = {id: task.id, attempts: attempts.get(task.id)};

    if (done.has(task.id)) {
      return {...base, state: "completed", ...durations.get(task.id)};
    }

    if (job) {
      return {
        ...base,
        state: "running",
        attempt: job.attempt,
        elapsedSeconds: Math.floor((now() - job.started) / 1000),
        cpu: job.cpu,
        memoryMB: task.memoryMB,
        io: task.io,
      };
    }

    const remaining = Math.max(
      0, Math.ceil((retryAt.get(task.id) ?? 0) - now()),
    );

    return {
      ...base,
      state: failed.has(task.id)
        ? "failed"
        : remaining ? "retry-backoff" : "waiting",
      blockedBy: task.deps.filter(id => !done.has(id)),
      ...(remaining ? {retryInMs: remaining} : {}),
    };
  });

  function concurrentlyAdmissible(index, {
    eligible,
    active,
    cpu,
    memory,
    io,
    newlyReservedMB,
    cpuLimit,
    cap,
  }) {
    let slots = 0;
    let reservedCPU = cpu;
    let reservedMemory = memory;
    let reservedIO = io;
    let reservedAvailableMB = newlyReservedMB;

    for (const candidate of eligible.slice(index)) {
      const minimumCPU = candidate.elasticCPU
        ? 1
        : Math.max(1, Math.ceil(candidate.cpu));

      if (
        candidate.memoryMB > cap.memoryMB * 0.9 ||
        candidate.io > cap.ioSlots ||
        reservedCPU + minimumCPU > cpuLimit ||
        candidate.memoryMB > cap.availableMB - reservedAvailableMB ||
        reservedIO + candidate.io > cap.ioSlots
      ) continue;

      if (
        active.size + slots > 0 &&
        reservedMemory + candidate.memoryMB > cap.memoryMB * 0.8
      ) continue;

      slots++;
      reservedCPU += minimumCPU;
      reservedMemory += candidate.memoryMB;
      reservedIO += candidate.io;
      reservedAvailableMB += candidate.memoryMB;
    }

    return slots;
  }

  const abort = () => {
    if (failure) return;

    const reason = signal?.reason;
    if (
      reason instanceof Error &&
      reason.code === "DEPLOY_EXECUTIVE_SIGNAL"
    ) {
      failure = reason;
    } else {
      const message = reason instanceof Error && reason.message
        ? `Executive interrupted: ${reason.message}`
        : "Executive interrupted by an external stop request";
      failure = Object.assign(
        new Error(message, reason instanceof Error ? {cause: reason} : {}),
        {
          code: typeof reason?.code === "string"
            ? reason.code
            : "DEPLOY_EXECUTIVE_ABORT",
          signal: reason?.signal ?? null,
          signalOrigin: reason?.signalOrigin ?? "abort-signal",
        },
      );
    }

    notify();
  };

  signal?.addEventListener("abort", abort, {once: true});

  try {
    if (signal?.aborted) {
      abort();
      throw failure;
    }

    while (pending.size || active.size) {
      if (signal?.aborted) abort();

      if (!ready && now() - started >= budgetMs) {
        failure ??= Object.assign(
          Error("Executive deadline expired"),
          {code: "DEPLOY_EXECUTIVE_DEADLINE"},
        );
      }

      if (failure) throw failure;

      for (const [id, job] of active) {
        job.owned?.capture();

        if (
          !job.closed &&
          !(ready && job.task.application) &&
          now() - job.started >= (job.task.timeoutMs ?? budgetMs)
        ) {
          throw Object.assign(Error(`Task deadline expired: ${id}`), {
            code: "DEPLOY_TASK_DEADLINE",
            taskId: id,
          });
        }

        if (!job.closed) continue;
        active.delete(id);

        if (job.error || job.code !== 0) {
          let cleanupError;

          try {
            await stopJob(job);
            job.stopped = true;
          } catch (error) {
            cleanupError = error;
          }

          if (signal?.aborted) {
            abort();
            throw failure;
          }

          const retriesUsed = job.attempt - 1;

          if (
            !cleanupError && !signal?.aborted && !failure &&
            (ready || now() - started < budgetMs) &&
            retriesUsed < (job.task.maxRetries ?? 0) &&
            (job.task.retryOnSignals ?? []).includes(job.signal)
          ) {
            const backoff = Math.min(
              30000, (job.task.retryBackoffMs ?? 500) * 2 ** retriesUsed,
            );

            pending.set(id, job.task);
            retryAt.set(id, now() + backoff);

            log(
              `[executive] retry ${id}: ${job.signal}; ` +
              `${retriesUsed + 1}/${job.task.maxRetries} in ${backoff}ms`,
            );
          } else {
            failed.add(id);

            throw Object.assign(
              cleanupError ?? job.error ?? Error(
                `${id} ${
                  job.signal
                    ? `interrupted by ${job.signal}`
                    : `exited ${job.code}`
                }`,
              ),
              {taskId: id, taskSignal: job.signal ?? null},
            );
          }
        } else {
          done.add(id);

          const elapsedSeconds = Number(
            ((now() - firstStartedAt.get(id)) / 1000).toFixed(1),
          );

          durations.set(id, {elapsedSeconds, attempts: job.attempt});

          log(
            `[executive] completed ${id} in ${elapsedSeconds}s ` +
            `(attempts=${job.attempt})`,
          );
        }
      }

      if (signal?.aborted) {
        abort();
        throw failure;
      }

      if (!pending.size && !active.size) break;

      const cap = capacity();
      if (
        !cap ||
        !["cpus", "memoryMB", "availableMB", "ioSlots"].every(
          key => Number.isFinite(cap[key]) && cap[key] >= 0,
        ) ||
        cap.cpus <= 0 || cap.memoryMB <= 0 || cap.ioSlots < 1
      ) throw Error("Invalid live capacity snapshot");

      const cpuLimit = Math.max(1, Math.floor(cap.cpus));
      let cpu = 0;
      let memory = 0;
      let io = 0;
      let newlyReservedMB = 0;

      for (const job of active.values()) {
        cpu += job.cpu;
        memory += job.task.memoryMB;
        io += job.task.io;
      }

      const eligible = ordered.filter(task =>
        pending.has(task.id) &&
        task.deps.every(id => done.has(id)) &&
        (retryAt.get(task.id) ?? 0) <= now()
      );

      for (let index = 0; index < eligible.length; index++) {
        if (signal?.aborted) {
          abort();
          throw failure;
        }

        if (!ready && now() - started >= budgetMs) break;

        const task = eligible[index];
        const freeCPU = cpuLimit - cpu;
        if (task.io > cap.ioSlots) {
          throw Object.assign(Error(
            `${task.id} needs ${task.io} I/O slots; ` +
            `capacity is ${cap.ioSlots}`,
          ), {taskId: task.id});
        }

        if (task.memoryMB > cap.memoryMB * 0.9) {
          throw Object.assign(Error(
            `${task.id} needs ${task.memoryMB} MiB; ` +
            `capacity is ${cap.memoryMB} MiB`,
          ), {taskId: task.id});
        }

        if (
          freeCPU < 1 ||
          task.memoryMB > Math.max(0, cap.availableMB - newlyReservedMB)
        ) continue;

        if (
          active.size &&
          (
            memory + task.memoryMB > cap.memoryMB * 0.8 ||
            io + task.io > cap.ioSlots
          )
        ) continue;

        const share = Math.max(
          1,
          Math.floor(
            freeCPU / Math.max(1, concurrentlyAdmissible(index, {
              eligible,
              active,
              cpu,
              memory,
              io,
              newlyReservedMB,
              cpuLimit,
              cap,
            })),
          ),
        );

        const requested = task.elasticCPU
          ? Math.min(task.maxCPU, share)
          : Math.max(1, Math.ceil(task.cpu));

        if (
          !task.elasticCPU && requested > freeCPU && active.size
        ) continue;

        const assignedCPU = Math.min(requested, freeCPU);

        const child = spawn(task.command, task.args, {
          cwd,
          detached: true,
          stdio: "inherit",
          env: {
            ...env,
            DEPLOY_TASK_CPU: String(assignedCPU),
            CARGO_BUILD_JOBS: String(assignedCPU),
            ...(task.toolchainBudget ? {
              GOMAXPROCS: String(assignedCPU),
              npm_config_jobs: String(assignedCPU),
            } : {}),
          },
        });

        const attempt = attempts.get(task.id) + 1;
        const job = {
          task, child, cpu: assignedCPU,
          attempt, started: now(), closed: false,
        };

        children.add(job);
        active.set(task.id, job);
        pending.delete(task.id);
        attempts.set(task.id, attempt);

        if (!firstStartedAt.has(task.id)) {
          firstStartedAt.set(task.id, job.started);
        }

        child.once("error", error => {
          job.error = error;
          job.closed = true;
          notify();
        });

        child.once("close", (code, exitSignal) => {
          job.code = code;
          job.signal = exitSignal;
          job.closed = true;
          notify();
        });

        if (child.pid) job.owned = createOwnedProcessTracker(child.pid);

        retryAt.delete(task.id);
        cpu += assignedCPU;
        memory += task.memoryMB;
        newlyReservedMB += task.memoryMB;
        io += task.io;

        log(
          `[executive] starting ${task.id}; attempt=${attempt}; ` +
          `cpu=${assignedCPU}; memory=${task.memoryMB}MiB; io=${task.io}`,
        );
      }

      if (
        active.size === 0 &&
        eligible.length > 0 &&
        !eligible.some(task => task.memoryMB <= cap.availableMB)
      ) {
        admissionBlockedAt ??= now();
        const blockedTasks = eligible.map(task => ({
          id: task.id,
          requiredMemoryMB: task.memoryMB,
        }));
        admissionBlock = {
          availableMB: Math.floor(cap.availableMB),
          blockedTasks,
        };

        if (now() - admissionBlockedAt >= admissionTimeoutMs) {
          const first = blockedTasks[0];
          throw Object.assign(
            Error(
              `No task fits current available memory after ` +
              `${admissionTimeoutMs}ms: ${first.id} requires ` +
              `${first.requiredMemoryMB} MiB; ` +
              `${admissionBlock.availableMB} MiB available`,
            ),
            {
              code: "DEPLOY_CAPACITY_ADMISSION_TIMEOUT",
              taskId: first.id,
              requiredMemoryMB: first.requiredMemoryMB,
              availableMB: admissionBlock.availableMB,
              blockedTasks,
            },
          );
        }
      } else {
        admissionBlockedAt = null;
        admissionBlock = null;
      }

      if (
        !ready && readiness && now() - lastProbe >= 1000 &&
        [...active.values()].some(job => job.task.application)
      ) {
        lastProbe = now();

        try {
          ready = Boolean(await bounded(readiness, 2500, "Readiness probe"));
        } catch (error) {
          if (error.code !== "DEPLOY_OPERATION_TIMEOUT") throw error;
        }

        if (ready) {
          log(
            "[executive] Application ready; supervising runtime " +
            "(not publication confirmation)",
          );
        }
      }

      if (now() - lastReport >= 15000) {
        const remainingSeconds = Math.max(
          0, Math.ceil((budgetMs - now() + started) / 1000),
        );

        log(
          `[executive] elapsed=${Math.floor((now() - started) / 1000)}s; ` +
          `running=${[...active.keys()].join(",") || "none"}; ` +
          `waiting=${[...pending.keys()].join(",") || "none"}; ` +
          `available=${Math.round(cap.availableMB)}MiB; ` +
          `memoryReserved=${memory}MiB; ` +
          `memoryUsed=${Math.round(cap.memoryMB - cap.availableMB)}/` +
            `${Math.round(cap.memoryMB)}MiB; ` +
          `cpu=${cpu}/${cpuLimit}; io=${io}/${cap.ioSlots}; ` +
          (admissionBlock
            ? `admissionBlocked=${admissionBlock.blockedTasks[0].id}:` +
              `${admissionBlock.blockedTasks[0].requiredMemoryMB}MiB>` +
              `${admissionBlock.availableMB}MiB`
            : ready ? "ready" : `budgetRemaining=${remainingSeconds}s`),
        );

        lastReport = now();
      }

      if (pending.size || active.size) {
        let waitMs = Math.min(
          pollMs,
          ready ? pollMs : Math.max(1, budgetMs - now() + started),
        );

        for (const when of retryAt.values()) {
          if (when > now()) {
            waitMs = Math.min(waitMs, Math.max(1, when - now()));
          }
        }

        await new Promise(resolve => {
          const finish = () => {
            clearTimeout(timer);
            notify = () => {};
            resolve();
          };

          const timer = setTimeout(finish, waitMs);
          notify = finish;

          if (
            signal?.aborted ||
            [...active.values()].some(job => job.closed)
          ) finish();
        });
      }
    }

    if (readiness && !ready) {
      throw Error("Application exited before becoming ready");
    }

    log(
      `[executive] plan completed in ` +
      `${((now() - started) / 1000).toFixed(1)}s; tasks=${done.size}`,
    );

    return {
      completed: [...done],
      ready,
      durations: Object.fromEntries(durations),
    };
  } catch (error) {
    primaryError = error;

    Object.assign(error, {
      completedTasks: [...done],
      runningTasks: [...active.keys()],
      waitingTasks: [...pending.keys()],
      taskCheckpoint: checkpoint(),
      checkpointAt: new Date().toISOString(),
    });

    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);

    if (active.size) {
      log(`[executive] Draining tasks: ${[...active.keys()].join(",")}`);
    }

    const results = await Promise.allSettled(
      [...children].filter(job => !job.stopped).map(stopJob),
    );

    const errors = results
      .filter(result => result.status === "rejected")
      .map(result => result.reason.message);

    if (errors.length) {
      if (primaryError) {
        primaryError.cleanupError = errors.join("; ");
        log(`[executive] Cleanup warning: ${primaryError.cleanupError}`);
      } else {
        throw Error(`Deployment cleanup failed: ${errors.join("; ")}`);
      }
    }
  }
}

/*
 * This duplicated partial tail is quarantined: it contains interrupted,
 * malformed copies of the executor entrypoint. The active scheduler is
 * defined above; the single executable entrypoint is retained below.
async function main(mode) {
  let state;
  let primaryError;
  let unbind = () => {};

  try {
    if (!["build", "start"].includes(mode)) {
      throw Error("Expected build or start executive mode");
    }

    const root = fs.realpathSync(
      process.env.DEPLOY_PROJECT_ROOT || process.cwd(),
    );
    process.chdir(root);

    const tasks = mode === "build"
      ? coordinateBuildPlan(buildPlan())
      : startPlan(process.execPath);

    validatePlan(tasks);

    const budget = Number(
      mode === "build"
        ? process.env.DEPLOY_BUILD_BUDGET_SECONDS ?? 1800
        : process.env.DEPLOY_START_BUDGET_SECONDS ?? 900,
    );

    if (!Number.isFinite(budget) || budget <= 0) {
      throw Error("Invalid configured executive budget");
    }

    const stamp = Number(process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS);

    if (
      mode === "build" &&
      process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS !== undefined &&
      (!Number.isFinite(stamp) || stamp <= 0)
    ) throw Error("Invalid bootstrap start timestamp");

    const elapsed =
      mode === "build" && Number.isFinite(stamp) && stamp > 0
        ? Math.max(0, Date.now() - stamp * 1000)
        : 0;

    if (elapsed >= budget * 1000) {
      throw Object.assign(
        Error("Executive budget exhausted during bootstrap"),
        {code: "DEPLOY_EXECUTIVE_DEADLINE"},
      );
    }

    state = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-executive-"));

    const controller = new AbortController();
    unbind = bindShutdownSignals(controller);

    console.log(
      `[executive] ${mode} budget=${budget}s; ` +
             !cleanupError &&
            !signal?.aborted &&
            !failure &&
            (ready || now() - started < budgetMs) &&
            retriesUsed < (job.task.maxRetries ?? 0) &&
            (job.task.retryOnSignals ?? []).includes(job.signal)
          ) {
            const backoff = Math.min(
              30000,
              (job.task.retryBackoffMs ?? 500) * 2 ** retriesUsed,
            );

            pending.set(id, job.task);
            retryAt.set(id, now() + backoff);

            log(
              `[executive] retry ${id}: ${job.signal}; ` +
              `${retriesUsed + 1}/${job.task.maxRetries} ` +
              `in ${backoff}ms`,
            );
          } else {
            failed.add(id);

            throw Object.assign(
              cleanupError ??
              job.error ??
              Error(
                `${id} ${
                  job.signal
                    ? `interrupted by ${job.signal}`
                    : `exited ${job.code}`
                }`,
              ),
              {
                taskId: id,
                taskSignal: job.signal ?? null,
              },
            );
          }
        } else {
          done.add(id);

          const elapsedSeconds = Number(
            ((now() - firstStartedAt.get(id)) / 1000).toFixed(1),
          );

          durations.set(id, {
            elapsedSeconds,
            attempts: job.attempt,
          });

          log(
            `[executive] completed ${id} in ${elapsedSeconds}s ` +
            `(attempts=${job.attempt})`,
          );
        }
      }

      if (signal?.aborted) {
        abort();
        throw failure;
      }

      if (!pending.size && !active.size) break;

      const cap = capacity();

      if (
        !cap ||
        !["cpus", "memoryMB", "availableMB", "ioSlots"].every(
          key => Number.isFinite(cap[key]) && cap[key] >= 0,
        ) ||
        cap.cpus <= 0 ||
        cap.memoryMB <= 0 ||
        cap.ioSlots < 1
      ) {
        throw Error("Invalid live capacity snapshot");
      }

      const cpuLimit = Math.max(1, Math.floor(cap.cpus));

      let cpu = 0;
      let memory = 0;
      let io = 0;
      let newlyReservedMB = 0;

      for (const job of active.values()) {
        cpu += job.cpu;
        memory += job.task.memoryMB;
        io += job.task.io;
      }

      const eligible = ordered.filter(task =>
        pending.has(task.id) &&
        task.deps.every(id => done.has(id)) &&
        (retryAt.get(task.id) ?? 0) <= now()
      );

      for (let index = 0; index < eligible.length; index++) {
        if (signal?.aborted) {
          abort();
          throw failure;
        }

        if (!ready && now() - started >= budgetMs) break;

        const task = eligible[index];
        const freeCPU = cpuLimit - cpu;

        if (task.memoryMB > cap.memoryMB * 0.9) {
          throw Object.assign(
            Error(
              `${task.id} needs ${task.memoryMB} MiB; ` +
              `capacity is ${cap.memoryMB} MiB`,
            ),
            {taskId: task.id},
          );
        }

        if (
          freeCPU < 1 ||
          task.memoryMB > Math.max(
            0,
            cap.availableMB - newlyReservedMB,
          )
        ) {
          continue;
        }

        // Preserve the single-task escape hatch for soft memory and I/O
        // reservations, while retaining physical-memory admission checks.
        if (
          active.size &&
          (
            memory + task.memoryMB > cap.memoryMB * 0.8 ||
            io + task.io > cap.ioSlots
          )
        ) {
          continue;
        }

        const share = Math.max(
          1,
          Math.floor(
            freeCPU / Math.max(1, eligible.length - index),
          ),
        );

        const requested = task.elasticCPU
          ? Math.min(task.maxCPU, share)
          : Math.max(1, Math.ceil(task.cpu));

        if (
          !task.elasticCPU &&
          requested > freeCPU &&
          active.size
        ) {
          continue;
        }

        const assignedCPU = Math.min(requested, freeCPU);

        const child = spawn(task.command, task.args, {
          cwd,
          detached: true,
          stdio: "inherit",
          env: {
            ...env,
            DEPLOY_TASK_CPU: String(assignedCPU),
            CARGO_BUILD_JOBS: String(assignedCPU),
          },
        });

        const attempt = attempts.get(task.id) + 1;

        const job = {
          task,
          child,
          cpu: assignedCPU,
          attempt,
          started: now(),
          closed: false,
        };

        // Track the child before invoking helpers that might throw.
        children.add(job);
        active.set(task.id, job);
        pending.delete(task.id);
        attempts.set(task.id, attempt);

        if (!firstStartedAt.has(task.id)) {
          firstStartedAt.set(task.id, job.started);
        }

        child.once("error", error => {
          job.error = error;
          job.closed = true;
          notify();
        });

        child.once("close", (code, exitSignal) => {
          job.code = code;
          job.signal = exitSignal;
          job.closed = true;
          notify();
        });

        if (child.pid) {
          job.owned = createOwnedProcessTracker(child.pid);
        }

        retryAt.delete(task.id);

        cpu += assignedCPU;
        memory += task.memoryMB;
        newlyReservedMB += task.memoryMB;
        io += task.io;

        log(
          `[executive] starting ${task.id}; attempt=${attempt}; ` +
          `cpu=${assignedCPU}; memory=${task.memoryMB}MiB; ` +
          `io=${task.io}`,
        );
      }

      if (
        !ready &&
        readiness &&
        now() - lastProbe >= 1000 &&
        [...active.values()].some(job => job.task.application)
      ) {
        lastProbe = now();

        try {
          ready = Boolean(
            await bounded(readiness, 2500, "Readiness probe"),
          );
        } catch (error) {
          if (error.code !== "DEPLOY_OPERATION_TIMEOUT") {
            throw error;
          }
        }

        if (ready) {
          log(
            "[executive] Application ready; supervising runtime " +
            "(not publication confirmation)",
          );
        }
      }

      if (now() - lastReport >= 15000) {
        const remainingSeconds = Math.max(
          0,
          Math.ceil((budgetMs - now() + started) / 1000),
        );

        log(
          `[executive] elapsed=${Math.floor((now() - started) / 1000)}s; ` +
          `running=${[...active.keys()].join(",") || "none"}; ` +
          `waiting=${[...pending.keys()].join(",") || "none"}; ` +
          `available=${Math.round(cap.availableMB)}MiB; ` +
          `cpu=${cpu}/${cpuLimit}; io=${io}/${cap.ioSlots}; ` +
          (ready ? "ready" : `budgetRemaining=${remainingSeconds}s`),
        );

        lastReport = now();
      }

      // Completion and cancellation wake the scheduler immediately.
      // Polling remains for capacity changes, deadlines and ownership capture.
      if (pending.size || active.size) {
        let waitMs = Math.min(
          pollMs,
          ready
            ? pollMs
            : Math.max(1, budgetMs - now() + started),
        );

        for (const when of retryAt.values()) {
          if (when > now()) {
            waitMs = Math.min(
              waitMs,
              Math.max(1, when - now()),
            );
          }
        }

        await new Promise(resolve => {
          const finish = () => {
            clearTimeout(timer);
            notify = () => {};
            resolve();
          };

          const timer = setTimeout(finish, waitMs);
          notify = finish;

          if (
            signal?.aborted ||
            [...active.values()].some(job => job.closed)
          ) {
            finish();
          }
        });
      }
    }

    if (readiness && !ready) {
      throw Error("Application exited before becoming ready");
    }

    log(
      `[executive] plan completed in ` +
      `${((now() - started) / 1000).toFixed(1)}s; tasks=${done.size}`,
    );

    return {
      completed: [...done],
      ready,
      durations: Object.fromEntries(durations),
    };
  } catch (error) {
    primaryError = error;

    Object.assign(error, {
      completedTasks: [...done],
      runningTasks: [...active.keys()],
      waitingTasks: [...pending.keys()],
      taskCheckpoint: checkpoint(),
      checkpointAt: new Date().toISOString(),
    });

    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);

    if (active.size) {
      log(
        `[executive] Draining tasks: ${[...active.keys()].join(",")}`,
      );
    }

    const results = await Promise.allSettled(
      [...children]
        .filter(job => !job.stopped)
        .map(stopJob),
    );

    const errors = results
      .filter(result => result.status === "rejected")
      .map(result => result.reason.message);

    if (errors.length) {
      if (primaryError) {
        primaryError.cleanupError = errors.join("; ");

        log(
          `[executive] Cleanup warning: ${primaryError.cleanupError}`,
        );
      } else {
        throw Error(
          `Deployment cleanup failed: ${errors.join("; ")}`,
        );
      }
    }
  }
}

async function main(mode) {
  if (!["build", "start"].includes(mode)) {
    throw Error("Expected build or start executive mode");
  }

  const tasks = mode === "build"
    ? buildPlan()
    : startPlan(process.execPath);

  validatePlan(tasks);

  const budget = Number(
    mode === "build"
      ? process.env.DEPLOY_BUILD_BUDGET_SECONDS ?? 1800
      : process.env.DEPLOY_START_BUDGET_SECONDS ?? 900,
  );

  if (!Number.isFinite(budget) || budget <= 0) {
    throw Error("Invalid configured executive budget");
  }

  const stamp = Number(
    process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS,
  );

  if (
    mode === "build" &&
    process.env.DEPLOY_EXECU_CPU:String(assignedCPU),CARGO_BUILD_JOBS:String(assignedCPU),
        }});
        const attempt=attempts.get(task.id)+1;
        attempts.set(task.id,attempt);
        if(!firstStartedAt.has(task.id)) firstStartedAt.set(task.id,Date.now());
        const job={task,child,cpu:assignedCPU,closed:false,started:Date.now(),attempt,
          owned:child.pid?createOwnedProcessTracker(child.pid):null};
        children.add(job);
        child.once("error",error=>{job.error=error;job.closed=true;});
        child.once("close",(code,exitSignal)=>{job.code=code;job.signal=exitSignal;job.closed=true;});
        active.set(task.id,job); pending.delete(task.id);
        cpu+=assignedCPU;memory+=task.memoryMB;io+=task.io;
        retryAt.delete(task.id);
        log(`[executive] starting ${task.id}; attempt=${attempt}; cpu=${assignedCPU}, reserved=${task.memoryMB} MiB, io=${task.io}`);
      }
      if(!ready && readiness && [...active.values()].some(j=>j.task.application)) {
        ready=await readiness();
        if(ready) log("[executive] Application readiness confirmed; supervising runtime (not a publication-success claim)");
      }
      if(Date.now()-lastReport>=15000) {
        const running=[...active.values()].map(job=>
          `${job.task.id}:${Math.floor((Date.now()-job.started)/1000)}s/a${job.attempt}/cpu${job.cpu}/io${job.task.io}`);
        const waiting=[...pending.values()].map(task=>{
          const blockers=task.deps.filter(dependency=>!done.has(dependency));
          return blockers.length?`${task.id}[${blockers.join("+")}]`:task.id;
        });
        log(`[executive] elapsed=${Math.round((Date.now()-start)/1000)}s running=${running.join(",")||"none"} waiting=${waiting.join(",")||"none"} available=${Math.round(cap.availableMB)}MiB io=${io}/${cap.ioSlots} ${ready?"ready":`budgetRemaining=${Math.max(0,Math.round((budgetMs-Date.now()+start)/1000))}s`}`);
        lastReport=Date.now();
      }
        if(active.size || pending.size) await delay(pollMs);
    }
    if(failure) {
      failure.completedTasks=[...done];
      failure.runningTasks=[...active.keys()];
      failure.waitingTasks=[...pending.keys()];
      failure.taskCheckpoint=taskCheckpoint();
      failure.checkpointAt=new Date().toISOString();
      throw failure;
    }
    if(readiness && !ready) throw Error("Application exited before becoming ready");
    log(`[executive] plan completed in ${((Date.now()-start)/1000).toFixed(1)}s; tasks=${done.size}; retries=${[...attempts.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0)}`);
    return {completed:[...done],ready,durations:Object.fromEntries(completionStats)};
  } catch(error) {
    primaryError=error;
    throw error;
  } finally {
    signal?.removeEventListener("abort",abort);
    // Application sidecars can create their own sessions. A group-only kill
    // misses those descendants; cutting the app off at5s also prevented its
    // existing25s graceful worker drain from reaching subsystem shutdown.
    if(active.size) log(`[executive] Draining active tasks after failure: ${[...active.keys()].join(",")}`);
    const stopped=await Promise.all([...children].map(job=>job.owned?.stop({
      graceMs:job.task.application?26000:5000,descendantGraceMs:2000,
    })));
    const remaining=stopped.flatMap(result=>result?.remaining??[]);
    if(remaining.length) {
      const cleanupError=Error(`Owned deployment descendants did not stop: ${remaining.join(",")}`);
      if(primaryError) {
        primaryError.cleanupError=cleanupError.message;
        log(`[executive] Cleanup warning after primary failure: ${cleanupError.message}`);
      } else throw cleanupError;
    }
    await Promise.all([...children].filter(j=>!j.closed).map(j=>new Promise(resolve=>j.child.once("close",resolve))));
  }
}

*/
async function main(mode) {
  if(!["build","start"].includes(mode)) throw Error("Expected build or start executive mode");
  const tasks=mode==="build"?coordinateBuildPlan(buildPlan()):startPlan(process.execPath);
  validatePlan(tasks);
  const state=fs.mkdtempSync(path.join(os.tmpdir(),"deployment-executive-"));
  const controller=new AbortController();
  const unbindSignals=bindShutdownSignals(controller);
  const budget=Number(mode==="build" ? process.env.DEPLOY_BUILD_BUDGET_SECONDS??1800 : process.env.DEPLOY_START_BUDGET_SECONDS??900);
  const bootstrapElapsed=mode==="build" && process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS
    ? Date.now()-Number(process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS)*1000 : 0;
  console.log(`[executive] ${mode} budget=${budget}s (local safety budget, not a documented platform timeout)`);
  try {
    const cap = liveCapacity();
    console.log(
      `[executive] detected resources=${cap.cpus.toFixed(2)} vCPU/` +
      `${Math.round(cap.memoryMB)} MiB RAM; ceiling=` +
      `${DEDICATED_DEPLOYMENT_LIMITS.cpus} vCPU/` +
      `${DEDICATED_DEPLOYMENT_LIMITS.memoryGB} GiB; ` +
      `available=${Math.round(cap.availableMB)} MiB; ` +
      `I/O slots=${cap.ioSlots}`,
    );
    await runExecutive(tasks,{env:{...process.env,DEPLOY_STATE_DIR:state},budgetMs:budget*1000-bootstrapElapsed,signal:controller.signal,
      ...(mode==="start"?{readiness:async()=>{
        try {
          const response=await fetch(`http://127.0.0.1:${process.env.PORT||5000}/api/ready`,{signal:AbortSignal.timeout(1500)});
          const body=await response.json();
          return response.status===200 && body.status==="ok" && body.unifiedAwareness?.ready===true;
        } catch { return false; }
      }}:{})});
  } catch(error) {
    console.error("[executive] Task checkpoint:", JSON.stringify({
      code:error.code??null,
      signal:error.signal??error.taskSignal??null,
      signalOrigin:error.signalOrigin??null,
      signalScope:error.signalScope??null,
      resumePolicy:error.resumePolicy??(error.taskSignal?"bounded-task-policy":"none"),
      taskId:error.taskId??null,
      checkpointAt:error.checkpointAt??new Date().toISOString(),
      completed: error.completedTasks ?? [],
      interrupted: error.runningTasks ?? [],
      waiting: error.waitingTasks ?? [],
      tasks:error.taskCheckpoint??[],
      cleanupError:error.cleanupError??null,
    }));
    throw error;
  } finally {
    unbindSignals();
    fs.rmSync(state,{recursive:true,force:true});
    if(mode==="build" && /^\/tmp\/deployment-tools\.[a-zA-Z0-9]+$/.test(process.env.DEPLOY_BOOTSTRAP_DIR??"")) {
      fs.rmSync(process.env.DEPLOY_BOOTSTRAP_DIR,{recursive:true,force:true});
    }
    const stub=Number(process.env.DEPLOY_BOOT_STUB_PID);
    if(mode==="start" && Number.isInteger(stub) && stub>1) {
      try {process.kill(stub,"SIGTERM");} catch(e) {if(e.code!=="ESRCH") throw e;}
    }
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(e=>{console.error("[executive] FAILED:",e.message);process.exitCode=1;});
}

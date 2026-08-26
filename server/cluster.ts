import cluster from "cluster";
import os from "os";
import path from "path";
import http from "http";
import fs from "fs";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync, spawn } from "child_process";
import { computeWorkerSizing } from "./computeSizing";
import { runtimePorts } from "./config/ports.js";

// ── Boosterstate sidecar startup ──────────────────────────────────────────────
// Previously handled by start?.sh. Moved here so the run command can be a plain
// `node dist/cluster?.cjs` — which Replit's pid1 resolves without needing npm or
// any PATH manipulation.
(function startBoosterstate() {
  // Ensure production env vars are set regardless of how the process was launched.
  // Use computed keys so esbuild's "define" substitution doesn't turn the assignments
  // into a no-op literal assignment (e.g. "production" = ...).
  const env = process.env as Record<string, string | undefined>;
  env["NODE_ENV"] = env["NODE_ENV"] || "production";
  env["UV_THREADPOOL_SIZE"] = env["UV_THREADPOOL_SIZE"] || "8";
  env["TF_NUM_INTEROP_THREADS"] = env["TF_NUM_INTEROP_THREADS"] || "2";
  env["TF_NUM_INTRAOP_THREADS"] = env["TF_NUM_INTRAOP_THREADS"] || "2";

  // Check portable release binary first (build artifact placed by build.sh),
  // then fall back to the dev-workspace debug binary.
  const binCandidates = [
    path.join(process.cwd(), "bin", "boosterstate"),
    path.join(
      process.cwd(),
      "boosterstate",
      "target",
      "release",
      "boosterstate",
    ),
  ];
  const bin = binCandidates.find((p) => fs.existsSync(p)) ?? "";
  if (!bin) {
    console.log(
      "[Cluster] boosterstate binary not found — skipping sidecar startup",
    );
    return;
  }
  const already =
    spawnSync("pgrep", ["-x", "boosterstate"], { stdio: "ignore" }).status ===
    0;
  if (already) {
    console.log("[Cluster] boosterstate already running");
    return;
  }

  // Probe whether the binary can actually execute BEFORE daemon-spawning.
  // When the ELF interpreter path embedded in the binary doesn't exist on the
  // current host (common in Replit deployment VMs that use a different NixOS
  // configuration than the workspace), spawn() fails with ENOENT — but only
  // asynchronously, AFTER the synchronous Atomics?.wait(2000) has already
  // blocked startup for 2 seconds.  spawnSync returns ENOENT immediately
  // (no timeout reached) when the interpreter is missing, so we can detect
  // this case cheaply and skip both the daemon spawn and the 2-second wait.
  const probe = spawnSync(bin, ["--version"], {
    timeout: 300, // killed after 300 ms if binary starts (server mode)
    stdio: "ignore",
    killSignal: "SIGKILL",
  });
  const isEnoent =
    probe?.error && (probe?.error as NodeJS.ErrnoException).code === "ENOENT";
  if (isEnoent) {
    console.warn(
      "[Cluster] boosterstate binary cannot execute on this host " +
        "(ELF interpreter not found — binary was built for a different NixOS/glibc). " +
        "Continuing without sidecar.",
    );
    return;
  }

  // Clients reach BoosterState through the main application's authenticated
  // proxy. The binary always owns its distinct loopback port.
  const sidecarEnv = {
    ...process.env,
    BOOSTERSTATE_PORT: String(runtimePorts.boosterState),
  };
  const proc = spawn(bin, [], {
    detached: true,
    stdio: "ignore",
    env: sidecarEnv,
  });
  // MUST attach an 'error' listener before .unref() — without it, any spawn failure
  // throws an uncaught exception that crashes the entire cluster primary process.
  proc.on("error", (err) => {
    console.warn(
      `[Cluster] boosterstate sidecar error after start (${err.message}) — server will run without it`,
    );
  });
  proc.unref();
  console.log("[Cluster] boosterstate sidecar started — waiting 2 s for init");
  // Synchronous 2-second wait so workers don't race against boosterstate init.
  Atomics?.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
})();

// ── Startup-time asset pre-compression ────────────────────────────────────────
// The Repl layer (pushed during deployment) cannot contain binary files.
// The deploy:build script deletes all .br/.gz files before layer push.
// Re-generate them here at VM startup so static serving stays fast.
(function compressAssetsAtStartup() {
  const COMPRESSIBLE = /\.(js|css|svg|html|json|txt|xml|webmanifest)$/;
  const assetsDir = path?.join(process.cwd(), "dist", "public", "assets");
  if (!fs?.existsSync(assetsDir)) return;

  function compressDir(dir: string) {
    let count = 0;
    for (const entry of fs?.readdirSync(dir, { withFileTypes: true }) ?? []) {
      const full = path?.join(dir, entry?.name);
      if (entry?.isDirectory()) {
        count += compressDir(full);
        continue;
      }
      if (!COMPRESSIBLE?.test(entry?.name)) continue;
      if (entry?.name?.endsWith(".br") || entry?.name?.endsWith(".gz")) continue;
      try {
        const src = fs?.readFileSync(full);
        if (!fs?.existsSync(full + ".br")) {
          const br = zlib?.brotliCompressSync(src, {
            params: { [zlib?.constants?.BROTLI_PARAM_QUALITY]: 6 },
          });
          fs?.writeFileSync(full + ".br", br);
          count++;
        }
        if (!fs?.existsSync(full + ".gz")) {
          const gz = zlib?.gzipSync(src, { level: 9 });
          fs?.writeFileSync(full + ".gz", gz);
          count++;
        }
      } catch {
        /* intentional: gzip backup is best-effort; main data file already written */
      }
    }
    return count;
  }

  try {
    const compressed = compressDir(assetsDir);
    if (compressed > 0)
      console.log(
        `[Cluster] Asset pre-compression complete — ${compressed} file(s) written`,
      );
  } catch (err) {
    console.warn(
      "[Cluster] Asset pre-compression skipped:",
      (err as Error).message,
    );
  }
})();

// CJS-safe: import.meta.url is undefined when bundled to CJS by esbuild.
// Fall back to process.argv[1] (the entry file path) for __dirname resolution.
const __metaUrl = (import.meta as unknown as Record<string, unknown>)?.url as
  | string
  | undefined;
const __filename = __metaUrl
  ? fileURLToPath(__metaUrl)
  : path?.resolve(process.argv[1] ?? "");
const __dirname = path?.dirname(__filename);
createRequire(__metaUrl ?? "file://" + __filename);

// Clustering requires either:
//   1. REPLIT_DEPLOYMENT is set (actual Autoscale deployment), OR
//   2. ENABLE_CLUSTER=true explicitly set by the operator
// NODE_ENV=production alone does NOT trigger clustering — in the Replit IDE the build
// runs with NODE_ENV=production but there is only one process and no health-check grace period.
const ENABLE_CLUSTER =
  !!process.env.REPLIT_DEPLOYMENT || process.env.ENABLE_CLUSTER === "true";

const DISABLE_CLUSTER = process.env.DISABLE_CLUSTER === "true";

if (!ENABLE_CLUSTER || DISABLE_CLUSTER) {
  // Single-process mode: IDE dev environment, DISABLE_CLUSTER=true, or non-deployment run.
  // Use dynamic import — index?.mjs is ESM and cannot be loaded with require().
  const appEntry = path?.join(__dirname, "index.mjs");
  import(appEntry).catch((err: unknown) => {
    console.error("[Cluster] Failed to load server entry:", err);
    process.exit(1);
  });
} else {
  const totalMemGB = os?.totalmem() / 1024 ** 3;

  // ── Worker auto-sizing — why this matters at scale ───────────────────────
  //
  // Max Booster is designed for Replit Autoscale: as concurrent users grow,
  // Replit spins up additional replica VMs.  Throughput therefore scales in
  // two dimensions:
  //
  //   Horizontal (replicas):  Replit adds/removes VMs based on traffic.
  //   Vertical   (workers):   Each VM runs N workers, one per CPU core.
  //
  // Every worker is a full independent Node?.js process sharing the same port
  // via SO_REUSEPORT.  The OS kernel distributes incoming connections across
  // all listening workers — no proxy, no round-robin at the app layer.
  // Sessions and queues live in PDIM (shared across all workers and all
  // replicas), so any worker can serve any user without affinity.
  //
  // WHY NOT SET CLUSTER_WORKERS MANUALLY:
  //   Setting a hard number locks the replica to that count regardless of
  //   the VM it lands on.  If Autoscale places a replica on an 8-vCPU VM
  //   and CLUSTER_WORKERS=2, 6 cores sit idle — the replica delivers ~33%
  //   of its purchased throughput.  At 100M-user scale that idle capacity
  //   is expensive and directly increases the number of additional replicas
  //   Replit must spin up to compensate, raising cost proportionally.
  //
  // WHY NOT USE ALL CORES:
  //   One core is reserved for the primary process and the OS scheduler.
  //   The primary owns the health-check socket from t=0 so Replit's load
  //   balancer never sees a gap, manages rolling restarts, and propagates
  //   SIGTERM to all workers on scale-down.  Starving it causes health-check
  //   timeouts and false-positive replica evictions under load.
  //
  // MEMORY GUARD:
  //   Each worker carries a 4 GiB V8 heap + ~0.5 GiB native overhead
  //   (libuv thread pool, TensorFlow.js, ioredis, BullMQ).  The memory
  //   limit floor ensures we never fork more workers than RAM can safely
  //   hold, preventing the OOM killer from wiping mid-request workers.
  //   Math.min(cpuLimit, memLimit) is the safe ceiling — whichever resource
  //   runs out first is the real constraint on that particular VM.
  //
  // EXPECTED WORKER COUNTS (auto-detected, no override needed):
  //   Autoscale replica  (8 vCPU  / 32 GiB): ~6 workers  → 6× throughput
  //   Reserved VM        (16 vCPU / 64 GiB): ~12 workers → 12× throughput
  //   Dev container      (8 vCPU  / 16 GiB): single-process (ENABLE_CLUSTER
  //                                           not set in dev, cluster skipped)
  //
  // PDIM AWARENESS:
  //   PDIM_CLUSTER_WORKERS is passed to every forked worker at fork time.
  //   The AIMD rate limiter inside each worker uses this count to divide its
  //   per-worker ZPOPMIN poll budget proportionally, so total PDIM throughput
  //   stays constant regardless of how many workers are running.  Adding more
  //   workers does not increase PDIM load — it is automatically redistributed.
  //
  // OVERRIDE (use only to intentionally constrain for testing/debugging):
  //   Set CLUSTER_WORKERS=N to pin to exactly N workers.
  //   Remove the env var entirely to restore full auto-sizing.
  // ─────────────────────────────────────────────────────────────────────────

  const isDeployment = !!process.env.REPLIT_DEPLOYMENT;

  // Deployed workers get the full 4 GiB heap; dev gets 3 GiB to avoid OOM
  // on smaller dev containers that share RAM with the IDE and sidecars.
  const memPerWorkerGB = isDeployment ? 4.5 : 6.0;

  // V8 heap cap applied to each forked worker (MiB).
  // Workers do NOT inherit the primary's --max-old-space-size CLI flag —
  // it must be passed explicitly via execArgv (done below).
  const workerHeapMB = isDeployment ? 4096 : 3072;

  // Sizing derivation lives in server/computeSizing.ts — the single shared
  // source of truth also consumed by maxcoreLocalSupervisor.ts (its own Node
  // cluster) and (via env vars) MaxCore's Python HyperGPU engine, so every
  // process on this host reasons about CPU/RAM capacity the same way.
  //
  // cpuLimit: reserve 1 core for the primary process + OS scheduler.
  // memLimit: never fork more workers than RAM can hold at memPerWorkerGB each.
  // The real worker count is the lesser of the two — whichever resource
  // is exhausted first on the current VM is the binding constraint.
  //
  // CLUSTER_WORKERS is intentionally left unset in production so auto-sizing
  // fills every available CPU core and RAM slot on whatever VM Autoscale
  // provisions.  Only set it when deliberately constraining for debugging.
  const sizing = computeWorkerSizing({
    memPerWorkerGB,
    envOverrideVar: "CLUSTER_WORKERS",
  });
  const { cpuLimit, memLimit } = sizing;

  if (sizing.source === "override") {
    console.warn(
      `[Cluster] ⚠️  CLUSTER_WORKERS override active — pinned to ${sizing.workerCount} worker(s). ` +
        `Auto-sizing would have chosen ${Math.min(cpuLimit, memLimit ?? cpuLimit)}. ` +
        `Remove CLUSTER_WORKERS to restore full VM utilisation.`,
    );
  }

  const workerCount = sizing.workerCount;

  const workerScript = path?.join(__dirname, "index.mjs");

  // Pass heap size to every worker — workers do NOT inherit the primary's CLI flag.
  // execArgv is propagated to each forked child process by Node.js cluster module.
  cluster.setupPrimary({
    exec: workerScript,
    execArgv: [`--max-old-space-size=${workerHeapMB}`],
  });

  console.log(
    `[Cluster] Primary ${process.pid} — forking ${workerCount} workers ` +
      `(CPUs: ${sizing.numCPUs}, total RAM: ${totalMemGB.toFixed(1)} GB, free: ${sizing.freeMemGB.toFixed(1)} GB, ` +
      `${memPerWorkerGB} GB/worker, heap/worker: ${workerHeapMB} MB, ` +
      `cpu-limit: ${cpuLimit}, mem-limit: ${memLimit})` +
      (isDeployment ? ` [Deployed VM — ${sizing.numCPUs} vCPU]` : ""),
  );

  // ── Option 1: Primary-owned health check server ───────────────────────────
  // The primary process (this file) binds port 5000 immediately using
  // SO_REUSEPORT *before* any worker is forked.  Workers also bind 5000 with
  // reusePort: true (see index.ts early-listen).  The OS kernel load-balances
  // connections across all listening sockets, so:
  //   • Replit's health check hits /health on the PRIMARY → 200 in <1 ms,
  //     guaranteed from the very first millisecond of process start.
  //   • Once workers come online they share port 5000 and handle real traffic.
  //   • If ALL workers crash and restart the primary's socket keeps the port
  //     alive so the health check never sees a connection-refused.
  const primaryPort = runtimePorts.app;
  // Health paths answered by the primary itself.
  // MUST include every path Replit's deployment health checker may use — if the
  // primary returns 503 on any health path, the deployment times out even after
  // workers come up (OS SO_REUSEPORT load-balances between primary + workers so
  // the primary always handles a fraction of incoming requests).
  const HEALTH_PATHS = new Set(["/", "/health", "/api/health", "/api/ping"]);
  const primaryHealthServer = http?.createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0]; // strip query string
    if (HEALTH_PATHS?.has(url)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          pid: process.pid,
          role: "primary",
          ts: Date.now(),
        }),
      );
    } else {
      // Non-health requests that land on the primary during worker startup:
      // return 503 + Retry-After so the client retries once a worker is ready.
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Retry-After": "2",
      });
      res.end(
        JSON.stringify({
          status: "starting",
          message: "Workers initializing — retry in 2s",
        }),
      );
    }
  });
  primaryHealthServer?.listen(
    { port: primaryPort, host: "0.0.0.0", reusePort: true },
    () => {
      console.log(
        `[Cluster] Primary health server on :${primaryPort} (pid=${process.pid}) — workers starting`,
      );
    },
  );

  // Stagger worker startup by 800 ms per worker.
  // Without a stagger all N workers immediately race to connect to PDIM
  // (session-store ping, distributed-cache connect, BullMQ bzpopmin) which
  // saturates PDIM's rate-limit and triggers cascading 429s before any
  // worker has finished initialising.
  //
  // PDIM_CLUSTER_WORKERS is passed to every forked worker so the AIMD
  // rate-limiter and ZPOPMIN gap scale their per-worker budgets correctly.
  // At 90M-user scale each worker must only consume 1/N of PDIM's
  // throughput quota — PDIM's own 429 responses are the global ceiling.
  // Track each worker's env so we can preserve CLUSTER_WORKER_ID on respawn.
  // Without this, crash-respawned workers have no ID and all start background jobs.
  const workerEnvMap = new Map<number, Record<string, string>>();

  for (let i = 0; i < workerCount; i++) {
    setTimeout(() => {
      const env: Record<string, string> = {
        PDIM_CLUSTER_WORKERS: String(workerCount),
        CLUSTER_WORKER_ID: String(i),
      };
      const w = cluster?.fork(env);
      workerEnvMap?.set(w?.id, env);
    }, i * 300);
  }

  // Crash-loop protection: track restart times to detect and back off runaway crashes.
  const workerRestartTimes: number[] = [];
  const MAX_RESTARTS_PER_MINUTE = 10;
  const BACKOFF_DELAY_MS = 30_000;

  cluster?.on("exit", (worker, code, signal) => {
    const reason = signal ? `signal=${signal}` : `code=${code}`;
    console.error(
      `[Cluster] Worker ${worker?.process?.pid} exited (${reason}) — restarting`,
    );

    // Retrieve (and remove) the env so the replacement inherits the same CLUSTER_WORKER_ID.
    const savedEnv = workerEnvMap?.get(worker?.id);
    workerEnvMap?.delete(worker?.id);

    const spawnReplacement = () => {
      const w = cluster?.fork(savedEnv);
      if (savedEnv) workerEnvMap?.set(w?.id, savedEnv);
    };

    const now = Date.now();
    // Evict timestamps outside the 60-second window
    while (
      workerRestartTimes?.length > 0 &&
      workerRestartTimes[0] < now - 60_000
    ) {
      workerRestartTimes?.shift();
    }

    if (workerRestartTimes?.length >= MAX_RESTARTS_PER_MINUTE) {
      console.error(
        `[Cluster] Crash-loop detected: ${workerRestartTimes?.length} restarts in last 60s — ` +
          `backing off ${BACKOFF_DELAY_MS / 1000}s before next fork`,
      );
      setTimeout(spawnReplacement, BACKOFF_DELAY_MS);
    } else {
      workerRestartTimes?.push(now);
      setTimeout(spawnReplacement, 500);
    }
  });

  let workersOnline = 0;
  let primaryPortReleased = false;
  cluster?.on("online", (worker) => {
    console.log(`[Cluster] Worker ${worker?.process?.pid} online`);
    workersOnline++;
    if (workersOnline >= workerCount && !primaryPortReleased) {
      primaryPortReleased = true;
      // All workers are listening — retire the primary's reusePort socket so it
      // stops competing with workers for connections.  Without this, ~1/N of all
      // requests (including API calls from the SPA) land on the primary and get
      // 503 forever, breaking the app for users even after a clean boot.
      primaryHealthServer?.close(() => {
        console.log(
          "[Cluster] Primary port released — all traffic now served by workers",
        );
      });
    }
  });

  // Graceful shutdown for the cluster primary.
  // Autoscale sends SIGTERM to the process group when scaling down a replica.
  // The primary must propagate the signal to all workers and wait for them to drain
  // before exiting. Hard-exits after 25 s (autoscale sends SIGKILL at ~30 s).
  function primaryShutdown(signal: string): void {
    console.log(
      `[Cluster] Primary received ${signal} — draining ${Object.keys(cluster?.workers ?? {}).length} worker(s)`,
    );

    const hardExit = setTimeout(() => {
      console.error("[Cluster] Primary hard timeout — forcing exit");
      process.exit(0);
    }, 25_000);
    hardExit?.unref();

    // Forward SIGTERM to all workers so they trigger their own graceful shutdown.
    const workers = Object.values(cluster?.workers ?? {}).filter(
      Boolean,
    ) as import("cluster").Worker[];
    workers?.forEach((w) => {
      try {
        w?.process?.kill("SIGTERM");
      } catch {
        /* worker may already be gone */
      }
    });

    // Exit once all workers have exited.
    let remaining = workers?.length;
    if (remaining === 0) {
      clearTimeout(hardExit);
      process.exit(0);
      return;
    }

    cluster?.on("exit", () => {
      remaining--;
      if (remaining <= 0) {
        console.log("[Cluster] All workers exited — primary shutting down");
        clearTimeout(hardExit);
        process.exit(0);
      }
    });
  }

  process.on("SIGTERM", () => primaryShutdown("SIGTERM"));
  process.on("SIGINT", () => primaryShutdown("SIGINT"));

  // Rolling restart triggered by SilentDeploymentService after self-evolution files land.
  // Cycles workers one at a time: old exits → new forks and comes online → repeat.
  // Zero downtime: at least one worker is always serving traffic.
  let rollingRestartInProgress = false;

  cluster?.on("message", (_worker, message: unknown) => {
    if (!message || typeof message !== "object") return;
    const msg = message as Record<string, unknown>;
    if (msg?.type !== "SILENT_RELOAD") return;
    if (rollingRestartInProgress) {
      console.log(
        "[Cluster] Rolling restart already in progress — ignoring duplicate SILENT_RELOAD",
      );
      return;
    }

    const reason = msg?.reason ?? "unknown";
    console.log(
      `[Cluster] SILENT_RELOAD received (reason=${reason}) — beginning rolling restart`,
    );
    rollingRestartInProgress = true;

    const workerList = Object.values(cluster?.workers ?? {}).filter(
      Boolean,
    ) as import("cluster").Worker[];
    let index = 0;

    const restartNext = () => {
      if (index >= workerList?.length) {
        console.log(
          "[Cluster] Rolling restart complete — all workers running new code",
        );
        rollingRestartInProgress = false;
        return;
      }

      const target = workerList[index++];
      if (!target || target?.isDead()) {
        restartNext();
        return;
      }

      // Fork the replacement first so traffic is never fully dropped
      const replacement = cluster?.fork();
      replacement?.once("listening", () => {
        console.log(
          `[Cluster] Replacement worker ${replacement?.process?.pid} ready — retiring old worker ${target?.process?.pid}`,
        );
        target?.disconnect();
        // Give old worker 10s to finish in-flight requests then force-kill
        const forceKill = setTimeout(() => target?.kill(), 10_000);
        target?.once("exit", () => {
          clearTimeout(forceKill);
          restartNext();
        });
      });
    };

    restartNext();
  });
}

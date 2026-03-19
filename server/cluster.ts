import cluster from 'cluster';
import os from 'os';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync, spawn } from 'child_process';

// ── Boosterstate sidecar startup ──────────────────────────────────────────────
// Previously handled by start.sh. Moved here so the run command can be a plain
// `node dist/cluster.cjs` — which Replit's pid1 resolves without needing npm or
// any PATH manipulation.
(function startBoosterstate() {
  // Ensure production env vars are set regardless of how the process was launched.
  // Use computed keys so esbuild's "define" substitution doesn't turn the assignments
  // into a no-op literal assignment (e.g. "production" = ...).
  const _env = process.env as Record<string, string | undefined>;
  _env['NODE_ENV']               = _env['NODE_ENV']               || 'production';
  _env['UV_THREADPOOL_SIZE']     = _env['UV_THREADPOOL_SIZE']     || '8';
  _env['TF_NUM_INTEROP_THREADS'] = _env['TF_NUM_INTEROP_THREADS'] || '2';
  _env['TF_NUM_INTRAOP_THREADS'] = _env['TF_NUM_INTRAOP_THREADS'] || '2';

  const bin = path.join(process.cwd(), 'boosterstate', 'target', 'release', 'boosterstate');
  if (!fs.existsSync(bin)) {
    console.warn('[Cluster] boosterstate binary not found — skipping sidecar startup');
    return;
  }
  const already = spawnSync('pgrep', ['-x', 'boosterstate'], { stdio: 'ignore' }).status === 0;
  if (already) {
    console.log('[Cluster] boosterstate already running');
    return;
  }

  // Probe whether the binary can actually execute BEFORE daemon-spawning.
  // When the ELF interpreter path embedded in the binary doesn't exist on the
  // current host (common in Replit deployment VMs that use a different NixOS
  // configuration than the workspace), spawn() fails with ENOENT — but only
  // asynchronously, AFTER the synchronous Atomics.wait(2000) has already
  // blocked startup for 2 seconds.  spawnSync returns ENOENT immediately
  // (no timeout reached) when the interpreter is missing, so we can detect
  // this case cheaply and skip both the daemon spawn and the 2-second wait.
  const probe = spawnSync(bin, ['--version'], {
    timeout: 300,        // killed after 300 ms if binary starts (server mode)
    stdio: 'ignore',
    killSignal: 'SIGKILL' as any,
  });
  const isEnoent = probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT';
  if (isEnoent) {
    console.warn(
      '[Cluster] boosterstate binary cannot execute on this host ' +
      '(ELF interpreter not found — binary was built for a different NixOS/glibc). ' +
      'Continuing without sidecar.'
    );
    return;
  }

  // BOOSTERSTATE_PORT may equal PORT (5000) when the "one external port" configuration
  // is active — clients reach boosterstate via the /api/boosterstate Express proxy.
  // The sidecar binary itself must always bind to a different internal port.
  // BOOSTERSTATE_SIDECAR_PORT (default 9877) is the binary's actual listen address.
  const sidecarPort = process.env.BOOSTERSTATE_SIDECAR_PORT || '9877';
  const sidecarEnv = { ...process.env, BOOSTERSTATE_PORT: sidecarPort };
  const proc = spawn(bin, [], { detached: true, stdio: 'ignore', env: sidecarEnv });
  // MUST attach an 'error' listener before .unref() — without it, any spawn failure
  // throws an uncaught exception that crashes the entire cluster primary process.
  proc.on('error', (err) => {
    console.warn(`[Cluster] boosterstate sidecar error after start (${err.message}) — server will run without it`);
  });
  proc.unref();
  console.log('[Cluster] boosterstate sidecar started — waiting 2 s for init');
  // Synchronous 2-second wait so workers don't race against boosterstate init.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
})();

// CJS-safe: import.meta.url is undefined when bundled to CJS by esbuild.
// Fall back to process.argv[1] (the entry file path) for __dirname resolution.
const __metaUrl = (import.meta as any)?.url as string | undefined;
const __filename = __metaUrl ? fileURLToPath(__metaUrl) : path.resolve(process.argv[1] ?? '');
const __dirname = path.dirname(__filename);
const require = createRequire(__metaUrl ?? ('file://' + __filename));

// Clustering requires either:
//   1. REPLIT_DEPLOYMENT is set (actual Autoscale deployment), OR
//   2. ENABLE_CLUSTER=true explicitly set by the operator
// NODE_ENV=production alone does NOT trigger clustering — in the Replit IDE the build
// runs with NODE_ENV=production but there is only one process and no health-check grace period.
const ENABLE_CLUSTER =
  !!process.env.REPLIT_DEPLOYMENT ||
  process.env.ENABLE_CLUSTER === 'true';

const DISABLE_CLUSTER = process.env.DISABLE_CLUSTER === 'true';

if (!ENABLE_CLUSTER || DISABLE_CLUSTER) {
  // Single-process mode: IDE dev environment, DISABLE_CLUSTER=true, or non-deployment run.
  const appEntry = path.join(__dirname, 'index.cjs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(appEntry);
} else {
  const numCPUs = os.cpus().length;
  const freeMemGB = os.freemem() / (1024 ** 3);
  const totalMemGB = os.totalmem() / (1024 ** 3);

  // Deployed VM worker sizing (covers both Autoscale and Reserved VM):
  //   - Each worker V8 heap: 4 GiB (--max-old-space-size=4096, set via execArgv below)
  //   - Native overhead (libuv, TensorFlow, ioredis, BullMQ): ~0.5 GiB
  //   - Effective footprint per worker: ~4.5 GiB
  //
  //   Autoscale replica  (8 vCPU / 32 GiB):  ~6 workers auto-detected
  //   Reserved VM        (16 vCPU / 64 GiB): ~12 workers auto-detected
  //
  //   Auto-detection uses Math.min(cpuLimit, memLimit) so no CLUSTER_WORKERS
  //   override is needed — the cluster expands to fill all available CPUs and RAM.
  //   Use CLUSTER_WORKERS only to intentionally constrain below the auto cap.
  //
  // Dev / non-deployment: use conservative 6 GiB per worker to avoid OOM.
  const isDeployment = !!process.env.REPLIT_DEPLOYMENT;
  const memPerWorkerGB = isDeployment ? 4.5 : 6.0;

  // V8 heap cap applied to each forked worker (MiB)
  const workerHeapMB = isDeployment ? 4096 : 3072;

  // Cap workers by both CPU count and available RAM.
  // cpuLimit reserves 1 core for the primary process + OS scheduler.
  const cpuLimit = Math.max(1, numCPUs - 1);
  const memLimit = Math.max(1, Math.floor(freeMemGB / memPerWorkerGB));

  // CLUSTER_WORKERS env var allows explicit operator override.
  // Leave unset to let auto-detection use all available CPUs and RAM.
  const envOverride = process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS, 10) : null;

  const workerCount = envOverride && envOverride > 0
    ? envOverride
    : Math.min(cpuLimit, memLimit);

  const workerScript = path.join(__dirname, 'index.cjs');

  // Pass heap size to every worker — workers do NOT inherit the primary's CLI flag.
  // execArgv is propagated to each forked child process by Node.js cluster module.
  cluster.setupPrimary({
    exec: workerScript,
    execArgv: [`--max-old-space-size=${workerHeapMB}`],
  });

  console.log(
    `[Cluster] Primary ${process.pid} — forking ${workerCount} workers ` +
    `(CPUs: ${numCPUs}, total RAM: ${totalMemGB.toFixed(1)} GB, free: ${freeMemGB.toFixed(1)} GB, ` +
    `${memPerWorkerGB} GB/worker, heap/worker: ${workerHeapMB} MB, ` +
    `cpu-limit: ${cpuLimit}, mem-limit: ${memLimit})` +
    (isDeployment ? ` [Deployed VM — ${numCPUs} vCPU]` : '')
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
  const primaryPort = parseInt(process.env.PORT || '5000', 10);
  // Health paths answered by the primary itself.
  // MUST include every path Replit's deployment health checker may use — if the
  // primary returns 503 on any health path, the deployment times out even after
  // workers come up (OS SO_REUSEPORT load-balances between primary + workers so
  // the primary always handles a fraction of incoming requests).
  const HEALTH_PATHS = new Set(['/health', '/api/health', '/api/ping']);
  const primaryHealthServer = http.createServer((req, res) => {
    const url = (req.url ?? '').split('?')[0]; // strip query string
    if (HEALTH_PATHS.has(url)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', pid: process.pid, role: 'primary', ts: Date.now() }));
    } else {
      // Non-health requests that land on the primary during worker startup:
      // return 503 + Retry-After so the client retries once a worker is ready.
      res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '2' });
      res.end(JSON.stringify({ status: 'starting', message: 'Workers initializing — retry in 2s' }));
    }
  });
  primaryHealthServer.listen({ port: primaryPort, host: '0.0.0.0', reusePort: true }, () => {
    console.log(`[Cluster] Primary health server on :${primaryPort} (pid=${process.pid}) — workers starting`);
  });

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
      const w = cluster.fork(env);
      workerEnvMap.set(w.id, env);
    }, i * 300);
  }

  // Crash-loop protection: track restart times to detect and back off runaway crashes.
  const workerRestartTimes: number[] = [];
  const MAX_RESTARTS_PER_MINUTE = 10;
  const BACKOFF_DELAY_MS = 30_000;

  cluster.on('exit', (worker, code, signal) => {
    const reason = signal ? `signal=${signal}` : `code=${code}`;
    console.error(`[Cluster] Worker ${worker.process.pid} exited (${reason}) — restarting`);

    // Retrieve (and remove) the env so the replacement inherits the same CLUSTER_WORKER_ID.
    const savedEnv = workerEnvMap.get(worker.id);
    workerEnvMap.delete(worker.id);

    const spawnReplacement = () => {
      const w = cluster.fork(savedEnv);
      if (savedEnv) workerEnvMap.set(w.id, savedEnv);
    };

    const now = Date.now();
    // Evict timestamps outside the 60-second window
    while (workerRestartTimes.length > 0 && workerRestartTimes[0] < now - 60_000) {
      workerRestartTimes.shift();
    }

    if (workerRestartTimes.length >= MAX_RESTARTS_PER_MINUTE) {
      console.error(
        `[Cluster] Crash-loop detected: ${workerRestartTimes.length} restarts in last 60s — ` +
        `backing off ${BACKOFF_DELAY_MS / 1000}s before next fork`
      );
      setTimeout(spawnReplacement, BACKOFF_DELAY_MS);
    } else {
      workerRestartTimes.push(now);
      setTimeout(spawnReplacement, 500);
    }
  });

  cluster.on('online', (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} online`);
  });

  // Graceful shutdown for the cluster primary.
  // Autoscale sends SIGTERM to the process group when scaling down a replica.
  // The primary must propagate the signal to all workers and wait for them to drain
  // before exiting. Hard-exits after 25 s (autoscale sends SIGKILL at ~30 s).
  function primaryShutdown(signal: string): void {
    console.log(`[Cluster] Primary received ${signal} — draining ${Object.keys(cluster.workers ?? {}).length} worker(s)`);

    const hardExit = setTimeout(() => {
      console.error('[Cluster] Primary hard timeout — forcing exit');
      process.exit(0);
    }, 25_000);
    hardExit.unref();

    // Forward SIGTERM to all workers so they trigger their own graceful shutdown.
    const workers = Object.values(cluster.workers ?? {}).filter(Boolean) as import('cluster').Worker[];
    workers.forEach((w) => {
      try { w.process.kill('SIGTERM'); } catch { /* worker may already be gone */ }
    });

    // Exit once all workers have exited.
    let remaining = workers.length;
    if (remaining === 0) { clearTimeout(hardExit); process.exit(0); return; }

    cluster.on('exit', () => {
      remaining--;
      if (remaining <= 0) {
        console.log('[Cluster] All workers exited — primary shutting down');
        clearTimeout(hardExit);
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', () => primaryShutdown('SIGTERM'));
  process.on('SIGINT',  () => primaryShutdown('SIGINT'));

  // Rolling restart triggered by SilentDeploymentService after self-evolution files land.
  // Cycles workers one at a time: old exits → new forks and comes online → repeat.
  // Zero downtime: at least one worker is always serving traffic.
  let rollingRestartInProgress = false;

  cluster.on('message', (_worker, message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const msg = message as Record<string, unknown>;
    if (msg.type !== 'SILENT_RELOAD') return;
    if (rollingRestartInProgress) {
      console.log('[Cluster] Rolling restart already in progress — ignoring duplicate SILENT_RELOAD');
      return;
    }

    const reason = msg.reason ?? 'unknown';
    console.log(`[Cluster] SILENT_RELOAD received (reason=${reason}) — beginning rolling restart`);
    rollingRestartInProgress = true;

    const workerList = Object.values(cluster.workers ?? {}).filter(Boolean) as import('cluster').Worker[];
    let index = 0;

    const restartNext = () => {
      if (index >= workerList.length) {
        console.log('[Cluster] Rolling restart complete — all workers running new code');
        rollingRestartInProgress = false;
        return;
      }

      const target = workerList[index++];
      if (!target || target.isDead()) {
        restartNext();
        return;
      }

      // Fork the replacement first so traffic is never fully dropped
      const replacement = cluster.fork();
      replacement.once('listening', () => {
        console.log(`[Cluster] Replacement worker ${replacement.process.pid} ready — retiring old worker ${target.process.pid}`);
        target.disconnect();
        // Give old worker 10s to finish in-flight requests then force-kill
        const forceKill = setTimeout(() => target.kill(), 10_000);
        target.once('exit', () => {
          clearTimeout(forceKill);
          restartNext();
        });
      });
    };

    restartNext();
  });
}

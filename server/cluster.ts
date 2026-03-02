import cluster from 'cluster';
import os from 'os';
import path from 'path';

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

  // Replit Autoscale (8 vCPU / 32 GiB per replica):
  //   - Each worker V8 heap: 4 GiB (--max-old-space-size=4096, set via execArgv below)
  //   - Native overhead (libuv, TensorFlow, ioredis, BullMQ): ~0.5 GiB
  //   - Effective footprint per worker: ~4.5 GiB
  //   - 6 workers × 4.5 GiB = 27 GiB; leaves 5 GiB for primary + OS + buffers
  //
  // On other hardware, use a conservative 6 GiB per worker.
  const isAutoscale = !!process.env.REPLIT_DEPLOYMENT;
  const memPerWorkerGB = isAutoscale ? 4.5 : 6.0;

  // V8 heap cap applied to each forked worker (MiB)
  const workerHeapMB = isAutoscale ? 4096 : 3072;

  // Cap workers by both CPU count and available RAM
  const cpuLimit = Math.max(1, numCPUs - 1);             // leave 1 CPU for primary + OS
  const memLimit = Math.max(1, Math.floor(freeMemGB / memPerWorkerGB));

  // CLUSTER_WORKERS env var allows operator override.
  // Recommended for Autoscale 8 vCPU / 32 GiB: CLUSTER_WORKERS=6
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
    (isAutoscale ? ' [Autoscale replica]' : '')
  );

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Crash-loop protection: track restart times to detect and back off runaway crashes.
  const workerRestartTimes: number[] = [];
  const MAX_RESTARTS_PER_MINUTE = 10;
  const BACKOFF_DELAY_MS = 30_000;

  cluster.on('exit', (worker, code, signal) => {
    const reason = signal ? `signal=${signal}` : `code=${code}`;
    console.error(`[Cluster] Worker ${worker.process.pid} exited (${reason}) — restarting`);

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
      setTimeout(() => cluster.fork(), BACKOFF_DELAY_MS);
    } else {
      workerRestartTimes.push(now);
      setTimeout(() => cluster.fork(), 500);
    }
  });

  cluster.on('online', (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} online`);
  });

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

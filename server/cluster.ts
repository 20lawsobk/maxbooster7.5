import cluster from 'cluster';
import os from 'os';
import path from 'path';

// Clustering requires either:
//   1. REPLIT_DEPLOYMENT is set (actual Reserved VM deployment), OR
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

  // Use FREE memory (not total) — on a busy machine total can be 64 GB while only
  // 16 GB is actually available.
  const freeMemGB = os.freemem() / (1024 ** 3);
  const totalMemGB = os.totalmem() / (1024 ** 3);

  // Replit Autoscale (8 vCPU / 32 GiB per replica): each TF-loaded Express worker
  // peaks at ~4.5 GB (4 GB V8 heap via --max-old-space-size=4096 + ioredis/BullMQ/native overhead).
  // On other hardware, stay conservative at 6 GB per worker.
  const isAutoscale = !!process.env.REPLIT_DEPLOYMENT;
  const memPerWorkerGB = isAutoscale ? 4.5 : 6;

  // Cap workers by both CPU count and AVAILABLE RAM so we never OOM.
  const cpuLimit = Math.max(1, numCPUs - 1);             // leave 1 CPU for the primary
  const memLimit = Math.max(1, Math.floor(freeMemGB / memPerWorkerGB));

  // CLUSTER_WORKERS env var gives the operator an explicit override.
  // Recommended for Autoscale 8 vCPU / 32 GiB: CLUSTER_WORKERS=6
  const envOverride = process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS, 10) : null;

  const workerCount = envOverride && envOverride > 0
    ? envOverride
    : Math.min(cpuLimit, memLimit);

  const workerScript = path.join(__dirname, 'index.cjs');
  cluster.setupPrimary({ exec: workerScript });

  console.log(
    `[Cluster] Primary ${process.pid} — forking ${workerCount} workers ` +
    `(CPUs: ${numCPUs}, total RAM: ${totalMemGB.toFixed(1)} GB, free: ${freeMemGB.toFixed(1)} GB, ` +
    `${memPerWorkerGB} GB/worker, cpu-limit=${cpuLimit}, mem-limit=${memLimit})` +
    (isAutoscale ? ' [Autoscale replica]' : '')
  );

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    const reason = signal ? `signal=${signal}` : `code=${code}`;
    console.error(`[Cluster] Worker ${worker.process.pid} exited (${reason}) — restarting`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} online`);
  });
}

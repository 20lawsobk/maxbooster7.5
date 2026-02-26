import cluster from 'cluster';
import os from 'os';
import path from 'path';

const DISABLE_CLUSTER = process.env.DISABLE_CLUSTER === 'true';
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

if (DISABLE_CLUSTER || !isProduction) {
  // Not in production or clustering explicitly disabled — run the app in this process directly.
  // Workers spawned via setupPrimary always execute index.cjs and never run this file,
  // so cluster.isWorker is never true here.
  const appEntry = path.join(__dirname, 'index.cjs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(appEntry);
} else {
  const numCPUs = os.cpus().length;

  // Use FREE memory (not total) — on a busy machine total can be 64 GB while only
  // 16 GB is actually available.  Each TF-loaded Express worker needs ~6 GB headroom.
  const freeMemGB = os.freemem() / (1024 ** 3);

  // Cap workers by both CPU count and AVAILABLE RAM so we never OOM.
  const cpuLimit = Math.max(1, numCPUs - 1);            // leave 1 CPU for the primary
  const memLimit = Math.max(1, Math.floor(freeMemGB / 6)); // 6 GB per worker (conservative)

  // CLUSTER_WORKERS env var gives the operator an explicit override.
  const envOverride = process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS, 10) : null;

  const workerCount = envOverride && envOverride > 0
    ? envOverride
    : Math.min(cpuLimit, memLimit);

  const workerScript = path.join(__dirname, 'index.cjs');
  cluster.setupPrimary({ exec: workerScript });

  console.log(
    `[Cluster] Primary ${process.pid} — forking ${workerCount} workers ` +
    `(CPUs: ${numCPUs}, free RAM: ${freeMemGB.toFixed(1)} GB, limit: cpu=${cpuLimit} mem=${memLimit})`
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

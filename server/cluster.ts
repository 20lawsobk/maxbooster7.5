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
  const totalMemGB = os.totalmem() / (1024 ** 3);

  // Each worker running TF models + Express needs roughly 4 GB.
  // Cap workers by both CPU count and available RAM so we never OOM.
  const cpuLimit  = Math.max(1, numCPUs - 1);          // leave 1 CPU for the primary
  const memLimit  = Math.max(1, Math.floor(totalMemGB / 4)); // 4 GB per worker minimum

  // CLUSTER_WORKERS env var gives the operator an explicit override.
  const envOverride = process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS, 10) : null;

  const workerCount = envOverride && envOverride > 0
    ? envOverride
    : Math.min(cpuLimit, memLimit);

  const workerScript = path.join(__dirname, 'index.cjs');
  cluster.setupPrimary({ exec: workerScript });

  console.log(
    `[Cluster] Primary ${process.pid} — forking ${workerCount} workers ` +
    `(CPUs: ${numCPUs}, RAM: ${totalMemGB.toFixed(1)} GB, limit: cpu=${cpuLimit} mem=${memLimit})`
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

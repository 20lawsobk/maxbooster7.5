import cluster from 'cluster';
import os from 'os';
import path from 'path';

const DISABLE_CLUSTER = process.env.DISABLE_CLUSTER === 'true';
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

if (DISABLE_CLUSTER || !isProduction) {
  // Not in production or clustering disabled — run the app in this process directly.
  // Workers spawned by setupPrimary will always execute index.cjs directly, not this file,
  // so cluster.isWorker will never be true here.
  // Use a runtime-dynamic path so the bundler does not try to statically resolve index.cjs.
  const appEntry = path.join(__dirname, 'index.cjs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(appEntry);
} else {
  const numCPUs = os.cpus().length;
  // Reserve 1 CPU for the primary process manager; give the rest to app workers.
  const workerCount = Math.max(1, numCPUs - 1);

  // Workers execute index.cjs directly — they never run this cluster.cjs file.
  const workerScript = path.join(__dirname, 'index.cjs');
  cluster.setupPrimary({ exec: workerScript });

  console.log(`[Cluster] Primary ${process.pid} — forking ${workerCount} workers across ${numCPUs} CPUs`);

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

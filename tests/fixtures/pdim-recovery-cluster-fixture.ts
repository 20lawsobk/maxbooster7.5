import cluster from "node:cluster";
import { closeSync } from "node:fs";
import http from "node:http";
import {
  handlePdimRecoveryAuthorityRequest,
  initializePdimRecoveryAuthority,
  pdimRecoveryBackupService,
  type PublicPdimRecoveryJob,
} from "../../server/services/backup/pdimRecoveryBackupService.ts";
import {
  isLocalPdimServerOwnedByThisProcess,
  openConsistentLocalPdimSnapshot,
  startLocalPdimServer,
} from "../../server/lib/localPdimServer.ts";

const ports = (process.env.RECOVERY_FIXTURE_PORTS ?? "")
  .split(",")
  .map(Number);

if (cluster.isPrimary) {
  await startLocalPdimServer();
  if (!isLocalPdimServerOwnedByThisProcess()) {
    throw new Error("fixture primary did not own local PDIM");
  }
  const { hybridStorageService } = await import(
    "../../server/services/hybridStorageService.ts"
  );
  await hybridStorageService.upload(
    "cluster-simulation-owner",
    "authority.bin",
    Buffer.from("cluster primary recovery authority fixture\n"),
    "application/octet-stream",
  );
  initializePdimRecoveryAuthority(
    process.env.PDIM_RECOVERY_JOB_STORE_PATH,
    async (job: PublicPdimRecoveryJob) => {
      const descriptor = openConsistentLocalPdimSnapshot();
      closeSync(descriptor.fd);
      await new Promise(resolve => setTimeout(resolve, 500));
      job.state = "complete";
      job.completedAt = new Date().toISOString();
      job.receipt = {
        prefix: "simulated-cluster-generation",
        snapshotGeneration: "701",
        manifestGeneration: "702",
        snapshotBytes: descriptor.bytes,
        snapshotSha256: "a".repeat(64),
        fileCount: 1,
        ownerCount: 1,
        physicalFileCount: 1,
        chunkCount: 1,
        generationBoundReadback: true,
        isolatedRestoreVerified: true,
        retention: "retained-until-explicit-delete",
        fixedDurationLocked: false,
      };
    },
  );

  const envBySlot = new Map<number, Record<string, string>>();
  let shuttingDown = false;
  const forkSlot = (slot: number) => {
    const env = {
      CLUSTER_WORKER_ID: String(slot),
      RECOVERY_FIXTURE_PORT: String(ports[slot]),
    };
    const worker = cluster.fork(env);
    envBySlot.set(worker.id, env);
  };
  forkSlot(0);
  forkSlot(1);
  let listening = 0;
  cluster.on("listening", () => {
    listening++;
    if (listening === 2) {
      process.stdout.write(`RECOVERY_CLUSTER_READY ${ports.join(",")}\n`);
    } else if (listening > 2) {
      process.stdout.write("RECOVERY_CLUSTER_REPLACEMENT_READY\n");
    }
  });
  cluster.on("message", (worker, message: unknown) => {
    void handlePdimRecoveryAuthorityRequest(message).then(response => {
      if (response && worker.isConnected()) worker.send(response);
    });
  });
  cluster.on("exit", worker => {
    const env = envBySlot.get(worker.id);
    envBySlot.delete(worker.id);
    if (!env || shuttingDown) return;
    const replacement = cluster.fork(env);
    envBySlot.set(replacement.id, env);
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
    for (const worker of Object.values(cluster.workers ?? {})) {
      worker?.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 50).unref();
  });
} else {
  const port = Number(process.env.RECOVERY_FIXTURE_PORT);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/create") {
        const job = await pdimRecoveryBackupService.start();
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ job }));
        return;
      }
      if (req.method === "POST" && req.url === "/exit") {
        res.writeHead(202).end();
        setImmediate(() => process.exit(0));
        return;
      }
      const match = req.url?.match(/^\/jobs\/([0-9a-f-]{36})$/i);
      if (req.method === "GET" && match) {
        const job = await pdimRecoveryBackupService.get(match[1]);
        res.writeHead(job ? 200 : 404, {
          "content-type": "application/json",
        });
        res.end(JSON.stringify({ job }));
        return;
      }
      res.writeHead(404).end();
    } catch (error) {
      const conflict =
        error instanceof Error &&
        error.message === "A PDIM recovery backup is already running";
      res.writeHead(conflict ? 409 : 500, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ error: conflict ? "conflict" : "failed" }));
    }
  });
  server.listen(port, "127.0.0.1");
}
// @ts-nocheck
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  openConsistentLocalPdimSnapshot,
  type LocalPdimSnapshotDescriptor,
} from "../../lib/localPdimServer.js";
import {
  createRecoveryStorage,
  retainAndReadBackPdimSnapshot,
  verifyManagedPrivateStorage,
} from "../../../scripts/recovery-private-store.mjs";

type VerificationEvidence = {
  fileCount: number;
  ownerCount: number;
  physicalFileCount: number;
  pocketEntryCount: number;
  chunkCount: number;
  fileContentEvidenceSha256: string;
  ownershipCountsSha256: string;
  everyFileReadByActualClasses: true;
};

type PublicJob = {
  id: string;
  state: "queued" | "running" | "complete" | "blocked";
  createdAt: string;
  completedAt: string | null;
  receipt?: {
    prefix: string;
    snapshotGeneration: string;
    manifestGeneration: string;
    snapshotBytes: number;
    snapshotSha256: string;
    fileCount: number;
    ownerCount: number;
    physicalFileCount: number;
    chunkCount: number;
    generationBoundReadback: true;
    isolatedRestoreVerified: true;
    retention: "retained-until-explicit-delete";
    fixedDurationLocked: false;
  };
  blocker?: string;
  retainedUnverified?: {
    prefix: string;
    snapshotGeneration?: string;
    intentionallyNotDeleted: true;
  };
};

const jobs = new Map<string, PublicJob>();
let activeJobId: string | null = null;

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((accept, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", accept));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((accept, reject) =>
    server.close(error => error ? reject(error) : accept()));
  if (!port) throw new Error("Could not allocate isolated PDIM recovery port");
  return port;
};

async function runActualClassVerifier(root: string): Promise<VerificationEvidence> {
  const workspace = resolve(".");
  const production = process.env.NODE_ENV === "production";
  const worker = production
    ? join(workspace, "dist/retained-pdim-recovery-worker.mjs")
    : join(workspace, "scripts/retained-pdim-recovery-worker.ts");
  const workerArgs = production
    ? [worker]
    : ["--import", join(workspace, "node_modules/tsx/dist/loader.mjs"), worker];
  const port = await freePort();
  const child = spawn(process.execPath, [
    "--max-old-space-size=192", ...workerArgs,
  ], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: "/tmp",
      NODE_ENV: "test",
      LOCAL_PDIM_PORT: String(port),
      PDIM_EXEC_URL: `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.on("data", chunk => {
    if (stdout.length < 64 * 1024) stdout += chunk;
  });
  await new Promise<void>((accept, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Isolated PDIM verification exceeded its bounded runtime"));
    }, 120_000);
    child.once("close", code => {
      clearTimeout(timeout);
      code === 0
        ? accept()
        : reject(new Error("Isolated actual-class verifier rejected the PDIM snapshot"));
    });
  });
  const line = stdout.split("\n").find(value =>
    value.startsWith("RETAINED_PDIM_RESULT "));
  if (!line) throw new Error("Isolated PDIM verifier returned no receipt");
  return JSON.parse(line.slice("RETAINED_PDIM_RESULT ".length));
}

export function assertMatchingPdimRecoveryEvidence(
  source: VerificationEvidence,
  restored: VerificationEvidence,
): void {
  const fields: Array<keyof VerificationEvidence> = [
    "fileCount",
    "ownerCount",
    "physicalFileCount",
    "pocketEntryCount",
    "chunkCount",
    "fileContentEvidenceSha256",
    "ownershipCountsSha256",
    "everyFileReadByActualClasses",
  ];
  if (fields.some(field => source[field] !== restored[field])) {
    throw new Error("Isolated retained PDIM restore evidence mismatch");
  }
}

async function copyPinnedSnapshot(
  descriptor: LocalPdimSnapshotDescriptor,
  destination: string,
): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  const source = createReadStream("", {
    fd: descriptor.fd,
    autoClose: true,
    highWaterMark: 64 * 1024,
  });
  await pipeline(
    source,
    new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
  await chmod(destination, 0o600);
  if (bytes !== descriptor.bytes) {
    throw new Error("Pinned PDIM snapshot size changed during private capture");
  }
  return { bytes, sha256: hash.digest("hex") };
}

function implementationIdentity(): { revision: string; currentHash: string } {
  const currentHash = createHash("sha256")
    .update("retained-pdim-operator-v1\0")
    .update(openConsistentLocalPdimSnapshot.toString())
    .update("\0")
    .update(runActualClassVerifier.toString())
    .digest("hex");
  return { revision: currentHash.slice(0, 40), currentHash };
}

async function execute(job: PublicJob): Promise<void> {
  job.state = "running";
  let scratch: string | null = null;
  let retainedReceipt: { prefix: string; snapshotGeneration: string } | null = null;
  let stage = "private-scratch-initialization";
  try {
    scratch = await mkdtemp("/tmp/pdim-operator-recovery-");
    await chmod(scratch, 0o700);
    const snapshotPath = join(scratch, "local-pdim-store.json");
    const readbackPath = join(scratch, "generation-readback.json");
    const sourceRoot = join(scratch, "source-verification");
    const restoreRoot = join(scratch, "retained-restore");
    stage = "authoritative-source-attestation-and-capture";
    const descriptor = openConsistentLocalPdimSnapshot();
    const snapshot = await copyPinnedSnapshot(descriptor, snapshotPath);

    stage = "captured-source-actual-class-verification";
    await mkdir(join(sourceRoot, "data"), { recursive: true, mode: 0o700 });
    await pipeline(
      createReadStream(snapshotPath, { highWaterMark: 64 * 1024 }),
      createWriteStream(join(sourceRoot, "data/local-pdim-store.json"), {
        flags: "wx",
        mode: 0o600,
      }),
    );
    const sourceEvidence = await runActualClassVerifier(sourceRoot);

    const bucketId = process.env.DATABASE_RECOVERY_BUCKET_ID;
    if (!bucketId) throw new Error("Private PDIM recovery bucket is not configured");
    stage = "private-storage-contract-verification";
    const storage = await createRecoveryStorage({ bucketId });
    const storageContract = await verifyManagedPrivateStorage({
      bucket: storage.bucket,
      bucketId: storage.bucketId,
    });
    const identity = implementationIdentity();
    stage = "create-only-retention-and-generation-readback";
    const retained = await retainAndReadBackPdimSnapshot({
      bucket: storage.bucket,
      snapshotPath,
      readbackPath,
      snapshotSha256: snapshot.sha256,
      sourceRevision: identity.revision,
      currentSourceHash: identity.currentHash,
      snapshotEvidence: sourceEvidence,
    });
    retainedReceipt = {
      prefix: retained.prefix,
      snapshotGeneration: retained.snapshotObject.generation,
    };

    stage = "isolated-retained-generation-restore-verification";
    await mkdir(join(restoreRoot, "data"), { recursive: true, mode: 0o700 });
    await pipeline(
      createReadStream(readbackPath, { highWaterMark: 64 * 1024 }),
      createWriteStream(join(restoreRoot, "data/local-pdim-store.json"), {
        flags: "wx",
        mode: 0o600,
      }),
    );
    const restoredEvidence = await runActualClassVerifier(restoreRoot);
    assertMatchingPdimRecoveryEvidence(sourceEvidence, restoredEvidence);
    job.receipt = {
      prefix: retained.prefix,
      snapshotGeneration: retained.snapshotObject.generation,
      manifestGeneration: retained.manifestObject.generation,
      snapshotBytes: retained.readback.bytes,
      snapshotSha256: retained.readback.sha256,
      fileCount: restoredEvidence.fileCount,
      ownerCount: restoredEvidence.ownerCount,
      physicalFileCount: restoredEvidence.physicalFileCount,
      chunkCount: restoredEvidence.chunkCount,
      generationBoundReadback: true,
      isolatedRestoreVerified: true,
      retention: storageContract.retention,
      fixedDurationLocked: storageContract.fixedDurationLocked,
    };
    job.state = "complete";
  } catch (error) {
    if (error && typeof error === "object" && error.retainedArtifacts) {
      job.retainedUnverified = {
        prefix: error.retainedArtifacts.prefix,
        snapshotGeneration: error.retainedArtifacts.snapshotObject?.generation,
        intentionallyNotDeleted: true,
      };
    } else if (retainedReceipt) {
      job.retainedUnverified = {
        prefix: retainedReceipt.prefix,
        snapshotGeneration: retainedReceipt.snapshotGeneration,
        intentionallyNotDeleted: true,
      };
    }
    job.blocker = `PDIM recovery job blocked during ${stage}`;
    job.state = "blocked";
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => {});
    job.completedAt = new Date().toISOString();
    activeJobId = null;
  }
}

export const pdimRecoveryBackupService = {
  start(): PublicJob {
    if (activeJobId) throw new Error("A PDIM recovery backup is already running");
    const job: PublicJob = {
      id: randomUUID(),
      state: "queued",
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    activeJobId = job.id;
    jobs.set(job.id, job);
    while (jobs.size > 50) jobs.delete(jobs.keys().next().value);
    setImmediate(() => void execute(job));
    return structuredClone(job);
  },
  get(id: string): PublicJob | null {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const job = jobs.get(id);
    return job ? structuredClone(job) : null;
  },
};
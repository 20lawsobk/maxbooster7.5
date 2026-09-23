#!/usr/bin/env node
// Captures only the stopped local PDIM persistence file. It never starts the
// application, contacts a database, or writes to the live source.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(workspace, "data/local-pdim-store.json");
const reportDirectory = join(workspace, "reports/readiness-implementation");
const jsonPath = join(reportDirectory, "retained-pdim-recovery-drill.json");
const markdownPath = join(reportDirectory, "retained-pdim-recovery-drill.md");
const workerPath = join(workspace, "scripts/retained-pdim-recovery-worker.ts");
const tsxLoader = join(workspace, "node_modules/tsx/dist/loader.mjs");
const command =
  'env -i PATH="$PATH" HOME=/tmp DATABASE_RECOVERY_BUCKET_ID="$DATABASE_RECOVERY_BUCKET_ID" node --max-old-space-size=192 scripts/retained-pdim-recovery-drill.mjs';
const bucketId = process.env.DATABASE_RECOVERY_BUCKET_ID;
const inherited = { PATH: process.env.PATH ?? "", HOME: "/tmp" };
for (const key of Object.keys(process.env)) delete process.env[key];
process.env.PATH = inherited.PATH;
process.env.HOME = inherited.HOME;
process.env.TZ = "UTC";

const scratch = await mkdtemp("/tmp/retained-pdim-recovery-");
await chmod(scratch, 0o700);
const capturedPath = join(scratch, "local-pdim-store.json");
const readbackPath = join(scratch, "retained-readback.json");
const restoreRoot = join(scratch, "isolated-restore");
const restoredPath = join(restoreRoot, "data/local-pdim-store.json");
const result = {
  reportVersion: 1,
  status: "blocked",
  command,
  scope: "actual stopped local PDIM persistence",
  durableBackupCreated: false,
  captureComplete: false,
  safety: {
    liveSourceWrites: false,
    applicationStarted: false,
    databaseOrSharedProviderCalls: false,
    backupStoreCalls: false,
    scratchDirectoryMode: "0700",
    scratchFileMode: "0600",
    productionRestoreOverwrite: false,
    scratchRemoved: false,
  },
  evidence: {},
  checks: [],
  blockers: [],
};

const check = (name, detail) => result.checks.push({ name, status: "pass", detail });
const containsHybridOwnershipKey = async path => {
  const needle = Buffer.from('"hybrid:storage:index"');
  let carry = Buffer.alloc(0);
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const window = Buffer.concat([carry, chunk]);
    if (window.includes(needle)) return true;
    carry = window.subarray(Math.max(0, window.length - needle.length + 1));
  }
  return false;
};
const freePort = async () => {
  const server = createServer();
  await new Promise((accept, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", accept));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((accept, reject) =>
    server.close(error => error ? reject(error) : accept()));
  if (!port) throw new Error("Could not allocate isolated PDIM verification port");
  return port;
};
const verifyActualClasses = async root => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    "--max-old-space-size=192", "--import", tsxLoader, workerPath,
  ], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      LOCAL_PDIM_PORT: String(port),
      PDIM_EXEC_URL: `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  const outcome = await new Promise((accept, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("isolated PDIM verifier timed out"));
    }, 120_000);
    child.once("close", code => {
      clearTimeout(timeout);
      code === 0 ? accept(code) : reject(new Error("isolated PDIM verifier rejected the snapshot"));
    });
  });
  void outcome;
  const line = stdout.split("\n").find(value => value.startsWith("RETAINED_PDIM_RESULT "));
  if (!line) throw new Error("isolated PDIM verifier returned no evidence");
  return JSON.parse(line.slice("RETAINED_PDIM_RESULT ".length));
};
const recoverySource = () => {
  const files = [
    "scripts/retained-pdim-recovery-drill.mjs",
    "scripts/retained-pdim-recovery-worker.ts",
    "scripts/recovery-private-store.mjs",
    "server/lib/localPdimServer.ts",
    "server/services/hybridStorageService.ts",
    "server/pocket-dimension/index.ts",
  ];
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(
    spawnSync("cat", [file], { cwd: workspace }).stdout).update("\0");
  const revision = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: workspace, encoding: "utf8", timeout: 5_000,
  }).stdout?.trim();
  if (!/^[a-f0-9]{40,64}$/.test(revision)) {
    throw new Error("Could not establish recovery implementation revision");
  }
  return { revision, hash: hash.digest("hex") };
};

try {
  const sourceLink = await lstat(sourcePath);
  if (!sourceLink.isFile() || sourceLink.isSymbolicLink()) {
    throw new Error("persisted local PDIM source is missing or is not a regular file");
  }
  const handle = await open(sourcePath, "r");
  try {
    const before = await handle.stat();
    const hash = createHash("sha256");
    let bytes = 0;
    await pipeline(
      handle.createReadStream({ highWaterMark: 64 * 1024, autoClose: false }),
      new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk);
          bytes += chunk.length;
          callback(null, chunk);
        },
      }),
      createWriteStream(capturedPath, { flags: "wx", mode: 0o600 }),
    );
    const after = await handle.stat();
    const pathAfter = await stat(sourcePath);
    if (
      before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      after.dev !== pathAfter.dev || after.ino !== pathAfter.ino ||
      after.size !== bytes
    ) {
      throw new Error("persisted local PDIM source changed during capture");
    }
    await chmod(capturedPath, 0o600);
    result.captureComplete = true;
    result.evidence.capture = {
      bytes,
      sha256: hash.digest("hex"),
      sourceStableAcrossCapture: true,
      exactFileIncludesAllPersistedKeysChunksAndIndexes: true,
    };
    check("stopped source captured without mutation", `${bytes} bytes captured with stable file identity`);
  } finally {
    await handle.close();
  }

  if (!(await containsHybridOwnershipKey(capturedPath))) {
    result.evidence.sourcePresence = {
      actualHybridContentPresent: false,
    };
    throw new Error(
      "No actual persisted HybridStorage PDIM source is present; empty or unrelated data was not uploaded and synthetic data was not fabricated",
    );
  }

  await mkdir(join(restoreRoot, "data"), { recursive: true, mode: 0o700 });
  await copyFile(capturedPath, restoredPath, constants.COPYFILE_EXCL);
  await chmod(restoredPath, 0o600);
  const sourceEvidence = await verifyActualClasses(restoreRoot);
  result.evidence.sourcePresence = {
    actualHybridContentPresent: true,
    ...sourceEvidence,
  };
  check("captured source validated through actual classes",
    `${sourceEvidence.fileCount} files and ${sourceEvidence.ownerCount} ownership groups verified`);

  if (!bucketId) throw new Error("DATABASE_RECOVERY_BUCKET_ID is not configured");
  const {
    createRecoveryStorage,
    verifyManagedPrivateStorage,
    retainAndReadBackPdimSnapshot,
  } = await import("./recovery-private-store.mjs");
  const storage = await createRecoveryStorage({ bucketId });
  result.safety.backupStoreCalls = true;
  const storageContract = await verifyManagedPrivateStorage({
    bucket: storage.bucket,
    bucketId: storage.bucketId,
  });
  const sourceCode = recoverySource();
  const retained = await retainAndReadBackPdimSnapshot({
    bucket: storage.bucket,
    snapshotPath: capturedPath,
    readbackPath,
    snapshotSha256: result.evidence.capture.sha256,
    sourceRevision: sourceCode.revision,
    currentSourceHash: sourceCode.hash,
    snapshotEvidence: sourceEvidence,
  });
  result.durableBackupCreated = true;
  result.evidence.retained = {
    prefix: retained.prefix,
    snapshotGeneration: retained.snapshotObject.generation,
    manifestGeneration: retained.manifestObject.generation,
    snapshotCrc32c: retained.snapshotObject.crc32c,
    snapshotBytes: retained.readback.bytes,
    storageContract,
    generationBoundReadback: true,
  };
  check("private create-only retained generation read back",
    `${retained.readback.bytes} bytes matched CRC32C, SHA-256, and exact generation`);

  await rm(restoreRoot, { recursive: true, force: true });
  await mkdir(join(restoreRoot, "data"), { recursive: true, mode: 0o700 });
  await copyFile(readbackPath, restoredPath, constants.COPYFILE_EXCL);
  await chmod(restoredPath, 0o600);
  const restoredEvidence = await verifyActualClasses(restoreRoot);
  if (JSON.stringify(restoredEvidence) !== JSON.stringify(sourceEvidence)) {
    throw new Error("isolated retained restore evidence did not match captured source");
  }
  result.evidence.restore = restoredEvidence;
  check("isolated restore matched every file and ownership count",
    `${restoredEvidence.fileCount} files verified through HybridStorageService and PocketDimension`);
  result.status = "pass";
} catch (error) {
  if (error && typeof error === "object" && error.retainedArtifacts) {
    result.evidence.retainedUnverified = {
      prefix: error.retainedArtifacts.prefix,
      snapshotGeneration: error.retainedArtifacts.snapshotObject?.generation,
      intentionallyNotDeleted: true,
    };
  }
  result.blockers.push(error instanceof Error ? error.message : "unknown recovery failure");
} finally {
  await rm(scratch, { recursive: true, force: true });
  result.safety.scratchRemoved = true;
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o644 });
  const lines = [
    "# Retained PDIM recovery drill",
    "",
    `**Result: ${result.status.toUpperCase()}**`,
    `**Capture complete: ${result.captureComplete ? "YES" : "NO"}**`,
    "",
    `Exact command: \`${command}\``,
    "",
    "## Safety",
    "",
    "- The source is the stopped local `data/local-pdim-store.json`; it was opened read-only and copied in 64 KiB chunks after stable inode, size, and modification-time checks.",
    "- The application was not started. No database, Neon, shared provider, production restore, deletion, or live PDIM write was performed.",
    "- Scratch was mode 0700, files were mode 0600, and scratch was removed. Retained recovery objects, if any, are intentionally not deleted.",
    "- App Storage retention is private and retained until explicit deletion; no WORM or fixed-duration lock is claimed.",
    "",
    "## Sanitized evidence",
    "",
    ...result.checks.map(item => `- PASS: ${item.name} — ${item.detail}.`),
    ...(result.evidence.capture ? [
      `- Exact stopped snapshot: ${result.evidence.capture.bytes} bytes; SHA-256 \`${result.evidence.capture.sha256}\`.`,
    ] : []),
    ...(result.evidence.sourcePresence ? [
      `- Actual persisted hybrid content present: ${result.evidence.sourcePresence.actualHybridContentPresent ? "yes" : "no"}.`,
    ] : []),
    ...(result.evidence.restore ? [
      `- Actual-class isolated restore: ${result.evidence.restore.fileCount} files, ${result.evidence.restore.ownerCount} ownership groups, ${result.evidence.restore.chunkCount} chunks; every content hash matched.`,
      "- File keys, owner identifiers, content, and per-file hashes are intentionally absent from this report.",
    ] : []),
    ...(result.evidence.retained ? [
      `- Private retained prefix: ${result.evidence.retained.prefix}; snapshot generation: ${result.evidence.retained.snapshotGeneration}; manifest generation: ${result.evidence.retained.manifestGeneration}.`,
      "- Create-only upload and immutable-generation download matched CRC32C, SHA-256, and size.",
    ] : []),
    ...(result.blockers.length ? ["", "## Blocker", "", ...result.blockers.map(value => `- ${value}`)] : []),
    "",
  ];
  await writeFile(markdownPath, lines.join("\n"), { mode: 0o644 });
}

if (result.status !== "pass") process.exitCode = 1;
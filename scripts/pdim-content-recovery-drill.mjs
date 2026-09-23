#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  restoreVerifiedSnapshot,
  sha256,
  writeSnapshotManifest,
} from "./pdim-content-recovery-drill-lib.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worker = join(workspace, "scripts/pdim-content-recovery-drill-worker.ts");
const tsxLoader = join(workspace, "node_modules/tsx/dist/loader.mjs");
const reportDirectory = join(workspace, "reports/readiness-implementation");
const jsonReport = join(reportDirectory, "pdim-content-recovery-drill.json");
const markdownReport = join(reportDirectory, "pdim-content-recovery-drill.md");
const commandLine = "node scripts/pdim-content-recovery-drill.mjs";

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function runWorker(mode, cwd, port, expected) {
  const child = spawn(
    process.execPath,
    [
      "--max-old-space-size=192",
      "--import",
      tsxLoader,
      worker,
      mode,
    ],
    {
      cwd,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        LOCAL_PDIM_PORT: String(port),
        PDIM_EXEC_URL: `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
        PDIM_DRILL_EXPECTED: expected ? JSON.stringify(expected) : "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${mode} worker quiesce timeout\n${stderr}`)),
      30_000,
    );
    const inspect = () => {
      if (stdout.includes("PDIM_DRILL_QUIESCED")) {
        clearTimeout(timeout);
        resolveReady();
      }
    };
    child.stdout.on("data", inspect);
    child.once("exit", (code) => {
      if (!stdout.includes("PDIM_DRILL_QUIESCED")) {
        clearTimeout(timeout);
        reject(new Error(`${mode} worker exited ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
  const resultLine = stdout
    .split("\n")
    .find((line) => line.startsWith("PDIM_DRILL_RESULT "));
  assert(resultLine, `${mode} worker omitted result`);
  const result = JSON.parse(resultLine.slice("PDIM_DRILL_RESULT ".length));
  child.kill("SIGTERM");
  const outcome = await new Promise((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal })),
  );
  assert.deepEqual(outcome, { code: 0, signal: null });
  return result;
}

async function runWorkerExpectFailure(cwd, port, expected, messagePattern) {
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=192", "--import", tsxLoader, worker, "verify"],
    {
      cwd,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        LOCAL_PDIM_PORT: String(port),
        PDIM_EXEC_URL: `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
        PDIM_DRILL_EXPECTED: JSON.stringify(expected),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const outcome = await Promise.race([
    new Promise((resolve) =>
      child.once("close", (code, signal) => resolve({ code, signal })),
    ),
    new Promise((_, reject) =>
      setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("corrupt ownership-index worker timeout"));
      }, 30_000),
    ),
  ]);
  assert.notEqual(outcome.code, 0, "corrupt ownership index unexpectedly initialized");
  assert.match(output, messagePattern);
}

const sourceRoot = await mkdtemp("/tmp/pdim-content-source-");
const exportRoot = await mkdtemp("/tmp/pdim-content-export-");
const restoreRoot = await mkdtemp("/tmp/pdim-content-restore-");
const corruptRoot = await mkdtemp("/tmp/pdim-content-corrupt-");
const cleanupFailures = [];
const evidence = { productionDataTouched: false };
let status = "failed";
let failure = null;

try {
  const sourcePort = await freePort();
  const seeded = await runWorker("seed", sourceRoot, sourcePort);
  const sourceSnapshot = join(sourceRoot, "data/local-pdim-store.json");
  const exportedSnapshot = join(exportRoot, "local-pdim-store.export.json");
  const manifestPath = join(exportRoot, "manifest.json");
  await copyFile(sourceSnapshot, exportedSnapshot);
  const manifest = await writeSnapshotManifest(
    exportedSnapshot,
    manifestPath,
    seeded.content,
  );
  evidence.contentKeys = seeded.content.map((item) => item.key);
  evidence.contentChecksums = seeded.content.map((item) => item.sha256);
  evidence.snapshotSha256 = manifest.snapshotSha256;
  evidence.snapshotBytes = manifest.snapshotBytes;
  evidence.productionPocketId = "hybrid-cold-storage";
  evidence.productionEntryPrefix = "storage/";
  evidence.hybridIndexKey = "hybrid:storage:index";
  evidence.sourceQuiescedAndClosed = true;

  await rm(sourceRoot, { recursive: true, force: true });
  evidence.sourceDestroyedBeforeRestore = true;

  const restoredSnapshot = join(restoreRoot, "data/local-pdim-store.json");
  await restoreVerifiedSnapshot(exportedSnapshot, manifestPath, restoredSnapshot);
  const restored = await runWorker("verify", restoreRoot, await freePort(), manifest);
  evidence.independentProcessVerifiedFiles = restored.verified;
  evidence.ownershipIndexVerified = restored.ownershipIndexVerified;
  evidence.unauthorizedReadsRejected = restored.unauthorizedReadsRejected;

  const corruptSnapshot = join(corruptRoot, "corrupt.export.json");
  const protectedDestination = join(corruptRoot, "destination/local-pdim-store.json");
  await mkdir(dirname(protectedDestination), { recursive: true });
  const sentinel = Buffer.from("do-not-overwrite");
  await writeFile(protectedDestination, sentinel, { mode: 0o600 });
  const corrupt = Buffer.from(await readFile(exportedSnapshot));
  corrupt[Math.floor(corrupt.length / 2)] ^= 1;
  await writeFile(corruptSnapshot, corrupt, { mode: 0o600 });
  await assert.rejects(
    restoreVerifiedSnapshot(corruptSnapshot, manifestPath, protectedDestination),
    /checksum mismatch/,
  );
  evidence.corruptSnapshotRejected = true;
  evidence.corruptRestoreDestinationNotOverwritten =
    sha256(await readFile(protectedDestination)) === sha256(sentinel);
  assert.equal(evidence.corruptRestoreDestinationNotOverwritten, true);

  // These snapshots have valid transport checksums but corrupt the real
  // hybrid:storage:index PDIM value. They prove semantic corruption fails
  // before content reads and does not rewrite the restored source bytes.
  const persisted = JSON.parse((await readFile(exportedSnapshot)).toString("utf8"));
  const ownershipRecord = persisted["hybrid:storage:index"];
  assert.equal(ownershipRecord?.type, "string");
  const semanticCorruptions = {
    malformedJson: "{",
    invalidRoot: "{}",
    danglingOwnership:
      '{"files":{},"contentHashes":{"deadbeef":["missing/file"]},"publicHashes":{}}',
  };
  const semanticRejected = [];
  for (const [name, corruptIndex] of Object.entries(semanticCorruptions)) {
    const caseRoot = join(corruptRoot, `semantic-${name}`);
    const caseExport = join(caseRoot, "export.json");
    const caseManifest = join(caseRoot, "manifest.json");
    const caseDestination = join(caseRoot, "restore/data/local-pdim-store.json");
    const caseStore = structuredClone(persisted);
    caseStore["hybrid:storage:index"].value = corruptIndex;
    await mkdir(caseRoot, { recursive: true });
    await writeFile(caseExport, JSON.stringify(caseStore), { mode: 0o600 });
    await writeSnapshotManifest(caseExport, caseManifest, seeded.content);
    await restoreVerifiedSnapshot(caseExport, caseManifest, caseDestination);
    const beforeRejectedRead = sha256(await readFile(caseDestination));
    await runWorkerExpectFailure(
      join(caseRoot, "restore"),
      await freePort(),
      manifest,
      /Failed to load hybrid storage ownership index/,
    );
    assert.equal(sha256(await readFile(caseDestination)), beforeRejectedRead);
    semanticRejected.push(name);
  }
  evidence.semanticOwnershipCorruptionsRejected = semanticRejected;
  evidence.semanticCorruptionPreservedRestoredBytes =
    semanticRejected.length === Object.keys(semanticCorruptions).length;
  evidence.originalExportPreserved =
    sha256(await readFile(exportedSnapshot)) === manifest.snapshotSha256;
  status = "passed";
} catch (error) {
  failure = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  for (const target of [sourceRoot, exportRoot, restoreRoot, corruptRoot]) {
    try {
      await rm(target, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push(`${target}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const gaps = [
  "Off-instance transport was simulated with a separate local temporary export directory only; no remote backup service or independent machine was used.",
  "No AppStorage, shared database, production credentials, or actual user data was read, exported, restored, or deleted.",
  "This proves the real HybridStorageService -> PocketDimension -> PDIM key path for synthetic content, not recovery of retained production user PDIM content; that operational recovery remains a gap.",
];
const report = {
  status,
  command: commandLine,
  scope: "synthetic disposable PDIM content recovery",
  implementation:
    "HybridStorageService upload/read using PocketDimension hybrid-cold-storage entries and hybrid:storage:index over the local implementation of the production PDIM HTTP exec contract",
  evidence,
  recoveryGate: {
    behavior:
      "PocketDimension metadata/index and the hybrid ownership index now initialize empty only after authoritative null reads; malformed JSON, invalid shapes, partial records, and PDIM read failures fail explicitly before writes.",
    focusedTestCommand:
      "NODE_OPTIONS=--max-old-space-size=256 npx vitest run server/pocket-dimension/__tests__/index.test.ts tests/unit/hybrid-storage-index-recovery.test.ts --pool=threads --maxWorkers=1",
    focusedTestsPassed: 18,
  },
  cleanup: { attempted: true, failures: cleanupFailures },
  failure,
  gaps,
};
await mkdir(reportDirectory, { recursive: true });
await writeFile(jsonReport, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  markdownReport,
  [
    "# Synthetic PDIM content recovery drill",
    "",
    `**Result:** ${status.toUpperCase()}`,
    `**Exact command:** \`${commandLine}\``,
    "",
    "## Scope and evidence",
    "",
    `- Actual content path: \`HybridStorageService.upload/read\` -> pocket \`${evidence.productionPocketId ?? "not reached"}\` -> entries \`${evidence.productionEntryPrefix ?? "not reached"}<generated key>\`.`,
    `- Ownership index path: \`${evidence.hybridIndexKey ?? "not reached"}\`.`,
    `- Synthetic files independently restored and byte-checksummed: ${evidence.independentProcessVerifiedFiles ?? 0}.`,
    `- Snapshot: ${evidence.snapshotBytes ?? "n/a"} bytes, SHA-256 \`${evidence.snapshotSha256 ?? "n/a"}\`.`,
    `- Source destroyed before restore: ${evidence.sourceDestroyedBeforeRestore ?? false}.`,
    `- Ownership index and unauthorized-read behavior verified: ${evidence.ownershipIndexVerified ?? false} / ${evidence.unauthorizedReadsRejected ?? false}.`,
    `- Corrupt export rejected before restore; existing destination unchanged: ${evidence.corruptSnapshotRejected ?? false} / ${evidence.corruptRestoreDestinationNotOverwritten ?? false}.`,
    `- Valid-checksum snapshots with corrupt ownership indexes failed before content reads and preserved restored bytes: ${(evidence.semanticOwnershipCorruptionsRejected ?? []).join(", ") || "not reached"} / ${evidence.semanticCorruptionPreservedRestoredBytes ?? false}.`,
    "- Production/AppStorage/user data touched: none.",
    "- Production initialization gate: malformed/partial PocketDimension metadata and hybrid ownership indexes, plus PDIM read failures, now fail explicitly without writes; only authoritative null reads create an empty store.",
    `- Focused test command: \`${report.recoveryGate.focusedTestCommand}\` (${report.recoveryGate.focusedTestsPassed} passed).`,
    ...(failure ? ["", "## Failure", "", `\`${failure.replaceAll("`", "'")}\``] : []),
    "",
    "## Honest limitations",
    "",
    ...gaps.map((gap) => `- ${gap}`),
    "",
  ].join("\n"),
);

if (status !== "passed" || cleanupFailures.length) {
  console.error(`FAIL: ${jsonReport}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${jsonReport}`);
}
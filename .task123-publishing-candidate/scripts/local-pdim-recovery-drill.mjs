#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = join(workspace, "reports/readiness-implementation");
const jsonReport = join(reportDirectory, "local-pdim-recovery-drill.json");
const markdownReport = join(reportDirectory, "local-pdim-recovery-drill.md");
const tsxLoader = join(workspace, "node_modules/tsx/dist/loader.mjs");

if (process.argv.includes("--child")) {
  const { startLocalPdimServer } = await import("../server/lib/localPdimServer.ts");
  await startLocalPdimServer();
  // Deliberately request exit 0 like the application shutdown coordinator;
  // local PDIM must override it if its final durability save failed.
  process.once("SIGTERM", () => setTimeout(() => process.exit(0), 25));
  process.stdout.write("LOCAL_PDIM_DRILL_READY\n");
} else {
  await runDrill();
}

async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => server.once("error", fail).listen(0, "127.0.0.1", ok));
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((ok, fail) => server.close((err) => err ? fail(err) : ok()));
  return port;
}

function startChild(cwd, port) {
  const child = spawn(
    process.execPath,
    ["--import", tsxLoader, fileURLToPath(import.meta.url), "--child"],
    {
      cwd,
      env: {
        NODE_ENV: "test",
        LOCAL_PDIM_PORT: String(port),
        PORT: String(port + 1),
        VIDEO_DIFFUSION_PORT: String(port + 2),
        MAXCORE_LOCAL_PORT: String(port + 3),
        BOOSTERSTATE_SIDECAR_PORT: String(port + 4),
        MODEL_API_PORT: String(port + 5),
        MODEL_API_HEALTH_PORT: String(port + 6),
        PYTHON_AI_PORT: String(port + 7),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolveClose) => child.once("close", (code, signal) => resolveClose({ code, signal })));
  const ready = new Promise((resolveReady, rejectReady) => {
    const deadline = setTimeout(() => rejectReady(new Error("child readiness timeout")), 10_000);
    const inspect = () => {
      if (stdout.includes("LOCAL_PDIM_DRILL_READY")) {
        clearTimeout(deadline);
        resolveReady();
      }
    };
    child.stdout.on("data", inspect);
    child.once("exit", (code) => {
      if (!stdout.includes("LOCAL_PDIM_DRILL_READY")) {
        clearTimeout(deadline);
        rejectReady(new Error(`child exited before readiness (code ${code})`));
      }
    });
  });
  return { child, closed, ready, output: () => ({ stdout, stderr }) };
}

async function stopChild(proc) {
  proc.child.kill("SIGTERM");
  const outcome = await Promise.race([
    proc.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error("graceful child shutdown timeout")), 5_000)),
  ]);
  assert.equal(outcome.code, 0, `child did not shut down cleanly: ${JSON.stringify(outcome)}`);
}

async function command(port, cmd, args = []) {
  const response = await fetch(`http://127.0.0.1:${port}/api/redis/instances/local/exec`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  assert.equal(response.status, 200, `${cmd} returned HTTP ${response.status}`);
  return response.json();
}

async function seed(port) {
  assert.equal(await command(port, "SET", ["drill:string", "synthetic-string"]), "OK");
  assert.equal(await command(port, "HSET", ["drill:hash", "field", "synthetic-hash"]), 1);
  assert.equal(await command(port, "SADD", ["drill:set", "alpha", "beta"]), 2);
  assert.equal(await command(port, "RPUSH", ["drill:list", "first", "second"]), 2);
  assert.equal(await command(port, "ZADD", ["drill:zset", "7", "member"]), 1);
  assert.equal(await command(port, "XADD", ["drill:stream", "1-0", "field", "synthetic-stream"]), "1-0");
  assert.equal(await command(port, "SET", ["drill:ttl", "synthetic-ttl", "PX", "120000"]), "OK");
}

async function verify(port) {
  assert.equal(await command(port, "GET", ["drill:string"]), "synthetic-string");
  assert.deepEqual(await command(port, "HGETALL", ["drill:hash"]), { field: "synthetic-hash" });
  assert.deepEqual((await command(port, "SMEMBERS", ["drill:set"])).sort(), ["alpha", "beta"]);
  assert.deepEqual(await command(port, "LRANGE", ["drill:list", "0", "-1"]), ["first", "second"]);
  assert.deepEqual(await command(port, "ZRANGE", ["drill:zset", "0", "-1", "WITHSCORES"]), ["member", "7"]);
  assert.deepEqual(await command(port, "XRANGE", ["drill:stream", "-", "+"]), [["1-0", ["field", "synthetic-stream"]]]);
  assert.equal(await command(port, "GET", ["drill:ttl"]), "synthetic-ttl");
  const ttl = await command(port, "PTTL", ["drill:ttl"]);
  assert(ttl > 0 && ttl <= 120_000, `TTL was not preserved: ${ttl}`);
  return ttl;
}

async function runDrill() {
  const commandLine = "node scripts/local-pdim-recovery-drill.mjs";
  const sourceRoot = await mkdtemp("/tmp/local-pdim-drill-source-");
  const exportRoot = await mkdtemp("/tmp/local-pdim-drill-export-");
  const failedSaveRoot = await mkdtemp("/tmp/local-pdim-drill-failed-save-");
  const backingDirectory = join(sourceRoot, "data");
  const backingFile = join(backingDirectory, "local-pdim-store.json");
  const exportedFile = join(exportRoot, "local-pdim-store.export.json");
  const cleanupFailures = [];
  const evidence = {};
  let status = "failed";
  let failure = null;
  try {
    const port = await freePort();
    evidence.disposablePort = port;
    evidence.productionDataTouched = false;

    const first = startChild(sourceRoot, port);
    await first.ready;
    await seed(port);
    evidence.beforeShutdownTtlMs = await verify(port);
    await stopChild(first);

    const bytes = await readFile(backingFile);
    await writeFile(exportedFile, bytes, { mode: 0o600 });
    evidence.exportSha256 = createHash("sha256").update(bytes).digest("hex");
    evidence.exportLocationWasSeparate = dirname(exportedFile) !== backingDirectory;

    const restarted = startChild(sourceRoot, port);
    await restarted.ready;
    evidence.afterNewProcessTtlMs = await verify(port);
    await stopChild(restarted);

    await rm(backingDirectory, { recursive: true, force: true });
    evidence.originalBackingDirectoryDeleted = true;
    await mkdir(backingDirectory, { recursive: true });
    await writeFile(backingFile, await readFile(exportedFile), { mode: 0o600 });

    const restored = startChild(sourceRoot, port);
    await restored.ready;
    evidence.afterRestoreTtlMs = await verify(port);
    await stopChild(restored);

    const corruptShapes = {
      malformedJson: "{ definitely-not-valid-json",
      nonObjectRoot: "[]",
      unknownType: '{"key":{"type":"unknown","value":"x"}}',
      missingValue: '{"key":{"type":"string"}}',
      unexpectedEntryField: '{"key":{"type":"string","value":"x","extra":true}}',
      invalidString: '{"key":{"type":"string","value":4}}',
      invalidHash: '{"key":{"type":"hash","value":{"field":4}}}',
      invalidSet: '{"key":{"type":"set","value":["ok",4]}}',
      invalidList: '{"key":{"type":"list","value":["ok",4]}}',
      invalidZsetMember: '{"key":{"type":"zset","value":[{"member":4,"score":1}]}}',
      nullZsetScore: '{"key":{"type":"zset","value":[{"member":"m","score":null}]}}',
      nonFiniteZsetScore: '{"key":{"type":"zset","value":[{"member":"m","score":1e999}]}}',
      unexpectedZsetField: '{"key":{"type":"zset","value":[{"member":"m","score":1,"extra":true}]}}',
      invalidStreamId: '{"key":{"type":"stream","value":[{"id":4,"fields":{"field":"v"}}]}}',
      invalidStreamFields: '{"key":{"type":"stream","value":[{"id":"1-0","fields":{"field":4}}]}}',
      unexpectedStreamField: '{"key":{"type":"stream","value":[{"id":"1-0","fields":{},"extra":true}]}}',
      invalidExpiry: '{"key":{"type":"string","value":"x","expiresAt":null}}',
      nonFiniteExpiry: '{"key":{"type":"string","value":"x","expiresAt":1e999}}',
    };
    const rejectedShapes = [];
    for (const [name, contents] of Object.entries(corruptShapes)) {
      await writeFile(backingFile, contents, { mode: 0o600 });
      const corrupt = startChild(sourceRoot, port);
      // These children are expected to reject readiness because startup must fail.
      corrupt.ready.catch(() => {});
      const corruptOutcome = await corrupt.closed;
      const corruptOutput = corrupt.output();
      const explicit =
        corruptOutcome.code !== 0 &&
        /Failed to load local PDIM persistence file/.test(corruptOutput.stderr + corruptOutput.stdout);
      assert.equal(explicit, true, `${name} persistence did not fail explicitly`);
      rejectedShapes.push(name);
    }
    evidence.corruptShapesRejected = rejectedShapes;
    evidence.corruptFileFailedExplicitly =
      rejectedShapes.length === Object.keys(corruptShapes).length;

    // Make ./data a file so the final save cannot create its backing directory.
    // The clean-shutdown handler must surface that durability failure via exit 1.
    await writeFile(join(failedSaveRoot, "data"), "synthetic obstruction", { mode: 0o600 });
    const failedSave = startChild(failedSaveRoot, port);
    await failedSave.ready;
    failedSave.child.kill("SIGTERM");
    const failedSaveOutcome = await failedSave.closed;
    const failedSaveOutput = failedSave.output();
    evidence.failedFinalSaveExitCode = failedSaveOutcome.code;
    evidence.failedFinalSaveSurfaced =
      failedSaveOutcome.code === 1 &&
      /Failed to persist store/.test(failedSaveOutput.stderr + failedSaveOutput.stdout);
    assert.equal(evidence.failedFinalSaveSurfaced, true, "failed final save was reported as successful");
    status = "passed";
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  } finally {
    for (const target of [sourceRoot, exportRoot, failedSaveRoot]) {
      try {
        await rm(target, { recursive: true, force: true });
      } catch (err) {
        cleanupFailures.push(`${target}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const report = {
    status,
    command: commandLine,
    implementation: "server/lib/localPdimServer.ts loaded in real disposable child processes",
    evidence,
    cleanup: { attempted: true, failures: cleanupFailures },
    failure,
    gaps: [
      "The exported fixture was copied to a separate temporary path on the same machine; this is not off-instance backup retention or independent disaster recovery.",
      "Directory fsync is implemented and exercised on the normal filesystem path, but this drill does not simulate sudden power loss or prove storage hardware write-cache behavior.",
      "The drill did not start the main application workflow and did not read production PDIM data or credentials.",
      "PDIM ran exclusively as the local child implementation; MaxCore was not invoked, and no remote service was contacted.",
    ],
  };
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(jsonReport, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    "# Local PDIM recovery drill",
    "",
    `**Result:** ${status.toUpperCase()}`,
    `**Exact command:** \`${commandLine}\``,
    "",
    "## Evidence",
    "",
    `- Actual implementation: ${report.implementation}.`,
    `- Disposable loopback port: ${evidence.disposablePort ?? "not reached"}.`,
    `- Representative string, hash, set, list, sorted set, stream, and expiring string were verified before shutdown, after graceful shutdown/new process, and after backing-directory deletion/export restore.`,
    `- TTL observations (ms): before shutdown ${evidence.beforeShutdownTtlMs ?? "n/a"}; new process ${evidence.afterNewProcessTtlMs ?? "n/a"}; restored copy ${evidence.afterRestoreTtlMs ?? "n/a"}.`,
    `- Export SHA-256: ${evidence.exportSha256 ?? "not reached"}. Export used a separately located temporary directory: ${evidence.exportLocationWasSeparate ?? false}.`,
    `- Original disposable backing directory deleted before restore: ${evidence.originalBackingDirectoryDeleted ?? false}.`,
    `- Corrupt snapshots failed explicitly rather than starting empty: ${evidence.corruptFileFailedExplicitly ?? false}. Rejected shapes: ${(evidence.corruptShapesRejected ?? []).join(", ") || "not reached"}.`,
    `- Failed final shutdown save surfaced as a nonzero exit: ${evidence.failedFinalSaveSurfaced ?? false} (exit ${evidence.failedFinalSaveExitCode ?? "n/a"}).`,
    `- Production data writes/deletes: none.`,
    `- Cleanup failures: ${cleanupFailures.length ? cleanupFailures.join("; ") : "none"}.`,
    ...(failure ? ["", `Failure: ${failure}`] : []),
    "",
    "## Gaps",
    "",
    ...report.gaps.map((gap) => `- ${gap}`),
    "",
  ];
  await writeFile(markdownReport, lines.join("\n"));
  if (status !== "passed" || cleanupFailures.length) process.exitCode = 1;
  else console.log(`PASS: ${jsonReport}`);
}
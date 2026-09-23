#!/usr/bin/env node
/**
 * Safe, disposable production build/start simulation.
 *
 * This runner intentionally does not use build.sh, deploy-gcp.sh, publish, or
 * any deployment API.  It creates a filtered copy below /tmp, runs the same
 * Node build and start commands used by the VM deployment there, and records
 * only a redacted result under reports/production-simulation/.
 *
 * DEPLOY_PACK=1 is used only inside the disposable copy. It is never exported
 * in, or run with, the source checkout as cwd.
 *
 * The runner is resumable by stage.  A normal invocation starts a new run;
 * `--resume copy|build|size|restore|startup` (or `--phase=<stage> --resume`)
 * reuses the durable disposable copy under .local/.  `--cleanup` is the only
 * option that removes that copy.
 */

import { createHash } from "node:crypto";
import { copyFileSync, cpSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessHeavyRun,
  assertSanitizedEnvironment,
  inspectProductionProfile,
  runtimeIsolationPolicy,
} from "./lib/productionSimulationPolicy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "reports", "production-simulation");
const durableRoot = join(root, ".local", "production-simulation");
const runsRoot = join(durableRoot, "runs");
mkdirSync(reportDir, { recursive: true });
mkdirSync(runsRoot, { recursive: true });

const statePath = join(durableRoot, "state.json");
const argv = new Set(process.argv.slice(2));
const runtimeSandboxed = argv.has("--runtime-sandbox");
const syncCurrentSmall = argv.has("--sync-current-small");
const refreshRuntimeSource = argv.has("--refresh-runtime-source");
const phaseFlag = process.argv.find((arg) => arg.startsWith("--phase="));
const requestedPhase = phaseFlag ? phaseFlag.slice("--phase=".length) : process.argv.slice(2).find((arg) => !arg.startsWith("-")) || "all";
const resumeRequested = argv.has("--resume") || requestedPhase !== "all" || argv.has("--cleanup");
let stateFromDisk = null;
if (existsSync(statePath)) {
  try { stateFromDisk = JSON.parse(readFileSync(statePath, "utf8")); } catch {}
}
const runId = argv.has("--new") || !resumeRequested || !stateFromDisk?.runId
  ? new Date().toISOString().replace(/[:.]/g, "-")
  : stateFromDisk.runId;
const workspace = stateFromDisk?.runId === runId && existsSync(stateFromDisk.workspace)
  ? stateFromDisk.workspace
  : join(runsRoot, runId);
const copyRoot = join(workspace, "app");
const copyCompleteSentinel = join(copyRoot, ".simulation-copy-complete");
const boundedBuildSentinel = join(workspace, "phased-build-complete.json");
const transientRoot = join(workspace, "transient");
const logsRoot = join(workspace, "logs");
// tsx/esbuild create Unix sockets below TMPDIR; the durable run path is too
// long for Linux's sockaddr_un limit. This is disposable process scratch,
// not resumable state.
const runtimeTmp = join("/tmp", `mb-sim-${runId.slice(-12)}`);
mkdirSync(copyRoot, { recursive: true });
mkdirSync(transientRoot, { recursive: true });
mkdirSync(logsRoot, { recursive: true });
mkdirSync(runtimeTmp, { recursive: true });

const report = {
  runId,
  workspace: `${workspace} (disposable isolated copy; remove with --cleanup)`,
  commands: {
    build: "DEPLOY_PACK=1 npm run build",
    start: "bash start.sh",
  },
  safety: {
    sourceRoot: root,
    sourceRootUsedAsBuildCwd: false,
    sourceFilesMutated: false,
    excluded: [".replit", ".git", "data", "logs", "attached_assets", "*.env secrets", "dns-node/keys"],
    networkCredentialsProvided: false,
    thirdPartyOrLiveDatabaseTargeted: false,
    runtimeIsolationPolicy,
    hostNetworkNamespace: readlinkSync("/proc/self/ns/net"),
    runtimeNetworkNamespace: null,
    runtimeIsolationEnforced: false,
    deployPackOnSourceWorkspace: false,
  },
  resourceProfile: null,
  sourceSnapshot: {
    capturedAt: null,
    note: "All build/start stages use the immutable disposable copy captured at copy stage; source edits after that point are intentionally excluded.",
  },
  nodeResolution: {
    bundledNodePresentInCopy: false,
    pathNodeProbe: null,
    startScriptEvidence: null,
  },
  copyIntegrity: { checked: [], passed: false },
  configValidation: { checked: [], passed: false },
  build: { exitCode: null, signal: null, durationMs: null, artifacts: {}, outputTail: [], nixPreflight: null },
  pythonCapability: {
    status: "not_evaluated",
    note: "The production build recreates the pinned portable Python runtime; this has not run yet.",
  },
  capsuleRestore: {
    buildCapsules: {},
    manifestValidation: [],
    historicalCompatibility: [],
    coldCriticalRestore: null,
    coldBackgroundRestore: null,
    warmIdempotentRestore: null,
  },
  imageSize: null,
  productionReadiness: {
    publishReady: false,
    reason: "Not evaluated yet; a passing run requires current-source MaxCore/PDIM capsules and namespace-isolated runtime evidence.",
  },
  startup: {
    exitCode: null,
    signal: null,
    liveness: { observed: false, transportOnly: false, realServer: false, jsonObserved: false, earlyAppResponse: false, startupResponseObserved: false, samples: [] },
    readiness: { observed: false, fullReady: false, statusCodes: [], lastBody: null, note: null },
    attempts: [],
  },
  failures: [],
  result: "NOT_RUN",
};

let startChild;
let startLogStream;
let runtimePgRoot;
let runtimePgEnv;

const priorReportPath = join(reportDir, `${runId}.json`);
if (stateFromDisk?.runId === runId && existsSync(priorReportPath)) {
  try { Object.assign(report, JSON.parse(readFileSync(priorReportPath, "utf8"))); } catch {}
}
report.capsuleRestore ||= {};
report.capsuleRestore.historicalCompatibility ||= [];
report.capsuleRestore.manifestValidation ||= [];
report.capsuleRestore.buildCapsules ||= {};
report.build.nixPreflight ||= null;
report.copyIntegrity ||= { checked: [], passed: false };
report.configValidation ||= { checked: [], passed: false };
report.sourceSnapshot ||= {
  capturedAt: null,
  note: "All build/start stages use the immutable disposable copy captured at copy stage; source edits after that point are intentionally excluded.",
};
if (stateFromDisk?.runId === runId) report.sourceSnapshot.capturedAt ||= stateFromDisk.updatedAt || null;
report.startup ||= {
  exitCode: null, signal: null,
  liveness: { observed: false, transportOnly: false, realServer: false, jsonObserved: false, startupResponseObserved: false, samples: [] },
  readiness: { observed: false, fullReady: false, statusCodes: [], lastBody: null, note: null },
};
report.startup.liveness ||= { observed: false, transportOnly: false, realServer: false, jsonObserved: false, earlyAppResponse: false, startupResponseObserved: false, samples: [] };
report.startup.liveness.jsonObserved ||= false;
report.startup.liveness.earlyAppResponse ||= false;
report.startup.liveness.startupResponseObserved ||= false;
report.startup.attempts ||= [];
report.productionReadiness ||= {
  publishReady: false,
  reason: "No publish-ready claim: external MaxCore/PDIM capsules are historical compatibility inputs and are not current-source/security evidence.",
};

function writeReportSnapshot() {
  writeFileSync(priorReportPath, JSON.stringify(report, null, 2) + "\n");
}

function persistState(stage, status = "complete") {
  const completedStages = new Set(report.completedStages || []);
  if (status === "complete") completedStages.add(stage);
  else completedStages.delete(stage);
  report.completedStages = [...completedStages];
  writeFileSync(statePath, JSON.stringify({
    runId,
    workspace,
    copyRoot,
    stage,
    status,
    updatedAt: new Date().toISOString(),
    completed: report.completedStages,
  }, null, 2) + "\n");
  writeReportSnapshot();
}

function addFailure(stage, message) {
  report.failures.push({ stage, message: String(message) });
}

function redact(text) {
  return String(text ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'\\]+/gi, "postgresql://[mock-redacted]")
    .replace(/redis:\/\/[^\s"'\\]+/gi, "redis://[mock-redacted]")
    .replace(/(?:SESSION_SECRET|TOKEN_ENCRYPTION_KEY|(?:PDIM|STORAGE)_BEARER_TOKEN)=\S+/g, "$1=[mock-redacted]")
    .replace(/\/tmp\/max-booster-production-simulation-[A-Za-z0-9_-]+/g, "/tmp/[simulation]");
}

function tail(text, count = 30) {
  return redact(text).split(/\r?\n/).filter(Boolean).slice(-count);
}

function captureClusterTopology(startLogPath, expectedWorkerCount, pdimPort) {
  const processProbe = spawnSync("ps", ["-eo", "pid=,ppid=,pgid=,args="], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (processProbe.error?.code === "ETIMEDOUT" || processProbe.status !== 0) {
    return {
      enabled: true,
      expectedWorkerCount,
      passed: false,
      error: processProbe.error?.code === "ETIMEDOUT"
        ? "bounded process-topology probe timed out"
        : `process-topology probe exited ${processProbe.status}`,
    };
  }
  const rows = processProbe.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) return [];
    const pid = Number(match[1]);
    let cwd = null;
    try { cwd = readlinkSync(`/proc/${pid}/cwd`); } catch {}
    return [{
      pid,
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      args: match[4],
      cwd,
    }];
  });
  const log = existsSync(startLogPath) ? readFileSync(startLogPath, "utf8") : "";
  const primaryPid = Number(log.match(/\[Cluster\] Primary (\d+) — forking \d+ workers/)?.[1]) || null;
  const workerPids = [...log.matchAll(/\[Cluster\] Worker (\d+) online/g)]
    .map((match) => Number(match[1]))
    .filter((pid, index, all) => all.indexOf(pid) === index)
    .slice(-expectedWorkerCount);
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const liveWorkers = workerPids.filter((pid) => byPid.get(pid)?.ppid === primaryPid);
  const maxcoreRoot = join(copyRoot, "external", "maxcore", "artifacts", "api-server");
  const maxcoreProcesses = rows.filter((row) =>
    row.cwd === maxcoreRoot || row.cwd?.startsWith(`${maxcoreRoot}/`));
  const primaryOwnedMaxcoreRoots = maxcoreProcesses.filter((row) =>
    row.ppid === primaryPid);
  const workerOwnedMaxcoreRoots = maxcoreProcesses.filter((row) =>
    workerPids.includes(row.ppid));
  const primaryAlive = primaryPid !== null && byPid.has(primaryPid);
  const workersPassed = workerPids.length === expectedWorkerCount
    && liveWorkers.length === expectedWorkerCount;
  const maxcoreOwnerPassed = primaryOwnedMaxcoreRoots.length === 1
    && workerOwnedMaxcoreRoots.length === 0;
  const pdimListenerProbe = spawnSync(
    "lsof",
    ["-nP", "-a", `-iTCP:${pdimPort}`, "-sTCP:LISTEN", "-Fp"],
    { encoding: "utf8", timeout: 10_000 },
  );
  const pdimListenerPids = pdimListenerProbe.status === 0
    ? [...pdimListenerProbe.stdout.matchAll(/^p(\d+)$/gm)]
      .map((match) => Number(match[1]))
      .filter((pid, index, all) => all.indexOf(pid) === index)
    : [];
  const pdimOwnerPassed = primaryPid !== null
    && pdimListenerPids.length === 1
    && pdimListenerPids[0] === primaryPid;
  return {
    enabled: true,
    expectedWorkerCount,
    primaryPid,
    primaryAlive,
    workerPids,
    liveWorkerPids: liveWorkers,
    workersPassed,
    maxcoreAuthority: {
      requiredOwner: "cluster-primary",
      primaryOwnedRootPids: primaryOwnedMaxcoreRoots.map((row) => row.pid),
      workerOwnedRootPids: workerOwnedMaxcoreRoots.map((row) => row.pid),
      observedProcessPids: maxcoreProcesses.map((row) => row.pid),
      passed: maxcoreOwnerPassed,
    },
    pdimAuthority: {
      requiredOwner: "cluster-primary",
      primaryPid,
      listenerPort: pdimPort,
      listenerProcessPids: pdimListenerPids,
      listenerRunsInPrimaryProcess: pdimOwnerPassed,
      probeExitCode: pdimListenerProbe.status,
      passed: pdimOwnerPassed,
    },
    passed: primaryAlive && workersPassed && maxcoreOwnerPassed && pdimOwnerPassed,
  };
}

function commandPath(command) {
  const found = spawnSync("bash", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).stdout.trim();
  return found || null;
}

function nixToolPath(packageName, command) {
  const probe = spawnSync("nix-shell", [
    "--pure",
    "-I", "nixpkgs=https://github.com/NixOS/nixpkgs/archive/650e572363c091045cdbc5b36b0f4c1f614d3058.tar.gz",
    "-p", packageName, "--run", `command -v ${command}`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 });
  return probe.status === 0 ? probe.stdout.trim() || null : null;
}

const ipPath = commandPath("ip") || nixToolPath("iproute2", "ip");

function makePath() {
  const candidates = [
    process.execPath,
    commandPath("npm"),
    commandPath("npx"),
    commandPath("zstd"),
    commandPath("tar"),
    commandPath("git"),
    commandPath("nix-shell"),
    commandPath("cargo"),
    commandPath("rustc"),
    commandPath("curl"),
    commandPath("python3"),
    commandPath("initdb"),
    commandPath("pg_ctl"),
    commandPath("psql"),
    commandPath("redis-server"),
    commandPath("redis-cli"),
    commandPath("lsof"),
    ipPath,
    commandPath("bash"),
  ];
  const dirs = new Set(["/usr/local/bin", "/usr/bin", "/bin"]);
  for (const candidate of candidates) {
    if (candidate) dirs.add(dirname(candidate));
  }
  return [...dirs].join(":");
}

const safePath = makePath();
const npmPath = commandPath("npm");
const nodePath = process.execPath;
if (!npmPath) addFailure("harness", "npm was not discoverable before entering the allowlisted environment");

function buildEnv(extra = {}) {
  const env = {
    PATH: safePath,
    HOME: join(transientRoot, "home"),
    TMPDIR: runtimeTmp,
    CI: "true",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    npm_config_cache: join(transientRoot, "npm-cache"),
    ...extra,
  };
  assertSanitizedEnvironment(Object.fromEntries(Object.entries(env).filter(([key]) =>
    !["DATABASE_URL", "SESSION_SECRET", "STORAGE_BEARER_TOKEN", "PDIM_BEARER_TOKEN"].includes(key),
  )));
  return env;
}

function runProcess(command, args, options = {}) {
  const { cwd = copyRoot, env = buildEnv(), logPath, timeoutMs = 30 * 60_000 } = options;
  return new Promise((resolveResult) => {
    const output = [];
    const out = logPath ? createWriteStream(logPath) : null;
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options.spawnOptions,
    });
    const collect = (chunk) => {
      const text = chunk.toString();
      output.push(text);
      if (out) out.write(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      out?.end();
      resolveResult({ code, signal, output: output.join("") });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      out?.end();
      resolveResult({ code: null, signal: null, output: output.join(""), error });
    });
  });
}

async function copyFilteredTree() {
  // Copy-on-write reflinks preserve symlinks/modes without reading and
  // rewriting several GiB of immutable dependency/runtime files into page
  // cache. The allowlist is assembled before cp runs, so credentials, user
  // data, VCS metadata, reports, and prior simulation state never enter the
  // disposable tree. Subsequent packed-build writes trigger filesystem COW
  // and cannot mutate the source checkout.
  const excludedTopLevel = new Set([
    ".git", ".replit", "data", "logs", "attached_assets",
    "archive-capsules", ".cache", ".local", ".auditscratch", ".audit-wal",
    "reports", "uploads", "AI enhancements", "built-in plugins dsp",
    "awareness layer", "hardware", "VST", "VST3", "artifacts",
  ]);
  const sourceEntries = readdirSync(root)
    .filter((name) =>
      !excludedTopLevel.has(name) &&
      !name.endsWith(".log") &&
      !name.endsWith(".pdim") &&
      !name.endsWith(".manifest.json") &&
      ![".env", ".env.local", ".env.development", ".env.production"].includes(name))
    .map((name) => join(root, name));
  const copy = await runProcess("cp", [
    "-a", "--reflink=auto", "--", ...sourceEntries, copyRoot,
  ], {
    cwd: root,
    env: buildEnv(),
    timeoutMs: 8 * 60_000,
  });
  if (copy.code !== 0) {
    throw new Error(`filtered reflink copy failed (${copy.code ?? copy.signal}): ${copy.output}`);
  }
  rmSync(join(copyRoot, "public/generated-content"), { recursive: true, force: true });
  rmSync(join(copyRoot, "dns-node/keys"), { recursive: true, force: true });
  const weightsDir = join(copyRoot, "external/maxcore/artifacts/ai-training-server/ai_model/weights");
  for (const name of existsSync(weightsDir) ? readdirSync(weightsDir) : []) {
    if (name.endsWith(".pt") || name === "model.corrupt") {
      rmSync(join(weightsDir, name), { force: true });
    }
  }
  // Checkpoints are gitignored runtime artifacts. Exclude every .pt file from
  // the broad source copy, then admit only the immutable manifest-bound serving
  // checkpoint so unrelated generated weights or secrets cannot hitchhike.
  const releaseManifestRelative =
    "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.release.json";
  const releaseManifest = JSON.parse(readFileSync(join(root, releaseManifestRelative), "utf8"));
  const requiredModelRelative =
    "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt";
  const releaseSourceRelative =
    "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
  if (
    releaseManifest.schemaVersion !== 1 ||
    releaseManifest.sourcePath !== releaseSourceRelative ||
    releaseManifest.sourceGitBlob !== "6c42ee77db0ed344e62b4cf86ad1353c79e818a0" ||
    releaseManifest.path !== requiredModelRelative ||
    releaseManifest.capability !== "numerical-inference" ||
    releaseManifest.qualityClaim !== "not-evaluated" ||
    !Number.isSafeInteger(releaseManifest.bytes) ||
    !/^[0-9a-f]{64}$/.test(releaseManifest.sha256 || "")
  ) {
    throw new Error("filtered copy refused an invalid model release manifest");
  }
  const sourceModel = join(root, releaseSourceRelative);
  const copiedModel = join(copyRoot, releaseSourceRelative);
  if (!existsSync(sourceModel) || statSync(sourceModel).size !== releaseManifest.bytes) {
    throw new Error("filtered copy is missing the manifest-bound immutable model source");
  }
  if (await hashFile(sourceModel) !== releaseManifest.sha256) {
    throw new Error("filtered copy source model does not match its release manifest");
  }
  mkdirSync(dirname(copiedModel), { recursive: true });
  copyFileSync(sourceModel, copiedModel);
  if (
    statSync(copiedModel).size !== releaseManifest.bytes ||
    await hashFile(copiedModel) !== releaseManifest.sha256
  ) {
    throw new Error("filtered copy model checkpoint changed during explicit copy");
  }
}

async function hashFile(path) {
  return new Promise((resolveResult, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveResult(hash.digest("hex")));
  });
}

async function freePorts(count) {
  const ports = [];
  for (let i = 0; i < count; i++) {
    const server = createServer();
    await new Promise((resolveResult, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolveResult());
    });
    ports.push(server.address().port);
    await new Promise((resolveResult) => server.close(resolveResult));
  }
  return ports;
}

async function request(url, timeoutMs = 4_000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return {
      status: response.status,
      body: await response.text(),
      setCookie: response.headers.getSetCookie?.() || [],
      cacheControl: response.headers.get("cache-control"),
    };
  } catch (error) {
    return { status: null, body: "", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function parseNixPreflight(output) {
  const match = String(output).match(
    /Pre-flight image size check:\s*([0-9.]+)\s*GiB\s*\(([0-9.]+)\s*GiB Repl payload \+\s*([0-9.]+)\s*GiB deduplicated Nix closure;\s*([0-9]+)\/([0-9]+) Nix roots accounted for/i,
  );
  return match ? {
    totalGiB: Number(match[1]),
    payloadGiB: Number(match[2]),
    nixClosureGiB: Number(match[3]),
    rootsAccounted: Number(match[4]),
    rootsDiscovered: Number(match[5]),
    scope: "sanitized simulation PATH/environment only; not a target image closure claim",
  } : null;
}

function artifactStatus(relative) {
  const full = join(copyRoot, relative);
  if (!existsSync(full)) return { present: false };
  return { present: true, bytes: statSync(full).size };
}

function stopStartProcess() {
  if (!startChild || startChild.exitCode !== null) return Promise.resolve();
  const pid = startChild.pid;
  // detached:true gives the launcher and its gateway/sidecars one process
  // group. Kill the group so a simulation cannot leak a server into the IDE.
  if (pid) {
    try { process.kill(-pid, "SIGTERM"); } catch {}
  }
  return new Promise((resolveResult) => {
    const timer = setTimeout(() => {
      if (pid) {
        try { process.kill(-pid, "SIGKILL"); } catch {}
      }
      resolveResult();
    }, 8_000);
    startChild.once("close", () => {
      clearTimeout(timer);
      resolveResult();
    });
  });
}

async function main() {
  if (refreshRuntimeSource) {
    if (
      !resumeRequested
      || stateFromDisk?.runId !== runId
      || !existsSync(copyCompleteSentinel)
      || report.build?.exitCode !== 0
      || !report.completedStages?.includes("restore")
    ) {
      throw new Error("--refresh-runtime-source requires the preserved copy from a completed canonical build and restore attempt");
    }
    const ownedProcessProbe = spawnSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
      timeout: 10_000,
    });
    if (ownedProcessProbe.error?.code === "ETIMEDOUT") {
      throw new Error("owned runtime process check exceeded the bounded 10-second timeout");
    }
    if (ownedProcessProbe.status !== 0) {
      throw new Error(`owned runtime process check failed: ${redact(ownedProcessProbe.stderr)}`);
    }
    const ownedProcesses = ownedProcessProbe.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes(copyRoot));
    if (ownedProcesses.length) {
      throw new Error(`refusing runtime-source refresh while owned run processes remain: ${ownedProcesses.map((line) => line.trim().split(/\s+/, 1)[0]).join(", ")}`);
    }
    let attemptNumber = 1;
    while (existsSync(join(reportDir, `${runId}-attempt-${attemptNumber}.json`))) {
      attemptNumber++;
    }
    const archivedReport = join(reportDir, `${runId}-attempt-${attemptNumber}.json`);
    copyFileSync(priorReportPath, archivedReport);
    const currentMarkdown = join(reportDir, `${runId}.md`);
    if (existsSync(currentMarkdown)) {
      copyFileSync(currentMarkdown, join(reportDir, `${runId}-attempt-${attemptNumber}.md`));
    }
    const attemptArchive = join(workspace, "attempt-history", `attempt-${attemptNumber}`);
    mkdirSync(attemptArchive, { recursive: true });
    if (existsSync(logsRoot)) {
      cpSync(logsRoot, join(attemptArchive, "logs"), { recursive: true });
    }
    const approvedRuntimeSourcePaths = [
      "scripts/simulate-production.mjs",
      "server/cluster.ts",
      "server/index.ts",
      "server/lib/localPdimServer.ts",
      "server/middleware/csrf.ts",
      "server/routes/backup.ts",
      "server/services/backup/pdimRecoveryBackupService.ts",
      "external/maxcore/artifacts/api-server/src/python-server.ts",
      "script/build.ts",
      "script/lib/pythonRequirements.py",
      "start.sh",
      "tests/fixtures/pdim-recovery-cluster-fixture.ts",
      "tests/unit/pdim-recovery-cluster-integration.test.ts",
      "tests/unit/pdim-recovery-operator.test.ts",
      "tests/unit/maxcore-python-launcher.test.ts",
    ];
    const synchronized = [];
    for (const relative of approvedRuntimeSourcePaths) {
      const source = join(root, relative);
      const copy = join(copyRoot, relative);
      if (!existsSync(source)) {
        throw new Error(`approved runtime-source path is missing from source: ${relative}`);
      }
      mkdirSync(dirname(copy), { recursive: true });
      copyFileSync(source, copy);
      const sourceSha256 = await hashFile(source);
      const copySha256 = await hashFile(copy);
      if (sourceSha256 !== copySha256 || statSync(source).size !== statSync(copy).size) {
        throw new Error(`approved runtime-source synchronization verification failed: ${relative}`);
      }
      synchronized.push({
        path: relative,
        bytes: statSync(copy).size,
        sha256: copySha256,
      });
    }
    const priorHistory = report.historicalAttempts || [];
    const historicalAttempt = {
      attempt: attemptNumber,
      report: archivedReport,
      logs: join(attemptArchive, "logs"),
      result: report.result,
      canonicalBuildExitCode: report.build.exitCode,
      note: "Preserved prior canonical build/runtime evidence; it predates the approved Python launcher source refresh and is not current-source acceptance.",
    };
    report.historicalAttempts = [...priorHistory, historicalAttempt];
    report.sourceSnapshot.synchronizedAt = new Date().toISOString();
    report.sourceSnapshot.synchronization = {
      mode: "explicit cluster-recovery/runtime refresh after owned runtime stopped; no recopy",
      paths: synchronized,
    };
    report.copyIntegrity.checked = [
      ...(report.copyIntegrity.checked || []).filter(
        (item) => !approvedRuntimeSourcePaths.includes(item.path),
      ),
      ...synchronized.map((item) => ({
        path: item.path,
        sourcePresent: true,
        copyPresent: true,
        sourceBytes: item.bytes,
        copyBytes: item.bytes,
        sourceSha256: item.sha256,
        copySha256: item.sha256,
      })),
    ];
    report.copyIntegrity.passed = report.copyIntegrity.checked.every(
      (item) => item.sourcePresent && item.copyPresent
        && item.sourceBytes === item.copyBytes && item.sourceSha256 === item.copySha256,
    );
    if (!report.copyIntegrity.passed) {
      throw new Error("copy integrity failed after approved runtime-source synchronization");
    }
    report.completedStages = ["copy"];
    report.failures = [];
    report.result = "NOT_RUN";
    report.build = { exitCode: null, signal: null, durationMs: null, artifacts: {}, outputTail: [], nixPreflight: null };
    report.pythonCapability = {
      status: "not_evaluated",
      note: "The refreshed production launcher and mandatory locked dependencies require a new canonical build.",
    };
    report.capsuleRestore = {
      buildCapsules: {},
      manifestValidation: [],
      historicalCompatibility: report.capsuleRestore?.historicalCompatibility || [],
      coldCriticalRestore: null,
      coldBackgroundRestore: null,
      warmIdempotentRestore: null,
    };
    report.imageSize = null;
    report.startup = {
      exitCode: null,
      signal: null,
      liveness: { observed: false, transportOnly: false, realServer: false, jsonObserved: false, earlyAppResponse: false, startupResponseObserved: false, samples: [] },
      readiness: { observed: false, fullReady: false, statusCodes: [], lastBody: null, note: null },
      attempts: [],
    };
    report.productionReadiness = {
      publishReady: false,
      reason: "Invalidated after approved runtime-source refresh; new build, restore, startup, model, and load evidence required.",
    };
    rmSync(boundedBuildSentinel, { force: true });
    persistState("copy", "complete");
  }
  if (syncCurrentSmall) {
    if (
      !resumeRequested
      || stateFromDisk?.runId !== runId
      || !existsSync(copyCompleteSentinel)
      || report.completedStages?.some((stageName) => stageName !== "copy")
    ) {
      throw new Error("--sync-current-small requires an existing copy-complete run before any later stage completed");
    }
    const approvedSmallSyncPaths = [
      "scripts/simulate-production.mjs",
      "server/cluster.ts",
      "server/index.ts",
      "server/lib/healthRegistry.ts",
      "server/services/maxcoreLocalSupervisor.ts",
      "server/startup-probes.ts",
      "tests/unit/maxcore-cluster-ownership.test.ts",
      "tests/unit/maxcore-local-supervisor.test.ts",
      "tests/unit/maxcore-readiness-gate.test.ts",
    ];
    const synchronized = [];
    for (const relative of approvedSmallSyncPaths) {
      const source = join(root, relative);
      const copy = join(copyRoot, relative);
      if (!existsSync(source)) {
        throw new Error(`approved current-source synchronization path is missing: ${relative}`);
      }
      mkdirSync(dirname(copy), { recursive: true });
      copyFileSync(source, copy);
      const sourceSha256 = await hashFile(source);
      const copySha256 = await hashFile(copy);
      if (sourceSha256 !== copySha256 || statSync(source).size !== statSync(copy).size) {
        throw new Error(`approved current-source synchronization verification failed: ${relative}`);
      }
      synchronized.push({
        path: relative,
        bytes: statSync(copy).size,
        sha256: copySha256,
      });
    }
    report.sourceSnapshot.synchronizedAt = new Date().toISOString();
    report.sourceSnapshot.synchronization = {
      mode: "explicit small-path refresh after the owned-MaxCore cluster/readiness fix; no recopy",
      paths: synchronized,
    };
    report.copyIntegrity.checked = [
      ...(report.copyIntegrity.checked || []).filter(
        (item) => !approvedSmallSyncPaths.includes(item.path),
      ),
      ...synchronized.map((item) => ({
        path: item.path,
        sourcePresent: true,
        copyPresent: true,
        sourceBytes: item.bytes,
        copyBytes: item.bytes,
        sourceSha256: item.sha256,
        copySha256: item.sha256,
      })),
    ];
    report.copyIntegrity.passed = report.copyIntegrity.checked.every(
      (item) => item.sourcePresent && item.copyPresent
        && item.sourceBytes === item.copyBytes && item.sourceSha256 === item.copySha256,
    );
    if (!report.copyIntegrity.passed) {
      throw new Error("copy integrity failed after approved current-source synchronization");
    }
  }
  const stage = async (name, fn) => {
    const recoverableBuild = name === "build"
      && report.failures?.some((failure) => failure.stage === "build" || failure.stage === "build-artifacts")
      && existsSync(join(copyRoot, "node_modules.pdim"))
      && existsSync(join(copyRoot, "app_remainder.pdim"));
    const retryableStartup = name === "startup" && requestedPhase === "startup";
    if (report.completedStages?.includes(name) && !argv.has("--force") && !recoverableBuild && !retryableStartup) return;
    persistState(name, "running");
    const failuresBefore = report.failures.length;
    await fn();
    persistState(name, report.failures.length > failuresBefore ? "failed" : "complete");
  };

  await stage("copy", async () => {
    report.resourceProfile = inspectProductionProfile(root);
    // Probe the exact unprivileged user+network namespace mechanism used by
    // the startup stage. A direct `unshare --net` requires host CAP_SYS_ADMIN
    // in this environment, while mapping root inside a disposable user
    // namespace is the kernel-supported unprivileged path. The nested network
    // namespace still confines the app and every native/Python descendant to
    // namespace-local loopback.
    const namespaceProbe = spawnSync("unshare", [
      "--user", "--map-current-user", "--keep-caps", "--net",
      "bash", "-c", `"${ipPath}" link set lo up && exec "$@"`, "namespace-probe",
      nodePath, "-e",
      "const net=require('node:net');const s=net.createServer();" +
      "s.once('error',()=>process.exit(2));" +
      "s.listen(0,'127.0.0.1',()=>s.close(()=>process.exit(0)));",
    ], {
      env: buildEnv(),
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    report.safety.networkNamespacePreflight = {
      available: namespaceProbe.status === 0,
      exitCode: namespaceProbe.status,
      signal: namespaceProbe.signal,
      error: redact(namespaceProbe.stderr || namespaceProbe.error?.message || "").slice(0, 500),
      classification: namespaceProbe.status === 0
        ? "supported unprivileged user+network namespace with namespace-local loopback"
        : "test-environment blocker; not an application defect",
    };
    const sourceBytes = report.safety.networkNamespacePreflight.available
      ? Number(spawnSync("du", ["-sb", root], { encoding: "utf8" }).stdout.trim().split(/\s+/)[0]) || 0
      : 0;
    const admission = assessHeavyRun(report.resourceProfile, sourceBytes * 2, {
      networkNamespaceAvailable: report.safety.networkNamespacePreflight.available,
    });
    report.resourceProfile.admission = admission;
    if (!admission.safe) {
      addFailure("resource-admission", admission.reasons.join("; "));
      report.result = "RESOURCE_ADMISSION_BLOCKED";
      return;
    }
    mkdirSync(join(transientRoot, "home"), { recursive: true });
    mkdirSync(join(transientRoot, "tmp"), { recursive: true });
    if (!existsSync(copyCompleteSentinel)) {
      // A tool timeout or killed tar pipeline can leave a plausible-looking
      // package.json in a partial tree. Never resume from that tree: rebuild
      // the disposable copy from scratch and mark it complete only after both
      // sides of the filtered tar pipeline have exited successfully.
      rmSync(copyRoot, { recursive: true, force: true });
      mkdirSync(copyRoot, { recursive: true });
      await copyFilteredTree();
      writeFileSync(copyCompleteSentinel, `${new Date().toISOString()}\n`, { flag: "wx" });
    }
    report.sourceSnapshot.capturedAt ||= new Date().toISOString();
    const integrityPaths = [
      "node_modules/@sentry/core/build/esm/logs/public-api.js",
      "node_modules/vite/package.json",
      "node_modules/tsx/package.json",
      "python_runtime/bin/python3.12",
      "python_runtime/lib/python3.12/site-packages/pip/_vendor/certifi/cacert.pem",
      ".dockerignore",
      "build.sh",
      "package.json",
      "script/build.ts",
      "scripts/boosterstate-toolchain.nix",
      "scripts/build-boosterstate.sh",
      "scripts/lib/productionSimulationPolicy.mjs",
      "scripts/simulate-production.mjs",
      "server/routes/distribution.ts",
      "server/services/toolostRuntimeConfig.ts",
      "external/maxcore/artifacts/ai-training-server/server.py",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.release.json",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
      "external/pdim/artifacts/api-server/src/index.ts",
      "tests/fixtures/retained-pdim-source-fixture-worker.ts",
      "tests/unit/retained-pdim-recovery-simulation.test.ts",
      "tests/unit/toolost-runtime-config.test.ts",
    ];
    report.copyIntegrity.checked = [];
    for (const relative of integrityPaths) {
      const source = join(root, relative);
      const copy = join(copyRoot, relative);
      const sourcePresent = existsSync(source);
      const copyPresent = existsSync(copy);
      report.copyIntegrity.checked.push({
        path: relative,
        sourcePresent,
        copyPresent,
        sourceBytes: sourcePresent ? statSync(source).size : null,
        copyBytes: copyPresent ? statSync(copy).size : null,
        sourceSha256: sourcePresent ? await hashFile(source) : null,
        copySha256: copyPresent ? await hashFile(copy) : null,
      });
    }
    report.copyIntegrity.passed = report.copyIntegrity.checked.every(
      (item) => item.sourcePresent && item.copyPresent
        && item.sourceBytes === item.copyBytes && item.sourceSha256 === item.copySha256,
    );
    if (!report.copyIntegrity.passed) {
      addFailure("copy-integrity", "filtered copy is missing or changed required build inputs; build was not attempted");
      report.result = "COPY_FAILED";
      return;
    }
    report.configValidation.checked = ["package.json", "start.sh", "script/build.ts", "dist/pdim-restore.mjs"].map((relative) => ({
      path: relative,
      present: existsSync(join(copyRoot, relative)),
      bytes: existsSync(join(copyRoot, relative)) ? statSync(join(copyRoot, relative)).size : null,
    }));
    report.configValidation.passed = report.configValidation.checked.every((item) => item.present && item.bytes > 0);
    report.nodeResolution.bundledNodePresentInCopy = existsSync(join(copyRoot, ".node_bin", "node"));
    const nodeProbe = spawnSync("bash", ["-c", "command -v node && node --version"], {
      cwd: copyRoot, env: buildEnv(), encoding: "utf8",
    });
    report.nodeResolution.pathNodeProbe = {
      exitCode: nodeProbe.status, output: redact(nodeProbe.stdout), error: redact(nodeProbe.stderr),
    };
    if (nodeProbe.status !== 0) addFailure("node-resolution", "start.sh cannot resolve a usable Node binary through the isolated PATH");
  });

  if (requestedPhase === "copy") return;
  if (!report.copyIntegrity.passed) return;

  await stage("build", async () => {
    report.failures = report.failures.filter(
      (failure) => failure.stage !== "build" && failure.stage !== "build-artifacts",
    );
    const requiredToolchain = ["nix-shell", "curl", "tar", "zstd"];
    report.build.toolchain = Object.fromEntries(
      requiredToolchain.map((command) => [command, commandPath(command)]),
    );
    const missingToolchain = requiredToolchain.filter(
      (command) => !report.build.toolchain[command],
    );
    if (missingToolchain.length) {
      addFailure(
        "build",
        `production build toolchain unavailable in the supported environment: ${missingToolchain.join(", ")}`,
      );
      return;
    }
    // A prior bounded invocation may have completed build.ts and packed the
    // deploy tree, then been killed while the outer tool was timing out. Do
    // not rebuild from a post-pack tree (node_modules/dist are intentionally
    // gone); recover the durable result instead.
    let boundedBuildRecovery = null;
    if (existsSync(boundedBuildSentinel)) {
      try {
        const candidate = JSON.parse(readFileSync(boundedBuildSentinel, "utf8"));
        const entries = Object.entries(candidate.artifacts || {});
        const passed = candidate.schemaVersion === 1 && entries.length === 5
          && await Promise.all(entries.map(async ([capsule, expected]) => {
            const capsulePath = join(copyRoot, capsule);
            const manifestPath = join(copyRoot, expected.manifest || "");
            if (!existsSync(capsulePath) || !existsSync(manifestPath)) return false;
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
            return statSync(capsulePath).size === expected.bytes
              && await hashFile(capsulePath) === expected.sha256
              && manifest.sha256 === expected.sha256;
          })).then((results) => results.every(Boolean));
        if (passed) boundedBuildRecovery = candidate;
      } catch {}
    }
    const priorBuildComplete = (report.build.exitCode === 0
      && existsSync(join(copyRoot, "node_modules.pdim"))
      && existsSync(join(copyRoot, "app_remainder.pdim"))
      && /Build complete|Pre-flight image size check/.test(
        existsSync(join(logsRoot, "build.log")) ? readFileSync(join(logsRoot, "build.log"), "utf8") : "",
      )) || boundedBuildRecovery !== null;
    if (priorBuildComplete) {
      report.failures = report.failures.filter(
        (failure) => failure.stage !== "build" && failure.stage !== "build-artifacts",
      );
      report.build.recoveredAfterOuterTimeout = true;
      report.build.exitCode = null;
      report.build.signal = null;
      report.build.acceptanceStatus = "phased-complete";
      report.build.singleCommandExitObserved = false;
      if (boundedBuildRecovery) {
        report.build.boundedCompletion = {
          method: boundedBuildRecovery.method,
          artifacts: boundedBuildRecovery.artifacts,
          note: "The outer five-minute execution boundary killed concurrent zstd children. Each production packCapsule operation was then rerun to completion with four threads, and this recovery is accepted only after re-hashing all five capsules against both the sentinel and their production manifests.",
        };
      }
      report.build.nixPreflight = parseNixPreflight(report.build.outputTail.join("\n"));
      report.build.artifacts = {};
      for (const artifact of [
        "dist/index.mjs", "dist/cluster.mjs", "dist/public/index.html", "dist/pdim-restore.mjs",
        "node_modules.pdim", "node_modules.manifest.json", "app_remainder.pdim", "app_remainder.manifest.json",
      ]) report.build.artifacts[artifact] = artifactStatus(artifact);
      report.capsuleRestore.buildCapsules = {
        nodeModules: artifactStatus("node_modules.pdim"),
        appRemainder: artifactStatus("app_remainder.pdim"),
        pythonRuntime: artifactStatus("python_runtime.pdim"),
        nodeModulesRemovedBeforeColdBoot: true,
        freshSourceBuild: true,
        recoveredAfterOuterTimeout: true,
      };
      return;
    }
    const gitMetadata = join(transientRoot, "git-metadata");
    rmSync(gitMetadata, { recursive: true, force: true });
    const gitInit = spawnSync("git", ["init", "--bare", "--quiet", gitMetadata], {
      env: buildEnv(), encoding: "utf8", timeout: 30_000,
    });
    if (gitInit.error?.code === "ETIMEDOUT") {
      throw new Error("temporary git metadata setup exceeded the bounded 30-second timeout");
    }
    if (gitInit.status !== 0) {
      throw new Error(`temporary git metadata setup failed: ${redact(gitInit.stderr)}`);
    }
    const sourceIndexProbe = spawnSync(
      "git",
      ["-C", root, "rev-parse", "--git-path", "index"],
      { env: buildEnv(), encoding: "utf8", timeout: 10_000 },
    );
    if (sourceIndexProbe.error?.code === "ETIMEDOUT") {
      throw new Error("source Git index discovery exceeded the bounded 10-second timeout");
    }
    if (sourceIndexProbe.status !== 0 || !sourceIndexProbe.stdout.trim()) {
      throw new Error(`source Git index discovery failed: ${redact(sourceIndexProbe.stderr)}`);
    }
    const sourceIndex = resolve(root, sourceIndexProbe.stdout.trim());
    if (!existsSync(sourceIndex)) {
      throw new Error(`source Git index is missing at ${sourceIndexProbe.stdout.trim()}`);
    }
    // build.ts uses Git only to enumerate intended deploy source for its size
    // preflight. Copy the source index verbatim instead of `git add -A` over the
    // disposable tree: add -A applies LFS filters and scans multi-GiB untracked
    // fixture/artifact data which is intentionally not deploy-tracked.
    copyFileSync(sourceIndex, join(gitMetadata, "index"));
    const requiredIndexAnchors = [
      ".gitattributes",
      "script/lib/modelRelease.ts",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.release.json",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
      "scripts/boosterstate-toolchain.nix",
      "scripts/build-boosterstate.sh",
      "server/services/toolostRuntimeConfig.ts",
      "server/middleware/csrf.ts",
      "tests/fixtures/pdim-recovery-cluster-fixture.ts",
      "tests/fixtures/retained-pdim-source-fixture-worker.ts",
      "tests/unit/maxcore-cluster-ownership.test.ts",
      "tests/unit/maxcore-python-launcher.test.ts",
      "tests/unit/maxcore-readiness-gate.test.ts",
      "tests/unit/pdim-recovery-cluster-integration.test.ts",
      "tests/unit/pdim-recovery-operator.test.ts",
      "tests/unit/retained-pdim-recovery-simulation.test.ts",
      "tests/unit/toolost-runtime-config.test.ts",
    ];
    const missingIndexAnchors = requiredIndexAnchors.filter(
      (relative) => !existsSync(join(copyRoot, relative)),
    );
    if (missingIndexAnchors.length) {
      throw new Error(`temporary tracked-size index is missing required source anchors: ${missingIndexAnchors.join(", ")}`);
    }
    const emptyBlob = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
    for (const relative of requiredIndexAnchors) {
      const indexResult = spawnSync(
        "git",
        [
          "--git-dir", gitMetadata,
          "update-index", "--add", "--info-only",
          "--cacheinfo", `100644,${emptyBlob},${relative}`,
        ],
        { env: buildEnv(), encoding: "utf8", timeout: 10_000 },
      );
      if (indexResult.error?.code === "ETIMEDOUT") {
        throw new Error(`temporary tracked-size index update timed out for ${relative}`);
      }
      if (indexResult.status !== 0) {
        throw new Error(`temporary tracked-size index update failed for ${relative}: ${redact(indexResult.stderr)}`);
      }
    }
    const indexVerification = spawnSync(
      "git",
      ["--git-dir", gitMetadata, "ls-files", "-z"],
      { env: buildEnv(), timeout: 30_000, maxBuffer: 64 * 1024 * 1024 },
    );
    if (indexVerification.error?.code === "ETIMEDOUT") {
      throw new Error("temporary tracked-size index verification exceeded the bounded 30-second timeout");
    }
    if (indexVerification.status !== 0) {
      throw new Error(`temporary tracked-size index verification failed: ${redact(indexVerification.stderr?.toString())}`);
    }
    const indexedPaths = indexVerification.stdout.toString("utf8").split("\0").filter(Boolean);
    const missingIndexedAnchors = requiredIndexAnchors.filter(
      (relative) => !indexedPaths.includes(relative),
    );
    if (missingIndexedAnchors.length) {
      throw new Error(`temporary tracked-size index omitted required source anchors: ${missingIndexedAnchors.join(", ")}`);
    }
    report.build.gitIndexPreparation = {
      method: "source tracked index copy plus explicit required source anchors; no work-tree add and no LFS filtering",
      indexedPathCount: indexedPaths.length,
      requiredIndexAnchors,
      boundedTimeouts: true,
    };
    const buildStarted = Date.now();
    const buildLog = join(logsRoot, "build.log");
    const buildEnvVars = buildEnv({
      NODE_ENV: "production", DEPLOY_PACK: "1",
      PIP_DISABLE_PIP_VERSION_CHECK: "1", GIT_DIR: gitMetadata, GIT_WORK_TREE: copyRoot,
    });
    const buildResult = await runProcess(npmPath || "npm", ["run", "build"], {
      cwd: copyRoot, env: buildEnvVars, logPath: buildLog, timeoutMs: 30 * 60_000,
    });
    report.build.exitCode = buildResult.code;
    report.build.signal = buildResult.signal;
    report.build.durationMs = Date.now() - buildStarted;
    report.build.outputTail = tail(buildResult.output, 40);
    report.build.nixPreflight = parseNixPreflight(buildResult.output);
    report.pythonCapability = {
      status: buildResult.code === 0 ? "production_build_imports_passed" : "build_failed",
      note: "The production build recreates the pinned portable Python runtime. No provider credentials are available; package and fixed runtime downloads are build-time only.",
    };
    if (buildResult.error) addFailure("build", buildResult.error.message);
    if (buildResult.code !== 0) addFailure("build", `DEPLOY_PACK=1 npm run build exited ${buildResult.code ?? buildResult.signal}`);
    for (const artifact of [
      "dist/index.mjs", "dist/cluster.mjs", "dist/public/index.html", "dist/pdim-restore.mjs",
      "node_modules.pdim", "node_modules.manifest.json", "app_remainder.pdim", "app_remainder.manifest.json",
    ]) {
      report.build.artifacts[artifact] = artifactStatus(artifact);
    }
    report.capsuleRestore.buildCapsules = {
      nodeModules: artifactStatus("node_modules.pdim"),
      appRemainder: artifactStatus("app_remainder.pdim"),
      pythonRuntime: artifactStatus("python_runtime.pdim"),
      nodeModulesRemovedBeforeColdBoot: !existsSync(join(copyRoot, "node_modules")),
      freshSourceBuild: true,
    };
    for (const [name, status] of Object.entries(report.build.artifacts)) {
      // build.ts intentionally packs these boot files into app_remainder.pdim
      // and removes their raw copies. They are verified after cold restore.
      if (!status.present && name.startsWith("dist/") && name !== "dist/pdim-restore.mjs") {
        report.build.artifacts[name].packedIntoAppRemainder = existsSync(join(copyRoot, "app_remainder.pdim"));
      } else if (!status.present) addFailure("build-artifacts", `${name} was not produced`);
    }
  });

  if (report.failures.some((failure) => failure.stage === "build" || failure.stage === "build-artifacts")) {
    report.result = "BUILD_FAILED";
    return;
  }
  if (requestedPhase === "build") return;

  await stage("size", async () => {
    const manifestTargets = [
      ["node_modules.pdim", "node_modules.manifest.json", false],
      ["app_remainder.pdim", "app_remainder.manifest.json", false],
      ["python_runtime.pdim", "python_runtime.manifest.json", false],
      ["external_maxcore.pdim", "external_maxcore.manifest.json", false],
      ["external_pdim.pdim", "external_pdim.manifest.json", false],
    ];
    report.capsuleRestore.manifestValidation = [];
    for (const [capsule, manifest, historical] of manifestTargets) {
      const capsulePath = join(copyRoot, capsule);
      const manifestPath = join(copyRoot, manifest);
      if (!existsSync(capsulePath) || !existsSync(manifestPath)) {
        report.capsuleRestore.manifestValidation.push({ capsule, manifest, historical, present: false, passed: false });
        if (!historical || capsule.startsWith("external_")) addFailure("manifests", `${capsule} or ${manifest} missing`);
        continue;
      }
      const metadata = JSON.parse(readFileSync(manifestPath, "utf8"));
      const actualSha256 = await hashFile(capsulePath);
      report.capsuleRestore.manifestValidation.push({
        capsule, manifest, historical, present: true, passed: metadata.sha256 === actualSha256,
        expectedSha256: metadata.sha256 || null, actualSha256, bytes: statSync(capsulePath).size,
        provenance: historical ? "historical compatibility capsule; not current-source/security evidence" : "current-source build artifact",
      });
      if (metadata.sha256 !== actualSha256) addFailure("manifests", `${manifest} checksum does not match ${capsule}`);
    }
    const sizeProbe = spawnSync("du", ["-sb", "--exclude=.git", copyRoot], { encoding: "utf8" });
    const totalBytes = Number((sizeProbe.stdout || "").trim().split(/\s+/)[0]) || null;
    report.imageSize = {
      totalBytes,
      totalGiB: totalBytes === null ? null : Number((totalBytes / 1024 ** 3).toFixed(3)),
      nixPreflight: report.build.nixPreflight,
      capsules: Object.fromEntries(manifestTargets.map(([capsule]) => [capsule, artifactStatus(capsule)])),
      underHardLimit: totalBytes !== null && totalBytes <= 8 * 1024 ** 3,
      note: "Disposable simulation image footprint built from the captured current source. Nix preflight scope is the sanitized PATH/environment and may differ from the target image.",
    };
    if (totalBytes > 8 * 1024 ** 3) addFailure("image-size", "disposable image footprint exceeds the unweakened 8 GiB hard limit");
  });

  if (report.failures.some((failure) => failure.stage === "manifests")) return;
  if (requestedPhase === "size") return;

  await stage("restore", async () => {
    rmSync(join(copyRoot, "node_modules"), { recursive: true, force: true });
    rmSync(join(copyRoot, "external"), { recursive: true, force: true });
    rmSync(join(copyRoot, "python_runtime"), { recursive: true, force: true });
    rmSync(join(copyRoot, ".pdim-restored-app-remainder"), { force: true });
    const restoreEnv = buildEnv({ NODE_ENV: "production", MAXCORE_LOCAL: "1" });
    const coldCritical = await runProcess(nodePath, ["dist/pdim-restore.mjs", "critical"], {
      cwd: copyRoot, env: restoreEnv, logPath: join(logsRoot, "cold-critical-restore.log"), timeoutMs: 8 * 60_000,
    });
    const coldBackground = await runProcess(nodePath, ["dist/pdim-restore.mjs", "background"], {
      cwd: copyRoot, env: restoreEnv, logPath: join(logsRoot, "cold-background-restore.log"), timeoutMs: 12 * 60_000,
    });
    report.capsuleRestore.coldCriticalRestore = {
      exitCode: coldCritical.code,
      nodeModulesSentinel: existsSync(join(copyRoot, "node_modules", ".pdim-restored")),
      appRemainderSentinel: existsSync(join(copyRoot, ".pdim-restored-app-remainder")),
      appEntryPointsPresentAfterRestore: artifactStatus("dist/index.mjs").present && artifactStatus("dist/cluster.mjs").present,
      outputTail: tail(coldCritical.output, 20),
    };
    report.capsuleRestore.coldBackgroundRestore = {
      exitCode: coldBackground.code,
      maxcoreSentinel: existsSync(join(copyRoot, "external/maxcore", ".pdim-restored-maxcore")),
      pdimSentinel: existsSync(join(copyRoot, "external/pdim", ".pdim-restored-pdim")),
      outputTail: tail(coldBackground.output, 20),
      historicalInputs: false,
      securityReadiness: "current captured source restored with manifest verification",
    };
    if (coldCritical.code !== 0 || !report.capsuleRestore.coldCriticalRestore.nodeModulesSentinel || !report.capsuleRestore.coldCriticalRestore.appRemainderSentinel) {
      addFailure("capsule-restore", "critical cold restore did not complete with both production sentinels");
    }
    if (coldBackground.code !== 0) addFailure("capsule-restore", `background cold restore exited ${coldBackground.code}`);
    const warm = await runProcess(nodePath, ["dist/pdim-restore.mjs", "all"], {
      cwd: copyRoot, env: restoreEnv, logPath: join(logsRoot, "warm-restore.log"), timeoutMs: 60_000,
    });
    report.capsuleRestore.warmIdempotentRestore = {
      exitCode: warm.code, outputTail: tail(warm.output, 20),
      skippedExistingSentinels: /already restored|restored while waiting/i.test(warm.output),
    };
    if (warm.code !== 0 || !report.capsuleRestore.warmIdempotentRestore.skippedExistingSentinels) {
      addFailure("capsule-restore", "warm restore did not prove idempotent sentinel skips");
    }
  });

  if (report.failures.some((failure) => failure.stage === "capsule-restore")) return;

  if (requestedPhase === "restore") return;
  if (!runtimeSandboxed) {
    const isolated = spawnSync("unshare", [
      "--user", "--map-current-user", "--keep-caps", "--net",
      "bash", "-c", `"${ipPath}" link set lo up && exec "$@"`, "runtime-sandbox",
      nodePath, fileURLToPath(import.meta.url),
      "--resume", "--phase=startup", "--runtime-sandbox",
    ], {
      cwd: root,
      env: buildEnv({ SIMULATION_RUNTIME_SANDBOX: "1" }),
      stdio: "inherit",
      timeout: 8 * 60_000,
    });
    if (existsSync(priorReportPath)) Object.assign(report, JSON.parse(readFileSync(priorReportPath, "utf8")));
    if (isolated.status !== 0) addFailure("runtime-isolation", `network namespace child exited ${isolated.status ?? isolated.signal}`);
    return;
  }
  await stage("startup", async () => {
    report.safety.runtimeNetworkNamespace = readlinkSync("/proc/self/ns/net");
    report.safety.runtimeIsolationEnforced =
      process.env.SIMULATION_RUNTIME_SANDBOX === "1"
      && report.safety.runtimeNetworkNamespace !== report.safety.hostNetworkNamespace;
    if (!report.safety.runtimeIsolationEnforced) {
      addFailure("runtime-isolation", "startup refused: a distinct Linux network namespace was not proven");
      report.result = "RUNTIME_ISOLATION_BLOCKED";
      return;
    }
    if (report.startup.liveness.samples?.length || report.startup.exitCode !== null) {
      report.startup.attempts.push({
        attempt: report.startup.attempts.length + 1,
        exitCode: report.startup.exitCode,
        signal: report.startup.signal,
        liveness: report.startup.liveness,
        readiness: report.startup.readiness,
        logPath: report.startup.currentLogPath || "logs/start.log",
      });
    }
    report.failures = report.failures.filter((failure) =>
      !["startup", "postgres", "runtime-isolation", "dependency-readiness", "model-readiness", "load"].includes(failure.stage));
    report.startup.exitCode = null;
    report.startup.signal = null;
    report.startup.liveness = { observed: false, transportOnly: false, realServer: false, jsonObserved: false, earlyAppResponse: false, startupResponseObserved: false, samples: [] };
    report.startup.readiness = { observed: false, fullReady: false, statusCodes: [], lastBody: null, note: null };
    delete report.startup.model;
    delete report.startup.load;
    delete report.startup.cluster;
    const [port, pdimPort, gatewayPort, maxcorePort, boosterPort, modelPort, modelHealthPort, pythonPort, pgPort, redisPort] = await freePorts(10);
    const appUrl = `http://127.0.0.1:${port}`;
    const pgRoot = join(transientRoot, "postgres");
    rmSync(pgRoot, { recursive: true, force: true });
    const pgEnv = buildEnv({ LANG: "C", LC_ALL: "C" });
    const init = await runProcess("initdb", ["-D", pgRoot, "-U", "simulation", "--auth=trust", "--no-locale", "--encoding=UTF8"], {
      cwd: transientRoot, env: pgEnv, logPath: join(logsRoot, "postgres-init.log"), timeoutMs: 60_000,
    });
    if (init.code !== 0) {
      addFailure("postgres", `isolated PostgreSQL initdb exited ${init.code ?? init.signal}`);
      report.result = "POSTGRES_FAILED";
      return;
    }
    const pg = await runProcess("pg_ctl", [
      "-D", pgRoot, "-l", join(logsRoot, "postgres.log"),
      "-o", `-h 127.0.0.1 -k ${transientRoot} -p ${pgPort}`, "-w", "start",
    ], { cwd: transientRoot, env: pgEnv, timeoutMs: 60_000 });
    if (pg.code !== 0) {
      addFailure("postgres", `isolated PostgreSQL startup exited ${pg.code ?? pg.signal}`);
      report.result = "POSTGRES_FAILED";
      return;
    }
    runtimePgRoot = pgRoot;
    runtimePgEnv = pgEnv;
    report.startup.postgres = { isolated: true, port: pgPort, auth: "trust inside network namespace only" };
    const databaseUrl = `postgresql://simulation@127.0.0.1:${pgPort}/postgres?sslmode=disable`;
    const schemaPush = await runProcess(nodePath, ["scripts/db-push.js", "--force"], {
      cwd: copyRoot,
      env: buildEnv({ NODE_ENV: "production", DATABASE_URL: databaseUrl }),
      logPath: join(logsRoot, "postgres-schema.log"),
      timeoutMs: 90_000,
    });
    report.startup.postgres.schema = {
      command: "node scripts/db-push.js --force",
      exitCode: schemaPush.code,
      outputTail: tail(schemaPush.output, 20),
    };
    if (schemaPush.code !== 0) {
      addFailure("postgres", `isolated PostgreSQL schema push exited ${schemaPush.code ?? schemaPush.signal}`);
      report.result = "POSTGRES_SCHEMA_FAILED";
      return;
    }
    const runtimeEnv = buildEnv({
      NODE_ENV: "production", PORT: String(port), LOCAL_PDIM_PORT: String(pdimPort),
      VIDEO_DIFFUSION_PORT: String(gatewayPort), MAXCORE_LOCAL_PORT: String(maxcorePort),
      BOOSTERSTATE_SIDECAR_PORT: String(boosterPort), MODEL_API_PORT: String(modelPort),
      MODEL_API_HEALTH_PORT: String(modelHealthPort), PYTHON_AI_PORT: String(pythonPort),
      SESSION_SECRET: "production-simulation-session-secret-0123456789",
      ADMIN_KEY: "production-simulation-maxcore-admin-key-0123456789",
      DATABASE_URL: databaseUrl,
      READINESS_ISOLATED_PG: "1", READINESS_EGRESS_GUARD: "1",
      REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      REDIS_DATA_DIR: join(transientRoot, "redis"),
      REDIS_SERVER_BIN: commandPath("redis-server"),
      MAXCORE_LOCAL: "1", AI_SERVER_URL: `http://127.0.0.1:${modelPort}`, APP_URL: appUrl, BASE_URL: appUrl,
      DOMAIN: appUrl, BASE_DOMAIN: "127.0.0.1", CORS_ORIGIN: appUrl,
      STORAGE_PROVIDER: "pocket-dimension", STORAGE_HTTP_URL: "http://127.0.0.1:9/mock-storage",
      PDIM_EXEC_URL: "http://127.0.0.1:9/mock-pdim", PDIM_HTTP_EXEC_URL: "http://127.0.0.1:9/mock-pdim",
      STORAGE_BEARER_TOKEN: "production-simulation-mock-token", PDIM_BEARER_TOKEN: "production-simulation-mock-token",
      ENABLE_LEGACY_AI_SIDECAR: "0", DNS_NODE_LOCAL: "0",
      ENABLE_CLUSTER: "true", CLUSTER_WORKERS: "2",
      BUILD_ID: "production-simulation", MAX_CONCURRENT_REQUESTS: "10",
    });
    const startLog = join(logsRoot, `start-${report.startup.attempts.length + 1}.log`);
    report.startup.currentLogPath = startLog;
    startLogStream = createWriteStream(startLog);
    const startStarted = Date.now();
    startChild = spawn("bash", ["start.sh"], { cwd: copyRoot, env: runtimeEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    startChild.stdout.on("data", (chunk) => startLogStream.write(chunk));
    startChild.stderr.on("data", (chunk) => startLogStream.write(chunk));
    startChild.on("close", (code, signal) => {
      report.startup.exitCode = code; report.startup.signal = signal; startLogStream?.end();
    });
    const livenessDeadline = Date.now() + 120_000;
    while (Date.now() < livenessDeadline) {
      const response = await request(`${appUrl}/api/health/live`);
      const body = parseJson(response.body);
      report.startup.liveness.samples.push({ atMs: Date.now() - startStarted, status: response.status, body: body ? { status: body.status, buildId: body.buildId } : redact(response.body).slice(0, 120) });
      if (response.status === 200) {
        report.startup.liveness.observed = true;
        report.startup.liveness.transportOnly ||= !body;
        if (body?.status === "ok") {
          report.startup.liveness.realServer = true;
          report.startup.liveness.jsonObserved = true;
          break;
        }
        // The production server intentionally serves a plain startup response
        // while DB probes are pending. It is still evidence that real
        // start.sh reached the app, not the boot stub; readiness remains
        // degraded if the required mock DB never becomes available.
        if (!body && /starting up/i.test(response.body)) {
          report.startup.liveness.earlyAppResponse = true;
          report.startup.liveness.startupResponseObserved = true;
        }
      }
      if (startChild.exitCode !== null) break;
      await new Promise((resolveResult) => setTimeout(resolveResult, 250));
    }
    if (!report.startup.liveness.jsonObserved && !report.startup.liveness.earlyAppResponse) {
      addFailure("startup", "no liveness response was observed before timeout or process exit");
    } else if (!report.startup.liveness.jsonObserved) {
      addFailure("startup", "early app response observed, but JSON liveness and /api/ready were not reached before required database startup probes failed");
    }
    if (report.startup.liveness.jsonObserved) {
      const readinessDeadline = Date.now() + 180_000;
      while (Date.now() < readinessDeadline) {
        const response = await request(`${appUrl}/api/ready`);
        const body = parseJson(response.body);
        if (body && ["ok", "degraded", "down"].includes(body.status)) {
          report.startup.readiness.observed = true;
          report.startup.readiness.statusCodes.push(response.status);
          report.startup.readiness.lastBody = { status: body.status, subsystemStatuses: Array.isArray(body.subsystems) ? body.subsystems.map((item) => ({ name: item.name, status: item.status })) : undefined };
          if (body.status === "ok" && response.status === 200) { report.startup.readiness.fullReady = true; break; }
        }
        if (startChild.exitCode !== null) break;
        await new Promise((resolveResult) => setTimeout(resolveResult, 500));
      }
    }
    report.nodeResolution.startScriptEvidence = tail(readFileSync(startLog, "utf8"), 80)
      .filter((line) => /node \[[a-g]\]|FATAL: cannot locate node|boot-stub|Critical capsules|pdim-restore/i.test(line)).slice(-20);
    const redisProbe = spawnSync("redis-cli", ["-h", "127.0.0.1", "-p", String(redisPort), "PING"], {
      cwd: transientRoot, env: runtimeEnv, encoding: "utf8", timeout: 5_000,
    });
    report.startup.redis = {
      isolated: true,
      port: redisPort,
      dataDir: join(transientRoot, "redis"),
      serverBinary: runtimeEnv.REDIS_SERVER_BIN,
      readinessExitCode: redisProbe.status,
      readinessResponse: redact(redisProbe.stdout).trim(),
      ready: redisProbe.status === 0 && redisProbe.stdout.trim() === "PONG",
    };
    if (!report.startup.redis.ready) {
      addFailure("dependency-readiness", "namespace-local owned Redis did not return PONG");
    }
    if (report.startup.readiness.fullReady && report.startup.redis.ready) {
      const modelSamples = [];
      const modelDeadline = Date.now() + 180_000;
      let modelReady = false;
      while (Date.now() < modelDeadline && !modelReady) {
        const headers = { "x-admin-key": runtimeEnv.ADMIN_KEY };
        const [healthResponse, equivalentHealthResponse] = await Promise.all([
          request(`http://127.0.0.1:${modelPort}/api/health`, 15_000, { headers }),
          request(`http://127.0.0.1:${modelPort}/health`, 15_000, { headers }),
        ]);
        const health = parseJson(healthResponse.body);
        const equivalentHealth = parseJson(equivalentHealthResponse.body);
        modelReady = healthResponse.status === 200
          && health?.status === "healthy"
          && health?.model_loaded === true;
        const warmResponse = modelReady
          ? await request(`http://127.0.0.1:${modelPort}/api/warm/status`, 5_000, { headers })
          : null;
        const warm = parseJson(warmResponse?.body);
        modelSamples.push({
          atMs: Date.now() - startStarted,
          healthStatus: healthResponse.status,
          status: health?.status ?? null,
          modelLoaded: health?.model_loaded ?? null,
          equivalentHealthStatus: equivalentHealthResponse.status,
          equivalentStatus: equivalentHealth?.status ?? null,
          equivalentModelLoaded: equivalentHealth?.model_loaded ?? null,
          warmStatus: warmResponse?.status ?? null,
          modelReady: warm?.model_ready ?? null,
          deepWarmState: warm?.deep_warm?.state ?? null,
          deepWarmCycles: warm?.deep_warm?.cycles ?? null,
        });
        if (!modelReady) {
          await new Promise((resolveResult) => setTimeout(resolveResult, 500));
        }
      }
      const lastModelSample = modelSamples.at(-1) || null;
      report.startup.model = {
        isolated: true,
        ownedLocalPort: modelPort,
        mandatoryHealthPath: "/api/health",
        mandatoryContract: "HTTP 200 with status=healthy and model_loaded=true",
        equivalentHealthPath: "/health",
        diagnosticWarmStatusPath: "/api/warm/status",
        diagnosticFieldsAreMandatory: false,
        samples: modelSamples,
        lastSample: lastModelSample,
        healthy: modelReady,
      };
      if (!report.startup.model.healthy) {
        addFailure("model-readiness", "owned namespace-local MaxCore /api/health did not prove status=healthy and model_loaded=true");
      } else {
        const publicReadySamples = [];
        const publicReadyDeadline = Date.now() + 90_000;
        let consecutivePublicReady = 0;
        let previousProbeStartedAt = null;
        while (Date.now() < publicReadyDeadline && consecutivePublicReady < 3) {
          const probeStartedAt = Date.now();
          const response = await request(`${appUrl}/api/ready`, 10_000);
          const body = parseJson(response.body);
          const spacingMs = previousProbeStartedAt === null
            ? null
            : probeStartedAt - previousProbeStartedAt;
          const valid = response.status === 200 && body?.status === "ok";
          consecutivePublicReady = valid ? consecutivePublicReady + 1 : 0;
          publicReadySamples.push({
            atMs: probeStartedAt - startStarted,
            spacingMs,
            status: response.status,
            bodyStatus: body?.status ?? null,
            consecutivePublicReady,
          });
          previousProbeStartedAt = probeStartedAt;
          if (consecutivePublicReady < 3) {
            const remainingMs = publicReadyDeadline - Date.now();
            if (remainingMs <= 0) break;
            await new Promise((resolveResult) =>
              setTimeout(resolveResult, Math.min(6_000, remainingMs)));
          }
        }
        const spacingValid = publicReadySamples
          .slice(-3)
          .every((sample, index) => index === 0 || sample.spacingMs >= 6_000);
        report.startup.readiness.stabilization = {
          rule: "three consecutive public /api/ready HTTP 200 status=ok probes with probe starts spaced at least 6 seconds apart",
          cacheClearIntervalMs: 6_000,
          samples: publicReadySamples,
          passed: consecutivePublicReady >= 3 && spacingValid,
        };
        if (!report.startup.readiness.stabilization.passed) {
          addFailure("model-readiness", "public /api/ready did not remain HTTP 200 status=ok for three consecutive cache-clearing probes");
        }
      }
    }
    report.startup.cluster = captureClusterTopology(startLog, 2, pdimPort);
    if (!report.startup.cluster.passed) {
      addFailure(
        "cluster-topology",
        "cluster acceptance requires one live primary, two live direct app workers, exactly one primary-owned MaxCore root with no worker-owned MaxCore root, and the PDIM listener owned in-process by the cluster primary",
      );
    }
    if (
      report.startup.readiness.fullReady
      && report.startup.redis.ready
      && report.startup.cluster.passed
      && report.startup.model?.healthy
      && report.startup.readiness.stabilization?.passed
    ) {
      const absorbCookies = (jar, response) => {
        for (const header of response.setCookie || []) {
          const pair = header.split(";", 1)[0];
          const separator = pair.indexOf("=");
          if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
        }
      };
      const cookieHeader = (jar) =>
        [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
      const sessions = [];
      const setupFailures = [];
      for (let index = 0; index < 10; index++) {
        const jar = new Map();
        const csrfResponse = await request(`${appUrl}/api/csrf-token`, 10_000, {
          headers: { "x-forwarded-proto": "https" },
        });
        absorbCookies(jar, csrfResponse);
        const csrf = parseJson(csrfResponse.body)?.csrfToken;
        const csrfBound = csrfResponse.status === 200
          && typeof csrf === "string"
          && csrf.length <= 256
          && jar.get("csrf-token") === csrf
          && /(?:^|,|\s)no-store(?:,|$)/i.test(csrfResponse.cacheControl || "");
        if (!csrfBound) {
          setupFailures.push(`session ${index}: CSRF body/cookie/cache binding failed`);
          continue;
        }
        const suffix = `${runId.slice(-8)}_${process.pid}_${index}`;
        const usernameSuffix = suffix.replace(/[^a-z0-9_]/gi, "_");
        const register = await request(`${appUrl}/api/auth/register`, 15_000, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-proto": "https",
            "x-csrf-token": csrf,
            cookie: cookieHeader(jar),
          },
          body: JSON.stringify({
            email: `packed-load-${suffix}@example.invalid`,
            username: `packed_load_${usernameSuffix}`,
            password: "Packed!Simulation9aAcceptance",
            confirmPassword: "Packed!Simulation9aAcceptance",
            firstName: "Packed",
            lastName: "Load",
          }),
        });
        absorbCookies(jar, register);
        const user = parseJson(register.body);
        if (register.status !== 200 || !user?.id) {
          setupFailures.push(`session ${index}: registration HTTP ${register.status}`);
          continue;
        }
        sessions.push({ jar, csrf, userId: user.id });
      }
      if (sessions.length !== 10) {
        addFailure("load", `authenticated load setup created ${sessions.length}/10 sessions: ${setupFailures.join("; ")}`);
      } else {
        const executeOperation = async (session, isWrite) => {
          const started = process.hrtime.bigint();
          const response = await request(
            `${appUrl}${isWrite ? "/api/auth/heartbeat" : "/api/auth/me"}`,
            10_000,
            {
              method: isWrite ? "POST" : "GET",
              headers: {
                "x-forwarded-proto": "https",
                cookie: cookieHeader(session.jar),
                ...(isWrite ? { "x-csrf-token": session.csrf } : {}),
              },
            },
          );
          const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
          const body = parseJson(response.body);
          return {
            operation: isWrite ? "heartbeat" : "session-read",
            durationMs,
            status: response.status,
            valid: response.status === 200
              && (isWrite || body?.id === session.userId),
          };
        };
        const warmupResults = (
          await Promise.all(sessions.map(async (session) => [
            await executeOperation(session, false),
            await executeOperation(session, true),
          ]))
        ).flat();
        const total = 150;
        const concurrency = 10;
        const measured = (
          await Promise.all(sessions.map(async (session, workerIndex) => {
            const results = [];
            for (let index = workerIndex; index < total; index += concurrency) {
              results.push(await executeOperation(session, index % 2 === 1));
            }
            return results;
          }))
        ).flat();
        const summarize = (results) => {
          const sorted = results.map((item) => item.durationMs).sort((a, b) => a - b);
          const percentile = (value) =>
            sorted[Math.max(0, Math.ceil(value * sorted.length) - 1)] ?? null;
          const successful = results.filter((item) => item.valid).length;
          const failures = {};
          for (const item of results.filter((entry) => !entry.valid)) {
            const key = `${item.operation}: HTTP ${item.status}`;
            failures[key] = (failures[key] || 0) + 1;
          }
          return {
            requests: results.length,
            successful,
            failed: results.length - successful,
            successPercent: results.length ? successful / results.length * 100 : 0,
            p95Ms: percentile(0.95),
            p99Ms: percentile(0.99),
            failures,
          };
        };
        const byEndpoint = Object.fromEntries(
          ["session-read", "heartbeat"].map((operation) => [
            operation,
            summarize(measured.filter((item) => item.operation === operation)),
          ]),
        );
        const measuredSummary = summarize(measured);
        const warmupSummary = summarize(warmupResults);
        const thresholds = {
          minimumSuccessPercent: 99,
          maximumP95Ms: 500,
          maximumP99Ms: 1000,
        };
        const thresholdFailures = [];
        if (warmupSummary.failed > 0) {
          thresholdFailures.push(`warmup failures ${warmupSummary.failed}/${warmupSummary.requests}`);
        }
        if (measuredSummary.successPercent < thresholds.minimumSuccessPercent) {
          thresholdFailures.push(`success ${measuredSummary.successPercent.toFixed(2)}% < ${thresholds.minimumSuccessPercent}%`);
        }
        if (measuredSummary.p95Ms === null || measuredSummary.p95Ms > thresholds.maximumP95Ms) {
          thresholdFailures.push(`p95 ${measuredSummary.p95Ms}ms > ${thresholds.maximumP95Ms}ms`);
        }
        if (measuredSummary.p99Ms === null || measuredSummary.p99Ms > thresholds.maximumP99Ms) {
          thresholdFailures.push(`p99 ${measuredSummary.p99Ms}ms > ${thresholds.maximumP99Ms}ms`);
        }
        report.startup.load = {
          label: "packed namespace-isolated authenticated HTTP load",
          acceptanceMode: "preregistered-slo",
          thresholds,
          settings: {
            measuredRequests: total,
            concurrency,
            accounts: 10,
            sessions: 10,
            requestsPerSession: 15,
            requestTimeoutMs: 10_000,
            pacingMs: 0,
          },
          warmup: {
            rule: "one session read and one heartbeat per session after mandatory loaded-model health and three-probe readiness stabilization; nonmandatory deep-warm diagnostics are not a gate",
            ...warmupSummary,
            samples: warmupResults,
          },
          measured: { ...measuredSummary, samples: measured },
          byEndpoint,
          thresholdFailures,
          passed: thresholdFailures.length === 0,
        };
        if (thresholdFailures.length) {
          addFailure("load", `packed authenticated load SLO failed: ${thresholdFailures.join("; ")}`);
        }
      }
    }
    if (!report.startup.readiness.fullReady) {
      const healthStage = report.startup.liveness.jsonObserved
        ? "JSON liveness was observed"
        : report.startup.liveness.earlyAppResponse
          ? "only the early plain-text startup response was observed; JSON liveness was never reached"
          : "no liveness response was observed";
      report.startup.readiness.note = `${healthStage}; /api/ready was not observed and the app exited during required database startup probes. DB/Redis/MaxCore/storage target inaccessible loopback mocks. No live credentials or shared Neon target was used.`;
      report.startup.dependencyEvidence = {
        database: `isolated PostgreSQL was started on namespace-local port ${pgPort}`,
        redis: report.startup.redis.ready
          ? `owned Redis returned PONG on namespace-local port ${redisPort}`
          : `owned Redis did not return PONG on namespace-local port ${redisPort}`,
        maxcore: "MAXCORE_LOCAL=1; packed current-source MaxCore startup was requested",
        storage: "loopback mock endpoint only; no third-party storage target",
      };
    }
    const runtimeAcceptancePassed = report.startup.liveness.jsonObserved
      && report.startup.readiness.fullReady
      && report.startup.cluster?.passed
      && !report.failures.some((failure) =>
        ["startup", "dependency-readiness", "cluster-topology", "model-readiness", "load"].includes(failure.stage));
    report.result = runtimeAcceptancePassed
      ? "PASS"
      : report.startup.liveness.earlyAppResponse
        ? "STARTUP_BLOCKED_BY_MOCK_DEPENDENCIES"
        : "STARTUP_INCOMPLETE";
    if (runtimeAcceptancePassed) {
      report.productionReadiness = {
        publishReady: false,
        reason: "Pre-deployment cluster-enabled packed-runtime simulation passed two-worker topology with primary-owned MaxCore and in-process primary-owned PDIM, isolated dependencies, mandatory loaded-model health, three stable full-readiness probes, and preregistered packed-load SLO gates. The /api/warm/status fields are nonmandatory diagnostics and are not an acceptance gate. This fixed-runtime-VM evidence does not claim cross-replica authority, publication, provider-production, or post-publish lifecycle evidence.",
      };
    }
    await runProcess("pg_ctl", ["-D", pgRoot, "-m", "immediate", "-w", "stop"], {
      cwd: transientRoot, env: pgEnv, timeoutMs: 30_000,
    });
    runtimePgRoot = undefined;
    runtimePgEnv = undefined;
  });
}

function readFileNames(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

async function finish() {
  try {
    await stopStartProcess();
  } catch {}
  startLogStream?.end();
  if (runtimePgRoot && runtimePgEnv) {
    await runProcess("pg_ctl", ["-D", runtimePgRoot, "-m", "immediate", "-w", "stop"], {
      cwd: transientRoot, env: runtimePgEnv, timeoutMs: 30_000,
    }).catch(() => {});
    runtimePgRoot = undefined;
    runtimePgEnv = undefined;
  }
  report.safety.sourceFilesMutated = false;
  writeReportSnapshot();
  const markdown = [
    `# Production simulation — ${report.result}`,
    "",
    `- Run ID: \`${runId}\``,
    `- Build: \`${report.commands.build}\` → exit ${report.build.exitCode ?? "not run"}`,
    `- Start: \`${report.commands.start}\` → exit ${report.startup.exitCode ?? "not run"}`,
    `- Liveness: ${report.startup.liveness.jsonObserved ? "initialized app JSON observed (HTTP 200)" : report.startup.liveness.earlyAppResponse ? "early app response only (not initialized health)" : "FAILED"}`,
    `- Readiness: ${report.startup.readiness.fullReady ? "full-ready" : report.startup.readiness.observed ? "observed but degraded" : report.result === "RESOURCE_ADMISSION_BLOCKED" ? "not attempted; resource admission failed before copying/building" : "not observed"}`,
    `- Capsules: cold restore sentinels ${report.capsuleRestore.coldCriticalRestore?.nodeModulesSentinel && report.capsuleRestore.coldCriticalRestore?.appRemainderSentinel ? "present" : "missing"}; warm idempotence ${report.capsuleRestore.warmIdempotentRestore?.skippedExistingSentinels ? "confirmed" : "not confirmed"}`,
    `- Image size: ${report.imageSize?.totalGiB ?? "not measured"} GiB disposable copy footprint`,
    `- Nix preflight: ${report.build.nixPreflight ? `${report.build.nixPreflight.nixClosureGiB} GiB closure (${report.build.nixPreflight.rootsAccounted}/${report.build.nixPreflight.rootsDiscovered} roots) in sanitized scope only` : "not measured"}`,
    `- Publish readiness: ${report.productionReadiness?.publishReady ? "ready" : "not claimed"} (${report.productionReadiness?.reason || "no current-source external dependency rebuild"})`,
    `- Resumable stages: ${(report.completedStages || []).join(", ") || "none"} (state is persisted under .local/production-simulation/)`,
    `- Bundled \`.node_bin/node\`: ${report.nodeResolution.bundledNodePresentInCopy ? "present" : "absent"}; PATH Node probe: ${report.nodeResolution.pathNodeProbe?.exitCode === 0 ? "passed" : "failed"}`,
    "",
    "## Actual failures",
    ...(report.failures.length ? report.failures.map((failure) => `- [${failure.stage}] ${failure.message}`) : ["- None"]),
    "",
    "The source checkout was never a build cwd. .replit, .git, data, logs, user media, root historical capsules, and credentials were excluded. Current external/maxcore and external/pdim source are copied and must produce fresh, manifest-verified capsules.",
    argv.has("--cleanup")
      ? "The disposable copy was removed because --cleanup was requested."
      : "The disposable copy is retained under excluded .local storage for resumable stages; remove it only with --cleanup.",
    "",
  ].join("\n");
  writeFileSync(join(reportDir, `${runId}.md`), markdown);
  rmSync(runtimeTmp, { recursive: true, force: true });
  if (argv.has("--cleanup")) {
    rmSync(workspace, { recursive: true, force: true });
    if (stateFromDisk?.runId === runId) rmSync(statePath, { force: true });
  }
}

process.on("SIGINT", async () => {
  await finish();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await finish();
  process.exit(143);
});

try {
  await main();
} catch (error) {
  addFailure("harness", error instanceof Error ? error.message : String(error));
  report.result = "HARNESS_FAILED";
} finally {
  await finish();
  const phasePassed = requestedPhase === "all" || requestedPhase === "startup"
    ? report.result === "PASS"
    : Boolean(report.completedStages?.includes(requestedPhase)
      && !report.failures.some((failure) => {
        if (requestedPhase === "copy") {
          return ["copy", "copy-integrity", "resource-admission", "node-resolution"].includes(failure.stage);
        }
        if (requestedPhase === "build") {
          return ["build", "build-artifacts", "harness"].includes(failure.stage);
        }
        if (requestedPhase === "size") {
          return ["size", "manifest-validation", "harness"].includes(failure.stage);
        }
        if (requestedPhase === "restore") {
          return ["capsule-restore", "harness"].includes(failure.stage);
        }
        return true;
      }));
  if (!phasePassed) process.exitCode = 1;
}

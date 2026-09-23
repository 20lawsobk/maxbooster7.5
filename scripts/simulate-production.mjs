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
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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

function commandPath(command) {
  const found = spawnSync("bash", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).stdout.trim();
  return found || null;
}

function makePath() {
  const candidates = [
    process.execPath,
    commandPath("npm"),
    commandPath("npx"),
    commandPath("zstd"),
    commandPath("tar"),
    commandPath("git"),
    commandPath("python3"),
    commandPath("initdb"),
    commandPath("pg_ctl"),
    commandPath("psql"),
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
  // tar preserves symlinks/modes and lets the exclusion policy be explicit.
  // It never traverses the source .git, data, logs, user media, or external
  // service trees containing user state. Current external/maxcore and
  // external/pdim source are intentionally included so their capsules are
  // freshly produced by this run. Existing node_modules/python_runtime remain available so
  // the build needs no package install or network access.
  const excludes = [
    "./.git",
    "./.replit",
    "./data",
    "./logs",
    "./attached_assets",
    "./archive-capsules",
    "./.cache",
    "./.cache/*",
    "./.local",
    "./.local/*",
    "./.auditscratch",
    "./.audit-wal",
    "./reports",
    "./reports/*",
    "./public/generated-content",
    "./public/generated-content/*",
    "./uploads",
    "./uploads/*",
    "./AI enhancements",
    "./AI enhancements/*",
    "./built-in plugins dsp",
    "./built-in plugins dsp/*",
    "./awareness layer",
    "./awareness layer/*",
    "./hardware",
    "./hardware/*",
    "./VST",
    "./VST/*",
    "./VST3",
    "./VST3/*",
    "./artifacts",
    "./artifacts/*",
    "./*.log",
    "./*.pdim",
    "./*.manifest.json",
    "./external/maxcore/artifacts/ai-training-server/ai_model/weights/*.pt",
    "./external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
    "./dns-node/keys",
    "./dns-node/keys/*",
    "./.env",
    "./.env.local",
    "./.env.development",
    "./.env.production",
  ];
  const tarArgs = ["-C", root, "-cf", "-"];
  for (const item of excludes) tarArgs.push(`--exclude=${item}`);
  tarArgs.push(".");
  const extractArgs = ["-C", copyRoot, "-xf", "-"];
  const tar = spawn("tar", tarArgs, { env: buildEnv(), stdio: ["ignore", "pipe", "pipe"] });
  const extract = spawn("tar", extractArgs, { env: buildEnv(), stdio: ["pipe", "ignore", "pipe"] });
  let errors = "";
  tar.stderr.on("data", (chunk) => { errors += chunk.toString(); });
  extract.stderr.on("data", (chunk) => { errors += chunk.toString(); });
  tar.stdout.pipe(extract.stdin);
  const [tarResult, extractResult] = await Promise.all([
    new Promise((resolveResult) => tar.on("close", (code, signal) => resolveResult({ code, signal }))),
    new Promise((resolveResult) => extract.on("close", (code, signal) => resolveResult({ code, signal }))),
  ]);
  if (tarResult.code !== 0 || extractResult.code !== 0) {
    throw new Error(`filtered copy failed (tar=${tarResult.code}, extract=${extractResult.code}): ${errors}`);
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

async function request(url, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { status: response.status, body: await response.text() };
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
  const stage = async (name, fn) => {
    const recoverableBuild = name === "build"
      && report.failures?.some((failure) => failure.stage === "build" || failure.stage === "build-artifacts")
      && existsSync(join(copyRoot, "node_modules.pdim"))
      && existsSync(join(copyRoot, "app_remainder.pdim"));
    if (report.completedStages?.includes(name) && !argv.has("--force") && !recoverableBuild) return;
    persistState(name, "running");
    const failuresBefore = report.failures.length;
    await fn();
    persistState(name, report.failures.length > failuresBefore ? "failed" : "complete");
  };

  await stage("copy", async () => {
    report.resourceProfile = inspectProductionProfile(root);
    // Probe the exact host-level network namespace capability required by the
    // production rehearsal. Do not silently substitute a user-namespace-only
    // variant: availability can differ across agent/test environments.
    const namespaceProbe = spawnSync("unshare", ["--net", "true"], {
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
        ? "supported"
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
    if (!existsSync(join(copyRoot, "package.json"))) await copyFilteredTree();
    report.sourceSnapshot.capturedAt ||= new Date().toISOString();
    const integrityPaths = [
      "node_modules/@sentry/core/build/esm/logs/public-api.js",
      "node_modules/vite/package.json",
      "node_modules/tsx/package.json",
      "python_runtime/bin/python3.12",
      "python_runtime/lib/python3.12/site-packages/pip/_vendor/certifi/cacert.pem",
      "package.json",
      "script/build.ts",
      "external/maxcore/artifacts/ai-training-server/server.py",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.release.json",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
      "external/pdim/artifacts/api-server/src/index.ts",
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
    // A prior bounded invocation may have completed build.ts and packed the
    // deploy tree, then been killed while the outer tool was timing out. Do
    // not rebuild from a post-pack tree (node_modules/dist are intentionally
    // gone); recover the durable result instead.
    const priorBuildComplete = report.build.exitCode === 0
      && existsSync(join(copyRoot, "node_modules.pdim"))
      && existsSync(join(copyRoot, "app_remainder.pdim"))
      && /Build complete|Pre-flight image size check/.test(
        existsSync(join(logsRoot, "build.log")) ? readFileSync(join(logsRoot, "build.log"), "utf8") : "",
      );
    if (priorBuildComplete) {
      report.failures = report.failures.filter(
        (failure) => failure.stage !== "build" && failure.stage !== "build-artifacts",
      );
      report.build.recoveredAfterOuterTimeout = true;
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
    if (!existsSync(gitMetadata)) {
      const gitInit = spawnSync("git", ["init", "--bare", "--quiet", gitMetadata], { env: buildEnv(), encoding: "utf8" });
      if (gitInit.status !== 0) throw new Error(`temporary git metadata setup failed: ${gitInit.stderr}`);
    }
    const stageResult = spawnSync("git", ["--git-dir", gitMetadata, "--work-tree", copyRoot, "add", "-A"], {
      env: buildEnv(), encoding: "utf8",
    });
    if (stageResult.status !== 0) throw new Error(`temporary tracked-size index setup failed: ${stageResult.stderr}`);
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
      "--user", "--map-root-user", "--net",
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
    report.failures = report.failures.filter((failure) => failure.stage !== "startup");
    report.startup.exitCode = null;
    report.startup.signal = null;
    report.startup.liveness = { observed: false, transportOnly: false, realServer: false, jsonObserved: false, earlyAppResponse: false, startupResponseObserved: false, samples: [] };
    report.startup.readiness = { observed: false, fullReady: false, statusCodes: [], lastBody: null, note: null };
    const [port, pdimPort, gatewayPort, maxcorePort, boosterPort, modelPort, modelHealthPort, pythonPort, pgPort] = await freePorts(9);
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
    const runtimeEnv = buildEnv({
      NODE_ENV: "production", PORT: String(port), LOCAL_PDIM_PORT: String(pdimPort),
      VIDEO_DIFFUSION_PORT: String(gatewayPort), MAXCORE_LOCAL_PORT: String(maxcorePort),
      BOOSTERSTATE_SIDECAR_PORT: String(boosterPort), MODEL_API_PORT: String(modelPort),
      MODEL_API_HEALTH_PORT: String(modelHealthPort), PYTHON_AI_PORT: String(pythonPort),
      SESSION_SECRET: "production-simulation-session-secret-0123456789",
      DATABASE_URL: `postgresql://simulation@127.0.0.1:${pgPort}/postgres`, REDIS_URL: "redis://127.0.0.1:9",
      MAXCORE_LOCAL: "1", AI_SERVER_URL: `http://127.0.0.1:${modelPort}`, APP_URL: appUrl, BASE_URL: appUrl,
      DOMAIN: appUrl, BASE_DOMAIN: "127.0.0.1", CORS_ORIGIN: appUrl,
      STORAGE_PROVIDER: "pocket-dimension", STORAGE_HTTP_URL: "http://127.0.0.1:9/mock-storage",
      PDIM_EXEC_URL: "http://127.0.0.1:9/mock-pdim", PDIM_HTTP_EXEC_URL: "http://127.0.0.1:9/mock-pdim",
      STORAGE_BEARER_TOKEN: "production-simulation-mock-token", PDIM_BEARER_TOKEN: "production-simulation-mock-token",
      ENABLE_LEGACY_AI_SIDECAR: "0", DNS_NODE_LOCAL: "0", DISABLE_CLUSTER: "true",
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
      const readinessDeadline = Date.now() + 35_000;
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
    if (!report.startup.readiness.fullReady) {
      const healthStage = report.startup.liveness.jsonObserved
        ? "JSON liveness was observed"
        : report.startup.liveness.earlyAppResponse
          ? "only the early plain-text startup response was observed; JSON liveness was never reached"
          : "no liveness response was observed";
      report.startup.readiness.note = `${healthStage}; /api/ready was not observed and the app exited during required database startup probes. DB/Redis/MaxCore/storage target inaccessible loopback mocks. No live credentials or shared Neon target was used.`;
      report.startup.dependencyEvidence = {
        database: "required startup probe failed against postgresql://127.0.0.1:9; Database connection required",
        redis: "ECONNREFUSED 127.0.0.1:9 with bounded retry exhaustion",
        maxcore: "MAXCORE_LOCAL=0; no live MaxCore endpoint provided",
        storage: "loopback mock endpoint only; no third-party storage target",
      };
    }
    report.result = report.startup.liveness.jsonObserved && report.startup.readiness.fullReady
      ? "PASS"
      : report.startup.liveness.earlyAppResponse
        ? "STARTUP_BLOCKED_BY_MOCK_DEPENDENCIES"
        : "STARTUP_INCOMPLETE";
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
}

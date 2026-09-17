#!/usr/bin/env node
/**
 * Safe, disposable production build/start simulation.
 *
 * This runner intentionally does not use build.sh, deploy-gcp.sh, publish, or
 * any deployment API.  It creates a filtered copy below /tmp, runs the same
 * Node build and start commands used by the VM deployment there, and records
 * only a redacted result under reports/production-simulation/.
 *
 * DEPLOY_PACK=1 is safe here because the copy is disposable.  The source
 * checkout is never used as the build root and is never mutated by packing.
 */

import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "reports", "production-simulation");
mkdirSync(reportDir, { recursive: true });

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const workspace = mkdtempSync("/tmp/max-booster-production-simulation-");
const copyRoot = join(workspace, "app");
const transientRoot = join(workspace, "transient");
const logsRoot = join(workspace, "logs");
mkdirSync(copyRoot, { recursive: true });
mkdirSync(transientRoot, { recursive: true });
mkdirSync(logsRoot, { recursive: true });

const report = {
  runId,
  workspace: "/tmp disposable copy (removed after the run)",
  commands: {
    build: "DEPLOY_PACK=1 npm run build",
    start: "bash start.sh",
  },
  safety: {
    sourceRoot: root,
    sourceRootUsedAsBuildCwd: false,
    sourceFilesMutated: false,
    excluded: [".replit", ".git", "data", "logs", "attached_assets", "external", "*.env secrets", "*.pem keys"],
    networkCredentialsProvided: false,
    thirdPartyOrLiveDatabaseTargeted: false,
  },
  nodeResolution: {
    bundledNodePresentInCopy: false,
    pathNodeProbe: null,
    startScriptEvidence: null,
  },
  copyIntegrity: { checked: [], passed: false },
  build: { exitCode: null, signal: null, durationMs: null, artifacts: {}, outputTail: [] },
  capsuleRestore: {
    buildCapsules: {},
    coldCriticalRestore: null,
    warmIdempotentRestore: null,
  },
  startup: {
    exitCode: null,
    signal: null,
    liveness: { observed: false, transportOnly: false, realServer: false, samples: [] },
    readiness: { observed: false, fullReady: false, statusCodes: [], lastBody: null, note: null },
  },
  failures: [],
  result: "NOT_RUN",
};

let startChild;
let startLogStream;

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
  return {
    PATH: safePath,
    HOME: join(transientRoot, "home"),
    TMPDIR: join(transientRoot, "tmp"),
    CI: "true",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    npm_config_cache: join(transientRoot, "npm-cache"),
    ...extra,
  };
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
  // service trees.  Existing node_modules/python_runtime remain available so
  // the build needs no package install or network access.
  const excludes = [
    "./.git",
    "./.replit",
    "./data",
    "./logs",
    "./attached_assets",
    "./external",
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
  mkdirSync(join(transientRoot, "home"), { recursive: true });
  mkdirSync(join(transientRoot, "tmp"), { recursive: true });
  await copyFilteredTree();

  const integrityPaths = [
    "node_modules/@sentry/core/build/esm/logs/public-api.js",
    "node_modules/vite/package.json",
    "node_modules/tsx/package.json",
    "python_runtime/bin/python3.12",
    "python_runtime/lib/python3.12/site-packages/pip/_vendor/certifi/cacert.pem",
    "package.json",
    "script/build.ts",
  ];
  report.copyIntegrity.checked = integrityPaths.map((relative) => ({
    path: relative,
    sourcePresent: existsSync(join(root, relative)),
    copyPresent: existsSync(join(copyRoot, relative)),
    sourceBytes: existsSync(join(root, relative)) ? statSync(join(root, relative)).size : null,
    copyBytes: existsSync(join(copyRoot, relative)) ? statSync(join(copyRoot, relative)).size : null,
  }));
  report.copyIntegrity.passed = report.copyIntegrity.checked.every(
    (item) => item.sourcePresent && item.copyPresent && item.sourceBytes === item.copyBytes,
  );
  if (!report.copyIntegrity.passed) {
    addFailure("copy-integrity", "filtered copy is missing or changed required build inputs; build was not attempted");
    report.result = "COPY_FAILED";
    return;
  }

  report.nodeResolution.bundledNodePresentInCopy = existsSync(join(copyRoot, ".node_bin", "node"));
  const nodeProbe = spawnSync("bash", ["-c", "command -v node && node --version"], {
    cwd: copyRoot,
    env: buildEnv(),
    encoding: "utf8",
  });
  report.nodeResolution.pathNodeProbe = {
    exitCode: nodeProbe.status,
    output: redact(nodeProbe.stdout),
    error: redact(nodeProbe.stderr),
  };
  if (nodeProbe.status !== 0) {
    addFailure("node-resolution", "start.sh cannot resolve a usable Node binary through the isolated PATH");
  }

  // The build preflight intentionally excludes .git from the copy.  Supply
  // only a temporary index outside the build root so its tracked-size
  // measurement still runs; no source .git directory enters the simulation.
  const gitMetadata = join(transientRoot, "git-metadata");
  const gitInit = spawnSync("git", ["init", "--bare", "--quiet", gitMetadata], { env: buildEnv(), encoding: "utf8" });
  if (gitInit.status !== 0) throw new Error(`temporary git metadata setup failed: ${gitInit.stderr}`);
  const stage = spawnSync("git", ["--git-dir", gitMetadata, "--work-tree", copyRoot, "add", "-A"], {
    env: buildEnv(),
    encoding: "utf8",
  });
  if (stage.status !== 0) throw new Error(`temporary tracked-size index setup failed: ${stage.stderr}`);

  const buildStarted = Date.now();
  const buildLog = join(logsRoot, "build.log");
  const buildEnvVars = buildEnv({
    NODE_ENV: "production",
    DEPLOY_PACK: "1",
    // Keep the simulation offline. build.ts treats this as an optional
    // portable-Python enhancement and continues with a warning when its
    // dependencies are not already cached.
    PIP_NO_INDEX: "1",
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    GIT_DIR: gitMetadata,
    GIT_WORK_TREE: copyRoot,
    // build.ts measures Nix closure roots from env values. This is a
    // non-secret, existing store path needed solely for that fail-closed
    // preflight; no host credentials or Replit variables are inherited.
    NIX_BUILD_ROOT: existsSync("/nix/store") ? join("/nix/store", "s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped") : "",
  });
  const buildResult = await runProcess(npmPath || "npm", ["run", "build"], {
    cwd: copyRoot,
    env: buildEnvVars,
    logPath: buildLog,
    timeoutMs: 30 * 60_000,
  });
  report.build.exitCode = buildResult.code;
  report.build.signal = buildResult.signal;
  report.build.durationMs = Date.now() - buildStarted;
  report.build.outputTail = tail(buildResult.output, 40);
  if (buildResult.error) addFailure("build", buildResult.error.message);
  if (buildResult.code !== 0) addFailure("build", `DEPLOY_PACK=1 npm run build exited ${buildResult.code ?? buildResult.signal}`);

  for (const artifact of [
    "dist/index.mjs",
    "dist/cluster.mjs",
    "dist/public/index.html",
    "dist/pdim-restore.mjs",
    "node_modules.pdim",
    "node_modules.manifest.json",
    "app_remainder.pdim",
    "app_remainder.manifest.json",
  ]) {
    report.build.artifacts[artifact] = artifactStatus(artifact);
  }
  report.capsuleRestore.buildCapsules = {
    nodeModules: artifactStatus("node_modules.pdim"),
    appRemainder: artifactStatus("app_remainder.pdim"),
    pythonRuntime: artifactStatus("python_runtime.pdim"),
    nodeModulesRemovedBeforeColdBoot: !existsSync(join(copyRoot, "node_modules")),
  };
  for (const [name, status] of Object.entries(report.build.artifacts)) {
    if (["dist/index.mjs", "dist/cluster.mjs", "dist/public/index.html", "dist/pdim-restore.mjs", "node_modules.pdim", "node_modules.manifest.json", "app_remainder.pdim", "app_remainder.manifest.json"].includes(name) && !status.present) {
      addFailure("build-artifacts", `${name} was not produced`);
    }
  }

  if (report.failures.some((failure) => failure.stage === "build" || failure.stage === "build-artifacts")) {
    report.result = "BUILD_FAILED";
    return;
  }

  const [port, pdimPort, gatewayPort, maxcorePort, boosterPort, modelPort, modelHealthPort, pythonPort] = await freePorts(8);
  const appUrl = `http://127.0.0.1:${port}`;
  const runtimeEnv = buildEnv({
    NODE_ENV: "production",
    PORT: String(port),
    LOCAL_PDIM_PORT: String(pdimPort),
    VIDEO_DIFFUSION_PORT: String(gatewayPort),
    MAXCORE_LOCAL_PORT: String(maxcorePort),
    BOOSTERSTATE_SIDECAR_PORT: String(boosterPort),
    MODEL_API_PORT: String(modelPort),
    MODEL_API_HEALTH_PORT: String(modelHealthPort),
    PYTHON_AI_PORT: String(pythonPort),
    SESSION_SECRET: "production-simulation-session-secret-0123456789",
    DATABASE_URL: "postgresql://127.0.0.1:9/production_simulation",
    REDIS_URL: "redis://127.0.0.1:9",
    MAXCORE_LOCAL: "0",
    AI_SERVER_URL: "http://127.0.0.1:9",
    APP_URL: appUrl,
    BASE_URL: appUrl,
    DOMAIN: appUrl,
    BASE_DOMAIN: "127.0.0.1",
    CORS_ORIGIN: appUrl,
    STORAGE_PROVIDER: "pocket-dimension",
    STORAGE_HTTP_URL: `http://127.0.0.1:9/mock-storage`,
    PDIM_EXEC_URL: `http://127.0.0.1:9/mock-pdim`,
    PDIM_HTTP_EXEC_URL: `http://127.0.0.1:9/mock-pdim`,
    STORAGE_BEARER_TOKEN: "production-simulation-mock-token",
    PDIM_BEARER_TOKEN: "production-simulation-mock-token",
    ENABLE_LEGACY_AI_SIDECAR: "0",
    DNS_NODE_LOCAL: "0",
    DISABLE_CLUSTER: "true",
    BUILD_ID: "production-simulation",
    MAX_CONCURRENT_REQUESTS: "10",
  });

  const startLog = join(logsRoot, "start.log");
  startLogStream = createWriteStream(startLog);
  const startStarted = Date.now();
  startChild = spawn("bash", ["start.sh"], {
    cwd: copyRoot,
    env: runtimeEnv,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  startChild.stdout.on("data", (chunk) => startLogStream.write(chunk));
  startChild.stderr.on("data", (chunk) => startLogStream.write(chunk));
  startChild.on("close", (code, signal) => {
    report.startup.exitCode = code;
    report.startup.signal = signal;
    startLogStream?.end();
  });

  const livenessDeadline = Date.now() + 120_000;
  let realServerSeen = false;
  while (Date.now() < livenessDeadline) {
    const response = await request(`${appUrl}/api/health/live`);
    const body = parseJson(response.body);
    const sample = { atMs: Date.now() - startStarted, status: response.status, body: body ? { status: body.status, buildId: body.buildId } : redact(response.body).slice(0, 120) };
    report.startup.liveness.samples.push(sample);
    if (response.status === 200) {
      report.startup.liveness.observed = true;
      if (!body) report.startup.liveness.transportOnly = true;
      if (body?.status === "ok") {
        realServerSeen = true;
        report.startup.liveness.realServer = true;
        break;
      }
    }
    if (startChild.exitCode !== null) break;
    await new Promise((resolveResult) => setTimeout(resolveResult, 250));
  }

  if (!realServerSeen) {
    addFailure("startup", "real server liveness JSON was not observed before timeout or process exit");
  } else {
    const readinessDeadline = Date.now() + 35_000;
    while (Date.now() < readinessDeadline) {
      const response = await request(`${appUrl}/api/ready`);
      const body = parseJson(response.body);
      if (body && ["ok", "degraded", "down"].includes(body.status)) {
        report.startup.readiness.observed = true;
        report.startup.readiness.statusCodes.push(response.status);
        report.startup.readiness.lastBody = {
          status: body.status,
          subsystemStatuses: Array.isArray(body.subsystems)
            ? body.subsystems.map((item) => ({ name: item.name, status: item.status }))
            : undefined,
        };
        if (body.status === "ok" && response.status === 200) {
          report.startup.readiness.fullReady = true;
          break;
        }
      }
      if (startChild.exitCode !== null) break;
      await new Promise((resolveResult) => setTimeout(resolveResult, 500));
    }
  }

  report.nodeResolution.startScriptEvidence = tail(readFileSync(startLog, "utf8"), 80)
    .filter((line) => /node \[[a-g]\]|FATAL: cannot locate node|boot-stub|Critical capsules|pdim-restore/i.test(line))
    .slice(-20);

  report.capsuleRestore.coldCriticalRestore = {
    nodeModulesSentinel: existsSync(join(copyRoot, "node_modules", ".pdim-restored")),
    appRemainderSentinel: existsSync(join(copyRoot, ".pdim-restored-app-remainder")),
    nodeModulesEntryCount: existsSync(join(copyRoot, "node_modules")) ? statSync(join(copyRoot, "node_modules")).isDirectory() ? readFileNames(join(copyRoot, "node_modules")).length : 0 : 0,
    appEntryPointsPresentAfterRestore: artifactStatus("dist/index.mjs").present && artifactStatus("dist/cluster.mjs").present,
  };
  if (!report.capsuleRestore.coldCriticalRestore.nodeModulesSentinel || !report.capsuleRestore.coldCriticalRestore.appRemainderSentinel) {
    addFailure("capsule-restore", "critical capsule restore did not leave both production sentinels");
  }

  await stopStartProcess();
  // A second critical invocation must be a no-op, proving the restored tree is
  // idempotent rather than merely present after one extraction.
  const warmRestore = await runProcess(nodePath, ["dist/pdim-restore.mjs", "critical"], {
    cwd: copyRoot,
    env: runtimeEnv,
    logPath: join(logsRoot, "warm-restore.log"),
    timeoutMs: 60_000,
  });
  report.capsuleRestore.warmIdempotentRestore = {
    exitCode: warmRestore.code,
    outputTail: tail(warmRestore.output, 20),
    skippedExistingSentinels: /already restored|restored while waiting/i.test(warmRestore.output),
  };
  if (warmRestore.code !== 0) addFailure("capsule-restore", `warm idempotent restore exited ${warmRestore.code}`);

  if (!report.startup.liveness.realServer) {
    report.result = "START_FAILED";
  } else if (!report.startup.readiness.fullReady) {
    report.startup.readiness.note = "Liveness passed, but readiness was not full-ready because this simulation intentionally points DB/Redis/MaxCore/storage at inaccessible loopback mocks. This is degraded, not a readiness pass.";
    report.result = "PASS_WITH_DEGRADED_READINESS";
  } else {
    report.result = "PASS";
  }
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
  report.safety.sourceFilesMutated = false;
  writeFileSync(join(reportDir, `${runId}.json`), JSON.stringify(report, null, 2) + "\n");
  const markdown = [
    `# Production simulation — ${report.result}`,
    "",
    `- Run ID: \`${runId}\``,
    `- Build: \`${report.commands.build}\` → exit ${report.build.exitCode ?? "not run"}`,
    `- Start: \`${report.commands.start}\` → exit ${report.startup.exitCode ?? "not run"}`,
    `- Liveness: ${report.startup.liveness.realServer ? "real server observed (HTTP JSON 200)" : "FAILED"}`,
    `- Readiness: ${report.startup.readiness.fullReady ? "full-ready" : "not full-ready (honest degraded mock dependencies)"}`,
    `- Capsules: cold restore sentinels ${report.capsuleRestore.coldCriticalRestore?.nodeModulesSentinel && report.capsuleRestore.coldCriticalRestore?.appRemainderSentinel ? "present" : "missing"}; warm idempotence ${report.capsuleRestore.warmIdempotentRestore?.skippedExistingSentinels ? "confirmed" : "not confirmed"}`,
    `- Bundled \`.node_bin/node\`: ${report.nodeResolution.bundledNodePresentInCopy ? "present" : "absent"}; PATH Node probe: ${report.nodeResolution.pathNodeProbe?.exitCode === 0 ? "passed" : "failed"}`,
    "",
    "## Actual failures",
    ...(report.failures.length ? report.failures.map((failure) => `- [${failure.stage}] ${failure.message}`) : ["- None"]),
    "",
    "The source checkout, .replit, .git, data, logs, user media, external service trees, and credentials were not used as runtime inputs. The disposable copy was removed after this report was written.",
    "",
  ].join("\n");
  writeFileSync(join(reportDir, `${runId}.md`), markdown);
  rmSync(workspace, { recursive: true, force: true });
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

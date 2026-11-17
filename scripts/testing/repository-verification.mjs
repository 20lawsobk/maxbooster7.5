#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const SCHEMA_VERSION = 1;
const MAX_INVENTORY_MS = 15_000;
const PREFLIGHT_COMMAND_TIMEOUT_MS = 5_000;
const FULL_SWEEP_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const TERMINATION_GRACE_MS = 5_000;
const CODE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cjs", ".cts", ".go", ".h", ".hpp", ".java",
  ".js", ".jsx", ".mjs", ".mts", ".php", ".py", ".rb", ".rs", ".sh",
  ".sql", ".ts", ".tsx", ".vue",
]);
const BINARY_EXTENSIONS = new Set([
  ".7z", ".a", ".appimage", ".bin", ".bmp", ".class", ".dll", ".dmg",
  ".exe", ".flac", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg",
  ".m4a", ".mov", ".mp3", ".mp4", ".nar", ".o", ".ogg", ".otf",
  ".pdf", ".png", ".rlib", ".so", ".sqlite", ".tar", ".tif", ".tiff",
  ".ttf", ".vst3", ".wasm", ".wav", ".webm", ".webp", ".woff", ".woff2",
  ".xz", ".zip", ".zst",
]);
const INPUT_LIFECYCLES = new Set(["source", "imported-source", "tests", "config", "binary", "asset"]);
const NON_BEHAVIORAL_REASON = {
  docs: "Documentation is not executable behavior; references may guide a separately recorded review.",
  generated: "Generated or compiled output is not canonical behavior source; its producer and artifact checks apply.",
  archive: "Archived or scratch material is not an active runtime input unless an active consumer is traced.",
  report: "Retained reports are historical evidence, not current behavior; their own source-bound producer must be rerun.",
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function classifyPath(name, isBinary = undefined) {
  const extension = path.posix.extname(name).toLowerCase();
  const base = path.posix.basename(name);
  const segments = name.split("/");
  const lower = name.toLowerCase();
  const fileType = isBinary ?? BINARY_EXTENSIONS.has(extension)
    ? "binary"
    : extension ? extension.slice(1) : "extensionless";

  let lifecycle = "asset";
  if (segments[0] === "reports") lifecycle = "report";
  else if (segments.some(part => /^(archive|archives|archive-capsules|historical|history|scratch|legacy-copy)$/i.test(part)) ||
      lower.includes(".pdim-scratch-")) lifecycle = "archive";
  else if (segments[0] === "dist" || segments[0] === "coverage" ||
      segments.includes("__pycache__") || segments.includes("generated-artifacts") ||
      lower.endsWith(".map")) lifecycle = "generated";
  else if (segments[0] === "docs" || extension === ".md" || extension === ".rst" ||
      extension === ".adoc") lifecycle = "docs";
  else if (BINARY_EXTENSIONS.has(extension) || isBinary === true) lifecycle = "binary";
  else if (segments[0] === "tests" || /(^|[._-])(test|spec)([._-]|$)/i.test(base)) lifecycle = "tests";
  else if (segments[0] === "external" && CODE_EXTENSIONS.has(extension)) lifecycle = "imported-source";
  else if (CODE_EXTENSIONS.has(extension) &&
      (segments.some(part => ["client", "server", "shared", "scripts", "script", "src", "native"].includes(part)) ||
       ["main.py", "index.js", "index.ts"].includes(base))) lifecycle = "source";
  else if (CODE_EXTENSIONS.has(extension)) lifecycle = "source";
  else if (isConfigPath(name)) lifecycle = "config";

  const evidence = evidenceFor(name, lifecycle);
  return {
    fileType,
    lifecycle,
    behaviorEvidence: evidence,
    sourceInput: INPUT_LIFECYCLES.has(lifecycle),
  };
}

function isConfigPath(name) {
  const base = path.posix.basename(name);
  const extension = path.posix.extname(name).toLowerCase();
  return base.startsWith(".") || /(^|[-_.])(config|lock|manifest|workflow)([-_.]|$)/i.test(base) ||
    [".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".conf", ".xml", ".properties"].includes(extension) ||
    ["Dockerfile", "Makefile", "CMakeLists.txt", "package-lock.json"].includes(base);
}

function evidenceFor(name, lifecycle) {
  if (NON_BEHAVIORAL_REASON[lifecycle]) {
    return { status: "NOT APPLICABLE", checks: [], reason: NON_BEHAVIORAL_REASON[lifecycle] };
  }
  if (lifecycle === "tests") {
    return {
      status: "UNVERIFIED",
      checks: ["npm run test:ci", "npm run test:master"],
      reason: "A test file is indexed, not executed or proven by this inventory.",
    };
  }
  if (lifecycle === "config") {
    const checks = [];
    if (["package.json", "package-lock.json", ".replit", "replit.nix"].includes(name)) {
      checks.push("preflight:startup-contract");
    }
    checks.push("npm run test:master");
    return {
      status: "UNVERIFIED",
      checks,
      reason: "Configuration is mapped to repository checks; inventory alone does not validate its runtime effects.",
    };
  }
  if (lifecycle === "binary" || lifecycle === "asset") {
    return {
      status: "UNVERIFIED",
      checks: ["asset-specific acceptance (when consumed)"],
      reason: "Static inventory cannot establish correct loading, ownership, or runtime use.",
    };
  }
  return {
    status: "UNVERIFIED",
    checks: ["npm run check", "npm run lint", "npm run test:master"],
    reason: "These broad groups are candidate evidence links, not proof that each source path has a passing behavior case.",
  };
}

function runGit(root, args, timeout = 10_000) {
  const result = spawnSync("git", args, {
    cwd: root,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", LANG: "C" },
  });
  if (result.error) throw new Error(`git ${args.join(" ")} unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${result.status}: ${(result.stderr || Buffer.alloc(0)).toString("utf8").trim()}`);
  }
  return result.stdout;
}

function splitNul(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function parseStatus(buffer) {
  const records = splitNul(buffer);
  const worktreeChanged = new Set();
  const untrackedPaths = [];
  let consumedRenameSource = false;
  for (const record of records) {
    if (consumedRenameSource) {
      consumedRenameSource = false;
      continue;
    }
    const status = record.slice(0, 2);
    const name = record.slice(3);
    if (status === "??") untrackedPaths.push(name);
    else if (status[1] !== " ") worktreeChanged.add(name);
    if (status.includes("R") || status.includes("C")) consumedRenameSource = true;
  }
  return { raw: buffer.toString("utf8"), worktreeChanged, untrackedPaths };
}

async function hashFile(root, relativePath, deadline, includeContent = true) {
  const absolute = path.join(root, relativePath);
  let info;
  try {
    info = await fs.lstat(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return { sha256: null, kind: "missing", bytes: 0, hashStatus: "UNAVAILABLE" };
    throw error;
  }
  if (info.isSymbolicLink()) {
    const target = await fs.readlink(absolute);
    return { sha256: sha256(`symlink\0${target}`), kind: "symlink", bytes: Buffer.byteLength(target), hashStatus: "HASHED" };
  }
  if (!info.isFile()) {
    return { sha256: null, kind: "unsupported", bytes: 0, hashStatus: "UNAVAILABLE" };
  }
  if (!includeContent) {
    return { sha256: null, kind: "file", bytes: info.size, hashStatus: "NOT APPLICABLE" };
  }
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(absolute, { highWaterMark: 256 * 1024 })) {
    if (Date.now() > deadline) throw new Error(`Inventory exceeded ${MAX_INVENTORY_MS}ms while reading ${relativePath}`);
    bytes += chunk.length;
    digest.update(chunk);
  }
  return { sha256: digest.digest("hex"), kind: "file", bytes, hashStatus: "HASHED" };
}

async function mapConcurrent(items, limit, worker) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      result[index] = await worker(items[index], index);
    }
  }));
  return result;
}

function sourceRevision(root) {
  return runGit(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
}

function indexEntries(root) {
  const records = splitNul(runGit(root, ["ls-files", "--stage", "-z"]));
  return records.map(record => {
    const separator = record.indexOf("\t");
    const [mode, objectId, stage] = record.slice(0, separator).split(" ");
    return { path: record.slice(separator + 1), mode, objectId, stage: Number(stage) };
  });
}

async function buildInventory(root = DEFAULT_ROOT) {
  const started = Date.now();
  const deadline = started + MAX_INVENTORY_MS;
  const entries = indexEntries(root);
  if (entries.length === 0) throw new Error("Git returned an empty tracked-file inventory");
  const statusSnapshot = parseStatus(runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const worktreeChanged = statusSnapshot.worktreeChanged;
  const rows = await mapConcurrent(entries, 12, async entry => {
    const { path: name, mode, objectId, stage } = entry;
    const classification = classifyPath(name);
    let stat;
    if (stage !== 0) {
      stat = { sha256: null, kind: "conflict", bytes: null, hashStatus: "UNAVAILABLE" };
    } else if (worktreeChanged.has(name)) {
      stat = await hashFile(root, name, deadline, classification.sourceInput);
    } else if (mode === "160000") {
      stat = { sha256: sha256(`gitlink\0${objectId}`), kind: "gitlink", bytes: null, hashStatus: "HASHED" };
    } else if (classification.sourceInput) {
      stat = {
        sha256: null,
        kind: mode === "120000" ? "symlink" : "file",
        bytes: null,
        hashStatus: "GIT_OBJECT_ID",
      };
    } else {
      stat = {
        sha256: null,
        bytes: null,
        kind: mode === "120000" ? "symlink" : "file",
        hashStatus: "NOT APPLICABLE",
      };
    }
    if (stat.kind === "unsupported" || stat.kind === "conflict") classification.lifecycle = "UNVERIFIED";
    return {
      path: name,
      gitMode: mode,
      gitObjectId: objectId,
      ...classification,
      ...stat,
      contentHashReason: classification.sourceInput
        ? "Unchanged tracked bytes use the Git index object ID; modified and untracked input bytes are SHA-256 hashed."
        : NON_BEHAVIORAL_REASON[classification.lifecycle] ?? "Inventoried by path and metadata; not a current behavior input.",
    };
  });
  if (Date.now() > deadline) throw new Error(`Inventory exceeded ${MAX_INVENTORY_MS}ms`);
  const untrackedInputs = [];
  for (const name of statusSnapshot.untrackedPaths) {
    const classification = classifyPath(name);
    if (!classification.sourceInput) continue;
    const stat = await hashFile(root, name, deadline, true);
    untrackedInputs.push({ path: name, lifecycle: classification.lifecycle, ...stat });
  }
  const statuses = statusSnapshot.raw;
  const revision = sourceRevision(root);
  const inputRows = rows.filter(row => row.sourceInput).map(({ path: file, sha256: hash, lifecycle, gitMode, fileType, gitObjectId, hashStatus }) =>
    ({ path: file, sha256: hash, lifecycle, gitMode, fileType, gitObjectId, hashStatus }));
  const inputIdentity = sha256(canonical({
    tracked: inputRows,
    untracked: untrackedInputs.map(({ path: file, sha256: hash, lifecycle }) => ({ path: file, sha256: hash, lifecycle })),
  }));
  const dirtyInputIdentity = sha256(canonical({
    status: statuses,
    untrackedInputs: untrackedInputs.map(({ path: file, sha256: hash }) => ({ path: file, sha256: hash })),
    inputIdentity,
  }));
  const lifecycleCounts = Object.fromEntries(
    [...new Set(rows.map(row => row.lifecycle))].sort().map(value =>
      [value, rows.filter(row => row.lifecycle === value).length]),
  );
  const inventoryDigest = sha256(canonical(rows.map(({ path: file, sha256: hash, fileType, lifecycle, kind, bytes, hashStatus, gitMode, gitObjectId }) =>
    ({ path: file, sha256: hash, fileType, lifecycle, kind, bytes, hashStatus, gitMode, gitObjectId }))));
  const missing = rows.filter(row => row.kind === "missing").map(row => row.path);
  const unsupported = rows.filter(row => ["unsupported", "conflict"].includes(row.kind)).map(row => row.path);
  const identityUnavailable = rows.filter(row => row.sourceInput && !["HASHED", "GIT_OBJECT_ID"].includes(row.hashStatus)).map(row => row.path);
  const inventory = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceIdentity: {
      revision,
      inventorySha256: inventoryDigest,
      inputInventorySha256: inputIdentity,
      inputIdentityMethod: "SHA-256 of canonical file identities; clean tracked inputs use Git index object IDs, dirty and untracked inputs use SHA-256 of current bytes.",
      dirtyInputSha256: dirtyInputIdentity,
      dirty: statuses.length > 0,
    },
    trackedPathCount: rows.length,
    lifecycleCounts,
    trackedFiles: rows,
    untrackedInputFiles: untrackedInputs,
    missingTrackedPaths: missing,
    unsupportedTrackedPaths: unsupported,
    inputIdentityUnavailablePaths: identityUnavailable,
    inventorySha256: inventoryDigest,
    inventoryDurationMs: Date.now() - started,
  };
  return inventory;
}

function sealReport(report) {
  const copy = { ...report };
  delete copy.integrity;
  return { ...copy, integrity: { algorithm: "sha256", reportSha256: sha256(canonical(copy)) } };
}

function verifyReport(report) {
  if (!report || typeof report !== "object" || report.schemaVersion !== SCHEMA_VERSION ||
      report.integrity?.algorithm !== "sha256" || typeof report.integrity.reportSha256 !== "string") return false;
  const copy = { ...report };
  delete copy.integrity;
  return sha256(canonical(copy)) === report.integrity.reportSha256;
}

function statusFromCode(code, timedOut, blocked = false) {
  if (blocked) return "BLOCKED";
  if (timedOut) return "FAIL";
  return code === 0 ? "PASS" : "FAIL";
}

function commandResult(id, command, args, result) {
  return {
    id,
    command: [command, ...args],
    status: result.status,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    interrupted: result.interrupted,
    durationMs: result.durationMs,
    output: result.output ?? "",
    log: result.log,
    logSha256: result.logSha256,
    nextAction: result.status === "PASS" ? null : result.nextAction,
  };
}

async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, content, { flag: "wx", mode: 0o600 });
  await fs.rename(temp, file);
}

async function runOwned(command, args, {
  cwd,
  timeoutMs,
  logPath,
  env = cleanEnvironment(),
  signal,
} = {}) {
  const started = Date.now();
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const output = createWriteStream(logPath, { flags: "w", mode: 0o600 });
  await new Promise((resolve, reject) => {
    output.once("open", resolve);
    output.once("error", reject);
  });
  let child;
  let timedOut = false;
  let interrupted = false;
  let settled = false;
  let timeout;
  let hardKill;
  let abortHandler;
  let resolveClose;
  const closed = new Promise(resolve => { resolveClose = resolve; });
  const terminate = (reason) => {
    if (!child || settled) return;
    if (reason === "timeout") timedOut = true;
    else interrupted = true;
    try { process.kill(-child.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
    hardKill = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }, TERMINATION_GRACE_MS);
    hardKill.unref();
  };
  try {
    child = spawn(command, args, {
      cwd, env, detached: process.platform !== "win32",
      stdio: ["ignore", output, output],
    });
    child.once("error", error => {
      output.write(`\n[repository-verification] ${error.message}\n`);
      settled = true;
      resolveClose(127);
    });
    child.once("close", code => {
      settled = true;
      clearTimeout(hardKill);
      resolveClose(code ?? 1);
    });
    timeout = setTimeout(() => terminate("timeout"), timeoutMs);
    timeout.unref();
    if (signal) {
      abortHandler = () => terminate("interrupted");
      if (signal.aborted) abortHandler();
      else signal.addEventListener("abort", abortHandler, { once: true });
    }
    const exitCode = await closed;
    clearTimeout(timeout);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
    const outputClosed = new Promise(resolve => output.once("close", resolve));
    output.end();
    await outputClosed;
    const text = await fs.readFile(logPath, "utf8").catch(() => "");
    const blocked = exitCode === 127 && /\b(?:ENOENT|not found)\b/i.test(text);
    const status = statusFromCode(exitCode, timedOut, blocked);
    return {
      status,
      exitCode,
      timedOut,
      interrupted,
      durationMs: Date.now() - started,
      output: text.slice(-12_000),
      log: logPath,
      logSha256: sha256(text),
      nextAction: status === "BLOCKED" ? `Install or expose ${command}, then rerun this check.` :
        timedOut ? `Investigate the timeout; the owned process group was terminated after ${timeoutMs}ms.` :
          interrupted ? "Rerun the interrupted verification when ready." :
            status === "FAIL" ? `Inspect ${logPath} and fix the reported local failure.` : null,
    };
  } finally {
    clearTimeout(timeout);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
    if (!output.closed) output.destroy();
  }
}

function cleanEnvironment() {
  return {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: process.env.HOME || "/tmp",
    TMPDIR: process.env.TMPDIR || "/tmp",
    LANG: "C",
    CI: "1",
  };
}

async function runLocalCheck(id, command, args, root, runDirectory, timeoutMs = PREFLIGHT_COMMAND_TIMEOUT_MS) {
  const logPath = path.join(runDirectory, "logs", `${id}.log`);
  const result = await runOwned(command, args, { cwd: root, timeoutMs, logPath });
  return commandResult(id, command, args, result);
}

async function localPreflight(root, runDirectory, inventory) {
  const checks = [];
  const manifestPath = path.join(root, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const dev = manifest?.scripts?.dev;
    if (dev !== "node scripts/testing/repository-verification.mjs preflight && bash scripts/start-dev.sh") {
      throw new Error("package.json dev script does not gate the existing launcher behind repository preflight");
    }
    checks.push({
      id: "startup-contract",
      command: ["read package.json", "verify the preflight-to-launcher ordering"],
      status: "PASS",
      exitCode: 0,
      timedOut: false,
      durationMs: 0,
      output: "The development command runs preflight before the unchanged launcher.",
    });
  } catch (error) {
    checks.push({
      id: "startup-contract",
      command: ["read package.json", "verify the preflight-to-launcher ordering"],
      status: "FAIL",
      exitCode: 1,
      timedOut: false,
      durationMs: 0,
      output: error.message,
      nextAction: "Restore the preflight-first npm dev command and preserve scripts/start-dev.sh as the application launcher.",
    });
  }

  if (inventory.missingTrackedPaths.length || inventory.unsupportedTrackedPaths.length ||
      inventory.inputIdentityUnavailablePaths?.length) {
    const identityUnavailable = inventory.inputIdentityUnavailablePaths?.length > 0;
    checks.push({
      id: "tracked-inventory",
      command: ["git ls-files -z", "hash and classify every tracked path"],
      status: identityUnavailable && !inventory.missingTrackedPaths.length ? "BLOCKED" : "FAIL",
      exitCode: 1,
      timedOut: false,
      durationMs: inventory.inventoryDurationMs,
      output: JSON.stringify({
        missing: inventory.missingTrackedPaths.slice(0, 100),
        unsupported: inventory.unsupportedTrackedPaths.slice(0, 100),
        identityUnavailable: (inventory.inputIdentityUnavailablePaths ?? []).slice(0, 100),
      }),
      nextAction: "Restore missing tracked paths or resolve unavailable input hashes; no path may be silently omitted.",
    });
  } else {
    checks.push({
      id: "tracked-inventory",
      command: ["git ls-files -z", "hash and classify every tracked path"],
      status: "PASS",
      exitCode: 0,
      timedOut: false,
      durationMs: inventory.inventoryDurationMs,
      output: `${inventory.trackedPathCount} tracked paths classified; ${inventory.lifecycleCounts.source ?? 0} source, ${inventory.lifecycleCounts.tests ?? 0} test, ${inventory.lifecycleCounts.report ?? 0} report paths.`,
    });
  }

  const required = [
    ["node", process.execPath, ["--version"]],
    ["npm", "npm", ["--version"]],
    ["git", "git", ["--version"]],
    ["bash", "bash", ["--version"]],
    ["local-tsx", path.join(root, "node_modules/.bin/tsx"), ["--version"]],
  ];
  for (const [id, command, args] of required) {
    checks.push(await runLocalCheck(`tool-${id}`, command, args, root, runDirectory));
  }
  checks.push(await runLocalCheck(
    "launcher-shell-syntax", "bash", ["-n", "scripts/start-dev.sh"], root, runDirectory,
  ));
  checks.push(await runLocalCheck(
    "controller-syntax", process.execPath, ["--check", "scripts/testing/repository-verification.mjs"], root, runDirectory,
  ));

  const externalPrerequisites = [
    { id: "private-development-storage", status: "UNVERIFIED", reason: "The existing launcher checks its required development storage configuration; this offline gate does not read secrets." },
    { id: "local-services-and-database", status: "UNVERIFIED", reason: "Redis, sidecars, database reachability, migrations, and application health are outside this repository-only preflight." },
    { id: "providers-and-deployment", status: "BLOCKED", reason: "Provider delivery, production data, and deployment are intentionally not contacted or mutated by this controller." },
    { id: "hardware-and-device-acceptance", status: "BLOCKED", reason: "Specialized hardware and real desktop/mobile devices are not exercised by local preflight." },
  ];
  return { checks, externalPrerequisites };
}

function findingFromCheck(check) {
  if (check.status === "PASS" || check.status === "NOT APPLICABLE") return null;
  return {
    checkId: check.id,
    status: check.status,
    command: check.command,
    exitCode: check.exitCode,
    timedOut: check.timedOut,
    output: check.output,
    nextAction: check.nextAction ?? `Inspect the retained output for ${check.id} and rerun after correction.`,
  };
}

function overallGateStatus(checks) {
  if (checks.some(check => check.status === "FAIL")) return "FAIL";
  if (checks.some(check => check.status === "BLOCKED")) return "BLOCKED";
  if (checks.some(check => check.status === "UNVERIFIED")) return "UNVERIFIED";
  return "PASS";
}

function renderMarkdown(report, inventory) {
  const lines = [
    "# Repository verification",
    "",
    `- Mode: ${report.mode}`,
    `- Gate: **${report.gateStatus}**`,
    `- Overall readiness: **${report.readinessStatus}**`,
    `- Revision: \`${report.sourceIdentity?.revision ?? "unavailable"}\``,
    `- Input identity: \`${report.sourceIdentity?.inputInventorySha256 ?? "unavailable"}\``,
    `- Dirty-input identity: \`${report.sourceIdentity?.dirtyInputSha256 ?? "unavailable"}\``,
    `- Tracked paths: ${inventory?.trackedPathCount ?? "unavailable"} (enumerated; no completeness percentage)`,
    `- Report integrity: \`${report.integrity?.reportSha256 ?? "unsealed"}\``,
    "",
    "## Checks",
    "",
    `- File-to-check mapping: \`${report.inventory?.path ?? "unavailable"}\` (SHA-256 \`${report.inventory?.sha256 ?? "unavailable"}\`)`,
    "",
    "| Check | Status | Exact command | Exit | Duration | Evidence |",
    "| --- | --- | --- | ---: | ---: | --- |",
  ];
  for (const check of report.checks ?? []) {
    const command = (check.command ?? []).join(" ").replaceAll("|", "\\|");
    const evidence = String(check.log ?? check.output ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
    lines.push(`| ${check.id} | ${check.status} | \`${command}\` | ${check.exitCode ?? "—"} | ${check.durationMs ?? 0} ms | ${evidence} |`);
  }
  if (Object.keys(report.inventory?.lifecycleCounts ?? {}).length) {
    lines.push("", "## Tracked path lifecycle counts", "", "| Lifecycle | Paths |", "| --- | ---: |");
    for (const [lifecycle, count] of Object.entries(report.inventory.lifecycleCounts)) {
      lines.push(`| ${lifecycle} | ${count} |`);
    }
  }
  if (report.skipped?.length) {
    lines.push("", "## Skipped checks and blockers", "");
    for (const item of report.skipped) lines.push(`- **${item.status} — ${item.id}:** ${item.reason}`);
  }
  if (report.findings?.length) {
    lines.push("", "## Findings", "");
    for (const finding of report.findings) {
      lines.push(`- **${finding.status} — ${finding.checkId}:** ${finding.output || "No diagnostic output."} Next: ${finding.nextAction}`);
    }
  }
  if (report.externalPrerequisites?.length) {
    lines.push("", "## External and runtime prerequisites", "");
    for (const item of report.externalPrerequisites) lines.push(`- **${item.status} — ${item.id}:** ${item.reason}`);
  }
  lines.push(
    "",
    "This finite local report is not a production-readiness certification. A pass applies only to the listed commands and source identity.",
    "",
  );
  return lines.join("\n");
}

async function saveReport(runDirectory, report, inventory) {
  const inventoryPath = path.join(runDirectory, "inventory.json");
  await writeAtomic(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  report.inventory = {
    path: path.relative(report.repositoryRoot ?? DEFAULT_ROOT, inventoryPath),
    sha256: sha256(await fs.readFile(inventoryPath)),
    trackedPathCount: inventory.trackedPathCount,
    lifecycleCounts: inventory.lifecycleCounts,
  };
  report.sourceIdentity = inventory.sourceIdentity;
  report.findings = (report.checks ?? []).map(findingFromCheck).filter(Boolean);
  report.gateStatus = overallGateStatus(report.checks ?? []);
  report.readinessStatus = "UNVERIFIED";
  report.productionReady = false;
  const sealed = sealReport(report);
  if (!verifyReport(sealed)) throw new Error("Internal report integrity verification failed");
  await writeAtomic(path.join(runDirectory, "report.json"), `${JSON.stringify(sealed, null, 2)}\n`);
  await writeAtomic(path.join(runDirectory, "report.md"), renderMarkdown(sealed, inventory));
  return sealed;
}

function newRunDirectory(root) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(root, ".local", "repository-verification", "runs", `${timestamp}-${process.pid}-${randomUUID()}`);
}

async function runPreflight(root, runDirectory) {
  const startedAt = new Date().toISOString();
  let inventory = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceIdentity: {
      revision: null,
      inventorySha256: null,
      inputInventorySha256: null,
      dirtyInputSha256: null,
      dirty: null,
    },
    trackedPathCount: 0,
    lifecycleCounts: {},
    trackedFiles: [],
    untrackedInputFiles: [],
    missingTrackedPaths: [],
    unsupportedTrackedPaths: [],
    inventorySha256: null,
    inventoryDurationMs: 0,
    error: null,
  };
  const checks = [];
  let externalPrerequisites = [];
  try {
    inventory = await buildInventory(root);
    const result = await localPreflight(root, runDirectory, inventory);
    checks.push(...result.checks);
    externalPrerequisites = result.externalPrerequisites;
  } catch (error) {
    inventory.error = error.message;
    checks.push({
      id: "tracked-inventory",
      command: ["git ls-files -z", "hash and classify every tracked path"],
      status: /unavailable|not a git repository|timed out/i.test(error.message) ? "BLOCKED" : "FAIL",
      exitCode: 1,
      timedOut: /exceeded|timed out/i.test(error.message),
      durationMs: 0,
      output: error.message,
      nextAction: "Restore Git access and rerun; inventory failure must not be treated as a pass.",
    });
  }
  let afterInventory;
  if (inventory.sourceIdentity.inputInventorySha256) {
    try {
      afterInventory = await buildInventory(root);
      const unchanged = inventory.sourceIdentity.inputInventorySha256 === afterInventory.sourceIdentity.inputInventorySha256 &&
        inventory.sourceIdentity.dirtyInputSha256 === afterInventory.sourceIdentity.dirtyInputSha256;
      checks.push({
        id: "source-drift",
        command: ["rehash tracked and untracked inputs", "compare preflight input identity"],
        status: unchanged ? "PASS" : "FAIL",
        exitCode: unchanged ? 0 : 1,
        timedOut: false,
        durationMs: afterInventory.inventoryDurationMs,
        output: unchanged ? "Behavior-relevant input identity stayed unchanged during preflight." :
          `Source changed during preflight: before=${inventory.sourceIdentity.inputInventorySha256}; after=${afterInventory.sourceIdentity.inputInventorySha256}.`,
        nextAction: unchanged ? null : "Rerun from a stable checkout; do not reuse this report as current evidence.",
      });
      if (!unchanged) inventory = afterInventory;
    } catch (error) {
      checks.push({
        id: "source-drift",
        command: ["rehash tracked and untracked inputs", "compare preflight input identity"],
        status: "FAIL",
        exitCode: 1,
        timedOut: /exceeded|timed out/i.test(error.message),
        durationMs: 0,
        output: error.message,
        nextAction: "Investigate the failed final source snapshot and rerun.",
      });
    }
  }
  const report = {
    schemaVersion: SCHEMA_VERSION,
    mode: "preflight",
    repositoryRoot: root,
    startedAt,
    finishedAt: new Date().toISOString(),
    scope: "Bounded offline repository checks only; no application services, credentials, migrations, providers, or production systems.",
    executionPolicy: {
      inventoryDeadlineMs: MAX_INVENTORY_MS,
      perCommandTimeoutMs: PREFLIGHT_COMMAND_TIMEOUT_MS,
      maximumExpectedDurationMs: 120_000,
      concurrentFileReads: 12,
      retries: 0,
    },
    checks,
    externalPrerequisites,
    skipped: [
      { id: "full-test-groups", status: "UNVERIFIED", reason: "The comprehensive repository suite is available only through the explicit verify:repository command." },
      { id: "provider-destructive-hardware-production", status: "BLOCKED", reason: "These checks require separate authorization, owned isolated resources, hardware, or deployment access." },
    ],
  };
  return { report: await saveReport(runDirectory, report, inventory), inventory };
}

async function runFullSweep(root, runDirectory, abortController) {
  const startedAt = new Date().toISOString();
  const preflight = await runPreflight(root, runDirectory);
  if (preflight.report.gateStatus !== "PASS") {
    const report = {
      ...preflight.report,
      mode: "full",
      startedAt,
      finishedAt: new Date().toISOString(),
      skipped: [
        ...(preflight.report.skipped ?? []),
        { id: "full-test-groups", status: "BLOCKED", reason: "Required local preflight did not pass; existing verification groups were not started." },
      ],
    };
    return saveReport(runDirectory, report, preflight.inventory);
  }

  const outputDirectory = path.join(runDirectory, "existing-groups");
  const python = await findExecutable("python3", root);
  const args = [
    path.join(root, "scripts/testing/run-all.py"),
    "--output", outputDirectory,
  ];
  const childLog = path.join(runDirectory, "logs", "full-sweep.log");
  const result = await runOwned(python ?? "python3", args, {
    cwd: root,
    timeoutMs: FULL_SWEEP_TIMEOUT_MS,
    logPath: childLog,
    env: cleanEnvironment(),
    signal: abortController.signal,
  });
  const checks = [...preflight.report.checks];
  checks.push(commandResult(
    "existing-verification-groups", python ?? "python3", args, result,
  ));
  let groupsReport = null;
  try {
    groupsReport = JSON.parse(await fs.readFile(path.join(outputDirectory, "orchestration/results.json"), "utf8"));
  } catch {
    checks[checks.length - 1].status = result.status === "PASS" ? "FAIL" : result.status;
    checks[checks.length - 1].output += "\nExisting runner did not produce a readable orchestration results file.";
  }
  if (groupsReport) {
    for (const row of [...(groupsReport.runs ?? []), ...(groupsReport.postprocessing ?? [])]) {
      const status = row.timedOut ? "FAIL" : row.exitCode === 0 && row.status === "passed" ? "PASS" : row.status === "blocked" ? "BLOCKED" : "FAIL";
      checks.push({
        id: `group:${row.group ?? "postprocessing"}/${row.id}`,
        command: row.command ?? [],
        status,
        exitCode: row.exitCode,
        timedOut: Boolean(row.timedOut),
        durationMs: Math.round((row.durationSeconds ?? 0) * 1000),
        log: row.log,
        logSha256: row.logSha256,
        output: row.error ?? "",
        nextAction: status === "PASS" ? null : `Inspect retained group output ${row.log ?? ""} and resolve its concrete failure or prerequisite.`,
      });
    }
    const sourceReceiptStatus = groupsReport.sourceInputsUnchanged === true ? "PASS" :
      groupsReport.sourceInputsUnchanged === false ? "FAIL" : "BLOCKED";
    checks.push({
      id: "existing-runner-source-integrity",
      command: ["scripts/testing/common.py source_inputs", "compare existing runner input receipt"],
      status: sourceReceiptStatus,
      exitCode: sourceReceiptStatus === "PASS" ? 0 : 1,
      timedOut: false,
      durationMs: 0,
      output: `Existing runner sourceInputsUnchanged=${String(groupsReport.sourceInputsUnchanged)}; sha256=${groupsReport.sourceInputsSha256 ?? "unavailable"}.`,
      nextAction: sourceReceiptStatus === "PASS" ? null : "Treat group outcomes as stale or blocked; inspect the runner's source-input receipt and rerun on stable inputs.",
    });
  }
  const readinessOutput = path.join(runDirectory, "launch-readiness");
  const readinessArgs = [
    path.join(root, "scripts/testing/launch-readiness-audit.py"),
    "--register", path.join(outputDirectory, "platform-register.json"),
    "--plan", path.join(outputDirectory, "completion-plan.json"),
    "--output", readinessOutput,
  ];
  let readinessCheck;
  if (result.interrupted || result.timedOut || result.status === "BLOCKED") {
    readinessCheck = {
      id: "launch-readiness-audit",
      command: [python ?? "python3", ...readinessArgs],
      status: "BLOCKED",
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      output: "The launch-readiness audit was not started because the full verification runner was interrupted, timed out, or unavailable.",
      nextAction: "Resolve or restart the incomplete full sweep before relying on a launch-readiness assessment.",
    };
  } else {
    const readinessResult = await runOwned(python ?? "python3", readinessArgs, {
      cwd: root,
      timeoutMs: 180_000,
      logPath: path.join(runDirectory, "logs", "launch-readiness-audit.log"),
      env: cleanEnvironment(),
      signal: abortController.signal,
    });
    readinessCheck = commandResult("launch-readiness-audit", python ?? "python3", readinessArgs, readinessResult);
    if (readinessCheck.status === "PASS") {
      const summaryLine = readinessResult.output.trim().split("\n").at(-1);
      try {
        const auditSummary = JSON.parse(summaryLine);
        readinessCheck.output = JSON.stringify(auditSummary);
        if (auditSummary.sourceFreshness !== "PASS") {
          readinessCheck.status = "UNVERIFIED";
          readinessCheck.nextAction = "Refresh the canonical register and completion plan from current source, then rerun the full verification.";
        }
      } catch {
        readinessCheck.status = "FAIL";
        readinessCheck.nextAction = "Inspect the retained launch-readiness audit output; its source-freshness summary could not be verified.";
      }
    }
  }
  checks.push(readinessCheck);
  const after = await buildInventory(root).catch(error => ({ error: error.message }));
  const beforeIdentity = preflight.inventory.sourceIdentity;
  const drift = !after.sourceIdentity ||
    beforeIdentity.inputInventorySha256 !== after.sourceIdentity.inputInventorySha256 ||
    beforeIdentity.dirtyInputSha256 !== after.sourceIdentity.dirtyInputSha256;
  checks.push({
    id: "full-sweep-source-drift",
    command: ["rehash tracked and untracked inputs", "compare pre-run and post-run identity"],
    status: drift ? "FAIL" : "PASS",
    exitCode: drift ? 1 : 0,
    timedOut: false,
    durationMs: after.inventoryDurationMs ?? 0,
    output: drift ? `Source identity changed or final inventory failed: ${after.error ?? `${beforeIdentity.inputInventorySha256} -> ${after.sourceIdentity?.inputInventorySha256}`}` :
      "Behavior-relevant source inputs remained unchanged throughout the full sweep.",
    nextAction: drift ? "Treat group results as stale, inspect changed input paths, and rerun from a stable checkout." : null,
  });
  checks.push({
    id: "providers-deployment-hardware-destructive",
    command: [],
    status: "BLOCKED",
    exitCode: null,
    timedOut: false,
    durationMs: 0,
    output: "Provider, production/deployment, destructive, and specialized hardware/device checks were not run.",
    nextAction: "Use a separately authorized, isolated acceptance procedure for each external prerequisite.",
  });
  const report = {
    schemaVersion: SCHEMA_VERSION,
    mode: "full",
    startedAt,
    finishedAt: new Date().toISOString(),
    scope: "Existing local verification groups; reports are source-bound. External, destructive, hardware, and deployment acceptance remains blocked.",
    executionPolicy: {
      fullSweepTimeoutMs: FULL_SWEEP_TIMEOUT_MS,
      readinessAuditTimeoutMs: 180_000,
      commandOrdering: "sequential",
      processGroupTerminationGraceMs: TERMINATION_GRACE_MS,
      retries: 0,
    },
    checks,
    externalPrerequisites: preflight.report.externalPrerequisites,
    skipped: [
      { id: "provider-checks", status: "BLOCKED", reason: "No provider credentials are forwarded and no provider group is opted in." },
      { id: "production-deployment-checks", status: "BLOCKED", reason: "Production and deployment are not accessed." },
      { id: "destructive-hardware-device-checks", status: "BLOCKED", reason: "Requires separate explicit authorization or unavailable hardware." },
      { id: "readiness-gauge", status: "UNVERIFIED", reason: "Its generic profile includes health, environment, build, and test checks outside this offline orchestration; the source-bound launch-readiness audit is run separately." },
    ],
    existingRunner: {
      command: [python ?? "python3", ...args],
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      interrupted: result.interrupted,
      log: childLog,
      resultPath: path.join(outputDirectory, "orchestration/results.json"),
      sourceInputsUnchanged: groupsReport?.sourceInputsUnchanged ?? null,
      selectedGroups: groupsReport?.selectedGroups ?? [],
      runnerStatus: groupsReport?.status ?? "unavailable",
    },
  };
  const finalInventory = after.sourceIdentity ? after : preflight.inventory;
  return saveReport(runDirectory, report, finalInventory);
}

async function findExecutable(name, cwd) {
  const result = spawnSync("bash", ["-c", "command -v -- \"$1\"", "verification", name], {
    cwd, encoding: "utf8", timeout: 3_000, env: cleanEnvironment(),
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function installSignalHandlers(controller) {
  const handler = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}

function parseArgs(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return { help: true };
  const mode = args[0] ?? "preflight";
  const options = { mode, root: DEFAULT_ROOT, apply: false };
  for (let index = 1; index < args.length; index++) {
    if (args[index] === "--root" && args[index + 1]) options.root = path.resolve(args[++index]);
    else if (args[index] === "--plan" && args[index + 1]) options.planPath = path.resolve(args[++index]);
    else if (args[index] === "--plan-sha256" && args[index + 1]) options.expectedPlanSha256 = args[++index];
    else if (args[index] === "--apply") options.apply = true;
    else if (args[index] === "--help" || args[index] === "-h") return { help: true };
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!["preflight", "full", "execute"].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  if (mode === "execute" && !options.planPath) throw new Error("execute mode requires --plan <manifest.json>");
  if (mode !== "execute" && (options.planPath || options.expectedPlanSha256 || options.apply)) {
    throw new Error("--plan, --plan-sha256, and --apply are valid only in execute mode");
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(`repository-verification: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log("Usage: node scripts/testing/repository-verification.mjs [preflight|full|execute] [options]");
    console.log("preflight is offline and bounded; full runs local verification groups.");
    console.log("execute applies a reviewed source-bound plan only when --apply and --plan-sha256 are supplied.");
    return 0;
  }
  const controller = new AbortController();
  const removeHandlers = installSignalHandlers(controller);
  if (options.mode === "execute") {
    try {
      const { executeCompletionPlan } = await import("./completion-executor.mjs");
      const report = await executeCompletionPlan({ ...options, signal: controller.signal });
      console.log(`Completion plan ${report.status}; product readiness remains ${report.readinessStatus}.`);
      console.log(`Report: ${report.reportPath}`);
      console.log(`Journal: ${report.journalPath}`);
      if (report.blockReason) console.error(report.blockReason);
      return ["APPLIED_VERIFIED", "ALREADY_APPLIED_VERIFIED", "DRY_RUN_READY"].includes(report.status) ? 0 : 1;
    } catch (error) {
      console.error(`repository-verification: ${error.message}`);
      return 1;
    } finally {
      removeHandlers();
    }
  }
  const runDirectory = newRunDirectory(options.root);
  let result;
  try {
    result = options.mode === "preflight"
      ? await runPreflight(options.root, runDirectory)
      : { report: await runFullSweep(options.root, runDirectory, controller) };
  } catch (error) {
    console.error(`repository-verification: ${error.message}`);
    return 1;
  } finally {
    removeHandlers();
  }
  const report = result.report;
  console.log(`Repository verification ${report.gateStatus}; readiness remains ${report.readinessStatus}.`);
  console.log(`Report: ${path.join(runDirectory, "report.md")}`);
  console.log(`Inventory: ${path.join(runDirectory, "inventory.json")}`);
  for (const finding of report.findings ?? []) {
    console.error(`${finding.status}: ${finding.checkId}: ${finding.output}`);
    if (finding.nextAction) console.error(`  Next: ${finding.nextAction}`);
  }
  return report.gateStatus === "PASS" ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then(code => { process.exitCode = code; })
    .catch(error => { console.error(`repository-verification: ${error.message}`); process.exitCode = 1; });
}

export {
  buildInventory,
  canonical,
  classifyPath,
  cleanEnvironment,
  main,
  runOwned,
  sealReport,
  verifyReport,
};

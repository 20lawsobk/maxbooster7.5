import fs from "node:fs";
import path from "node:path";
import {spawn, execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_OUTPUT = path.join(ROOT, "reports", "aso");
export const REQUIRED_EXTERNAL = [
  "authentication", "tenant-isolation", "billing", "music-distribution",
  "ai-model-quality", "data-integrity", "backup-restore", "load-and-soak",
  "deployment-startup", "monitoring-alerts", "accessibility", "owner-release-approval",
];

export function option(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i < 0 ? fallback : argv[i + 1];
}
export function integerOption(argv, name, fallback, limit = 100) {
  const value = Number(option(argv, name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) throw new Error("Invalid " + name);
  return value;
}
export function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function git(args) {
  return execFileSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024}).trim();
}
export function revision() { return git(["rev-parse", "HEAD"]); }
export function branch() { return git(["branch", "--show-current"]); }
export function clean() { return git(["status", "--porcelain", "--untracked-files=normal"]) === ""; }
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", {mode: 0o600});
  fs.renameSync(temp, file);
}
export function readJson(file, otherwise = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return otherwise; throw error; }
}
export function inventory() {
  // --cached covers the entire tracked Git index, not only app/ or web/ paths.
  const raw = execFileSync("git", ["ls-files", "--cached", "--stage", "-z"], {
    cwd: ROOT, maxBuffer: 128 * 1024 * 1024,
  }).toString("utf8");
  const files = [];
  const counts = {};
  const groupFor = name => {
    if (name.startsWith("client/")) return "frontend";
    if (name.startsWith("server/")) return "backend";
    if (name.startsWith("shared/")) return "shared";
    if (/^(db|database|migrations|drizzle)(\/|$)/.test(name)) return "database";
    if (name.startsWith("external/")) return "external-ai-and-services";
    if (name.startsWith("tests/") || name.startsWith("test/") || name.startsWith("evaluations/")) return "testing-and-evaluation";
    if (name.startsWith("scripts/") || name.startsWith("script/")) return "automation-and-build";
    if (/^(\.github|\.replit|replit\.nix|Dockerfile|docker|infra|k8s|terraform|deploy|build\.sh|start\.sh)/.test(name)) return "infrastructure";
    if (/^(docs\/|README|PRODUCTION_READINESS)/.test(name)) return "docs-and-launch-evidence";
    if (/\.(png|jpe?g|webp|gif|mp3|wav|mp4|pdf|bin|onnx|pt|safetensors)$/i.test(name)) return "media-and-model-assets";
    return "other-root-and-subsystems";
  };
  const missing = [], special = [];
  for (const record of raw.split("\0").filter(Boolean)) {
    const m = record.match(/^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/);
    if (!m) throw new Error("Unexpected git index record");
    const [, mode, blob, stage, name] = m;
    if (stage !== "0") throw new Error("Unmerged index entry: " + name);
    const group = groupFor(name);
    counts[group] = (counts[group] ?? 0) + 1;
    files.push({path: name, mode, blob, group});
    if (!fs.existsSync(path.join(ROOT, name))) missing.push(name);
    if (mode !== "100644" && mode !== "100755") special.push({path: name, mode});
  }
  if (!files.length) throw new Error("Empty git inventory");
  return {revision: revision(), count: files.length, counts, missing, special, files};
}
export async function execute(id, argv, out, timeoutMs, env = {}) {
  fs.mkdirSync(out, {recursive: true});
  const logfile = path.join(out, id.replace(/[^a-z0-9_-]/gi, "_") + ".log");
  const stream = fs.createWriteStream(logfile, {mode: 0o600});
  let written = 0, truncated = false, timedOut = false, spawnError = null, signal = null, code = null;
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: ROOT, env: {...process.env, ...env}, shell: false,
    detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  function capture(chunk) {
    const limit = 4 * 1024 * 1024;
    const data = Buffer.from(chunk);
    if (written < limit) {
      const part = data.subarray(0, limit - written);
      written += part.length;
      stream.write(part);
    }
    if (written >= limit && !truncated) {
      stream.write("\n[ASO LOG CAP REACHED: output truncated]\n");
      truncated = true;
    }
  }
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  const terminate = sig => {
    if (!child.pid) return;
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, sig); }
    catch (error) { if (error.code !== "ESRCH") capture(Buffer.from(error.message)); }
  };
  let timer, killer;
  const result = await new Promise(resolve => {
    child.on("error", error => { spawnError = error.code ?? String(error); });
    child.on("close", (exitCode, exitSignal) => {
      code = exitCode; signal = exitSignal;
      clearTimeout(timer); clearTimeout(killer);
      resolve();
    });
    timer = setTimeout(() => {
      timedOut = true; terminate("SIGTERM");
      killer = setTimeout(() => terminate("SIGKILL"), 5000);
    }, timeoutMs);
  });
  await new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve()));
  return {
    id, command: argv, startedAt, finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started, exitCode: code, signal, timedOut, spawnError,
    status: !timedOut && !spawnError && code === 0 && !signal ? "pass" : "fail",
    log: path.relative(ROOT, logfile), truncated,
  };
}
export function externalEvidence(file, currentRevision) {
  if (!file) return {valid: false, reason: "External release evidence not supplied"};
  try {
    const location = path.resolve(file);
    if (location.startsWith(ROOT + path.sep)) return {valid: false, reason: "Release approval must be supplied outside the repository"};
    const document = readJson(location);
    if (document?.commit !== currentRevision) return {valid: false, reason: "Release evidence does not match HEAD"};
    const absent = [];
    for (const id of REQUIRED_EXTERNAL) {
      const row = document.checks?.[id];
      if (!row || row.status !== "pass" || typeof row.receipt !== "string" || !row.receipt.trim()) absent.push(id);
    }
    if (absent.length) return {valid: false, reason: "Missing independent receipts", missing: absent};
    if (!document.approvedBy || !document.approvedAt || !document.releaseId) {
      return {valid: false, reason: "Operator release approval is incomplete"};
    }
    const when = Date.parse(document.approvedAt);
    if (!Number.isFinite(when) || when > Date.now() + 60_000 || when < Date.now() - 86_400_000) {
      return {valid: false, reason: "Operator approval is expired or future-dated"};
    }
    return {valid: true, reason: "Operator-provided evidence structurally complete; source authenticity remains an operator responsibility"};
  } catch (error) { return {valid: false, reason: "Cannot read release evidence: " + error.message}; }
}
export function ensureRepairBranch() {
  const current = branch();
  if (!current || current === "main" || current === "master" || !current.startsWith("aso/")) {
    throw new Error("Repairs require an explicitly created aso/ feature branch, never main");
  }
  if (!clean()) throw new Error("Repair worktree must be clean; preserve user edits before running");
}

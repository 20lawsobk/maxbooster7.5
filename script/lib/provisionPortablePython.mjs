import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PORTABLE_PYTHON_VERSION = "3.12.13";
const RELEASE_DATE = "20260325";
const RELEASE_URL =
  `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_DATE}/` +
  `cpython-${PORTABLE_PYTHON_VERSION}%2B${RELEASE_DATE}-x86_64-unknown-linux-gnu-install_only.tar.gz`;

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 30 * 60 * 1000,
    stdio: options.stdio ?? "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || "").trim().slice(-2000);
    throw new Error(`${commandName} exited ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return String(result.stdout ?? "");
}

function downloadArchive(url, destination) {
  command("curl", [
    "--fail", "--silent", "--show-error", "--location",
    "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2",
    "--retry", "2", "--connect-timeout", "15", "--max-time", "180",
    "--output", destination, url,
  ], { timeout: 210_000 });
}

function validateArchive(archivePath) {
  const members = command("tar", ["--list", "--gzip", "--file", archivePath], {
    timeout: 120_000,
  }).split(/\r?\n/).filter(Boolean);
  if (!members.includes("python/bin/python3")) {
    throw new Error("portable Python archive is missing python/bin/python3");
  }
  for (const member of members) {
    const normalized = path.posix.normalize(member.replace(/\/+$/, ""));
    if (
      member.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      (normalized !== "python" && !normalized.startsWith("python/"))
    ) {
      throw new Error("portable Python archive contains a path outside its expected root");
    }
  }
}

function runRuntimeCheck(runtime, expectedVersion, root, run = command) {
  const python = path.join(runtime, "bin/python3");
  if (!fs.existsSync(python) || !fs.statSync(python).isFile() || !(fs.statSync(python).mode & 0o111)) {
    throw new Error("portable Python runtime has no executable bin/python3");
  }
  const actualVersion = run(python, ["--version"], { timeout: 15_000 }).trim();
  if (actualVersion !== `Python ${expectedVersion}`) {
    throw new Error(`portable Python version mismatch: expected ${expectedVersion}, received ${actualVersion}`);
  }
  run(python, [
    "-I", "-B", path.join(root, "script/lib/installPortablePythonDependencies.py"),
    runtime, "--verify-only",
  ], { cwd: root, timeout: 120_000 });
}

function replaceRuntime(stagedRuntime, runtime) {
  const backup = `${runtime}.previous-${randomUUID()}`;
  let hasBackup = false;
  try {
    if (fs.existsSync(runtime) || fs.lstatSync(runtime, { throwIfNoEntry: false })?.isSymbolicLink()) {
      const stat = fs.lstatSync(runtime);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("existing python_runtime must be a real directory before replacement");
      }
      fs.renameSync(runtime, backup);
      hasBackup = true;
    }
    fs.renameSync(stagedRuntime, runtime);
  } catch (error) {
    if (hasBackup && !fs.existsSync(runtime)) fs.renameSync(backup, runtime);
    throw error;
  }
  if (hasBackup) fs.rmSync(backup, { recursive: true, force: true });
}

export function provisionPortablePython(root, options = {}) {
  root = path.resolve(root);
  const expectedVersion = options.version ?? PORTABLE_PYTHON_VERSION;
  const url = options.url ?? RELEASE_URL;
  const run = options.run ?? command;
  const download = options.download ?? downloadArchive;
  const runtime = path.join(root, "python_runtime");
  const existing = fs.lstatSync(runtime, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) {
    throw new Error("python_runtime must be a real directory, not a symlink or file");
  }

  if (existing) {
    try {
      runRuntimeCheck(runtime, expectedVersion, root, run);
      console.log(`Verified existing isolated Python ${expectedVersion} and locked runtime dependencies`);
      return { runtime, version: expectedVersion, reused: true };
    } catch {
      console.warn("Existing portable Python did not pass full verification; retaining it until a staged replacement passes.");
    }
  }

  const stageRoot = fs.mkdtempSync(path.join(root, ".python-runtime-stage-"));
  const archive = path.join(stageRoot, "python.tar.gz");
  const stagedRuntime = path.join(stageRoot, "python_runtime");
  fs.mkdirSync(stagedRuntime);
  try {
    console.log(`Downloading portable Python ${expectedVersion} to an isolated staging directory...`);
    download(url, archive);
    if (!fs.statSync(archive).isFile() || fs.statSync(archive).size === 0) {
      throw new Error("portable Python download produced an empty archive");
    }
    validateArchive(archive);
    run("tar", [
      "--extract", "--gzip", "--file", archive,
      "--directory", stagedRuntime, "--strip-components=1",
      "--no-same-owner", "--no-same-permissions", "python/",
    ], { timeout: 10 * 60 * 1000, stdio: "inherit" });
    const python = path.join(stagedRuntime, "bin/python3");
    if (!fs.existsSync(python)) throw new Error("portable Python extraction did not produce bin/python3");
    const actualVersion = run(python, ["--version"], { timeout: 15_000 }).trim();
    if (actualVersion !== `Python ${expectedVersion}`) {
      throw new Error(`downloaded Python version mismatch: expected ${expectedVersion}, received ${actualVersion}`);
    }

    console.log("Installing and verifying MaxCore and diffusion runtime dependencies in staging...");
    run(python, [
      "-I", "-B", path.join(root, "script/lib/installPortablePythonDependencies.py"),
      stagedRuntime,
    ], { cwd: root, timeout: 30 * 60 * 1000, stdio: "inherit" });
    runRuntimeCheck(stagedRuntime, expectedVersion, root, run);

    replaceRuntime(stagedRuntime, runtime);
    console.log(`Portable Python ${expectedVersion} atomically installed and verified at ${runtime}`);
    return { runtime, version: expectedVersion, reused: false };
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    provisionPortablePython(root);
  } catch (error) {
    console.error(`[portable-python] Provisioning failed; existing runtime was not replaced: ${error.message}`);
    process.exitCode = 1;
  }
}

// Frozen reconciliation of independent pnpm workspaces. Default is offline diagnosis.
// Install lifecycle scripts are never run. No app entry point is executed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectDependencies } from "./verify-runtime-artifacts.mjs";

const allowed = ["external/maxcore", "external/pdim"];
const configuration = new Set(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]);
const excluded = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "target"]);
export function snapshot(root) {
  const files = new Map();
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && !excluded.has(entry.name)) visit(file);
      else if (entry.isFile() && configuration.has(entry.name)) files.set(path.relative(root, file), fs.readFileSync(file));
    }
  }
  visit(root);
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
    if (!files.has(name)) throw new Error(`Missing required workspace input: ${name}`);
  }
  return files;
}
function hashes(files) {
  return Object.fromEntries([...files].map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]));
}
function unchanged(root, before) {
  if (JSON.stringify(hashes(snapshot(root))) !== JSON.stringify(hashes(before))) throw new Error("Workspace configuration changed during reconciliation; refusing promotion");
}
export function reconcile(root, { apply = false, offline = true, pnpm = "pnpm", timeout = 120000 } = {}) {
  root = fs.realpathSync(root);
  const before = snapshot(root);
  const temp = fs.mkdtempSync(path.join(apply ? path.dirname(root) : os.tmpdir(), ".nested-pnpm-"));
  const stage = path.join(temp, "workspace");
  fs.mkdirSync(stage);
  let promoted = false;
  try {
    if (apply && fs.statSync(temp).dev !== fs.statSync(root).dev) throw new Error("Staging and workspace require the same filesystem for atomic directory renames");
    for (const [file, bytes] of before) {
      fs.mkdirSync(path.dirname(path.join(stage, file)), { recursive: true });
      fs.writeFileSync(path.join(stage, file), bytes);
    }
    const args = ["install", "--frozen-lockfile", "--ignore-scripts", "--reporter=append-only",
      "--config.manage-package-manager-versions=false"];
    if (offline) args.push("--offline");
    if (!apply) args.push("--lockfile-only");
    // Keep registry/auth configuration available to pnpm, but disable lifecycle scripts
    // and implicit manager downloads. pnpm output may contain registry diagnostics.
    const result = spawnSync(pnpm, args, {
      cwd: stage, env: { ...process.env, CI: "true", npm_config_ignore_scripts: "true",
        npm_config_manage_package_manager_versions: "false" },
      timeout, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(`Frozen ${apply ? "install" : "lock diagnosis"} failed (${result.status}): ${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    unchanged(stage, before);
    unchanged(root, before);
    if (!apply) return { ready: true, mode: "offline-lock-diagnosis", inputs: hashes(before), installed: false };
    const stagedGate = inspectDependencies(stage, ["."]);
    if (!stagedGate.ready) throw new Error(`Clean installed tree rejected: ${stagedGate.failures.join("\n")}`);
    // Only generated node_modules directories are exchanged; never sources or locks.
    const parents = [...new Set(["", ...[...before.keys()].filter(file => path.basename(file) === "package.json").map(path.dirname)])];
    const moves = [];
    try {
      for (const parent of parents) {
        const live = path.resolve(root, parent, "node_modules");
        if (moves.some(move => move.live === live)) continue;
        const fresh = path.resolve(stage, parent, "node_modules");
        const backup = path.join(temp, `backup-${moves.length}`);
        const move = { live, fresh, backup, saved: false, installed: false };
        moves.push(move);
        if (fs.existsSync(live)) { fs.renameSync(live, backup); move.saved = true; }
        if (fs.existsSync(fresh)) { fs.renameSync(fresh, live); move.installed = true; }
      }
      unchanged(root, before);
      const verified = inspectDependencies(root, ["."]);
      if (!verified.ready) throw new Error(`Promoted tree rejected: ${verified.failures.join("\n")}`);
      promoted = true;
      return { ready: true, mode: "frozen-reconciled", inputs: hashes(before), installed: true,
        lifecycleScriptsExecuted: false, nativeRuntimeAcceptance: "not tested", resolutions: verified.resolutions };
    } catch (error) {
      for (const move of moves.reverse()) {
        if (move.installed) fs.rmSync(move.live, { recursive: true, force: true });
        if (move.saved) fs.renameSync(move.backup, move.live);
      }
      throw error;
    }
  } finally {
    // If rollback itself failed, preserve remaining backups for manual recovery.
    const backups = fs.readdirSync(temp).filter(name => name.startsWith("backup-"));
    if (!promoted && backups.length) console.error(`Recovery backups retained at ${temp}`);
    else fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--apply", "--online", ...allowed].includes(arg))) throw new Error("Usage: node scripts/reconcile-nested-dependencies.mjs [--apply] [--online] [external/maxcore|external/pdim]");
    const scopes = args.filter(arg => allowed.includes(arg));
    if (args.includes("--online") && !args.includes("--apply")) throw new Error("--online requires explicit --apply");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    for (const scope of scopes.length ? scopes : allowed) {
      const result = reconcile(path.join(root, scope), { apply: args.includes("--apply"), offline: !args.includes("--online"), timeout: args.includes("--apply") ? 240000 : 60000 });
      console.log(JSON.stringify({ workspace: scope, ...result }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
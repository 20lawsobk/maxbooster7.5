// The retained legacy tree is a gitlink without a working submodule checkout.
// Persist its dependency updates in the main repo, and replay only exact known
// versions. Never replace a directory, delete files, or overwrite custom edits.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const digest = content => createHash("sha256").update(content).digest("hex");
const bundlePath = fileURLToPath(new URL("../tools/legacy-security-update.json", import.meta.url));
export function applyLegacyUpdate(root, bundle, { apply = false, ifPresent = false } = {}) {
  root = fs.realpathSync(root);
  const legacy = path.join(root, "maxbooster7.5");
  if (!fs.existsSync(legacy)) {
    if (ifPresent) return { present: false, pending: [], applied: [] };
    throw new Error("Legacy copy is not present");
  }
  if (bundle.schemaVersion !== 1 || !Array.isArray(bundle.files) || !bundle.files.length) {
    throw new Error("Invalid legacy security update bundle");
  }
  const seen = new Set(), pending = [];
  for (const entry of bundle.files) {
    const operation = entry.operation ?? "update";
    const predecessors = entry.acceptedBeforeSha256 ?? [];
    if (typeof entry.path !== "string" || !entry.path.startsWith("maxbooster7.5/") ||
        entry.path.split("/").some(part => !part || part === "." || part === "..") ||
        entry.path.includes("\\") || seen.has(entry.path)) {
      throw new Error(`Unsafe or duplicate update path: ${entry.path}`);
    }
    seen.add(entry.path);
    if (!Array.isArray(predecessors) ||
        predecessors.some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) ||
        (operation === "add" && predecessors.length > 0) ||
        !["update", "add"].includes(operation) ||
        (operation === "add" ? entry.beforeSha256 !== null : !/^[a-f0-9]{64}$/.test(entry.beforeSha256)) ||
        typeof entry.content !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry.afterSha256) || digest(entry.content) !== entry.afterSha256) {
      throw new Error(`Invalid update checksum: ${entry.path}`);
    }
    const target = path.join(root, entry.path);
    // Check every existing parent. A symlink must not permit an update to
    // reach another project or private files.
    let ancestor = root;
    const parts = entry.path.split("/");
    for (const part of parts.slice(0, -1)) {
      ancestor = path.join(ancestor, part);
      const parentStat = fs.lstatSync(ancestor);
      if (parentStat.isSymbolicLink()) throw new Error(`Symlink update path: ${entry.path}`);
      if (!parentStat.isDirectory()) throw new Error(`Not a directory in update path: ${entry.path}`);
    }
    let targetStat;
    try {
      targetStat = fs.lstatSync(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (operation === "add") {
      if (targetStat) {
        if (targetStat.isSymbolicLink()) throw new Error(`Symlink update path: ${entry.path}`);
        if (!targetStat.isFile()) throw new Error(`Not a regular update file: ${entry.path}`);
        if (digest(fs.readFileSync(target)) === entry.afterSha256) continue;
        throw new Error(`File already exists; refusing add: ${entry.path}`);
      }
      pending.push({ ...entry, operation, target, mode: 0o644 });
      continue;
    }
    if (!targetStat) throw new Error(`Missing update file: ${entry.path}`);
    if (targetStat.isSymbolicLink()) throw new Error(`Symlink update path: ${entry.path}`);
    if (!targetStat.isFile()) throw new Error(`Not a regular update file: ${entry.path}`);
    const stat = fs.statSync(target);
    const actual = digest(fs.readFileSync(target));
    if (actual === entry.afterSha256) continue;
    if (actual !== entry.beforeSha256 && !predecessors.includes(actual)) throw new Error(`Custom changes found; refusing overwrite: ${entry.path}`);
    pending.push({ ...entry, operation, target, mode: stat.mode });
  }
  // Preflight the whole bundle before writing anything.
  const applied = [];
  if (apply) {
    for (const entry of pending) {
      const temporary = `${entry.target}.security-update-${process.pid}`;
      try {
        fs.writeFileSync(temporary, entry.content, { flag: "wx", mode: entry.mode });
        if (entry.operation === "add") {
          // Linking gives an atomic create-if-absent; rename would overwrite
          // a file created after preflight.
          fs.linkSync(temporary, entry.target);
          fs.unlinkSync(temporary);
        } else {
          fs.renameSync(temporary, entry.target);
        }
        applied.push(entry.path);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    }
  }
  return { present: true, pending: pending.map(entry => entry.path), applied };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--apply", "--if-present"].includes(arg))) throw new Error("Usage: node scripts/apply-legacy-security-update.mjs [--apply] [--if-present]");
    const root = fileURLToPath(new URL("..", import.meta.url));
    const result = applyLegacyUpdate(root, JSON.parse(fs.readFileSync(bundlePath, "utf8")), {
      apply: args.includes("--apply"), ifPresent: args.includes("--if-present"),
    });
    console.log(JSON.stringify(result));
    if (!args.includes("--apply") && result.pending.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
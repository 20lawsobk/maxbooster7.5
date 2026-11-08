import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packCapsuleMembers, CAPSULE_COMPRESSION_ID, MAXCORE_CAPSULE_EXCLUDE_PATHS, PDIM_CAPSULE_EXCLUDE_PATHS } from "./lib/capsulePack.js";
import { effectiveCapacity } from "../server/computeSizing.js";
import { packCachedDeploymentCapsule } from "./lib/deploymentCapsuleCache.js";
import { computeRemainingAppMembers } from "./lib/dockerignoreScan.js";

// Bundle into dist before node_modules is packed. The resulting CLI uses only
// Node built-ins and the installed zstd executable, not the removed source tree.
export async function publishCapsule(root: string, mode: string, capsule: string, inputs: string[]) {
  if (!capsule?.endsWith(".pdim")) throw new Error("Capsule output must end in .pdim");
  const excludeArgs = inputs.filter(input => input.startsWith("--exclude="));
  const sourceInputs = inputs.filter(input => !input.startsWith("--exclude="));
  if (excludeArgs.length && mode !== "paths") {
    throw new Error("Path exclusions are supported only for source capsules");
  }
  const excludePaths = excludeArgs.map(argument => argument.slice("--exclude=".length));
  for (const input of [capsule, ...sourceInputs, ...excludePaths]) {
    if (!input || path.isAbsolute(input) || input.split(/[\\/]/).includes("..")) {
      throw new Error("Capsule paths must stay inside the build root");
    }
  }
  const assigned = Number(process.env.DEPLOY_TASK_CPU ?? 2);
  if (!Number.isFinite(assigned) || assigned < 1) throw new Error("Invalid task CPU allocation");
  const threads = Math.max(1, Math.min(Math.floor(effectiveCapacity().cpus), Math.floor(assigned)));
  if (mode === "remainder") {
    if (capsule !== "app_remainder.pdim" || inputs.length) {
      throw new Error("Remainder operation requires only app_remainder.pdim");
    }
    const members = computeRemainingAppMembers(root);
    if (!members.length) throw new Error("Application remainder is empty");
    // Remove only files included in the verified capsule; leave bootstrap and
    // deployment-executive modules on disk for pre-restoration startup.
    return packCapsuleMembers({ root, members, capsule, threads, preserveSource: false });
  }
  if (mode === "directory" || mode === "prepare") {
    if (sourceInputs.length !== 1 || !fs.statSync(path.join(root, sourceInputs[0])).isDirectory()) {
      throw new Error("Required capsule directory is missing");
    }
    const directoryExcludes = sourceInputs[0] === "external/maxcore" ? MAXCORE_CAPSULE_EXCLUDE_PATHS
      : sourceInputs[0] === "external/pdim" ? PDIM_CAPSULE_EXCLUDE_PATHS : [];
    return packCachedDeploymentCapsule({
      root, dir: sourceInputs[0], capsule, threads, excludePaths: directoryExcludes,
      preserveSource: mode === "prepare",
    });
  }
  if (mode !== "paths") throw new Error("Unknown capsule operation");
  const normalizedExcludes = [...new Set(excludePaths.map(pattern => {
    const normalized = pattern.replace(/\\/g, "/");
    if (!normalized || normalized.startsWith("/") ||
        normalized.split("/").some(part => part === "." || part === "..")) {
      throw new Error(`Invalid source capsule exclusion: ${pattern}`);
    }
    return normalized;
  }))];
  const isExcluded = (relative: string) => normalizedExcludes.some(pattern => {
    let expression = "";
    for (let index = 0; index < pattern.length; index++) {
      const character = pattern[index];
      if (character === "*" && pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          expression += "(?:.*/)?";
          index += 2;
        } else {
          expression += ".*";
          index++;
        }
      } else if (character === "*") {
        expression += "[^/]*";
      } else {
        expression += character.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      }
    }
    return new RegExp(`^${expression}$`).test(relative) ||
      (!pattern.includes("*") && relative.startsWith(`${pattern}/`));
  });
  const members: string[] = [];
  function collect(relative: string, isDirectory?: boolean) {
    if (/[\r\n]/.test(relative)) throw new Error("Archive member contains a newline");
    if (isExcluded(relative.replace(/\\/g, "/"))) return;
    const absolute = path.join(root, relative);
    const directory = isDirectory ?? fs.lstatSync(absolute).isDirectory();
    if (directory) {
      // Preserve empty directories and their permissions in the source backup.
      members.push(relative + "/");
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) collect(child, true);
        else if (entry.isFile() || entry.isSymbolicLink()) collect(child, false);
        else collect(child);
      }
    } else {
      members.push(relative);
    }
  }
  for (const input of sourceInputs) collect(input);
  if (!members.length) throw new Error("No source files to pack");
  // Historical shell owns source-tree cleanup, after its manifest is written.
  return packCapsuleMembers({
    root, members, capsule, threads, preserveSource: true, excludePaths: normalizedExcludes,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, capsule, ...inputs] = process.argv.slice(2);
  if (mode === "format") console.log(CAPSULE_COMPRESSION_ID);
  else publishCapsule(process.cwd(), mode, capsule, inputs).catch(error => {
    console.error("[publish-capsules]", error.message);
    process.exitCode = 1;
  });
}

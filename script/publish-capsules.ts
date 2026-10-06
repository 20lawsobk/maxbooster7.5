import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packCapsule, packCapsuleMembers, CAPSULE_COMPRESSION_ID, MAXCORE_CAPSULE_EXCLUDE_PATHS, PDIM_CAPSULE_EXCLUDE_PATHS } from "./lib/capsulePack.js";
import { effectiveCapacity } from "../server/computeSizing.js";

// Bundle into dist before node_modules is packed. The resulting CLI uses only
// Node built-ins and the installed zstd executable, not the removed source tree.
export async function publishCapsule(root: string, mode: string, capsule: string, inputs: string[]) {
  if (!capsule?.endsWith(".pdim")) throw new Error("Capsule output must end in .pdim");
  for (const input of [capsule, ...inputs]) {
    if (!input || path.isAbsolute(input) || input.split(/[\\/]/).includes("..")) {
      throw new Error("Capsule paths must stay inside the build root");
    }
  }
  const threads = Math.max(1, Math.min(2, Math.floor(effectiveCapacity().cpus)));
  if (mode === "directory") {
    if (inputs.length !== 1 || !fs.statSync(path.join(root, inputs[0])).isDirectory()) {
      throw new Error("Required capsule directory is missing");
    }
    const excludePaths = inputs[0] === "external/maxcore" ? MAXCORE_CAPSULE_EXCLUDE_PATHS
      : inputs[0] === "external/pdim" ? PDIM_CAPSULE_EXCLUDE_PATHS : [];
    return packCapsule({ root, dir: inputs[0], capsule, threads, excludePaths });
  }
  if (mode !== "paths") throw new Error("Unknown capsule operation");
  const members: string[] = [];
  function collect(relative: string) {
    if (/[\r\n]/.test(relative)) throw new Error("Archive member contains a newline");
    const absolute = path.join(root, relative);
    if (fs.lstatSync(absolute).isDirectory()) {
      // Preserve empty directories and their permissions in the source backup.
      members.push(relative + "/");
      for (const name of fs.readdirSync(absolute)) collect(path.join(relative, name));
    } else {
      members.push(relative);
    }
  }
  inputs.forEach(collect);
  if (!members.length) throw new Error("No source files to pack");
  // Historical shell owns source-tree cleanup, after its manifest is written.
  return packCapsuleMembers({ root, members, capsule, threads, preserveSource: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, capsule, ...inputs] = process.argv.slice(2);
  if (mode === "format") console.log(CAPSULE_COMPRESSION_ID);
  else publishCapsule(process.cwd(), mode, capsule, inputs).catch(error => {
    console.error("[publish-capsules]", error.message);
    process.exitCode = 1;
  });
}

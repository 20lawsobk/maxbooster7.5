import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REMOVABLE_DIRECTORIES = new Set([
  "test", "tests", "__tests__", "spec", "specs", "__spec__", "coverage",
  "docs", "documentation", "examples", "example", "benchmark", "benchmarks",
  "man", ".github",
]);
const LEGAL_NOTICE = /^(?:licen[cs]e|notice|copying|patents?)(?:$|[._ -])/i;
const REMOVABLE_FILES = /^(?:CHANGELOG|CHANGES|HISTORY|CONTRIBUTING|AUTHORS)(?:$|[._ -])/i;

function containsLegalNotice(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isFile() && LEGAL_NOTICE.test(entry.name)) return true;
    if (entry.isDirectory() && containsLegalNotice(file)) return true;
  }
  return false;
}

export function pruneRuntimeNodeModules(root = process.cwd()) {
  root = path.resolve(root);
  const modules = path.join(root, "node_modules");
  const rootStat = fs.lstatSync(modules);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || fs.realpathSync(modules) !== modules) {
    throw new Error("node_modules must be a real directory inside the build root");
  }

  let removedDirectories = 0;
  let preservedLegalDirectories = 0;
  let removedFiles = 0;

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (REMOVABLE_DIRECTORIES.has(entry.name.toLowerCase())) {
          if (containsLegalNotice(absolute)) {
            preservedLegalDirectories++;
            continue;
          }
          fs.rmSync(absolute, { recursive: true });
          removedDirectories++;
          continue;
        }
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || LEGAL_NOTICE.test(entry.name)) continue;
      if (entry.name.endsWith(".map") || REMOVABLE_FILES.test(entry.name)) {
        fs.unlinkSync(absolute);
        removedFiles++;
      }
    }
  }

  walk(modules);
  return { removedDirectories, preservedLegalDirectories, removedFiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    const result = pruneRuntimeNodeModules(root);
    console.log(
      `Pruned ${result.removedDirectories} package-only directories and ${result.removedFiles} non-runtime metadata files; ` +
      `preserved ${result.preservedLegalDirectories} legal-bearing directories and all runtime .ts files.`,
    );
  } catch (error) {
    console.error(`[runtime-prune] ${error.message}`);
    process.exitCode = 1;
  }
}

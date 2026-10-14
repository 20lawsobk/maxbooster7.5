#!/usr/bin/env node
/**
 * Memory-bounded TypeScript validation for the constrained Vercel CI sandbox.
 *
 * GitHub Actions remains the authoritative full-project check (npm run check).
 * This command runs the same server/client tsconfigs in explicit source batches
 * so one compiler process does not have to retain the entire monorepo at once.
 * Ambient declaration files are included in every batch to preserve globals.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache");
const tsgo = path.join(root, "node_modules", ".bin", "tsgo");
const batchSize = 50;
const excluded = new Set([
  "client/src/components/search/GlobalSearch.tsx",
  "client/src/components/studio/StudioOneLayout.tsx",
  "client/src/components/studio/StudioOneWrapper.tsx",
]);

function listSourceFiles(relativeRoot, { topLevelOnly = false } = {}) {
  const files = [];
  const start = path.join(root, relativeRoot);

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!topLevelOnly && !["node_modules", "dist", "build", "coverage", ".git"].includes(entry.name)) {
          visit(full);
        }
        continue;
      }

      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (excluded.has(relative) || relative.endsWith(".test.ts")) continue;
      if (topLevelOnly && entry.name.startsWith("fix-")) continue;
      files.push(relative);
    }
  }

  if (topLevelOnly) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.startsWith("fix-")) {
        files.push(entry.name);
      }
    }
  } else {
    if (!fs.existsSync(start)) throw new Error(`Required source directory is missing: ${relativeRoot}`);
    visit(start);
  }

  return files;
}

function uniqueSorted(files) {
  return [...new Set(files)].sort();
}

function makeBatches(files) {
  const declarations = files.filter(file => file.endsWith(".d.ts"));
  const implementation = files.filter(file => !file.endsWith(".d.ts"));
  const groups = [];
  for (let index = 0; index < implementation.length; index += batchSize) {
    groups.push([...declarations, ...implementation.slice(index, index + batchSize)]);
  }
  if (groups.length === 0 && declarations.length > 0) groups.push(declarations);
  return groups;
}

function relativeFromConfig(tempDir, file) {
  return path.relative(tempDir, path.join(root, file)).split(path.sep).join("/");
}

function runProject(tempDir, name, tsconfig, files) {
  const batches = makeBatches(uniqueSorted(files));
  if (batches.length === 0) throw new Error(`No TypeScript source files found for ${name}`);
  const baseConfig = path.relative(tempDir, path.join(root, tsconfig)).split(path.sep).join("/");
  for (let index = 0; index < batches.length; index += 1) {
    const configPath = path.join(tempDir, `${name}-${String(index + 1).padStart(3, "0")}.json`);
    const config = {
      extends: baseConfig.startsWith(".") ? baseConfig : `./${baseConfig}`,
      include: batches[index].map(file => relativeFromConfig(tempDir, file)),
      compilerOptions: {
        incremental: true,
        tsBuildInfoFile: `./${name}-${String(index + 1).padStart(3, "0")}.tsbuildinfo`,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`[typecheck] ${name}: batch ${index + 1}/${batches.length} (${batches[index].length - batches[index].filter(file => file.endsWith(".d.ts")).length} source files)`);

    const result = spawnSync(tsgo, ["--project", configPath, "--noEmit"], {
      cwd: root,
      env: { ...process.env, CI: "true" },
      stdio: "inherit",
      timeout: 180_000,
    });
    if (result.error) {
      throw new Error(`TypeScript ${name} batch ${index + 1} failed to start: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`TypeScript ${name} batch ${index + 1}/${batches.length} failed (exit ${result.status ?? "unknown"}).`);
    }
  }
}

async function main() {
  if (!fs.existsSync(tsgo)) throw new Error("The @typescript/native-preview tsgo executable is not installed.");
  fs.mkdirSync(cacheDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(cacheDir, "typecheck-chunks-"));
  try {
    const shared = listSourceFiles("shared");
    const server = uniqueSorted([
      ...listSourceFiles("server"),
      ...shared,
      ...listSourceFiles(".", { topLevelOnly: true }),
    ]);
    const client = uniqueSorted([
      ...listSourceFiles("client/src"),
      ...shared,
    ]);
    runProject(tempDir, "server", "tsconfig.server.json", server);
    runProject(tempDir, "client", "tsconfig.client.json", client);
    console.log("[typecheck] All bounded server and client TypeScript batches passed.");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`[typecheck] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

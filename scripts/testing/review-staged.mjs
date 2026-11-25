#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TIMEOUT_MS = 20 * 60 * 1000;
const LFS_POINTER_LIMIT = 1024;

function run(
  command,
  args,
  { cwd = ROOT, capture = false, maxBuffer = 16 * 1024 * 1024 } = {},
) {
  return spawnSync(command, args, {
    cwd,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
    timeout: TIMEOUT_MS,
    maxBuffer,
    env: process.env,
  });
}

export function parseNulPaths(value) {
  return value.split("\0").filter(Boolean);
}

export function parseLfsPointer(value) {
  const match =
    /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([a-f0-9]{64})\nsize ([1-9]\d*)\n?$/.exec(
      value,
    );
  if (!match) return null;
  const bytes = Number(match[2]);
  return Number.isSafeInteger(bytes) ? { sha256: match[1], bytes } : null;
}

export function isModelArtifactPath(filePath) {
  return (
    /(^|\/)model\.corrupt$/i.test(filePath) ||
    /(^|\/)(?:model|weights)\/[^/]+\.(?:pt|pth|safetensors|ckpt|bin|corrupt)$/i.test(
      filePath,
    )
  );
}

function findCargoManifest(root, file) {
  let directory = path.dirname(path.resolve(root, file));
  const rootPath = path.resolve(root);
  while (
    directory === rootPath ||
    directory.startsWith(`${rootPath}${path.sep}`)
  ) {
    const manifest = path.join(directory, "Cargo.toml");
    if (existsSync(manifest)) return manifest;
    if (directory === rootPath) break;
    directory = path.dirname(directory);
  }
  return null;
}

export function buildReviewPlan(paths, { root = ROOT } = {}) {
  const plan = [];
  const add = (name, command, args) => {
    if (!plan.some((item) => item.name === name)) {
      plan.push({ name, command, args });
    }
  };
  const appCodePaths = paths.filter((file) =>
    /^(client|server|shared|script|scripts)\//.test(file) &&
    /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(file),
  );
  const typescriptPaths = appCodePaths.filter((file) =>
    /\.(?:ts|tsx|mts|cts)$/.test(file),
  );
  const clientChanged = paths.some((file) => file.startsWith("client/"));
  const pythonPaths = paths.filter((file) => file.endsWith(".py"));
  const rustPaths = paths.filter((file) => file.endsWith(".rs"));
  const shellPaths = paths.filter((file) => file.endsWith(".sh"));
  const sqlPaths = paths.filter((file) => file.endsWith(".sql"));
  const appSourceChanged = appCodePaths.length > 0;
  const packageChanged = paths.some((file) =>
    ["package.json", "package-lock.json", "npm-shrinkwrap.json"].includes(file),
  );
  const runtimeConfigChanged = paths.some((file) =>
    [
      ".replit",
      "Dockerfile",
      "docker-compose.yml",
      "docker-compose.yaml",
      "tsconfig.json",
      "tsconfig.client.json",
      "tsconfig.server.json",
      "vite.config.ts",
    ].includes(file),
  );

  if (typescriptPaths.length > 0) {
    add("TypeScript", "npm", ["run", "check"]);
  }
  if (appSourceChanged) {
    add("Application test suite", "npm", ["run", "test:ci"]);
    const lintable = appCodePaths.filter((file) =>
      /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(file),
    );
    if (lintable.length > 0) {
      add("Changed-file lint", process.execPath, [
        "node_modules/eslint/bin/eslint.js",
        "--quiet",
        ...lintable,
      ]);
    }
  }
  if (clientChanged) {
    add("Client browser tests", "npm", ["run", "test:browser"]);
  }
  if (pythonPaths.length > 0) {
    for (const file of pythonPaths) {
      add(`Python syntax: ${file}`, "python3", [
        "-c",
        'import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
        file,
      ]);
    }
    add("Python test suites", "npm", ["run", "test:python:all"]);
  }
  if (rustPaths.length > 0) {
    for (const file of rustPaths) {
      const manifest = findCargoManifest(root, file);
      if (!manifest) {
        throw new Error(`No Cargo.toml found for staged Rust file ${file}.`);
      }
      add(`Rust tests: ${path.relative(root, manifest)}`, "cargo", [
        "test",
        "--locked",
        "--manifest-path",
        manifest,
      ]);
    }
  }
  if (shellPaths.length > 0) {
    for (const file of shellPaths) {
      add(`Shell syntax: ${file}`, "bash", ["-n", file]);
    }
  }
  if (sqlPaths.length > 0) {
    add("Database schema contract", "node", [
      "--test",
      "tests/neon-schema-contract.test.mjs",
    ]);
  }
  if (packageChanged) {
    add("Package contracts", "npm", ["run", "test:runtime-contracts"]);
    add("Package TypeScript checks", "npm", ["run", "check"]);
    add("Production dependency audit", "npm", [
      "audit",
      "--omit=dev",
      "--audit-level=high",
      "--fetch-timeout=30000",
    ]);
  }
  if (runtimeConfigChanged) {
    add("Runtime configuration contracts", "npm", [
      "run",
      "test:runtime-contracts",
    ]);
  }

  const stagedTests = paths.filter((file) =>
    /(?:^|\/)__tests__\/.*\.(?:test|spec)\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(file) ||
    /^tests\/.*\.(?:test|spec)\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(file),
  );
  if (!appSourceChanged && stagedTests.length > 0) {
    const vitestTests = stagedTests.filter((file) =>
      /\.(?:ts|tsx)$/.test(file),
    );
    const nodeTests = stagedTests.filter((file) =>
      /\.(?:[cm]?js|jsx)$/.test(file),
    );
    const integrationTests = vitestTests.filter((file) =>
      file.endsWith(".integration.test.ts"),
    );
    const unitVitestTests = vitestTests.filter(
      (file) => !integrationTests.includes(file),
    );
    if (unitVitestTests.length > 0) {
      add("Changed Vitest suites", process.execPath, [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.config.ts",
        ...unitVitestTests,
      ]);
    }
    if (integrationTests.length > 0) {
      add("Changed integration suites", process.execPath, [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.integration.config.ts",
        ...integrationTests,
      ]);
    }
  }
  const stagedNodeTests = stagedTests.filter((file) =>
    /\.(?:[cm]?js|jsx)$/.test(file),
  );
  if (stagedNodeTests.length > 0) {
    add("Changed Node test suites", process.execPath, [
      "--test",
      "--test-concurrency=1",
      ...stagedNodeTests,
    ]);
  }

  return plan;
}

function stagedBlob(root, filePath, maxBuffer = 4096) {
  return run("git", ["show", `:${filePath}`], {
    cwd: root,
    capture: true,
    maxBuffer,
  });
}

function verifyStagedModelPointers(root, paths, deletedPaths) {
  for (const file of paths.filter(isModelArtifactPath)) {
    if (deletedPaths.has(file)) continue;
    const exists = run("git", ["cat-file", "-e", `:${file}`], {
      cwd: root,
      capture: true,
    });
    if (exists.status !== 0) {
      throw new Error(`Could not read staged model artifact: ${file}`);
    }
    const sizeResult = run("git", ["cat-file", "-s", `:${file}`], {
      cwd: root,
      capture: true,
    });
    if (sizeResult.status !== 0) {
      throw new Error(`Could not inspect staged model artifact: ${file}`);
    }
    const bytes = Number(sizeResult.stdout.trim());
    if (!Number.isSafeInteger(bytes) || bytes > LFS_POINTER_LIMIT) {
      throw new Error(
        `${file} is ${bytes} bytes in the staged changes. Model weights belong in App Storage; stage only the small Git LFS pointer.`,
      );
    }
    const pointer = stagedBlob(root, file, LFS_POINTER_LIMIT + 1);
    if (pointer.status !== 0 || !parseLfsPointer(pointer.stdout)) {
      throw new Error(
        `${file} is not a valid Git LFS pointer. Keep checkpoint bytes in App Storage.`,
      );
    }
  }
}

function verifyStagedJson(root, paths, deletedPaths) {
  for (const file of paths.filter((item) => item.endsWith(".json"))) {
    if (deletedPaths.has(file)) continue;
    const content = stagedBlob(root, file);
    if (content.status !== 0) {
      throw new Error(`Could not read staged JSON file: ${file}`);
    }
    try {
      JSON.parse(content.stdout);
    } catch (error) {
      throw new Error(`Invalid staged JSON in ${file}: ${error.message}`);
    }
  }
}

function main() {
  const rootResult = run("git", ["rev-parse", "--show-toplevel"], {
    cwd: ROOT,
    capture: true,
  });
  if (rootResult.status !== 0) {
    console.error("Review gate requires a Git working tree.");
    return 2;
  }
  const root = path.resolve(rootResult.stdout.trim());
  const stagedResult = run(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z"],
    { cwd: root, capture: true },
  );
  if (stagedResult.status !== 0) {
    console.error("Could not determine staged paths for review.");
    return 2;
  }
  const paths = parseNulPaths(stagedResult.stdout);
  if (paths.length === 0) {
    console.log("Review gate: no staged changes.");
    return 0;
  }
  const whitespace = run("git", ["diff", "--cached", "--check"], { cwd: root });
  if (whitespace.status !== 0) {
    console.error("Review gate failed: staged diff has whitespace errors.");
    return whitespace.status ?? 1;
  }
  const deletedResult = run(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=D", "-z"],
    { cwd: root, capture: true },
  );
  if (deletedResult.status !== 0) {
    console.error("Could not determine deleted staged paths.");
    return 2;
  }
  const deletedPaths = new Set(parseNulPaths(deletedResult.stdout));
  try {
    const unstaged = run("git", ["diff", "--quiet", "--", ...paths], {
      cwd: root,
      capture: true,
    });
    if (unstaged.status === 1 && !unstaged.stderr) {
      throw new Error(
        "Staged files also have unstaged edits. Stage or discard those edits so checks match the commit contents.",
      );
    }
    if (unstaged.status !== 0) {
      throw new Error(
        `Could not compare the staged snapshot with the working tree: ${unstaged.stderr.trim()}`,
      );
    }
    verifyStagedJson(root, paths, deletedPaths);
    verifyStagedModelPointers(root, paths, deletedPaths);
  } catch (error) {
    console.error(`Review gate failed: ${error.message}`);
    return 1;
  }

  let plan;
  try {
    plan = buildReviewPlan(paths, { root });
  } catch (error) {
    console.error(`Review gate failed: ${error.message}`);
    return 1;
  }
  console.log(`Review gate: ${paths.length} staged path(s).`);
  for (const item of plan) {
    console.log(`\n[review] ${item.name}`);
    const result = run(item.command, item.args, { cwd: root });
    if (result.error || result.status !== 0) {
      console.error(
        `Review gate failed: ${item.name}${result.error ? ` (${result.error.message})` : ""}.`,
      );
      return result.status ?? 1;
    }
  }
  console.log(`Review gate passed ${plan.length} deterministic check group(s).`);
  return 0;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exitCode = main();

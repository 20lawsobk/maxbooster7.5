#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const marker = "# MAX-BOOSTER-REVIEW-GATE";
const hookContents = `#!/bin/sh
${marker}
root=$(git rev-parse --show-toplevel) || exit 2
cd "$root" || exit 2
exec node scripts/testing/review-staged.mjs
`;

function git(args) {
  return spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
}

async function install() {
  const root = git(["rev-parse", "--show-toplevel"]);
  if (root.status !== 0) {
    console.log("No Git working tree found; review hook installation skipped.");
    return 0;
  }
  const actualRoot = path.resolve(root.stdout.trim());
  if (actualRoot !== projectRoot) {
    throw new Error("Git root does not match the project root.");
  }

  const hooksResult = git(["rev-parse", "--git-path", "hooks"]);
  if (hooksResult.status !== 0) {
    throw new Error("Could not locate the Git hooks directory.");
  }
  const hooksDirectory = path.resolve(actualRoot, hooksResult.stdout.trim());
  const hookPath = path.join(hooksDirectory, "pre-commit");
  await fs.mkdir(hooksDirectory, { recursive: true });

  let existing = null;
  try {
    const info = await fs.lstat(hookPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(
        "Existing pre-commit hook is not a regular file; it was left unchanged.",
      );
    }
    existing = await fs.readFile(hookPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (existing && !existing.includes(marker)) {
    console.log(
      "An existing pre-commit hook was preserved; review gate was not installed over it.",
    );
    return 0;
  }

  await fs.writeFile(hookPath, hookContents, { mode: 0o755 });
  await fs.chmod(hookPath, 0o755);
  console.log("Installed the deterministic staged-change review gate.");
  return 0;
}

install().catch((error) => {
  console.error(`Review hook installation failed: ${error.message}`);
  process.exitCode = 1;
});

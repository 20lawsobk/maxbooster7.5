#!/usr/bin/env node
/**
 * Deployment-time repair and verification gate.
 *
 * This is deliberately fail-closed: only official ESLint fixes and the
 * position-verified fix-all handlers may edit source, every edit is followed
 * by fresh split checks, and unresolved diagnostics stop the deployment.
 * Unknown errors are reported, never guessed at.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "deployment-autofix");
fs.mkdirSync(REPORT_DIR, { recursive: true });

function run(label, command, args, options = {}) {
  console.log(`\n[deploy-autofix] ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
    ...options,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function verify(config) {
  return run(
    `verify ${config}`,
    "node",
    ["scripts/fix-all.mjs", "--phase", "verify", "--config", config],
  );
}

function apply(config) {
  const input = path.join("reports", "fix-all", `tc-${config}.txt`);
  return run(
    `apply position-verified ${config} handlers`,
    "node",
    ["scripts/fix-all.mjs", "--phase", `ts-${config}`, "--config", config, "--input", input],
  );
}

console.log("[deploy-autofix] Starting fail-closed deployment repair gate");

const research = run(
  "validate researched error playbook",
  "node",
  ["scripts/validate-error-research.mjs"],
);
if (research !== 0) {
  console.error("[deploy-autofix] Error playbook validation failed");
  process.exit(1);
}

// ESLint's own fixes are syntax-aware and are safe to run before the
// repository-specific diagnostic handlers.
const lintFix = run("apply official ESLint fixes", "npx", ["eslint", ".", "--fix"]);
if (lintFix !== 0) {
  console.warn(
    "[deploy-autofix] ESLint reported unresolved diagnostics after applying available fixes; continuing to TypeScript repair",
  );
}

for (const config of ["server", "client"]) {
  const first = verify(config);
  if (first !== 0) {
    const applied = apply(config);
    if (applied !== 0) {
      console.error(`[deploy-autofix] ${config} handler phase failed`);
      process.exit(1);
    }
    const second = verify(config);
    if (second !== 0) {
      console.error(
        `[deploy-autofix] ${config} still has diagnostics after verified fixes`,
      );
      process.exit(1);
    }
  }
}

const lint = run("verify lint", "npx", ["eslint", ".", "--quiet"]);
if (lint !== 0) {
  console.error(
    "[deploy-autofix] Unresolved lint errors remain; no deployment will be promoted",
  );
  process.exit(1);
}

console.log(
  "[deploy-autofix] PASS — split typechecks and lint are clean after verified fixes",
);
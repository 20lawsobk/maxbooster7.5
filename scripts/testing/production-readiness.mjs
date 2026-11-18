import fs from "node:fs";
import path from "node:path";
import { configuredPortSpecs } from "../wait-configured-ports.mjs";

const REQUIRED_FILES = [
  "package.json",
  ".nvmrc",
  ".node-version",
  "start.sh",
  "scripts/port-contract.sh",
  "scripts/wait-configured-ports.mjs",
  "dist/build-complete.json",
];

const PORT_ENV_KEYS = [
  "PORT",
  "DNS_AUTHORITY_PORT",
  "DNS_NODE_LOCAL_PORT",
  "DNS_API_PORT",
  "DNS_NODE_LOCAL_HEALTH_PORT",
  "LOCAL_PDIM_PORT",
  "VIDEO_DIFFUSION_PORT",
  "MAXCORE_LOCAL_PORT",
  "BOOSTERSTATE_SIDECAR_PORT",
  "MODEL_API_PORT",
  "MODEL_API_HEALTH_PORT",
  "PYTHON_AI_PORT",
];

function addCheck(checks, id, fn) {
  const startedAt = Date.now();
  try {
    const evidence = fn();
    checks.push({ id, status: "PASS", durationMs: Date.now() - startedAt, evidence });
  } catch (error) {
    checks.push({
      id,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      evidence: error instanceof Error ? error.message : "Unknown readiness failure",
    });
  }
}

function readRegularFile(root, relativePath, maximumBytes = 1024 * 1024) {
  const absolutePath = path.resolve(root, relativePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Required runtime path escapes the project root: ${relativePath}`);
  }
  const info = fs.lstatSync(absolutePath);
  if (info.isSymbolicLink() || !info.isFile() || info.size === 0 || info.size > maximumBytes) {
    throw new Error(`${relativePath} must be a non-empty bounded regular file`);
  }
  const realPath = fs.realpathSync(absolutePath);
  if (!realPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${relativePath} resolves outside the project root`);
  }
  return fs.readFileSync(absolutePath);
}

function majorVersion(value, description) {
  const match = String(value).trim().match(/^v?(\d+)(?:\.\d+){0,2}$/);
  if (!match) throw new Error(`${description} must contain a Node major or semantic version`);
  return Number(match[1]);
}

function productionPortEnvironment(env) {
  const result = { NODE_ENV: "production", MAXBOOSTER_DEV_PORTS: "0" };
  for (const key of PORT_ENV_KEYS) {
    if (typeof env[key] === "string") result[key] = env[key];
  }
  return result;
}

function validatePorts(env) {
  const specs = configuredPortSpecs(env);
  if (specs.length !== 12) {
    throw new Error(`Expected 12 configured production listeners; found ${specs.length}`);
  }
  const owners = new Map();
  for (const spec of specs) {
    if (!Number.isInteger(spec.port) || spec.port < 1 || spec.port > 65_535) {
      throw new Error(`${spec.name} has an invalid configured port`);
    }
    const prior = owners.get(spec.port);
    if (prior) throw new Error(`${spec.name} and ${prior} share a configured port`);
    owners.set(spec.port, spec.name);
  }
  const requiredHealthPaths = new Map([
    ["web application", "/ready"],
    ["DNS API", "/ready"],
    ["local DNS health", "/health"],
    ["MaxCore diffusion gateway", "/health"],
    ["MaxCore API", "/healthz"],
    ["MaxCore model API", "/api/ready"],
    ["MaxCore model health", "/healthz"],
    ["MaxCore proxy sidecar", "/health"],
  ]);
  for (const [name, expectedPath] of requiredHealthPaths) {
    const spec = specs.find(item => item.name === name);
    if (spec?.httpPath !== expectedPath) {
      throw new Error(`${name} must use its ${expectedPath} production readiness endpoint`);
    }
  }
  return `${specs.length} unique listener checks; ${requiredHealthPaths.size} require HTTP health`;
}

/**
 * Bounded, read-only preflight for the ordinary unpacked production launcher.
 * It intentionally does not run Git inventory, repository tests, learning,
 * completion-loop patching, migrations, provider calls, or production writes.
 */
export async function runProductionStartupReadiness({
  root,
  env = process.env,
  nodeVersion = process.version,
  validateBuild,
} = {}) {
  if (!root || typeof validateBuild !== "function") {
    throw new Error("Production readiness requires an explicit root and build validator");
  }
  root = fs.realpathSync(path.resolve(root));
  const checks = [];
  let manifest;

  addCheck(checks, "production-files", () => {
    for (const relativePath of REQUIRED_FILES) readRegularFile(root, relativePath);
    return `${REQUIRED_FILES.length} launcher and build-contract files are present`;
  });

  addCheck(checks, "production-command-contract", () => {
    manifest = JSON.parse(readRegularFile(root, "package.json").toString("utf8"));
    if (manifest.scripts?.prod !== "node scripts/start-production.mjs" ||
        manifest.scripts?.start !== manifest.scripts.prod) {
      throw new Error("npm run prod and npm run start must use the validated production launcher");
    }
    if (manifest.scripts?.["deployment:start"] !== "bash start.sh" ||
        manifest.scripts?.["deployment:build"] !== "bash build.sh") {
      throw new Error("Publishing must retain its capsule-aware build.sh/start.sh path");
    }
    return "npm production aliases are valid and Publishing keeps its capsule-aware path";
  });

  addCheck(checks, "node-runtime", () => {
    if (!manifest) manifest = JSON.parse(readRegularFile(root, "package.json").toString("utf8"));
    const pinnedMajors = [
      majorVersion(readRegularFile(root, ".nvmrc", 128).toString("utf8"), ".nvmrc"),
      majorVersion(readRegularFile(root, ".node-version", 128).toString("utf8"), ".node-version"),
    ];
    if (new Set(pinnedMajors).size !== 1) throw new Error("Node version pins disagree");
    const minimum = Number(manifest.engines?.node?.match(/^\s*>=\s*(\d+)/)?.[1]);
    if (!Number.isInteger(minimum)) throw new Error("package.json must declare a minimum Node major");
    const actual = majorVersion(nodeVersion, "Running Node version");
    if (actual !== pinnedMajors[0] || actual < minimum) {
      throw new Error(`Running Node major ${actual} does not match the pinned major ${pinnedMajors[0]} and minimum ${minimum}`);
    }
    return `Node ${actual} matches both repository pins and the package engine`;
  });

  addCheck(checks, "production-port-contract", () => (
    validatePorts(productionPortEnvironment(env))
  ));

  addCheck(checks, "build-integrity", () => {
    validateBuild(root);
    return "source inputs and required production artifacts match the build contract";
  });

  return {
    schemaVersion: 1,
    kind: "maxbooster-production-startup-readiness",
    scope: "bounded read-only startup prerequisites; not a whole-product certification",
    ready: checks.every(check => check.status === "PASS"),
    checks,
  };
}

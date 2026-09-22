#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SCANNER_ENV_REMOVALS = Object.freeze(["PYTHONPATH", "PYTHONHOME"]);
export const SOURCE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cxx", ".go", ".h", ".hpp", ".java", ".js", ".jsx",
  ".mjs", ".cjs", ".py", ".rb", ".rs", ".swift", ".tf", ".ts", ".tsx",
]);
export const GENERATED_SEGMENTS = new Set([
  ".cache", ".git", ".next", ".pythonlibs", "build", "coverage", "deploy-capsule",
  "dist", "node_modules", "python_runtime", "reports",
]);
export const GENERATED_ROOTS = new Set([
  "artifacts", "attached_assets", "archive-capsules", "ReleasePackage",
]);
export const DEFAULT_CONFIGS = Object.freeze([
  {
    name: "p/security-audit",
    url: "https://semgrep.dev/c/p/security-audit",
  },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function extensionLanguage(file) {
  const ext = path.extname(file).toLowerCase();
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
  if ([".ts", ".tsx"].includes(ext)) return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if (ext === ".rs") return "rust";
  if ([".c", ".h"].includes(ext)) return "c";
  if ([".cc", ".cpp", ".cxx", ".hpp"].includes(ext)) return "cpp";
  if (ext === ".java") return "java";
  if (ext === ".rb") return "ruby";
  if (ext === ".swift") return "swift";
  if (ext === ".tf") return "terraform";
  if (path.basename(file).toLowerCase().startsWith("dockerfile")) return "dockerfile";
  return "unknown";
}

function excludedReason(file) {
  const segments = slash(file).split("/");
  if (GENERATED_ROOTS.has(segments[0])) return `generated-root:${segments[0]}`;
  const generated = segments.find((segment) => GENERATED_SEGMENTS.has(segment));
  return generated ? `generated-segment:${generated}` : null;
}

function isSource(file) {
  const basename = path.basename(file).toLowerCase();
  return SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())
    || basename === "dockerfile"
    || basename.startsWith("dockerfile.");
}

async function trackedFiles(root) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "ls-files", "-z"], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.toString("utf8").split("\0").filter(Boolean);
  } catch (error) {
    throw new Error(`Unable to inventory tracked source: ${error.message}`);
  }
}

export async function buildInventory(root, filesOverride) {
  const candidates = filesOverride ?? await trackedFiles(root);
  const files = [];
  const excluded = {};
  for (const relative of candidates) {
    if (!isSource(relative)) continue;
    const reason = excludedReason(relative);
    if (reason) {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      continue;
    }
    const absolute = path.resolve(root, relative);
    const rootPrefix = `${path.resolve(root)}${path.sep}`;
    if (!absolute.startsWith(rootPrefix)) throw new Error(`Inventory path escapes root: ${relative}`);
    let stat;
    try {
      stat = await fsp.lstat(absolute);
    } catch {
      throw new Error(`Tracked source is missing: ${relative}`);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Tracked source is not a regular file: ${relative}`);
    }
    files.push({
      path: slash(relative),
      bytes: stat.size,
      sha256: sha256(await fsp.readFile(absolute)),
      language: extensionLanguage(relative),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = files.map(({ path: file, bytes, sha256: digest }) => `${file}\0${bytes}\0${digest}\n`).join("");
  return {
    files,
    excluded,
    fileCount: files.length,
    byteCount: files.reduce((sum, file) => sum + file.bytes, 0),
    sha256: sha256(manifest),
  };
}

export function isolatedScannerEnv(base = process.env) {
  const env = { ...base };
  for (const key of SCANNER_ENV_REMOVALS) delete env[key];
  env.PYTHONNOUSERSITE = "1";
  env.SEMGREP_SEND_METRICS = "off";
  env.SEMGREP_ENABLE_VERSION_CHECK = "0";
  return env;
}

function fetchBytes(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { "user-agent": "readiness-sast-evidence/1" },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(fetchBytes(new URL(response.headers.location, url).toString(), redirects - 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Rules request returned HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        bytes: Buffer.concat(chunks),
        etag: response.headers.etag ?? null,
        lastModified: response.headers["last-modified"] ?? null,
      }));
    });
    request.setTimeout(30_000, () => request.destroy(new Error("Rules request timed out")));
    request.on("error", reject);
  });
}

async function materializeRules(temp, configs, fetcher = fetchBytes) {
  const rules = [];
  for (let index = 0; index < configs.length; index += 1) {
    const config = configs[index];
    const fetched = config.file
      ? { bytes: await fsp.readFile(config.file), etag: null, lastModified: null }
      : await fetcher(config.url);
    const file = path.join(temp, `rules-${index}.yaml`);
    await fsp.writeFile(file, fetched.bytes, { mode: 0o600 });
    const text = fetched.bytes.toString("utf8");
    rules.push({
      name: config.name,
      source: config.url ?? "local-test-config",
      sha256: sha256(fetched.bytes),
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      ruleCount: (text.match(/^- id:/gm) ?? []).length,
      file,
    });
  }
  return rules;
}

async function stageInventory(root, stage, inventory) {
  for (const entry of inventory.files) {
    const destination = path.join(stage, entry.path);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(path.join(root, entry.path), destination);
  }
}

function runBounded(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk.slice(0, 64 * 1024 - stderr.length);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stderr });
    });
  });
}

function normalizeStagedPath(value, stage) {
  if (typeof value !== "string") return null;
  const normalized = slash(value);
  const prefix = `${slash(stage)}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

function safeScannerError(error, stage) {
  return {
    type: String(error?.type ?? error?.code ?? "scanner-error").slice(0, 120),
    path: normalizeStagedPath(error?.path, stage),
    message: String(error?.message ?? error?.type ?? "scanner error")
      .replaceAll(slash(stage), "<temporary-scan-root>")
      .slice(0, 500),
  };
}

export function sanitizeSemgrep(raw, stage) {
  const findings = (raw.results ?? []).map((finding) => ({
    ruleId: String(finding.check_id ?? "unknown"),
    severity: String(finding.extra?.severity ?? "UNKNOWN").toUpperCase(),
    path: normalizeStagedPath(finding.path, stage),
    start: {
      line: finding.start?.line ?? null,
      column: finding.start?.col ?? null,
    },
    end: {
      line: finding.end?.line ?? null,
      column: finding.end?.col ?? null,
    },
    message: String(finding.extra?.message ?? "").slice(0, 1_000),
    cwe: Array.isArray(finding.extra?.metadata?.cwe) ? finding.extra.metadata.cwe.map(String) : [],
    confidence: finding.extra?.metadata?.confidence ?? null,
    fingerprint: sha256([
      finding.check_id, normalizeStagedPath(finding.path, stage),
      finding.start?.line, finding.start?.col, finding.end?.line, finding.end?.col,
    ].join("\0")),
  }));
  findings.sort((a, b) => a.path.localeCompare(b.path)
    || (a.start.line ?? 0) - (b.start.line ?? 0)
    || a.ruleId.localeCompare(b.ruleId));
  return {
    findings,
    errors: (raw.errors ?? []).map((error) => safeScannerError(error, stage)),
    scanned: [...new Set((raw.paths?.scanned ?? []).map((file) => normalizeStagedPath(file, stage)))].sort(),
    skipped: (raw.paths?.skipped ?? []).map((item) => ({
      path: normalizeStagedPath(item.path, stage),
      reason: String(item.reason ?? "scanner-skip").slice(0, 200),
    })),
  };
}

function severityCounts(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  return counts;
}

function languageCoverage(inventory, scanned) {
  const scannedSet = new Set(scanned);
  const coverage = {};
  for (const file of inventory.files) {
    coverage[file.language] ??= { inventory: 0, scanned: 0, omitted: 0 };
    coverage[file.language].inventory += 1;
    if (scannedSet.has(file.path)) coverage[file.language].scanned += 1;
    else coverage[file.language].omitted += 1;
  }
  return coverage;
}

function renderMarkdown(report) {
  const lines = [
    "# SCAN-05 SAST recovery evidence",
    "",
    `**Disposition: ${report.complete ? "complete for declared inventory" : "INCOMPLETE"}**`,
    "",
    "This is independent local Semgrep evidence. It does not certify production readiness or alter any security gate.",
    "Finding records intentionally contain no matched source text, metavariable values, or secret values.",
    "",
    "## Scanner and rules",
    "",
    `- Scanner: Semgrep ${report.scanner.version}`,
    `- Isolation: PYTHONPATH/PYTHONHOME removed only for scanner children; PYTHONNOUSERSITE=1`,
    `- Metrics/version checks: disabled; code upload and autofix: not used`,
    ...report.rules.map((rule) => `- ${rule.name}: ${rule.ruleCount} rules; SHA-256 \`${rule.sha256}\`; ETag \`${rule.etag ?? "not supplied"}\``),
    "",
    "Registry packs do not expose a semantic pack version in their fetched YAML. The byte digest and HTTP ETag above are the exact rule revision identifiers used.",
    "",
    "## Coverage",
    "",
    `- Git-tracked first-party source inventory: ${report.inventory.fileCount} files / ${report.inventory.byteCount} bytes`,
    `- Inventory manifest SHA-256: \`${report.inventory.sha256}\``,
    `- Scanner-reported paths: ${report.coverage.scannedCount}`,
    `- Omitted inventory paths: ${report.coverage.omitted.length}`,
    `- Parse/scanner errors: ${report.errors.length}; explicit skips: ${report.skipped.length}`,
    "",
    "| Language | Inventory | Scanned | Omitted |",
    "|---|---:|---:|---:|",
    ...Object.entries(report.coverage.languages).sort().map(([language, value]) =>
      `| ${language} | ${value.inventory} | ${value.scanned} | ${value.omitted} |`),
    "",
    "Generated dependencies, generated bundles, evidence/report caches, attached assets, and release/archive outputs are excluded. Nested first-party source under external/maxcore and external/pdim remains included; only nested generated segments such as dist are excluded.",
    "",
    "## Findings",
    "",
    `- Total: ${report.findings.length}`,
    `- Severity counts: ${JSON.stringify(report.summary.severityCounts)}`,
  ];
  if (report.findings.length) {
    lines.push("", "| Priority | Rule | Location | CWE |", "|---|---|---|---|");
    for (const finding of report.findings) {
      const priority = finding.severity === "ERROR" ? "P1" : finding.severity === "WARNING" ? "P2" : "P3";
      lines.push(`| ${priority} | ${finding.ruleId} | ${finding.path}:${finding.start.line ?? "?"} | ${(finding.cwe ?? []).join(", ") || "—"} |`);
    }
  }
  lines.push(
    "",
    "## Incompleteness and errors",
    "",
    ...(report.incompleteReasons.length ? report.incompleteReasons.map((reason) => `- ${reason}`) : ["- None for the declared inventory."]),
    ...(report.errors.map((error) => `- Scanner error (${error.type})${error.path ? ` at ${error.path}` : ""}: ${error.message}`)),
    ...(report.skipped.map((skip) => `- Skipped ${skip.path ?? "unknown path"}: ${skip.reason}`)),
    "",
    "Every finding requires source-level validation. Prioritize ERROR findings at exposed trust boundaries, then WARNING findings involving command execution, path traversal, injection, authorization, cryptography, or credential handling.",
    "",
  );
  return lines.join("\n");
}

export async function runScan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outputJson = path.resolve(root, options.outputJson ?? "reports/readiness-implementation/sast-recovery.json");
  const outputMarkdown = path.resolve(root, options.outputMarkdown ?? "reports/readiness-implementation/sast-recovery.md");
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "readiness-sast-"));
  await fsp.chmod(temp, 0o700);
  const stage = path.join(temp, "source");
  const rawFile = path.join(temp, "semgrep-raw.json");
  let report;
  try {
    const inventory = await buildInventory(root, options.filesOverride);
    await fsp.mkdir(stage, { recursive: true, mode: 0o700 });
    await stageInventory(root, stage, inventory);
    const rules = await materializeRules(temp, options.configs ?? DEFAULT_CONFIGS, options.fetcher);
    const env = isolatedScannerEnv(options.env);
    const scanner = options.scanner ?? "semgrep";
    const { stdout: scannerVersionOutput } = await execFileAsync(scanner, ["--version"], {
      env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const scannerVersion = String(scannerVersionOutput).trim().split(/\s+/).at(-1);
    const args = [
      "scan", "--json-output", rawFile, "--metrics", "off", "--disable-version-check",
      "--no-autofix", "--strict", "--timeout", String(options.ruleTimeoutSeconds ?? 10),
      "--timeout-threshold", "1", "--max-memory", String(options.maxMemoryMb ?? 4096),
      "--max-target-bytes", "0", "--jobs", String(options.jobs ?? 2),
      ...rules.flatMap((rule) => ["--config", rule.file]),
      stage,
    ];
    const execution = await runBounded(scanner, args, {
      cwd: root,
      env,
      timeoutMs: options.timeoutMs ?? 30 * 60_000,
    });
    let raw = {};
    try {
      raw = JSON.parse(await fsp.readFile(rawFile, "utf8"));
    } catch (error) {
      raw = { errors: [{ type: "invalid-or-missing-json", message: error.message }] };
    }
    const sanitized = sanitizeSemgrep(raw, stage);
    const expected = new Set(inventory.files.map((file) => file.path));
    const omitted = [...expected].filter((file) => !sanitized.scanned.includes(file)).sort();
    const unexpected = sanitized.scanned.filter((file) => !expected.has(file));
    const incompleteReasons = [];
    if (execution.timedOut) incompleteReasons.push("Scanner process exceeded the outer 30-minute bound.");
    if (execution.code !== 0) incompleteReasons.push(`Scanner exited nonzero (${execution.code ?? execution.signal ?? "unknown"}).`);
    if (sanitized.errors.length) incompleteReasons.push(`${sanitized.errors.length} scanner/parse error(s) were reported.`);
    if (sanitized.skipped.length) incompleteReasons.push(`${sanitized.skipped.length} path(s) were explicitly skipped.`);
    if (omitted.length) incompleteReasons.push(`${omitted.length} inventoried source file(s) were not reported scanned; this evidence is not called full.`);
    if (unexpected.length) incompleteReasons.push(`${unexpected.length} scanner path(s) were outside the declared inventory.`);
    if (!rules.length || rules.some((rule) => rule.ruleCount === 0)) incompleteReasons.push("One or more rulesets contained no countable rules.");
    report = {
      schemaVersion: 1,
      evidenceType: "SCAN-05-independent-local-sast",
      generatedAt: new Date().toISOString(),
      complete: incompleteReasons.length === 0,
      incompleteReasons,
      scanner: {
        name: "semgrep",
        version: scannerVersion,
        commandPolicy: {
          metrics: "off",
          versionCheck: "disabled",
          codeUpload: false,
          autofix: false,
          outerTimeoutSeconds: (options.timeoutMs ?? 30 * 60_000) / 1000,
          perRuleTimeoutSeconds: options.ruleTimeoutSeconds ?? 10,
          timeoutThreshold: 1,
          maxMemoryMb: options.maxMemoryMb ?? 4096,
          jobs: options.jobs ?? 2,
        },
      },
      rules: rules.map(({ file, ...rule }) => rule),
      inventory: {
        fileCount: inventory.fileCount,
        byteCount: inventory.byteCount,
        sha256: inventory.sha256,
        files: inventory.files,
        exclusions: inventory.excluded,
      },
      coverage: {
        scannedCount: sanitized.scanned.length,
        scanned: sanitized.scanned,
        omitted,
        unexpected,
        languages: languageCoverage(inventory, sanitized.scanned),
      },
      findings: sanitized.findings,
      errors: sanitized.errors,
      skipped: sanitized.skipped,
      summary: { severityCounts: severityCounts(sanitized.findings) },
      gateEffect: "none; existing production-readiness and SCAN-05 contracts remain authoritative",
    };
    await fsp.mkdir(path.dirname(outputJson), { recursive: true });
    await fsp.mkdir(path.dirname(outputMarkdown), { recursive: true });
    await fsp.writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
    await fsp.writeFile(outputMarkdown, renderMarkdown(report), { mode: 0o644 });
    return report;
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--root", "--output-json", "--output-md", "--scanner"].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index += 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    values[arg] = value;
  }
  return {
    root: values["--root"],
    outputJson: values["--output-json"],
    outputMarkdown: values["--output-md"],
    scanner: values["--scanner"],
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = await runScan(parseArguments(process.argv.slice(2)));
    console.log(`SAST evidence written: ${result.findings.length} finding(s), complete=${result.complete}`);
    process.exitCode = result.complete ? 0 : 2;
  } catch (error) {
    console.error(`SAST runner failed: ${error.message}`);
    process.exitCode = 2;
  }
}
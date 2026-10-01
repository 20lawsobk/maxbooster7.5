/**
 * readiness-gauge — the check library.
 *
 * Each check is a small, runnable probe against the repository. Checks are
 * deliberately hermetic: they shell out to git/node tooling already present
 * in a dev environment and never touch production services or deploy APIs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  Check,
  CheckContext,
  CheckResult,
  CheckStatus,
} from "./types.js";

interface CmdOutcome {
  ok: boolean;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runCmd(
  cwd: string,
  cmd: string,
  args: string[],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): CmdOutcome {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout, stderr: "", timedOut: false };
  } catch (err: any) {
    // execFileSync kills the child with SIGTERM on timeout.
    if (err?.killed) return { ok: false, stdout: "", stderr: "", timedOut: true };
    return {
      ok: false,
      stdout: String(err?.stdout ?? ""),
      stderr: String(err?.stderr ?? err?.message ?? ""),
      timedOut: false,
    };
  }
}

function result(
  status: CheckStatus,
  summary: string,
  evidence: string[] = [],
  remediation?: string,
): Omit<CheckResult, "durationMs"> {
  return { status, summary, evidence, remediation };
}

function blocked(summary: string, remediation?: string) {
  return result("blocked", summary, [], remediation);
}

function gitGrep(
  cwd: string,
  args: string[],
  timeoutMs: number,
): CmdOutcome {
  return runCmd(cwd, "git", ["grep", "-I", ...args], timeoutMs);
}

function cfgNum(config: Record<string, unknown>, key: string, def: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function cfgStrArr(config: Record<string, unknown>, key: string): string[] {
  const v = config[key];
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string")
    : [];
}

/* ── security ─────────────────────────────────────────────────────────── */

/**
 * [regex, label, needsContext]. needsContext patterns (like PEM headers) are
 * verified with -A2: the hit only counts when a following line looks like
 * actual key material (long base64 run), not a template literal such as
 * `-----BEGIN PRIVATE KEY-----\n${keyBody}\n-----END ...`.
 */
const SECRET_PATTERNS: [string, string, boolean][] = [
  ["sk_live_[A-Za-z0-9]{16,}", "Stripe live secret key", false],
  ["AKIA[0-9A-Z]{16}", "AWS access key id", false],
  ["-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----", "private key block", true],
  ["ghp_[A-Za-z0-9]{36}", "GitHub personal access token", false],
  ["gho_[A-Za-z0-9]{36}", "GitHub OAuth token", false],
  ["xox[baprs]-[A-Za-z0-9-]{10,}", "Slack token", false],
  ["AIza[0-9A-Za-z_\\-]{35}", "Google API key", false],
];

const BASE64_KEY_MATERIAL = /^[A-Za-z0-9+/=]{60,}\s*$/;

/** Parse `git grep -A2` output; keep only hits with key-like context lines. */
function filterContextHits(output: string): string[] {
  const hits: string[] = [];
  let pendingFile = "";
  let pendingLine = "";
  let contextOk = false;
  const flush = () => {
    if (pendingFile && contextOk) hits.push(`${pendingFile}:${pendingLine}`);
    pendingFile = "";
    contextOk = false;
  };
  for (const raw of output.split("\n")) {
    const line = raw.trimEnd();
    if (line === "--") {
      flush();
      continue;
    }
    // Match lines look like "path:123:content"; context lines "path-124:content".
    const m = /^(.+?)([:-])(\d+)\2(.*)$/.exec(line);
    if (!m) {
      flush();
      continue;
    }
    if (m[2] === ":") {
      flush();
      pendingFile = m[1];
      pendingLine = m[3];
    } else if (pendingFile && BASE64_KEY_MATERIAL.test(m[4].trim())) {
      contextOk = true;
    }
  }
  flush();
  return hits;
}

export interface SecretScanOptions {
  /** Git pathspec globs to skip, e.g. ["tests/fixtures/**"]. */
  exclude?: string[];
  /** Pathspecs to scan; defaults to ["."] (the whole repo). */
  paths?: string[];
}

/**
 * Run the secret patterns over tracked files via `git grep`. Returns the
 * redacted hit set, or null when the scan timed out.
 *
 * Exported so tests can probe the gauge's own tracked files — the gauge must
 * never flag its own test fixtures as committed secrets.
 */
export function collectSecretHits(
  cwd: string,
  opts: SecretScanOptions = {},
): Set<string> | null {
  const paths = opts.paths?.length ? opts.paths : ["."];
  const exclusions = (opts.exclude ?? []).map((g) => `:!${g}`);
  const hits = new Set<string>();
  for (const [pat, , needsContext] of SECRET_PATTERNS) {
    const base = needsContext ? ["-n", "-E", "-A2"] : ["-n", "-E"];
    const out = gitGrep(cwd, [...base, "-e", pat, "--", ...paths, ...exclusions], 55_000);
    if (out.timedOut) return null;
    // git grep exits 1 when nothing matches — the passing case.
    if (needsContext) {
      for (const h of filterContextHits(out.stdout)) hits.add(`${h}:<redacted match>`);
    } else {
      const lines = out.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const l of lines) hits.add(l.replace(/:.*$/, "") + ":<redacted match>");
    }
  }
  return hits;
}

const secretsScan: Check = {
  id: "secrets-scan",
  name: "Secrets scan",
  category: "security",
  description:
    "Scans tracked files for committed secrets (API keys, tokens, private keys). " +
    "Config `exclude` takes git pathspec globs to skip (e.g. test fixtures).",
  timeoutMs: 60_000,
  async run(ctx, config) {
    const t0 = Date.now();
    const hits = collectSecretHits(ctx.cwd, { exclude: cfgStrArr(config, "exclude") });
    if (hits === null) {
      return { ...blocked("secrets scan timed out"), durationMs: Date.now() - t0 };
    }
    const uniq = [...hits].slice(0, 20);
    if (hits.size > 0) {
      return {
        ...result(
          "fail",
          `${hits.size} potential secret(s) found in tracked files`,
          uniq,
          "Remove the secrets, rotate them, and use environment variables or a secret manager instead.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "no secrets detected in tracked files"),
      durationMs: Date.now() - t0,
    };
  },
};

const dependencyAudit: Check = {
  id: "dependency-audit",
  name: "Dependency audit",
  category: "security",
  description:
    "Runs npm audit and counts high/critical vulnerabilities.",
  timeoutMs: 180_000,
  async run(ctx, config) {
    const t0 = Date.now();
    const maxHigh = cfgNum(config, "maxHigh", 0);
    const maxCritical = cfgNum(config, "maxCritical", 0);
    const out = runCmd(ctx.cwd, "npm", ["audit", "--json", "--no-audit-level"], 170_000);
    if (out.timedOut) {
      return { ...blocked("npm audit timed out"), durationMs: Date.now() - t0 };
    }
    let data: any = null;
    try {
      data = JSON.parse(out.stdout);
    } catch {
      const errText = (out.stderr || "").slice(0, 300);
      return {
        ...blocked(
          "npm audit output was not parseable (registry unreachable?)",
          `Investigate manually: npm audit. Stderr: ${errText}`,
        ),
        durationMs: Date.now() - t0,
      };
    }
    const vuln = data?.metadata?.vulnerabilities ?? {};
    const critical = Number(vuln.critical ?? 0);
    const high = Number(vuln.high ?? 0);
    const moderate = Number(vuln.moderate ?? 0);
    const low = Number(vuln.low ?? 0);
    const summary = `critical=${critical} high=${high} moderate=${moderate} low=${low}`;
    if (critical > maxCritical || high > maxHigh) {
      return {
        ...result(
          "fail",
          `vulnerabilities exceed threshold (${summary})`,
          [summary],
          "Run `npm audit fix`, upgrade affected packages, or document accepted risks.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    if (moderate > 0 || low > 0) {
      return {
        ...result("warn", `only moderate/low vulnerabilities (${summary})`),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", `no vulnerabilities (${summary})`),
      durationMs: Date.now() - t0,
    };
  },
};

/* ── correctness ──────────────────────────────────────────────────────── */

const typecheck: Check = {
  id: "typecheck",
  name: "TypeScript typecheck",
  category: "correctness",
  description: "Runs the server and client tsc --noEmit projects.",
  timeoutMs: 240_000,
  async run(ctx) {
    const t0 = Date.now();
    const evidence: string[] = [];
    let failures = 0;
    for (const proj of ["tsconfig.server.json", "tsconfig.client.json"]) {
      if (!existsSync(join(ctx.cwd, proj))) {
        evidence.push(`${proj}: not present, skipped`);
        continue;
      }
      const out = runCmd(
        ctx.cwd,
        "./node_modules/.bin/tsc",
        ["-p", proj, "--noEmit"],
        110_000,
        { NODE_OPTIONS: "--max-old-space-size=4096" },
      );
      if (out.timedOut) {
        return {
          ...blocked(`typecheck timed out on ${proj}`),
          durationMs: Date.now() - t0,
        };
      }
      const errors = (out.stdout + out.stderr)
        .split("\n")
        .filter((l) => l.includes("error TS"));
      if (!out.ok || errors.length > 0) {
        failures++;
        evidence.push(`${proj}: ${errors.length} error(s)`);
        evidence.push(...errors.slice(0, 5));
      } else {
        evidence.push(`${proj}: clean`);
      }
    }
    if (failures > 0) {
      return {
        ...result(
          "fail",
          `${failures} TypeScript project(s) have errors`,
          evidence,
          "Fix the reported type errors; check @ts-nocheck coverage if errors are being hidden.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "server and client typecheck clean", evidence),
      durationMs: Date.now() - t0,
    };
  },
};

const unitTests: Check = {
  id: "unit-tests",
  name: "Unit test suite",
  category: "correctness",
  description: "Runs the full vitest suite and parses the summary.",
  timeoutMs: 900_000,
  async run(ctx) {
    const t0 = Date.now();
    const out = runCmd(
      ctx.cwd,
      "./node_modules/.bin/vitest",
      ["run"],
      880_000,
      { NODE_OPTIONS: "--max-old-space-size=4096", CI: "1" },
    );
    if (out.timedOut) {
      return {
        ...blocked("test suite timed out", "Run the suite in CI with sharding."),
        durationMs: Date.now() - t0,
      };
    }
    // Strip ANSI escapes so summary regexes work regardless of color settings.
    const text = (out.stdout + out.stderr).replace(/\u001b\[[0-9;]*m/g, "");
    const filesM = text.match(/Test Files\s+(\d+)\s+passed(?:\s*\((\d+)\))?/);
    const failedFilesM = text.match(/Test Files[^\n]*?(\d+)\s+failed/);
    const testsM = text.match(/Tests\s+(\d+)\s+passed/);
    const failedTestsM = text.match(/Tests[^\n]*?(\d+)\s+failed/);
    const skippedM = text.match(/(\d+)\s+skipped/);
    const evidence = [
      `Test Files: ${filesM?.[1] ?? "?"} passed${failedFilesM ? `, ${failedFilesM[1]} failed` : ""}`,
      `Tests: ${testsM?.[1] ?? "?"} passed${failedTestsM ? `, ${failedTestsM[1]} failed` : ""}${skippedM ? `, ${skippedM[1]} skipped` : ""}`,
    ];
    const failed = Number(failedFilesM?.[1] ?? 0) + Number(failedTestsM?.[1] ?? 0);
    if (!filesM || !testsM) {
      return {
        ...blocked("could not parse vitest summary", "Run vitest locally and inspect the output."),
        durationMs: Date.now() - t0,
      };
    }
    if (failed > 0 || !out.ok) {
      return {
        ...result("fail", `${failed} test failure(s)`, evidence, "Fix failing tests before shipping."),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", `all tests pass (${testsM[1]} passed)`, evidence),
      durationMs: Date.now() - t0,
    };
  },
};

/* ── maintainability ──────────────────────────────────────────────────── */

const lint: Check = {
  id: "lint",
  name: "Lint",
  category: "maintainability",
  description: "Runs ESLint over server, client, and shared code.",
  timeoutMs: 300_000,
  async run(ctx) {
    const t0 = Date.now();
    const out = runCmd(
      ctx.cwd,
      "node",
      ["node_modules/eslint/bin/eslint.js", "server", "client", "shared", "--quiet"],
      280_000,
    );
    if (out.timedOut) {
      return { ...blocked("eslint timed out"), durationMs: Date.now() - t0 };
    }
    const problems = (out.stdout + out.stderr)
      .split("\n")
      .filter((l) => l.includes("error") || l.includes("warning"))
      .slice(0, 5);
    if (!out.ok) {
      return {
        ...result("fail", "eslint reported problems", problems, "Run `npm run lint:fix` and fix remaining issues."),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "eslint clean"),
      durationMs: Date.now() - t0,
    };
  },
};

const todoScan: Check = {
  id: "todo-scan",
  name: "TODO / FIXME scan",
  category: "maintainability",
  description: "Counts TODO/FIXME/XXX/HACK markers in tracked source.",
  timeoutMs: 120_000,
  async run(ctx, config) {
    const t0 = Date.now();
    const warnAt = cfgNum(config, "warnAt", 50);
    const failAt = cfgNum(config, "failAt", 200);
    const out = gitGrep(
      ctx.cwd,
      ["-c", "-E", "-e", "TODO", "-e", "FIXME", "-e", "XXX", "-e", "HACK", "--", "server", "client", "shared", "scripts"],
      100_000,
    );
    if (out.timedOut) {
      return { ...blocked("todo scan timed out"), durationMs: Date.now() - t0 };
    }
    let total = 0;
    const perFile: string[] = [];
    for (const line of out.stdout.split("\n")) {
      const m = /^(.+):(\d+)$/.exec(line.trim());
      if (m) {
        total += Number(m[2]);
        perFile.push(`${m[1]}: ${m[2]}`);
      }
    }
    perFile.sort((a, b) => Number(b.split(": ")[1]) - Number(a.split(": ")[1]));
    const evidence = [`${total} marker(s) total`, ...perFile.slice(0, 8)];
    if (total >= failAt) {
      return {
        ...result("fail", `${total} markers (>= fail threshold ${failAt})`, evidence, "Triage and resolve stale markers."),
        durationMs: Date.now() - t0,
      };
    }
    if (total >= warnAt) {
      return {
        ...result("warn", `${total} markers (>= warn threshold ${warnAt})`, evidence),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", `${total} markers (below warn threshold ${warnAt})`),
      durationMs: Date.now() - t0,
    };
  },
};

/* ── deployability ────────────────────────────────────────────────────── */

const productionBuild: Check = {
  id: "production-build",
  name: "Production build",
  category: "deployability",
  description:
    "Runs the production build script (client bundle + server bundles).",
  timeoutMs: 900_000,
  async run(ctx) {
    const t0 = Date.now();
    const buildScript = existsSync(join(ctx.cwd, "script/build.ts"))
      ? "script/build.ts"
      : null;
    if (!buildScript) {
      return {
        ...blocked("no production build script found (script/build.ts)"),
        durationMs: Date.now() - t0,
      };
    }
    const out = runCmd(
      ctx.cwd,
      "./node_modules/.bin/tsx",
      [buildScript],
      880_000,
      { NODE_OPTIONS: "--max-old-space-size=4096" },
    );
    if (out.timedOut) {
      return {
        ...blocked("production build timed out", "Investigate build performance in CI."),
        durationMs: Date.now() - t0,
      };
    }
    const bundleOk = existsSync(join(ctx.cwd, "dist/index.mjs"));
    if (!out.ok || !bundleOk) {
      const tail = (out.stdout + out.stderr).split("\n").slice(-8);
      return {
        ...result("fail", "production build failed", tail, "Fix the build errors above; the deploy pipeline runs this script."),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "production build succeeded (dist/index.mjs present)"),
      durationMs: Date.now() - t0,
    };
  },
};

const largeFiles: Check = {
  id: "large-files",
  name: "Large tracked files",
  category: "deployability",
  description:
    "Fails when tracked files exceed the deploy-image size budget.",
  timeoutMs: 120_000,
  async run(ctx, config) {
    const t0 = Date.now();
    const maxBytes = cfgNum(config, "maxBytes", 25 * 1024 * 1024);
    const out = runCmd(ctx.cwd, "git", ["ls-files", "-z"], 60_000);
    if (!out.ok || out.timedOut) {
      return { ...blocked("could not list tracked files"), durationMs: Date.now() - t0 };
    }
    const offenders: string[] = [];
    for (const p of out.stdout.split("\0").filter(Boolean)) {
      try {
        const st = statSync(join(ctx.cwd, p));
        if (st.isFile() && st.size > maxBytes) {
          offenders.push(`${p} (${(st.size / 1024 / 1024).toFixed(1)} MB)`);
        }
      } catch {
        // File vanished between listing and stat; ignore.
      }
    }
    if (offenders.length > 0) {
      return {
        ...result(
          "fail",
          `${offenders.length} file(s) exceed ${(maxBytes / 1024 / 1024).toFixed(0)} MB`,
          offenders.slice(0, 10),
          "Move large assets to object storage or a CDN; keep the deploy image lean.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", `no tracked file exceeds ${(maxBytes / 1024 / 1024).toFixed(0)} MB`),
      durationMs: Date.now() - t0,
    };
  },
};

/* ── operations ───────────────────────────────────────────────────────── */

const envConfig: Check = {
  id: "env-config",
  name: "Environment configuration",
  category: "operations",
  description:
    "Verifies every process.env.* used in server code is documented in .env.example.",
  timeoutMs: 60_000,
  async run(ctx, config) {
    const t0 = Date.now();
    const maxUndocumented = cfgNum(config, "maxUndocumented", 5);
    const out = gitGrep(
      ctx.cwd,
      ["-h", "-o", "-E", "process\\.env\\.[A-Za-z_][A-Za-z0-9_]*", "--", "server"],
      50_000,
    );
    if (out.timedOut) {
      return { ...blocked("env scan timed out"), durationMs: Date.now() - t0 };
    }
    const used = [
      ...new Set(
        out.stdout
          .split("\n")
          .map((l) => l.trim().replace("process.env.", ""))
          .filter(Boolean),
      ),
    ].sort();
    const excludedVars = new Set(cfgStrArr(config, "excludeVars"));
    const documentedCandidates = used.filter((name) => !excludedVars.has(name));
    const excludedCount = used.length - documentedCandidates.length;
    const examplePath = join(ctx.cwd, ".env.example");
    if (!existsSync(examplePath)) {
      return {
        ...result(
          "warn",
          `.env.example missing; ${documentedCandidates.length} env var(s) used in server code`,
          documentedCandidates.slice(0, 15),
          "Add a .env.example documenting every required variable.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    const example = readFileSync(examplePath, "utf8");
    const documentedVars = new Set(
      example
        .split(/\r?\n/)
        .flatMap((line) => {
          const match = line.match(
            /^\s*(?:#\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
          );
          return match ? [match[1]] : [];
        }),
    );
    const undocumented = documentedCandidates.filter(
      (name) => !documentedVars.has(name),
    );
    if (undocumented.length > maxUndocumented) {
      return {
        ...result(
          "fail",
          `${undocumented.length} env var(s) undocumented (>${maxUndocumented})`,
          undocumented.slice(0, 15),
          "Document them in .env.example.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    if (undocumented.length > 0) {
      return {
        ...result(
          "warn",
          `${undocumented.length} env var(s) undocumented`,
          undocumented,
          "Document them in .env.example.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result(
        "pass",
        `all ${documentedCandidates.length} env var(s) documented in .env.example; ${excludedCount} reviewed internal/test variable(s) excluded`,
      ),
      durationMs: Date.now() - t0,
    };
  },
};

const healthEndpoint: Check = {
  id: "health-endpoint",
  name: "Health endpoint",
  category: "operations",
  description: "Verifies the server exposes a /health route for load balancers.",
  timeoutMs: 30_000,
  async run(ctx) {
    const t0 = Date.now();
    const out = gitGrep(
      ctx.cwd,
      ["-l", "-E", "['\"]\\/health['\"]", "--", "server"],
      25_000,
    );
    if (out.timedOut) {
      return { ...blocked("health endpoint scan timed out"), durationMs: Date.now() - t0 };
    }
    const files = out.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    if (files.length === 0) {
      return {
        ...result(
          "fail",
          "no /health route found in server code",
          [],
          "Add a lightweight /health endpoint (no DB dependency) for orchestrator probes.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", `/health route found`, files.slice(0, 5)),
      durationMs: Date.now() - t0,
    };
  },
};

const portContract: Check = {
  id: "port-contract",
  name: "PORT contract",
  category: "operations",
  description:
    "Verifies the server honors the PORT environment variable (platform contract).",
  timeoutMs: 30_000,
  async run(ctx) {
    const t0 = Date.now();
    const out = gitGrep(
      ctx.cwd,
      ["-l", "-E", "process\\.env\\.PORT", "--", "server"],
      25_000,
    );
    if (out.timedOut) {
      return { ...blocked("PORT scan timed out"), durationMs: Date.now() - t0 };
    }
    const files = out.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    if (files.length === 0) {
      return {
        ...result(
          "fail",
          "server never reads process.env.PORT",
          [],
          "Bind to process.env.PORT (with a local default) so the platform can route traffic.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "PORT env contract honored", files.slice(0, 5)),
      durationMs: Date.now() - t0,
    };
  },
};

const nodeVersion: Check = {
  id: "node-version",
  name: "Node version pin",
  category: "operations",
  description:
    "Verifies the running Node satisfies package.json engines (or warns when unpinned).",
  timeoutMs: 30_000,
  async run() {
    const t0 = Date.now();
    let pkg: any = {};
    try {
      pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    } catch {
      // Fall through; resolved against ctx below.
    }
    return finishNodeCheck(pkg, t0);
  },
};

function finishNodeCheck(pkg: any, t0: number): Omit<CheckResult, "durationMs"> & { durationMs: number } {
  const engines: string | undefined = pkg?.engines?.node;
  const running = process.version;
  if (!engines) {
    return {
      ...result(
        "warn",
        `no engines.node pin (running ${running})`,
        [],
        "Pin the runtime in package.json engines and .nvmrc so prod matches dev.",
      ),
      durationMs: Date.now() - t0,
    };
  }
  // Minimal semver-range support: ">=18", "^20", "20.x", "22".
  const m = /^(>=|\^|~)?(\d+)(?:\.(\d+))?/.exec(engines.trim());
  if (!m) {
    return { ...result("warn", `unparseable engines range "${engines}" (running ${running})`), durationMs: Date.now() - t0 };
  }
  const wantMajor = Number(m[2]);
  const runningMajor = Number(running.replace(/^v/, "").split(".")[0]);
  const op = m[1] ?? "";
  const ok =
    op === ">=" ? runningMajor >= wantMajor : runningMajor === wantMajor;
  if (!ok) {
    return {
      ...result(
        "fail",
        `running ${running} does not satisfy engines "${engines}"`,
        [],
        "Run the gauge under the pinned Node version.",
      ),
      durationMs: Date.now() - t0,
    };
  }
  return {
    ...result("pass", `running ${running} satisfies engines "${engines}"`),
    durationMs: Date.now() - t0,
  };
}

/* ── data ─────────────────────────────────────────────────────────────── */

const migrations: Check = {
  id: "migrations",
  name: "DB migration setup",
  category: "data",
  description: "Verifies a migration framework/directory is present.",
  timeoutMs: 30_000,
  async run(ctx) {
    const t0 = Date.now();
    const candidates = [
      "drizzle.config.ts",
      "drizzle.config.js",
      "drizzle",
      "migrations",
      "server/migrations",
      "prisma",
      "db/migrations",
    ];
    const found = candidates.filter((c) => existsSync(join(ctx.cwd, c)));
    if (found.length === 0) {
      return {
        ...result(
          "warn",
          "no migration setup detected",
          [],
          "Adopt a migration framework (drizzle-kit, prisma, etc.) so schema changes are repeatable.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "migration setup present", found),
      durationMs: Date.now() - t0,
    };
  },
};

/* ── process ──────────────────────────────────────────────────────────── */

const ciConfig: Check = {
  id: "ci-config",
  name: "CI configuration",
  category: "process",
  description: "Verifies a CI pipeline definition exists.",
  timeoutMs: 30_000,
  async run(ctx) {
    const t0 = Date.now();
    const candidates = [
      ".github/workflows",
      ".gitlab-ci.yml",
      "azure-pipelines.yml",
      "bitbucket-pipelines.yml",
      ".circleci/config.yml",
      ".replit",
    ];
    const found = candidates.filter((c) => existsSync(join(ctx.cwd, c)));
    if (found.length === 0) {
      return {
        ...result(
          "warn",
          "no CI configuration detected",
          [],
          "Add a CI workflow that runs typecheck, tests, lint, and build on every push.",
        ),
        durationMs: Date.now() - t0,
      };
    }
    return {
      ...result("pass", "CI configuration present", found),
      durationMs: Date.now() - t0,
    };
  },
};

const readme: Check = {
  id: "readme",
  name: "README",
  category: "process",
  description: "Verifies a substantive README exists.",
  timeoutMs: 30_000,
  async run(ctx) {
    const t0 = Date.now();
    const minChars = 500;
    for (const name of ["README.md", "README", "readme.md"]) {
      const p = join(ctx.cwd, name);
      if (existsSync(p)) {
        const len = readFileSync(p, "utf8").length;
        if (len >= minChars) {
          return {
            ...result("pass", `${name} present (${len} chars)`),
            durationMs: Date.now() - t0,
          };
        }
        return {
          ...result(
            "warn",
            `${name} is only ${len} chars (< ${minChars})`,
            [],
            "Document setup, environment, and deploy steps in the README.",
          ),
          durationMs: Date.now() - t0,
        };
      }
    }
    return {
      ...result("warn", "no README found", [], "Add a README with setup and deploy documentation."),
      durationMs: Date.now() - t0,
    };
  },
};

/** Fix node-version to read package.json from the check's cwd. */
const nodeVersionFixed: Check = {
  ...nodeVersion,
  async run(ctx) {
    const t0 = Date.now();
    let pkg: any = {};
    try {
      pkg = JSON.parse(readFileSync(join(ctx.cwd, "package.json"), "utf8"));
    } catch {
      /* leave empty */
    }
    return finishNodeCheck(pkg, t0);
  },
};

export const ALL_CHECKS: Check[] = [
  secretsScan,
  dependencyAudit,
  typecheck,
  unitTests,
  lint,
  todoScan,
  productionBuild,
  largeFiles,
  envConfig,
  healthEndpoint,
  portContract,
  nodeVersionFixed,
  migrations,
  ciConfig,
  readme,
];

export const CHECK_IDS = ALL_CHECKS.map((c) => c.id);

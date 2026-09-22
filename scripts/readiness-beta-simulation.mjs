#!/usr/bin/env node
// Isolated contract evidence only. Never start the application or run migrations here.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const scratch = mkdtempSync(join(tmpdir(), "readiness-beta-"));
const reportBase = "reports/readiness-implementation/beta-simulation";
const node = process.execPath;
const timeoutMs = 90000;
const outputLimit = 512 * 1024;
const guard = join(scratch, "network-guard.cjs");
// Allow only an ephemeral loopback fixture started in this very process.
// This is defense in depth, not an OS network sandbox; Python tests are source-reviewed.
writeFileSync(guard, `
const net = require("node:net");
const ports = new Set();
const emit = net.Server.prototype.emit;
net.Server.prototype.emit = function(event, ...args) {
  if (event === "listening") {
    const a = this.address();
    if (a && typeof a === "object" && ["127.0.0.1", "::1"].includes(a.address)) {
      ports.add(a.port);
      this.once("close", () => ports.delete(a.port));
    }
  }
  return emit.call(this, event, ...args);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  let a = args[0]; if (Array.isArray(a)) a = a[0];
  if (typeof a === "string" && !/^\\d+$/.test(a)) return connect.apply(this, args);
  if (a && typeof a === "object" && a.path) return connect.apply(this, args);
  const port = Number(typeof a === "object" ? a.port : a);
  const host = typeof a === "object" ? a.host : typeof args[1] === "string" ? args[1] : "localhost";
  if (!ports.has(port) || !["localhost", "127.0.0.1", "::1", undefined].includes(host))
    throw new Error("ISOLATED_BETA_NETWORK_DENIED");
  return connect.apply(this, args);
};
`);
const autonomousFiles = [
  "tests/unit/self-evolution-simulation.test.ts", "tests/unit/evolution-registry.test.ts",
  "tests/unit/security-containment.test.ts", "tests/unit/selfHealingSecurityEngine.test.ts",
];
const autonomousConfig = join(scratch, "autonomous.config.mjs");
writeFileSync(autonomousConfig, `export default ${JSON.stringify({
  root, test: { include: autonomousFiles, environment: "node", globals: true,
    setupFiles: [], fileParallelism: false, maxWorkers: 1, testTimeout: 15000, hookTimeout: 15000 },
  resolve: { alias: { "@shared": join(root, "shared"), "@": join(root, "client/src") } },
})};`);
const commands = [];
function add(id, domain, args, files, executable = node, extraEnv = {}) {
  commands.push({ id, domain, executable, args, files, extraEnv });
}
function nodeTests(id, domain, files, prefix = []) {
  add(id, domain, [...prefix, "--test", "--test-concurrency=1", ...files], files);
}
function vitest(id, domain, config, files) {
  add(id, domain, ["node_modules/vitest/vitest.mjs", "run", "--config", config,
    "--maxWorkers=1", "--no-file-parallelism"], ["node_modules/vitest/vitest.mjs", config, ...files]);
}
nodeTests("authority", "security", ["server/services/securityAuthority.test.ts"], ["--import", "tsx"]);
nodeTests("jwt-chain", "security", ["server/services/securityJwtChain.test.mjs"]);
add("security-consumers", "security", ["--import", "tsx", "--test", "--test-concurrency=1",
  "server/logSanitizer.test.ts", "script/security-readiness.test.mjs", "script/security-consumers.test.cjs"],
  ["server/logSanitizer.test.ts", "script/security-readiness.test.mjs", "script/security-consumers.test.cjs"],
  node, { NODE_ENV: "production" });
nodeTests("commerce", "commerce", ["server/services/commerce.isolated.test.mjs", "server/services/commerce/orchestrator.isolated.test.mjs"]);
for (const name of ["integrations-readiness", "integration-webhooks"])
  add(name, "integrations", [`tests/${name}.cjs`], [`tests/${name}.cjs`]);
vitest("growth-rights", "growth", "tests/growth-rights.vitest.config.ts", []);
nodeTests("client-contracts", "client", [
  "tests/unit/client-offline-readiness.test.mjs", "tests/unit/client-account-boundary.test.mjs",
  "tests/unit/client-sync-receipts.test.mjs", "tests/unit/client-worker-handoff.test.mjs",
]);
nodeTests("admin-governance", "admin", ["tests/admin-governance-isolated.cjs"]);
nodeTests("resumed-webhook-topology", "integrations", ["tests/resume-integration-contracts.cjs"]);
nodeTests("client-auth-contracts", "client", ["tests/unit/client-auth-beta-contracts.test.mjs"]);
add("data-runtime", "data", ["scripts/test-data-runtime.mjs"], ["scripts/test-data-runtime.mjs"]);
add("fabric-deletion", "privacy", ["scripts/test-fabric-deletion.mjs"], ["scripts/test-fabric-deletion.mjs"]);
const python = join(root, ".pythonlibs/bin/python3");
for (const name of ["test_media_delivery_contract", "test_isolated_audio"]) {
  const file = `external/maxcore/artifacts/ai-training-server/tests/${name}.py`;
  add(name, "media", ["-B", file], [file], python);
}
nodeTests("media-resources", "media", ["tests/unit/aiMediaResourceContracts.test.mjs"]);
vitest("autonomous-contracts", "autonomous", autonomousConfig, autonomousFiles);
nodeTests("deployment-contracts", "deploy", ["tests/deployment-contracts.cjs"]);
nodeTests("worker-composition", "deploy", ["tests/readiness-worker-composition.cjs"]);
vitest("exports-sync", "exports/sync", "tests/coverage-gaps.config.ts", ["tests/unit/coverage-gaps.test.ts"]);

const gaps = {
  security: "No deployed cookies/proxy, browser auth, real session SQL contention, TLS egress or credential rotation acceptance.",
  commerce: "Mocked SQL/provider contracts only; no real charge, refund, payout, settlement or cross-process durable replay.",
  integrations: "Synthetic signatures/credentials and mocked providers; no actual webhook delivery, catalog scale or provider receipt.",
  growth: "Mocked mail/database/payment boundaries; no delivered campaign, production split contention or legal acceptance.",
  client: "Node/source/browser-API fixtures only; no browser, service-worker lifecycle, device or offline end-to-end acceptance.",
  admin: "VM/mocked DB, email and Redis; no deployed admin authorization or moderation/evidence transaction acceptance.",
  data: "Mocked catalog/storage/dump/restore; no actual remote backup restore, SQL leases or crash durability acceptance. Migration harness excluded (schema worker owns it).",
  media: "Tiny test-only subprocesses, mocked rendering and resource contracts; no models, production render, quality or workload acceptance.",
  autonomous: "Mocked storage/security plus ephemeral HTTP fixture; no assembled app, restart durability, real build/autofix or operational feedback acceptance.",
  deploy: "Resource sizing/source contracts and tiny temporary capsules only; no deployment, real capsule recovery, migration or load acceptance.",
  privacy: "Mocked fabric deletion receipts only; erasure-request SQL boundary also covered by security authority suite. No complete user erasure, retention-policy/legal decision, remote deletion or cross-system verification.",
  "exports/sync": "Mocked database/PDIM and tiny local FFmpeg WAV fixture; no remote artifact delivery, full codecs, expiry, workload, browser sync or real concurrent sessions.",
};
const report = {
  startedAt: new Date().toISOString(), kind: "isolated-platform-beta-contract-cycle",
  acceptance: "BLOCKED: passing isolated contracts do not establish full-platform or production acceptance",
  isolation: "Sequential allowlisted commands; fresh temporary HOME; cleared environment; no secrets/DB URLs inherited; bounded process-group timeout; Node TCP guard permits only same-process loopback fixtures. Not an OS sandbox.",
  excluded: ["app startup", "shared/live databases", "providers", "payments", "messages", "models", "generic test:all", "fabricated-success lifecycle simulations", "migration rehearsal (owned by schema worker)", "full TypeScript/browser/install"],
  results: [], domains: [],
};
function save() {
  report.domains = Object.entries(gaps).map(([domain, limitations]) => {
    const results = report.results.filter(r => r.domain === domain);
    const planned = commands.filter(c => c.domain === domain).length;
    const status = results.some(r => r.status === "FAIL") ? "FAIL"
      : results.length !== planned || results.some(r => r.status === "BLOCKED") ? "BLOCKED" : "PASS";
    return { domain, status, commands: results.length, planned, acceptance: "BLOCKED", limitations };
  });
  mkdirSync(dirname(reportBase), { recursive: true });
  writeFileSync(`${reportBase}.json`, JSON.stringify(report, null, 2) + "\n");
  const lines = ["# Isolated platform beta simulation", "", `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt ?? "in progress"}`, "", `**${report.acceptance}**`, "", report.isolation, "",
    "PASS means the selected contract commands exited zero, not domain acceptance. Fixtures are test-only assertions against production logic, not simulated production success.",
    "", "| Domain | Contract cycle | Commands | Acceptance |", "|---|---|---:|---|",
    ...report.domains.map(d => `| ${d.domain} | ${d.status} | ${d.commands}/${d.planned} | BLOCKED |`),
    "", "## Per-domain coverage limits", ...report.domains.map(d => `- **${d.domain}:** ${d.limitations}`),
    "", "## Excluded operations", report.excluded.join("; ") + ".", "",
    "## Command evidence", "Captured stdout/stderr and input-file SHA-256 snapshots are in beta-simulation.json. Output is bounded at 512 KiB per stream; truncation is explicit.",
    ...report.results.flatMap(r => ["", `### ${r.id}: ${r.status}`, `Command: \`${r.command}\``,
      `Exit: ${r.exitCode ?? "none"}; signal: ${r.signal ?? "none"}; timeout: ${r.timedOut}; duration: ${r.durationMs} ms.`,
      ...(r.reason ? [`Reason: ${r.reason}`] : []),
      ...(r.status !== "PASS" ? ["```text", (r.stderr || r.stdout || "").slice(-6000).replaceAll("```", "'''"), "```"] : [])]),
    "", "Rerun after each major change: `node scripts/readiness-beta-simulation.mjs`. Only the latest cycle is retained. No full-platform acceptance claim is made.",
  ];
  writeFileSync(`${reportBase}.md`, lines.join("\n") + "\n");
}
async function run(c) {
  const started = Date.now();
  const hashes = Object.fromEntries(c.files.filter(existsSync).map(f => [
    f.startsWith(scratch) ? "<temporary-autonomous-config>" : f,
    createHash("sha256").update(readFileSync(f)).digest("hex"),
  ]));
  const result = { id: c.id, domain: c.domain, command: [c.executable, ...c.args].join(" ").replaceAll(scratch, "<temporary>"),
    status: "BLOCKED", exitCode: null, signal: null, timedOut: false, durationMs: 0, stdout: "", stderr: "", hashes,
    stdoutTruncated: false, stderrTruncated: false };
  const missing = [c.executable, ...c.files].filter(f => !existsSync(f));
  if (missing.length) { result.reason = `Required files unavailable: ${missing.join(", ")}`; return result; }
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch,
    NODE_ENV: "test", CI: "1", NO_COLOR: "1", TZ: "UTC", LANG: "C.UTF-8",
    NODE_OPTIONS: `--require=${guard}`, PYTHONDONTWRITEBYTECODE: "1",
    OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", ...c.extraEnv };
  await new Promise(resolveRun => {
    const child = spawn(c.executable, c.args, { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const kill = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ } };
    const timer = setTimeout(() => { result.timedOut = true; kill(); }, timeoutMs);
    for (const stream of ["stdout", "stderr"]) {
      child[stream].on("data", chunk => {
        const text = chunk.toString();
        const remaining = outputLimit - result[stream].length;
        result[stream] += text.slice(0, Math.max(0, remaining));
        if (text.length > remaining) result[`${stream}Truncated`] = true;
      });
    }
    child.on("error", error => { result.reason = error.message; });
    child.on("close", (code, signal) => {
      clearTimeout(timer); kill();
      result.exitCode = code; result.signal = signal;
      result.status = result.reason ? "BLOCKED" : code === 0 && !result.timedOut ? "PASS" : "FAIL";
      if (result.timedOut) result.reason = `Exceeded ${timeoutMs}ms deadline; process group killed`;
      resolveRun();
    });
  });
  result.durationMs = Date.now() - started;
  return result;
}
try {
  save();
  for (const command of commands) {
    console.log(`RUN ${command.id}`);
    const result = await run(command);
    report.results.push(result);
    console.log(`${result.status} ${result.id} (${result.durationMs}ms)`);
    save();
  }
  report.finishedAt = new Date().toISOString();
  save();
  process.exitCode = report.domains.every(d => d.status === "PASS") ? 0 : 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
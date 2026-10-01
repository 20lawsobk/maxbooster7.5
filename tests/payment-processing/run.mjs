/**
 * Payment verification runner. Ordinary contract tests receive NO credentials
 * or database environment. Remote tests are explicit and test-key-only.
 */
import { spawn } from "node:child_process";
import { readdir, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log("node tests/payment-processing/run.mjs [--stripe]");
  console.log("Default: isolated contracts and disposable local PostgreSQL.");
  console.log("--stripe: additionally creates, charges, refunds and cleans up Stripe TEST objects.");
  process.exit(0);
}
if ([...args].some((arg) => arg !== "--stripe")) {
  console.error("Unknown argument; use --help.");
  process.exit(2);
}
const remote = args.has("--stripe");
if (
  remote &&
  (!process.env.STRIPE_TEST_SECRET?.startsWith("sk_test_") ||
    !process.env.STRIPE_TEST_CLIENT?.startsWith("pk_test_"))
) {
  console.error("BLOCKED: both dedicated Stripe test credentials are required; no fallback is allowed.");
  process.exit(2);
}
const root = process.cwd();
const testDir = path.join(root, "tests/payment-processing");
const entries = await readdir(testDir);
const contracts = entries
  .filter((name) =>
    /^inbound-.*\.test\.mjs$/.test(name) ||
    /^outbound-.*\.mjs$/.test(name) ||
    name === "inbound-known-failures.mjs"
  )
  .sort()
  .map((name) => `tests/payment-processing/${name}`);
const env = Object.fromEntries(
  ["PATH", "HOME", "LANG", "TMPDIR"].filter((name) => process.env[name]).map((name) => [name, process.env[name]]),
);
const remoteEnv = remote
  ? { ...env, STRIPE_TEST_SECRET: process.env.STRIPE_TEST_SECRET, STRIPE_TEST_CLIENT: process.env.STRIPE_TEST_CLIENT }
  : env;
const groups = [
  {
    name: "production-contracts",
    args: [
      "--test",
      "tests/subscription-checkout-isolated.test.mjs",
      "server/services/commerce.isolated.test.mjs",
      "server/services/commerce/orchestrator.isolated.test.mjs",
      ...contracts,
    ],
    env,
  },
  { name: "disposable-postgresql", args: ["--test", "tests/payment-processing/database-commerce.test.mjs"], env: remoteEnv },
];
if (remote) {
  groups.push({
    name: "real-stripe-api",
    args: ["tests/payment-processing/real-stripe-api.mjs"],
    env: remoteEnv,
    evidencePath: ".local/payment-processing/real-stripe-report.json",
  });
  if (entries.includes("inbound-real-stripe.mjs")) {
    groups.push({ name: "real-production-checkout-handlers", args: ["tests/payment-processing/inbound-real-stripe.mjs"], env: remoteEnv });
  } else {
    console.error("BLOCKED: real production-handler suite is missing.");
    process.exit(2);
  }
  groups.push({
    name: "real-stripe-topup",
    args: ["tests/payment-processing/real-stripe-topup.mjs"],
    env: remoteEnv,
  });
}
function redact(text) {
  for (const key of ["STRIPE_TEST_SECRET", "STRIPE_TEST_CLIENT"]) {
    if (process.env[key]) text = text.replaceAll(process.env[key], "[REDACTED]");
  }
  return text.replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9]+/g, "[REDACTED_KEY]")
    .replace(/\bpi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, "[REDACTED_CLIENT_SECRET]");
}
const results = [];
for (const group of groups) {
  console.log(`\n=== ${group.name} ===`);
  const started = Date.now();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, group.args, { cwd: root, env: group.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => resolve({ exitCode: 1, output: redact(error.message) }));
    child.on("close", (exitCode, signal) => resolve({ exitCode: exitCode ?? 1, signal, output: redact(output) }));
  });
  if (group.evidencePath) {
    try {
      const evidenceStat = await stat(group.evidencePath);
      if (evidenceStat.mtimeMs < started) throw new Error("No fresh report was produced.");
      const evidence = JSON.parse(await readFile(group.evidencePath, "utf8"));
      const counts = evidence.summary?.counts;
      if (!counts || !Array.isArray(evidence.cleanup)) throw new Error("Verification report is incomplete.");
      const cleanupUnresolved = evidence.cleanup.some((row) => row.status !== "PASS" && row.status !== "SKIP");
      if (counts.FAIL > 0 || cleanupUnresolved) result.exitCode = 1;
      else if (counts.BLOCKED > 0 && result.exitCode === 0) result.exitCode = 2;
      result.scenarioCounts = counts;
      result.cleanupUnresolved = cleanupUnresolved;
    } catch (error) {
      result.exitCode = 1;
      result.output += `\nEvidence validation failed: ${redact(error.message)}\n`;
    }
  }
  process.stdout.write(result.output);
  results.push({ name: group.name, ...result, durationMs: Date.now() - started });
}
await mkdir(".local/payment-processing", { recursive: true });
await writeFile(".local/payment-processing/runner-report.json", JSON.stringify({
  testedAt: new Date().toISOString(),
  testModeRequested: remote,
  boundary: "No application database environment or production Stripe key is passed to children.",
  groups: results,
}, null, 2) + "\n");
process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
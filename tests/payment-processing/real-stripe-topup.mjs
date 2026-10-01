import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { topupExitCode } from "./helpers-topup-cleanup.mjs";

const secret = process.env.STRIPE_TEST_SECRET;
const publishable = process.env.STRIPE_TEST_CLIENT;
const run = randomUUID();
const report = {
  testedAt: new Date().toISOString(), runTag: run,
  status: "BLOCKED", phase: "credential_guard", resourceId: null, cleanup: "NOT_NEEDED",
};
try {
  const previous = JSON.parse(await readFile(".local/payment-processing/topup-report.json", "utf8"));
  const { previousRuns = [], ...snapshot } = previous;
  report.previousRuns = [...previousRuns, snapshot];
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let stripe;
let topup;
function diagnostic(error) {
  let message = String(error?.message ?? "Unknown provider failure");
  for (const key of [secret, publishable]) if (key) message = message.replaceAll(key, "[REDACTED]");
  message = message.replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9]+/g, "[REDACTED_KEY]")
    .replace(/\bpi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, "[REDACTED_CLIENT_SECRET]")
    .replace(/https?:\/\/\S+/g, "[REDACTED_URL]");
  return { type: error?.type ?? error?.name, code: error?.code ?? null, param: error?.param ?? null, message };
}
async function save() {
  await mkdir(".local/payment-processing", { recursive: true });
  await writeFile(".local/payment-processing/topup-report.json", JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
}
try {
  if (!secret?.startsWith("sk_test_") || !publishable?.startsWith("pk_test_")) throw new Error("Dedicated test credentials required; no fallback.");
  await save();
  stripe = new Stripe(secret, { timeout: 15000, maxNetworkRetries: 0 });
  report.phase = "mode_and_webhook_preflight";
  await save();
  if ((await stripe.balance.retrieve()).livemode !== false) throw new Error("Stripe test-mode guard failed.");
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.status === "enabled") throw new Error("Enabled webhook endpoint prevents isolated writes.");
  }
  report.phase = "test_topup_creation";
  report.cleanup = "UNRESOLVED";
  await save(); // Persist the exact ownership/idempotency tag before the write.
  topup = await stripe.topups.create({
    amount: 2000,
    currency: "usd",
    description: "Isolated platform payment verification TEST ONLY",
    statement_descriptor: "TEST VERIFY",
    metadata: { isolatedPaymentVerification: run },
  }, { idempotencyKey: `payment-verification:${run}:topup` });
  report.resourceId = topup.id;
  report.phase = "owned_topup_retrieval";
  report.cleanup = "PENDING";
  await save(); // Register immediately, before any subsequent fallible call.
  const observed = await stripe.topups.retrieve(topup.id);
  if (observed.livemode !== false || observed.amount !== 2000 || observed.currency !== "usd" ||
      observed.metadata.isolatedPaymentVerification !== run) {
    report.status = "FAIL";
    throw new Error("Owned test top-up identity/amount mismatch.");
  }
  report.status = "PASS";
  report.observedStatus = observed.status;
  report.boundary = "Actual topups.retrieve verified; settled royalty funding is not asserted unless provider status/accounting are final.";
} catch (error) {
  report.diagnostic = diagnostic(error);
  // A missing funding source/account capability is blocked coverage, not PASS.
  if (report.status !== "FAIL") report.status = topup ? "FAIL" : "BLOCKED";
} finally {
  if (topup && stripe) {
    try {
      const current = await stripe.topups.retrieve(topup.id);
      if (current.status === "pending") {
        const canceled = await stripe.topups.cancel(topup.id);
        report.cleanup = canceled.status === "canceled" ? "PASS" : "UNRESOLVED";
      } else if (["canceled", "failed", "reversed"].includes(current.status)) {
        report.cleanup = "PASS";
      } else {
        report.cleanup = "UNRESOLVED";
        report.cleanupReason = "Completed test funding is retained; no unsupported reversal is fabricated.";
      }
    } catch (error) {
      report.cleanup = "UNRESOLVED";
      report.cleanupDiagnostic = diagnostic(error);
    }
  }
  await save();
}
console.log(`${report.status}: topups.create/retrieve; cleanup ${report.cleanup}`);
if (report.diagnostic) console.log(JSON.stringify(report.diagnostic));
process.exitCode = topupExitCode(report);
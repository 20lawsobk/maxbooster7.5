/**
 * Explicit, destructive-only-within-Stripe-test-mode integration verification.
 *
 * This file intentionally reads exactly STRIPE_TEST_SECRET and STRIPE_TEST_CLIENT
 * from process.env. It does not load dotenv, application runtime/configuration,
 * database code, webhooks, or connector credentials.
 */
import Stripe from "stripe";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPORT_PATH = path.resolve(".local/payment-processing/real-stripe-report.json");
const RUN_ID = randomUUID();
const RUN_TAG = RUN_ID.replaceAll("-", "").slice(0, 20);
const WEBHOOK_PREFLIGHT_ONLY = process.argv.includes("--webhook-preflight-only");
const SUMMARY_SELF_TEST_ONLY = process.argv.includes("--self-test-summary");
const BALANCE_AUDIT_ONLY = process.argv.includes("--rerun-balance-verifier-only");
const BLOCKED_DIAGNOSTICS_ONLY = process.argv.includes("--rerun-blocked-diagnostics-only");
const RECORDED_CLEANUP_ONLY = process.argv.includes("--cleanup-recorded-invoices-only");
const IDEMPOTENCY_PREFIX = `real-stripe-test:${RUN_TAG}`;
const SCENARIOS = [
  "preflight test-key prefixes and test-mode balance",
  "webhook endpoint isolation before writes",
  "publishable/secret-key pairing via new PaymentIntent client_secret",
  "customer, PaymentMethods, and SetupIntent",
  "Checkout Session: payment",
  "Checkout Session: subscription",
  "Checkout Session: setup",
  "PaymentIntent: successful test-card payment",
  "paymentIntents.confirm: explicit confirmation endpoint",
  "PaymentIntent: documented decline test fixture",
  "PaymentIntent: requires_action test fixture",
  "PaymentIntent: cancellation",
  "PaymentIntent: idempotent create",
  "charges.list/retrieve for own test payment",
  "invoices: create, finalize, retrieve, and void",
  "invoices.list/retrieve/pay with an owned test invoice",
  "subscriptions: create, update, and cancel",
  "refunds: partial, full, and idempotency",
  "balance transaction and production verifiedPayment",
  "verifiedPayment transient missing-balance-transaction rejection",
  "StripeCommerceProvider: refund using real Stripe SDK",
  "paymentMethods.list/detach for owned test method",
  "checkout.sessions.list/retrieve for owned test sessions",
  "prices.list/retrieve and products.list/retrieve for owned fixtures",
  "billing portal session",
  "shipping rate and Checkout shipping payload",
  "Checkout automatic-tax payload",
  "Connect Express account, onboarding link, and availability",
  "accounts.createLoginLink for the owned Connect account",
  "disputes.retrieve/update for own pm_card_createDispute charge",
  "StripeCommerceProvider: transfer and reversal where enabled",
  "StripeCommerceProvider: payout where enabled",
  "topups.retrieve without creating or touching unrelated top-ups",
];

const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  runTag: RUN_TAG,
  mode: "Stripe test mode only",
  credentialSource: "process.env.STRIPE_TEST_SECRET and process.env.STRIPE_TEST_CLIENT only",
  testAccountLivemode: null,
  testAccountId: null,
  tests: [],
  resources: [],
  cleanup: [],
  summary: null,
};
const cleanups = [];
const createdPaymentIntents = new Set();
const createdPaymentMethods = new Set();
const createdCustomers = new Set();
const createdCheckoutSessions = new Set();
const createdInvoices = new Set();
const createdSubscriptions = new Set();
const createdProducts = new Set();
const createdPrices = new Set();
const createdShippingRates = new Set();
const createdAccounts = new Set();
const disputesWithoutRefund = new Set();
let stripe;
let realStripeClient;
let primarySuccessfulIntent;
let primaryPaymentMethodId;
let apiEnabled = false;
let safeExitCode = 0;

class ExpectedBlock extends Error {}
class SkipScenario extends Error {}

function redactDiagnostic(input) {
  let text = String(input ?? "");
  for (const credential of [process.env.STRIPE_TEST_SECRET, process.env.STRIPE_TEST_CLIENT]) {
    if (credential) text = text.replaceAll(credential, "[REDACTED_STRIPE_KEY]");
  }
  return text
    .replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "[REDACTED_STRIPE_KEY]")
    .replace(/\b(?:pi|seti|cs)_[A-Za-z0-9_-]+_secret_[A-Za-z0-9_-]+/g, "[REDACTED_CLIENT_SECRET]")
    .replace(/(?:client_secret|authorization)\s*[:=]\s*(?:bearer\s+)?[^\s&,;]+/gi, "[REDACTED_SENSITIVE_FIELD]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 320);
}

function safeProviderDiagnostic(error) {
  const providerError = error instanceof ExpectedBlock && error.cause ? error.cause : error;
  const raw = providerError?.raw && typeof providerError.raw === "object" ? providerError.raw : {};
  const code = String(providerError?.code ?? raw.code ?? "");
  const param = String(providerError?.param ?? raw.param ?? "");
  const message = error instanceof ExpectedBlock || error instanceof SkipScenario
    ? error.message
    : String(raw.message ?? providerError?.message ?? "");
  const providerMessage = error instanceof ExpectedBlock && providerError !== error
    ? String(raw.message ?? providerError?.message ?? "")
    : "";
  return {
    ...(code && /^[a-z][a-z0-9_]{0,60}$/i.test(code) && !/(api_key|auth|credential|bearer|secret)/i.test(code)
      ? { code: redactDiagnostic(code) }
      : {}),
    ...(param ? { param: redactDiagnostic(param) } : {}),
    ...(message ? { message: redactDiagnostic(message) } : {}),
    ...(providerMessage ? { providerMessage: redactDiagnostic(providerMessage) } : {}),
  };
}

function aggregateResults(tests, cleanup) {
  const failures = tests.filter((row) => row.status === "FAIL");
  const blocked = tests.filter((row) => row.status === "BLOCKED");
  const unresolvedCleanup = cleanup.filter((row) => row.status !== "PASS");
  const diagnosticText = (row) => {
    const diagnostic = row.providerDiagnostic || {};
    return [
      diagnostic.code ? `code=${diagnostic.code}` : "",
      diagnostic.param ? `param=${diagnostic.param}` : "",
      diagnostic.message ? `message=${diagnostic.message}` : "",
      diagnostic.providerMessage ? `providerMessage=${diagnostic.providerMessage}` : "",
    ].filter(Boolean).join("; ");
  };
  const rootFailureReasons = [
    ...failures.map((row) => {
      const cause = diagnosticText(row) || row.assertionName || row.failureKind || "unspecified";
      return `FAIL: ${row.scenario} (${cause})`;
    }),
    ...blocked.map((row) => {
      const diagnostic = diagnosticText(row);
      return `BLOCKED: ${row.scenario}${diagnostic ? ` (${diagnostic})` : ""}`;
    }),
    ...unresolvedCleanup.map((row) => {
      const diagnostic = diagnosticText(row);
      return `CLEANUP_UNRESOLVED: ${row.resource} (${row.status})${diagnostic ? ` (${diagnostic})` : ""}`;
    }),
  ];
  const status = failures.length || unresolvedCleanup.length
    ? "FAIL"
    : blocked.length
      ? "BLOCKED"
      : "PASS";
  return {
    status,
    exitCode: status === "FAIL" ? 1 : status === "BLOCKED" ? 2 : 0,
    rootFailureReasons,
  };
}

function runSummarySelfTests() {
  const cases = [
    { tests: [{ scenario: "required", status: "BLOCKED" }], cleanup: [], status: "BLOCKED", exitCode: 2 },
    { tests: [{ scenario: "required", status: "FAIL" }], cleanup: [], status: "FAIL", exitCode: 1 },
    { tests: [], cleanup: [{ resource: "resource", status: "SKIP" }], status: "FAIL", exitCode: 1 },
    { tests: [], cleanup: [{ resource: "permission-limited", status: "BLOCKED" }], status: "FAIL", exitCode: 1 },
    { tests: [{ scenario: "required", status: "BLOCKED" }], cleanup: [{ resource: "resource", status: "BLOCKED" }], status: "FAIL", exitCode: 1 },
    { tests: [{ scenario: "required", status: "FAIL" }, { scenario: "blocked", status: "BLOCKED" }], cleanup: [], status: "FAIL", exitCode: 1 },
    { tests: [{ scenario: "dependency absent", status: "SKIP" }], cleanup: [], status: "PASS", exitCode: 0 },
    { tests: [{ scenario: "all clear", status: "PASS" }], cleanup: [{ resource: "resource", status: "PASS" }], status: "PASS", exitCode: 0 },
  ];
  for (const test of cases) {
    const result = aggregateResults(test.tests, test.cleanup);
    if (result.status !== test.status || result.exitCode !== test.exitCode) {
      throw new Error("summary guard self-test failed");
    }
  }
  const root = aggregateResults(
    [{ scenario: "tax", status: "BLOCKED", providerDiagnostic: { message: "account setup unavailable" } }],
    [{ resource: "invoice", status: "SKIP" }],
  );
  if (
    !root.rootFailureReasons.some((reason) => reason.includes("BLOCKED: tax")) ||
    !root.rootFailureReasons.some((reason) => reason.includes("CLEANUP_UNRESOLVED: invoice"))
  ) {
    throw new Error("summary root-reason self-test failed");
  }
  const sensitiveSecret = process.env.STRIPE_TEST_SECRET || "sk_test_example";
  const sensitiveClient = process.env.STRIPE_TEST_CLIENT || "pk_test_example";
  const redacted = redactDiagnostic(
    `Invalid API Key ${sensitiveSecret} ${sensitiveClient} ` +
    `client_secret=pi_example_secret_token https://example.invalid/path`,
  );
  if (
    redacted.includes(sensitiveSecret) ||
    redacted.includes(sensitiveClient) ||
    redacted.includes("pi_example_secret_token") ||
    redacted.includes("https://example.invalid/path") ||
    redacted.includes("sk_test_")
  ) {
    throw new Error("diagnostic redaction self-test failed");
  }
}

function addRow(name, status, summary, details = {}) {
  report.tests.push({ scenario: name, status, summary, ...details });
}

function skip(name, summary) {
  if (!report.tests.some((row) => row.scenario === name)) {
    const reason = redactDiagnostic(summary);
    addRow(name, "SKIP", reason, { skipReason: reason });
  }
}

function remember(resourceType, id) {
  if (!id) return;
  report.resources.push({ type: resourceType, id });
}

function addCleanup(name, fn) {
  cleanups.push({ name, fn });
}

function errorStatus(error) {
  if (error instanceof ExpectedBlock) return "BLOCKED";
  const type = String(error?.type ?? "");
  const code = String(error?.code ?? error?.raw?.code ?? "");
  const message = String(error?.raw?.message ?? error?.message ?? "");
  // Classification is internal; persisted diagnostic strings are separately redacted.
  if (
    /Permission|Permission|RateLimit/.test(type) ||
    /account_invalid|account_country_invalid|capability_not_requested|insufficient_funds|taxes_calculation_failed/.test(code) ||
    /not enabled|no default configuration|configuration.{0,30}(missing|not found|does not exist)|restricted account|capability.{0,30}(inactive|disabled)|insufficient funds|not available in this account|onboarding.{0,30}(required|complete)|(automatic tax|stripe tax|tax calculation).{0,50}(not enabled|not available|enable|setup|settings)/i.test(message)
  ) {
    return "BLOCKED";
  }
  return "FAIL";
}

function safeSummary(status) {
  return status === "BLOCKED"
    ? "Stripe test-mode feature or account setup is unavailable; sanitized reason is included."
    : "Stripe test-mode request or assertion failed; sanitized provider details are included when available.";
}

async function run(name, fn) {
  if (report.tests.some((row) => row.scenario === name)) return;
  try {
    const details = (await fn()) ?? {};
    const { status: resourceStatus, ...safeDetails } = details;
    addRow(name, "PASS", "Assertions passed against Stripe test mode.", {
      ...safeDetails,
      ...(resourceStatus ? { resourceStatus } : {}),
    });
  } catch (error) {
    if (error instanceof SkipScenario) {
      addRow(name, "SKIP", redactDiagnostic(error.message), { skipReason: redactDiagnostic(error.message) });
      return;
    }
    const status = errorStatus(error);
    const type = String(error?.type ?? "");
    const failureKind = error instanceof ExpectedBlock
      ? "account_or_feature_setup_unavailable"
      : type === "StripeInvalidRequestError"
        ? "stripe_invalid_request"
        : type === "StripeCardError"
          ? "stripe_card_error"
          : type === "StripePermissionError"
            ? "provider_error_details_withheld"
            : type === "StripeRateLimitError"
              ? "stripe_rate_limit"
              : type === "StripeAPIError"
                ? "stripe_api_failure"
                : type === "StripeConnectionError"
                  ? "stripe_connection_failure"
                  : type === "StripeAuthenticationError"
                    ? "provider_error_details_withheld"
                    : "assertion_or_unclassified_failure";
    const failureDetails = { failureKind };
    const diagnostic = safeProviderDiagnostic(error);
    if (Object.keys(diagnostic).length) failureDetails.providerDiagnostic = diagnostic;
    const localAssertion = String(error?.message ?? "").match(/^([a-z][a-z0-9 _-]{0,50}) assertion$/i);
    if (localAssertion) failureDetails.assertionName = localAssertion[1].trim().replaceAll(" ", "_").toLowerCase();
    addRow(name, status, safeSummary(status), failureDetails);
  }
}

function idempotencyKey(name) {
  return `${IDEMPOTENCY_PREFIX}:${name}`;
}

function apiOptions(name) {
  return { idempotencyKey: idempotencyKey(name) };
}

function markCreatedPaymentIntent(pi) {
  if (!pi?.id || createdPaymentIntents.has(pi.id)) return;
  createdPaymentIntents.add(pi.id);
  remember("payment_intent", pi.id);
  addCleanup(`PaymentIntent ${pi.id}`, async () => {
    const current = await stripe.paymentIntents.retrieve(pi.id);
    if (current.status === "succeeded") {
      if (disputesWithoutRefund.has(pi.id)) {
        return {
          status: "SKIP",
          note: "The owned dispute-fixture charge is intentionally not refunded while its dispute remains open.",
        };
      }
      const refunds = await stripe.refunds.list({ payment_intent: pi.id, limit: 100 });
      const refunded = refunds.data
        .filter((item) => item.status === "succeeded")
        .reduce((sum, item) => sum + item.amount, 0);
      const remaining = (current.amount_received || current.amount) - refunded;
      if (remaining > 0) {
        await stripe.refunds.create(
          { payment_intent: pi.id, amount: remaining },
          apiOptions(`cleanup-refund-${pi.id}`),
        );
      }
    } else if (!["canceled"].includes(current.status)) {
      await stripe.paymentIntents.cancel(pi.id);
    }
  });
}

async function createPaymentIntent(name, params, confirm = true) {
  const {
    payment_method: requestedPaymentMethod,
    ...createParams
  } = params;
  let created;
  try {
    created = await stripe.paymentIntents.create(
      {
        amount: 1200,
        currency: "usd",
        payment_method_types: ["card"],
        ...createParams,
        metadata: { ...(params.metadata || {}), realStripeTestRun: RUN_TAG },
      },
      apiOptions(name),
    );
  } catch (error) {
    if (error?.payment_intent?.id) markCreatedPaymentIntent(error.payment_intent);
    throw error;
  }
  markCreatedPaymentIntent(created);
  if (!confirm) return created;
  try {
    const confirmed = await stripe.paymentIntents.confirm(
      created.id,
      { payment_method: requestedPaymentMethod || "pm_card_visa" },
      apiOptions(`${name}-confirm`),
    );
    markCreatedPaymentIntent(confirmed);
    return confirmed;
  } catch (error) {
    if (error?.payment_intent?.id) markCreatedPaymentIntent(error.payment_intent);
    throw error;
  }
}

async function loadIsolatedProductionModule(entryPoint, runtimeClient = false) {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "real-stripe-test-"));
  const outfile = path.join(tempDirectory, "subject.mjs");
  try {
    const plugins = runtimeClient
      ? [{
          name: "inject-real-stripe-client-without-app-runtime",
          setup(buildContext) {
            buildContext.onResolve({ filter: /^\.\/runtime$/ }, () => ({
              path: "isolated-commerce-runtime",
              namespace: "isolated-commerce-runtime",
            }));
            buildContext.onLoad(
              { filter: /.*/, namespace: "isolated-commerce-runtime" },
              () => ({
                contents: "export const commerceStripe = () => globalThis.__realStripeVerificationClient;",
                loader: "js",
              }),
            );
          },
        }]
      : [];
    await build({
      entryPoints: [path.resolve(entryPoint)],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      packages: "bundle",
      plugins,
      logLevel: "silent",
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function cancelSession(sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
}

async function cleanupInvoice(invoiceId) {
  const current = await stripe.invoices.retrieve(invoiceId, {
    expand: ["payment_intent", "payments.data.payment.payment_intent"],
  });
  if (current.status === "open") {
    await stripe.invoices.voidInvoice(invoiceId);
    return;
  }
  if (current.status === "draft") {
    await stripe.invoices.del(invoiceId);
    return;
  }
  if (current.status === "paid") {
    const paymentIntentId = extractInvoicePaymentIntentId(current);
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status === "succeeded") {
        const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
        const refunded = refunds.data
          .filter((item) => item.status === "succeeded")
          .reduce((sum, item) => sum + item.amount, 0);
        const remaining = (pi.amount_received || pi.amount) - refunded;
        if (remaining > 0) {
          await stripe.refunds.create(
            { payment_intent: paymentIntentId, amount: remaining },
            apiOptions(`cleanup-paid-invoice-${invoiceId}`),
          );
        }
      }
    }
    return {
      status: "SKIP",
      note: paymentIntentId
        ? "Stripe paid invoices cannot be deleted; the associated PaymentIntent was checked and any remaining test charge was refunded."
        : "Stripe paid invoices cannot be deleted; Stripe returned no associated PaymentIntent for refund verification.",
    };
  }
  if (current.status === "uncollectible") {
    return {
      status: "SKIP",
      note: "Stripe uncollectible invoices cannot be deleted; no unrelated or existing dispute was modified.",
    };
  }
  if (current.status === "void") return;
  throw new Error("invoice cleanup state assertion");
}

function extractInvoicePaymentIntentId(invoice) {
  const legacy = typeof invoice?.payment_intent === "string"
    ? invoice.payment_intent
    : invoice?.payment_intent?.id;
  if (legacy) return legacy;
  const invoicePayment = invoice?.payments?.data?.find((entry) =>
    entry.payment?.type === "payment_intent",
  );
  const paymentIntent = invoicePayment?.payment?.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
}

async function cleanupAll() {
  for (const item of cleanups.reverse()) {
    try {
      const outcome = await item.fn();
      report.cleanup.push({ resource: item.name, status: outcome?.status || "PASS", ...(outcome?.note ? { note: outcome.note } : {}) });
    } catch (error) {
      const status = errorStatus(error);
      const providerDiagnostic = safeProviderDiagnostic(error);
      report.cleanup.push({
        resource: item.name,
        status,
        ...(Object.keys(providerDiagnostic).length ? { providerDiagnostic } : {}),
      });
    }
  }
}

async function establishPreflight() {
  const secret = process.env.STRIPE_TEST_SECRET;
  const publishable = process.env.STRIPE_TEST_CLIENT;
  if (!secret || !publishable) {
    addRow("preflight test-key prefixes and test-mode balance", "BLOCKED",
      "Both dedicated Stripe test credentials must be supplied in process.env.");
    return false;
  }
  if (!secret.startsWith("sk_test_") || !publishable.startsWith("pk_test_")) {
    addRow("preflight test-key prefixes and test-mode balance", "FAIL",
      "Strict sk_test_ and pk_test_ prefixes are required; no Stripe writes were made.");
    safeExitCode = 1;
    return false;
  }

  stripe = new Stripe(secret, { maxNetworkRetries: 1, timeout: 15_000 });
  realStripeClient = stripe;
  try {
    const balance = await stripe.balance.retrieve();
    report.testAccountLivemode = balance.livemode;
    report.testAccountId = balance.account ?? null;
    if (balance.livemode !== false) {
      addRow("preflight test-key prefixes and test-mode balance", "FAIL",
        "Stripe balance livemode was not exactly false; no Stripe writes were made.");
      safeExitCode = 1;
      return false;
    }
    apiEnabled = true;
    addRow("preflight test-key prefixes and test-mode balance", "PASS",
      "Strict test-key prefixes accepted and Stripe balance livemode was false.");
    return true;
  } catch (error) {
    addRow("preflight test-key prefixes and test-mode balance", "FAIL",
      "Stripe test-mode preflight failed; no Stripe writes were made.", {
        providerDiagnostic: safeProviderDiagnostic(error),
      });
    safeExitCode = 1;
    return false;
  }
}

async function verifyWebhookIsolation() {
  try {
    const endpoints = [];
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      endpoints.push({
        status: endpoint.status || "unknown",
        events: Array.isArray(endpoint.enabled_events) ? endpoint.enabled_events : [],
      });
    }
    const enabled = endpoints.filter((endpoint) => endpoint.status === "enabled");
    report.webhookIsolation = {
      totalCount: endpoints.length,
      enabledCount: enabled.length,
      disabledCount: endpoints.length - enabled.length,
      endpoints,
      policy: "Any enabled endpoint is treated as potentially targeting the shared app; no destinations or secrets are persisted.",
    };
    if (enabled.length > 0) {
      addRow(
        "webhook endpoint isolation before writes",
        "BLOCKED",
        "Enabled test webhook endpoints exist; fixture mutations are stopped until destinations are proven isolated.",
      );
      return false;
    }
    addRow(
      "webhook endpoint isolation before writes",
      "PASS",
      "No enabled test webhook endpoints can receive fixture events.",
    );
    return true;
  } catch (error) {
    report.webhookIsolation = {
      totalCount: null,
      enabledCount: null,
      disabledCount: null,
      endpoints: [],
      policy: "Inspection failed; fixture mutations are stopped because isolation is unknown.",
    };
    addRow(
      "webhook endpoint isolation before writes",
      "BLOCKED",
      "Webhook isolation could not be established; no fixture mutations were attempted.",
      { providerDiagnostic: safeProviderDiagnostic(error) },
    );
    return false;
  }
}

async function verifyPublishablePairing() {
  let pi;
  try {
    pi = await stripe.paymentIntents.create(
      { amount: 50, currency: "usd", payment_method_types: ["card"], metadata: { realStripeTestRun: RUN_TAG } },
      apiOptions("publishable-pairing"),
    );
    markCreatedPaymentIntent(pi);
    if (!pi.client_secret) throw new Error("pairing");
    const endpoint = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi.id)}?client_secret=${encodeURIComponent(pi.client_secret)}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${process.env.STRIPE_TEST_CLIENT}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("pairing");
    const fetched = await response.json();
    if (fetched?.id !== pi.id || fetched?.livemode !== false) throw new Error("pairing");
    addRow("publishable/secret-key pairing via new PaymentIntent client_secret", "PASS",
      "A newly created test PaymentIntent was fetched with the publishable test key and its client_secret.");
    return true;
  } catch {
    addRow("publishable/secret-key pairing via new PaymentIntent client_secret", "FAIL",
      "Publishable-key pairing verification failed; provider response details were withheld.");
    safeExitCode = 1;
    return false;
  } finally {
    if (pi?.id) {
      try {
        const current = await stripe.paymentIntents.retrieve(pi.id);
        if (current.status !== "canceled" && current.status !== "succeeded") {
          await stripe.paymentIntents.cancel(pi.id);
        } else if (current.status === "succeeded") {
          await stripe.refunds.create(
            { payment_intent: pi.id },
            apiOptions(`pairing-refund-${pi.id}`),
          );
        }
      } catch {
        // The registered cleanup retries safely and records only the outcome.
      }
    }
  }
}

async function runCustomerSetup(customer) {
  await run("customer, PaymentMethods, and SetupIntent", async () => {
    const setup = await stripe.setupIntents.create(
      {
        customer: customer.id,
        payment_method: "pm_card_visa",
        payment_method_types: ["card"],
        usage: "off_session",
        confirm: true,
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("setup-intent"),
    );
    remember("setup_intent", setup.id);
    report.cleanup.push({
      resource: `SetupIntent ${setup.id}`,
      status: "SKIP",
      note: "Stripe SetupIntents have no delete endpoint; any attached owned test PaymentMethod is detached during cleanup.",
    });
    const methodId = typeof setup.payment_method === "string" ? setup.payment_method : setup.payment_method?.id;
    if (methodId) {
      primaryPaymentMethodId = methodId;
      createdPaymentMethods.add(methodId);
      remember("payment_method", methodId);
      addCleanup(`PaymentMethod ${methodId}`, async () => {
        const current = await stripe.paymentMethods.retrieve(methodId);
        if (current.customer) await stripe.paymentMethods.detach(methodId);
      });
    }
    if (setup.status !== "succeeded" || !methodId) throw new Error("setup assertion");
    const methods = await stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: 10 });
    if (!methods.data.some((method) => method.id === methodId)) throw new Error("method assertion");
    const retrieved = await stripe.setupIntents.retrieve(setup.id);
    if (retrieved.customer !== customer.id || retrieved.status !== "succeeded") throw new Error("setup retrieval assertion");
    return { customerId: customer.id, setupIntentId: setup.id, paymentMethodId: methodId };
  });
}

async function createCheckout(name, customerId, params) {
  const session = await stripe.checkout.sessions.create(
    {
      customer: customerId,
      success_url: "https://example.com/stripe-test/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://example.com/stripe-test/cancel",
      ...params,
      metadata: { realStripeTestRun: RUN_TAG, ...(params.metadata || {}) },
    },
    apiOptions(name),
  );
  createdCheckoutSessions.add(session.id);
  remember("checkout_session", session.id);
  addCleanup(`Checkout Session ${session.id}`, () => cancelSession(session.id));
  return session;
}

async function runPaymentIntents() {
  await run("PaymentIntent: successful test-card payment", async () => {
    const pi = await createPaymentIntent("pi-success", {
      amount: 1800,
      description: "Synthetic Stripe test-mode payment",
    });
    primarySuccessfulIntent = pi;
    if (pi.status !== "succeeded" || pi.amount_received !== 1800 || pi.livemode !== false) {
      throw new Error("success assertion");
    }
    return { paymentIntentId: pi.id, status: pi.status };
  });

  await run("paymentIntents.confirm: explicit confirmation endpoint", async () => {
    const created = await stripe.paymentIntents.create(
      {
        amount: 1100,
        currency: "usd",
        payment_method_types: ["card"],
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("pi-explicit-confirm-create"),
    );
    markCreatedPaymentIntent(created);
    const confirmed = await stripe.paymentIntents.confirm(
      created.id,
      { payment_method: "pm_card_visa" },
      apiOptions("pi-explicit-confirm"),
    );
    if (confirmed.status !== "succeeded" || confirmed.amount_received !== 1100) {
      throw new Error("explicit confirm assertion");
    }
    return { paymentIntentId: confirmed.id, status: confirmed.status };
  });

  await run("PaymentIntent: documented decline test fixture", async () => {
    let response;
    try {
      response = await createPaymentIntent("pi-decline", {
        amount: 1700,
        payment_method: "pm_card_chargeDeclined",
      });
    } catch (error) {
      response = error?.payment_intent;
    }
    if (
      !response?.id ||
      response.status !== "requires_payment_method" ||
      !["card_declined", "generic_decline"].includes(response.last_payment_error?.code)
    ) {
      throw new Error("decline assertion");
    }
    markCreatedPaymentIntent(response);
    return { paymentIntentId: response.id, status: response.status };
  });

  await run("PaymentIntent: requires_action test fixture", async () => {
    let response;
    try {
      response = await createPaymentIntent("pi-requires-action", {
        amount: 1900,
        payment_method: "pm_card_authenticationRequired",
      });
    } catch (error) {
      response = error?.payment_intent;
    }
    if (!response?.id || response.status !== "requires_action") throw new Error("action assertion");
    markCreatedPaymentIntent(response);
    return { paymentIntentId: response.id, status: response.status };
  });

  await run("PaymentIntent: cancellation", async () => {
    const created = await createPaymentIntent("pi-cancel", { amount: 800 }, false);
    const canceled = await stripe.paymentIntents.cancel(created.id);
    if (canceled.status !== "canceled") throw new Error("cancel assertion");
    return { paymentIntentId: canceled.id, status: canceled.status };
  });

  await run("PaymentIntent: idempotent create", async () => {
    const params = {
      amount: 700,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: { realStripeTestRun: RUN_TAG, case: "idempotency" },
    };
    const options = apiOptions("pi-idempotent");
    const first = await stripe.paymentIntents.create(params, options);
    markCreatedPaymentIntent(first);
    const second = await stripe.paymentIntents.create(params, options);
    markCreatedPaymentIntent(second);
    if (first.id !== second.id) throw new Error("idempotency assertion");
    return { paymentIntentId: first.id, sameIdOnRetry: true };
  });

  if (primarySuccessfulIntent) {
    await run("charges.list/retrieve for own test payment", async () => {
      const charges = await stripe.charges.list({
        payment_intent: primarySuccessfulIntent.id,
        limit: 10,
      });
      const charge = charges.data.find((item) => item.payment_intent === primarySuccessfulIntent.id);
      if (!charge) throw new Error("charge list assertion");
      const retrieved = await stripe.charges.retrieve(charge.id);
      if (retrieved.id !== charge.id || retrieved.amount !== 1800) throw new Error("charge retrieve assertion");
      remember("charge", retrieved.id);
      return { chargeId: retrieved.id, paymentIntentId: primarySuccessfulIntent.id };
    });
  } else {
    skip("charges.list/retrieve for own test payment", "Requires a successful test PaymentIntent.");
  }
}

async function pollOwnedBalanceTransaction(paymentIntentId, timeoutMs = 20_000) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  const requestOptions = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { timeout: 1, maxNetworkRetries: 0 };
    return {
      timeout: Math.max(1, Math.min(5000, Math.floor(remaining / 3))),
      maxNetworkRetries: 0,
    };
  };
  while (Date.now() < deadline) {
    attempts += 1;
    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] },
      requestOptions(),
    );
    const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
    if (!chargeId) throw new Error("balance charge ID assertion");
    const charge = await stripe.charges.retrieve(
      chargeId,
      { expand: ["balance_transaction"] },
      requestOptions(),
    );
    const balance = typeof charge.balance_transaction === "string"
      ? await stripe.balanceTransactions.retrieve(
          charge.balance_transaction,
          {},
          requestOptions(),
        )
      : charge.balance_transaction;
    if (balance) {
      return { pi, charge, balance, attempts, elapsedMs: Date.now() - startedAt };
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remaining)));
  }
  throw new ExpectedBlock(
    "The owned test charge balance transaction did not settle within the bounded 20-second poll; this is fixture/accounting timing, not a verifiedPayment mismatch.",
  );
}

async function runBalanceVerification(paymentIntentId) {
  await run("balance transaction and production verifiedPayment", async () => {
    const { pi, charge, balance, attempts, elapsedMs } =
      await pollOwnedBalanceTransaction(paymentIntentId, 20_000);
    if (pi.status !== "succeeded" || pi.amount_received !== 4000 || pi.currency !== "usd") {
      throw new Error("balance payment assertion");
    }
    if (balance.amount !== 4000 || balance.currency !== "usd") {
      throw new Error("balance transaction assertion");
    }

    globalThis.__realStripeVerificationClient = realStripeClient;
    try {
      const { verifiedPayment } = await loadIsolatedProductionModule(
        "server/services/commerce/verification.ts",
        true,
      );
      const result = await verifiedPayment(paymentIntentId, 4000, "usd");
      if (
        result.chargeId !== charge.id ||
        result.refundedCents !== 4000 ||
        result.processingFeeCents !== balance.fee
      ) {
        throw new Error("verifiedPayment assertion");
      }
      return {
        paymentIntentId,
        chargeId: charge.id,
        balanceTransactionId: balance.id,
        processingFeeCents: balance.fee,
        refundedCents: result.refundedCents,
        balanceTransactionPollAttempts: attempts,
        balanceTransactionWaitMs: elapsedMs,
        execution: "Production verifiedPayment bundle with the real Stripe test SDK client.",
      };
    } finally {
      delete globalThis.__realStripeVerificationClient;
    }
  });
}

async function runTransientMissingBalanceTransactionCheck() {
  await run("verifiedPayment transient missing-balance-transaction rejection", async () => {
    const transientClient = {
      paymentIntents: {
        retrieve: async () => ({
          id: "pi_transient_balance_fixture",
          status: "succeeded",
          amount_received: 4000,
          currency: "usd",
          latest_charge: { id: "ch_transient_balance_fixture", balance_transaction: null },
        }),
      },
    };
    globalThis.__realStripeVerificationClient = transientClient;
    try {
      const { verifiedPayment } = await loadIsolatedProductionModule(
        "server/services/commerce/verification.ts",
        true,
      );
      try {
        await verifiedPayment("pi_transient_balance_fixture", 4000, "usd");
      } catch (error) {
        if (error?.message !== "Provider settlement accounting is not yet available") {
          throw new Error("transient rejection reason assertion");
        }
        return {
          expectedRejection: "Provider settlement accounting is not yet available",
          execution: "Production verifiedPayment bundle with a deterministic in-memory Stripe adapter; no Stripe resource was created.",
        };
      }
      throw new Error("transient rejection assertion");
    } finally {
      delete globalThis.__realStripeVerificationClient;
    }
  });
}

async function runRefundsAndBalance() {
  let successfulIntent;
  await run("refunds: partial, full, and idempotency", async () => {
    successfulIntent = await createPaymentIntent("refunds-charge", { amount: 4000 });
    if (successfulIntent.status !== "succeeded") throw new Error("refund charge assertion");
    const partialParams = { payment_intent: successfulIntent.id, amount: 1300 };
    const partialOptions = apiOptions("partial-refund");
    const partialFirst = await stripe.refunds.create(partialParams, partialOptions);
    remember("refund", partialFirst.id);
    const partialRetry = await stripe.refunds.create(partialParams, partialOptions);
    if (partialFirst.id !== partialRetry.id) throw new Error("refund idempotency assertion");
    const full = await stripe.refunds.create(
      { payment_intent: successfulIntent.id, amount: 2700 },
      apiOptions("full-refund"),
    );
    remember("refund", full.id);
    if (partialFirst.status !== "succeeded" || full.status !== "succeeded") throw new Error("refund status assertion");
    const listed = await stripe.refunds.list({ payment_intent: successfulIntent.id, limit: 100 });
    const total = listed.data.filter((item) => item.status === "succeeded")
      .reduce((sum, item) => sum + item.amount, 0);
    if (total !== 4000) throw new Error("refund total assertion");
    return {
      paymentIntentId: successfulIntent.id,
      partialRefundId: partialFirst.id,
      fullRefundId: full.id,
      refundedCents: total,
      idempotentRetryMatched: true,
    };
  });
  if (!successfulIntent) {
    skip("balance transaction and production verifiedPayment", "Requires an owned successful PaymentIntent; no successful fixture was created.");
  } else {
    await runBalanceVerification(successfulIntent.id);
  }
  await runTransientMissingBalanceTransactionCheck();
}

async function runConnectAccount() {
  await run("Connect Express account, onboarding link, and availability", async () => {
    const account = await stripe.accounts.create(
      {
        type: "express",
        country: "US",
        email: `stripe-connect-test-${RUN_TAG}@example.com`,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("connect-express-account"),
    );
    createdAccounts.add(account.id);
    remember("connect_account", account.id);
    addCleanup(`Connect account ${account.id}`, async () => {
      await stripe.accounts.del(account.id);
    });
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://example.com/stripe-test/connect-refresh",
      return_url: "https://example.com/stripe-test/connect-return",
      type: "account_onboarding",
    });
    report.cleanup.push({
      resource: "owned Express account onboarding link",
      status: "SKIP",
      expiresAt: Number(link.expires_at),
      note: "Stripe onboarding links expire automatically; Stripe exposes no revocation endpoint or link ID.",
    });
    if (!link.url || !link.expires_at) throw new Error("account link assertion");
    const current = await stripe.accounts.retrieve(account.id);
    const capabilities = current.capabilities || {};
    const availability = {
      accountId: current.id,
      chargesEnabled: current.charges_enabled === true,
      payoutsEnabled: current.payouts_enabled === true,
      transfers: capabilities.transfers || "unavailable",
      requirementsCurrentlyDueCount: current.requirements?.currently_due?.length ?? 0,
    };
    report.connectAvailability = availability;
    return {
      accountId: current.id,
      accountLinkExpiresAt: link.expires_at,
      chargesEnabled: availability.chargesEnabled,
      payoutsEnabled: availability.payoutsEnabled,
      transfersCapability: availability.transfers,
      requirementsCurrentlyDueCount: availability.requirementsCurrentlyDueCount,
    };
  });
}

async function main() {
  const ready = await establishPreflight();
  if (!ready) return;
  if (!(await verifyWebhookIsolation())) return;
  if (WEBHOOK_PREFLIGHT_ONLY) return;
  if (BALANCE_AUDIT_ONLY) {
    await runBalanceAuditOnly();
    return;
  }
  if (BLOCKED_DIAGNOSTICS_ONLY) {
    await runBlockedDiagnosticsOnly();
    return;
  }
  if (RECORDED_CLEANUP_ONLY) {
    await cleanupRecordedInvoicesOnly();
    return;
  }
  const pairingOk = await verifyPublishablePairing();
  if (pairingOk) {
    await cleanPriorRunArtifacts();
    await runSuiteAfterPairing();
  }
}

async function runBalanceAuditOnly() {
  const previous = await restorePreviousReport([
    "balance transaction and production verifiedPayment",
    "verifiedPayment transient missing-balance-transaction rejection",
  ]);
  const paymentIntentId = previous.tests
    ?.find((row) => row.scenario === "refunds: partial, full, and idempotency")
    ?.paymentIntentId;
  if (!paymentIntentId) {
    throw new Error("No owned refunded PaymentIntent was found in the previous sanitized report.");
  }
  report.targetedAudit = {
    sourceRunTag: previous.runTag || null,
    paymentIntentId,
    writesPerformed: false,
    scope: "Owned refunded PaymentIntent balance transaction readiness and isolated production verifiedPayment behavior only.",
    fixtureRunTag: null,
  };
  await runBalanceVerification(paymentIntentId);
  await runTransientMissingBalanceTransactionCheck();
}

async function restorePreviousReport(replacedScenarios) {
  const previous = JSON.parse(await readFile(REPORT_PATH, "utf8"));
  const freshSafetyRows = report.tests.filter((row) =>
    ["preflight test-key prefixes and test-mode balance", "webhook endpoint isolation before writes"]
      .includes(row.scenario),
  );
  report.tests = (previous.tests || []).filter((row) =>
    ![
      "preflight test-key prefixes and test-mode balance",
      "webhook endpoint isolation before writes",
      ...replacedScenarios,
    ].includes(row.scenario),
  );
  report.tests.push(...freshSafetyRows);
  report.resources = previous.resources || [];
  report.cleanup = previous.cleanup || [];
  report.previousTestRuns = previous.previousTestRuns || [];
  report.priorUnisolatedWriteRun = previous.priorUnisolatedWriteRun;
  report.runTag = previous.runTag || report.runTag;
  report.testAccountId = previous.testAccountId ?? report.testAccountId;
  report.testAccountLivemode = previous.testAccountLivemode ?? report.testAccountLivemode;
  report.connectAvailability = previous.connectAvailability;
  return previous;
}

async function runBlockedDiagnosticsOnly() {
  const replacedScenarios = [
    "Checkout automatic-tax payload",
    "Connect Express account, onboarding link, and availability",
    "accounts.createLoginLink for the owned Connect account",
    "StripeCommerceProvider: transfer and reversal where enabled",
    "StripeCommerceProvider: payout where enabled",
    "topups.retrieve without creating or touching unrelated top-ups",
  ];
  const previous = await restorePreviousReport(replacedScenarios);
  const oldAvailability = previous.connectAvailability || {};
  report.targetedAudit = {
    sourceRunTag: previous.runTag || null,
    fixtureRunTag: RUN_TAG,
    writesPerformed: true,
    scope: "Only automatic-tax configuration and owned Express login-link diagnostics were retried; no full suite or transfer/payout writes were performed.",
  };

  let customer;
  let product;
  await run("Checkout automatic-tax payload", async () => {
    customer = await stripe.customers.create(
      { email: `stripe-tax-diagnostic-${RUN_TAG}@example.com`, metadata: { realStripeTestRun: RUN_TAG } },
      apiOptions("diagnostic-tax-customer"),
    );
    remember("customer", customer.id);
    addCleanup(`Customer ${customer.id}`, async () => {
      await stripe.customers.del(customer.id);
    });
    product = await stripe.products.create(
      { name: `Synthetic Stripe tax diagnostic ${RUN_TAG}`, metadata: { realStripeTestRun: RUN_TAG } },
      apiOptions("diagnostic-tax-product"),
    );
    remember("product", product.id);
    addCleanup(`Product ${product.id}`, async () => {
      const current = await stripe.products.retrieve(product.id);
      if (current.active) await stripe.products.update(product.id, { active: false });
    });
    const price = await stripe.prices.create(
      { product: product.id, currency: "usd", unit_amount: 1200 },
      apiOptions("diagnostic-tax-price"),
    );
    remember("price", price.id);
    addCleanup(`Price ${price.id}`, async () => {
      const current = await stripe.prices.retrieve(price.id);
      if (current.active) await stripe.prices.update(price.id, { active: false });
    });
    let session;
    try {
      session = await createCheckout("diagnostic-checkout-automatic-tax", customer.id, {
        mode: "payment",
        line_items: [{ price: price.id, quantity: 1 }],
        billing_address_collection: "required",
        automatic_tax: { enabled: true },
      });
    } catch (error) {
      const message = String(error?.raw?.message ?? error?.message ?? "");
      if (
        error?.type === "StripeInvalidRequestError" &&
        /(automatic tax|tax calculation|stripe tax)/i.test(message)
      ) {
        const blocked = new ExpectedBlock("Stripe rejected Checkout automatic_tax for the account's current tax configuration.");
        blocked.cause = error;
        throw blocked;
      }
      throw error;
    }
    if (session.status !== "open" || session.automatic_tax?.enabled !== true) {
      throw new Error("automatic tax assertion");
    }
    return { checkoutSessionId: session.id, automaticTaxEnabled: true, status: session.status };
  });

  await run("Connect Express account, onboarding link, and availability", async () => {
    const account = await stripe.accounts.create(
      {
        type: "express",
        country: "US",
        email: `stripe-connect-diagnostic-${RUN_TAG}@example.com`,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("diagnostic-connect-account"),
    );
    createdAccounts.add(account.id);
    remember("connect_account", account.id);
    addCleanup(`Connect account ${account.id}`, async () => stripe.accounts.del(account.id));
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://example.com/stripe-test/connect-refresh",
      return_url: "https://example.com/stripe-test/connect-return",
      type: "account_onboarding",
    });
    report.cleanup.push({
      resource: "owned Express account onboarding link",
      status: "SKIP",
      expiresAt: Number(link.expires_at),
      note: "Stripe onboarding links expire automatically; Stripe exposes no revocation endpoint or link ID.",
    });
    if (!link.url || !link.expires_at) throw new Error("account link assertion");
    const current = await stripe.accounts.retrieve(account.id);
    const availability = {
      accountId: current.id,
      chargesEnabled: current.charges_enabled === true,
      payoutsEnabled: current.payouts_enabled === true,
      transfers: current.capabilities?.transfers || "unavailable",
      requirementsCurrentlyDueCount: current.requirements?.currently_due?.length ?? 0,
    };
    report.connectAvailability = availability;
    return { ...availability, accountLinkExpiresAt: link.expires_at };
  });
  await runAccountsLoginLink();

  const transferRow = {
    scenario: "StripeCommerceProvider: transfer and reversal where enabled",
    status: "BLOCKED",
    summary: "Prior full-suite transfer call was withheld because Connect or available-balance requirements were unavailable.",
    failureKind: "account_or_feature_setup_unavailable",
    providerDiagnostic: {
      message: oldAvailability.transfers !== "active"
        ? `Prior owned test Express account transfers capability was ${redactDiagnostic(oldAvailability.transfers || "unavailable")}; no transfer was created.`
        : "Prior full-suite report did not retain an active transfer-capability failure reason; no transfer was created during this diagnostic-only run.",
    },
  };
  const payoutRow = {
    scenario: "StripeCommerceProvider: payout where enabled",
    status: "BLOCKED",
    summary: "Prior full-suite payout call was withheld because payouts were not enabled for the owned Express account.",
    failureKind: "account_or_feature_setup_unavailable",
    providerDiagnostic: {
      message: `Prior owned test Express account payoutsEnabled was ${oldAvailability.payoutsEnabled === true}; no payout was created.`,
    },
  };
  report.tests.push(transferRow, payoutRow);
  report.tests.push({
    scenario: "topups.retrieve without creating or touching unrelated top-ups",
    status: "SKIP",
    summary: "No top-up owned by this test run exists; no unrelated top-up was listed or retrieved.",
    skipReason: "No owned top-up was available, and creating one would move test funds.",
  });
}

async function cleanupRecordedInvoicesOnly() {
  const previous = await restorePreviousReport([]);
  report.targetedAudit = {
    sourceRunTag: previous.runTag || null,
    writesPerformed: true,
    scope: "Only archive still-active products from the original owned test run and verify/refund any remaining balance on previously recorded owned invoices.",
  };
  await cleanPriorRunArtifacts();
}

async function cleanPriorRunArtifacts() {
  let previous;
  try {
    previous = JSON.parse(await readFile(REPORT_PATH, "utf8"));
  } catch {
    return;
  }
  const resources = previous.priorUnisolatedWriteRun?.resources || [];
  for (const resource of resources.filter((entry) => entry.type === "product")) {
    try {
      const product = await stripe.products.retrieve(resource.id);
      if (
        !product.deleted &&
        product.name?.startsWith("Synthetic Stripe") &&
        product.metadata?.realStripeTestRun &&
        product.active
      ) {
        await stripe.products.update(product.id, { active: false });
      }
      report.cleanup.push({ resource: `prior synthetic product ${resource.id}`, status: "PASS" });
    } catch {
      report.cleanup.push({
        resource: `prior synthetic product ${resource.id}`,
        status: "FAIL",
        note: "Could not archive the prior synthetic test product.",
      });
      safeExitCode = 1;
    }
  }

  const recordedRuns = [...(previous.previousTestRuns || []), previous];
  const invoiceIds = new Set([
    ...recordedRuns.flatMap((runRecord) => runRecord.resources || [])
      .filter((resource) => resource.type === "invoice")
      .map((resource) => resource.id),
    ...resources.filter((resource) => resource.type === "invoice").map((resource) => resource.id),
  ]);
  const cleanupStatus = new Map();
  for (const runRecord of recordedRuns) {
    for (const row of runRecord.cleanup || []) {
      const id = String(row.resource ?? "").match(/\bin_[A-Za-z0-9]+\b/)?.[0];
      if (id) cleanupStatus.set(id, row.status);
    }
  }
  for (const invoiceId of invoiceIds) {
    if (!invoiceId || cleanupStatus.get(invoiceId) === "PASS") continue;
    try {
      const outcome = await cleanupInvoice(invoiceId);
      report.cleanup.push({
        resource: `prior test invoice ${invoiceId}`,
        status: outcome?.status || "PASS",
        ...(outcome?.note ? { note: outcome.note } : {}),
      });
    } catch (error) {
      report.cleanup.push({
        resource: `prior test invoice ${invoiceId}`,
        status: errorStatus(error),
        providerDiagnostic: safeProviderDiagnostic(error),
        note: "Could not safely verify or refund the recorded owned test invoice.",
      });
      safeExitCode = 1;
    }
  }
}

async function runSuiteAfterPairing() {
  const customer = await stripe.customers.create(
    {
      email: `stripe-test-${RUN_TAG}@example.com`,
      name: `Stripe Test ${RUN_TAG}`,
      metadata: { realStripeTestRun: RUN_TAG },
    },
    apiOptions("customer"),
  );
  createdCustomers.add(customer.id);
  remember("customer", customer.id);
  addCleanup(`Customer ${customer.id}`, async () => {
    const current = await stripe.customers.retrieve(customer.id);
    if (!current.deleted) await stripe.customers.del(customer.id);
  });

  await runCustomerSetup(customer);
  await runPaymentIntents();

  // Run the main resource/check-out scenarios; the helper below starts at the
  // product resources and never reads additional environment variables.
  await runCheckoutInvoiceSubscriptionPortalAndConnect(customer);
  await runRefundsAndBalance();
}

async function runCheckoutInvoiceSubscriptionPortalAndConnect(customer) {
  const productOneTime = await stripe.products.create(
    { name: `Synthetic Stripe test item ${RUN_TAG}`, metadata: { realStripeTestRun: RUN_TAG } },
    apiOptions("product-one-time"),
  );
  createdProducts.add(productOneTime.id);
  remember("product", productOneTime.id);
  addCleanup(`Product ${productOneTime.id}`, async () => {
    const current = await stripe.products.retrieve(productOneTime.id);
    if (current.active) await stripe.products.update(productOneTime.id, { active: false });
  });
  const priceOneTime = await stripe.prices.create(
    { product: productOneTime.id, currency: "usd", unit_amount: 1200 },
    apiOptions("price-one-time"),
  );
  createdPrices.add(priceOneTime.id);
  remember("price", priceOneTime.id);
  addCleanup(`Price ${priceOneTime.id}`, async () => {
    const current = await stripe.prices.retrieve(priceOneTime.id);
    if (current.active) await stripe.prices.update(priceOneTime.id, { active: false });
  });

  const productRecurring = await stripe.products.create(
    { name: `Synthetic Stripe recurring test item ${RUN_TAG}`, metadata: { realStripeTestRun: RUN_TAG } },
    apiOptions("product-recurring"),
  );
  createdProducts.add(productRecurring.id);
  remember("product", productRecurring.id);
  addCleanup(`Product ${productRecurring.id}`, async () => {
    const current = await stripe.products.retrieve(productRecurring.id);
    if (current.active) await stripe.products.update(productRecurring.id, { active: false });
  });
  const priceRecurring = await stripe.prices.create(
    {
      product: productRecurring.id,
      currency: "usd",
      unit_amount: 900,
      recurring: { interval: "month" },
    },
    apiOptions("price-recurring"),
  );
  createdPrices.add(priceRecurring.id);
  remember("price", priceRecurring.id);
  addCleanup(`Price ${priceRecurring.id}`, async () => {
    const current = await stripe.prices.retrieve(priceRecurring.id);
    if (current.active) await stripe.prices.update(priceRecurring.id, { active: false });
  });

  await run("Checkout Session: payment", async () => {
    const session = await createCheckout("checkout-payment", customer.id, {
      mode: "payment",
      line_items: [{ price: priceOneTime.id, quantity: 1 }],
    });
    if (session.mode !== "payment" || session.status !== "open") throw new Error("checkout assertion");
    return { checkoutSessionId: session.id, mode: session.mode, status: session.status };
  });
  await run("Checkout Session: subscription", async () => {
    const session = await createCheckout("checkout-subscription", customer.id, {
      mode: "subscription",
      line_items: [{ price: priceRecurring.id, quantity: 1 }],
    });
    if (session.mode !== "subscription" || session.status !== "open") throw new Error("checkout assertion");
    return { checkoutSessionId: session.id, mode: session.mode, status: session.status };
  });
  await run("Checkout Session: setup", async () => {
    const session = await createCheckout("checkout-setup", customer.id, {
      mode: "setup",
      payment_method_types: ["card"],
    });
    if (session.mode !== "setup" || session.status !== "open") throw new Error("checkout assertion");
    return { checkoutSessionId: session.id, mode: session.mode, status: session.status };
  });
  await run("checkout.sessions.list/retrieve for owned test sessions", async () => {
    const listed = await stripe.checkout.sessions.list({ customer: customer.id, limit: 100 });
    const ownSessionId = [...createdCheckoutSessions][0];
    if (!ownSessionId || !listed.data.some((session) => session.id === ownSessionId)) {
      throw new Error("session list assertion");
    }
    const retrieved = await stripe.checkout.sessions.retrieve(ownSessionId);
    if (retrieved.id !== ownSessionId || retrieved.status !== "open") {
      throw new Error("session retrieve assertion");
    }
    return { checkoutSessionId: ownSessionId, status: retrieved.status };
  });

  await run("invoices: create, finalize, retrieve, and void", async () => {
    const item = await stripe.invoiceItems.create(
      {
        customer: customer.id,
        amount: 950,
        currency: "usd",
        description: "Synthetic Stripe test invoice item",
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("invoice-item"),
    );
    remember("invoice_item", item.id);
    addCleanup(`Invoice item ${item.id}`, async () => {
      const current = await stripe.invoiceItems.retrieve(item.id);
      if (!current.invoice) await stripe.invoiceItems.del(item.id);
    });
    const invoice = await stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: 7,
          pending_invoice_items_behavior: "include",
        auto_advance: false,
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("invoice"),
    );
    createdInvoices.add(invoice.id);
    remember("invoice", invoice.id);
    addCleanup(`Invoice ${invoice.id}`, () => cleanupInvoice(invoice.id));
    const finalized = invoice.status === "draft"
      ? await stripe.invoices.finalizeInvoice(invoice.id)
      : invoice;
    const retrieved = await stripe.invoices.retrieve(finalized.id, { expand: ["lines"] });
    if (!["open", "paid"].includes(retrieved.status) || retrieved.total < 950) {
      throw new Error("invoice assertion");
    }
    return { invoiceId: retrieved.id, status: retrieved.status, amountDueCents: retrieved.amount_due };
  });

  await run("subscriptions: create, update, and cancel", async () => {
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: priceRecurring.id }],
        collection_method: "send_invoice",
        days_until_due: 30,
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("subscription"),
    );
    createdSubscriptions.add(subscription.id);
    remember("subscription", subscription.id);
    addCleanup(`Subscription ${subscription.id}`, async () => {
      const current = await stripe.subscriptions.retrieve(subscription.id);
      if (!["canceled", "incomplete_expired"].includes(current.status)) {
        await stripe.subscriptions.cancel(subscription.id);
      }
    });
    const updated = await stripe.subscriptions.update(subscription.id, {
      metadata: { realStripeTestRun: RUN_TAG, updateVerified: "true" },
    });
    if (updated.metadata.updateVerified !== "true") throw new Error("subscription update assertion");
    const canceled = await stripe.subscriptions.cancel(subscription.id);
    if (canceled.status !== "canceled") throw new Error("subscription cancel assertion");
    return { subscriptionId: subscription.id, status: canceled.status };
  });

  await run("invoices.list/retrieve/pay with an owned test invoice", async () => {
    if (!primaryPaymentMethodId) throw new ExpectedBlock("No owned reusable test PaymentMethod is available.");
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: primaryPaymentMethodId },
    });
    const item = await stripe.invoiceItems.create(
      {
        customer: customer.id,
        amount: 625,
        currency: "usd",
        description: "Synthetic test invoice payment",
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("invoice-pay-item"),
    );
    remember("invoice_item", item.id);
    addCleanup(`Invoice item ${item.id}`, async () => {
      const current = await stripe.invoiceItems.retrieve(item.id);
      if (!current.invoice) await stripe.invoiceItems.del(item.id);
    });
    const invoice = await stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: 7,
        pending_invoice_items_behavior: "include",
        auto_advance: false,
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("invoice-pay"),
    );
    createdInvoices.add(invoice.id);
    remember("invoice", invoice.id);
    addCleanup(`Invoice ${invoice.id}`, () => cleanupInvoice(invoice.id));
    const finalized = invoice.status === "draft"
      ? await stripe.invoices.finalizeInvoice(invoice.id)
      : invoice;
    const listed = await stripe.invoices.list({ customer: customer.id, limit: 100 });
    if (!listed.data.some((row) => row.id === invoice.id)) throw new Error("invoice list assertion");
    const beforePay = await stripe.invoices.retrieve(finalized.id);
    if (beforePay.id !== invoice.id || beforePay.status !== "open") throw new Error("invoice retrieve assertion");
    const paid = await stripe.invoices.pay(invoice.id, { payment_method: primaryPaymentMethodId });
    const paidPaymentIntentId = extractInvoicePaymentIntentId(paid);
    if (paidPaymentIntentId) markCreatedPaymentIntent({ id: paidPaymentIntentId });
    if (paid.status !== "paid" || paid.amount_paid !== 625) throw new Error("invoice pay assertion");
    const retrieved = await stripe.invoices.retrieve(invoice.id, {
      expand: ["payment_intent", "payments.data.payment.payment_intent"],
    });
    let paymentIntentId = extractInvoicePaymentIntentId(retrieved);
    if (paymentIntentId) markCreatedPaymentIntent({ id: paymentIntentId });
    if (!paymentIntentId) {
      const intents = await stripe.paymentIntents.list({ customer: customer.id, limit: 100 });
      const ownIntent = intents.data.find((candidate) =>
        candidate.status === "succeeded" &&
        candidate.amount_received === 625 &&
        (candidate.invoice === invoice.id ||
          (candidate.customer === customer.id && candidate.metadata?.realStripeTestRun === RUN_TAG)),
      );
      if (!ownIntent) throw new Error("paid invoice PaymentIntent assertion");
      paymentIntentId = ownIntent.id;
      markCreatedPaymentIntent(ownIntent);
    }
    return { invoiceId: invoice.id, paymentIntentId, status: paid.status, amountPaidCents: paid.amount_paid };
  });

  await run("paymentMethods.list/detach for owned test method", async () => {
    if (!primaryPaymentMethodId) throw new ExpectedBlock("No owned test PaymentMethod is available.");
    const methods = await stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: 100 });
    if (!methods.data.some((method) => method.id === primaryPaymentMethodId)) {
      throw new Error("PaymentMethod list assertion");
    }
    const existing = await stripe.paymentMethods.retrieve(primaryPaymentMethodId);
    if (existing.customer) await stripe.paymentMethods.detach(primaryPaymentMethodId);
    const detached = await stripe.paymentMethods.retrieve(primaryPaymentMethodId);
    if (detached.customer) throw new Error("PaymentMethod detach assertion");
    return { paymentMethodId: detached.id, detached: true };
  });

  await run("billing portal session", async () => {
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: "https://example.com/stripe-test/portal-return",
    });
    remember("billing_portal_session", session.id);
    report.cleanup.push({
      resource: `billing_portal_session ${session.id}`,
      status: "SKIP",
      note: "Portal sessions are short-lived and Stripe exposes no revoke/delete endpoint.",
    });
    if (!session.url) throw new Error("portal assertion");
    return { portalSessionId: session.id, urlWithheld: true };
  });

  await run("shipping rate and Checkout shipping payload", async () => {
    const rate = await stripe.shippingRates.create(
      {
        display_name: "Synthetic test shipping",
        type: "fixed_amount",
        fixed_amount: { amount: 500, currency: "usd" },
        metadata: { realStripeTestRun: RUN_TAG },
      },
      apiOptions("shipping-rate"),
    );
    createdShippingRates.add(rate.id);
    remember("shipping_rate", rate.id);
    addCleanup(`Shipping rate ${rate.id}`, async () => {
      const current = await stripe.shippingRates.retrieve(rate.id);
      if (current.active) await stripe.shippingRates.update(rate.id, { active: false });
    });
    const session = await createCheckout("checkout-shipping", customer.id, {
      mode: "payment",
      line_items: [{ price: priceOneTime.id, quantity: 1 }],
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [{ shipping_rate: rate.id }],
    });
    if (session.status !== "open") throw new Error("shipping assertion");
    return { shippingRateId: rate.id, checkoutSessionId: session.id, status: session.status };
  });

  await run("Checkout automatic-tax payload", async () => {
    let session;
    try {
      session = await createCheckout("checkout-automatic-tax", customer.id, {
        mode: "payment",
        line_items: [{ price: priceOneTime.id, quantity: 1 }],
        billing_address_collection: "required",
        automatic_tax: { enabled: true },
      });
    } catch (error) {
      const providerMessage = String(error?.raw?.message ?? error?.message ?? "");
      if (
        error?.type === "StripeInvalidRequestError" &&
        /(automatic tax|tax calculation|stripe tax)/i.test(providerMessage)
      ) {
        const blocked = new ExpectedBlock("Stripe rejected Checkout automatic_tax for the account's current tax configuration.");
        blocked.cause = error;
        throw blocked;
      }
      throw error;
    }
    if (session.status !== "open" || session.automatic_tax?.enabled !== true) {
      throw new Error("automatic tax assertion");
    }
    return { checkoutSessionId: session.id, automaticTaxEnabled: true, status: session.status };
  });

  await run("prices.list/retrieve and products.list/retrieve for owned fixtures", async () => {
    const listedPrices = await stripe.prices.list({ product: productOneTime.id, limit: 10 });
    if (!listedPrices.data.some((price) => price.id === priceOneTime.id)) {
      throw new Error("price list assertion");
    }
    const listedProducts = await stripe.products.list({ limit: 100 });
    if (!listedProducts.data.some((product) => product.id === productRecurring.id)) {
      throw new Error("product list assertion");
    }
    const retrievedPrice = await stripe.prices.retrieve(priceRecurring.id);
    const retrievedProduct = await stripe.products.retrieve(productOneTime.id);
    if (retrievedPrice.id !== priceRecurring.id || retrievedProduct.id !== productOneTime.id) {
      throw new Error("product price retrieval assertion");
    }
    return {
      productId: retrievedProduct.id,
      priceId: retrievedPrice.id,
      listAndRetrieve: "PASS",
    };
  });

  await runConnectAccount();
  await runAccountsLoginLink();
  await runDisputes();
  await runProviderConnectScenarios();
  await run("topups.retrieve without creating or touching unrelated top-ups", async () => {
    throw new SkipScenario("No top-up owned by this run exists; no unrelated top-up was listed or retrieved.");
  });
}

async function runProviderConnectScenarios() {
  let provider;
  await run("StripeCommerceProvider: refund using real Stripe SDK", async () => {
    const loaded = await loadIsolatedProductionModule("server/services/commerce/provider.ts");
    provider = new loaded.StripeCommerceProvider(realStripeClient);
    const pi = await createPaymentIntent("provider-refund-charge", { amount: 1000 });
    if (pi.status !== "succeeded") throw new Error("provider charge assertion");
    const originalRefundCreate = stripe.refunds.create;
    stripe.refunds.create = async function (...args) {
      const refund = await originalRefundCreate.apply(this, args);
      remember("refund", refund.id);
      return refund;
    };
    const operation = {
      id: `${RUN_TAG}:provider-refund`,
      kind: "refund",
      currency: "usd",
      amount_cents: 1000,
      created_at: new Date().toISOString(),
      payload: { paymentIntent: pi.id, orderId: `${RUN_TAG}:synthetic-order` },
    };
    try {
      const result = await provider.refund(operation);
      if (result.status !== "succeeded" || result.refundedCents !== 1000) {
        throw new Error("provider refund assertion");
      }
      return { paymentIntentId: pi.id, refundId: result.id, refundedCents: result.refundedCents };
    } finally {
      stripe.refunds.create = originalRefundCreate;
    }
  });

  await run("StripeCommerceProvider: transfer and reversal where enabled", async () => {
    if (!provider) {
      const loaded = await loadIsolatedProductionModule("server/services/commerce/provider.ts");
      provider = new loaded.StripeCommerceProvider(realStripeClient);
    }
    const accountId = report.connectAvailability?.accountId;
    const balance = await stripe.balance.retrieve();
    const available = balance.available.find((item) => item.currency === "usd")?.amount ?? 0;
    if (!accountId) throw new ExpectedBlock("No owned Connect account is available for transfer verification.");
    if (report.connectAvailability?.transfers !== "active") {
      throw new ExpectedBlock(`The owned Connect account transfers capability is ${report.connectAvailability?.transfers || "unavailable"}, not active.`);
    }
    if (available < 125) {
      throw new ExpectedBlock(`Platform available USD balance is ${available} cents; the synthetic transfer requires 125 cents.`);
    }
    const operation = {
      id: `${RUN_TAG}:provider-transfer`,
      amount_cents: 125,
      currency: "usd",
      payload: { accountId },
    };
    const transferId = await provider.transfer(operation);
    remember("transfer", transferId);
    addCleanup(`test transfer reversal ${transferId}`, async () => {
      await provider.reverse({ ...operation, payload: { transferId } });
    });
    const retryId = await provider.transfer(operation);
    if (transferId !== retryId) throw new Error("transfer idempotency assertion");
    const reversalId = await provider.reverse({ ...operation, payload: { transferId } });
    remember("transfer_reversal", reversalId);
    const reversalRetry = await provider.reverse({ ...operation, payload: { transferId } });
    if (reversalId !== reversalRetry) throw new Error("reversal idempotency assertion");
    return { transferId, reversalId, idempotentRetriesMatched: true };
  });

  await run("StripeCommerceProvider: payout where enabled", async () => {
    if (!provider) {
      const loaded = await loadIsolatedProductionModule("server/services/commerce/provider.ts");
      provider = new loaded.StripeCommerceProvider(realStripeClient);
    }
    const accountId = report.connectAvailability?.accountId;
    if (!accountId || report.connectAvailability?.payoutsEnabled !== true) {
      throw new ExpectedBlock(
        accountId
          ? `The owned Connect account payoutsEnabled flag is ${report.connectAvailability?.payoutsEnabled === true}; payouts must be enabled.`
          : "No owned Connect account is available for payout verification.",
      );
    }
    const connectedBalance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    const available = connectedBalance.available.find((item) => item.currency === "usd")?.amount ?? 0;
    if (available < 100) {
      throw new ExpectedBlock(`Owned connected account available USD balance is ${available} cents; the synthetic payout requires 100 cents.`);
    }
    const operation = {
      id: `${RUN_TAG}:provider-payout`,
      amount_cents: 100,
      currency: "usd",
      created_at: new Date().toISOString(),
      payload: { accountId },
    };
    const result = await provider.payout(operation);
    if (result.id) {
      remember("payout", result.id);
      report.cleanup.push({
        resource: `Payout ${result.id}`,
        status: "SKIP",
        note: "Stripe payouts cannot be canceled after creation; this scenario only runs when the owned account is payout-enabled.",
      });
    }
    if (!result.id || !result.status) throw new Error("payout assertion");
    const retrieved = await stripe.payouts.retrieve(result.id, { stripeAccount: accountId });
    const listed = await stripe.payouts.list(
      { limit: 100 },
      { stripeAccount: accountId },
    );
    if (
      retrieved.id !== result.id ||
      !listed.data.some((payout) => payout.id === result.id)
    ) {
      throw new Error("payout list/retrieve assertion");
    }
    return { payoutId: result.id, status: retrieved.status, listAndRetrieve: "PASS" };
  });
}

async function runAccountsLoginLink() {
  await run("accounts.createLoginLink for the owned Connect account", async () => {
    const accountId = report.connectAvailability?.accountId;
    if (!accountId) throw new ExpectedBlock("No owned Connect account is available.");
    try {
      const link = await stripe.accounts.createLoginLink(accountId);
      if (!link.url) throw new Error("login link assertion");
      return { accountId, loginLinkUrlWithheld: true };
    } catch (error) {
      const message = String(error?.raw?.message ?? error?.message ?? "");
      if (
        /only.*standard|standard.*account|express.*(not supported|cannot|only)/i.test(message) ||
        /not completed onboarding|onboarding.{0,30}(incomplete|required)/i.test(message)
      ) {
        const blocked = new ExpectedBlock("Stripe rejected createLoginLink because the owned Express account is not eligible for a dashboard login link.");
        blocked.cause = error;
        throw blocked;
      }
      throw error;
    }
  });
}

async function runDisputes() {
  await run("disputes.retrieve/update for own pm_card_createDispute charge", async () => {
    const pi = await createPaymentIntent("pi-dispute-fixture", {
      amount: 2200,
      payment_method: "pm_card_createDispute",
      description: "Synthetic dispute test fixture",
    });
    if (pi.status !== "succeeded") throw new Error("dispute fixture charge assertion");
    disputesWithoutRefund.add(pi.id);
    const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
    if (!chargeId) throw new Error("dispute fixture charge ID assertion");
    const charge = await stripe.charges.retrieve(chargeId);
    if (!charge.disputed) throw new Error("dispute fixture did not produce a dispute");
    const listed = await stripe.disputes.list({ charge: chargeId, limit: 10 });
    const ownDispute = listed.data.find((dispute) => dispute.charge === chargeId);
    if (!ownDispute) throw new Error("dispute list assertion");
    remember("dispute", ownDispute.id);
    report.cleanup.push({
      resource: `dispute ${ownDispute.id}`,
      status: "SKIP",
      note: "Stripe disputes have no delete/revoke API; only this run's documented test-fixture dispute is updated.",
    });
    const retrieved = await stripe.disputes.retrieve(ownDispute.id);
    const updated = await stripe.disputes.update(retrieved.id, {
      metadata: { realStripeTestRun: RUN_TAG, updateVerified: "true" },
    });
    if (updated.id !== retrieved.id || updated.metadata.updateVerified !== "true") {
      throw new Error("dispute update assertion");
    }
    return { paymentIntentId: pi.id, chargeId, disputeId: updated.id, updatedOwnTestDispute: true };
  });
}

async function writeReport() {
  try {
    const previous = JSON.parse(await readFile(REPORT_PATH, "utf8"));
    if (previous.priorUnisolatedWriteRun) report.priorUnisolatedWriteRun = previous.priorUnisolatedWriteRun;
    const history = Array.isArray(previous.previousTestRuns) ? previous.previousTestRuns : [];
    if (previous.summary && previous.webhookIsolation && previous.coverageNotes?.executionMode === "test-mode API scenarios") {
      history.push({
        startedAt: previous.startedAt ?? null,
        finishedAt: previous.finishedAt ?? null,
        summary: previous.summary,
        webhookIsolation: previous.webhookIsolation,
        tests: Array.isArray(previous.tests) ? previous.tests : [],
        resources: Array.isArray(previous.resources)
          ? previous.resources.map(({ type, id }) => ({ type, id }))
          : [],
        cleanup: Array.isArray(previous.cleanup) ? previous.cleanup : [],
      });
    }
    report.previousTestRuns = history.slice(-3);
  } catch {
    // There is no prior report on a first run.
  }
  for (const name of SCENARIOS) {
    skip(name, "Scenario was not reached; no resource was created by this unstarted scenario.");
  }
  const counts = report.tests.reduce((result, row) => {
    result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, {});
  report.summary = {
    counts,
    cleanupCounts: report.cleanup.reduce((result, row) => {
      result[row.status] = (result[row.status] || 0) + 1;
      return result;
    }, {}),
    ...aggregateResults(report.tests, report.cleanup),
  };
  safeExitCode = Math.max(safeExitCode, report.summary.exitCode);
  report.coverageNotes = {
    executionMode: WEBHOOK_PREFLIGHT_ONLY
      ? "read-only webhook isolation preflight; no Stripe fixtures were created"
      : BALANCE_AUDIT_ONLY
        ? "targeted read-only balance transaction and verifiedPayment audit"
        : BLOCKED_DIAGNOSTICS_ONLY
          ? "targeted test-mode diagnostics for automatic tax and Express login-link eligibility; other prior suite evidence retained"
          : RECORDED_CLEANUP_ONLY
            ? "targeted recovery for recorded owned test products and invoices; no full suite run"
          : "test-mode API scenarios",
    stripeJsBrowserConfirmation: "SKIP: no browser fixture was launched; publishable-key/client_secret pairing was verified directly against Stripe API.",
    topups: "No top-up was created, listed, or retrieved because no top-up owned by this run exists; unrelated top-ups were not touched.",
    verifiedPayment: "Settled-path test polls only the owned charge for up to 20 seconds before invoking the production bundle with the real test SDK; transient missing-balance-transaction rejection is separately asserted with an in-memory fixture.",
    appRoutes: "No application route, webhook, database, or live server was invoked.",
  };
  report.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
  );
  const { PASS = 0, FAIL = 0, BLOCKED = 0, SKIP = 0 } = counts;
  console.log(`Stripe TEST-MODE verification: ${report.summary.status} (exit ${report.summary.exitCode}); PASS ${PASS} | FAIL ${FAIL} | BLOCKED ${BLOCKED} | SKIP ${SKIP}`);
  console.log("Sanitized report written to .local/payment-processing/real-stripe-report.json");
}

if (SUMMARY_SELF_TEST_ONLY) {
  try {
    runSummarySelfTests();
    console.log("Summary guards and diagnostic redaction self-tests: PASS");
  } catch {
    console.error("Summary guards and diagnostic redaction self-tests: FAIL");
    process.exitCode = 1;
  }
} else {
  try {
    await main();
  } catch (error) {
    safeExitCode = 1;
    addRow("unexpected runner failure", "FAIL", "Runner stopped; provider diagnostics were sanitized.");
    const diagnostic = safeProviderDiagnostic(error);
    const row = report.tests.at(-1);
    if (Object.keys(diagnostic).length) row.providerDiagnostic = diagnostic;
  } finally {
    if (apiEnabled) await cleanupAll();
    await writeReport();
    process.exitCode = safeExitCode;
  }
}
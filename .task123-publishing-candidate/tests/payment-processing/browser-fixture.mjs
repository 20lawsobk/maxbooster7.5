import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import {
  buildSubscribeFormBrowserBundle,
  createBootstrapScenarioReservation,
} from "./helpers-browser-fixture.mjs";

const HOST = "127.0.0.1";
const PORT = 5101;
const MAX_INDICATOR_BYTES = 512;
const FIXTURE_KIND = "subscribe-form-browser";
const RUN_TAG = randomUUID();
const REPORT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.local/payment-processing/browser-report.json",
);
const SCENARIOS = new Set(["success", "decline"]);
const scenarioReservation = createBootstrapScenarioReservation();
const PAYMENT_INTENT_STATUSES = new Set([
  "canceled",
  "processing",
  "requires_action",
  "requires_capture",
  "requires_confirmation",
  "requires_payment_method",
  "succeeded",
]);
const TOAST_TITLES = new Set([
  "Payment Failed",
  "Payment Successful!",
  "Payment Processing",
  "Additional Verification Required",
  "Payment Error",
]);
const TOAST_VARIANTS = new Set(["default", "destructive"]);
const NAVIGATION_PATHS = new Set([
  "/dashboard?payment=success",
  "/dashboard?payment=processing",
]);
const RUN_STATUSES = new Set([
  "RUNNING",
  "CLEANUP_REQUIRED",
  "CLEANED",
  "CLEANUP_FAILED",
]);
const RESOURCE_CLEANUP_STATUSES = new Set([
  "pending",
  "validation_failed_pending_cleanup",
  "ownership_validation_failed",
  "failed",
  "refund_pending",
  "refund_incomplete",
  "refunded",
  "canceled",
  "cancel_not_verified",
]);
const CLEANUP_FAILURE_REASONS = new Set([
  "created_intent_id_missing",
  "created_intent_validation_failed",
  "test_mode_or_webhook_preflight_failed",
  "resource_discovery_failed",
  "no_tagged_resources_found",
  "resource_ownership_validation_failed",
  "refund_not_fully_succeeded",
  "cancel_not_verified",
  "stripe_cleanup_operation_failed",
  "cleanup_not_verified",
  "explicit_resource_ownership_validation_failed",
  "fixture_startup_failed_after_journal",
]);
const RESOURCE_DISCOVERY_STATES = new Set([
  "not_run",
  "starting",
  "complete",
  "too_many_tagged_resources",
  "tagged_resource_validation_failed",
  "failed",
  "invalid_run_tag",
  "no_tagged_resources_found",
  "explicit_ids_verified",
]);
const PRIOR_RUN_REVIEW_STATUSES = new Set(["BLOCKED", "VERIFIED"]);
const PRIOR_RUN_REVIEW_REASONS = new Set([
  "prior_run_ids_unavailable",
  "prior_run_verified_and_cleaned",
]);

const scenarioFixtures = new Map();
const ownedPaymentIntents = new Map();
let stripe;
let server;
let shuttingDown = false;
let cleanupFailure = false;
let browserBundle;
let journal;
let currentRun;
let journalWriteQueue = Promise.resolve();

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>Isolated SubscribeForm Stripe fixture</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f3f7fc; color: #172033; font: 16px/1.5 system-ui, sans-serif; }
      header { background: #fff; border-bottom: 1px solid #dce4ef; padding: 22px max(20px, calc((100% - 1120px) / 2)); }
      header h1 { margin: 0 0 6px; font-size: 22px; }
      header p { margin: 0; color: #58677d; }
      main { max-width: 1120px; margin: 32px auto; padding: 0 20px 44px; }
      .fixture-controls, .fixture-status, .fixture-form { background: #fff; border: 1px solid #dce4ef; border-radius: 12px; box-shadow: 0 4px 18px #14213d0c; }
      .fixture-controls { padding: 16px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
      .fixture-controls a { color: #155eef; font-weight: 600; }
      .fixture-controls .selected { color: #344054; text-decoration: none; }
      .fixture-grid { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(360px, 1.2fr); gap: 22px; margin-top: 22px; align-items: start; }
      .fixture-status { padding: 20px; }
      .fixture-status h2 { margin: 0 0 12px; font-size: 17px; }
      .fixture-status pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: #344054; font: 13px/1.6 ui-monospace, monospace; }
      .fixture-form { overflow: hidden; }
      #subscribe-form-root { padding: 4px; }
      #subscribe-form-root > p { padding: 24px; }
      #subscribe-form-root form { padding: 0 20px 24px; }
      #subscribe-form-root button { min-height: 44px; border: 0; border-radius: 8px; padding: 10px 18px; background: #155eef; color: white; font: 600 15px system-ui, sans-serif; cursor: pointer; }
      #subscribe-form-root button:hover { background: #004eeb; }
      #subscribe-form-root button:disabled { opacity: .55; cursor: wait; }
      #subscribe-form-root [role="alert"] { margin: 12px 20px; }
      .boundary { margin-top: 20px; color: #58677d; font-size: 13px; }
      @media (max-width: 760px) { main { margin-top: 18px; } .fixture-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <header>
      <h1>Isolated Stripe SubscribeForm browser fixture</h1>
      <p>Production SubscribeForm and submit handler; isolated test-mode PaymentIntent only.</p>
    </header>
    <main>
      <nav class="fixture-controls" aria-label="Test scenarios">
        <strong>Scenario:</strong>
        <a id="success-scenario" href="/?scenario=success">Success — 4242 4242 4242 4242</a>
        <a id="decline-scenario" href="/?scenario=decline">Decline — 4000 0000 0000 0002</a>
        <span>Use any future expiry and any 3-digit CVC.</span>
      </nav>
      <div class="fixture-grid">
        <section class="fixture-status">
          <h2>Safe fixture status</h2>
          <pre id="fixture-status" role="status">Waiting for the browser fixture…</pre>
          <p class="boundary">Status omits client secrets, publishable keys, card details, and full provider errors.</p>
        </section>
        <section class="fixture-form" aria-label="Subscription payment form">
          <div id="subscribe-form-root"></div>
        </section>
      </div>
    </main>
    <script>
      (() => {
        const params = new URLSearchParams(window.location.search);
        const scenario = params.get("scenario") || "success";
        if (!["success", "decline"].includes(scenario) ||
            [...params.keys()].some((key) => key !== "scenario") ||
            params.getAll("scenario").length > 1) {
          document.getElementById("fixture-status").textContent = "Invalid scenario. Use success or decline.";
          return;
        }
        window.__paymentFixtureScenario = scenario;
        document.getElementById(scenario + "-scenario").classList.add("selected");
        const statusElement = document.getElementById("fixture-status");
        async function refreshStatus() {
          try {
            const response = await fetch("/status?scenario=" + scenario, { cache: "no-store" });
            if (!response.ok) throw new Error("status unavailable");
            const safeStatus = await response.json();
            statusElement.textContent = JSON.stringify(safeStatus, null, 2);
          } catch {
            statusElement.textContent = "Safe status is temporarily unavailable.";
          }
        }
        void refreshStatus();
        window.setInterval(refreshStatus, 1500);
      })();
    </script>
    <script src="/bundle.js"></script>
  </body>
</html>`;

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(body));
}

function isLoopback(address) {
  return address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1";
}

function fixtureScenario(url) {
  const values = url.searchParams.getAll("scenario");
  if ([...url.searchParams.keys()].some((key) => key !== "scenario") || values.length > 1) {
    return null;
  }
  const scenario = values[0] || "success";
  return SCENARIOS.has(scenario) ? scenario : null;
}

function safeIndicatorRecord(record) {
  return {
    toast: record?.toast || null,
    navigationPath: record?.navigationPath || null,
  };
}

function safeResource(resource) {
  return {
    paymentIntentId: isPaymentIntentId(resource.paymentIntentId)
      ? resource.paymentIntentId
      : null,
    scenario: SCENARIOS.has(resource.scenario) ? resource.scenario : null,
    metadataRunTag: isRunTag(resource.metadataRunTag)
      ? resource.metadataRunTag
      : null,
    livemode: resource.livemode === false ? false : null,
    createdStatus: PAYMENT_INTENT_STATUSES.has(resource.createdStatus)
      ? resource.createdStatus
      : null,
    observedStatus: PAYMENT_INTENT_STATUSES.has(resource.observedStatus)
      ? resource.observedStatus
      : null,
    cleanupStatus: RESOURCE_CLEANUP_STATUSES.has(resource.cleanupStatus)
      ? resource.cleanupStatus
      : "pending",
    refundedCents: Number.isSafeInteger(resource.refundedCents)
      ? resource.refundedCents
      : null,
  };
}

function safeRun(run) {
  return {
    runTag: isRunTag(run.runTag) ? run.runTag : null,
    status: RUN_STATUSES.has(run.status) ? run.status : "CLEANUP_FAILED",
    startedAt: typeof run.startedAt === "string" ? run.startedAt : null,
    cleanupCheckedAt: typeof run.cleanupCheckedAt === "string"
      ? run.cleanupCheckedAt
      : null,
    cleanupFailureReason: CLEANUP_FAILURE_REASONS.has(run.cleanupFailureReason)
      ? run.cleanupFailureReason
      : null,
    resourceDiscovery: RESOURCE_DISCOVERY_STATES.has(run.resourceDiscovery)
      ? run.resourceDiscovery
      : "not_run",
    resources: (run.resources || []).map(safeResource),
  };
}

async function loadJournal() {
  try {
    const parsed = JSON.parse(await readFile(REPORT_PATH, "utf8"));
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.runs)) {
      throw new Error("Invalid browser resource journal.");
    }
    const review = parsed.priorRunReview;
    return {
      schemaVersion: 1,
      mode: "Stripe test mode",
      runs: parsed.runs.map(safeRun),
      priorRunReview: PRIOR_RUN_REVIEW_STATUSES.has(review?.status) &&
        PRIOR_RUN_REVIEW_REASONS.has(review?.reason)
        ? {
            status: review.status,
            reason: review.reason,
            resources: Array.isArray(review.resources)
              ? review.resources.map(safeResource)
              : [],
          }
        : null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        schemaVersion: 1,
        mode: "Stripe test mode",
        runs: [],
        priorRunReview: null,
      };
    }
    throw new Error("Browser resource journal could not be read.");
  }
}

async function persistJournal() {
  if (!journal) return;
  const contents = JSON.stringify({
    schemaVersion: 1,
    mode: "Stripe test mode",
    runs: journal.runs.map(safeRun),
    priorRunReview: journal.priorRunReview || null,
  }, null, 2);
  const temporaryPath = `${REPORT_PATH}.${process.pid}.${randomUUID()}.tmp`;
  const write = journalWriteQueue.then(async () => {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporaryPath, contents, { mode: 0o600, flag: "wx" });
      await rename(temporaryPath, REPORT_PATH);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  });
  journalWriteQueue = write.catch(() => {});
  await write;
}

function findRun(runTag) {
  return journal?.runs.find((run) => run.runTag === runTag);
}

function runHasPendingCleanup(run) {
  return run.status !== "CLEANED";
}

async function recordCreatedIntent(intent, scenario, run) {
  if (!intent?.id || ownedPaymentIntents.has(intent.id)) return ownedPaymentIntents.get(intent?.id);
  const record = {
    paymentIntentId: intent.id,
    scenario,
    metadataRunTag: run.runTag,
    livemode: intent.livemode === false ? false : null,
    createdStatus: PAYMENT_INTENT_STATUSES.has(intent.status) ? intent.status : null,
    observedStatus: null,
    cleanupStatus: "pending",
    refundedCents: null,
  };
  ownedPaymentIntents.set(intent.id, record);
  run.resources.push(record);
  await persistJournal();
  return record;
}

async function createFixtureIntent(scenario) {
  const intent = await stripe.paymentIntents.create({
    amount: 100,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: {
      fixture: FIXTURE_KIND,
      scenario,
      fixtureRun: RUN_TAG,
    },
  });

  const record = await recordCreatedIntent(intent, scenario, currentRun);
  if (!intent?.id) {
    currentRun.cleanupFailureReason = "created_intent_id_missing";
    await persistJournal();
    throw new Error("Stripe test PaymentIntent failed fixture validation.");
  }

  const ownsIntent =
    intent.metadata?.fixture === FIXTURE_KIND &&
    intent.metadata?.scenario === scenario &&
    intent.metadata?.fixtureRun === RUN_TAG;
  if (ownsIntent) {
    scenarioFixtures.set(scenario, {
      id: intent.id,
      status: record?.createdStatus || "unavailable",
      toast: null,
      navigationPath: null,
    });
  }

  if (!ownsIntent || intent.livemode !== false || !intent.client_secret) {
    if (record) record.cleanupStatus = "validation_failed_pending_cleanup";
    currentRun.status = "CLEANUP_REQUIRED";
    currentRun.cleanupFailureReason = "created_intent_validation_failed";
    await persistJournal();
    throw new Error("Stripe test PaymentIntent failed fixture validation.");
  }

  return intent;
}

async function sendBootstrap(response, scenario) {
  try {
    const intent = await createFixtureIntent(scenario);
    // This short-lived response contains only the data Stripe.js requires.
    // No request/response body or client secret is logged or saved server-side.
    json(response, 200, {
      publishableKey: process.env.STRIPE_TEST_CLIENT,
      clientSecret: intent.client_secret,
    });
  } catch {
    json(response, 503, { error: "stripe_test_fixture_unavailable" });
  }
}

async function sendStatus(response, scenario) {
  const record = scenarioFixtures.get(scenario);
  if (!record) {
    json(response, 200, {
      paymentIntent: { id: null, status: "not_created" },
      form: safeIndicatorRecord(null),
    });
    return;
  }

  let status = record.status;
  try {
    const intent = await stripe.paymentIntents.retrieve(record.id);
    status = PAYMENT_INTENT_STATUSES.has(intent.status) ? intent.status : "unavailable";
    record.status = status;
  } catch {
    status = "unavailable";
  }

  json(response, 200, {
    paymentIntent: {
      id: record.id,
      status: PAYMENT_INTENT_STATUSES.has(status) ? status : "unavailable",
    },
    form: safeIndicatorRecord(record),
  });
}

async function receiveIndicator(request, response) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_INDICATOR_BYTES) {
      json(response, 413, { error: "indicator_too_large" });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  }

  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    json(response, 400, { error: "invalid_indicator" });
    return;
  }

  const scenario = SCENARIOS.has(input?.scenario) ? input.scenario : null;
  const record = scenario ? scenarioFixtures.get(scenario) : null;
  if (!record) {
    json(response, 400, { error: "invalid_indicator" });
    return;
  }

  if (input.toast !== undefined) {
    const { title, variant } = input.toast || {};
    if (
      !TOAST_TITLES.has(title) ||
      !TOAST_VARIANTS.has(variant) ||
      Object.keys(input.toast || {}).some((key) => key !== "title" && key !== "variant")
    ) {
      json(response, 400, { error: "invalid_indicator" });
      return;
    }
    record.toast = { title, variant };
  } else if (input.navigationPath !== undefined) {
    if (
      !NAVIGATION_PATHS.has(input.navigationPath) ||
      Object.keys(input).some((key) => key !== "scenario" && key !== "navigationPath")
    ) {
      json(response, 400, { error: "invalid_indicator" });
      return;
    }
    record.navigationPath = input.navigationPath;
  } else {
    json(response, 400, { error: "invalid_indicator" });
    return;
  }

  json(response, 204, {});
}

const fixtureStyles = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.stripe.com",
  "font-src 'self' data: https://*.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
  "connect-src 'self' https://api.stripe.com https://r.stripe.com https://*.stripe.com",
].join("; ");

function handleRequest(request, response) {
  if (!isLoopback(request.socket.remoteAddress)) {
    json(response, 403, { error: "loopback_only" });
    return;
  }
  if (request.headers.host !== `${HOST}:${PORT}`) {
    json(response, 403, { error: "loopback_host_required" });
    return;
  }

  const rawTarget = request.url || "";
  if (!rawTarget.startsWith("/") || rawTarget.startsWith("//")) {
    json(response, 404, { error: "not_found" });
    return;
  }
  let url;
  try {
    url = new URL(rawTarget, `http://${HOST}:${PORT}`);
  } catch {
    json(response, 404, { error: "not_found" });
    return;
  }
  if (url.origin !== `http://${HOST}:${PORT}`) {
    json(response, 404, { error: "not_found" });
    return;
  }
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (
    (origin && origin !== `http://${HOST}:${PORT}`) ||
    (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    json(response, 403, { error: "same_origin_required" });
    return;
  }

  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");

  if (request.method === "GET" && url.pathname === "/") {
    if (!fixtureScenario(url)) {
      json(response, 400, { error: "scenario_must_be_success_or_decline" });
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "content-security-policy": fixtureStyles,
    });
    response.end(page);
    return;
  }

  if (request.method === "GET" && url.pathname === "/bundle.js" && !url.search) {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "content-security-policy": "default-src 'none'; script-src 'self' https://js.stripe.com",
    });
    response.end(browserBundle);
    return;
  }

  if (request.method === "GET" && url.pathname === "/bootstrap") {
    const scenario = fixtureScenario(url);
    if (!scenario) {
      json(response, 400, { error: "scenario_must_be_success_or_decline" });
      return;
    }
    if (!scenarioReservation(scenario)) {
      json(response, 409, { error: "scenario_already_initialized" });
      return;
    }
    void sendBootstrap(response, scenario);
    return;
  }

  if (request.method === "GET" && url.pathname === "/status") {
    const scenario = fixtureScenario(url);
    if (!scenario) {
      json(response, 400, { error: "scenario_must_be_success_or_decline" });
      return;
    }
    void sendStatus(response, scenario);
    return;
  }

  if (request.method === "POST" && url.pathname === "/indicator" && !url.search) {
    void receiveIndicator(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/__shutdown" && !url.search) {
    json(response, 202, { shuttingDown: true });
    setImmediate(() => void shutdown());
    return;
  }

  json(response, 404, { error: "not_found" });
}

async function preflightStripeTestAccount() {
  const secret = process.env.STRIPE_TEST_SECRET;
  const publishable = process.env.STRIPE_TEST_CLIENT;
  if (
    typeof secret !== "string" ||
    !secret.startsWith("sk_test_") ||
    typeof publishable !== "string" ||
    !publishable.startsWith("pk_test_")
  ) {
    throw new Error("Dedicated Stripe test credentials are required.");
  }

  stripe = new Stripe(secret, { maxNetworkRetries: 1, timeout: 15_000 });
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) {
    throw new Error("Stripe balance livemode preflight was not false.");
  }

  // Without consulting application configuration, every enabled endpoint on
  // this Stripe account is treated as potentially shared-app infrastructure.
  // Endpoint URLs and secrets stay transient and are never retained or logged.
  let enabledEndpointExists = false;
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.status === "enabled") enabledEndpointExists = true;
  }
  if (enabledEndpointExists) {
    throw new Error("An enabled Stripe webhook endpoint prevents isolated writes.");
  }
}

function isPaymentIntentId(value) {
  return typeof value === "string" && /^pi_[A-Za-z0-9]+$/.test(value);
}

function isRunTag(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function discoverTaggedResources(run) {
  if (!isRunTag(run.runTag)) {
    run.resourceDiscovery = "invalid_run_tag";
    return false;
  }
  try {
    const found = await stripe.paymentIntents.search({
      query: `metadata['fixtureRun']:'${run.runTag}' AND metadata['fixture']:'${FIXTURE_KIND}'`,
      limit: 100,
    });
    if (found.has_more) {
      run.resourceDiscovery = "too_many_tagged_resources";
      return false;
    }
    if (found.data.length === 0 && run.resources.length === 0 && run.status === "CLEANUP_REQUIRED") {
      run.resourceDiscovery = "no_tagged_resources_found";
      run.cleanupFailureReason = "no_tagged_resources_found";
      await persistJournal();
      return false;
    }
    for (const intent of found.data) {
      if (
        intent.livemode !== false ||
        intent.metadata?.fixture !== FIXTURE_KIND ||
        intent.metadata?.fixtureRun !== run.runTag ||
        !SCENARIOS.has(intent.metadata?.scenario) ||
        !isPaymentIntentId(intent.id)
      ) {
        run.resourceDiscovery = "tagged_resource_validation_failed";
        return false;
      }
      if (!run.resources.some((item) => item.paymentIntentId === intent.id)) {
        const record = {
          paymentIntentId: intent.id,
          scenario: intent.metadata.scenario,
          metadataRunTag: run.runTag,
          livemode: false,
          createdStatus: PAYMENT_INTENT_STATUSES.has(intent.status) ? intent.status : null,
          observedStatus: null,
          cleanupStatus: "pending",
          refundedCents: null,
        };
        run.resources.push(record);
        ownedPaymentIntents.set(intent.id, record);
      }
    }
    run.resourceDiscovery = "complete";
    await persistJournal();
    return true;
  } catch {
    run.resourceDiscovery = "failed";
    run.cleanupFailureReason = "resource_discovery_failed";
    await persistJournal();
    return false;
  }
}

function expectedMetadataTag(run, resource) {
  return resource.metadataRunTag === run.runTag || isRunTag(resource.metadataRunTag);
}

async function cleanupResource(run, resource) {
  if (!isPaymentIntentId(resource.paymentIntentId) || !expectedMetadataTag(run, resource)) {
    resource.cleanupStatus = "ownership_validation_failed";
    run.cleanupFailureReason = "resource_ownership_validation_failed";
    await persistJournal();
    return false;
  }
  try {
    const current = await stripe.paymentIntents.retrieve(resource.paymentIntentId);
    const metadataMatches =
      current.id === resource.paymentIntentId &&
      current.livemode === false &&
      current.metadata?.fixture === FIXTURE_KIND &&
      current.metadata?.scenario === resource.scenario &&
      current.metadata?.fixtureRun === resource.metadataRunTag;
    if (!metadataMatches) {
      resource.cleanupStatus = "ownership_validation_failed";
      resource.observedStatus = PAYMENT_INTENT_STATUSES.has(current.status)
        ? current.status
        : "unavailable";
      run.cleanupFailureReason = "resource_ownership_validation_failed";
      await persistJournal();
      return false;
    }

    resource.observedStatus = PAYMENT_INTENT_STATUSES.has(current.status)
      ? current.status
      : "unavailable";
    if (current.status === "succeeded") {
      const refunds = await stripe.refunds.list({
        payment_intent: current.id,
        limit: 100,
      });
      if (refunds.has_more) throw new Error("Refund history requires manual review.");
      const succeeded = refunds.data
        .filter((refund) => refund.status === "succeeded")
        .reduce((sum, refund) => sum + refund.amount, 0);
      const pending = refunds.data
        .filter((refund) => refund.status === "pending" || refund.status === "requires_action")
        .reduce((sum, refund) => sum + refund.amount, 0);
      const amount = current.amount_received || current.amount;
      const remaining = amount - succeeded - pending;
      if (remaining > 0) {
        await stripe.refunds.create(
          { payment_intent: current.id, amount: remaining },
          { idempotencyKey: `subscribe-browser-cleanup-${resource.paymentIntentId}` },
        );
      }

      const verifiedRefunds = await stripe.refunds.list({
        payment_intent: current.id,
        limit: 100,
      });
      if (verifiedRefunds.has_more) throw new Error("Refund verification requires review.");
      const verified = verifiedRefunds.data
        .filter((refund) => refund.status === "succeeded")
        .reduce((sum, refund) => sum + refund.amount, 0);
      const verifiedPending = verifiedRefunds.data
        .filter((refund) => refund.status === "pending" || refund.status === "requires_action")
        .reduce((sum, refund) => sum + refund.amount, 0);
      resource.refundedCents = verified;
      if (verified < amount) {
        resource.cleanupStatus = verified + verifiedPending >= amount
          ? "refund_pending"
          : "refund_incomplete";
        run.cleanupFailureReason = "refund_not_fully_succeeded";
        await persistJournal();
        return false;
      }
      resource.cleanupStatus = "refunded";
    } else if (current.status === "canceled") {
      resource.cleanupStatus = "canceled";
    } else {
      await stripe.paymentIntents.cancel(current.id);
      const canceled = await stripe.paymentIntents.retrieve(current.id);
      if (
        canceled.livemode !== false ||
        canceled.metadata?.fixture !== FIXTURE_KIND ||
        canceled.metadata?.fixtureRun !== resource.metadataRunTag ||
        canceled.status !== "canceled"
      ) {
        resource.cleanupStatus = "cancel_not_verified";
        run.cleanupFailureReason = "cancel_not_verified";
        await persistJournal();
        return false;
      }
      resource.observedStatus = canceled.status;
      resource.cleanupStatus = "canceled";
    }

    await persistJournal();
    return true;
  } catch {
    resource.cleanupStatus = "failed";
    run.cleanupFailureReason = "stripe_cleanup_operation_failed";
    await persistJournal();
    return false;
  }
}

async function cleanupRun(run) {
  const discoveryOkay = run.resourceDiscovery === "explicit_ids_verified"
    ? true
    : await discoverTaggedResources(run);
  let cleanupOkay = discoveryOkay;
  for (const resource of run.resources) {
    if (!(await cleanupResource(run, resource))) cleanupOkay = false;
  }
  run.cleanupCheckedAt = new Date().toISOString();
  run.status = cleanupOkay ? "CLEANED" : "CLEANUP_FAILED";
  if (run.status !== "CLEANED" && !run.cleanupFailureReason) {
    run.cleanupFailureReason = "cleanup_not_verified";
  }
  await persistJournal();
  return cleanupOkay;
}

function makeRun(runTag = RUN_TAG, status = "RUNNING") {
  return {
    runTag,
    status,
    startedAt: new Date().toISOString(),
    cleanupCheckedAt: null,
    cleanupFailureReason: null,
    resourceDiscovery: "not_run",
    resources: [],
  };
}

async function prepareStripeClient() {
  await preflightStripeTestAccount();
}

async function cleanupByRunTag(runTag) {
  if (!isRunTag(runTag)) throw new Error("A canonical fixture run tag is required.");
  journal = await loadJournal();
  let run = findRun(runTag);
  if (!run) {
    run = makeRun(runTag, "CLEANUP_REQUIRED");
    journal.runs.push(run);
    await persistJournal();
  }
  try {
    await prepareStripeClient();
  } catch {
    run.status = "CLEANUP_FAILED";
    run.cleanupFailureReason = "test_mode_or_webhook_preflight_failed";
    run.cleanupCheckedAt = new Date().toISOString();
    await persistJournal();
    process.exitCode = 1;
    process.stdout.write("Browser fixture cleanup report: CLEANUP_FAILED (safe preflight blocked cleanup).\n");
    return;
  }
  const okay = await cleanupRun(run);
  process.exitCode = okay ? 0 : 1;
  process.stdout.write(`Browser fixture cleanup report: ${run.status} (${run.resources.length} owned PaymentIntent(s)).\n`);
}

async function cleanupExplicitPaymentIntents(ids) {
  if (
    ids.length < 1 ||
    ids.length > 2 ||
    ids.some((id) => !isPaymentIntentId(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("Explicit cleanup requires one or two unique PaymentIntent IDs.");
  }
  journal = await loadJournal();
  currentRun = makeRun(RUN_TAG, "CLEANUP_REQUIRED");
  currentRun.resourceDiscovery = "explicit_ids_verified";
  journal.runs.push(currentRun);
  journal.runs = journal.runs.slice(-20);
  await persistJournal();
  try {
    await prepareStripeClient();
  } catch {
    currentRun.status = "CLEANUP_FAILED";
    currentRun.cleanupFailureReason = "test_mode_or_webhook_preflight_failed";
    currentRun.cleanupCheckedAt = new Date().toISOString();
    await persistJournal();
    process.exitCode = 1;
    process.stdout.write("Browser fixture cleanup report: CLEANUP_FAILED (safe preflight blocked cleanup).\n");
    return;
  }

  for (const id of ids) {
    const intent = await stripe.paymentIntents.retrieve(id);
    const tag = intent.metadata?.fixtureRun;
    const scenario = intent.metadata?.scenario;
    if (
      intent.id !== id ||
      intent.livemode !== false ||
      intent.metadata?.fixture !== FIXTURE_KIND ||
      !SCENARIOS.has(scenario) ||
      !isRunTag(tag)
    ) {
      currentRun.cleanupFailureReason = "explicit_resource_ownership_validation_failed";
      currentRun.status = "CLEANUP_FAILED";
      await persistJournal();
      process.exitCode = 1;
      process.stdout.write("Browser fixture cleanup report: CLEANUP_FAILED (ownership validation failed).\n");
      return;
    }
    const resource = {
      paymentIntentId: id,
      scenario,
      metadataRunTag: tag,
      livemode: false,
      createdStatus: PAYMENT_INTENT_STATUSES.has(intent.status) ? intent.status : null,
      observedStatus: null,
      cleanupStatus: "pending",
      refundedCents: null,
    };
    currentRun.resources.push(resource);
    ownedPaymentIntents.set(id, resource);
    await persistJournal();
  }

  const okay = await cleanupRun(currentRun);
  if (
    okay &&
    currentRun.resources.length === 2 &&
    new Set(currentRun.resources.map((resource) => resource.scenario)).size === 2 &&
    currentRun.resources.some((resource) => resource.scenario === "success") &&
    currentRun.resources.some((resource) => resource.scenario === "decline") &&
    currentRun.resources.every((resource) => resource.cleanupStatus === "refunded" || resource.cleanupStatus === "canceled")
  ) {
    journal.priorRunReview = {
      status: "VERIFIED",
      reason: "prior_run_verified_and_cleaned",
      resources: currentRun.resources.map(safeResource),
    };
    await persistJournal();
  }
  if (okay) {
    for (const prior of journal.runs) {
      if (
        prior === currentRun ||
        prior.status === "CLEANED" ||
        prior.resources.length !== currentRun.resources.length
      ) {
        continue;
      }
      const sameResources = prior.resources.every((oldResource) =>
        currentRun.resources.some((newResource) =>
          oldResource.paymentIntentId === newResource.paymentIntentId &&
          oldResource.metadataRunTag === newResource.metadataRunTag,
        ),
      );
      if (sameResources) {
        prior.status = "CLEANED";
        prior.cleanupCheckedAt = currentRun.cleanupCheckedAt;
        prior.cleanupFailureReason = null;
        prior.resourceDiscovery = "explicit_ids_verified";
      }
    }
    await persistJournal();
  }
  process.exitCode = okay ? 0 : 1;
  process.stdout.write(`Browser fixture cleanup report: ${currentRun.status} (${currentRun.resources.length} owned PaymentIntent(s)).\n`);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (stripe && currentRun && currentRun.status !== "CLEANED") {
    if (await cleanupRun(currentRun).catch(() => false) === false) {
      cleanupFailure = true;
    }
    process.stdout.write(`Browser fixture cleanup report: ${currentRun.status} (${currentRun.resources.length} owned PaymentIntent(s)).\n`);
  }
  process.exitCode = cleanupFailure ? 1 : process.exitCode || 0;
}

async function start() {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--cleanup") {
      if (args.length !== 2) throw new Error("Cleanup requires one fixture run tag.");
      await cleanupByRunTag(args[1]);
      return;
    }
    if (args[0] === "--cleanup-pi") {
      await cleanupExplicitPaymentIntents(args.slice(1));
      return;
    }
    if (args.length > 0) throw new Error("Unknown browser fixture command.");

    journal = await loadJournal();
    const previousIncomplete = journal.runs.some(runHasPendingCleanup);
    if (previousIncomplete) {
      throw new Error("An earlier browser fixture run still requires cleanup.");
    }
    await preflightStripeTestAccount();
    browserBundle = await buildSubscribeFormBrowserBundle();
    currentRun = makeRun();
    journal.runs.push(currentRun);
    journal.runs = journal.runs.slice(-20);
    await persistJournal();
    server = createServer(handleRequest);
    server.on("clientError", (_error, socket) => {
      if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    });
    server.listen(PORT, HOST, () => {
      process.stdout.write(`Isolated SubscribeForm browser fixture ready at http://${HOST}:${PORT}/?scenario=success or ?scenario=decline\n`);
    });
  } catch {
    process.stderr.write("Stripe browser fixture startup failed; no provider details or credentials were retained.\n");
    if (currentRun) {
      currentRun.status = "CLEANUP_FAILED";
      currentRun.cleanupFailureReason = "fixture_startup_failed_after_journal";
      await persistJournal().catch(() => {});
    }
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await start();
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = "scripts/testing/generation-reliability-gate.mjs";
const matrixPath = "tests/e2e/generation-path-matrix.json";

function run(args, env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
    timeout: 10_000,
    maxBuffer: 1_000_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function runAsync(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("generation gate fixture timed out"));
    }, 10_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

test("generation matrix lists the primary existing MaxBooster routes", async () => {
  const matrix = JSON.parse(await readFile(`${root}/${matrixPath}`, "utf8"));
  const paths = new Map(matrix.paths.map((path) => [path.id, path]));
  for (const id of [
    "social-url-text",
    "social-url-image",
    "social-url-audio",
    "social-url-video",
    "social-direct-text",
    "shared-text",
    "shared-image",
    "shared-audio",
    "shared-video",
    "studio-audio",
    "advertising-text",
    "advertising-image",
    "advertising-video",
  ]) {
    assert.ok(paths.has(id), `missing generation path ${id}`);
    assert.ok(paths.get(id).ui);
    assert.ok(paths.get(id).backend);
    assert.ok(paths.get(id).provider);
    assert.ok(paths.get(id).result);
  }
});

test("plan mode is read-only, emits every mapped path, and never contacts the app", () => {
  const result = run(["--plan"], { PATH: process.env.PATH, HOME: process.env.HOME });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, "plan");
  assert.equal(report.result, "BLOCKED");
  assert.ok(report.results.length >= 10);
  assert.ok(report.results.every((item) => item.status === "BLOCKED"));
  assert.ok(report.results.every((item) => item.reason.includes("Plan only")));
});

test("missing isolated-account prerequisites block before network access", () => {
  const result = run([], { PATH: process.env.PATH, HOME: process.env.HOME });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, "BLOCKED");
  assert.ok(report.results.every((item) => item.status === "BLOCKED"));
  assert.ok(report.results.every((item) => item.reason.includes("Safe preflight")));
});

test("production publication origins are refused before login or generation", () => {
  const result = run([], {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    MAXBOOSTER_GENERATION_E2E_BASE_URL: "https://maxbooster.replit.app",
    MAXBOOSTER_GENERATION_E2E_ALLOWED_ORIGIN: "https://maxbooster.replit.app",
    MAXBOOSTER_GENERATION_E2E_USERNAME: "not-a-real-user",
    MAXBOOSTER_GENERATION_E2E_PASSWORD: "not-a-real-password",
    MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID: "e2e-account",
    MAXBOOSTER_GENERATION_E2E_CONFIRM_ISOLATED: "1",
    MAXBOOSTER_GENERATION_E2E_PROVIDER_RECEIPT: JSON.stringify({
      nonProduction: true,
      provider: "fixture",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
  });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, "BLOCKED");
  assert.ok(report.results.every((item) => item.reason.includes("production is refused")));
  assert.ok(!result.stdout.includes("not-a-real-password"));
});

test("a network outage on an approved loopback origin is reported as BLOCKED, not FAIL", () => {
  const result = run([], {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    MAXBOOSTER_GENERATION_E2E_BASE_URL: "http://127.0.0.1:1",
    MAXBOOSTER_GENERATION_E2E_ALLOWED_ORIGIN: "http://127.0.0.1:1",
    MAXBOOSTER_GENERATION_E2E_USERNAME: "not-a-real-user",
    MAXBOOSTER_GENERATION_E2E_PASSWORD: "not-a-real-password",
    MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID: "e2e-account",
    MAXBOOSTER_GENERATION_E2E_CONFIRM_ISOLATED: "1",
    MAXBOOSTER_GENERATION_E2E_PROVIDER_RECEIPT: JSON.stringify({
      nonProduction: true,
      provider: "fixture",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
  });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, "BLOCKED");
  assert.ok(report.results.every((item) => item.status === "BLOCKED"));
  assert.ok(!result.stdout.includes("not-a-real-password"));
});

test("fixture-only runner test exercises authenticated text-route reporting without calling providers", async () => {
  const mediaRequests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const send = (status, value, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/health") return send(200, { status: "ok" });
    if (req.url === "/api/ready") {
      return send(200, {
        status: "ok",
        unifiedAwareness: {
          ready: true,
          snapshot_ready: true,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });
    }
    if (req.url === "/api/csrf-token") {
      return send(200, { csrfToken: "fixture-csrf" }, { "set-cookie": ["csrf-token=fixture-csrf; Path=/"] });
    }
    if (req.url === "/api/auth/login") {
      assert.equal(body.username, "fixture-user");
      assert.equal(body.password, "fixture-password");
      return send(200, { success: true }, { "set-cookie": ["sessionId=fixture-session; Path=/; HttpOnly"] });
    }
    if (req.url === "/api/auth/me") return send(200, { id: "e2e-account", role: "user" });
    if (req.url === "/api/generation/capabilities") {
      return send(200, {
        serving: { generation_ready: true, model_loaded: false },
        endpoint_routes: {
          generation: Object.fromEntries(["text", "image", "audio", "video"].map((kind) => [
            kind, { online: true, trained: false, serving_mode: kind === "text" ? "live_awareness" : "procedural_renderer" },
          ])),
        },
      });
    }
    if (/\/api\/(generate\/(image|audio)|generate-video|advertising\/generate-(image|video)|multimodal\/generate)$/.test(req.url)) {
      mediaRequests.push(req.url);
      return send(500, { error: "must not run without durable cleanup capability" });
    }
    if (req.url === "/api/social/generate-from-url") {
      assert.equal(body.format, "text");
      return send(200, {
        success: true,
        url: body.url,
        metadata: { title: "Fixture page", sourceProvenance: "maxcore_fetched_url" },
        generatedContent: [{
          caption: "Fixture generated copy about an original instrumental release.",
          sourceUrl: body.url,
          sourceProvenance: "maxcore_fetched_url",
        }],
      });
    }
    if (req.url === "/api/social/generate-content") {
      return send(200, { success: true, assets: [{ modality: "text", payload: "Fixture manual social copy for an original instrumental release." }] });
    }
    if (req.url === "/api/generate/text") {
      return send(200, { output: "Fixture generated two-sentence creative text for Signal Bloom." });
    }
    if (req.url === "/api/advertising/generate-content") {
      return send(200, { success: true, creatives: [{ body: "Fixture advertising copy for the Signal Bloom release campaign." }] });
    }
    return send(404, { error: "fixture route not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    const result = await runAsync([], {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      MAXBOOSTER_GENERATION_E2E_BASE_URL: origin,
      MAXBOOSTER_GENERATION_E2E_ALLOWED_ORIGIN: origin,
      MAXBOOSTER_GENERATION_E2E_USERNAME: "fixture-user",
      MAXBOOSTER_GENERATION_E2E_PASSWORD: "fixture-password",
      MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID: "e2e-account",
      MAXBOOSTER_GENERATION_E2E_CONFIRM_ISOLATED: "1",
      MAXBOOSTER_GENERATION_E2E_PROVIDER_RECEIPT: JSON.stringify({
        nonProduction: true,
        provider: "fixture",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      MAXBOOSTER_GENERATION_E2E_ALLOW_MEDIA_WRITES: "1",
    });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 2);
    assert.equal(report.readiness.maxcoreGeneration, "ready");
    assert.equal(report.readiness.modelLoaded, false);
    assert.equal(report.results.find((item) => item.id === "social-url-text").status, "PASS");
    assert.equal(report.results.find((item) => item.id === "social-direct-text").status, "PASS");
    assert.equal(report.results.find((item) => item.id === "shared-text").status, "PASS");
    assert.equal(report.results.find((item) => item.id === "advertising-text").status, "PASS");
    assert.equal(report.results.find((item) => item.id === "studio-audio").status, "BLOCKED");
    assert.equal(report.results.find((item) => item.id === "social-url-image").status, "BLOCKED");
    assert.match(report.results.find((item) => item.id === "shared-audio").reason, /does not advertise owner-scoped media storage/);
    assert.equal(mediaRequests.length, 0);
    assert.ok(!result.stdout.includes("Fixture generated copy"));
    assert.ok(!result.stdout.includes("fixture-password"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

class GateBlocked extends Error {
  constructor(message) {
    super(message);
    this.name = "GateBlocked";
  }
}

const matrixPath = new URL("../../tests/e2e/generation-path-matrix.json", import.meta.url);
const matrix = JSON.parse(await readFile(matrixPath, "utf8"));
const args = new Set(process.argv.slice(2));
const planOnly = args.has("--plan");
const textOnly = args.has("--text-only");
const cases = [
  { id: "social-url-text", media: false },
  { id: "social-url-image", media: true },
  { id: "social-url-audio", media: true },
  { id: "social-url-video", media: true },
  { id: "social-direct-text", media: false },
  { id: "shared-text", media: false },
  { id: "advertising-text", media: false },
  { id: "shared-image", media: true },
  { id: "shared-audio", media: true },
  { id: "shared-video", media: true },
  { id: "advertising-image", media: true },
  { id: "advertising-video", media: true },
];
const caseIds = new Set(cases.map((item) => item.id));
let base;
const runtimeReadiness = {
  application: "not_checked",
  awarenessSnapshot: "not_checked",
  maxcoreGeneration: "not_checked",
  modelLoaded: null,
  modalityCapabilities: {},
  mediaArtifactSafety: "not_verified",
};
const rows = matrix.paths.map((path) => ({
  id: path.id,
  status: "BLOCKED",
  reason: "Not executed; see gate prerequisites.",
}));

function emit(exitCode) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: planOnly ? "plan" : textOnly ? "text-only" : "full",
    readiness: runtimeReadiness,
    result: rows.some((row) => row.status === "FAIL")
      ? "FAIL"
      : rows.some((row) => row.status === "BLOCKED")
        ? "BLOCKED"
        : "PASS",
    results: rows,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}

if (planOnly) {
  for (const row of rows) row.reason = "Plan only; no network or account access performed.";
  emit(2);
} else {
  const baseValue = process.env.MAXBOOSTER_GENERATION_E2E_BASE_URL;
  const allowedOrigin = process.env.MAXBOOSTER_GENERATION_E2E_ALLOWED_ORIGIN;
  const username = process.env.MAXBOOSTER_GENERATION_E2E_USERNAME;
  const password = process.env.MAXBOOSTER_GENERATION_E2E_PASSWORD;
  const expectedAccountId = process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID;
  const isolationConfirmed =
    process.env.MAXBOOSTER_GENERATION_E2E_CONFIRM_ISOLATED === "1";
  const providerReceipt = parseProviderReceipt(
    process.env.MAXBOOSTER_GENERATION_E2E_PROVIDER_RECEIPT,
  );
  const missing = [];
  if (!baseValue) missing.push("MAXBOOSTER_GENERATION_E2E_BASE_URL");
  if (!allowedOrigin) missing.push("MAXBOOSTER_GENERATION_E2E_ALLOWED_ORIGIN");
  if (!username) missing.push("MAXBOOSTER_GENERATION_E2E_USERNAME");
  if (!password) missing.push("MAXBOOSTER_GENERATION_E2E_PASSWORD");
  if (!expectedAccountId) missing.push("MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID");
  if (!isolationConfirmed) missing.push("MAXBOOSTER_GENERATION_E2E_CONFIRM_ISOLATED=1");
  if (!providerReceipt) missing.push("valid non-production provider receipt");

  try {
    base = new URL(baseValue);
    if (!isAllowedOrigin(base, allowedOrigin)) {
      missing.push("an exact localhost or Replit development origin (production is refused)");
    }
  } catch {
    missing.push("a valid MAXBOOSTER_GENERATION_E2E_BASE_URL");
  }

  if (planOnly) {
    emit(2);
  } else if (missing.length > 0) {
    for (const row of rows) row.reason = `Safe preflight not satisfied: ${missing.join("; ")}.`;
    emit(2);
  } else {
    await run();
  }
}

function modalityFor(id) {
  return matrix.paths.find((path) => path.id === id)?.modality;
}

function mediaCleanupIsSupported(id) {
  const capability = runtimeReadiness.modalityCapabilities[modalityFor(id)];
  return capability?.ownerScopedArtifactReady === true &&
    capability?.artifactCleanupReady === true;
}

function parseProviderReceipt(value) {
  if (!value) return null;
  try {
    const receipt = JSON.parse(value);
    return receipt &&
      receipt.nonProduction === true &&
      typeof receipt.provider === "string" &&
      receipt.provider.trim() &&
      typeof receipt.expiresAt === "string" &&
      Number.isFinite(Date.parse(receipt.expiresAt)) &&
      Date.parse(receipt.expiresAt) > Date.now()
      ? receipt
      : null;
  } catch {
    return null;
  }
}

function isAllowedOrigin(base, allowedOrigin) {
  if (base.username || base.password || base.search || base.hash) return false;
  if (!["http:", "https:"].includes(base.protocol)) return false;
  if (!allowedOrigin || base.origin !== allowedOrigin) return false;
  const host = base.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(host)) return true;
  if (host.endsWith(".replit.app")) return false;
  return host.endsWith(".replit.dev");
}

async function run() {
  const enabledCases = cases.filter((item) => caseIds.has(item.id) && (!textOnly || !item.media));
  const enabledIds = new Set(enabledCases.map((item) => item.id));
  const skipped = rows.filter((row) => !enabledIds.has(row.id));
  for (const row of skipped) {
    row.reason = textOnly
      ? "Not run in --text-only scope."
      : row.id === "studio-audio"
        ? "Blocked: the asynchronous studio route does not expose a safe cancel-and-delete contract for its MaxCore job."
        : "This path is mapped, but not part of the current deterministic API gate.";
  }
  let cookie = "";
  let csrfToken = "";
  const cleanupKeys = new Map();
  const cleanupJobs = new Map();
  try {
    const health = await request("/api/health", "GET");
    if (!health.ok) throw new GateBlocked("application health is not available");
    const appReadiness = await request("/api/ready", "GET");
    runtimeReadiness.application =
      appReadiness.ok && appReadiness.data?.status === "ok" ? "ready" : "not_ready";
    const awareness = appReadiness.data?.unifiedAwareness;
    const snapshotExpiry = Number(awareness?.expires_at || 0);
    runtimeReadiness.awarenessSnapshot =
      awareness?.ready === true &&
      awareness?.snapshot_ready === true &&
      snapshotExpiry * 1000 > Date.now()
        ? "fresh"
        : "not_ready_or_stale";
    if (runtimeReadiness.application !== "ready" ||
        runtimeReadiness.awarenessSnapshot !== "fresh") {
      throw new GateBlocked("application readiness or the unified awareness snapshot is not fresh");
    }

    const csrf = await request("/api/csrf-token", "GET");
    if (!csrf.ok) throw new GateBlocked("application CSRF bootstrap is not available");
    cookie = mergeCookies(cookie, csrf.setCookies);
    csrfToken = String(csrf.data?.csrfToken || csrf.data?.token || "");
    if (!csrfToken) {
      const fromCookie = cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
      csrfToken = fromCookie ? decodeURIComponent(fromCookie) : "";
    }
    if (!csrfToken) throw new GateBlocked("application did not provide a CSRF token");

    const login = await request(
      "/api/auth/login",
      "POST",
      { username: process.env.MAXBOOSTER_GENERATION_E2E_USERNAME, password: process.env.MAXBOOSTER_GENERATION_E2E_PASSWORD },
      { csrf: true },
    );
    cookie = mergeCookies(cookie, login.setCookies);
    if (!login.ok) throw new GateBlocked("isolated test account could not authenticate");

    const me = await request("/api/auth/me", "GET");
    if (!me.ok || String(me.data?.id || "") !== process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID) {
      throw new GateBlocked("authenticated identity does not match the dedicated test account");
    }
    const role = String(me.data?.role || "").toLowerCase();
    if (role === "admin" || role === "owner" || role === "founder") {
      throw new GateBlocked("generation gate refuses administrator or owner accounts");
    }
    const capabilities = await request("/api/generation/capabilities", "GET");
    if (!capabilities.ok) {
      runtimeReadiness.maxcoreGeneration = "unavailable";
      throw new GateBlocked("MaxCore generation capabilities could not be read through the authenticated app gateway");
    }
    const serving = capabilities.data?.serving || {};
    runtimeReadiness.modelLoaded =
      typeof serving.model_loaded === "boolean"
        ? serving.model_loaded
        : null;
    runtimeReadiness.maxcoreGeneration =
      serving.generation_ready === true ? "ready" : "not_ready";
    const modalities = capabilities.data?.endpoint_routes?.generation || {};
    runtimeReadiness.modalityCapabilities = Object.fromEntries(
      ["text", "image", "audio", "video"].map((kind) => {
        const capability = modalities[kind] || {};
        return [kind, {
          online: capability.online === true || capability.ready === true,
          trained: capability.trained === true,
          servingMode: typeof capability.serving_mode === "string" ? capability.serving_mode : null,
          ownerScopedArtifactReady: capability.owner_scoped_artifact_ready === true,
          artifactCleanupReady: capability.artifact_cleanup_ready === true,
        }];
      }),
    );
    runtimeReadiness.mediaArtifactSafety = ["image", "audio", "video"].every((kind) =>
      runtimeReadiness.modalityCapabilities[kind]?.ownerScopedArtifactReady === true &&
      runtimeReadiness.modalityCapabilities[kind]?.artifactCleanupReady === true,
    ) ? "ready" : "not_advertised";
    if (runtimeReadiness.maxcoreGeneration !== "ready") {
      throw new GateBlocked("MaxCore reports generation readiness unavailable");
    }
    const sourceUrl = getSourceUrl();
    const mediaCases = enabledCases.filter((item) => item.media);
    const studioAudio = rows.find((item) => item.id === "studio-audio");
    if (studioAudio) {
      studioAudio.reason =
        "Not run: the studio async-audio path lacks a verified isolated job-and-artifact cleanup contract.";
    }
    for (const item of mediaCases) {
      const row = rows.find((entry) => entry.id === item.id);
      if (process.env.MAXBOOSTER_GENERATION_E2E_ALLOW_MEDIA_WRITES !== "1") {
        row.reason = "Media generation requires explicit isolated-account write opt-in.";
      } else if (!mediaCleanupIsSupported(item.id)) {
        row.reason =
          "MaxCore does not advertise owner-scoped media storage and verified cleanup; skipped to prevent orphaned output.";
      }
    }
    const runnableCases = enabledCases.filter(
      (item) =>
        !item.media ||
        (
          process.env.MAXBOOSTER_GENERATION_E2E_ALLOW_MEDIA_WRITES === "1" &&
          mediaCleanupIsSupported(item.id)
        ),
    );

    for (const item of runnableCases) {
      const started = performance.now();
      try {
        const modality = matrix.paths.find((path) => path.id === item.id)?.modality;
        if (modality && runtimeReadiness.modalityCapabilities[modality]?.online !== true) {
          throw new GateBlocked(`MaxCore reports ${modality} generation unavailable or not ready`);
        }
        const outcome = await runCase(item.id, sourceUrl, cleanupKeys, cleanupJobs);
        const row = rows.find((entry) => entry.id === item.id);
        row.status = "PASS";
        row.durationMs = Math.round(performance.now() - started);
        row.reason = outcome;
      } catch (error) {
        const row = rows.find((entry) => entry.id === item.id);
        row.status = error instanceof GateBlocked ? "BLOCKED" : "FAIL";
        row.durationMs = Math.round(performance.now() - started);
        row.reason = safeReason(error);
      }
    }
  } catch (error) {
    const status = error instanceof GateBlocked ? "BLOCKED" : "FAIL";
    for (const row of rows.filter((item) => item.status === "BLOCKED")) {
      row.status = status;
      row.reason = safeReason(error);
    }
  } finally {
    for (const [key, caseId] of cleanupKeys) {
      try {
        const path = storagePathForKey(key, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
        const deleted = await request(
          path.delete,
          "DELETE",
          undefined,
          { csrf: true },
        );
        if (!deleted.ok) {
          const row = rows.find((item) => item.id === caseId);
          if (row?.status === "PASS") {
            row.status = "FAIL";
            row.reason = "Generated artifact cleanup did not receive an acknowledged permanent-delete response.";
          }
        } else if (path.verifyAfterDelete) {
          const verification = await request(path.get, "GET");
          if (verification.status !== 404) {
            const row = rows.find((item) => item.id === caseId);
            if (row?.status === "PASS") {
              row.status = "FAIL";
              row.reason = "Generated artifact was not absent after cleanup.";
            }
          }
        }
      } catch {
        const row = rows.find((item) => item.id === caseId);
        if (row?.status === "PASS") {
          row.status = "FAIL";
          row.reason = "Generated artifact cleanup could not be verified.";
        }
      }
    }
    for (const [jobId, job] of cleanupJobs) {
      try {
        const deleted = await request(
          `/api/${job.modality}-job/${encodeURIComponent(jobId)}`,
          "DELETE",
          undefined,
          { csrf: true },
        );
        if (!deleted.ok || deleted.data?.action === "no_op") {
          const row = rows.find((item) => item.id === job.caseId);
          if (row?.status === "PASS") {
            row.status = "FAIL";
            row.reason = "Generated job cleanup was not acknowledged.";
          }
        }
      } catch {
        const row = rows.find((item) => item.id === job.caseId);
        if (row?.status === "PASS") {
          row.status = "FAIL";
          row.reason = "Generated job cleanup could not be verified.";
        }
      }
    }
  }

  const hasFailure = rows.some((row) => row.status === "FAIL");
  const hasBlocked = rows.some((row) => row.status === "BLOCKED");
  emit(hasFailure ? 1 : hasBlocked ? 2 : 0);

  async function request(path, method, body, options = {}) {
    const headers = { Accept: "application/json", Origin: base.origin };
    if (cookie) headers.Cookie = cookie;
    if (options.csrf) headers["X-CSRF-Token"] = csrfToken;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetch(new URL(path, base), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new GateBlocked("network request to the explicitly allowed development origin failed");
    }
    const setCookies = response.headers.getSetCookie?.() || [];
    const contentType = response.headers.get("content-type") || "";
    const limit = contentType.includes("application/json")
      ? 8 * 1024 * 1024
      : 50 * 1024 * 1024;
    const bytes = await readBoundedBody(response, limit);
    let data = { binary: bytes, contentType };
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new Error("application returned invalid JSON");
      }
    }
    return { ok: response.ok, status: response.status, data, setCookies };
  }

  async function runCase(id, sourceUrl, cleanup, jobs) {
    if (id.startsWith("social-url-")) {
      const modality = id.slice("social-url-".length);
      const result = await request("/api/social/generate-from-url", "POST", {
        url: sourceUrl, platforms: ["instagram"], tone: "professional", format: modality,
      }, { csrf: true });
      assertSuccess(result, "URL-based social text");
      const items = Array.isArray(result.data.generatedContent) ? result.data.generatedContent : [];
      if (!items.some((item) => extractText(item).length >= 24)) {
        throw new Error("URL-based generation returned no substantial social text.");
      }
      if (
        typeof result.data?.metadata?.sourceProvenance !== "string" ||
        result.data.metadata.sourceProvenance.length === 0 ||
        !items.every(
          (item) =>
            typeof item.sourceProvenance === "string" &&
            typeof item.sourceUrl === "string" &&
            new URL(item.sourceUrl).href === new URL(sourceUrl).href,
        )
      ) {
        throw new Error("URL-based social output is missing verifiable source provenance.");
      }
      if (modality !== "text") {
        const copy = items.map((item) => extractText(item)).filter(Boolean).join("\n");
        const title = typeof result.data.metadata?.title === "string" ? result.data.metadata.title : "";
        const description = typeof result.data.metadata?.description === "string" ? result.data.metadata.description : "";
        const prompt = [
          `Create a ${modality} social media asset from this verified page summary and MaxCore-generated copy.`,
          `Source URL: ${sourceUrl}`,
          title ? `Source title: ${title}` : "",
          description ? `Source description: ${description}` : "",
          copy,
        ].filter(Boolean).join("\n\n");
        const mediaResponse = await request("/api/multimodal/generate", "POST", {
          input: { modality: "text", payload: prompt },
          platforms: ["instagram"],
          constraints: {
            outputModality: modality,
            styleTags: [modality],
            tone: "professional",
            duration_sec: 2,
            width: 360,
            height: 640,
          },
        }, { csrf: true });
        assertSuccess(mediaResponse, `URL-based ${modality} generation`);
        const assets = Array.isArray(mediaResponse.data?.assets) ? mediaResponse.data.assets : [];
        const asset = assets.find((item) => item?.modality === modality && typeof item.payload === "string");
        if (!asset) throw new Error(`URL workflow returned no rendered ${modality} asset.`);
        const key = storageKey(asset.payload, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
        if (key) cleanup.set(key, id);
        if (!key) throw new Error(`URL workflow ${modality} output is not a durable owner-scoped asset.`);
        const bytes = await readArtifact(asset.payload, request, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
        validateMediaBytes(modality, bytes);
        return `URL flow returned source-grounded copy and a verified durable ${modality} artifact; cleanup queued.`;
      }
      return "Real URL-based social copy returned; output payload withheld from logs.";
    }
    if (id === "social-direct-text") {
      const result = await request("/api/social/generate-content", "POST", {
        platforms: ["instagram"], topic: "An independently released instrumental single", tone: "professional",
      }, { csrf: true });
      assertSuccess(result, "manual social text");
      const assets = Array.isArray(result.data.assets) ? result.data.assets : [];
      if (!assets.some((item) => extractText(item).length >= 24)) {
        throw new Error("Manual social generation returned no substantial copy.");
      }
      return "Manual MaxCore social text returned and passed a non-empty-output check.";
    }
    if (id === "shared-text") {
      const prompt = "Write a distinct two-sentence creative description for an instrumental release called Signal Bloom.";
      const result = await request("/api/generate/text", "POST", { prompt, platform: "instagram" }, { csrf: true });
      assertSuccess(result, "shared text generation");
      const text = extractText(result.data);
      if (text.length < 24 || normalize(text) === normalize(prompt)) {
        throw new Error("Text endpoint returned empty text or echoed the prompt.");
      }
      return "Shared text endpoint returned non-empty text distinct from its prompt.";
    }
    if (id === "advertising-text") {
      const result = await request("/api/advertising/generate-content", "POST", {
        topic: "Signal Bloom instrumental release", contentType: "promotional", platform: "instagram",
        tone: "energetic", numCreatives: 1, goal: "streams",
      }, { csrf: true });
      assertSuccess(result, "advertising text generation");
      const creatives = Array.isArray(result.data.creatives) ? result.data.creatives : [];
      if (creatives.length !== 1 || !creatives.every((item) => extractText(item).length >= 24)) {
        throw new Error("Advertising endpoint did not return the requested usable creative.");
      }
      return "Advertising route returned the requested usable text creative.";
    }
    if (id.startsWith("shared-")) {
      const kind = id.slice("shared-".length);
      const requestBody = mediaRequest(kind);
      let response = await request(requestBody.path, "POST", requestBody.body, { csrf: true });
      assertSuccess(response, `${kind} generation`);
      if (["audio", "video"].includes(kind) && response.data?.job_id) {
        jobs.set(response.data.job_id, { modality: kind, caseId: id });
        const completed = await pollJob(kind, response.data.job_id, request);
        response = { ...response, data: { ...response.data, ...completed } };
      }
      const media = response.data;
      const key = storageKey(media?.url, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      if (key) cleanup.set(key, id);
      validateMediaReceipt(kind, media, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      const bytes = await readArtifact(media.url, request, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      validateMediaBytes(kind, bytes);
      return `Verified real ${kind} artifact bytes, owner-scoped durable receipt, and retrievable file; cleanup queued.`;
    }
    if (id === "advertising-image") {
      const response = await request("/api/advertising/generate-image", "POST", {
        prompt: "Signal Bloom release artwork", platform: "instagram", tone: "energetic",
        goal: "streams", style: "poster", aspect_ratio: "9:16",
      }, { csrf: true });
      assertSuccess(response, "advertising image generation");
      const mediaUrl = response.data?.url || response.data?.image_url;
      const key = storageKey(mediaUrl, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      if (key) cleanup.set(key, id);
      if (!response.data?.success || !key) {
        throw new Error("Advertising image route did not return a saved owner-scoped image.");
      }
      const artifact = await readArtifact(mediaUrl, request, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      validateMediaBytes("image", artifact);
      return "Advertising image was stored, retrieved, and decoded; cleanup queued.";
    }
    if (id === "advertising-video") {
      const response = await request("/api/advertising/generate-video", "POST", {
        topic: "Signal Bloom", platform: "instagram", template: "cinematic_promo",
        aspect_ratio: "9:16", duration: 2, tone: "energetic", goal: "growth",
        quality: "standard", voiceover: false,
      }, { csrf: true });
      assertSuccess(response, "advertising video generation");
      const mediaUrl = response.data?.url || response.data?.video_url;
      const key = storageKey(mediaUrl, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      if (key) cleanup.set(key, id);
      if (response.data?.success !== true || !key) {
        throw new Error("Advertising video route did not return a stored owner-scoped artifact.");
      }
      const artifact = await readArtifact(mediaUrl, request, process.env.MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID);
      validateMediaBytes("video", artifact);
      return "Advertising video was stored, retrieved, and decoded as a playable clip; cleanup queued.";
    }
    throw new GateBlocked("no executable scenario is registered for this path");
  }
}

function getSourceUrl() {
  const raw = process.env.MAXBOOSTER_GENERATION_E2E_SOURCE_URL || "https://example.com/";
  const source = new URL(raw);
  if (source.protocol !== "https:" || source.username || source.password ||
      ["localhost", "127.0.0.1", "::1"].includes(source.hostname) ||
      source.hostname.endsWith(".replit.app") || source.hostname.endsWith(".replit.dev")) {
    throw new GateBlocked("source URL must be a public HTTPS page outside the app's own domains");
  }
  return source.href;
}

function mediaRequest(kind) {
  if (kind === "image") return {
    path: "/api/generate/image",
    body: { platform: "instagram", prompt: "Signal Bloom release artwork", dedicated_controls: {
      headline: "Signal Bloom", width: 360, height: 640, mode: "poster", color_scheme: "dark_neon", img_format: "png",
    } },
  };
  if (kind === "audio") return {
    path: "/api/generate/audio",
    body: { platform: "instagram", prompt: "Instrumental synthesis", duration: 2,
      dedicated_controls: { duration_sec: 2, bpm: 118, key: "A minor", instrument: "piano",
        arrangement: "loop", sample_rate: 44100, mastering: "streaming" } },
  };
  return {
    path: "/api/generate-video",
    body: { idea: "Signal Bloom", platform: "instagram", dedicated_controls: {
      duration_sec: 2, width: 360, height: 640, fps: 24, headline: "Signal Bloom",
      background: "gradient", color1: "0x112233", color2: "0x445566", continuity: "single_scene",
    } },
  };
}

function validateMediaReceipt(kind, value, ownerId) {
  if (!value || (value.success !== true && value.status !== "done") ||
      !["completed", "done"].includes(value.status) ||
      value.delivery_status !== "durable" || value.validation?.artifact_validated !== true ||
      value.receipt?.durable !== true || value.receipt?.retrievable !== true ||
      value.receipt?.job_id !== value.job_id ||
      !Number.isSafeInteger(value.receipt?.size_bytes) || value.receipt.size_bytes <= 0 ||
      !/^[a-f0-9]{64}$/i.test(String(value.receipt.sha256 || ""))) {
    throw new Error(`${kind} response did not satisfy the durable artifact receipt contract.`);
  }
  const key = storageKey(value.url, ownerId);
  if (!key || value.receipt.url !== value.url) {
    throw new Error(`${kind} artifact URL is not an owner-scoped storage object.`);
  }
  if (kind !== "audio" && (!Number.isFinite(value.receipt.width) || !Number.isFinite(value.receipt.height))) {
    throw new Error(`${kind} response omitted verified dimensions.`);
  }
  if (kind !== "image" && (!Number.isFinite(value.receipt.duration) || value.receipt.duration <= 0)) {
    throw new Error(`${kind} response omitted verified duration.`);
  }
}

async function readArtifact(urlValue, request, ownerId) {
  const key = storageKey(urlValue, ownerId);
  if (!key) throw new Error("Generated artifact is not stored under the isolated test account.");
  const location = storagePathForKey(key, ownerId);
  const result = await request(location.get, "GET");
  if (!result.ok || !Buffer.isBuffer(result.data?.binary) || result.data.binary.length === 0) {
    throw new Error("Generated artifact could not be retrieved from owner storage.");
  }
  return { bytes: result.data.binary, contentType: result.data.contentType };
}

function validateMediaBytes(kind, artifact) {
  if (kind === "image") {
    const { bytes, contentType } = artifact;
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("Image response has a non-image content type.");
    }
    const probe = probeMedia("image", bytes);
    if (!probe.width || !probe.height) throw new Error("Image output has no decoded pixel dimensions.");
    const pixelCheck = decodeImagePixels(bytes);
    if (!pixelCheck) throw new Error("Image output could not be decoded or contained blank pixels.");
    return;
  }
  const result = probeMedia(kind, artifact.bytes);
  if (kind === "audio" && (result.duration <= 0 || !result.audio)) {
    throw new Error("Audio output is not a playable audio stream with positive duration.");
  }
  if (kind === "video" && (result.duration <= 0 || !result.video || result.frames < 2)) {
    throw new Error("Video output is not a playable multi-frame video.");
  }
}

function probeMedia(kind, bytes) {
  if (bytes.length > 50 * 1024 * 1024) throw new Error("Media artifact exceeds the 50 MiB verification limit.");
  const dir = join(tmpdir(), `maxbooster-generation-e2e-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(dir, { recursive: false, mode: 0o700 });
  } catch {
    throw new GateBlocked("could not create a private temporary media-verification directory");
  }
  try {
    return probeWrittenFile(dir, bytes, kind);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function probeWrittenFile(dir, bytes, kind) {
  const inputFile = join(dir, "output.bin");
  writeFileSync(inputFile, bytes, { mode: 0o600 });
  const input = spawnSync("ffprobe", [
    "-v", "error", "-count_frames", "-show_entries",
    "format=duration:stream=codec_type,width,height,nb_read_frames", "-of", "json", inputFile,
  ], { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 });
  if (input.error?.code === "ENOENT") throw new GateBlocked("ffprobe is required to verify playable media output");
  if (input.status !== 0) throw new Error("ffprobe could not decode generated media.");
  const parsed = JSON.parse(input.stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const duration = Number(parsed.format?.duration || 0);
  const audio = streams.some((stream) => stream.codec_type === "audio");
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const frames = Number(videoStream?.nb_read_frames || 0);
  const imageStream = streams.find((stream) => stream.codec_type === "video");
  const width = Number(imageStream?.width || 0);
  const height = Number(imageStream?.height || 0);
  if (kind === "audio" && audio) {
    const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", inputFile, "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"], {
      encoding: null, timeout: 15_000, maxBuffer: 16 * 1024 * 1024,
    });
    if (decoded.error?.code === "ENOENT") throw new GateBlocked("ffmpeg is required to verify non-silent audio output");
    if (decoded.status !== 0 || !decoded.stdout?.length) throw new Error("Generated audio did not decode to playable samples.");
    let peak = 0;
    for (let i = 0; i + 1 < decoded.stdout.length; i += 2) {
      peak = Math.max(peak, Math.abs(decoded.stdout.readInt16LE(i)));
    }
    if (peak < 8) throw new Error("Generated audio decoded as silence.");
  }
  return { duration, audio, video: kind === "video" && Boolean(videoStream), frames, width, height };
}

function decodeImagePixels(bytes) {
  if (bytes.length > 10 * 1024 * 1024) {
    throw new Error("Image artifact exceeds the 10 MiB pixel-verification limit.");
  }
  const dir = join(tmpdir(), `maxbooster-image-e2e-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(dir, { recursive: false, mode: 0o700 });
    const input = join(dir, "image.bin");
    writeFileSync(input, bytes, { mode: 0o600 });
    const decoded = spawnSync("ffmpeg", [
      "-v", "error", "-i", input, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ], { encoding: null, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
    if (decoded.error?.code === "ENOENT") {
      throw new GateBlocked("ffmpeg is required to verify decoded image pixels");
    }
    if (decoded.status !== 0 || !decoded.stdout || decoded.stdout.length < 3) return false;
    let min = 255;
    let max = 0;
    for (const value of decoded.stdout) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min > 2;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function storageKey(urlValue, ownerId) {
  if (typeof urlValue !== "string") return null;
  let url;
  try {
    url = new URL(urlValue, base);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) return null;
  const prefixes = [
    "/api/storage/file/",
    "/api/storage/hybrid/file/",
  ];
  const routePrefix = prefixes.find((prefix) => url.pathname.startsWith(prefix));
  if (!routePrefix) return null;
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice(routePrefix.length));
  } catch {
    return null;
  }
  if (/[\\\0%?#]/.test(key) || key.split("/").includes("..")) return null;
  const allowed = [
    `users/${ownerId}/generated/`,
    `users/${ownerId}/generated-images/`,
    `users/${ownerId}/videos/`,
  ].some((prefix) => key.startsWith(prefix));
  return allowed ? key : null;
}

function storagePathForKey(key, ownerId) {
  if (!key.startsWith(`users/${ownerId}/`)) {
    throw new Error("Refusing to access an artifact outside the isolated account.");
  }
  const encoded = encodeStorageKey(key);
  if (key.startsWith(`users/${ownerId}/videos/`)) {
    return {
      get: `/api/storage/hybrid/file/${encoded}`,
      delete: `/api/storage/hybrid/file/${encoded}`,
      verifyAfterDelete: true,
    };
  }
  if (key.startsWith(`users/${ownerId}/generated/`) ||
      key.startsWith(`users/${ownerId}/generated-images/`)) {
    return {
      get: `/api/storage/file/${encoded}`,
      delete: `/api/storage/file/${encoded}?permanent=true`,
      verifyAfterDelete: true,
    };
  }
  throw new Error("Refusing to access an unrecognized generated-artifact namespace.");
}

function extractText(value) {
  const texts = [];
  const visit = (item, depth = 0) => {
    if (depth > 5 || item == null) return;
    if (typeof item === "string") {
      if (item.trim()) texts.push(item.trim());
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    if (typeof item === "object") {
      for (const key of [
        "caption", "body", "text", "content", "payload", "output",
        "output_text", "generatedText", "generated_text", "headline",
        "hook", "cta", "response", "result",
      ]) {
        if (Object.hasOwn(item, key)) visit(item[key], depth + 1);
      }
    }
  };
  visit(value);
  return texts.join("\n");
}

function assertSuccess(response, operation) {
  if (response.ok) {
    if (response.data?.success === false) {
      throw new Error(`${operation} returned success=false.`);
    }
    return;
  }
  const status = response.status;
  const rawCode = typeof response.data?.code === "string" ? response.data.code : "";
  const code = /^[A-Z0-9_-]{1,64}$/.test(rawCode) ? rawCode : "";
  if ([401, 403, 429, 502, 503, 504].includes(status) ||
      /UNAVAILABLE|NOT_READY|READINESS/i.test(code)) {
    throw new GateBlocked(`${operation} is externally unavailable (HTTP ${status}${code ? `, ${code}` : ""}).`);
  }
  throw new Error(`${operation} failed with HTTP ${status}${code ? `, ${code}` : ""}.`);
}

async function pollJob(kind, jobId, request) {
  const path = `/api/${kind}-job/${encodeURIComponent(jobId)}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const response = await request(path, "GET");
    assertSuccess(response, `${kind} job status`);
    const status = String(response.data?.status || "").toLowerCase();
    if (["done", "completed"].includes(status)) return response.data;
    if (["error", "failed", "cancelled", "canceled"].includes(status)) {
      throw new Error(`${kind} generation job ended in ${status}.`);
    }
    if (!["queued", "pending", "processing", "rendering", "running", "coalesced", "starting"].includes(status)) {
      throw new Error(`${kind} job returned an unrecognized status.`);
    }
  }
  throw new Error(`${kind} job did not complete within the bounded 120-second gate.`);
}

function encodeStorageKey(key) {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function readBoundedBody(response, limit) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("application response exceeded the generation gate size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function mergeCookies(current, setCookies) {
  const values = new Map(
    current.split(/;\s*/).filter(Boolean).map((entry) => {
      const index = entry.indexOf("=");
      return [index < 0 ? entry : entry.slice(0, index), entry];
    }),
  );
  for (const cookie of setCookies) {
    const pair = cookie.split(";", 1)[0];
    const index = pair.indexOf("=");
    if (index > 0) values.set(pair.slice(0, index), pair);
  }
  return [...values.values()].join("; ");
}

function normalize(text) {
  return String(text).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function safeReason(error) {
  if (error instanceof GateBlocked) return error.message;
  if (error instanceof Error) return error.message.slice(0, 240);
  return "Generation gate failed with an unclassified error.";
}


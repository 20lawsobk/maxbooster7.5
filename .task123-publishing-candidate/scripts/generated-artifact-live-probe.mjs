#!/usr/bin/env node
/**
 * Run manually AFTER the parent restarts the application.
 * Uses only ordinary login/CSRF and existing account permissions. Generated
 * artifacts remain in the account; nothing is deleted. No reports, cookies,
 * credentials, response bodies, identities, or media URLs are written to disk
 * or printed. Authentication material exists only in this process's memory.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const TOTAL_MS = 300_000;
const MAX_BODY = 8 * 1024 * 1024;
const started = Date.now();
let stage = "configuration";
const cookies = new Map();
let csrf;
let owner;
const completed = [];
const modality = process.argv[2] || "all";
const safeValidationDetails = new Set([
  "Platform label cannot fit without clipping",
  "Artist label cannot fit without clipping",
  "Headline cannot fit within the image without clipping",
  "Headline cannot fit above divider without clipping",
  "Style label cannot fit without clipping",
  "dedicated_controls must be an object",
  "Decoded image dimensions differ from request",
]);

class ProbeFailure extends Error {
  constructor(code, status, diagnostic) {
    super(code);
    this.code = code;
    this.status = status;
    this.diagnostic = diagnostic;
  }
}
function check(condition, code) {
  if (!condition) throw new ProbeFailure(code);
}
function failReport(error) {
  // Never emit exception messages, URLs, response bodies or stack traces:
  // dependencies and server errors may contain account IDs or credentials.
  console.error(JSON.stringify({
    ok: false, stage,
    error: error instanceof ProbeFailure ? error.code : "UNEXPECTED_PROBE_FAILURE",
    ...(error instanceof ProbeFailure && error.status ? { http_status: error.status } : {}),
    ...(error instanceof ProbeFailure && error.diagnostic ? { validation_detail: error.diagnostic } : {}),
    completed: completed.map(item => item.kind),
  }));
}
const hardDeadline = setTimeout(() => {
  failReport(new ProbeFailure("TOTAL_DEADLINE_EXCEEDED"));
  process.exit(1);
}, TOTAL_MS);

let origin;
async function request(path, { method = "GET", body, anonymous = false } = {}) {
  const url = new URL(path, origin);
  check(url.origin === origin.origin && !url.username && !url.password, "UNTRUSTED_RESPONSE_URL");
  const remaining = TOTAL_MS - (Date.now() - started);
  check(remaining > 0, "TOTAL_DEADLINE_EXCEEDED");
  const headers = { Accept: "application/json, audio/wav, image/png", "Cache-Control": "no-store" };
  if (!anonymous) {
    headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (method !== "GET" && csrf) headers["x-csrf-token"] = csrf;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(url, {
      method, headers, redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, Math.min(120_000, remaining))),
    });
  } catch {
    throw new ProbeFailure("REQUEST_NETWORK_OR_TIMEOUT_FAILURE");
  }
  if (!anonymous) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const equal = pair.indexOf("=");
      if (equal > 0) cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
    }
  }
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BODY) {
          await reader.cancel();
          throw new ProbeFailure("RESPONSE_SIZE_LIMIT_EXCEEDED", response.status);
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error instanceof ProbeFailure) throw error;
      throw new ProbeFailure("RESPONSE_BODY_NETWORK_OR_TIMEOUT_FAILURE", response.status);
    }
  }
  return { status: response.status, bytes: Buffer.concat(chunks), headers: response.headers };
}
function json(response) {
  if (response.status < 200 || response.status >= 300) {
    let diagnostic;
    if (response.status === 422) {
      try {
        const body = JSON.parse(response.bytes.toString("utf8"));
        if (safeValidationDetails.has(body.detail)) diagnostic = body.detail;
        else if (Array.isArray(body.detail)) {
          const allowedFields = new Set(["body", "req", "dedicated_controls", "prompt", "text",
            "width", "height", "mode", "headline", "img_format", "color_scheme", "seed"]);
          diagnostic = body.detail.map(error => ({
            fields: (Array.isArray(error.loc) ? error.loc : []).filter(field => allowedFields.has(field)),
            type: ["missing", "extra_forbidden", "string_type", "int_type", "dict_type",
              "value_error", "literal_error"].includes(error.type) ? error.type : "schema_validation",
          }));
        }
      } catch { /* Do not log arbitrary upstream detail, input, or context. */ }
    }
    throw new ProbeFailure("HTTP_REQUEST_REJECTED", response.status, diagnostic);
  }
  try { return JSON.parse(response.bytes.toString("utf8")); }
  catch { throw new ProbeFailure("EXPECTED_JSON_RESPONSE", response.status); }
}
async function csrfBootstrap() {
  const value = json(await request("/api/csrf-token"));
  check(typeof value.csrfToken === "string" && value.csrfToken.length > 0 &&
    cookies.get("csrf-token") === value.csrfToken, "CSRF_COOKIE_BINDING_FAILED");
  csrf = value.csrfToken;
}

function decode(bytes, kind) {
  const remaining = TOTAL_MS - (Date.now() - started);
  check(remaining > 0, "TOTAL_DEADLINE_EXCEEDED");
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-xerror", "-i", "pipe:0",
    "-map", kind === "audio" ? "0:a:0" : "0:v:0", "-f", "null", "-",
  ], { input: bytes, timeout: Math.min(15_000, remaining), maxBuffer: 1024 * 1024 });
  check(!result.error && result.status === 0, "RETRIEVED_MEDIA_DECODE_FAILED");
}
function wavMetadata(bytes) {
  check(bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE", "RETRIEVED_BYTES_NOT_WAV");
  check(bytes.readUInt32LE(4) + 8 === bytes.length, "WAV_CONTAINER_SIZE_MISMATCH");
  let format;
  let dataSize;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    check(offset + 8 + length <= bytes.length, "WAV_TRUNCATED_CHUNK");
    if (name === "fmt ") {
      check(length >= 16, "WAV_INVALID_FORMAT_CHUNK");
      format = { encoding: bytes.readUInt16LE(offset + 8), channels: bytes.readUInt16LE(offset + 10),
        rate: bytes.readUInt32LE(offset + 12), block: bytes.readUInt16LE(offset + 20),
        bits: bytes.readUInt16LE(offset + 22) };
    }
    if (name === "data") dataSize = length;
    offset += 8 + length + (length % 2);
  }
  check(format?.encoding === 1 && format.channels === 2 && format.rate === 8000 &&
    format.bits === 16 && format.block === 4 && dataSize === 3200, "WAV_CONTROLS_MISMATCH");
  return { duration: dataSize / format.block / format.rate, sample_rate: format.rate };
}

function videoMetadata(bytes) {
  const remaining = TOTAL_MS - (Date.now() - started);
  check(remaining > 0, "TOTAL_DEADLINE_EXCEEDED");
  const result = spawnSync("ffprobe", ["-v", "error", "-count_frames",
    "-select_streams", "v:0", "-show_entries",
    "stream=width,height,nb_read_frames,avg_frame_rate,duration", "-of", "json", "pipe:0"],
  { input: bytes, timeout: Math.min(15_000, remaining), maxBuffer: 1024 * 1024 });
  check(!result.error && result.status === 0, "RETRIEVED_VIDEO_PROBE_FAILED");
  let stream;
  try { stream = JSON.parse(result.stdout.toString("utf8")).streams?.[0]; }
  catch { throw new ProbeFailure("RETRIEVED_VIDEO_METADATA_INVALID"); }
  check(stream && typeof stream.avg_frame_rate === "string", "RETRIEVED_VIDEO_STREAM_MISSING");
  const [numerator, denominator] = stream.avg_frame_rate.split("/").map(Number);
  const actual = { width: stream.width, height: stream.height,
    frames: Number(stream.nb_read_frames), fps: numerator / denominator,
    duration: Number(stream.duration) };
  check(actual.width === 64 && actual.height === 64 && actual.frames === 1 &&
    actual.fps === 8 && Math.abs(actual.duration - 0.125) < 0.000001,
  "VIDEO_CONTROLS_MISMATCH");
  return actual;
}

async function probe(kind, controls) {
  stage = `${kind}.generate`;
  // Never retry submission: a lost acknowledgement may already have created media.
  let result = json(await request(`/api/generate/${kind}`, {
    method: "POST", body: { text: "Lifecycle probe", prompt: "Lifecycle probe",
      dedicated_controls: controls },
  }));
  if (!["done", "completed"].includes(result.status)) {
    check(["audio", "video"].includes(kind) && typeof result.job_id === "string" &&
      /^[A-Za-z0-9_-]+$/.test(result.job_id), "UNEXPECTED_GENERATION_RESPONSE");
    stage = `${kind}.poll`;
    const jobId = result.job_id;
    for (let attempts = 0; attempts < 60; attempts++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = json(await request(`/api/${kind}-job/${encodeURIComponent(jobId)}`));
      check(!["error", "failed", "cancelled", "not_found"].includes(result.status), "GENERATION_TERMINAL_FAILURE");
      if (["done", "completed"].includes(result.status)) break;
    }
  }
  stage = `${kind}.receipt`;
  check(["done", "completed"].includes(result.status), "GENERATION_POLL_BUDGET_EXCEEDED");
  const receipt = result.receipt ?? result.result?.receipt ?? result.result;
  check(receipt && receipt.durable === true && receipt.retrievable === true, "DURABLE_RECEIPT_MISSING");
  check(receipt.owner_id === owner && receipt.job_id === result.job_id, "RECEIPT_OWNERSHIP_OR_JOB_MISMATCH");
  check(typeof receipt.url === "string" && receipt.url.startsWith("/api/storage/file/") &&
    typeof receipt.storage_key === "string" && receipt.storage_key.startsWith(`users/${owner}/`),
  "RECEIPT_STORAGE_SCOPE_INVALID");
  check(receipt.kind === kind && /^[a-f0-9]{64}$/.test(receipt.sha256) &&
    Number.isSafeInteger(receipt.size_bytes) && receipt.size_bytes > 32, "RECEIPT_METADATA_INVALID");
  const capability = receipt.capability;
  check(capability?.trained === false && capability.renderer === (
    kind === "audio" ? "digital-gpu-parametric-synth" :
      kind === "image" ? "pil-typographic-poster-v1" : "pil-ffmpeg-procedural"),
  "RECEIPT_RENDERER_PROVENANCE_MISSING");
  if (result.validation) {
    check(result.validation.artifact_validated === true &&
      result.validation.quality === "not_evaluated", "QUALITY_OR_VALIDATION_METADATA_INVALID");
  }
  stage = `${kind}.authenticated-retrieval`;
  const response = await request(receipt.url);
  if (response.status !== 200) {
    throw new ProbeFailure("AUTHORIZED_ARTIFACT_RETRIEVAL_REJECTED", response.status);
  }
  const bytes = response.bytes;
  const digest = createHash("sha256").update(bytes).digest("hex");
  check(bytes.length === receipt.size_bytes && digest === receipt.sha256, "RETRIEVED_DIGEST_OR_SIZE_MISMATCH");
  stage = `${kind}.decode`;
  decode(bytes, kind);
  let actual;
  if (kind === "audio") {
    actual = wavMetadata(bytes);
    check(Math.abs(receipt.duration - actual.duration) < 0.000001 &&
      receipt.sample_rate === actual.sample_rate, "RECEIPT_ACTUAL_DURATION_OR_RATE_MISMATCH");
  } else if (kind === "image") {
    check(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString("ascii", 12, 16) === "IHDR", "RETRIEVED_BYTES_NOT_PNG");
    actual = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    check(actual.width === 64 && actual.height === 64 &&
      receipt.width === actual.width && receipt.height === actual.height, "POSTER_DIMENSIONS_MISMATCH");
  } else {
    actual = videoMetadata(bytes);
    check(receipt.width === actual.width && receipt.height === actual.height &&
      Math.abs(receipt.duration - actual.duration) < 0.000001, "RECEIPT_ACTUAL_VIDEO_METADATA_MISMATCH");
  }
  stage = `${kind}.anonymous-rejection`;
  const anonymous = await request(receipt.url, { anonymous: true });
  if (![401, 403, 404].includes(anonymous.status)) {
    throw new ProbeFailure("ANONYMOUS_RETRIEVAL_NOT_REJECTED", anonymous.status);
  }
  completed.push({ kind, bytes: bytes.length, sha256: digest, ...actual,
    durable: true, retrievable: true, anonymous_rejected: true, trained: false });
  console.log(JSON.stringify({ ok: true, stage: `${kind}.complete`, ...completed.at(-1) }));
}

try {
  check(["audio", "image", "video", "all"].includes(modality), "MODALITY_MUST_BE_AUDIO_IMAGE_VIDEO_OR_ALL");
  check(process.env.E2E_USERNAME && process.env.E2E_PASSWORD, "E2E_LOGIN_CREDENTIALS_REQUIRED");
  const domain = process.env.REPLIT_DEV_DOMAIN;
  origin = new URL(domain ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : `http://127.0.0.1:${process.env.PORT || "5000"}`);
  check(!origin.username && !origin.password && origin.pathname === "/", "INVALID_PROBE_ORIGIN");
  stage = "preflight.decoder";
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { timeout: 5000, maxBuffer: 65536 });
  check(!ffmpeg.error && ffmpeg.status === 0, "FFMPEG_REQUIRED");
  stage = "auth.csrf-bootstrap";
  await csrfBootstrap();
  stage = "auth.login";
  json(await request("/api/auth/login", { method: "POST",
    body: { username: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD } }));
  stage = "auth.session";
  const me = json(await request("/api/auth/me"));
  owner = me?.id ?? me?.user?.id;
  check(typeof owner === "string" && owner.length > 0, "AUTHENTICATED_SESSION_REQUIRED");
  stage = "auth.csrf-refresh";
  await csrfBootstrap();
  if (["audio", "all"].includes(modality)) await probe("audio", { duration_sec: 0.1, sample_rate: 8000, bpm: 120,
    key: "C minor", instrument: "piano", arrangement: "loop" });
  if (["image", "all"].includes(modality)) await probe("image", { width: 64, height: 64, headline: "", mode: "poster",
    img_format: "png", color_scheme: "dark_neon", seed: 17 });
  if (["video", "all"].includes(modality)) await probe("video", {
    duration_sec: 0.125, width: 64, height: 64, fps: 8, headline: "",
    background: "gradient", continuity: "single_scene",
  });
  console.log(JSON.stringify({ ok: true, stage: "complete", artifacts_created: completed.length,
    artifacts_deleted: 0, elapsed_ms: Date.now() - started }));
} catch (error) {
  failReport(error);
  process.exitCode = 1;
} finally {
  clearTimeout(hardDeadline);
  cookies.clear();
  csrf = undefined;
  owner = undefined;
}
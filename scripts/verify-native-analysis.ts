/**
 * Non-production round-trip checks through MaxCore's actual Node/Python bridge.
 * Uses synthetic media inputs, not fabricated analyzer responses. No user data,
 * publishing, billing, or training is modified. Uploaded scratch expires in 1h.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  getMaxcoreGenerationHeaders,
  getMaxcoreOrigin,
} from "../server/services/maxcoreConnector.js";

const origin = getMaxcoreOrigin();
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
  "Verification is restricted to the local MaxCore subsystem");
const actor = `native-analysis-check-${randomUUID()}`;
const headers = { ...getMaxcoreGenerationHeaders(), "X-MaxCore-User-Id": actor };
const scratch = await mkdtemp(join(tmpdir(), "native-analysis-check-"));
const uploaded: string[] = [];
let passed = 0;

async function request(path: string, body: unknown, extra = {}) {
  return fetch(`${origin}/api/analysis/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", ...extra },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
    redirect: "manual",
  });
}

async function analyze(kind: string, body: unknown) {
  const response = await request(kind, body);
  assert.equal(response.status, 200, `${kind} HTTP status`);
  const result = await response.json();
  assert.equal(result.schema_version, 1);
  assert.equal(result.source, "maxcore_native_analysis");
  assert.equal(result.kind, kind);
  assert.equal(typeof result.method, "string");
  assert(Array.isArray(result.limitations));
  return result.analysis;
}

async function upload(kind: string, file: string, mime: string) {
  const response = await fetch(`${origin}/api/analysis/upload?kind=${kind}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": mime },
    body: await readFile(file),
    signal: AbortSignal.timeout(90_000),
    redirect: "manual",
  });
  assert.equal(response.status, 200, `${kind} upload HTTP status`);
  const result = await response.json();
  const owner = createHash("sha256").update(actor).digest("hex");
  assert(new RegExp(`^/uploads/analysis-inputs/${owner}/[a-f0-9]+\\.[a-z0-9]+$`).test(result.url));
  uploaded.push(result.url);
  return result.url as string;
}

function check(name: string) {
  passed++;
  console.log(`PASS ${name}`);
}

try {
  if (!process.argv.includes("--audio-only")) {
  const anonymous = await fetch(`${origin}/api/analysis/text`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Untrusted request", user_id: actor }),
    signal: AbortSignal.timeout(15_000),
  });
  assert([401, 403].includes(anonymous.status));
  check("unauthenticated requests rejected");
  const missingActor = await request("text", { text: "Missing actor" }, { "X-MaxCore-User-Id": "" });
  assert.equal(missingActor.status, 401);
  check("trusted actor required");

  const text = await analyze("text", { text: "Music brings people together." });
  assert.equal(text.counts.words, 4);
  check("real text counts");

  const red = join(scratch, "red.png");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x48",
    "-frames:v", "1", "-threads", "1", red], { timeout: 20_000, stdio: "pipe" });
  const imageUrl = await upload("image", red, "image/png");
  const image = await analyze("image", { url: imageUrl });
  assert.equal(image.dimensions.display_width_px, 64);
  assert.equal(image.dimensions.display_height_px, 48);
  assert(image.color.mean_rgb_8bit[0] > 240);
  assert(image.color.mean_rgb_8bit[1] < 10);
  check("real image dimensions and red pixel measurements");
  const foreign = await request("image", { url: imageUrl }, { "X-MaxCore-User-Id": `${actor}-other` });
  assert.equal(foreign.status, 400);
  check("cross-owner media denied");
  const staticRead = await fetch(`${origin}${imageUrl}`, { signal: AbortSignal.timeout(15_000) });
  assert.notEqual(staticRead.headers.get("content-type")?.split(";")[0], "image/png");
  check("analysis scratch is not publicly served");

  const videoFile = join(scratch, "video.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x120:r=4:d=2",
    "-c:v", "mpeg4", "-threads", "1", "-an", videoFile], { timeout: 20_000, stdio: "pipe" });
  const videoUrl = await upload("video", videoFile, "video/mp4");
  const video = await analyze("video", { url: videoUrl });
  assert(Math.abs(video.duration_seconds - 2) < 0.1);
  assert(video.frames.length >= 2 && video.frames.length <= 8);
  check("real video duration and sampled frames");

  const blocked = await request("website", { url: "http://127.0.0.1:5000/api/ready" });
  assert.equal(blocked.status, 400);
  check("private-network website requests denied");
  const website = await analyze("website", { url: "https://example.com" });
  assert.equal(website.document.title, "Example Domain");
  check("live website HTML fetched and analyzed");
  }

  const audioFile = join(scratch, "tone.wav");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
    "sine=frequency=440:sample_rate=22050:duration=2", "-c:a", "pcm_s16le", audioFile],
    { timeout: 20_000, stdio: "pipe" });
  const audioUpload = await fetch(`${origin}/api/audio/upload`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "audio/wav" },
    body: await readFile(audioFile),
    signal: AbortSignal.timeout(90_000),
    redirect: "manual",
  });
  assert.equal(audioUpload.status, 200, "owned audio upload HTTP status");
  const audioAsset = await audioUpload.json();
  const ownerHash = createHash("sha256").update(actor).digest("hex");
  assert(new RegExp(`^/uploads/audio-inputs/${ownerHash}/[a-f0-9]+\\.wav$`).test(audioAsset.url));
  uploaded.push(audioAsset.url);
  const audioResponse = await fetch(`${origin}/api/audio/analyze`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: audioAsset.url, user_id: actor }),
    signal: AbortSignal.timeout(90_000),
    redirect: "manual",
  });
  assert.equal(audioResponse.status, 200, "owned audio analysis HTTP status");
  const audio = await audioResponse.json();
  assert.equal(audio.source, "maxcore_audio_conductor");
  assert(Math.abs(audio.duration - 2) < 0.1, "real audio duration");
  check("owned audio upload and real conductor analysis");
  console.log(`Verified ${passed} live checks through the MaxCore bridge.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
  // Delete only this run's rigorously owner-validated scratch files.
  const root = resolve("external/maxcore/artifacts/ai-training-server/uploads");
  for (const url of uploaded) {
    await unlink(join(root, url.slice("/uploads/".length))).catch(() => {});
  }
}
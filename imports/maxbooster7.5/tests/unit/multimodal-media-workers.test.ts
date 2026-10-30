import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AIUnavailableError } from "../../server/lib/aiSource.js";
import { isAllowedMaxcoreMediaPath } from "../../server/services/maxcoreConnector.js";
import { validateGeneratedArtifact } from "../../server/services/generatedArtifactValidation.js";
import { maxcoreAudioBytes, maxcoreAudioSource, resolveMaxCoreAudioJob } from "../../server/services/maxcoreAudioJob.js";
import { validateStepAssets } from "../../server/services/multimodalGenerationContract.js";
import { getRules } from "../../shared/config/platformRules.js";

// Execute the real worker bodies without starting unrelated database/provider
// services imported by the complete application module. Only their IO ports
// are fixtures; URL checks, result mapping, codec validation and job resolution
// below use the production functions.
const source = readFileSync("server/services/multimodalGenerationService.ts", "utf8");
const parsed = ts.createSourceFile("multimodalGenerationService.ts", source,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = new Set(["absolutizeMaxCoreUrl", "isMaxCoreOrigin", "mirrorRemoteAssetLocally", "sniffContentType"]);
const variables = new Set(["MEDIA_MAGIC", "imageWorker", "audioWorker"]);
const selected = parsed.statements.filter(node =>
  ts.isFunctionDeclaration(node) && node.name && functions.has(node.name.text) ||
  ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && variables.has(d.name.text)));
const workerCode = ts.transpileModule(selected.map(node => node.getText(parsed)).join("\n") +
  "\nglobalThis.proof = { imageWorker, audioWorker, mirrorRemoteAssetLocally };", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

let origin: string, server: Server, png: Buffer;
const httpRequests: Array<{ path: string; owner?: string; authorization?: string }> = [];
beforeAll(async () => {
  const pixels = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 73 + (i >> 3)) % 256));
  png = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  server = createServer((req, res) => {
    httpRequests.push({ path: req.url!, owner: String(req.headers["x-maxcore-user-id"]),
      authorization: req.headers.authorization });
    if (req.headers.authorization !== "Bearer fixture-private-channel") { res.writeHead(401); res.end(); return; }
    if (req.url === "/uploads/images/redirect.png") {
      res.writeHead(302, { location: "http://example.invalid/private" }); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(req.url === "/uploads/images/truncated.png" ? png.subarray(0, 140) : png);
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

function fixture(response: unknown, polled?: unknown) {
  const send = vi.fn().mockResolvedValue(response);
  const poll = vi.fn().mockResolvedValue(polled);
  const upload = vi.fn(async (_bytes: Buffer, owner: string, _kind: string, name: string) => `users/${owner}/generated/${name}`);
  const decode = vi.fn(validateGeneratedArtifact);
  const context = vm.createContext({ Buffer, URL, AbortSignal, randomUUID, path,
    AIUnavailableError, getRules, fetch, isAllowedMaxcoreMediaPath,
    _MAXCORE_BASE: origin, MAXCORE_KEY: "fixture-private-channel", maxcorePost: send,
    safeErrorType: (e: unknown) => e instanceof Error ? e.name : typeof e,
    logger: { warn: vi.fn(), info: vi.fn() },
    validateGeneratedArtifact: decode,
    maxcoreAudioBytes, maxcoreAudioSource,
    resolveMaxCoreAudioJob: (job: Parameters<typeof resolveMaxCoreAudioJob>[0], owner: string, options: object) =>
      resolveMaxCoreAudioJob(job, owner, { ...options, poll }),
    storageService: { uploadGeneratedFile: upload,
      getDownloadUrl: async (key: string) => `/api/storage/file/${encodeURIComponent(key)}` },
  });
  vm.runInContext(workerCode, context);
  return { ...context.proof, send, poll, upload, decode };
}
const request = (platforms = ["instagram"]) => ({ id: "fixture-request", userId: "owner",
  input: { modality: "text", payload: "  Exact release direction\nPreserve the title  " }, platforms,
  direction: { preserve: "headline" }, awareness: { caller: "context" }, constraints: { outputModality: "image" } });
const imageStep = (platforms = ["instagram"]) => ({ id: "step_image", type: "generate", worker: "image",
  params: { slots: platforms.map(platform => ({ id: `${platform}_image`, platform, purpose: "Cover" })) } });
const audioStep = { id: "step_audio", type: "generate", worker: "audio",
  params: { platform: "instagram", slotId: "instagram_audio" } };
const owned = (name: string, owner = "owner") => `/api/storage/file/${encodeURIComponent(`users/${owner}/generated/${name}`)}`;

describe("actual multimodal image worker contract", () => {
  it("maps Python's slot alias across a real multi-platform batch without losing caller direction", async () => {
    const f = fixture({ outputs: [
      { slot: "instagram_image", platform: "instagram", url: owned("square.png") },
      { slot: "youtube_image", platform: "youtube", url: owned("wide.png") },
    ] });
    const step = imageStep(["instagram", "youtube"]), req = request(["instagram", "youtube"]);
    const assets = await f.imageWorker.run(step, { normalized: { semantic: { topic: "Verified topic" } } }, req);
    expect(validateStepAssets(step as never, assets)).toHaveLength(2);
    expect(assets.map((a: { slotId: string }) => a.slotId)).toEqual(["instagram_image", "youtube_image"]);
    expect(f.send).toHaveBeenCalledWith("/generate/image", expect.objectContaining({
      prompt: "Verified topic", instruction: req.input.payload, direction: req.direction,
      slots: expect.arrayContaining([expect.objectContaining({ id: "youtube_image", platform: "youtube" })]),
    }), 90_000, "owner");
  });
  it("accepts one canonical durable result only for one requested slot and preserves validation metadata", async () => {
    const f = fixture({ url: owned("poster.png"), capability: { trained: false },
      validation: { artifact_validated: true } });
    const assets = await f.imageWorker.run(imageStep(), { normalized: {} }, request());
    expect(validateStepAssets(imageStep() as never, assets)).toHaveLength(1);
    expect(assets[0]).toMatchObject({ payload: owned("poster.png"), slotId: "instagram_image",
      metadata: { capability: { trained: false }, validation: { artifact_validated: true } } });
    const batch = fixture({ url: owned("one.png") });
    await expect(batch.imageWorker.run(imageStep(["instagram", "youtube"]), {}, request(["instagram", "youtube"])))
      .rejects.toBeInstanceOf(AIUnavailableError);
  });
  it.each([
    { outputs: [{ url: "asset://image/specification", slot: "instagram_image" }] },
    { url: owned("foreign.png", "another-owner") },
    { kind: "specification", url: owned("claimed.png") },
    { outputs: [{ slot: "instagram_image", url: null }] },
  ])("rejects specifications, foreign ownership and absent rendered bytes: %j", async response => {
    const f = fixture(response);
    await expect(f.imageWorker.run(imageStep(), {}, request())).rejects.toBeInstanceOf(AIUnavailableError);
    expect(f.upload).not.toHaveBeenCalled();
  });
});

describe("actual generated media mirroring", () => {
  it("fetches with private owner auth, fully decodes bytes and persists only the validated artifact", async () => {
    const f = fixture({}); httpRequests.length = 0;
    const result = await f.mirrorRemoteAssetLocally("/uploads/images/render.png", "images", "owner");
    expect(result).toMatch(/^\/api\/storage\/file\/users%2Fowner%2F/);
    expect(httpRequests).toEqual([{ path: "/uploads/images/render.png", owner: "owner",
      authorization: "Bearer fixture-private-channel" }]);
    expect(f.decode).toHaveBeenCalledWith(png, "image");
    expect(f.upload).toHaveBeenCalledWith(png, "owner", "generated-images", "mc_render.png", "image/png");
  });
  it.each(["asset://image/specification", "https://example.invalid/output.png", "/api/admin/status"])(
    "does not fetch or persist an untrusted/specification URL (%s)", async url => {
      const f = fixture({}); httpRequests.length = 0;
      await expect(f.mirrorRemoteAssetLocally(url, "images", "owner")).rejects.toBeInstanceOf(AIUnavailableError);
      expect(httpRequests).toHaveLength(0); expect(f.upload).not.toHaveBeenCalled();
    });
  it.each(["redirect.png", "truncated.png"])("rejects %s before persistence", async filename => {
    const f = fixture({});
    await expect(f.mirrorRemoteAssetLocally(`/uploads/images/${filename}`, "images", "owner"))
      .rejects.toBeInstanceOf(AIUnavailableError);
    expect(f.upload).not.toHaveBeenCalled();
  });
});

describe("actual multimodal audio worker contract", () => {
  it("accepts synchronous canonical URLs and preserves the explicit prompt/instruction", async () => {
    const f = fixture({ status: "completed", url: owned("audio.wav") });
    const req = request();
    const assets = await f.audioWorker.run(audioStep, { normalized: { semantic: { genre: "house" } } }, req);
    expect(validateStepAssets(audioStep as never, assets)).toHaveLength(1);
    expect(assets[0].payload).toBe(owned("audio.wav"));
    expect(f.send).toHaveBeenCalledWith("/generate/audio", expect.objectContaining({
      platform: "instagram", prompt: req.input.payload, instruction: req.input.payload, genre: "house",
    }), 90_000, "owner");
    expect(f.poll).not.toHaveBeenCalled();
  });
  it("resolves asynchronous nested completion through strict owner-bound polling", async () => {
    const f = fixture({ status: "processing", job_id: "job-1" }, {
      status: "completed", result: { url: owned("completed.wav") },
    });
    const assets = await f.audioWorker.run(audioStep, {}, request());
    expect(assets[0].payload).toBe(owned("completed.wav"));
    expect(f.poll).toHaveBeenCalledWith("/api/audio-job/job-1", "owner", expect.any(Number), true);
  });
  it.each(["failed", "cancelled", "canceled", "timed_out", "expired"])(
    "rejects a %s result even when it contains a stale URL", async status => {
      const f = fixture({ status, url: owned("stale.wav") });
      await expect(f.audioWorker.run(audioStep, {}, request())).rejects.toBeInstanceOf(AIUnavailableError);
      expect(f.upload).not.toHaveBeenCalled();
    });
});

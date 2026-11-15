import express from "express";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), persist: vi.fn() }));
vi.mock("../../server/services/maxcoreClient.js", () => ({ MaxCoreAIClient: { generate: mocks.generate } }));
vi.mock("../../server/services/aiAudioGeneratorService.js", () => ({ generateFromText: vi.fn(),
  generateFromReference: vi.fn(), persistMaxCoreAudio: mocks.persist }));
vi.mock("../../server/middleware/auth.js", () => ({ requireAuth: (req: express.Request, _res: express.Response, next: () => void) => {
  req.user = { id: "session-owner" } as Express.User; next();
} }));
vi.mock("../../server/middleware/rateLimiter.js", () => ({ aiRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../../server/middleware/uploadHandler.js", () => ({ createHardenedUpload: () => ({ single: () => (_req: unknown, _res: unknown, next: () => void) => next() }) }));
vi.mock("../../server/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../server/db.js", () => ({ db: {} }));
import router from "../../server/routes/studioGeneration.js";
import { MaxCoreControlError } from "../../server/services/maxcoreControlTransport.js";

async function request(body: unknown) {
  const app = express(); app.use(express.json()); app.use("/api/studio/generation", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/studio/generation/text`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
beforeEach(() => { vi.clearAllMocks(); });
describe("Studio text-to-audio HTTP contract", () => {
  it("forwards the creative instruction and exact BPM to the actual Python field names", async () => {
    mocks.generate.mockResolvedValue({ job_id: "audio-1", status: "processing" });
    const result = await request({ text: "A calm bass melody", tempo: 136, duration: 4 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ jobId: "audio-1", pollUrl: "/api/audio-job/audio-1" });
    expect(mocks.generate).toHaveBeenCalledWith("/api/generate/audio", expect.objectContaining({
      prompt: "A calm bass melody at 136bpm", instruction: "A calm bass melody at 136bpm", bpm: 136,
    }), "session-owner");
    expect(mocks.generate.mock.calls[0][1]).not.toHaveProperty("tempo");
  });
  it("accepts a completed top-level url and persists it for the session owner instead of falsely polling", async () => {
    mocks.generate.mockResolvedValue({ job_id: "audio-1", status: "completed", url: "/uploads/audio-1.wav" });
    mocks.persist.mockResolvedValue("/api/storage/file/users%2Fsession-owner%2Faudio.wav");
    const result = await request({ text: "music" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "completed", audioUrl: "/api/storage/file/users%2Fsession-owner%2Faudio.wav" });
    expect(mocks.persist).toHaveBeenCalledWith("/uploads/audio-1.wav", null, {}, "session-owner");
  });
  it("keeps dependency failures503 and redacts upstream details", async () => {
    mocks.generate.mockRejectedValue(new MaxCoreControlError("private upstream detail", 503));
    const result = await request({ text: "music" });
    expect(result.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("private upstream detail");
  });
});

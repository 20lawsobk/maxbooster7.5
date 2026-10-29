import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createVideoJobPollHandler,
  createMusicVideoJobPollHandler,
  rejectInvalidMusicVideoSceneRequest,
} from "../../server/routes/socialMediaJobHandlers.js";
import type { SocialMediaJobRepository } from "../../server/services/socialMediaJobRepository.js";

function request(userId?: string, jobId = "job-1"): Request {
  return { user: userId ? { id: userId } : undefined, params: { jobId } } as unknown as Request;
}
function response() {
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
  return res;
}
function repository(get: (...args: string[]) => Promise<unknown>) {
  return { get: vi.fn(get) } as unknown as SocialMediaJobRepository;
}

describe("SQL media-job polling ownership and failure boundaries", () => {
  it("rejects unauthenticated video polling without touching the repository", async () => {
    const db = repository(async () => { throw new Error("must not query"); });
    const res = response();
    await createVideoJobPollHandler(db)(request(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
    expect(db.get).not.toHaveBeenCalled();
  });

  it("does not disclose a missing or foreign video job", async () => {
    const db = repository(async () => undefined);
    const res = response();
    await createVideoJobPollHandler(db)(request("account-b", "private-job"), res as unknown as Response);
    expect(db.get).toHaveBeenCalledWith("video", "private-job", "account-b");
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.payload)).not.toContain("account-a");
  });

  it("returns only a validated completed video URL", async () => {
    const db = repository(async () => ({ status: "done", result: { url: "/rendered/owned.mp4" } }));
    const res = response();
    await createVideoJobPollHandler(db)(request("owner"), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ status: "completed", url: "/rendered/owned.mp4" });
  });

  it("does not report success for an invalid external-protocol asset", async () => {
    const db = repository(async () => ({ status: "done", result: { url: "file:///etc/passwd" } }));
    const res = response();
    await createVideoJobPollHandler(db)(request("owner"), res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect(res.payload).toMatchObject({ status: "error" });
  });

  it("returns 503 rather than a fabricated job on database outage", async () => {
    const db = repository(async () => { throw new Error("private database connection details"); });
    const res = response();
    await createVideoJobPollHandler(db)(request("owner"), res as unknown as Response);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.payload)).not.toContain("private database");
  });

  it("binds music-video polling to the authenticated owner", async () => {
    const db = repository(async () => undefined);
    const res = response();
    await createMusicVideoJobPollHandler(db)(request("other-user"), res as unknown as Response);
    expect(db.get).toHaveBeenCalledWith("music-video", "job-1", "other-user");
    expect(res.statusCode).toBe(404);
  });

  it("returns a durable music-video result without local-memory lookup", async () => {
    const db = repository(async () => ({ status: "done", result: { video_url: "/assets/video.mp4" } }));
    const res = response();
    await createMusicVideoJobPollHandler(db)(request("owner"), res as unknown as Response);
    expect(res.payload).toMatchObject({ success: true, status: "completed", videoUrl: "/assets/video.mp4" });
  });

  it("fails closed when the music-video repository is unavailable", async () => {
    const db = repository(async () => { throw new Error("private db URL"); });
    const res = response();
    await createMusicVideoJobPollHandler(db)(request("owner"), res as unknown as Response);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.payload)).not.toContain("private db");
  });
});

describe("multipart scene validation cleanup", () => {
  it("deletes staged uploads on rejected requests", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "maxbooster-scene-test-"));
    const staged = path.join(dir, "staged-audio");
    try {
      await writeFile(staged, "disposable");
      const req = {
        body: { ai_generate_scenes: "true", topic: "song", platform: "invalid" },
        files: { audio: [{ path: staged }] },
      } as unknown as Request;
      const res = response();
      expect(await rejectInvalidMusicVideoSceneRequest(req, res as unknown as Response, ["youtube"])).toBe(true);
      expect(res.statusCode).toBe(400);
      await expect(stat(staged)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

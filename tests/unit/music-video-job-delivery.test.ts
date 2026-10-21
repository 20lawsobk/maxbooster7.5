import { describe, expect, it, vi } from "vitest";
import {
  fetchMusicVideoJobStatus,
  musicVideoJobPath,
  normalizeMusicVideoJob,
  pollMusicVideoJobUntilDone,
} from "../../client/src/lib/musicVideoJobs";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = async () => {};

describe("music video result delivery", () => {
  it("preserves the actual completed/result contract and checks the owner-scoped endpoint", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ status: "processing" }))
      .mockResolvedValueOnce(reply({ status: "completed", videoUrl: "/api/storage/file/video.mp4",
        thumbnailUrl: "/api/storage/file/poster.png", result: { bpm: 96, durationSeconds: 4 } }));
    const onStatus = vi.fn();
    const result = await pollMusicVideoJobUntilDone("owned-job", { fetchImpl, sleep: noSleep, onStatus });
    expect(result).toMatchObject({ success: true, status: "completed", url: "/api/storage/file/video.mp4",
      thumbnail_url: "/api/storage/file/poster.png", result: { bpm: 96 } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]).toEqual(["/api/social/music-video-job/owned-job", expect.objectContaining({
      credentials: "include", signal: expect.any(AbortSignal),
    })]);
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed", url: result.url }));
  });
  it.each(["failed", "error", "cancelled"])("stops a %s job without pretending it is still rendering", async status => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ status, error: "Renderer unavailable" }));
    await expect(pollMusicVideoJobUntilDone("job", { fetchImpl, sleep: noSleep }))
      .rejects.toThrow("Renderer unavailable");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 404, 410])("stops HTTP%s instead of polling forever", async status => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ error: "Unavailable for this session" }, status));
    await expect(pollMusicVideoJobUntilDone("job", { fetchImpl, sleep: noSleep }))
      .rejects.toThrow("Unavailable for this session");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("has a finite rendering budget even when the server remains processing", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => reply({ status: "processing" }));
    await expect(pollMusicVideoJobUntilDone("job", { fetchImpl, sleep: noSleep, maxAttempts: 3 }))
      .rejects.toThrow("timed out");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("cancels before another status request", async () => {
    const controller = new AbortController(); controller.abort();
    const fetchImpl = vi.fn();
    await expect(pollMusicVideoJobUntilDone("job", { fetchImpl, signal: controller.signal, sleep: noSleep }))
      .rejects.toThrow("Cancelled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("never treats specifications or missing file URLs as a completed video", () => {
    expect(() => normalizeMusicVideoJob({ status: "completed", result: {} })).toThrow("playable");
    expect(() => normalizeMusicVideoJob({ status: "completed", videoUrl: "asset://video/specification" })).toThrow("playable");
    expect(() => normalizeMusicVideoJob({ status: "completed", videoUrl: ["java", "script:alert(1)"].join("") })).toThrow("playable");
  });
  it("normalizes legacy done records while preserving the delivered file", () => {
    expect(normalizeMusicVideoJob({ status: "done", result: { url: "/api/storage/file/video.mp4" } }))
      .toMatchObject({ status: "completed", url: "/api/storage/file/video.mp4" });
  });
  it("rejects traversal or malformed job identifiers before fetching", async () => {
    for (const job of ["../other", "..", "/victim", "", "job?owner=victim"]) {
      expect(() => musicVideoJobPath(job)).toThrow("Invalid");
    }
    const fetchImpl = vi.fn();
    await expect(fetchMusicVideoJobStatus("../other", { fetchImpl })).rejects.toThrow("Invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

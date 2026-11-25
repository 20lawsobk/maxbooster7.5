import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const { renderVideo } = vi.hoisted(() => ({ renderVideo: vi.fn() }));
vi.mock("../advancedVideoRendererService.js", () => ({
  renderVideo,
}));

describe("image-to-video MaxCore caller", () => {
  let tempDir = "";

  afterEach(async () => {
    vi.clearAllMocks();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("passes frame conditioning and audio to the whole-video job", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maxcore-i2v-"));
    const first = path.join(tempDir, "first.png");
    const last = path.join(tempDir, "last.png");
    await writeFile(first, Buffer.from("first-frame"));
    await writeFile(last, Buffer.from("last-frame"));
    renderVideo.mockResolvedValue({
      success: true,
      url: "/api/assets/video/123",
      source: "MaxCoreAI",
    });

    const { imageToMusicVideo } = await import("../imageToVideoService.js");
    const result = await imageToMusicVideo({
      imagePaths: [first, last],
      audioPath: "/uploads/song.wav",
      hook: "New single",
      body: "Out now",
      platform: "tiktok",
      userId: "user-1",
    });

    expect(result).toEqual({
      success: true,
      url: "/api/assets/video/123",
      source: "MaxCoreAI",
    });
    expect(renderVideo).toHaveBeenCalledOnce();
    expect(renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        first_frame_b64: Buffer.from("first-frame").toString("base64"),
        last_frame_b64: Buffer.from("last-frame").toString("base64"),
        reference_images: [
          Buffer.from("first-frame").toString("base64"),
          Buffer.from("last-frame").toString("base64"),
        ],
        user_audio_path: "/uploads/song.wav",
        userId: "user-1",
      }),
    );
  }, 30_000);
});
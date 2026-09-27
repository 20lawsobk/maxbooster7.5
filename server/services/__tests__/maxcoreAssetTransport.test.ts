import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { randomBytes } from "node:crypto";
import os from "os";
import path from "path";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("../audioSourceResolver.js", () => ({
  resolveAudioUrlToLocalFile: mocks.resolve,
}));
vi.mock("../maxcoreConnector.js", () => ({
  getMaxcoreGenerationKey: () => "generation-key",
  getMaxcoreOriginOrDefault: () => "https://maxcore.example",
}));

describe("MaxCore owner-scoped audio transport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.resolve.mockReset();
    mocks.cleanup.mockReset();
  });

  it("passes a genuine owner-scoped MaxCore path without re-uploading", async () => {
    const { ensureMaxCoreAudioAsset } = await import("../maxcoreAssetTransport.js");
    const url =
      "/uploads/audio-inputs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/12345678.wav";
    await expect(ensureMaxCoreAudioAsset(url, "user-1")).resolves.toBe(url);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("uploads resolved app audio as raw bytes and always cleans up", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "maxcore-audio-"));
    const localPath = path.join(tempDir, "source.wav");
    await writeFile(localPath, Buffer.from("RIFF"));
    mocks.resolve.mockResolvedValue({
      localPath,
      cleanup: mocks.cleanup,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "/uploads/audio-inputs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/abcdef.wav",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { ensureMaxCoreAudioAsset } = await import("../maxcoreAssetTransport.js");
    await expect(ensureMaxCoreAudioAsset("/api/storage/file/song", "user-1"))
      .resolves.toContain("/uploads/audio-inputs/");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://maxcore.example/api/audio/upload",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer generation-key",
          "X-MaxCore-User-Id": "user-1",
          "Content-Type": "audio/wav",
          "Content-Length": "4",
        }),
        body: Buffer.from("RIFF"),
      }),
    );
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("transfers a direct Multer audio upload from the trusted temp directory", async () => {
    const mediaTemp = path.join(process.cwd(), "uploads", "media_temp");
    await mkdir(mediaTemp, { recursive: true });
    const localPath = path.join(
      mediaTemp,
      `media_${randomBytes(8).toString("hex")}.wav`,
    );
    await writeFile(localPath, Buffer.from("RIFF"));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "/uploads/audio-inputs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/abcdef.wav",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { ensureMaxCoreMediaTempUpload } = await import("../maxcoreAssetTransport.js");
      await expect(ensureMaxCoreMediaTempUpload(localPath, "user-1"))
        .resolves.toContain("/uploads/audio-inputs/");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://maxcore.example/api/audio/upload",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-MaxCore-User-Id": "user-1",
            "Content-Type": "audio/wav",
            "Content-Length": "4",
          }),
          body: Buffer.from("RIFF"),
        }),
      );
    } finally {
      await rm(localPath, { force: true });
    }
  });

  it("rejects absolute audio sources outside the trusted temp directory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "maxcore-audio-outside-"));
    const localPath = path.join(tempDir, "media_0123456789abcdef.wav");
    await writeFile(localPath, Buffer.from("RIFF"));

    try {
      const { ensureMaxCoreMediaTempUpload } = await import("../maxcoreAssetTransport.js");
      await expect(ensureMaxCoreMediaTempUpload(localPath, "user-1"))
        .rejects.toThrow("invalid temporary upload");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
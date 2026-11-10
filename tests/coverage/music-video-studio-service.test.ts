import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  fetchPhotorealisticImage: vi.fn(),
  imageToMusicVideo: vi.fn(),
  renderVideo: vi.fn(),
  ensureMaxCoreMediaTempUpload: vi.fn(),
}));

vi.mock("../../server/services/beatSyncService.js", () => ({
  analyzeAudio: mocks.analyzeAudio,
}));
vi.mock("../../server/services/advancedVideoRendererService.js", () => ({
  fetchPhotorealisticImage: mocks.fetchPhotorealisticImage,
  renderVideo: mocks.renderVideo,
}));
vi.mock("../../server/services/imageToVideoService.js", () => ({
  imageToMusicVideo: mocks.imageToMusicVideo,
}));
vi.mock("../../server/services/maxcoreClient.js", () => ({
  MaxCoreAIClient: {},
}));
vi.mock("../../server/lib/aiSource.js", () => ({
  requireMaxCore: vi.fn(),
}));
vi.mock("../../server/services/maxcoreAssetTransport.js", () => ({
  ensureMaxCoreMediaTempUpload: mocks.ensureMaxCoreMediaTempUpload,
}));

import {
  generateFullMusicVideo,
  quickBeatAnalyze,
} from "../../server/services/musicVideoStudioService.js";

const beatAnalysis = {
  bpm: 121.2,
  confidence: 0.91,
  durationSeconds: 12.6,
  sections: [
    {
      type: "verse",
      label: "Verse 1",
      startTime: 0,
      endTime: 6.2,
      avgEnergy: 0.55,
    },
  ],
  tier: "librosa",
} as const;

describe("music video studio service", () => {
  let directory: string;
  let audioPath: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "music-video-studio-"));
    audioPath = path.join(directory, "owned-track.wav");
    await writeFile(audioPath, "fixture audio bytes");
  });

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyzeAudio.mockResolvedValue(beatAnalysis);
    mocks.ensureMaxCoreMediaTempUpload.mockResolvedValue(
      "/tmp/maxcore-owned-track.wav",
    );
    mocks.renderVideo.mockResolvedValue({
      success: true,
      url: "/media/video/owner-1/render-1.mp4",
      filename: "render-1.mp4",
      duration: 11,
    });
  });

  const validOptions = () => ({
    audioPath,
    userId: "owner-1",
    hook: "A new song is here",
    platform: "youtube",
  });

  it("requires creative direction, a platform, and authenticated ownership", async () => {
    await expect(
      generateFullMusicVideo({
        ...validOptions(),
        hook: " ",
        bodyText: " ",
      }),
    ).rejects.toThrow("A video topic, hook, or body is required");

    await expect(
      generateFullMusicVideo({ ...validOptions(), platform: " " }),
    ).rejects.toThrow("A target platform is required for video generation");

    await expect(
      generateFullMusicVideo({ ...validOptions(), userId: " " }),
    ).rejects.toThrow("Authenticated ownership is required for video generation");
  });

  it("returns an explicit failure for a missing audio file without starting analysis", async () => {
    const result = await generateFullMusicVideo({
      ...validOptions(),
      audioPath: path.join(directory, "missing.wav"),
    });

    expect(result).toMatchObject({
      success: false,
      error: `Audio file not found: ${path.join(directory, "missing.wav")}`,
      beatAnalysis: null,
      scenes: [],
      durationSeconds: 0,
      bpm: 0,
      genre: "",
      capabilities: [],
    });
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
  });

  it("returns a measured analysis failure without submitting a render", async () => {
    mocks.analyzeAudio.mockRejectedValue(new Error("unsupported audio format"));

    const result = await generateFullMusicVideo(validOptions());

    expect(result).toMatchObject({
      success: false,
      error: "Beat analysis failed: unsupported audio format",
      beatAnalysis: null,
      scenes: [],
      durationSeconds: 0,
      bpm: 0,
      capabilities: [],
    });
    expect(mocks.ensureMaxCoreMediaTempUpload).not.toHaveBeenCalled();
    expect(mocks.renderVideo).not.toHaveBeenCalled();
  });

  it("uploads the owned audio and forwards normalized creative context to MaxCore", async () => {
    const options = {
      ...validOptions(),
      genre: " R&B ",
      artistName: " Artist One ",
      artistStyle: " warm and intimate ",
      bodyText: " A story about the first tour ",
      cta: "Listen now",
      aspectRatio: "16:9",
      intent: { goal: "release-promotion" },
      direction: { visual: "warm stage lighting" },
      context: { campaignId: "campaign-1" },
      awareness: { freshness: "fresh" },
    };

    const result = await generateFullMusicVideo(options);

    expect(mocks.analyzeAudio).toHaveBeenCalledWith(audioPath);
    expect(mocks.ensureMaxCoreMediaTempUpload).toHaveBeenCalledWith(
      audioPath,
      "owner-1",
    );
    expect(mocks.renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: options.bodyText.trim(),
        hook: options.hook,
        body: options.bodyText.trim(),
        cta: options.cta,
        platform: options.platform,
        aspect_ratio: options.aspectRatio,
        genre: "r&b",
        artist_name: "Artist One",
        user_audio_path: "/tmp/maxcore-owned-track.wav",
        duration: 13,
        tone: "warm and intimate",
        userId: "owner-1",
        intent: options.intent,
        direction: options.direction,
        context: options.context,
        awareness: options.awareness,
      }),
    );
    expect(result).toMatchObject({
      success: true,
      url: "/media/video/owner-1/render-1.mp4",
      filename: "render-1.mp4",
      beatAnalysis,
      scenes: [],
      viralScore: null,
      viralRecommendation: null,
      durationSeconds: 11,
      bpm: 121.2,
      genre: "r&b",
      capabilities: ["beat_analysis", "maxcore_video", "user_audio"],
    });
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("uses the measured duration when MaxCore omits duration", async () => {
    mocks.renderVideo.mockResolvedValue({
      success: true,
      url: "/media/video/owner-1/render-2.mp4",
    });

    const result = await generateFullMusicVideo(validOptions());

    expect(result.success).toBe(true);
    expect(result.durationSeconds).toBe(beatAnalysis.durationSeconds);
  });

  it("uses hook and documented defaults when optional creative fields are empty", async () => {
    await generateFullMusicVideo({
      ...validOptions(),
      hook: " ",
      bodyText: "  Story body  ",
      genre: " ",
      artistName: " ",
      artistStyle: " ",
      aspectRatio: " ",
    });

    expect(mocks.renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "Story body",
        hook: "",
        body: "Story body",
        aspect_ratio: "9:16",
        genre: "",
        artist_name: undefined,
        tone: "energetic",
      }),
    );
  });

  it.each([
    {
      name: "provider-reported failure",
      response: { success: false, error: "render rejected" },
      expectedError: "render rejected",
    },
    {
      name: "missing output URL",
      response: { success: true, filename: "missing-url.mp4" },
      expectedError: "MaxCore video render failed",
    },
  ])("returns an explicit failure for $name", async ({ response, expectedError }) => {
    mocks.renderVideo.mockResolvedValue(response);

    const result = await generateFullMusicVideo(validOptions());

    expect(result).toMatchObject({
      success: false,
      error: expectedError,
      beatAnalysis,
      scenes: [],
      viralScore: null,
      viralRecommendation: null,
      durationSeconds: beatAnalysis.durationSeconds,
      bpm: beatAnalysis.bpm,
      capabilities: ["beat_analysis", "maxcore_video"],
    });
  });

  it("does not report success when the owned-media upload fails", async () => {
    mocks.ensureMaxCoreMediaTempUpload.mockRejectedValue(
      new Error("media upload unavailable"),
    );

    await expect(generateFullMusicVideo(validOptions())).rejects.toThrow(
      "media upload unavailable",
    );
    expect(mocks.renderVideo).not.toHaveBeenCalled();
  });

  it("preserves render exceptions for the caller to report", async () => {
    mocks.renderVideo.mockRejectedValue(new Error("render service unavailable"));

    await expect(generateFullMusicVideo(validOptions())).rejects.toThrow(
      "render service unavailable",
    );
  });

  it("quick analysis rejects a missing audio file", async () => {
    await expect(
      quickBeatAnalyze(path.join(directory, "missing.wav")),
    ).rejects.toThrow(`Audio file not found: ${path.join(directory, "missing.wav")}`);
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
  });

  it("returns only the measured beat-analysis fields", async () => {
    const result = await quickBeatAnalyze(audioPath);

    expect(mocks.analyzeAudio).toHaveBeenCalledWith(audioPath);
    expect(result).toEqual({
      bpm: beatAnalysis.bpm,
      confidence: beatAnalysis.confidence,
      durationSeconds: beatAnalysis.durationSeconds,
      sections: beatAnalysis.sections,
      tier: beatAnalysis.tier,
    });
  });

  it("propagates beat-analysis errors from quick analysis", async () => {
    mocks.analyzeAudio.mockRejectedValue(new Error("analysis unavailable"));

    await expect(quickBeatAnalyze(audioPath)).rejects.toThrow(
      "analysis unavailable",
    );
  });
});

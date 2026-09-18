import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureMaxCoreAudioAsset = vi.fn();
const generate = vi.fn();

vi.mock("../maxcoreAssetTransport.js", () => ({
  ensureMaxCoreAudioAsset,
}));
vi.mock("../maxcoreClient.js", () => ({
  MaxCoreAIClient: {
    generate,
    isAvailable: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock("../maxcoreConnector.js", () => ({
  getMaxcoreOrigin: () => "http://127.0.0.1:8090",
}));

describe("PythonAIService MaxCore audio analysis", () => {
  beforeEach(() => {
    ensureMaxCoreAudioAsset.mockReset();
    generate.mockReset();
  });

  it("transfers an owned app asset before conductor analysis", async () => {
    ensureMaxCoreAudioAsset.mockResolvedValue(
      "/uploads/audio-inputs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/id.wav",
    );
    generate.mockResolvedValue({
      source: "maxcore_audio_conductor",
      bpm: 120,
    });
    const { pythonAIService } = await import("../pythonAIService.js");

    const result = await pythonAIService.analyzeAudio(
      "/api/storage/file/users%2Fu1%2Ftrack.wav",
      true,
      "u1",
    );

    expect(ensureMaxCoreAudioAsset).toHaveBeenCalledWith(
      "/api/storage/file/users%2Fu1%2Ftrack.wav",
      "u1",
    );
    expect(generate).toHaveBeenCalledWith("/api/audio/analyze", {
      user_id: "u1",
      audio_url:
        "/uploads/audio-inputs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/id.wav",
      context: { detailed: true },
    });
    expect(result).toEqual({
      success: true,
      data: { source: "maxcore_audio_conductor", bpm: 120 },
    });
  });
});
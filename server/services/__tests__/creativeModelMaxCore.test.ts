import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  infer: vi.fn(),
  renderVideo: vi.fn(),
}));

vi.mock("../maxcoreClient.js", () => ({
  MaxCoreAIClient: { infer: mocks.infer },
}));
vi.mock("../advancedVideoRendererService.js", () => ({
  renderVideo: mocks.renderVideo,
}));
vi.mock("../maxcoreAssetTransport.js", () => ({
  ensureMaxCoreAudioAsset: vi
    .fn()
    .mockResolvedValue(
      "/uploads/audio-inputs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/song.wav",
    ),
}));

describe("creative model MaxCore orchestration", () => {
  it("uses MaxCore analysis and one authoritative video job", async () => {
    mocks.infer
      .mockResolvedValueOnce({
        bpm: 100,
        key: "A minor",
        sections: [{ name: "hook", start: 0, end: 8 }],
        energy_curve: [0.8],
        mood: ["energetic"],
        genre: "hip-hop",
      });
    mocks.renderVideo.mockResolvedValue({
      success: true,
      url: "/api/assets/video/creative",
      hook: "Listen now",
      body: "A new release",
      cta: "Stream it",
      scenes: [{ type: "hook", text: "Open on the artist" }],
    });

    const { generateCreativePackage } = await import(
      "../creativeModelService.js"
    );
    const result = await generateCreativePackage({
      userId: "actor-7",
      audioPath: "/uploads/song.wav",
      brief: {
        domain: "music",
        platform: "tiktok",
        goal: "streams",
        tone: "energetic",
        offer: "New single",
        callToAction: "Stream it",
        keyMessages: ["Listen now"],
        style: {},
      },
    });

    expect(mocks.infer).toHaveBeenCalledTimes(1);
    expect(mocks.infer.mock.calls[0][0]).toBe("/audio/analyze");
    expect(mocks.infer.mock.calls[0][1].user_id).toBe("actor-7");
    expect(mocks.renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        user_audio_path:
          "/uploads/audio-inputs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/song.wav",
        userId: "actor-7",
      }),
    );
    expect(result).toMatchObject({
      videoPath: "/api/assets/video/creative",
      script: "Listen now\nA new release\nStream it",
      plan: {
        beats: [
          {
            timecodeHint: "1",
            description: "Open on the artist",
            emotionalGoal: "hook",
          },
        ],
      },
      scores: {
        watchTimeScore: null,
        hookStrength: null,
        conversionScore: null,
      },
    });
  });

  it("rejects incomplete MaxCore analysis without defaults", async () => {
    mocks.infer.mockReset();
    mocks.renderVideo.mockReset();
    mocks.infer.mockResolvedValue({ bpm: 120 });
    const { planCreative } = await import("../creativeModelService.js");

    await expect(
      planCreative(
        {
          domain: "music",
          platform: "tiktok",
          goal: "streams",
          tone: "energetic",
          offer: "Single",
          callToAction: "Listen",
          keyMessages: [],
          style: {},
        },
        "/uploads/song.wav",
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", statusCode: 503 });
  });
});
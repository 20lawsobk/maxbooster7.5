import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unifiedGenerate: vi.fn(),
  maxCoreInfer: vi.fn(),
  maxCoreGenerate: vi.fn(),
  generateAudio: vi.fn(),
  renderVideo: vi.fn(),
  persistImage: vi.fn(),
  socialGenerate: vi.fn(),
  socialAutopilot: vi.fn(),
}));

vi.mock("../unifiedAIController.js", () => ({
  unifiedAIController: { generateContent: mocks.unifiedGenerate },
}));
vi.mock("../maxcoreClient.js", () => ({
  MaxCoreAIClient: {
    infer: mocks.maxCoreInfer,
    generate: mocks.maxCoreGenerate,
  },
}));
vi.mock("../generatedImageAsset.js", () => ({
  generatedImageUrl: (value: unknown) =>
    value && typeof value === "object" ? (value as Record<string, unknown>).url : undefined,
  persistGeneratedImage: mocks.persistImage,
}));
vi.mock("../aiAudioGeneratorService.js", () => ({
  generateFromText: mocks.generateAudio,
}));
vi.mock("../advancedVideoRendererService.js", () => ({
  renderVideo: mocks.renderVideo,
}));
vi.mock("../maxcoreDomainAdapter.js", () => ({
  generateSocialDirect: mocks.socialGenerate,
  getSocialAutopilotDirect: mocks.socialAutopilot,
}));
vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  },
}));
vi.mock("../dynamicTrendsService", () => ({
  dynamicTrendsService: {},
}));

import { AIContentService } from "../aiContentService.js";

describe("AI content creation uses owner-bound MaxCore paths", () => {
  let service: AIContentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AIContentService();
    mocks.unifiedGenerate.mockResolvedValue({
      success: true,
      source: "MaxCoreAI",
      data: {
        caption: "A new release with a distinct creative description.",
        hook: "A new release",
        body: "A distinct creative description.",
        cta: "Listen now",
      },
    });
    mocks.maxCoreInfer.mockResolvedValue({ url: "/uploads/images/generated.png" });
    mocks.persistImage.mockResolvedValue({
      url: "/api/storage/file/users/owner-1/generated-images/asset.png",
      width: 1024,
      height: 1024,
      format: "png",
      validation: { artifact_validated: true },
    });
    mocks.generateAudio.mockResolvedValue({
      success: true,
      audioFilePath: "/api/storage/file/users/owner-1/generated-audio/asset.wav",
      parameters: { tempo: 120, key: "C" },
      duration: 8,
    });
    mocks.renderVideo.mockResolvedValue({
      success: true,
      url: "/api/storage/file/users/owner-1/generated-video/asset.mp4",
      source: "MaxCoreAI",
    });
    mocks.maxCoreGenerate.mockImplementation(async (_path: string, body: Record<string, unknown>) => ({
      caption: `Localized ${String(body.extra_context).match(/into ([a-z-]+)/)?.[1] ?? "content"}`,
      cultural_adaptations: ["preserved intent"],
    }));
  });

  it("routes text through the unified MaxCore generator with the authenticated owner", async () => {
    const result = await service.generateContent({
      userId: "owner-1",
      prompt: "Release announcement",
      platform: "instagram",
      format: "text",
    });
    expect(result.content).toEqual(["A new release with a distinct creative description."]);
    expect(mocks.unifiedGenerate).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-1",
      topic: "Release announcement",
    }));
  });

  it("rejects empty MaxCore text instead of returning or echoing the prompt", async () => {
    mocks.unifiedGenerate.mockResolvedValue({
      success: true,
      source: "MaxCoreAI",
      data: {},
    });
    await expect(service.generateContent({
      userId: "owner-1",
      prompt: "This prompt must not be echoed",
      platform: "instagram",
      format: "text",
    })).rejects.toThrow(/no usable text content/i);
  });

  it("routes images through MaxCore and returns verified owner storage", async () => {
    const result = await service.generateContent({
      userId: "owner-1",
      prompt: "Single cover artwork",
      platform: "instagram",
      format: "image",
      style: "minimal",
    });
    expect(mocks.maxCoreInfer).toHaveBeenCalledWith(
      "/api/generate/image",
      expect.objectContaining({ prompt: "Single cover artwork", style: "minimal" }),
      "owner-1",
    );
    expect(mocks.persistImage).toHaveBeenCalledWith("/uploads/images/generated.png", "owner-1");
    expect(result.url).toBe("/api/storage/file/users/owner-1/generated-images/asset.png");
    expect(result.metadata).toMatchObject({
      source: "MaxCoreAI",
      dimensions: { width: 1024, height: 1024 },
      validation: { artifact_validated: true },
    });
  });

  it("routes audio through MaxCore's job-and-persistence service", async () => {
    const result = await service.generateContent({
      userId: "owner-1",
      prompt: "An eight-second promotional instrumental",
      platform: "tiktok",
      format: "audio",
    });
    expect(mocks.generateAudio).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-1",
      text: "An eight-second promotional instrumental",
      context: { platform: "tiktok", tone: undefined },
    }));
    expect(result.url).toBe("/api/storage/file/users/owner-1/generated-audio/asset.wav");
  });

  it("routes video script and rendering through MaxCore with the same owner", async () => {
    await service.generateContent({
      userId: "owner-1",
      prompt: "Promote the new single",
      platform: "youtube",
      format: "video",
    });
    expect(mocks.unifiedGenerate).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-1",
      topic: "Promote the new single",
    }));
    expect(mocks.renderVideo).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-1",
      topic: "Promote the new single",
      hook: "A new release",
    }));
  });

  it("does not render a blank video script", async () => {
    mocks.unifiedGenerate.mockResolvedValue({
      success: true,
      source: "MaxCoreAI",
      data: {},
    });
    await expect(service.generateContent({
      userId: "owner-1",
      prompt: "This prompt must not become a blank template",
      platform: "youtube",
      format: "video",
    })).rejects.toThrow(/no usable video script/i);
    expect(mocks.renderVideo).not.toHaveBeenCalled();
  });

  it("uses bounded MaxCore text calls for multilingual creative output", async () => {
    const result = await service.generateMultilingualContent(
      "An original music announcement",
      ["es", "fr"],
      "owner-1",
      { platform: "instagram" },
    );
    expect(mocks.maxCoreGenerate).toHaveBeenCalledTimes(2);
    expect(mocks.maxCoreGenerate).toHaveBeenCalledWith(
      "/api/generate/content",
      expect.objectContaining({ topic: "An original music announcement" }),
      "owner-1",
    );
    expect(result.map(item => item.language)).toEqual(["es", "fr"]);
    expect(result.every(item => item.content.startsWith("Localized "))).toBe(true);
  });

  it("rejects ownerless media generation before calling MaxCore", async () => {
    await expect(service.generateImageContent("artwork", "instagram", ""))
      .rejects.toThrow(/authenticated owner/i);
    await expect(service.generateAudioContent("instrumental", "instagram", ""))
      .rejects.toThrow(/authenticated owner/i);
    await expect(service.generateVideoContent("promo", "instagram", ""))
      .rejects.toThrow(/authenticated owner/i);
    expect(mocks.maxCoreInfer).not.toHaveBeenCalled();
    expect(mocks.generateAudio).not.toHaveBeenCalled();
    expect(mocks.renderVideo).not.toHaveBeenCalled();
  });
});

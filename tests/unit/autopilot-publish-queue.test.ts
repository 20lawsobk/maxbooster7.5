import { beforeEach, describe, expect, it, vi } from "vitest";

const publishContent = vi.fn();

vi.mock("../../server/platform-apis.js", () => ({
  platformAPI: {
    publishContent,
    collectEngagementData: vi.fn(),
  },
}));
vi.mock("../../server/services/advancedSocialAIService.js", () => ({
  advancedSocialAIService: {},
}));
vi.mock("../../server/services/autopilotLearningService.js", () => ({
  autopilotLearningService: {},
}));
vi.mock("../../server/services/evolutionRegistry.js", () => ({
  evolutionRegistry: {},
}));
vi.mock("../../server/services/advancedUrlParser.js", () => ({
  advancedUrlParser: {},
}));
vi.mock("../../server/services/autopilotKnowledgeBaseService.js", () => ({
  autopilotKnowledgeBaseService: {
    getGenerationContext: vi.fn().mockResolvedValue(undefined),
  },
  attachKnowledgeContext: (context: unknown) => context,
}));
vi.mock("../../server/services/adaptiveGenerationEngine.js", () => ({
  recordOutcome: vi.fn(),
}));

function publishingJob() {
  return {
    id: "publish-job",
    type: "content_publishing",
    scheduledAt: new Date(),
    platform: "instagram",
    data: {},
    status: "running",
    retries: 0,
    maxRetries: 2,
  };
}

function queuedContent() {
  return {
    id: "content-1",
    text: "Release announcement",
    hashtags: ["#release"],
    platforms: ["instagram"],
    status: "draft",
    type: "announcement",
    topic: "New single",
    intent: "announce",
    direction: { pacing: "slow" },
    context: { releaseId: "r1" },
    awareness: { audience: "warm" },
    createdAt: new Date(),
  };
}

describe("autopilot publish queue consumption", () => {
  beforeEach(() => publishContent.mockReset());

  it("preserves MaxCore generation errors for scheduler retry and reporting", async () => {
    const { AutopilotEngine } = await import("../../server/autopilot-engine.js");
    const engine = new AutopilotEngine("user-1") as any;
    const upstreamError = new Error("MaxCore account curriculum is unavailable");
    const job = {
      id: "generation-job",
      type: "content_generation",
      scheduledAt: new Date(),
      platform: "instagram",
      data: { topic: "New single", brandVoice: "professional" },
      status: "pending",
      retries: 0,
      maxRetries: 2,
    };
    engine.resolveUrlBrief = vi.fn().mockResolvedValue(undefined);
    engine.generateContentForAutopilot = vi.fn().mockRejectedValue(upstreamError);

    await expect(engine.executeContentGeneration(job)).rejects.toBe(upstreamError);
    await engine.executeJob(job);

    expect(job.status).toBe("pending");
    expect(job.retries).toBe(1);
    expect(engine.contentQueue.size).toBe(0);
    expect(engine.generateContentForAutopilot).toHaveBeenCalledTimes(2);
  });

  it("retains the exact queued item across thrown and unsuccessful retries", async () => {
    const { AutopilotEngine } = await import("../../server/autopilot-engine.js");
    const engine = new AutopilotEngine("user-1") as any;
    engine.config.autoPublish = true;
    const content = queuedContent();
    engine.contentQueue.set("instagram", [content]);

    publishContent.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(engine.executeContentPublishing(publishingJob())).rejects.toThrow(
      "network unavailable",
    );
    expect(engine.contentQueue.get("instagram")).toEqual([content]);

    publishContent.mockResolvedValueOnce([
      { success: false, error: "provider rejected post" },
    ]);
    await expect(engine.executeContentPublishing(publishingJob())).rejects.toThrow(
      "Publishing failed for platform instagram",
    );
    expect(engine.contentQueue.get("instagram")).toEqual([content]);
    expect(content).toMatchObject({
      status: "draft",
      intent: "announce",
      direction: { pacing: "slow" },
      context: { releaseId: "r1" },
      awareness: { audience: "warm" },
    });
  });

  it("consumes only after success and retains context for analysis", async () => {
    const { AutopilotEngine } = await import("../../server/autopilot-engine.js");
    const engine = new AutopilotEngine("user-1") as any;
    engine.config.autoPublish = true;
    const content = queuedContent();
    engine.contentQueue.set("instagram", [content]);
    publishContent.mockResolvedValue([{ success: true, postId: "post-1" }]);

    await engine.executeContentPublishing(publishingJob());

    expect(engine.contentQueue.get("instagram")).toEqual([]);
    expect(content.status).toBe("published");
    expect(engine.publishContext.get(content.id)).toMatchObject({
      intent: "announce",
      direction: { pacing: "slow" },
      context: { releaseId: "r1" },
      awareness: { audience: "warm" },
    });
    expect(publishContent).toHaveBeenCalledOnce();
  });
});
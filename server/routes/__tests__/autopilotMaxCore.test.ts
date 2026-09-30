import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockMaxCoreControlError extends Error {
    constructor(
      message: string,
      readonly status = 503,
      readonly details?: unknown,
    ) {
      super(message);
      this.name = "MaxCoreControlError";
    }
  }

  return {
    requireAuth: vi.fn(),
    requireAdmin: vi.fn(),
    getAutopilotConfig: vi.fn(),
    getRecentAnalyzedContent: vi.fn(),
    getRecommendations: vi.fn(),
    predictEngagement: vi.fn(),
    getSocialAutopilot: vi.fn(),
    getAdvertisingAutopilot: vi.fn(),
    maxCoreRequest: vi.fn(),
    MockMaxCoreControlError,
  };
});

vi.mock("../../middleware/auth.js", () => ({
  requireAuth: mocks.requireAuth,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("../../storage.js", () => ({
  storage: {
    getAutopilotConfig: mocks.getAutopilotConfig,
    getRecentAnalyzedContent: mocks.getRecentAnalyzedContent,
  },
}));
vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../services/aiModelManager.js", () => ({
  aiModelManager: {
    getSocialAutopilot: mocks.getSocialAutopilot,
    getAdvertisingAutopilot: mocks.getAdvertisingAutopilot,
    predictEngagement: mocks.predictEngagement,
  },
}));
vi.mock("../../services/autopilotLearningService.js", () => ({
  autopilotLearningService: { getRecommendations: mocks.getRecommendations },
}));
vi.mock("../../services/maxcoreControlTransport.js", () => ({
  MaxCoreControlError: mocks.MockMaxCoreControlError,
  maxCoreControlTransport: { request: mocks.maxCoreRequest },
}));
vi.mock("../../services/promotionalToolsService.js", () => ({
  promotionalToolsService: {},
}));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("@shared/schema", () => ({ socialAutopilotContent: {} }));

import router from "../autopilot.js";

function getRoute(path: string) {
  return (router as any).stack.find(
    (layer: any) => layer.route?.path === path,
  ).route;
}

function getHandler(path: string) {
  return getRoute(path).stack.at(-1).handle;
}

function makeResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("autopilot MaxCore routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAutopilotConfig.mockResolvedValue(null);
    mocks.getRecentAnalyzedContent.mockResolvedValue([]);
  });

  it("does not report a fake untrained state when MaxCore status is unavailable", async () => {
    const upstreamError = new mocks.MockMaxCoreControlError(
      "model status unavailable",
      503,
      { detail: "MaxCore is not ready" },
    );
    mocks.getSocialAutopilot.mockRejectedValue(upstreamError);
    const res = makeResponse();

    await getHandler("/status")({ user: { id: "creator-1" } }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ detail: "MaxCore is not ready" });
  });

  it("uses the user-scoped MaxCore autopilot contract for recommendations", async () => {
    const recommendations = [{ type: "content", title: "Release story" }];
    mocks.getRecentAnalyzedContent.mockResolvedValue([
      { features: { mood: "reflective" } },
    ]);
    mocks.getRecommendations.mockResolvedValue(recommendations);
    const res = makeResponse();

    await getHandler("/recommend")(
      {
        user: { id: "creator-1" },
        body: {
          platform: "instagram",
          contentType: "video",
          includeMultimodal: true,
        },
      },
      res,
    );

    expect(mocks.getRecommendations).toHaveBeenCalledWith("creator-1", {
      platform: "instagram",
      contentType: "video",
      extraContext: { mood: "reflective" },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      recommendations,
      usedMultimodal: true,
    });
  });

  it("preserves MaxCore's explicit unavailable status for engagement prediction", async () => {
    const upstreamError = new mocks.MockMaxCoreControlError(
      "engagement model unavailable",
      503,
      { detail: { error: "trained model unavailable" } },
    );
    mocks.predictEngagement.mockRejectedValue(upstreamError);
    const res = makeResponse();

    await getHandler("/predict-engagement")(
      {
        user: { id: "creator-1" },
        body: { platform: "instagram", content: "New release #music" },
      },
      res,
    );

    expect(mocks.predictEngagement).toHaveBeenCalledWith(
      "creator-1",
      expect.objectContaining({
        platform: "instagram",
        content: "New release #music",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      detail: { error: "trained model unavailable" },
    });
  });

  it("starts storage-backed global training through MaxCore and requires admin middleware", async () => {
    const route = getRoute("/train");
    expect(route.stack.slice(0, 2).map((layer: any) => layer.handle)).toEqual([
      mocks.requireAuth,
      mocks.requireAdmin,
    ]);
    mocks.maxCoreRequest.mockResolvedValue({
      status: "started",
      job_id: "mc-job-1",
    });
    const res = makeResponse();

    await getHandler("/train")({ body: { epochs: "2" } }, res);

    expect(mocks.maxCoreRequest).toHaveBeenCalledWith(
      "/training/start-from-storage",
      {
        method: "POST",
        authScope: "admin",
        body: { epochs: 2 },
      },
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      trainingAuthority: "maxcore",
      status: "started",
      job_id: "mc-job-1",
    });
  });

  it("returns the existing training state without claiming a new job started", async () => {
    const trainingState = { state: "running", job_id: "mc-job-existing" };
    mocks.maxCoreRequest.mockResolvedValue({
      status: "already_running",
      training_state: trainingState,
    });
    const res = makeResponse();

    await getHandler("/train")({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "already_running",
      training_state: trainingState,
      trainingAuthority: "maxcore",
    });
  });

  it("rejects a malformed MaxCore training response instead of claiming it started", async () => {
    mocks.maxCoreRequest.mockResolvedValue({ accepted: true });
    const res = makeResponse();

    await getHandler("/train")({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid MaxCore training response",
      response: { accepted: true },
    });
  });

  it("does not start MaxCore training with invalid or identity-bearing input", async () => {
    const res = makeResponse();

    await getHandler("/train")(
      { body: { user_id: "another-user", epochs: 2 } },
      res,
    );

    expect(mocks.maxCoreRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
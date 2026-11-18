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
    getRecentAnalyzedContent: vi.fn(),
    getAdvertisingAutopilot: vi.fn(),
    getLearningInsights: vi.fn(),
    getRecommendations: vi.fn(),
    getPerformanceHistory: vi.fn(),
    getPlatformStatistics: vi.fn(),
    getRedisClient: vi.fn(),
    maxCoreRequest: vi.fn(),
    MockMaxCoreControlError,
  };
});

vi.mock("../../middleware/auth.js", () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock("../../storage.js", () => ({
  storage: { getRecentAnalyzedContent: mocks.getRecentAnalyzedContent },
}));
vi.mock("../../logger.js", () => ({
  logger: { warn: vi.fn() },
}));
vi.mock("../../services/aiModelManager.js", () => ({
  aiModelManager: {
    getAdvertisingAutopilot: mocks.getAdvertisingAutopilot,
  },
}));
vi.mock("../../services/autopilotLearningService.js", () => ({
  autopilotLearningService: {
    getLearningInsights: mocks.getLearningInsights,
    getRecommendations: mocks.getRecommendations,
    getPerformanceHistory: mocks.getPerformanceHistory,
    getPlatformStatistics: mocks.getPlatformStatistics,
  },
}));
vi.mock("../../services/maxcoreControlTransport.js", () => ({
  MaxCoreControlError: mocks.MockMaxCoreControlError,
  maxCoreControlTransport: { request: mocks.maxCoreRequest },
}));
vi.mock("../../lib/redisConnectionFactory.js", () => ({
  getRedisClient: mocks.getRedisClient,
}));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("@shared/schema", () => ({ adCampaigns: {} }));

import advertisingAutopilotRouter from "../advertisingAutopilot.js";
import autopilotLearningRouter from "../autopilot-learning.js";

function getHandler(router: any, path: string) {
  return router.stack.find((layer: any) => layer.route?.path === path)
    .route.stack.at(-1).handle;
}

function makeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("MaxCore account-curriculum failure propagation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRecentAnalyzedContent.mockResolvedValue([]);
    mocks.getRedisClient.mockResolvedValue(null);
    mocks.maxCoreRequest.mockResolvedValue({
      domain: "social",
      version: "base",
      session_count: 1,
      weights: { ready: true },
    });
    mocks.getLearningInsights.mockResolvedValue([]);
    mocks.getPerformanceHistory.mockResolvedValue({ data: [], total: 0 });
    mocks.getPlatformStatistics.mockResolvedValue([]);
  });

  it("returns MaxCore's 503 from advertising autopilot recommendations", async () => {
    mocks.getAdvertisingAutopilot.mockRejectedValue(
      new mocks.MockMaxCoreControlError(
        "MaxCore account curriculum is unavailable for advertising generation",
        503,
      ),
    );
    const res = makeResponse();

    await getHandler(advertisingAutopilotRouter, "/recommend")(
      {
        user: { id: "creator-1" },
        body: { objective: "awareness", includeMultimodal: false },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "MaxCore advertising recommendations are unavailable",
      detail:
        "MaxCore account curriculum is unavailable for advertising generation",
    });
  });

  it("returns MaxCore's 503 from social learning recommendations", async () => {
    mocks.getRecommendations.mockRejectedValue(
      new mocks.MockMaxCoreControlError(
        "MaxCore account curriculum is unavailable for social autopilot",
        503,
      ),
    );
    const res = makeResponse();

    await getHandler(autopilotLearningRouter, "/recommendations")(
      { user: { id: "creator-1" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "MaxCore recommendations are unavailable",
      detail: "MaxCore account curriculum is unavailable for social autopilot",
    });
  });

  it("returns MaxCore's 503 from the social learning status endpoint", async () => {
    mocks.getRecommendations.mockRejectedValue(
      new mocks.MockMaxCoreControlError(
        "MaxCore account curriculum is unavailable for social autopilot",
        503,
      ),
    );
    const res = makeResponse();

    await getHandler(autopilotLearningRouter, "/status")(
      { user: { id: "creator-1" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "MaxCore autopilot learning status is unavailable",
      detail: "MaxCore account curriculum is unavailable for social autopilot",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  score: vi.fn(),
}));
vi.mock("../../services/contentVariantGenerator.js", () => ({
  contentVariantGeneratorService: { generateVariants: mocks.generate },
}));
vi.mock("../../services/viralScoring.js", () => ({
  viralScoringService: { scoreContent: mocks.score },
}));
vi.mock("../../services/timingOptimizer.js", () => ({ timingOptimizerService: {} }));
vi.mock("../../services/algorithmIntelligence.js", () => ({ algorithmIntelligenceService: {} }));
vi.mock("../../middleware/auth.js", () => ({ requireAuth: vi.fn() }));
vi.mock("../../middleware/errorHandler.js", () => ({ asyncHandler: (fn: unknown) => fn }));
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import router from "../organic.js";
import { AIUnavailableError } from "../../lib/aiSource.js";

const handle = (router as any).stack.find(
  (layer: any) => layer.route?.path === "/generate-variants",
).route.stack.at(-1).handle;

describe("organic generation without an optional prediction dependency", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns every MaxCore variant in order without calling a separate scorer", async () => {
    const variants = [
      { id: "first", caption: "Upstream first", hashtags: [] },
      { id: "second", caption: "Upstream second", hashtags: [] },
    ];
    mocks.generate.mockResolvedValue({ variants });
    mocks.score.mockRejectedValue(new AIUnavailableError("engagement prediction"));
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handle({
      user: { id: "fixture-owner" },
      body: { content: { caption: "New release", platform: "instagram" }, count: 2 },
    }, res);
    expect(mocks.score).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "fixture-owner" }), 2,
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      variants: variants.map(v => ({ ...v, viralScore: null, predictedReach: null })),
      winner: { ...variants[0], viralScore: null, predictedReach: null },
      statisticalConfidence: null,
    });
  });

  it("preserves explicit upstream generation unavailability", async () => {
    mocks.generate.mockRejectedValue(new AIUnavailableError("social generation"));
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handle({
      user: { id: "fixture-owner" },
      body: { content: { caption: "New release", platform: "instagram" } },
    }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
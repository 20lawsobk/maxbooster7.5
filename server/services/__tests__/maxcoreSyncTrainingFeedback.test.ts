import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMaxcoreOrigin: vi.fn(() => "https://maxcore.test"),
  getMaxcoreGenerationKey: vi.fn(() => "generation-secret"),
  getMaxcoreAdminHeaders: vi.fn(() => ({})),
  isPdimConfigured: vi.fn(() => false),
  getPdimClient: vi.fn(),
}));

vi.mock("../maxcoreConnector.js", () => ({
  getMaxcoreOrigin: mocks.getMaxcoreOrigin,
  getMaxcoreGenerationKey: mocks.getMaxcoreGenerationKey,
  getMaxcoreAdminHeaders: mocks.getMaxcoreAdminHeaders,
}));
vi.mock("../../lib/pdimClient.js", () => ({
  getPdimClient: mocks.getPdimClient,
  isPdimConfigured: mocks.isPdimConfigured,
}));
vi.mock("../../logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { pushTrainingFeedback } from "../maxcoreSync.js";

describe("MaxCore autopilot training feedback transport", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getMaxcoreOrigin.mockReturnValue("https://maxcore.test");
    mocks.getMaxcoreGenerationKey.mockReturnValue("generation-secret");
    mocks.getMaxcoreAdminHeaders.mockReturnValue({});
    mocks.isPdimConfigured.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          curriculum: "recorded",
          user_id: "admin-owner",
        }),
      }),
    );
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  it("sends the account identity and measured performance to MaxCore", async () => {
    await pushTrainingFeedback({
      user_id: "admin-owner",
      feedback_id: "learning-row-1",
      source: "autopilot_performance",
      trigger: "measured_autopilot_outcome",
      engagement_rate: 5,
      platform: "instagram",
      content_type: "advertising_campaign_post",
      hook_type: "story",
      media_type: "video",
      curriculum_hint: "reinforce_high_engagement_style",
      dispatched_at: "2026-11-17T12:00:00.000Z",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://maxcore.test/api/train/feedback");
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        user_id: "admin-owner",
        feedback_id: "learning-row-1",
        engagement_rate: 5,
        platform: "instagram",
        content_type: "advertising_campaign_post",
      }),
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer generation-secret",
    );
    expect(mocks.getPdimClient).not.toHaveBeenCalled();
  });

  it("rejects ownerless training signals instead of making them global", async () => {
    await expect(
      pushTrainingFeedback({
        user_id: "",
        source: "autopilot_performance",
        trigger: "measured_autopilot_outcome",
        engagement_rate: 0,
        platform: "instagram",
        content_type: "post",
        hook_type: "unknown",
        media_type: "unknown",
        curriculum_hint: "",
        dispatched_at: "2026-11-17T12:00:00.000Z",
      }),
    ).rejects.toThrow("requires an owner user_id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call an HTTP 200 an accepted training signal without curriculum acknowledgment", async () => {
    const rpush = vi.fn().mockResolvedValue(1);
    mocks.isPdimConfigured.mockReturnValue(true);
    mocks.getPdimClient.mockReturnValue({ rpush });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          curriculum: "not_recorded_ownerless",
          user_id: null,
        }),
      }),
    );

    await expect(
      pushTrainingFeedback({
        user_id: "admin-owner",
        source: "autopilot_performance",
        trigger: "measured_autopilot_outcome",
        engagement_rate: 5,
        platform: "instagram",
        content_type: "social_post",
        hook_type: "story",
        media_type: "video",
        curriculum_hint: "reinforce_high_engagement_style",
        dispatched_at: "2026-11-17T12:00:00.000Z",
      }),
    ).rejects.toThrow("remains pending in PDIM");
    expect(rpush).toHaveBeenCalledTimes(1);
  });
});

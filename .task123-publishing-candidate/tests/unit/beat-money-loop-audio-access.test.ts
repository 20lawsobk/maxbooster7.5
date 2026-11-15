import { describe, expect, it } from "vitest";
import {
  canAccessBeatMoneyLoopSourceAudio,
  getDistinctBeatMoneyLoopPreviewUrl,
} from "../../server/services/beatMoneyLoopAudioAccess.js";

describe("Beat Money Loop full-audio access", () => {
  it.each([
    ["listing owner", { ownerId: "owner", viewerId: "owner" }, true],
    ["admin", { ownerId: "owner", viewerId: "admin", viewerRole: "admin" }, true],
    [
      "completed buyer",
      { ownerId: "owner", viewerId: "buyer", hasCompletedPurchase: true },
      true,
    ],
    ["anonymous visitor", { ownerId: "owner" }, false],
    ["unpaid visitor", { ownerId: "owner", viewerId: "visitor" }, false],
    [
      "visitor with incomplete purchase",
      {
        ownerId: "owner",
        viewerId: "visitor",
        hasCompletedPurchase: false,
      },
      false,
    ],
  ])("authorizes the full WAV only for %s", (_label, viewer, expected) => {
    expect(canAccessBeatMoneyLoopSourceAudio(viewer)).toBe(expected);
  });

  it("returns only a distinct preview URL for public use", () => {
    expect(
      getDistinctBeatMoneyLoopPreviewUrl(
        "beat-money-loop",
        "/api/marketplace/audio/source.wav",
        "/api/marketplace/audio/preview.wav",
      ),
    ).toBe("/api/marketplace/audio/preview.wav");
    expect(
      getDistinctBeatMoneyLoopPreviewUrl(
        "beat-money-loop",
        "/api/marketplace/audio/source.wav",
        "/api/marketplace/audio/source.wav",
      ),
    ).toBeNull();
    expect(
      getDistinctBeatMoneyLoopPreviewUrl(
        "beat-money-loop",
        "/api/marketplace/audio/source.wav",
        null,
      ),
    ).toBeNull();
  });
});
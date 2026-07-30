/**
 * Unit tests: content-dispatch health check regression guard.
 *
 * These tests lock down the two shapes that caused the content-dispatch job's
 * 60-second `getAIHealthStatus()` call to crash on restart:
 *
 *   1. SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies.general must be a
 *      non-empty string array (was accidentally an array-typed stub, causing
 *      ContentGenerator.generateHashtags to throw on `.forEach`).
 *
 *   2. ContentGenerator.generateCaption must return a non-empty caption
 *      without throwing for the minimal input the health check uses
 *      ({ platform: "twitter", tone: "casual" }).
 */

import { describe, it, expect } from "vitest";
import { SOCIAL_MEDIA_MUSIC_PATTERNS } from "../../shared/ml/training/musicIndustryTrainingData.js";
import { ContentGenerator } from "../../shared/ml/nlp/ContentGenerator.js";

describe("SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies.general", () => {
  it("is a non-empty string array", () => {
    const general = SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies?.general;
    expect(Array.isArray(general)).toBe(true);
    expect(general.length).toBeGreaterThan(0);
    for (const tag of general) {
      expect(typeof tag).toBe("string");
      expect(tag.length).toBeGreaterThan(0);
    }
  });

  it("has hashtagStrategies as an object (not an array)", () => {
    const strategies = SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies;
    expect(typeof strategies).toBe("object");
    expect(Array.isArray(strategies)).toBe(false);
  });
});

describe("ContentGenerator.generateCaption — health-check path", () => {
  it("returns a non-empty caption for { platform: 'twitter', tone: 'casual' } without throwing", () => {
    const generator = new ContentGenerator();
    const result = generator.generateCaption({ platform: "twitter", tone: "casual" });
    expect(result).toBeDefined();
    expect(typeof result.caption).toBe("string");
    expect(result.caption.trim().length).toBeGreaterThan(0);
  });

  it("result contains expected CaptionResult fields", () => {
    const generator = new ContentGenerator();
    const result = generator.generateCaption({ platform: "twitter", tone: "casual" });
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(Array.isArray(result.emojis)).toBe(true);
    expect(typeof result.characterCount).toBe("number");
    expect(typeof result.estimatedEngagement).toBe("number");
    expect(typeof result.toneMatch).toBe("number");
  });
});

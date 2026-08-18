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
import {
  SOCIAL_MEDIA_MUSIC_PATTERNS,
  getHashtagsForGenre,
} from "../../shared/ml/training/musicIndustryTrainingData.js";
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

  it.each([
    [{ platform: "twitter", tone: "casual" as const }],
    [{ platform: "instagram", tone: "promotional" as const, topic: "New Release", genre: "pop" }],
    [{ platform: "tiktok", tone: "energetic" as const, artistName: "Max", trackTitle: "Takeoff", contentType: "release" as const }],
    [{ platform: "youtube", tone: "professional" as const, maxLength: 180, includeHashtags: true, includeEmojis: true }],
  ])("supports caption parameters %j without throwing", (options) => {
    const generator = new ContentGenerator();
    const result = generator.generateCaption(options);
    expect(result.caption.trim().length).toBeGreaterThan(0);
    expect(result.characterCount).toBeLessThanOrEqual(
      options.maxLength ?? Number.POSITIVE_INFINITY,
    );
  });
});

describe("training-data parameter coverage", () => {
  it.each([
    ["hip-hop", "#HipHop"],
    ["pop", "#PopMusic"],
    ["electronic", "#ElectronicMusic"],
    ["unknown", "#NewMusic"],
  ])("getHashtagsForGenre(%s) returns stable tags", (genre, expectedTag) => {
    const tags = getHashtagsForGenre(genre);
    expect(tags).toContain(expectedTag);
    expect(tags).toContain("#NewMusic");
  });

  it.each([
    [{ genre: "hip-hop", topic: "Summer Anthem", platform: "instagram" as const, tone: "casual" as const, count: 4, trending: false }, 4],
    [{ genre: "pop", topic: "Late Night Drive", platform: "tiktok" as const, tone: "energetic" as const, count: 6, trending: true }, 6],
    [{ genre: "unknown", topic: "Studio Session", platform: "youtube" as const, tone: "professional" as const, count: 3, trending: false }, 3],
  ])("generateHashtags honors parameters %j", (options, expectedMax) => {
    const generator = new ContentGenerator();
    const tags = generator.generateHashtags(options);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(expectedMax);
    expect(tags.every((tag) => tag.startsWith("#"))).toBe(true);
  });
});

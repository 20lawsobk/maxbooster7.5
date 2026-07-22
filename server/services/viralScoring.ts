import { randomBytes } from "crypto";
import { logger } from "../logger.js";
import {
  getRedisClient,
  RedisClientType,
} from "../lib/redisConnectionFactory.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";

export interface ContentData {
  id?: string;
  caption: string;
  hashtags: string[];
  platform:
    | "tiktok"
    | "instagram"
    | "youtube"
    | "twitter"
    | "facebook"
    | "linkedin";
  contentType: "video" | "image" | "carousel" | "text" | "story" | "reel";
  mediaUrl?: string;
  duration?: number;
  hasAudio?: boolean;
  musicGenre?: string;
  targetAudience?: {
    ageRange: string;
    interests: string[];
    location?: string;
  };
  scheduledTime?: Date;
  userId?: string;
}

export interface ViralScore {
  overall: number;
  factors: {
    hookStrength: number;
    emotionalResonance: number;
    trendAlignment: number;
    hashtagOptimization: number;
    visualAppeal: number;
    audioQuality: number;
  };
  platformScores: {
    tiktok: number;
    instagram: number;
    youtube: number;
    twitter: number;
  };
  recommendations: string[];
  confidence: number;
  predictedEngagement: {
    likes: { min: number; max: number };
    shares: { min: number; max: number };
    comments: { min: number; max: number };
  };
}

export interface Improvement {
  id: string;
  category:
    | "hook"
    | "hashtags"
    | "timing"
    | "format"
    | "content"
    | "engagement";
  priority: "high" | "medium" | "low";
  suggestion: string;
  expectedImpact: number;
  implementation: string;
}

export interface VariantComparison {
  variants: Array<{
    id: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendedPlatform: string;
  }>;
  winner: string;
  reasoning: string;
  abTestRecommendation: {
    shouldTest: boolean;
    testDuration: number;
    sampleSize: number;
  };
}

class ViralScoringService {
  private readonly REDIS_TTL = 3600;
  private readonly CACHE_PREFIX = "viral:";

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  async scoreContent(content: ContentData): Promise<ViralScore> {
    const cacheKey = `${this.CACHE_PREFIX}score:${content.id || randomBytes(8).toString("hex")}`;

    const redis = await this.getRedis();
    if (redis && content.id) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {
        /* intentional: Redis cache miss → falls through to live calculation */
      }
    }

    // ── MaxCore primary scoring ──────────────────────────────────────────────
    const mcScore = await MaxCoreAIClient.infer<ViralScore>(
      "/api/infer/viral-score",
      {
        caption: content.caption,
        hashtags: content.hashtags,
        platform: content.platform,
        content_type: content.contentType,
        music_genre: content.musicGenre ?? null,
        has_audio: content.hasAudio ?? false,
        duration: content.duration ?? null,
        target_audience: content.targetAudience ?? null,
        scheduled_time: content.scheduledTime?.toISOString() ?? null,
      },
    );
    const score = requireMaxCore(mcScore, "viral scoring");
    // A non-null response missing the core scoring structure is still
    // unavailability — do not pass a malformed score downstream.
    if (typeof score.overall !== "number" || !score.factors) {
      throw new AIUnavailableError("viral scoring");
    }
    logger.info(
      `[ViralScore] MaxCore score: ${score.overall}/100 for ${content.platform}`,
      { contentId: content.id },
    );
    if (redis && content.id) {
      try {
        await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(score));
      } catch {
        /* best-effort */
      }
    }
    return score;
  }

  async predictViralPotential(content: ContentData): Promise<number> {
    const score = await this.scoreContent(content);
    return score.overall;
  }

  async suggestImprovements(content: ContentData): Promise<Improvement[]> {
    const score = await this.scoreContent(content);
    const improvements: Improvement[] = [];

    if (score.factors.hookStrength < 75) {
      improvements.push({
        id: randomBytes(8).toString("hex"),
        category: "hook",
        priority: score.factors.hookStrength < 50 ? "high" : "medium",
        suggestion:
          "Rewrite your opening to maximize curiosity gap or emotional investment",
        expectedImpact:
          18 + Math.round((75 - score.factors.hookStrength) * 0.35),
        implementation:
          'Best formats: "The #1 mistake..." | "Nobody tells you..." | "How I went from X to Y..." | "POV: you..."',
      });
    }

    if (score.factors.hashtagOptimization < 75) {
      improvements.push({
        id: randomBytes(8).toString("hex"),
        category: "hashtags",
        priority: score.factors.hashtagOptimization < 45 ? "high" : "medium",
        suggestion: "Restructure hashtag strategy for better discoverability",
        expectedImpact:
          12 + Math.round((75 - score.factors.hashtagOptimization) * 0.22),
        implementation:
          "Formula: 1-2 mega tags (#fyp/#viral) + 3-5 niche music tags + 1-2 community tags",
      });
    }

    if (score.factors.trendAlignment < 65) {
      improvements.push({
        id: randomBytes(8).toString("hex"),
        category: "content",
        priority: score.factors.trendAlignment < 40 ? "high" : "medium",
        suggestion: "Increase relevance to current music industry trends",
        expectedImpact: 22,
        implementation:
          'Top trending music content: studio sessions, beat reveals, "day in my life as an artist", music reaction videos',
      });
    }

    if (score?.factors.emotionalResonance < 65) {
      improvements?.push({
        id: randomBytes(8).toString("hex"),
        category: "engagement",
        priority: "medium",
        suggestion: "Increase emotional appeal and personal connection",
        expectedImpact: 14,
        implementation:
          "Share your journey, struggles, or wins honestly — vulnerability performs better than perfection",
      });
    }

    if (score?.factors.audioQuality < 65 && content?.platform === "tiktok") {
      improvements?.push({
        id: randomBytes(8).toString("hex"),
        category: "format",
        priority: "high",
        suggestion: "Prioritize original or trending audio",
        expectedImpact: 25,
        implementation:
          "Use sounds trending in <24h before they peak, or release original tracks as TikTok sounds for virality",
      });
    }

    improvements?.push({
      id: randomBytes(8).toString("hex"),
      category: "timing",
      priority: "low",
      suggestion: "Post during peak audience activity windows",
      expectedImpact: 10,
      implementation:
        "Use the timing optimizer for your platform and audience timezone — first 30 minutes determine viral trajectory",
    });

    return improvements?.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a?.priority] - priorityOrder[b?.priority];
    });
  }

  async compareVariants(variants: ContentData[]): Promise<VariantComparison> {
    const scoredVariants = await Promise?.all(
      variants?.map(async (variant) => {
        const score = await this.scoreContent(variant);
        return {
          variant,
          score,
          id: variant.id || randomBytes(8).toString("hex"),
        };
      }),
    );

    const comparison: VariantComparison = {
      variants: scoredVariants.map(({ id, score }) => ({
        id,
        score: score.overall,
        strengths: this.identifyStrengths(score),
        weaknesses: this.identifyWeaknesses(score),
        recommendedPlatform: this.getRecommendedPlatform(score?.platformScores),
      })),
      winner: "",
      reasoning: "",
      abTestRecommendation: {
        shouldTest: false,
        testDuration: 0,
        sampleSize: 0,
      },
    };

    const sortedVariants = [...scoredVariants].sort(
      (a, b) => b?.score.overall - a?.score.overall,
    );
    comparison.winner = sortedVariants[0].id;

    const topScore = sortedVariants[0].score?.overall;
    const secondScore = sortedVariants[1]?.score?.overall || 0;
    const scoreDifference = topScore - secondScore;

    if (scoreDifference < 8 && sortedVariants?.length > 1) {
      comparison.abTestRecommendation = {
        shouldTest: true,
        testDuration: 48, // 48h gives statistically significant data
        sampleSize: 500, // 500 views per variant minimum
      };
      comparison.reasoning = `Variants are statistically close (${topScore} vs ${secondScore}). A/B test recommended — post both within 2 hours and compare 48h metrics.`;
    } else {
      comparison.reasoning = `Variant ${comparison?.winner} has a clear advantage (+${scoreDifference} points). The stronger hook and ${sortedVariants[0].score?.factors.hookStrength > 70 ? "emotional resonance" : "trend alignment"} are the deciding factors.`;
    }

    return comparison;
  }

  private identifyStrengths(score: ViralScore): string[] {
    const strengths: string[] = [];
    if (score?.factors.hookStrength >= 75)
      strengths?.push("Strong scroll-stopping hook");
    if (score?.factors.emotionalResonance >= 70)
      strengths?.push("High emotional resonance");
    if (score?.factors.trendAlignment >= 70)
      strengths?.push("Well-aligned with current trends");
    if (score?.factors.hashtagOptimization >= 70)
      strengths?.push("Optimized hashtag strategy");
    if (score?.factors.visualAppeal >= 70)
      strengths?.push("Strong visual presentation");
    if (score?.factors.audioQuality >= 70)
      strengths?.push("Quality audio/music integration");
    if (score?.overall >= 80) strengths?.push("High viral potential overall");
    return strengths;
  }

  private identifyWeaknesses(score: ViralScore): string[] {
    const weaknesses: string[] = [];
    if (score?.factors.hookStrength < 50) weaknesses?.push("Weak opening hook");
    if (score?.factors.emotionalResonance < 45)
      weaknesses?.push("Low emotional resonance");
    if (score?.factors.trendAlignment < 45) weaknesses?.push("Not trend-aligned");
    if (score?.factors.hashtagOptimization < 50)
      weaknesses?.push("Suboptimal hashtag strategy");
    if (score?.factors.visualAppeal < 50)
      weaknesses?.push("Visual appeal needs improvement");
    if (score?.factors.audioQuality < 45)
      weaknesses?.push("Audio/music integration lacking");
    return weaknesses;
  }

  private getRecommendedPlatform(
    platformScores: ViralScore["platformScores"],
  ): string {
    return Object.entries(platformScores).reduce(
      (best, [platform, score]) =>
        score > (platformScores[best as keyof typeof platformScores] || 0)
          ? platform
          : best,
      "tiktok",
    );
  }
}

export const viralScoringService = new ViralScoringService();

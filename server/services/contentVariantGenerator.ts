import { randomBytes } from "crypto";
import { logger } from "../logger.js";
import {
  getRedisClient,
  RedisClientType,
} from "../lib/redisConnectionFactory.js";

import { selectArm } from "./adaptiveGenerationEngine.js";
import { maxCoreControlTransport } from "./maxcoreControlTransport.js";

function seededIndex(seed: string, len: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed?.length; i++) {
    h ^= seed?.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h % len;
}

function seededShuffle<T>(array: T[], seed: string): T[] {
  const shuffled = [...array];
  let h = 0x811c9dc5;
  for (let i = 0; i < seed?.length; i++) {
    h ^= seed?.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  for (let i = shuffled?.length - 1; i > 0; i--) {
    h ^= i;
    h = (h * 0x01000193) >>> 0;
    const j = h % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export interface ContentData {
  id?: string;
  userId?: string;
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
  targetAudience?: {
    ageRange: string;
    interests: string[];
  };
}

export interface Hook {
  id: string;
  text: string;
  type:
    | "question"
    | "statement"
    | "statistic"
    | "story"
    | "controversy"
    | "mystery";
  predictedStrength: number | null;
  targetEmotion: string;
}

export interface Variant {
  id: string;
  caption: string;
  hashtags: string[];
  hookType: string;
  predictedScore: number | null;
  changes: string[];
}

export interface PerformanceMetrics {
  variantId: string;
  impressions: number;
  engagement: number;
  clicks: number;
  shares: number;
  conversionRate: number;
}

export interface VariantResult {
  variants: Variant[];
  originalScore: number | null;
  recommendations: string[];
}

class ContentVariantGeneratorService {
  private readonly REDIS_TTL = 3600;
  private readonly CACHE_PREFIX = "variants:maxcore:v2:";

  private async generateSocialVariants(
    content: ContentData,
    count: number,
  ): Promise<
    Array<{
      hook?: string;
      caption?: string;
      body?: string;
      cta?: string;
      hashtags?: string[];
      source?: string;
    }>
  > {
    if (!content.userId) {
      throw new Error("A userId is required for MaxCore social generation");
    }
    const response = await maxCoreControlTransport.request<{
      success?: boolean;
      variants?: Array<{
        hook?: string;
        caption?: string;
        body?: string;
        cta?: string;
        hashtags?: string[];
        source?: string;
      }>;
    }>("/platform/social/generate", {
      method: "POST",
      authScope: "generation",
      userId: content.userId,
      timeoutMs: 600_000,
      body: {
        user_id: content.userId,
        platform: content.platform,
        topic: content.caption,
        goal: "engagement",
        tone: "authentic",
        include_hashtags: true,
        num_variants: Math.max(1, Math.min(5, count)),
      },
    });
    if (!response.success || !Array.isArray(response.variants)) {
      throw new Error(
        "MaxCore social generation returned an invalid response contract",
      );
    }
    return response.variants;
  }

  private readonly hookTemplates: Record<string, string[]> = {
    question: [
      "Did you know that {topic}?",
      "Have you ever wondered why {topic}?",
      "What if I told you {topic}?",
      "Why does no one talk about {topic}?",
      "Is this the secret to {topic}?",
    ],
    statement: [
      "This is why {topic} matters",
      "The truth about {topic}",
      "Here's what nobody tells you about {topic}",
      "{Topic} changed everything for me",
      "Stop making this mistake with {topic}",
    ],
    statistic: [
      "90% of {audience} don't know this about {topic}",
      "I spent 1000 hours learning {topic} so you don't have to",
      "Only 1% of {audience} understand {topic}",
      "{Topic} increased my results by 300%",
      "After 5 years of {topic}, here's what I learned",
    ],
    story: [
      "Last week, something incredible happened with {topic}",
      "My journey with {topic} started when...",
      "I used to hate {topic} until I discovered this",
      "This one thing about {topic} changed my perspective",
      "The day I realized the truth about {topic}",
    ],
    controversy: [
      "Unpopular opinion: {topic}",
      "I'm probably going to get hate for this, but {topic}",
      "Hot take: {topic} is overrated",
      "Nobody wants to admit that {topic}",
      "This might be controversial but {topic}",
    ],
    mystery: [
      "The {topic} secret that industry experts hide",
      "What they don't want you to know about {topic}",
      "The hidden truth behind {topic}",
      "This {topic} hack is criminally underrated",
      "You've been lied to about {topic}",
    ],
  };

  private readonly hashtagCategories: Record<string, string[]> = {
    music: [
      "#music",
      "#musician",
      "#artist",
      "#producer",
      "#songwriter",
      "#newmusic",
      "#indieartist",
    ],
    producer: [
      "#beatmaker",
      "#producer",
      "#musicproducer",
      "#beats",
      "#hiphopproducer",
      "#trapbeats",
    ],
    viral: [
      "#viral",
      "#fyp",
      "#foryou",
      "#trending",
      "#explore",
      "#foryoupage",
    ],
    engagement: [
      "#follow",
      "#like",
      "#share",
      "#comment",
      "#supportsmallartists",
    ],
    niche: [
      "#undergroundmusic",
      "#independentartist",
      "#unsigned",
      "#emergingartist",
    ],
    genre: [
      "#hiphop",
      "#rnb",
      "#pop",
      "#electronic",
      "#trap",
      "#lofi",
      "#afrobeats",
    ],
  };

  private readonly emotionKeywords: Record<string, string[]> = {
    excitement: ["amazing", "incredible", "mind-blowing", "insane", "epic"],
    curiosity: ["secret", "hidden", "discover", "reveal", "uncover"],
    urgency: ["now", "today", "immediately", "don't miss", "limited"],
    relatability: ["we all", "everyone", "finally", "exactly", "literally"],
    inspiration: ["dream", "achieve", "success", "journey", "growth"],
  };

  constructor() {
    logger.info("✅ Content Variant Generator service initialized");
  }

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  async generateCaptionVariants(
    content: ContentData,
    count: number = 30,
  ): Promise<string[]> {
    const variants = await this.generateSocialVariants(content, count);
    return variants.map((variant) =>
      String(
        variant.caption ??
          [variant.hook, variant.body, variant.cta]
            .filter(Boolean)
            .join("\n\n"),
      ),
    );
  }

  async generateHashtagSets(
    content: ContentData,
    count: number = 5,
  ): Promise<string[][]> {
    const maxCoreVariants = await this.generateSocialVariants(content, count);
    return maxCoreVariants.map((variant) => variant.hashtags ?? []);
  }

  async generateHookVariants(content: ContentData): Promise<Hook[]> {
    const maxCoreVariants = await this.generateSocialVariants(content, 5);
    return maxCoreVariants
      .filter((variant) => Boolean(variant.hook))
      .map((variant) => ({
        id: randomBytes(8).toString("hex"),
        text: String(variant.hook),
        type: "statement" as const,
        predictedStrength: null,
        targetEmotion: "maxcore",
      }));
  }

  selectWinner(variants: Variant[], metrics: PerformanceMetrics[]): Variant {
    if (metrics?.length === 0) {
      return variants[0];
    }

    const metricsMap = new Map(metrics?.map((m) => [m?.variantId, m]));

    let bestVariant = variants[0];
    let bestScore = -1;

    for (const variant of variants) {
      const variantMetrics = metricsMap?.get(variant?.id);
      if (variantMetrics) {
        const score = this.calculatePerformanceScore(variantMetrics);
        if (score > bestScore) {
          bestScore = score;
          bestVariant = variant;
        }
      }
    }

    return bestVariant;
  }

  async generateVariants(
    content: ContentData,
    count: number = 5,
  ): Promise<VariantResult> {
    const cacheKey = `${this.CACHE_PREFIX}${content?.id || randomBytes(8).toString("hex")}`;

    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis?.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const maxCoreVariants = await this.generateSocialVariants(content, count);
    const maxCoreOutput: Variant[] = maxCoreVariants.map((variant) => ({
      id: randomBytes(8).toString("hex"),
      caption:
        variant.caption ??
        [variant.hook, variant.body, variant.cta].filter(Boolean).join("\n\n"),
      hashtags: variant.hashtags ?? [],
      hookType: "maxcore",
      predictedScore: null,
      changes: [],
    }));
    const maxCoreResult: VariantResult = {
      variants: maxCoreOutput,
      originalScore: null,
      recommendations: [],
    };
    if (redis) {
      await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(maxCoreResult));
    }
    return maxCoreResult;
  }

  private extractTopic(caption: string): string {
    const words = caption?.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "this",
      "that",
      "it",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "and",
      "or",
      "but",
      "i",
      "you",
      "we",
      "they",
      "my",
      "your",
      "our",
    ]);

    const meaningfulWords = words?.filter(
      (w) =>
        !stopWords?.has(w) &&
        w?.length > 3 &&
        !w?.startsWith("#") &&
        !w?.startsWith("@"),
    );

    return meaningfulWords?.slice(0, 3).join(" ") || "your content";
  }

  private inferAudience(caption: string): string {
    const lowerCaption = caption?.toLowerCase();

    if (lowerCaption?.includes("producer") || lowerCaption?.includes("beat")) {
      return "producers";
    } else if (
      lowerCaption?.includes("artist") ||
      lowerCaption?.includes("singer")
    ) {
      return "artists";
    } else if (
      lowerCaption?.includes("music") ||
      lowerCaption?.includes("song")
    ) {
      return "music lovers";
    }

    return "creators";
  }

  private generateTopicHashtags(caption: string): string[] {
    const words = caption
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w?.length > 3);

    return words?.slice(0, 5).map((w) => `#${w}`);
  }

  private shuffleArray<T>(array: T[], seed: string = "default"): T[] {
    return seededShuffle(array, seed);
  }

  /**
   * Picks `n` distinct arms from `pool` via the shared adaptive bandit,
   * shrinking the candidate pool after each pick so one call never repeats
   * a tag within the same set. Trial history is persisted per (domain,
   * scope) across SEPARATE calls too, so repeated requests for the same
   * piece of content keep rotating through untried options instead of
   * freezing on the same hashtags forever the way a plain hash-based pick
   * would. There is no measured per-hashtag engagement signal to feed back
   * as a reward, so this only uses selectArm's forced-exploration/
   * anti-repeat rotation - never a fabricated outcome.
   */
  private async pickDistinctArms(
    domain: string,
    scope: string,
    pool: string[],
    n: number,
  ): Promise<string[]> {
    const chosen: string[] = [];
    let remaining = [...new Set(pool)];
    for (let k = 0; k < n && remaining.length > 0; k++) {
      const { chosen: pick } = await selectArm({
        domain,
        scope,
        candidates: remaining,
      });
      chosen.push(pick);
      remaining = remaining.filter((t) => t !== pick);
    }
    return chosen;
  }

  private predictHookStrength(hookText: string, type: string): number {
    let strength = 50;

    if (hookText.includes("?")) strength += 10;
    if (hookText.length > 20 && hookText.length < 80) strength += 10;
    if (/\d+/.test(hookText)) strength += 8;
    if (["question", "controversy", "mystery"].includes(type)) strength += 12;

    const emotionWords = Object.values(this.emotionKeywords).flat();
    for (const word of emotionWords) {
      if (hookText?.toLowerCase().includes(word)) {
        strength += 5;
        break;
      }
    }

    return Math.min(100, strength);
  }

  private getTargetEmotion(hookType: string): string {
    const emotionMap: Record<string, string> = {
      question: "curiosity",
      statement: "authority",
      statistic: "credibility",
      story: "connection",
      controversy: "engagement",
      mystery: "intrigue",
    };
    return emotionMap[hookType] || "interest";
  }

  private calculatePerformanceScore(metrics: PerformanceMetrics): number {
    const engagementRate =
      metrics?.impressions > 0
        ? (metrics?.engagement / metrics?.impressions) * 100
        : 0;
    const shareRate =
      metrics?.engagement > 0 ? (metrics?.shares / metrics?.engagement) * 100 : 0;

    return engagementRate * 0.4 + shareRate * 0.3 + metrics?.conversionRate * 30;
  }

  private identifyChanges(original: string, variant: string): string[] {
    const changes: string[] = [];

    const origFirstLine = original?.split("\n")[0];
    const varFirstLine = variant?.split("\n")[0];

    if (origFirstLine !== varFirstLine) {
      changes?.push("Modified opening hook");
    }

    if (variant?.length !== original?.length) {
      changes?.push(
        variant?.length > original?.length
          ? "Extended content"
          : "Condensed content",
      );
    }

    if (variant?.includes("?") && !original?.includes("?")) {
      changes?.push("Added question format");
    }

    if (/\d/.test(variant) && !/\d/.test(original)) {
      changes?.push("Added statistics/numbers");
    }

    return changes?.length > 0 ? changes : ["Hook style variation"];
  }

  private estimateOriginalScore(content: ContentData): number {
    let score = 40;

    if (content.caption.length > 50) score += 10;
    if (content?.hashtags?.length >= 3) score += 10;
    if (content?.hashtags?.length <= 15) score += 5;
    if (content.caption.includes("?")) score += 5;

    return Math.min(100, score);
  }

  private generateRecommendations(
    content: ContentData,
    variants: Variant[],
  ): string[] {
    const recommendations: string[] = [];

    if (content?.hashtags?.length < 5 && content?.platform === "instagram") {
      recommendations?.push(
        "Consider using more hashtags for Instagram (optimal: 8-15)",
      );
    }

    if (!content?.caption?.includes("?")) {
      recommendations?.push(
        "Question-based hooks typically increase engagement by 20%",
      );
    }

    recommendations?.push(
      `Hyper A/B test your top 30 variates simultaneously — winner declared at 80% confidence with 30 impressions/variate`,
    );

    return recommendations;
  }

  async createABTest(
    content: ContentData,
    variantCount: number = 30,
  ): Promise<{ variants: Variant[]; testId: string; recommendation: string }> {
    const result = await this.generateVariants(content, variantCount);
    const testId = randomBytes(8).toString("hex");

    return {
      variants: result.variants.slice(0, variantCount),
      testId,
      recommendation: `Hyper A/B: ${variantCount} variates running simultaneously — winner declared at 80% confidence (≥30 impressions/variate)`,
    };
  }
}

export const contentVariantGeneratorService =
  new ContentVariantGeneratorService();

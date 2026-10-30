import { randomBytes } from "crypto";
import { logger } from "../logger.js";
import {
  getRedisClient,
  RedisClientType,
} from "../lib/redisConnectionFactory.js";

import { maxCoreControlTransport } from "./maxcoreControlTransport.js";

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

  private calculatePerformanceScore(metrics: PerformanceMetrics): number {
    const engagementRate =
      metrics?.impressions > 0
        ? (metrics?.engagement / metrics?.impressions) * 100
        : 0;
    const shareRate =
      metrics?.engagement > 0 ? (metrics?.shares / metrics?.engagement) * 100 : 0;

    return engagementRate * 0.4 + shareRate * 0.3 + metrics?.conversionRate * 30;
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

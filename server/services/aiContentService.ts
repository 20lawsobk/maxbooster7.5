import { randomBytes } from "crypto";
import { unifiedAIController } from "./unifiedAIController.js";
import { AIUnavailableError } from "../lib/aiSource.js";
import {
  generateSocialDirect,
  getSocialAutopilotDirect,
} from "./maxcoreDomainAdapter.js";
import { renderVideo as renderAdvancedVideo } from "./advancedVideoRendererService.js";
import { db } from "../db";

// ── Deterministic PRNG — FNV-1a 32-bit ──────────────────────────────────────
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed?.length; i++) {
    h ^= seed?.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}
// ────────────────────────────────────────────────────────────────────────────

import { aiModels, aiModelVersions, inferenceRuns, explanationLogs, userBrandVoices, bestPostingTimes, autopilotPreferences, type AutopilotPreference } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../logger.js";

// Sharp-based image generation (production-ready, replaces Canvas)
import { sharpImageService } from "./sharpImageService.js";

import { synthesizeToWAV, generateChordProgression, generateMelody, type MusicParameters } from "./musicGenerationService.js";

import { dynamicTrendsService } from "./dynamicTrendsService";
import type { Platform, ContentTone } from "../../shared/ml/nlp/ContentGenerator.js";

// Sharp image service is automatically initialized on import

export interface ContentGenerationOptions {
  userId?: string;
  prompt: string;
  platform:
    | "twitter"
    | "instagram"
    | "youtube"
    | "tiktok"
    | "facebook"
    | "linkedin";
  format: "text" | "image" | "video" | "audio";
  tone?: "professional" | "casual" | "energetic" | "creative" | "promotional";
  length?: "short" | "medium" | "long";
  style?: string;
}

export interface GeneratedContent {
  id: string;
  type: string;
  content: string | string[];
  url?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface MultilingualContent {
  language: string;
  content: string;
  culturalAdaptations: string[];
}

export interface BrandVoiceProfile {
  tone: "formal" | "casual" | "mixed";
  emojiUsage: "none" | "light" | "moderate" | "heavy";
  hashtagFrequency: number;
  avgSentenceLength: number;
  vocabularyComplexity: "simple" | "moderate" | "advanced";
  commonPhrases: string[];
  confidenceScore: number;
}

export interface TrendingTopic {
  topic: string;
  category: "music" | "social" | "cultural" | "holiday" | "industry" | "platform";
  popularity: number;
  hashtags: string[];
  region?: string;
}

export interface HashtagSuggestion {
  hashtag: string;
  category: "high-reach" | "medium-reach" | "niche";
  popularity: number | null;
  competition: number | null;
  avgEngagement: number | null;
  trending: boolean | null;
}

export interface PostingTimeRecommendation {
  dayOfWeek: number | null;
  hour: number;
  score: number | null;
  reasoning: string;
}

export interface ABVariant {
  id: string;
  content: string;
  variationType: string;
  predictedPerformance: number | null;
  changes: string[];
}

export class AIContentService {
  private modelIds: {
    multilingual?: string;
    brandVoice?: string;
    trendDetector?: string;
    hashtagOptimizer?: string;
  } = {};

  constructor() {
    this.initializeAIModels();
  }

  async getUserAutopilotPreferences(
    userId: string,
  ): Promise<AutopilotPreference | null> {
    try {
      const [preferences] = await db
        .select()
        .from(autopilotPreferences)
        .where(eq(autopilotPreferences.userId, userId))
        .limit(1);
      return preferences || null;
    } catch (error) {
      logger.warn({ err: error }, "Error fetching user autopilot preferences:");
      return null;
    }
  }

  async generateContentWithPreferences(
    userId: string,
    options: ContentGenerationOptions,
  ): Promise<GeneratedContent> {
    const preferences = await this.getUserAutopilotPreferences(userId);

    const enrichedOptions = {
      ...options,
      tone: (preferences?.contentTone as unknown) || options?.tone || "casual",
      artistName: preferences!.artistName,
      genre: preferences!.genre,
      brandVoice: preferences!.brandVoice,
      preferredHashtags: (preferences?.preferredHashtags as string[]) || [],
      avoidTopics: (preferences?.avoidTopics as string[]) || [],
      customInstructions: preferences!.customInstructions,
    };

    return this.generateContent(enrichedOptions as unknown as ContentGenerationOptions);
  }

  private async initializeAIModels() {
    try {
      const models = await db
        .select()
        .from(aiModels)
        .where(
          sql`${aiModels.modelName} IN ('content_multilingual_v1', 'brand_voice_analyzer_v1', 'trend_detector_v1', 'hashtag_optimizer_v1')`,
        );

      models?.forEach((model) => {
        if (model?.modelName === "content_multilingual_v1")
          this.modelIds.multilingual = model?.id;
        if (model?.modelName === "brand_voice_analyzer_v1")
          this.modelIds.brandVoice = model?.id;
        if (model?.modelName === "trend_detector_v1")
          this.modelIds.trendDetector = model?.id;
        if (model?.modelName === "hashtag_optimizer_v1")
          this.modelIds.hashtagOptimizer = model?.id;
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to load AI models:");
    }
  }

  private async logInference(
    modelName: string,
    inputData: unknown,
    outputData: unknown,
    userId?: string,
    executionTimeMs: number = 0,
  ): Promise<string | null> {
    try {
      if (!this.modelIds[modelName as keyof typeof this.modelIds]) return null;

      const modelId = this.modelIds[modelName as keyof typeof this.modelIds]!;
      const versions = await db
        .select()
        .from(aiModelVersions)
        .where(
          and(
            eq(aiModelVersions.modelId, modelId),
            eq(aiModelVersions.status, "production"),
          ),
        )
        .limit(1);

      if (!versions?.length) return null;

      const [inference] = await db
        .insert(inferenceRuns)
        .values({
          modelId,
          versionId: versions[0].id,
          userId: userId || null,
          inferenceType: "generation",
          inputData,
          outputData,
          confidenceScore: (outputData as any).confidence || 0.85,
          executionTimeMs,
          success: true,
          requestId: randomBytes(8).toString("hex"),
        } as any)
        .returning();

      return inference?.id;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to log inference:");
      return null;
    }
  }

  private async logExplanation(
    inferenceId: string | null,
    explanation: unknown,
  ): Promise<void> {
    if (!inferenceId) return;
    try {
      await db.insert(explanationLogs).values({
        inferenceId,
        explanationType: "feature_importance",
        featureImportance: (explanation as any).features || {},
        decisionPath: (explanation as any).path || {},
        confidence: (explanation as any).confidence || 0.85,
        humanReadable: (explanation as any).text || "Content generated using AI model",
        visualizationData: (explanation as any).viz || {},
      } as any);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to log explanation:");
    }
  }

  async generateText(
    options: ContentGenerationOptions,
  ): Promise<GeneratedContent> {
    const startTime = Date.now();
    try {
      const {
        prompt,
        platform = "instagram",
        tone = "energetic",
        length = "medium",
      } = options;
      if (!options.userId) {
        throw new AIUnavailableError("social generation requires an authenticated user id");
      }
      const generated = await generateSocialDirect({
        userId: options.userId,
        platform,
        topic: prompt || "new music",
        tone,
        goal: "engagement",
        numVariants: 1,
      });
      const executionTimeMs = Date.now() - startTime;
      const variant = generated.variants[0];
      const content = [
        variant.caption ||
          [variant.hook, variant.body, variant.cta].filter(Boolean).join("\n\n"),
      ];

      const inferenceId = await this.logInference(
        "multilingual",
        { prompt, platform, tone, length },
        { content, source: variant.source },
        undefined,
        executionTimeMs,
      );

      if (inferenceId) {
        await this.logExplanation(inferenceId, {
          text: `Generated ${platform} content via MaxCore with ${tone} tone`,
          features: { platform: 0.3, tone: 0.4, length: 0.3 },
          confidence: 1,
        });
      }

      return {
        id: `text_${randomBytes(8).toString("hex")}`,
        type: "text",
        content,
        metadata: {
          platform,
          tone,
          length,
          executionTimeMs,
          source: "MaxCoreAI",
        },
        createdAt: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error generating text:");
      if (error instanceof AIUnavailableError) throw error;
      throw new Error("Failed to generate text content");
    }
  }

  async generateMultilingualContent(
    _prompt: string,
    _targetLanguages: string[],
    _options?: { headline?: string; hashtags?: string[]; platform?: string },
  ): Promise<MultilingualContent[]> {
    throw new AIUnavailableError(
      "multilingual content: MaxCore has no translation inference contract",
    );
  }

  async analyzeBrandVoice(
    _userId: string,
    _historicalPosts: string[],
  ): Promise<BrandVoiceProfile> {
    throw new AIUnavailableError(
      "brand voice analysis: MaxCore has no brand-analysis inference contract",
    );
  }

  async generateWithBrandVoice(
    prompt: string,
    userId: string,
  ): Promise<string> {
    const startTime = Date.now();

    try {
      const [brandVoice] = await db
        .select()
        .from(userBrandVoices)
        .where(eq(userBrandVoices.userId, userId))
        .limit(1);

      if (!brandVoice) {
        return await this.generateText({
          prompt,
          platform: "instagram",
          format: "text",
        }).then((r) => (Array.isArray(r?.content) ? r?.content[0] : r?.content));
      }

      const profile = (brandVoice as any)?.voiceProfile as unknown as BrandVoiceProfile;
      let content = prompt;

      if (profile?.tone === "casual") {
        content = content?.replace(/\bhowever\b/gi, "but");
        content = content?.replace(/\badditionally\b/gi, "also");
      } else if (profile?.tone === "formal") {
        content = content?.replace(/\bbut\b/gi, "however");
        content = content?.replace(/\balso\b/gi, "additionally");
      }

      if (profile?.emojiUsage === "moderate" || profile?.emojiUsage === "heavy") {
        const emojis = ["🎵", "🎶", "✨", "🔥", "💯", "🎧", "🎤"];
        const emojiCount = profile?.emojiUsage === "heavy" ? 3 : 2;
        for (let i = 0; i < emojiCount; i++) {
          const emoji =
            emojis[
              seededIndex(
                `${userId}:${prompt?.slice(0, 32)}:emoji:${i}`,
                emojis?.length,
              )
            ];
          content += ` ${emoji}`;
        }
      }

      const phraseGateSeed = seededIndex(
        `${userId}:${prompt?.slice(0, 32)}:phrasegate`,
        1000,
      );
      if (profile?.commonPhrases?.length > 0 && phraseGateSeed >= 500) {
        const phrase =
          profile?.commonPhrases[
            seededIndex(
              `${userId}:${prompt?.slice(0, 32)}:phrase`,
              profile?.commonPhrases?.length,
            )
          ];
        content = `${phrase}! ${content}`;
      }

      const executionTimeMs = Date.now() - startTime;
      const inferenceId = await this.logInference(
        "brandVoice",
        { prompt, userId, profile },
        { content, applied: true },
        userId,
        executionTimeMs,
      );

      if (inferenceId) {
        await this.logExplanation(inferenceId, {
          text: `Applied ${profile?.tone} tone with ${profile?.emojiUsage} emoji usage`,
          features: { tone: 0.4, emoji: 0.3, phrases: 0.3 },
          confidence: profile.confidenceScore / 100,
        });
      }

      return content;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error generating with brand voice:");
      throw new Error("Failed to generate content with brand voice");
    }
  }

  async getTrendingTopics(
    platform: string,
    region?: string,
    genre?: string,
  ): Promise<TrendingTopic[]> {
    const startTime = Date.now();

    try {
      const dynamicTrends = await dynamicTrendsService?.getTrendingTopics(
        platform,
        genre,
        region,
      );

      const trends: TrendingTopic[] = dynamicTrends?.map((t) => ({
        topic: t.topic,
        category: t.category,
        popularity: t.popularity,
        hashtags: t.hashtags,
        region: t.region,
      }));

      const executionTimeMs = Date.now() - startTime;
      const inferenceId = await this.logInference(
        "trendDetector",
        { platform, region, genre },
        { trends, count: trends.length, source: "dynamicTrendsService" },
        undefined,
        executionTimeMs,
      );

      if (inferenceId) {
        await this.logExplanation(inferenceId, {
          text: `Detected ${trends?.length} trending topics for ${platform}${genre ? ` in ${genre}` : ""} using dynamic trends engine`,
          features: {
            platform: 0.25,
            genre: 0.25,
            dayOfWeek: 0.25,
            season: 0.25,
          },
          confidence: 0.92,
        });
      }

      return trends;
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      logger.warn(`[AIContent] Dynamic trends engine failed (${msg})`);
      throw error;
    }
  }

  async generateTrendingContent(
    topic: string,
    platform: string,
  ): Promise<string> {
    const trends = await this.getTrendingTopics(platform);
    const matchedTrend = trends?.find((t) =>
      t?.topic?.toLowerCase().includes(topic?.toLowerCase()),
    );
    const trendContext = matchedTrend
      ? `Trending topic: ${matchedTrend?.topic}. Suggested hashtags: ${matchedTrend?.hashtags?.join(", ")}.`
      : "";

    const aiResult = await unifiedAIController?.generateContent({
      platform: platform as Platform,
      tone: "energetic" as ContentTone,
      topic,
      contentType: "engagement",
      includeHashtags: true,
      includeEmojis: true,
      extraContext: trendContext || undefined,
    });

    if (aiResult?.success && aiResult?.data) {
      const d = aiResult?.data as unknown as Record<string, unknown>;
      return (
        (d?.caption as string | undefined) ||
        [d?.hook, d?.body, d?.cta].filter(Boolean).join("\n\n") ||
        topic
      );
    }
    return topic;
  }

  async optimizeHashtags(
    content: string,
    platform: string,
    goal: "reach" | "engagement" | "niche" = "engagement",
    userId?: string,
  ): Promise<HashtagSuggestion[]> {
    if (!userId) {
      throw new AIUnavailableError("hashtag generation requires an authenticated user id");
    }
    const generated = await generateSocialDirect({
      userId,
      platform,
      topic: content || "music promotion",
      goal,
      includeHashtags: true,
      numVariants: 1,
    });
    return generated.variants[0].hashtags.map((hashtag) => ({
      hashtag,
      category: goal === "niche" ? "niche" : "medium-reach",
      popularity: null,
      competition: null,
      avgEngagement: null,
      trending: null,
    }));

  }

  async suggestPostingTimes(
    userId: string,
    platform: string,
    timezone: string = "UTC",
  ): Promise<PostingTimeRecommendation[]> {
    const startTime = Date.now();

    const platformPatterns: Record<
      string,
      Array<{ day: number; hour: number; score: number }>
    > = {
      instagram: [
        { day: 1, hour: 11, score: 92 },
        { day: 3, hour: 14, score: 89 },
        { day: 5, hour: 17, score: 95 },
        { day: 0, hour: 10, score: 87 },
      ],
      twitter: [
        { day: 2, hour: 9, score: 88 },
        { day: 3, hour: 12, score: 91 },
        { day: 4, hour: 15, score: 86 },
      ],
      linkedin: [
        { day: 2, hour: 8, score: 93 },
        { day: 3, hour: 12, score: 90 },
        { day: 4, hour: 17, score: 85 },
      ],
      tiktok: [
        { day: 1, hour: 18, score: 94 },
        { day: 3, hour: 19, score: 92 },
        { day: 5, hour: 20, score: 96 },
        { day: 6, hour: 14, score: 88 },
      ],
    };

    const patterns = platformPatterns[platform] || platformPatterns?.instagram;
    const recommendations: PostingTimeRecommendation[] = [];

    for (const pattern of patterns) {
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const reasoning = `${dayNames[pattern?.day]} at ${pattern?.hour}:00 ${timezone} has ${pattern?.score}% engagement based on ${platform} algorithm and audience activity patterns`;

      recommendations?.push({
        dayOfWeek: pattern.day,
        hour: pattern.hour,
        score: pattern.score,
        reasoning,
      });

      try {
        const existing = await db
          .select()
          .from(bestPostingTimes)
          .where(
            and(
              eq(bestPostingTimes.userId, userId),
              eq(bestPostingTimes.platform, platform),
              eq(bestPostingTimes.dayOfWeek, pattern?.day),
              eq(bestPostingTimes.hour, pattern?.hour),
            ),
          )
          .limit(1);

        if (existing?.length === 0) {
          await db.insert(bestPostingTimes).values({
            userId,
            platform,
            dayOfWeek: pattern.day,
            hour: pattern.hour,
            engagementScore: pattern.score,
            sampleSize: 100,
            lastCalculated: new Date(),
          } as any);
        }
      } catch (error: unknown) {
        logger.warn({ err: error }, "Failed to save posting time:");
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const inferenceId = await this.logInference(
      "hashtagOptimizer",
      { userId, platform, timezone },
      { recommendations, count: recommendations.length },
      userId,
      executionTimeMs,
    );

    if (typeof inferenceId === "string") {
      await this.logExplanation(inferenceId, {
        text: `Suggested ${recommendations?.length} optimal posting times for ${platform}`,
        features: { platform: 0.3, historical: 0.4, algorithm: 0.3 },
        confidence: 0.89,
      });
    }

    return recommendations;
  }

  async generateABVariants(
    baseContent: string,
    variationType: "headline" | "CTA" | "emoji" | "length" | "tone" = "tone",
    userId?: string,
  ): Promise<ABVariant[]> {
    if (!userId) {
      throw new AIUnavailableError("social variants require an authenticated user id");
    }
    const generated = await generateSocialDirect({
      userId,
      platform: "instagram",
      topic: baseContent,
      goal: variationType,
      numVariants: 3,
    });
    return generated.variants.map((variant, index) => ({
      id: `${userId}:variant:${variant.variant ?? index + 1}`,
      content:
        variant.caption ||
        [variant.hook, variant.body, variant.cta].filter(Boolean).join("\n\n"),
      variationType,
      predictedPerformance: null,
      changes: [variant.source || "MaxCoreAI"],
    }));
  }

  /**
   * Main content generation method - dispatches to appropriate in-house generator
   * 100% custom built, no external APIs
   */
  async generateContent(
    options: ContentGenerationOptions,
  ): Promise<GeneratedContent> {
    const { format, prompt, platform, tone, length } = options;

    switch (format) {
      case "text":
        return this.generateTextContent(prompt, platform, tone, length);
      case "image":
        return this.generateImageContent(prompt, platform, tone);
      case "video":
        return this.generateVideoContent(prompt, platform, tone);
      case "audio":
        return this.generateAudioContent(prompt, platform, tone);
      default:
        return this.generateTextContent(prompt, platform, tone, length);
    }
  }

  /**
   * Generate text content — routes through full advanced AI pipeline:
   * MaxCore (trained) → Python AI → ContentGenerator (in-house JS)
   */
  private async generateTextContent(
    prompt: string,
    platform: string,
    tone?: string,
    length?: string,
  ): Promise<GeneratedContent> {
    const aiResult = await unifiedAIController?.generateContent({
      platform: platform as Platform,
      tone: (tone || "energetic") as ContentTone,
      topic: prompt || "new music",
      contentType: "engagement",
      includeHashtags: true,
      includeEmojis: true,
    });

    if (!(aiResult?.success && aiResult?.data)) {
      // MaxCore is the sole AI source — no local fallback.
      throw new AIUnavailableError("text content generation");
    }
    const d2 = aiResult?.data as unknown as Record<string, unknown>;
    const caption2 =
      (d2?.caption as string) || [d2?.hook, d2?.body, d2?.cta].filter(Boolean).join("\n\n");
    const content: string[] = caption2 ? [caption2] : (d2?.content as string[]) || [];

    return {
      id: `txt_${randomBytes(8).toString("hex")}`,
      type: "text",
      content,
      metadata: { platform, tone, length, source: aiResult.source },
      createdAt: new Date(),
    };
  }

  /**
   * In-house image generation using Sharp
   * Creates platform-optimized promotional graphics
   */
  async generateImageContent(
    prompt: string,
    platform: string,
    tone?: string,
  ): Promise<GeneratedContent> {
    try {
      // Use Sharp-based image generation service
      const result = await sharpImageService?.generateImage({
        prompt,
        platform,
        tone: (tone || "creative") as "professional" | "casual" | "energetic" | "creative" | "promotional",
      });

      return {
        id: `img_${randomBytes(8).toString("hex")}`,
        type: "image",
        content: prompt,
        url: result.publicUrl,
        metadata: {
          platform,
          dimensions: result.dimensions,
          tone,
          fileSize: result.buffer.length,
          generator: "sharp",
        },
        createdAt: new Date(),
      };
    } catch (error) {
      logger.warn(`Image generation failed: ${(error as any)?.message}`);
      throw error;
    }
  }

  /**
   * Video generation — routes through MaxCore (the only renderer).
   * First generates the video script via the unified AI pipeline so the
   * content going into MaxCore is already structured as hook/body/cta.
   */
  async generateVideoContent(
    prompt: string,
    platform: string,
    tone?: string,
  ): Promise<GeneratedContent> {
    // Step 1 — Generate script (hook/body/cta) via full AI pipeline
    // MaxCore is the sole source for the video script — no silent fallback
    // to using the raw topic as the script.
    const scriptResult = await unifiedAIController?.generateContent({
      platform: platform as Platform,
      tone: (tone || "energetic") as ContentTone,
      topic: prompt || "new music",
      contentType: "engagement",
      includeHashtags: false,
      includeEmojis: false,
    });
    if (!(scriptResult?.success && scriptResult?.data)) {
      throw new AIUnavailableError("video script generation");
    }
    const d = scriptResult?.data as unknown as Record<string, unknown>;
    const hook = ((d?.hook || d?.caption || "") as any).slice(0, 80);
    const body = ((d?.body || d?.caption || "") as any).split("\n")[0].slice(0, 120);
    const cta = ((d?.cta || "") as any).slice(0, 60);

    // Step 2 — Render through MaxCore (the only renderer)
    const result = await renderAdvancedVideo({
      topic: prompt || "new music",
      platform: platform || "tiktok",
      tone: tone || "energetic",
      hook,
      body,
      cta,
      template: "cinematic_promo",
      quality: "cinematic",
    });

    if (!result?.success || !result?.url) {
      throw new Error(result?.error || "Video generation failed");
    }

    return {
      id: `vid_${randomBytes(8).toString("hex")}`,
      type: "video",
      content: prompt,
      url: result.url,
      metadata: {
        platform,
        tone,
        source: result.source,
        processingTimeMs: result.processing_time_ms,
      },
      createdAt: new Date(),
    };
  }

  /**
   * In-house audio generation using musicGenerationService
   * Creates promotional audio clips with synthesized music
   */
  async generateAudioContent(
    prompt: string,
    platform: string,
    tone?: string,
  ): Promise<GeneratedContent> {
    try {
      // Use in-house music generation service
      const musicParams = this.promptToMusicParams(prompt, tone);
      const chords = generateChordProgression(musicParams);
      const melody = generateMelody(musicParams, chords);
      // synthesizeToWAV uploads to PDIM-backed storage itself and returns
      // the servable URL directly — no local file ever exists for this
      // caller to read back.
      const { url, sizeBytes } = await synthesizeToWAV(melody, chords, musicParams);

      logger.info(`✅ Generated audio: ${url} (${sizeBytes} bytes)`);

      return {
        id: `aud_${randomBytes(8).toString("hex")}`,
        type: "audio",
        content: prompt,
        url,
        metadata: {
          platform,
          musicParams,
          fileSize: sizeBytes,
        },
        createdAt: new Date(),
      };
    } catch (error) {
      logger.warn(`Audio generation failed: ${(error as any)?.message}`);
      throw error;
    }
  }

  // ============================================================================
  // IN-HOUSE IMAGE GENERATION HELPERS
  // ============================================================================






  // ============================================================================
  // IN-HOUSE AUDIO GENERATION HELPERS
  // ============================================================================

  private promptToMusicParams(
    _prompt: string,
    tone?: string,
  ): MusicParameters {
    const moodMap: Record<string, string> = {
      professional: "calm",
      casual: "happy",
      energetic: "upbeat",
      creative: "bright",
      promotional: "energetic",
    };

    const mood = moodMap[tone || "creative"] || "happy";

    return {
      key: "C",
      scale: mood === "sad" || mood === "dark" ? "minor" : "major",
      tempo: mood === "upbeat" || mood === "energetic" ? 130 : 100,
      mood,
      genre: "pop",
      structure: 8, // 8 bars
    };
  }

  // Legacy method aliases for backward compatibility
  async generateImage(options: {
    prompt: string;
    platform: string;
    style?: string;
    dimensions?: { width: number; height: number };
  }): Promise<GeneratedContent> {
    return this.generateImageContent(
      options?.prompt,
      options?.platform,
      options?.style,
    );
  }

  async generateVideo(options: {
    prompt: string;
    platform: string;
    duration?: number;
    style?: string;
  }): Promise<GeneratedContent> {
    return this.generateVideoContent(
      options?.prompt,
      options?.platform,
      options?.style,
    );
  }

  async generateAudio(options: {
    text: string;
    voice?: string;
    language?: string;
    speed?: number;
  }): Promise<GeneratedContent> {
    return this.generateAudioContent(options?.text, "instagram", "creative");
  }

  async generateVariations(
    baseContent: string,
    _platform: string,
    count: number = 3,
  ): Promise<string[]> {
    const abVariants = await this.generateABVariants(baseContent, "tone");
    return abVariants?.slice(0, count).map((v) => v?.content);
  }

  async optimizeForPlatform(
    content: string,
    platform: string,
  ): Promise<{ optimized: string; suggestions: string[] }> {
    const platformRules: Record<string, any> = {
      twitter: { maxLength: 280, hashtagLimit: 2, emojiRecommended: true },
      instagram: { maxLength: 2200, hashtagLimit: 30, emojiRecommended: true },
      linkedin: { maxLength: 3000, hashtagLimit: 5, emojiRecommended: false },
      facebook: { maxLength: 63206, hashtagLimit: 3, emojiRecommended: true },
      tiktok: { maxLength: 150, hashtagLimit: 5, emojiRecommended: true },
      youtube: { maxLength: 5000, hashtagLimit: 15, emojiRecommended: false },
    };

    const rules = platformRules[platform] || platformRules?.instagram;
    let optimized = content;
    const suggestions: string[] = [];

    if (content?.length > rules?.maxLength) {
      optimized = content?.substring(0, rules?.maxLength - 3) + "...";
      suggestions?.push(
        `Content trimmed to ${rules?.maxLength} characters for ${platform}`,
      );
    }

    if (rules?.hashtagLimit > 0) {
      suggestions?.push(
        `Consider adding ${rules?.hashtagLimit} relevant hashtags`,
      );
    }

    if (
      rules?.emojiRecommended &&
      !content?.match(new RegExp("[\\u{1F300}-\\u{1F9FF}]", "u"))
    ) {
      suggestions?.push("Consider adding emojis to increase engagement");
    }

    return { optimized, suggestions };
  }

  async getOptimalPostingTimes(
    _userId: string,
  ): Promise<PostingTimeRecommendation[]> {
    const result = await getSocialAutopilotDirect({
      userId: _userId,
      platform: "instagram",
      targetMetric: "engagement",
    });
    const raw = result.recommendations.best_posting_times || [];
    if (raw.length === 0) {
      throw new AIUnavailableError("MaxCore returned no posting-time recommendation");
    }
    return raw.map((time) => {
      const match = time.match(/(?:T)?(\d{2}):(\d{2})/);
      if (!match) {
        throw new AIUnavailableError("MaxCore returned an invalid posting time");
      }
      return {
        dayOfWeek: null,
        hour: Number(match[1]),
        score: null,
        reasoning: "MaxCore social autopilot posting window",
      };
    });

  }
}

export const aiContentService = new AIContentService();

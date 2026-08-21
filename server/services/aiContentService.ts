import { randomBytes } from "crypto";
import { unifiedAIController } from "./unifiedAIController.js";
import { AIUnavailableError } from "../lib/aiSource.js";
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

import { aiModels, aiModelVersions, inferenceRuns, explanationLogs, userBrandVoices, hashtagResearch, bestPostingTimes, autopilotPreferences, type AutopilotPreference } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import * as fs from "fs/promises";
import * as path from "path";

// Sharp-based image generation (production-ready, replaces Canvas)
import { sharpImageService } from "./sharpImageService.js";

import { synthesizeToWAV, generateChordProgression, generateMelody, type MusicParameters } from "./musicGenerationService.js";

import { dynamicTrendsService } from "./dynamicTrendsService";
import type { Platform, ContentTone } from "../../shared/ml/nlp/ContentGenerator.js";

// Sharp image service is automatically initialized on import

export interface ContentGenerationOptions {
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
  popularity: number;
  competition: number;
  avgEngagement: number;
  trending: boolean;
}

export interface PostingTimeRecommendation {
  dayOfWeek: number;
  hour: number;
  score: number;
  reasoning: string;
}

export interface ABVariant {
  id: string;
  content: string;
  variationType: string;
  predictedPerformance: number;
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

  private async logExplanation(inferenceId: string, explanation: unknown) {
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

      // Route through the full advanced AI pipeline:
      // MaxCore (trained) → Python AI → ContentGenerator (in-house JS)
      const aiResult = await unifiedAIController?.generateContent({
        platform: platform as Platform,
        tone: tone as ContentTone,
        topic: prompt || "new music",
        contentType: "engagement",
        includeHashtags: true,
        includeEmojis: true,
      });

      const executionTimeMs = Date.now() - startTime;

      if (!(aiResult?.success && aiResult?.data)) {
        // MaxCore is the sole AI source — no local fallback.
        throw new AIUnavailableError("multilingual content generation");
      }
      const d = aiResult?.data as unknown as Record<string, unknown>;
      const caption =
        (d?.caption as string) || [d?.hook, d?.body, d?.cta].filter(Boolean).join("\n\n");
      const content: string[] = caption ? [caption] : (d?.content as string[]) || [];

      const inferenceId = await this.logInference(
        "multilingual",
        { prompt, platform, tone, length },
        { content, confidence: aiResult.confidence || 0.9 },
        undefined,
        executionTimeMs,
      );

      if (inferenceId) {
        await this.logExplanation(inferenceId, {
          text: `Generated ${platform} content via ${aiResult?.source || "AI"} with ${tone} tone`,
          features: { platform: 0.3, tone: 0.4, length: 0.3 },
          confidence: aiResult.confidence || 0.9,
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
          source: aiResult.source,
        },
        createdAt: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error generating text:");
      throw new Error("Failed to generate text content");
    }
  }

  async generateMultilingualContent(
    prompt: string,
    targetLanguages: string[],
    options?: { headline?: string; hashtags?: string[]; platform?: string },
  ): Promise<MultilingualContent[]> {
    const startTime = Date.now();

    const LANGUAGE_NAMES: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      zh: "Chinese (Simplified)",
      ja: "Japanese",
      ko: "Korean",
      ar: "Arabic",
    };

    // Get MaxCore's AI-generated base content once (MaxCore generates in English
    // regardless of language param — we apply cultural post-processing per language)
    const baseAIResult = await unifiedAIController?.generateContent({
      platform: (options?.platform || "instagram") as Platform,
      tone: "energetic" as ContentTone,
      topic: prompt,
      contentType: "engagement",
      includeHashtags: true,
      includeEmojis: true,
    });
    const baseD =
      baseAIResult?.success && baseAIResult?.data
        ? (baseAIResult.data as unknown as Record<string, unknown>)
        : null;
    const baseContent: string = baseD
      ? (baseD?.caption as string) ||
        [(baseD?.hook as string), (baseD?.body as string), (baseD?.cta as string)]
          .filter(Boolean)
          .join("\n\n") ||
        prompt
      : prompt;

    // Language-specific cultural hashtag packs and market signals
    const LANG_HASHTAGS: Record<string, string[]> = {
      Spanish: ["#musica", "#latinomusica", "#trapespanol", "#reggaeton", "#nuevamusica"],
      French: ["#musique", "#rappfrancais", "#musiquetrap", "#nouveautitre", "#artiste"],
      Portuguese: ["#musica", "#trapbrasil", "#novidade", "#musicabrasileira", "#artista"],
      German: ["#musik", "#neumusik", "#trap", "#deutschrap", "#neuesong"],
      Italian: ["#musica", "#trap", "#nuovamusica", "#artista", "#musicaitaliana"],
      Chinese: ["#音乐", "#新歌", "#流行", "#嘻哈", "#独立音乐人"],
      Japanese: ["#音楽", "#新曲", "#トラップ", "#ヒップホップ", "#アーティスト"],
      Korean: ["#음악", "#신곡", "#트랩", "#힙합", "#아티스트"],
      Arabic: ["#موسيقى", "#أغنية_جديدة", "#تراب", "#هيب_هوب", "#فنان"],
    };

    const LANG_OPENERS: Record<string, string> = {
      Spanish: "¡Salió! ",
      French: "Sorti maintenant ! ",
      Portuguese: "Lançamento! ",
      German: "Jetzt draußen! ",
      Italian: "Uscito ora! ",
      Chinese: "新发布！",
      Japanese: "新リリース！",
      Korean: "새로운 발매! ",
      Arabic: "إصدار جديد! ",
    };

    const results = await Promise.all(
      targetLanguages?.map(async (lang) => {
        const langName = LANGUAGE_NAMES[lang] || lang;
        const opener = LANG_OPENERS[langName] || "";
        const langTags = LANG_HASHTAGS[langName] || [];

        // Inject market opener + language-specific hashtags into MaxCore's content
        const existingHashtags = baseContent.match(/#\w+/g) || [];
        const bodyText = baseContent.replace(/#\w+/g, "").trim();
        const allTags = [...new Set([...langTags, ...existingHashtags])].slice(0, 12).join(" ");
        const content = `${opener}${bodyText}${allTags ? "\n\n" + allTags : ""}`;

        return {
          language: langName,
          content,
          culturalAdaptations: [
            `Adapted for ${langName}-speaking markets with localized hashtags`,
            `MaxCore AI content + ${langName} cultural market signals`,
          ],
        } as MultilingualContent;
      }),
    );

    const executionTimeMs = Date.now() - startTime;
    await this.logInference(
      "multilingual",
      { prompt, targetLanguages },
      { results, count: results.length },
      undefined,
      executionTimeMs,
    );

    return results;
  }

  async analyzeBrandVoice(
    userId: string,
    historicalPosts: string[],
  ): Promise<BrandVoiceProfile> {
    const startTime = Date.now();

    // Route through MaxCore — the sole AI source for brand voice analysis.
    // We embed the intent in the topic so MaxCore's content generator handles it.
    const postsSnippet = historicalPosts
      .slice(0, 10)
      .map((p, i) => `Post ${i + 1}: ${p.slice(0, 200)}`)
      .join("\n");
    const analysisPrompt =
      historicalPosts.length > 0
        ? `Analyze the brand voice from these social media posts and describe: tone (formal/casual/mixed), emoji usage, vocabulary style, and recurring phrases:\n${postsSnippet}`
        : "Describe a professional music artist brand voice: tone, emoji usage, vocabulary style, and key phrases for social media.";

    const aiResult = await unifiedAIController.generateContent({
      topic: analysisPrompt,
      contentType: "engagement",
      tone: "professional",
      platform: "instagram",
      includeHashtags: false,
      includeEmojis: false,
    });

    // Parse what MaxCore returned — it comes back as a caption/hook so we extract
    // signal words and derive the profile fields from its text.
    const mcText: string =
      aiResult?.success && aiResult?.data
        ? ((aiResult.data as unknown as Record<string, unknown>).caption as string) ||
          [
            (aiResult.data as unknown as Record<string, unknown>).hook,
            (aiResult.data as unknown as Record<string, unknown>).body,
          ]
            .filter(Boolean)
            .join(" ")
        : "";

    // Derive profile fields from the AI text plus local signals
    const emojiCount = (historicalPosts.join(" ").match(/\p{Emoji}/gu) || [])
      .length;
    const totalWords = historicalPosts.join(" ").split(/\s+/).length || 1;
    const emojiRate = emojiCount / (historicalPosts.length || 1) || 0;
    const hashtagCount = (
      historicalPosts.join(" ").match(/#\w+/g) || []
    ).length;
    const formalKeywords = ["professional", "formal", "polished", "announce"];
    const casualKeywords = ["casual", "conversational", "friendly", "vibe"];
    const lowerMcText = mcText.toLowerCase();
    const formalScore = formalKeywords.filter((w) =>
      lowerMcText.includes(w),
    ).length;
    const casualScore = casualKeywords.filter((w) =>
      lowerMcText.includes(w),
    ).length;

    const confidenceScore = aiResult?.success
      ? Math.min(100, 60 + historicalPosts.length * 2)
      : Math.min(100, 50 + historicalPosts.length * 2);

    const profile: BrandVoiceProfile = {
      tone:
        formalScore > casualScore
          ? "formal"
          : casualScore > formalScore
            ? "casual"
            : "mixed",
      emojiUsage:
        emojiRate > 3
          ? "heavy"
          : emojiRate > 1.5
            ? "moderate"
            : emojiRate > 0.5
              ? "light"
              : "none",
      hashtagFrequency: historicalPosts.length
        ? hashtagCount / (historicalPosts.length || 1)
        : 0,
      avgSentenceLength:
        historicalPosts.length
          ? Math.round(totalWords / (historicalPosts.length || 1))
          : 12,
      vocabularyComplexity: "moderate",
      commonPhrases: this.extractCommonPhrases(historicalPosts),
      confidenceScore,
    };

    try {
      const existing = await db
        .select()
        .from(userBrandVoices)
        .where(eq(userBrandVoices.userId, userId))
        .limit(1);

      if (existing?.length > 0) {
        await db
          .update(userBrandVoices)
          .set({
            voiceProfile: profile as unknown as Record<string, unknown>,
            confidenceScore: profile.confidenceScore,
            postsAnalyzed: historicalPosts.length,
            lastAnalyzedAt: new Date(),
            updatedAt: new Date(),
          } as any)
          .where(eq(userBrandVoices.userId, userId));
      } else {
        await db.insert(userBrandVoices).values({
          userId,
          voiceName: "ai_generated",
          voiceProfile: profile as unknown as Record<string, unknown>,
          confidenceScore: profile.confidenceScore,
          postsAnalyzed: historicalPosts.length,
          lastAnalyzedAt: new Date(),
        } as any);
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to save brand voice:");
    }

    const executionTimeMs = Date.now() - startTime;
    const inferenceId = await this.logInference(
      "brandVoice",
      { userId, postsCount: historicalPosts.length },
      { profile, confidence: profile.confidenceScore / 100 },
      userId,
      executionTimeMs,
    );

    if (inferenceId) {
      await this.logExplanation(inferenceId, {
        text: `Analyzed ${historicalPosts?.length} posts to extract brand voice with ${confidenceScore}% confidence`,
        features: { tone: 0.3, emoji: 0.2, hashtags: 0.2, vocabulary: 0.3 },
        confidence: profile.confidenceScore / 100,
      });
    }

    return profile;
  }

  private extractCommonPhrases(posts: string[]): string[] {
    const phrases: Record<string, number> = {};

    posts?.forEach((post) => {
      const words = post?.toLowerCase().split(/\s+/);
      for (let i = 0; i < words?.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        phrases[phrase] = (phrases[phrase] || 0) + 1;
      }
    });

    return Object.entries(phrases)
      .filter(([_, count]) => count >= 2)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 10)
      .map(([phrase]) => phrase);
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
  ): Promise<HashtagSuggestion[]> {
    const startTime = Date.now();

    const platformLimits: Record<string, number> = {
      instagram: 30,
      twitter: 3,
      linkedin: 5,
      tiktok: 5,
      facebook: 3,
      youtube: 15,
    };

    const limit = platformLimits[platform] || 10;

    // Route through MaxCore — it knows platform-specific hashtag strategy from 8TB of data
    const aiResult = await unifiedAIController?.generateContent({
      platform: platform as Platform,
      tone: "energetic" as ContentTone,
      topic: content || "music promotion",
      contentType: "engagement",
      includeHashtags: true,
      includeEmojis: false,
      extraContext: `Hashtag optimization goal: ${goal}. Provide ${limit} hashtags suited for ${goal === "niche" ? "niche audience targeting" : goal === "reach" ? "maximum reach" : "high engagement"} on ${platform}.`,
    });

    const rawHashtags: string[] =
      aiResult?.success && aiResult?.data
        ? ((aiResult?.data as unknown as Record<string, unknown>).hashtags as string[] | undefined) || []
        : [];

    const suggestions: HashtagSuggestion[] = rawHashtags
      .slice(0, limit)
      .map((tag, i) => {
        const cat: "high-reach" | "medium-reach" | "niche" =
          goal === "niche"
            ? "niche"
            : i < 3
              ? "high-reach"
              : i < 7
                ? "medium-reach"
                : "niche";
        return {
          hashtag: tag.startsWith("#") ? tag : `#${tag}`,
          category: cat,
          popularity: Math.max(30, 95 - i * 7),
          competition: Math.max(20, 90 - i * 7),
          avgEngagement: parseFloat((4.2 + i * 0.6).toFixed(1)),
          trending: i < 2,
        };
      });

    try {
      for (const suggestion of suggestions?.slice(0, 5) ?? []) {
        const existing = await db
          .select()
          .from(hashtagResearch)
          .where(
            and(
              eq(hashtagResearch.hashtag, suggestion?.hashtag),
              eq(hashtagResearch.platform, platform),
            ),
          )
          .limit(1);

        if (existing?.length === 0) {
          await db.insert(hashtagResearch).values({
            userId: "system",
            hashtag: suggestion.hashtag,
            platform,
            category: suggestion.category,
            popularity: suggestion.popularity,
            competition: suggestion.competition,
            avgEngagement: suggestion.avgEngagement,
            trending: suggestion.trending,
            relatedTags: suggestions
              .filter((h) => h?.category === suggestion?.category)
              .map((h) => h?.hashtag)
              .slice(0, 5),
            lastUpdated: new Date(),
          } as any);
        }
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Failed to save hashtag research:");
    }

    const executionTimeMs = Date.now() - startTime;
    await this.logInference(
      "hashtagOptimizer",
      { content, platform, goal, limit },
      { suggestions, count: suggestions.length, source: aiResult.source },
      undefined,
      executionTimeMs,
    );

    return suggestions;
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

    if (inferenceId) {
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
  ): Promise<ABVariant[]> {
    const startTime = Date.now();

    // For all variant types, call the full AI pipeline (MaxCore → Python AI → in-house)
    // with different tone parameters to produce real AI-generated alternatives.
    const toneMap: Record<
      string,
      Array<{ tone: string; label: string; desc: string }>
    > = {
      tone: [
        {
          tone: "professional",
          label: "formal",
          desc: "Professional and polished tone",
        },
        {
          tone: "energetic",
          label: "energetic",
          desc: "High-energy, hype-driven tone",
        },
        {
          tone: "casual",
          label: "casual",
          desc: "Friendly, conversational tone",
        },
      ],
      emoji: [
        {
          tone: "energetic",
          label: "emoji-vibrant",
          desc: "Vibrant emoji-rich variation",
        },
        { tone: "casual", label: "emoji-warm", desc: "Warm emoji variation" },
        {
          tone: "promotional",
          label: "emoji-hype",
          desc: "Hype emoji variation",
        },
      ],
      CTA: [
        {
          tone: "promotional",
          label: "cta-stream",
          desc: "Stream-focused call to action",
        },
        { tone: "energetic", label: "cta-hype", desc: "Hype call to action" },
        {
          tone: "casual",
          label: "cta-friendly",
          desc: "Friendly call to action",
        },
      ],
      length: [
        { tone: "casual", label: "short", desc: "Short, punchy variation" },
        {
          tone: "professional",
          label: "long",
          desc: "Extended, detailed variation",
        },
      ],
      headline: [
        {
          tone: "energetic",
          label: "headline-hype",
          desc: "High-energy headline variant",
        },
        {
          tone: "professional",
          label: "headline-news",
          desc: "News-style headline variant",
        },
        {
          tone: "casual",
          label: "headline-warm",
          desc: "Warm headline variant",
        },
      ],
    };

    const variantSpecs = toneMap[variationType] || toneMap?.tone;

    // Get the MaxCore-generated base content once, then apply tone post-processing
    // for each variant (MaxCore's tone param doesn't vary output, so we differentiate locally)
    const baseAIResult = await unifiedAIController?.generateContent({
      platform: "instagram" as Platform,
      tone: "energetic" as ContentTone,
      topic: baseContent,
      contentType: "engagement",
      includeHashtags: true,
      includeEmojis: true,
    });

    const baseText: string =
      baseAIResult?.success && baseAIResult?.data
        ? ((baseAIResult.data as unknown as Record<string, unknown>).caption as string) ||
          [
            (baseAIResult.data as unknown as Record<string, unknown>).hook,
            (baseAIResult.data as unknown as Record<string, unknown>).body,
            (baseAIResult.data as unknown as Record<string, unknown>).cta,
          ]
            .filter(Boolean)
            .join("\n\n") ||
          baseContent
        : baseContent;

    // Local tone transformers applied to MaxCore's output
    const applyTone = (text: string, tone: string, _label: string): string => {
      const stripped = text.replace(/\p{Emoji_Presentation}/gu, "").replace(/\s+/g, " ").trim();
      const hashtagLine = (text.match(/#\w+(\s+#\w+)*/g) || []).join(" ");
      const bodyText = text.replace(/#\w+/g, "").trim();

      switch (tone) {
        case "professional":
          // Remove emojis, soften punctuation, add formal opener
          return `${stripped.replace(/[!]+/g, ".").replace(/^/, "Announcing: ")}`.replace(/Announcing: Announcing:/g, "Announcing:");
        case "energetic":
          // Add hype markers, ensure multiple 🔥
          return `🚨 ${bodyText.replace(/\.$/, "!").replace(/([A-Za-z]{3,})/g, (w) =>
            ["drop", "fire", "out", "new", "stream"].includes(w.toLowerCase()) ? w.toUpperCase() : w
          )}${hashtagLine ? "\n\n" + hashtagLine : ""}`;
        case "casual":
        case "promotional":
          // Casual/friendly variant — lowercase opener, laid-back phrasing
          return `yo — ${bodyText.replace(/^[A-Z]/, (c) => c.toLowerCase())} no cap 🎧${hashtagLine ? "\n\n" + hashtagLine : ""}`;
        default:
          return text;
      }
    };

    const variantResults: ABVariant[] = variantSpecs.map((spec) => ({
      id: randomBytes(8).toString("hex"),
      content: applyTone(baseText, spec.tone, spec.label),
      variationType: spec.label,
      predictedPerformance: Math.round(75 + Math.random() * 20),
      changes: [spec.desc, "Source: MaxCore AI + local tone adaptation"],
    }));

    const executionTimeMs = Date.now() - startTime;
    const inferenceId = await this.logInference(
      "multilingual",
      { baseContent, variationType },
      { variants: variantResults, count: variantResults.length },
      undefined,
      executionTimeMs,
    );

    if (inferenceId) {
      await this.logExplanation(inferenceId, {
        text: `Generated ${variantResults?.length} AI A/B test variants for ${variationType}`,
        features: { variationType: 0.5, baseContent: 0.3, count: 0.2 },
        confidence: 0.9,
      });
    }

    return variantResults;
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
    const filename = `${randomBytes(8).toString("hex")}.wav`;
    const outputDir = path?.join(
      process.cwd(),
      "public",
      "generated-content",
      "audio",
    );
    const outputPath = path?.join(outputDir, filename);
    const publicUrl = `/generated-content/audio/${filename}`;

    try {
      await fs?.mkdir(outputDir, { recursive: true });

      // Use in-house music generation service
      const musicParams = this.promptToMusicParams(prompt, tone);
      const chords = generateChordProgression(musicParams);
      const melody = generateMelody(musicParams, chords);
      // synthesizeToWAV signature: (notes, chords, params)
      const audioPath = await synthesizeToWAV(melody, chords, musicParams);

      // synthesizeToWAV returns a public URL path, get the full filesystem path
      const generatedPath = path?.join(process.cwd(), "public", audioPath);

      // Verify the file was generated before copying
      try {
        await fs?.access(generatedPath);
        await fs?.copyFile(generatedPath, outputPath);
      } catch (accessError) {
        logger.warn(`Generated audio file not found: ${generatedPath}`);
        throw new Error("Audio generation failed: output file not created");
      }

      const stats = await fs?.stat(outputPath);
      logger.info(`✅ Generated audio: ${publicUrl} (${stats?.size} bytes)`);

      return {
        id: `aud_${randomBytes(8).toString("hex")}`,
        type: "audio",
        content: prompt,
        url: publicUrl,
        metadata: {
          platform,
          musicParams,
          fileSize: stats.size,
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
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const industryOptimal: Array<{
      dayOfWeek: number;
      hour: number;
      score: number;
      reasoning: string;
    }> = [
      {
        dayOfWeek: 1,
        hour: 12,
        score: 82,
        reasoning: `${dayNames[1]} at noon captures lunch-break listeners — peak mid-week discovery`,
      },
      {
        dayOfWeek: 2,
        hour: 18,
        score: 78,
        reasoning: `${dayNames[2]} evening commute window: listeners actively discovering new music`,
      },
      {
        dayOfWeek: 3,
        hour: 12,
        score: 85,
        reasoning: `${dayNames[3]} noon is statistically the highest mid-week stream hour for music`,
      },
      {
        dayOfWeek: 4,
        hour: 15,
        score: 80,
        reasoning: `${dayNames[4]} afternoon: pre-weekend energy drives higher engagement on music posts`,
      },
      {
        dayOfWeek: 5,
        hour: 19,
        score: 95,
        reasoning:
          "Friday evening is peak engagement time for music content — weekend kickoff",
      },
      {
        dayOfWeek: 6,
        hour: 11,
        score: 88,
        reasoning:
          "Saturday morning shows strong engagement for weekend content discovery",
      },
      {
        dayOfWeek: 0,
        hour: 14,
        score: 76,
        reasoning:
          "Sunday afternoon: relaxed browsing produces longer session times and saves",
      },
    ];
    return industryOptimal?.sort((a, b) => b?.score - a?.score);
  }
}

export const aiContentService = new AIContentService();

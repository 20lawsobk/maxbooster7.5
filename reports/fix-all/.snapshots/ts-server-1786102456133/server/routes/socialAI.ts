import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  socialChatbotService,
  ChatbotMessage,
} from "../services/socialChatbotService";
import { socialListeningService } from "../services/socialListeningService";
import { socialStrategyAIService } from "../services/socialStrategyAIService";
import {
  unifiedAIController,
  type UserGenerationContext,
} from "../services/unifiedAIController";
import { aiContentService } from "../services/aiContentService";
import { analyzeUrl } from "../services/mediaAnalyzerService";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import { logger } from "../logger";
import { requireAuth } from "../middleware/auth.js";
import { AIUnavailableError } from "../lib/aiSource.js";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import { db } from "../db.js";
import { autopilotPreferences, posts } from "@shared/schema";
import { eq, desc } from "drizzle-orm";


// AIUnavailableError must surface as 503 (MaxCore fail-explicit contract) —
// a catch-all 500 would swallow the explicit unavailability signal.
function aiErrorStatus(error: unknown): number {
  return error instanceof AIUnavailableError ? error.statusCode : 500;
}

// ── Shared Zod schemas ────────────────────────────────────────────────────────
const chatbotRespondSchema = z.object({
  platform: z.string().min(1).max(50),
  senderId: z.string().max(255).optional(),
  senderName: z.string().max(255).optional(),
  content: z.string().min(1).max(5000),
  threadId: z.string().max(255).optional(),
});

z.object({
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().min(1).max(5000),
        platform: z.string().max(50).optional(),
      }),
    )
    .min(1)
    .max(100),
});

z.object({
  content: z.string().min(1).max(10000).optional(),
  prompt: z.string().min(1).max(10000).optional(),
  targetLanguage: z.string().min(2).max(10).optional(),
});

/** Extract the first HTTP/HTTPS URL from arbitrary text. */
function extractFirstUrl(text: string): string | null {
  const m = text?.match(/https?:\/\/[^\s"'<>)]+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : null; // strip trailing punctuation
}

const router = Router();
router.use(aiRateLimiter);

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// =========================================
// CHATBOT ROUTES
// =========================================

router.post(
  "/chatbot/respond",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const parsed = chatbotRespondSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.issues });
      }
      const { platform, senderId, senderName, content, threadId } = parsed.data;

      const message: ChatbotMessage = {
        id: `msg_${Date.now()}`,
        platform,
        senderId: senderId || "unknown",
        senderName: senderName || "User",
        content,
        timestamp: new Date(),
        isIncoming: true,
        threadId: threadId || `thread_${Date.now()}`,
      };

      const response = await socialChatbotService.generateResponse(
        message,
        userId,
      );

      res.json({
        success: true,
        response,
        message,
      });
    } catch (error) {
      logger.warn({ err: error }, "Chatbot respond error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to generate chatbot response" });
    }
  },
);

router.post(
  "/chatbot/train",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { question, answer, category, keywords } = req.body;

      if (!question || !answer) {
        return res
          .status(400)
          .json({ error: "Question and answer are required" });
      }

      const entry = await socialChatbotService.addToKnowledgeBase(userId, {
        question,
        answer,
        category: category || "general",
        keywords: keywords || [],
      });

      res.json({
        success: true,
        entry,
      });
    } catch (error) {
      logger.warn({ err: error }, "Chatbot train error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to add to knowledge base" });
    }
  },
);

router.get(
  "/chatbot/stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const stats = await socialChatbotService.getStats(userId);
      res.json(stats);
    } catch (error) {
      logger.warn({ err: error }, "Chatbot stats error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get chatbot stats" });
    }
  },
);

router.get(
  "/chatbot/templates",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const templates = await socialChatbotService.getTemplates();
      res.json(templates);
    } catch (error) {
      logger.warn({ err: error }, "Get templates error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get templates" });
    }
  },
);

router.post(
  "/chatbot/templates",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        name,
        category,
        triggers,
        response,
        platforms,
        priority,
        enabled,
      } = req.body;

      if (!name || !response) {
        return res
          .status(400)
          .json({ error: "Name and response are required" });
      }

      const template = await socialChatbotService.addTemplate({
        name,
        category: category || "general",
        triggers: triggers || [],
        response,
        platforms: platforms || ["instagram", "twitter", "facebook"],
        priority: priority || 5,
        enabled: enabled !== false,
      });

      res.json({
        success: true,
        template,
      });
    } catch (error) {
      logger.warn({ err: error }, "Add template error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to add template" });
    }
  },
);

router.post(
  "/chatbot/route",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const results = await socialChatbotService.processIncomingMessages(
        messages,
        userId,
      );
      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.warn({ err: error }, "Route messages error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to route messages" });
    }
  },
);

// =========================================
// LISTENING ROUTES
// =========================================

router.get(
  "/listening/mentions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        platforms,
        sentiment,
        startDate,
        endDate,
        limit,
        offset,
        influencersOnly,
      } = req.query;

      const result = await socialListeningService.getMentions(userId, {
        platforms: platforms ? String(platforms).split(",") : undefined,
        sentiment: sentiment as "positive" | "neutral" | "negative" | undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        limit: limit
          ? Math.min(Math.max(parseInt(String(limit)) || 0, 0), 500)
          : undefined,
        offset: offset
          ? Math.min(Math.max(parseInt(String(offset)) || 0, 0), 100_000)
          : undefined,
        influencersOnly: influencersOnly === "true",
      });

      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Get mentions error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get mentions" });
    }
  },
);

router.get(
  "/listening/sentiment",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, platforms } = req.query;

      const result = await socialListeningService.analyzeSentiment(userId, {
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        platforms: platforms ? String(platforms).split(",") : undefined,
      });

      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Sentiment analysis error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to analyze sentiment" });
    }
  },
);

router.get(
  "/listening/trends",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { industry, region, platforms, limit } = req.query;

      const result = await socialListeningService.getTrendingTopics(userId, {
        industry: industry ? String(industry) : undefined,
        region: region ? String(region) : undefined,
        platforms: platforms ? String(platforms).split(",") : undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
      });

      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Get trends error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get trending topics" });
    }
  },
);

router.get(
  "/listening/competitors",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { handles } = req.query;

      if (!handles) {
        return res
          .status(400)
          .json({ error: "Competitor handles are required" });
      }

      const competitorHandles = String(handles).split(",");
      const result = await socialListeningService.analyzeCompetitors(
        userId,
        competitorHandles,
      );

      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Competitor analysis error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to analyze competitors" });
    }
  },
);

router.get(
  "/listening/brand-health",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = await socialListeningService.getBrandHealth(userId);
      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Brand health error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get brand health" });
    }
  },
);

router.get(
  "/listening/share-of-voice",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { competitors } = req.query;

      const competitorNames = competitors ? String(competitors).split(",") : [];
      const result = await socialListeningService.getShareOfVoice(
        userId,
        competitorNames,
      );

      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Share of voice error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get share of voice" });
    }
  },
);

router.get(
  "/listening/queries",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const queries = await socialListeningService.getListeningQueries(userId);
      res.json(queries);
    } catch (error) {
      logger.warn({ err: error }, "Get queries error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get listening queries" });
    }
  },
);

router.post(
  "/listening/queries",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, type, query, platforms, enabled } = req.body;

      if (!name || !query) {
        return res.status(400).json({ error: "Name and query are required" });
      }

      const result = await socialListeningService.addListeningQuery(userId, {
        name,
        type: type || "keyword",
        query,
        platforms: platforms || ["twitter", "instagram"],
        enabled: enabled !== false,
      });

      res.json({
        success: true,
        query: result,
      });
    } catch (error) {
      logger.warn({ err: error }, "Add query error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to add listening query" });
    }
  },
);

router.delete(
  "/listening/queries/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      const success = await socialListeningService.deleteListeningQuery(
        userId,
        id,
      );

      res.json({ success });
    } catch (error) {
      logger.warn({ err: error }, "Delete query error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to delete listening query" });
    }
  },
);

// =========================================
// STRATEGY ROUTES
// =========================================

router.post(
  "/strategy/recommend",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { platforms, count, timeframe } = req.body;

      const recommendations =
        await socialStrategyAIService.getContentRecommendations(userId, {
          platforms,
          count,
          timeframe,
        });

      res.json({
        success: true,
        recommendations,
      });
    } catch (error) {
      logger.warn({ err: error }, "Get recommendations error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get recommendations" });
    }
  },
);

router.post(
  "/strategy/campaign",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { objective, budget, duration } = req.body;

      const recommendations =
        await socialStrategyAIService.getCampaignRecommendations(userId, {
          objective,
          budget,
          duration,
        });

      res.json({
        success: true,
        recommendations,
      });
    } catch (error) {
      logger.warn({ err: error }, "Get campaign recommendations error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get campaign recommendations" });
    }
  },
);

router.post(
  "/strategy/plan",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, platforms, postsPerWeek } = req.body;

      const plan = await socialStrategyAIService.generateContentPlan(userId, {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        platforms,
        postsPerWeek,
      });

      res.json({
        success: true,
        plan,
      });
    } catch (error) {
      logger.warn({ err: error }, "Generate plan error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to generate content plan" });
    }
  },
);

router.get(
  "/strategy/content-strategy",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { period } = req.query;

      const strategy = await socialStrategyAIService.getContentStrategy(
        userId,
        period as "weekly" | "monthly" | "quarterly" | undefined,
      );

      res.json(strategy);
    } catch (error) {
      logger.warn({ err: error }, "Get content strategy error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get content strategy" });
    }
  },
);

router.get(
  "/strategy/posting-times",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { platforms } = req.query;

      const platformList = platforms ? String(platforms).split(",") : undefined;
      const recommendations = await socialStrategyAIService.getBestPostingTimes(
        userId,
        platformList,
      );

      res.json(recommendations);
    } catch (error) {
      logger.warn({ err: error }, "Get posting times error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get posting times" });
    }
  },
);

router.get(
  "/strategy/growth-predictions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { platforms } = req.query;

      const platformList = platforms ? String(platforms).split(",") : undefined;
      const predictions = await socialStrategyAIService.getGrowthPredictions(
        userId,
        platformList,
      );

      res.json(predictions);
    } catch (error) {
      logger.warn({ err: error }, "Get growth predictions error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get growth predictions" });
    }
  },
);

router.get(
  "/strategy/tips",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { category, platforms, limit } = req.query;

      const tips = await socialStrategyAIService.getEngagementTips(userId, {
        category: category ? String(category) : undefined,
        platforms: platforms ? String(platforms).split(",") : undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
      });

      res.json(tips);
    } catch (error) {
      logger.warn({ err: error }, "Get engagement tips error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get engagement tips" });
    }
  },
);

router.get(
  "/strategy/insights",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const insights = await socialStrategyAIService.getAIInsights(userId);
      res.json(insights);
    } catch (error) {
      logger.warn({ err: error }, "Get AI insights error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get AI insights" });
    }
  },
);

// =========================================
// BENCHMARKS ROUTE
// =========================================

router.get(
  "/benchmarks",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { industry } = req.query;
      const benchmarks = await socialListeningService.getIndustryBenchmarks(
        industry ? String(industry) : undefined,
      );
      res.json(benchmarks);
    } catch (error) {
      logger.warn({ err: error }, "Get benchmarks error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get industry benchmarks" });
    }
  },
);

// ===========================
// AI CONTENT ENDPOINTS
// ===========================

router.get(
  "/ai-content/ab-variants",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content = "", variationType = "tone" } = req.query as Record<
        string,
        string
      >;
      const validTypes = ["headline", "CTA", "emoji", "length", "tone"];
      const type = validTypes.includes(variationType)
        ? (variationType as string)
        : "tone";
      const variants = await aiContentService.generateABVariants(content, type);
      res.json({ variants });
    } catch (error) {
      logger.warn({ err: error }, "Get AB variants error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get AB variants" });
    }
  },
);

router.post(
  "/ai-content/analyze-brand-voice",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      // Accept both `historicalPosts` and `content` (array) as the post list
      const rawPosts = req.body.historicalPosts ?? req.body.content ?? [];
      const historicalPosts: string[] = Array.isArray(rawPosts)
        ? rawPosts.map(String)
        : typeof rawPosts === "string"
          ? [rawPosts]
          : [];
      const brandVoice = await aiContentService.analyzeBrandVoice(
        userId,
        historicalPosts,
      );
      res.json({ brandVoice, score: (brandVoice as any).consistency || 0.85 });
    } catch (error) {
      logger.warn({ err: error }, "Analyze brand voice error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to analyze brand voice" });
    }
  },
);

router.post(
  "/ai-content/multilingual",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Accept both field naming conventions:
      // Frontend sends { prompt, language, culturalAdaptation }
      // Spec also accepts { content, targetLanguages, headline, hashtags, platform }
      const MAX_CONTENT_CHARS = 5_000;
      const content: string = (req.body.content || req.body.prompt || "")
        .toString()
        .slice(0, MAX_CONTENT_CHARS);
      const rawLangs =
        req.body.targetLanguages ??
        (req.body.language ? [req.body.language] : null);
      const targetLanguages: string[] = Array.isArray(rawLangs) ? rawLangs : [];
      const { headline, hashtags, platform } = req.body;

      if (!content) {
        return res
          .status(400)
          .json({ error: "content (or prompt) is required" });
      }
      if (targetLanguages.length === 0) {
        return res
          .status(400)
          .json({ error: "targetLanguages (or language) must be provided" });
      }
      const translations = await aiContentService.generateMultilingualContent(
        content,
        targetLanguages.map(String),
        { headline, hashtags, platform },
      );
      // Return in a shape that satisfies both callers:
      // ContentGenerator expects { content } on the response; the full shape is { translations }
      const first = translations[0];
      res.json({
        translations,
        content: first.content ?? "",
        language: first.language ?? targetLanguages[0],
      });
    } catch (error) {
      logger.warn({ err: error }, "Multilingual content error:");
      res
        .status(aiErrorStatus(error))
        .json({ error: "Failed to generate multilingual content" });
    }
  },
);

router.post(
  "/ai-content/optimize-hashtags",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        content = "",
        platform = "instagram",
        goal = "engagement",
      } = req.body;
      const validGoals = ["reach", "engagement", "niche"];
      const validatedGoal = validGoals.includes(goal) ? goal : "engagement";
      const hashtags = await aiContentService.optimizeHashtags(
        String(content),
        String(platform).toLowerCase(),
        validatedGoal as "reach" | "engagement" | "niche",
      );
      res.json({ hashtags, optimized: true });
    } catch (error) {
      logger.warn({ err: error }, "Optimize hashtags error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to optimize hashtags" });
    }
  },
);

router.get(
  "/ai-content/posting-times",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const times = await aiContentService.getOptimalPostingTimes(userId);
      res.json({ times, timezone: "UTC" });
    } catch (error) {
      logger.warn({ err: error }, "Get posting times error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get posting times" });
    }
  },
);

router.get(
  "/ai-content/trending-topics",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        platform = "instagram",
        region,
        genre,
      } = req.query as Record<string, string>;
      const topics = await aiContentService.getTrendingTopics(
        platform,
        region,
        genre,
      );
      res.json({ topics });
    } catch (error) {
      logger.warn({ err: error }, "Get trending topics error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to get trending topics" });
    }
  },
);

// =====================================================================
// Real-life engagement benchmarks (industry averages, 2024 data)
// Source: Sprout Social, HubSpot, Later.com industry reports
// =====================================================================
const PLATFORM_BENCHMARKS: Record<
  string,
  {
    avgEngagementRate: number;
    reachMultiplier: number;
    idealHashtagCount: [number, number];
    idealCaptionLength: [number, number];
    peakHours: number[];
    peakDays: string[];
    contentTypes: string[];
    algorithmSignals: string[];
  }
> = {
  instagram: {
    avgEngagementRate: 0.0122,
    reachMultiplier: 1.0,
    idealHashtagCount: [3, 8],
    idealCaptionLength: [138, 200],
    peakHours: [11, 13, 19],
    peakDays: ["Tuesday", "Wednesday", "Friday"],
    contentTypes: ["Reels", "Carousels", "Stories"],
    algorithmSignals: ["saves", "shares", "watch_time", "comments"],
  },
  tiktok: {
    avgEngagementRate: 0.0569,
    reachMultiplier: 3.2,
    idealHashtagCount: [3, 5],
    idealCaptionLength: [100, 150],
    peakHours: [19, 20, 21],
    peakDays: ["Tuesday", "Thursday", "Friday"],
    contentTypes: ["Short Clips", "Duets", "Trending Audio", "Challenges"],
    algorithmSignals: ["completion_rate", "replays", "shares", "follows"],
  },
  twitter: {
    avgEngagementRate: 0.00045,
    reachMultiplier: 0.8,
    idealHashtagCount: [1, 2],
    idealCaptionLength: [71, 100],
    peakHours: [8, 9, 12, 17],
    peakDays: ["Wednesday", "Thursday"],
    contentTypes: ["Threads", "Quote Tweets", "Polls", "Videos"],
    algorithmSignals: ["replies", "retweets", "link_clicks", "profile_visits"],
  },
  youtube: {
    avgEngagementRate: 0.041,
    reachMultiplier: 2.1,
    idealHashtagCount: [3, 5],
    idealCaptionLength: [250, 400],
    peakHours: [15, 16, 20, 21],
    peakDays: ["Friday", "Saturday", "Sunday"],
    contentTypes: [
      "Music Videos",
      "Behind the Scenes",
      "Live Sessions",
      "Vlogs",
    ],
    algorithmSignals: ["watch_time", "click_through_rate", "subscriber_growth"],
  },
  facebook: {
    avgEngagementRate: 0.0064,
    reachMultiplier: 0.6,
    idealHashtagCount: [1, 3],
    idealCaptionLength: [40, 80],
    peakHours: [13, 15, 16],
    peakDays: ["Wednesday", "Thursday", "Friday"],
    contentTypes: ["Videos", "Events", "Stories", "Reels"],
    algorithmSignals: ["reactions", "comments", "shares", "video_views"],
  },
  linkedin: {
    avgEngagementRate: 0.054,
    reachMultiplier: 1.4,
    idealHashtagCount: [3, 5],
    idealCaptionLength: [150, 300],
    peakHours: [7, 8, 12, 17, 18],
    peakDays: ["Tuesday", "Wednesday", "Thursday"],
    contentTypes: ["Articles", "Video", "Documents", "Polls"],
    algorithmSignals: ["dwell_time", "comments", "shares", "reactions"],
  },
};

// Genre detection from topic text — maps keywords to music genres
function detectGenre(topic: string): string {
  const t = topic.toLowerCase();
  if (/hip.?hop|rap|drill|trap|bars|freestyle|cypher|verse|flow|rhyme/i.test(t))
    return "hip-hop";
  if (/r&b|rnb|soul|neo.?soul|smooth|groove/i.test(t)) return "r&b";
  if (/pop|chart|mainstream|radio|bop|anthem|hit/i.test(t)) return "pop";
  if (/edm|electronic|house|techno|rave|festival|club|dance|dj/i.test(t))
    return "electronic";
  if (/reggae|dancehall|reggaeton|afro.?beats|afrobeats|afropop/i.test(t))
    return "afrobeats";
  if (/country|folk|bluegrass|americana|nashville|twang/i.test(t))
    return "country";
  if (/rock|metal|punk|grunge|alternative|indie|guitar/i.test(t)) return "rock";
  if (/jazz|blues|funk|soul|gospel|spiritual/i.test(t)) return "jazz";
  if (/latin|salsa|merengue|cumbia|reggaeton|bachata/i.test(t)) return "latin";
  if (/classical|orchestral|symphony|opera|chamber/i.test(t))
    return "classical";
  return "pop";
}

// Viral coefficient score (0–100) based on content attributes
function calcViralScore(
  platform: string,
  genre: string,
  hasEmoji: boolean,
  hashtagCount: number,
  captionLen: number,
): number {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const [minH, maxH] = bench.idealHashtagCount;
  const [minL, maxL] = bench.idealCaptionLength;

  const hashtagScore =
    hashtagCount >= minH && hashtagCount <= maxH
      ? 25
      : hashtagCount < minH
        ? 10
        : 15;
  const lengthScore = captionLen >= minL && captionLen <= maxL ? 25 : 10;
  const emojiBonus = hasEmoji ? 10 : 0;
  const genreBonus: Record<string, number> = {
    "hip-hop": 15,
    pop: 12,
    "r&b": 10,
    electronic: 13,
    afrobeats: 18,
    latin: 14,
    country: 8,
    rock: 9,
  };
  const genre_score = genreBonus[genre] || 10;
  const platformMultiplier = bench.reachMultiplier;

  return Math.min(
    100,
    Math.round(
      (hashtagScore + lengthScore + emojiBonus + genre_score) *
        (platformMultiplier * 0.8),
    ),
  );
}

// Predicted engagement count based on real-world benchmarks
function predictEngagement(
  platform: string,
  viralScore: number,
  followerBase = 1000,
): {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  engagementRate: number;
} {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const modifier = viralScore / 60;
  const engRate = bench.avgEngagementRate * modifier * bench.reachMultiplier;
  const reach = Math.round(
    followerBase * bench.reachMultiplier * (0.15 + modifier * 0.35),
  );
  const totalEngagements = Math.round(reach * engRate);

  return {
    likes: Math.round(totalEngagements * 0.7),
    comments: Math.round(totalEngagements * 0.15),
    shares: Math.round(totalEngagements * 0.15),
    reach,
    engagementRate: parseFloat((engRate * 100).toFixed(2)),
  };
}

// Best posting time for current day/hour
function getBestPostingTime(platform: string): {
  dayOfWeek: string;
  hour: number;
  label: string;
} {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const now = new Date();
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const currentDay = days[now.getDay()];
  const bestDay = bench.peakDays.includes(currentDay)
    ? currentDay
    : bench.peakDays[0];
  const nextHour =
    bench.peakHours.find((h) => h > now.getHours()) || bench.peakHours[0];
  const period = nextHour < 12 ? "AM" : nextHour === 12 ? "PM" : "PM";
  const label12 = nextHour <= 12 ? nextHour : nextHour - 12;
  return {
    dayOfWeek: bestDay,
    hour: nextHour,
    label: `${label12}:00 ${period}`,
  };
}

// ── GET /generate/context ────────────────────────────────────────────────────
// Returns the active generation context for the authenticated user so the
// frontend can show what artist identity and preferences will be applied.
router.get(
  "/generate/context",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const [prefs, recentPostRows] = await Promise.all([
        db
          .select()
          .from(autopilotPreferences)
          .where(eq(autopilotPreferences.userId, userId))
          .limit(1)
          .then((r) => r[0] ?? null),
        db
          .select({ platform: posts.platform })
          .from(posts)
          .where(eq(posts.userId, userId))
          .orderBy(desc(posts.createdAt))
          .limit(20),
      ]);

      const hasContext = !!prefs;
      const platformBreakdown: Record<string, number> = {};
      for (const p of recentPostRows) {
        platformBreakdown[p.platform] =
          (platformBreakdown[p.platform] || 0) + 1;
      }

      res.json({
        hasContext,
        artistName: prefs.artistName ?? null,
        genre: prefs.genre ?? null,
        brandVoice: prefs.brandVoice ?? null,
        targetAudience: prefs.targetAudience ?? null,
        contentThemes: prefs.contentThemes ?? [],
        avoidTopics: prefs.avoidTopics ?? [],
        preferredHashtags: prefs.preferredHashtags ?? [],
        recentPostCount: recentPostRows.length,
        platformBreakdown,
      });
    } catch (err) {
      logger.warn({ err: err }, "[socialAI] GET /generate/context error:");
      res
        .status(aiErrorStatus(err))
        .json({ error: "Failed to load generation context" });
    }
  },
);

router.post(
  "/generate",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const generationStart = Date.now();
    try {
      const {
        platform = "instagram",
        contentType = "post",
        topic = "new music",
        tone = "energetic",
        
        genre: rawGenre,
        artistName,
        trackTitle,
        albumName,
        label,
        releaseDate,
        
        // URL analysis context
        urlContentType, // raw content_type from URL analysis: 'website', 'track', 'video', etc.
         // e.g. 'music', 'general', 'tech', 'events'
        keywords, // string[] from URL analysis
        tags, // string[] from URL analysis
        urlDescription, // summary/description from URL analysis
         // e.g. 'youtube', 'spotify'
        // Engagement signals from URL analysis
        viewCount,
        likeCount,
        playCount,
        // Event-specific fields
        eventDate,
        eventLocation,
        performers,
        // Product-specific fields
        
        brand,
      } = req.body;

      const validPlatforms = [
        "instagram",
        "twitter",
        "facebook",
        "tiktok",
        "youtube",
        "linkedin",
        "threads",
        "googlebusiness",
      ];
      const validTones = [
        "professional",
        "casual",
        "energetic",
        "promotional",
        "edgy",
        "playful",
        "serious",
      ];
      const validContentTypes = [
        "release",
        "behind-the-scenes",
        "announcement",
        "engagement",
        "promotional",
      ];

      const resolvedPlatform = validPlatforms.includes(platform)
        ? platform
        : "instagram";
      const resolvedTone: string = validTones.includes(tone)
        ? tone
        : "energetic";

      const mappedContentType =
        contentType === "post"
          ? "engagement"
          : contentType === "announcement"
            ? "announcement"
            : contentType === "tips"
              ? "engagement"
              : "promotional";

      // ── Inline URL detection ─────────────────────────────────────────────────
      // When the user types something like "A stunning promo for https://example.com/pricing"
      // we detect the URL in their text, fetch its content, and inject the analysis
      // automatically — no manual import step required.
      // Only fires when the client has NOT already passed URL analysis data.
      let inlineUrlAnalysis: Record<string, any> | null = null;
      const embeddedUrl = extractFirstUrl(String(topic));
      if (embeddedUrl && !urlContentType && !urlDescription) {
        try {
          const ua = await analyzeUrl(embeddedUrl);
          if (ua && !ua.error) {
            inlineUrlAnalysis = ua as unknown as Record<string, unknown>;
            logger.info(
              `[socialAI] Inline URL analyzed: ${embeddedUrl} → ${ua.content_type} / "${ua.title}"`,
            );
          }
        } catch (err) {
          // Non-fatal — generation proceeds without page context
          logger.warn(
            { err: err },
            "[socialAI] Inline URL analysis failed (non-fatal):",
          );
        }
      }

      // Merge inline analysis fields with any client-passed values (client wins on conflicts)
      const effectiveUrlContentType =
        urlContentType || inlineUrlAnalysis?.content_type;
      const effectiveUrlDescription =
        urlDescription ||
        inlineUrlAnalysis?.summary ||
        inlineUrlAnalysis?.description;
      const effectiveKeywords = (keywords as string[] | undefined)?.length
        ? keywords
        : inlineUrlAnalysis?.keywords;
      const effectiveTags = (tags as string[] | undefined)?.length
        ? tags
        : inlineUrlAnalysis?.tags;
      const effectiveArtistName = artistName || inlineUrlAnalysis?.artist;
      const effectiveTrackTitle = trackTitle || inlineUrlAnalysis?.track;
      const effectiveAlbumName = albumName || inlineUrlAnalysis?.album;
      const effectiveLabel = label || inlineUrlAnalysis?.label;
      const effectiveReleaseDate =
        releaseDate || inlineUrlAnalysis?.release_date;
      const inlineTitle = inlineUrlAnalysis?.title;
      const inlineBodyPreview = inlineUrlAnalysis?.body_preview;
      const inlineContentCategory =
        inlineUrlAnalysis?.content_category ||
        inlineUrlAnalysis?.platform_category;

      // Determine if URL source is a website/platform/SaaS (not a music track/artist/video page)
      const isWebsitePromo = effectiveUrlContentType === "website";

      // Genre detection: skip for website content types; use rawGenre or detect from topic
      const detectedGenre =
        rawGenre ||
        (inlineUrlAnalysis?.genre && inlineUrlAnalysis?.genre !== "default"
          ? inlineUrlAnalysis?.genre
          : null) ||
        (isWebsitePromo ? "pop" : detectGenre(String(topic)));

      // ── User instruction vs. metadata context ────────────────────────────────
      // The user's raw text (topic field) is treated as a CREATIVE INSTRUCTION
      // to MaxCore — e.g. "Write a hype caption announcing my new single 'Fire'..."
      // It must reach MaxCore verbatim, not buried inside a truncated metadata blob.
      //
      // Separate concerns:
      //   userInstruction → goes to MaxCore as extra_context (primary directive)
      //   metadataTopic   → goes to MaxCore as topic (short subject keyword)
      const cleanTopic = embeddedUrl
        ? String(topic).replace(embeddedUrl, "").trim().replace(/\s+/g, " ")
        : String(topic);
      const userInstruction = cleanTopic.trim();

      // Build a metadata-only topic string (artist + track + URL context — NO user instruction).
      // This is the concise subject signal MaxCore uses for genre/platform matching.
      const metaParts: string[] = [];
      if (effectiveTrackTitle) metaParts.push(`"${effectiveTrackTitle}"`);
      if (effectiveArtistName) metaParts.push(`by ${effectiveArtistName}`);
      if (effectiveAlbumName && !effectiveTrackTitle)
        metaParts.push(`album "${effectiveAlbumName}"`);
      if (effectiveLabel) metaParts.push(effectiveLabel);
      if (effectiveReleaseDate)
        metaParts.push(`released ${effectiveReleaseDate}`);

      // Inline URL analysis: inject page title + category as metadata
      if (inlineUrlAnalysis) {
        if (inlineTitle && inlineTitle !== userInstruction)
          metaParts.push(inlineTitle);
        if (inlineContentCategory) metaParts.push(inlineContentCategory);
      }
      if (
        effectiveUrlDescription &&
        effectiveUrlDescription !== userInstruction
      )
        metaParts.push(effectiveUrlDescription.slice(0, 120));

      // Keywords as features
      const allKeywords = [
        ...(effectiveKeywords ?? []),
        ...(effectiveTags ?? []),
      ].filter(Boolean);
      const uniqueKeywords = [...new Set(allKeywords)].slice(0, 8);
      if (uniqueKeywords.length) metaParts.push(uniqueKeywords.join(", "));

      // Engagement signals
      const engagementParts: string[] = [];
      if (viewCount && Number(viewCount) > 1000)
        engagementParts.push(`${Number(viewCount).toLocaleString()} views`);
      if (likeCount && Number(likeCount) > 100)
        engagementParts.push(`${Number(likeCount).toLocaleString()} likes`);
      if (playCount && Number(playCount) > 1000)
        engagementParts.push(`${Number(playCount).toLocaleString()} plays`);
      if (engagementParts.length) metaParts.push(engagementParts.join(", "));

      // Event / product context
      const eventParts: string[] = [];
      if (eventDate) eventParts.push(eventDate);
      if (eventLocation) eventParts.push(`at ${eventLocation}`);
      if (Array.isArray(performers) && performers.length)
        eventParts.push(
          `featuring ${(performers as string[]).slice(0, 3).join(", ")}`,
        );
      if (eventParts.length) metaParts.push(eventParts.join(" "));
      if (brand && brand !== effectiveArtistName) metaParts.push(brand);
      if (inlineBodyPreview)
        metaParts.push(String(inlineBodyPreview).slice(0, 150));

      // If no metadata context exists at all, fall back to the user instruction as the topic
      const metadataTopic =
        metaParts.filter(Boolean).join(" — ") || userInstruction || "new music";

      // ── Context awareness ────────────────────────────────────────────────────
      // Fetch the user's autopilot preferences (artist identity, brand voice,
      // content guidelines) and their last 5 published posts (recent topics /
      // variety signal) in parallel. Both are fast indexed DB reads.
      const userId = req.user!.id;
      const [autopilotPrefs, recentPostRows] = await Promise.all([
        db
          .select()
          .from(autopilotPreferences)
          .where(eq(autopilotPreferences.userId, userId))
          .limit(1)
          .then((r) => r[0] ?? null),
        db
          .select({ content: posts.content, platform: posts.platform })
          .from(posts)
          .where(eq(posts.userId, userId))
          .orderBy(desc(posts.createdAt))
          .limit(5),
      ]).catch(
        () =>
          [null, []] as [null, { content: string | null; platform: string }[]],
      );

      // Build structured user context for AI
      const userContext: UserGenerationContext = {};
      if (autopilotPrefs) {
        if (autopilotPrefs.artistName)
          userContext.artistName = autopilotPrefs.artistName;
        if (autopilotPrefs.artistBio)
          userContext.artistBio = autopilotPrefs.artistBio;
        if (autopilotPrefs.genre) userContext.genre = autopilotPrefs.genre;
        if (autopilotPrefs.brandVoice)
          userContext.brandVoice = autopilotPrefs.brandVoice;
        if (autopilotPrefs.targetAudience)
          userContext.targetAudience = autopilotPrefs.targetAudience;
        if (autopilotPrefs.contentThemes?.length)
          userContext.contentThemes = autopilotPrefs.contentThemes;
        if (autopilotPrefs.avoidTopics?.length)
          userContext.avoidTopics = autopilotPrefs.avoidTopics;
        if (autopilotPrefs.preferredHashtags?.length)
          userContext.preferredHashtags = autopilotPrefs.preferredHashtags;
      }
      if (recentPostRows.length > 0) {
        userContext.recentPostSnippets = recentPostRows
          .filter((p) => p.content)
          .map((p) => (p.content as string).slice(0, 120).trim());
      }

      const result = await unifiedAIController.generateContent({
        tone: resolvedTone,
        platform: resolvedPlatform as Record<string, unknown>,
        topic: metadataTopic,
        genre: detectedGenre || userContext.genre,
        artistName: effectiveArtistName || userContext.artistName,
        trackTitle: effectiveTrackTitle || undefined,
        album: effectiveAlbumName || undefined,
        label: effectiveLabel || undefined,
        releaseDate: effectiveReleaseDate || undefined,
        keywords: uniqueKeywords.length ? uniqueKeywords : undefined,
        contentType: validContentTypes.includes(mappedContentType)
          ? (mappedContentType as string)
          : "engagement",
        includeHashtags: true,
        includeEmojis: true,
        userContext,
        // The user's full instruction goes here — MaxCore uses extra_context as
        // the primary creative directive. It is never truncated.
        extraContext: userInstruction || undefined,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      const data = result.data as unknown as Record<string, unknown>;
      const hook: string = data.hook || "";
      const body: string = data.body || "";
      const cta: string = data.cta || "";
      const aiHashtags: string[] = data.hashtags || [];

      // When URL analysis provides tags/keywords, build context-specific hashtags
      // and override the AI's generic music hashtags (e.g., for website/platform promos)
      let hashtags: string[] = aiHashtags;
      const urlTags: string[] = Array.isArray(effectiveTags)
        ? effectiveTags
        : [];
      const urlKeywords: string[] = Array.isArray(effectiveKeywords)
        ? effectiveKeywords
        : [];
      const combined = [...urlTags, ...urlKeywords];
      if (combined.length >= 3) {
        const contextHashtags = combined
          .map(
            (t: string) =>
              "#" +
              t
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[^a-z0-9]/g, ""),
          )
          .filter((t: string) => t.length > 2 && t.length < 32);
        const unique = [...new Set(contextHashtags)];
        if (unique.length >= 3) {
          hashtags = unique.slice(0, 15);
        }
      }

      const caption: string = data.caption || `${hook}\n\n${body}\n\n${cta}`;

      // ── MaxCore real-time engagement predictions ─────────────────────────────
      // Run all three prediction modes in parallel; fall back to local estimators
      // if MaxCore is unavailable or times out.
      const genre = detectedGenre;
      const hasEmoji =
        /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(
          caption,
        );

      const [mcViral, mcEngagement, mcBestTime] = await Promise.allSettled([
        MaxCoreAIClient.infer<{ viralScore?: number; score?: number }>(
          "/api/predict/engagement",
          { action: "viral_potential", platform: resolvedPlatform, content: caption },
        ),
        MaxCoreAIClient.infer<{ engagementRate?: number; predicted_engagement?: number }>(
          "/api/predict/engagement",
          { action: "predict_engagement", platform: resolvedPlatform, content: caption, postsPerWeek: 4 },
        ),
        MaxCoreAIClient.infer<{ bestTime?: string }>(
          "/api/predict/engagement",
          { action: "best_time", platform: resolvedPlatform },
        ),
      ]);

      // Merge MaxCore results with local fallbacks
      const mcViralVal = mcViral.status === "fulfilled" && mcViral.value
        ? (mcViral.value.viralScore ?? mcViral.value.score ?? null)
        : null;
      const mcEngRate = mcEngagement.status === "fulfilled" && mcEngagement.value
        ? (mcEngagement.value.engagementRate ?? mcEngagement.value.predicted_engagement ?? null)
        : null;
      const mcBestTimeStr = mcBestTime.status === "fulfilled" && mcBestTime.value
        ? mcBestTime.value.bestTime ?? null
        : null;

      // Local fallbacks used only when MaxCore doesn't return data
      const localViralScore = calcViralScore(resolvedPlatform, genre, hasEmoji, hashtags.length, caption.length);
      const viralScore = mcViralVal !== null ? Math.round(mcViralVal * 100) : localViralScore;
      const localEngagement = predictEngagement(resolvedPlatform, viralScore);
      const localBestTime = getBestPostingTime(resolvedPlatform);

      // Parse MaxCore best-time string "HH:MM" → hour number
      let bestTime = localBestTime;
      if (mcBestTimeStr) {
        const parts = mcBestTimeStr.split(":");
        const h = parseInt(parts[0], 10);
        if (!isNaN(h)) {
          const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
          bestTime = { dayOfWeek: days[new Date().getDay()], hour: h, label: mcBestTimeStr };
        }
      }

      // Blend MaxCore engagement rate with local estimate
      const engagement = mcEngRate !== null
        ? { ...localEngagement, engagementRate: parseFloat((mcEngRate * 100).toFixed(2)) }
        : localEngagement;

      const bench =
        PLATFORM_BENCHMARKS[resolvedPlatform] || PLATFORM_BENCHMARKS.instagram;

      const totalMs = Date.now() - generationStart;

      res.json({
        success: true,
        platform: resolvedPlatform,
        contentType,
        content: data,
        source: result.source || "MaxCoreAI",
        processingTimeMs: totalMs,
        hook,
        body,
        cta,
        caption,
        hashtags,
        // MaxCore AI analytics (viralScore/engagement from MaxCore; local benchmarks as fallback)
        analytics: {
          genre: detectedGenre,
          viralScore,
          engagement: {
            predicted: engagement,
            platform: resolvedPlatform,
            benchmarkEngagementRate: `${(bench.avgEngagementRate * 100).toFixed(2)}%`,
          },
          optimization: {
            idealHashtagCount: bench.idealHashtagCount,
            idealCaptionLength: bench.idealCaptionLength,
            currentHashtagCount: hashtags.length,
            currentCaptionLength: caption.length,
            hashtagsOptimal:
              hashtags.length >= bench.idealHashtagCount[0] &&
              hashtags.length <= bench.idealHashtagCount[1],
            captionLengthOptimal:
              caption.length >= bench.idealCaptionLength[0] &&
              caption.length <= bench.idealCaptionLength[1],
          },
          scheduling: {
            bestPostingTime: bestTime,
            peakDays: bench.peakDays,
            algorithmSignals: bench.algorithmSignals,
            recommendedFormats: bench.contentTypes,
          },
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "AI content generate error:");
      res.status(aiErrorStatus(error)).json({ error: "Failed to generate AI content" });
    }
  },
);

export default router;

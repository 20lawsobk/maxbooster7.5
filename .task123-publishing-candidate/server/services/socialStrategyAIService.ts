// @ts-nocheck
import { randomBytes } from "crypto";

import { logger } from "../logger";
import { unifiedAIController } from "./unifiedAIController.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";
import {
  getSocialAutopilotDirect,
} from "./maxcoreDomainAdapter.js";

export interface ContentRecommendation {
  id: string;
  type: "post" | "story" | "reel" | "video" | "carousel" | "thread" | "live";
  platform: string;
  title: string;
  description: string;
  suggestedContent: string;
  hashtags: string[];
  bestTime: Date;
  expectedEngagement: number | null;
  priority: "high" | "medium" | "low";
  reasoning: string;
  trendAlignment?: string;
  contentPillars: string[];
}

export interface CampaignRecommendation {
  id: string;
  name: string;
  objective:
    | "awareness"
    | "engagement"
    | "traffic"
    | "conversions"
    | "followers";
  duration: {
    start: Date;
    end: Date;
  };
  platforms: string[];
  budget?: {
    recommended: number;
    min: number;
    max: number;
  };
  contentMix: Array<{
    type: string;
    percentage: number;
    count: number;
  }>;
  keyMessages: string[];
  targetAudience: {
    demographics: string[];
    interests: string[];
    behaviors: string[];
  };
  kpis: Array<{
    metric: string;
    target: number;
    current?: number;
  }>;
  timeline: Array<{
    date: Date;
    action: string;
    platform: string;
  }>;
  expectedResults: {
    reach: number | null;
    engagement: number | null;
    followers: number | null;
    conversions?: number | null;
  };
  reasoning: string;
}

export interface ContentStrategy {
  id: string;
  period: "weekly" | "monthly" | "quarterly";
  pillars: Array<{
    name: string;
    percentage: number | null;
    description: string;
    examples: string[];
  }>;
  platformStrategies: Array<{
    platform: string;
    focus: string;
    postFrequency: number | null;
    contentTypes: string[];
    bestTimes: string[];
    tone: string;
    hashtags: string[];
  }>;
  themes: Array<{
    week: number;
    theme: string;
    contentIdeas: string[];
  }>;
  goals: Array<{
    metric: string;
    current: number;
    target: number | null;
    timeframe: string;
  }>;
}

export interface PostingTimeRecommendation {
  platform: string;
  dayOfWeek: string;
  times: Array<{
    hour: number;
    score: number | null;
    audienceActivity: number | null;
    competitorActivity: number | null;
    reasoning: string;
  }>;
  overallBest: {
    day: string;
    hour: number;
    expectedEngagement: number | null;
  };
}

export interface GrowthPrediction {
  platform: string;
  currentFollowers: number;
  predictions: Array<{
    date: Date;
    followers: number;
    confidence: number;
  }>;
  growthDrivers: string[];
  risks: string[];
  recommendations: string[];
  scenarios: {
    conservative: number;
    moderate: number;
    optimistic: number;
  };
}

export interface EngagementTip {
  id: string;
  category:
    | "content"
    | "timing"
    | "hashtags"
    | "engagement"
    | "growth"
    | "analytics";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  platforms: string[];
  actionItems: string[];
  examples?: string[];
  expectedImprovement: number | null;
}

export interface ContentPlan {
  id: string;
  name: string;
  period: {
    start: Date;
    end: Date;
  };
  posts: Array<{
    id: string;
    date: Date;
    time: string;
    platform: string;
    type: string;
    content: string;
    hashtags: string[];
    mediaDescription?: string;
    status: "draft" | "scheduled" | "published";
    pillar: string;
  }>;
  stats: {
    totalPosts: number;
    byPlatform: Record<string, number>;
    byType: Record<string, number>;
    byPillar: Record<string, number>;
  };
}

export interface AIInsight {
  id: string;
  type: "opportunity" | "warning" | "trend" | "recommendation";
  title: string;
  description: string;
  data?: Record<string, any>;
  actionRequired: boolean;
  priority: "high" | "medium" | "low";
  createdAt: Date;
}

class SocialStrategyAIService {

  private platformOptimalTimes: Record<string, Record<string, number[]>> = {
    instagram: {
      monday: [11, 14, 19],
      tuesday: [10, 14, 21],
      wednesday: [11, 15, 20],
      thursday: [12, 15, 21],
      friday: [10, 14, 17],
      saturday: [10, 13],
      sunday: [10, 14, 19],
    },
    twitter: {
      monday: [8, 12, 17],
      tuesday: [9, 12, 18],
      wednesday: [9, 12, 17],
      thursday: [8, 11, 16],
      friday: [9, 11, 15],
      saturday: [9, 12],
      sunday: [9, 15],
    },
    facebook: {
      monday: [9, 13, 16],
      tuesday: [9, 12, 15],
      wednesday: [9, 12, 18],
      thursday: [8, 12, 17],
      friday: [9, 11, 14],
      saturday: [12, 13],
      sunday: [13, 15, 18],
    },
    tiktok: {
      monday: [6, 10, 22],
      tuesday: [9, 12, 19],
      wednesday: [7, 11, 22],
      thursday: [12, 15, 21],
      friday: [5, 13, 15],
      saturday: [11, 19, 21],
      sunday: [7, 8, 16],
    },
    linkedin: {
      monday: [7, 10, 12],
      tuesday: [8, 10, 12],
      wednesday: [9, 10, 12],
      thursday: [8, 10, 14],
      friday: [9, 11, 12],
      saturday: [],
      sunday: [],
    },
  };

  async getContentRecommendations(
    _userId: string,
    options: {
      platforms?: string[];
      count?: number;
      timeframe?: "today" | "week" | "month";
    } = {},
  ): Promise<ContentRecommendation[]> {
    const { platforms = ["instagram", "twitter", "tiktok"], count = 10 } =
      options;
    const results = await Promise.all(
      platforms.map((platform) =>
        getSocialAutopilotDirect({
          userId: _userId,
          platform,
          targetMetric: "engagement",
        }),
      ),
    );
    return results
      .flatMap((autopilot) =>
        autopilot.recommendations.next_topics.map((topic, index) => {
          const bestTime = new Date();
          const rawTime = autopilot.recommendations.best_posting_times?.[0];
          const match = rawTime?.match(/(?:T)?(\d{2}):(\d{2})/);
          if (match) bestTime.setHours(Number(match[1]), Number(match[2]), 0, 0);
          return {
            id: `${_userId}:${autopilot.platform}:${topic.topic}:${index}`,
            type: (autopilot.recommendations.content_type || "post") as ContentRecommendation["type"],
            platform: autopilot.platform,
            title: topic.topic,
            description: topic.hook,
            suggestedContent: [topic.hook, topic.cta].filter(Boolean).join("\n\n"),
            hashtags: [],
            bestTime,
            expectedEngagement: null,
            priority: index === 0 ? "high" : "medium",
            reasoning: topic.source || "MaxCore social autopilot",
            trendAlignment: undefined,
            contentPillars: autopilot.recommendations.style_focus || [],
          };
        }),
      )
      .slice(0, count);
  }

  private getDayName(date: Date): string {
    return [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][date?.getDay()];
  }

  private async generateSuggestedContentAsync(
    title: string,
    platform: string,
  ): Promise<string> {
    // Priority 1: full advanced AI pipeline (MaxCore → Python AI → in-house JS)
    try {
      const aiResult = await unifiedAIController?.generateContent({
        platform: platform as unknown as Record<string, unknown>,
        tone: "energetic" as unknown as Record<string, unknown>,
        topic: title,
        contentType: "engagement",
        includeHashtags: true,
        includeEmojis: true,
      });
      if (aiResult?.success && aiResult?.data) {
        const d = aiResult?.data as unknown as Record<string, unknown>;
        const caption =
          d?.caption || [d?.hook, d?.body, d?.cta].filter(Boolean).join("\n\n");
        if (caption) return caption;
      }
    } catch (err) {
      logger.warn(
        { err: err },
        "[SocialStrategy] Advanced AI failed for suggested content:",
      );
    }
    // Last-resort: static template
    return this.generateSuggestedContent(title, platform);
  }

  private generateSuggestedContent(title: string, platform: string): string {
    const templates: Record<string, string> = {
      instagram: `✨ ${title}\n\nShare your journey with your fans. Be authentic and engaging!\n\n#music #artist #creative`,
      twitter: `🎵 ${title}\n\nQuick and engaging content for your followers.\n\nWhat do you think? 👇`,
      tiktok: `${title} 🎬\n\nHook viewers in the first 3 seconds. Keep it dynamic and fun!`,
      facebook: `${title}\n\nShare the full story with your community. Encourage comments and shares!`,
      linkedin: `${title}\n\nShare professional insights and industry knowledge with your network.`,
    };
    return templates[platform] || templates?.instagram;
  }

  private generateHashtags(pillar: string, _platform: string): string[] {
    const baseHashtags = ["music", "artist", "newmusic", "musicproducer"];
    const pillarHashtags: Record<string, string[]> = {
      Educational: ["tutorial", "tips", "howto", "learn"],
      Entertainment: ["fun", "viral", "trending", "entertainment"],
      "Behind the Scenes": ["bts", "behindthescenes", "studiolife", "makingof"],
      "User Generated Content": ["fanart", "community", "fans", "ugc"],
      Promotional: ["newrelease", "outnow", "linkinbio", "streaming"],
      "Community Engagement": ["qanda", "askme", "community", "connect"],
      "Trending/Viral": ["trending", "fyp", "viral", "explore"],
      "Personal/Authentic": ["authentic", "real", "journey", "story"],
    };
    return [...baseHashtags, ...(pillarHashtags[pillar] || [])].map(
      (h) => `#${h}`,
    );
  }

  async getCampaignRecommendations(
    _userId: string,
    options: {
      objective?: string;
      budget?: number;
      duration?: number;
    } = {},
  ): Promise<CampaignRecommendation[]> {
    throw new AIUnavailableError(
      "campaign recommendations: MaxCore ads autopilot does not identify whether recommended copy came from its model or template fallback",
    );

  }

  private generateCampaignTimeline(
    startDate: Date,
    duration: number,
  ): Array<{ date: Date; action: string; platform: string }> {
    const timeline: Array<{ date: Date; action: string; platform: string }> =
      [];
    const actions = [
      { day: 0, action: "Teaser post announcement", platform: "instagram" },
      { day: 1, action: "Behind the scenes story", platform: "instagram" },
      { day: 2, action: "Countdown begins", platform: "twitter" },
      { day: 3, action: "Exclusive preview", platform: "tiktok" },
      { day: 5, action: "Fan engagement post", platform: "instagram" },
      { day: 7, action: "Mid-campaign push", platform: "tiktok" },
      {
        day: 10,
        action: "User generated content feature",
        platform: "instagram",
      },
      { day: duration - 2, action: "Final countdown", platform: "twitter" },
      {
        day: duration - 1,
        action: "Launch celebration",
        platform: "instagram",
      },
    ];

    for (const item of actions) {
      if (item?.day <= duration) {
        const date = new Date(startDate);
        date?.setDate(date?.getDate() + item?.day);
        timeline?.push({ date, action: item.action, platform: item.platform });
      }
    }

    return timeline;
  }

  async getContentStrategy(
    _userId: string,
    period: "weekly" | "monthly" | "quarterly" = "monthly",
  ): Promise<ContentStrategy> {
    const autopilot = await getSocialAutopilotDirect({
      userId: _userId,
      platform: "instagram",
      targetMetric: "engagement",
    });
    return {
      id: `${_userId}:maxcore-strategy:${period}`,
      period,
      pillars: autopilot.recommendations.next_topics.map((topic) => ({
        name: topic.topic,
        percentage: null,
        description: topic.hook,
        examples: topic.cta ? [topic.cta] : [],
      })),
      platformStrategies: [{
        platform: autopilot.platform,
        focus: autopilot.recommendations.style_focus?.join(", ") || "",
        postFrequency: null,
        contentTypes: autopilot.recommendations.content_type
          ? [autopilot.recommendations.content_type]
          : [],
        bestTimes: autopilot.recommendations.best_posting_times || [],
        tone: "",
        hashtags: [],
      }],
      themes: [],
      goals: [],
    };

  }

  private generateMonthlyThemes(
    _period: string,
  ): Array<{ week: number; theme: string; contentIdeas: string[] }> {
    const themes = [
      {
        week: 1,
        theme: "Artist Journey",
        contentIdeas: [
          "Origin story",
          "First performance throwback",
          "Goals for the year",
        ],
      },
      {
        week: 2,
        theme: "Creative Process",
        contentIdeas: ["Studio tour", "Songwriting session", "Gear breakdown"],
      },
      {
        week: 3,
        theme: "Community Focus",
        contentIdeas: ["Fan Q&A", "Cover requests", "Collaboration shoutouts"],
      },
      {
        week: 4,
        theme: "Growth & Gratitude",
        contentIdeas: [
          "Milestone celebration",
          "Thank you post",
          "Upcoming teasers",
        ],
      },
    ];
    return themes;
  }

  async getBestPostingTimes(
    _userId: string,
    platforms: string[] = ["instagram", "twitter", "tiktok"],
  ): Promise<PostingTimeRecommendation[]> {
    return Promise.all(
      platforms.map(async (platform) => {
        const result = await getSocialAutopilotDirect({
          userId: _userId,
          platform,
          targetMetric: "engagement",
        });
        const rawTime = result.recommendations.best_posting_times?.[0];
        const match = String(rawTime || "").match(/(?:T)?(\d{2}):(\d{2})/);
        if (!match) throw new AIUnavailableError("MaxCore returned no posting time");
        const hour = Number(match[1]);
        return {
          platform,
          dayOfWeek: "all",
          times: [{
            hour,
            score: null,
            audienceActivity: null,
            competitorActivity: null,
            reasoning: "MaxCore social autopilot posting window",
          }],
          overallBest: {
            day: "all",
            hour,
            expectedEngagement: null,
          },
        };
      }),
    );
  }

  async getGrowthPredictions(
    _userId: string,
    platforms: string[] = ["instagram", "twitter", "tiktok"],
  ): Promise<GrowthPrediction[]> {
    throw new AIUnavailableError(
      "social follower growth forecasting: MaxCore engagement prediction does not forecast follower counts",
    );
  }

  async getEngagementTips(
    _userId: string,
    options: {
      category?: string;
      platforms?: string[];
      limit?: number;
    } = {},
  ): Promise<EngagementTip[]> {
    const platforms = options.platforms?.length
      ? options.platforms
      : ["instagram"];
    const autopilots = await Promise.all(
      platforms.map((platform) =>
        getSocialAutopilotDirect({
          userId: _userId,
          platform,
          targetMetric: options.category || "engagement",
        }),
      ),
    );
    return autopilots
      .flatMap((autopilot) =>
        autopilot.recommendations.next_topics.map((topic, index) => ({
          id: `${_userId}:${autopilot.platform}:tip:${index}`,
          category: "content" as const,
          title: topic.topic,
          description: topic.hook,
          impact: "medium" as const,
          effort: "medium" as const,
          platforms: [autopilot.platform],
          actionItems: topic.cta ? [topic.cta] : [],
          expectedImprovement: null,
        })),
      )
      .slice(0, options.limit ?? 10);

  }

  async generateContentPlan(
    _userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      platforms?: string[];
      postsPerWeek?: number;
    } = {},
  ): Promise<ContentPlan> {
    throw new AIUnavailableError(
      "content planning: MaxCore planner is fixed workflow metadata, not an inference capability",
    );

  }

  async getAIInsights(_userId: string): Promise<AIInsight[]> {
    const autopilot = await getSocialAutopilotDirect({
      userId: _userId,
      platform: "instagram",
      targetMetric: "engagement",
    });
    return autopilot.recommendations.next_topics.map((topic, index) => ({
      id: `${_userId}:maxcore-insight:${index}`,
      type: "recommendation",
      title: topic.topic,
      description: [topic.hook, topic.cta].filter(Boolean).join(" "),
      data: {
        platform: autopilot.platform,
        source: topic.source,
        analysis: autopilot.analysis,
      },
      actionRequired: true,
      priority: index === 0 ? "high" : "medium",
      createdAt: new Date(),
    }));

  }
}

export const socialStrategyAIService = new SocialStrategyAIService();

import { logger } from "../logger.js";
import { maxCoreControlTransport } from "./maxcoreControlTransport.js";

interface MaxCoreModelState {
  domain: string;
  version: string;
  session_count: number;
  weights: { ready: boolean };
}

interface SocialGenerateResponse {
  success: boolean;
  platform: string;
  variants: Array<{
    hook?: string;
    body?: string;
    cta?: string;
    caption?: string;
    hashtags?: string[];
    source?: string;
  }>;
}

interface AdsGenerateResponse {
  success: boolean;
  platform: string;
  creatives: Array<{
    content_type: "text" | "image" | "video" | "audio";
    hook?: string;
    headline?: string;
    body?: string;
    cta?: string;
    creative_brief?: Record<string, unknown>;
    source?: string;
  }>;
  targeting?: Record<string, unknown>;
  budget_split?: Array<Record<string, unknown>> | null;
  peak_replication?: {
    avg_roas_of_peaks?: number | null;
  };
}

async function maxCoreGet<T>(path: string): Promise<T> {
  return maxCoreControlTransport.request<T>(path, {
    method: "GET",
    authScope: "admin",
  });
}

function requireModelState(
  value: unknown,
  expectedDomain: string,
): MaxCoreModelState {
  const state = value as Partial<MaxCoreModelState> | null;
  if (
    !state ||
    state.domain !== expectedDomain ||
    typeof state.version !== "string" ||
    typeof state.session_count !== "number" ||
    typeof state.weights?.ready !== "boolean"
  ) {
    throw new Error(
      `MaxCore ${expectedDomain} model state returned an invalid response contract`,
    );
  }
  return state as MaxCoreModelState;
}

async function maxCorePost<T>(
  path: string,
  body: Record<string, unknown>,
  userId: string,
): Promise<T> {
  return maxCoreControlTransport.request<T>(path, {
    method: "POST",
    authScope: "generation",
    userId,
    body,
    timeoutMs: 600_000,
  });
}

class MaxCoreSocialAutopilot {
  constructor(
    private readonly userId: string,
    private readonly state: MaxCoreModelState,
  ) {}

  getIsTrained(): boolean {
    return Boolean(this.state.weights?.ready);
  }

  getVersion(): string {
    return this.state.version;
  }

  async generateContentRecommendations(
    contentType: string,
    multimodalFeatures?: unknown,
  ): Promise<Array<Record<string, unknown>>> {
    const response = await maxCorePost<SocialGenerateResponse>(
      "/platform/social/generate",
      {
        user_id: this.userId,
        platform: "instagram",
        topic: contentType,
        tone: "authentic",
        goal: "engagement",
        num_variants: 5,
        extra_context: multimodalFeatures
          ? JSON.stringify(multimodalFeatures)
          : undefined,
      },
      this.userId,
    );
    if (!response.success || !Array.isArray(response.variants)) {
      throw new Error(
        "MaxCore social generation returned an invalid response contract",
      );
    }
    return response.variants.map((variant) => ({
      mediaType: contentType,
      platform: response.platform,
      content: variant.caption ?? variant.body ?? "",
      text: variant.caption ?? variant.body ?? "",
      hashtags: variant.hashtags ?? [],
      confidence: variant.source === "model" ? 1 : null,
      predictedEngagement: null,
      platformOptimizations: {
        hook: variant.hook,
        cta: variant.cta,
        source: variant.source,
      },
    }));
  }

  enrichPostsWithAnalyzedFeatures(
    posts: Array<Record<string, unknown>>,
    analyzedFeatures: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return posts.map((post) => ({
      ...post,
      contentAnalysis: analyzedFeatures.find(
        (feature) =>
          feature.contentUrl === post.contentUrl ||
          feature.contentText === post.content,
      ),
    }));
  }

  async trainOnUserEngagementData(): Promise<never> {
    throw new Error(
      "Per-user local model training was removed; submit measured outcomes to MaxCore feedback instead",
    );
  }
}

class MaxCoreAdvertisingAutopilot {
  constructor(
    private readonly userId: string,
    private readonly state: MaxCoreModelState,
  ) {}

  getIsTrained(): boolean {
    return Boolean(this.state.weights?.ready);
  }

  getVersion(): string {
    return this.state.version;
  }

  getAudienceSegments(): unknown[] {
    return [];
  }

  getViralSuccessRate(): number | null {
    return null;
  }

  getAvgOrganicReachMultiplier(): number | null {
    return null;
  }

  async generateCampaignRecommendations(
    objective: string,
    multimodalFeatures?: Record<string, unknown> | null,
  ): Promise<Array<Record<string, unknown>>> {
    const platform = String(multimodalFeatures?.platform ?? "meta");
    const response = await maxCorePost<AdsGenerateResponse>(
      "/platform/ads/generate",
      {
        user_id: this.userId,
        platform,
        ad_type: "video",
        product: String(
          multimodalFeatures?.beatContext ??
            multimodalFeatures?.product ??
            "music",
        ),
        goal: objective,
        num_creatives: 4,
        vary_subtypes: true,
        replicate_peak: true,
        extra_context: multimodalFeatures
          ? JSON.stringify(multimodalFeatures)
          : undefined,
      },
      this.userId,
    );
    if (!response.success || !Array.isArray(response.creatives)) {
      throw new Error(
        "MaxCore advertising generation returned an invalid response contract",
      );
    }
    return response.creatives.map((creative, index) => ({
      name: creative.headline ?? `MaxCore creative ${index + 1}`,
      platforms: [response.platform],
      mediaType: creative.content_type,
      content: creative.body ?? creative.hook ?? "",
      creatives: [creative],
      targetAudience: response.targeting ?? null,
      suggestedBudget:
        response.budget_split?.find((item) => item.variant === index + 1)
          ?.daily_budget ?? null,
      expectedReach: null,
      expectedEngagement: null,
      predictedROI: response.peak_replication?.avg_roas_of_peaks ?? null,
      confidence: creative.source === "model" ? 1 : null,
      platformOptimizations: creative.creative_brief ?? {},
    }));
  }

  enrichCampaignsWithAnalyzedFeatures(
    campaigns: Array<Record<string, unknown>>,
    analyzedFeatures: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return campaigns.map((campaign) => ({
      ...campaign,
      contentAnalysis: analyzedFeatures.find(
        (feature) => feature.contentUrl === campaign.contentUrl,
      ),
    }));
  }

  async trainOnHistoricalCampaigns(): Promise<never> {
    throw new Error(
      "Per-user local advertising training was removed; submit measured campaign outcomes to MaxCore",
    );
  }
}

class AIModelManager {
  private socialLoads = 0;
  private advertisingLoads = 0;

  async getSocialAutopilot(userId: string): Promise<MaxCoreSocialAutopilot> {
    const state = requireModelState(
      await maxCoreGet<unknown>("/api/models/social/state"),
      "social",
    );
    this.socialLoads++;
    return new MaxCoreSocialAutopilot(userId, state);
  }

  async getAdvertisingAutopilot(
    userId: string,
  ): Promise<MaxCoreAdvertisingAutopilot> {
    const state = requireModelState(
      await maxCoreGet<unknown>("/api/models/advertising/state"),
      "advertising",
    );
    this.advertisingLoads++;
    return new MaxCoreAdvertisingAutopilot(userId, state);
  }

  async predictEngagement(
    userId: string,
    input: {
      platform: string;
      content: string;
      extraContext?: unknown;
    },
  ): Promise<Record<string, unknown>> {
    return maxCoreControlTransport.request<Record<string, unknown>>(
      "/predict/engagement",
      {
        method: "POST",
        authScope: "generation",
        userId,
        timeoutMs: 60_000,
        body: {
          platform: input.platform,
          action: "predict_engagement",
          content: input.content,
          ...(input.extraContext !== undefined
            ? { extra_context: JSON.stringify(input.extraContext) }
            : {}),
        },
      },
    );
  }

  async saveSocialModel(): Promise<never> {
    throw new Error("MaxCore owns social model persistence");
  }

  async saveAdvertisingModel(): Promise<never> {
    throw new Error("MaxCore owns advertising model persistence");
  }

  getCacheStats() {
    return {
      socialModels: { count: 0, max: 0, trained: 0 },
      advertisingModels: { count: 0, max: 0, trained: 0 },
      authority: "maxcore",
    };
  }

  clearCache(): void {}

  shutdown(): void {
    logger.info("MaxCore model facade shut down");
  }

  getMetrics() {
    return {
      authority: "maxcore",
      socialLoads: this.socialLoads,
      advertisingLoads: this.advertisingLoads,
    };
  }

  getTelemetrySummary() {
    return this.getMetrics();
  }
}

export const aiModelManager = new AIModelManager();
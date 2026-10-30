import { AIUnavailableError } from "../lib/aiSource.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";

export type MaxCoreTransport = <T>(
  path: string,
  body: Record<string, unknown>,
) => Promise<T | null>;

export interface SocialGenerationRequest {
  userId: string;
  platform: string;
  topic: string;
  tone?: string;
  goal?: string;
  styleTags?: string[];
  includeHashtags?: boolean;
  numVariants?: number;
  targetAudience?: string;
  hashtagStrategy?: string;
  captionLength?: string;
  callToActionStrength?: string;
  instruction?: string;
  extraContext?: string;
  contentThemes?: string[];
  awareness?: unknown;
  intent?: unknown;
  direction?: unknown;
  context?: unknown;
}

export interface MaxCoreSocialVariant {
  variant?: number;
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  source?: string;
}

export interface MaxCoreSocialGeneration {
  success: true;
  user_id: string;
  platform: string;
  topic: string;
  personalized_tone?: string;
  variants: MaxCoreSocialVariant[];
  processing_time_ms?: number;
}

export interface AdsGenerationRequest {
  userId: string;
  platform: string;
  product: string;
  adType?: string;
  goal?: string;
  budgetDaily?: number;
  numCreatives?: number;
  replicatePeak?: boolean;
  genre?: string;
  artistName?: string;
  varySubtypes?: boolean;
  targetSubtypes?: string[];
  awareness?: unknown;
  intent?: unknown;
  direction?: unknown;
  context?: unknown;
  instruction?: string;
  contentThemes?: string[];
}

export interface MaxCoreAdCreative {
  variant?: number;
  content_type?: string;
  hook: string;
  headline: string;
  body: string;
  cta: string;
  creative_brief?: Record<string, unknown>;
  source?: string;
}

export interface MaxCoreAdsGeneration {
  success: true;
  user_id: string;
  platform: string;
  ad_type: string;
  product: string;
  goal: string;
  creatives: MaxCoreAdCreative[];
  targeting: Record<string, unknown>;
  budget_split?: Array<Record<string, unknown>> | null;
  platform_benchmarks?: Record<string, unknown>;
  launch_checklist?: string[];
  peak_replication?: Record<string, unknown>;
  subtype_selection?: Record<string, unknown>;
  processing_time_ms?: number;
}

export interface MaxCoreSocialAutopilot {
  success: true;
  user_id: string;
  platform: string;
  analysis: {
    avg_engagement_rate?: number;
    top_style_tags?: string[];
    best_content_type?: string;
    data_points?: number;
  };
  recommendations: {
    next_topics: Array<{
      topic: string;
      hook: string;
      cta: string;
      source?: string;
    }>;
    best_posting_times?: string[];
    content_type?: string;
    style_focus?: string[];
  };
  autopilot_ready?: boolean;
  model_powered?: boolean;
  processing_time_ms?: number;
}

export interface MaxCorePlannerStep {
  id: number | string;
  action: string;
  description: string;
}

export async function getSocialAutopilotDirect(
  request: {
    userId: string;
    platform: string;
    recentPosts?: Array<Record<string, unknown>>;
    targetMetric?: string;
    instruction?: string;
    extraContext?: string;
    contentThemes?: string[];
    awareness?: unknown;
    intent?: unknown;
    direction?: unknown;
    context?: unknown;
  },
  transport: MaxCoreTransport = defaultTransport,
): Promise<MaxCoreSocialAutopilot> {
  const raw = await transport<Record<string, unknown>>(
    "/api/platform/social/autopilot",
    {
      user_id: requiredText(request.userId, "social autopilot user_id"),
      platform: requiredText(request.platform, "social autopilot platform"),
      recent_posts: request.recentPosts ?? [],
      target_metric: request.targetMetric ?? "engagement",
      instruction: request.instruction,
      extra_context: request.extraContext,
      content_themes: request.contentThemes,
      awareness: request.awareness,
      intent: request.intent,
      direction: request.direction,
      context: request.context,
    },
  );
  const recommendations =
    raw?.recommendations &&
    typeof raw.recommendations === "object" &&
    !Array.isArray(raw.recommendations)
      ? (raw.recommendations as Record<string, unknown>)
      : null;
  if (
    !raw ||
    raw.success !== true ||
    !recommendations ||
    !Array.isArray(recommendations.next_topics)
  ) {
    throw new AIUnavailableError("social autopilot");
  }
  const nextTopics = recommendations.next_topics.map((item) => {
    if (!item || typeof item !== "object") {
      throw new AIUnavailableError("MaxCore returned invalid social recommendation");
    }
    const topic = item as Record<string, unknown>;
    const source = optionalText(topic.source);
    if (!source || /template|fallback|heuristic/i.test(source)) {
      throw new AIUnavailableError(
        "MaxCore social autopilot did not return model-generated recommendations",
      );
    }
    return {
      topic: requiredText(topic.topic, "social recommendation topic"),
      hook: requiredText(topic.hook, "social recommendation hook"),
      cta: optionalText(topic.cta),
      source,
    };
  });
  if (nextTopics.length === 0) {
    throw new AIUnavailableError("social autopilot recommendations");
  }
  if (raw.model_powered !== true) {
    throw new AIUnavailableError("MaxCore social autopilot model was unavailable");
  }
  const analysis =
    raw.analysis && typeof raw.analysis === "object"
      ? (raw.analysis as MaxCoreSocialAutopilot["analysis"])
      : {};
  return {
    success: true,
    user_id: requiredText(raw.user_id, "social autopilot response user_id"),
    platform: requiredText(raw.platform, "social autopilot response platform"),
    analysis,
    recommendations: {
      next_topics: nextTopics,
      best_posting_times: Array.isArray(recommendations.best_posting_times)
        ? recommendations.best_posting_times.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      content_type: optionalText(recommendations.content_type) || undefined,
      style_focus: Array.isArray(recommendations.style_focus)
        ? recommendations.style_focus.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    },
    autopilot_ready:
      typeof raw.autopilot_ready === "boolean" ? raw.autopilot_ready : undefined,
    model_powered:
      typeof raw.model_powered === "boolean" ? raw.model_powered : undefined,
    processing_time_ms:
      typeof raw.processing_time_ms === "number"
        ? raw.processing_time_ms
        : undefined,
  };
}

export async function generatePlannerDirect(
  request: {
    system: string;
    inputs?: Record<string, unknown>;
    intent?: string;
  },
  transport: MaxCoreTransport = defaultTransport,
): Promise<MaxCorePlannerStep[]> {
  void request;
  void transport;
  throw new AIUnavailableError(
    "text planning: MaxCore planner is fixed workflow metadata, not inference",
  );
}

export async function predictEngagementDirect(
  request: {
    platform: string;
    action:
      | "predict_engagement"
      | "viral_potential"
      | "best_time"
      | "recommend_type"
      | "optimize_schedule";
    content: unknown;
    postsPerWeek?: number;
    awareness?: unknown;
  },
  transport: MaxCoreTransport = defaultTransport,
): Promise<Record<string, unknown>> {
  void request;
  void transport;
  throw new AIUnavailableError(
    "engagement prediction: MaxCore endpoint is heuristic and not an AI prediction contract",
  );
}

export async function getAdsAutopilotDirect(
  request: {
    userId: string;
    platform?: string;
    budgetTotal?: number;
    goal?: string;
    currentCampaigns?: Array<Record<string, unknown>>;
    intent?: unknown;
    direction?: unknown;
    context?: unknown;
    awareness?: unknown;
  },
  transport: MaxCoreTransport = defaultTransport,
): Promise<Record<string, unknown>> {
  const raw = await transport<Record<string, unknown>>(
    "/api/platform/ads/autopilot",
    {
      user_id: requiredText(request.userId, "ads autopilot user_id"),
      platform: request.platform,
      budget_total: request.budgetTotal,
      goal: request.goal ?? "streams",
      current_campaigns: request.currentCampaigns ?? [],
      intent: request.intent,
      direction: request.direction,
      context: request.context,
      awareness: request.awareness,
    },
  );
  if (!raw || raw.success !== true || !Array.isArray(raw.next_campaigns)) {
    throw new AIUnavailableError("ads autopilot");
  }
  return raw;
}

export async function getAdsAudienceDirect(
  request: {
    userId: string;
    platform: string;
    product: string;
    goal?: string;
    genre?: string;
    budgetDaily?: number;
    intent?: unknown;
    direction?: unknown;
    context?: unknown;
    awareness?: unknown;
  },
  transport: MaxCoreTransport = defaultTransport,
): Promise<Record<string, unknown>> {
  const raw = await transport<Record<string, unknown>>(
    "/api/platform/ads/audience",
    {
      user_id: requiredText(request.userId, "ads audience user_id"),
      platform: requiredText(request.platform, "ads audience platform"),
      product: requiredText(request.product, "ads audience product"),
      goal: request.goal ?? "streams",
      genre: request.genre,
      budget_daily: request.budgetDaily,
      intent: request.intent,
      direction: request.direction,
      context: request.context,
      awareness: request.awareness,
    },
  );
  const cold =
    raw?.cold_audience &&
    typeof raw.cold_audience === "object" &&
    !Array.isArray(raw.cold_audience)
      ? (raw.cold_audience as Record<string, unknown>)
      : null;
  if (
    !raw ||
    raw.success !== true ||
    !cold ||
    !Array.isArray(cold.interests)
  ) {
    throw new AIUnavailableError("ad audience targeting");
  }
  return raw;
}

const defaultTransport: MaxCoreTransport = (path, body) =>
  MaxCoreAIClient.generate(path, body);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AIUnavailableError(`MaxCore returned invalid ${field}`);
  }
  return value;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function generateSocialDirect(
  request: SocialGenerationRequest,
  transport: MaxCoreTransport = defaultTransport,
): Promise<MaxCoreSocialGeneration> {
  const raw = await transport<Record<string, unknown>>(
    "/api/platform/social/generate",
    {
      user_id: requiredText(request.userId, "social user_id"),
      platform: requiredText(request.platform, "social platform"),
      topic: requiredText(request.topic, "social topic"),
      tone: request.tone ?? "authentic",
      goal: request.goal ?? "growth",
      style_tags: request.styleTags ?? [],
      include_hashtags: request.includeHashtags ?? true,
      num_variants: Math.max(1, Math.min(5, request.numVariants ?? 1)),
      ...(request.targetAudience
        ? { target_audience: request.targetAudience }
        : {}),
      ...(request.hashtagStrategy
        ? { hashtag_strategy: request.hashtagStrategy }
        : {}),
      ...(request.captionLength
        ? { caption_length: request.captionLength }
        : {}),
      ...(request.callToActionStrength
        ? { call_to_action_strength: request.callToActionStrength }
        : {}),
      instruction: request.instruction,
      extra_context: request.extraContext,
      content_themes: request.contentThemes,
      awareness: request.awareness,
      intent: request.intent,
      direction: request.direction,
      context: request.context,
    },
  );
  if (!raw || raw.success !== true || !Array.isArray(raw.variants)) {
    throw new AIUnavailableError("social generation");
  }
  const variants = raw.variants.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new AIUnavailableError("MaxCore returned invalid social variant");
    }
    const variant = item as Record<string, unknown>;
    const hook = optionalText(variant.hook);
    const body = optionalText(variant.body);
    const cta = optionalText(variant.cta);
    const caption = optionalText(variant.caption);
    if (![hook, body, cta, caption].some((part) => part.trim())) {
      throw new AIUnavailableError("MaxCore returned empty social variant");
    }
    const source = optionalText(variant.source);
    if (!source || /template|fallback|heuristic/i.test(source)) {
      throw new AIUnavailableError(
        "MaxCore social generation did not return model output",
      );
    }
    return {
      variant:
        typeof variant.variant === "number" ? variant.variant : index + 1,
      hook,
      body,
      cta,
      caption,
      hashtags: Array.isArray(variant.hashtags)
        ? variant.hashtags.filter((tag): tag is string => typeof tag === "string")
        : [],
      source,
    };
  });
  if (variants.length === 0) {
    throw new AIUnavailableError("social generation");
  }
  return {
    success: true,
    user_id: requiredText(raw.user_id, "social response user_id"),
    platform: requiredText(raw.platform, "social response platform"),
    topic: requiredText(raw.topic, "social response topic"),
    personalized_tone: optionalText(raw.personalized_tone) || undefined,
    variants,
    processing_time_ms:
      typeof raw.processing_time_ms === "number"
        ? raw.processing_time_ms
        : undefined,
  };
}

export async function generateAdsDirect(
  request: AdsGenerationRequest,
  transport: MaxCoreTransport = defaultTransport,
): Promise<MaxCoreAdsGeneration> {
  const raw = await transport<Record<string, unknown>>(
    "/api/platform/ads/generate",
    {
      user_id: requiredText(request.userId, "ads user_id"),
      platform: requiredText(request.platform, "ads platform"),
      product: requiredText(request.product, "ads product"),
      ad_type: request.adType ?? "video",
      goal: request.goal ?? "streams",
      budget_daily: request.budgetDaily,
      num_creatives: Math.max(1, Math.min(10, request.numCreatives ?? 3)),
      replicate_peak: request.replicatePeak ?? true,
      genre: request.genre,
      artist_name: request.artistName,
      vary_subtypes: request.varySubtypes ?? true,
      target_subtypes: request.targetSubtypes,
      awareness: request.awareness,
      intent: request.intent,
      direction: request.direction,
      context: request.context,
      instruction: request.instruction,
      content_themes: request.contentThemes,
    },
  );
  if (!raw || raw.success !== true || !Array.isArray(raw.creatives)) {
    throw new AIUnavailableError("ad generation");
  }
  const creatives = raw.creatives.map((item) => {
    if (!item || typeof item !== "object") {
      throw new AIUnavailableError("MaxCore returned invalid ad creative");
    }
    const creative = item as Record<string, unknown>;
    const result = {
      variant:
        typeof creative.variant === "number" ? creative.variant : undefined,
      content_type: optionalText(creative.content_type) || undefined,
      hook: optionalText(creative.hook),
      headline: optionalText(creative.headline),
      body: optionalText(creative.body),
      cta: optionalText(creative.cta),
      creative_brief:
        creative.creative_brief &&
        typeof creative.creative_brief === "object" &&
        !Array.isArray(creative.creative_brief)
          ? (creative.creative_brief as Record<string, unknown>)
          : undefined,
      source: optionalText(creative.source) || undefined,
    };
    if (![result.hook, result.headline, result.body, result.cta].some(Boolean)) {
      throw new AIUnavailableError("MaxCore returned empty ad creative");
    }
    if (!result.source || /template|fallback|heuristic/i.test(result.source)) {
      throw new AIUnavailableError(
        "MaxCore ad generation did not return model output",
      );
    }
    return result;
  });
  if (creatives.length === 0) throw new AIUnavailableError("ad generation");
  return {
    success: true,
    user_id: requiredText(raw.user_id, "ads response user_id"),
    platform: requiredText(raw.platform, "ads response platform"),
    ad_type: requiredText(raw.ad_type, "ads response ad_type"),
    product: requiredText(raw.product, "ads response product"),
    goal: requiredText(raw.goal, "ads response goal"),
    creatives,
    targeting:
      raw.targeting && typeof raw.targeting === "object"
        ? (raw.targeting as Record<string, unknown>)
        : {},
    budget_split: Array.isArray(raw.budget_split)
      ? (raw.budget_split as Array<Record<string, unknown>>)
      : null,
    platform_benchmarks:
      raw.platform_benchmarks &&
      typeof raw.platform_benchmarks === "object"
        ? (raw.platform_benchmarks as Record<string, unknown>)
        : undefined,
    launch_checklist: Array.isArray(raw.launch_checklist)
      ? raw.launch_checklist.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
    peak_replication:
      raw.peak_replication && typeof raw.peak_replication === "object"
        ? (raw.peak_replication as Record<string, unknown>)
        : undefined,
    subtype_selection:
      raw.subtype_selection && typeof raw.subtype_selection === "object"
        ? (raw.subtype_selection as Record<string, unknown>)
        : undefined,
    processing_time_ms:
      typeof raw.processing_time_ms === "number"
        ? raw.processing_time_ms
        : undefined,
  };
}
import path from "path";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "fs/promises";
import { AIUnavailableError } from "../lib/aiSource.js";
import { trustedMaxcoreOwner } from "../lib/maxcoreOwnerContext.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOriginOrDefault,
} from "./maxcoreConnector.js";
import { resolveAudioUrlToLocalFile } from "./audioSourceResolver.js";
import { MaxCoreControlError } from "./maxcoreControlTransport.js";

// Consolidated from server/services/maxcoreDomainAdapter.ts; retained as a named section for traceability.
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

const defaultTransport: MaxCoreTransport = async (path, body) => {
  const { MaxCoreAIClient } = await import("./maxcoreClient.js");
  return MaxCoreAIClient.generate(
    path,
    body,
    typeof body.user_id === "string" ? body.user_id : undefined,
  );
};

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

// Consolidated from server/services/socialUrlMaxCoreTransport.ts; retained as a named section for traceability.
export const SOCIAL_URL_MAXCORE_ENDPOINT = "/api/platform/social/generate";

export interface SocialUrlGenerationOptions {
  url: string;
  topic?: string;
  extraContext?: string;
  platform: string;
  userId: string;
  tone: string;
  format: string;
  targetAudience?: string;
  hashtagStrategy?: string;
  captionLength?: string;
  callToActionStrength?: string;
  genre?: string;
  contentType?: string;
  intent?: unknown;
  direction?: unknown;
  context?: unknown;
  awareness?: unknown;
}

export interface SocialUrlMaxCoreVariant {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
}

interface SocialUrlMaxCoreResponse {
  variants?: Array<{
    hook?: unknown;
    body?: unknown;
    cta?: unknown;
    caption?: unknown;
    hashtags?: unknown;
  }>;
}

const PLATFORM_ALIASES: Record<string, string> = {
  threads: "instagram",
  googlebusiness: "facebook",
};

/**
 * Build the dedicated MaxCore social-generation request.
 *
 * External URLs remain the topic so MaxCore's guarded URL resolver handles
 * them. A first-party page with an internal authoritative source can instead
 * provide a non-URL topic and verified context, avoiding a second network fetch.
 */
export function buildSocialUrlMaxCoreRequest(
  options: SocialUrlGenerationOptions,
): Record<string, unknown> {
  const platform =
    PLATFORM_ALIASES[options.platform] ?? options.platform;
  const body: Record<string, unknown> = {
    user_id: options.userId,
    topic: options.topic?.trim() || options.url.trim(),
    platform,
    tone: options.tone,
    output_format: options.format,
    num_variants: 1,
  };

  if (options.targetAudience) {
    body.target_audience = options.targetAudience;
  }
  if (options.hashtagStrategy) {
    body.hashtag_strategy = options.hashtagStrategy;
  }
  if (options.captionLength) {
    body.caption_length = options.captionLength;
  }
  if (options.callToActionStrength) {
    body.call_to_action_strength = options.callToActionStrength;
  }
  if (options.genre && options.genre !== "default") {
    body.genre = options.genre;
  }
  if (options.contentType) {
    body.content_type = options.contentType;
  }
  if (options.extraContext?.trim()) {
    body.extra_context = options.extraContext.trim();
  }
  if (options.intent !== undefined) body.intent = options.intent;
  if (options.direction !== undefined) body.direction = options.direction;
  if (options.context !== undefined) body.context = options.context;
  if (options.awareness !== undefined) body.awareness = options.awareness;

  return body;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normalize MaxCore's documented nested `{ variants: [...] }` social shape. */
export function normalizeSocialUrlMaxCoreResponse(
  response: SocialUrlMaxCoreResponse | null,
): SocialUrlMaxCoreVariant | null {
  const raw = response?.variants?.[0];
  if (!raw) return null;

  const hook = text(raw.hook);
  const body = text(raw.body);
  const cta = text(raw.cta);
  const explicitCaption = text(raw.caption);
  const caption =
    explicitCaption || [hook, body, cta].filter(Boolean).join("\n\n");
  if (!caption) return null;

  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return { hook, body, cta, caption, hashtags };
}

export function isSocialUrlSourceRejection(error: unknown): boolean {
  return (
    error instanceof MaxCoreControlError &&
    (error.status === 400 || error.status === 422)
  );
}

export type SocialUrlGenerationFailure =
  | "source_rejected"
  | "service_unavailable"
  | "authorization_failed"
  | "empty_generation"
  | "transport_failed";

/**
 * Collapse per-platform MaxCore outcomes into a safe, actionable UI category.
 * Never return raw provider errors here: they can contain submitted URLs,
 * prompts, or upstream diagnostics.
 */
export function classifySocialUrlGenerationFailure(
  outcomes: readonly PromiseSettledResult<{
    result: SocialUrlMaxCoreVariant | null;
  }>[],
): SocialUrlGenerationFailure {
  const rejected = outcomes.flatMap((outcome) =>
    outcome.status === "rejected" ? [outcome.reason] : [],
  );
  if (
    rejected.length > 0 &&
    rejected.every(isSocialUrlSourceRejection)
  ) {
    return rejected.length === outcomes.length
      ? "source_rejected"
      : "empty_generation";
  }
  if (
    rejected.some(
      (error) =>
        error instanceof AIUnavailableError ||
        (error instanceof MaxCoreControlError && error.status === 503),
    )
  ) {
    return "service_unavailable";
  }
  if (
    rejected.some(
      (error) =>
        error instanceof MaxCoreControlError &&
        (error.status === 401 || error.status === 403),
    )
  ) {
    return "authorization_failed";
  }
  if (rejected.length > 0) {
    return "transport_failed";
  }
  if (
    outcomes.some(
      (outcome) =>
        outcome.status === "fulfilled" && outcome.value.result === null,
    ) ||
    outcomes.length === 0
  ) {
    return "empty_generation";
  }
  return "empty_generation";
}

export async function generateSocialUrlWithMaxCore(
  options: SocialUrlGenerationOptions,
): Promise<SocialUrlMaxCoreVariant | null> {
  const { MaxCoreAIClient } = await import("./maxcoreClient.js");
  const response = await MaxCoreAIClient.generate<SocialUrlMaxCoreResponse>(
    SOCIAL_URL_MAXCORE_ENDPOINT,
    buildSocialUrlMaxCoreRequest(options),
  );
  return normalizeSocialUrlMaxCoreResponse(response);
}

// Consolidated from server/services/studioMaxCoreTransport.ts; retained as a named section for traceability.
export async function maxCoreStudioJson<T>(
  pathName: string,
  method: "GET" | "POST",
  userId: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!userId?.trim()) {
    throw new AIUnavailableError("studio generation requires an authenticated owner");
  }
  const { MaxCoreAIClient } = await import("./maxcoreClient.js");
  const response = method === "POST"
    ? await MaxCoreAIClient.generate<T>(pathName, body ?? {}, userId, 60_000)
    : await MaxCoreAIClient.poll<T>(pathName, userId, 30_000, true);
  if (response === null) {
    throw new AIUnavailableError("MaxCore studio generation returned no response");
  }
  return response;
}

// Consolidated from server/services/maxcoreAssetTransport.ts; retained as a named section for traceability.
const MAX_BYTES = 100 * 1024 * 1024;
const OWNED_AUDIO_PATH =
  /^\/uploads\/audio-inputs\/[a-f0-9]{64}\/[a-f0-9-]+\.(?:wav|mp3|flac|ogg|opus|webm|m4a|aac|aiff)$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
};

function existingMaxCoreAsset(source: string): string | null {
  if (OWNED_AUDIO_PATH.test(source)) return source;
  try {
    const origin = new URL(getMaxcoreOriginOrDefault());
    const candidate = new URL(source);
    return candidate.origin === origin.origin && OWNED_AUDIO_PATH.test(candidate.pathname)
      ? candidate.pathname
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an application-owned audio URL/key to bytes and transfer it into
 * MaxCore's owner-scoped uploads. Temporary resolver files are always cleaned.
 */
export async function ensureMaxCoreAudioAsset(
  audioSource: string,
  userId: string,
): Promise<string> {
  if (!audioSource) throw new AIUnavailableError("MaxCore audio transfer (source required)");
  if (!userId) throw new AIUnavailableError("MaxCore audio transfer (owner required)");
  const existing = existingMaxCoreAsset(audioSource);
  if (existing) {
    if (existing.split("/")[3] !== createHash("sha256").update(userId).digest("hex")) {
      throw new AIUnavailableError("MaxCore audio source access denied");
    }
    return existing;
  }

  const resolved = await resolveAudioUrlToLocalFile(audioSource, userId).catch((error) => {
    throw new AIUnavailableError(
      `MaxCore audio transfer: ${(error as Error).message}`,
    );
  });
  return uploadResolvedAudio(resolved, userId);
}

/**
 * Transfer a Multer-owned audio upload from the private temporary upload
 * directory. This accepts only a direct, real file created under
 * uploads/media_temp; arbitrary server filesystem paths are rejected.
 */
export async function ensureMaxCoreMediaTempUpload(
  localPath: string,
  userId: string,
): Promise<string> {
  if (!localPath) throw new AIUnavailableError("MaxCore audio transfer (source required)");
  if (!userId) throw new AIUnavailableError("MaxCore audio transfer (owner required)");

  let trustedRoot: string;
  let trustedFile: string;
  try {
    [trustedRoot, trustedFile] = await Promise.all([
      realpath(path.resolve(process.cwd(), "uploads", "media_temp")),
      realpath(localPath),
    ]);
  } catch {
    throw new AIUnavailableError("MaxCore audio transfer (temporary upload unavailable)");
  }

  const relativePath = path.relative(trustedRoot, trustedFile);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    relativePath.includes(path.sep) ||
    !/^media_[a-f0-9]{16}\.[a-z0-9]+$/i.test(relativePath)
  ) {
    throw new AIUnavailableError("MaxCore audio transfer (invalid temporary upload)");
  }

  const fileStat = await stat(trustedFile).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new AIUnavailableError("MaxCore audio transfer (temporary upload unavailable)");
  }

  return uploadResolvedAudio(
    { localPath: trustedFile, cleanup: async () => {} },
    userId,
  );
}

async function uploadResolvedAudio(
  resolved: { localPath: string; cleanup: () => Promise<void> },
  userId: string,
): Promise<string> {
  try {
    const size = (await stat(resolved.localPath)).size;
    if (size === 0) throw new AIUnavailableError("MaxCore audio transfer (empty source)");
    if (size > MAX_BYTES) throw new AIUnavailableError("MaxCore audio transfer (source exceeds 100 MiB)");
    const contentType = MIME_BY_EXTENSION[path.extname(resolved.localPath).toLowerCase()];
    if (!contentType) {
      throw new AIUnavailableError("MaxCore audio transfer (unsupported audio type)");
    }
    const response = await fetch(
      `${getMaxcoreOriginOrDefault()}/api/audio/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getMaxcoreGenerationKey()}`,
          "X-MaxCore-User-Id": userId,
          "Content-Type": contentType,
          "Content-Length": String(size),
        },
        body: await readFile(resolved.localPath),
        signal: AbortSignal.timeout(120_000),
      },
    ).catch((error) => {
      throw new AIUnavailableError(
        `MaxCore audio transfer: ${(error as Error).message}`,
      );
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AIUnavailableError(
        `MaxCore audio transfer returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`,
      );
    }
    const result = (await response.json().catch(() => null)) as { url?: string } | null;
    if (!result?.url || !OWNED_AUDIO_PATH.test(result.url)) {
      throw new AIUnavailableError("MaxCore audio transfer returned an invalid asset URL");
    }
    return result.url;
  } finally {
    await resolved.cleanup();
  }
}

// Consolidated from server/services/maxcoreAudioJob.ts; retained as a named section for traceability.
export interface MaxCoreAudioJob {
  job_id?: string;
  status?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  audio_data?: string;
  wav_b64?: string;
  audio_b64?: string;
  result?: MaxCoreAudioJob;
  [key: string]: unknown;
}

export function maxcoreAudioSource(job: MaxCoreAudioJob): string | undefined {
  const nested = job.result && typeof job.result === "object" ? job.result : {};
  return [job.audioUrl, job.audio_url, job.url, nested.audioUrl, nested.audio_url, nested.url]
    .find(value => typeof value === "string" && value.length > 0);
}

export function maxcoreAudioBytes(job: MaxCoreAudioJob): string | undefined {
  const nested = job.result && typeof job.result === "object" ? job.result : {};
  return [job.audio_data, job.wav_b64, job.audio_b64, nested.audio_data, nested.wav_b64, nested.audio_b64]
    .find(value => typeof value === "string" && value.length > 0);
}

/** Resolve the actual async audio contract without losing its trusted owner. */
export async function resolveMaxCoreAudioJob<T extends MaxCoreAudioJob>(
  submitted: T,
  ownerId?: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    poll?: typeof import("./maxcoreClient.js").MaxCoreAIClient.poll;
  } = {},
): Promise<T> {
  const owner = trustedMaxcoreOwner(ownerId);
  if (!owner) throw new AIUnavailableError("audio generation requires an authenticated owner");
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const poll = options.poll ?? (await import("./maxcoreClient.js")).MaxCoreAIClient.poll;
  const deadline = now() + timeoutMs;
  const jobId = submitted.job_id;
  let current = submitted;
  for (;;) {
    const status = typeof current.status === "string" ? current.status.toLowerCase() : "";
    if (["failed", "error", "cancelled", "canceled", "timed_out", "timeout", "expired"].includes(status)) {
      throw new AIUnavailableError(`audio generation ${status}`);
    }
    if (maxcoreAudioSource(current) || maxcoreAudioBytes(current)) return current;
    if (["done", "completed", "succeeded"].includes(status)) {
      throw new AIUnavailableError("completed audio job returned no artifact");
    }
    if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(jobId)) {
      throw new AIUnavailableError("audio generation returned no valid job reference");
    }
    if (now() >= deadline) throw new AIUnavailableError("audio generation exceeded its completion deadline");
    let result: T | null = null;
    try {
      result = await poll<T>(`/api/audio-job/${encodeURIComponent(jobId)}`, owner,
        Math.min(30_000, Math.max(1, deadline - now())), true);
    } catch (error) {
      // Authentication/ownership/not-found failures are terminal. Network and
      // dependency failures may recover within the same bounded job budget.
      if (!(error instanceof MaxCoreControlError) || error.status < 500) {
        throw new AIUnavailableError("audio generation job is unavailable or access was denied");
      }
    }
    if (result) current = { ...submitted, ...result };
    else current = submitted;
    const nextStatus = typeof current.status === "string" ? current.status.toLowerCase() : "";
    if (maxcoreAudioSource(current) || maxcoreAudioBytes(current) ||
        ["failed", "error", "cancelled", "canceled", "timed_out", "timeout", "expired",
          "done", "completed", "succeeded"].includes(nextStatus)) continue;
    if (now() >= deadline) throw new AIUnavailableError("audio generation exceeded its completion deadline");
    await sleep(Math.min(intervalMs, deadline - now()));
  }
}

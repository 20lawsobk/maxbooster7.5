/**
 * Advertising autopilot runner — the automated counterpart to the manual
 * "Promote Your Content" flow in promotableContentService.ts. When a user
 * has the advertising autopilot enabled (server/routes/advertising.ts
 * start/configure), this periodically picks an eligible, not-yet-promoted
 * item from across their owned content (beats, releases, storefronts,
 * published posts, artist EPK) and launches a real organic ad campaign to
 * their connected social accounts — the same dispatch path Beat Money Loop
 * uses, generalized across content types instead of being beat-only.
 */
import { db } from "./../db.js";
import { adCampaigns, adCreatives } from "@shared/schema";
import { eq, and, count, gte, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { advertisingDispatchService } from "./advertisingDispatchService.js";
import { aiContentService } from "./aiContentService.js";
import { aiModelManager } from "./aiModelManager.js";
import { autopilotLearningService } from "./autopilotLearningService.js";
import {
  listPromotableContent,
  resolvePromotableContent,
  PROMOTABLE_CONTENT_TYPES,
  type PromotableContentType,
  type ResolvedPromotableContent,
} from "./promotableContentService.js";

const AUTOPILOT_SOURCE = "advertising-autopilot";

const CALL_TO_ACTION: Record<PromotableContentType, string> = {
  beat: "License This Beat",
  release: "Stream Now",
  storefront: "Shop Now",
  social_post: "See More",
  epk: "Follow the Artist",
};

const FREQUENCY_MS: Record<string, number> = {
  hourly: 3_600_000,
  "twice-daily": 43_200_000,
  daily: 86_400_000,
  "every-2-days": 172_800_000,
  weekly: 604_800_000,
};

const SUPPORTED_PLATFORMS = new Set([
  "facebook",
  "instagram",
  "twitter",
  "tiktok",
  "youtube",
  "linkedin",
  "threads",
]);
const SUPPORTED_OBJECTIVES = new Set([
  "awareness",
  "engagement",
  "conversions",
  "traffic",
  "viral",
]);
const SUPPORTED_BRAND_VOICES = new Set([
  "professional",
  "casual",
  "energetic",
  "informative",
]);

export interface AutopilotTickResult {
  ran: boolean;
  reason?: string;
  contentType?: PromotableContentType;
  contentId?: string;
  campaignId?: string;
  posted?: boolean;
}

function dueForRun(config: Record<string, any>): boolean {
  const frequency = FREQUENCY_MS[config?.campaignFrequency];
  if (!frequency) {
    throw new Error("Choose and save a supported campaign frequency before starting");
  }
  const lastRunAt = config?.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
  return Date.now() - lastRunAt >= frequency;
}

function enabledContentTypes(config: Record<string, any>): PromotableContentType[] {
  if (!Array.isArray(config.contentTypes) || config.contentTypes.length === 0) {
    throw new Error("Choose and save at least one supported content type before starting");
  }
  const unsupported = config.contentTypes.filter(
    (type: unknown) =>
      typeof type !== "string" ||
      !PROMOTABLE_CONTENT_TYPES.includes(type as PromotableContentType),
  );
  if (unsupported.length > 0) {
    throw new Error(`Unsupported promotable content type: ${String(unsupported[0])}`);
  }
  return [...new Set(config.contentTypes as PromotableContentType[])];
}

function enabledMediaTypes(
  config: Record<string, any>,
): Array<"text" | "image" | "video" | "audio"> {
  const supported = ["text", "image", "video", "audio"] as const;
  if (!Array.isArray(config.mediaTypes) || config.mediaTypes.length === 0) {
    throw new Error("Choose and save at least one supported media type before starting");
  }
  const unsupported = config.mediaTypes.find(
    (type: unknown) =>
      typeof type !== "string" ||
      !supported.includes(type as (typeof supported)[number]),
  );
  if (unsupported !== undefined) {
    throw new Error(`Unsupported advertising media type: ${String(unsupported)}`);
  }
  return [...new Set(config.mediaTypes as Array<(typeof supported)[number]>)];
}

function validateActiveConfig(config: Record<string, any>): void {
  if (
    !Array.isArray(config.platforms) ||
    config.platforms.length === 0 ||
    config.platforms.some(
      (platform: unknown) =>
        typeof platform !== "string" || !SUPPORTED_PLATFORMS.has(platform),
    )
  ) {
    throw new Error("Choose and save at least one supported platform before starting");
  }
  if (!SUPPORTED_OBJECTIVES.has(config.campaignObjective)) {
    throw new Error("Choose and save a supported organic promotion objective before starting");
  }
  if (!SUPPORTED_BRAND_VOICES.has(config.brandVoice)) {
    throw new Error("Choose and save a supported brand voice before starting");
  }
  if (!Number.isInteger(config.dailyPostLimit) || config.dailyPostLimit < 0) {
    throw new Error("Save a non-negative daily promotion limit before starting");
  }
  for (const key of ["autoPublish", "optimalTimesOnly", "crossPlatformCampaigns"]) {
    if (typeof config[key] !== "boolean") {
      throw new Error(`Save the ${key} setting before starting`);
    }
  }
  enabledContentTypes(config);
  enabledMediaTypes(config);
}

/** Content already promoted by the autopilot, keyed "type:id", across all of the user's campaigns. */
async function alreadyPromotedKeys(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ metadata: adCampaigns.metadata })
    .from(adCampaigns)
    .where(
      and(eq(adCampaigns.userId, userId)),
    );
  const keys = new Set<string>();
  for (const row of rows) {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    if (meta?.source === AUTOPILOT_SOURCE && meta?.contentType && meta?.contentId) {
      keys.add(`${meta.contentType}:${meta.contentId}`);
    }
  }
  return keys;
}

async function pickNextItem(
  userId: string,
  types: PromotableContentType[],
  startIndex: number,
): Promise<{ type: PromotableContentType; id: string } | null> {
  const promoted = await alreadyPromotedKeys(userId);
  for (let i = 0; i < types.length; i++) {
    const type = types[(startIndex + i) % types.length];
    const items = await listPromotableContent(userId, type);
    const candidate = items.find(
      (item) => item.promotable && !promoted.has(`${type}:${item.id}`),
    );
    if (candidate) return { type, id: candidate.id };
  }
  return null;
}

async function launch(
  userId: string,
  source: ResolvedPromotableContent,
  platforms: string[],
  config: Record<string, any>,
  mediaType: "text" | "image" | "video" | "audio",
): Promise<{ campaignId: string; posted: boolean; reason?: string }> {
  const model = await aiModelManager.getAdvertisingAutopilot(userId);
  const mediaTypes = enabledMediaTypes(config);
  const recommendations = await model.generateCampaignRecommendations(
    config.campaignObjective,
    { platform: platforms[0], contentType: source.contentType, product: source.title,
      brandVoice: config.brandVoice, contentContext: source.description,
      sourceUrl: source.sourceUrl, mediaTypes, mediaType },
  );
  const recommendation = recommendations[0];
  if (
    !recommendation ||
    typeof recommendation.content !== "string" ||
    recommendation.content.trim().length === 0
  ) {
    throw new Error("MaxCore advertising generation returned no usable creative");
  }
  const generated = Array.isArray(recommendation.creatives)
    ? recommendation.creatives[0] as Record<string, unknown> | undefined : undefined;
  if (generated?.content_type !== mediaType) {
    throw new Error(
      `MaxCore returned ${String(generated?.content_type)} but the selected media type is ${mediaType}`,
    );
  }
  let mediaUrl: string | null = null;
  if (mediaType === "image" && source.artworkUrl) {
    mediaUrl = source.artworkUrl;
  } else if (mediaType !== "text") {
    const mediaGenerationPlatforms = [
      "twitter",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "youtube",
    ];
    if (!mediaGenerationPlatforms.includes(platforms[0])) {
      throw new Error(
        `MaxCore media generation does not support the ${platforms[0]} platform`,
      );
    }
    const mediaToneByBrandVoice: Record<
      string,
      "professional" | "casual" | "energetic" | "creative" | "promotional"
    > = {
      professional: "professional",
      casual: "casual",
      energetic: "energetic",
      informative: "professional",
    };
    const mediaTone = mediaToneByBrandVoice[config.brandVoice];
    if (!mediaTone) {
      throw new Error(`Unsupported media-generation brand voice: ${String(config.brandVoice)}`);
    }
    const asset = await aiContentService.generateContent({
      prompt: `${String(recommendation.name || source.title)}\n${recommendation.content}`,
      platform: platforms[0] as "twitter" | "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube",
      format: mediaType as "text" | "image" | "video" | "audio",
      tone: mediaTone,
      length: "medium",
    });
    if (!asset.url) {
      throw new Error(`MaxCore media generation returned no ${mediaType} asset URL`);
    }
    mediaUrl = asset.url;
  }
  const [campaign] = await db
    .insert(adCampaigns)
    .values({
      userId,
      name: `[Autopilot] ${source.title}`,
      platform: platforms[0],
      objective: config.campaignObjective,
      budget: 0,
      status: "draft",
      targetAudience: { category: source.category },
      metadata: {
        source: AUTOPILOT_SOURCE,
        contentType: source.contentType,
        contentId: source.contentId,
        fanOutPlatforms: platforms,
        objective: config.campaignObjective,
        brandVoice: config.brandVoice,
        mediaTypes,
        organicOnly: true,
        createdAt: new Date().toISOString(),
      },
    })
    .returning({ id: adCampaigns.id });

  const [creative] = await db
    .insert(adCreatives)
    .values({
      userId,
      campaignId: campaign.id,
      name: `[Autopilot] ${source.title}`,
      type: "social_post",
       headline: typeof generated?.headline === "string" ? generated.headline : source.title,
       description: recommendation.content,
      mediaUrl,
      callToAction: CALL_TO_ACTION[source.contentType],
      landingUrl: source.sourceUrl,
      status: "draft",
    })
    .returning({ id: adCreatives.id });

  await db
    .update(adCampaigns)
    .set({ creativeIds: [creative.id] })
    .where(eq(adCampaigns.id, campaign.id));

  if (config.autoPublish !== true) {
    return { campaignId: campaign.id, posted: false, reason: "Draft saved for review" };
  }
  const result = await advertisingDispatchService.activateCampaign(campaign.id, userId);
  const postsCreated = result.results?.postsCreated ?? 0;
  if (result.success && postsCreated > 0) {
    await db
      .update(adCreatives)
      .set({ status: "active" })
      .where(eq(adCreatives.id, creative.id));
    return { campaignId: campaign.id, posted: true };
  }
  const platformErrors = result.results?.errors ?? [];
  const reason =
    (result.error || result.message || "Ad dispatch reported no posts") +
    (platformErrors.length ? ` | per-platform: ${platformErrors.join("; ")}` : "");
  return { campaignId: campaign.id, posted: false, reason };
}

/**
 * Run one autopilot tick for a single user. Idempotent to call repeatedly —
 * no-ops when the config isn't due, or when there is nothing new to promote.
 */
export async function runAdvertisingAutopilotTick(
  userId: string,
  config: Record<string, any>,
  saveConfig: (patch: Record<string, unknown>) => Promise<unknown>,
): Promise<AutopilotTickResult> {
  if (!config?.enabled || !config?.isRunning) {
    return { ran: false, reason: "Autopilot not enabled" };
  }
  validateActiveConfig(config);
  if (!dueForRun(config)) {
    return { ran: false, reason: "Not due yet" };
  }
  const dailyLimit = config.dailyPostLimit as number;
  if (dailyLimit > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [dailyCount] = await db
      .select({ value: count() })
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.userId, userId),
          gte(adCampaigns.createdAt, startOfDay),
          sql`${adCampaigns.metadata}->>'source' = ${AUTOPILOT_SOURCE}`,
        ),
      );
    const postsToday = Number(dailyCount?.value ?? 0);
    if (postsToday >= dailyLimit) {
      return { ran: false, reason: "Daily post limit reached" };
    }
  }

  const types = enabledContentTypes(config);
  const configuredPlatforms = [...new Set(config.platforms as string[])];
  const mediaTypes = enabledMediaTypes(config);
  const nextPlatformIndex =
    ((Number.isInteger(config?.lastPlatformIndex)
      ? (config.lastPlatformIndex as number)
      : -1) +
      1) %
    configuredPlatforms.length;
  const singlePlatform = configuredPlatforms[nextPlatformIndex];
  const nextMediaTypeIndex =
    ((Number.isInteger(config?.lastMediaTypeIndex)
      ? (config.lastMediaTypeIndex as number)
      : -1) +
      1) %
    mediaTypes.length;
  const selectedMediaType = mediaTypes[nextMediaTypeIndex];
  if (config.optimalTimesOnly === true && config.autoPublish === true) {
    const timingPlatform =
      config.crossPlatformCampaigns === true
        ? configuredPlatforms[0]
        : singlePlatform;
    const learnedTimes =
      await autopilotLearningService.getOptimalPostingTimes(
        userId,
        timingPlatform,
      );
    const bestTime = learnedTimes[0];
    const now = new Date();
    if (
      !bestTime ||
      bestTime.dayOfWeek !== now.getDay() ||
      bestTime.hour !== now.getHours()
    ) {
      return {
        ran: false,
        reason: bestTime
          ? "Outside the measured optimal posting window"
          : "No measured posting-time history is available",
      };
    }
  }
  const startIndex = Number.isInteger(config?.lastContentTypeIndex)
    ? (config.lastContentTypeIndex as number) + 1
    : 0;
  const pick = await pickNextItem(userId, types, startIndex);

  // Always stamp lastRunAt so a user with nothing new to promote doesn't get
  // re-scanned on every scheduler heartbeat.
  await saveConfig({
    lastRunAt: new Date().toISOString(),
    lastContentTypeIndex: pick
      ? types.indexOf(pick.type)
      : (config?.lastContentTypeIndex ?? -1),
    ...(config.crossPlatformCampaigns === true || !pick
      ? {}
      : { lastPlatformIndex: nextPlatformIndex % configuredPlatforms.length }),
    ...(pick ? { lastMediaTypeIndex: nextMediaTypeIndex } : {}),
  });

  if (!pick) {
    return { ran: false, reason: "Nothing new to promote" };
  }

  const platforms =
    config.crossPlatformCampaigns === true
      ? configuredPlatforms
      : [singlePlatform];

  try {
    const source = await resolvePromotableContent(userId, pick.type, pick.id);
    const { campaignId, posted, reason } = await launch(
      userId,
      source,
      platforms,
      config,
      selectedMediaType,
    );
    if (posted) {
      logger.info(
        `[AdvertisingAutopilot] user ${userId} promoted ${pick.type}:${pick.id} via campaign ${campaignId}`,
      );
    } else {
      logger.warn(
        `[AdvertisingAutopilot] user ${userId} campaign ${campaignId} for ${pick.type}:${pick.id} created but not posted: ${reason}`,
      );
    }
    return {
      ran: true,
      contentType: pick.type,
      contentId: pick.id,
      campaignId,
      posted,
    };
  } catch (err) {
    logger.warn(
      { err },
      `[AdvertisingAutopilot] tick failed for user ${userId} on ${pick.type}:${pick.id}`,
    );
    return { ran: true, contentType: pick.type, contentId: pick.id, posted: false, reason: (err as Error).message };
  }
}

/** Runs a tick for every user with the advertising autopilot turned on. Intended to be called from the scheduler heartbeat. */
export async function runAdvertisingAutopilotSweep(): Promise<void> {
  const { storage } = await import("../storage.js");
  const configs = await storage.getAllEnabledAdvertisingAutopilotConfigs();
  for (const config of configs) {
    const userId = config?.userId;
    if (!userId) continue;
    try {
      await runAdvertisingAutopilotTick(userId, config, (patch) =>
        storage.saveAdvertisingAutopilotConfig(userId, { ...config, ...patch }),
      );
    } catch (err) {
      logger.warn({ err }, `[AdvertisingAutopilot] sweep failed for user ${userId}`);
    }
  }
}

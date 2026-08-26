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
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";
import { advertisingDispatchService } from "./advertisingDispatchService.js";
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

const DEFAULT_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "twitter",
  "threads",
] as const;

const FREQUENCY_MS: Record<string, number> = {
  hourly: 3_600_000,
  "twice-daily": 43_200_000,
  daily: 86_400_000,
  "every-2-days": 172_800_000,
  weekly: 604_800_000,
};

export interface AutopilotTickResult {
  ran: boolean;
  reason?: string;
  contentType?: PromotableContentType;
  contentId?: string;
  campaignId?: string;
  posted?: boolean;
}

function dueForRun(config: Record<string, any>): boolean {
  const frequency = FREQUENCY_MS[config?.campaignFrequency] ?? FREQUENCY_MS.daily;
  const lastRunAt = config?.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
  return Date.now() - lastRunAt >= frequency;
}

function enabledContentTypes(config: Record<string, any>): PromotableContentType[] {
  const configured = Array.isArray(config?.contentTypes)
    ? (config.contentTypes as unknown[]).filter((t): t is PromotableContentType =>
        PROMOTABLE_CONTENT_TYPES.includes(t as PromotableContentType),
      )
    : [];
  // No real content-type restriction configured — open promotion to every
  // content type on the platform rather than silently doing nothing.
  return configured.length > 0 ? configured : [...PROMOTABLE_CONTENT_TYPES];
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
): Promise<{ campaignId: string; posted: boolean; reason?: string }> {
  const [campaign] = await db
    .insert(adCampaigns)
    .values({
      userId,
      name: `[Autopilot] ${source.title}`,
      platform: platforms[0],
      objective: "content_promotion",
      budget: 0,
      status: "draft",
      targetAudience: { category: source.category },
      metadata: {
        source: AUTOPILOT_SOURCE,
        contentType: source.contentType,
        contentId: source.contentId,
        fanOutPlatforms: platforms,
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
      headline: source.title,
      description: source.description,
      mediaUrl: source.artworkUrl || null,
      callToAction: CALL_TO_ACTION[source.contentType],
      landingUrl: source.sourceUrl,
      status: "active",
    })
    .returning({ id: adCreatives.id });

  await db
    .update(adCampaigns)
    .set({ creativeIds: [creative.id] })
    .where(eq(adCampaigns.id, campaign.id));

  const result = await advertisingDispatchService.activateCampaign(
    campaign.id,
    userId,
  );
  const postsCreated = result.results?.postsCreated ?? 0;
  if (result.success && postsCreated > 0) {
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
  if (!dueForRun(config)) {
    return { ran: false, reason: "Not due yet" };
  }

  const types = enabledContentTypes(config);
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
  });

  if (!pick) {
    return { ran: false, reason: "Nothing new to promote" };
  }

  const platforms = Array.isArray(config?.platforms) && config.platforms.length > 0
    ? config.platforms
    : [...DEFAULT_PLATFORMS];

  try {
    const source = await resolvePromotableContent(userId, pick.type, pick.id);
    const { campaignId, posted, reason } = await launch(userId, source, platforms);
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

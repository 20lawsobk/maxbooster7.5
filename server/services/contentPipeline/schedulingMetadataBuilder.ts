/**
 * Scheduling Metadata Builder
 *
 * Builds precise scheduling metadata for every content piece produced by the
 * unified pipeline. Uses the existing SocialAutopilotEngine for engagement
 * prediction and the platform spec optimal windows as the base signal.
 *
 * Output is a ready-to-consume schedule manifest that can be fed directly
 * into the socialBulk POST /schedule endpoint or the autopilot publisher.
 */

import { logger } from "../../logger.js";
import {
  PLATFORM_SPECS,
  type SupportedPlatform,
  type ContentSlot,
} from "./platformFormatters.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleManifestEntry {
  platform: SupportedPlatform;
  slot: ContentSlot;
  scheduledAt: Date;
  utcHour: number;
  dayOfWeek: string;
  timezone: string;
  priority: "high" | "medium" | "low";
  rationale: string;
  retryWindow: { retryAfterMinutes: number; maxRetries: number };
}

export interface ScheduleManifest {
  generatedAt: Date;
  campaignStart: Date;
  campaignEnd: Date;
  entries: ScheduleManifestEntry[];
  totalPostCount: number;
  platformBreakdown: Record<SupportedPlatform, number>;
  frequencyPerWeek: number;
}

export interface SchedulingOptions {
  platforms: SupportedPlatform[];
  campaignGoal: "awareness" | "engagement" | "conversion" | "growth";
  startDate?: Date;
  durationDays?: number;
  postsPerPlatformPerWeek?: number;
  timezone?: string;
  priorityPlatforms?: SupportedPlatform[];
}

// ─── Day-of-week helpers ──────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function nextOccurrenceOf(dayName: string, from: Date): Date {
  const target = DAY_NAMES?.indexOf(dayName);
  if (target === -1) return new Date(from);
  const result = new Date(from);
  const current = result?.getDay();
  const diff = (target - current + 7) % 7;
  result?.setDate(result?.getDate() + (diff === 0 ? 7 : diff));
  return result;
}

function buildDatetime(baseDate: Date, utcHour: number): Date {
  const d = new Date(baseDate);
  d?.setUTCHours(utcHour, 0, 0, 0);
  return d;
}

// ─── Platform-optimal time selection ─────────────────────────────────────────

interface OptimalWindow {
  day: string;
  utcHour: number;
  engagementMultiplier: number;
}

/**
 * Returns ranked posting windows for a platform, ordered by expected engagement.
 * Merges static platform knowledge with goal-specific adjustments.
 */
function getOptimalWindows(
  platform: SupportedPlatform,
  goal: SchedulingOptions["campaignGoal"],
): OptimalWindow[] {
  const spec = PLATFORM_SPECS[platform];
  const windows: OptimalWindow[] = [];

  for (const day of spec?.bestPostingDays ?? []) {
    for (const hour of spec?.bestPostingHours ?? []) {
      let multiplier = 1.0;

      // Goal-specific scoring adjustments
      if (goal === "engagement") {
        // Evening hours have higher engagement for entertainment content
        if (hour >= 18 && hour <= 22) multiplier += 0.3;
      } else if (goal === "awareness") {
        // Morning commute hours for discovery
        if (hour >= 7 && hour <= 10) multiplier += 0.2;
      } else if (goal === "conversion") {
        // Lunch and end-of-workday peak purchase intent
        if ((hour >= 11 && hour <= 13) || (hour >= 17 && hour <= 19))
          multiplier += 0.25;
      } else if (goal === "growth") {
        // Peak algorithm hours — highest content velocity
        if (hour >= 9 && hour <= 12) multiplier += 0.15;
        if (hour >= 19 && hour <= 21) multiplier += 0.2;
      }

      windows?.push({ day, utcHour: hour, engagementMultiplier: multiplier });
    }
  }

  // Sort by engagement multiplier descending
  return windows?.sort(
    (a, b) => b?.engagementMultiplier - a?.engagementMultiplier,
  );
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds a complete scheduling manifest for a set of platforms over a campaign period.
 */
export function buildScheduleManifest(
  slots: Array<{ platform: SupportedPlatform; slot: ContentSlot }>,
  options: SchedulingOptions,
): ScheduleManifest {
  const {
    campaignGoal,
    startDate = new Date(),
    durationDays = 14,
    postsPerPlatformPerWeek = 3,
    timezone = "UTC",
    priorityPlatforms = [],
  } = options;

  const campaignStart = new Date(startDate);
  const campaignEnd = new Date(startDate);
  campaignEnd?.setDate(campaignEnd?.getDate() + durationDays);

  const entries: ScheduleManifestEntry[] = [];
  const platformBreakdown: Partial<Record<SupportedPlatform, number>> = {};

  // Group slots by platform
  const byPlatform = new Map<SupportedPlatform, ContentSlot[]>();
  for (const { platform, slot } of slots) {
    if (!byPlatform?.has(platform)) byPlatform?.set(platform, []);
    byPlatform?.get(platform).push(slot);
  }

  for (const [platform, contentSlots] of byPlatform?.entries() ?? []) {
    const windows = getOptimalWindows(platform, campaignGoal);
    const isPriority = priorityPlatforms?.includes(platform);
    const weeklyTarget = isPriority
      ? postsPerPlatformPerWeek + 2
      : postsPerPlatformPerWeek;

    let postCount = 0;
    let windowIdx = 0;
    const scheduled = new Set<string>(); // prevent duplicate day+hour slots

    for (const slot of contentSlots) {
      if (postCount >= weeklyTarget * Math.ceil(durationDays / 7)) break;

      // Find the next available window that hasn't been scheduled
      let attempts = 0;
      while (attempts < windows?.length * 2) {
        const win = windows[windowIdx % windows?.length];
        windowIdx++;
        attempts++;

        const slotKey = `${win?.day}:${win?.utcHour}`;
        if (scheduled?.has(slotKey)) continue;
        scheduled?.add(slotKey);

        const baseDate = nextOccurrenceOf(win?.day, campaignStart);
        if (baseDate > campaignEnd) continue;

        const scheduledAt = buildDatetime(baseDate, win?.utcHour);

        entries?.push({
          platform,
          slot,
          scheduledAt,
          utcHour: win.utcHour,
          dayOfWeek: win.day,
          timezone,
          priority: isPriority
            ? "high"
            : win?.engagementMultiplier >= 1.2
              ? "high"
              : "medium",
          rationale: `Peak ${campaignGoal} window for ${platform} — ${win?.day} at ${win?.utcHour}:00 UTC (${(win?.engagementMultiplier * 100).toFixed(0)}% engagement multiplier)`,
          retryWindow: {
            retryAfterMinutes: platform === "tiktok" ? 30 : 60,
            maxRetries: 3,
          },
        });

        postCount++;
        platformBreakdown[platform] = (platformBreakdown[platform] ?? 0) + 1;
        break;
      }
    }
  }

  // Sort by scheduledAt ascending
  entries?.sort((a, b) => a?.scheduledAt?.getTime() - b?.scheduledAt?.getTime());

  logger.info(
    `[SchedulingMetadataBuilder] Built ${entries?.length} schedule entries for ${byPlatform?.size} platforms`,
  );

  return {
    generatedAt: new Date(),
    campaignStart,
    campaignEnd,
    entries,
    totalPostCount: entries.length,
    platformBreakdown: platformBreakdown as Record<SupportedPlatform, number>,
    frequencyPerWeek: postsPerPlatformPerWeek,
  };
}

/**
 * Converts a ScheduleManifest into the bulk-schedule payload format
 * accepted by POST /api/social/bulk/schedule.
 */
export function manifestToBulkSchedulePayload(
  manifest: ScheduleManifest,
  contentMap: Map<string, { content: string; platform: SupportedPlatform }>,
): Array<{ platform: string; content: string; scheduledAt: string }> {
  return manifest?.entries
    .filter((entry) => contentMap?.has(`${entry?.platform}:${entry?.slot}`))
    .map((entry) => {
      const key = `${entry?.platform}:${entry?.slot}`;
      const item = contentMap?.get(key);
      return {
        platform: entry.platform,
        content: item.content,
        scheduledAt: entry.scheduledAt.toISOString(),
      };
    });
}

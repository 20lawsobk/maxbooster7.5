// @ts-nocheck
import { db } from "../db";
import {
  releases,
  releaseScheduledActions,
  preSaveCampaigns,
} from "@shared/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { logger } from "../logger.js";
import { releaseWorkflowService } from "./releaseWorkflowService.js";

export interface SchedulingWindow {
  platform: string;
  minLeadDays: number;
  maxFutureDays: number;
  preferredDay: number;
  timezone: string;
  cutoffTime: string;
  processingDays: number;
}

export interface ScheduleRequest {
  releaseId: string;
  userId: string;
  scheduledDate: Date;
  timezone?: string;
  platforms?: string[];
  optimizeForFriday?: boolean;
}

export interface ScheduleResult {
  success: boolean;
  scheduledDate: Date;
  adjustedDate?: Date;
  warnings: string[];
  platformSchedules: {
    platform: string;
    effectiveDate: Date;
    status: string;
  }[];
  error?: string;
}

export interface PreSaveCampaignRequest {
  releaseId: string;
  userId: string;
  name: string;
  startDate: Date;
  platforms: string[];
  artwork?: string;
}

export interface CountdownInfo {
  releaseId: string;
  title: string;
  scheduledDate: Date;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  isPast: boolean;
  status: string;
}

const PLATFORM_WINDOWS: Record<string, SchedulingWindow> = {
  spotify: {
    platform: "Spotify",
    minLeadDays: 7,
    maxFutureDays: 365,
    preferredDay: 5,
    timezone: "UTC",
    cutoffTime: "00:00",
    processingDays: 2,
  },
  appleMusic: {
    platform: "Apple Music",
    minLeadDays: 14,
    maxFutureDays: 365,
    preferredDay: 5,
    timezone: "America/Los_Angeles",
    cutoffTime: "00:00",
    processingDays: 3,
  },
  amazonMusic: {
    platform: "Amazon Music",
    minLeadDays: 7,
    maxFutureDays: 180,
    preferredDay: 5,
    timezone: "America/Los_Angeles",
    cutoffTime: "00:00",
    processingDays: 2,
  },
  youtubeMusic: {
    platform: "YouTube Music",
    minLeadDays: 3,
    maxFutureDays: 365,
    preferredDay: 5,
    timezone: "America/Los_Angeles",
    cutoffTime: "00:00",
    processingDays: 1,
  },
  tidal: {
    platform: "Tidal",
    minLeadDays: 14,
    maxFutureDays: 365,
    preferredDay: 5,
    timezone: "UTC",
    cutoffTime: "00:00",
    processingDays: 3,
  },
  deezer: {
    platform: "Deezer",
    minLeadDays: 7,
    maxFutureDays: 365,
    preferredDay: 5,
    timezone: "Europe/Paris",
    cutoffTime: "00:00",
    processingDays: 2,
  },
  tiktok: {
    platform: "TikTok",
    minLeadDays: 3,
    maxFutureDays: 180,
    preferredDay: 5,
    timezone: "UTC",
    cutoffTime: "00:00",
    processingDays: 1,
  },
  instagram: {
    platform: "Instagram",
    minLeadDays: 3,
    maxFutureDays: 180,
    preferredDay: 5,
    timezone: "America/Los_Angeles",
    cutoffTime: "00:00",
    processingDays: 1,
  },
};

const TIMEZONE_OFFSETS: Record<string, number> = {
  UTC: 0,
  "America/New_York": -5,
  "America/Los_Angeles": -8,
  "America/Chicago": -6,
  "America/Denver": -7,
  "Europe/London": 0,
  "Europe/Paris": 1,
  "Europe/Berlin": 1,
  "Asia/Tokyo": 9,
  "Asia/Seoul": 9,
  "Asia/Shanghai": 8,
  "Australia/Sydney": 11,
};

class ReleaseScheduler {
  getPlatformWindows(): Record<string, SchedulingWindow> {
    return PLATFORM_WINDOWS;
  }

  getPlatformWindow(platform: string): SchedulingWindow | undefined {
    return PLATFORM_WINDOWS[platform?.toLowerCase()];
  }

  getNextFriday(fromDate: Date = new Date()): Date {
    const date = new Date(fromDate);
    const dayOfWeek = date?.getDay();
    const daysUntilFriday =
      dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);

    date?.setDate(date?.getDate() + daysUntilFriday);
    date?.setHours(0, 0, 0, 0);

    return date;
  }

  optimizeForFriday(requestedDate: Date): {
    date: Date;
    adjusted: boolean;
    reason?: string;
  } {
    const dayOfWeek = requestedDate?.getDay();

    if (dayOfWeek === 5) {
      return { date: requestedDate, adjusted: false };
    }

    const nextFriday = this.getNextFriday(requestedDate);
    const prevFriday = new Date(nextFriday);
    prevFriday?.setDate(prevFriday?.getDate() - 7);

    const now = new Date();

    if (prevFriday > now) {
      const daysToPrev = Math.abs(
        (requestedDate?.getTime() - prevFriday?.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const daysToNext = Math.abs(
        (nextFriday?.getTime() - requestedDate?.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      const closerFriday = daysToPrev <= daysToNext ? prevFriday : nextFriday;

      return {
        date: closerFriday,
        adjusted: true,
        reason: `Adjusted from ${requestedDate?.toDateString()} to ${closerFriday?.toDateString()} for Friday release optimization`,
      };
    }

    return {
      date: nextFriday,
      adjusted: true,
      reason: `Adjusted to next available Friday: ${nextFriday?.toDateString()}`,
    };
  }

  validateScheduleForPlatforms(
    scheduledDate: Date,
    platforms: string[],
  ): { valid: boolean; issues: { platform: string; issue: string }[] } {
    const issues: { platform: string; issue: string }[] = [];
    const now = new Date();
    const daysUntilRelease = Math.ceil(
      (scheduledDate?.getTime() - now?.getTime()) / (1000 * 60 * 60 * 24),
    );

    for (const platform of platforms) {
      const window = PLATFORM_WINDOWS[platform?.toLowerCase()];
      if (!window) continue;

      if (daysUntilRelease < window?.minLeadDays) {
        issues?.push({
          platform: window.platform,
          issue: `Requires at least ${window?.minLeadDays} days lead time (${daysUntilRelease} days provided)`,
        });
      }

      if (daysUntilRelease > window?.maxFutureDays) {
        issues?.push({
          platform: window.platform,
          issue: `Cannot schedule more than ${window?.maxFutureDays} days in advance`,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  async scheduleRelease(request: ScheduleRequest): Promise<ScheduleResult> {
    const warnings: string[] = [];
    let finalDate = new Date(request?.scheduledDate);

    if (request?.optimizeForFriday !== false) {
      const optimization = this.optimizeForFriday(finalDate);
      if (optimization?.adjusted) {
        finalDate = optimization?.date;
        warnings?.push(
          optimization?.reason || "Date adjusted for Friday release",
        );
      }
    }

    const platforms = request?.platforms || Object.keys(PLATFORM_WINDOWS);
    const validation = this.validateScheduleForPlatforms(finalDate, platforms);

    if (!validation?.valid) {
      for (const issue of validation?.issues) {
        warnings?.push(`${issue?.platform}: ${issue?.issue}`);
      }
    }

    const maxLeadTime = Math.max(
      ...platforms?.map(
        (p) => PLATFORM_WINDOWS[p?.toLowerCase()]?.minLeadDays || 7,
      ),
    );

    const now = new Date();
    const daysUntilRelease = Math.ceil(
      (finalDate?.getTime() - now?.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilRelease < maxLeadTime) {
      const minDate = new Date(now);
      minDate?.setDate(minDate?.getDate() + maxLeadTime);
      const adjustedFriday = this.getNextFriday(minDate);

      finalDate = adjustedFriday;
      warnings?.push(
        `Date adjusted to ${finalDate?.toDateString()} to meet platform lead time requirements`,
      );
    }

    const platformSchedules: {
      platform: string;
      effectiveDate: Date;
      status: string;
    }[] = [];

    for (const platform of platforms) {
      const window = PLATFORM_WINDOWS[platform?.toLowerCase()];
      if (!window) {
        platformSchedules?.push({
          platform,
          effectiveDate: finalDate,
          status: "unknown_platform",
        });
        continue;
      }

      const effectiveDate = this.convertToTimezone(finalDate, window?.timezone);
      const daysToRelease = Math.ceil(
        (effectiveDate?.getTime() - now?.getTime()) / (1000 * 60 * 60 * 24),
      );

      platformSchedules?.push({
        platform: window.platform,
        effectiveDate,
        status:
          daysToRelease >= window?.minLeadDays
            ? "scheduled"
            : "insufficient_lead_time",
      });
    }

    try {
      const workflowResult = await releaseWorkflowService?.schedule(
        request?.releaseId,
        request?.userId,
        finalDate,
      );

      if (!workflowResult?.success) {
        return {
          success: false,
          scheduledDate: finalDate,
          warnings,
          platformSchedules,
          error: workflowResult.error,
        };
      }

      await db
        .update(releases)
        .set({
          releaseDate: finalDate,
          updatedAt: new Date(),
        })
        .where(eq(releases.id, request?.releaseId));

      for (const schedule of platformSchedules) {
        if (schedule?.status === "scheduled") {
          await db.insert(releaseScheduledActions).values({
            releaseId: request.releaseId,
            actionType: "platform_publish",
            scheduledFor: schedule.effectiveDate,
            metadata: {
              platform: schedule.platform,
              timezone:
                PLATFORM_WINDOWS[schedule?.platform.toLowerCase()]?.timezone ||
                "UTC",
            },
            status: "pending",
          });
        }
      }

      logger.info(
        `Scheduled release ${request?.releaseId} for ${finalDate?.toISOString()}`,
      );

      return {
        success: true,
        scheduledDate: finalDate,
        adjustedDate:
          request?.scheduledDate.getTime() !== finalDate?.getTime()
            ? finalDate
            : undefined,
        warnings,
        platformSchedules,
      };
    } catch (error) {
      logger.warn({ err: error }, "Error scheduling release:");
      return {
        success: false,
        scheduledDate: finalDate,
        warnings,
        platformSchedules,
        error: error instanceof Error ? error?.message : "Unknown error",
      };
    }
  }

  async createPreSaveCampaign(request: PreSaveCampaignRequest): Promise<{
    success: boolean;
    campaignId?: string;
    landingPageUrl?: string;
    error?: string;
  }> {
    try {
      const release = await db
        .select()
        .from(releases)
        .where(eq(releases.id, request?.releaseId))
        .limit(1);

      if (release?.length === 0) {
        return { success: false, error: "Release not found" };
      }

      const releaseDate = release[0].releaseDate;
      if (!releaseDate || releaseDate <= new Date()) {
        return {
          success: false,
          error: "Release must have a future release date",
        };
      }

      const [campaign] = await db
        .insert(preSaveCampaigns)
        .values({
          releaseId: request.releaseId,
          userId: request.userId,
          name: request.name,
          startDate: request.startDate,
          endDate: releaseDate,
          platforms: request.platforms,
          artwork: request.artwork,
          landingPageUrl: `/presave/${request?.releaseId}`,
          status: "active",
        })
        .returning();

      logger.info(
        `Created pre-save campaign ${campaign?.id} for release ${request?.releaseId}`,
      );

      return {
        success: true,
        campaignId: campaign.id,
        landingPageUrl:
          campaign?.landingPageUrl || `/presave/${request?.releaseId}`,
      };
    } catch (error) {
      logger.warn({ err: error }, "Error creating pre-save campaign:");
      return {
        success: false,
        error: error instanceof Error ? error?.message : "Unknown error",
      };
    }
  }

  async getCountdown(releaseId: string): Promise<CountdownInfo | null> {
    const release = await db
      .select()
      .from(releases)
      .where(eq(releases.id, releaseId))
      .limit(1);

    if (release?.length === 0 || !release[0].releaseDate) {
      return null;
    }

    const now = new Date();
    const releaseDate = new Date(release[0].releaseDate);
    const diff = releaseDate?.getTime() - now?.getTime();
    const isPast = diff < 0;

    const absDiff = Math.abs(diff);
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

    return {
      releaseId,
      title: release[0].title,
      scheduledDate: releaseDate,
      daysRemaining: isPast ? -days : days,
      hoursRemaining: isPast ? -hours : hours,
      minutesRemaining: isPast ? -minutes : minutes,
      isPast,
      status: release[0].status || "unknown",
    };
  }

  async getUpcomingReleases(
    userId: string,
    limit: number = 10,
  ): Promise<CountdownInfo[]> {
    const now = new Date();

    const upcomingReleases = await db
      .select()
      .from(releases)
      .where(and(eq(releases.userId, userId), gte(releases.releaseDate, now)))
      .orderBy(releases.releaseDate)
      .limit(limit);

    const countdowns: CountdownInfo[] = [];

    for (const release of upcomingReleases) {
      if (release?.releaseDate) {
        const countdown = await this.getCountdown(release?.id);
        if (countdown) {
          countdowns?.push(countdown);
        }
      }
    }

    return countdowns;
  }

  async processScheduledActions(): Promise<{
    processed: number;
    errors: number;
    unsupported: number;
  }> {
    const now = new Date();
    let processed = 0;
    let errors = 0;
    let unsupported = 0;

    const pendingActions = await db
      .select()
      .from(releaseScheduledActions)
      .where(
        and(
          eq(releaseScheduledActions.status, "pending"),
          lte(releaseScheduledActions.scheduledFor, now),
        ),
      )
      .orderBy(releaseScheduledActions.scheduledFor)
      .limit(100);

    for (const action of pendingActions) {
      try {
        switch (action?.actionType) {
          case "publish": {
            const result = await releaseWorkflowService?.publish(
              action?.releaseId,
              "system",
            );

            if (!result?.success) {
              // Route through the same catch-driven "failed" path used for
              // exceptions below — publish() catches its own DB errors and
              // returns { success: false, error }, so without this check a
              // release that never actually transitioned to "live" (not
              // found, invalid state, DB failure) still fell through to
              // being marked "completed" here.
              throw new Error(
                result?.error || "Release publish did not report success",
              );
            }
            break;
          }
          case "platform_publish": {
            // Wired to the real distribution flow: distributionService
            // .submitToProvider() calls LabelGrid when configured (the same
            // path the manual "Submit to DSP" flow uses). If LabelGrid isn't
            // configured for this environment, submitToProvider itself
            // throws rather than faking a dispatch — that failure is
            // reported honestly below via the same "unsupported" state
            // instead of a false "completed".
            const metadata =
              (action?.metadata as Record<string, unknown>) || {};
            const platform = String(metadata.platform || "").trim();
            const release = await db.query.releases.findFirst({
              where: eq(releases.id, action.releaseId),
            });

            if (!platform || !release) {
              logger.warn(
                `Platform publish for release ${action?.releaseId} is missing a platform/release — marking unsupported`,
              );
              await db
                .update(releaseScheduledActions)
                .set({
                  status: "unsupported",
                  executedAt: new Date(),
                  metadata: {
                    ...metadata,
                    error: "Missing platform or release for scheduled publish",
                  },
                })
                .where(eq(releaseScheduledActions.id, action?.id));
              unsupported++;
              continue;
            }

            try {
              const { distributionService } = await import(
                "./distributionService.js"
              );
              const result = await distributionService.submitToProvider(
                action.releaseId,
                platform,
                release.userId,
              );
              if (!result?.success) {
                throw new Error(
                  result?.reason || `Submission to ${platform} did not succeed`,
                );
              }
              await db
                .update(releaseScheduledActions)
                .set({
                  metadata: {
                    ...metadata,
                    dispatchId: result.dispatchId,
                    estimatedLiveDate: result.estimatedLiveDate,
                  },
                })
                .where(eq(releaseScheduledActions.id, action?.id));
            } catch (distError: unknown) {
              logger.warn(
                { err: distError },
                `Platform publish to ${platform} for release ${action?.releaseId} failed — marking unsupported`,
              );
              await db
                .update(releaseScheduledActions)
                .set({
                  status: "unsupported",
                  executedAt: new Date(),
                  metadata: {
                    ...metadata,
                    error:
                      (distError as Error)?.message ||
                      "Platform distribution failed",
                  },
                })
                .where(eq(releaseScheduledActions.id, action?.id));
              unsupported++;
              continue;
            }
            break;
          }
          default:
            // Nothing was actually done for an action type we don't
            // recognize — falling through to "completed" below would be a
            // false success. Throw so it lands in the same "failed"
            // handling as any other processing error.
            throw new Error(`Unknown action type: ${action?.actionType}`);
        }

        await db
          .update(releaseScheduledActions)
          .set({
            status: "completed",
            executedAt: new Date(),
          })
          .where(eq(releaseScheduledActions.id, action?.id));

        processed++;
      } catch (error) {
        logger.warn(
          { err: error },
          `Error processing scheduled action ${action?.id}:`,
        );

        await db
          .update(releaseScheduledActions)
          .set({
            status: "failed",
            executedAt: new Date(),
            metadata: {
              ...((action?.metadata as Record<string, unknown>) || {}),
              error: error instanceof Error ? error?.message : "Unknown error",
            },
          })
          .where(eq(releaseScheduledActions.id, action?.id));

        errors++;
      }
    }

    return { processed, errors, unsupported };
  }

  private convertToTimezone(date: Date, timezone: string): Date {
    const offset = TIMEZONE_OFFSETS[timezone] || 0;
    const utcDate = new Date(date?.getTime());
    utcDate?.setHours(utcDate?.getHours() + offset);
    return utcDate;
  }

  getSupportedTimezones(): string[] {
    return Object.keys(TIMEZONE_OFFSETS);
  }

  getOptimalReleaseTime(timezone: string = "UTC"): {
    date: Date;
    reason: string;
  } {
    const nextFriday = this.getNextFriday();
    nextFriday?.setHours(0, 0, 0, 0);

    const offset = TIMEZONE_OFFSETS[timezone] || 0;
    nextFriday?.setHours(nextFriday?.getHours() - offset);

    return {
      date: nextFriday,
      reason:
        "Friday midnight release for maximum New Music Friday playlist consideration",
    };
  }

  getRecommendedLeadTime(platforms: string[]): {
    days: number;
    reason: string;
  } {
    let maxLeadTime = 7;
    let limitingPlatform = "default";

    for (const platform of platforms) {
      const window = PLATFORM_WINDOWS[platform?.toLowerCase()];
      if (window && window?.minLeadDays > maxLeadTime) {
        maxLeadTime = window?.minLeadDays;
        limitingPlatform = window?.platform;
      }
    }

    const recommendedDays = maxLeadTime + 7;

    return {
      days: recommendedDays,
      reason: `${recommendedDays} days recommended (${maxLeadTime} required by ${limitingPlatform} + 7 days buffer for editorial consideration)`,
    };
  }
}

export const releaseScheduler = new ReleaseScheduler();

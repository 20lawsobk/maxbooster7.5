/**
 * Notification Dispatcher
 *
 * Central hub that routes a notification to all applicable push channels
 * based on the notification type, user preferences, and registered devices:
 *
 *   1. Web Push (VAPID)     — all browsers (mobile + desktop web)
 *   2. Desktop Push         — desktop browsers only (Chrome/Edge/Firefox on Win/Mac/Linux)
 *   3. Mobile Push (FCM)    — native Android / iOS apps via Firebase Cloud Messaging
 *
 * Usage:
 *   import { notificationDispatcher } from './notificationDispatcher.js';
 *   await notificationDispatcher.dispatch(userId, notificationType, context);
 */

import { logger } from "../logger.js";
import { webPushService } from "./webPushService.js";
import { desktopPushService } from "./desktopPushService.js";
import { mobilePushService } from "./mobilePushService.js";
import {
  buildPushPayload,
  buildSilentPayload,
  type PushContext,
} from "./pushNotificationTypes.js";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface DispatchResult {
  web: { sent: number; failed: number };
  desktop: { sent: number; failed: number };
  mobile: { sent: number; failed: number };
  totalSent: number;
  totalFailed: number;
  channels: string[];
}

const ZERO: DispatchResult = {
  web: { sent: 0, failed: 0 },
  desktop: { sent: 0, failed: 0 },
  mobile: { sent: 0, failed: 0 },
  totalSent: 0,
  totalFailed: 0,
  channels: [],
};

class NotificationDispatcher {
  // ── Main dispatch entrypoint ───────────────────────────────────────────────

  async dispatch(
    userId: string,
    notificationType: string,
    ctx: PushContext = {},
    opts: {
      skipCategoryCheck?: boolean;
      forceChannels?: Array<"web" | "desktop" | "mobile">;
    } = {},
  ): Promise<DispatchResult> {
    const richPayload = buildPushPayload(notificationType, ctx);

    if (richPayload.silent) {
      return this.dispatchSilent(userId, "feed_refresh");
    }

    const prefs = await this.getUserPushPrefs(userId);
    if (!prefs.enabled && !opts.skipCategoryCheck) {
      logger.info(`[Dispatcher] Push disabled for user ${userId}, skipping`);
      return ZERO;
    }

    if (!opts.skipCategoryCheck) {
      const category = richPayload.category;
      const allowed = prefs.categories[category] ?? true;
      if (!allowed) {
        logger.info(
          `[Dispatcher] Category ${category} disabled for user ${userId}, skipping`,
        );
        return ZERO;
      }

      if (prefs.muteAll) {
        const isUrgent = richPayload.requireInteraction;
        if (!isUrgent || !prefs.allowUrgentDuringQuietHours) {
          return ZERO;
        }
      }
    }

    const channels: Array<"web" | "desktop" | "mobile"> =
      opts.forceChannels || ["web", "desktop", "mobile"];

    const [webResult, desktopResult, mobileResult] = await Promise.all([
      channels.includes("web") && webPushService.isReady()
        ? webPushService.sendRichToUser(userId, richPayload)
        : Promise.resolve({ sent: 0, failed: 0 }),

      channels.includes("desktop") && desktopPushService.isReady()
        ? desktopPushService.sendRichToDesktop(userId, richPayload)
        : Promise.resolve({ sent: 0, failed: 0 }),

      channels.includes("mobile") && mobilePushService.isReady()
        ? mobilePushService.sendRichToUser(userId, richPayload)
        : Promise.resolve({ sent: 0, failed: 0 }),
    ]);

    const activeChannels: string[] = [];
    if (webResult.sent > 0) activeChannels.push("web");
    if (desktopResult.sent > 0) activeChannels.push("desktop");
    if (mobileResult.sent > 0) activeChannels.push("mobile");

    const totalSent = webResult.sent + desktopResult.sent + mobileResult.sent;
    const totalFailed =
      webResult.failed + desktopResult.failed + mobileResult.failed;

    if (totalSent > 0) {
      logger.info(
        `[Dispatcher] ${notificationType} → ${totalSent} device(s) [${activeChannels.join(", ")}] for user ${userId}`,
      );
    }

    return {
      web: webResult,
      desktop: desktopResult,
      mobile: mobileResult,
      totalSent,
      totalFailed,
      channels: activeChannels,
    };
  }

  // ── Silent / background dispatch ───────────────────────────────────────────

  async dispatchSilent(
    userId: string,
    reason: "feed_refresh" | "message_sync" | "count_update" = "feed_refresh",
  ): Promise<DispatchResult> {
    const payload = buildSilentPayload(reason);

    const [webResult, desktopResult, mobileResult] = await Promise.all([
      webPushService.isReady()
        ? webPushService.sendRichToUser(userId, payload)
        : Promise.resolve({ sent: 0, failed: 0 }),

      desktopPushService.isReady()
        ? desktopPushService.sendRichToDesktop(userId, payload)
        : Promise.resolve({ sent: 0, failed: 0 }),

      mobilePushService.isReady()
        ? mobilePushService.sendToUser(userId, {
            title: "",
            body: "",
            silent: true,
            priority: "normal",
            data: { silent: "true", reason },
          })
        : Promise.resolve({ sent: 0, failed: 0 }),
    ]);

    return {
      web: webResult,
      desktop: desktopResult,
      mobile: mobileResult,
      totalSent: webResult.sent + desktopResult.sent + mobileResult.sent,
      totalFailed:
        webResult.failed + desktopResult.failed + mobileResult.failed,
      channels: ["silent"],
    };
  }

  // ── Bulk dispatch (e.g. engagement digest) ─────────────────────────────────

  async dispatchToMultiple(
    userIds: string[],
    notificationType: string,
    ctx: PushContext = {},
  ): Promise<{ dispatched: number; totalSent: number }> {
    const richPayload = buildPushPayload(notificationType, ctx);
    let dispatched = 0;
    let totalSent = 0;

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const result = await this.dispatch(userId, notificationType, ctx);
          if (result.totalSent > 0) {
            dispatched++;
            totalSent += result.totalSent;
          }
        } catch (err) {
          logger.warn(
            { err: err },
            `[Dispatcher] Error dispatching to ${userId}:`,
          );
        }
      }),
    );

    logger.info(
      `[Dispatcher] Bulk dispatch ${notificationType}: ${dispatched}/${userIds.length} users reached (${totalSent} devices)`,
    );
    return { dispatched, totalSent };
  }

  // ── Test push across all channels ──────────────────────────────────────────

  async sendTestToUser(userId: string): Promise<DispatchResult> {
    const richPayload = buildPushPayload("system_update", {
      contentTitle: "Test Notification",
      contentPreview: "Push notifications are working across all your devices!",
    });

    richPayload.title = "🔔 Max Booster Test";
    richPayload.body = "Push notifications are working on this device!";
    richPayload.tag = "test";

    const [webResult, desktopResult, mobileResult] = await Promise.all([
      webPushService.isReady()
        ? webPushService.sendRichToUser(userId, richPayload)
        : Promise.resolve({ sent: 0, failed: 0 }),
      desktopPushService.isReady()
        ? desktopPushService.sendRichToDesktop(userId, richPayload)
        : Promise.resolve({ sent: 0, failed: 0 }),
      mobilePushService.isReady()
        ? mobilePushService.sendRichToUser(userId, richPayload)
        : Promise.resolve({ sent: 0, failed: 0 }),
    ]);

    return {
      web: webResult,
      desktop: desktopResult,
      mobile: mobileResult,
      totalSent: webResult.sent + desktopResult.sent + mobileResult.sent,
      totalFailed:
        webResult.failed + desktopResult.failed + mobileResult.failed,
      channels: [
        ...(webResult.sent > 0 ? ["web"] : []),
        ...(desktopResult.sent > 0 ? ["desktop"] : []),
        ...(mobileResult.sent > 0 ? ["mobile"] : []),
      ],
    };
  }

  // ── Service status ─────────────────────────────────────────────────────────

  getStatus() {
    return {
      web: {
        ready: webPushService.isReady(),
        publicKey: webPushService.getPublicKey()
          ? "✅ configured"
          : "❌ missing",
      },
      desktop: {
        ready: desktopPushService.isReady(),
      },
      mobile: {
        ready: mobilePushService.isReady(),
        mode: mobilePushService.getMode(),
      },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getUserPushPrefs(userId: string) {
    try {
      const [user] = await db
        .select({ notificationSettings: users.notificationSettings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const settings =
        (user?.notificationSettings as Record<string, unknown>) || {};
      const push = (settings.push as Record<string, unknown>) || {};
      // Default push.enabled to true: a user who has granted browser permission
      // and registered a subscription endpoint has already opted in.  Only block
      // if they have explicitly set enabled=false in their preferences.
      return {
        enabled: push.enabled !== false,
        muteAll: settings.muteAll ?? false,
        allowUrgentDuringQuietHours:
          (settings.quietHours as Record<string, unknown>)?.allowUrgent ?? true,
        categories: (push.categories as Record<string, boolean>) || {},
      };
    } catch {
      return {
        enabled: true,
        muteAll: false,
        allowUrgentDuringQuietHours: true,
        categories: {},
      };
    }
  }
}

export const notificationDispatcher = new NotificationDispatcher();

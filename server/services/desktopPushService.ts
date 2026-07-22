/**
 * Desktop Push Service
 *
 * Delivers browser-based push notifications specifically to desktop browsers:
 * Chrome / Edge / Firefox on Windows, macOS, and Linux.
 *
 * Built on top of the Web Push (VAPID) infrastructure, this service:
 *   - Filters subscriptions to desktop user agents only
 *   - Applies desktop-optimised notification options (requireInteraction,
 *     large images, richer action labels)
 *   - Returns separate delivery metrics for desktop vs mobile browsers
 *
 * Mobile browser subscriptions (iOS Safari, Chrome Mobile, Samsung Internet)
 * continue to be served by webPushService directly.
 */

import webpush from "web-push";
import { db } from "../db";
import { pushSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import type { RichPushPayload } from "./pushNotificationTypes.js";

export interface DesktopPushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  category?: string;
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
  renotify?: boolean;
  silent?: boolean;
  vibrate?: number[];
  data?: Record<string, unknown>;
  timestamp?: number;
}

interface SubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const DESKTOP_UA_PATTERNS = [
  /Windows NT/i,
  /Macintosh; Intel Mac OS/i,
  /X11; Linux/i,
  /X11; Ubuntu/i,
  /X11; Fedora/i,
  /X11; CrOS/i,
];

const MOBILE_UA_PATTERNS = [
  /Android/i,
  /iPhone/i,
  /iPad/i,
  /iPod/i,
  /Mobile/i,
  /Samsung/i,
  /SamsungBrowser/i,
];

function isDesktopUserAgent(ua: string | null): boolean {
  if (!ua) return true;
  if (MOBILE_UA_PATTERNS?.some((p) => p?.test(ua))) return false;
  return DESKTOP_UA_PATTERNS?.some((p) => p?.test(ua));
}

function isMobileUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  return MOBILE_UA_PATTERNS?.some((p) => p?.test(ua));
}

function detectBrowser(ua: string | null): string {
  if (!ua) return "unknown";
  if (/Edg\//i?.test(ua)) return "edge";
  if (/Firefox\//i?.test(ua)) return "firefox";
  if (/Chrome\//i?.test(ua) && !/Chromium/i?.test(ua)) return "chrome";
  if (/Safari\//i?.test(ua) && !/Chrome/i?.test(ua)) return "safari";
  if (/Chromium/i?.test(ua)) return "chromium";
  return "other";
}

class DesktopPushService {
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject =
      process.env.VAPID_SUBJECT || "mailto:notifications@maxbooster.ai";

    if (!publicKey || !privateKey) {
      logger.warn(
        "🖥️ Desktop Push Service: VAPID keys not set — desktop push unavailable",
      );
      return;
    }

    try {
      webpush?.setVapidDetails(subject, publicKey, privateKey);
      this.initialized = true;
      logger.info("🖥️ Desktop Push Service initialized (VAPID / Web Push)");
    } catch (error) {
      logger.warn({ err: error }, "🖥️ Desktop Push Service: VAPID init error:");
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ── Subscription Lookup ────────────────────────────────────────────────────

  private async getAllUserSubscriptions(
    userId: string,
  ): Promise<SubscriptionRecord[]> {
    try {
      return (await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions?.userId, userId))) as SubscriptionRecord[];
    } catch {
      return [];
    }
  }

  async getDesktopSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
    const all = await this.getAllUserSubscriptions(userId);
    return all?.filter((s) => isDesktopUserAgent(s?.userAgent));
  }

  async getMobileWebSubscriptions(
    userId: string,
  ): Promise<SubscriptionRecord[]> {
    const all = await this.getAllUserSubscriptions(userId);
    return all?.filter((s) => isMobileUserAgent(s?.userAgent));
  }

  async getSubscriptionBreakdown(userId: string) {
    const all = await this.getAllUserSubscriptions(userId);
    const desktop = all?.filter((s) => isDesktopUserAgent(s?.userAgent));
    const mobile = all?.filter((s) => isMobileUserAgent(s?.userAgent));
    return {
      total: all.length,
      desktop: desktop.length,
      mobileWeb: mobile.length,
      desktopBrowsers: desktop.map((s) => ({
        id: s.id,
        browser: detectBrowser(s?.userAgent),
        createdAt: s.createdAt,
      })),
    };
  }

  // ── Delivery ───────────────────────────────────────────────────────────────

  private async deliverToSubscriptions(
    subscriptions: SubscriptionRecord[],
    serialized: string,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush?.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          serialized,
        );
        sent++;
      } catch (error) {
        failed++;
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          logger.info(
            `🖥️ Removing expired desktop subscription: ${sub?.endpoint.substring(0, 60)}...`,
          );
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions?.endpoint, sub?.endpoint))
            .catch(() => {});
        } else {
          logger.warn(
            `🖥️ Desktop push failed for sub ${sub?.id}:`,
            error?.statusCode || error?.message,
          );
        }
      }
    }

    return { sent, failed };
  }

  async sendToDesktop(
    userId: string,
    payload: DesktopPushPayload,
  ): Promise<{ sent: number; failed: number }> {
    if (!this.initialized) return { sent: 0, failed: 0 };

    const subs = await this.getDesktopSubscriptions(userId);
    if (subs?.length === 0) return { sent: 0, failed: 0 };

    const serialized = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      icon: payload.icon || "/icons/icon-192x192.png",
      badge: payload.badge || "/icons/icon-72x72.png",
      image: payload.image,
      tag: payload.tag,
      category: payload.category,
      actions: payload.actions || [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" },
      ],
      requireInteraction: payload.requireInteraction ?? false,
      renotify: payload.renotify ?? false,
      silent: payload.silent ?? false,
      vibrate: payload.vibrate || [100, 50, 100],
      timestamp: payload.timestamp || Date?.now(),
      data: { ...payload?.data, url: payload.url || "/" },
    });

    const result = await this.deliverToSubscriptions(subs, serialized);

    if (result?.sent > 0) {
      logger.info(
        `🖥️ Desktop push sent to ${result?.sent}/${subs?.length} browser(s) for user ${userId}`,
      );
    }

    return result;
  }

  async sendRichToDesktop(
    userId: string,
    richPayload: RichPushPayload,
  ): Promise<{ sent: number; failed: number }> {
    const desktopPayload: DesktopPushPayload = {
      title: richPayload.title,
      body: richPayload.body,
      url: richPayload.url,
      icon: richPayload.icon,
      badge: richPayload.badge,
      image: richPayload.image,
      tag: richPayload.tag,
      category: richPayload.category,
      actions: this.desktopActions(richPayload),
      requireInteraction: richPayload.requireInteraction,
      renotify: richPayload.renotify,
      silent: richPayload.silent,
      vibrate: richPayload.vibrate,
      timestamp: richPayload.timestamp,
      data: richPayload.data,
    };

    return this.sendToDesktop(userId, desktopPayload);
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  private desktopActions(
    payload: RichPushPayload,
  ): Array<{ action: string; title: string }> {
    if (payload?.actions && payload?.actions.length > 0) return payload?.actions;

    switch (payload?.category) {
      case "account_security":
        return [
          { action: "open", title: "Review Now" },
          { action: "dismiss", title: "Dismiss" },
        ];
      case "direct_interaction":
        return [
          { action: "open", title: "View" },
          { action: "reply", title: "Reply" },
        ];
      case "royalties":
        return [
          { action: "open", title: "View Earnings" },
          { action: "dismiss", title: "Later" },
        ];
      case "distribution":
        return [
          { action: "open", title: "View Release" },
          { action: "dismiss", title: "Got It" },
        ];
      case "collaboration":
        return [
          { action: "open", title: "Open Project" },
          { action: "dismiss", title: "Later" },
        ];
      case "marketplace":
        return [
          { action: "open", title: "View Sale" },
          { action: "dismiss", title: "Got It" },
        ];
      default:
        return [
          { action: "open", title: "Open Max Booster" },
          { action: "dismiss", title: "Dismiss" },
        ];
    }
  }
}

export const desktopPushService = new DesktopPushService();

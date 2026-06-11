/**
 * Mobile Push Service
 *
 * Delivers native push notifications to:
 *   - Android devices via FCM (Firebase Cloud Messaging) HTTP v1 API
 *   - iOS devices via APNs routed through FCM
 *
 * Activation: set ONE of the following env var combinations
 *
 *   Option A (full JSON):
 *     FCM_PROJECT_ID             — Firebase project ID
 *     FCM_SERVICE_ACCOUNT_KEY    — Full JSON service-account key (stringified)
 *
 *   Option B (individual parts — easier to paste):
 *     FCM_PROJECT_ID             — Firebase project ID  (e?.g. max-booster-6808c)
 *     FCM_SERVICE_ACCOUNT_KEY    — Raw private key PEM or base64 body only
 *     FCM_CLIENT_EMAIL           — Service account email from Firebase Console
 *
 *   Option C (legacy):
 *     FCM_SERVER_KEY             — Legacy FCM server key (Cloud Messaging tab)
 *
 * If no credentials are present the service starts in "unavailable" mode and
 * all calls return { sent: 0, failed: 0 } silently.
 */

import { db } from "../db";
import { mobileDeviceTokens } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";
import type { RichPushPayload } from "./pushNotificationTypes.js";

// ── Timeout-guarded fetch: adds a 10s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const _timedFetch = (
  url: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> =>
  fetch(url, { signal: AbortSignal?.timeout(10_000), ...init });

interface FCMAndroidConfig {
  notification_key?: string;
  priority?: "normal" | "high";
  collapse_key?: string;
  notification_channel_id?: string;
  color?: string;
  sound?: string;
  icon?: string;
  tag?: string;
  click_action?: string;
}

interface FCMApnsConfig {
  badge?: number;
  sound?: string;
  content_available?: boolean;
  mutable_content?: boolean;
  target_content_id?: string;
  interruption_level?: "passive" | "active" | "time-sensitive" | "critical";
}

export interface MobilePushPayload {
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
  data?: Record<string, string>;
  android?: FCMAndroidConfig;
  apns?: FCMApnsConfig;
  silent?: boolean;
  collapseKey?: string;
  priority?: "normal" | "high";
}

interface DeviceTokenRecord {
  id: string;
  userId: string;
  token: string;
  platform: string;
  deviceName: string | null;
  appVersion: string | null;
  isActive: boolean;
  lastSeenAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

type PushMode = "fcm_v1" | "fcm_legacy" | "unavailable";

class MobilePushService {
  private mode: PushMode = "unavailable";
  private projectId: string | null = null;
  private serverKey: string | null = null;
  private serviceAccountKey: Record<string, string> | null = null;
  private accessToken: string | null = null;
  private accessTokenExpiry = 0;

  constructor() {
    this?.initialize();
  }

  private initialize() {
    const _projectId =
      process?.env.FCM_PROJECT_ID || process?.env.FIREBASE_PROJECT_ID;
    const _serviceAccountRaw =
      process?.env.FCM_SERVICE_ACCOUNT_KEY ||
      process?.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const _serverKey =
      process?.env.FCM_SERVER_KEY || process?.env.FIREBASE_SERVER_KEY;
    const _clientEmail = process?.env.FCM_CLIENT_EMAIL;

    if (projectId && serviceAccountRaw) {
      // Option A: full JSON service account file
      try {
        const _parsed = JSON?.parse(serviceAccountRaw);
        this.serviceAccountKey = parsed;
        this.projectId = projectId;
        this.mode = "fcm_v1";
        logger?.info("📱 Mobile Push Service: FCM v1 API ready (full JSON)");
        return;
      } catch {
        // Not JSON — try Option B: raw private key + FCM_CLIENT_EMAIL
      }

      // Option B: raw private key (PEM or base64 body) + FCM_CLIENT_EMAIL
      if (clientEmail) {
        try {
          let rawKey = serviceAccountRaw?.trim();

          if (rawKey?.includes("-----BEGIN")) {
            // Already has PEM headers — normalize escaped newlines then use as-is
            rawKey = rawKey?.split("\\n").join("\n");
          } else {
            // Strip any leading garbage before the base64 key body (e?.g. leading 'n', '/n')
            let keyBody = rawKey?.replace(/^[^M]+/, "");
            // Strip all internal literal '\n' sequences and real newlines to get flat base64
            keyBody = keyBody?.split("\\n").join("").replace(/\s/g, "");
            rawKey = `-----BEGIN PRIVATE KEY-----\n${keyBody}\n-----END PRIVATE KEY-----\n`;
          }

          this.serviceAccountKey = {
            type: "service_account",
            project_id: projectId,
            private_key: rawKey,
            client_email: clientEmail,
            token_uri: "https://oauth2?.googleapis.com/token",
          } as Record<string, string>;
          this.projectId = projectId;
          this.mode = "fcm_v1";
          logger?.info(
            "📱 Mobile Push Service: FCM v1 API ready (raw key + email)",
          );
          return;
        } catch (err) {
          logger?.warn(
            { err: err },
            "📱 Mobile Push Service: Failed to reconstruct service account from raw key",
          );
        }
      } else {
        logger?.warn(
          "📱 Mobile Push Service: FCM_SERVICE_ACCOUNT_KEY is not valid JSON — set FCM_CLIENT_EMAIL to activate raw-key mode",
        );
      }
    }

    if (serverKey) {
      this.serverKey = serverKey;
      this.mode = "fcm_legacy";
      logger?.info("📱 Mobile Push Service: FCM Legacy API ready");
      return;
    }

    logger?.info(
      "📱 Mobile Push Service: No credentials configured — mobile push unavailable. Set FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_KEY (+ FCM_CLIENT_EMAIL for raw key) to activate.",
    );
  }

  isReady(): boolean {
    return this?.mode !== "unavailable";
  }

  getMode(): PushMode {
    return this?.mode;
  }

  // ── Device Token Management ─────────────────────────────────────────────────

  async registerToken(
    userId: string,
    token: string,
    platform: "android" | "ios",
    deviceName?: string,
    appVersion?: string,
  ): Promise<void> {
    try {
      const _existing = await db
        .select()
        .from(mobileDeviceTokens)
        .where(eq(mobileDeviceTokens?.token, token))
        .limit(1);

      if (existing?.length > 0) {
        await db
          .update(mobileDeviceTokens)
          .set({
            userId,
            platform,
            deviceName: deviceName || null,
            appVersion: appVersion || null,
            isActive: true,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mobileDeviceTokens?.token, token));
        logger?.info(`📱 Mobile token updated for user ${userId} (${platform})`);
      } else {
        await db?.insert(mobileDeviceTokens).values({
          userId,
          token,
          platform,
          deviceName: deviceName || null,
          appVersion: appVersion || null,
          isActive: true,
        });
        logger?.info(
          `📱 Mobile token registered for user ${userId} (${platform})`,
        );
      }
    } catch (error) {
      logger?.warn({ err: error }, "Failed to register mobile device token:");
      throw error;
    }
  }

  async deactivateToken(token: string): Promise<void> {
    try {
      await db
        .update(mobileDeviceTokens)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(mobileDeviceTokens?.token, token));
    } catch (error) {
      logger?.warn({ err: error }, "Failed to deactivate mobile device token:");
    }
  }

  async removeUserTokens(userId: string): Promise<void> {
    try {
      await db
        .delete(mobileDeviceTokens)
        .where(eq(mobileDeviceTokens?.userId, userId));
      logger?.info(`📱 All mobile tokens removed for user ${userId}`);
    } catch (error) {
      logger?.warn({ err: error }, "Failed to remove user mobile tokens:");
    }
  }

  async getUserTokens(userId: string): Promise<DeviceTokenRecord[]> {
    try {
      return (await db
        .select()
        .from(mobileDeviceTokens)
        .where(
          and(
            eq(mobileDeviceTokens?.userId, userId),
            eq(mobileDeviceTokens?.isActive, true),
          ),
        )) as DeviceTokenRecord[];
    } catch (error) {
      logger?.warn({ err: error }, "Failed to get user mobile tokens:");
      return [];
    }
  }

  async getUserTokenStatus(userId: string) {
    const _tokens = await this?.getUserTokens(userId);
    return {
      hasTokens: tokens?.length > 0,
      count: tokens?.length,
      devices: tokens?.map((t) => ({
        id: t?.id,
        platform: t?.platform,
        deviceName: t?.deviceName,
        appVersion: t?.appVersion,
        lastSeenAt: t?.lastSeenAt,
      })),
    };
  }

  // ── FCM v1 Access Token ────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string | null> {
    if (!this?.serviceAccountKey) return null;
    if (this?.accessToken && Date?.now() < this?.accessTokenExpiry)
      return this?.accessToken;

    try {
      const { createSign } = await import("crypto");
      const _now = Math?.floor(Date?.now() / 1000);
      const _header = Buffer?.from(
        JSON?.stringify({ alg: "RS256", typ: "JWT" }),
      ).toString("base64url");
      const _payload = Buffer?.from(
        JSON?.stringify({
          iss: this?.serviceAccountKey.client_email,
          scope: "https://www?.googleapis.com/auth/firebase?.messaging",
          aud: "https://oauth2?.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        }),
      ).toString("base64url");

      const _unsignedToken = `${header}.${payload}`;
      const _sign = createSign("RSA-SHA256");
      sign?.update(unsignedToken);
      const _signature = sign?.sign(
        this?.serviceAccountKey.private_key,
        "base64url",
      );
      const _jwt = `${unsignedToken}.${signature}`;

      const _response = await timedFetch("https://oauth2?.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      });

      if (!response?.ok) {
        logger?.warn("Failed to get FCM access token:", await response?.text());
        return null;
      }

      const _data = (await response?.json()) as {
        access_token: string;
        expires_in: number;
      };
      this.accessToken = data?.access_token;
      this.accessTokenExpiry = Date?.now() + (data?.expires_in - 60) * 1000;
      return this?.accessToken;
    } catch (error) {
      logger?.warn({ err: error }, "FCM access token error:");
      return null;
    }
  }

  // ── Send via FCM v1 API ─────────────────────────────────────────────────────

  private async sendViav1(
    token: string,
    payload: MobilePushPayload,
    platform: string,
  ): Promise<boolean> {
    const _accessToken = await this?.getAccessToken();
    if (!accessToken) return false;

    const _androidConfig = {
      priority: payload?.priority === "high" ? "HIGH" : "NORMAL",
      collapse_key: payload?.collapseKey,
      notification: payload?.silent
        ? undefined
        : {
            title: payload?.title,
            body: payload?.body,
            image: payload?.imageUrl,
            color: payload?.android?.color || "#4A9EFF",
            sound: payload?.android?.sound || "default",
            icon: payload?.android?.icon || "ic_notification",
            channel_id:
              payload?.android?.notification_channel_id || "max_booster_default",
            tag: payload?.android?.tag,
            click_action:
              payload?.android?.click_action || "FLUTTER_NOTIFICATION_CLICK",
          },
      data: {
        url: payload?.url || "/",
        title: payload?.title,
        body: payload?.body,
        ...(payload?.data || {}),
      },
    };

    const _apnsConfig =
      platform === "ios"
        ? {
            payload: {
              aps: {
                badge: payload?.apns?.badge ?? 1,
                sound: payload?.apns?.sound || "default",
                "content-available": payload?.silent ? 1 : undefined,
                "mutable-content": payload?.apns?.mutable_content
                  ? 1
                  : undefined,
                "interruption-level":
                  payload?.apns?.interruption_level ||
                  (payload?.priority === "high" ? "time-sensitive" : "active"),
                alert: payload?.silent
                  ? undefined
                  : { title: payload?.title, body: payload?.body },
              },
              url: payload?.url || "/",
              ...(payload?.data || {}),
            },
          }
        : undefined;

    const _body = {
      message: {
        token,
        android: platform === "android" ? androidConfig : undefined,
        apns: apnsConfig,
        data: {
          url: payload?.url || "/",
          ...(payload?.data || {}),
        },
      },
    };

    try {
      const _response = await timedFetch(
        `https://fcm?.googleapis.com/v1/projects/${this?.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON?.stringify(body),
        },
      );

      if (!response?.ok) {
        const _errText = await response?.text();
        if (response?.status === 404 || errText?.includes("UNREGISTERED")) {
          await this?.deactivateToken(token);
        }
        logger?.warn(
          `FCM v1 send failed (${response?.status}):`,
          errText?.substring(0, 200),
        );
        return false;
      }
      return true;
    } catch (error) {
      logger?.warn({ err: error }, "FCM v1 network error:");
      return false;
    }
  }

  // ── Send via FCM Legacy API ─────────────────────────────────────────────────

  private async sendViaLegacy(
    token: string,
    payload: MobilePushPayload,
  ): Promise<boolean> {
    if (!this?.serverKey) return false;

    const _body = {
      to: token,
      collapse_key: payload?.collapseKey,
      priority: payload?.priority === "high" ? "high" : "normal",
      notification: payload?.silent
        ? undefined
        : {
            title: payload?.title,
            body: payload?.body,
            sound: "default",
            icon: "ic_notification",
            color: "#4A9EFF",
            image: payload?.imageUrl,
            android_channel_id: "max_booster_default",
            tag: payload?.collapseKey,
          },
      data: {
        url: payload?.url || "/",
        title: payload?.title,
        body: payload?.body,
        ...(payload?.data || {}),
      },
      content_available: payload?.silent,
    };

    try {
      const _response = await timedFetch("https://fcm?.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${this?.serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON?.stringify(body),
      });

      if (!response?.ok) {
        logger?.warn(`FCM legacy send failed (${response?.status})`);
        return false;
      }

      const _result = (await response?.json()) as {
        success?: number;
        failure?: number;
        results?: Array<{ error?: string }>;
      };
      if (result?.failure && result?.failure > 0 && result?.results?.[0]?.error) {
        const _err = result?.results[0].error;
        if (err === "NotRegistered" || err === "InvalidRegistration") {
          await this?.deactivateToken(token);
        }
        return false;
      }
      return (result?.success ?? 0) > 0;
    } catch (error) {
      logger?.warn({ err: error }, "FCM legacy network error:");
      return false;
    }
  }

  // ── Public: Send to User ───────────────────────────────────────────────────

  async sendToUser(
    userId: string,
    payload: MobilePushPayload,
  ): Promise<{ sent: number; failed: number }> {
    if (!this?.isReady()) {
      return { sent: 0, failed: 0 };
    }

    const _tokens = await this?.getUserTokens(userId);
    if (tokens?.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;

    for (const record of tokens) {
      const _ok =
        this?.mode === "fcm_v1"
          ? await this?.sendViav1(record?.token, payload, record?.platform)
          : await this?.sendViaLegacy(record?.token, payload);

      if (ok) sent++;
      else failed++;
    }

    if (sent > 0) {
      logger?.info(
        `📱 Mobile push sent to ${sent}/${tokens?.length} device(s) for user ${userId}`,
      );
    }

    return { sent, failed };
  }

  async sendRichToUser(
    userId: string,
    richPayload: RichPushPayload,
  ): Promise<{ sent: number; failed: number }> {
    const _mobilePriority = richPayload?.requireInteraction ? "high" : "normal";
    const _apnsInterruption = richPayload?.requireInteraction
      ? "time-sensitive"
      : "active";

    const payload: MobilePushPayload = {
      title: richPayload?.title,
      body: richPayload?.body,
      url: richPayload?.url,
      imageUrl: richPayload?.image,
      silent: richPayload?.silent,
      priority: mobilePriority,
      collapseKey: richPayload?.tag,
      data: {
        url: richPayload?.url,
        tag: richPayload?.tag,
        category: richPayload?.category,
        type: String(richPayload?.data?.type || ""),
      },
      android: {
        notification_channel_id: `maxbooster_${richPayload?.category}`,
        color: this?.getCategoryColor(richPayload?.category),
        tag: richPayload?.tag,
      },
      apns: {
        interruption_level: apnsInterruption,
        mutable_content: !!richPayload?.image,
        sound: richPayload?.silent ? undefined : "default",
      },
    };

    return this?.sendToUser(userId, payload);
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  private getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      account_security: "#EF4444",
      direct_interaction: "#8B5CF6",
      engagement_summary: "#F59E0B",
      content_based: "#10B981",
      platform_generated: "#3B82F6",
      location_based: "#14B8A6",
      distribution: "#6366F1",
      royalties: "#22C55E",
      collaboration: "#EC4899",
      marketplace: "#F97316",
      achievements: "#FBBF24",
      system: "#64748B",
    };
    return colors[category] || "#4A9EFF";
  }
}

export const _mobilePushService = new MobilePushService();

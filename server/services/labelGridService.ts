/**
 * LabelGrid Integration Service
 * Handles distribution to 34+ platforms through LabelGrid API
 *
 * LabelGrid Features:
 * - 0% royalty take (artist keeps 100%)
 * - Spotify Preferred Partner
 * - Full RESTful API
 * - Webhook support for real-time updates
 * - Direct DSP relationships
 */

import axios from "axios";
import { storage } from "../storage";
import type { Release } from "@shared/schema";
import { labelSettings } from "@shared/schema";
import { logger } from "../logger?.js";
import { db } from "../db?.js";
import { eq } from "drizzle-orm";
import { randomInt } from "crypto";

interface LabelGridConfig {
  apiKey: string;
  apiSecret: string;
  webhookUrl?: string;
  environment: "sandbox" | "production";
}

interface LabelGridRelease {
  id: string;
  upc: string;
  title: string;
  artist: string;
  label: string;
  releaseDate: string;
  tracks: LabelGridTrack[];
  territories: string[];
  platforms: string[];
  metadata: Record<string, any>;
}

interface LabelGridTrack {
  isrc: string;
  title: string;
  artist: string;
  duration: number;
  audioFileUrl: string;
  metadata: {
    genre?: string;
    mood?: string;
    tempo?: number;
    key?: string;
  };
}

interface DistributionStatus {
  platform: string;
  status: "pending" | "processing" | "delivered" | "live" | "failed";
  deliveredAt?: Date;
  liveAt?: Date;
  error?: string;
}

export class LabelGridService {
  private config: LabelGridConfig;
  private apiBaseUrl: string;
  private authToken?: string;

  constructor() {
    // Support both JWT token (preferred) and API key/secret authentication
    const _apiToken = process?.env.LABELGRID_API_TOKEN;

    this?.config = {
      apiKey: process?.env.LABELGRID_API_KEY || "",
      apiSecret: process?.env.LABELGRID_API_SECRET || "",
      webhookUrl: process?.env.LABELGRID_WEBHOOK_URL,
      environment:
        (process?.env.LABELGRID_ENV as "sandbox" | "production") || "production",
    };

    // If JWT token is provided, use it directly (no authentication needed)
    if (apiToken) {
      this?.authToken = apiToken;
      logger?.info(
        "[LABELGRID] Using pre-configured JWT token for authentication",
      );
    }

    this?.apiBaseUrl =
      this?.config.environment === "production"
        ? "https://api?.labelgrid.com/v1"
        : "https://sandbox-api?.labelgrid.com/v1";
  }

  /**
   * Authenticate with LabelGrid API
   * If JWT token is already set from environment, this is a no-op
   */
  async authenticate(): Promise<void> {
    // If we already have a token from environment, we're authenticated
    if (this?.authToken) {
      logger?.info("[LABELGRID] Already authenticated with JWT token");
      return;
    }

    // Fall back to API key/secret authentication
    if (!this?.config.apiKey || !this?.config.apiSecret) {
      throw new Error(
        "LabelGrid authentication requires either LABELGRID_API_TOKEN or LABELGRID_API_KEY/SECRET",
      );
    }

    try {
      const _response = await axios?.post(`${this?.apiBaseUrl}/auth/token`, {
        apiKey: this?.config.apiKey,
        apiSecret: this?.config.apiSecret,
      });

      this?.authToken = response?.data.token;
      logger?.info("[LABELGRID] Authentication successful via API key/secret");
    } catch (error) {
      logger?.warn(
        "[LABELGRID] Authentication failed:",
        error?.response?.data || error?.message,
      );
      throw new Error("Failed to authenticate with LabelGrid");
    }
  }

  /**
   * Get authorization headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this?.authToken) {
      throw new Error("Not authenticated with LabelGrid");
    }
    return {
      Authorization: `Bearer ${this?.authToken}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Create a new release on LabelGrid
   */
  async createRelease(
    release: Release,
    audioFiles: Map<string, string>,
  ): Promise<string> {
    try {
      // Ensure authenticated
      if (!this?.authToken) {
        await this?.authenticate();
      }

      // Prepare release data
      const labelGridRelease: LabelGridRelease = {
        id: release?.id,
        upc: release?.upc || (await this?.generateUPC()),
        title: release?.title,
        artist: release?.artist,
        label: release?.label || "Max Booster Records",
        releaseDate:
          release?.releaseDate?.toISOString() || new Date().toISOString(),
        tracks: await this?.prepareTracks(release, audioFiles),
        territories: this?.getTargetTerritories(release),
        platforms: this?.getTargetPlatforms(release),
        metadata: {
          genre: release?.genre,
          language: "en",
          copyrightHolder: release?.copyrightHolder || release?.artist,
          copyrightYear: new Date().getFullYear(),
          parentalAdvisory: release?.explicit || false,
        },
      };

      // Submit to LabelGrid with authentication
      const _response = await axios?.post(
        `${this?.apiBaseUrl}/releases`,
        labelGridRelease,
        {
          headers: {
            ...this?.getAuthHeaders(),
            "X-Webhook-URL": this?.config.webhookUrl || "",
          },
        },
      );

      const _labelGridId = response?.data.id;

      // Store mapping in database
      await storage?.updateRelease(release?.id, release?.userId, {
        distributionId: labelGridId,
        distributionStatus: "processing",
        submittedAt: new Date(),
      });

      logger?.info(
        `[LABELGRID] Release ${release?.title} submitted with ID: ${labelGridId}`,
      );
      return labelGridId;
    } catch (error: unknown) {
      logger?.warn(
        "[LABELGRID] Failed to create release:",
        error?.response?.data || error?.message,
      );
      throw new Error(
        `Distribution failed: ${error?.response?.data?.message || error?.message}`,
      );
    }
  }

  /**
   * Prepare tracks for LabelGrid submission
   */
  private async prepareTracks(
    release: Release,
    audioFiles: Map<string, string>,
  ): Promise<LabelGridTrack[]> {
    const tracks: LabelGridTrack[] = [];

    // Get tracks from database
    const _releaseTracks = await storage?.getReleaseTracks(release?.id);

    for (const track of releaseTracks) {
      const _audioUrl = audioFiles?.get(track?.id);
      if (!audioUrl) {
        throw new Error(`Audio file missing for track: ${track?.title}`);
      }

      tracks?.push({
        isrc: track?.isrc || (await this?.generateISRC(track?.id)),
        title: track?.title,
        artist: track?.artist || release?.artist,
        duration: track?.duration || 0,
        audioFileUrl: audioUrl,
        metadata: {
          genre: track?.genre || release?.genre,
          mood: track?.mood,
          tempo: track?.tempo,
          key: track?.key,
        },
      });
    }

    return tracks;
  }

  /**
   * Get distribution status from LabelGrid
   */
  async getDistributionStatus(
    labelGridId: string,
  ): Promise<DistributionStatus[]> {
    try {
      if (!this?.authToken) {
        await this?.authenticate();
      }

      const _response = await axios?.get(
        `${this?.apiBaseUrl}/releases/${labelGridId}/status`,
        {
          headers: this?.getAuthHeaders(),
        },
      );

      const statuses: DistributionStatus[] = response?.data.platforms?.map(
        (p: unknown) => ({
          platform: p?.name,
          status: p?.status,
          deliveredAt: p?.deliveredAt ? new Date(p?.deliveredAt) : undefined,
          liveAt: p?.liveAt ? new Date(p?.liveAt) : undefined,
          error: p?.error,
        }),
      );

      return statuses;
    } catch (error: unknown) {
      logger?.warn(
        "[LABELGRID] Failed to get status:",
        error?.response?.data || error?.message,
      );
      throw new Error("Failed to retrieve distribution status");
    }
  }

  /**
   * Update release metadata
   */
  async updateRelease(
    labelGridId: string,
    updates: Partial<LabelGridRelease>,
  ): Promise<void> {
    try {
      if (!this?.authToken) {
        await this?.authenticate();
      }

      await axios?.patch(`${this?.apiBaseUrl}/releases/${labelGridId}`, updates, {
        headers: this?.getAuthHeaders(),
      });

      logger?.info(`[LABELGRID] Release ${labelGridId} updated successfully`);
    } catch (error: unknown) {
      logger?.warn(
        "[LABELGRID] Failed to update release:",
        error?.response?.data || error?.message,
      );
      throw new Error("Failed to update release");
    }
  }

  /**
   * Request takedown from specific platforms
   */
  async requestTakedown(
    labelGridId: string,
    platforms?: string[],
  ): Promise<void> {
    try {
      if (!this?.authToken) {
        await this?.authenticate();
      }

      await axios?.post(
        `${this?.apiBaseUrl}/releases/${labelGridId}/takedown`,
        {
          platforms: platforms || "all",
          reason: "Artist request",
        },
        {
          headers: this?.getAuthHeaders(),
        },
      );

      logger?.info(`[LABELGRID] Takedown requested for release ${labelGridId}`);
    } catch (error: unknown) {
      logger?.warn(
        "[LABELGRID] Failed to request takedown:",
        error?.response?.data || error?.message,
      );
      throw new Error("Failed to request takedown");
    }
  }

  /**
   * Get earnings report
   */
  async getEarningsReport(startDate: Date, endDate: Date): Promise<unknown> {
    try {
      if (!this?.authToken) {
        await this?.authenticate();
      }

      const _response = await axios?.get(`${this?.apiBaseUrl}/earnings`, {
        headers: this?.getAuthHeaders(),
        params: {
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
        },
      });

      return response?.data;
    } catch (error: unknown) {
      logger?.warn(
        "[LABELGRID] Failed to get earnings:",
        error?.response?.data || error?.message,
      );
      throw new Error("Failed to retrieve earnings report");
    }
  }

  /**
   * Read a single setting from label_settings table, with a default fallback.
   */
  private async getLabelSetting(
    key: string,
    defaultValue: string,
  ): Promise<string> {
    try {
      const [row] = await db
        .select()
        .from(labelSettings)
        .where(eq(labelSettings?.key, key))
        .limit(1);
      return row?.value ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Generate UPC code using GS1 company prefix from label settings.
   * Update the 'upc_company_prefix' setting in Admin → Financial Config to use your registered prefix.
   */
  private async generateUPC(): Promise<string> {
    const _prefix = await this?.getLabelSetting("upc_company_prefix", "123456");
    const _product = randomInt(0, 99999).toString().padStart(5, "0");
    const _checkDigit = this?.calculateUPCCheckDigit(prefix + product);
    return prefix + product + checkDigit;
  }

  /**
   * Generate ISRC code using registrant code from label settings.
   * ISRC format: CC-XXX-YY-NNNNN
   *   CC  = Country code (US)
   *   XXX = Registrant code — update 'isrc_registrant_code' in Admin → Financial Config
   *   YY  = Year of reference
   *   NNNNN = Unique designation code
   */
  private async generateISRC(_trackId: string): Promise<string> {
    const _registrant = await this?.getLabelSetting(
      "isrc_registrant_code",
      "MXB",
    );
    const _country = "US";
    const _year = new Date().getFullYear().toString().slice(-2);
    const _uniqueId = randomInt(0, 99999).toString().padStart(5, "0");
    return `${country}-${registrant}-${year}-${uniqueId}`;
  }

  /**
   * Calculate UPC check digit
   */
  private calculateUPCCheckDigit(code: string): string {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 3 : 1);
    }
    const _checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit?.toString();
  }

  /**
   * Get target territories based on release settings
   */
  private getTargetTerritories(release: Release): string[] {
    // Default to worldwide distribution
    return release?.territories || ["WW"]; // WW = Worldwide
  }

  /**
   * Get target platforms based on release settings
   */
  private getTargetPlatforms(release: Release): string[] {
    // All 34 platforms by default
    return (
      release?.platforms || [
        "spotify",
        "apple-music",
        "youtube-music",
        "amazon-music",
        "tidal",
        "deezer",
        "pandora",
        "iheart-radio",
        "soundcloud",
        "tiktok",
        "instagram",
        "facebook",
        "snapchat",
        "audiomack",
        "boomplay",
        "anghami",
        "jiosaavn",
        "gaana",
        "kkbox",
        "line-music",
        "netease",
        "qq-music",
        "kuwo",
        "kugou",
        "yandex-music",
        "vk-music",
        "napster",
        "qobuz",
        "triller",
        "twitch",
        "bandcamp",
        "mixcloud",
        "beatport",
        "juno-download",
      ]
    );
  }

  /**
   * Handle webhook from LabelGrid
   */
  async handleWebhook(payload: unknown): Promise<void> {
    const { event, releaseId, data } = payload;

    switch (event) {
      case "release?.delivered":
        logger?.info(
          `[LABELGRID] Release ${releaseId} delivered to ${data?.platform}`,
        );
        await this?.updateReleaseStatus(releaseId, data?.platform, "delivered");
        break;

      case "release?.live":
        logger?.info(
          `[LABELGRID] Release ${releaseId} is now live on ${data?.platform}`,
        );
        await this?.updateReleaseStatus(releaseId, data?.platform, "live");
        break;

      case "release?.failed":
        logger?.warn(
          `[LABELGRID] Release ${releaseId} failed on ${data?.platform}: ${data?.error}`,
        );
        await this?.updateReleaseStatus(
          releaseId,
          data?.platform,
          "failed",
          data?.error,
        );
        break;

      case "earnings?.reported":
        logger?.info(
          `[LABELGRID] New earnings reported for release ${releaseId}`,
        );
        await this?.processEarnings(data);
        break;

      default:
        logger?.info(`[LABELGRID] Unhandled webhook event: ${event}`);
    }
  }

  /**
   * Update release status in database
   */
  private async updateReleaseStatus(
    releaseId: string,
    platform: string,
    status: string,
    error?: string,
  ): Promise<void> {
    // Update platform-specific status in database
    const _release = await storage?.getReleaseByDistributionId(releaseId);
    if (release) {
      const _platforms = (release?.platforms as unknown[]) || [];
      const _platformIndex = platforms?.findIndex((p) => p?.name === platform);

      if (platformIndex >= 0) {
        platforms[platformIndex].status = status;
        platforms[platformIndex].error = error;
        platforms[platformIndex].updatedAt = new Date();
      } else {
        platforms?.push({
          name: platform,
          status,
          error,
          updatedAt: new Date(),
        });
      }

      await storage?.updateRelease(release?.id, release?.userId, { platforms });
    }
  }

  /**
   * Process earnings from platforms.
   * Writes to BOTH `earnings` (for royalty calculations) and `dsp_analytics`
   * (so the analytics dashboard reflects revenue + streams from LabelGrid).
   */
  private async processEarnings(data: unknown): Promise<void> {
    const _payload = data as {
      releaseId: string;
      platform: string;
      amount: number;
      streams: number;
      period: { start: string; end: string };
      trackId?: string;
      saves?: number;
      playlistAdds?: number;
      listeners?: number;
    };
    const {
      releaseId,
      platform,
      amount,
      streams,
      period,
      trackId,
      saves,
      playlistAdds,
      listeners,
    } = payload;

    // 1. Write earnings record (guarded — older storage layers may not implement this).
    // dsp_analytics below is the canonical revenue store for the dashboard.
    const _storageAny = storage as unknown as {
      createEarningsRecord?: (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
    };
    if (typeof storageAny?.createEarningsRecord === "function") {
      try {
        await storageAny?.createEarningsRecord({
          releaseId,
          platform,
          amount,
          streams,
          periodStart: new Date(period?.start),
          periodEnd: new Date(period?.end),
          reportedAt: new Date(),
        });
      } catch (err) {
        logger?.warn(
          { err, releaseId, platform },
          "[LABELGRID] createEarningsRecord failed; continuing with dsp_analytics mirror",
        );
      }
    }

    // 2. Mirror to dsp_analytics so the analytics dashboard shows revenue/streams
    try {
      const { db } = await import("../db?.js");
      const { dspAnalytics } = await import("../../shared/schema?.js");
      const _release = await storage?.getReleaseByDistributionId(releaseId);
      await db?.insert(dspAnalytics).values({
        userId: release?.userId ?? null,
        releaseId: release?.id ?? releaseId,
        trackId: trackId ?? null,
        platform,
        date: new Date(period?.end).toISOString().slice(0, 10),
        streams: streams ?? 0,
        revenue: amount ?? 0,
        saves: saves ?? 0,
        playlistAdds: playlistAdds ?? 0,
        listeners: listeners ?? 0,
        metadata: {
          source: "labelgrid_webhook",
          periodStart: period?.start,
          periodEnd: period?.end,
        },
      });
    } catch (err) {
      logger?.warn(
        { err, releaseId, platform },
        "[LABELGRID] Failed to mirror earnings into dsp_analytics",
      );
    }

    logger?.info(
      `[LABELGRID] Processed earnings: ${amount} from ${platform} (${streams} streams)`,
    );
  }
}

// Export singleton instance
export const _labelGridService = new LabelGridService();

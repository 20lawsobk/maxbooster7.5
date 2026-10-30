import { createHmac, timingSafeEqual } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  LabelGridClient,
  ENTITIES,
  assertAllowedExtension,
  uploadViaPresignedUrl,
  type ApiError,
  type ApiResult,
} from "@labelgrid/core";
import { storage } from "../storage";
import { logger } from "../logger.js";
import { CircuitBreaker } from "../infrastructure/circuitBreaker";

/**
 * Internal error used to carry a structured ApiError through a throw/catch
 * boundary. @labelgrid/core's client never rejects — every failure comes
 * back as a `{ error }` ApiResult — so the circuit breaker (which only
 * counts thrown exceptions as failures) needs something to throw. Caught
 * immediately inside cbCall() and converted back into a plain ApiResult
 * before any public method sees it.
 */
class LabelGridApiRejection extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
    this.name = "LabelGridApiRejection";
  }
}

export interface LabelGridRelease {
  title: string;
  artist: string;
  releaseDate: string;
  upc?: string;
  tracks: LabelGridTrack[];
  artwork: string;
  genre: string;
  platforms: string[];
  label?: string;
  copyrightYear?: number;
  copyrightOwner?: string;
  territoryMode?: "worldwide" | "include" | "exclude";
  territories?: string[];
  /** Contact email for the label entity LabelGrid requires on release create. */
  labelContactEmail?: string;
  /**
   * LabelGrid-required release-level compliance field (AI-involvement
   * disclosure for the cover art), with no current app data source — see
   * assertTrackComplianceDataAvailable.
   */
  artworkAiUsage?: string;
}

export interface LabelGridTrack {
  title: string;
  artist: string;
  isrc?: string;
  audioFile: string;
  duration: number;
  trackNumber: number;
  explicit?: boolean;
  lyrics?: string;
  /**
   * LabelGrid-required compliance fields on real track creation, with no
   * current app data source (no schema column populates these anywhere) —
   * see assertTrackComplianceDataAvailable. Left optional/undefined today;
   * wiring real data into these is a separate feature, not fabricatable here.
   */
  compositionType?: "original" | "cover" | "remix" | "sample-based";
  audioAiUsage?: string;
  compositionAiUsage?: string;
  recordingCountry?: string;
  contributors?: Array<Record<string, unknown>>;
}

export interface LabelGridReleaseResponse {
  releaseId: string;
  status: "unknown" | "draft" | "not_submitted" | "processing" | "live" | "failed";
  submittedAt?: string;
  estimatedLiveDate?: string;
  platforms: LabelGridPlatformStatus[];
  deliveryEvidence?: { source: "labelgrid"; observedAt: string; available: boolean };
}

export interface LabelGridPlatformStatus {
  platform: string;
  status:
    | "unknown"
    | "draft"
    | "not_submitted"
    | "queued"
    | "pending"
    | "processing"
    | "submitted"
    | "accepted"
    | "success"
    | "delivered"
    | "live"
    | "failed"
    | "rejected"
    | "unsupported"
    | "not_supported"
    | "not_configured"
    | "error";
  liveDate?: string;
  rawStatus?: string;
  observedAt?: string;
  errorMessage?: string;
}

export interface LabelGridAnalytics {
  releaseId: string;
  totalStreams: number;
  totalRevenue: number;
  platforms: {
    [key: string]: {
      streams: number;
      revenue: number;
      listeners: number;
    };
  };
  timeline: {
    date: string;
    streams: number;
    revenue: number;
  }[];
}

export interface LabelGridWebhookPayload {
  event: string;
  releaseId: string;
  status?: string;
  errorMessage?: string;
  platform?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface LabelGridCodeResponse {
  code: string;
  type: "isrc" | "upc";
  assignedTo?: string;
  createdAt: string;
}

export interface LabelGridPublishingMetadata {
  writers: string[];
  publishers: string[];
  ipi: string;
  pro: string;
}

export interface LabelGridSyncOpportunity {
  id: string;
  title: string;
  brand: string;
  budget: number;
  deadline: string;
  genre: string;
  mood: string;
}

export interface LabelGridSyncSubmission {
  id: string;
  releaseId: string;
  opportunityId: string;
  status: "pending" | "accepted" | "rejected" | "placed";
  notes?: string;
}

export interface LabelGridSmartLink {
  id: string;
  url: string;
  releaseId: string;
  platforms: string[];
  customSlug?: string;
  clicks: number;
}

export interface LabelGridSmartLinkAnalytics {
  clicks: number;
  platforms: Record<string, number>;
  countries: Record<string, number>;
}

export interface LabelGridPreSave {
  id: string;
  releaseId: string;
  url: string;
  subscribers: number;
  startDate: string;
  endDate?: string;
  status: "draft" | "active" | "completed" | "cancelled";
}

export interface LabelGridPreSaveSubscriber {
  email: string;
  platform: string;
  subscribedAt: string;
}

export interface LabelGridContentClaim {
  id: string;
  releaseId: string;
  platform: string;
  videoId?: string;
  status: "pending" | "active" | "disputed" | "released";
  revenue: number;
}

export interface LabelGridContentRevenue {
  total: number;
  byPlatform: Record<string, number>;
  byMonth: { month: string; amount: number }[];
}

export interface LabelGridRoyaltySummary {
  pending: number;
  available: number;
  lifetime: number;
  currency: string;
}

export interface LabelGridRoyaltyStatement {
  id: string;
  period: string;
  amount: number;
  status: "pending" | "paid" | "processing";
  pdfUrl: string;
}

export interface LabelGridPayoutRequest {
  id: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  requestedAt: string;
  processedAt?: string;
}

export interface LabelGridDSP {
  id: string;
  name: string;
  slug: string;
  category:
    | "streaming"
    | "download"
    | "social"
    | "electronic"
    | "regional"
    | "niche"
    | "monetization";
  region: string;
  isActive: boolean;
  processingTime: string;
  requirements: {
    isrc: boolean;
    upc: boolean;
    metadata: string[];
    audioFormats: string[];
  };
  deliveryMethod: "api" | "ftp" | "ddex";
  logoUrl?: string;
  docsUrl?: string;
}

export interface LabelGridDSPListResponse {
  dsps: LabelGridDSP[];
  total: number;
  syncedAt: string;
}

export interface LabelGridArtistPlatformPresence {
  platform: string;
  platformLabel: string;
  artistId: string | null;
  artistUrl: string | null;
  status: "live" | "pending" | "processing" | "not_found" | "error";
  liveAt?: string;
}

export interface LabelGridArtistSearchResult {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  genres: string[];
  verified: boolean;
  platforms: LabelGridArtistPlatformPresence[];
}

export interface LabelGridCatalogTrack {
  title: string;
  isrc?: string;
  trackNumber: number;
  duration: number;
}

export interface LabelGridCatalogRelease {
  id: string;
  title: string;
  artist: string;
  releaseDate?: string;
  upc?: string;
  coverUrl?: string;
  releaseType: "album" | "ep" | "single";
  trackCount: number;
  genre?: string;
  platforms: string[];
  tracks?: LabelGridCatalogTrack[];
}

/**
 * DSP profile-URL fields on a LabelGrid ArtistData object, with a conservative
 * ID-extraction pattern for each. Only platforms whose URL shape we're
 * confident about are listed — every other DSP URL field on the artist is
 * still surfaced by buildLabelGridPlatformPresences() below, just with a
 * null artistId rather than a guessed one.
 */
const LABELGRID_ARTIST_DSP_URL_FIELDS: Array<{
  platform: string;
  platformLabel: string;
  field: string;
  extractId: (url: string) => string | null;
}> = [
  {
    platform: "deezer",
    platformLabel: "Deezer",
    field: "deezer_url",
    extractId: (url) => url.match(/\/artist\/(\d+)/)?.[1] ?? null,
  },
  {
    platform: "tidal",
    platformLabel: "Tidal",
    field: "tidal_url",
    extractId: (url) => url.match(/\/artist\/(\d+)/)?.[1] ?? null,
  },
  {
    platform: "amazon_music",
    platformLabel: "Amazon Music",
    field: "amazon_url",
    extractId: (url) => url.match(/\/artists\/([A-Za-z0-9]+)/)?.[1] ?? null,
  },
  {
    platform: "soundcloud",
    platformLabel: "SoundCloud",
    field: "soundcloud_url",
    extractId: (url) => url.match(/soundcloud\.com\/([^/?#]+)/i)?.[1] ?? null,
  },
  {
    platform: "bandcamp",
    platformLabel: "Bandcamp",
    field: "bandcamp_url",
    extractId: (url) =>
      url.match(/^https?:\/\/([^.]+)\.bandcamp\.com/i)?.[1] ?? null,
  },
];

/**
 * Build the platform-presence list for a LabelGrid Artist object. LabelGrid's
 * Artist record has no per-platform "status" field — only URL/ID presence —
 * so every presence derived here is "live" (URL or ID exists) or omitted
 * entirely (field is null/absent). Native ID fields (Spotify, Apple Music)
 * are used directly; every other DSP is a profile URL that may or may not
 * yield an extractable ID.
 */
function buildLabelGridPlatformPresences(
  artist: Record<string, any>,
): LabelGridArtistPlatformPresence[] {
  const presences: LabelGridArtistPlatformPresence[] = [];

  if (artist?.spotify_artist_id) {
    presences.push({
      platform: "spotify",
      platformLabel: "Spotify",
      artistId: String(artist.spotify_artist_id),
      artistUrl: artist.spotify_url ?? null,
      status: "live",
    });
  }
  if (artist?.apple_artist_id) {
    presences.push({
      platform: "apple_music",
      platformLabel: "Apple Music",
      artistId: String(artist.apple_artist_id),
      artistUrl: artist.applemusic_url ?? null,
      status: "live",
    });
  }

  for (const dsp of LABELGRID_ARTIST_DSP_URL_FIELDS) {
    const url = artist?.[dsp.field] as string | null | undefined;
    if (!url) continue;
    presences.push({
      platform: dsp.platform,
      platformLabel: dsp.platformLabel,
      artistId: dsp.extractId(url),
      artistUrl: url,
      status: "live",
    });
  }

  return presences;
}

class LabelGridService {
  private client: LabelGridClient;
  private apiToken: string | undefined;
  private baseUrl: string;
  private endpoints: Record<string, unknown>;
  // authHeaderFormat intentionally omitted: stored for observability, consumed via config load
  private webhookSecret: string | undefined;
  private isConfigured: boolean = false;
  private configLoaded: boolean = false;
  private maxRetries: number = 3;
  private baseDelay: number = 1000;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    // LabelGrid issues API tokens scoped to the calling domain: the token
    // generated for the dev workspace URL will not authenticate requests
    // made from the production URL, and vice versa. LABELGRID_API_TOKEN is
    // the dev-workspace-scoped token; LABELGRID_API_TOKEN1 is the
    // production-scoped token issued for the deployed domain.
    this.apiToken =
      process.env.NODE_ENV === "production"
        ? process.env.LABELGRID_API_TOKEN1
        : process.env.LABELGRID_API_TOKEN;
    this.baseUrl = this.normalizeBaseUrl(
      process.env.LABELGRID_API_URL || "https://api.labelgrid.com",
    );
    this.webhookSecret = process.env.LABELGRID_WEBHOOK_SECRET;
    this.endpoints = {};

    this.circuitBreaker = new CircuitBreaker("labelgrid-api", {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      resetTimeout: 60000,
    });

    if (!this.apiToken) {
      logger.warn(
        "⚠️  LabelGrid API token not configured. Distribution features will use simulated mode.",
      );
      logger.warn(
        process.env.NODE_ENV === "production"
          ? "   Set LABELGRID_API_TOKEN1 (production-scoped token) in your environment to enable real distribution."
          : "   Set LABELGRID_API_TOKEN (dev-scoped token) in your environment to enable real distribution.",
      );
    } else {
      this.isConfigured = true;
      logger.info("✅ LabelGrid API client initialized");
    }

    // @labelgrid/core's LabelGridClient is immutable per instance (no
    // defaults.baseURL-style mutation like the old axios client) — built
    // here and rebuilt via rebuildClient() whenever loadConfig() picks up a
    // DB-stored base URL override. Circuit-breaker protection is applied per
    // call via cbCall()/callWithRetry() below, since the vendor client has
    // no adapter seam to wrap.
    this.client = new LabelGridClient({
      baseUrl: this.baseUrl,
      token: this.apiToken || "",
      version: "1.0.0",
      userAgent: "max-booster-distribution/1.0",
    });

    // Load config from database on initialization
    this.loadConfig();
  }

  /**
   * LabelGrid's real public API is served entirely under /api/public with no
   * version segment (confirmed against LabelGrid's own OpenAPI spec, and
   * against the published @labelgrid/core client whose entity/endpoint
   * paths — /releases, /genres, /statements, etc. — are all relative to this
   * prefix, not to a bare host). This normalizes any configured base URL
   * (env var or DB-stored) to always end in /api/public exactly once.
   */
  private normalizeBaseUrl(url: string): string {
    const trimmed = (url || "").replace(/\/+$/, "");
    return trimmed.endsWith("/api/public") ? trimmed : `${trimmed}/api/public`;
  }

  /** Rebuilds the LabelGridClient against the current baseUrl/token. */
  private rebuildClient(): void {
    this.client = new LabelGridClient({
      baseUrl: this.baseUrl,
      token: this.apiToken || "",
      version: "1.0.0",
      userAgent: "max-booster-distribution/1.0",
    });
  }

  private async loadConfig() {
    if (this.configLoaded) return;

    try {
      const provider = await storage.getDistributionProvider("labelgrid");

      if (provider) {
        // Use actual fields from the schema
        this.baseUrl = this.normalizeBaseUrl(
          (provider as any)?.apiBase ||
            this.baseUrl ||
            "https://api.labelgrid.com",
        );
        this.endpoints = (provider as any)?.requirements?.endpoints || {};
        this.webhookSecret =
          (provider as any)?.requirements?.webhookSecret || this.webhookSecret;
        this.configLoaded = true;

        this.rebuildClient();

        logger.info("✅ LabelGrid configuration loaded from database");
        logger.info(`   Base URL: ${this.baseUrl}`);
        logger.info(
          `   Endpoints configured: ${Object.keys(this.endpoints).length}`,
        );
      } else {
        // Fallback to environment variables (expected until provider is configured)
        this.baseUrl = this.normalizeBaseUrl(
          process.env.LABELGRID_API_URL || "https://api.labelgrid.com",
        );
        this.endpoints = {};
        this.configLoaded = true;
        // Silent fallback - provider will be added when distribution is configured
      }
    } catch (error: unknown) {
      logger.warn(
        { err: error },
        "Failed to load LabelGrid config from database:",
      );
      this.baseUrl = this.normalizeBaseUrl(
        process.env.LABELGRID_API_URL || "https://api.labelgrid.com",
      );
      this.endpoints = {};
    }
  }

  private getEndpoint(key: string, fallback: string): string {
    return (this.endpoints[key] as string | undefined) || fallback;
  }

  /**
   * Whether an ApiError indicates the SERVICE is unhealthy (network fault,
   * timeout, 5xx) rather than a business-level outcome. Only these should
   * trip the circuit breaker: a 4xx (validation, auth, not-found) is a
   * business error, and 429 is a per-account rate limit rather than a
   * service-health signal — neither should count as a breaker failure.
   */
  private static isBreakerRelevant(err: ApiError): boolean {
    return (
      err.code === "NETWORK_ERROR" ||
      err.code === "TIMEOUT" ||
      (typeof err.status === "number" && err.status >= 500)
    );
  }

  /**
   * Runs one @labelgrid/core call through the circuit breaker. The vendor
   * client never rejects — failures come back as `{ error }` ApiResult
   * values — so without forcing a throw here, the breaker's failure counter
   * would never increment and it could never open. Throws only on
   * breaker-relevant failures (network/timeout/5xx) and always re-wraps the
   * outcome back into a plain ApiResult, so every caller sees one contract
   * regardless of whether the breaker intervened.
   */
  private async cbCall<T>(
    fn: () => Promise<ApiResult<T>>,
  ): Promise<ApiResult<T>> {
    try {
      // Intentionally no fallback passed to execute(): a fallback fires on
      // ANY failure while CLOSED, not only when genuinely OPEN, which would
      // mask real errors (401s, validation failures) behind a generic
      // message. Omitting it lets the real error, or the breaker's own
      // accurate OPEN-state error, reach the catch below.
      return await this.circuitBreaker.execute(async () => {
        const result = await fn();
        if (
          "error" in result &&
          LabelGridService.isBreakerRelevant(result.error)
        ) {
          throw new LabelGridApiRejection(result.error);
        }
        return result;
      });
    } catch (err) {
      if (err instanceof LabelGridApiRejection) {
        return { error: err.apiError };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { error: { code: "CIRCUIT_OPEN", message, status: 503 } };
    }
  }

  /**
   * Layers retry-with-backoff on top of cbCall(): retries on 429 (honoring
   * the API's own retry_after_seconds when present), 5xx, TIMEOUT, and
   * NETWORK_ERROR. 4xx business errors (400/401/403/404/422) return
   * immediately without retrying.
   */
  private async callWithRetry<T>(
    fn: () => Promise<ApiResult<T>>,
    retries: number = this.maxRetries,
  ): Promise<ApiResult<T>> {
    let lastResult!: ApiResult<T>;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await this.cbCall(fn);
      if (!("error" in result)) return result;
      lastResult = result;

      const { error } = result;
      const isRetryable =
        error.status === 429 ||
        error.status >= 500 ||
        error.code === "TIMEOUT" ||
        error.code === "NETWORK_ERROR";

      if (attempt === retries || !isRetryable) {
        return result;
      }

      const delay =
        typeof error.retry_after_seconds === "number" &&
        error.retry_after_seconds > 0
          ? error.retry_after_seconds * 1000
          : Math.min(this.baseDelay * Math.pow(2, attempt), 16000);
      logger.info(
        `⏳ LabelGrid API retry ${attempt + 1}/${retries} after ${delay}ms (${error.code})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return lastResult;
  }

  private logApiError(context: string, error: ApiError): void {
    logger.warn(
      {
        context,
        code: error.code,
        status: error.status,
        field: error.field,
        errors: error.errors_structured ?? error.errors,
      },
      `${context}: ${error.message}`,
    );
  }

  /**
   * Converts a final ApiResult<T> into a plain T, or throws a clean Error —
   * matching the thrown-on-failure contract every real caller in
   * distribution.ts / dspAnalyticsService.ts / artistProfileService.ts /
   * catalogMigrationService.ts already depends on.
   */
  private unwrap<T>(context: string, result: ApiResult<T>): T {
    if ("error" in result) {
      this.logApiError(context, result.error);
      throw new Error(`LabelGrid API error: ${result.error.message}`);
    }
    return result.data;
  }

  private logApiCall(method: string, endpoint: string, data?: unknown): void {
    logger.info({
      endpoint,
      method,
      hasData: !!data,
    }, `LabelGrid API ${method} ${endpoint}`);
  }

  /**
   * Check if LabelGrid API is configured
   */
  isApiConfigured(): boolean {
    return !!this.apiToken;
  }

  /**
   * Get available DSPs for distribution
   *
   * ARCHITECTURE NOTE: LabelGrid API is used for releases, distribution, analytics, and royalties.
   * The DSP list is maintained locally as a reference catalog - LabelGrid does not expose
   * a public /dsps endpoint. When submitting releases, platform selection is validated
   * against LabelGrid's supported platforms on their end.
   *
   * The local catalog reflects all platforms LabelGrid supports for distribution.
   */
  async getAvailableDSPs(): Promise<LabelGridDSPListResponse> {
    await this.loadConfig();

    // DSP catalog is maintained locally - LabelGrid validates platform support during release submission
    logger.info(
      "📦 Using local DSP catalog (LabelGrid validates platforms during distribution)",
    );
    return this.getLocalDSPCatalog();
  }

  /**
   * Get local DSP catalog from database as fallback
   */
  private async getLocalDSPCatalog(): Promise<LabelGridDSPListResponse> {
    try {
      const providers = await storage.getAllDSPProviders();

      const dsps: LabelGridDSP[] = providers.map(
        (p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
          slug: p.slug as string,
          category: (p.metadata as any).category || "streaming",
          region: (p.metadata as any).region || "global",
          isActive: (p.isActive as boolean | undefined) ?? true,
          processingTime: (p.metadata as any).processingTime || "3-7 days",
          requirements: (p.metadata as any).requirements || {
            isrc: true,
            upc: true,
            metadata: ["title", "artist", "album"],
            audioFormats: ["WAV", "FLAC"],
          },
          deliveryMethod: (p.metadata as any).deliveryMethod || "api",
          logoUrl: p.logoUrl as string | undefined,
          docsUrl: (p.metadata as any).docsUrl as string | undefined,
        }),
      );

      return {
        dsps,
        total: dsps.length,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn({ err: error }, "Failed to get local DSP catalog:");
      return { dsps: [], total: 0, syncedAt: new Date().toISOString() };
    }
  }

  /**
   * Verify local DSP catalog status
   *
   * ARCHITECTURE NOTE: DSPs are maintained locally. LabelGrid validates platform support
   * when releases are submitted for distribution. This method verifies local catalog integrity.
   */
  async verifyDSPCatalog(): Promise<{
    total: number;
    active: number;
    inactive: number;
  }> {
    try {
      const catalog = await this.getLocalDSPCatalog();
      const active = catalog.dsps.filter((d) => d.isActive).length;
      const inactive = catalog.dsps.filter((d) => !d.isActive).length;

      logger.info(
        `✅ DSP catalog verified: ${catalog.total} total, ${active} active, ${inactive} inactive`,
      );

      return {
        total: catalog.total,
        active,
        inactive,
      };
    } catch (error) {
      logger.warn({ err: error }, "Failed to verify DSP catalog:");
      return { total: 0, active: 0, inactive: 0 };
    }
  }


  /**
   * Retrieve all releases in the authenticated user's LabelGrid catalog.
   *
   * Uses GET /v1/releases (or the configured override) with the bearer token
   * already scoped to this user (scope: user.view-catalog).  No external artist
   * ID is required — the API returns every release distributed under this account.
   *
   * Optionally filter by DSP platform name (e?.g. 'spotify', 'apple_music') so
   * the caller can narrow the result without a client-side loop.
   */
  async getUserCatalog(platform?: string): Promise<LabelGridCatalogRelease[]> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "[LabelGrid] API not configured — getUserCatalog unavailable",
      );
      return [];
    }

    // LabelGrid's /releases list has no platform/DSP filter (confirmed
    // against the catalog-entity registry: release filters are label_id,
    // is_live, barcode_number, cat — no platform). Log-and-ignore rather
    // than silently mis-filtering or fabricating client-side filtering.
    if (platform) {
      logger.info(
        `[LabelGrid] getUserCatalog: platform filter "${platform}" ignored — /releases has no platform filter`,
      );
    }

    const endpoint = this.getEndpoint("getUserCatalog", ENTITIES.release.path);
    this.logApiCall("GET", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.get<Record<string, unknown> | LabelGridCatalogRelease[]>(
        endpoint,
        { per_page: 200 },
      ),
    );

    if ("error" in result) {
      this.logApiError("[LabelGrid] getUserCatalog failed (non-fatal)", result.error);
      return [];
    }

    const data = result.data;
    const releases: LabelGridCatalogRelease[] = Array.isArray(data)
      ? (data as LabelGridCatalogRelease[])
      : ((data?.data ?? data?.releases ?? data?.items ??
          []) as LabelGridCatalogRelease[]);

    logger.info(
      `[LabelGrid] getUserCatalog: ${releases.length} release(s) returned`,
    );
    return releases;
  }

  /**
   * Fetch a single release by its LabelGrid ID, with full track listing.
   * Returns null if the API is unconfigured or the endpoint fails.
   */
  async getReleaseDetail(
    releaseId: string,
  ): Promise<LabelGridCatalogRelease | null> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "[LabelGrid] API not configured — getReleaseDetail unavailable",
      );
      return null;
    }

    const endpoint = this.getEndpoint(
      "getReleaseDetail",
      `${ENTITIES.release.path}/:id`,
    ).replace(":id", encodeURIComponent(releaseId));
    this.logApiCall("GET", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.get<LabelGridCatalogRelease>(endpoint),
    );

    if ("error" in result) {
      this.logApiError(
        `[LabelGrid] getReleaseDetail failed for ${releaseId}`,
        result.error,
      );
      return null;
    }
    return result.data ?? null;
  }

  /**
   * Generic paginated-list unwrapper. There is no live LabelGrid token to
   * observe the real list-envelope shape against, so this checks the common
   * REST wrapper-key conventions in priority order and falls back to an
   * empty list rather than guessing a single shape and silently dropping
   * every result if that guess is wrong.
   */
  private static extractList<T = Record<string, unknown>>(data: unknown): T[] {
    if (Array.isArray(data)) return data as T[];
    const obj = data as Record<string, unknown> | null | undefined;
    const candidate =
      obj?.data ??
      obj?.items ??
      obj?.results ??
      obj?.releases ??
      obj?.labels ??
      obj?.artists ??
      obj?.genres ??
      obj?.statements ??
      obj?.outlets ??
      obj?.deliveries;
    return Array.isArray(candidate) ? (candidate as T[]) : [];
  }

  private static normalizeReleaseStatus(
    raw: string,
  ): LabelGridReleaseResponse["status"] {
    const known: LabelGridReleaseResponse["status"][] = [
      "draft",
      "not_submitted",
      "processing",
      "live",
      "failed",
    ];
    return (known as string[]).includes(raw)
      ? (raw as LabelGridReleaseResponse["status"])
      : "unknown";
  }

  private static normalizeOutletStatus(
    raw: string,
  ): LabelGridPlatformStatus["status"] {
    const known: LabelGridPlatformStatus["status"][] = [
      "draft",
      "not_submitted",
      "queued",
      "pending",
      "processing",
      "submitted",
      "accepted",
      "success",
      "delivered",
      "live",
      "failed",
      "rejected",
      "unsupported",
      "not_supported",
      "not_configured",
      "error",
    ];
    return (known as string[]).includes(raw)
      ? (raw as LabelGridPlatformStatus["status"])
      : "unknown";
  }

  /**
   * Parses GET /releases/:id/delivery-status into per-outlet statuses. Field
   * names are defensive best-effort (outlet/platform/store/name,
   * status/state, live_date/liveDate, error/error_message) since there is no
   * live token to confirm the exact response shape against.
   */
  private static parseDeliveryStatusOutlets(
    data: unknown,
  ): LabelGridPlatformStatus[] {
    const list = LabelGridService.extractList<Record<string, unknown>>(data);
    return list.map((entry) => {
      const platform = String(
        entry.outlet ?? entry.platform ?? entry.store ?? entry.name ?? "unknown",
      );
      const rawStatus = String(
        entry.status ?? entry.state ?? "unknown",
      ).toLowerCase();
      return {
        platform,
        status: LabelGridService.normalizeOutletStatus(rawStatus),
        rawStatus,
        observedAt: new Date().toISOString(),
        liveDate:
          (entry.live_date as string) || (entry.liveDate as string) || undefined,
        errorMessage:
          (entry.error as string) ||
          (entry.error_message as string) ||
          (entry.errorMessage as string) ||
          undefined,
      } satisfies LabelGridPlatformStatus;
    });
  }

  /**
   * LabelGrid's real POST /tracks requires composition_type, audio_ai_usage,
   * composition_ai_usage, recording_country and contributors on every track,
   * plus artwork_ai_usage on the release — legally material declarations
   * (AI-involvement disclosure, recording jurisdiction, songwriter/performer
   * credits) this app's schema does not capture anywhere today. Fabricating
   * a default (guessing "original" or "US") would put a false compliance
   * declaration on a real distributor submission, so createRelease refuses
   * up front — before any LabelGrid label/artist/release/track is created —
   * rather than fail midway through with a half-created release LabelGrid
   * would reject anyway. Checking the actual fields (rather than throwing
   * unconditionally) means this starts working automatically the moment the
   * app captures real values for them, with no further changes needed here.
   */
  private assertTrackComplianceDataAvailable(
    releaseData: LabelGridRelease,
  ): void {
    if (!releaseData.tracks || releaseData.tracks.length === 0) {
      throw new Error(
        "LabelGrid release blocked: at least one track is required.",
      );
    }
    const missing = new Set<string>();
    if (!releaseData.artworkAiUsage) {
      missing.add(
        "artwork_ai_usage (AI-involvement disclosure for the cover art)",
      );
    }
    for (const track of releaseData.tracks) {
      if (!track.compositionType) {
        missing.add("composition_type (original / cover / remix / sample-based)");
      }
      if (!track.audioAiUsage) {
        missing.add("audio_ai_usage (AI-involvement disclosure for the recording)");
      }
      if (!track.compositionAiUsage) {
        missing.add(
          "composition_ai_usage (AI-involvement disclosure for the composition)",
        );
      }
      if (!track.recordingCountry) {
        missing.add("recording_country (ISO 3166-1 alpha-2 country of recording)");
      }
      if (!track.contributors || track.contributors.length === 0) {
        missing.add("contributors (songwriters/performers with roles)");
      }
    }
    if (missing.size > 0) {
      throw new Error(
        "LabelGrid release blocked: this app does not yet collect required compliance fields that " +
          "LabelGrid's real API requires on every release/track — " +
          `${Array.from(missing).join("; ")}. ` +
          "These are legally material declarations and cannot be defaulted or guessed. Populate them " +
          "on the release/tracks before distribution can go through LabelGrid.",
      );
    }
  }

  /**
   * Finds an existing label by exact (case-insensitive) name, or creates
   * one. /labels has no documented name filter, so this lists and matches
   * client-side rather than guessing at an unsupported query param.
   */
  private async resolveOrCreateLabel(
    labelName: string,
    contactEmail: string,
  ): Promise<number> {
    const trimmedName = labelName.trim();
    const listResult = await this.callWithRetry(() =>
      this.client.get<unknown>(ENTITIES.label.path, { per_page: 100 }),
    );
    if (!("error" in listResult)) {
      const labels = LabelGridService.extractList<{
        id?: number;
        name?: string;
      }>(listResult.data);
      const match = labels.find(
        (l) =>
          typeof l.name === "string" &&
          l.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      );
      if (match && typeof match.id === "number") return match.id;
    } else {
      this.logApiError(
        "[LabelGrid] resolveOrCreateLabel: list failed, attempting create anyway",
        listResult.error,
      );
    }

    const createResult = await this.callWithRetry(() =>
      this.client.post<{ id: number }>(ENTITIES.label.path, {
        name: trimmedName,
        default_email: contactEmail,
      }),
      0,
    );
    const created = this.unwrap(
      `[LabelGrid] failed to create label "${trimmedName}"`,
      createResult,
    );
    if (typeof created?.id !== "number") {
      throw new Error(
        `LabelGrid release blocked: label "${trimmedName}" was created but the API returned no id.`,
      );
    }
    return created.id;
  }

  /**
   * Finds an existing artist by exact (case-insensitive) artist_name, or
   * creates one. Filters server-side by artist_name first, then re-matches
   * client-side in case the server filter is a fuzzy/substring match.
   */
  private async resolveOrCreateArtist(artistName: string): Promise<number> {
    const trimmedName = artistName.trim();
    const listResult = await this.callWithRetry(() =>
      this.client.get<unknown>(ENTITIES.artist.path, {
        per_page: 100,
        filter: { artist_name: trimmedName },
      }),
    );
    if (!("error" in listResult)) {
      const artists = LabelGridService.extractList<{
        id?: number;
        artist_name?: string;
      }>(listResult.data);
      const match = artists.find(
        (a) =>
          typeof a.artist_name === "string" &&
          a.artist_name.trim().toLowerCase() === trimmedName.toLowerCase(),
      );
      if (match && typeof match.id === "number") return match.id;
    } else {
      this.logApiError(
        "[LabelGrid] resolveOrCreateArtist: list failed, attempting create anyway",
        listResult.error,
      );
    }

    const createResult = await this.callWithRetry(() =>
      this.client.post<{ id: number }>(ENTITIES.artist.path, {
        artist_name: trimmedName,
      }),
      0,
    );
    const created = this.unwrap(
      `[LabelGrid] failed to create artist "${trimmedName}"`,
      createResult,
    );
    if (typeof created?.id !== "number") {
      throw new Error(
        `LabelGrid release blocked: artist "${trimmedName}" was created but the API returned no id.`,
      );
    }
    return created.id;
  }

  /**
   * Fuzzy-matches a free-text genre string against LabelGrid's real genre
   * taxonomy (GET /genres — reference data, not one of the 6 catalog
   * entities, so it has no ENTITIES registry entry of its own). Returns null
   * rather than fabricating an id when nothing matches.
   */
  private async resolveGenreId(genreName: string): Promise<number | null> {
    const trimmed = genreName.trim();
    if (!trimmed) return null;

    const endpoint = this.getEndpoint("listGenres", "/genres");
    const result = await this.callWithRetry(() =>
      this.client.get<unknown>(endpoint, { per_page: 500 }),
    );
    if ("error" in result) {
      this.logApiError("[LabelGrid] resolveGenreId: list failed", result.error);
      return null;
    }

    const genres = LabelGridService.extractList<{ id?: number; name?: string }>(
      result.data,
    );
    const lower = trimmed.toLowerCase();
    const exact = genres.find(
      (g) => typeof g.name === "string" && g.name.trim().toLowerCase() === lower,
    );
    if (exact && typeof exact.id === "number") return exact.id;

    const partial = genres.find(
      (g) =>
        typeof g.name === "string" &&
        (g.name.toLowerCase().includes(lower) ||
          lower.includes(g.name.toLowerCase())),
    );
    return partial && typeof partial.id === "number" ? partial.id : null;
  }

  /**
   * Downloads a remote asset URL to a local temp file. assertAllowedExtension
   * + uploadViaPresignedUrl both require a real local path — they resolve
   * symlinks and stream from disk — @labelgrid/core has no in-memory-buffer
   * or remote-URL upload path.
   */
  private async downloadToTempFile(
    url: string,
    dir: string,
    fallbackExt: string,
  ): Promise<string> {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(
        `LabelGrid release blocked: could not download asset from ${url} (HTTP ${res.status}).`,
      );
    }
    const urlExt = (() => {
      try {
        const pathname = new URL(url).pathname;
        const dot = pathname.lastIndexOf(".");
        return dot >= 0 ? pathname.slice(dot) : "";
      } catch {
        return "";
      }
    })();
    const filePath = join(dir, `asset_${Date.now()}${urlExt || fallbackExt}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(filePath, buffer);
    return filePath;
  }

  async createRelease(
    releaseData: LabelGridRelease,
    checkpoint?: (data: Record<string, unknown>) => Promise<void>,
  ): Promise<LabelGridReleaseResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      throw new Error("LabelGrid distribution is not configured; no release was submitted.");
    }

    // Refuse up front — before creating any LabelGrid label/artist/release —
    // rather than fail midway through with a half-created release LabelGrid
    // would reject anyway once a track-create call is attempted.
    this.assertTrackComplianceDataAvailable(releaseData);

    const genreId = await this.resolveGenreId(releaseData.genre);
    if (genreId === null) {
      throw new Error(
        `LabelGrid release blocked: could not match genre "${releaseData.genre}" to a LabelGrid genre. ` +
          "Use a genre name that matches LabelGrid's taxonomy and retry.",
      );
    }

    const labelName =
      releaseData.label?.trim() || `${releaseData.artist} (Independent)`;
    const labelEmail = releaseData.labelContactEmail?.trim();
    if (!labelEmail) {
      throw new Error(
        "LabelGrid release blocked: a label contact email is required to create the label entity on " +
          "LabelGrid, and none is available for this account.",
      );
    }

    const labelId = await this.resolveOrCreateLabel(labelName, labelEmail);
    const artistId = await this.resolveOrCreateArtist(releaseData.artist);

    const createReleaseEndpoint = this.getEndpoint(
      "createRelease",
      ENTITIES.release.path,
    );
    this.logApiCall("POST", createReleaseEndpoint, { title: releaseData.title });

    const releaseResult = await this.callWithRetry(() =>
      this.client.post<{ id: number }>(createReleaseEndpoint, {
        content_type: "single",
        label_id: labelId,
        artists: [{ artist_id: artistId }],
        titles: { title: releaseData.title },
        cat: `MB${Date.now()}`,
        artwork_ai_usage: releaseData.artworkAiUsage,
        primary_genre_id: genreId,
        release_date: releaseData.releaseDate,
        upc: releaseData.upc,
        copyright_year: releaseData.copyrightYear,
        copyright_line: releaseData.copyrightOwner
          ? `℗ ${releaseData.copyrightYear} ${releaseData.copyrightOwner}`
          : undefined,
      }),
      0, // Do not repeat remote creation after an ambiguous transport failure.
    );
    const createdRelease = this.unwrap(
      "[LabelGrid] createRelease: release create failed",
      releaseResult,
    );
    const releaseId = createdRelease?.id;
    if (typeof releaseId !== "number") {
      throw new Error(
        "LabelGrid release blocked: release was created but the API returned no id.",
      );
    }
    await checkpoint?.({ remoteReleaseId: String(releaseId), stage: "created" });

    const tempDir = await mkdtemp(join(tmpdir(), "labelgrid-"));
    try {
      // Cover art — multipart, not presigned (matches LabelGrid's own upload tool).
      if (releaseData.artwork) {
        const artworkPath = await this.downloadToTempFile(
          releaseData.artwork,
          tempDir,
          ".jpg",
        );
        const artworkExt = assertAllowedExtension(artworkPath, [
          ".jpg",
          ".jpeg",
          ".png",
          ".webp",
          ".tif",
          ".tiff",
        ]);
        if ("error" in artworkExt) {
          throw new Error(
            `LabelGrid release blocked: cover art rejected — ${artworkExt.error.message}`,
          );
        }
        const artworkUploadResult = await this.callWithRetry(() =>
          this.client.postMultipart(
            `${ENTITIES.release.path}/${releaseId}/photo`,
            artworkExt.realPath,
            "file",
          ),
        );
        this.unwrap(
          `[LabelGrid] createRelease: cover art upload failed for release ${releaseId}`,
          artworkUploadResult,
        );
      }

      for (const [idx, track] of releaseData.tracks.entries()) {
        const trackCreateResult = await this.callWithRetry(() =>
          this.client.post<{ id: number }>(ENTITIES.track.path, {
            release_id: releaseId,
            disc: 1,
            track_num: track.trackNumber || idx + 1,
            titles: { title: track.title },
            isrc: track.isrc,
            explicit: !!track.explicit,
            composition_type: track.compositionType,
            audio_ai_usage: track.audioAiUsage,
            composition_ai_usage: track.compositionAiUsage,
            commercial_samples: [],
            audio_language: "en",
            contributors: track.contributors,
            recording_country: track.recordingCountry,
          }),
          0,
        );
        const createdTrack = this.unwrap(
          `[LabelGrid] createRelease: track create failed for "${track.title}"`,
          trackCreateResult,
        );
        const trackId = createdTrack?.id;
        if (typeof trackId !== "number") {
          throw new Error(
            `LabelGrid release blocked: track "${track.title}" was created but the API returned no id.`,
          );
        }
        await checkpoint?.({ [`track${idx}`]: { remoteTrackId: String(trackId), stage: "created" } });

        if (track.audioFile) {
          const audioPath = await this.downloadToTempFile(
            track.audioFile,
            tempDir,
            ".wav",
          );
          const audioExt = assertAllowedExtension(audioPath, [
            ".wav",
            ".flac",
            ".aif",
            ".aiff",
          ]);
          if ("error" in audioExt) {
            throw new Error(
              `LabelGrid release blocked: audio for track "${track.title}" rejected — ${audioExt.error.message}`,
            );
          }
          const uploadResult = await uploadViaPresignedUrl(this.client, {
            uploadUrlPath: `${ENTITIES.track.path}/${trackId}/files/stereo/upload-url`,
            commitPath: `${ENTITIES.track.path}/${trackId}/files/stereo`,
            filePath: audioExt.realPath,
          });
          this.unwrap(
            `[LabelGrid] createRelease: audio upload failed for track "${track.title}"`,
            uploadResult,
          );
        }
      }

      // Non-fatal: surface validation problems in logs, but let the caller
      // decide whether to proceed (the release itself already exists).
      const validateResult = await this.callWithRetry(() =>
        this.client.post<{ errors?: unknown }>(
          `${ENTITIES.release.path}/${releaseId}/validate`,
        ),
      );
      if ("error" in validateResult) {
        throw new Error(`LabelGrid validation failed for remote release ${releaseId}; reconcile before retrying.`);
      } else if (validateResult.data?.errors) {
        if (Array.isArray(validateResult.data.errors) ? validateResult.data.errors.length > 0 : Object.keys(validateResult.data.errors).length > 0) {
          throw new Error(`LabelGrid remote release ${releaseId} has unresolved validation issues; distribution was not requested.`);
        }
      }

      const distributeResult = await this.callWithRetry(() =>
        this.client.post<unknown>(
          `${ENTITIES.release.path}/${releaseId}/distribute`,
        ),
        0,
      );
      this.unwrap(
        `[LabelGrid] createRelease: distribute failed for release ${releaseId}`,
        distributeResult,
      );
      await checkpoint?.({ remoteReleaseId: String(releaseId), stage: "submitted" });

      // Real per-outlet status, not a fabricated "processing" for every
      // requested platform: distribute has no outlet-selection parameter
      // (LabelGrid delivers to whatever outlets the account/label is
      // configured for), so the app's requested platform list may not match
      // 1:1 with what LabelGrid actually attempts.
      const statusResult = await this.callWithRetry(() =>
        this.client.get<unknown>(
          `${ENTITIES.release.path}/${releaseId}/delivery-status`,
        ),
      );
      const realPlatforms =
        "error" in statusResult
          ? []
          : LabelGridService.parseDeliveryStatusOutlets(statusResult.data);

      logger.info(
        { releaseId },
        "LabelGrid release created and submitted for distribution",
      );

      return {
        releaseId: String(releaseId),
        status: "processing",
        submittedAt: new Date().toISOString(),
        deliveryEvidence: { source: "labelgrid", observedAt: new Date().toISOString(), available: !("error" in statusResult) },
        platforms:
          realPlatforms.length > 0
            ? realPlatforms
            : releaseData.platforms.map((platform) => ({
                platform,
                 status: "unknown" as const,
              })),
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async getReleaseStatus(releaseId: string): Promise<LabelGridReleaseResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      throw new Error("LabelGrid delivery status is unavailable because the provider is not configured");
    }

    const endpoint = this.getEndpoint(
      "getReleaseStatus",
      `${ENTITIES.release.path}/:id/delivery-status`,
    ).replace(":id", encodeURIComponent(releaseId));
    this.logApiCall("GET", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.get<unknown>(endpoint),
    );
    const data = this.unwrap(
      `[LabelGrid] getReleaseStatus failed for ${releaseId}`,
      result,
    );
    const obj = (data as Record<string, unknown>) || {};

    return {
      releaseId,
      status: LabelGridService.normalizeReleaseStatus(
        String(obj.status ?? obj.overall_status ?? "unknown").toLowerCase(),
      ),
      submittedAt: (obj.submitted_at as string) || undefined,
      deliveryEvidence: { source: "labelgrid", observedAt: new Date().toISOString(), available: true },
      estimatedLiveDate: (obj.estimated_live_date as string) || undefined,
      platforms: LabelGridService.parseDeliveryStatusOutlets(obj),
    };
  }

  /**
   * LabelGrid exposes no ISRC-generation endpoint (confirmed against the
   * full public API surface) — there is nothing real to call here. Both real
   * call sites in distribution.ts already catch this and fall back to the
   * app's internal generator.
   */
  async generateISRC(
    _artist: string,
    _title: string,
  ): Promise<LabelGridCodeResponse> {
    throw new Error(
      "LabelGrid does not expose an ISRC-generation endpoint — there is no real API to call. " +
        "Falling back to the internal generator.",
    );
  }

  /** See generateISRC — same situation, no real UPC-generation endpoint exists. */
  async generateUPC(_releaseTitle: string): Promise<LabelGridCodeResponse> {
    throw new Error(
      "LabelGrid does not expose a UPC-generation endpoint — there is no real API to call. " +
        "Falling back to the internal generator.",
    );
  }

  /**
   * Best-effort numeric extraction from an analytics metric payload. The
   * exact per-metric response shape is unconfirmed (no live token to observe
   * it against) — the summary endpoint could return a bare total, a
   * {total} object, or a per-day/per-platform array of rows to sum. This
   * tries each in order rather than assuming one and silently returning 0.
   */
  private static sumMetric(value: unknown): number {
    if (typeof value === "number") return value;
    if (Array.isArray(value)) {
      return value.reduce((sum: number, row: unknown) => {
        const r = row as Record<string, unknown>;
        const n = Number(r?.count ?? r?.value ?? r?.streams ?? r?.total ?? 0);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
    }
    const obj = value as Record<string, unknown> | null | undefined;
    const n = Number(obj?.total ?? obj?.count ?? obj?.value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Shared real-data fetch behind getReleaseAnalytics/getArtistAnalytics.
   * Uses GET /analytics/summary for streams (30-day window, well under the
   * 400-day/12-metric-per-request limits) and GET /royalties/breakdown for
   * revenue — two separate real endpoints, since summary has no revenue
   * metric and breakdown has no listener/stream counts. `platforms` is
   * intentionally left empty: neither endpoint returns a reliable per-outlet
   * split here (summary's `platform` is a request-time FILTER, not a
   * response breakdown), and fabricating one would misrepresent real numbers.
   */
  private async fetchLabelGridAnalytics(
    summaryFilter: Record<string, unknown>,
    breakdownFilter: Record<string, unknown>,
  ): Promise<Omit<LabelGridAnalytics, "releaseId">> {
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const summaryResult = await this.callWithRetry(() =>
      this.client.get<Record<string, unknown>>("/analytics/summary", {
        filter: { start_date: startDate, end_date: endDate, ...summaryFilter },
        metrics: ["streams", "track-streams-daily"],
      }),
    );
    let summaryData: Record<string, unknown> = {};
    if ("error" in summaryResult) {
      this.logApiError("[LabelGrid] analytics summary failed", summaryResult.error);
    } else {
      summaryData = summaryResult.data || {};
    }

    const breakdownResult = await this.callWithRetry(() =>
      this.client.get<unknown>("/royalties/breakdown", {
        group_by: "period",
        filter: breakdownFilter,
      }),
    );
    let breakdownRows: Record<string, unknown>[] = [];
    if ("error" in breakdownResult) {
      this.logApiError(
        "[LabelGrid] royalty breakdown failed",
        breakdownResult.error,
      );
    } else {
      breakdownRows = LabelGridService.extractList<Record<string, unknown>>(
        breakdownResult.data,
      );
    }

    const totalRevenue = breakdownRows.reduce((sum, row) => {
      const n = Number(row.revenue ?? row.amount ?? row.total ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    const dailyRows = LabelGridService.extractList<Record<string, unknown>>(
      summaryData["track-streams-daily"],
    );

    return {
      totalStreams: LabelGridService.sumMetric(summaryData.streams),
      totalRevenue,
      platforms: {},
      timeline: dailyRows.map((row) => ({
        date: String(row.date ?? row.day ?? ""),
        streams: Number(row.streams ?? row.count ?? 0) || 0,
        revenue: 0,
      })),
    };
  }

  async getReleaseAnalytics(releaseId: string): Promise<LabelGridAnalytics> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated analytics",
      );
      return this.simulateGetReleaseAnalytics(releaseId);
    }

    const numericId = Number(releaseId);
    const filter = Number.isFinite(numericId)
      ? { release_id: numericId }
      : { upc: releaseId };

    this.logApiCall("GET", "/analytics/summary", { releaseId });
    const data = await this.fetchLabelGridAnalytics(filter, filter);
    return { releaseId, ...data };
  }

  async updateRelease(
    releaseId: string,
    updates: Partial<LabelGridRelease>,
  ): Promise<LabelGridReleaseResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return this.simulateUpdateRelease(releaseId, updates);
    }

    const endpoint = `${ENTITIES.release.path}/${encodeURIComponent(releaseId)}`;
    this.logApiCall("PATCH", endpoint, updates);

    // Only fields LabelGrid still allows to change post-submission — title,
    // release date, copyright line. Artwork/tracks/label/artist are locked
    // once a release has been distributed and are deliberately not sent.
    const patchBody: Record<string, unknown> = {};
    if (updates.title !== undefined) {
      patchBody.titles = { title: updates.title };
    }
    if (updates.releaseDate !== undefined) {
      patchBody.release_date = updates.releaseDate;
    }
    if (updates.copyrightYear !== undefined || updates.copyrightOwner !== undefined) {
      patchBody.copyright_line =
        updates.copyrightOwner && updates.copyrightYear
          ? `℗ ${updates.copyrightYear} ${updates.copyrightOwner}`
          : undefined;
    }
    if (Object.keys(patchBody).length === 0) {
      throw new Error(
        "LabelGrid release update blocked: none of the supplied fields (title, releaseDate, " +
          "copyrightYear/copyrightOwner) are editable post-submission on LabelGrid.",
      );
    }

    const result = await this.callWithRetry(() =>
      this.client.patch<{ id: number; status?: string }>(endpoint, patchBody),
    );
    const updated = this.unwrap(
      `[LabelGrid] updateRelease failed for ${releaseId}`,
      result,
    );

    logger.info({ releaseId }, "LabelGrid release updated successfully");

    return {
      releaseId,
      status: LabelGridService.normalizeReleaseStatus(
        String(updated?.status ?? "unknown").toLowerCase(),
      ),
      platforms: [],
    };
  }

  async takedownRelease(releaseId: string): Promise<{ success: boolean }> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return { success: true };
    }

    const endpoint = `${ENTITIES.release.path}/${encodeURIComponent(releaseId)}/takedown-all`;
    this.logApiCall("POST", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.post<unknown>(endpoint),
    );
    this.unwrap(`[LabelGrid] takedownRelease failed for ${releaseId}`, result);

    logger.info({ releaseId }, "LabelGrid release takedown initiated");
    return { success: true };
  }

  /**
   * LabelGrid's real API has no artist-ID-scoped analytics endpoint — the
   * closest real filter is /analytics/summary's artist_names (a name match,
   * not an id lookup), and /royalties/breakdown has no artist filter at all
   * (only label_id/release_id/isrc/upc/dates), so revenue here is
   * necessarily account-wide rather than scoped to this artist. This method
   * has no live caller in the app today; treating artistId as an artist name
   * is the most honest mapping onto what LabelGrid actually exposes.
   */
  async getArtistAnalytics(artistId: string): Promise<LabelGridAnalytics> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated analytics",
      );
      return this.simulateGetArtistAnalytics(artistId);
    }

    this.logApiCall("GET", "/analytics/summary", { artistId });
    const data = await this.fetchLabelGridAnalytics(
      { artist_names: [artistId] },
      {},
    );
    return { releaseId: artistId, ...data };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      // Fail closed: an unconfigured secret means we cannot verify the
      // signature, which must never be treated as "verified". Returning
      // true here would let anyone POST a forged LabelGrid webhook if
      // LABELGRID_WEBHOOK_SECRET were ever unset in production.
      logger.error(
        "⚠️  LabelGrid webhook secret not configured — rejecting webhook signature verification (fail closed)",
      );
      return false;
    }

    try {
      const expectedSignature = createHmac("sha256", this.webhookSecret)
        .update(payload)
        .digest("hex");

      const expectedBuf = Buffer.from(expectedSignature);
      const providedBuf = Buffer.from(signature);
      if (expectedBuf.length !== providedBuf.length) return false;
      return timingSafeEqual(providedBuf, expectedBuf);
    } catch (error: unknown) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "[LabelGrid] webhook signature verification failed",
      );
      return false;
    }
  }

  /**
   * The methods below (publishing metadata, sync licensing, content-ID
   * claims/revenue) were built against fictional `/v1/...` endpoints. There
   * is no publishing, sync-licensing, or content-ID surface anywhere in
   * LabelGrid's real public API (confirmed against the full documented tool
   * surface: account, reference, catalog, releases, insights, finance,
   * webhooks, distribution) — so rather than call made-up paths that would
   * 404, these now fail loudly and explicitly. Params are retained
   * unreferenced (prefixed `_`) to keep existing call-site signatures valid.
   */
  async setPublishingMetadata(
    _releaseId: string,
    _metadata: LabelGridPublishingMetadata,
  ): Promise<{ success: boolean; releaseId: string }> {
    throw new Error(
      "LabelGrid does not expose a publishing-metadata endpoint — there is no real API to call.",
    );
  }

  async getPublishingMetadata(
    _releaseId: string,
  ): Promise<LabelGridPublishingMetadata> {
    throw new Error(
      "LabelGrid does not expose a publishing-metadata endpoint — there is no real API to call.",
    );
  }

  async submitForSync(
    _releaseId: string,
    _data: { genres: string[]; moods: string[]; notes?: string },
  ): Promise<LabelGridSyncSubmission> {
    throw new Error(
      "LabelGrid does not expose a sync-licensing submission endpoint — there is no real API to call.",
    );
  }

  async getSyncOpportunities(_filters?: {
    genre?: string;
    minBudget?: number;
  }): Promise<LabelGridSyncOpportunity[]> {
    throw new Error(
      "LabelGrid does not expose a sync-licensing opportunities endpoint — there is no real API to call.",
    );
  }

  async updateSyncSubmission(
    _submissionId: string,
    _action: "accept" | "reject",
  ): Promise<LabelGridSyncSubmission> {
    throw new Error(
      "LabelGrid does not expose a sync-submission endpoint — there is no real API to call.",
    );
  }

  /**
   * Real surface: POST /releases/short-url (idempotent — creates or returns
   * the existing short URL for the release's landing page) plus
   * PUT /releases/{id}/landing-config to customize it. There is no field
   * anywhere for a custom slug/vanity URL, so a requested customSlug is
   * refused rather than silently ignored — silently returning LabelGrid's
   * auto-generated URL would misrepresent it as the caller's requested one.
   * `platforms` has no confirmed real mapping onto the landing-config
   * action-list shape, so it is logged and not applied; the short URL
   * itself is still real and functional.
   */
  async createSmartLink(
    releaseId: string,
    options?: { customSlug?: string; platforms?: string[] },
  ): Promise<LabelGridSmartLink> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return this.simulateCreateSmartLink(releaseId, options);
    }

    if (options?.customSlug) {
      throw new Error(
        "LabelGrid smart link blocked: LabelGrid does not support custom slugs/vanity URLs — " +
          "omit customSlug and use the auto-generated short URL.",
      );
    }
    const numericId = Number(releaseId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        `LabelGrid smart link blocked: releaseId "${releaseId}" is not a valid LabelGrid release id.`,
      );
    }
    if (options?.platforms?.length) {
      logger.warn(
        { releaseId, platforms: options.platforms },
        "[LabelGrid] createSmartLink: platform selection is not supported by LabelGrid's landing-config API — ignoring",
      );
    }

    const endpoint = "/releases/short-url";
    this.logApiCall("POST", endpoint, { releaseId });

    const result = await this.callWithRetry(() =>
      this.client.post<{ url?: string; short_url?: string }>(endpoint, {
        release_id: numericId,
      }),
    );
    const created = this.unwrap(
      `[LabelGrid] createSmartLink failed for release ${releaseId}`,
      result,
    );

    const url = String(created?.url ?? created?.short_url ?? "");
    logger.info({ releaseId, url }, "LabelGrid smart link created");

    return {
      id: releaseId,
      url,
      releaseId,
      platforms: [],
      clicks: 0,
    };
  }

  async getSmartLink(releaseId: string): Promise<LabelGridSmartLink> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return this.simulateGetSmartLink(releaseId);
    }

    const numericId = Number(releaseId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        `LabelGrid smart link blocked: releaseId "${releaseId}" is not a valid LabelGrid release id.`,
      );
    }

    const endpoint = `${ENTITIES.release.path}/${numericId}/landing-config`;
    this.logApiCall("GET", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.get<Record<string, unknown>>(endpoint),
    );
    const config = this.unwrap(
      `[LabelGrid] getSmartLink failed for release ${releaseId}`,
      result,
    );

    return {
      id: releaseId,
      url: String(config?.short_url ?? config?.url ?? ""),
      releaseId,
      platforms: [],
      clicks: 0,
    };
  }

  async getSmartLinkAnalytics(
    _linkId: string,
    _dateRange?: { start: string; end: string },
  ): Promise<LabelGridSmartLinkAnalytics> {
    throw new Error(
      "LabelGrid does not expose a smart-link analytics endpoint — there is no real API to call.",
    );
  }

  async createPreSaveCampaign(
    _releaseId: string,
    _startDate: string,
    _endDate?: string,
  ): Promise<LabelGridPreSave> {
    throw new Error(
      "LabelGrid does not expose a pre-save campaign endpoint — there is no real API to call.",
    );
  }

  async getPreSaveCampaign(_campaignId: string): Promise<LabelGridPreSave> {
    throw new Error(
      "LabelGrid does not expose a pre-save campaign endpoint — there is no real API to call.",
    );
  }

  async getPreSaveSubscribers(
    _campaignId: string,
    _limit?: number,
    _offset?: number,
  ): Promise<{ subscribers: LabelGridPreSaveSubscriber[]; total: number }> {
    throw new Error(
      "LabelGrid does not expose a pre-save campaign endpoint — there is no real API to call.",
    );
  }

  async submitContentClaim(
    _releaseId: string,
    _platforms: string[],
  ): Promise<LabelGridContentClaim[]> {
    throw new Error(
      "LabelGrid does not expose a content-ID claims endpoint — there is no real API to call.",
    );
  }

  async getContentClaims(
    _releaseId?: string,
  ): Promise<LabelGridContentClaim[]> {
    throw new Error(
      "LabelGrid does not expose a content-ID claims endpoint — there is no real API to call.",
    );
  }

  async getContentRevenue(_dateRange?: {
    start: string;
    end: string;
  }): Promise<LabelGridContentRevenue> {
    throw new Error(
      "LabelGrid does not expose a content-ID revenue endpoint — there is no real API to call.",
    );
  }

  async getRoyaltySummary(): Promise<LabelGridRoyaltySummary> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return this.simulateGetRoyaltySummary();
    }

    const endpoint = "/account";
    this.logApiCall("GET", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.get<Record<string, unknown>>(endpoint),
    );
    const account = this.unwrap(`[LabelGrid] getRoyaltySummary failed`, result);

    // Real field names for the balance/accounting-summary view are
    // unconfirmed without a live token — check the plausible snake_case
    // candidates rather than assume one and silently report 0 for the rest.
    const pending = Number(account?.pending_balance ?? account?.pending ?? 0);
    const available = Number(
      account?.available_balance ?? account?.balance ?? account?.available ?? 0,
    );
    const lifetime = Number(
      account?.lifetime_earnings ?? account?.lifetime_balance ?? account?.lifetime ?? 0,
    );

    return {
      pending: Number.isFinite(pending) ? pending : 0,
      available: Number.isFinite(available) ? available : 0,
      lifetime: Number.isFinite(lifetime) ? lifetime : 0,
      currency: String(account?.currency ?? "USD"),
    };
  }

  async getRoyaltyStatements(
    year?: number,
  ): Promise<LabelGridRoyaltyStatement[]> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return this.simulateGetRoyaltyStatements(year);
    }

    const endpoint = "/statements";
    const filter = year
      ? { start_date: `${year}-01-01`, end_date: `${year}-12-31` }
      : undefined;
    this.logApiCall("GET", endpoint, { year });

    const result = await this.callWithRetry(() =>
      this.client.get<unknown>(endpoint, { filter, per_page: 100 }),
    );
    const data = this.unwrap(
      `[LabelGrid] getRoyaltyStatements failed`,
      result,
    );
    const rows = LabelGridService.extractList<Record<string, unknown>>(data);

    return rows.map((row) => ({
      id: String(row.invoice_number ?? row.id ?? ""),
      period: String(row.period ?? row.statement_period ?? ""),
      amount: Number(row.total ?? row.amount ?? 0) || 0,
      status: LabelGridService.normalizeStatementStatus(row.status),
      pdfUrl: String(row.invoice_url ?? row.pdf_url ?? ""),
    }));
  }

  private static normalizeStatementStatus(
    value: unknown,
  ): "pending" | "paid" | "processing" {
    const s = String(value ?? "").toLowerCase();
    if (s === "paid" || s === "completed" || s === "settled") return "paid";
    if (s === "pending" || s === "due") return "pending";
    return "processing";
  }

  /**
   * LabelGrid's real API has no payout-request endpoint anywhere in its
   * documented surface (account/finance toolsets only expose balance and
   * statement READS) — payouts are handled outside the API entirely
   * (dashboard/manual). Both real call sites of this method already branch
   * on a thrown error whose message contains "not configured" or
   * "LABELGRID", so this preserves that contract instead of pretending
   * a request was submitted.
   */
  async requestPayout(
    amount: number,
    method?: "paypal" | "bank",
  ): Promise<LabelGridPayoutRequest> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "⚠️  LabelGrid not configured - returning simulated response",
      );
      return this.simulateRequestPayout(amount, method);
    }

    throw new Error(
      "LABELGRID payout requests are not configured: LabelGrid's API has no payout-request endpoint — " +
        "payouts must be requested from the LabelGrid dashboard directly.",
    );
  }

  /**
   * Search for an artist by name in the authenticated LabelGrid account's
   * own roster and return their platform presence.
   *
   * IMPORTANT: LabelGrid's public API has no cross-industry artist search —
   * this only finds artists already registered under this LabelGrid account
   * (GET /artists?filter[artist_name]=...). It returns null for any artist
   * not managed through this account, which is expected and non-fatal.
   */
  async searchArtistAcrossPlatforms(
    artistName: string,
  ): Promise<LabelGridArtistSearchResult | null> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn(
        "[LabelGrid] API not configured — artist cross-platform search unavailable",
      );
      return null;
    }

    const endpoint = "/artists";
    this.logApiCall("GET", endpoint, { "filter[artist_name]": artistName });

    const result = await this.callWithRetry(() =>
      this.client.get<{ data: Record<string, any>[] }>(endpoint, {
        "filter[artist_name]": artistName,
        per_page: 5,
      }),
    );
    if ("error" in result) {
      this.logApiError(
        "[LabelGrid] Artist search failed (non-fatal)",
        result.error,
      );
      return null;
    }

    const artists = result.data?.data ?? [];
    if (!artists.length) return null;

    // Pick the best match by name similarity
    const query = artistName.toLowerCase().trim();
    const best = artists.reduce((prev, curr) => {
      const prevSim = String(prev?.artist_name ?? "")
        .toLowerCase()
        .includes(query)
        ? 1
        : 0;
      const currSim = String(curr?.artist_name ?? "")
        .toLowerCase()
        .includes(query)
        ? 1
        : 0;
      return currSim > prevSim ? curr : prev;
    }, artists[0]);

    const platforms = buildLabelGridPlatformPresences(best);
    const searchResult: LabelGridArtistSearchResult = {
      id: String(best?.id),
      name: best?.artist_name ?? artistName,
      slug: best?.public_id ?? String(best?.id),
      imageUrl: undefined,
      genres: [],
      verified: false,
      platforms,
    };

    logger.info(
      `[LabelGrid] Artist search found: ${searchResult.name} — ${platforms.length} platform(s)`,
    );
    return searchResult;
  }

  /**
   * Get all platform presences for a LabelGrid artist ID. LabelGrid has no
   * dedicated /platforms sub-resource — DSP URLs and native platform IDs
   * live directly on the Artist object — so this fetches the artist record
   * itself (GET /artists/{artist}) and derives presences from it.
   */
  async getArtistPlatformPresence(
    labelGridArtistId: string,
  ): Promise<LabelGridArtistPlatformPresence[]> {
    await this.loadConfig();

    if (!this.isConfigured) return [];

    const endpoint = `/artists/${encodeURIComponent(labelGridArtistId)}`;
    this.logApiCall("GET", endpoint);

    const result = await this.callWithRetry(() =>
      this.client.get<Record<string, any>>(endpoint),
    );
    if ("error" in result) {
      this.logApiError(
        "[LabelGrid] Artist platform presence fetch failed (non-fatal)",
        result.error,
      );
      return [];
    }
    return buildLabelGridPlatformPresences(result.data ?? {});
  }

  /**
   * LabelGrid's public API has no artist-scoped release-listing endpoint
   * (confirmed against LabelGrid's own OpenAPI spec: GET /releases only
   * filters by is_live/label_id/barcode_number/cat — never by artist). There
   * is no real request this method can make, so it is a permanent, honest
   * no-op rather than calling a fictional path. Callers should rely on
   * direct platform API scanning for per-artist catalog data. (Zero callers
   * today; kept for API surface stability.)
   */
  async getArtistCatalog(
    artistExternalId: string,
    platform?: string,
  ): Promise<LabelGridCatalogRelease[]> {
    logger.info(
      `[LabelGrid] getArtistCatalog(${artistExternalId}${platform ? `, ${platform}` : ""}) — ` +
        "no-op: LabelGrid has no artist-scoped release-listing endpoint; " +
        "callers should fall back to direct platform API scanning.",
    );
    return [];
  }

  private simulateGetReleaseAnalytics(releaseId: string): LabelGridAnalytics {
    return {
      releaseId,
      totalStreams: 0,
      totalRevenue: 0,
      platforms: {},
      timeline: [],
    };
  }

  private simulateGetArtistAnalytics(artistId: string): LabelGridAnalytics {
    return {
      releaseId: artistId,
      totalStreams: 0,
      totalRevenue: 0,
      platforms: {},
      timeline: [],
    };
  }

  private simulateUpdateRelease(
    releaseId: string,
    _updates: Partial<LabelGridRelease>,
  ): LabelGridReleaseResponse {
    return {
      releaseId,
      status: "processing",
      submittedAt: new Date().toISOString(),
      platforms: [],
    };
  }

  private simulateCreateSmartLink(
    _releaseId: string,
    _options?: { customSlug?: string; platforms?: string[] },
  ): never {
    throw new Error(
      "LabelGrid not configured — smart link creation requires a connected distributor account. " +
        "Set LABELGRID_API_TOKEN to enable real smart links.",
    );
  }

  private simulateGetSmartLink(_linkId: string): never {
    throw new Error(
      "LabelGrid not configured — smart link lookup requires a connected distributor account.",
    );
  }

  private simulateGetRoyaltySummary(): LabelGridRoyaltySummary {
    return {
      pending: 0,
      available: 0,
      lifetime: 0,
      currency: "USD",
    };
  }

  private simulateGetRoyaltyStatements(
    _year?: number,
  ): LabelGridRoyaltyStatement[] {
    return [];
  }

  private simulateRequestPayout(
    _amount: number,
    _method?: "paypal" | "bank",
  ): never {
    throw new Error(
      "LabelGrid payout execution requires the authorized account holder's dashboard workflow. " +
        "An API token does not enable payout requests; this API has no supported payout execution endpoint.",
    );
  }
}

export const labelGridService = new LabelGridService();

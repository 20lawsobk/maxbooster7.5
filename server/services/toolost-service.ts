import { storage } from "../storage";
import { logger } from "../logger.js";
import { CircuitBreaker } from "../infrastructure/circuitBreaker";

/**
 * Too Lost's confirmed failure envelope is `{status:false, error:"..."}`;
 * field-level validation detail beyond that was never observed against a
 * live token, so this stays permissive — `code`/`field`/`errors` are
 * best-effort extras populated only when a response actually includes them.
 * Field names deliberately mirror LabelGrid's own ApiError shape so the
 * retry/circuit-breaker/unwrap layers below are a straight port.
 */
export interface ToolostApiError {
  message: string;
  status?: number;
  code?: string;
  field?: string;
  errors?: unknown;
  retry_after_seconds?: number;
}

export type ToolostApiResult<T> = { data: T } | { error: ToolostApiError };

/**
 * Internal error used to carry a structured ToolostApiError through a
 * throw/catch boundary so the circuit breaker (which only counts thrown
 * exceptions as failures) has something to count. Caught immediately inside
 * cbCall() and converted back into a plain ToolostApiResult before any
 * public method sees it. Mirrors LabelGridApiRejection exactly.
 */
class ToolostApiRejection extends Error {
  constructor(public readonly apiError: ToolostApiError) {
    super(apiError.message);
    this.name = "ToolostApiRejection";
  }
}

// ---------------------------------------------------------------------
// Public types — drop-in replacement for the LabelGrid* equivalents.
// Field shapes are kept identical wherever possible so every existing
// call site updates by a mechanical type-name rename, not a rewrite.
// ---------------------------------------------------------------------

export interface ToolostRelease {
  title: string;
  artist: string;
  releaseDate: string;
  upc?: string;
  tracks: ToolostTrack[];
  artwork: string;
  genre: string;
  platforms: string[];
  label?: string;
  copyrightYear?: number;
  copyrightOwner?: string;
  territoryMode?: "worldwide" | "include" | "exclude";
  territories?: string[];
  labelContactEmail?: string;
  /**
   * Too Lost release-level compliance field (AI-involvement disclosure for
   * the cover art). No current app data source — see
   * assertComplianceDataAvailable.
   */
  artworkAiUsage?: string;
}

export interface ToolostTrack {
  title: string;
  artist: string;
  isrc?: string;
  audioFile: string;
  duration: number;
  trackNumber: number;
  explicit?: boolean;
  lyrics?: string;
  /**
   * No confirmed Too Lost equivalent for LabelGrid's compositionType /
   * recordingCountry — omitted rather than guessed. audioAiUsage /
   * compositionAiUsage are kept (same free-form strings the app already
   * has no source for) and folded into Too Lost's single confirmed
   * `aiAssisted` boolean track field via describesAiInvolvement().
   */
  audioAiUsage?: string;
  compositionAiUsage?: string;
  contributors?: Array<Record<string, unknown>>;
}

export interface ToolostReleaseResponse {
  releaseId: string;
  status: "draft" | "not_submitted" | "processing" | "live" | "failed";
  submittedAt?: string;
  estimatedLiveDate?: string;
  platforms: ToolostPlatformStatus[];
}

export interface ToolostPlatformStatus {
  platform: string;
  status:
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
  errorMessage?: string;
}

export interface ToolostAnalytics {
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

export interface ToolostCodeResponse {
  code: string;
  type: "isrc" | "upc";
  assignedTo?: string;
  createdAt: string;
}

export interface ToolostPublishingMetadata {
  writers: string[];
  publishers: string[];
  ipi: string;
  pro: string;
}

export interface ToolostSyncOpportunity {
  id: string;
  title: string;
  brand: string;
  budget: number;
  deadline: string;
  genre: string;
  mood: string;
}

export interface ToolostSyncSubmission {
  id: string;
  releaseId: string;
  opportunityId: string;
  status: "pending" | "accepted" | "rejected" | "placed";
  notes?: string;
}

export interface ToolostSmartLink {
  id: string;
  url: string;
  releaseId: string;
  platforms: string[];
  customSlug?: string;
  clicks: number;
}

export interface ToolostSmartLinkAnalytics {
  clicks: number;
  platforms: Record<string, number>;
  countries: Record<string, number>;
}

export interface ToolostPreSave {
  id: string;
  releaseId: string;
  url: string;
  subscribers: number;
  startDate: string;
  endDate?: string;
  status: "draft" | "active" | "completed" | "cancelled";
}

export interface ToolostPreSaveSubscriber {
  email: string;
  platform: string;
  subscribedAt: string;
}

export interface ToolostContentClaim {
  id: string;
  releaseId: string;
  platform: string;
  videoId?: string;
  status: "pending" | "active" | "disputed" | "released";
  revenue: number;
}

export interface ToolostContentRevenue {
  total: number;
  byPlatform: Record<string, number>;
  byMonth: { month: string; amount: number }[];
}

export interface ToolostRoyaltySummary {
  pending: number;
  available: number;
  lifetime: number;
  currency: string;
}

export interface ToolostRoyaltyStatement {
  id: string;
  period: string;
  amount: number;
  status: "pending" | "paid" | "processing";
  pdfUrl: string;
}

export interface ToolostPayoutRequest {
  id: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  requestedAt: string;
  processedAt?: string;
}

export interface ToolostDSP {
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

export interface ToolostDSPListResponse {
  dsps: ToolostDSP[];
  total: number;
  syncedAt: string;
}

export interface ToolostArtistPlatformPresence {
  platform: string;
  platformLabel: string;
  artistId: string | null;
  artistUrl: string | null;
  status: "live" | "pending" | "processing" | "not_found" | "error";
  liveAt?: string;
}

export interface ToolostArtistSearchResult {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  genres: string[];
  verified: boolean;
  platforms: ToolostArtistPlatformPresence[];
}

export interface ToolostCatalogTrack {
  title: string;
  isrc?: string;
  trackNumber: number;
  duration: number;
}

export interface ToolostCatalogRelease {
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
  tracks?: ToolostCatalogTrack[];
}

// ---------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------

/**
 * Too Lost's track payload wants a single `aiAssisted` boolean rather than
 * LabelGrid's separate free-form audio/composition disclosure strings. Any
 * present value other than an obvious "no AI" answer is treated as true —
 * this only ever runs on a value the caller already supplied (never a
 * default), so it narrows an existing disclosure rather than inventing one.
 */
function describesAiInvolvement(value?: string): boolean {
  if (!value) return false;
  const s = value.trim().toLowerCase();
  if (!s) return false;
  return !["none", "original", "no", "human", "n/a", "na"].includes(s);
}

/**
 * INFERRED sub-shape: Too Lost's real "participant" object fields were not
 * confirmed against a live token beyond the field's existence on release
 * and track payloads. `{name, role}` is the most standard shape across
 * DDEX-adjacent distribution APIs. A wrong guess here fails loudly (a 422
 * with validation detail Too Lost returns), not silently — verify against
 * a real sandbox call once TOOLOST_CLIENT_ID/SECRET are live.
 */
function buildToolostParticipant(
  name: string,
  role: string,
): { name: string; role: string } {
  return { name, role };
}

class ToolostService {
  private readonly userId?: string;
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private environment: "production" | "sandbox";
  private baseUrl: string;
  private authBaseUrl: string;
  private tokenUrl: string;
  private circuitBreaker: CircuitBreaker;
  private maxRetries: number = 3;
  private baseDelay: number = 1000;

  /** In-memory cache of this user's OAuth connection, used only for
   * the synchronous isApiConfigured() advisory check. Every real API call
   * independently calls ensureValidToken(), which re-reads the database if
   * this is still empty — closing the boot-time race where a connection
   * exists in the DB before this fire-and-forget load resolves. */
  private connection: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  } | null = null;
  constructor(userId?: string) {
    this.userId = userId;
    this.clientId = process.env.TOOLOST_CLIENT_ID;
    this.environment =
      process.env.TOOLOST_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
    this.clientSecret =
      this.environment === "sandbox"
        ? process.env.TOOLOST_SANDBOX_CLIENT_SECRET ??
          process.env.TOOLOST_CLIENT_SECRET
        : process.env.TOOLOST_CLIENT_SECRET;
    this.baseUrl =
      this.environment === "sandbox"
        ? "https://api-sandbox.toolost.com/v1"
        : "https://api.toolost.com/v1";
    // Too Lost exposes a separate browser OAuth host for sandbox credentials.
    // This is intentionally different from the sandbox API host above:
    // API requests use api-sandbox.toolost.com, while authorization and token
    // exchange use sandbox.toolost.com/oauth.
    this.authBaseUrl =
      this.environment === "sandbox"
        ? "https://sandbox.toolost.com/oauth"
        : "https://toolost.com/oauth";
    this.tokenUrl =
      this.environment === "sandbox"
        ? "https://sandbox.toolost.com/oauth/token"
        : "https://toolost.com/oauth/token";

    this.circuitBreaker = new CircuitBreaker("toolost-api", {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      resetTimeout: 60000,
    });

    if (!this.clientId || !this.clientSecret) {
      logger.warn(
          "⚠️  Too Lost OAuth app credentials not configured (TOOLOST_CLIENT_ID / TOOLOST_CLIENT_SECRET). " +
          "Distribution features are unavailable until the user completes the Too Lost OAuth connect flow.",
      );
    }

    if (this.userId) {
      // Fire-and-forget, while ensureValidToken() still re-reads the database
      // when this load has not completed yet.
      this.loadConnection();
    }
  }

  private async loadConnection(): Promise<void> {
    if (!this.userId) return;
    try {
      const row = await storage.getToolostConnection(this.userId);
      if (row) {
        this.connection = {
          accessToken: row.accessToken,
          refreshToken: row.refreshToken,
          expiresAt: row.tokenExpiresAt
            ? new Date(row.tokenExpiresAt).getTime()
            : 0,
        };
      }
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to load Too Lost connection from database",
      );
    }
  }

  /**
   * Returns a service instance whose access token and refresh-token writes are
   * scoped to one authenticated Max Booster user. The exported singleton is
   * intentionally unscoped and may only be used for app-level OAuth URL
   * generation.
   */
  forUser(userId: string): ToolostService {
    if (!userId?.trim()) {
      throw new Error("A user ID is required for Too Lost operations.");
    }
    return new ToolostService(userId);
  }

  /**
   * Synchronous, matches LabelGridService.isApiConfigured()'s contract so
   * every existing call site keeps working unmodified. This is a fast
   * advisory check only, reflecting whatever loadConnection()/refresh last
   * cached — not a live DB read. Real API methods independently verify via
   * ensureValidToken() before use.
   */
  isApiConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.connection);
  }

  isOAuthConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Builds the Too Lost authorization URL for the platform-level distributor
   * connection. Client-credentials tokens authenticate the OAuth application
   * only; catalog and distribution endpoints require this user-authorized
   * grant.
   */
  getOAuthAuthorizationUrl(redirectUri: string, state: string): string {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Too Lost OAuth app credentials are not configured (TOOLOST_CLIENT_ID / TOOLOST_CLIENT_SECRET).",
      );
    }
    const url = new URL(`${this.authBaseUrl}/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set(
      "scope",
      [
        "read:profile",
        "read:releases",
        "write:releases",
        "read:catalog",
        "read:analytics",
        "read:earnings",
      ].join(" "),
    );
    return url.toString();
  }

  /**
   * Exchanges a browser authorization code and persists the connection for
   * the authenticated user that initiated the flow.
   */
  async exchangeOAuthCode(
    code: string,
    redirectUri: string,
  ): Promise<{ expiresAt: Date; scope?: string }> {
    if (!this.userId) {
      throw new Error(
        "Too Lost OAuth code exchange requires an authenticated user.",
      );
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Too Lost OAuth app credentials are not configured (TOOLOST_CLIENT_ID / TOOLOST_CLIENT_SECRET).",
      );
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Preserve the provider status below with a bounded body excerpt.
    }
    if (!res.ok) {
      const providerMessage =
        typeof json.error_description === "string"
          ? json.error_description
          : typeof json.message === "string"
            ? json.message
            : text.slice(0, 300);
      throw new Error(
        `Too Lost OAuth code exchange failed (HTTP ${res.status}): ${providerMessage || "unknown provider error"}`,
      );
    }

    const accessToken =
      typeof json.access_token === "string" ? json.access_token : "";
    const refreshToken =
      typeof json.refresh_token === "string" ? json.refresh_token : "";
    if (!accessToken || !refreshToken) {
      throw new Error(
        "Too Lost OAuth code exchange returned no access_token and refresh_token pair.",
      );
    }
    const expiresIn =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in
        : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const scope = typeof json.scope === "string" ? json.scope : undefined;

    this.connection = {
      accessToken,
      refreshToken,
      expiresAt: expiresAt.getTime(),
    };
    await storage.upsertToolostConnection({
      accessToken,
      refreshToken,
      tokenExpiresAt: expiresAt,
      scope,
      environment: this.environment,
      connectedByUserId: this.userId,
    });
    logger.info("✅ Too Lost OAuth connection established");
    return { expiresAt, scope };
  }

  /**
   * Ensures a valid, non-expired access token before a real API call.
   * Refreshes proactively when the token expires within 60s. Throws a
   * clear, distinguishable error when no user connection exists
   * or the refresh token itself has been revoked — a genuine "an admin
   * must reconnect Too Lost" state, never silently defaulted.
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.userId) {
      throw new Error(
        "Too Lost operations require an authenticated user connection.",
      );
    }
    if (!this.connection) {
      // Covers both "constructor's fire-and-forget load hasn't resolved
      // yet" and "a connection was created after the constructor ran"
      // (e.g. an admin just finished the OAuth flow).
      await this.loadConnection();
    }
    if (!this.connection) {
      throw new Error(
        "Too Lost is not connected: this user has no OAuth connection. " +
          "Connect Too Lost from the Distribution page before using distribution features.",
      );
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Too Lost OAuth app credentials are not configured (TOOLOST_CLIENT_ID / TOOLOST_CLIENT_SECRET).",
      );
    }

    const expiresInMs = this.connection.expiresAt - Date.now();
    if (expiresInMs > 60_000) {
      return this.connection.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.connection.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Too Lost is not connected: token refresh failed (HTTP ${res.status}) — ` +
          `this user's connection needs to be re-established via the OAuth connect flow. ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
    const refreshToken = json.refresh_token ?? this.connection.refreshToken;
    this.connection = {
      accessToken: json.access_token,
      refreshToken,
      expiresAt,
    };
    await storage
      .upsertToolostConnection({
        accessToken: json.access_token,
        refreshToken,
        tokenExpiresAt: new Date(expiresAt),
        scope: json.scope,
        environment: this.environment,
        connectedByUserId: this.userId,
      })
      .catch((error) => {
        logger.warn(
          { err: error },
          "Failed to persist refreshed Too Lost token (will retry on next call)",
        );
      });
    logger.info("✅ Too Lost access token refreshed");
    return this.connection.accessToken;
  }

  /**
   * Whether a ToolostApiError indicates the SERVICE is unhealthy (network
   * fault, timeout, 5xx) rather than a business-level outcome or this app's
   * own "not connected" configuration state. Only these should trip the
   * circuit breaker.
   */
  private static isBreakerRelevant(err: ToolostApiError): boolean {
    return (
      err.code === "NETWORK_ERROR" ||
      err.code === "TIMEOUT" ||
      (typeof err.status === "number" && err.status >= 500)
    );
  }

  private async cbCall<T>(
    fn: () => Promise<ToolostApiResult<T>>,
  ): Promise<ToolostApiResult<T>> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const result = await fn();
        if ("error" in result && ToolostService.isBreakerRelevant(result.error)) {
          throw new ToolostApiRejection(result.error);
        }
        return result;
      });
    } catch (err) {
      if (err instanceof ToolostApiRejection) {
        return { error: err.apiError };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { error: { code: "CIRCUIT_OPEN", message, status: 503 } };
    }
  }

  private async callWithRetry<T>(
    fn: () => Promise<ToolostApiResult<T>>,
    retries: number = this.maxRetries,
  ): Promise<ToolostApiResult<T>> {
    let lastResult!: ToolostApiResult<T>;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await this.cbCall(fn);
      if (!("error" in result)) return result;
      lastResult = result;

      const { error } = result;
      const isRetryable =
        error.status === 429 ||
        (typeof error.status === "number" && error.status >= 500) ||
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
        `⏳ Too Lost API retry ${attempt + 1}/${retries} after ${delay}ms (${error.code})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return lastResult;
  }

  /**
   * Native-fetch HTTP call honoring Too Lost's `{data: T}` success envelope
   * and `{status:false, error:"..."}` failure envelope. Never throws for an
   * API-level failure — like LabelGrid's vendor client, failures come back
   * as `{error}` so the circuit-breaker/retry layers above can inspect them
   * uniformly. A missing connection is surfaced the same way (a `{error}`
   * with code NOT_CONNECTED) so every caller has one contract regardless of
   * which layer produced the failure.
   */
  private async raw<T>(
    method: string,
    path: string,
    opts?: { query?: Record<string, unknown>; body?: unknown },
  ): Promise<ToolostApiResult<T>> {
    let accessToken: string;
    try {
      accessToken = await this.ensureValidToken();
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: "NOT_CONNECTED",
        },
      };
    }

    let url = `${this.baseUrl}${path}`;
    if (opts?.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(opts.query)) {
        if (value === undefined || value === null) continue;
        params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any = undefined;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          // non-JSON body, fall through with json left undefined
        }
      }
      if (!res.ok) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterNum = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        return {
          error: {
            message: json?.error || json?.message || text.slice(0, 500) || `HTTP ${res.status}`,
            status: res.status,
            code:
              res.status === 429
                ? "RATE_LIMITED"
                : res.status >= 500
                  ? "SERVER_ERROR"
                  : "REQUEST_FAILED",
            retry_after_seconds: Number.isFinite(retryAfterNum) ? retryAfterNum : undefined,
            errors: json?.errors,
            field: json?.field,
          },
        };
      }
      return { data: (json?.data ?? json) as T };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      return {
        error: {
          message: isAbort
            ? "Too Lost API request timed out"
            : error instanceof Error
              ? error.message
              : String(error),
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private logApiError(context: string, error: ToolostApiError): void {
    logger.warn(
      {
        context,
        code: error.code,
        status: error.status,
        field: error.field,
        errors: error.errors,
      },
      `${context}: ${error.message}`,
    );
  }

  /**
   * Converts a final ToolostApiResult<T> into a plain T, or throws a clean
   * Error — matching the thrown-on-failure contract every real caller
   * already depends on from LabelGridService.
   */
  private unwrap<T>(context: string, result: ToolostApiResult<T>): T {
    if ("error" in result) {
      this.logApiError(context, result.error);
      throw new Error(`Too Lost API error: ${result.error.message}`);
    }
    return result.data;
  }

  private logApiCall(method: string, endpoint: string, data?: unknown): void {
    logger.info(
      { endpoint, method, hasData: !!data },
      `Too Lost API ${method} ${endpoint}`,
    );
  }

  // ---------------------------------------------------------------------
  // Static shape-parsing helpers (defensive — Too Lost's exact response
  // shapes are unconfirmed against a live token, same posture LabelGrid's
  // own helpers used for its equally-unconfirmed shapes).
  // ---------------------------------------------------------------------

  private static extractList<T = Record<string, unknown>>(data: unknown): T[] {
    if (Array.isArray(data)) return data as T[];
    const obj = data as Record<string, unknown> | null | undefined;
    const candidate =
      obj?.data ??
      obj?.items ??
      obj?.results ??
      obj?.releases ??
      obj?.tracks ??
      obj?.platforms ??
      obj?.channels ??
      obj?.rows;
    return Array.isArray(candidate) ? (candidate as T[]) : [];
  }

  private static extractPrimaryArtistName(value: unknown): string {
    const list = ToolostService.extractList<Record<string, unknown>>(value);
    if (list.length === 0) return "";
    const primary =
      list.find((p) => String(p.role ?? "").toLowerCase().includes("primary")) ??
      list[0];
    return String(primary.name ?? primary.artistName ?? "");
  }

  private static extractPlatformNames(value: unknown): string[] {
    const list = ToolostService.extractList<Record<string, unknown> | string>(value);
    return list
      .map((p) => (typeof p === "string" ? p : String(p.platform ?? p.name ?? p.store ?? "")))
      .filter(Boolean);
  }

  private static normalizeCatalogReleaseType(
    raw?: string,
  ): ToolostCatalogRelease["releaseType"] {
    const s = String(raw ?? "").toLowerCase();
    if (s === "single") return "single";
    if (s === "ep") return "ep";
    // album, compilation, music video — closest existing bucket
    return "album";
  }

  private static normalizeDspCategory(raw?: string): ToolostDSP["category"] {
    const known: ToolostDSP["category"][] = [
      "streaming",
      "download",
      "social",
      "electronic",
      "regional",
      "niche",
      "monetization",
    ];
    const s = String(raw ?? "").toLowerCase();
    return (known as string[]).includes(s) ? (s as ToolostDSP["category"]) : "streaming";
  }

  private static normalizeReleaseStatus(raw: string): ToolostReleaseResponse["status"] {
    // Maps Too Lost's real status vocabulary (draft / in_review / live /
    // takedown_pending / takedown_complete) onto the same bucket set
    // LabelGridReleaseResponse used, so every existing call site (which
    // only does .toLowerCase()/.includes() string checks, never an
    // exhaustive switch) keeps compiling and behaving the same way.
    if (raw === "draft") return "draft";
    if (raw === "live") return "live";
    if (raw === "takedown_complete") return "failed";
    if (raw === "in_review" || raw === "takedown_pending") return "processing";
    return "processing";
  }

  private static normalizeOutletStatus(raw: string): ToolostPlatformStatus["status"] {
    const known: ToolostPlatformStatus["status"][] = [
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
    return (known as string[]).includes(raw) ? (raw as ToolostPlatformStatus["status"]) : "processing";
  }

  private static parseDeliveryPlatforms(data: unknown): ToolostPlatformStatus[] {
    const obj = data as Record<string, unknown> | null | undefined;
    const list = ToolostService.extractList<Record<string, unknown>>(
      obj?.platforms ?? (obj as any)?.delivery?.platforms ?? obj,
    );
    return list.map((entry) => {
      const platform = String(entry.platform ?? entry.name ?? entry.store ?? "unknown");
      const rawStatus = String(entry.status ?? entry.state ?? "processing").toLowerCase();
      return {
        platform,
        status: ToolostService.normalizeOutletStatus(rawStatus),
        liveDate: (entry.liveDate as string) || (entry.live_date as string) || undefined,
        errorMessage:
          (entry.error as string) ||
          (entry.errorMessage as string) ||
          (entry.error_message as string) ||
          undefined,
      } satisfies ToolostPlatformStatus;
    });
  }

  private static mapCatalogRelease(row: Record<string, unknown>): ToolostCatalogRelease {
    const tracksRaw = ToolostService.extractList<Record<string, unknown>>(
      (row as any).tracks ?? [],
    );
    return {
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      artist: ToolostService.extractPrimaryArtistName(row.participants ?? row.artists),
      releaseDate: (row.releaseDate as string) ?? (row.release_date as string) ?? undefined,
      upc: row.upc as string | undefined,
      coverUrl: (row.coverUrl as string) ?? (row.cover_url as string) ?? undefined,
      releaseType: ToolostService.normalizeCatalogReleaseType(row.type as string | undefined),
      trackCount: tracksRaw.length || Number(row.trackCount ?? 0) || 0,
      genre: Array.isArray(row.genres) ? String(row.genres[0]) : (row.genre as string | undefined),
      platforms: ToolostService.extractPlatformNames(row.platforms ?? (row as any)?.delivery?.platforms),
      tracks: tracksRaw.length
        ? tracksRaw.map((t) => ({
            title: String(t.title ?? ""),
            isrc: t.isrc as string | undefined,
            trackNumber: Number(t.trackNumber ?? t.track_number ?? 0) || 0,
            duration: Number(t.duration ?? 0) || 0,
          }))
        : undefined,
    };
  }

  // ---------------------------------------------------------------------
  // Public surface — same names/signatures as LabelGridService.
  // ---------------------------------------------------------------------

  /**
   * Returns Too Lost's live platform catalog for this authenticated user.
   * Platform support is provider-owned data; using the local DSP catalog here
   * would advertise destinations the connected Too Lost account may not offer.
   */
  async getAvailableDSPs(): Promise<ToolostDSPListResponse> {
    const result = await this.callWithRetry(() =>
      this.raw<unknown>("GET", "/lookup/platforms"),
    );
    if ("error" in result) {
      this.logApiError("[Too Lost] getAvailableDSPs failed", result.error);
      throw new Error(`Too Lost platform catalog unavailable: ${result.error.message}`);
    }
    const list = ToolostService.extractList<Record<string, unknown>>(result.data);
    if (list.length === 0) {
      throw new Error("Too Lost platform catalog returned no platforms.");
    }
    const dsps: ToolostDSP[] = list
      .map((p) => ({
        id: String(p.id ?? p.slug ?? p.code ?? p.name ?? ""),
        name: String(p.name ?? p.id ?? "Unknown"),
        slug: String(p.slug ?? p.code ?? p.id ?? "").toLowerCase(),
        category: ToolostService.normalizeDspCategory(p.category as string | undefined),
        region: String(p.region ?? "global"),
        isActive:
          (p.active as boolean | undefined) ??
          (p.isActive as boolean | undefined) ??
          true,
        processingTime: String(p.processingTime ?? p.processing_time ?? "3-7 days"),
        requirements: {
          isrc: true,
          upc: true,
          metadata: ["title", "artist", "album"],
          audioFormats: ["WAV", "FLAC"],
        },
        deliveryMethod: "api" as const,
        logoUrl: (p.logoUrl as string) ?? (p.logo_url as string) ?? undefined,
        docsUrl: undefined,
      }))
      .filter((dsp) => dsp.id && dsp.slug && dsp.isActive);
    if (dsps.length === 0) {
      throw new Error("Too Lost platform catalog contained no active platforms.");
    }
    logger.info(`📦 Too Lost live platform catalog: ${dsps.length} platform(s)`);
    return { dsps, total: dsps.length, syncedAt: new Date().toISOString() };
  }

  async verifyDSPCatalog(): Promise<{ total: number; active: number; inactive: number }> {
    const catalog = await this.getAvailableDSPs();
    return { total: catalog.total, active: catalog.dsps.length, inactive: 0 };
  }

  async getUserCatalog(platform?: string): Promise<ToolostCatalogRelease[]> {
    if (!this.isApiConfigured()) {
      logger.warn("[Too Lost] API not configured — getUserCatalog unavailable");
      return [];
    }
    // No confirmed platform filter on Too Lost's GET /releases — log and
    // ignore rather than silently mis-filtering, same honest pattern
    // LabelGrid used for the same gap.
    if (platform) {
      logger.info(
        `[Too Lost] getUserCatalog: platform filter "${platform}" ignored — no confirmed platform filter on GET /releases`,
      );
    }
    this.logApiCall("GET", "/releases");
    const result = await this.callWithRetry(() =>
      this.raw<unknown>("GET", "/releases", { query: { limit: 200 } }),
    );
    if ("error" in result) {
      this.logApiError("[Too Lost] getUserCatalog failed (non-fatal)", result.error);
      return [];
    }
    const rows = ToolostService.extractList<Record<string, unknown>>(result.data);
    const releases = rows.map((r) => ToolostService.mapCatalogRelease(r));
    logger.info(`[Too Lost] getUserCatalog: ${releases.length} release(s) returned`);
    return releases;
  }

  async getReleaseDetail(releaseId: string): Promise<ToolostCatalogRelease | null> {
    if (!this.isApiConfigured()) {
      logger.warn("[Too Lost] API not configured — getReleaseDetail unavailable");
      return null;
    }
    const endpoint = `/releases/${encodeURIComponent(releaseId)}`;
    this.logApiCall("GET", endpoint);
    const result = await this.callWithRetry(() => this.raw<Record<string, unknown>>("GET", endpoint));
    if ("error" in result) {
      this.logApiError(`[Too Lost] getReleaseDetail failed for ${releaseId}`, result.error);
      return null;
    }
    return ToolostService.mapCatalogRelease(result.data ?? {});
  }

  /**
   * Too Lost requires a release-level artwork AI-disclosure flag and a
   * per-track AI-assisted flag. Same reasoning as LabelGrid's own
   * assertTrackComplianceDataAvailable: this app has no schema column
   * capturing AI-involvement provenance for uploaded artwork or audio
   * today, so defaulting these to false would put a fabricated compliance
   * declaration on a real distributor submission. Refuse up front — before
   * any Too Lost release/track is created — rather than fail midway
   * through with a half-created release.
   */
  private assertComplianceDataAvailable(releaseData: ToolostRelease): void {
    if (!releaseData.tracks || releaseData.tracks.length === 0) {
      throw new Error("Too Lost release blocked: at least one track is required.");
    }
    const missing = new Set<string>();
    if (!releaseData.artworkAiUsage) {
      missing.add("artworkAiUsage (AI-involvement disclosure for the cover art)");
    }
    for (const track of releaseData.tracks) {
      if (!track.audioAiUsage) {
        missing.add("audioAiUsage (AI-involvement disclosure for the recording)");
      }
      if (!track.compositionAiUsage) {
        missing.add("compositionAiUsage (AI-involvement disclosure for the composition)");
      }
    }
    if (missing.size > 0) {
      throw new Error(
        "Too Lost release blocked: this app does not yet collect required compliance fields that Too Lost's " +
          `real API requires on every release — ${Array.from(missing).join("; ")}. ` +
          "These are legally material declarations and cannot be defaulted or guessed. Populate them on the " +
          "release/tracks before distribution can go through Too Lost.",
      );
    }
  }

  /**
   * Downloads the track's source audio into memory and uploads it to Too
   * Lost via their presigned-URL flow (POST tracks/upload-url → PUT the
   * bytes to the returned uploadUrl), returning the fileKey the
   * replace-all tracks call references. No local temp file: bytes are held
   * in one buffer between the two fetch calls (improvement over
   * LabelGridService's disk-based downloadToTempFile). The presigned PUT
   * intentionally carries no Authorization header — the signature is
   * embedded in the URL itself, and object stores commonly reject a
   * presigned request that also carries an unexpected auth header.
   */
  private async uploadTrackAudio(releaseId: string, track: ToolostTrack): Promise<string> {
    const sourceRes = await fetch(track.audioFile);
    if (!sourceRes.ok || !sourceRes.body) {
      throw new Error(
        `Too Lost release blocked: could not download audio for track "${track.title}" (HTTP ${sourceRes.status}).`,
      );
    }
    const contentType = sourceRes.headers.get("content-type") || "audio/wav";
    const urlExt = (() => {
      try {
        const pathname = new URL(track.audioFile).pathname;
        const dot = pathname.lastIndexOf(".");
        return dot >= 0 ? pathname.slice(dot).toLowerCase() : "";
      } catch {
        return "";
      }
    })();
    const allowedExt = [".wav", ".flac", ".aif", ".aiff"];
    if (urlExt && !allowedExt.includes(urlExt)) {
      throw new Error(
        `Too Lost release blocked: audio for track "${track.title}" has an unsupported extension "${urlExt}" ` +
          `(allowed: ${allowedExt.join(", ")}).`,
      );
    }
    const buffer = Buffer.from(await sourceRes.arrayBuffer());

    const urlEndpoint = `/releases/${releaseId}/tracks/upload-url`;
    const urlResult = await this.callWithRetry(() =>
      this.raw<{ uploadUrl: string; fileKey: string; method?: string; headers?: Record<string, string> }>(
        "POST",
        urlEndpoint,
        { body: { kind: "audio", fileName: `track_${Date.now()}${urlExt || ".wav"}`, contentType } },
      ),
    );
    const uploadInfo = this.unwrap(
      `[Too Lost] createRelease: upload-url request failed for track "${track.title}"`,
      urlResult,
    );

    const putRes = await fetch(uploadInfo.uploadUrl, {
      method: uploadInfo.method || "PUT",
      headers: { "Content-Type": contentType, ...(uploadInfo.headers || {}) },
      body: buffer,
    });
    if (!putRes.ok) {
      throw new Error(
        `Too Lost release blocked: audio upload failed for track "${track.title}" (HTTP ${putRes.status}).`,
      );
    }
    return uploadInfo.fileKey;
  }

  /**
   * Real choreography against Too Lost's confirmed Releases/Tracks
   * endpoints: create draft → per-track presigned audio upload → replace-all
   * tracks → update metadata → submit → fetch real delivery status. Throws
   * a clear "not connected" error via the natural raw()/ensureValidToken()
   * propagation if Too Lost isn't connected — never fabricates a release ID
   * or success status.
   */
  async createRelease(releaseData: ToolostRelease): Promise<ToolostReleaseResponse> {
    this.assertComplianceDataAvailable(releaseData);

    this.logApiCall("POST", "/releases", { title: releaseData.title });
    const createResult = await this.callWithRetry(() =>
      this.raw<Record<string, unknown>>("POST", "/releases", {
        body: {
          title: releaseData.title,
          type: "Single",
          participants: [buildToolostParticipant(releaseData.artist, "primary_artist")],
          ...(releaseData.label ? { label: releaseData.label } : {}),
        },
      }),
    );
    const created = this.unwrap("[Too Lost] createRelease: draft creation failed", createResult);
    const releaseId = String(created.id ?? "");
    if (!releaseId) {
      throw new Error("Too Lost release blocked: release was created but the API returned no id.");
    }

    const trackPayloads: Record<string, unknown>[] = [];
    for (const track of releaseData.tracks) {
      const audioFileKey = await this.uploadTrackAudio(releaseId, track);
      trackPayloads.push({
        title: track.title,
        ...(track.isrc ? { isrc: track.isrc } : {}),
        ...(track.lyrics ? { lyrics: track.lyrics } : {}),
        audioFileKey,
        aiAssisted: describesAiInvolvement(track.audioAiUsage) || describesAiInvolvement(track.compositionAiUsage),
        artists: [buildToolostParticipant(track.artist, "primary_artist")],
      });
    }
    this.logApiCall("PUT", `/releases/${releaseId}/tracks`, { count: trackPayloads.length });
    const tracksResult = await this.callWithRetry(() =>
      this.raw<unknown>("PUT", `/releases/${releaseId}/tracks`, { body: { tracks: trackPayloads } }),
    );
    this.unwrap(`[Too Lost] createRelease: track replace-all failed for release ${releaseId}`, tracksResult);

    // INFERRED: cover art is sent as a direct hosted URL rather than
    // through a presigned upload, since no dedicated cover-art upload
    // endpoint is confirmed (only the track-scoped upload-url endpoint
    // above). Verify against a real sandbox call once credentials exist,
    // and switch to an upload flow if Too Lost rejects external URLs.
    const metadataBody: Record<string, unknown> = {
      genres: [releaseData.genre],
      releaseDate: releaseData.releaseDate,
      isAiGeneratedArtwork: describesAiInvolvement(releaseData.artworkAiUsage),
      coverUrl: releaseData.artwork,
    };
    if (releaseData.upc) metadataBody.upc = releaseData.upc;
    if (releaseData.copyrightYear) {
      metadataBody.pYear = releaseData.copyrightYear;
      metadataBody.cYear = releaseData.copyrightYear;
    }
    if (releaseData.copyrightOwner) {
      metadataBody.pLine = `℗ ${releaseData.copyrightYear ?? ""} ${releaseData.copyrightOwner}`.trim();
      metadataBody.cLine = `© ${releaseData.copyrightYear ?? ""} ${releaseData.copyrightOwner}`.trim();
    }
    this.logApiCall("PATCH", `/releases/${releaseId}/metadata`, metadataBody);
    const metadataResult = await this.callWithRetry(() =>
      this.raw<unknown>("PATCH", `/releases/${releaseId}/metadata`, { body: metadataBody }),
    );
    if ("error" in metadataResult) {
      // Non-fatal, mirrors LabelGrid's own non-fatal validate step: the
      // release+tracks already exist, so surface the problem but continue
      // toward submit rather than abandoning a partially-built release.
      this.logApiError(
        `[Too Lost] createRelease: metadata update failed for release ${releaseId} (non-fatal)`,
        metadataResult.error,
      );
    }

    this.logApiCall("POST", `/releases/${releaseId}/submit`);
    const submitResult = await this.callWithRetry(() =>
      this.raw<unknown>("POST", `/releases/${releaseId}/submit`, {
        body: { acceptTerms: true, confirmRights: true },
      }),
    );
    this.unwrap(`[Too Lost] createRelease: submit failed for release ${releaseId}`, submitResult);

    const statusResult = await this.callWithRetry(() =>
      this.raw<Record<string, unknown>>("GET", `/releases/${releaseId}`),
    );
    const statusData = "error" in statusResult ? {} : statusResult.data;

    logger.info({ releaseId }, "Too Lost release created and submitted for distribution");

    const realPlatforms = ToolostService.parseDeliveryPlatforms(statusData);
    return {
      releaseId,
      status: ToolostService.normalizeReleaseStatus(String((statusData as any).status ?? "in_review").toLowerCase()),
      submittedAt: new Date().toISOString(),
      platforms:
        realPlatforms.length > 0
          ? realPlatforms
          : releaseData.platforms.map((platform) => ({ platform, status: "processing" as const })),
    };
  }

  async getReleaseStatus(releaseId: string): Promise<ToolostReleaseResponse> {
    const endpoint = `/releases/${encodeURIComponent(releaseId)}`;
    this.logApiCall("GET", endpoint);
    const result = await this.callWithRetry(() => this.raw<Record<string, unknown>>("GET", endpoint));
    const data = this.unwrap(`[Too Lost] getReleaseStatus failed for ${releaseId}`, result);
    return {
      releaseId,
      status: ToolostService.normalizeReleaseStatus(String(data.status ?? "in_review").toLowerCase()),
      submittedAt: (data.submittedAt as string) || (data.submitted_at as string) || undefined,
      estimatedLiveDate: (data.estimatedLiveDate as string) || (data.estimated_live_date as string) || undefined,
      platforms: ToolostService.parseDeliveryPlatforms(data),
    };
  }

  /** No ISRC-generation endpoint on Too Lost (only validation) — parity with LabelGrid's own honest gap. */
  async generateISRC(_artist: string, _title: string): Promise<ToolostCodeResponse> {
    throw new Error(
      "Too Lost does not expose an ISRC-generation endpoint (only validation) — there is no real API to call. " +
        "Use the internal generator instead.",
    );
  }

  /** No UPC-generation endpoint on Too Lost (only validation) — parity with LabelGrid's own honest gap. */
  async generateUPC(_releaseTitle: string): Promise<ToolostCodeResponse> {
    throw new Error(
      "Too Lost does not expose a UPC-generation endpoint (only validation) — there is no real API to call. " +
        "Use the internal generator instead.",
    );
  }

  /**
   * Shared real-data fetch behind getReleaseAnalytics/getArtistAnalytics.
   * Field names for the channel-breakdown response are defensive
   * best-effort (platform/name/store/channel, streams/plays/count,
   * revenue/earnings/amount, listeners) since there is no live connection
   * yet to confirm the exact response shape against. Non-fatal on an
   * individual endpoint failure (returns zeroed analytics), matching
   * LabelGrid's own graceful degradation for its dual-endpoint fetch — a
   * connected-but-one-endpoint-hiccuped state is different from having no
   * connection at all, which callers below gate separately.
   */
  private async fetchToolostAnalytics(endpoint: string): Promise<Omit<ToolostAnalytics, "releaseId">> {
    const result = await this.callWithRetry(() => this.raw<unknown>("GET", endpoint));
    if ("error" in result) {
      this.logApiError(`[Too Lost] analytics fetch failed (${endpoint}) — returning zeroed analytics`, result.error);
      return { totalStreams: 0, totalRevenue: 0, platforms: {}, timeline: [] };
    }
    const rows = ToolostService.extractList<Record<string, unknown>>(result.data);
    const platforms: ToolostAnalytics["platforms"] = {};
    let totalStreams = 0;
    let totalRevenue = 0;
    for (const row of rows) {
      const platform = String(row.platform ?? row.name ?? row.store ?? row.channel ?? "unknown");
      const streams = Number(row.streams ?? row.plays ?? row.count ?? 0) || 0;
      const revenue = Number(row.revenue ?? row.earnings ?? row.amount ?? 0) || 0;
      const listeners = Number(row.listeners ?? row.uniqueListeners ?? 0) || 0;
      const existing = platforms[platform];
      platforms[platform] = {
        streams: (existing?.streams ?? 0) + streams,
        revenue: (existing?.revenue ?? 0) + revenue,
        listeners: (existing?.listeners ?? 0) + listeners,
      };
      totalStreams += streams;
      totalRevenue += revenue;
    }
    return { totalStreams, totalRevenue, platforms, timeline: [] };
  }

  async getReleaseAnalytics(releaseId: string): Promise<ToolostAnalytics> {
    if (!this.isApiConfigured()) {
      throw new Error("Too Lost is not connected: release analytics require an active platform-level OAuth connection.");
    }
    const endpoint = `/sales/releases/${encodeURIComponent(releaseId)}/channels`;
    this.logApiCall("GET", endpoint);
    const data = await this.fetchToolostAnalytics(endpoint);
    return { releaseId, ...data };
  }

  /**
   * No real caller today (parity with LabelGridService.getArtistAnalytics,
   * which also has zero callers). Too Lost's Sales endpoints are
   * release-scoped, not artist-scoped, and there is no confirmed
   * artist-name filter on them — returning account-wide `/sales/overview`
   * data mislabeled as one artist's numbers would misattribute real
   * revenue, which is worse than an inferred shape guess. Throws instead.
   */
  async getArtistAnalytics(_artistId: string): Promise<ToolostAnalytics> {
    throw new Error(
      "Too Lost has no artist-scoped analytics endpoint or filter — Sales data is account-wide only, " +
        "and returning it as if scoped to one artist would misattribute revenue.",
    );
  }

  async updateRelease(releaseId: string, updates: Partial<ToolostRelease>): Promise<ToolostReleaseResponse> {
    const patchBody: Record<string, unknown> = {};
    if (updates.title !== undefined) patchBody.title = updates.title;
    if (updates.releaseDate !== undefined) patchBody.releaseDate = updates.releaseDate;
    if (updates.copyrightYear !== undefined) {
      patchBody.cYear = updates.copyrightYear;
      patchBody.pYear = updates.copyrightYear;
    }
    if (updates.copyrightOwner !== undefined && updates.copyrightYear !== undefined) {
      patchBody.cLine = `© ${updates.copyrightYear} ${updates.copyrightOwner}`;
      patchBody.pLine = `℗ ${updates.copyrightYear} ${updates.copyrightOwner}`;
    }
    if (Object.keys(patchBody).length === 0) {
      throw new Error(
        "Too Lost release update blocked: none of the supplied fields (title, releaseDate, copyrightYear/copyrightOwner) were recognized.",
      );
    }
    const endpoint = `/releases/${encodeURIComponent(releaseId)}/metadata`;
    this.logApiCall("PATCH", endpoint, patchBody);
    const result = await this.callWithRetry(() => this.raw<Record<string, unknown>>("PATCH", endpoint, { body: patchBody }));
    const updated = this.unwrap(`[Too Lost] updateRelease failed for ${releaseId}`, result);
    logger.info({ releaseId }, "Too Lost release updated successfully");
    return {
      releaseId,
      status: ToolostService.normalizeReleaseStatus(String(updated.status ?? "in_review").toLowerCase()),
      platforms: [],
    };
  }

  /**
   * INFERRED: Too Lost has no dedicated takedown endpoint confirmed in its
   * documented surface. PATCH /releases/{id}/delivery with an empty
   * platforms array is the best-fit inference from the confirmed
   * takedown_pending/takedown_complete status values (which imply some
   * real mechanism exists) combined with the confirmed
   * PATCH /releases/{id}/delivery shape. Verify against a live sandbox
   * call before relying on this in production — mirrors LabelGrid's own
   * already-inferred takedown pattern.
   */
  async takedownRelease(releaseId: string): Promise<{ success: boolean }> {
    const endpoint = `/releases/${encodeURIComponent(releaseId)}/delivery`;
    this.logApiCall("PATCH", endpoint);
    const result = await this.callWithRetry(() => this.raw<unknown>("PATCH", endpoint, { body: { platforms: [] } }));
    this.unwrap(`[Too Lost] takedownRelease failed for ${releaseId}`, result);
    logger.info({ releaseId }, "Too Lost release takedown initiated");
    return { success: true };
  }

  /**
   * Too Lost's confirmed API surface has no account-balance/wallet endpoint
   * distinct from raw sales data — payouts go directly through Too Lost's
   * linked payout provider, with no Max-Booster-visible pending/available
   * balance concept. `lifetime` is real (summed from /sales/overview);
   * `pending`/`available` are honestly 0 rather than fabricated, since Too
   * Lost has nothing to report there.
   */
  async getRoyaltySummary(): Promise<ToolostRoyaltySummary> {
    if (!this.isApiConfigured()) {
      throw new Error("Too Lost is not connected: royalty summary requires an active platform-level OAuth connection.");
    }
    this.logApiCall("GET", "/sales/overview");
    const result = await this.callWithRetry(() => this.raw<unknown>("GET", "/sales/overview"));
    if ("error" in result) {
      this.logApiError("[Too Lost] getRoyaltySummary failed", result.error);
      throw new Error(`Too Lost API error: ${result.error.message}`);
    }
    const rows = ToolostService.extractList<Record<string, unknown>>(result.data);
    const summaryObj = (!Array.isArray(result.data) ? (result.data as Record<string, unknown>) : {}) ?? {};
    const lifetimeFromRows = rows.reduce(
      (sum, row) => sum + (Number(row.revenue ?? row.amount ?? row.total ?? 0) || 0),
      0,
    );
    const lifetime = lifetimeFromRows || Number(summaryObj.totalRevenue ?? summaryObj.total ?? 0) || 0;
    return { pending: 0, available: 0, lifetime, currency: String(summaryObj.currency ?? "USD") };
  }

  /**
   * Too Lost's confirmed API surface has no statements/invoices endpoint at
   * all (Releases/Tracks/Lookup/Sales/Analytics/Preferences only) — a
   * "statement" implies an official period-closed accounting document,
   * categorically different from raw sales numbers, so this is not
   * synthesized from /sales data. Genuine capability gap vs LabelGrid.
   */
  async getRoyaltyStatements(_year?: number): Promise<ToolostRoyaltyStatement[]> {
    throw new Error(
      "Too Lost does not expose a royalty-statements endpoint — there is no real API to call. " +
        "Use getRoyaltySummary for real lifetime sales totals instead.",
    );
  }

  /** No payout-request endpoint on Too Lost's confirmed API surface — parity with LabelGrid's own honest gap. */
  async requestPayout(_amount: number, _method?: "paypal" | "bank"): Promise<ToolostPayoutRequest> {
    throw new Error(
      "Too Lost payout requests are not available: Too Lost's API has no payout-request endpoint — " +
        "payouts are handled directly by Too Lost's linked payout provider outside this app.",
    );
  }

  /**
   * Too Lost's confirmed API surface (Releases/Tracks/Lookup/Sales/
   * Analytics/Preferences) has no artist-search or artist-roster endpoint
   * at all — genuine capability gap vs LabelGrid, which could search its
   * own managed roster. Returns null (the same "not found" signal this
   * method already used for a roster miss) rather than fabricating a match.
   */
  async searchArtistAcrossPlatforms(_artistName: string): Promise<ToolostArtistSearchResult | null> {
    logger.info("[Too Lost] Artist search unavailable — Too Lost's API has no artist-search endpoint");
    return null;
  }

  async getArtistPlatformPresence(_toolostArtistId: string): Promise<ToolostArtistPlatformPresence[]> {
    logger.info("[Too Lost] Artist platform presence unavailable — Too Lost's API has no artist-resource endpoint");
    return [];
  }

  async getArtistCatalog(artistExternalId: string, platform?: string): Promise<ToolostCatalogRelease[]> {
    logger.info(
      `[Too Lost] getArtistCatalog(${artistExternalId}${platform ? `, ${platform}` : ""}) — ` +
        "no-op: Too Lost has no artist-scoped release-listing endpoint; callers should fall back to direct platform API scanning.",
    );
    return [];
  }

  // ---------------------------------------------------------------------
  // The methods below (publishing metadata, sync licensing, content-ID
  // claims/revenue, smart links, pre-save campaigns) have no equivalent
  // anywhere in Too Lost's confirmed real public API (Releases, Tracks,
  // Lookup, Sales, Analytics, Preferences only) — these fail loudly and
  // explicitly rather than calling made-up paths that would 404. Zero real
  // callers exist anywhere in the codebase today; kept only for public
  // contract parity with LabelGridService.
  // ---------------------------------------------------------------------

  async setPublishingMetadata(_releaseId: string, _metadata: ToolostPublishingMetadata): Promise<void> {
    throw new Error("Too Lost has no publishing-metadata endpoint — there is no real API to call.");
  }

  async getPublishingMetadata(_releaseId: string): Promise<ToolostPublishingMetadata> {
    throw new Error("Too Lost has no publishing-metadata endpoint — there is no real API to call.");
  }

  async submitForSync(_releaseId: string, _opportunityId: string): Promise<ToolostSyncSubmission> {
    throw new Error("Too Lost has no sync-licensing endpoint — there is no real API to call.");
  }

  async getSyncOpportunities(_filters?: { genre?: string; mood?: string }): Promise<ToolostSyncOpportunity[]> {
    throw new Error("Too Lost has no sync-licensing endpoint — there is no real API to call.");
  }

  async updateSyncSubmission(_submissionId: string, _status: string): Promise<ToolostSyncSubmission> {
    throw new Error("Too Lost has no sync-licensing endpoint — there is no real API to call.");
  }

  async createSmartLink(_releaseId: string, _platforms: string[], _customSlug?: string): Promise<ToolostSmartLink> {
    throw new Error("Too Lost has no smart-link endpoint — there is no real API to call.");
  }

  async getSmartLink(_releaseId: string): Promise<ToolostSmartLink> {
    throw new Error("Too Lost has no smart-link endpoint — there is no real API to call.");
  }

  async getSmartLinkAnalytics(_linkId: string): Promise<ToolostSmartLinkAnalytics> {
    throw new Error("Too Lost has no smart-link endpoint — there is no real API to call.");
  }

  async createPreSaveCampaign(_releaseId: string, _startDate: string): Promise<ToolostPreSave> {
    throw new Error("Too Lost has no pre-save endpoint — there is no real API to call.");
  }

  async getPreSaveCampaign(_campaignId: string): Promise<ToolostPreSave> {
    throw new Error("Too Lost has no pre-save endpoint — there is no real API to call.");
  }

  async getPreSaveSubscribers(_campaignId: string): Promise<ToolostPreSaveSubscriber[]> {
    throw new Error("Too Lost has no pre-save endpoint — there is no real API to call.");
  }

  async submitContentClaim(_releaseId: string, _platform: string, _videoId?: string): Promise<ToolostContentClaim> {
    throw new Error("Too Lost has no content-ID endpoint — there is no real API to call.");
  }

  async getContentClaims(_releaseId: string): Promise<ToolostContentClaim[]> {
    throw new Error("Too Lost has no content-ID endpoint — there is no real API to call.");
  }

  async getContentRevenue(_dateRange?: { start: string; end: string }): Promise<ToolostContentRevenue> {
    throw new Error("Too Lost has no content-ID endpoint — there is no real API to call.");
  }
}

export const toolostService = new ToolostService();

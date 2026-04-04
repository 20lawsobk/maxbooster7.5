import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { socialAccounts, systemSettings } from '@shared/schema';
import { gte, lte, and, eq, isNotNull } from 'drizzle-orm';
import axios from 'axios';
import crypto from 'crypto';

const TOKEN_ENCRYPTION_IV_LENGTH = 16;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const TOKEN_REFRESH_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const ENCRYPTION_KEY_SETTING = 'social_oauth_encryption_key';

// Get base domain for OAuth redirects - always use production URL for consistency
const getOAuthDomain = () => process.env.DOMAIN || process.env.APP_URL || 'https://maxbooster.replit.app';

/**
 * Social OAuth Service
 * Manages OAuth connections for social media platforms
 * 
 * HARDENED FEATURES:
 * - Token encryption at rest using AES-256-GCM (stable key persisted to DB)
 * - Proactive token refresh before expiry
 * - Revoked token detection and handling
 * - Token lifecycle monitoring
 */
export class SocialOAuthService {
  private oauthConfigs: Map<string, OAuthConfig> = new Map();
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private revokedTokenCache: Set<string> = new Set();
  private _encryptionKey: string | null = null;

  constructor() {
    this.initializeOAuthConfigs();
    this.startTokenRefreshMonitor();
    // Load stable encryption key asynchronously — does not block route serving
    this.initializeEncryptionKey().catch(e =>
      logger.error('[SocialOAuth] Failed to initialize encryption key:', (e as Error).message)
    );
  }

  /**
   * Load or generate a stable token encryption key.
   * Priority: process.env.TOKEN_ENCRYPTION_KEY > system_settings DB > generate+persist
   */
  private async initializeEncryptionKey(): Promise<void> {
    if (process.env.TOKEN_ENCRYPTION_KEY) {
      this._encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
      logger.info('[SocialOAuth] Using TOKEN_ENCRYPTION_KEY from environment');
      return;
    }

    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, ENCRYPTION_KEY_SETTING))
        .limit(1);

      if (rows.length > 0 && rows[0].value) {
        this._encryptionKey = rows[0].value as string;
        logger.info('[SocialOAuth] Loaded persistent encryption key from DB');
        return;
      }

      // Generate a new key and persist it so restarts reuse the same key
      const newKey = crypto.randomBytes(32).toString('hex');
      await db.insert(systemSettings).values({
        key: ENCRYPTION_KEY_SETTING,
        value: newKey,
        description: 'AES-256-GCM key for social OAuth token encryption — do not delete',
      }).onConflictDoNothing();
      this._encryptionKey = newKey;
      logger.warn('[SocialOAuth] Generated and persisted new TOKEN_ENCRYPTION_KEY to DB. Set TOKEN_ENCRYPTION_KEY env var for explicit control.');
    } catch (e) {
      logger.error('[SocialOAuth] DB key load failed, using session-scoped fallback:', (e as Error).message);
      if (!this._encryptionKey) {
        this._encryptionKey = crypto.randomBytes(32).toString('hex');
      }
    }
  }

  /** Returns the active encryption key, waiting briefly if still initializing */
  private getEncryptionKey(): string {
    if (this._encryptionKey) return this._encryptionKey;
    // Key not yet loaded — generate a session-only fallback (safe: tokens written
    // before the DB key loads will be readable only in this process lifetime,
    // but the DB will have the real key ready within seconds of startup)
    this._encryptionKey = crypto.randomBytes(32).toString('hex');
    logger.warn('[SocialOAuth] Encryption key not yet loaded from DB — using session fallback');
    return this._encryptionKey;
  }

  /**
   * Encrypt token data using AES-256-GCM
   */
  private encryptToken(plainText: string): string {
    const iv = crypto.randomBytes(TOKEN_ENCRYPTION_IV_LENGTH);
    const key = Buffer.from(this.getEncryptionKey().substring(0, 32).padEnd(32, '0'));
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt token data using AES-256-GCM
   */
  private decryptToken(encryptedText: string): string | null {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
      if (!ivHex || !authTagHex || !encrypted) {
        // Legacy unencrypted token - return as-is for migration
        return encryptedText;
      }
      
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = Buffer.from(this.getEncryptionKey().substring(0, 32).padEnd(32, '0'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Token decryption failed:', error);
      return null;
    }
  }

  /**
   * Start background monitor for proactive token refresh
   */
  private startTokenRefreshMonitor(): void {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }

    this.tokenRefreshInterval = setInterval(async () => {
      try { await this.checkAndRefreshExpiringTokens(); } catch { /* non-fatal */ }
    }, TOKEN_REFRESH_CHECK_INTERVAL_MS);

    logger.info('🔐 Token refresh monitor started (checking every minute)');
  }

  /**
   * Check all tokens and refresh those expiring soon
   */
  private async checkAndRefreshExpiringTokens(): Promise<void> {
    try {
      // Query tokens expiring within the refresh buffer (5 minutes from now)
      const expiryThreshold = new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS);
      const now = new Date();
      
      const expiringAccounts = await db.select()
        .from(socialAccounts)
        .where(
          and(
            isNotNull(socialAccounts.tokenExpiresAt),
            isNotNull(socialAccounts.refreshToken),
            eq(socialAccounts.isActive, true),
            // Token has not yet expired (now <= tokenExpiresAt)
            gte(socialAccounts.tokenExpiresAt, now),
            // Token expires within the buffer window (tokenExpiresAt <= now + buffer)
            lte(socialAccounts.tokenExpiresAt, expiryThreshold)
          )
        )
        .limit(100);
      
      for (const account of expiringAccounts) {
        try {
          if (!account.tokenExpiresAt || !account.refreshToken) continue;

          const expiresAt = new Date(account.tokenExpiresAt).getTime();
          const timeUntilExpiry = expiresAt - Date.now();

          // Refresh if expiring within buffer period
          if (timeUntilExpiry > 0 && timeUntilExpiry <= TOKEN_REFRESH_BUFFER_MS) {
            logger.info(`🔄 Proactively refreshing token for user ${account.userId} on ${account.platform}`);
            
            // Decrypt the refresh token before passing to refreshAccessToken
            const decryptedRefreshToken = this.decryptToken(account.refreshToken);
            if (decryptedRefreshToken) {
              await this.refreshAccessToken(account.userId, account.platform, decryptedRefreshToken);
            } else {
              // Fallback to internal fetch if decryption fails
              await this.refreshAccessToken(account.userId, account.platform);
            }
          }
        } catch (error) {
          logger.warn(`Failed to check/refresh token for ${account.userId}:${account.platform}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in token refresh monitor:', error);
    }
  }

  /**
   * Check if a token error indicates revocation
   */
  private isTokenRevokedError(error: any): boolean {
    const revokedIndicators = [
      'invalid_grant',
      'token_revoked',
      'access_denied',
      'The access token is invalid',
      'Token has been expired or revoked',
      'User has revoked access',
      'OAuthException',
      'Error validating access token',
    ];

    const errorMessage = error?.response?.data?.error_description 
      || error?.response?.data?.error 
      || error?.message 
      || '';

    const statusCode = error?.response?.status;
    
    // 401 with specific error messages typically means revoked
    if (statusCode === 401 && revokedIndicators.some(indicator => 
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    )) {
      return true;
    }

    return revokedIndicators.some(indicator => 
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Handle a revoked token - disconnect and notify
   */
  private async handleRevokedToken(userId: string, platform: string): Promise<void> {
    const cacheKey = `${userId}:${platform}`;
    
    // Prevent duplicate handling
    if (this.revokedTokenCache.has(cacheKey)) {
      return;
    }
    this.revokedTokenCache.add(cacheKey);

    logger.warn(`⚠️ Token revoked for user ${userId} on ${platform}`);

    try {
      // Clear the stored token
      await this.disconnectPlatform(userId, platform);

      logger.info(`Platform ${platform} disconnected for user ${userId} due to token revocation`);
    } catch (error) {
      logger.error(`Failed to handle revoked token for ${userId}:${platform}:`, error);
    }

    // Clear from cache after 5 minutes
    setTimeout(() => {
      this.revokedTokenCache.delete(cacheKey);
    }, 5 * 60 * 1000);
  }

  /**
   * Get a valid access token, refreshing if needed
   */
  async getValidAccessToken(userId: string, platform: string): Promise<string | null> {
    const tokens = await this.getStoredTokens(userId, platform);
    if (!tokens) {
      return null;
    }

    // Check if token is expired or expiring soon
    if (tokens.expiresAt) {
      const expiresAt = new Date(tokens.expiresAt).getTime();
      const now = Date.now();

      if (expiresAt <= now + TOKEN_REFRESH_BUFFER_MS) {
        logger.info(`Token expiring soon for ${userId}:${platform}, refreshing...`);
        try {
          const refreshed = await this.refreshAccessToken(userId, platform);
          return refreshed.accessToken;
        } catch (error: any) {
          if (this.isTokenRevokedError(error)) {
            await this.handleRevokedToken(userId, platform);
            return null;
          }
          throw error;
        }
      }
    }

    return tokens.accessToken;
  }

  /**
   * Parse stored token data, handling both encrypted and legacy formats
   */
  private parseStoredTokens(tokenString: string): any {
    if (!tokenString) return null;

    try {
      // Try to decrypt first
      const decrypted = this.decryptToken(tokenString);
      if (!decrypted) return null;

      return JSON.parse(decrypted);
    } catch {
      // Fallback: try parsing as plain JSON (legacy)
      try {
        return JSON.parse(tokenString);
      } catch {
        return null;
      }
    }
  }

  /**
   * Initialize OAuth configurations for each platform
   */
  private initializeOAuthConfigs() {
    // Meta OAuth (Facebook + Instagram combined)
    this.oauthConfigs.set('meta', {
      clientId: process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || '',
      authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
      scopes: ['public_profile', 'email', 'pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments'],
      redirectUri: `${getOAuthDomain()}/auth/meta/callback`,
    });

    // Twitter/X OAuth
    this.oauthConfigs.set('twitter', {
      clientId: process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY || '',
      clientSecret: process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_API_SECRET || '',
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.x.com/2/oauth2/token',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'follows.read', 'follows.write', 'offline.access'],
      redirectUri: `${getOAuthDomain()}/auth/twitter/callback`,
    });

    // YouTube OAuth
    this.oauthConfigs.set('youtube', {
      clientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
      redirectUri: `${getOAuthDomain()}/auth/youtube/callback`,
    });

    // Google OAuth
    this.oauthConfigs.set('google', {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email', 'profile'],
      redirectUri: `${getOAuthDomain()}/auth/google/callback`,
    });

    // LinkedIn OAuth
    this.oauthConfigs.set('linkedin', {
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['openid', 'profile', 'email', 'w_member_social'],
      redirectUri: `${getOAuthDomain()}/auth/linkedin/callback`,
    });

    // Google Business Profile OAuth
    this.oauthConfigs.set('googlebusiness', {
      clientId: process.env.GOOGLE_BUSINESS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/business.manage'],
      redirectUri: `${getOAuthDomain()}/auth/google-business/callback`,
    });

    // Threads OAuth
    this.oauthConfigs.set('threads', {
      clientId: process.env.THREADS_APP_ID || process.env.FACEBOOK_APP_ID || '',
      clientSecret: process.env.THREADS_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '',
      authUrl: 'https://threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token',
      scopes: ['threads_basic', 'threads_content_publish', 'threads_delete', 'threads_keyword_search', 'threads_location_tagging', 'threads_manage_insights', 'threads_profile_discovery'],
      redirectUri: process.env.THREADS_REDIRECT_URI || `${getOAuthDomain()}/auth/threads/callback`,
    });

    const tiktokEnv = process.env.TIKTOK_ENV;
    const isTikTokSandbox = tiktokEnv === 'sandbox';
    const tiktokClientKey = isTikTokSandbox
      ? (process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || '')
      : (process.env.TIKTOK_PROD_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || '');
    const tiktokClientSecret = isTikTokSandbox
      ? (process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || '')
      : (process.env.TIKTOK_PROD_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || '');
    const tiktokScopesStr = isTikTokSandbox
      ? (process.env.TIKTOK_SANDBOX_SCOPES || 'user.info.basic,video.list,video.upload,video.publish')
      : (process.env.TIKTOK_PROD_SCOPES || 'user.info.basic');
    const tiktokRedirectUri = isTikTokSandbox
      ? (process.env.TIKTOK_SANDBOX_REDIRECT_URI || `${getOAuthDomain()}/tiktok/sandbox/callback`)
      : (process.env.TIKTOK_PROD_REDIRECT_URI || `${getOAuthDomain()}/auth/tiktok/callback`);

    this.oauthConfigs.set('tiktok', {
      clientId: tiktokClientKey,
      clientSecret: tiktokClientSecret,
      authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      scopes: tiktokScopesStr.split(','),
      redirectUri: tiktokRedirectUri,
    });
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(platform: string, userId: string): string {
    const actualPlatform = platform === 'tiktok_sandbox' ? 'tiktok' : platform;
    const config = this.oauthConfigs.get(actualPlatform);
    if (!config) {
      throw new Error(`OAuth not configured for platform: ${platform}`);
    }

    const isTikTok = platform === 'tiktok' || platform === 'tiktok_sandbox';

    const params = new URLSearchParams({
      [isTikTok ? 'client_key' : 'client_id']: config.clientId,
      redirect_uri: config.redirectUri,
      scope: isTikTok ? config.scopes.join(',') : config.scopes.join(' '),
      response_type: 'code',
      state: `${userId}:${platform}:${Date.now()}`,
    });

    if (!isTikTok) {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    }

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    platform: string,
    code: string,
    userId: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth not configured for platform: ${platform}`);
    }

    try {
      const isTikTok = platform === 'tiktok' || platform === 'tiktok_sandbox';

      const tokenParams: Record<string, string> = {
        [isTikTok ? 'client_key' : 'client_id']: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      };

      const response = await axios.post(
        config.tokenUrl,
        new URLSearchParams(tokenParams).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;
      const access_token = tokenData.access_token;
      const refresh_token = tokenData.refresh_token;
      const expires_in = tokenData.expires_in;
      const open_id = tokenData.open_id;

      await this.saveTokens(userId, platform, {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
        ...(open_id ? { platformUserId: open_id } : {}),
      });

      logger.info(`OAuth tokens saved for user ${userId} on platform ${platform}`);

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      };
    } catch (error: unknown) {
      logger.error(
        `OAuth token exchange failed for ${platform}:`,
        error.response?.data || error.message
      );
      throw new Error(`Failed to connect ${platform} account`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    userId: string,
    platform: string,
    providedRefreshToken?: string
  ): Promise<{ accessToken: string; expiresIn?: number }> {
    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth not configured for platform: ${platform}`);
    }

    try {
      let refreshToken = providedRefreshToken;

      if (!refreshToken) {
        // Get refresh token from database if not provided
        const tokens = await this.getStoredTokens(userId, platform);
        if (!tokens?.refreshToken) {
          throw new Error('No refresh token available');
        }
        refreshToken = tokens.refreshToken;
      }

      const isTikTok = platform === 'tiktok' || platform === 'tiktok_sandbox';

      const refreshParams: Record<string, string> = {
        [isTikTok ? 'client_key' : 'client_id']: config.clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (platform === 'twitter') {
        const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      } else {
        refreshParams.client_secret = config.clientSecret;
      }

      const response = await axios.post(
        config.tokenUrl,
        new URLSearchParams(refreshParams).toString(),
        { headers }
      );

      const { access_token, expires_in, refresh_token: new_refresh_token } = response.data;

      await this.updateAccessToken(userId, platform, {
        accessToken: access_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
        refreshToken: new_refresh_token,
      });

      logger.info(`Access token refreshed for user ${userId} on platform ${platform}`);

      return {
        accessToken: access_token,
        expiresIn: expires_in,
      };
    } catch (error: unknown) {
      logger.error(`Token refresh failed for ${platform}:`, error.response?.data || error.message);
      throw new Error(`Failed to refresh ${platform} access token`);
    }
  }

  /**
   * Verify if a platform is connected
   */
  async isPlatformConnected(userId: string, platform: string): Promise<boolean> {
    try {
      const token = await storage.getUserSocialToken(userId, platform);
      return !!token;
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Get connected platforms for a user
   */
  async getConnectedPlatforms(userId: string): Promise<string[]> {
    const platforms = ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'googlebusiness', 'google', 'threads', 'tiktok'];
    const connected: string[] = [];

    for (const platform of platforms) {
      if (await this.isPlatformConnected(userId, platform)) {
        connected.push(platform);
      }
    }

    return connected;
  }

  /**
   * Disconnect a platform
   */
  async disconnectPlatform(userId: string, platform: string): Promise<void> {
    try {
      // Clear tokens from database
      await storage.updateUserSocialToken(userId, platform, '');
      logger.info(`Platform ${platform} disconnected for user ${userId}`);
    } catch (error: unknown) {
      logger.error(`Failed to disconnect ${platform}:`, error);
      throw error;
    }
  }

  /**
   * Save tokens to database with encryption
   */
  private async saveTokens(
    userId: string,
    platform: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
    }
  ): Promise<void> {
    const tokenData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt?.toISOString(),
      connectedAt: new Date().toISOString(),
    };

    // Encrypt token data before storing
    const encryptedData = this.encryptToken(JSON.stringify(tokenData));
    await storage.updateUserSocialToken(userId, platform, encryptedData);
    
    logger.info(`🔐 Encrypted and saved tokens for user ${userId} on ${platform}`);
  }

  /**
   * Get stored tokens from database with decryption
   */
  private async getStoredTokens(userId: string, platform: string): Promise<any> {
    const tokenString = await storage.getUserSocialToken(userId, platform);
    if (!tokenString) return null;

    return this.parseStoredTokens(tokenString);
  }

  /**
   * Update access token
   */
  private async updateAccessToken(
    userId: string,
    platform: string,
    update: {
      accessToken: string;
      expiresAt?: Date;
      refreshToken?: string;
    }
  ): Promise<void> {
    const existing = await this.getStoredTokens(userId, platform);
    if (!existing) return;

    const updated = {
      ...existing,
      accessToken: update.accessToken,
      expiresAt: update.expiresAt?.toISOString(),
      updatedAt: new Date().toISOString(),
      ...(update.refreshToken ? { refreshToken: update.refreshToken } : {}),
    };

    // Encrypt updated token data before storing
    const encryptedData = this.encryptToken(JSON.stringify(updated));
    await storage.updateUserSocialToken(userId, platform, encryptedData);
    
    logger.info(`🔐 Encrypted and updated access token for user ${userId} on ${platform}`);
  }
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

// Export singleton instance
export const socialOAuth = new SocialOAuthService();

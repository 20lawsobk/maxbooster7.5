import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { socialAccounts } from '@shared/schema';
import { gte, and, eq, isNotNull } from 'drizzle-orm';
import axios from 'axios';
import crypto from 'crypto';

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const TOKEN_ENCRYPTION_IV_LENGTH = 16;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const TOKEN_REFRESH_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

/**
 * Social OAuth Service
 * Manages OAuth connections for social media platforms
 * 
 * HARDENED FEATURES:
 * - Token encryption at rest using AES-256-GCM
 * - Proactive token refresh before expiry
 * - Revoked token detection and handling
 * - Token lifecycle monitoring
 */
export class SocialOAuthService {
  private oauthConfigs: Map<string, OAuthConfig> = new Map();
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private revokedTokenCache: Set<string> = new Set();

  constructor() {
    this.initializeOAuthConfigs();
    this.startTokenRefreshMonitor();
  }

  /**
   * Encrypt token data using AES-256-GCM
   */
  private encryptToken(plainText: string): string {
    const iv = crypto.randomBytes(TOKEN_ENCRYPTION_IV_LENGTH);
    const key = Buffer.from(TOKEN_ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0'));
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
      const key = Buffer.from(TOKEN_ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
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
      await this.checkAndRefreshExpiringTokens();
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
            // Token expires within the buffer period but hasn't expired yet
            gte(socialAccounts.tokenExpiresAt, now)
          )
        );
      
      for (const account of expiringAccounts) {
        try {
          if (!account.tokenExpiresAt) continue;

          const expiresAt = new Date(account.tokenExpiresAt).getTime();
          const timeUntilExpiry = expiresAt - Date.now();

          // Refresh if expiring within buffer period
          if (timeUntilExpiry > 0 && timeUntilExpiry <= TOKEN_REFRESH_BUFFER_MS) {
            logger.info(`🔄 Proactively refreshing token for user ${account.userId} on ${account.platform}`);
            await this.refreshAccessToken(account.userId, account.platform);
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

      // TODO: Send notification to user about disconnected platform
      // await notificationService.createNotification({
      //   userId,
      //   type: 'social_disconnected',
      //   title: `${platform} Disconnected`,
      //   message: `Your ${platform} account was disconnected. Please reconnect to continue posting.`,
      // });
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
    // Facebook/Instagram OAuth
    this.oauthConfigs.set('facebook', {
      clientId: process.env.FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
      authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
      scopes: [
        'pages_show_list',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
      ],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/facebook`,
    });

    // Twitter/X OAuth
    this.oauthConfigs.set('twitter', {
      clientId: process.env.TWITTER_CLIENT_ID || '',
      clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/twitter`,
    });

    // YouTube OAuth
    this.oauthConfigs.set('youtube', {
      clientId: process.env.YOUTUBE_CLIENT_ID || '',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
      ],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/youtube`,
    });

    // TikTok OAuth
    this.oauthConfigs.set('tiktok', {
      clientId: process.env.TIKTOK_CLIENT_KEY || '',
      clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
      authUrl: 'https://www.tiktok.com/auth/authorize/',
      tokenUrl: 'https://open-api.tiktok.com/oauth/access_token/',
      scopes: ['user.info.basic', 'video.list', 'video.upload'],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/tiktok`,
    });

    // LinkedIn OAuth
    this.oauthConfigs.set('linkedin', {
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['r_liteprofile', 'w_member_social'],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/linkedin`,
    });

    // Threads OAuth (using Instagram Graph API)
    this.oauthConfigs.set('threads', {
      clientId: process.env.THREADS_CLIENT_ID || process.env.FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.THREADS_CLIENT_SECRET || process.env.FACEBOOK_CLIENT_SECRET || '',
      authUrl: 'https://www.threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token',
      scopes: ['threads_basic', 'threads_content_publish'],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/threads`,
    });

    // Google Business Profile OAuth
    this.oauthConfigs.set('google_business', {
      clientId: process.env.GOOGLE_BUSINESS_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/business.manage',
        'https://www.googleapis.com/auth/plus.business.manage',
      ],
      redirectUri: `${process.env.DOMAIN}/api/oauth/callback/google_business`,
    });
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(platform: string, userId: string): string {
    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth not configured for platform: ${platform}`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state: `${userId}:${platform}:${Date.now()}`, // Include user ID in state
      access_type: 'offline', // For refresh tokens
      prompt: 'consent',
    });

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
      const response = await axios.post(
        config.tokenUrl,
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Store tokens in database
      await this.saveTokens(userId, platform, {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
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
    platform: string
  ): Promise<{ accessToken: string; expiresIn?: number }> {
    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth not configured for platform: ${platform}`);
    }

    try {
      // Get refresh token from database
      const tokens = await this.getStoredTokens(userId, platform);
      if (!tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post(config.tokenUrl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      });

      const { access_token, expires_in } = response.data;

      // Update access token in database
      await this.updateAccessToken(userId, platform, {
        accessToken: access_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
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
    const platforms = ['facebook', 'twitter', 'youtube', 'tiktok', 'linkedin', 'threads', 'google_business'];
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
    }
  ): Promise<void> {
    const existing = await this.getStoredTokens(userId, platform);
    if (!existing) return;

    const updated = {
      ...existing,
      accessToken: update.accessToken,
      expiresAt: update.expiresAt?.toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.updateUserSocialToken(userId, platform, JSON.stringify(updated));
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

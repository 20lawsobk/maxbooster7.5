import { storage } from '../storage.js';
import { logger } from '../logger.js';
import axios from 'axios';

/**
 * Social OAuth Service
 * Manages OAuth connections for social media platforms
 */
export class SocialOAuthService {
  private oauthConfigs: Map<string, OAuthConfig> = new Map();

  constructor() {
    this.initializeOAuthConfigs();
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
   * Save tokens to database
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

    await storage.updateUserSocialToken(userId, platform, JSON.stringify(tokenData));
  }

  /**
   * Get stored tokens from database
   */
  private async getStoredTokens(userId: string, platform: string): Promise<any> {
    const tokenString = await storage.getUserSocialToken(userId, platform);
    if (!tokenString) return null;

    try {
      return JSON.parse(tokenString);
    } catch {
      return null;
    }
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

import { storage } from '../storage.js';
import { logger } from '../logger.js';
import axios from 'axios';
import type { User } from '../../shared/schema.js';

/**
 * Auto-Posting Service
 * Posts content to connected social media platforms automatically
 * Integrates with Social Media Autopilot and Advertising Autopilot AI v3.0
 */

export interface PostContent {
  text: string;
  headline?: string;
  hashtags?: string[];
  mentions?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  link?: string;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  platforms: string[];
  content: PostContent;
  scheduledTime: Date;
  status: 'pending' | 'posting' | 'completed' | 'failed';
  results?: PostResult[];
  createdBy: 'social_autopilot' | 'advertising_autopilot' | 'manual';
  viralPrediction?: {
    viralityScore: number;
    expectedReach: number;
    expectedEngagement: number;
  };
}

export interface PostResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  postedAt: Date;
}

class AutoPostingService {
  private postQueue: Map<string, ScheduledPost> = new Map();
  private isProcessing: boolean = false;

  constructor() {
    // Start queue processor
    this.startQueueProcessor();
  }

  /**
   * Schedule a post for auto-posting
   */
  async schedulePost(
    userId: string,
    platforms: string[],
    content: PostContent,
    scheduledTime: Date,
    createdBy: 'social_autopilot' | 'advertising_autopilot' | 'manual' = 'manual',
    viralPrediction?: any
  ): Promise<ScheduledPost> {
    const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const scheduledPost: ScheduledPost = {
      id: postId,
      userId,
      platforms,
      content,
      scheduledTime,
      status: 'pending',
      createdBy,
      viralPrediction,
    };

    // Store in queue
    this.postQueue.set(postId, scheduledPost);

    // Save to database
    await storage.createScheduledPost(scheduledPost);

    logger.info(`Scheduled post ${postId} for user ${userId} at ${scheduledTime.toISOString()}`);

    return scheduledPost;
  }

  /**
   * Post immediately to specified platforms
   */
  async postNow(
    userId: string,
    platforms: string[],
    content: PostContent,
    createdBy: 'social_autopilot' | 'advertising_autopilot' | 'manual' = 'manual'
  ): Promise<PostResult[]> {
    logger.info(`Posting immediately to ${platforms.join(', ')} for user ${userId}`);

    const results: PostResult[] = [];

    // Get user's connected platforms and tokens
    const user = await storage.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Post to each platform in parallel
    const postPromises = platforms.map(async (platform) => {
      try {
        const result = await this.postToPlatform(user, platform, content);
        results.push(result);
      } catch (error: any) {
        logger.error(`Failed to post to ${platform}:`, error);
        results.push({
          platform,
          success: false,
          error: error.message,
          postedAt: new Date(),
        });
      }
    });

    await Promise.all(postPromises);

    // Track in analytics
    await storage.trackSocialPost({
      userId,
      platforms,
      content: content.text,
      mediaType: content.mediaType || 'text',
      postedAt: new Date(),
      results,
      createdBy,
    });

    return results;
  }

  /**
   * Post content to a specific platform
   */
  private async postToPlatform(
    user: User,
    platform: string,
    content: PostContent
  ): Promise<PostResult> {
    const startTime = Date.now();

    // Get access token for platform
    const token = await this.getAccessToken(user.id, platform);
    if (!token) {
      throw new Error(`No access token found for ${platform}`);
    }

    let result: PostResult;

    switch (platform.toLowerCase()) {
      case 'facebook':
        result = await this.postToFacebook(token, content);
        break;
      case 'instagram':
        result = await this.postToInstagram(token, content);
        break;
      case 'twitter':
      case 'x':
        result = await this.postToTwitter(token, content);
        break;
      case 'tiktok':
        result = await this.postToTikTok(token, content);
        break;
      case 'youtube':
        result = await this.postToYouTube(token, content);
        break;
      case 'linkedin':
        result = await this.postToLinkedIn(token, content);
        break;
      case 'threads':
        result = await this.postToThreads(token, content);
        break;
      case 'google_business':
        result = await this.postToGoogleBusiness(token, content);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`Posted to ${platform} in ${duration}ms: ${result.success ? 'SUCCESS' : 'FAILED'}`);

    return result;
  }

  /**
   * Post to Facebook
   */
  private async postToFacebook(token: string, content: PostContent): Promise<PostResult> {
    try {
      const postData: any = {
        message: this.formatContent(content),
        access_token: token,
      };

      if (content.link) {
        postData.link = content.link;
      }

      if (content.mediaUrl && content.mediaType === 'image') {
        postData.url = content.mediaUrl;
      }

      const response = await axios.post(
        'https://graph.facebook.com/v18.0/me/feed',
        postData
      );

      return {
        platform: 'facebook',
        success: true,
        postId: response.data.id,
        postUrl: `https://facebook.com/${response.data.id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Facebook posting error:', error.response?.data || error.message);
      throw new Error(`Facebook: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post to Instagram
   */
  private async postToInstagram(token: string, content: PostContent): Promise<PostResult> {
    try {
      // Instagram requires media (images/videos)
      if (!content.mediaUrl) {
        throw new Error('Instagram requires media (image or video)');
      }

      // Step 1: Create media container
      const containerData: any = {
        image_url: content.mediaType === 'image' ? content.mediaUrl : undefined,
        video_url: content.mediaType === 'video' ? content.mediaUrl : undefined,
        caption: this.formatContent(content),
        access_token: token,
      };

      const containerResponse = await axios.post(
        'https://graph.facebook.com/v18.0/me/media',
        containerData
      );

      const creationId = containerResponse.data.id;

      // Step 2: Publish the media
      const publishResponse = await axios.post(
        'https://graph.facebook.com/v18.0/me/media_publish',
        {
          creation_id: creationId,
          access_token: token,
        }
      );

      return {
        platform: 'instagram',
        success: true,
        postId: publishResponse.data.id,
        postUrl: `https://instagram.com/p/${publishResponse.data.id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Instagram posting error:', error.response?.data || error.message);
      throw new Error(`Instagram: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post to Twitter/X
   */
  private async postToTwitter(token: string, content: PostContent): Promise<PostResult> {
    try {
      const tweetData: any = {
        text: this.formatContent(content, 280), // Twitter character limit
      };

      if (content.mediaUrl) {
        // Upload media first
        const mediaId = await this.uploadTwitterMedia(token, content.mediaUrl);
        tweetData.media = { media_ids: [mediaId] };
      }

      const response = await axios.post(
        'https://api.twitter.com/2/tweets',
        tweetData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        platform: 'twitter',
        success: true,
        postId: response.data.data.id,
        postUrl: `https://twitter.com/i/web/status/${response.data.data.id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Twitter posting error:', error.response?.data || error.message);
      throw new Error(`Twitter: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Post to TikTok
   */
  private async postToTikTok(token: string, content: PostContent): Promise<PostResult> {
    try {
      // TikTok requires video content
      if (!content.mediaUrl || content.mediaType !== 'video') {
        throw new Error('TikTok requires video content');
      }

      const response = await axios.post(
        'https://open-api.tiktok.com/share/video/upload/',
        {
          video: {
            video_url: content.mediaUrl,
            caption: this.formatContent(content, 2200), // TikTok caption limit
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        platform: 'tiktok',
        success: true,
        postId: response.data.share_id,
        postUrl: `https://tiktok.com/@user/video/${response.data.share_id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('TikTok posting error:', error.response?.data || error.message);
      throw new Error(`TikTok: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Post to YouTube (Community Post)
   */
  private async postToYouTube(token: string, content: PostContent): Promise<PostResult> {
    try {
      const postData: any = {
        snippet: {
          description: this.formatContent(content),
        },
      };

      if (content.mediaUrl && content.mediaType === 'image') {
        postData.snippet.images = [{ url: content.mediaUrl }];
      }

      const response = await axios.post(
        'https://youtube.googleapis.com/youtube/v3/communityPosts',
        postData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        platform: 'youtube',
        success: true,
        postId: response.data.id,
        postUrl: `https://youtube.com/post/${response.data.id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('YouTube posting error:', error.response?.data || error.message);
      throw new Error(`YouTube: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post to LinkedIn
   */
  private async postToLinkedIn(token: string, content: PostContent): Promise<PostResult> {
    try {
      const postData: any = {
        author: 'urn:li:person:CURRENT_USER',
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: this.formatContent(content, 3000), // LinkedIn limit
            },
            shareMediaCategory: content.mediaUrl ? 'IMAGE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      if (content.mediaUrl && content.mediaType === 'image') {
        postData.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            originalUrl: content.mediaUrl,
          },
        ];
      }

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        postData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        platform: 'linkedin',
        success: true,
        postId: response.data.id,
        postUrl: `https://linkedin.com/feed/update/${response.data.id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('LinkedIn posting error:', error.response?.data || error.message);
      throw new Error(`LinkedIn: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Post to Threads
   */
  private async postToThreads(token: string, content: PostContent): Promise<PostResult> {
    try {
      const postData: any = {
        text: this.formatContent(content, 500), // Threads limit
        access_token: token,
      };

      if (content.mediaUrl) {
        postData.media_url = content.mediaUrl;
        postData.media_type = content.mediaType?.toUpperCase();
      }

      const response = await axios.post(
        'https://graph.threads.net/v1.0/me/threads',
        postData
      );

      return {
        platform: 'threads',
        success: true,
        postId: response.data.id,
        postUrl: `https://threads.net/t/${response.data.id}`,
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Threads posting error:', error.response?.data || error.message);
      throw new Error(`Threads: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post to Google Business Profile
   */
  private async postToGoogleBusiness(token: string, content: PostContent): Promise<PostResult> {
    try {
      const postData: any = {
        summary: this.formatContent(content, 1500),
        topicType: 'STANDARD',
      };

      if (content.mediaUrl && content.mediaType === 'image') {
        postData.media = [
          {
            mediaFormat: 'PHOTO',
            sourceUrl: content.mediaUrl,
          },
        ];
      }

      const response = await axios.post(
        'https://mybusiness.googleapis.com/v4/accounts/ACCOUNT_ID/locations/LOCATION_ID/localPosts',
        postData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        platform: 'google_business',
        success: true,
        postId: response.data.name,
        postUrl: 'https://business.google.com',
        postedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Google Business posting error:', error.response?.data || error.message);
      throw new Error(`Google Business: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Upload media to Twitter
   */
  private async uploadTwitterMedia(token: string, mediaUrl: string): Promise<string> {
    // Download media
    const mediaResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
    const mediaBuffer = Buffer.from(mediaResponse.data);

    // Upload to Twitter
    const uploadResponse = await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json',
      {
        media_data: mediaBuffer.toString('base64'),
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return uploadResponse.data.media_id_string;
  }

  /**
   * Format content with hashtags and mentions
   */
  private formatContent(content: PostContent, maxLength?: number): string {
    let text = content.headline ? `${content.headline}\n\n${content.text}` : content.text;

    // Add hashtags
    if (content.hashtags && content.hashtags.length > 0) {
      const hashtags = content.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
      text += '\n\n' + hashtags.join(' ');
    }

    // Add mentions
    if (content.mentions && content.mentions.length > 0) {
      const mentions = content.mentions.map((mention) =>
        mention.startsWith('@') ? mention : `@${mention}`
      );
      text += '\n' + mentions.join(' ');
    }

    // Truncate if needed
    if (maxLength && text.length > maxLength) {
      text = text.substring(0, maxLength - 3) + '...';
    }

    return text;
  }

  /**
   * Get access token for platform
   */
  private async getAccessToken(userId: string, platform: string): Promise<string | null> {
    const tokens = await storage.getSocialTokens(userId, platform);
    if (!tokens || !tokens.accessToken) {
      return null;
    }

    // Check if token is expired
    if (tokens.expiresAt && new Date(tokens.expiresAt) < new Date()) {
      // Token expired, refresh it
      if (tokens.refreshToken) {
        try {
          const refreshed = await this.refreshToken(userId, platform, tokens.refreshToken);
          return refreshed.accessToken;
        } catch (error) {
          logger.error(`Failed to refresh token for ${platform}:`, error);
          return null;
        }
      }
      return null;
    }

    return tokens.accessToken;
  }

  /**
   * Refresh access token
   */
  private async refreshToken(
    userId: string,
    platform: string,
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn?: number }> {
    // Call OAuth service to refresh token
    // This would integrate with socialOAuthService.refreshAccessToken()
    throw new Error('Token refresh not implemented - integrate with socialOAuthService');
  }

  /**
   * Start queue processor to post scheduled content
   */
  private startQueueProcessor() {
    setInterval(async () => {
      if (this.isProcessing) return;

      this.isProcessing = true;

      try {
        const now = new Date();

        // Find posts that need to be posted
        for (const [postId, scheduledPost] of this.postQueue.entries()) {
          if (
            scheduledPost.status === 'pending' &&
            scheduledPost.scheduledTime <= now
          ) {
            logger.info(`Processing scheduled post ${postId}`);

            // Update status
            scheduledPost.status = 'posting';
            await storage.updateScheduledPostStatus(postId, 'posting');

            try {
              // Post to platforms
              const results = await this.postNow(
                scheduledPost.userId,
                scheduledPost.platforms,
                scheduledPost.content,
                scheduledPost.createdBy
              );

              // Update status
              scheduledPost.status = 'completed';
              scheduledPost.results = results;
              await storage.updateScheduledPostStatus(postId, 'completed', results);

              logger.info(`Completed scheduled post ${postId}`);
            } catch (error: any) {
              logger.error(`Failed scheduled post ${postId}:`, error);
              scheduledPost.status = 'failed';
              await storage.updateScheduledPostStatus(postId, 'failed');
            }

            // Remove from queue
            this.postQueue.delete(postId);
          }
        }
      } catch (error) {
        logger.error('Queue processor error:', error);
      } finally {
        this.isProcessing = false;
      }
    }, 60000); // Check every minute

    logger.info('Auto-posting queue processor started');
  }

  /**
   * Get scheduled posts for user
   */
  async getScheduledPosts(userId: string): Promise<ScheduledPost[]> {
    return storage.getScheduledPosts(userId);
  }

  /**
   * Cancel scheduled post
   */
  async cancelScheduledPost(postId: string, userId: string): Promise<void> {
    const post = this.postQueue.get(postId);
    if (post && post.userId === userId) {
      this.postQueue.delete(postId);
      await storage.updateScheduledPostStatus(postId, 'failed');
      logger.info(`Cancelled scheduled post ${postId}`);
    }
  }
}

// Export singleton instance
export const autoPostingService = new AutoPostingService();

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

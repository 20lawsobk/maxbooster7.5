// Real platform API implementation with OAuth token integration
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';
import { storage } from './storage.ts';
import { logger } from './logger.js';
import {
  executeSocialApiOperation,
  twitterCircuit,
  facebookCircuit,
  instagramCircuit,
  linkedinCircuit,
  tiktokCircuit,
  queueForRetry,
} from './services/externalServices.js';
import { CircuitBreakerError, TimeoutError } from './services/circuitBreaker.js';

type PublishResult = {
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
};

type EngagementData = {
  likes: number;
  shares: number;
  comments: number;
  views?: number;
  reach?: number;
  engagementRate?: number;
  impressions?: number;
  retweets?: number;
  replies?: number;
};

export const platformAPI = {
  /**
   * Publish content to social media platforms using user OAuth tokens
   * @param content - Content object with text, media URLs, hashtags
   * @param platforms - Array of platform names (e.g., ['Twitter', 'Facebook'])
   * @param userId - Optional user ID to get OAuth tokens (if not provided, simulates)
   * @returns Array of publish results with success/failure status
   */
  async publishContent(
    content: unknown,
    platforms: string[],
    userId?: string
  ): Promise<PublishResult[]> {
    // Backward compatibility: If no userId provided, simulate
    if (!userId) {
      logger.warn('platformAPI.publishContent called without userId - using simulation mode');
      return platforms.map((p) => ({
        platform: p,
        success: true,
        postId: `simulated-${p}-${Date.now()}`,
      }));
    }

    const results: PublishResult[] = [];

    for (const platform of platforms) {
      try {
        // Normalize platform name (handle case variations)
        const normalizedPlatform = platform.toLowerCase();

        // Get user's OAuth token for this platform
        const token = await storage.getUserSocialToken(userId, normalizedPlatform);

        if (!token) {
          results.push({
            platform,
            success: false,
            error: `User not connected to ${platform} - OAuth token missing`,
          });
          continue;
        }

        // Extract content data
        const text = content.body || content.text || content.message || '';
        const mediaUrl = content.mediaUrl || content.media || null;
        const hashtags = content.hashtags || [];

        // Add hashtags to text if provided
        const fullText =
          hashtags.length > 0
            ? `${text} ${hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
            : text;

        let postId: string | undefined;

        // Call platform-specific API
        switch (normalizedPlatform) {
          case 'twitter':
            postId = await this.postToTwitter(fullText, mediaUrl, token);
            break;

          case 'facebook':
            postId = await this.postToFacebook(fullText, mediaUrl, token);
            break;

          case 'instagram':
            postId = await this.postToInstagram(fullText, mediaUrl, token);
            break;

          case 'linkedin':
            postId = await this.postToLinkedIn(fullText, mediaUrl, token, userId);
            break;

          case 'tiktok':
            postId = await this.postToTikTok(fullText, mediaUrl, token);
            break;

          case 'threads':
            postId = await this.postToThreads(fullText, mediaUrl, token);
            break;

          default:
            results.push({
              platform,
              success: false,
              error: `Platform ${platform} not yet supported`,
            });
            continue;
        }

        results.push({
          platform,
          success: true,
          postId,
        });

        logger.info(`✅ Successfully posted to ${platform}: ${postId}`);
      } catch (error: unknown) {
        const errorMsg =
          error.response?.data?.error?.message ||
          error.response?.data?.error_description ||
          error.message ||
          'Unknown error';

        results.push({
          platform,
          success: false,
          error: errorMsg,
        });

        logger.error(`❌ Failed to post to ${platform}:`, errorMsg);

        // Check if token expired
        if (
          errorMsg.includes('token') &&
          (errorMsg.includes('expired') || errorMsg.includes('invalid'))
        ) {
          logger.warn(`⚠️  OAuth token for ${platform} may be expired - user needs to reconnect`);
        }
      }
    }

    return results;
  },

  /**
   * Collect engagement analytics from social media platforms
   * @param postId - The platform-specific post ID
   * @param platform - Platform name
   * @param userId - Optional user ID to get OAuth tokens (if not provided, simulates)
   * @returns Engagement data (likes, shares, comments, etc.)
   */
  async collectEngagementData(
    postId: string,
    platform: string,
    userId?: string
  ): Promise<EngagementData> {
    // Backward compatibility: If no userId provided, simulate
    if (!userId) {
      logger.warn(
        'platformAPI.collectEngagementData called without userId - using simulation mode'
      );
      return {
        likes: Math.floor(Math.random() * 500),
        shares: Math.floor(Math.random() * 100),
        comments: Math.floor(Math.random() * 80),
        views: Math.floor(Math.random() * 10000),
        reach: Math.floor(Math.random() * 20000),
        engagementRate: Number((Math.random() * 0.08).toFixed(4)),
      };
    }

    try {
      // Normalize platform name
      const normalizedPlatform = platform.toLowerCase();

      // Get user's OAuth token for this platform
      const token = await storage.getUserSocialToken(userId, normalizedPlatform);

      if (!token) {
        throw new Error(`User not connected to ${platform} - OAuth token missing`);
      }

      // Call platform-specific analytics API
      switch (normalizedPlatform) {
        case 'twitter':
          return await this.getTwitterEngagement(postId, token);

        case 'facebook':
          return await this.getFacebookEngagement(postId, token);

        case 'instagram':
          return await this.getInstagramEngagement(postId, token);

        case 'linkedin':
          return await this.getLinkedInEngagement(postId, token);

        case 'threads':
          return await this.getThreadsEngagement(postId, token);

        default:
          throw new Error(`Analytics not yet implemented for ${platform}`);
      }
    } catch (error: unknown) {
      logger.error(`Failed to collect engagement data for ${platform}:`, error.message);

      // Return zero metrics on error to prevent crashes
      return {
        likes: 0,
        shares: 0,
        comments: 0,
        views: 0,
        reach: 0,
        engagementRate: 0,
      };
    }
  },

  // ============================================
  // PLATFORM-SPECIFIC POSTING METHODS
  // ============================================

  async postToTwitter(text: string, mediaUrl: string | null, token: string): Promise<string> {
    const result = await executeSocialApiOperation(
      'twitter',
      async () => {
        const twitterClient = new TwitterApi(token);

        let tweetResponse;

        if (mediaUrl) {
          try {
            const mediaId = await twitterClient.v1.uploadMedia(mediaUrl);
            tweetResponse = await twitterClient.v2.tweet({
              text,
              media: { media_ids: [mediaId] },
            });
          } catch (mediaError: unknown) {
            logger.warn('Twitter media upload failed, posting text only:', mediaError);
            tweetResponse = await twitterClient.v2.tweet({ text });
          }
        } else {
          tweetResponse = await twitterClient.v2.tweet({ text });
        }

        return tweetResponse.data.id;
      },
      {
        queueOnFailure: true,
        postData: { text, mediaUrl },
      }
    );

    if (result.warning) {
      logger.warn(`⚠️ Twitter post warning: ${result.warning}`);
    }

    return result.data;
  },

  async postToFacebook(text: string, mediaUrl: string | null, token: string): Promise<string> {
    const result = await executeSocialApiOperation(
      'facebook',
      async () => {
        const response = await axios.post(`https://graph.facebook.com/v18.0/me/feed`, {
          message: text,
          link: mediaUrl || undefined,
          access_token: token,
        });
        return response.data.id;
      },
      {
        queueOnFailure: true,
        postData: { text, mediaUrl },
      }
    );

    if (result.warning) {
      logger.warn(`⚠️ Facebook post warning: ${result.warning}`);
    }

    return result.data;
  },

  async postToInstagram(text: string, mediaUrl: string | null, token: string): Promise<string> {
    if (!mediaUrl) {
      throw new Error('Instagram posts require media (image or video)');
    }

    const result = await executeSocialApiOperation(
      'instagram',
      async () => {
        const mediaResponse = await axios.post(`https://graph.instagram.com/me/media`, {
          image_url: mediaUrl,
          caption: text,
          access_token: token,
        });

        const creationId = mediaResponse.data.id;

        const publishResponse = await axios.post(`https://graph.instagram.com/me/media_publish`, {
          creation_id: creationId,
          access_token: token,
        });

        return publishResponse.data.id;
      },
      {
        queueOnFailure: true,
        postData: { text, mediaUrl },
      }
    );

    if (result.warning) {
      logger.warn(`⚠️ Instagram post warning: ${result.warning}`);
    }

    return result.data;
  },

  async postToLinkedIn(
    text: string,
    mediaUrl: string | null,
    token: string,
    userId: string
  ): Promise<string> {
    const result = await executeSocialApiOperation(
      'linkedin',
      async () => {
        const profileResponse = await axios.get('https://api.linkedin.com/v2/me', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const personUrn = `urn:li:person:${profileResponse.data.id}`;

        const shareData: any = {
          author: personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text,
              },
              shareMediaCategory: mediaUrl ? 'IMAGE' : 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        };

        if (mediaUrl) {
          shareData.specificContent['com.linkedin.ugc.ShareContent'].media = [
            {
              status: 'READY',
              originalUrl: mediaUrl,
            },
          ];
        }

        const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', shareData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });

        return response.data.id;
      },
      {
        queueOnFailure: true,
        postData: { text, mediaUrl, userId },
      }
    );

    if (result.warning) {
      logger.warn(`⚠️ LinkedIn post warning: ${result.warning}`);
    }

    return result.data;
  },

  async postToTikTok(text: string, videoUrl: string | null, token: string): Promise<string> {
    if (!videoUrl) {
      throw new Error('TikTok posts require a video');
    }

    const result = await executeSocialApiOperation(
      'tiktok',
      async () => {
        const response = await axios.post(
          'https://open-api.tiktok.com/share/video/upload/',
          {
            video_url: videoUrl,
            description: text,
            access_token: token,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        return response.data.data.share_id;
      },
      {
        queueOnFailure: true,
        postData: { text, videoUrl },
      }
    );

    if (result.warning) {
      logger.warn(`⚠️ TikTok post warning: ${result.warning}`);
    }

    return result.data;
  },

  async postToThreads(text: string, mediaUrl: string | null, token: string): Promise<string> {
    try {
      let creationResponse;

      if (mediaUrl) {
        // Create Threads post with media
        creationResponse = await axios.post(`https://graph.threads.net/v1.0/me/threads`, {
          media_type: 'IMAGE',
          image_url: mediaUrl,
          text: text,
          access_token: token,
        });
      } else {
        // Create text-only Threads post
        creationResponse = await axios.post(`https://graph.threads.net/v1.0/me/threads`, {
          media_type: 'TEXT',
          text: text,
          access_token: token,
        });
      }

      const creationId = creationResponse.data.id;

      // Publish the Threads post
      const publishResponse = await axios.post(
        `https://graph.threads.net/v1.0/me/threads_publish`,
        {
          creation_id: creationId,
          access_token: token,
        }
      );

      return publishResponse.data.id;
    } catch (error: unknown) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Threads OAuth token expired or invalid');
      }
      if (error.response?.status === 429) {
        throw new Error('Threads API rate limit exceeded');
      }
      throw error;
    }
  },

  // ============================================
  // PLATFORM-SPECIFIC ANALYTICS METHODS
  // ============================================

  async getTwitterEngagement(tweetId: string, token: string): Promise<EngagementData> {
    try {
      const twitterClient = new TwitterApi(token);

      const tweet = await twitterClient.v2.singleTweet(tweetId, {
        'tweet.fields': ['public_metrics'],
      });

      const metrics = tweet.data.public_metrics;

      return {
        likes: metrics?.like_count || 0,
        shares: metrics?.retweet_count || 0,
        retweets: metrics?.retweet_count || 0,
        comments: metrics?.reply_count || 0,
        replies: metrics?.reply_count || 0,
        impressions: metrics?.impression_count || 0,
        engagementRate: metrics?.impression_count
          ? (metrics.like_count + metrics.retweet_count + metrics.reply_count) /
            metrics.impression_count
          : 0,
      };
    } catch (error: unknown) {
      if (error.code === 401) {
        throw new Error('Twitter OAuth token expired or invalid');
      }
      throw error;
    }
  },

  async getFacebookEngagement(postId: string, token: string): Promise<EngagementData> {
    try {
      const response = await axios.get(`https://graph.facebook.com/v18.0/${postId}`, {
        params: {
          fields: 'likes.summary(true),shares,comments.summary(true),reactions.summary(true)',
          access_token: token,
        },
      });

      const data = response.data;

      return {
        likes: data.likes?.summary?.total_count || data.reactions?.summary?.total_count || 0,
        shares: data.shares?.count || 0,
        comments: data.comments?.summary?.total_count || 0,
        engagementRate: 0, // Facebook doesn't provide impressions in basic API
      };
    } catch (error: unknown) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Facebook OAuth token expired or invalid');
      }
      throw error;
    }
  },

  async getInstagramEngagement(mediaId: string, token: string): Promise<EngagementData> {
    try {
      const response = await axios.get(`https://graph.instagram.com/${mediaId}/insights`, {
        params: {
          metric: 'likes,comments,shares,saved,engagement,impressions,reach',
          access_token: token,
        },
      });

      const data = response.data.data;
      const getMetric = (name: string) => {
        const metric = data.find((m: unknown) => m.name === name);
        return metric?.values?.[0]?.value || 0;
      };

      const impressions = getMetric('impressions');
      const engagement = getMetric('engagement');

      return {
        likes: getMetric('likes'),
        shares: getMetric('shares'),
        comments: getMetric('comments'),
        impressions,
        reach: getMetric('reach'),
        engagementRate: impressions > 0 ? engagement / impressions : 0,
      };
    } catch (error: unknown) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Instagram OAuth token expired or invalid');
      }
      throw error;
    }
  },

  async getLinkedInEngagement(shareId: string, token: string): Promise<EngagementData> {
    try {
      const response = await axios.get(`https://api.linkedin.com/v2/socialActions/${shareId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = response.data;

      return {
        likes: data.likesSummary?.totalLikes || 0,
        shares: data.sharesSummary?.totalShares || 0,
        comments: data.commentsSummary?.totalComments || 0,
        engagementRate: 0, // LinkedIn doesn't provide impressions in basic API
      };
    } catch (error: unknown) {
      if (error.response?.status === 401) {
        throw new Error('LinkedIn OAuth token expired or invalid');
      }
      throw error;
    }
  },

  async getThreadsEngagement(mediaId: string, token: string): Promise<EngagementData> {
    try {
      const response = await axios.get(`https://graph.threads.net/v1.0/${mediaId}/insights`, {
        params: {
          metric: 'likes,replies,reposts,views',
          access_token: token,
        },
      });

      const data = response.data.data;
      const getMetric = (name: string) => {
        const metric = data.find((m: unknown) => m.name === name);
        return metric?.values?.[0]?.value || 0;
      };

      return {
        likes: getMetric('likes'),
        shares: getMetric('reposts'),
        comments: getMetric('replies'),
        views: getMetric('views'),
        engagementRate: 0,
      };
    } catch (error: unknown) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Threads OAuth token expired or invalid');
      }
      throw error;
    }
  },
};

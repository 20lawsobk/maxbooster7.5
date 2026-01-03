import { Queue, Worker, QueueEvents } from 'bullmq';
import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { queueMonitor } from '../monitoring/queueMonitor.js';
import axios from 'axios';
import type { User } from '../../shared/schema.js';

/**
 * Production-Ready Auto-Posting Service
 * Uses BullMQ with Redis for durable, horizontally-scalable job processing
 * Fixes: In-memory volatility, data loss on restart, horizontal scaling issues
 */

export interface PostContent {
  text: string;
  headline?: string;
  hashtags?: string[];
  mentions?: string[];
  mediaUrl?: string;
  mediaType?: 'text' | 'audio' | 'image' | 'photo' | 'video' | 'carousel';
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

class AutoPostingServiceV2 {
  private postQueue: Queue;
  private worker: Worker | null = null;
  private queueEvents: QueueEvents;
  private isInitialized: boolean = false;

  constructor() {
    const connection = getRedisClient();
    
    // Create BullMQ queue for scheduled posts
    this.postQueue = new Queue('scheduled-posts', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs for debugging
        },
      },
    });

    // Queue events for monitoring
    this.queueEvents = new QueueEvents('scheduled-posts', { connection });

    this.queueEvents.on('completed', ({ jobId }) => {
      logger.info(`✅ Auto-post job ${jobId} completed successfully`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`❌ Auto-post job ${jobId} failed: ${failedReason}`);
    });
  }

  /**
   * Initialize service: start worker and reload pending jobs from database
   * CRITICAL: This fixes the data loss on restart issue
   */
  async initialize() {
    if (this.isInitialized) return;

    // Start worker for processing jobs
    this.startWorker();

    // Reload pending jobs from database
    await this.reloadPendingJobs();

    // Register queue for monitoring
    queueMonitor.registerQueue('scheduled-posts', this.postQueue);
    queueMonitor.startMonitoring();

    this.isInitialized = true;
    logger.info('✅ Auto-posting service initialized with BullMQ (production-ready)');
  }

  /**
   * Reload pending jobs from database on startup
   * CRITICAL FIX: Prevents data loss on restart
   */
  private async reloadPendingJobs() {
    try {
      const pendingPosts = await storage.getScheduledPosts({ status: 'pending' });
      
      let reloadedCount = 0;
      for (const post of pendingPosts) {
        const delay = new Date(post.scheduledTime).getTime() - Date.now();
        
        if (delay > 0) {
          // Re-schedule the job
          await this.postQueue.add(
            'auto-post',
            post,
            {
              jobId: post.id,
              delay,
            }
          );
          reloadedCount++;
        } else {
          // Past due - schedule immediately
          await this.postQueue.add('auto-post', post, { jobId: post.id });
          reloadedCount++;
        }
      }

      logger.info(`✅ Reloaded ${reloadedCount} pending posts from database`);
    } catch (error) {
      logger.error('Failed to reload pending jobs:', error);
    }
  }

  /**
   * Start BullMQ worker for processing jobs
   * Runs in separate process for horizontal scaling
   */
  private startWorker() {
    const connection = getRedisClient();

    this.worker = new Worker(
      'scheduled-posts',
      async (job) => {
        const post: ScheduledPost = job.data;
        
        logger.info(`🚀 Processing auto-post job ${post.id} for user ${post.userId}`);

        try {
          // Update status to posting
          await storage.updateScheduledPost(post.id, { status: 'posting' });

          // Execute the posting
          const results = await this.executePost(post);

          // Update with results
          await storage.updateScheduledPost(post.id, {
            status: results.every(r => r.success) ? 'completed' : 'failed',
            results,
          });

          // Track for analytics
          await storage.trackSocialPost({
            userId: post.userId,
            content: post.content,
            mediaType: post.content.mediaType,
            createdBy: post.createdBy,
            results,
          });

          return { success: true, results };
        } catch (error: any) {
          logger.error(`Failed to process auto-post ${post.id}:`, error);
          await storage.updateScheduledPost(post.id, { status: 'failed' });
          throw error;
        }
      },
      {
        connection,
        concurrency: 5, // Process up to 5 posts concurrently
      }
    );

    logger.info('✅ Auto-posting worker started (concurrency: 5)');
  }

  /**
   * Schedule a post for auto-posting
   * FIXED: Now uses durable Redis queue instead of in-memory Map
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

    // Save to database FIRST (durability)
    await storage.createScheduledPost(scheduledPost);

    // Add to BullMQ queue with delay
    const delay = scheduledTime.getTime() - Date.now();
    await this.postQueue.add(
      'auto-post',
      scheduledPost,
      {
        jobId: postId,
        delay: delay > 0 ? delay : 0,
      }
    );

    logger.info(`📅 Scheduled post ${postId} for ${scheduledTime.toISOString()} (${delay}ms delay)`);

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
    logger.info(`🚀 Posting immediately to ${platforms.join(', ')} for user ${userId}`);

    // Create temporary post object
    const tempPost: ScheduledPost = {
      id: `immediate_${Date.now()}`,
      userId,
      platforms,
      content,
      scheduledTime: new Date(),
      status: 'posting',
      createdBy,
    };

    return await this.executePost(tempPost);
  }

  /**
   * Execute posting to platforms
   */
  private async executePost(post: ScheduledPost): Promise<PostResult[]> {
    const results: PostResult[] = [];

    // Get user's connected platforms and tokens
    const user = await storage.getUserById(post.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Post to each platform in parallel
    const postPromises = post.platforms.map(async (platform) => {
      try {
        const result = await this.postToPlatform(user, platform, post.content);
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

    logger.info(`✅ Posted to ${results.filter(r => r.success).length}/${results.length} platforms`);

    return results;
  }

  /**
   * Post to a specific platform
   */
  private async postToPlatform(
    user: User,
    platform: string,
    content: PostContent
  ): Promise<PostResult> {
    const tokens = await storage.getSocialTokens(user.id);
    
    switch (platform) {
      case 'instagram':
        return await this.postToInstagram(user, tokens.instagram, content);
      case 'facebook':
        return await this.postToFacebook(user, tokens.facebook, content);
      case 'twitter':
        return await this.postToTwitter(user, tokens.twitter, content);
      case 'tiktok':
        return await this.postToTikTok(user, tokens.tiktok, content);
      case 'youtube':
        return await this.postToYouTube(user, tokens.youtube, content);
      case 'linkedin':
        return await this.postToLinkedIn(user, tokens.linkedin, content);
      case 'threads':
        return await this.postToThreads(user, tokens.threads, content);
      case 'google_business':
        return await this.postToGoogleBusiness(user, tokens.google_business, content);
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  // Platform-specific posting methods (unchanged from original)
  private async postToInstagram(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) {
      throw new Error('Instagram not connected');
    }

    const postData = {
      caption: `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`,
      media_url: content.mediaUrl,
    };

    const response = await axios.post(
      'https://graph.facebook.com/v18.0/me/media',
      postData,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return {
      platform: 'instagram',
      success: true,
      postId: response.data.id,
      postUrl: `https://instagram.com/p/${response.data.id}`,
      postedAt: new Date(),
    };
  }

  private async postToFacebook(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('Facebook not connected');

    const postData = {
      message: `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`,
      link: content.link,
    };

    const response = await axios.post(
      'https://graph.facebook.com/v18.0/me/feed',
      postData,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return {
      platform: 'facebook',
      success: true,
      postId: response.data.id,
      postUrl: `https://facebook.com/${response.data.id}`,
      postedAt: new Date(),
    };
  }

  private async postToTwitter(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('Twitter not connected');

    const tweetText = `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`;

    const response = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: tweetText.slice(0, 280) },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return {
      platform: 'twitter',
      success: true,
      postId: response.data.data.id,
      postUrl: `https://twitter.com/i/web/status/${response.data.data.id}`,
      postedAt: new Date(),
    };
  }

  private async postToTikTok(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('TikTok not connected');

    const caption = `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`;

    if (!content.mediaUrl || content.mediaType !== 'video') {
      throw new Error('TikTok requires video content');
    }

    const initResponse = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title: caption.slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: content.mediaUrl,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }
    );

    const publishId = initResponse.data.data?.publish_id;
    const uploadUrl = initResponse.data.data?.upload_url;
    
    if (!publishId) {
      throw new Error('TikTok video init failed: no publish_id returned');
    }

    if (uploadUrl) {
      const videoResponse = await axios.get(content.mediaUrl, { responseType: 'arraybuffer' });
      const videoBuffer = Buffer.from(videoResponse.data);

      await axios.put(uploadUrl, videoBuffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': videoBuffer.byteLength.toString(),
          'Content-Range': `bytes 0-${videoBuffer.byteLength - 1}/${videoBuffer.byteLength}`,
        },
      });
    }

    await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/submit/',
      { publish_id: publishId },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }
    );

    let videoId: string | undefined;
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusResponse = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        { publish_id: publishId },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      );

      const status = statusResponse.data.data?.status;
      if (status === 'PUBLISH_COMPLETE') {
        const postIds = statusResponse.data.data?.publicly_available_post_ids;
        videoId = postIds?.[0]?.id || postIds?.[0];
        break;
      } else if (status === 'FAILED') {
        throw new Error(`TikTok publish failed: ${statusResponse.data.data?.fail_reason || 'unknown'}`);
      }
    }

    if (!videoId) {
      throw new Error('TikTok video publish timed out - video may still be processing');
    }

    return {
      platform: 'tiktok',
      success: true,
      postId: videoId,
      postUrl: `https://www.tiktok.com/@${user.username}/video/${videoId}`,
      postedAt: new Date(),
    };
  }

  private async postToYouTube(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('YouTube not connected');

    const description = `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`;

    if (content.mediaType === 'video' && content.mediaUrl) {
      const initResponse = await axios.post(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          snippet: {
            title: content.headline || content.text.slice(0, 100),
            description: description,
            tags: content.hashtags?.map(h => h.replace('#', '')) || [],
            categoryId: '10',
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': 'video/*',
          },
        }
      );

      const uploadUrl = initResponse.headers.location;
      if (!uploadUrl) {
        throw new Error('YouTube upload session failed: no upload URL returned');
      }

      const videoResponse = await axios.get(content.mediaUrl, { responseType: 'arraybuffer' });
      const videoBuffer = Buffer.from(videoResponse.data);

      const uploadResponse = await axios.put(uploadUrl, videoBuffer, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'video/*',
          'Content-Length': videoBuffer.byteLength.toString(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const videoId = uploadResponse.data.id;

      return {
        platform: 'youtube',
        success: true,
        postId: videoId || `youtube_${Date.now()}`,
        postUrl: videoId ? `https://youtube.com/watch?v=${videoId}` : undefined,
        postedAt: new Date(),
      };
    } else {
      const channelResponse = await axios.get(
        'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const channelId = channelResponse.data.items?.[0]?.id;
      
      if (!channelId) {
        throw new Error('YouTube channel not found');
      }

      const postResponse = await axios.post(
        'https://www.googleapis.com/youtube/v3/activities?part=snippet,contentDetails',
        {
          snippet: {
            channelId: channelId,
            description: description.slice(0, 5000),
            type: 'bulletin',
          },
          contentDetails: {
            bulletin: {
              resourceId: { kind: 'youtube#channel', channelId: channelId },
            },
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        platform: 'youtube',
        success: true,
        postId: postResponse.data.id || `youtube_${Date.now()}`,
        postedAt: new Date(),
      };
    }
  }

  private async postToLinkedIn(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('LinkedIn not connected');

    const postText = `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`;

    const profileResponse = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const personUrn = `urn:li:person:${profileResponse.data.sub}`;

    let mediaAssets: any[] = [];
    
    if (content.mediaUrl && content.mediaType === 'image') {
      const registerResponse = await axios.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: personUrn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            }],
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      const uploadUrl = registerResponse.data.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
      const assetUrn = registerResponse.data.value?.asset;

      if (uploadUrl && assetUrn) {
        const imageResponse = await axios.get(content.mediaUrl, { responseType: 'arraybuffer' });
        
        await axios.put(uploadUrl, imageResponse.data, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'image/*',
          },
        });

        mediaAssets.push({
          status: 'READY',
          media: assetUrn,
        });
      }
    }

    const postData: any = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: postText,
          },
          shareMediaCategory: mediaAssets.length > 0 ? 'IMAGE' : 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    if (mediaAssets.length > 0) {
      postData.specificContent['com.linkedin.ugc.ShareContent'].media = mediaAssets;
    }

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      postData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    const postId = response.data.id;

    return {
      platform: 'linkedin',
      success: true,
      postId: postId || `linkedin_${Date.now()}`,
      postUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined,
      postedAt: new Date(),
    };
  }

  private async postToThreads(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('Threads not connected');

    const caption = `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`;

    const userResponse = await axios.get(
      `https://graph.threads.net/v1.0/me?access_token=${accessToken}&fields=id,username`
    );
    const threadsUserId = userResponse.data.id;
    const threadsUsername = userResponse.data.username;

    let mediaType = 'TEXT';
    const containerData: any = {
      text: caption.slice(0, 500),
    };

    if (content.mediaUrl && content.mediaType === 'image') {
      mediaType = 'IMAGE';
      containerData.image_url = content.mediaUrl;
    } else if (content.mediaUrl && content.mediaType === 'video') {
      mediaType = 'VIDEO';
      containerData.video_url = content.mediaUrl;
    }

    const createUrl = new URL(`https://graph.threads.net/v1.0/${threadsUserId}/threads`);
    createUrl.searchParams.set('access_token', accessToken);
    createUrl.searchParams.set('media_type', mediaType);
    createUrl.searchParams.set('text', containerData.text);
    if (containerData.image_url) {
      createUrl.searchParams.set('image_url', containerData.image_url);
    }
    if (containerData.video_url) {
      createUrl.searchParams.set('video_url', containerData.video_url);
    }

    const createResponse = await axios.post(createUrl.toString());
    const creationId = createResponse.data.id;

    if (!creationId) {
      throw new Error('Threads container creation failed');
    }

    if (mediaType === 'VIDEO') {
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await axios.get(
          `https://graph.threads.net/v1.0/${creationId}?access_token=${accessToken}&fields=status`
        );
        
        if (statusResponse.data.status === 'FINISHED') {
          break;
        } else if (statusResponse.data.status === 'ERROR') {
          throw new Error('Threads video processing failed');
        }
      }
    }

    const publishUrl = new URL(`https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`);
    publishUrl.searchParams.set('access_token', accessToken);
    publishUrl.searchParams.set('creation_id', creationId);

    const publishResponse = await axios.post(publishUrl.toString());
    const postId = publishResponse.data.id;

    return {
      platform: 'threads',
      success: true,
      postId: postId || `threads_${Date.now()}`,
      postUrl: postId ? `https://www.threads.net/@${threadsUsername}/post/${postId}` : undefined,
      postedAt: new Date(),
    };
  }

  private async postToGoogleBusiness(user: User, accessToken: string | undefined, content: PostContent): Promise<PostResult> {
    if (!accessToken) throw new Error('Google Business not connected');

    const postText = `${content.headline ? content.headline + '\n\n' : ''}${content.text}${content.hashtags ? '\n\n' + content.hashtags.join(' ') : ''}`;

    const accountsResponse = await axios.get(
      'https://mybusinessbusinessinformation.googleapis.com/v1/accounts',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const accountName = accountsResponse.data.accounts?.[0]?.name;

    if (!accountName) {
      throw new Error('No Google Business account found');
    }

    const locationsResponse = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const locationName = locationsResponse.data.locations?.[0]?.name;

    if (!locationName) {
      throw new Error('No Google Business location found');
    }

    const postData: any = {
      languageCode: 'en-US',
      summary: postText.slice(0, 1500),
      topicType: 'STANDARD',
    };

    if (content.mediaUrl) {
      postData.media = [{
        mediaFormat: content.mediaType === 'video' ? 'VIDEO' : 'PHOTO',
        sourceUrl: content.mediaUrl,
      }];
    }

    if (content.link) {
      postData.callToAction = {
        actionType: 'LEARN_MORE',
        url: content.link,
      };
    }

    const response = await axios.post(
      `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
      postData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const postId = response.data.name?.split('/').pop();

    return {
      platform: 'google_business',
      success: true,
      postId: postId || `google_${Date.now()}`,
      postUrl: response.data.searchUrl || undefined,
      postedAt: new Date(),
    };
  }

  /**
   * Get scheduled posts for a user
   */
  async getScheduledPosts(userId: string): Promise<ScheduledPost[]> {
    return await storage.getScheduledPosts({ userId, status: 'pending' });
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(postId: string): Promise<void> {
    // Remove from BullMQ queue
    const job = await this.postQueue.getJob(postId);
    if (job) {
      await job.remove();
    }

    // Update database
    await storage.deleteScheduledPost(postId);

    logger.info(`❌ Cancelled scheduled post ${postId}`);
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    logger.info('Shutting down auto-posting service...');
    
    if (this.worker) {
      await this.worker.close();
    }
    await this.postQueue.close();
    await this.queueEvents.close();

    logger.info('✅ Auto-posting service shut down gracefully');
  }
}

// Export singleton instance
export const autoPostingServiceV2 = new AutoPostingServiceV2();

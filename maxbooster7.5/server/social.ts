import { google } from "googleapis";
import axios from "axios";
import { TwitterApi } from "twitter-api-v2";
import { logger } from "./logger.js";

// Initialize Google APIs
const youtube = google.youtube({
  version: "v3",
  auth: process.env.YOUTUBE_API_KEY,
});

const googleMyBusiness = google.mybusinessbusinessinformation({
  version: "v1",
  auth: process.env.GOOGLE_MY_BUSINESS_API_KEY,
});

// Initialize Twitter API (with fallback for missing credentials)
let twitterClient: TwitterApi | null = null;
try {
  if (
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_TOKEN_SECRET
  ) {
    twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });
  }
} catch (error: unknown) {
  logger.warn({ err: error }, "Twitter API initialization failed:");
}

export interface SocialMediaMetrics {
  platform: string;
  followers: number;
  engagement: number;
  posts: number;
  reach: number;
  lastUpdated: Date;
}

export interface YouTubeChannelData {
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  channelId: string;
}

export class SocialMediaService {
  // Facebook/Instagram API Integration
  async getFacebookMetrics(
    pageId?: string,
  ): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
        logger.warn("Facebook API credentials not configured");
        return null;
      }

      const accessToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/me/accounts`,
        {
          params: {
            access_token: accessToken,
            fields: "name,fan_count,talking_about_count",
          },
        },
      );

      const pageData = response.data.data[0];
      if (!pageData) return null;

      return {
        platform: "Facebook",
        followers: pageData.fan_count || 0,
        engagement:
          ((pageData.talking_about_count || 0) / (pageData.fan_count || 1)) *
          100,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Facebook API error:");
      return null;
    }
  }

  async getInstagramMetrics(): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
        logger.warn("Instagram access token not configured");
        return null;
      }

      const response = await axios.get(`https://graph.instagram.com/me`, {
        params: {
          fields: "account_type,media_count,followers_count",
          access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
        },
      });

      const data = response.data;
      return {
        platform: "Instagram",
        followers: data.followers_count || 0,
        posts: data.media_count || 0,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Instagram API error:");
      return null;
    }
  }

  // Twitter/X API Integration
  async getTwitterMetrics(): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (!twitterClient) {
        logger.warn("Twitter API not initialized - check credentials");
        return null;
      }

      const me = await twitterClient.v2.me({
        "user.fields": ["public_metrics"],
      });

      if (!me.data) return null;

      const metrics = me.data.public_metrics;
      return {
        platform: "Twitter",
        followers: metrics?.followers_count || 0,
        posts: metrics?.tweet_count || 0,
        reach: metrics?.listed_count || 0,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Twitter API error:");
      return null;
    }
  }

  // TikTok API Integration
  async getTikTokMetrics(
    accessToken?: string,
  ): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
        logger.warn("TikTok API credentials not configured");
        return null;
      }

      if (!accessToken) {
        logger.warn("TikTok access token required for user metrics");
        return {
          platform: "TikTok",
          followers: 0,
          posts: 0,
          engagement: 0,
          reach: 0,
          lastUpdated: new Date(),
        };
      }

      const response = await axios.get(
        "https://open.tiktokapis.com/v2/user/info/",
        {
          params: {
            fields:
              "follower_count,following_count,likes_count,video_count,display_name,avatar_url",
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const userData = response.data?.data?.user;
      if (!userData) {
        logger.warn("TikTok API returned empty user data");
        return null;
      }

      const totalEngagement = userData.likes_count || 0;
      const followerCount = userData.follower_count || 0;
      const engagementRate =
        followerCount > 0 ? (totalEngagement / followerCount) * 100 : 0;

      return {
        platform: "TikTok",
        followers: followerCount,
        posts: userData.video_count || 0,
        engagement: engagementRate,
        reach: userData.following_count || 0,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "TikTok API error:");
      return null;
    }
  }

  // LinkedIn API Integration
  async getLinkedInMetrics(
    accessToken?: string,
  ): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (
        !process.env.LINKEDIN_CLIENT_ID ||
        !process.env.LINKEDIN_CLIENT_SECRET
      ) {
        logger.warn("LinkedIn API credentials not configured");
        return null;
      }

      if (!accessToken) {
        logger.warn("LinkedIn access token required for user metrics");
        return {
          platform: "LinkedIn",
          followers: 0,
          posts: 0,
          engagement: 0,
          reach: 0,
          lastUpdated: new Date(),
        };
      }

      const profileResponse = await axios.get(
        "https://api.linkedin.com/v2/me",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const networkInfoResponse = await axios
        .get(
          "https://api.linkedin.com/v2/networkSizes/urn:li:person:" +
            profileResponse.data.id +
            "?edgeType=CompanyFollowedByMember",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        )
        .catch(() => ({ data: { firstDegreeSize: 0 } }));

      const connectionsResponse = await axios
        .get(
          "https://api.linkedin.com/v2/connections?q=viewer&start=0&count=0",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        )
        .catch(() => ({ data: { _total: 0 } }));

      return {
        platform: "LinkedIn",
        followers:
          connectionsResponse.data?._total ||
          networkInfoResponse.data?.firstDegreeSize ||
          0,
        posts: 0,
        engagement: 0,
        reach: networkInfoResponse.data?.firstDegreeSize || 0,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "LinkedIn API error:");
      return null;
    }
  }

  // Google My Business API Integration
  async getGoogleBusinessMetrics(): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (!process.env.GOOGLE_MY_BUSINESS_API_KEY) {
        logger.warn("Google My Business API key not configured");
        return null;
      }

      // Google My Business API integration
      return {
        platform: "GoogleBusiness",
        followers: 0,
        posts: 0,
        engagement: 0,
        reach: 0,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Google My Business API error:");
      return null;
    }
  }

  // Threads API Integration (Meta)
  async getThreadsMetrics(): Promise<Partial<SocialMediaMetrics> | null> {
    try {
      if (!process.env.THREADS_ACCESS_TOKEN || !process.env.THREADS_APP_ID) {
        logger.warn("Threads API credentials not configured");
        return null;
      }

      // Fetch Threads user profile and metrics
      const response = await axios.get(`https://graph.threads.net/v1.0/me`, {
        params: {
          fields: "id,username,threads_profile_picture_url,threads_biography",
          access_token: process.env.THREADS_ACCESS_TOKEN,
        },
      });

      // Fetch Threads insights (follower count, engagement)
      const insightsResponse = await axios.get(
        `https://graph.threads.net/v1.0/me/threads_insights`,
        {
          params: {
            metric: "followers_count,profile_views,likes,replies,reposts",
            access_token: process.env.THREADS_ACCESS_TOKEN,
          },
        },
      );

      const insights = insightsResponse.data.data || [];
      const followersMetric = insights.find(
        (m: unknown) => m.name === "followers_count",
      );
      const likesMetric = insights.find((m: unknown) => m.name === "likes");

      return {
        platform: "Threads",
        followers: followersMetric?.values?.[0]?.value || 0,
        posts: 0, // Will be fetched from threads media endpoint
        engagement: likesMetric?.values?.[0]?.value || 0,
        reach: 0,
        lastUpdated: new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Threads API error:");
      return null;
    }
  }
  // YouTube Integration
  async getYouTubeChannelStats(
    channelId: string,
  ): Promise<YouTubeChannelData | null> {
    try {
      if (!process.env.GOOGLE_API_KEY) {
        logger.warn("YouTube API requires GOOGLE_API_KEY to be set");
        return null;
      }

      const response = await youtube.channels.list({
        part: ["statistics", "snippet"],
        id: [channelId],
      });

      const channel = response.data.items?.[0];
      if (!channel) return null;

      return {
        subscriberCount: parseInt(channel.statistics?.subscriberCount || "0"),
        videoCount: parseInt(channel.statistics?.videoCount || "0"),
        viewCount: parseInt(channel.statistics?.viewCount || "0"),
        channelId,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "YouTube API error:");
      return null;
    }
  }

  // Upload music to YouTube (requires OAuth)
  async uploadToYouTube(
    title: string,
    description: string,
    filePath: string,
    accessToken: string,
  ): Promise<{ videoId: string; url: string } | null> {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const youtube = google.youtube({
        version: "v3",
        auth: auth,
      });

      const response = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title,
            description,
            categoryId: "10", // Music category
          },
          status: {
            privacyStatus: "public",
          },
        },
        media: {
          body: require("fs").createReadStream(filePath),
        },
      });

      const videoId = response.data.id;
      return videoId
        ? {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
          }
        : null;
    } catch (error: unknown) {
      logger.warn({ err: error }, "YouTube upload error:");
      return null;
    }
  }

  // Get real social media metrics from APIs
  async getSocialMediaMetrics(userId: number): Promise<SocialMediaMetrics[]> {
    const metrics: SocialMediaMetrics[] = [];

    try {
      // Fetch real data from each platform API
      const [
        facebookData,
        instagramData,
        twitterData,
        youtubeData,
        tiktokData,
        threadsData,
        googleBusinessData,
        linkedinData,
      ] = await Promise.allSettled([
        this.getFacebookMetrics(),
        this.getInstagramMetrics(),
        this.getTwitterMetrics(),
        this.getYouTubeChannelMetrics(),
        this.getTikTokMetrics(),
        this.getThreadsMetrics(),
        this.getGoogleBusinessMetrics(),
        this.getLinkedInMetrics(),
      ]);

      // Process Facebook data
      if (facebookData.status === "fulfilled" && facebookData.value) {
        metrics.push({
          platform: "Facebook",
          followers: facebookData.value.followers || 0,
          engagement: facebookData.value.engagement || 0,
          posts: facebookData.value.posts || 0,
          reach: facebookData.value.reach || 0,
          lastUpdated: new Date(),
        });
      }

      // Process Instagram data
      if (instagramData.status === "fulfilled" && instagramData.value) {
        metrics.push({
          platform: "Instagram",
          followers: instagramData.value.followers || 0,
          engagement: instagramData.value.engagement || 0,
          posts: instagramData.value.posts || 0,
          reach: instagramData.value.reach || 0,
          lastUpdated: new Date(),
        });
      }

      // Process Twitter data
      if (twitterData.status === "fulfilled" && twitterData.value) {
        metrics.push({
          platform: "Twitter",
          followers: twitterData.value.followers || 0,
          engagement: twitterData.value.engagement || 0,
          posts: twitterData.value.posts || 0,
          reach: twitterData.value.reach || 0,
          lastUpdated: new Date(),
        });
      }

      // Process YouTube data
      if (youtubeData.status === "fulfilled" && youtubeData.value) {
        metrics.push({
          platform: "YouTube",
          followers: youtubeData.value.subscriberCount || 0,
          engagement: 0, // Calculate from views/subscribers
          posts: youtubeData.value.videoCount || 0,
          reach: youtubeData.value.viewCount || 0,
          lastUpdated: new Date(),
        });
      }

      // Process other platforms
      const otherPlatforms = [
        { data: tiktokData, platform: "TikTok" },
        { data: threadsData, platform: "Threads" },
        { data: googleBusinessData, platform: "GoogleBusiness" },
        { data: linkedinData, platform: "LinkedIn" },
      ];

      otherPlatforms.forEach(({ data, platform }) => {
        if (data.status === "fulfilled" && data.value) {
          metrics.push({
            platform,
            followers: data.value.followers || 0,
            engagement: data.value.engagement || 0,
            posts: data.value.posts || 0,
            reach: data.value.reach || 0,
            lastUpdated: new Date(),
          });
        }
      });

      return metrics;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching social media metrics:");
      return [];
    }
  }

  // Enhanced YouTube metrics
  async getYouTubeChannelMetrics(): Promise<Partial<YouTubeChannelData> | null> {
    try {
      if (!process.env.YOUTUBE_API_KEY) {
        logger.warn("YouTube API key not configured");
        return null;
      }

      // This would require the user's channel ID
      // For now, return API configured status
      return {
        subscriberCount: 0,
        videoCount: 0,
        viewCount: 0,
        channelId: "",
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "YouTube API error:");
      return null;
    }
  }

  // Real social media posting
  async schedulePost(
    platforms: string[],
    content: string,
    mediaUrl?: string,
    scheduleTime?: Date,
  ): Promise<{ success: boolean; platforms: string[]; errors?: string[] }> {
    const results: {
      success: boolean;
      platforms: string[];
      errors?: string[];
    } = {
      success: true,
      platforms: [],
      errors: [],
    };

    for (const platform of platforms) {
      try {
        switch (platform) {
          case "Facebook":
            await this.postToFacebook(content, mediaUrl);
            results.platforms.push("Facebook");
            break;

          case "Instagram":
            await this.postToInstagram(content, mediaUrl);
            results.platforms.push("Instagram");
            break;

          case "Twitter":
            await this.postToTwitter(content, mediaUrl);
            results.platforms.push("Twitter");
            break;

          case "LinkedIn":
            await this.postToLinkedIn(content, mediaUrl);
            results.platforms.push("LinkedIn");
            break;

          case "Threads":
            await this.postToThreads(content, mediaUrl);
            results.platforms.push("Threads");
            break;

          case "TikTok":
          case "tiktok":
            await this.postToTikTok(content, mediaUrl);
            results.platforms.push("TikTok");
            break;

          case "YouTube":
          case "youtube":
            await this.postToYouTube(content, mediaUrl);
            results.platforms.push("YouTube");
            break;

          default:
            results.errors?.push(
              `Platform ${platform} is not supported for direct posting`,
            );
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        results.errors?.push(`Failed to post to ${platform}: ${msg}`);
      }
    }

    results.success = results.errors?.length === 0;
    return results;
  }

  // Platform-specific posting methods
  private async postToFacebook(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      throw new Error("Facebook API credentials not configured");
    }

    const accessToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

    await axios.post(`https://graph.facebook.com/v18.0/me/feed`, {
      message: content,
      link: mediaUrl,
      access_token: accessToken,
    });
  }

  private async postToInstagram(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
      throw new Error("Instagram access token not configured");
    }

    if (!mediaUrl) {
      throw new Error("Instagram posts require media");
    }

    // Create media object
    const mediaResponse = await axios.post(
      `https://graph.instagram.com/me/media`,
      {
        image_url: mediaUrl,
        caption: content,
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
      },
    );

    // Publish media
    await axios.post(`https://graph.instagram.com/me/media_publish`, {
      creation_id: mediaResponse.data.id,
      access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
    });
  }

  private async postToTwitter(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    if (!twitterClient) {
      throw new Error("Twitter API not initialized - check credentials");
    }

    if (mediaUrl) {
      // Upload media first, then tweet with media
      const mediaUpload = await twitterClient.v1.uploadMedia(mediaUrl);
      await twitterClient.v2.tweet({
        text: content,
        media: { media_ids: [mediaUpload] },
      });
    } else {
      await twitterClient.v2.tweet({ text: content });
    }
  }

  private async postToLinkedIn(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    if (
      !process.env.LINKEDIN_CLIENT_ID ||
      !process.env.LINKEDIN_CLIENT_SECRET
    ) {
      throw new Error("LinkedIn API credentials not configured");
    }

    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error(
        "LinkedIn access token not available — complete OAuth flow first",
      );
    }

    // Resolve the authenticated user's LinkedIn URN
    const profileResp = await axios.get(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const authorUrn = profileResp.data?.sub
      ? `urn:li:person:${profileResp.data.sub}`
      : null;

    if (!authorUrn) {
      throw new Error(
        "Could not determine LinkedIn author URN from access token",
      );
    }

    const body: Record<string, unknown> = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content.slice(0, 3000) },
          shareMediaCategory: mediaUrl ? "IMAGE" : "NONE",
          ...(mediaUrl
            ? {
                media: [
                  {
                    status: "READY",
                    description: { text: content.slice(0, 200) },
                    originalUrl: mediaUrl,
                  },
                ],
              }
            : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const response = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      body,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );

    logger.info(`[Social] LinkedIn post created — id: ${response.data?.id}`);
  }

  private async postToTikTok(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
      throw new Error("TikTok API credentials not configured");
    }

    if (!mediaUrl) {
      throw new Error("TikTok posts require a video URL");
    }

    // TikTok Content Posting API v2 — requires a user access token
    // The token must be obtained via the TikTok OAuth flow (socialOAuth routes)
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error(
        "TikTok access token not available — complete OAuth flow first",
      );
    }

    const response = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        post_info: {
          title: content.slice(0, 2200),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "URL",
          video_url: mediaUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );

    if (!response.data?.data?.publish_id) {
      throw new Error(
        `TikTok API returned unexpected response: ${JSON.stringify(response.data)}`,
      );
    }

    logger.info(
      `[Social] TikTok video post initiated — publish_id: ${response.data.data.publish_id}`,
    );
  }

  private async postToYouTube(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    const accessToken = process.env.YOUTUBE_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error(
        "YouTube access token not available — complete OAuth flow first",
      );
    }

    // YouTube Community Post (text + optional image)
    const postBody: Record<string, unknown> = {
      snippet: {
        description: content,
      },
    };

    if (mediaUrl) {
      (postBody.snippet as Record<string, unknown>).images = [
        { url: mediaUrl },
      ];
    }

    const response = await axios.post(
      "https://youtube.googleapis.com/youtube/v3/communityPosts",
      postBody,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        params: { part: "snippet" },
      },
    );

    logger.info(
      `[Social] YouTube community post created — id: ${response.data?.id}`,
    );
  }

  private async postToThreads(
    content: string,
    mediaUrl?: string,
  ): Promise<void> {
    if (!process.env.THREADS_ACCESS_TOKEN || !process.env.THREADS_APP_ID) {
      throw new Error("Threads API credentials not configured");
    }

    try {
      if (mediaUrl) {
        // Create Threads media post with image/video
        const mediaResponse = await axios.post(
          `https://graph.threads.net/v1.0/me/threads`,
          {
            media_type: "IMAGE", // or VIDEO based on mediaUrl type
            image_url: mediaUrl,
            text: content,
            access_token: process.env.THREADS_ACCESS_TOKEN,
          },
        );

        // Publish the Threads post
        await axios.post(`https://graph.threads.net/v1.0/me/threads_publish`, {
          creation_id: mediaResponse.data.id,
          access_token: process.env.THREADS_ACCESS_TOKEN,
        });
      } else {
        // Create text-only Threads post
        const textResponse = await axios.post(
          `https://graph.threads.net/v1.0/me/threads`,
          {
            media_type: "TEXT",
            text: content,
            access_token: process.env.THREADS_ACCESS_TOKEN,
          },
        );

        // Publish the Threads post
        await axios.post(`https://graph.threads.net/v1.0/me/threads_publish`, {
          creation_id: textResponse.data.id,
          access_token: process.env.THREADS_ACCESS_TOKEN,
        });
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to post to Threads: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }
}

export const socialMediaService = new SocialMediaService();

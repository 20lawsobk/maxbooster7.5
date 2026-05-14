import { db } from '../db';
import {
  dspAnalytics,
  dspUserPlatformStatus,
  releases,
  InsertDspAnalytics,
  DspAnalytics,
  DspUserPlatformStatus,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';
import { logger } from '../logger.js';
import { labelGridService } from './labelgrid-service';

// ── Timeout-guarded fetch: adds a 10s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (url: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(10_000), ...init });


export type DSPPlatform = 'spotify' | 'apple' | 'youtube' | 'amazon' | 'tidal' | 'deezer' | 'soundcloud' | 'pandora' | 'tiktok' | 'instagram';

interface DemographicData {
  ageGroups: { range: string; percentage: number }[];
  gender: { male: number; female: number; other: number };
  topInterests?: string[];
}

interface GeographyData {
  countries: { code: string; name: string; streams: number; listeners: number; percentage: number }[];
  cities: { name: string; country: string; streams: number; listeners: number }[];
  regions?: { name: string; streams: number }[];
}

interface SourceBreakdown {
  playlist: number;
  search: number;
  library: number;
  radio: number;
  artist: number;
  other: number;
}

interface DeviceBreakdown {
  mobile: number;
  desktop: number;
  tablet: number;
  smartSpeaker: number;
  tv: number;
  other: number;
}

export interface NormalizedDSPAnalytics {
  platform: DSPPlatform;
  period: { start: Date; end: Date };
  streams: number;
  listeners: number;
  saves: number;
  playlistAdds: number;
  shares: number;
  skips: number;
  completionRate: number;
  avgListenDuration: number;
  revenue?: number;
  demographics?: DemographicData;
  geography?: GeographyData;
  sourceBreakdown?: SourceBreakdown;
  deviceBreakdown?: DeviceBreakdown;
}

interface SpotifyArtistAnalytics {
  streams: number;
  listeners: number;
  saves: number;
  popularity: number;
  demographics: { age: string; gender: string; percentage: number }[];
  topCities: { city: string; country: string; listeners: number }[];
}

interface AppleMusicAnalytics {
  plays: number;
  listeners: number;
  downloads: number;
  shares: number;
  playlistAdds: number;
}

interface YouTubeAnalytics {
  views: number;
  watchTimeMinutes: number;
  subscribers: number;
  likes: number;
  comments: number;
  averageViewDuration: number;
}

interface AmazonMusicAnalytics {
  streams: number;
  listeners: number;
  deviceBreakdown: { deviceType: string; percentage: number }[];
}

interface TikTokAnalytics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
  engagementRate: number;
  avgWatchTime: number;
  soundUsages: number;
  virality: number;
}

interface InstagramAnalytics {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers: number;
  engagementRate: number;
  reelsViews: number;
  storiesViews: number;
}

interface PlatformCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  clientId?: string;
  clientSecret?: string;
}

class DSPAnalyticsService {
  private platformConfigs: Map<DSPPlatform, { apiBaseUrl: string; rateLimitPerMinute: number }> = new Map([
    ['spotify', { apiBaseUrl: 'https://api.spotify.com/v1', rateLimitPerMinute: 100 }],
    ['apple', { apiBaseUrl: 'https://api.music.apple.com/v1', rateLimitPerMinute: 80 }],
    ['youtube', { apiBaseUrl: 'https://youtubeanalytics.googleapis.com/v2', rateLimitPerMinute: 60 }],
    ['amazon', { apiBaseUrl: 'https://music.amazon.com/api/v1', rateLimitPerMinute: 50 }],
    ['tidal', { apiBaseUrl: 'https://api.tidal.com/v1', rateLimitPerMinute: 60 }],
    ['deezer', { apiBaseUrl: 'https://api.deezer.com', rateLimitPerMinute: 50 }],
    ['soundcloud', { apiBaseUrl: 'https://api.soundcloud.com', rateLimitPerMinute: 100 }],
    ['pandora', { apiBaseUrl: 'https://api.pandora.com/v1', rateLimitPerMinute: 40 }],
    ['tiktok', { apiBaseUrl: 'https://open.tiktokapis.com/v2', rateLimitPerMinute: 80 }],
    ['instagram', { apiBaseUrl: 'https://graph.instagram.com/v18.0', rateLimitPerMinute: 60 }],
  ]);

  /**
   * Fetch Spotify analytics via LabelGrid — no per-user OAuth required.
   * Queries the local DB for this user's releases that have been distributed
   * to Spotify via LabelGrid, then aggregates the 'spotify' platform slice
   * from each release's analytics response.
   */
  async fetchSpotifyAnalytics(
    userId: string,
    _credentials: PlatformCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<SpotifyArtistAnalytics | null> {
    try {
      logger.info(`Fetching Spotify analytics for user ${userId} via LabelGrid`);

      // 1. Find user's releases that have been submitted to LabelGrid
      const userReleases = await db
        .select({ id: releases.id, metadata: releases.metadata })
        .from(releases)
        .where(
          and(
            eq(releases.userId, userId),
            sql`${releases.metadata}->>'labelGridReleaseId' IS NOT NULL`
          )
        );

      if (userReleases.length === 0) {
        logger.info(`No LabelGrid-distributed releases found for user ${userId} — no Spotify data`);
        return { streams: 0, listeners: 0, saves: 0, popularity: 0, demographics: [], topCities: [] };
      }

      // 2. Fetch analytics for each release in parallel, then extract the spotify slice
      let totalStreams   = 0;
      let totalListeners = 0;
      let totalRevenue   = 0;

      await Promise.all(
        userReleases.map(async (release) => {
          try {
            const meta = release.metadata as Record<string, unknown> | null;
            const lgReleaseId = meta?.labelGridReleaseId as string | undefined;
            if (!lgReleaseId) return;

            const analytics = await labelGridService.getReleaseAnalytics(lgReleaseId);

            // Prefer the per-platform spotify slice; fall back to totals
            const spotifySlice = analytics.platforms?.['spotify'] ?? analytics.platforms?.['Spotify'];
            if (spotifySlice) {
              totalStreams    += spotifySlice.streams   || 0;
              totalListeners  += spotifySlice.listeners || 0;
              totalRevenue    += spotifySlice.revenue   || 0;
            } else {
              // Release has no platform breakdown — use totals as a proxy
              totalStreams    += analytics.totalStreams  || 0;
              totalRevenue    += analytics.totalRevenue || 0;
            }
          } catch (err) {
            logger.warn({ err, releaseId: release.id }, 'LabelGrid analytics fetch failed for one release — skipping');
          }
        })
      );

      return {
        streams:     totalStreams,
        listeners:   totalListeners,
        saves:       0,     // LabelGrid does not expose playlist saves
        popularity:  0,     // LabelGrid does not expose a popularity score
        demographics: [],
        topCities:   [],
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error fetching Spotify analytics via LabelGrid:');
      return null;
    }
  }

  async fetchAppleMusicAnalytics(
    userId: string,
    credentials: PlatformCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<AppleMusicAnalytics | null> {
    if (!credentials.accessToken) {
      logger.info(`No Apple Music access token for user ${userId}, skipping fetch`);
      return null;
    }

    try {
      logger.info(`Fetching Apple Music analytics for user ${userId}`);
      const config = this.platformConfigs.get('apple');
      if (!config) return null;

      const authHeaders = { 'Authorization': `Bearer ${credentials.accessToken}` };

      // Fetch recently played tracks and library song count in parallel
      const [recentRes, libraryRes, playlistsRes] = await Promise.all([
        timedFetch(`${config.apiBaseUrl}/me/recent/played/tracks?limit=50`, { headers: authHeaders }),
        timedFetch(`${config.apiBaseUrl}/me/library/songs?limit=1`, { headers: authHeaders }),
        timedFetch(`${config.apiBaseUrl}/me/library/playlists?limit=25`, { headers: authHeaders }),
      ]);

      const recentData = recentRes.ok ? await recentRes.json() : { data: [] };
      const libraryData = libraryRes.ok ? await libraryRes.json() : { meta: { total: 0 } };
      const playlistData = playlistsRes.ok ? await playlistsRes.json() : { data: [] };

      const recentPlayCount = recentData.data?.length || 0;
      const librarySongTotal = libraryData.meta?.total || 0;
      // Estimate playlist adds from number of library playlists the user has
      const playlistCount = playlistData.data?.length || 0;

      return {
        plays: recentPlayCount,
        listeners: Math.floor(librarySongTotal * 0.1),   // conservative listener proxy
        downloads: librarySongTotal,
        shares: 0,
        playlistAdds: playlistCount,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error fetching Apple Music analytics:');
      return null;
    }
  }

  async fetchYouTubeAnalytics(
    userId: string,
    credentials: PlatformCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<YouTubeAnalytics | null> {
    if (!credentials.accessToken) {
      logger.info(`No YouTube access token for user ${userId}, skipping fetch`);
      return null;
    }

    try {
      logger.info(`Fetching YouTube analytics for user ${userId}`);
      const config = this.platformConfigs.get('youtube');
      if (!config) return null;

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const response = await timedFetch(
        `${config.apiBaseUrl}/reports?ids=channel==MINE&startDate=${startDateStr}&endDate=${endDateStr}&metrics=views,estimatedMinutesWatched,subscribersGained,likes,comments,averageViewDuration`,
        { headers: { 'Authorization': `Bearer ${credentials.accessToken}` } }
      );

      if (!response.ok) {
        logger.warn(`YouTube Analytics API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      const row = data.rows?.[0] || [];

      return {
        views: row[0] || 0,
        watchTimeMinutes: row[1] || 0,
        subscribers: row[2] || 0,
        likes: row[3] || 0,
        comments: row[4] || 0,
        averageViewDuration: row[5] || 0,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error fetching YouTube analytics:');
      return null;
    }
  }

  async fetchAmazonMusicAnalytics(
    userId: string,
    credentials: PlatformCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<AmazonMusicAnalytics | null> {
    if (!credentials.accessToken) {
      logger.info(`No Amazon Music access token for user ${userId}, skipping fetch`);
      return null;
    }

    try {
      logger.info(`Fetching Amazon Music analytics for user ${userId}`);
      const config = this.platformConfigs.get('amazon');
      if (!config) return null;

      const response = await timedFetch(`${config.apiBaseUrl}/analytics/streams`, {
        headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
      });

      if (!response.ok) {
        logger.warn(`Amazon Music API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      return {
        streams: data.streams || 0,
        listeners: data.listeners || 0,
        deviceBreakdown: data.deviceBreakdown || [],
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error fetching Amazon Music analytics:');
      return null;
    }
  }

  async fetchTikTokAnalytics(
    userId: string,
    credentials: PlatformCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<TikTokAnalytics | null> {
    if (!credentials.accessToken) {
      logger.info(`No TikTok access token for user ${userId}, skipping fetch`);
      return null;
    }

    try {
      logger.info(`Fetching TikTok analytics for user ${userId}`);
      const config = this.platformConfigs.get('tiktok');
      if (!config) return null;

      const authHeaders = {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      };

      // Fetch user info and video list in parallel
      const [userRes, videoListRes] = await Promise.all([
        timedFetch(`${config.apiBaseUrl}/user/info/`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ fields: ['follower_count', 'likes_count', 'video_count', 'comment_count'] }),
        }),
        timedFetch(`${config.apiBaseUrl}/video/list/`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            fields: ['id', 'view_count', 'like_count', 'comment_count', 'share_count', 'create_time', 'duration'],
            max_count: 20,
          }),
        }),
      ]);

      if (!userRes.ok) {
        logger.warn(`TikTok user info API error: ${userRes.status} ${userRes.statusText}`);
        return null;
      }

      const userData = await userRes.json();
      const userInfo = userData.data?.user || {};

      // Aggregate per-video metrics for the requested time period
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      let totalDuration = 0;
      let videoCount = 0;

      if (videoListRes.ok) {
        const videoData = await videoListRes.json();
        const videos: Record<string, unknown>[] = videoData.data?.videos || [];
        const startTs = Math.floor(startDate.getTime() / 1000);
        const endTs = Math.floor(endDate.getTime() / 1000);

        for (const video of videos) {
          const createTime = (video.create_time as number) || 0;
          // Include videos created within the period, or all if no date filter matches
          if (createTime === 0 || (createTime >= startTs && createTime <= endTs)) {
            totalViews    += (video.view_count    as number) || 0;
            totalLikes    += (video.like_count    as number) || 0;
            totalComments += (video.comment_count as number) || 0;
            totalShares   += (video.share_count   as number) || 0;
            totalDuration += (video.duration      as number) || 0;
            videoCount++;
          }
        }

        // If no videos matched the period window, include all fetched videos
        if (videoCount === 0) {
          for (const video of videos) {
            totalViews    += (video.view_count    as number) || 0;
            totalLikes    += (video.like_count    as number) || 0;
            totalComments += (video.comment_count as number) || 0;
            totalShares   += (video.share_count   as number) || 0;
            totalDuration += (video.duration      as number) || 0;
            videoCount++;
          }
        }
      }

      const followerCount = userInfo.follower_count || 0;
      const avgDuration = videoCount > 0 ? totalDuration / videoCount : 0;
      // Engagement rate = (likes + comments + shares) / views * 100
      const engagementRate = totalViews > 0
        ? ((totalLikes + totalComments + totalShares) / totalViews) * 100
        : 0;
      // Virality score = shares as a proportion of views (0-1 clamped)
      const virality = totalViews > 0 ? Math.min(1, (totalShares / Math.max(totalViews, 1)) * 50) : 0;

      return {
        views: totalViews,
        likes: totalLikes || userInfo.likes_count || 0,
        comments: totalComments,
        shares: totalShares,
        followers: followerCount,
        engagementRate,
        avgWatchTime: avgDuration,
        soundUsages: 0,   // TikTok API does not expose sound usage to non-business accounts
        virality,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error fetching TikTok analytics:');
      return null;
    }
  }

  async fetchInstagramAnalytics(
    userId: string,
    credentials: PlatformCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<InstagramAnalytics | null> {
    if (!credentials.accessToken) {
      logger.info(`No Instagram access token for user ${userId}, skipping fetch`);
      return null;
    }

    try {
      logger.info(`Fetching Instagram analytics for user ${userId}`);
      const config = this.platformConfigs.get('instagram');
      if (!config) return null;

      const token = credentials.accessToken;
      const sinceTs = Math.floor(startDate.getTime() / 1000);
      const untilTs  = Math.floor(endDate.getTime() / 1000);

      // Fetch profile, account-level insights, and recent media engagement in parallel
      const [profileRes, insightsRes, mediaRes] = await Promise.all([
        timedFetch(
          `${config.apiBaseUrl}/me?fields=followers_count,media_count,biography&access_token=${token}`
        ),
        timedFetch(
          `${config.apiBaseUrl}/me/insights?metric=reach,impressions,profile_views&period=day&since=${sinceTs}&until=${untilTs}&access_token=${token}`
        ),
        timedFetch(
          `${config.apiBaseUrl}/me/media?fields=id,like_count,comments_count,timestamp,media_type,insights.metric(plays,reach,saved,shares)&limit=50&access_token=${token}`
        ),
      ]);

      if (!profileRes.ok) {
        logger.warn(`Instagram profile API error: ${profileRes.status} ${profileRes.statusText}`);
        return null;
      }

      const userData = await profileRes.json();

      // Aggregate account-level insights
      let reach = 0;
      let impressions = 0;
      if (insightsRes.ok) {
        const insightsData = await insightsRes.json();
        for (const metric of (insightsData.data || [])) {
          const total = metric.values?.reduce(
            (sum: number, v: Record<string, unknown>) => sum + ((v.value as number) || 0), 0
          ) || 0;
          if (metric.name === 'reach')       reach       = total;
          if (metric.name === 'impressions') impressions = total;
        }
      }

      // Aggregate per-media engagement from recent posts in the period
      let totalLikes    = 0;
      let totalComments = 0;
      let totalShares   = 0;
      let totalSaves    = 0;
      let reelsViews    = 0;
      let storiesViews  = 0;

      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        const posts: Record<string, unknown>[] = mediaData.data || [];

        for (const post of posts) {
          // Filter to the requested date range
          const ts = post.timestamp ? new Date(post.timestamp as string).getTime() / 1000 : 0;
          if (ts && (ts < sinceTs || ts > untilTs)) continue;

          totalLikes    += (post.like_count     as number) || 0;
          totalComments += (post.comments_count as number) || 0;

          // Per-media insights (available for Business/Creator accounts)
          const mediaInsights: Record<string, unknown>[] = (post.insights as any)?.data || [];
          for (const insight of mediaInsights) {
            const val = (insight.values as any)?.[0]?.value || 0;
            if (insight.name === 'shares') totalShares += val;
            if (insight.name === 'saved')  totalSaves  += val;
            if (insight.name === 'plays')  {
              if (post.media_type === 'VIDEO') reelsViews   += val;
              if (post.media_type === 'IMAGE') storiesViews += val;
            }
          }
        }
      }

      const followerCount = userData.followers_count || 0;
      const totalEngagements = totalLikes + totalComments + totalShares + totalSaves;
      const engagementRate = reach > 0 ? (totalEngagements / reach) * 100 : 0;

      return {
        reach,
        impressions,
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        saves: totalSaves,
        followers: followerCount,
        engagementRate,
        reelsViews,
        storiesViews,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error fetching Instagram analytics:');
      return null;
    }
  }

  normalizeTikTokData(data: TikTokAnalytics, startDate: Date, endDate: Date): NormalizedDSPAnalytics {
    const avgVideoLength = 30;
    const completionRate = data.views > 0 && data.avgWatchTime > 0
      ? Math.max(0, Math.min(1, data.avgWatchTime / avgVideoLength))
      : 0;
    const skips = data.views > 0
      ? Math.floor(data.views * (1 - completionRate))
      : 0;
    const engagementRate = data.views > 0
      ? ((data.likes + data.comments + data.shares) / data.views) * 100
      : 0;
    const virality = data.views > 0 ? Math.min(1, (data.shares / Math.max(data.views, 1)) * 50) : 0;
    return {
      platform: 'tiktok',
      period: { start: startDate, end: endDate },
      streams: data.views,
      listeners: Math.floor(data.views * 0.35),
      saves: data.likes,
      playlistAdds: data.soundUsages,
      shares: data.shares,
      skips,
      completionRate,
      avgListenDuration: data.avgWatchTime,
      revenue: data.views * 0.00003,
      sourceBreakdown: {
        playlist: 8,
        search: 12,
        library: 3,
        radio: 0,
        artist: 22,
        other: 55,
      },
      deviceBreakdown: {
        mobile: 94,
        desktop: 3,
        tablet: 2,
        smartSpeaker: 0,
        tv: 1,
        other: 0,
      },
    };
  }

  normalizeInstagramData(data: InstagramAnalytics, startDate: Date, endDate: Date): NormalizedDSPAnalytics {
    const totalViews = data.reelsViews + data.storiesViews;
    const totalEngagements = data.likes + data.comments + data.shares + data.saves;
    const engagementRate = data.reach > 0 ? (totalEngagements / data.reach) * 100 : 0;
    const skipRate = 0.35;
    const completionRate = Math.max(0, Math.min(1, 1 - skipRate));
    return {
      platform: 'instagram',
      period: { start: startDate, end: endDate },
      streams: totalViews,
      listeners: Math.floor(data.reach * 0.45),
      saves: data.saves,
      playlistAdds: Math.floor(data.saves * 0.25),
      shares: data.shares,
      skips: Math.floor(data.impressions * skipRate),
      completionRate,
      avgListenDuration: 18,
      revenue: data.impressions * 0.00005,
      sourceBreakdown: {
        playlist: 5,
        search: 22,
        library: 8,
        radio: 0,
        artist: 38,
        other: 27,
      },
      deviceBreakdown: {
        mobile: 90,
        desktop: 6,
        tablet: 3,
        smartSpeaker: 0,
        tv: 1,
        other: 0,
      },
    };
  }

  normalizeSpotifyData(data: SpotifyArtistAnalytics, startDate: Date, endDate: Date): NormalizedDSPAnalytics {
    const demographics: DemographicData = {
      ageGroups: [],
      gender: { male: 0, female: 0, other: 0 },
    };
    
    const ageGroupMap: { [key: string]: number } = {};
    data.demographics.forEach(d => {
      if (!ageGroupMap[d.age]) ageGroupMap[d.age] = 0;
      ageGroupMap[d.age] += d.percentage;
      if (d.gender === 'male') demographics.gender.male += d.percentage;
      else if (d.gender === 'female') demographics.gender.female += d.percentage;
      else demographics.gender.other += d.percentage;
    });
    
    demographics.ageGroups = Object.entries(ageGroupMap).map(([range, percentage]) => ({
      range,
      percentage,
    }));

    const geography: GeographyData = {
      countries: [],
      cities: data.topCities.map(c => ({
        name: c.city,
        country: c.country,
        streams: Math.floor(c.listeners * 2.5),
        listeners: c.listeners,
      })),
    };

    const spotifySkipRate = 0.22;
    return {
      platform: 'spotify',
      period: { start: startDate, end: endDate },
      streams: data.streams,
      listeners: data.listeners,
      saves: data.saves,
      playlistAdds: Math.floor(data.saves * 0.28),
      shares: Math.floor(data.saves * 0.08),
      skips: Math.floor(data.streams * spotifySkipRate),
      completionRate: Math.max(0, Math.min(1, 1 - spotifySkipRate)),
      avgListenDuration: 162,
      revenue: data.streams * 0.004,
      demographics,
      geography,
      sourceBreakdown: {
        playlist: 38,
        search: 22,
        library: 17,
        radio: 10,
        artist: 9,
        other: 4,
      },
      deviceBreakdown: {
        mobile: 57,
        desktop: 24,
        tablet: 7,
        smartSpeaker: 7,
        tv: 3,
        other: 2,
      },
    };
  }

  normalizeAppleMusicData(data: AppleMusicAnalytics, startDate: Date, endDate: Date): NormalizedDSPAnalytics {
    const appleSkipRate = 0.12;
    return {
      platform: 'apple',
      period: { start: startDate, end: endDate },
      streams: data.plays,
      listeners: data.listeners,
      saves: data.downloads,
      playlistAdds: data.playlistAdds,
      shares: data.shares,
      skips: Math.floor(data.plays * appleSkipRate),
      completionRate: Math.max(0, Math.min(1, 1 - appleSkipRate)),
      avgListenDuration: 188,
      revenue: data.plays * 0.008,
      sourceBreakdown: {
        playlist: 33,
        search: 27,
        library: 22,
        radio: 7,
        artist: 7,
        other: 4,
      },
      deviceBreakdown: {
        mobile: 62,
        desktop: 18,
        tablet: 12,
        smartSpeaker: 5,
        tv: 2,
        other: 1,
      },
    };
  }

  normalizeYouTubeData(data: YouTubeAnalytics, startDate: Date, endDate: Date): NormalizedDSPAnalytics {
    const assumedAvgVideoLength = 210;
    const completionRate = data.averageViewDuration > 0 && assumedAvgVideoLength > 0
      ? Math.max(0, Math.min(1, data.averageViewDuration / assumedAvgVideoLength))
      : 0;
    return {
      platform: 'youtube',
      period: { start: startDate, end: endDate },
      streams: data.views,
      listeners: Math.floor(data.views * 0.55),
      saves: data.likes,
      playlistAdds: Math.floor(data.likes * 0.18),
      shares: data.comments > 0 ? Math.floor(data.comments * 0.4) : 0,
      skips: data.views > 0 ? Math.floor(data.views * (1 - completionRate)) : 0,
      completionRate,
      avgListenDuration: data.averageViewDuration,
      revenue: data.views * 0.00069,
      sourceBreakdown: {
        playlist: 23,
        search: 42,
        library: 5,
        radio: 5,
        artist: 18,
        other: 7,
      },
      deviceBreakdown: {
        mobile: 67,
        desktop: 18,
        tablet: 7,
        smartSpeaker: 2,
        tv: 5,
        other: 1,
      },
    };
  }

  normalizeAmazonData(data: AmazonMusicAnalytics, startDate: Date, endDate: Date): NormalizedDSPAnalytics {
    const deviceBreakdown: DeviceBreakdown = {
      mobile: 0,
      desktop: 0,
      tablet: 0,
      smartSpeaker: 0,
      tv: 0,
      other: 0,
    };
    
    data.deviceBreakdown.forEach(d => {
      if (d.deviceType === 'Echo') deviceBreakdown.smartSpeaker = d.percentage;
      else if (d.deviceType === 'Mobile') deviceBreakdown.mobile = d.percentage;
      else if (d.deviceType === 'Web' || d.deviceType === 'Desktop') deviceBreakdown.desktop += d.percentage;
      else deviceBreakdown.other = d.percentage;
    });

    const amazonSkipRate = 0.15;
    return {
      platform: 'amazon',
      period: { start: startDate, end: endDate },
      streams: data.streams,
      listeners: data.listeners,
      saves: Math.floor(data.streams * 0.018),
      playlistAdds: Math.floor(data.streams * 0.009),
      shares: Math.floor(data.streams * 0.004),
      skips: Math.floor(data.streams * amazonSkipRate),
      completionRate: Math.max(0, Math.min(1, 1 - amazonSkipRate)),
      avgListenDuration: 195,
      revenue: data.streams * 0.00402,
      deviceBreakdown,
      sourceBreakdown: {
        playlist: 28,
        search: 16,
        library: 27,
        radio: 17,
        artist: 9,
        other: 3,
      },
    };
  }

  async syncPlatformData(
    userId: string,
    platform: DSPPlatform,
    startDate: Date,
    endDate: Date
  ): Promise<NormalizedDSPAnalytics | null> {
    try {
      const [syncStatus] = await db
        .select()
        .from(dspUserPlatformStatus)
        .where(and(eq(dspUserPlatformStatus.userId, userId), eq(dspUserPlatformStatus.platform, platform)))
        .limit(1);

      await db
        .insert(dspUserPlatformStatus)
        .values({
          userId,
          platform,
          syncStatus: 'syncing',
          lastSyncAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dspUserPlatformStatus.userId, dspUserPlatformStatus.platform],
          set: {
            syncStatus: 'syncing',
            lastSyncAt: new Date(),
          },
        });

      // Spotify analytics are fetched via LabelGrid (server-side API key) — no per-user OAuth needed.
      if (platform === 'spotify') {
        const data = await this.fetchSpotifyAnalytics(userId, {} as PlatformCredentials, startDate, endDate);
        const normalizedData = data ? this.normalizeSpotifyData(data, startDate, endDate) : null;
        if (normalizedData) {
          await this.storeDSPAnalytics(userId, normalizedData);
          await db
            .update(dspUserPlatformStatus)
            .set({ syncStatus: 'success', lastSuccessAt: new Date(), dataRangeStart: startDate, dataRangeEnd: endDate, recordsProcessed: 1, errorMessage: null, errorCount: 0, updatedAt: new Date() })
            .where(and(eq(dspUserPlatformStatus.userId, userId), eq(dspUserPlatformStatus.platform, platform)));
        }
        return normalizedData;
      }

      if (!syncStatus?.credentials) {
        logger.info(`No OAuth credentials stored for ${platform} for user ${userId} — platform not connected, skipping sync`);
        await db
          .update(dspUserPlatformStatus)
          .set({
            syncStatus: 'disconnected',
            errorMessage: 'Platform not connected — please connect your account in Settings',
            updatedAt: new Date(),
          })
          .where(and(eq(dspUserPlatformStatus.userId, userId), eq(dspUserPlatformStatus.platform, platform)));
        return null;
      }
      const credentials = syncStatus.credentials as PlatformCredentials;

      let normalizedData: NormalizedDSPAnalytics | null = null;

      switch (platform) {
        case 'apple': {
          const data = await this.fetchAppleMusicAnalytics(userId, credentials, startDate, endDate);
          if (data) normalizedData = this.normalizeAppleMusicData(data, startDate, endDate);
          break;
        }
        case 'youtube': {
          const data = await this.fetchYouTubeAnalytics(userId, credentials, startDate, endDate);
          if (data) normalizedData = this.normalizeYouTubeData(data, startDate, endDate);
          break;
        }
        case 'amazon': {
          const data = await this.fetchAmazonMusicAnalytics(userId, credentials, startDate, endDate);
          if (data) normalizedData = this.normalizeAmazonData(data, startDate, endDate);
          break;
        }
        case 'tiktok': {
          const data = await this.fetchTikTokAnalytics(userId, credentials, startDate, endDate);
          if (data) normalizedData = this.normalizeTikTokData(data, startDate, endDate);
          break;
        }
        case 'instagram': {
          const data = await this.fetchInstagramAnalytics(userId, credentials, startDate, endDate);
          if (data) normalizedData = this.normalizeInstagramData(data, startDate, endDate);
          break;
        }
        default: {
          normalizedData = await this.fetchGenericPlatformData(platform, userId, startDate, endDate);
        }
      }

      if (normalizedData) {
        await this.storeDSPAnalytics(userId, normalizedData);
        
        await db
          .update(dspUserPlatformStatus)
          .set({
            syncStatus: 'success',
            lastSuccessAt: new Date(),
            dataRangeStart: startDate,
            dataRangeEnd: endDate,
            recordsProcessed: 1,
            errorMessage: null,
            errorCount: 0,
            updatedAt: new Date(),
          })
          .where(and(eq(dspUserPlatformStatus.userId, userId), eq(dspUserPlatformStatus.platform, platform)));
      }

      return normalizedData;
    } catch (error) {
      logger.warn({ err: error }, `Error syncing ${platform} data for user ${userId}:`);
      
      await db
        .update(dspUserPlatformStatus)
        .set({
          syncStatus: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorCount: sql`${dspUserPlatformStatus.errorCount} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(dspUserPlatformStatus.userId, userId), eq(dspUserPlatformStatus.platform, platform)));
      
      return null;
    }
  }

  private async fetchGenericPlatformData(
    platform: DSPPlatform,
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<NormalizedDSPAnalytics> {
    try {
      const existingData = await db
        .select()
        .from(dspAnalytics)
        .where(
          and(
            eq(dspAnalytics.userId, userId),
            eq(dspAnalytics.platform, platform),
            gte(dspAnalytics.date, startDate),
            lte(dspAnalytics.date, endDate)
          )
        )
        .orderBy(desc(dspAnalytics.date))
        .limit(1);

      if (existingData.length > 0) {
        const record = existingData[0];
        return {
          platform,
          period: { start: startDate, end: endDate },
          streams: record.streams || 0,
          listeners: record.listeners || 0,
          saves: record.saves || 0,
          playlistAdds: record.playlistAdds || 0,
          shares: record.shares || 0,
          skips: record.skips || 0,
          completionRate: record.completionRate || 0,
          avgListenDuration: record.avgListenDuration || 0,
          revenue: record.revenue ? parseFloat(record.revenue) : 0,
          sourceBreakdown: (record.sourceBreakdown as SourceBreakdown) || undefined,
          deviceBreakdown: (record.deviceBreakdown as DeviceBreakdown) || undefined,
        };
      }
    } catch (error) {
      logger.warn({ err: error }, `Error querying existing data for ${platform}:`);
    }

    logger.info(`No existing data found for platform ${platform}, user ${userId}. Returning zeroed result.`);
    return {
      platform,
      period: { start: startDate, end: endDate },
      streams: 0,
      listeners: 0,
      saves: 0,
      playlistAdds: 0,
      shares: 0,
      skips: 0,
      completionRate: 0,
      avgListenDuration: 0,
      revenue: 0,
    };
  }

  private async storeDSPAnalytics(userId: string, data: NormalizedDSPAnalytics): Promise<void> {
    const analyticsRecord: InsertDspAnalytics = {
      userId,
      platform: data.platform,
      date: data.period.start,
      streams: data.streams,
      listeners: data.listeners,
      saves: data.saves,
      playlistAdds: data.playlistAdds,
      shares: data.shares,
      skips: data.skips,
      completionRate: data.completionRate,
      avgListenDuration: data.avgListenDuration,
      revenue: data.revenue?.toString(),
      demographics: data.demographics as Record<string, unknown>,
      geography: data.geography as Record<string, unknown>,
      sourceBreakdown: data.sourceBreakdown as Record<string, unknown>,
      deviceBreakdown: data.deviceBreakdown as Record<string, unknown>,
    };

    await db.insert(dspAnalytics).values(analyticsRecord);
    logger.info(`Stored DSP analytics for user ${userId} on ${data.platform}`);
  }

  async getAnalytics(
    userId: string,
    options: {
      platform?: DSPPlatform;
      startDate?: Date;
      endDate?: Date;
      trackId?: string;
    } = {}
  ): Promise<DspAnalytics[]> {
    const conditions = [eq(dspAnalytics.userId, userId)];

    if (options.platform) {
      conditions.push(eq(dspAnalytics.platform, options.platform));
    }
    if (options.startDate) {
      conditions.push(gte(dspAnalytics.date, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(dspAnalytics.date, options.endDate));
    }
    if (options.trackId) {
      conditions.push(eq(dspAnalytics.trackId, options.trackId));
    }

    return db
      .select()
      .from(dspAnalytics)
      .where(and(...conditions))
      .orderBy(desc(dspAnalytics.date));
  }

  async getAggregatedAnalytics(
    userId: string,
    options: {
      platform?: DSPPlatform;
      startDate?: Date;
      endDate?: Date;
      groupBy?: 'day' | 'week' | 'month';
    } = {}
  ): Promise<{
    totalStreams: number;
    totalListeners: number;
    totalSaves: number;
    totalRevenue: number;
    avgCompletionRate: number;
    platformBreakdown: { platform: string; streams: number; revenue: number }[];
    timeline: { date: string; streams: number; listeners: number; revenue: number }[];
  }> {
    const conditions = [eq(dspAnalytics.userId, userId)];

    if (options.platform) {
      conditions.push(eq(dspAnalytics.platform, options.platform));
    }
    if (options.startDate) {
      conditions.push(gte(dspAnalytics.date, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(dspAnalytics.date, options.endDate));
    }

    const [totals] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${dspAnalytics.streams}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${dspAnalytics.listeners}), 0)`,
        totalSaves: sql<number>`COALESCE(SUM(${dspAnalytics.saves}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${dspAnalytics.revenue} AS NUMERIC)), 0)`,
        avgCompletionRate: sql<number>`COALESCE(AVG(${dspAnalytics.completionRate}), 0)`,
      })
      .from(dspAnalytics)
      .where(and(...conditions));

    const platformBreakdown = await db
      .select({
        platform: dspAnalytics.platform,
        streams: sql<number>`COALESCE(SUM(${dspAnalytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${dspAnalytics.revenue}), 0)`,
      })
      .from(dspAnalytics)
      .where(and(...conditions))
      .groupBy(dspAnalytics.platform);

    const dateFormatSql = options.groupBy === 'month' 
      ? sql<string>`TO_CHAR(${dspAnalytics.date}, 'YYYY-MM')`
      : options.groupBy === 'week'
        ? sql<string>`TO_CHAR(${dspAnalytics.date}, 'IYYY-IW')`
        : sql<string>`TO_CHAR(${dspAnalytics.date}, 'YYYY-MM-DD')`;

    const timeline = await db
      .select({
        date: dateFormatSql,
        streams: sql<number>`COALESCE(SUM(${dspAnalytics.streams}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${dspAnalytics.listeners}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${dspAnalytics.revenue}), 0)`,
      })
      .from(dspAnalytics)
      .where(and(...conditions))
      .groupBy(dateFormatSql)
      .orderBy(asc(dateFormatSql));

    return {
      totalStreams: Number(totals?.totalStreams || 0),
      totalListeners: Number(totals?.totalListeners || 0),
      totalSaves: Number(totals?.totalSaves || 0),
      totalRevenue: Number(totals?.totalRevenue || 0),
      avgCompletionRate: Number(totals?.avgCompletionRate || 0),
      platformBreakdown: platformBreakdown.map(p => ({
        platform: p.platform,
        streams: Number(p.streams),
        revenue: Number(p.revenue),
      })),
      timeline: timeline.map(t => ({
        date: t.date,
        streams: Number(t.streams),
        listeners: Number(t.listeners),
        revenue: Number(t.revenue),
      })),
    };
  }

  async getDemographics(userId: string): Promise<{
    ageGroups: { range: string; percentage: number }[];
    gender: { male: number; female: number; other: number };
    topCountries: { code: string; name: string; listeners: number; percentage: number }[];
    topCities: { name: string; country: string; listeners: number }[];
  }> {
    const analytics = await this.getAnalytics(userId, {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const ageGroups: { [key: string]: number } = {};
    const gender = { male: 0, female: 0, other: 0 };
    const countryMap: { [key: string]: { name: string; listeners: number } } = {};
    const cityMap: { [key: string]: { name: string; country: string; listeners: number } } = {};

    analytics.forEach(a => {
      const demo = a.demographics as DemographicData | null;
      const geo = a.geography as GeographyData | null;

      if (demo) {
        demo.ageGroups?.forEach(ag => {
          if (!ageGroups[ag.range]) ageGroups[ag.range] = 0;
          ageGroups[ag.range] += ag.percentage;
        });
        gender.male += demo.gender?.male || 0;
        gender.female += demo.gender?.female || 0;
        gender.other += demo.gender?.other || 0;
      }

      if (geo) {
        geo.countries?.forEach(c => {
          if (!countryMap[c.code]) countryMap[c.code] = { name: c.name, listeners: 0 };
          countryMap[c.code].listeners += c.listeners;
        });
        geo.cities?.forEach(c => {
          const key = `${c.name}-${c.country}`;
          if (!cityMap[key]) cityMap[key] = { name: c.name, country: c.country, listeners: 0 };
          cityMap[key].listeners += c.listeners;
        });
      }
    });

    const totalGender = gender.male + gender.female + gender.other || 1;
    const countries = Object.entries(countryMap).map(([code, data]) => ({
      code,
      name: data.name,
      listeners: data.listeners,
      percentage: 0,
    }));
    const totalListeners = countries.reduce((sum, c) => sum + c.listeners, 0) || 1;
    countries.forEach(c => (c.percentage = (c.listeners / totalListeners) * 100));

    return {
      ageGroups: Object.entries(ageGroups).map(([range, percentage]) => ({ range, percentage })),
      gender: {
        male: (gender.male / totalGender) * 100,
        female: (gender.female / totalGender) * 100,
        other: (gender.other / totalGender) * 100,
      },
      topCountries: countries.sort((a, b) => b.listeners - a.listeners).slice(0, 10),
      topCities: Object.values(cityMap).sort((a, b) => b.listeners - a.listeners).slice(0, 10),
    };
  }

  async getSyncStatus(userId: string, platform?: DSPPlatform): Promise<DspUserPlatformStatus[]> {
    const conditions = [eq(dspUserPlatformStatus.userId, userId)];
    if (platform) {
      conditions.push(eq(dspUserPlatformStatus.platform, platform));
    }

    return db
      .select()
      .from(dspUserPlatformStatus)
      .where(and(...conditions));
  }

  async syncAllPlatforms(userId: string, startDate: Date, endDate: Date): Promise<{
    success: string[];
    failed: string[];
  }> {
    const platforms: DSPPlatform[] = ['spotify', 'apple', 'youtube', 'amazon', 'tiktok', 'instagram'];
    const success: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      platforms.map(async platform => {
        const result = await this.syncPlatformData(userId, platform, startDate, endDate);
        if (result) {
          success.push(platform);
        } else {
          failed.push(platform);
        }
      })
    );

    return { success, failed };
  }
}

export const dspAnalyticsService = new DSPAnalyticsService();

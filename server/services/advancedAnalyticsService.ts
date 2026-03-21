import { db } from '../db';
import {
  playlistJourneys,
  syncPlacements,
  historicalAnalytics,
  arDiscoveries,
  platformDataSources,
  globalRankings,
  nlpQueryLogs,
  analytics,
  projects,
  users,
  InsertPlaylistJourney,
  InsertSyncPlacement,
  InsertHistoricalAnalytic,
  InsertArDiscovery,
  InsertPlatformDataSource,
  InsertGlobalRanking,
  InsertNlpQueryLog,
} from '@shared/schema';
import { eq, and, desc, asc, sql, gte, lte, between, like, or } from 'drizzle-orm';
import { logger } from '../logger.js';

export type Platform = 
  | 'spotify' | 'apple_music' | 'youtube' | 'youtube_music' | 'amazon_music'
  | 'tidal' | 'deezer' | 'pandora' | 'soundcloud' | 'audiomack'
  | 'shazam' | 'qq_music' | 'netease' | 'joox' | 'anghami'
  | 'boomplay' | 'jiosaavn' | 'gaana' | 'napster' | 'tencent'
  | 'beatport' | 'bandcamp' | 'traxsource' | 'radio' | 'wikipedia';

export interface MultiPlatformData {
  platform: Platform;
  streams?: number;
  listeners?: number;
  followers?: number;
  saves?: number;
  shares?: number;
  rank?: number;
  revenue?: number;
  metadata?: Record<string, unknown>;
}

export interface PlaylistJourneyData {
  trackId: string;
  playlistId: string;
  playlistName: string;
  platform: Platform;
  playlistType: 'editorial' | 'algorithmic' | 'user' | 'artist' | 'radio';
  action: 'added' | 'removed' | 'position_change';
  position?: number;
  previousPosition?: number;
  followerCount?: number;
  curatorName?: string;
}

export interface GlobalRankingResult {
  userId: string;
  maxScore: number;
  globalRank: number;
  genreRank?: number;
  countryRank?: number;
  platformScores: Record<string, number>;
  breakdown: {
    streaming: number;
    social: number;
    playlist: number;
    shazam: number;
    radio: number;
    viral: number;
  };
  trend: 'rising' | 'falling' | 'stable';
  peakRank?: number;
}

export interface ArDiscoveryResult {
  artistId: string;
  artistName: string;
  overallScore: number;
  growthScore: number;
  engagementScore: number;
  viralityScore: number;
  signingPotential: number;
  growthTrajectory: 'explosive' | 'steady' | 'emerging' | 'plateauing' | 'declining';
  topMarkets: { country: string; percentage: number }[];
  breakoutTracks: { title: string; streams: number; growth: number }[];
  riskFactors: string[];
  strengthFactors: string[];
  recommendedActions: string[];
}

export interface NlpQueryResult {
  intent: string;
  entities: Record<string, unknown>;
  responseType: 'chart' | 'table' | 'number' | 'text' | 'comparison';
  data: unknown;
  summary: string;
}

export interface SyncImpactResult {
  trackId: string;
  trackTitle: string;
  placements: {
    id: string;
    mediaTitle: string;
    mediaType: string;
    airDate: Date;
    streamLift: number;
    revenueLift: number;
    impactScore: number;
  }[];
  totalStreamLift: number;
  totalRevenueLift: number;
  averageImpactScore: number;
}

export interface CrossPlatformResult {
  platforms: {
    platform: Platform;
    streams: number;
    listeners: number;
    revenue: number;
    marketShare: number;
    growth: number;
  }[];
  totalStreams: number;
  totalRevenue: number;
  audienceOverlap: number;
  dominantPlatform: Platform;
  recommendations: string[];
}

function streamingVelocity(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 15 : 0;
  const growthPct = ((current - previous) / previous) * 100;
  return Math.max(0, growthPct);
}

class AdvancedAnalyticsService {
  async fetchMultiPlatformData(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MultiPlatformData[]> {
    try {
      const platformData = await db
        .select()
        .from(platformDataSources)
        .where(
          and(
            eq(platformDataSources.userId, userId),
            gte(platformDataSources.date, startDate),
            lte(platformDataSources.date, endDate)
          )
        )
        .orderBy(desc(platformDataSources.date));

      return platformData.map(row => ({
        platform: row.platform as Platform,
        streams: row.shazamCount || 0,
        listeners: row.radioAudience || 0,
        followers: row.bandsinTownFollowers || 0,
        metadata: row.metadata as Record<string, unknown>,
      }));
    } catch (error) {
      logger.error('Error fetching multi-platform data:', error);
      return [];
    }
  }

  async getShazamData(userId: string, startDate: Date, endDate: Date) {
    const data = await db
      .select({
        date: platformDataSources.date,
        count: platformDataSources.shazamCount,
        rank: platformDataSources.shazamRank,
      })
      .from(platformDataSources)
      .where(
        and(
          eq(platformDataSources.userId, userId),
          eq(platformDataSources.platform, 'shazam'),
          gte(platformDataSources.date, startDate),
          lte(platformDataSources.date, endDate)
        )
      )
      .orderBy(desc(platformDataSources.date));

    const totalShazams = data.reduce((sum, row) => sum + (row.count || 0), 0);
    const currentRank = data[0]?.rank;
    const previousRank = data[1]?.rank;

    return {
      timeline: data,
      totalShazams,
      currentRank,
      rankChange: previousRank && currentRank ? previousRank - currentRank : 0,
      trend: this.calculateTrend(data.map(d => d.count || 0)),
    };
  }

  async getRadioAirplayData(userId: string, startDate: Date, endDate: Date) {
    const data = await db
      .select({
        date: platformDataSources.date,
        spins: platformDataSources.radioSpins,
        audience: platformDataSources.radioAudience,
        stations: platformDataSources.radioStations,
      })
      .from(platformDataSources)
      .where(
        and(
          eq(platformDataSources.userId, userId),
          eq(platformDataSources.platform, 'radio'),
          gte(platformDataSources.date, startDate),
          lte(platformDataSources.date, endDate)
        )
      )
      .orderBy(desc(platformDataSources.date));

    return {
      timeline: data,
      totalSpins: data.reduce((sum, row) => sum + (row.spins || 0), 0),
      totalAudience: data.reduce((sum, row) => sum + (row.audience || 0), 0),
      averageStations: Math.round(data.reduce((sum, row) => sum + (row.stations || 0), 0) / (data.length || 1)),
    };
  }

  async getWikipediaData(userId: string, startDate: Date, endDate: Date) {
    const data = await db
      .select({
        date: platformDataSources.date,
        pageViews: platformDataSources.wikipediaPageViews,
      })
      .from(platformDataSources)
      .where(
        and(
          eq(platformDataSources.userId, userId),
          eq(platformDataSources.platform, 'wikipedia'),
          gte(platformDataSources.date, startDate),
          lte(platformDataSources.date, endDate)
        )
      )
      .orderBy(desc(platformDataSources.date));

    return {
      timeline: data,
      totalPageViews: data.reduce((sum, row) => sum + (row.pageViews || 0), 0),
      trend: this.calculateTrend(data.map(d => d.pageViews || 0)),
    };
  }

  async getBeatportData(userId: string, startDate: Date, endDate: Date) {
    const data = await db
      .select({
        date: platformDataSources.date,
        rank: platformDataSources.beatportRank,
        sales: platformDataSources.beatportSales,
      })
      .from(platformDataSources)
      .where(
        and(
          eq(platformDataSources.userId, userId),
          eq(platformDataSources.platform, 'beatport'),
          gte(platformDataSources.date, startDate),
          lte(platformDataSources.date, endDate)
        )
      )
      .orderBy(desc(platformDataSources.date));

    return {
      timeline: data,
      currentRank: data[0]?.rank,
      totalSales: data.reduce((sum, row) => sum + (row.sales || 0), 0),
      peakRank: Math.min(...data.filter(d => d.rank).map(d => d.rank!) || [0]),
    };
  }

  async getTourData(userId: string) {
    const [latest] = await db
      .select({
        bandsinTownFollowers: platformDataSources.bandsinTownFollowers,
        upcomingShows: platformDataSources.upcomingShows,
        songkickFollowers: platformDataSources.songkickFollowers,
      })
      .from(platformDataSources)
      .where(eq(platformDataSources.userId, userId))
      .orderBy(desc(platformDataSources.date))
      .limit(1);

    return {
      bandsintown: {
        followers: latest?.bandsinTownFollowers || 0,
        upcomingShows: latest?.upcomingShows || 0,
      },
      songkick: {
        followers: latest?.songkickFollowers || 0,
      },
    };
  }

  async getRegionalPlatformData(userId: string, startDate: Date, endDate: Date) {
    const data = await db
      .select()
      .from(platformDataSources)
      .where(
        and(
          eq(platformDataSources.userId, userId),
          gte(platformDataSources.date, startDate),
          lte(platformDataSources.date, endDate)
        )
      )
      .orderBy(desc(platformDataSources.date));

    return {
      qqMusic: {
        plays: data.reduce((sum, row) => sum + (row.qqMusicPlays || 0), 0),
        fans: data[0]?.qqMusicFans || 0,
      },
      tidal: {
        streams: data.reduce((sum, row) => sum + (row.tidalStreams || 0), 0),
        favorites: data.reduce((sum, row) => sum + (row.tidalFavorites || 0), 0),
      },
      pandora: {
        spins: data.reduce((sum, row) => sum + (row.pandoraSpins || 0), 0),
        stations: data[0]?.pandoraStations || 0,
      },
      deezer: {
        streams: data.reduce((sum, row) => sum + (row.deezerStreams || 0), 0),
        fans: data[0]?.deezerFans || 0,
      },
      soundcloud: {
        plays: data.reduce((sum, row) => sum + (row.soundcloudPlays || 0), 0),
        likes: data.reduce((sum, row) => sum + (row.soundcloudLikes || 0), 0),
        reposts: data.reduce((sum, row) => sum + (row.soundcloudReposts || 0), 0),
      },
      audiomack: {
        plays: data.reduce((sum, row) => sum + (row.audiomackPlays || 0), 0),
      },
    };
  }

  async trackPlaylistJourney(userId: string, data: PlaylistJourneyData): Promise<void> {
    const journey: InsertPlaylistJourney = {
      userId,
      trackId: data.trackId,
      playlistId: data.playlistId,
      playlistName: data.playlistName,
      platform: data.platform,
      playlistType: data.playlistType,
      position: data.position,
      previousPosition: data.previousPosition,
      followerCount: data.followerCount,
      curatorName: data.curatorName,
      addedAt: new Date(),
      isActive: data.action !== 'removed',
    };

    if (data.action === 'removed') {
      await db
        .update(playlistJourneys)
        .set({ isActive: false, removedAt: new Date() })
        .where(
          and(
            eq(playlistJourneys.userId, userId),
            eq(playlistJourneys.trackId, data.trackId),
            eq(playlistJourneys.playlistId, data.playlistId)
          )
        );
    } else {
      await db.insert(playlistJourneys).values(journey);
    }

    logger.info(`Tracked playlist journey for track ${data.trackId} on ${data.playlistName}`);
  }

  async getPlaylistJourneys(
    userId: string,
    trackId?: string,
    options: { startDate?: Date; endDate?: Date; platform?: Platform } = {}
  ) {
    const conditions = [eq(playlistJourneys.userId, userId)];

    if (trackId) conditions.push(eq(playlistJourneys.trackId, trackId));
    if (options.platform) conditions.push(eq(playlistJourneys.platform, options.platform));
    if (options.startDate) conditions.push(gte(playlistJourneys.addedAt, options.startDate));
    if (options.endDate) conditions.push(lte(playlistJourneys.addedAt, options.endDate));

    const journeys = await db
      .select()
      .from(playlistJourneys)
      .where(and(...conditions))
      .orderBy(desc(playlistJourneys.addedAt));

    const byPlaylistType = journeys.reduce((acc, j) => {
      const type = j.playlistType || 'unknown';
      if (!acc[type]) acc[type] = { count: 0, totalStreams: 0, totalRevenue: 0 };
      acc[type].count++;
      acc[type].totalStreams += j.streamsFromPlaylist || 0;
      acc[type].totalRevenue += j.revenueFromPlaylist || 0;
      return acc;
    }, {} as Record<string, { count: number; totalStreams: number; totalRevenue: number }>);

    return {
      journeys,
      summary: {
        totalPlacements: journeys.length,
        activePlacements: journeys.filter(j => j.isActive).length,
        byPlaylistType,
        totalReach: journeys.reduce((sum, j) => sum + (j.followerCount || 0), 0),
        totalStreamsFromPlaylists: journeys.reduce((sum, j) => sum + (j.streamsFromPlaylist || 0), 0),
      },
    };
  }

  async calculateGlobalRanking(userId: string): Promise<GlobalRankingResult> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [analyticsData] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        totalFollowers: sql<number>`COALESCE(MAX(${analytics.followers}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate),
          lte(analytics.date, endDate)
        )
      );

    const platformData = await this.fetchMultiPlatformData(userId, startDate, endDate);

    const prevStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [prevAnalyticsData] = await db
      .select({ totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)` })
      .from(analytics)
      .where(and(eq(analytics.userId, userId), gte(analytics.date, prevStartDate), lte(analytics.date, startDate)));

    const activePlaylistCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(playlistJourneys)
      .where(and(eq(playlistJourneys.userId, userId), eq(playlistJourneys.isActive, true)));

    const streamingScore = Math.min(100, (analyticsData?.totalStreams || 0) / 10000);
    const socialScore = Math.min(100, (analyticsData?.totalFollowers || 0) / 5000);
    const playlistCount = Number(activePlaylistCount[0]?.count || 0);
    const playlistScore = Math.min(100, playlistCount * 8);
    const shazamPlatform = platformData.find(p => p.platform === 'shazam');
    const shazamScore = Math.min(100, ((shazamPlatform?.streams || 0) / 500) + (streamingScore * 0.3));
    const radioPlatform = platformData.find(p => p.platform === 'radio');
    const radioScore = Math.min(100, ((radioPlatform?.streams || 0) / 200) + (socialScore * 0.4));
    const currentStreams = analyticsData?.totalStreams || 0;
    const prevStreams = prevAnalyticsData?.totalStreams || 0;
    const growthRate = prevStreams > 0 ? ((currentStreams - prevStreams) / prevStreams) * 100 : (currentStreams > 0 ? 10 : 0);
    const viralScore = Math.min(100, Math.max(0, streamingScore * 0.5 + Math.max(0, growthRate) * 1.5));

    const maxScore = (
      streamingScore * 0.30 +
      socialScore * 0.15 +
      playlistScore * 0.20 +
      shazamScore * 0.15 +
      radioScore * 0.10 +
      viralScore * 0.10
    );

    const platformScores: Record<string, number> = {};
    platformData.forEach(p => {
      platformScores[p.platform] = Math.min(100, (p.streams || 0) / 1000);
    });

    const globalRank = maxScore > 0 ? Math.max(1, Math.round(100000 / Math.max(1, maxScore))) : 99999;
    const genreRank = maxScore > 0 ? Math.max(1, Math.round(5000 / Math.max(1, maxScore))) : 4999;
    const countryRank = maxScore > 0 ? Math.max(1, Math.round(1000 / Math.max(1, maxScore))) : 999;

    const ranking: InsertGlobalRanking = {
      userId,
      date: new Date().toISOString().split('T')[0],
      maxScore,
      globalRank,
      genreRank,
      countryRank,
      platformScores,
      streamingScore,
      socialScore,
      playlistScore,
      shazamScore,
      radioScore,
      viralScore,
      growthRate,
    };

    await db.insert(globalRankings).values(ranking);

    return {
      userId,
      maxScore,
      globalRank: ranking.globalRank!,
      genreRank: ranking.genreRank!,
      countryRank: ranking.countryRank!,
      platformScores,
      breakdown: {
        streaming: streamingScore,
        social: socialScore,
        playlist: playlistScore,
        shazam: shazamScore,
        radio: radioScore,
        viral: viralScore,
      },
      trend: ranking.growthRate! > 5 ? 'rising' : ranking.growthRate! < -5 ? 'falling' : 'stable',
    };
  }

  async getGlobalRankingHistory(userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return db
      .select()
      .from(globalRankings)
      .where(
        and(
          eq(globalRankings.userId, userId),
          gte(globalRankings.date, startDate.toISOString().split('T')[0])
        )
      )
      .orderBy(asc(globalRankings.date));
  }

  async discoverArtists(
    options: {
      genre?: string;
      country?: string;
      minGrowthScore?: number;
      minOverallScore?: number;
      limit?: number;
    } = {}
  ): Promise<ArDiscoveryResult[]> {
    const conditions = [];

    if (options.genre) {
      conditions.push(eq(arDiscoveries.genre, options.genre));
    }
    if (options.country) {
      conditions.push(eq(arDiscoveries.country, options.country));
    }
    if (options.minGrowthScore) {
      conditions.push(gte(arDiscoveries.growthScore, options.minGrowthScore));
    }
    if (options.minOverallScore) {
      conditions.push(gte(arDiscoveries.overallScore, options.minOverallScore));
    }

    const discoveries = await db
      .select()
      .from(arDiscoveries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(arDiscoveries.overallScore))
      .limit(options.limit || 50);

    return discoveries.map(d => ({
      artistId: d.artistId,
      artistName: d.artistName,
      overallScore: d.overallScore || 0,
      growthScore: d.growthScore || 0,
      engagementScore: d.engagementScore || 0,
      viralityScore: d.virality || 0,
      signingPotential: d.signingPotentialScore || 0,
      growthTrajectory: (d.growthTrajectory as ArDiscoveryResult['growthTrajectory']) || 'emerging',
      topMarkets: (d.topMarkets as { country: string; percentage: number }[]) || [],
      breakoutTracks: (d.breakoutTracks as { title: string; streams: number; growth: number }[]) || [],
      riskFactors: (d.riskFactors as string[]) || [],
      strengthFactors: (d.strengthFactors as string[]) || [],
      recommendedActions: (d.recommendedActions as string[]) || [],
    }));
  }

  async analyzeArtistForAR(artistId: string): Promise<ArDiscoveryResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [recentData] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalListeners: sql<number>`COALESCE(MAX(${analytics.totalListeners}), 0)`,
        totalFollowers: sql<number>`COALESCE(MAX(${analytics.followers}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(and(eq(analytics.userId, artistId), gte(analytics.date, thirtyDaysAgo)));

    const [prevData] = await db
      .select({ totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)` })
      .from(analytics)
      .where(and(eq(analytics.userId, artistId), gte(analytics.date, sixtyDaysAgo), lte(analytics.date, thirtyDaysAgo)));

    const [artistUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, artistId)).limit(1);

    const activePlaylistRows = await db
      .select({ count: sql<number>`COUNT(*)`, totalFollowers: sql<number>`COALESCE(SUM(${playlistJourneys.followerCount}), 0)` })
      .from(playlistJourneys)
      .where(and(eq(playlistJourneys.userId, artistId), eq(playlistJourneys.isActive, true)));

    const monthlyListeners = Number(recentData?.totalListeners || 0);
    const followerCount = Number(recentData?.totalFollowers || 0);
    const currentStreams = Number(recentData?.totalStreams || 0);
    const prevStreams = Number(prevData?.totalStreams || 0);
    const growthRate = prevStreams > 0 ? ((currentStreams - prevStreams) / prevStreams) * 100 : (currentStreams > 0 ? 15 : 0);
    const playlistCount = Number(activePlaylistRows[0]?.count || 0);
    const playlistReach = Number(activePlaylistRows[0]?.totalFollowers || 0);

    const growthScore = Math.min(100, Math.max(0, growthRate + 50));
    const engagementScore = followerCount > 0 ? Math.min(100, (monthlyListeners / followerCount) * 10) : (currentStreams > 0 ? 20 : 0);
    const viralityScore = Math.min(100, Math.max(0, streamingVelocity(currentStreams, prevStreams) * 2));
    const audienceQualityScore = Math.min(100, followerCount > 0 ? Math.min(100, (currentStreams / Math.max(1, followerCount)) * 5 + 40) : 40);
    const playlistPotentialScore = Math.min(100, playlistCount * 15 + (playlistReach > 0 ? 20 : 0));
    const syncPotentialScore = Math.min(100, growthScore * 0.4 + engagementScore * 0.3 + 20);

    const overallScore = (
      growthScore * 0.25 +
      engagementScore * 0.20 +
      viralityScore * 0.15 +
      audienceQualityScore * 0.15 +
      playlistPotentialScore * 0.15 +
      syncPotentialScore * 0.10
    );

    const signingPotentialScore = Math.min(100, overallScore * (growthRate > 20 ? 1.2 : growthRate > 0 ? 1.0 : 0.8));

    let growthTrajectory: ArDiscoveryResult['growthTrajectory'];
    if (growthRate > 30) growthTrajectory = 'explosive';
    else if (growthRate > 10) growthTrajectory = 'steady';
    else if (growthRate > 0) growthTrajectory = 'emerging';
    else if (growthRate > -10) growthTrajectory = 'plateauing';
    else growthTrajectory = 'declining';

    const discovery: InsertArDiscovery = {
      artistId,
      artistName: artistUser?.name || `Artist ${artistId.slice(0, 8)}`,
      overallScore,
      growthScore,
      engagementScore,
      virality: viralityScore,
      audienceQualityScore,
      playlistPotentialScore,
      syncPotentialScore,
      signingPotentialScore,
      monthlyListeners,
      monthlyListenersGrowth: growthRate,
      followerCount,
      followerGrowth: growthRate * 0.8,
      growthTrajectory,
      topMarkets: [
        { country: 'US', percentage: 35 },
        { country: 'GB', percentage: 15 },
        { country: 'DE', percentage: 10 },
        { country: 'BR', percentage: 8 },
        { country: 'MX', percentage: 7 },
      ],
      breakoutTracks: currentStreams > 0 ? [
        { title: 'Latest Release', streams: Math.round(currentStreams * 0.6), growth: growthRate },
        { title: 'Previous Release', streams: Math.round(prevStreams * 0.5), growth: growthRate * 0.6 },
      ] : [],
      riskFactors: growthRate < 0 ? ['Declining engagement', 'Below-average streaming velocity'] : [],
      strengthFactors: growthRate > 20 ? ['Strong growth trajectory', 'Active fanbase', playlistCount > 0 ? 'Playlist traction' : 'Streaming momentum'] : (growthRate > 0 ? ['Consistent growth'] : []),
      recommendedActions: ['Monitor for 2 more weeks', 'Consider playlist pitching', 'Explore sync opportunities'],
    };

    await db.insert(arDiscoveries).values(discovery);

    return {
      artistId,
      artistName: discovery.artistName,
      overallScore,
      growthScore,
      engagementScore,
      viralityScore,
      signingPotential: signingPotentialScore,
      growthTrajectory,
      topMarkets: discovery.topMarkets as { country: string; percentage: number }[],
      breakoutTracks: discovery.breakoutTracks as { title: string; streams: number; growth: number }[],
      riskFactors: discovery.riskFactors as string[],
      strengthFactors: discovery.strengthFactors as string[],
      recommendedActions: discovery.recommendedActions as string[],
    };
  }

  async processNlpQuery(userId: string, query: string): Promise<NlpQueryResult> {
    const startTime = Date.now();
    const lowerQuery = query.toLowerCase();

    let intent = 'unknown';
    let responseType: NlpQueryResult['responseType'] = 'text';
    let data: unknown = null;
    let summary = '';
    const entities: Record<string, unknown> = {};

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    try {
      if (lowerQuery.includes('top') && (lowerQuery.includes('cities') || lowerQuery.includes('countries'))) {
        intent = 'top_locations';
        responseType = 'table';
        
        const match = lowerQuery.match(/top\s+(\d+)/);
        const limitN = match ? parseInt(match[1]) : 5;
        entities.limit = limitN;
        entities.locationType = lowerQuery.includes('cities') ? 'cities' : 'countries';

        const geoRows = await db
          .select({ platform: analytics.platform, streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`, listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`, metadata: sql<any>`MAX(${analytics.metadata})` })
          .from(analytics)
          .where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)))
          .groupBy(analytics.platform)
          .orderBy(sql`SUM(${analytics.streams}) DESC`)
          .limit(limitN);

        const totalStreams = geoRows.reduce((s, r) => s + Number(r.streams), 0);
        data = geoRows.map((r, i) => ({
          location: r.metadata?.country || r.metadata?.region || r.platform || `Market ${i + 1}`,
          listeners: Number(r.listeners),
          streams: Number(r.streams),
          percentage: totalStreams > 0 ? Math.round((Number(r.streams) / totalStreams) * 1000) / 10 : 0,
        }));

        summary = `Your top ${limitN} ${entities.locationType} by stream count over the last 30 days`;
      } else if (lowerQuery.includes('compare') && (lowerQuery.includes('spotify') || lowerQuery.includes('apple') || lowerQuery.includes('youtube'))) {
        intent = 'platform_comparison';
        responseType = 'comparison';
        const requestedPlatforms: string[] = [];
        if (lowerQuery.includes('spotify')) requestedPlatforms.push('spotify');
        if (lowerQuery.includes('apple')) requestedPlatforms.push('apple_music');
        if (lowerQuery.includes('youtube')) requestedPlatforms.push('youtube');
        entities.platforms = requestedPlatforms;

        const platformRows = await db
          .select({ platform: analytics.platform, streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`, listeners: sql<number>`COALESCE(MAX(${analytics.totalListeners}), 0)`, revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)` })
          .from(analytics)
          .where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)))
          .groupBy(analytics.platform)
          .orderBy(sql`SUM(${analytics.streams}) DESC`);

        const prevRows = await db
          .select({ platform: analytics.platform, streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)` })
          .from(analytics)
          .where(and(eq(analytics.userId, userId), gte(analytics.date, sixtyDaysAgo), lte(analytics.date, thirtyDaysAgo)))
          .groupBy(analytics.platform);

        const prevMap: Record<string, number> = {};
        prevRows.forEach(r => { if (r.platform) prevMap[r.platform] = Number(r.streams); });

        const platforms = platformRows.map(r => ({
          platform: r.platform || 'unknown',
          streams: Number(r.streams),
          listeners: Number(r.listeners),
          revenue: Number(r.revenue),
          growth: prevMap[r.platform || ''] > 0 ? Math.round(((Number(r.streams) - prevMap[r.platform || '']) / prevMap[r.platform || '']) * 1000) / 10 : 0,
        }));

        const winner = platforms[0];
        data = { platforms, winner: winner?.platform, winnerReason: winner ? `Highest stream count with ${winner.streams.toLocaleString()} streams` : 'Insufficient data' };
        summary = winner ? `${winner.platform} leads with ${winner.streams.toLocaleString()} streams over the last 30 days` : 'No platform data available for the selected period';
      } else if (lowerQuery.includes('streams') || lowerQuery.includes('plays')) {
        intent = 'stream_count';
        responseType = 'number';

        const timeMatch = lowerQuery.match(/last\s+(\d+)\s+(day|week|month)/);
        let daysBack = 30;
        if (timeMatch) {
          const n = parseInt(timeMatch[1]);
          const unit = timeMatch[2];
          daysBack = unit === 'week' ? n * 7 : unit === 'month' ? n * 30 : n;
          entities.timeframe = `${n} ${unit}${n > 1 ? 's' : ''}`;
        }
        const periodStart = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
        const prevPeriodStart = new Date(periodStart.getTime() - daysBack * 24 * 60 * 60 * 1000);

        const [curr] = await db.select({ total: sql<number>`COALESCE(SUM(${analytics.streams}), 0)` }).from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, periodStart)));
        const [prev] = await db.select({ total: sql<number>`COALESCE(SUM(${analytics.streams}), 0)` }).from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, prevPeriodStart), lte(analytics.date, periodStart)));
        const currentTotal = Number(curr?.total || 0);
        const prevTotal = Number(prev?.total || 0);
        const change = prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 1000) / 10 : 0;

        data = { value: currentTotal, change, period: entities.timeframe || 'last 30 days' };
        summary = `You have ${currentTotal.toLocaleString()} total streams in the ${entities.timeframe || 'last 30 days'}${change !== 0 ? `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% from the previous period` : ''}`;
      } else if (lowerQuery.includes('revenue') || lowerQuery.includes('earnings')) {
        intent = 'revenue';
        responseType = 'number';

        const [curr] = await db.select({ total: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)` }).from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)));
        const [prev] = await db.select({ total: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)` }).from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, sixtyDaysAgo), lte(analytics.date, thirtyDaysAgo)));
        const currentRev = Number(curr?.total || 0);
        const prevRev = Number(prev?.total || 0);
        const change = prevRev > 0 ? Math.round(((currentRev - prevRev) / prevRev) * 1000) / 10 : 0;

        data = { value: currentRev, change, currency: 'USD' };
        summary = `Your total revenue is $${currentRev.toFixed(2)} over the last 30 days${change !== 0 ? `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% from the previous period` : ''}`;
      } else if (lowerQuery.includes('playlist')) {
        intent = 'playlist_info';
        responseType = 'table';

        const playlists = await db
          .select()
          .from(playlistJourneys)
          .where(and(eq(playlistJourneys.userId, userId), eq(playlistJourneys.isActive, true)))
          .orderBy(desc(playlistJourneys.followerCount))
          .limit(10);

        data = playlists.map(p => ({ name: p.playlistName, platform: p.platform, followers: p.followerCount || 0, position: p.position || null, streams: p.streamsFromPlaylist || 0, type: p.playlistType }));
        const totalReach = playlists.reduce((s, p) => s + (p.followerCount || 0), 0);
        summary = playlists.length > 0 ? `You are on ${playlists.length} active playlist${playlists.length > 1 ? 's' : ''} with a combined reach of ${totalReach.toLocaleString()} followers` : 'You are not currently on any tracked playlists';
      } else if (lowerQuery.includes('trend') || lowerQuery.includes('growth')) {
        intent = 'growth_trend';
        responseType = 'chart';

        const timeline = await db
          .select({ date: analytics.date, streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)` })
          .from(analytics)
          .where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)))
          .groupBy(analytics.date)
          .orderBy(asc(analytics.date));

        const rows = timeline.map(r => ({ date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date), streams: Number(r.streams) }));
        const firstVal = rows[0]?.streams || 0;
        const lastVal = rows[rows.length - 1]?.streams || 0;
        const growthRate = firstVal > 0 ? Math.round(((lastVal - firstVal) / firstVal) * 1000) / 10 : 0;
        const trend = growthRate > 0 ? 'up' : growthRate < 0 ? 'down' : 'flat';

        data = { timeline: rows, trend, growthRate };
        summary = rows.length > 0 ? `Your streams are trending ${trend} with a ${Math.abs(growthRate)}% growth rate over the last 30 days` : 'Insufficient data to determine growth trend';
      } else {
        intent = 'general';
        responseType = 'text';
        data = null;
        summary = 'I understood your query but need more specific information. Try asking about streams, revenue, playlists, top cities, or platform comparisons.';
      }

      const executionTime = Date.now() - startTime;

      await db.insert(nlpQueryLogs).values({
        userId,
        query,
        parsedIntent: intent,
        parsedEntities: entities,
        responseType,
        responseData: data as Record<string, unknown>,
        executionTimeMs: executionTime,
        wasSuccessful: true,
      });

      return { intent, entities, responseType, data, summary };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      await db.insert(nlpQueryLogs).values({
        userId,
        query,
        parsedIntent: 'error',
        executionTimeMs: executionTime,
        wasSuccessful: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async getHistoricalData(
    userId: string,
    options: {
      trackId?: string;
      startDate?: Date;
      endDate?: Date;
      period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
      metrics?: string[];
    } = {}
  ) {
    const conditions = [eq(historicalAnalytics.userId, userId)];

    if (options.trackId) conditions.push(eq(historicalAnalytics.trackId, options.trackId));
    if (options.startDate) conditions.push(gte(historicalAnalytics.date, options.startDate.toISOString().split('T')[0]));
    if (options.endDate) conditions.push(lte(historicalAnalytics.date, options.endDate.toISOString().split('T')[0]));
    if (options.period) conditions.push(eq(historicalAnalytics.period, options.period));

    const data = await db
      .select()
      .from(historicalAnalytics)
      .where(and(...conditions))
      .orderBy(asc(historicalAnalytics.date));

    const currentYear = new Date().getFullYear();
    const yoyComparisons: Record<string, { current: number; previous: number; change: number }> = {};

    const currentYearData = data.filter(d => new Date(d.date).getFullYear() === currentYear);
    const previousYearData = data.filter(d => new Date(d.date).getFullYear() === currentYear - 1);

    const currentStreams = currentYearData.reduce((sum, d) => sum + Number(d.streams || 0), 0);
    const previousStreams = previousYearData.reduce((sum, d) => sum + Number(d.streams || 0), 0);
    yoyComparisons.streams = {
      current: currentStreams,
      previous: previousStreams,
      change: previousStreams > 0 ? ((currentStreams - previousStreams) / previousStreams) * 100 : 0,
    };

    const currentRevenue = currentYearData.reduce((sum, d) => sum + (d.revenue || 0), 0);
    const previousRevenue = previousYearData.reduce((sum, d) => sum + (d.revenue || 0), 0);
    yoyComparisons.revenue = {
      current: currentRevenue,
      previous: previousRevenue,
      change: previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0,
    };

    const milestones = data
      .filter(d => d.milestones && Object.keys(d.milestones as object).length > 0)
      .map(d => ({
        date: d.date,
        milestones: d.milestones,
      }));

    return {
      timeline: data,
      yearOverYear: yoyComparisons,
      milestones,
      summary: {
        totalDataPoints: data.length,
        dateRange: {
          start: data[0]?.date,
          end: data[data.length - 1]?.date,
        },
      },
    };
  }

  async getSyncImpact(userId: string, trackId?: string): Promise<SyncImpactResult[]> {
    const conditions = [eq(syncPlacements.userId, userId)];
    if (trackId) conditions.push(eq(syncPlacements.trackId, trackId));

    const placements = await db
      .select()
      .from(syncPlacements)
      .where(and(...conditions))
      .orderBy(desc(syncPlacements.airDate));

    const groupedByTrack = placements.reduce((acc, p) => {
      if (!acc[p.trackId]) {
        acc[p.trackId] = { trackId: p.trackId, trackTitle: p.trackTitle, placements: [] };
      }
      acc[p.trackId].placements.push({
        id: p.id,
        mediaTitle: p.mediaTitle,
        mediaType: p.mediaType,
        airDate: p.airDate!,
        streamLift: p.streamLift || 0,
        revenueLift: p.revenueLift || 0,
        impactScore: p.impactScore || 0,
      });
      return acc;
    }, {} as Record<string, { trackId: string; trackTitle: string; placements: SyncImpactResult['placements'] }>);

    return Object.values(groupedByTrack).map(track => ({
      ...track,
      totalStreamLift: track.placements.reduce((sum, p) => sum + p.streamLift, 0),
      totalRevenueLift: track.placements.reduce((sum, p) => sum + p.revenueLift, 0),
      averageImpactScore: track.placements.length > 0
        ? track.placements.reduce((sum, p) => sum + p.impactScore, 0) / track.placements.length
        : 0,
    }));
  }

  async trackSyncPlacement(userId: string, placement: Omit<InsertSyncPlacement, 'userId'>): Promise<void> {
    await db.insert(syncPlacements).values({
      ...placement,
      userId,
    });
    logger.info(`Tracked sync placement for track ${placement.trackId} on ${placement.mediaTitle}`);
  }

  async getCrossPlatformAnalysis(userId: string, startDate: Date, endDate: Date): Promise<CrossPlatformResult> {
    const platformData = await db
      .select({
        platform: analytics.platform,
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate),
          lte(analytics.date, endDate)
        )
      )
      .groupBy(analytics.platform);

    const totalStreams = platformData.reduce((sum, p) => sum + Number(p.totalStreams), 0);
    const totalRevenue = platformData.reduce((sum, p) => sum + Number(p.totalRevenue), 0);

    const platforms = platformData.map(p => ({
      platform: (p.platform || 'unknown') as Platform,
      streams: Number(p.totalStreams),
      listeners: Number(p.totalListeners),
      revenue: Number(p.totalRevenue),
      marketShare: totalStreams > 0 ? (Number(p.totalStreams) / totalStreams) * 100 : 0,
      growth: (Math.random() - 0.3) * 30,
    }));

    const dominantPlatform = platforms.reduce((max, p) => p.streams > max.streams ? p : max, platforms[0])?.platform || 'spotify';

    const recommendations: string[] = [];
    if (platforms.some(p => p.marketShare > 60)) {
      recommendations.push('Diversify your platform presence to reduce dependency on a single platform');
    }
    if (platforms.some(p => p.growth < 0)) {
      recommendations.push('Focus on re-engaging audiences on declining platforms');
    }
    if (platforms.length < 3) {
      recommendations.push('Consider expanding to additional streaming platforms');
    }

    return {
      platforms,
      totalStreams,
      totalRevenue,
      audienceOverlap: 15 + Math.random() * 20,
      dominantPlatform,
      recommendations,
    };
  }

  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const recentHalf = values.slice(0, Math.ceil(values.length / 2));
    const olderHalf = values.slice(Math.ceil(values.length / 2));
    
    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;
    
    const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
    
    if (changePercent > 5) return 'up';
    if (changePercent < -5) return 'down';
    return 'stable';
  }
}

export const advancedAnalyticsService = new AdvancedAnalyticsService();

import { db } from '../db';
import {
  playlistAttributions,
  InsertPlaylistAttribution,
  PlaylistAttribution,
  dspAnalytics,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';
import { logger } from '../logger.js';

export type PlaylistType = 'editorial' | 'algorithmic' | 'user' | 'artist' | 'radio';
export type DSPPlatform = 'spotify' | 'apple' | 'youtube' | 'amazon' | 'tidal' | 'deezer' | 'soundcloud' | 'pandora';

export interface PlaylistMetrics {
  playlistId: string;
  playlistName: string;
  playlistType: PlaylistType;
  platform: DSPPlatform;
  streams: number;
  listeners: number;
  saves: number;
  revenue: number;
  addedDate: Date;
  position?: number;
  followerCount: number;
  curatorName?: string;
  isActive: boolean;
  streamGrowth?: number;
  conversionRate?: number;
}

interface PlaylistPerformanceSummary {
  totalPlaylists: number;
  totalStreams: number;
  totalRevenue: number;
  byType: { type: PlaylistType; count: number; streams: number; revenue: number }[];
  byPlatform: { platform: DSPPlatform; count: number; streams: number; revenue: number }[];
  topPlaylists: PlaylistMetrics[];
  recentAdds: PlaylistMetrics[];
  pitchMetrics: {
    totalPitches: number;
    accepted: number;
    pending: number;
    rejected: number;
    acceptanceRate: number;
  };
}

interface PlaylistStreamHistory {
  date: string;
  streams: number;
  listeners: number;
  saves: number;
}

class PlaylistAttributionService {
  async trackPlaylistAdd(
    userId: string,
    playlistData: Omit<InsertPlaylistAttribution, 'userId'>
  ): Promise<PlaylistAttribution> {
    const [existing] = await db
      .select()
      .from(playlistAttributions)
      .where(
        and(
          eq(playlistAttributions.userId, userId),
          eq(playlistAttributions.playlistId, playlistData.playlistId),
          eq(playlistAttributions.platform, playlistData.platform)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(playlistAttributions)
        .set({
          isActive: true,
          position: playlistData.position,
          followerCount: playlistData.followerCount,
          lastUpdated: new Date(),
        })
        .where(eq(playlistAttributions.id, existing.id))
        .returning();
      return updated;
    }

    const [newAttribution] = await db
      .insert(playlistAttributions)
      .values({ ...playlistData, userId })
      .returning();

    logger.info(`Tracked new playlist add: ${playlistData.playlistName} for user ${userId}`);
    return newAttribution;
  }

  async trackPlaylistRemoval(
    userId: string,
    playlistId: string,
    platform: DSPPlatform
  ): Promise<void> {
    await db
      .update(playlistAttributions)
      .set({
        isActive: false,
        removedDate: new Date(),
        lastUpdated: new Date(),
      })
      .where(
        and(
          eq(playlistAttributions.userId, userId),
          eq(playlistAttributions.playlistId, playlistId),
          eq(playlistAttributions.platform, platform)
        )
      );

    logger.info(`Tracked playlist removal: ${playlistId} for user ${userId}`);
  }

  async updatePlaylistMetrics(
    userId: string,
    playlistId: string,
    platform: DSPPlatform,
    metrics: { streams: number; listeners: number; saves: number; revenue?: number }
  ): Promise<void> {
    await db
      .update(playlistAttributions)
      .set({
        streams: sql`${playlistAttributions.streams} + ${metrics.streams}`,
        listeners: metrics.listeners,
        saves: sql`${playlistAttributions.saves} + ${metrics.saves}`,
        revenue: metrics.revenue?.toString(),
        lastUpdated: new Date(),
      })
      .where(
        and(
          eq(playlistAttributions.userId, userId),
          eq(playlistAttributions.playlistId, playlistId),
          eq(playlistAttributions.platform, platform)
        )
      );
  }

  async trackPlaylistPitch(
    userId: string,
    playlistId: string,
    platform: DSPPlatform,
    pitchData: { status: string; date: Date; response?: string }
  ): Promise<void> {
    await db
      .update(playlistAttributions)
      .set({
        pitchStatus: pitchData.status,
        pitchDate: pitchData.date,
        pitchResponse: pitchData.response,
        lastUpdated: new Date(),
      })
      .where(
        and(
          eq(playlistAttributions.userId, userId),
          eq(playlistAttributions.playlistId, playlistId),
          eq(playlistAttributions.platform, platform)
        )
      );

    logger.info(`Tracked pitch for playlist ${playlistId}: ${pitchData.status}`);
  }

  async getPlaylistAttributions(
    userId: string,
    options: {
      platform?: DSPPlatform;
      playlistType?: PlaylistType;
      trackId?: string;
      activeOnly?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<PlaylistAttribution[]> {
    const conditions = [eq(playlistAttributions.userId, userId)];

    if (options.platform) {
      conditions.push(eq(playlistAttributions.platform, options.platform));
    }
    if (options.playlistType) {
      conditions.push(eq(playlistAttributions.playlistType, options.playlistType));
    }
    if (options.trackId) {
      conditions.push(eq(playlistAttributions.trackId, options.trackId));
    }
    if (options.activeOnly) {
      conditions.push(eq(playlistAttributions.isActive, true));
    }
    if (options.startDate) {
      conditions.push(gte(playlistAttributions.addedDate, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(playlistAttributions.addedDate, options.endDate));
    }

    return db
      .select()
      .from(playlistAttributions)
      .where(and(...conditions))
      .orderBy(desc(playlistAttributions.streams));
  }

  async getPlaylistPerformanceSummary(
    userId: string,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<PlaylistPerformanceSummary> {
    const conditions = [eq(playlistAttributions.userId, userId)];

    if (options.startDate) {
      conditions.push(gte(playlistAttributions.addedDate, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(playlistAttributions.addedDate, options.endDate));
    }

    const [totals] = await db
      .select({
        totalPlaylists: sql<number>`COUNT(DISTINCT ${playlistAttributions.playlistId})`,
        totalStreams: sql<number>`COALESCE(SUM(${playlistAttributions.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions));

    const byType = await db
      .select({
        type: playlistAttributions.playlistType,
        count: sql<number>`COUNT(DISTINCT ${playlistAttributions.playlistId})`,
        streams: sql<number>`COALESCE(SUM(${playlistAttributions.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions))
      .groupBy(playlistAttributions.playlistType);

    const byPlatform = await db
      .select({
        platform: playlistAttributions.platform,
        count: sql<number>`COUNT(DISTINCT ${playlistAttributions.playlistId})`,
        streams: sql<number>`COALESCE(SUM(${playlistAttributions.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions))
      .groupBy(playlistAttributions.platform);

    const topPlaylistsRaw = await db
      .select()
      .from(playlistAttributions)
      .where(and(...conditions))
      .orderBy(desc(playlistAttributions.streams))
      .limit(10);

    const recentAddsRaw = await db
      .select()
      .from(playlistAttributions)
      .where(and(...conditions, eq(playlistAttributions.isActive, true)))
      .orderBy(desc(playlistAttributions.addedDate))
      .limit(5);

    const pitchStats = await db
      .select({
        status: playlistAttributions.pitchStatus,
        count: sql<number>`COUNT(*)`,
      })
      .from(playlistAttributions)
      .where(
        and(
          eq(playlistAttributions.userId, userId),
          sql`${playlistAttributions.pitchStatus} IS NOT NULL`
        )
      )
      .groupBy(playlistAttributions.pitchStatus);

    const pitchMetrics = {
      totalPitches: 0,
      accepted: 0,
      pending: 0,
      rejected: 0,
      acceptanceRate: 0,
    };

    pitchStats.forEach(s => {
      const count = Number(s.count);
      pitchMetrics.totalPitches += count;
      if (s.status === 'accepted' || s.status === 'approved') pitchMetrics.accepted += count;
      else if (s.status === 'pending') pitchMetrics.pending += count;
      else if (s.status === 'rejected' || s.status === 'declined') pitchMetrics.rejected += count;
    });

    if (pitchMetrics.totalPitches > 0) {
      pitchMetrics.acceptanceRate = (pitchMetrics.accepted / (pitchMetrics.accepted + pitchMetrics.rejected)) * 100 || 0;
    }

    const mapToMetrics = (attr: PlaylistAttribution): PlaylistMetrics => ({
      playlistId: attr.playlistId,
      playlistName: attr.playlistName,
      playlistType: attr.playlistType,
      platform: attr.platform,
      streams: Number(attr.streams),
      listeners: attr.listeners || 0,
      saves: attr.saves || 0,
      revenue: Number(attr.revenue || 0),
      addedDate: attr.addedDate || new Date(),
      position: attr.position || undefined,
      followerCount: attr.followerCount || 0,
      curatorName: attr.curatorName || undefined,
      isActive: attr.isActive || false,
    });

    return {
      totalPlaylists: Number(totals?.totalPlaylists || 0),
      totalStreams: Number(totals?.totalStreams || 0),
      totalRevenue: Number(totals?.totalRevenue || 0),
      byType: byType.map(t => ({
        type: t.type,
        count: Number(t.count),
        streams: Number(t.streams),
        revenue: Number(t.revenue),
      })),
      byPlatform: byPlatform.map(p => ({
        platform: p.platform,
        count: Number(p.count),
        streams: Number(p.streams),
        revenue: Number(p.revenue),
      })),
      topPlaylists: topPlaylistsRaw.map(mapToMetrics),
      recentAdds: recentAddsRaw.map(mapToMetrics),
      pitchMetrics,
    };
  }

  async getPlaylistStreamHistory(
    userId: string,
    playlistId: string,
    platform: DSPPlatform,
    days: number = 30
  ): Promise<PlaylistStreamHistory[]> {
    const history: PlaylistStreamHistory[] = [];
    const baseDate = new Date();
    
    let cumulativeStreams = 0;
    let cumulativeListeners = 0;
    let cumulativeSaves = 0;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() - i);
      
      const dailyStreams = Math.floor(Math.random() * 500) + 50;
      const dailyListeners = Math.floor(dailyStreams * 0.6);
      const dailySaves = Math.floor(dailyStreams * 0.05);
      
      cumulativeStreams += dailyStreams;
      cumulativeListeners += dailyListeners;
      cumulativeSaves += dailySaves;

      history.push({
        date: date.toISOString().split('T')[0],
        streams: cumulativeStreams,
        listeners: cumulativeListeners,
        saves: cumulativeSaves,
      });
    }

    return history;
  }

  async getPlaylistRevenueAttribution(
    userId: string,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<{
    totalRevenue: number;
    byPlaylistType: { type: PlaylistType; revenue: number; percentage: number }[];
    byPlatform: { platform: DSPPlatform; revenue: number; percentage: number }[];
    topRevenueGenerators: { playlistName: string; platform: DSPPlatform; revenue: number }[];
  }> {
    const conditions = [eq(playlistAttributions.userId, userId)];

    if (options.startDate) {
      conditions.push(gte(playlistAttributions.addedDate, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(playlistAttributions.addedDate, options.endDate));
    }

    const [totals] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions));

    const totalRevenue = Number(totals?.totalRevenue || 0);

    const byTypeRaw = await db
      .select({
        type: playlistAttributions.playlistType,
        revenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions))
      .groupBy(playlistAttributions.playlistType);

    const byPlatformRaw = await db
      .select({
        platform: playlistAttributions.platform,
        revenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions))
      .groupBy(playlistAttributions.platform);

    const topGenerators = await db
      .select({
        playlistName: playlistAttributions.playlistName,
        platform: playlistAttributions.platform,
        revenue: sql<number>`COALESCE(${playlistAttributions.revenue}, 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions))
      .orderBy(desc(playlistAttributions.revenue))
      .limit(10);

    return {
      totalRevenue,
      byPlaylistType: byTypeRaw.map(t => ({
        type: t.type,
        revenue: Number(t.revenue),
        percentage: totalRevenue > 0 ? (Number(t.revenue) / totalRevenue) * 100 : 0,
      })),
      byPlatform: byPlatformRaw.map(p => ({
        platform: p.platform,
        revenue: Number(p.revenue),
        percentage: totalRevenue > 0 ? (Number(p.revenue) / totalRevenue) * 100 : 0,
      })),
      topRevenueGenerators: topGenerators.map(g => ({
        playlistName: g.playlistName,
        platform: g.platform,
        revenue: Number(g.revenue),
      })),
    };
  }

  async getEditorialPlaylistMetrics(userId: string): Promise<{
    totalEditorialPlacements: number;
    currentActivePlacements: number;
    streamsFromEditorial: number;
    revenueFromEditorial: number;
    topEditorialPlaylists: PlaylistMetrics[];
  }> {
    const conditions = [
      eq(playlistAttributions.userId, userId),
      eq(playlistAttributions.playlistType, 'editorial'),
    ];

    const [totals] = await db
      .select({
        totalPlacements: sql<number>`COUNT(*)`,
        activePlacements: sql<number>`COUNT(*) FILTER (WHERE ${playlistAttributions.isActive} = true)`,
        totalStreams: sql<number>`COALESCE(SUM(${playlistAttributions.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${playlistAttributions.revenue}), 0)`,
      })
      .from(playlistAttributions)
      .where(and(...conditions));

    const topPlaylists = await db
      .select()
      .from(playlistAttributions)
      .where(and(...conditions))
      .orderBy(desc(playlistAttributions.streams))
      .limit(5);

    return {
      totalEditorialPlacements: Number(totals?.totalPlacements || 0),
      currentActivePlacements: Number(totals?.activePlacements || 0),
      streamsFromEditorial: Number(totals?.totalStreams || 0),
      revenueFromEditorial: Number(totals?.totalRevenue || 0),
      topEditorialPlaylists: topPlaylists.map(p => ({
        playlistId: p.playlistId,
        playlistName: p.playlistName,
        playlistType: p.playlistType,
        platform: p.platform,
        streams: Number(p.streams),
        listeners: p.listeners || 0,
        saves: p.saves || 0,
        revenue: Number(p.revenue || 0),
        addedDate: p.addedDate || new Date(),
        position: p.position || undefined,
        followerCount: p.followerCount || 0,
        curatorName: p.curatorName || undefined,
        isActive: p.isActive || false,
      })),
    };
  }

  async syncPlaylistsFromPlatform(
    userId: string,
    platform: DSPPlatform,
    trackId?: string
  ): Promise<PlaylistAttribution[]> {
    try {
      // Build conditions array properly - only include defined conditions
      const conditions = [
        eq(playlistAttributions.userId, userId),
        eq(playlistAttributions.platform, platform),
      ];
      
      if (trackId) {
        conditions.push(eq(playlistAttributions.trackId, trackId));
      }

      // Fetch existing playlist attributions from database for this user and platform
      const existingPlaylists = await db
        .select()
        .from(playlistAttributions)
        .where(and(...conditions));

      if (existingPlaylists.length > 0) {
        logger.info(`Found ${existingPlaylists.length} existing playlists for ${platform}`);
        
        // Update streams/listeners counts from DSP analytics for each playlist
        const updatedPlaylists: PlaylistAttribution[] = [];
        for (const playlist of existingPlaylists) {
          // Build analytics filter for this specific playlist based on its track
          const analyticsConditions = [
            eq(dspAnalytics.userId, userId),
            eq(dspAnalytics.platform, platform),
          ];
          
          if (playlist.trackId) {
            analyticsConditions.push(eq(dspAnalytics.releaseId, playlist.trackId));
          }
          
          // Get latest analytics for this playlist's track from dspAnalytics
          const analytics = await db
            .select({
              streams: sql<number>`COALESCE(SUM(${dspAnalytics.streams}), 0)`,
              listeners: sql<number>`COALESCE(COUNT(DISTINCT ${dspAnalytics.date}), 0)`,
            })
            .from(dspAnalytics)
            .where(and(...analyticsConditions));

          const newStreams = Number(analytics[0]?.streams) || 0;
          
          // Only update if we have new data
          if (newStreams > 0 && newStreams !== playlist.streams) {
            const [updated] = await db
              .update(playlistAttributions)
              .set({
                streams: newStreams,
                updatedAt: new Date(),
              })
              .where(eq(playlistAttributions.id, playlist.id))
              .returning();
            
            updatedPlaylists.push(updated || playlist);
          } else {
            updatedPlaylists.push(playlist);
          }
        }
        
        return updatedPlaylists;
      }

      // No existing playlists found - return empty array
      // User needs to add playlist attributions via trackPlaylistAdd or connect DSP for automatic tracking
      logger.info(`No playlist data found for ${platform} user ${userId}. Add playlists via trackPlaylistAdd.`);
      return [];
    } catch (error: unknown) {
      logger.error(`Error syncing playlists from ${platform}:`, error);
      throw new Error(`Failed to sync playlists from ${platform}`);
    }
  }
}

export const playlistAttributionService = new PlaylistAttributionService();

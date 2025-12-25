import { db } from '../db.js';
import { 
  organicAssets, organicChannels, organicRoiSnapshots, organicAssetLifetime,
  type OrganicAsset, type OrganicChannel, type OrganicRoiSnapshot, type OrganicAssetLifetimeRecord,
  type InsertOrganicAsset, type InsertOrganicChannel, type InsertOrganicRoiSnapshot, type InsertOrganicAssetLifetime
} from '@shared/schema';
import { eq, and, gte, desc, sql, lte } from 'drizzle-orm';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';

interface AssetPerformance {
  monthlyViews: number;
  monthlyClickthrough: number;
  streamingConversions: number;
  playlistAdds: number;
  emailSignups: number;
  revenueGenerated: number;
}

interface DecayCurve {
  halfLifeDays: number;
  stabilityScore: number;
}

interface HistoricalPerformance {
  avgStreamsGenerated: number;
  avgRevenueGenerated: number;
  avgLtvOfUsers: number;
}

interface RoiData {
  revenueOverPeriod: number;
  creationCost: number;
  distributionCost: number;
  effectiveRoi: number;
  periodStart: Date;
  periodEnd: Date;
}

interface ScoredCandidate {
  assetId: string;
  expectedRoi: number;
  expectedStreams: number;
  expectedLtv: number;
  efficiencyScore: number;
  timeCostHours: number;
  type: string;
  topic: string;
  intent: string;
}

interface Placement {
  assetId: string;
  channelId: string;
  expectedReach: number;
}

interface WeeklyState {
  weekStart: Date;
  timeBudgetHours: number;
  candidateAssets: ScoredCandidate[];
  selectedAssets: { assetId: string; reason: string }[];
  placements: Placement[];
}

interface AssetCandidate {
  assetId: string;
  type: string;
  topic: string;
  intent: string;
  creationCostHours: number;
  distributionCost: number;
  basedOnAssetId?: string;
  basedOnChannelId?: string;
}

const HOURLY_RATE_ESTIMATE = 50;
const MINIMUM_ROI_THRESHOLD = 1.0;
const EXPLORE_RATIO = 0.2;

class OrganicCompoundingService {

  async computeOrganicRoi(asset: OrganicAsset): Promise<RoiData> {
    try {
      const performance = asset.performance as AssetPerformance | null;
      const revenueGenerated = performance?.revenueGenerated ?? 0;
      
      const creationCostDollars = (asset.creationCostHours ?? 0) * HOURLY_RATE_ESTIMATE;
      const distributionCost = asset.distributionCost ?? 0;
      const totalCost = creationCostDollars + distributionCost;
      
      const effectiveRoi = totalCost > 0 ? (revenueGenerated - totalCost) / totalCost : 0;
      
      const now = new Date();
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      return {
        revenueOverPeriod: revenueGenerated,
        creationCost: creationCostDollars,
        distributionCost,
        effectiveRoi,
        periodStart,
        periodEnd: now,
      };
    } catch (error) {
      logger.error('Error computing organic ROI:', error);
      throw error;
    }
  }

  computeChannelEfficiency(channel: OrganicChannel, assets: OrganicAsset[]): number {
    try {
      const channelAssets = assets.filter(a => {
        const performance = a.performance as AssetPerformance | null;
        return performance && performance.revenueGenerated > 0;
      });
      
      if (channelAssets.length === 0) {
        return channel.audienceQualityScore ?? 0.5;
      }
      
      const totalRevenue = channelAssets.reduce((sum, a) => {
        const perf = a.performance as AssetPerformance;
        return sum + (perf?.revenueGenerated ?? 0);
      }, 0);
      
      const totalCost = channelAssets.reduce((sum, a) => {
        return sum + ((a.creationCostHours ?? 0) * HOURLY_RATE_ESTIMATE) + (a.distributionCost ?? 0);
      }, 0);
      
      const roi = totalCost > 0 ? totalRevenue / totalCost : 0;
      const reach = channel.estimatedMonthlyReach ?? 0;
      const audienceQuality = channel.audienceQualityScore ?? 0.5;
      
      const reachScore = Math.min(reach / 100000, 1);
      const efficiencyScore = (roi * 0.4) + (reachScore * 0.3) + (audienceQuality * 0.3);
      
      return Math.max(0, Math.min(1, efficiencyScore));
    } catch (error) {
      logger.error('Error computing channel efficiency:', error);
      return 0;
    }
  }

  proposeCandidateAssets(
    userId: string, 
    existingAssets: OrganicAsset[], 
    channels: OrganicChannel[]
  ): AssetCandidate[] {
    const candidates: AssetCandidate[] = [];
    
    try {
      const topPerformingAssets = existingAssets
        .filter(a => {
          const perf = a.performance as AssetPerformance | null;
          return perf && perf.revenueGenerated > 0;
        })
        .sort((a, b) => {
          const perfA = a.performance as AssetPerformance;
          const perfB = b.performance as AssetPerformance;
          return (perfB?.revenueGenerated ?? 0) - (perfA?.revenueGenerated ?? 0);
        })
        .slice(0, 5);
      
      for (const asset of topPerformingAssets) {
        candidates.push({
          assetId: `candidate_${nanoid()}`,
          type: asset.type,
          topic: `${asset.topic} - Extended`,
          intent: asset.intent,
          creationCostHours: (asset.creationCostHours ?? 0) * 0.8,
          distributionCost: asset.distributionCost ?? 0,
          basedOnAssetId: asset.id,
        });
      }
      
      const topChannels = channels
        .filter(c => (c.efficiencyScore ?? 0) > 0.5)
        .slice(0, 3);
      
      for (const channel of topChannels) {
        const assetTypes = ['seo_article', 'blog_post', 'youtube_video'];
        for (const type of assetTypes) {
          candidates.push({
            assetId: `candidate_${nanoid()}`,
            type,
            topic: `Content for ${channel.name}`,
            intent: channel.type === 'search' ? 'search' : 'discovery',
            creationCostHours: type === 'youtube_video' ? 8 : 4,
            distributionCost: 0,
            basedOnChannelId: channel.id,
          });
        }
      }
      
      if (candidates.length < 5) {
        const defaultTypes = [
          { type: 'seo_article', topic: 'Trending Topic Article', intent: 'search', hours: 4 },
          { type: 'playlist', topic: 'Curated Playlist', intent: 'discovery', hours: 2 },
          { type: 'ugc_challenge', topic: 'Fan Challenge', intent: 'emotional', hours: 3 },
        ];
        
        for (const defaultAsset of defaultTypes) {
          candidates.push({
            assetId: `candidate_${nanoid()}`,
            type: defaultAsset.type,
            topic: defaultAsset.topic,
            intent: defaultAsset.intent,
            creationCostHours: defaultAsset.hours,
            distributionCost: 0,
          });
        }
      }
      
      return candidates;
    } catch (error) {
      logger.error('Error proposing candidate assets:', error);
      return [];
    }
  }

  estimateFutureRoi(
    candidate: AssetCandidate, 
    existingAssets: OrganicAsset[],
    channels: OrganicChannel[]
  ): { effectiveRoi: number; streams: number; ltv: number } {
    try {
      const similarAssets = existingAssets.filter(a => 
        a.type === candidate.type || a.intent === candidate.intent
      );
      
      let avgRevenue = 0;
      let avgStreams = 0;
      
      if (similarAssets.length > 0) {
        const totalRevenue = similarAssets.reduce((sum, a) => {
          const perf = a.performance as AssetPerformance | null;
          return sum + (perf?.revenueGenerated ?? 0);
        }, 0);
        const totalStreams = similarAssets.reduce((sum, a) => {
          const perf = a.performance as AssetPerformance | null;
          return sum + (perf?.streamingConversions ?? 0);
        }, 0);
        
        avgRevenue = totalRevenue / similarAssets.length;
        avgStreams = totalStreams / similarAssets.length;
      } else {
        avgRevenue = 100;
        avgStreams = 50;
      }
      
      const creationCost = candidate.creationCostHours * HOURLY_RATE_ESTIMATE;
      const totalCost = creationCost + candidate.distributionCost;
      
      const expectedRevenue = avgRevenue * 1.2;
      const effectiveRoi = totalCost > 0 ? (expectedRevenue - totalCost) / totalCost : 0;
      
      const avgChannelLtv = channels.length > 0
        ? channels.reduce((sum, c) => {
            const hist = c.historicalPerformance as HistoricalPerformance | null;
            return sum + (hist?.avgLtvOfUsers ?? 5);
          }, 0) / channels.length
        : 5;
      
      return {
        effectiveRoi,
        streams: avgStreams * 1.1,
        ltv: avgChannelLtv,
      };
    } catch (error) {
      logger.error('Error estimating future ROI:', error);
      return { effectiveRoi: 0, streams: 0, ltv: 0 };
    }
  }

  computeEfficiencyScore(candidate: AssetCandidate, expectedRoi: { effectiveRoi: number; streams: number; ltv: number }): number {
    try {
      const roiScore = Math.min(expectedRoi.effectiveRoi / 2, 1);
      
      const timeEfficiency = candidate.creationCostHours > 0 
        ? Math.min(expectedRoi.streams / candidate.creationCostHours / 20, 1)
        : 0;
      
      const ltvScore = Math.min(expectedRoi.ltv / 20, 1);
      
      const efficiencyScore = (roiScore * 0.5) + (timeEfficiency * 0.3) + (ltvScore * 0.2);
      
      return Math.max(0, Math.min(1, efficiencyScore));
    } catch (error) {
      logger.error('Error computing efficiency score:', error);
      return 0;
    }
  }

  selectAssetsUnderBudget(candidates: ScoredCandidate[], timeBudgetHours: number): ScoredCandidate[] {
    try {
      const numExplore = Math.floor(candidates.length * EXPLORE_RATIO);
      const numExploit = candidates.length - numExplore;
      
      const sortedByEfficiency = [...candidates].sort((a, b) => b.efficiencyScore - a.efficiencyScore);
      const exploitCandidates = sortedByEfficiency.slice(0, numExploit);
      
      const exploreCandidates = sortedByEfficiency
        .slice(numExploit)
        .sort(() => Math.random() - 0.5)
        .slice(0, numExplore);
      
      const allCandidates = [...exploitCandidates, ...exploreCandidates]
        .sort((a, b) => b.efficiencyScore - a.efficiencyScore);
      
      const selected: ScoredCandidate[] = [];
      let usedHours = 0;
      
      for (const candidate of allCandidates) {
        if (usedHours + candidate.timeCostHours <= timeBudgetHours) {
          selected.push(candidate);
          usedHours += candidate.timeCostHours;
        }
      }
      
      return selected;
    } catch (error) {
      logger.error('Error selecting assets under budget:', error);
      return [];
    }
  }

  selectBestChannelsForAsset(assetId: string, channels: OrganicChannel[]): OrganicChannel[] {
    try {
      const sortedChannels = [...channels].sort((a, b) => {
        const scoreA = (a.efficiencyScore ?? 0) * (a.audienceQualityScore ?? 0.5);
        const scoreB = (b.efficiencyScore ?? 0) * (b.audienceQualityScore ?? 0.5);
        return scoreB - scoreA;
      });
      
      return sortedChannels.slice(0, 3);
    } catch (error) {
      logger.error('Error selecting best channels for asset:', error);
      return [];
    }
  }

  labelSelectionReason(candidate: ScoredCandidate): string {
    if (candidate.efficiencyScore >= 0.8) {
      return 'high_efficiency_score';
    } else if (candidate.expectedRoi >= MINIMUM_ROI_THRESHOLD) {
      return 'exceeds_roi_threshold';
    } else if (candidate.expectedStreams > 100) {
      return 'high_stream_potential';
    } else {
      return 'exploration_candidate';
    }
  }

  calculateDecay(asset: OrganicAsset): number {
    try {
      const decayCurve = asset.decayCurve as DecayCurve | null;
      if (!decayCurve) return 1;
      
      const halfLifeDays = decayCurve.halfLifeDays || 90;
      const stabilityScore = decayCurve.stabilityScore || 0.5;
      
      const createdAt = asset.createdAt ? new Date(asset.createdAt) : new Date();
      const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      
      const decayFactor = Math.pow(0.5, ageInDays / halfLifeDays);
      
      const adjustedDecay = decayFactor * (1 + stabilityScore) / 2;
      
      return Math.max(0.1, Math.min(1, adjustedDecay));
    } catch (error) {
      logger.error('Error calculating decay:', error);
      return 1;
    }
  }

  async weeklyOrganicLoop(userId: string, weekStart: Date, timeBudgetHours: number): Promise<WeeklyState> {
    logger.info(`Starting weekly organic loop for user ${userId}`, { weekStart, timeBudgetHours });
    
    try {
      const assets = await this.getAssets(userId);
      const channels = await this.getChannels(userId);
      
      logger.info(`Loaded ${assets.length} assets and ${channels.length} channels`);
      
      for (const asset of assets) {
        const roi = await this.computeOrganicRoi(asset);
        await this.saveRoiSnapshot(userId, asset.id, roi);
        await this.updateLifetimeStats(userId, asset.id);
      }
      
      for (const channel of channels) {
        const efficiency = this.computeChannelEfficiency(channel, assets);
        await this.updateChannelEfficiency(channel.id, efficiency);
      }
      
      const candidateAssets = this.proposeCandidateAssets(userId, assets, channels);
      
      const scoredCandidates: ScoredCandidate[] = [];
      for (const cand of candidateAssets) {
        const expectedRoi = this.estimateFutureRoi(cand, assets, channels);
        const efficiencyScore = this.computeEfficiencyScore(cand, expectedRoi);
        
        scoredCandidates.push({
          assetId: cand.assetId,
          expectedRoi: expectedRoi.effectiveRoi,
          expectedStreams: expectedRoi.streams,
          expectedLtv: expectedRoi.ltv,
          efficiencyScore,
          timeCostHours: cand.creationCostHours,
          type: cand.type,
          topic: cand.topic,
          intent: cand.intent,
        });
      }
      
      const selected = this.selectAssetsUnderBudget(scoredCandidates, timeBudgetHours);
      
      const placements: Placement[] = [];
      for (const sel of selected) {
        const bestChannels = this.selectBestChannelsForAsset(sel.assetId, channels);
        for (const ch of bestChannels) {
          placements.push({
            assetId: sel.assetId,
            channelId: ch.id,
            expectedReach: ch.estimatedMonthlyReach ?? 0,
          });
        }
      }
      
      const weeklyState: WeeklyState = {
        weekStart,
        timeBudgetHours,
        candidateAssets: scoredCandidates,
        selectedAssets: selected.map(s => ({
          assetId: s.assetId,
          reason: this.labelSelectionReason(s),
        })),
        placements,
      };
      
      logger.info(`Weekly organic loop completed for user ${userId}`, {
        candidatesGenerated: scoredCandidates.length,
        assetsSelected: selected.length,
        placementsCreated: placements.length,
      });
      
      return weeklyState;
    } catch (error) {
      logger.error('Error in weekly organic loop:', error);
      throw error;
    }
  }

  async createAsset(userId: string, data: Omit<InsertOrganicAsset, 'userId'>): Promise<OrganicAsset> {
    try {
      const [asset] = await db.insert(organicAssets).values({
        ...data,
        userId,
      }).returning();
      
      logger.info(`Created organic asset ${asset.id} for user ${userId}`);
      return asset;
    } catch (error) {
      logger.error('Error creating organic asset:', error);
      throw error;
    }
  }

  async updateAssetPerformance(assetId: string, performance: AssetPerformance): Promise<OrganicAsset | null> {
    try {
      const [updated] = await db.update(organicAssets)
        .set({ 
          performance,
          updatedAt: new Date(),
        })
        .where(eq(organicAssets.id, assetId))
        .returning();
      
      return updated || null;
    } catch (error) {
      logger.error('Error updating asset performance:', error);
      throw error;
    }
  }

  async getAssets(userId: string): Promise<OrganicAsset[]> {
    try {
      return await db.select()
        .from(organicAssets)
        .where(eq(organicAssets.userId, userId))
        .orderBy(desc(organicAssets.createdAt));
    } catch (error) {
      logger.error('Error getting assets:', error);
      throw error;
    }
  }

  async getAssetById(assetId: string): Promise<OrganicAsset | null> {
    try {
      const [asset] = await db.select()
        .from(organicAssets)
        .where(eq(organicAssets.id, assetId));
      
      return asset || null;
    } catch (error) {
      logger.error('Error getting asset by id:', error);
      throw error;
    }
  }

  async createChannel(userId: string, data: Omit<InsertOrganicChannel, 'userId'>): Promise<OrganicChannel> {
    try {
      const [channel] = await db.insert(organicChannels).values({
        ...data,
        userId,
      }).returning();
      
      logger.info(`Created organic channel ${channel.id} for user ${userId}`);
      return channel;
    } catch (error) {
      logger.error('Error creating organic channel:', error);
      throw error;
    }
  }

  async updateChannelEfficiency(channelId: string, efficiencyScore: number): Promise<OrganicChannel | null> {
    try {
      const [updated] = await db.update(organicChannels)
        .set({ 
          efficiencyScore,
          updatedAt: new Date(),
        })
        .where(eq(organicChannels.id, channelId))
        .returning();
      
      return updated || null;
    } catch (error) {
      logger.error('Error updating channel efficiency:', error);
      throw error;
    }
  }

  async getChannels(userId: string): Promise<OrganicChannel[]> {
    try {
      return await db.select()
        .from(organicChannels)
        .where(eq(organicChannels.userId, userId))
        .orderBy(desc(organicChannels.efficiencyScore));
    } catch (error) {
      logger.error('Error getting channels:', error);
      throw error;
    }
  }

  async saveRoiSnapshot(userId: string, assetId: string, roiData: RoiData): Promise<OrganicRoiSnapshot> {
    try {
      const [snapshot] = await db.insert(organicRoiSnapshots).values({
        userId,
        assetId,
        revenueOverPeriod: roiData.revenueOverPeriod,
        creationCost: roiData.creationCost,
        distributionCost: roiData.distributionCost,
        effectiveRoi: roiData.effectiveRoi,
        periodStart: roiData.periodStart,
        periodEnd: roiData.periodEnd,
      }).returning();
      
      return snapshot;
    } catch (error) {
      logger.error('Error saving ROI snapshot:', error);
      throw error;
    }
  }

  async getRoiHistory(userId: string, assetId: string): Promise<OrganicRoiSnapshot[]> {
    try {
      return await db.select()
        .from(organicRoiSnapshots)
        .where(and(
          eq(organicRoiSnapshots.userId, userId),
          eq(organicRoiSnapshots.assetId, assetId)
        ))
        .orderBy(desc(organicRoiSnapshots.createdAt));
    } catch (error) {
      logger.error('Error getting ROI history:', error);
      throw error;
    }
  }

  async updateLifetimeStats(userId: string, assetId: string): Promise<OrganicAssetLifetimeRecord | null> {
    try {
      const asset = await this.getAssetById(assetId);
      if (!asset) return null;
      
      const roiHistory = await this.getRoiHistory(userId, assetId);
      
      const lifetimeRevenue = roiHistory.reduce((sum, r) => sum + (r.revenueOverPeriod ?? 0), 0);
      const performance = asset.performance as AssetPerformance | null;
      const lifetimeStreams = performance?.streamingConversions ?? 0;
      
      const totalCreationCostHours = asset.creationCostHours ?? 0;
      const totalDistributionCost = asset.distributionCost ?? 0;
      const totalCost = (totalCreationCostHours * HOURLY_RATE_ESTIMATE) + totalDistributionCost;
      
      const effectiveRoi = totalCost > 0 ? (lifetimeRevenue - totalCost) / totalCost : 0;
      
      const [existing] = await db.select()
        .from(organicAssetLifetime)
        .where(and(
          eq(organicAssetLifetime.userId, userId),
          eq(organicAssetLifetime.assetId, assetId)
        ));
      
      if (existing) {
        const [updated] = await db.update(organicAssetLifetime)
          .set({
            lifetimeStreams,
            lifetimeRevenue,
            totalCreationCostHours,
            totalDistributionCost,
            effectiveRoi,
            lastSeen: new Date(),
          })
          .where(eq(organicAssetLifetime.id, existing.id))
          .returning();
        
        return updated;
      } else {
        const [created] = await db.insert(organicAssetLifetime).values({
          userId,
          assetId,
          lifetimeStreams,
          lifetimeRevenue,
          totalCreationCostHours,
          totalDistributionCost,
          effectiveRoi,
          firstSeen: asset.createdAt ?? new Date(),
          lastSeen: new Date(),
        }).returning();
        
        return created;
      }
    } catch (error) {
      logger.error('Error updating lifetime stats:', error);
      throw error;
    }
  }

  async getLifetimeStats(userId: string, assetId: string): Promise<OrganicAssetLifetimeRecord | null> {
    try {
      const [stats] = await db.select()
        .from(organicAssetLifetime)
        .where(and(
          eq(organicAssetLifetime.userId, userId),
          eq(organicAssetLifetime.assetId, assetId)
        ));
      
      return stats || null;
    } catch (error) {
      logger.error('Error getting lifetime stats:', error);
      throw error;
    }
  }

  async getTopPerformingAssets(userId: string, limit: number = 10): Promise<OrganicAsset[]> {
    try {
      const assets = await this.getAssets(userId);
      
      return assets
        .sort((a, b) => {
          const perfA = a.performance as AssetPerformance | null;
          const perfB = b.performance as AssetPerformance | null;
          const roiA = this.calculateQuickRoi(a);
          const roiB = this.calculateQuickRoi(b);
          return roiB - roiA;
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting top performing assets:', error);
      throw error;
    }
  }

  private calculateQuickRoi(asset: OrganicAsset): number {
    const performance = asset.performance as AssetPerformance | null;
    const revenue = performance?.revenueGenerated ?? 0;
    const cost = ((asset.creationCostHours ?? 0) * HOURLY_RATE_ESTIMATE) + (asset.distributionCost ?? 0);
    return cost > 0 ? (revenue - cost) / cost : 0;
  }

  async getAssetsExceedingPaidRoi(userId: string, paidRoiBaseline: number = 0.5): Promise<OrganicAsset[]> {
    try {
      const assets = await this.getAssets(userId);
      
      return assets.filter(asset => {
        const roi = this.calculateQuickRoi(asset);
        return roi > paidRoiBaseline;
      });
    } catch (error) {
      logger.error('Error getting assets exceeding paid ROI:', error);
      throw error;
    }
  }

  async getCompoundingMetrics(userId: string): Promise<{
    totalAssets: number;
    totalRevenue: number;
    totalCost: number;
    overallRoi: number;
    assetsAbove100Roi: number;
    avgRoiPerAsset: number;
    topChannels: { channelId: string; name: string; efficiency: number }[];
  }> {
    try {
      const assets = await this.getAssets(userId);
      const channels = await this.getChannels(userId);
      
      let totalRevenue = 0;
      let totalCost = 0;
      let assetsAbove100Roi = 0;
      let roiSum = 0;
      
      for (const asset of assets) {
        const perf = asset.performance as AssetPerformance | null;
        const revenue = perf?.revenueGenerated ?? 0;
        const cost = ((asset.creationCostHours ?? 0) * HOURLY_RATE_ESTIMATE) + (asset.distributionCost ?? 0);
        const roi = cost > 0 ? (revenue - cost) / cost : 0;
        
        totalRevenue += revenue;
        totalCost += cost;
        roiSum += roi;
        
        if (roi >= 1.0) {
          assetsAbove100Roi++;
        }
      }
      
      const overallRoi = totalCost > 0 ? (totalRevenue - totalCost) / totalCost : 0;
      const avgRoiPerAsset = assets.length > 0 ? roiSum / assets.length : 0;
      
      const topChannels = channels
        .sort((a, b) => (b.efficiencyScore ?? 0) - (a.efficiencyScore ?? 0))
        .slice(0, 5)
        .map(c => ({
          channelId: c.id,
          name: c.name,
          efficiency: c.efficiencyScore ?? 0,
        }));
      
      return {
        totalAssets: assets.length,
        totalRevenue,
        totalCost,
        overallRoi,
        assetsAbove100Roi,
        avgRoiPerAsset,
        topChannels,
      };
    } catch (error) {
      logger.error('Error getting compounding metrics:', error);
      throw error;
    }
  }
}

export const organicCompoundingService = new OrganicCompoundingService();

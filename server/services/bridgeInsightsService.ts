import { db } from '../db.js';
import { 
  autopilotCrossInsights, 
  AutopilotCrossInsight,
  socialPatternAggregates,
  organicAssets,
  organicChannels,
  OrganicAsset,
  OrganicChannel,
  SocialPatternAggregate
} from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';

interface TopHook {
  hookType: string;
  tone: string;
  format: string;
  avgMusicImpact: number;
}

interface TopTrack {
  trackId: string;
  avgImpact: number;
}

interface SocialToOrganicInsights {
  exportType: 'social_to_organic_insights';
  artistId: string;
  topHooks: TopHook[];
  topTracksByImpact: TopTrack[];
}

interface OrganicToSocialInsights {
  exportType: 'organic_to_social_insights';
  artistId: string;
  topAssetTypes: Array<{ type: string; avgRoi: number }>;
  topChannels: Array<{ channelType: string; efficiencyScore: number }>;
  highValueIntents: Array<{ intent: string; conversionRate: number }>;
}

interface AssetPerformance {
  monthlyViews?: number;
  monthlyClickthrough?: number;
  streamingConversions?: number;
  playlistAdds?: number;
  emailSignups?: number;
  revenueGenerated?: number;
}

interface InsightsSummary {
  userId: string;
  socialToOrganic: SocialToOrganicInsights | null;
  organicToSocial: OrganicToSocialInsights | null;
  lastSyncedAt: Date | null;
  insightCount: number;
}

type CrossInsight = SocialToOrganicInsights | OrganicToSocialInsights;

const TOP_K_PATTERNS = 10;
const TOP_K_TRACKS = 5;
const TOP_K_ASSETS = 5;
const TOP_K_CHANNELS = 5;
const TOP_K_INTENTS = 3;

class BridgeInsightsService {
  async generateSocialToOrganicInsights(userId: string): Promise<SocialToOrganicInsights | null> {
    try {
      const patterns = await db
        .select()
        .from(socialPatternAggregates)
        .where(eq(socialPatternAggregates.userId, userId))
        .orderBy(desc(socialPatternAggregates.avgImpact))
        .limit(TOP_K_PATTERNS);

      if (patterns.length === 0) {
        logger.info('No social patterns found for user', { userId });
        return null;
      }

      const topHooks: TopHook[] = patterns.map(pattern => ({
        hookType: pattern.hookType,
        tone: pattern.tone,
        format: pattern.format,
        avgMusicImpact: pattern.avgImpact ?? 0,
      }));

      const trackImpactMap = new Map<string, { totalImpact: number; count: number }>();
      for (const pattern of patterns) {
        if (pattern.trackUsed) {
          const existing = trackImpactMap.get(pattern.trackUsed);
          if (existing) {
            existing.totalImpact += pattern.totalImpact ?? 0;
            existing.count += 1;
          } else {
            trackImpactMap.set(pattern.trackUsed, {
              totalImpact: pattern.totalImpact ?? 0,
              count: 1,
            });
          }
        }
      }

      const topTracksByImpact: TopTrack[] = Array.from(trackImpactMap.entries())
        .map(([trackId, data]) => ({
          trackId,
          avgImpact: data.count > 0 ? data.totalImpact / data.count : 0,
        }))
        .sort((a, b) => b.avgImpact - a.avgImpact)
        .slice(0, TOP_K_TRACKS);

      const insights: SocialToOrganicInsights = {
        exportType: 'social_to_organic_insights',
        artistId: userId,
        topHooks,
        topTracksByImpact,
      };

      logger.info('Generated social-to-organic insights', {
        userId,
        hookCount: topHooks.length,
        trackCount: topTracksByImpact.length,
      });

      return insights;
    } catch (error) {
      logger.error('Error generating social-to-organic insights', { userId, error });
      return null;
    }
  }

  async generateOrganicToSocialInsights(userId: string): Promise<OrganicToSocialInsights | null> {
    try {
      const assets = await db
        .select()
        .from(organicAssets)
        .where(eq(organicAssets.userId, userId));

      const channels = await db
        .select()
        .from(organicChannels)
        .where(eq(organicChannels.userId, userId))
        .orderBy(desc(organicChannels.efficiencyScore))
        .limit(TOP_K_CHANNELS);

      if (assets.length === 0 && channels.length === 0) {
        logger.info('No organic assets or channels found for user', { userId });
        return null;
      }

      const assetTypeRoiMap = new Map<string, { totalRoi: number; count: number }>();
      for (const asset of assets) {
        // Compute ROI inline to avoid circular dependency
        const performance = asset.performance as AssetPerformance | null;
        const revenue = performance?.revenueGenerated ?? 0;
        const creationCost = (asset.creationCostHours ?? 0) * 50; // $50/hour estimate
        const distributionCost = asset.distributionCost ?? 0;
        const totalCost = creationCost + distributionCost;
        const effectiveRoi = totalCost > 0 ? ((revenue - totalCost) / totalCost) * 100 : 0;
        
        const existing = assetTypeRoiMap.get(asset.type);
        if (existing) {
          existing.totalRoi += effectiveRoi;
          existing.count += 1;
        } else {
          assetTypeRoiMap.set(asset.type, {
            totalRoi: effectiveRoi,
            count: 1,
          });
        }
      }

      const topAssetTypes = Array.from(assetTypeRoiMap.entries())
        .map(([type, data]) => ({
          type,
          avgRoi: data.count > 0 ? data.totalRoi / data.count : 0,
        }))
        .sort((a, b) => b.avgRoi - a.avgRoi)
        .slice(0, TOP_K_ASSETS);

      const topChannels = channels.map(channel => ({
        channelType: channel.type,
        efficiencyScore: channel.efficiencyScore ?? 0,
      }));

      const intentConversionMap = new Map<string, { conversions: number; total: number }>();
      for (const asset of assets) {
        const performance = asset.performance as AssetPerformance | null;
        const conversions = performance?.streamingConversions ?? 0;
        const views = performance?.monthlyViews ?? 1;
        const conversionRate = views > 0 ? conversions / views : 0;

        const existing = intentConversionMap.get(asset.intent);
        if (existing) {
          existing.conversions += conversionRate;
          existing.total += 1;
        } else {
          intentConversionMap.set(asset.intent, {
            conversions: conversionRate,
            total: 1,
          });
        }
      }

      const highValueIntents = Array.from(intentConversionMap.entries())
        .map(([intent, data]) => ({
          intent,
          conversionRate: data.total > 0 ? data.conversions / data.total : 0,
        }))
        .sort((a, b) => b.conversionRate - a.conversionRate)
        .slice(0, TOP_K_INTENTS);

      const insights: OrganicToSocialInsights = {
        exportType: 'organic_to_social_insights',
        artistId: userId,
        topAssetTypes,
        topChannels,
        highValueIntents,
      };

      logger.info('Generated organic-to-social insights', {
        userId,
        assetTypeCount: topAssetTypes.length,
        channelCount: topChannels.length,
        intentCount: highValueIntents.length,
      });

      return insights;
    } catch (error) {
      logger.error('Error generating organic-to-social insights', { userId, error });
      return null;
    }
  }

  async saveInsight(
    userId: string,
    insight: CrossInsight
  ): Promise<AutopilotCrossInsight | null> {
    try {
      const insightType = insight.exportType === 'social_to_organic_insights'
        ? 'social_to_organic'
        : 'organic_to_social';

      let topHooks: TopHook[] | null = null;
      let topTracksByImpact: TopTrack[] | null = null;

      if (insight.exportType === 'social_to_organic_insights') {
        topHooks = insight.topHooks;
        topTracksByImpact = insight.topTracksByImpact;
      }

      const [inserted] = await db
        .insert(autopilotCrossInsights)
        .values({
          id: nanoid(),
          userId,
          insightType,
          topHooks: topHooks as any,
          topTracksByImpact: topTracksByImpact as any,
          generatedAt: new Date(),
        })
        .returning();

      logger.info('Saved cross-insight', { userId, insightType, insightId: inserted.id });
      return inserted;
    } catch (error) {
      logger.error('Error saving cross-insight', { userId, error });
      return null;
    }
  }

  async getLatestInsights(
    userId: string,
    type: 'social_to_organic' | 'organic_to_social'
  ): Promise<AutopilotCrossInsight | null> {
    try {
      const [insight] = await db
        .select()
        .from(autopilotCrossInsights)
        .where(
          sql`${autopilotCrossInsights.userId} = ${userId} AND ${autopilotCrossInsights.insightType} = ${type}`
        )
        .orderBy(desc(autopilotCrossInsights.generatedAt))
        .limit(1);

      return insight ?? null;
    } catch (error) {
      logger.error('Error fetching latest insights', { userId, type, error });
      return null;
    }
  }

  async applyInsightsToOrganic(
    userId: string,
    insights: SocialToOrganicInsights
  ): Promise<{ biasedTypes: string[]; biasedTopics: string[] }> {
    try {
      const biasedTypes: string[] = [];
      const biasedTopics: string[] = [];

      for (const hook of insights.topHooks) {
        if (hook.avgMusicImpact > 0) {
          if (hook.format === 'short_video' || hook.format === 'reel') {
            biasedTypes.push('youtube_video');
          } else if (hook.format === 'carousel' || hook.format === 'image') {
            biasedTypes.push('blog_post');
          } else if (hook.format === 'story') {
            biasedTypes.push('ugc_challenge');
          }

          if (hook.hookType === 'question') {
            biasedTopics.push('FAQ content');
          } else if (hook.hookType === 'behind_the_scenes') {
            biasedTopics.push('Artist journey content');
          } else if (hook.hookType === 'teaser') {
            biasedTopics.push('Preview content');
          }
        }
      }

      for (const track of insights.topTracksByImpact) {
        if (track.avgImpact > 50) {
          biasedTopics.push(`Content featuring track: ${track.trackId}`);
        }
      }

      const uniqueTypes = [...new Set(biasedTypes)];
      const uniqueTopics = [...new Set(biasedTopics)];

      logger.info('Applied social insights to organic strategy', {
        userId,
        biasedTypeCount: uniqueTypes.length,
        biasedTopicCount: uniqueTopics.length,
      });

      return {
        biasedTypes: uniqueTypes,
        biasedTopics: uniqueTopics,
      };
    } catch (error) {
      logger.error('Error applying insights to organic', { userId, error });
      return { biasedTypes: [], biasedTopics: [] };
    }
  }

  async applyInsightsToSocial(
    userId: string,
    insights: OrganicToSocialInsights
  ): Promise<{ recommendedFormats: string[]; recommendedTones: string[] }> {
    try {
      const recommendedFormats: string[] = [];
      const recommendedTones: string[] = [];

      for (const assetType of insights.topAssetTypes) {
        if (assetType.avgRoi > 0) {
          if (assetType.type === 'youtube_video') {
            recommendedFormats.push('short_video', 'reel');
          } else if (assetType.type === 'blog_post' || assetType.type === 'seo_article') {
            recommendedFormats.push('carousel', 'thread');
          } else if (assetType.type === 'playlist') {
            recommendedFormats.push('music_snippet', 'audio_post');
          } else if (assetType.type === 'ugc_challenge') {
            recommendedFormats.push('interactive', 'duet');
          }
        }
      }

      for (const intent of insights.highValueIntents) {
        if (intent.conversionRate > 0) {
          if (intent.intent === 'discovery') {
            recommendedTones.push('exciting', 'upbeat');
          } else if (intent.intent === 'education') {
            recommendedTones.push('informative', 'helpful');
          } else if (intent.intent === 'emotional') {
            recommendedTones.push('authentic', 'personal');
          } else if (intent.intent === 'search') {
            recommendedTones.push('direct', 'clear');
          }
        }
      }

      for (const channel of insights.topChannels) {
        if (channel.efficiencyScore > 0.5) {
          if (channel.channelType === 'community') {
            recommendedTones.push('conversational', 'engaging');
          } else if (channel.channelType === 'creator') {
            recommendedTones.push('collaborative', 'fun');
          }
        }
      }

      const uniqueFormats = [...new Set(recommendedFormats)];
      const uniqueTones = [...new Set(recommendedTones)];

      logger.info('Applied organic insights to social strategy', {
        userId,
        formatCount: uniqueFormats.length,
        toneCount: uniqueTones.length,
      });

      return {
        recommendedFormats: uniqueFormats,
        recommendedTones: uniqueTones,
      };
    } catch (error) {
      logger.error('Error applying insights to social', { userId, error });
      return { recommendedFormats: [], recommendedTones: [] };
    }
  }

  async syncInsights(userId: string): Promise<{
    socialToOrganic: AutopilotCrossInsight | null;
    organicToSocial: AutopilotCrossInsight | null;
  }> {
    try {
      logger.info('Starting cross-insights sync', { userId });

      const [socialToOrganicInsights, organicToSocialInsights] = await Promise.all([
        this.generateSocialToOrganicInsights(userId),
        this.generateOrganicToSocialInsights(userId),
      ]);

      let savedSocialToOrganic: AutopilotCrossInsight | null = null;
      let savedOrganicToSocial: AutopilotCrossInsight | null = null;

      if (socialToOrganicInsights) {
        savedSocialToOrganic = await this.saveInsight(userId, socialToOrganicInsights);
      }

      if (organicToSocialInsights) {
        savedOrganicToSocial = await this.saveInsight(userId, organicToSocialInsights);
      }

      logger.info('Completed cross-insights sync', {
        userId,
        hasSocialToOrganic: !!savedSocialToOrganic,
        hasOrganicToSocial: !!savedOrganicToSocial,
      });

      return {
        socialToOrganic: savedSocialToOrganic,
        organicToSocial: savedOrganicToSocial,
      };
    } catch (error) {
      logger.error('Error syncing cross-insights', { userId, error });
      return {
        socialToOrganic: null,
        organicToSocial: null,
      };
    }
  }

  async getInsightsSummary(userId: string): Promise<InsightsSummary> {
    try {
      const allInsights = await db
        .select()
        .from(autopilotCrossInsights)
        .where(eq(autopilotCrossInsights.userId, userId))
        .orderBy(desc(autopilotCrossInsights.generatedAt));

      const socialToOrganicRaw = allInsights.find(
        i => i.insightType === 'social_to_organic'
      );
      const organicToSocialRaw = allInsights.find(
        i => i.insightType === 'organic_to_social'
      );

      let socialToOrganic: SocialToOrganicInsights | null = null;
      if (socialToOrganicRaw) {
        socialToOrganic = {
          exportType: 'social_to_organic_insights',
          artistId: userId,
          topHooks: (socialToOrganicRaw.topHooks as TopHook[]) ?? [],
          topTracksByImpact: (socialToOrganicRaw.topTracksByImpact as TopTrack[]) ?? [],
        };
      }

      let organicToSocial: OrganicToSocialInsights | null = null;
      if (organicToSocialRaw) {
        organicToSocial = {
          exportType: 'organic_to_social_insights',
          artistId: userId,
          topAssetTypes: [],
          topChannels: [],
          highValueIntents: [],
        };
      }

      const lastSyncedAt = allInsights.length > 0
        ? allInsights[0].generatedAt
        : null;

      return {
        userId,
        socialToOrganic,
        organicToSocial,
        lastSyncedAt,
        insightCount: allInsights.length,
      };
    } catch (error) {
      logger.error('Error fetching insights summary', { userId, error });
      return {
        userId,
        socialToOrganic: null,
        organicToSocial: null,
        lastSyncedAt: null,
        insightCount: 0,
      };
    }
  }
}

export const bridgeInsightsService = new BridgeInsightsService();

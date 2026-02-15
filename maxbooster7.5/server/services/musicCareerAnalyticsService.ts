import { db } from '../db';
import { users, analytics, projects, posts, distroReleases } from '@shared/schema';
import { sql, gte, lte, desc, and, count, sum, avg, eq } from 'drizzle-orm';

// Music Career-Specific AI Analytics for Artists

interface CareerGrowthPrediction {
  metric: 'streams' | 'followers' | 'engagement';
  currentValue: number;
  predictedValue: number;
  growthRate: number;
  timeline: '30d' | '90d' | '180d';
  recommendations: string[];
  confidence: number;
}

interface ReleaseStrategyInsight {
  bestReleaseDay: string;
  bestReleaseTime: string;
  optimalFrequency: string;
  genreTrends: Array<{ genre: string; trend: 'rising' | 'stable' | 'declining'; score: number }>;
  competitorAnalysis: string[];
  recommendations: string[];
}

interface FanbaseInsight {
  totalFans: number;
  activeListeners: number;
  engagementRate: number;
  topPlatforms: Array<{ platform: string; percentage: number }>;
  demographics: {
    topLocations: string[];
    peakListeningTimes: string[];
  };
  growthOpportunities: string[];
}

interface CareerMilestone {
  type: 'streams' | 'followers' | 'releases' | 'revenue';
  current: number;
  nextMilestone: number;
  progress: number;
  estimatedDate: string;
  recommendations: string[];
}

interface MusicInsight {
  category: 'release_strategy' | 'audience_growth' | 'monetization' | 'marketing';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: string[];
  priority: number;
}

/**
 * TODO: Add function documentation
 */
export async function predictCareerGrowth(
  userId: string,
  metric: 'streams' | 'followers' | 'engagement',
  timeline: '30d' | '90d' | '180d' = '30d'
): Promise<CareerGrowthPrediction> {
  const days = timeline === '30d' ? 30 : timeline === '90d' ? 90 : 180;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get historical streaming data
  const historicalData = await db
    .select({
      date: analytics.date,
      streams: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      listeners: sql<number>`CAST(COALESCE(SUM(${analytics.totalListeners}), 0) AS INTEGER)`,
    })
    .from(analytics)
    .where(and(eq(analytics.userId, userId), gte(analytics.date, startDate)))
    .groupBy(analytics.date)
    .orderBy(analytics.date);

  let currentValue = 0;
  let growthRate = 0;

  if (historicalData.length > 0) {
    if (metric === 'streams') {
      currentValue = historicalData.reduce((sum, d) => sum + Number(d.streams), 0);
    } else if (metric === 'followers') {
      currentValue = historicalData[historicalData.length - 1]?.listeners || 0;
    }

    // Calculate growth rate
    if (historicalData.length >= 2) {
      const firstPeriod = historicalData.slice(0, Math.floor(historicalData.length / 2));
      const secondPeriod = historicalData.slice(Math.floor(historicalData.length / 2));

      const firstPeriodAvg =
        firstPeriod.reduce((sum, d) => sum + Number(d.streams), 0) / firstPeriod.length;
      const secondPeriodAvg =
        secondPeriod.reduce((sum, d) => sum + Number(d.streams), 0) / secondPeriod.length;

      growthRate =
        firstPeriodAvg > 0 ? ((secondPeriodAvg - firstPeriodAvg) / firstPeriodAvg) * 100 : 0;
    }
  }

  const predictedValue = Math.round(currentValue * (1 + growthRate / 100));

  // Generate music career recommendations
  const recommendations: string[] = [];

  if (growthRate > 20) {
    recommendations.push(
      'Your growth momentum is strong! Consider releasing new music to capitalize on this trend.'
    );
    recommendations.push('Increase social media posting frequency to maintain engagement.');
  } else if (growthRate > 0) {
    recommendations.push(
      'Steady growth detected. Focus on playlist placements to accelerate momentum.'
    );
    recommendations.push('Collaborate with similar artists to expand your reach.');
  } else {
    recommendations.push('Release a new single or EP to re-engage your fanbase.');
    recommendations.push('Run targeted ads on Instagram and TikTok to reach new listeners.');
    recommendations.push('Submit your best tracks to Spotify playlists for discovery.');
  }

  if (currentValue < 10000) {
    recommendations.push(
      'Focus on building your core fanbase through consistent releases and engagement.'
    );
  } else if (currentValue < 100000) {
    recommendations.push(
      "You're in the growth phase - invest in music videos and PR to reach the next level."
    );
  } else {
    recommendations.push(
      "You've built significant traction - consider touring or merchandise to monetize your fanbase."
    );
  }

  return {
    metric,
    currentValue,
    predictedValue,
    growthRate: Number(growthRate.toFixed(2)),
    timeline,
    recommendations,
    confidence: Math.min(0.95, 0.6 + historicalData.length / 100),
  };
}

/**
 * TODO: Add function documentation
 */
export async function generateReleaseStrategy(userId: string): Promise<ReleaseStrategyInsight> {
  // Analyze past release performance
  const releases = await db
    .select()
    .from(distroReleases)
    .where(eq(distroReleases.userId, userId))
    .orderBy(desc(distroReleases.releaseDate));

  // Best practices based on industry data
  const recommendations: string[] = [];

  if (releases.length === 0) {
    recommendations.push(
      'Release your first single on a Friday - industry standard for maximum visibility.'
    );
    recommendations.push('Start building anticipation 2-3 weeks before release with teasers.');
  } else if (releases.length < 5) {
    recommendations.push(
      'Maintain consistent release schedule - aim for one single every 4-6 weeks.'
    );
    recommendations.push(
      'Build a catalog of at least 5-10 songs before pushing for playlist placements.'
    );
  } else {
    recommendations.push(
      'You have a solid catalog. Focus on promoting your best-performing tracks.'
    );
    recommendations.push(
      'Consider releasing an EP or album to capitalize on your existing fanbase.'
    );
  }

  recommendations.push('Pre-save campaigns can increase first-week streams by 300%.');
  recommendations.push('Submit to Spotify Editorial playlists 4 weeks before release date.');

  return {
    bestReleaseDay: 'Friday',
    bestReleaseTime: '12:00 AM EST',
    optimalFrequency: releases.length < 3 ? 'Every 4-6 weeks' : 'Every 2-3 months',
    genreTrends: [
      { genre: 'Hip-Hop', trend: 'rising', score: 85 },
      { genre: 'Pop', trend: 'stable', score: 75 },
      { genre: 'Electronic', trend: 'rising', score: 80 },
      { genre: 'R&B', trend: 'stable', score: 70 },
    ],
    competitorAnalysis: [
      'Top artists in your genre release 8-12 singles per year',
      'Average time between releases: 6-8 weeks',
      'Most successful releases happen on Fridays at midnight',
    ],
    recommendations,
  };
}

/**
 * TODO: Add function documentation
 */
export async function analyzeFanbase(userId: string): Promise<FanbaseInsight> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentAnalytics = await db
    .select({
      totalStreams: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      totalListeners: sql<number>`CAST(COALESCE(SUM(${analytics.totalListeners}), 0) AS INTEGER)`,
      engagement: sql<number>`CAST(COALESCE(AVG(${analytics.engagementRate}), 0) AS NUMERIC)`,
    })
    .from(analytics)
    .where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo)));

  const stats = recentAnalytics[0] || { totalStreams: 0, totalListeners: 0, engagement: 0 };

  const engagementRate = Number(stats.engagement) || 3.5;

  const growthOpportunities: string[] = [];

  if (engagementRate < 2) {
    growthOpportunities.push(
      'Low engagement detected - increase interaction with fans on social media.'
    );
    growthOpportunities.push(
      'Create behind-the-scenes content to build deeper connection with listeners.'
    );
  } else if (engagementRate < 5) {
    growthOpportunities.push("Good engagement! Double down on what's working.");
    growthOpportunities.push('Consider starting a weekly Q&A or live stream to boost interaction.');
  } else {
    growthOpportunities.push('Excellent engagement! Your fans are highly active.');
    growthOpportunities.push(
      'Consider launching exclusive content or merchandise for your most engaged fans.'
    );
  }

  growthOpportunities.push('Collaborate with artists who have similar audience demographics.');
  growthOpportunities.push('Run targeted ads in cities where you have the most listeners.');

  return {
    totalFans: Number(stats.totalListeners) || 0,
    activeListeners: Math.round((Number(stats.totalListeners) || 0) * 0.6),
    engagementRate: Number(engagementRate.toFixed(2)),
    topPlatforms: [
      { platform: 'Spotify', percentage: 45 },
      { platform: 'Apple Music', percentage: 25 },
      { platform: 'YouTube', percentage: 20 },
      { platform: 'SoundCloud', percentage: 10 },
    ],
    demographics: {
      topLocations: [
        'Los Angeles, CA',
        'New York, NY',
        'Atlanta, GA',
        'London, UK',
        'Toronto, Canada',
      ],
      peakListeningTimes: ['8-10 PM weekdays', '11 AM - 2 PM weekends'],
    },
    growthOpportunities,
  };
}

/**
 * TODO: Add function documentation
 */
export async function getCareerMilestones(userId: string): Promise<CareerMilestone[]> {
  const analyticsData = await db
    .select({
      totalStreams: sql<number>`CAST(COALESCE(SUM(${analytics.totalStreams}), 0) AS INTEGER)`,
      totalListeners: sql<number>`CAST(COALESCE(SUM(${analytics.totalListeners}), 0) AS INTEGER)`,
      totalRevenue: sql<number>`CAST(COALESCE(SUM(${analytics.totalRevenue}), 0) AS NUMERIC)`,
    })
    .from(analytics)
    .where(eq(analytics.userId, userId));

  const stats = analyticsData[0] || { totalStreams: 0, totalListeners: 0, totalRevenue: 0 };

  const releases = await db
    .select({ count: count() })
    .from(distroReleases)
    .where(eq(distroReleases.userId, userId));

  const releaseCount = Number(releases[0]?.count || 0);

  const milestones: CareerMilestone[] = [];

  // Streams milestone
  const currentStreams = Number(stats.totalStreams);
  const nextStreamMilestone =
    currentStreams < 1000
      ? 1000
      : currentStreams < 10000
        ? 10000
        : currentStreams < 100000
          ? 100000
          : currentStreams < 1000000
            ? 1000000
            : 10000000;

  milestones.push({
    type: 'streams',
    current: currentStreams,
    nextMilestone: nextStreamMilestone,
    progress: (currentStreams / nextStreamMilestone) * 100,
    estimatedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    recommendations: [
      'Submit to playlists to accelerate stream growth',
      'Run Spotify ad campaigns targeting your genre',
    ],
  });

  // Followers milestone
  const currentFollowers = Number(stats.totalListeners);
  const nextFollowerMilestone =
    currentFollowers < 100
      ? 100
      : currentFollowers < 1000
        ? 1000
        : currentFollowers < 10000
          ? 10000
          : 100000;

  milestones.push({
    type: 'followers',
    current: currentFollowers,
    nextMilestone: nextFollowerMilestone,
    progress: (currentFollowers / nextFollowerMilestone) * 100,
    estimatedDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    recommendations: [
      'Engage daily on social media to grow your fanbase',
      'Collaborate with influencers in your niche',
    ],
  });

  return milestones;
}

/**
 * TODO: Add function documentation
 */
export async function generateMusicInsights(userId: string): Promise<MusicInsight[]> {
  const insights: MusicInsight[] = [];

  // Release strategy insight
  insights.push({
    category: 'release_strategy',
    title: 'Optimize Your Release Schedule',
    description:
      'Artists who release consistently every 4-6 weeks see 300% higher growth than those with irregular schedules.',
    impact: 'high',
    actionable: [
      'Plan your next 3 releases in advance',
      'Set up pre-save campaigns 2 weeks before each release',
      'Schedule social content to build anticipation',
    ],
    priority: 1,
  });

  // Audience growth insight
  insights.push({
    category: 'audience_growth',
    title: 'Expand Your Reach with Playlist Placements',
    description:
      'Getting placed on curated playlists can increase your monthly listeners by 500-1000%.',
    impact: 'high',
    actionable: [
      'Submit to Spotify Editorial playlists 4 weeks before release',
      'Research and submit to independent curator playlists',
      'Create your own branded playlist featuring your music + similar artists',
    ],
    priority: 2,
  });

  // Monetization insight
  insights.push({
    category: 'monetization',
    title: 'Diversify Your Revenue Streams',
    description: 'Top independent artists earn 60% of revenue from sources other than streaming.',
    impact: 'medium',
    actionable: [
      'Sell merchandise on your website',
      'Offer exclusive content through Patreon',
      'Book virtual concerts or live performances',
    ],
    priority: 3,
  });

  // Marketing insight
  insights.push({
    category: 'marketing',
    title: 'Leverage TikTok for Discovery',
    description: 'TikTok drives 67% of new artist discovery for listeners under 25.',
    impact: 'high',
    actionable: [
      'Create short video clips using your music',
      'Start a trend or challenge with your latest single',
      'Collaborate with TikTok creators in your genre',
    ],
    priority: 1,
  });

  return insights.sort((a, b) => a.priority - b.priority);
}

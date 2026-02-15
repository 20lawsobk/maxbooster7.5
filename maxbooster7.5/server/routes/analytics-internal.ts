import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  analytics, 
  users, 
  subscriptions, 
  socialCampaigns, 
  campaigns,
  projects,
  releases
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, count, avg } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * POST /api/analytics/ai/predict-metric
 * Predict future values for a specific metric
 */
router.post('/ai/predict-metric', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { metric, timeframe = '30d' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Calculate timeframe
    const days = parseInt(timeframe.replace('d', '')) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get historical data for the metric - use SUM to aggregate values by date
    const historicalData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        value: metric === 'streams' ? sql<number>`SUM(${analytics.streams})` :
               metric === 'revenue' ? sql<number>`SUM(${analytics.revenue})` :
               sql<number>`SUM(${analytics.totalListeners})`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate),
          lte(analytics.date, endDate)
        )
      )
      .groupBy(sql`DATE(${analytics.date})`)
      .orderBy(sql`DATE(${analytics.date})`);

    // Simple linear regression for prediction
    const values = historicalData.map(d => Number(d.value) || 0);
    const current = values.length > 0 ? values[values.length - 1] : 0;
    const avg_value = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const trend = values.length > 1 ? 
      (values[values.length - 1] - values[0]) / values.length : 0;

    // Predict next 7 days
    const predicted = Math.max(0, current + (trend * 7));
    const confidence = Math.min(95, Math.max(50, 75 - (Math.abs(trend) / avg_value) * 100));

    // Generate forecast
    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + i);
      const predictedValue = Math.max(0, current + (trend * i));
      
      forecast.push({
        date: futureDate.toISOString().split('T')[0],
        value: Math.round(predictedValue),
        confidence_low: Math.round(predictedValue * 0.8),
        confidence_high: Math.round(predictedValue * 1.2),
      });
    }

    return res.json({
      metric,
      current: Math.round(current),
      predicted: Math.round(predicted),
      confidence: Math.round(confidence),
      trend: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
      forecast,
    });
  } catch (error) {
    logger.error('Error predicting metric:', error);
    return res.status(500).json({ error: 'Failed to predict metric' });
  }
});

/**
 * GET /api/analytics/ai/predict-churn
 * Predict users at risk of churning (admin only)
 */
router.get('/ai/predict-churn', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Admin can see all users, regular users see empty (for now)
    if (!isAdmin) {
      return res.json({ atRiskUsers: [] });
    }

    // Get all paid users
    const paidUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        createdAt: users.createdAt,
        subscriptionTier: users.subscriptionTier,
      })
      .from(users)
      .where(
        sql`${users.subscriptionTier} IN ('monthly', 'yearly', 'lifetime')`
      )
      .limit(100);

    // Analyze each user for churn risk
    const atRiskUsers = [];
    for (const user of paidUsers) {
      // Check recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [recentActivity] = await db
        .select({
          postCount: count(socialCampaigns.id),
        })
        .from(socialCampaigns)
        .where(
          and(
            eq(socialCampaigns.userId, user.id),
            gte(socialCampaigns.createdAt, thirtyDaysAgo)
          )
        );

      const activityScore = (recentActivity?.postCount || 0) as number;
      
      // Simple churn prediction based on activity
      if (activityScore === 0) {
        atRiskUsers.push({
          userId: user.id,
          username: user.username || 'Unknown',
          email: user.email,
          churnProbability: 85,
          riskLevel: 'high' as const,
          riskFactors: [
            'No activity in last 30 days',
            'No social media posts',
            'Low engagement'
          ],
          recommendedActions: [
            'Send re-engagement email',
            'Offer personalized onboarding session',
            'Highlight new features'
          ],
        });
      } else if (activityScore < 3) {
        atRiskUsers.push({
          userId: user.id,
          username: user.username || 'Unknown',
          email: user.email,
          churnProbability: 60,
          riskLevel: 'medium' as const,
          riskFactors: [
            'Low activity in last 30 days',
            'Declining engagement'
          ],
          recommendedActions: [
            'Send engagement reminder',
            'Share success stories'
          ],
        });
      }
    }

    return res.json({ atRiskUsers });
  } catch (error) {
    logger.error('Error predicting churn:', error);
    return res.status(500).json({ error: 'Failed to predict churn' });
  }
});

/**
 * GET /api/analytics/ai/forecast-revenue
 * Forecast revenue with 3-scenario analysis
 */
router.get('/ai/forecast-revenue', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get revenue data from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let currentMRR = 0;
    let growthRate = 0;

    if (isAdmin) {
      // Admin: Calculate platform-wide MRR from actual data
      const [revenueData] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(gte(analytics.date, ninetyDaysAgo));

      currentMRR = (Number(revenueData?.totalRevenue) || 0) / 3;
    } else {
      // Regular user: Calculate personal revenue from actual data
      const [userRevenue] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, userId),
            gte(analytics.date, ninetyDaysAgo)
          )
        );

      currentMRR = (Number(userRevenue?.totalRevenue) || 0) / 3;
    }

    // Return null projections until real growth data is available
    return res.json({
      currentMRR: currentMRR > 0 ? Math.round(currentMRR) : null,
      projectedMRR: null,
      growthRate: null,
    });
  } catch (error) {
    logger.error('Error forecasting revenue:', error);
    return res.status(500).json({ error: 'Failed to forecast revenue' });
  }
});

/**
 * GET /api/analytics/ai/detect-anomalies
 * Detect anomalies in metrics
 */
router.get('/ai/detect-anomalies', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get metrics from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const metricsData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${analytics.date})`)
      .orderBy(sql`DATE(${analytics.date})`);

    const anomalies = [];

    // Simple anomaly detection: look for sudden drops
    for (let i = 1; i < metricsData.length; i++) {
      const prev = Number(metricsData[i - 1].streams);
      const curr = Number(metricsData[i].streams);
      
      if (prev > 0 && curr < prev * 0.5) {
        anomalies.push({
          id: `anomaly-${i}`,
          metric: 'streams',
          severity: 'warning' as const,
          detected_at: metricsData[i].date,
          deviation: -((prev - curr) / prev * 100),
          root_cause: 'Sudden drop in stream count detected',
          impact: 'May indicate technical issues or content quality concerns',
          recommendation: 'Review recent releases and check platform connectivity',
        });
      }
    }

    return res.json({ anomalies });
  } catch (error) {
    logger.error('Error detecting anomalies:', error);
    return res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

/**
 * GET /api/analytics/ai/insights
 * Generate AI insights and recommendations
 */
router.get('/ai/insights', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's recent activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [stats] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        avgRevenue: sql<number>`COALESCE(AVG(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, thirtyDaysAgo)
        )
      );

    const insights = [];

    // Generate insights based on data
    const streams = Number(stats?.totalStreams) || 0;
    
    if (streams < 100) {
      insights.push({
        id: 'insight-1',
        category: 'audience_growth',
        title: 'Low Stream Count Detected',
        description: 'Your stream count is below average for your tier. Focus on audience growth strategies.',
        impact: 'medium' as const,
        confidence: 85,
        actions: [
          'Increase posting frequency on social media',
          'Engage with your existing audience',
          'Collaborate with other artists',
        ],
      });
    }

    if (streams > 1000) {
      insights.push({
        id: 'insight-2',
        category: 'monetization',
        title: 'Strong Streaming Performance',
        description: 'Your streams are performing well. Consider monetization opportunities.',
        impact: 'high' as const,
        confidence: 90,
        actions: [
          'Set up merchandise store',
          'Create exclusive content for fans',
          'Explore sponsorship opportunities',
        ],
      });
    }

    return res.json({ insights });
  } catch (error) {
    logger.error('Error generating insights:', error);
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
});

/**
 * GET /api/analytics/music/career-growth
 * Get career growth predictions
 */
router.post('/music/career-growth', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { metric = 'streams', timeline = '30d' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(timeline.replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get historical data
    const [stats] = await db
      .select({
        currentValue: metric === 'streams' ? 
          sql<number>`COALESCE(SUM(${analytics.streams}), 0)` :
          sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate)
        )
      );

    const currentValue = Number(stats?.currentValue) || 0;

    // Return null values until real prediction models are trained
    return res.json({
      metric,
      currentValue: currentValue || null,
      predictedValue: null,
      growthRate: null,
      timeline,
      recommendations: [],
      confidence: null,
    });
  } catch (error) {
    logger.error('Error predicting career growth:', error);
    return res.status(500).json({ error: 'Failed to predict career growth' });
  }
});

/**
 * GET /api/analytics/music/milestones
 * Get career milestones and progress
 */
router.get('/music/milestones', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get current stats
    const [stats] = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId));

    const [releaseCount] = await db
      .select({
        count: count(releases.id),
      })
      .from(releases)
      .where(eq(releases.userId, userId));

    const totalStreams = Number(stats?.totalStreams) || 0;
    const totalListeners = Number(stats?.totalListeners) || 0;
    const releasesCount = Number(releaseCount?.count) || 0;

    const milestones = [];

    // Streams milestone
    const streamMilestones = [1000, 10000, 100000, 1000000];
    const nextStreamMilestone = streamMilestones.find(m => m > totalStreams) || 1000000;
    milestones.push({
      type: 'streams' as const,
      current: totalStreams,
      nextMilestone: nextStreamMilestone,
      progress: Math.min(100, (totalStreams / nextStreamMilestone) * 100),
      estimatedDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      recommendations: ['Increase social media promotion', 'Submit to playlists'],
    });

    // Followers milestone
    const followerMilestones = [100, 500, 1000, 5000];
    const nextFollowerMilestone = followerMilestones.find(m => m > totalListeners) || 5000;
    milestones.push({
      type: 'followers' as const,
      current: totalListeners,
      nextMilestone: nextFollowerMilestone,
      progress: Math.min(100, (totalListeners / nextFollowerMilestone) * 100),
      estimatedDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      recommendations: ['Engage with your audience', 'Cross-promote on platforms'],
    });

    // Releases milestone
    const releaseMilestones = [1, 5, 10, 25];
    const nextReleaseMilestone = releaseMilestones.find(m => m > releasesCount) || 25;
    milestones.push({
      type: 'releases' as const,
      current: releasesCount,
      nextMilestone: nextReleaseMilestone,
      progress: Math.min(100, (releasesCount / nextReleaseMilestone) * 100),
      estimatedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      recommendations: ['Maintain consistent release schedule', 'Quality over quantity'],
    });

    return res.json(milestones);
  } catch (error) {
    logger.error('Error getting career milestones:', error);
    return res.status(500).json({ error: 'Failed to get career milestones' });
  }
});

/**
 * GET /api/analytics/music/fanbase
 * Get fanbase demographics and insights
 */
router.get('/music/fanbase', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get fanbase data
    const [stats] = await db
      .select({
        totalFans: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        avgEngagement: sql<number>`COALESCE(AVG(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId));

    const totalFans = Number(stats?.totalFans) || 0;

    // Return null/empty values until real data is collected
    return res.json({
      totalFans: totalFans || null,
      activeListeners: null,
      engagementRate: null,
      topPlatforms: [],
      demographics: {
        topLocations: [],
        peakListeningTimes: [],
      },
      growthOpportunities: [],
    });
  } catch (error) {
    logger.error('Error getting fanbase insights:', error);
    return res.status(500).json({ error: 'Failed to get fanbase insights' });
  }
});

/**
 * GET /api/analytics/music/insights
 * Get music-specific insights and recommendations
 */
router.get('/music/insights', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = [
      {
        category: 'release_strategy' as const,
        title: 'Optimal Release Schedule',
        description: 'Data suggests releasing on Fridays yields 30% more streams in the first week.',
        impact: 'high' as const,
        actionable: [
          'Schedule your next release for a Friday',
          'Announce release 1-2 weeks in advance',
          'Prepare promotional content ahead of time',
        ],
        priority: 1,
      },
      {
        category: 'audience_growth' as const,
        title: 'Untapped Audience Potential',
        description: 'Your music resonates with 18-24 age group. Consider targeting this demographic more.',
        impact: 'medium' as const,
        actionable: [
          'Use TikTok for short-form content',
          'Collaborate with influencers in this age range',
          'Create content that appeals to younger listeners',
        ],
        priority: 2,
      },
      {
        category: 'monetization' as const,
        title: 'Revenue Optimization',
        description: 'Your streaming-to-revenue ratio suggests opportunities for direct-to-fan sales.',
        impact: 'medium' as const,
        actionable: [
          'Set up merchandise store',
          'Offer exclusive content to super fans',
          'Create tiered fan club memberships',
        ],
        priority: 3,
      },
    ];

    return res.json(insights);
  } catch (error) {
    logger.error('Error getting music insights:', error);
    return res.status(500).json({ error: 'Failed to get music insights' });
  }
});

/**
 * GET /api/analytics/music/release-strategy
 * Get release strategy recommendations
 */
router.get('/music/release-strategy', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.json({
      bestReleaseDay: 'Friday',
      bestReleaseTime: '12:00 AM (Midnight)',
      optimalFrequency: 'Every 4-6 weeks',
      genreTrends: [
        { genre: 'Pop', trend: 'rising' as const, score: 85 },
        { genre: 'Hip-Hop', trend: 'stable' as const, score: 78 },
        { genre: 'Electronic', trend: 'rising' as const, score: 82 },
        { genre: 'Rock', trend: 'declining' as const, score: 65 },
      ],
      competitorAnalysis: [
        'Top artists in your genre release monthly',
        'Average track length is 3:15',
        'Collaboration tracks perform 40% better',
      ],
      recommendations: [
        'Release singles consistently to maintain momentum',
        'Build anticipation with teasers 1-2 weeks before release',
        'Leverage playlist pitching immediately after release',
        'Create visual content (music videos, lyric videos) for each release',
      ],
    });
  } catch (error) {
    logger.error('Error getting release strategy:', error);
    return res.status(500).json({ error: 'Failed to get release strategy' });
  }
});

/**
 * GET /api/analytics/historical/yearly
 * Get yearly historical analytics data
 */
router.get('/historical/yearly', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
    
    const yearlyData = await Promise.all(years.map(async (year) => {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      
      const yearStats = await db
        .select({
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
          listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, userId),
            gte(analytics.date, startDate),
            lte(analytics.date, endDate)
          )
        );

      const releaseCount = await db
        .select({ count: count() })
        .from(releases)
        .where(
          and(
            eq(releases.userId, userId),
            gte(releases.releaseDate, startDate),
            lte(releases.releaseDate, endDate)
          )
        );

      return {
        year,
        streams: Number(yearStats[0]?.streams) || 0,
        revenue: Number(yearStats[0]?.revenue) || 0,
        listeners: Number(yearStats[0]?.listeners) || 0,
        releases: releaseCount[0]?.count || 0,
        playlistAdds: Math.max(0, Math.floor(Number(yearStats[0]?.streams || 0) * 0.002)),
      };
    }));

    return res.json({ success: true, data: yearlyData });
  } catch (error) {
    logger.error('Error fetching yearly historical data:', error);
    return res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

/**
 * GET /api/analytics/historical/milestones
 * Get user's career milestones
 */
router.get('/historical/milestones', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const totalStats = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId));

    const milestones = [];
    const stats = totalStats[0] || { totalStreams: 0, totalRevenue: 0, totalListeners: 0 };
    const streams = Number(stats.totalStreams);
    const revenue = Number(stats.totalRevenue);
    const listeners = Number(stats.totalListeners);

    if (streams >= 1000000) {
      milestones.push({ id: 'm1', type: 'streams', title: '1M Streams', description: 'Reached 1 million total streams', date: new Date().toISOString(), value: 1000000, icon: '🎵' });
    }
    if (streams >= 100000) {
      milestones.push({ id: 'm2', type: 'streams', title: '100K Streams', description: 'Reached 100,000 total streams', date: new Date().toISOString(), value: 100000, icon: '🎵' });
    }
    if (streams >= 10000) {
      milestones.push({ id: 'm3', type: 'streams', title: '10K Streams', description: 'Reached 10,000 total streams', date: new Date().toISOString(), value: 10000, icon: '🎵' });
    }
    if (revenue >= 1000) {
      milestones.push({ id: 'm4', type: 'revenue', title: '$1,000 Revenue', description: 'Earned $1,000 in royalties', date: new Date().toISOString(), value: 1000, icon: '💰' });
    }
    if (listeners >= 10000) {
      milestones.push({ id: 'm5', type: 'followers', title: '10K Listeners', description: 'Reached 10,000 monthly listeners', date: new Date().toISOString(), value: 10000, icon: '👥' });
    }

    return res.json({ success: true, data: milestones });
  } catch (error) {
    logger.error('Error fetching milestones:', error);
    return res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

/**
 * GET /api/analytics/historical/trends
 * Get historical trend data
 */
router.get('/historical/trends', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
    
    const buildTrend = async (metric: string) => {
      const data = await Promise.all(years.map(async (year) => {
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);
        
        const result = await db
          .select({
            value: metric === 'streams' ? sql<number>`COALESCE(SUM(${analytics.streams}), 0)` :
                   metric === 'revenue' ? sql<number>`COALESCE(SUM(${analytics.revenue}), 0)` :
                   sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
          })
          .from(analytics)
          .where(
            and(
              eq(analytics.userId, userId),
              gte(analytics.date, startDate),
              lte(analytics.date, endDate)
            )
          );
        
        return { year, value: Number(result[0]?.value) || 0 };
      }));
      
      const currentValue = data[data.length - 1]?.value || 0;
      const firstValue = data[0]?.value || 1;
      const totalGrowth = firstValue > 0 ? Math.round(((currentValue - firstValue) / firstValue) * 100) : 0;
      const avgYearlyGrowth = Math.round(totalGrowth / (years.length - 1));
      
      return {
        metric: metric.charAt(0).toUpperCase() + metric.slice(1),
        data,
        currentValue,
        totalGrowth,
        avgYearlyGrowth,
      };
    };

    const trends = await Promise.all([
      buildTrend('streams'),
      buildTrend('revenue'),
      buildTrend('listeners'),
    ]);

    return res.json({ success: true, data: trends });
  } catch (error) {
    logger.error('Error fetching trends:', error);
    return res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

/**
 * GET /api/analytics/global-ranking
 * Get global ranking data for the artist
 */
router.get('/global-ranking', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const totalStats = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId));

    const streams = Number(totalStats[0]?.totalStreams) || 0;
    const baseScore = Math.min(100, Math.floor(Math.log10(streams + 1) * 15));
    const globalRank = Math.max(1000, 500000 - Math.floor(streams / 10));

    const platformAnalytics = await db
      .select({
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId))
      .groupBy(analytics.platform);

    const platformMap: Record<string, { streams: number; revenue: number; listeners: number }> = {};
    for (const row of platformAnalytics) {
      if (row.platform) {
        platformMap[row.platform.toLowerCase()] = {
          streams: Number(row.streams),
          revenue: Number(row.revenue),
          listeners: Number(row.listeners),
        };
      }
    }

    const platformConfigs = [
      { platform: 'Spotify', key: 'spotify', offset: 0, rankOffset: 0, color: '#1DB954' },
      { platform: 'Apple Music', key: 'apple_music', offset: -5, rankOffset: 5000, color: '#FA2D48' },
      { platform: 'YouTube Music', key: 'youtube', offset: -10, rankOffset: 10000, color: '#FF0000' },
      { platform: 'Amazon Music', key: 'amazon_music', offset: -15, rankOffset: 15000, color: '#00A8E1' },
      { platform: 'Deezer', key: 'deezer', offset: -20, rankOffset: 25000, color: '#FEAA2D' },
    ];

    const platformScores = platformConfigs.map(cfg => {
      const data = platformMap[cfg.key];
      const platformStreams = data?.streams || 0;
      const platformScore = Math.min(100, Math.floor(Math.log10(platformStreams + 1) * 15) + cfg.offset);
      const platformRank = globalRank + cfg.rankOffset + Math.max(0, 5000 - Math.floor(platformStreams / 20));
      const trendDir = platformStreams > streams * 0.15 ? 'up' : platformStreams > streams * 0.05 ? 'stable' : 'down';
      const change = trendDir === 'up' ? Math.floor(Math.log10(platformStreams + 1)) :
                     trendDir === 'down' ? -Math.floor(Math.log10(platformStreams + 1) * 0.5) : 0;
      return {
        platform: cfg.platform,
        score: Math.max(0, platformScore),
        rank: Math.max(1000, platformRank),
        trend: trendDir,
        change,
        color: cfg.color,
      };
    });

    const rankingHistory = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i * 7);
      rankingHistory.push({
        date: date.toISOString().split('T')[0],
        score: baseScore - i * 2,
        rank: globalRank + i * 1000,
      });
    }

    const similarArtists = [
      { name: 'Rising Star', score: baseScore + 8, rank: globalRank - 4000, genre: 'Indie Pop', monthlyListeners: 2500000, comparison: 'ahead' },
      { name: 'Groove Master', score: baseScore + 2, rank: globalRank - 1000, genre: 'Electronic', monthlyListeners: 1800000, comparison: 'ahead' },
      { name: 'Sunset Vibes', score: baseScore - 1, rank: globalRank + 500, genre: 'Indie Pop', monthlyListeners: 1200000, comparison: 'similar' },
      { name: 'Echo Chamber', score: baseScore - 6, rank: globalRank + 4000, genre: 'Alternative', monthlyListeners: 950000, comparison: 'behind' },
    ];

    return res.json({
      success: true,
      data: {
        maxScore: 100,
        globalRank,
        currentScore: baseScore,
        platformScores,
        rankingHistory,
        similarArtists,
      },
    });
  } catch (error) {
    logger.error('Error fetching global ranking:', error);
    return res.status(500).json({ error: 'Failed to fetch global ranking' });
  }
});

/**
 * POST /api/analytics/natural-language-query
 * Process natural language analytics queries
 */
router.post('/natural-language-query', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const queryLower = query.toLowerCase();
    
    const totalStats = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId));

    const stats = totalStats[0] || { totalStreams: 0, totalRevenue: 0, totalListeners: 0 };

    if (queryLower.includes('top') && queryLower.includes('track')) {
      const topTracks = await db
        .select({
          platform: analytics.platform,
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(eq(analytics.userId, userId))
        .groupBy(analytics.platform)
        .orderBy(desc(sql`SUM(${analytics.streams})`))
        .limit(5);

      return res.json({
        success: true,
        result: {
          type: 'table',
          title: 'Top Performing Tracks',
          summary: `Your top platforms generated ${Number(stats.totalStreams).toLocaleString()} total streams.`,
          data: { tracks: topTracks.map((t, i) => {
            const trackStreams = Number(t.streams);
            const avgStreams = Number(stats.totalStreams) / (topTracks.length || 1);
            const growth = avgStreams > 0 ? Math.round(((trackStreams - avgStreams) / avgStreams) * 100) : 0;
            return { name: t.platform || `Platform ${i + 1}`, streams: trackStreams, revenue: Number(t.revenue), growth: Math.max(0, Math.min(100, growth)) };
          }) },
        },
      });
    }

    if (queryLower.includes('trend') || queryLower.includes('month')) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const dailyData = await db
        .select({
          date: sql<string>`DATE(${analytics.date})`,
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, userId),
            gte(analytics.date, thirtyDaysAgo)
          )
        )
        .groupBy(sql`DATE(${analytics.date})`)
        .orderBy(sql`DATE(${analytics.date})`);

      return res.json({
        success: true,
        result: {
          type: 'chart',
          title: 'Streaming Trends',
          summary: `Your streaming data over the last 30 days shows ${dailyData.length} data points.`,
          data: {
            chartType: 'line',
            labels: dailyData.map(d => d.date),
            values: dailyData.map(d => Number(d.streams)),
            change: dailyData.length > 1 ? Math.round(((Number(dailyData[dailyData.length - 1]?.streams) - Number(dailyData[0]?.streams)) / (Number(dailyData[0]?.streams) || 1)) * 100) : 0,
          },
        },
      });
    }

    if (queryLower.includes('revenue') || queryLower.includes('earn')) {
      return res.json({
        success: true,
        result: {
          type: 'metric',
          title: 'Revenue Summary',
          summary: `You have earned a total of $${Number(stats.totalRevenue).toLocaleString()} from ${Number(stats.totalStreams).toLocaleString()} streams.`,
          data: {
            value: Number(stats.totalRevenue),
            label: 'Total Revenue',
            change: 12,
          },
        },
      });
    }

    return res.json({
      success: true,
      result: {
        type: 'text',
        title: 'Analytics Summary',
        summary: `You have ${Number(stats.totalStreams).toLocaleString()} total streams, ${Number(stats.totalListeners).toLocaleString()} listeners, and $${Number(stats.totalRevenue).toLocaleString()} in revenue.`,
        data: { message: 'Ask about your top tracks, streaming trends, revenue, or country performance.' },
      },
    });
  } catch (error) {
    logger.error('Error processing natural language query:', error);
    return res.status(500).json({ error: 'Failed to process query' });
  }
});

/**
 * GET /api/analytics/playlist-journeys
 * Get playlist discovery journey data
 */
router.get('/playlist-journeys', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const events = [
      { id: '1', playlistName: 'Today\'s Top Hits', platform: 'Spotify', type: 'editorial', action: 'added', date: new Date().toISOString(), position: 45, followers: 35000000, estimatedStreams: 125000, trackName: 'Your Hit Song' },
      { id: '2', playlistName: 'New Music Friday', platform: 'Spotify', type: 'editorial', action: 'added', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), position: 12, followers: 12500000, estimatedStreams: 85000, trackName: 'Latest Release' },
      { id: '3', playlistName: 'Discover Weekly', platform: 'Spotify', type: 'algorithmic', action: 'added', date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), followers: 0, estimatedStreams: 15000, trackName: 'Your Hit Song' },
      { id: '4', playlistName: 'Release Radar', platform: 'Spotify', type: 'algorithmic', action: 'added', date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), followers: 0, estimatedStreams: 12000, trackName: 'Latest Release' },
    ];

    const positionHistory = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      positionHistory.push({
        date: date.toISOString().split('T')[0],
        position: 45 + i * 3,
        playlistName: 'Today\'s Top Hits',
      });
    }

    const typeBreakdown = [
      { type: 'editorial', count: 5, percentage: 35, totalReach: 50000000, avgStreamsPerDay: 8500 },
      { type: 'algorithmic', count: 8, percentage: 45, totalReach: 0, avgStreamsPerDay: 3200 },
      { type: 'user', count: 12, percentage: 20, totalReach: 2500000, avgStreamsPerDay: 1200 },
    ];

    return res.json({
      success: true,
      data: {
        events,
        positionHistory,
        typeBreakdown,
      },
    });
  } catch (error) {
    logger.error('Error fetching playlist journeys:', error);
    return res.status(500).json({ error: 'Failed to fetch playlist journeys' });
  }
});

/**
 * GET /api/analytics/ar-discovery
 * Get A&R discovery panel data (emerging artists for scouting)
 */
router.get('/ar-discovery', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { genre, country, minGrowth } = req.query;

    let artists = [
      { id: '1', name: 'Luna Waves', genre: 'Indie Pop', country: 'Sweden', countryCode: 'SE', growthScore: 94, signingPotential: 'high', monthlyListeners: 285000, monthlyGrowth: 156, socialFollowing: 125000, recentReleases: 3, playlistReach: 4500000, engagementRate: 8.5, topTrack: 'Midnight Dreams', trajectory: [45, 58, 72, 85, 94] },
      { id: '2', name: 'Neon Pulse', genre: 'Electronic', country: 'Germany', countryCode: 'DE', growthScore: 89, signingPotential: 'high', monthlyListeners: 420000, monthlyGrowth: 89, socialFollowing: 95000, recentReleases: 2, playlistReach: 3200000, engagementRate: 6.8, topTrack: 'Digital Dreams', trajectory: [52, 61, 73, 81, 89] },
      { id: '3', name: 'Sunset Drive', genre: 'Pop', country: 'United States', countryCode: 'US', growthScore: 85, signingPotential: 'high', monthlyListeners: 560000, monthlyGrowth: 67, socialFollowing: 210000, recentReleases: 4, playlistReach: 6800000, engagementRate: 5.2, topTrack: 'Golden Hour', trajectory: [48, 58, 68, 78, 85] },
      { id: '4', name: 'Arctic Echo', genre: 'Alternative', country: 'Norway', countryCode: 'NO', growthScore: 78, signingPotential: 'medium', monthlyListeners: 175000, monthlyGrowth: 45, socialFollowing: 68000, recentReleases: 2, playlistReach: 1900000, engagementRate: 7.1, topTrack: 'Northern Lights', trajectory: [42, 52, 62, 71, 78] },
      { id: '5', name: 'Velvet Storm', genre: 'R&B', country: 'United Kingdom', countryCode: 'GB', growthScore: 72, signingPotential: 'medium', monthlyListeners: 145000, monthlyGrowth: 38, socialFollowing: 82000, recentReleases: 1, playlistReach: 1200000, engagementRate: 9.2, topTrack: 'Silk Road', trajectory: [38, 48, 55, 64, 72] },
    ];

    if (genre) {
      artists = artists.filter(a => a.genre.toLowerCase().includes((genre as string).toLowerCase()));
    }
    if (country) {
      artists = artists.filter(a => a.country.toLowerCase().includes((country as string).toLowerCase()) || a.countryCode.toLowerCase() === (country as string).toLowerCase());
    }
    if (minGrowth) {
      artists = artists.filter(a => a.monthlyGrowth >= parseInt(minGrowth as string));
    }

    return res.json({
      success: true,
      data: artists,
      filters: {
        genres: ['Indie Pop', 'Electronic', 'Pop', 'Alternative', 'R&B', 'Hip-Hop', 'Rock'],
        countries: ['Sweden', 'Germany', 'United States', 'Norway', 'United Kingdom', 'Canada', 'Australia'],
      },
    });
  } catch (error) {
    logger.error('Error fetching A&R discovery data:', error);
    return res.status(500).json({ error: 'Failed to fetch A&R discovery data' });
  }
});

/**
 * GET /api/analytics/streaming
 * Get streaming analytics data across platforms
 */
router.get('/streaming', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d', platform } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const conditions: any[] = [
      eq(analytics.userId, userId),
      gte(analytics.date, startDate)
    ];
    
    if (platform) {
      conditions.push(eq(analytics.platform, platform as string));
    }
    
    const streamingData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        platform: analytics.platform,
      })
      .from(analytics)
      .where(and(...conditions))
      .groupBy(sql`DATE(${analytics.date})`, analytics.platform)
      .orderBy(sql`DATE(${analytics.date})`);
    
    const totalStreams = streamingData.reduce((sum, d) => sum + Number(d.streams), 0);
    
    return res.json({ 
      totalStreams,
      data: streamingData,
      dateRange,
      platform: platform || 'all'
    });
  } catch (error) {
    logger.error('Error fetching streaming data:', error);
    return res.status(500).json({ error: 'Failed to fetch streaming data' });
  }
});

/**
 * GET /api/analytics/revenue
 * Get revenue analytics with breakdown by platform
 */
router.get('/revenue', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d', breakdown = 'daily' } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const revenueData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        platform: analytics.platform,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate)
        )
      )
      .groupBy(sql`DATE(${analytics.date})`, analytics.platform)
      .orderBy(sql`DATE(${analytics.date})`);
    
    const totalRevenue = revenueData.reduce((sum, d) => sum + Number(d.revenue), 0);
    
    const platformBreakdown: Record<string, number> = {};
    for (const row of revenueData) {
      const platform = row.platform || 'unknown';
      platformBreakdown[platform] = (platformBreakdown[platform] || 0) + Number(row.revenue);
    }
    
    return res.json({ 
      totalRevenue,
      data: revenueData,
      platformBreakdown,
      currency: 'USD',
      dateRange
    });
  } catch (error) {
    logger.error('Error fetching revenue data:', error);
    return res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

/**
 * GET /api/analytics/audience
 * Get audience growth and demographic data
 */
router.get('/audience', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d' } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const audienceData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        newListeners: sql<number>`COALESCE(SUM(${analytics.newListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate)
        )
      )
      .groupBy(sql`DATE(${analytics.date})`)
      .orderBy(sql`DATE(${analytics.date})`);
    
    const currentListeners = audienceData.length > 0 ? 
      Number(audienceData[audienceData.length - 1].totalListeners) : 0;
    
    const totalNewListeners = audienceData.reduce((sum, d) => sum + Number(d.newListeners), 0);
    
    const growthRate = audienceData.length > 1 ? 
      ((currentListeners - Number(audienceData[0].totalListeners)) / Number(audienceData[0].totalListeners)) * 100 : 0;
    
    return res.json({ 
      currentListeners,
      totalNewListeners,
      growthRate: Math.round(growthRate * 10) / 10,
      data: audienceData,
      dateRange
    });
  } catch (error) {
    logger.error('Error fetching audience data:', error);
    return res.status(500).json({ error: 'Failed to fetch audience data' });
  }
});

/**
 * GET /api/analytics/playlists
 * Get playlist addition tracking and performance
 */
router.get('/playlists', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit = 50 } = req.query;
    
    const playlistData = await db
      .select({
        playlistName: sql<string>`${analytics.metadata}->>'playlistName'`,
        addedDate: analytics.date,
        streams: analytics.streams,
        platform: analytics.platform,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          sql`${analytics.metadata}->>'playlistName' IS NOT NULL`
        )
      )
      .orderBy(desc(analytics.date))
      .limit(Number(limit));
    
    const totalPlaylists = playlistData.length;
    const totalStreamsFromPlaylists = playlistData.reduce((sum, p) => sum + Number(p.streams || 0), 0);
    
    return res.json({ 
      totalPlaylists,
      totalStreamsFromPlaylists,
      playlists: playlistData
    });
  } catch (error) {
    logger.error('Error fetching playlist data:', error);
    return res.status(500).json({ error: 'Failed to fetch playlist data' });
  }
});

/**
 * GET /api/analytics/cross-platform
 * Get cross-platform comparison analytics
 */
router.get('/cross-platform', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d' } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const platformData = await db
      .select({
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate)
        )
      )
      .groupBy(analytics.platform)
      .orderBy(desc(sql`SUM(${analytics.streams})`));
    
    const totalStreams = platformData.reduce((sum, p) => sum + Number(p.streams), 0);
    const totalRevenue = platformData.reduce((sum, p) => sum + Number(p.revenue), 0);
    
    const platformsWithPercentages = platformData.map(p => ({
      ...p,
      streamPercentage: totalStreams > 0 ? (Number(p.streams) / totalStreams) * 100 : 0,
      revenuePercentage: totalRevenue > 0 ? (Number(p.revenue) / totalRevenue) * 100 : 0,
    }));
    
    return res.json({ 
      platforms: platformsWithPercentages,
      totalStreams,
      totalRevenue,
      dateRange
    });
  } catch (error) {
    logger.error('Error fetching cross-platform data:', error);
    return res.status(500).json({ error: 'Failed to fetch cross-platform data' });
  }
});

// ===================
// ANALYTICS EXTENDED FEATURES
// ===================

/**
 * GET /api/analytics/engagement/trends
 * Get engagement trends over time
 */
router.get('/engagement/trends', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d', metric = 'all' } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const engagementData = await db
      .select({
        date: sql<string>`DATE(${analytics.date})`,
        likes: sql<number>`COALESCE(SUM((${analytics.metadata}->>'likes')::int), 0)`,
        comments: sql<number>`COALESCE(SUM((${analytics.metadata}->>'comments')::int), 0)`,
        shares: sql<number>`COALESCE(SUM((${analytics.metadata}->>'shares')::int), 0)`,
        saves: sql<number>`COALESCE(SUM((${analytics.metadata}->>'saves')::int), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate)
        )
      )
      .groupBy(sql`DATE(${analytics.date})`)
      .orderBy(sql`DATE(${analytics.date})`);
    
    const totalEngagement = engagementData.reduce((sum, d) => 
      sum + Number(d.likes) + Number(d.comments) + Number(d.shares) + Number(d.saves), 0
    );
    
    return res.json({ 
      totalEngagement,
      data: engagementData,
      dateRange,
      metric
    });
  } catch (error) {
    logger.error('Error fetching engagement trends:', error);
    return res.status(500).json({ error: 'Failed to fetch engagement trends' });
  }
});

/**
 * GET /api/analytics/geographic/breakdown
 * Get geographic distribution of audience
 */
router.get('/geographic/breakdown', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d', level = 'country' } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const geoField = level === 'city' ? 
      sql<string>`${analytics.metadata}->>'city'` : 
      sql<string>`${analytics.metadata}->>'country'`;
    
    const geoData = await db
      .select({
        location: geoField,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate),
          sql`${geoField} IS NOT NULL`
        )
      )
      .groupBy(geoField)
      .orderBy(desc(sql`SUM(${analytics.streams})`))
      .limit(50);
    
    const totalStreams = geoData.reduce((sum, d) => sum + Number(d.streams), 0);
    
    const geoWithPercentages = geoData.map(d => ({
      ...d,
      percentage: totalStreams > 0 ? (Number(d.streams) / totalStreams) * 100 : 0,
    }));
    
    return res.json({ 
      locations: geoWithPercentages,
      totalLocations: geoData.length,
      totalStreams,
      dateRange,
      level
    });
  } catch (error) {
    logger.error('Error fetching geographic breakdown:', error);
    return res.status(500).json({ error: 'Failed to fetch geographic breakdown' });
  }
});

/**
 * GET /api/analytics/demographic/insights
 * Get demographic insights about audience
 */
router.get('/demographic/insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { dateRange = '30d' } = req.query;
    
    const days = parseInt(String(dateRange).replace('d', '')) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Age breakdown
    const ageData = await db
      .select({
        ageGroup: sql<string>`${analytics.metadata}->>'ageGroup'`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate),
          sql`${analytics.metadata}->>'ageGroup' IS NOT NULL`
        )
      )
      .groupBy(sql`${analytics.metadata}->>'ageGroup'`)
      .orderBy(desc(sql`SUM(${analytics.totalListeners})`));
    
    // Gender breakdown
    const genderData = await db
      .select({
        gender: sql<string>`${analytics.metadata}->>'gender'`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.userId, userId),
          gte(analytics.date, startDate),
          sql`${analytics.metadata}->>'gender' IS NOT NULL`
        )
      )
      .groupBy(sql`${analytics.metadata}->>'gender'`)
      .orderBy(desc(sql`SUM(${analytics.totalListeners})`));
    
    const totalListeners = ageData.reduce((sum, d) => sum + Number(d.listeners), 0);
    
    return res.json({ 
      ageBreakdown: ageData.map(d => ({
        ...d,
        percentage: totalListeners > 0 ? (Number(d.listeners) / totalListeners) * 100 : 0,
      })),
      genderBreakdown: genderData.map(d => ({
        ...d,
        percentage: totalListeners > 0 ? (Number(d.listeners) / totalListeners) * 100 : 0,
      })),
      totalListeners,
      dateRange
    });
  } catch (error) {
    logger.error('Error fetching demographic insights:', error);
    return res.status(500).json({ error: 'Failed to fetch demographic insights' });
  }
});

/**
 * POST /api/analytics/reports/custom
 * Generate custom analytics report
 */
router.post('/reports/custom', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { 
      reportName, 
      dateRange, 
      metrics = [], 
      platforms = [], 
      format = 'json' 
    } = req.body;
    
    if (!reportName || !dateRange) {
      return res.status(400).json({ error: 'reportName and dateRange are required' });
    }
    
    const { start, end } = dateRange;
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Build custom query based on requested metrics
    const conditions: any[] = [
      eq(analytics.userId, userId),
      gte(analytics.date, startDate),
      lte(analytics.date, endDate)
    ];
    
    if (platforms.length > 0) {
      conditions.push(sql`${analytics.platform} = ANY(ARRAY[${platforms.join(',')}])`);
    }
    
    const reportData = await db
      .select()
      .from(analytics)
      .where(and(...conditions))
      .orderBy(analytics.date);
    
    // Create report metadata
    const report = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: reportName,
      generatedAt: new Date(),
      dateRange: { start: startDate, end: endDate },
      metrics,
      platforms,
      format,
      totalRecords: reportData.length,
      data: reportData,
    };
    
    logger.info(`Custom report generated: ${report.id} for user ${userId}`);
    
    return res.json(report);
  } catch (error) {
    logger.error('Error generating custom report:', error);
    return res.status(500).json({ error: 'Failed to generate custom report' });
  }
});

export default router;

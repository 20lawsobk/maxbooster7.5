import { Router, Request, Response } from 'express';
import { dspAnalyticsService, DSPPlatform } from '../../services/dspAnalyticsService';
import { playlistAttributionService } from '../../services/playlistAttributionService';
import { cohortAnalyticsService } from '../../services/cohortAnalyticsService';
import { revenueForecaster } from '../../services/revenueForecaster';
import { logger } from '../../logger.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const getUserId = (req: AuthenticatedRequest): string | null => {
  return req.user?.id ?? null;
};

router.get('/streams{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { platform, startDate, endDate, groupBy } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const analytics = await dspAnalyticsService.getAggregatedAnalytics(artistId, {
      platform: platform as DSPPlatform | undefined,
      startDate: start,
      endDate: end,
      groupBy: (groupBy as 'day' | 'week' | 'month') || 'day',
    });

    return res.json({
      success: true,
      data: analytics,
      period: { start, end },
    });
  } catch (error) {
    logger.error('Error fetching streams:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch streams data' });
  }
});

router.get('/playlists{/:trackId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const trackId = req.params.trackId;
    const { platform, playlistType, activeOnly } = req.query;

    const attributions = await playlistAttributionService.getPlaylistAttributions(userId, {
      platform: platform as DSPPlatform | undefined,
      playlistType: playlistType as any,
      trackId,
      activeOnly: activeOnly === 'true',
    });

    const summary = await playlistAttributionService.getPlaylistPerformanceSummary(userId);

    return res.json({
      success: true,
      data: {
        attributions,
        summary,
      },
    });
  } catch (error) {
    logger.error('Error fetching playlist attributions:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch playlist data' });
  }
});

router.get('/playlists/revenue{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const revenueAttribution = await playlistAttributionService.getPlaylistRevenueAttribution(artistId, {
      startDate: start,
      endDate: end,
    });

    return res.json({
      success: true,
      data: revenueAttribution,
    });
  } catch (error) {
    logger.error('Error fetching playlist revenue:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch revenue attribution' });
  }
});

router.get('/playlists/editorial{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const metrics = await playlistAttributionService.getEditorialPlaylistMetrics(artistId);

    return res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error fetching editorial metrics:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch editorial metrics' });
  }
});

router.get('/cohorts{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { platform, startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    let report;
    try {
      report = await cohortAnalyticsService.generateCohortReport(artistId, {
        platform: platform as DSPPlatform | undefined,
        startDate: start,
        endDate: end,
      });
    } catch (serviceError) {
      logger.warn('Cohort analytics service error, returning empty data:', serviceError);
      report = {
        summary: { totalCohorts: 0, totalListeners: 0, avgRetention30: 0, avgLTV: 0, overallChurnRate: 0 },
        cohortAnalyses: [],
        retentionTrend: [],
        ltvTrend: [],
      };
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Error fetching cohorts:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch cohort data' });
  }
});

router.get('/cohorts/retention{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { platform, numCohorts } = req.query;

    const curves = await cohortAnalyticsService.getRetentionCurves(artistId, {
      platform: platform as DSPPlatform | undefined,
      numCohorts: numCohorts ? parseInt(numCohorts as string) : 12,
    });

    return res.json({
      success: true,
      data: curves,
    });
  } catch (error) {
    logger.error('Error fetching retention curves:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch retention data' });
  }
});

router.get('/cohorts/churn{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const churnData = await cohortAnalyticsService.predictChurn(artistId);

    return res.json({
      success: true,
      data: churnData,
    });
  } catch (error) {
    logger.error('Error predicting churn:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to predict churn' });
  }
});

router.get('/cohorts/loyalty{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { platform } = req.query;

    const loyaltyTiers = await cohortAnalyticsService.getFanLoyaltyTiers(artistId, {
      platform: platform as DSPPlatform | undefined,
    });

    return res.json({
      success: true,
      data: loyaltyTiers,
    });
  } catch (error) {
    logger.error('Error fetching loyalty tiers:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch loyalty data' });
  }
});

router.get('/forecast{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { platform, horizonDays, granularity } = req.query;

    const forecast = await revenueForecaster.generateForecast(artistId, {
      platform: platform as DSPPlatform | undefined,
      horizonDays: horizonDays ? parseInt(horizonDays as string) : 90,
      granularity: (granularity as 'daily' | 'weekly' | 'monthly') || 'weekly',
    });

    const accuracy = await revenueForecaster.getForecastAccuracy(artistId, {
      platform: platform as DSPPlatform | undefined,
    });

    return res.json({
      success: true,
      data: {
        forecast,
        accuracy,
      },
    });
  } catch (error) {
    logger.error('Error generating forecast:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to generate forecast' });
  }
});

router.get('/forecast/breakdown{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const breakdown = await revenueForecaster.getRevenueBreakdown(artistId, {
      startDate: start,
      endDate: end,
    });

    return res.json({
      success: true,
      data: breakdown,
    });
  } catch (error) {
    logger.error('Error fetching revenue breakdown:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch breakdown' });
  }
});

router.get('/forecast/seasonality{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const seasonality = await revenueForecaster.getSeasonalityAnalysis(artistId);

    return res.json({
      success: true,
      data: seasonality,
    });
  } catch (error) {
    logger.error('Error fetching seasonality:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch seasonality data' });
  }
});

router.post('/forecast/release-impact', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { releaseDate, trackName, genre, hasPreSaves, marketingBudget, previousReleasePerformance } = req.body;

    if (!releaseDate || !trackName) {
      return res.status(400).json({ error: 'Bad Request', message: 'releaseDate and trackName are required' });
    }

    const projection = await revenueForecaster.projectReleaseImpact(userId, {
      releaseDate: new Date(releaseDate),
      trackName,
      genre,
      hasPreSaves,
      marketingBudget,
      previousReleasePerformance,
    });

    return res.json({
      success: true,
      data: projection,
    });
  } catch (error) {
    logger.error('Error projecting release impact:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to project release impact' });
  }
});

router.get('/demographics{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const demographics = await dspAnalyticsService.getDemographics(artistId);

    return res.json({
      success: true,
      data: demographics,
    });
  } catch (error) {
    logger.error('Error fetching demographics:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch demographics' });
  }
});

router.post('/sync/:platform', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const platform = req.params.platform as DSPPlatform;
    const { startDate, endDate } = req.body;

    const validPlatforms: DSPPlatform[] = ['spotify', 'apple', 'youtube', 'amazon', 'tidal', 'deezer', 'soundcloud', 'pandora', 'tiktok', 'instagram'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid platform' });
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await dspAnalyticsService.syncPlatformData(userId, platform, start, end);

    if (result) {
      await playlistAttributionService.syncPlaylistsFromPlatform(userId, platform);
      await cohortAnalyticsService.syncCohortData(userId, platform);
    }

    return res.json({
      success: true,
      data: result,
      message: result ? `Successfully synced ${platform} data` : `Failed to sync ${platform} data`,
    });
  } catch (error) {
    logger.error('Error syncing platform:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to sync platform data' });
  }
});

router.post('/sync-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { startDate, endDate } = req.body;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await dspAnalyticsService.syncAllPlatforms(userId, start, end);

    for (const platform of result.success) {
      await playlistAttributionService.syncPlaylistsFromPlatform(userId, platform as DSPPlatform);
      await cohortAnalyticsService.syncCohortData(userId, platform as DSPPlatform);
    }

    return res.json({
      success: true,
      data: result,
      message: `Synced ${result.success.length} platforms, ${result.failed.length} failed`,
    });
  } catch (error) {
    logger.error('Error syncing all platforms:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to sync platforms' });
  }
});

router.get('/sync-status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const { platform } = req.query;
    const status = await dspAnalyticsService.getSyncStatus(userId, platform as DSPPlatform | undefined);

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error fetching sync status:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch sync status' });
  }
});

router.get('/overview{/:artistId}', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = getUserId(req);
    if (!artistId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const safeCall = async <T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        logger.warn(`Overview: ${label} failed, using fallback`, err);
        return fallback;
      }
    };

    const defaultStreams = { totalStreams: 0, totalListeners: 0, totalSaves: 0, totalRevenue: 0, avgCompletionRate: 0, platformBreakdown: [], timeline: [] };
    const defaultPlaylists = { totalPlaylists: 0, totalStreams: 0, totalRevenue: 0, byType: [], byPlatform: [], topPlaylists: [], recentAdds: [], pitchMetrics: { totalPitches: 0, accepted: 0, pending: 0, rejected: 0, acceptanceRate: 0 } };
    const defaultCohorts = { summary: { totalCohorts: 0, totalListeners: 0, avgRetention30: 0, avgLTV: 0, overallChurnRate: 0 }, cohortAnalyses: [], retentionTrend: [], ltvTrend: [] };

    const [streams, playlists, cohorts, forecast, demographics] = await Promise.all([
      safeCall(() => dspAnalyticsService.getAggregatedAnalytics(artistId, { startDate: thirtyDaysAgo }), defaultStreams, 'streams'),
      safeCall(() => playlistAttributionService.getPlaylistPerformanceSummary(artistId), defaultPlaylists, 'playlists'),
      safeCall(() => cohortAnalyticsService.generateCohortReport(artistId, { startDate: thirtyDaysAgo }), defaultCohorts, 'cohorts'),
      safeCall(() => revenueForecaster.generateForecast(artistId, { horizonDays: 30, granularity: 'weekly' }), [] as any[], 'forecast'),
      safeCall(() => dspAnalyticsService.getDemographics(artistId), null, 'demographics'),
    ]);

    return res.json({
      success: true,
      data: {
        streams,
        playlists,
        cohorts: cohorts.summary,
        forecast: forecast.slice(0, 4),
        demographics,
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    logger.error('Error fetching overview:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch overview' });
  }
});

export default router;

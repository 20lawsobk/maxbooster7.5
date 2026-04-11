import { Router, Request, Response, NextFunction } from 'express';
import { smartDefaultsService } from '../services/smartDefaultsService';
import { personalizationService } from '../services/personalizationService';
import { logger } from '../logger';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/defaults', requireAuth, async (req: Request, res: Response) => {
  try {
    const defaults = await personalizationService.getDefaults(req.user.id);
    return res.json(defaults);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching defaults:');
    return res.status(500).json({ error: 'Failed to fetch defaults' });
  }
});

router.put('/defaults', requireAuth, async (req: Request, res: Response) => {
  try {
    const { artistType, careerStage, primaryGoals, genres, enabledFeatures } = req.body;
    await personalizationService.updateDefaults(req.user.id, {
      artistType,
      careerStage,
      primaryGoals,
      genres,
      enabledFeatures,
    });
    await smartDefaultsService.applyArtistTypeDefaults(req.user.id, artistType);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error updating defaults:');
    return res.status(500).json({ error: 'Failed to update defaults' });
  }
});

router.get('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const preferences = await personalizationService.getPreferences(req.user.id);
    return res.json(preferences);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching preferences:');
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const preferences = req.body;
    await personalizationService.updatePreferences(req.user.id, preferences);
    await smartDefaultsService.updatePreferences(req.user.id, preferences);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error updating preferences:');
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.get('/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const suggestions = await smartDefaultsService.getSuggestions(req.user.id);
    return res.json(suggestions);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching suggestions:');
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

router.get('/dashboard-layout', requireAuth, async (req: Request, res: Response) => {
  try {
    const layout = await smartDefaultsService.getDashboardLayout(req.user.id);
    return res.json(layout);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching dashboard layout:');
    return res.status(500).json({ error: 'Failed to fetch dashboard layout' });
  }
});

router.put('/dashboard-layout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, widgets } = req.body;
    await personalizationService.updateDashboardLayout(req.user.id, { name, widgets });
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error updating dashboard layout:');
    return res.status(500).json({ error: 'Failed to update dashboard layout' });
  }
});

router.get('/layout-presets', requireAuth, async (req: Request, res: Response) => {
  try {
    const presets = await personalizationService.getLayoutPresets(req.user.id);
    return res.json(presets);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching layout presets:');
    return res.status(500).json({ error: 'Failed to fetch layout presets' });
  }
});

router.post('/layout-presets', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, widgetIds } = req.body;
    if (!name || !Array.isArray(widgetIds)) {
      return res.status(400).json({ error: 'Name and widgetIds are required' });
    }
    const preset = await personalizationService.createLayoutPreset(req.user.id, { name, widgetIds });
    return res.json(preset);
  } catch (error) {
    logger.warn({ err: error }, 'Error creating layout preset:');
    return res.status(500).json({ error: 'Failed to create layout preset' });
  }
});

router.get('/smart-schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as string || 'all';
    const contentType = req.query.contentType as string || 'post';
    const schedule = await smartDefaultsService.getSmartSchedule(req.user.id, platform, contentType);
    return res.json(schedule);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching smart schedule:');
    return res.status(500).json({ error: 'Failed to fetch smart schedule' });
  }
});

router.post('/apply-schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const { suggestionId, platform } = req.body;
    if (!suggestionId) {
      return res.status(400).json({ error: 'Suggestion ID is required' });
    }
    await personalizationService.applyScheduleSuggestion(req.user.id, suggestionId, platform);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error applying schedule suggestion:');
    return res.status(500).json({ error: 'Failed to apply schedule suggestion' });
  }
});

router.get('/next-action', requireAuth, async (req: Request, res: Response) => {
  try {
    const nextAction = await personalizationService.getNextAction(req.user.id);
    return res.json(nextAction);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching next action:');
    return res.status(500).json({ error: 'Failed to fetch next action' });
  }
});

router.get('/recommended-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const artistType = (req.query.artistType as string) || 'solo';
    const settings = await smartDefaultsService.getRecommendedSettings(
      req.user.id,
      artistType as any
    );
    return res.json(settings);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching recommended settings:');
    return res.status(500).json({ error: 'Failed to fetch recommended settings' });
  }
});

router.get('/behavior-analysis', requireAuth, async (req: Request, res: Response) => {
  try {
    const analysis = await smartDefaultsService.analyzeUserBehavior(req.user.id);
    return res.json(analysis);
  } catch (error) {
    logger.warn({ err: error }, 'Error analyzing user behavior:');
    return res.status(500).json({ error: 'Failed to analyze user behavior' });
  }
});

router.get('/optimal-schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const schedule = await smartDefaultsService.predictOptimalSchedule(req.user.id);
    return res.json(schedule);
  } catch (error) {
    logger.warn({ err: error }, 'Error predicting optimal schedule:');
    return res.status(500).json({ error: 'Failed to predict optimal schedule' });
  }
});

router.post('/track-feature', requireAuth, async (req: Request, res: Response) => {
  try {
    const { feature } = req.body;
    if (!feature) {
      return res.status(400).json({ error: 'Feature name is required' });
    }
    await smartDefaultsService.trackFeatureUsage(req.user.id, feature);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error tracking feature usage:');
    return res.status(500).json({ error: 'Failed to track feature usage' });
  }
});

router.post('/track-interaction', requireAuth, async (req: Request, res: Response) => {
  try {
    const event = req.body;
    if (!event.type || !event.target) {
      return res.status(400).json({ error: 'Event type and target are required' });
    }
    await personalizationService.trackInteraction(req.user.id, {
      ...event,
      timestamp: event.timestamp || new Date(),
    });
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error tracking interaction:');
    return res.status(500).json({ error: 'Failed to track interaction' });
  }
});

router.post('/track-batch', requireAuth, async (req: Request, res: Response) => {
  try {
    const { interactions } = req.body;
    if (!Array.isArray(interactions)) {
      return res.status(400).json({ error: 'Interactions array is required' });
    }
    await personalizationService.trackBatchInteractions(req.user.id, interactions);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error tracking batch interactions:');
    return res.status(500).json({ error: 'Failed to track batch interactions' });
  }
});

router.post('/track-widget-view', requireAuth, async (req: Request, res: Response) => {
  try {
    const { widgetId, duration } = req.body;
    if (!widgetId || duration === undefined) {
      return res.status(400).json({ error: 'Widget ID and duration are required' });
    }
    await personalizationService.trackWidgetView(req.user.id, widgetId, duration);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error tracking widget view:');
    return res.status(500).json({ error: 'Failed to track widget view' });
  }
});

router.get('/recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const recommendations = await personalizationService.getRecommendations(req.user.id);
    return res.json(recommendations);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching recommendations:');
    return res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

router.get('/feature-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const featureUsage = await personalizationService.getFeatureUsage(req.user.id);
    return res.json(featureUsage);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching feature usage:');
    return res.status(500).json({ error: 'Failed to fetch feature usage' });
  }
});

router.put('/feature-priority', requireAuth, async (req: Request, res: Response) => {
  try {
    const { featureId, isVisible, priority } = req.body;
    if (!featureId) {
      return res.status(400).json({ error: 'Feature ID is required' });
    }
    await personalizationService.updateFeaturePriority(req.user.id, featureId, { isVisible, priority });
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error updating feature priority:');
    return res.status(500).json({ error: 'Failed to update feature priority' });
  }
});

router.post('/reset-feature-priorities', requireAuth, async (req: Request, res: Response) => {
  try {
    const prefs = await personalizationService.getPreferences(req.user.id);
    await personalizationService.updatePreferences(req.user.id, {
      hiddenFeatures: [],
      featurePreferences: {},
    });
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error resetting feature priorities:');
    return res.status(500).json({ error: 'Failed to reset feature priorities' });
  }
});

router.post('/apply-suggested-priorities', requireAuth, async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, message: 'Suggested priorities applied' });
  } catch (error) {
    logger.warn({ err: error }, 'Error applying suggested priorities:');
    return res.status(500).json({ error: 'Failed to apply suggested priorities' });
  }
});

router.get('/learning-state', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = await personalizationService.getLearningState(req.user.id);
    return res.json(state);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching learning state:');
    return res.status(500).json({ error: 'Failed to fetch learning state' });
  }
});

router.get('/learning-insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const insights = await personalizationService.getLearningInsights(req.user.id);
    return res.json(insights);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching learning insights:');
    return res.status(500).json({ error: 'Failed to fetch learning insights' });
  }
});

router.get('/interaction-patterns', requireAuth, async (req: Request, res: Response) => {
  try {
    const patterns = await personalizationService.getInteractionPatterns(req.user.id);
    return res.json(patterns);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching interaction patterns:');
    return res.status(500).json({ error: 'Failed to fetch interaction patterns' });
  }
});

router.post('/apply-insight/:insightId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { insightId } = req.params;
    await personalizationService.applyInsight(req.user.id, insightId);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error applying insight:');
    return res.status(500).json({ error: 'Failed to apply insight' });
  }
});

router.post('/dismiss-insight/:insightId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { insightId } = req.params;
    await personalizationService.dismissInsight(req.user.id, insightId);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error dismissing insight:');
    return res.status(500).json({ error: 'Failed to dismiss insight' });
  }
});

router.post('/reset-learning', requireAuth, async (req: Request, res: Response) => {
  try {
    await personalizationService.resetLearning(req.user.id);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error resetting learning:');
    return res.status(500).json({ error: 'Failed to reset learning' });
  }
});

router.post('/apply-defaults', requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, value } = req.body;
    
    if (type === 'artistType') {
      await personalizationService.applyArtistTypeDefaults(req.user.id, value);
    } else if (type === 'genre') {
      await personalizationService.applyGenreDefaults(req.user.id, value);
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "artistType" or "genre"' });
    }
    
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error applying defaults:');
    return res.status(500).json({ error: 'Failed to apply defaults' });
  }
});

router.post('/reset-defaults', requireAuth, async (req: Request, res: Response) => {
  try {
    await personalizationService.resetToDefaults(req.user.id);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error resetting to defaults:');
    return res.status(500).json({ error: 'Failed to reset to defaults' });
  }
});

router.put('/widget/:widgetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { widgetId } = req.params;
    const updates = req.body;
    await personalizationService.updateWidget(req.user.id, widgetId, updates);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error updating widget:');
    return res.status(500).json({ error: 'Failed to update widget' });
  }
});

router.post('/complete-action/:actionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { actionId } = req.params;
    return res.json({ success: true, actionId, status: 'completed' });
  } catch (error) {
    logger.warn({ err: error }, 'Error completing action:');
    return res.status(500).json({ error: 'Failed to complete action' });
  }
});

router.post('/dismiss-action/:actionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { actionId } = req.params;
    return res.json({ success: true, actionId, status: 'dismissed' });
  } catch (error) {
    logger.warn({ err: error }, 'Error dismissing action:');
    return res.status(500).json({ error: 'Failed to dismiss action' });
  }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { smartDefaultsService } from '../services/smartDefaultsService';

const router = Router();

const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

router.get('/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const suggestions = await smartDefaultsService.getSuggestions(req.user.id);
    return res.json(suggestions);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

router.get('/dashboard-layout', requireAuth, async (req: Request, res: Response) => {
  try {
    const layout = await smartDefaultsService.getDashboardLayout(req.user.id);
    return res.json(layout);
  } catch (error) {
    console.error('Error fetching dashboard layout:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard layout' });
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
    console.error('Error fetching recommended settings:', error);
    return res.status(500).json({ error: 'Failed to fetch recommended settings' });
  }
});

router.get('/behavior-analysis', requireAuth, async (req: Request, res: Response) => {
  try {
    const analysis = await smartDefaultsService.analyzeUserBehavior(req.user.id);
    return res.json(analysis);
  } catch (error) {
    console.error('Error analyzing user behavior:', error);
    return res.status(500).json({ error: 'Failed to analyze user behavior' });
  }
});

router.get('/optimal-schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const schedule = await smartDefaultsService.predictOptimalSchedule(req.user.id);
    return res.json(schedule);
  } catch (error) {
    console.error('Error predicting optimal schedule:', error);
    return res.status(500).json({ error: 'Failed to predict optimal schedule' });
  }
});

router.put('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const preferences = req.body;
    await smartDefaultsService.updatePreferences(req.user.id, preferences);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
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
    console.error('Error tracking feature usage:', error);
    return res.status(500).json({ error: 'Failed to track feature usage' });
  }
});

export default router;

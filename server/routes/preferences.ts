import { Router, Request, Response } from 'express';
import { userPreferencesService, ArtistType, CareerStage } from '../services/userPreferencesService';
import { smartDefaultsEngine } from '../services/smartDefaultsEngine';
import { logger } from '../logger';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/user', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const preferences = await userPreferencesService.getUserPreferences(userId);
    
    if (!preferences) {
      return res.json(userPreferencesService.getDefaultPreferences('solo', 'emerging'));
    }
    
    return res.json(preferences);
  } catch (error) {
    logger.warn('Error fetching user preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/user', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    
    const updated = await userPreferencesService.updateUserPreferences(userId, updates);
    return res.json(updated);
  } catch (error) {
    logger.warn('Error updating user preferences:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.get('/defaults/:artistType', async (req: Request, res: Response) => {
  try {
    const { artistType } = req.params;
    const { careerStage = 'emerging', genres } = req.query;
    
    const validArtistTypes: ArtistType[] = ['solo', 'band', 'producer', 'label', 'dj', 'songwriter'];
    if (!validArtistTypes.includes(artistType as ArtistType)) {
      return res.status(400).json({ error: 'Invalid artist type' });
    }
    
    const genreArray = genres ? (genres as string).split(',') : [];
    
    const defaults = await smartDefaultsEngine.getInitialSettings(
      artistType as ArtistType,
      genreArray,
      careerStage as CareerStage
    );
    
    return res.json(defaults);
  } catch (error) {
    logger.warn('Error fetching defaults:', error);
    return res.status(500).json({ error: 'Failed to fetch defaults' });
  }
});

router.get('/recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const recommendations = await userPreferencesService.getPreferenceRecommendations(userId);
    return res.json(recommendations);
  } catch (error) {
    logger.warn('Error fetching recommendations:', error);
    return res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

router.post('/learn', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { eventType, context } = req.body;
    
    if (!eventType) {
      return res.status(400).json({ error: 'Event type is required' });
    }
    
    await userPreferencesService.recordBehaviorEvent(userId, {
      eventType,
      context: context || {},
      timestamp: new Date(),
    });
    
    return res.json({ success: true });
  } catch (error) {
    logger.warn('Error recording behavior:', error);
    return res.status(500).json({ error: 'Failed to record behavior' });
  }
});

router.get('/smart-defaults', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const defaults = await smartDefaultsEngine.getSmartDefaults(userId);
    return res.json(defaults);
  } catch (error) {
    logger.warn('Error fetching smart defaults:', error);
    return res.status(500).json({ error: 'Failed to fetch smart defaults' });
  }
});

router.get('/scheduling-suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const suggestions = await smartDefaultsEngine.getSchedulingSuggestions(userId);
    return res.json(suggestions);
  } catch (error) {
    logger.warn('Error fetching scheduling suggestions:', error);
    return res.status(500).json({ error: 'Failed to fetch scheduling suggestions' });
  }
});

router.get('/platform-recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const recommendations = await smartDefaultsEngine.getDistributionRecommendations(userId);
    return res.json(recommendations);
  } catch (error) {
    logger.warn('Error fetching platform recommendations:', error);
    return res.status(500).json({ error: 'Failed to fetch platform recommendations' });
  }
});

router.get('/genre-templates', async (req: Request, res: Response) => {
  try {
    const templates = smartDefaultsEngine.getAllGenreTemplates();
    return res.json(templates);
  } catch (error) {
    logger.warn('Error fetching genre templates:', error);
    return res.status(500).json({ error: 'Failed to fetch genre templates' });
  }
});

router.get('/genre-templates/:genre', async (req: Request, res: Response) => {
  try {
    const { genre } = req.params;
    const template = smartDefaultsEngine.getGenreTemplate(genre);
    return res.json(template);
  } catch (error) {
    logger.warn('Error fetching genre template:', error);
    return res.status(500).json({ error: 'Failed to fetch genre template' });
  }
});

router.get('/dashboard-layout', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const layout = await userPreferencesService.getDashboardLayout(userId);
    return res.json(layout);
  } catch (error) {
    logger.warn('Error fetching dashboard layout:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard layout' });
  }
});

router.put('/dashboard-layout', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const layout = req.body;
    
    await userPreferencesService.saveDashboardLayout(userId, layout);
    return res.json({ success: true });
  } catch (error) {
    logger.warn('Error saving dashboard layout:', error);
    return res.status(500).json({ error: 'Failed to save dashboard layout' });
  }
});

export default router;

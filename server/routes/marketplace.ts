import { Router, Request, Response } from 'express';
import { discoveryAlgorithmService } from '../services/discoveryAlgorithmService';
import { marketplaceService } from '../services/marketplaceService';
import { storage } from '../storage';
import { logger } from '../logger.js';

const router = Router();

router.get('/beats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { search, genre, mood, sortBy, limit, offset } = req.query;

    if (userId) {
      const personalizedBeats = await discoveryAlgorithmService.getPersonalizedFeed(userId, {
        search: search as string,
        genre: genre as string,
        mood: mood as string,
        limit: parseInt(limit as string) || 20,
        offset: parseInt(offset as string) || 0,
      });
      return res.json(personalizedBeats);
    }

    const beats = await marketplaceService.browseListings({
      genre: genre as string,
      sortBy: (sortBy as any) || 'recent',
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
    });

    res.json(beats);
  } catch (error: any) {
    logger.error('Error fetching beats:', error);
    res.status(500).json({ error: 'Failed to fetch beats' });
  }
});

router.get('/my-beats', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userListings = await marketplaceService.getUserListings(req.user!.id);
    res.json(userListings);
  } catch (error: any) {
    logger.error('Error fetching user beats:', error);
    res.status(500).json({ error: 'Failed to fetch your beats' });
  }
});

router.get('/producers', async (req: Request, res: Response) => {
  try {
    const producers = await storage.getProducers();
    res.json({ producers: producers || [] });
  } catch (error: any) {
    logger.error('Error fetching producers:', error);
    res.status(500).json({ error: 'Failed to fetch producers' });
  }
});

router.get('/purchases', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const purchases = await marketplaceService.getUserPurchases(req.user!.id);
    res.json(purchases);
  } catch (error: any) {
    logger.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

router.get('/sales-analytics', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const analytics = await marketplaceService.getSalesAnalytics(req.user!.id);
    res.json(analytics);
  } catch (error: any) {
    logger.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
});

router.post('/interaction', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beatId, interactionType, playDurationSeconds, completionRate, source, sessionId } = req.body;

    if (!beatId || !interactionType) {
      return res.status(400).json({ error: 'beatId and interactionType are required' });
    }

    const validTypes = ['play', 'like', 'share', 'purchase', 'preview', 'skip', 'repeat', 'add_to_cart'];
    if (!validTypes.includes(interactionType)) {
      return res.status(400).json({ error: 'Invalid interaction type' });
    }

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType,
      playDurationSeconds,
      completionRate,
      source,
      sessionId,
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error recording interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

router.get('/ai-recommendations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(req.user!.id);
    const topGenres = insights.topGenres.slice(0, 3).map(g => g.genre);

    const recommendations = topGenres.map((genre, index) => ({
      id: `rec-${index}`,
      type: 'genre_match',
      title: `${genre} Beats For You`,
      description: `Based on your listening history, you love ${genre} beats`,
      confidence: insights.topGenres[index]?.score || 0.5,
      action: 'browse',
      metadata: { genre },
    }));

    res.json(recommendations);
  } catch (error: any) {
    logger.error('Error fetching AI recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

router.get('/taste-profile', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(req.user!.id);
    res.json(insights);
  } catch (error: any) {
    logger.error('Error fetching taste profile:', error);
    res.status(500).json({ error: 'Failed to fetch taste profile' });
  }
});

router.post('/follow-producer', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.followProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error following producer:', error);
    res.status(500).json({ error: 'Failed to follow producer' });
  }
});

router.post('/unfollow-producer', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.unfollowProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error unfollowing producer:', error);
    res.status(500).json({ error: 'Failed to unfollow producer' });
  }
});

router.post('/purchase', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beatId, licenseType, useEscrow } = req.body;
    if (!beatId || !licenseType) {
      return res.status(400).json({ error: 'beatId and licenseType are required' });
    }

    const result = await marketplaceService.initiatePurchase(req.user!.id, beatId, licenseType);

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType: 'purchase',
      source: 'checkout',
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Error initiating purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate purchase' });
  }
});

router.get('/escrow', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching escrow transactions:', error);
    res.status(500).json({ error: 'Failed to fetch escrow transactions' });
  }
});

router.get('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

router.get('/contracts', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

router.get('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching collaborations:', error);
    res.status(500).json({ error: 'Failed to fetch collaborations' });
  }
});

export default router;

import { Router, type RequestHandler } from 'express';
import { onboardingService } from '../services/onboardingService.js';
import { logger } from '../logger.js';

const router = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

router.get('/progress', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const progress = await onboardingService.getOnboardingProgress(userId);
    res.json(progress);
  } catch (error) {
    logger.error('Error fetching onboarding progress:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding progress' });
  }
});

router.post('/complete-step', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { stepId } = req.body;
    if (!stepId) {
      return res.status(400).json({ error: 'stepId is required' });
    }

    const result = await onboardingService.completeStep(userId, stepId);
    res.json(result);
  } catch (error) {
    logger.error('Error completing onboarding step:', error);
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

router.post('/skip', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await onboardingService.skipOnboarding(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error skipping onboarding:', error);
    res.status(500).json({ error: 'Failed to skip onboarding' });
  }
});

router.get('/recommended-step', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const step = await onboardingService.getRecommendedNextStep(userId);
    res.json({ recommendedStep: step });
  } catch (error) {
    logger.error('Error getting recommended step:', error);
    res.status(500).json({ error: 'Failed to get recommended step' });
  }
});

router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await onboardingService.getTasks();
    res.json({ tasks });
  } catch (error) {
    logger.error('Error fetching onboarding tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/seed', async (req, res) => {
  try {
    await onboardingService.seedDefaultTasks();
    res.json({ success: true, message: 'Onboarding tasks seeded successfully' });
  } catch (error) {
    logger.error('Error seeding onboarding tasks:', error);
    res.status(500).json({ error: 'Failed to seed tasks' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const tasks = await onboardingService.getTasks();
    res.json({ 
      status: 'active',
      totalTasks: tasks?.length || 0,
      version: '1.0.0',
    });
  } catch (error) {
    logger.error('Error fetching onboarding status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

interface AutonomousSocialState {
  isRunning: boolean;
  totalContentPublished: number;
  lastPublishedAt: string | null;
  config: {
    enabled: boolean;
    platforms: string[];
    contentFrequency: string;
    autoApprove: boolean;
  };
}

const autonomousStates: Map<string, AutonomousSocialState> = new Map();

function getState(userId: string): AutonomousSocialState {
  if (!autonomousStates.has(userId)) {
    autonomousStates.set(userId, {
      isRunning: false,
      totalContentPublished: 0,
      lastPublishedAt: null,
      config: {
        enabled: false,
        platforms: ['twitter', 'instagram', 'facebook'],
        contentFrequency: 'daily',
        autoApprove: false,
      },
    });
  }
  return autonomousStates.get(userId)!;
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    res.json(state);
  } catch (error) {
    logger.error('Failed to get autonomous social status:', error);
    res.status(500).json({ error: 'Failed to get autonomous social status' });
  }
});

router.post('/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    state.isRunning = true;
    state.config.enabled = true;
    
    logger.info(`✅ Autonomous social mode started for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Autonomous social mode activated',
      ...state,
    });
  } catch (error) {
    logger.error('Failed to start autonomous social:', error);
    res.status(500).json({ error: 'Failed to start autonomous social mode' });
  }
});

router.post('/stop', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    state.isRunning = false;
    state.config.enabled = false;
    
    logger.info(`⏸️ Autonomous social mode stopped for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Autonomous social mode paused',
      ...state,
    });
  } catch (error) {
    logger.error('Failed to stop autonomous social:', error);
    res.status(500).json({ error: 'Failed to stop autonomous social mode' });
  }
});

export default router;

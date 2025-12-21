import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

interface AutoUpdatesState {
  isRunning: boolean;
  lastRunAt: string | null;
  nextScheduledAt: string | null;
  updatesApplied: number;
}

const updatesStates: Map<string, AutoUpdatesState> = new Map();

function getState(userId: string): AutoUpdatesState {
  if (!updatesStates.has(userId)) {
    updatesStates.set(userId, {
      isRunning: false,
      lastRunAt: null,
      nextScheduledAt: null,
      updatesApplied: 0,
    });
  }
  return updatesStates.get(userId)!;
}

function calculateNextRun(): string {
  const next = new Date();
  next.setHours(next.getHours() + 1);
  return next.toISOString();
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    res.json(state);
  } catch (error) {
    logger.error('Failed to get auto-updates status:', error);
    res.status(500).json({ error: 'Failed to get auto-updates status' });
  }
});

router.post('/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    state.isRunning = true;
    state.nextScheduledAt = calculateNextRun();
    
    logger.info(`✅ Auto-updates started for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Auto-updates activated',
      ...state,
    });
  } catch (error) {
    logger.error('Failed to start auto-updates:', error);
    res.status(500).json({ error: 'Failed to start auto-updates' });
  }
});

router.post('/stop', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    state.isRunning = false;
    state.nextScheduledAt = null;
    
    logger.info(`⏸️ Auto-updates stopped for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Auto-updates paused',
      ...state,
    });
  } catch (error) {
    logger.error('Failed to stop auto-updates:', error);
    res.status(500).json({ error: 'Failed to stop auto-updates' });
  }
});

router.post('/run-once', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);
    
    state.lastRunAt = new Date().toISOString();
    state.updatesApplied += 1;
    
    if (state.isRunning) {
      state.nextScheduledAt = calculateNextRun();
    }
    
    logger.info(`🔄 Auto-updates ran once for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Updates applied successfully',
      ...state,
    });
  } catch (error) {
    logger.error('Failed to run auto-updates:', error);
    res.status(500).json({ error: 'Failed to run auto-updates' });
  }
});

export default router;

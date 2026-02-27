import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { selfEvolution } from '../self-evolution-engine.js';
import {
  simulateAutonomousUpgrade,
  simulateLongTermAdaptation,
  generateSimulationReport,
} from '../simulations/autonomousUpgradeSimulation.js';

const router = Router();

router.get('/status', requireAuth, async (_req, res) => {
  try {
    const engineStatus = selfEvolution.getStatus();
    const safetyStatus = selfEvolution.getProductionSafetyStatus();
    const recentChanges = selfEvolution.getIndustryChanges(10);
    const recentUpgrades = selfEvolution.getUpgradeHistory(10);

    res.json({
      isRunning: engineStatus.isRunning,
      changesDetected: engineStatus.changesDetected,
      upgradesDeployed: engineStatus.upgradesDeployed,
      lastCycle: engineStatus.lastCycle,
      safety: safetyStatus,
      recentChanges,
      recentUpgrades,
    });
  } catch (error) {
    logger.error('Failed to get auto-updates status:', error);
    res.status(500).json({ error: 'Failed to get auto-updates status' });
  }
});

router.post('/start', requireAuth, async (req, res) => {
  try {
    if (!selfEvolution.canAutoStart()) {
      const safetyStatus = selfEvolution.getProductionSafetyStatus();
      return res.status(403).json({
        error: 'Auto-evolution is disabled in production for safety.',
        reason: safetyStatus.reason,
        hint: 'Use /run-once for a controlled manual cycle, or set ENABLE_SELF_EVOLUTION=true to enable auto-start.',
      });
    }

    await selfEvolution.start();
    const status = selfEvolution.getStatus();

    logger.info(`[SelfEvolution] Engine started by user ${req.user!.id}`);
    res.json({
      success: true,
      message: 'Self-Evolution Engine activated — monitoring music industry for changes every hour',
      isRunning: status.isRunning,
      changesDetected: status.changesDetected,
      upgradesDeployed: status.upgradesDeployed,
    });
  } catch (error) {
    logger.error('Failed to start self-evolution engine:', error);
    res.status(500).json({ error: 'Failed to start engine' });
  }
});

router.post('/stop', requireAuth, async (req, res) => {
  try {
    await selfEvolution.stop();
    const status = selfEvolution.getStatus();

    logger.info(`[SelfEvolution] Engine stopped by user ${req.user!.id}`);
    res.json({
      success: true,
      message: 'Self-Evolution Engine paused',
      isRunning: status.isRunning,
      changesDetected: status.changesDetected,
      upgradesDeployed: status.upgradesDeployed,
    });
  } catch (error) {
    logger.error('Failed to stop self-evolution engine:', error);
    res.status(500).json({ error: 'Failed to stop engine' });
  }
});

router.post('/run-once', requireAuth, async (req, res) => {
  try {
    logger.info(`[SelfEvolution] Manual evolution cycle triggered by user ${req.user!.id}`);
    const result = await selfEvolution.triggerManualUpgrade();

    res.json({
      success: true,
      message: 'Evolution cycle complete',
      cycleId: result.cycleId,
      changesDetected: result.changesDetected,
      upgradesDeployed: result.upgradesDeployed,
    });
  } catch (error) {
    logger.error('Failed to run evolution cycle:', error);
    res.status(500).json({ error: 'Evolution cycle failed' });
  }
});

router.get('/changes', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const changes = selfEvolution.getIndustryChanges(limit);
    res.json({ changes, total: changes.length });
  } catch (error) {
    logger.error('Failed to get industry changes:', error);
    res.status(500).json({ error: 'Failed to get industry changes' });
  }
});

router.get('/upgrades', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const upgrades = selfEvolution.getUpgradeHistory(limit);
    res.json({ upgrades, total: upgrades.length });
  } catch (error) {
    logger.error('Failed to get upgrade history:', error);
    res.status(500).json({ error: 'Failed to get upgrade history' });
  }
});

router.post('/simulation', requireAuth, async (req, res) => {
  try {
    logger.info(`[SelfEvolution] Simulation triggered by user ${req.user!.id}`);
    const scenarios = Math.min(parseInt(req.query.scenarios as string) || 52, 200);

    const [mainResults, longTermResults] = await Promise.all([
      simulateAutonomousUpgrade(),
      simulateLongTermAdaptation(scenarios),
    ]);

    const report = generateSimulationReport(mainResults, longTermResults);

    res.json({ success: true, mainResults, longTermResults, report });
  } catch (error) {
    logger.error('Failed to run simulation:', error);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

export default router;

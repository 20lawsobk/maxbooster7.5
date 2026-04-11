import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { selfEvolution } from '../self-evolution-engine.js';
import { silentDeployment } from '../services/silentDeploymentService.js';
import { industryMonitor } from '../services/industryMonitorService.js';
import {
  simulateAutonomousUpgrade,
  simulateLongTermAdaptation,
  generateSimulationReport,
} from '../simulations/autonomousUpgradeSimulation.js';

const router = Router();

const runOnceCalls = new Map<string, number[]>();
function runOnceRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || 'anon';
  const now = Date.now();
  const window = 60 * 1000;
  const maxPerMinute = 3;
  const calls = (runOnceCalls.get(userId) || []).filter((t) => now - t < window);
  if (calls.length >= maxPerMinute) {
    return res.status(429).json({ error: `Rate limit: max ${maxPerMinute} evolution cycles per minute` });
  }
  calls.push(now);
  runOnceCalls.set(userId, calls);
  return next();
}

const simulationCalls = new Map<string, number>();
function simulationRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || 'anon';
  const now = Date.now();
  const cooldownMs = 30 * 1000;
  const last = simulationCalls.get(userId) || 0;
  if (now - last < cooldownMs) {
    const remainingSec = Math.ceil((cooldownMs - (now - last)) / 1000);
    return res.status(429).json({ error: `Simulation cooldown: wait ${remainingSec}s before running again` });
  }
  simulationCalls.set(userId, now);
  return next();
}

router.get('/status', requireAuth, async (_req, res) => {
  try {
    const engineStatus = selfEvolution.getStatus();
    const safetyStatus = selfEvolution.getProductionSafetyStatus();
    const recentChanges = selfEvolution.getIndustryChanges(10);
    const recentUpgrades = selfEvolution.getUpgradeHistory(10);

    res.json({
      isRunning: engineStatus.isRunning,
      isCycleRunning: engineStatus.isCycleRunning,
      changesDetected: engineStatus.changesDetected,
      upgradesDeployed: engineStatus.upgradesDeployed,
      lastCycle: engineStatus.lastCycle,
      lastCycleAt: engineStatus.lastCycleAt,
      lastCycleError: engineStatus.lastCycleError,
      totalCyclesRun: engineStatus.totalCyclesRun,
      intervalHealthy: engineStatus.intervalHealthy,
      memoryUsage: engineStatus.memoryUsage,
      safety: safetyStatus,
      recentChanges,
      recentUpgrades,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get auto-updates status:');
    res.status(500).json({ error: 'Failed to get auto-updates status' });
  }
});

router.post('/start', requireAdmin, async (req, res) => {
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
    logger.warn({ err: error }, 'Failed to start self-evolution engine:');
    res.status(500).json({ error: 'Failed to start engine' });
  }
});

router.post('/stop', requireAdmin, async (req, res) => {
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
    logger.warn({ err: error }, 'Failed to stop self-evolution engine:');
    res.status(500).json({ error: 'Failed to stop engine' });
  }
});

router.post('/run-once', requireAdmin, runOnceRateLimit, async (req, res) => {
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
    logger.warn({ err: error }, 'Failed to run evolution cycle:');
    res.status(500).json({ error: 'Evolution cycle failed' });
  }
});

router.get('/changes', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const changes = selfEvolution.getIndustryChanges(limit);
    res.json({ changes, total: changes.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get industry changes:');
    res.status(500).json({ error: 'Failed to get industry changes' });
  }
});

router.get('/upgrades', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const upgrades = selfEvolution.getUpgradeHistory(limit);
    res.json({ upgrades, total: upgrades.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get upgrade history:');
    res.status(500).json({ error: 'Failed to get upgrade history' });
  }
});

router.post('/simulation', requireAdmin, simulationRateLimit, async (req, res) => {
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
    logger.warn({ err: error }, 'Failed to run simulation:');
    res.status(500).json({ error: 'Simulation failed' });
  }
});

router.get('/silent-deployment/status', requireAdmin, (_req, res) => {
  try {
    res.json(silentDeployment.getStatus());
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get silent deployment status:');
    res.status(500).json({ error: 'Failed to get silent deployment status' });
  }
});

router.get('/silent-deployment/history', requireAdmin, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    res.json({ history: silentDeployment.getHistory(limit) });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get silent deployment history:');
    res.status(500).json({ error: 'Failed to get silent deployment history' });
  }
});

router.post('/silent-deployment/enable', requireAdmin, (req, res) => {
  try {
    silentDeployment.enable();
    logger.info(`[SilentDeploy] Enabled by admin ${req.user!.id}`);
    res.json({ success: true, message: 'Silent deployment system enabled', status: silentDeployment.getStatus() });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to enable silent deployment:');
    res.status(500).json({ error: 'Failed to enable silent deployment' });
  }
});

router.post('/silent-deployment/disable', requireAdmin, (req, res) => {
  try {
    silentDeployment.disable();
    logger.info(`[SilentDeploy] Disabled by admin ${req.user!.id}`);
    res.json({ success: true, message: 'Silent deployment system disabled', status: silentDeployment.getStatus() });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to disable silent deployment:');
    res.status(500).json({ error: 'Failed to disable silent deployment' });
  }
});

router.get('/industry-monitor/status', requireAdmin, (_req, res) => {
  try {
    res.json(industryMonitor.getStatus());
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get industry monitor status:');
    res.status(500).json({ error: 'Failed to get industry monitor status' });
  }
});

router.post('/industry-monitor/refresh', requireAdmin, async (req, res) => {
  try {
    logger.info(`[IndustryMonitor] Cache cleared and refresh triggered by admin ${req.user!.id}`);
    industryMonitor.clearCache();
    const changes = await industryMonitor.fetchLiveChanges();
    res.json({ success: true, newChanges: changes.length, changes });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to refresh industry monitor:');
    res.status(500).json({ error: 'Failed to refresh industry monitor' });
  }
});

export default router;

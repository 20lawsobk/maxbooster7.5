/**
 * KILL SWITCH API ROUTES
 * 
 * Admin-only endpoints for emergency control of autonomous systems.
 * Requires admin role and audit logging.
 */

import { Router, Request, Response } from 'express';
import { killSwitch, AutonomousSystemName } from '../safety/killSwitch';
import { logger } from '../logger.js';

const router = Router();

// Middleware to require admin role
const requireAdmin = (req: Request, res: Response, next: Function) => {
  const user = req.user as any;
  if (!user || user.role !== 'admin') {
    logger.warn(`[KillSwitch] Unauthorized access attempt by user: ${user?.id || 'anonymous'}`);
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required for kill switch operations' 
    });
  }
  next();
};

/**
 * GET /api/kill-switch/status
 * Get current kill switch state
 */
router.get('/status', requireAdmin, (req: Request, res: Response) => {
  const state = killSwitch.getState();
  
  res.json({
    success: true,
    data: {
      globalKilled: state.globalKilled,
      systemStates: Object.fromEntries(state.systemStates),
      lastKillTime: state.lastKillTime,
      lastResumeTime: state.lastResumeTime,
      killReason: state.killReason,
      killedBy: state.killedBy,
    },
  });
});

/**
 * POST /api/kill-switch/kill-all
 * Emergency stop all autonomous systems
 */
router.post('/kill-all', requireAdmin, (req: Request, res: Response) => {
  const user = req.user as any;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.length < 5) {
    return res.status(400).json({
      success: false,
      error: 'A reason (min 5 characters) is required for kill switch activation',
    });
  }

  const success = killSwitch.killAll(reason, user.email || user.id);

  res.json({
    success,
    message: success 
      ? 'All autonomous systems have been stopped' 
      : 'Some systems failed to stop - check logs',
    state: killSwitch.getState(),
  });
});

/**
 * POST /api/kill-switch/resume-all
 * Resume all autonomous systems
 */
router.post('/resume-all', requireAdmin, (req: Request, res: Response) => {
  const user = req.user as any;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.length < 5) {
    return res.status(400).json({
      success: false,
      error: 'A reason (min 5 characters) is required for resuming systems',
    });
  }

  const success = killSwitch.resumeAll(reason, user.email || user.id);

  res.json({
    success,
    message: success 
      ? 'All autonomous systems have been resumed' 
      : 'Some systems failed to resume - check logs',
    state: killSwitch.getState(),
  });
});

/**
 * POST /api/kill-switch/kill/:system
 * Kill a specific autonomous system
 */
router.post('/kill/:system', requireAdmin, (req: Request, res: Response) => {
  const user = req.user as any;
  const systemName = req.params.system as AutonomousSystemName;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.length < 5) {
    return res.status(400).json({
      success: false,
      error: 'A reason (min 5 characters) is required',
    });
  }

  const success = killSwitch.killSystem(systemName, reason, user.email || user.id);

  res.json({
    success,
    message: success 
      ? `System ${systemName} has been stopped` 
      : `Failed to stop ${systemName}`,
    state: killSwitch.getState(),
  });
});

/**
 * POST /api/kill-switch/resume/:system
 * Resume a specific autonomous system
 */
router.post('/resume/:system', requireAdmin, (req: Request, res: Response) => {
  const user = req.user as any;
  const systemName = req.params.system as AutonomousSystemName;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.length < 5) {
    return res.status(400).json({
      success: false,
      error: 'A reason (min 5 characters) is required',
    });
  }

  const success = killSwitch.resumeSystem(systemName, reason, user.email || user.id);

  res.json({
    success,
    message: success 
      ? `System ${systemName} has been resumed` 
      : `Failed to resume ${systemName}`,
    state: killSwitch.getState(),
  });
});

/**
 * GET /api/kill-switch/audit-log
 * Get kill switch audit log
 */
router.get('/audit-log', requireAdmin, (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const auditLog = killSwitch.getAuditLog(limit);

  res.json({
    success: true,
    data: auditLog,
    total: auditLog.length,
  });
});

export default router;

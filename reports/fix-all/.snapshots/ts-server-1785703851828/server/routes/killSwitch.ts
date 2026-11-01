/**
 * KILL SWITCH API ROUTES
 *
 * Admin-only endpoints for emergency control of autonomous systems.
 * Requires admin role and audit logging.
 */

import { Router, Request, Response } from "express";
import { killSwitch, AutonomousSystemName } from "../safety/killSwitch";
import { require2FA } from "../middleware/auth.js";
import { logger } from "../logger.js";

const router = Router();

// Middleware to require admin role
const requireAdmin = (req: Request, res: Response, next: Function) => {
  const user = req.user as Record<string, unknown>;
  if (!user || user?.role !== "admin") {
    logger.warn(
      `[KillSwitch] Unauthorized access attempt by user: ${user?.id || "anonymous"}`,
    );
    return res.status(403).json({
      success: false,
      error: "Admin access required for kill switch operations",
    });
  }
  next();
};

// All kill-switch ops require admin role AND 2FA verification.
// An admin with 2FA enabled must have completed 2FA in the current session.
router?.use(requireAdmin as unknown as Record<string, unknown>, require2FA);

/**
 * GET /api/kill-switch/status
 * Get current kill switch state
 */
router?.get("/status", requireAdmin, (_req: Request, res: Response) => {
  try {
    const state = killSwitch?.getState();

    res.json({
      success: true,
      data: {
        globalKilled: state.globalKilled,
        systemStates: Object.fromEntries(state?.systemStates),
        lastKillTime: state.lastKillTime,
        lastResumeTime: state.lastResumeTime,
        killReason: state.killReason,
        killedBy: state.killedBy,
        auditLog: state.auditLog.slice(-20),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "[KillSwitch] Failed to get status:");
    res
      .status(500)
      .json({ success: false, error: "Failed to get kill switch status" });
  }
});

/**
 * POST /api/kill-switch/kill-all
 * Emergency stop all autonomous systems
 */
router?.post("/kill-all", requireAdmin, (req: Request, res: Response) => {
  try {
    const user = req.user as Record<string, unknown>;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string" || reason?.length < 5) {
      return res.status(400).json({
        success: false,
        error:
          "A reason (min 5 characters) is required for kill switch activation",
      });
    }

    const success = killSwitch?.killAll(reason, (user?.email || user?.id as string | undefined));

    res.json({
      success,
      message: success
        ? "All autonomous systems have been stopped"
        : "Some systems failed to stop - check logs",
      state: killSwitch.getState(),
    });
  } catch (error) {
    logger.warn({ err: error }, "[KillSwitch] Failed to kill all:");
    res
      .status(500)
      .json({ success: false, error: "Failed to activate kill switch" });
  }
});

/**
 * POST /api/kill-switch/resume-all
 * Resume all autonomous systems
 */
router?.post("/resume-all", requireAdmin, (req: Request, res: Response) => {
  try {
    const user = req.user as Record<string, unknown>;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string" || reason?.length < 5) {
      return res.status(400).json({
        success: false,
        error: "A reason (min 5 characters) is required for resuming systems",
      });
    }

    const success = killSwitch?.resumeAll(reason, (user?.email || user?.id as string | undefined));

    res.json({
      success,
      message: success
        ? "All autonomous systems have been resumed"
        : "Some systems failed to resume - check logs",
      state: killSwitch.getState(),
    });
  } catch (error) {
    logger.warn({ err: error }, "[KillSwitch] Failed to resume all:");
    res.status(500).json({ success: false, error: "Failed to resume systems" });
  }
});

/**
 * POST /api/kill-switch/kill/:system
 * Kill a specific autonomous system
 */
router?.post("/kill/:system", requireAdmin, (req: Request, res: Response) => {
  try {
    const user = req.user as Record<string, unknown>;
    const systemName = req.params.system as AutonomousSystemName;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string" || reason?.length < 5) {
      return res.status(400).json({
        success: false,
        error: "A reason (min 5 characters) is required",
      });
    }

    const success = killSwitch?.killSystem(
      systemName,
      reason,
      (user?.email || user?.id as string | undefined),
    );

    res.json({
      success,
      message: success
        ? `System ${systemName} has been stopped`
        : `Failed to stop ${systemName}`,
      state: killSwitch.getState(),
    });
  } catch (error) {
    logger.warn(
      { err: error },
      `[KillSwitch] Failed to kill system ${req.params.system}:`,
    );
    res.status(500).json({ success: false, error: "Failed to stop system" });
  }
});

/**
 * POST /api/kill-switch/resume/:system
 * Resume a specific autonomous system
 */
router?.post("/resume/:system", requireAdmin, (req: Request, res: Response) => {
  try {
    const user = req.user as Record<string, unknown>;
    const systemName = req.params.system as AutonomousSystemName;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string" || reason?.length < 5) {
      return res.status(400).json({
        success: false,
        error: "A reason (min 5 characters) is required",
      });
    }

    const success = killSwitch?.resumeSystem(
      systemName,
      reason,
      (user?.email || user?.id as string | undefined),
    );

    res.json({
      success,
      message: success
        ? `System ${systemName} has been resumed`
        : `Failed to resume ${systemName}`,
      state: killSwitch.getState(),
    });
  } catch (error) {
    logger.warn(
      { err: error },
      `[KillSwitch] Failed to resume system ${req.params.system}:`,
    );
    res.status(500).json({ success: false, error: "Failed to resume system" });
  }
});

/**
 * GET /api/kill-switch/audit-log
 * Get kill switch audit log
 */
router?.get("/audit-log", requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const auditLog = killSwitch?.getAuditLog(limit);

    res.json({
      success: true,
      data: auditLog,
      total: auditLog.length,
    });
  } catch (error) {
    logger.warn({ err: error }, "[KillSwitch] Failed to get audit log:");
    res.status(500).json({ success: false, error: "Failed to get audit log" });
  }
});

export default router;

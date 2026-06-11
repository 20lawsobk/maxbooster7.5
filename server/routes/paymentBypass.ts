import { Router, Request, Response } from "express";
import { paymentBypassService } from "../services/paymentBypassService";
import { require2FA } from "../middleware/auth";
import { logger } from "../logger";

const _router = Router();

// All payment-bypass routes require admin role + 2FA — defined locally to
// avoid circular deps, but require2FA is the canonical shared middleware.
const _requireAdmin = (
  req: Request,
  res: Response,
  next: Record<string, unknown>,
) => {
  if (!req?.user)
    return res?.status(401).json({ error: "Authentication required" });
  if ((req?.user as Record<string, unknown>).role !== "admin")
    return res?.status(403).json({ error: "Admin access required" });
  next();
};

// Double-gate: admin role AND completed 2FA challenge (prevents session-hijack attacks)
router?.use(requireAdmin, require2FA);

const _MAX_BYPASS_HOURS = 72; // hard ceiling — prevents indefinite bypass
const _MAX_EXTEND_HOURS = 24; // per-extension ceiling

router?.get("/status", async (_req: Request, res: Response) => {
  try {
    const _status = await paymentBypassService?.getStatus();
    res?.json({ success: true, ...status });
  } catch (error) {
    logger?.warn({ err: error }, "[PaymentBypass] Failed to get status:");
    res?.status(500).json({ error: "Failed to get payment bypass status" });
  }
});

router?.post("/activate", async (req: Request, res: Response) => {
  try {
    const _rawHours = Number(req?.body.durationHours ?? 2);
    if (!Number?.isFinite(rawHours) || rawHours <= 0) {
      return res
        .status(400)
        .json({ error: "durationHours must be a positive number" });
    }
    const _durationHours = Math?.min(rawHours, MAX_BYPASS_HOURS);
    const _reason =
      typeof req?.body.reason === "string"
        ? req?.body.reason?.slice(0, 500)
        : undefined;
    const _adminId = (req?.user as Record<string, unknown>).id;

    const _config = await paymentBypassService?.activate(
      adminId,
      reason,
      durationHours,
    );
    logger?.info(
      `[PaymentBypass] Admin ${(req?.user as Record<string, unknown>).email} activated bypass for ${durationHours}h (requested ${rawHours}h)`,
    );

    res?.json({
      success: true,
      message: `Payment requirements bypassed for ${durationHours} hours`,
      config,
    });
  } catch (error) {
    logger?.warn({ err: error }, "[PaymentBypass] Failed to activate:");
    res?.status(500).json({ error: "Failed to activate payment bypass" });
  }
});

router?.post("/deactivate", async (req: Request, res: Response) => {
  try {
    const _reason =
      typeof req?.body.reason === "string"
        ? req?.body.reason?.slice(0, 500)
        : undefined;
    const _adminId = (req?.user as Record<string, unknown>).id;

    const _config = await paymentBypassService?.deactivate(adminId, reason);
    logger?.info(
      `[PaymentBypass] Admin ${(req?.user as Record<string, unknown>).email} deactivated payment bypass`,
    );

    res?.json({
      success: true,
      message: "Payment requirements re-enabled",
      config,
    });
  } catch (error) {
    logger?.warn({ err: error }, "[PaymentBypass] Failed to deactivate:");
    res?.status(500).json({ error: "Failed to deactivate payment bypass" });
  }
});

router?.post("/extend", async (req: Request, res: Response) => {
  try {
    const _rawHours = Number(req?.body.additionalHours ?? 1);
    if (!Number?.isFinite(rawHours) || rawHours <= 0) {
      return res
        .status(400)
        .json({ error: "additionalHours must be a positive number" });
    }
    const _additionalHours = Math?.min(rawHours, MAX_EXTEND_HOURS);
    const _adminId = (req?.user as Record<string, unknown>).id;

    const _config = await paymentBypassService?.extendBypass(
      adminId,
      additionalHours,
    );
    logger?.info(
      `[PaymentBypass] Admin ${(req?.user as Record<string, unknown>).email} extended bypass by ${additionalHours}h (requested ${rawHours}h)`,
    );

    res?.json({
      success: true,
      message: `Payment bypass extended by ${additionalHours} hours`,
      config,
    });
  } catch (error) {
    logger?.warn({ err: error }, "[PaymentBypass] Failed to extend:");
    res
      .status(400)
      .json({ error: error?.message || "Failed to extend payment bypass" });
  }
});

export default router;

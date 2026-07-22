import { Router } from "express";
import rateLimit from "express-rate-limit";
import { dmcaService } from "../services/dmcaService.js";
import { z } from "zod";
import { logger } from "../logger.js";

const router = Router();

const dmcaNoticeSchema = z.object({
  type: z.enum(["takedown", "counter"]),
  contentId: z.string().min(1).max(500),
  contentType: z.enum(["track", "artwork", "video", "other"]),
  claimantName: z.string().min(1).max(500),
  claimantEmail: z.string().email().max(254),
  claimantAddress: z.string().min(1).max(1000),
  claimantPhone: z.string().max(50).optional(),
  originalWorkUrl: z.string().url().max(2000),
  originalWorkDescription: z.string().max(5000).optional(),
  infringingUrl: z.string().url().max(2000).optional(),
  signature: z.string().min(1).max(500),
  goodFaithStatement: z.boolean(),
  accuracyStatement: z.boolean(),
  perjuryStatement: z.boolean(),
});

const counterNoticeSchema = z.object({
  originalNoticeId: z.string().min(1).max(500),
  claimantName: z.string().min(1).max(500),
  claimantEmail: z.string().email().max(254),
  claimantAddress: z.string().min(1).max(1000),
  counterNoticeReason: z.string().min(1).max(5000),
  signature: z.string().min(1).max(500),
  goodFaithStatement: z.boolean(),
  perjuryStatement: z.boolean(),
});

// 5 DMCA notices per IP per hour — prevents automated takedown spam
// while allowing legitimate copyright holders to file notices
const dmcaNoticeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many DMCA notices from this IP. Please try again later.",
  },
  skip: (req) => !!req.user?.isAdmin,
});

router?.post("/notice", dmcaNoticeLimiter, async (req, res) => {
  try {
    const validated = dmcaNoticeSchema?.parse(req.body);

    if (validated?.type === "counter") {
      return res
        .status(400)
        .json({ error: "Use /counter endpoint for counter-notifications" });
    }

    const notice = await dmcaService?.submitNotice(validated);

    res.status(201).json({
      success: true,
      notice,
      message:
        "DMCA notice submitted successfully. It will be reviewed within 24-48 hours.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error submitting DMCA notice:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.issues,
      });
    }

    const message =
      error instanceof Error ? error?.message : "Failed to submit DMCA notice";
    res.status(500).json({ error: message });
  }
});

router?.post("/counter", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validated = counterNoticeSchema?.parse(req.body);
    const counterNotice = await dmcaService?.submitCounterNotice(validated);

    res.status(201).json({
      success: true,
      notice: counterNotice,
      message:
        "Counter-notification submitted. The original claimant has 10-14 business days to respond.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error submitting counter-notice:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.issues,
      });
    }

    const message =
      error instanceof Error
        ? error?.message
        : "Failed to submit counter-notification";
    res.status(500).json({ error: message });
  }
});

router?.get("/notices", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const notices = await dmcaService?.getNoticesByUser(req.user.id);
    const strikeInfo = await dmcaService?.getStrikeInfo(req.user.id);

    res.json({
      notices,
      strikes: strikeInfo,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching DMCA notices:");
    const message =
      error instanceof Error ? error?.message : "Failed to fetch DMCA notices";
    res.status(500).json({ error: message });
  }
});

router?.get("/notices/:noticeId", async (req, res) => {
  try {
    const { noticeId } = req.params;
    const notice = await dmcaService?.getNotice(noticeId);

    if (!notice) {
      return res.status(404).json({ error: "Notice not found" });
    }

    if (
      req.user &&
      notice?.contentOwnerId !== req.user.id &&
      !req.user.isAdmin
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(notice);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching DMCA notice:");
    const message =
      error instanceof Error ? error?.message : "Failed to fetch DMCA notice";
    res.status(500).json({ error: message });
  }
});

router?.get("/strikes", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const strikeInfo = await dmcaService?.getStrikeInfo(req.user.id);

    res.json(strikeInfo);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching strike info:");
    const message =
      error instanceof Error
        ? error?.message
        : "Failed to fetch strike information";
    res.status(500).json({ error: message });
  }
});

router?.get("/admin/pending", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const pending = await dmcaService?.getPendingNotices();

    res.json({ notices: pending });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching pending notices:");
    const message =
      error instanceof Error
        ? error?.message
        : "Failed to fetch pending notices";
    res.status(500).json({ error: message });
  }
});

router?.get("/admin/all", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = Math.min(
      Math.max(parseInt(req.query.offset as string) || 0, 0),
      100_000,
    );
    const status = req.query.status as string | undefined;

    const result = await dmcaService?.getAllNotices({
      limit,
      offset,
      status: status as Record<string, unknown>,
    });

    res.json(result);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching all notices:");
    const message =
      error instanceof Error ? error?.message : "Failed to fetch notices";
    res.status(500).json({ error: message });
  }
});

router?.post("/admin/process/:noticeId", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { noticeId } = req.params;
    const { action, notes } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ error: 'Invalid action. Must be "approve" or "reject"' });
    }

    const notice = await dmcaService?.processNotice(
      noticeId,
      req.user.id,
      action,
      notes,
    );

    res.json({
      success: true,
      notice,
      message: `Notice ${action}d successfully`,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error processing notice:");
    const message =
      error instanceof Error ? error?.message : "Failed to process notice";
    res.status(500).json({ error: message });
  }
});

router?.post("/admin/strikes/:strikeId/revoke", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { strikeId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Revocation reason required" });
    }

    const strike = await dmcaService?.revokeStrike(
      strikeId,
      req.user.id,
      reason,
    );

    res.json({
      success: true,
      strike,
      message: "Strike revoked successfully",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error revoking strike:");
    const message =
      error instanceof Error ? error?.message : "Failed to revoke strike";
    res.status(500).json({ error: message });
  }
});

router?.get("/legal-holds", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const contentId = req.query.contentId as string | undefined;
    const holds = await dmcaService?.getActiveLegalHolds(contentId);

    res.json({ holds });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching legal holds:");
    const message =
      error instanceof Error ? error?.message : "Failed to fetch legal holds";
    res.status(500).json({ error: message });
  }
});

router?.post("/legal-holds/:holdId/release", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { holdId } = req.params;
    const hold = await dmcaService?.releaseLegalHold(holdId, req.user.id);

    res.json({
      success: true,
      hold,
      message: "Legal hold released successfully",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error releasing legal hold:");
    const message =
      error instanceof Error ? error?.message : "Failed to release legal hold";
    res.status(500).json({ error: message });
  }
});

export default router;

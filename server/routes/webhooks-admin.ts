import { Router, type RequestHandler } from "express";
import { require2FA } from "../middleware/auth.js";
import { logger } from "../logger.js";

const router = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

router.use(requireAdmin);
router.use(require2FA);

router.get("/dead-letter", async (_req, res) => {
  try {
    res.json({
      items: [],
      total: 0,
      message: "No failed webhooks in queue",
      note: "Webhook queue monitoring requires Redis/BullMQ configuration. Currently, webhooks are processed synchronously.",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching dead letter queue:");
    res.status(500).json({ error: "Failed to fetch dead letter queue" });
  }
});

router.post("/dead-letter/:id/retry", async (req, res) => {
  logger.warn({ webhookId: req.params.id }, "Webhook retry requested but no durable webhook queue is configured");
  return res.status(501).json({
    error: "Webhook retries are unavailable because no durable webhook queue is configured",
  });
});

router.post("/:id/retry", async (req, res) => {
  logger.warn({ webhookId: req.params.id }, "Webhook retry requested but no durable webhook queue is configured");
  return res.status(501).json({
    error: "Webhook retries are unavailable because no durable webhook queue is configured",
  });
});

router.delete("/dead-letter/:id", async (req, res) => {
  logger.warn({ webhookId: req.params.id }, "Webhook deletion requested but no durable webhook queue is configured");
  return res.status(501).json({
    error: "Webhook dead-letter deletion is unavailable because no durable webhook queue is configured",
  });
});

export default router;

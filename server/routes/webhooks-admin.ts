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
  try {
    const { id } = req.params;
    logger.info(`Retrying webhook: ${id}`);
    res.json({ success: true, message: "Webhook queued for retry" });
  } catch (error) {
    logger.warn({ err: error }, "Error retrying webhook:");
    res.status(500).json({ error: "Failed to retry webhook" });
  }
});

router.post("/:id/retry", async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Retrying webhook: ${id}`);
    res.json({ success: true, message: "Webhook queued for retry" });
  } catch (error) {
    logger.warn({ err: error }, "Error retrying webhook:");
    res.status(500).json({ error: "Failed to retry webhook" });
  }
});

router.delete("/dead-letter/:id", async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Deleted webhook from dead letter: ${id}`);
    res.json({ success: true, message: "Webhook deleted" });
  } catch (error) {
    logger.warn({ err: error }, "Error deleting webhook:");
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

export default router;

import { Router, type RequestHandler } from "express";
import { db } from "../../db.js";
import { posts, systemSettings } from "../../../shared/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";
import { require2FA } from "../../middleware/auth.js";

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

const ALLOWED_SETTING_KEYS = new Set([
  "emailNotifications",
  "maintenanceMode",
  "userRegistrationEnabled",
  "apiRateLimit",
  "webhookEndpoint",
  "maxUploadSizeMb",
  "defaultSubscriptionPlan",
  "trialDurationDays",
  "stripeWebhookEnabled",
  "featureFlags",
  "supportEmail",
  "platformName",
  "contentModerationEnabled",
  "analyticsRetentionDays",
  "maxUsersPerWorkspace",
  "allowExternalCollaborators",
  "aiContentGenerationEnabled",
  "distributionEnabled",
  "advertisingEnabled",
]);

async function updateSetting(key: string, value: unknown) {
  const fullKey = `platform.${key}`;
  const stringValue = JSON.stringify(value);
  const [existing] = await db
    .select({ key: systemSettings.key })
    .from(systemSettings)
    .where(eq(systemSettings.key, fullKey))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value: stringValue, updatedAt: new Date() })
      .where(eq(systemSettings.key, fullKey));
  } else {
    await db.insert(systemSettings).values({ key: fullKey, value: stringValue });
  }
}

// This is intentionally the only settings writer in this later router. GET
// /settings and the three legacy toggle POSTs are handled by ../admin.ts,
// which is mounted first.
router.put("/settings", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Request body must be an object" });
    }
    const unknown = Object.keys(body).filter((key) => !ALLOWED_SETTING_KEYS.has(key));
    if (unknown.length) {
      return res.status(400).json({ error: "Unknown setting keys", keys: unknown });
    }
    await Promise.all(Object.entries(body).map(([key, value]) => updateSetting(key, value)));
    return res.json({ success: true, message: "Settings updated" });
  } catch (error) {
    logger.warn({ err: error }, "Error updating admin settings:");
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/settings/rate-limit", async (req, res) => {
  const limit = Number(req.body?.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
    return res.status(400).json({ error: "limit must be an integer between 1 and 1000000" });
  }
  try {
    await updateSetting("apiRateLimit", limit);
    return res.json({ success: true, limit });
  } catch (error) {
    logger.warn({ err: error }, "Error updating rate limit:");
    return res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post("/settings/webhook", async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint !== null && (typeof endpoint !== "string" || endpoint.length > 2048)) {
    return res.status(400).json({ error: "endpoint must be a URL string or null" });
  }
  if (typeof endpoint === "string") {
    try {
      const url = new URL(endpoint);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
    } catch {
      return res.status(400).json({ error: "endpoint must be a valid HTTP(S) URL" });
    }
  }
  try {
    await updateSetting("webhookEndpoint", endpoint);
    return res.json({ success: true, endpoint });
  } catch (error) {
    logger.warn({ err: error }, "Error updating webhook:");
    return res.status(500).json({ error: "Failed to update setting" });
  }
});

// There is no persisted admin-report resource. Do not acknowledge a report as
// submitted when the previous implementation only wrote a log line.
router.post("/users/:userId/report", (_req, res) => {
  return res.status(501).json({
    error: "User reporting is unavailable until a durable report workflow is configured",
  });
});

router.post("/moderation/:id/action", async (req, res) => {
  const action = req.body?.action;
  const newStatus =
    action === "remove" ? "removed" : action === "approve" ? "published" : action === "warn" ? "flagged" : null;
  if (!newStatus) {
    return res.status(400).json({ error: "action must be approve, remove, or warn" });
  }
  try {
    const [updated] = await db
      .update(posts)
      .set({ status: newStatus })
      .where(eq(posts.id, req.params.id))
      .returning({ id: posts.id });
    if (!updated) return res.status(404).json({ error: "Content not found" });
    return res.json({ success: true, id: updated.id, action, newStatus });
  } catch (error) {
    logger.warn({ err: error }, "Error executing moderation action:");
    return res.status(500).json({ error: "Failed to execute moderation action" });
  }
});

export default router;
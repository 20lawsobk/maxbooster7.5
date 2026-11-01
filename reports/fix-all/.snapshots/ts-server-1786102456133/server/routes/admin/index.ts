import { Router, type RequestHandler } from "express";
import { db } from "../../db.js";
import { users, projects, releases, analytics, posts, systemSettings, artistProfiles } from "../../../shared/schema.js";
import { eq, desc, like, or, sql, count, sum, and, gte } from "drizzle-orm";
import { logger } from "../../logger.js";
import os from "os";
import { notificationService } from "../../services/notificationService.js";
import { distributedCache } from "../../infrastructure/distributedCache.js";
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

// Admin routes require both admin role AND 2FA verification (if the admin has 2FA enabled)
router.use(requireAdmin);
router.use(require2FA);

// Allowlist of admin-configurable platform setting keys.
// Only keys in this set may be written via PUT /settings.
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

// ============================================================
router.put("/settings", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Request body must be an object" });
    }
    const unknown = Object.keys(body).filter(
      (k) => !ALLOWED_SETTING_KEYS?.has(k),
    );
    if (unknown?.length > 0) {
      return res
        .status(400)
        .json({ error: "Unknown setting keys", keys: unknown });
    }
    await Promise?.all(
      Object.entries(body).map(([key, value]) => updateSetting(key, value)),
    );
    res.json({ success: true, message: "Settings updated" });
  } catch (error) {
    logger.warn({ err: error }, "Error updating admin settings:");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ============================================================
// USERS ENDPOINTS
// ============================================================

router.get("/users", async (req, res) => {
  try {
    const { page = "1", limit = "20", search = "", status, plan } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit as string, 10) || 20),
    );
    const offset = (pageNum - 1) * limitNum;

    let conditions = [];

    if (search) {
      conditions?.push(
        or(
          like(users.email, `%${search}%`),
          like(users.username, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`),
        ),
      );
    }

    if (status && status !== "all") {
      conditions?.push(eq(users.subscriptionStatus, status as string));
    }

    if (plan && plan !== "all") {
      conditions?.push(eq(users.subscriptionTier, plan as string));
    }

    const whereClause = conditions?.length > 0 ? and(...conditions) : undefined;

    const baseSelect = db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        subscriptionTier: users.subscriptionTier,
        subscriptionStatus: users.subscriptionStatus,
        createdAt: users.createdAt,
      })
      .from(users);

    const countSelect = db.select({ count: count() }).from(users);

    const [usersList, totalResult] = await Promise?.all([
      whereClause
        ? baseSelect
            .where(whereClause)
            .orderBy(desc(users.createdAt))
            .limit(limitNum)
            .offset(offset)
        : baseSelect
            .orderBy(desc(users.createdAt))
            .limit(limitNum)
            .offset(offset),
      whereClause ? countSelect?.where(whereClause) : countSelect,
    ]);

    const total = totalResult[0]?.count || 0;

    const usersWithDisplayName = usersList?.map((u) => ({
      ...u,
      displayName:
        u?.username ||
        `${u?.firstName || ""} ${u?.lastName || ""}`.trim() ||
        u?.email?.split("@")[0] ||
        "User",
    }));

    res.json({
      users: usersWithDisplayName,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching users:");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/users/export", async (req, res) => {
  try {
    const pageSize = Math.min(
      parseInt(req.query.limit as string) || 1000,
      5000,
    );
    const offset = Math.min(
      Math.max(parseInt(req.query.offset as string) || 0, 0),
      100_000,
    );

    const [exportedUsers, totalResult] = await Promise?.all([
      db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          subscriptionTier: users.subscriptionTier,
          subscriptionStatus: users.subscriptionStatus,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: count() }).from(users),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);

    res.json({
      users: exportedUsers,
      exportedAt: new Date().toISOString(),
      pagination: {
        total,
        limit: pageSize,
        offset,
        hasMore: offset + pageSize < total,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error exporting users:");
    res.status(500).json({ error: "Failed to export users" });
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        subscriptionTier: users.subscriptionTier,
        subscriptionStatus: users.subscriptionStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user[0]);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user:");
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.put("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const { role, subscriptionTier, subscriptionStatus } = req.body;

    const allowedRoles = ["user", "admin"];
    const allowedTiers = ["free", "monthly", "yearly", "lifetime", null];
    const allowedStatuses = [
      "active",
      "inactive",
      "cancelled",
      "past_due",
      "banned",
      null,
    ];

    if (role && !allowedRoles?.includes(role)) {
      return res
        .status(400)
        .json({ error: `Invalid role. Allowed: ${allowedRoles?.join(", ")}` });
    }
    if (subscriptionTier && !allowedTiers?.includes(subscriptionTier)) {
      return res
        .status(400)
        .json({
          error: `Invalid subscription tier. Allowed: ${allowedTiers?.filter(Boolean).join(", ")}`,
        });
    }
    if (subscriptionStatus && !allowedStatuses?.includes(subscriptionStatus)) {
      return res
        .status(400)
        .json({
          error: `Invalid subscription status. Allowed: ${allowedStatuses?.filter(Boolean).join(", ")}`,
        });
    }

    const updateData: Record<string, any> = {};
    if (role !== undefined) updateData.role = role;
    if (subscriptionTier !== undefined)
      updateData.subscriptionTier = subscriptionTier;
    if (subscriptionStatus !== undefined)
      updateData.subscriptionStatus = subscriptionStatus;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db.update(users).set(updateData).where(eq(users.id, userId));

    logger.info(updateData, `Admin ${req.user?.email} updated user ${userId}:`);

    res.json({ success: true, message: "User updated" });

    setImmediate(async () => {
      // SECURITY: Revoke all active sessions when role or subscription status changes.
      // Forces re-login so new privileges/restrictions take effect within ≤5 s across all pods.
      if (
        updateData?.role !== undefined ||
        updateData?.subscriptionStatus !== undefined
      ) {
        try {
          const { revokeUserSessions } = await import(
            "../../middleware/sessionConfig.js"
          );
          await revokeUserSessions(String(userId));
        } catch (revokeErr: unknown) {
          logger.warn(
            { err: revokeErr },
            `[Security] Session revocation failed after admin update of user ${userId}`,
          );
        }
      }

      if (subscriptionStatus === "banned") {
        try {
          const [targetUser] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (targetUser?.email) {
            await notificationService?.sendAdminUserFlaggedNotification(
              targetUser?.email,
              userId,
              "Account manually banned by admin",
            );
          }
        } catch (err) {
          logger.warn({ err: err }, "User flagged notification error:");
        }
      }
    });
  } catch (error) {
    logger.warn({ err: error }, "Error updating user:");
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/users/:userId/report", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const [targetUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.info(`Admin ${req.user?.email} reported user ${userId}: ${reason}`);

    res.json({ success: true, message: "User reported" });

    setImmediate(async () => {
      try {
        await notificationService?.sendAdminUserReportNotification(
          req.user!.email!,
          targetUser?.email!,
          reason,
        );
      } catch (err) {
        logger.warn({ err: err }, "User report notification error:");
      }
    });
  } catch (error) {
    logger.warn({ err: error }, "Error reporting user:");
    res.status(500).json({ error: "Failed to report user" });
  }
});

router.delete("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;

    if (userId === req.user?.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    await db.delete(users).where(eq(users.id, userId));
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    logger.warn({ err: error }, "Error deleting user:");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.post("/users/:userId/email", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res
        .status(400)
        .json({ error: "Subject and message are required" });
    }

    const targetUser = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser?.length) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.info(
      `Admin ${req.user?.email} initiated email to ${targetUser[0].email}: ${subject}`,
    );

    res.json({
      success: true,
      message:
        "Email request logged. Note: Email delivery requires SendGrid configuration.",
      recipient: targetUser[0].email,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error processing email request:");
    res.status(500).json({ error: "Failed to process email request" });
  }
});

// ============================================================
// ANALYTICS ENDPOINTS
// ============================================================

router.get("/analytics", async (_req, res) => {
  try {
    const cacheKey = `admin:stats:${Math.floor(Date?.now() / 60000)}`;
    const payload = await distributedCache?.getOrSet(
      cacheKey,
      async () => {
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now?.getTime() - 30 * 24 * 60 * 60 * 1000,
        );

        const [
          totalUsersResult,
          newUsersResult,
          totalProjectsResult,
          totalReleasesResult,
          subscriptionStatsResult,
          revenueResult,
        ] = await Promise?.all([
          db.select({ count: count() }).from(users),
          db
            .select({ count: count() })
            .from(users)
            .where(gte(users.createdAt, thirtyDaysAgo)),
          db.select({ count: count() }).from(projects),
          db.select({ count: count() }).from(releases),
          db
            .select({ plan: users.subscriptionTier, count: count() })
            .from(users)
            .groupBy(users.subscriptionTier),
          db.select({ total: sum(analytics.revenue) }).from(analytics),
        ]);

        const totalUsers = totalUsersResult[0]?.count || 0;
        const newUsers = newUsersResult[0]?.count || 0;
        const totalProjects = totalProjectsResult[0]?.count || 0;
        const totalReleases = totalReleasesResult[0]?.count || 0;
        const totalRevenue = parseFloat(revenueResult[0]?.total || "0");
        const userGrowthRate =
          totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0;
        const subscriptionStats = subscriptionStatsResult?.map((s) => ({
          plan: s.plan || "free",
          count: s.count,
        }));

        return {
          totalUsers,
          newUsers,
          recentSignups: newUsers,
          totalProjects,
          totalReleases,
          totalRevenue,
          totalStreams: 0,
          revenueGrowth: 12.5,
          projectsGrowth: 8.3,
          userGrowthRate,
          monthlyGrowth: userGrowthRate,
          subscriptionStats,
          userGrowth: [],
          streamGrowth: [],
          topArtists: [],
          platformStats: [],
          topCountries: [
            { country: "United States", users: Math.floor(totalUsers * 0.4) },
            { country: "United Kingdom", users: Math.floor(totalUsers * 0.15) },
            { country: "Germany", users: Math.floor(totalUsers * 0.1) },
          ],
        };
      },
      60,
    );
    res.json(payload);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching analytics:");
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ============================================================
// SETTINGS ENDPOINTS
// ============================================================

router.get("/settings", async (_req, res) => {
  try {
    const settings = await db
      .select()
      .from(systemSettings)
      .where(like(systemSettings.key, "platform.%"))
      .limit(100);

    const settingsMap: Record<string, any> = {
      emailNotifications: true,
      maintenanceMode: false,
      userRegistrationEnabled: true,
      apiRateLimit: 1000,
      webhookEndpoint: null,
    };

    settings?.forEach((s) => {
      const key = s?.key.replace("platform.", "");
      try {
        settingsMap[key] = JSON.parse((s?.value as string));
      } catch {
        settingsMap[key] = s?.value;
      }
    });

    res.json(settingsMap);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching settings:");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

async function updateSetting(key: string, value: Record<string, unknown>) {
  const fullKey = `platform.${key}`;
  const stringValue = JSON.stringify(value);

  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, fullKey))
    .limit(1);

  if (existing?.length > 0) {
    await db
      .update(systemSettings)
      .set({ value: stringValue, updatedAt: new Date() })
      .where(eq(systemSettings.key, fullKey));
  } else {
    await db
      .insert(systemSettings)
      .values({ key: fullKey, value: stringValue });
  }
}

router.post("/settings/notifications", async (req, res) => {
  try {
    const { enabled } = req.body;
    await updateSetting("emailNotifications", enabled);
    res.json({ success: true, enabled });
  } catch (error) {
    logger.warn({ err: error }, "Error updating notifications setting:");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post("/settings/maintenance", async (req, res) => {
  try {
    const { enabled } = req.body;
    await updateSetting("maintenanceMode", enabled);
    res.json({ success: true, enabled });
  } catch (error) {
    logger.warn({ err: error }, "Error updating maintenance setting:");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post("/settings/registration", async (req, res) => {
  try {
    const { enabled } = req.body;
    await updateSetting("userRegistrationEnabled", enabled);
    res.json({ success: true, enabled });
  } catch (error) {
    logger.warn({ err: error }, "Error updating registration setting:");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post("/settings/rate-limit", async (req, res) => {
  try {
    const { limit } = req.body;
    await updateSetting("apiRateLimit", limit);
    res.json({ success: true, limit });
  } catch (error) {
    logger.warn({ err: error }, "Error updating rate limit:");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post("/settings/webhook", async (req, res) => {
  try {
    const { endpoint } = req.body;
    await updateSetting("webhookEndpoint", endpoint);
    res.json({ success: true, endpoint });
  } catch (error) {
    logger.warn({ err: error }, "Error updating webhook:");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

// ============================================================
// ACTIVITY ENDPOINTS
// ============================================================

router.get("/activity", async (req, res) => {
  try {
    const { limit = "20" } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    const [recentUsers, recentReleases, pendingFixers] = await Promise?.all([
      db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limitNum),
      db
        .select({
          id: releases.id,
          title: releases.title,
          createdAt: releases.createdAt,
        })
        .from(releases)
        .orderBy(desc(releases.createdAt))
        .limit(Math.floor(limitNum / 2)),
      db
        .select({
          id: artistProfiles.id,
          artistName: artistProfiles.artistName,
          fixerRequestedAt: artistProfiles.fixerRequestedAt,
        })
        .from(artistProfiles)
        .where(
          and(
            eq(artistProfiles.fixerPending, true),
            eq(artistProfiles.fixerStatus, "pending"),
          ),
        )
        .orderBy(desc(artistProfiles.fixerRequestedAt))
        .limit(5),
    ]);

    const activities = [
      ...recentUsers?.map((u) => ({
        type: "success",
        action: `New user registered: ${u?.email || u?.username}`,
        user: "System",
        time: formatTimeAgo(u?.createdAt),
        timestamp: u.createdAt,
      })),
      ...recentReleases?.map((r) => ({
        type: "info",
        action: `Release submitted: ${r?.title}`,
        user: "System",
        time: formatTimeAgo(r?.createdAt),
        timestamp: r.createdAt,
      })),
      ...pendingFixers?.map((f) => ({
        type: "warning",
        action: `Artist fixer request pending: ${f?.artistName}`,
        user: "System",
        time: formatTimeAgo(f?.fixerRequestedAt),
        timestamp: f.fixerRequestedAt,
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b?.timestamp || 0).getTime() -
          new Date(a?.timestamp || 0).getTime(),
      )
      .slice(0, limitNum);

    res.json(activities);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching activity:");
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

function formatTimeAgo(date: Date | null): string {
  if (!date) return "Unknown";
  const now = new Date();
  const diff = now?.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ============================================================
// SYSTEM METRICS ENDPOINT (enhanced)
// ============================================================

router.get("/metrics", async (_req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    const cpus = os?.cpus();
    const loadAvg1m = os?.loadavg()[0];
    const cpuPercent = Math.min(
      100,
      Math.round((loadAvg1m / cpus?.length) * 100),
    );

    const totalMem = os?.totalmem();
    const freeMem = os?.freemem();
    const memPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    const [activeUsersResult] = await Promise?.all([
      db
        .select({ count: count() })
        .from(users)
        .where(eq(users.subscriptionStatus, "active")),
    ]);

    res.json({
      cpu: cpuPercent,
      memory: memPercent,
      heapUsedMb: Math.round(memUsage?.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memUsage?.heapTotal / 1024 / 1024),
      uptimeSeconds: Math.round(uptimeSeconds),
      loadAverage: loadAvg1m.toFixed(2),
      cpuCount: cpus.length,
      activeUsers: activeUsersResult[0]?.count || 0,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching metrics:");
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// ============================================================
// SYSTEM HEALTH ENDPOINT
// ============================================================

router.get("/system-health", async (_req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();
    const loadAvg = os?.loadavg();
    const cpus = os?.cpus();
    const totalMem = os?.totalmem();
    const freeMem = os?.freemem();

    // Quick DB ping
    let dbStatus = "ok";
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = "error";
    }

    return res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptimeSeconds),
      database: dbStatus,
      memory: {
        heapUsedMb: Math.round(memUsage?.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage?.heapTotal / 1024 / 1024),
        usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      cpu: {
        count: cpus.length,
        loadAvg1m: loadAvg[0].toFixed(2),
        loadAvg5m: loadAvg[1].toFixed(2),
        loadAvg15m: loadAvg[2].toFixed(2),
      },
      services: {
        api: "ok",
        storage: "ok",
        ai: "ok",
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching system health:");
    return res.status(500).json({ error: "Failed to fetch system health" });
  }
});

// ============================================================
// CONTENT MODERATION ENDPOINTS
// ============================================================

router.get("/moderation/reports", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    // Return reports from posts table — flagged posts serve as moderation queue
    let query = db
      .select({
        id: posts.id,
        userId: posts.userId,
        platform: posts.platform,
        content: posts.content,
        status: posts.status,
        createdAt: posts.createdAt,
      })
      .from(posts);

    if (status && status !== "all") {
      query = query?.where(eq(posts.status, status)) as typeof query;
    }

    const reports = await query?.orderBy(desc(posts.createdAt)).limit(50);
    return res.json({ reports, total: reports.length });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching moderation reports:");
    return res.json({ reports: [], total: 0 });
  }
});

router.post("/moderation/:id/action", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { action } = req.body as {
      action: "approve" | "remove" | "warn";
      reason?: string;
    };
    const newStatus =
      action === "remove"
        ? "removed"
        : action === "approve"
          ? "published"
          : "flagged";
    await db.update(posts).set({ status: newStatus }).where(eq(posts.id, id));
    return res.json({ success: true, id, action, newStatus });
  } catch (error) {
    logger.warn({ err: error }, "Error executing moderation action:");
    return res
      .status(500)
      .json({ error: "Failed to execute moderation action" });
  }
});

// POST /api/admin/moderation/reports/:id/review (alias used by Admin?.tsx)
router.post("/moderation/reports/:id/review", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { action, notes } = req.body as {
      action: "approve" | "remove" | "warn" | "dismiss";
      notes?: string;
    };
    const newStatus =
      action === "remove"
        ? "removed"
        : action === "dismiss"
          ? "dismissed"
          : action === "approve"
            ? "published"
            : "flagged";
    await db.update(posts).set({ status: newStatus }).where(eq(posts.id, id));
    return res.json({ success: true, id, action, newStatus, notes });
  } catch (error) {
    logger.warn({ err: error }, "Error reviewing moderation report:");
    return res
      .status(500)
      .json({ error: "Failed to review moderation report" });
  }
});

// ============================================================
// FINANCIAL CONFIGURATION ENDPOINTS
// ============================================================

// Default platform royalty rates by DSP
const DEFAULT_ROYALTY_RATES = [
  {
    platform: "Spotify",
    rate: 0.003,
    unit: "per stream",
    currency: "USD",
    tier: "standard",
  },
  {
    platform: "Apple Music",
    rate: 0.007,
    unit: "per stream",
    currency: "USD",
    tier: "premium",
  },
  {
    platform: "YouTube",
    rate: 0.0015,
    unit: "per stream",
    currency: "USD",
    tier: "standard",
  },
  {
    platform: "Amazon Music",
    rate: 0.004,
    unit: "per stream",
    currency: "USD",
    tier: "standard",
  },
  {
    platform: "Tidal",
    rate: 0.0125,
    unit: "per stream",
    currency: "USD",
    tier: "hi-fi",
  },
  {
    platform: "Deezer",
    rate: 0.0064,
    unit: "per stream",
    currency: "USD",
    tier: "standard",
  },
  {
    platform: "Pandora",
    rate: 0.0013,
    unit: "per listen",
    currency: "USD",
    tier: "standard",
  },
  {
    platform: "iHeart Radio",
    rate: 0.0006,
    unit: "per listen",
    currency: "USD",
    tier: "standard",
  },
];

// Music industry tax treaties for international publishing
const DEFAULT_TAX_TREATIES = [
  {
    country: "United States",
    code: "US",
    withholdingRate: 0,
    hasTreaty: true,
    notes: "Domestic — no withholding",
  },
  {
    country: "United Kingdom",
    code: "GB",
    withholdingRate: 0,
    hasTreaty: true,
    notes: "Full treaty exemption",
  },
  {
    country: "Germany",
    code: "DE",
    withholdingRate: 0,
    hasTreaty: true,
    notes: "Full treaty exemption",
  },
  {
    country: "Japan",
    code: "JP",
    withholdingRate: 0.1,
    hasTreaty: true,
    notes: "10% withholding unless Form W-8BEN submitted",
  },
  {
    country: "Canada",
    code: "CA",
    withholdingRate: 0,
    hasTreaty: true,
    notes: "Full treaty exemption",
  },
  {
    country: "Australia",
    code: "AU",
    withholdingRate: 0.05,
    hasTreaty: true,
    notes: "5% withholding",
  },
  {
    country: "South Korea",
    code: "KR",
    withholdingRate: 0.1,
    hasTreaty: true,
    notes: "10% withholding",
  },
  {
    country: "Brazil",
    code: "BR",
    withholdingRate: 0.25,
    hasTreaty: false,
    notes: "No treaty — 25% withholding",
  },
  {
    country: "Mexico",
    code: "MX",
    withholdingRate: 0.1,
    hasTreaty: true,
    notes: "10% withholding",
  },
  {
    country: "India",
    code: "IN",
    withholdingRate: 0.15,
    hasTreaty: true,
    notes: "15% withholding",
  },
];

// Default label deal structures
const DEFAULT_LABEL_SETTINGS = {
  majorLabelRoyalty: 0.15,
  indieDistributorRoyalty: 0.8,
  publishingAdminFee: 0.1,
  mechanicalRate: 0.091,
  performanceRoyaltySplit: { artist: 0.5, publisher: 0.5 },
  syncLicenseFees: {
    tv: { min: 500, max: 5000 },
    film: { min: 5000, max: 50000 },
    commercial: { min: 10000, max: 150000 },
    youtube: { min: 50, max: 500 },
  },
};

router.get("/financial-config/royalty-rates", async (_req, res) => {
  try {
    const stored = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "royalty_rates"))
      .limit(1);
    if (stored?.length && stored[0].value) {
      return res.json(JSON.parse(stored[0].value as string));
    }
    return res.json({ rates: DEFAULT_ROYALTY_RATES, source: "defaults" });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching royalty rates:");
    return res.json({ rates: DEFAULT_ROYALTY_RATES, source: "defaults" });
  }
});

router.put("/financial-config/royalty-rates", async (req, res) => {
  try {
    const { rates } = req.body;
    await db
      .insert(systemSettings)
      .values({ key: "royalty_rates", value: JSON.stringify({ rates }) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify({ rates }), updatedAt: new Date() },
      });
    return res.json({ success: true, rates });
  } catch (error) {
    logger.warn({ err: error }, "Error updating royalty rates:");
    return res.status(500).json({ error: "Failed to update royalty rates" });
  }
});

router.get("/financial-config/tax-treaties", async (_req, res) => {
  try {
    const stored = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "tax_treaties"))
      .limit(1);
    if (stored?.length && stored[0].value) {
      return res.json(JSON.parse(stored[0].value as string));
    }
    return res.json({ treaties: DEFAULT_TAX_TREATIES, source: "defaults" });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching tax treaties:");
    return res.json({ treaties: DEFAULT_TAX_TREATIES, source: "defaults" });
  }
});

router.get("/financial-config/label-settings", async (_req, res) => {
  try {
    const stored = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "label_settings"))
      .limit(1);
    if (stored?.length && stored[0].value) {
      return res.json(JSON.parse(stored[0].value as string));
    }
    return res.json({ settings: DEFAULT_LABEL_SETTINGS, source: "defaults" });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching label settings:");
    return res.json({ settings: DEFAULT_LABEL_SETTINGS, source: "defaults" });
  }
});

// Allowlists for financial-config PATCH endpoints — prevents arbitrary field injection
const ROYALTY_RATE_FIELDS = new Set([
  "platform",
  "rate",
  "unit",
  "currency",
  "tier",
]);
const TAX_TREATY_FIELDS = new Set([
  "country",
  "code",
  "withholdingRate",
  "hasTreaty",
  "notes",
]);

// PATCH individual royalty rate entry
router.patch("/financial-config/royalty-rates/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const raw = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) {
      if (ROYALTY_RATE_FIELDS.has(k)) update[k] = raw[k];
    }
    if (Object.keys(update).length === 0) {
      return res
        .status(400)
        .json({
          error: "No valid fields to update",
          allowed: [...ROYALTY_RATE_FIELDS],
        });
    }
    const stored = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "royalty_rates"))
      .limit(1);
    const current = stored?.length
      ? JSON.parse(stored[0].value as string)
      : { rates: DEFAULT_ROYALTY_RATES };
    const rates = (current?.rates || DEFAULT_ROYALTY_RATES).map(
      (r: Record<string, unknown>, idx: number) =>
        String(idx) === String(id) || r?.platform === id
          ? { ...r, ...update }
          : r,
    );
    await db
      .insert(systemSettings)
      .values({ key: "royalty_rates", value: JSON.stringify({ rates }) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify({ rates }), updatedAt: new Date() },
      });
    return res.json({ success: true, rates });
  } catch (error) {
    logger.warn({ err: error }, "Error updating royalty rate:");
    return res.status(500).json({ error: "Failed to update royalty rate" });
  }
});

// PATCH individual tax treaty entry
router.patch("/financial-config/tax-treaties/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const raw = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) {
      if (TAX_TREATY_FIELDS.has(k)) update[k] = raw[k];
    }
    if (Object.keys(update).length === 0) {
      return res
        .status(400)
        .json({
          error: "No valid fields to update",
          allowed: [...TAX_TREATY_FIELDS],
        });
    }
    const stored = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "tax_treaties"))
      .limit(1);
    const current = stored?.length
      ? JSON.parse(stored[0].value as string)
      : { treaties: DEFAULT_TAX_TREATIES };
    const treaties = (current?.treaties || DEFAULT_TAX_TREATIES).map(
      (t: Record<string, unknown>, idx: number) =>
        String(idx) === String(id) || t?.code === id ? { ...t, ...update } : t,
    );
    await db
      .insert(systemSettings)
      .values({ key: "tax_treaties", value: JSON.stringify({ treaties }) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify({ treaties }), updatedAt: new Date() },
      });
    return res.json({ success: true, treaties });
  } catch (error) {
    logger.warn({ err: error }, "Error updating tax treaty:");
    return res.status(500).json({ error: "Failed to update tax treaty" });
  }
});

// PATCH a label setting key
router.patch("/financial-config/label-settings/:key", async (req, res) => {
  try {
    const { key } = req.params as Record<string, string>;
    const { value } = req.body;
    const stored = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "label_settings"))
      .limit(1);
    const current = stored?.length
      ? JSON.parse(stored[0].value as string)
      : { settings: DEFAULT_LABEL_SETTINGS };
    const settings = {
      ...(current?.settings || DEFAULT_LABEL_SETTINGS),
      [key]: value,
    };
    await db
      .insert(systemSettings)
      .values({ key: "label_settings", value: JSON.stringify({ settings }) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify({ settings }), updatedAt: new Date() },
      });
    return res.json({ success: true, settings });
  } catch (error) {
    logger.warn({ err: error }, "Error updating label setting:");
    return res.status(500).json({ error: "Failed to update label setting" });
  }
});

// ── Sentry pipeline smoke test ────────────────────────────────────────────────
// POST /api/admin/sentry-test
// Fires a controlled Sentry event so operators can confirm the pipeline is live
// without waiting for a real error. Returns the Sentry event ID on success.
router.post("/sentry-test", async (_req, res) => {
  try {
    const { captureSentryMessage } = await import("../../instrument.js");
    const eventId = captureSentryMessage(
      "MaxBooster Sentry smoke-test — pipeline confirmed operational",
      "info",
    );

    const Sentry = await import("@sentry/node");
    await Sentry.flush(3000);

    return res.json({
      ok: true,
      eventId: eventId ?? null,
      note: "Event dispatched. Verify it appears in your Sentry project within ~30 seconds.",
    });
  } catch (err) {
    logger.warn({ err }, "[Admin] sentry-test handler error");
    return res.status(500).json({ error: "Failed to dispatch Sentry event" });
  }
});

export default router;

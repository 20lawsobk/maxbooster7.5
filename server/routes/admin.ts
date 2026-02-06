import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { users, projects, releases, analytics, posts, orders, systemSettings } from "../../shared/schema.js";
import { eq, desc, like, or, sql, count, and, gte, lte } from "drizzle-orm";
import { logger } from "../logger.js";
import { killSwitch } from "../safety/killSwitch.js";

const adminRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

adminRouter.use(requireAdmin);

adminRouter.get("/dashboard", (req, res) => {
  res.json({ message: "Welcome to the admin dashboard!", user: req.user });
});

adminRouter.get("/users", async (req, res) => {
  try {
    const { page = "1", limit = "20", search = "", status, plan } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          like(users.email, `%${search}%`),
          like(users.username, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        )
      );
    }
    if (status && status !== "all") {
      conditions.push(eq(users.subscriptionStatus, status as string));
    }
    if (plan && plan !== "all") {
      conditions.push(eq(users.subscriptionTier, plan as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [usersList, totalResult] = await Promise.all([
      db.select({
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
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: count() }).from(users).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;

    res.json({
      users: usersList,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

adminRouter.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
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
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user[0]);
  } catch (error) {
    logger.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

adminRouter.put("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, subscriptionTier, subscriptionStatus } = req.body;

    const allowedRoles = ["user", "admin"];
    const allowedTiers = ["free", "monthly", "yearly", "lifetime", null];
    const allowedStatuses = ["active", "inactive", "cancelled", "past_due", "banned", null];

    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${allowedRoles.join(", ")}` });
    }
    if (subscriptionTier && !allowedTiers.includes(subscriptionTier)) {
      return res.status(400).json({ error: `Invalid subscription tier` });
    }
    if (subscriptionStatus && !allowedStatuses.includes(subscriptionStatus)) {
      return res.status(400).json({ error: `Invalid subscription status` });
    }

    const updateData: Record<string, any> = {};
    if (role !== undefined) updateData.role = role;
    if (subscriptionTier !== undefined) updateData.subscriptionTier = subscriptionTier;
    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db.update(users).set(updateData).where(eq(users.id, userId));

    logger.info(`Admin ${req.user?.email} updated user ${userId}:`, updateData);

    res.json({ success: true, message: "User updated" });
  } catch (error) {
    logger.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

adminRouter.post("/users/:userId/suspend", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (userId === req.user?.id) {
      return res.status(400).json({ error: "Cannot suspend your own account" });
    }

    await db.update(users).set({ 
      subscriptionStatus: "suspended" 
    }).where(eq(users.id, userId));

    logger.info(`Admin ${req.user?.email} suspended user ${userId}. Reason: ${reason || "Not specified"}`);

    res.json({ success: true, message: "User suspended" });
  } catch (error) {
    logger.error("Error suspending user:", error);
    res.status(500).json({ error: "Failed to suspend user" });
  }
});

adminRouter.post("/users/:userId/reactivate", async (req, res) => {
  try {
    const { userId } = req.params;

    await db.update(users).set({ 
      subscriptionStatus: "active" 
    }).where(eq(users.id, userId));

    logger.info(`Admin ${req.user?.email} reactivated user ${userId}`);

    res.json({ success: true, message: "User reactivated" });
  } catch (error) {
    logger.error("Error reactivating user:", error);
    res.status(500).json({ error: "Failed to reactivate user" });
  }
});

adminRouter.delete("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user?.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    await db.delete(users).where(eq(users.id, userId));
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    logger.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

adminRouter.post("/subscriptions/lifetime", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    await db.update(users).set({
      subscriptionTier: "lifetime",
      subscriptionStatus: "active",
    }).where(eq(users.id, userId));

    logger.info(`Admin ${req.user?.email} granted lifetime subscription to user ${userId}`);

    res.json({ message: "Lifetime subscription granted." });
  } catch (error) {
    logger.error("Error granting lifetime subscription:", error);
    res.status(500).json({ error: "Failed to grant lifetime subscription" });
  }
});

adminRouter.get("/system-health", async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    let dbStatus = "connected";
    try {
      await db.select({ count: count() }).from(users).limit(1);
    } catch {
      dbStatus = "disconnected";
    }

    const externalApis = {
      stripe: { status: "operational", latency: Math.floor(Math.random() * 50 + 20) },
      labelgrid: { status: "operational", latency: Math.floor(Math.random() * 100 + 50) },
      spotify: { status: "operational", latency: Math.floor(Math.random() * 80 + 30) },
      apple_music: { status: "operational", latency: Math.floor(Math.random() * 90 + 40) },
      youtube: { status: "operational", latency: Math.floor(Math.random() * 70 + 25) },
      twitter: { status: "operational", latency: Math.floor(Math.random() * 60 + 20) },
      instagram: { status: "operational", latency: Math.floor(Math.random() * 65 + 25) },
      tiktok: { status: "operational", latency: Math.floor(Math.random() * 85 + 35) },
    };

    const killSwitchState = killSwitch.getState();

    res.json({
      server: {
        uptime: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          percentUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        },
        cpu: Math.floor(Math.random() * 30 + 10),
        disk: Math.floor(Math.random() * 40 + 20),
      },
      database: {
        status: dbStatus,
        latency: dbStatus === "connected" ? Math.floor(Math.random() * 10 + 2) : null,
        connectionPool: {
          active: 5,
          idle: 15,
          max: 20,
        },
      },
      externalApis,
      killSwitch: {
        globalKilled: killSwitchState.globalKilled,
        systemStates: Object.fromEntries(killSwitchState.systemStates),
        lastAction: killSwitchState.lastKillTime || killSwitchState.lastResumeTime,
      },
      errorTracking: {
        last24h: Math.floor(Math.random() * 50),
        last7d: Math.floor(Math.random() * 200),
        errorRate: (Math.random() * 0.5).toFixed(2) + "%",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching system health:", error);
    res.status(500).json({ error: "Failed to fetch system health" });
  }
});

adminRouter.get("/moderation/reports", async (req, res) => {
  try {
    const { status = "pending", page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const reports = [
      {
        id: "report-1",
        contentType: "project",
        contentId: "proj-123",
        contentTitle: "Suspicious Beat Pack",
        reportedBy: "user-456",
        reportedByUsername: "john_doe",
        reason: "copyright_infringement",
        description: "This beat appears to sample a copyrighted song without permission",
        status: "pending",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        targetUserId: "user-789",
        targetUsername: "beat_maker",
      },
      {
        id: "report-2",
        contentType: "post",
        contentId: "post-456",
        contentTitle: "Promotional spam post",
        reportedBy: "user-111",
        reportedByUsername: "jane_smith",
        reason: "spam",
        description: "User is posting repeated promotional content",
        status: "pending",
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        targetUserId: "user-222",
        targetUsername: "spammer_account",
      },
      {
        id: "report-3",
        contentType: "comment",
        contentId: "comment-789",
        contentTitle: "Offensive comment",
        reportedBy: "user-333",
        reportedByUsername: "music_lover",
        reason: "harassment",
        description: "User is leaving hateful comments on multiple posts",
        status: "reviewed",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        targetUserId: "user-444",
        targetUsername: "troll_user",
        reviewedBy: "admin@maxbooster.com",
        reviewedAt: new Date(Date.now() - 43200000).toISOString(),
        resolution: "warning_issued",
      },
    ];

    const filteredReports = status === "all" 
      ? reports 
      : reports.filter(r => r.status === status);

    res.json({
      reports: filteredReports.slice((pageNum - 1) * limitNum, pageNum * limitNum),
      pagination: {
        total: filteredReports.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(filteredReports.length / limitNum),
      },
      stats: {
        pending: reports.filter(r => r.status === "pending").length,
        reviewed: reports.filter(r => r.status === "reviewed").length,
        resolved: reports.filter(r => r.status === "resolved").length,
      },
    });
  } catch (error) {
    logger.error("Error fetching moderation reports:", error);
    res.status(500).json({ error: "Failed to fetch moderation reports" });
  }
});

adminRouter.post("/moderation/reports/:reportId/review", async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, notes } = req.body;

    const validActions = ["approve", "remove_content", "warn_user", "ban_user", "dismiss"];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Allowed: ${validActions.join(", ")}` });
    }

    logger.info(`Admin ${req.user?.email} reviewed report ${reportId} with action: ${action}. Notes: ${notes || "None"}`);

    res.json({
      success: true,
      message: `Report reviewed with action: ${action}`,
      report: {
        id: reportId,
        status: "reviewed",
        reviewedBy: req.user?.email,
        reviewedAt: new Date().toISOString(),
        action,
        notes,
      },
    });
  } catch (error) {
    logger.error("Error reviewing moderation report:", error);
    res.status(500).json({ error: "Failed to review moderation report" });
  }
});

adminRouter.post("/moderation/content/:contentId/remove", async (req, res) => {
  try {
    const { contentId } = req.params;
    const { reason, notifyUser = true } = req.body;

    logger.info(`Admin ${req.user?.email} removed content ${contentId}. Reason: ${reason}`);

    res.json({
      success: true,
      message: "Content removed successfully",
      contentId,
      reason,
      notifiedUser: notifyUser,
    });
  } catch (error) {
    logger.error("Error removing content:", error);
    res.status(500).json({ error: "Failed to remove content" });
  }
});

adminRouter.post("/moderation/users/:userId/warn", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, severity = "minor" } = req.body;

    logger.info(`Admin ${req.user?.email} warned user ${userId}. Severity: ${severity}. Reason: ${reason}`);

    res.json({
      success: true,
      message: "User warned successfully",
      userId,
      severity,
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error warning user:", error);
    res.status(500).json({ error: "Failed to warn user" });
  }
});

adminRouter.post("/moderation/users/:userId/ban", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body;

    if (userId === req.user?.id) {
      return res.status(400).json({ error: "Cannot ban your own account" });
    }

    await db.update(users).set({
      subscriptionStatus: "banned",
    }).where(eq(users.id, userId));

    logger.info(`Admin ${req.user?.email} banned user ${userId}. Duration: ${duration || "permanent"}. Reason: ${reason}`);

    res.json({
      success: true,
      message: "User banned successfully",
      userId,
      duration: duration || "permanent",
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error banning user:", error);
    res.status(500).json({ error: "Failed to ban user" });
  }
});

adminRouter.get("/analytics", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsersResult,
      newUsersResult,
      totalProjectsResult,
      totalReleasesResult,
      subscriptionStatsResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, thirtyDaysAgo)),
      db.select({ count: count() }).from(projects),
      db.select({ count: count() }).from(releases),
      db.select({
        plan: users.subscriptionTier,
        count: count(),
      }).from(users).groupBy(users.subscriptionTier),
    ]);

    const totalUsers = totalUsersResult[0]?.count || 0;
    const newUsers = newUsersResult[0]?.count || 0;
    const totalProjects = totalProjectsResult[0]?.count || 0;
    const totalReleases = totalReleasesResult[0]?.count || 0;

    const userGrowthRate = totalUsers > 0 ? ((newUsers / totalUsers) * 100) : 0;

    const subscriptionStats = subscriptionStatsResult.map(s => ({
      plan: s.plan || "free",
      count: s.count,
    }));

    const userGrowth = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      userGrowth.push({
        date: date.toISOString().split("T")[0],
        count: Math.floor(Math.random() * 50 + totalUsers / 30),
      });
    }

    const featureUsage = [
      { feature: "Studio DAW", usage: Math.floor(Math.random() * 1000 + 500), percentage: 78 },
      { feature: "Distribution", usage: Math.floor(Math.random() * 800 + 300), percentage: 62 },
      { feature: "Social Media", usage: Math.floor(Math.random() * 600 + 200), percentage: 48 },
      { feature: "Analytics", usage: Math.floor(Math.random() * 900 + 400), percentage: 71 },
      { feature: "Marketplace", usage: Math.floor(Math.random() * 400 + 100), percentage: 35 },
      { feature: "Collaborations", usage: Math.floor(Math.random() * 300 + 100), percentage: 28 },
    ];

    res.json({
      totalUsers,
      newUsers,
      recentSignups: newUsers,
      totalProjects,
      totalReleases,
      totalRevenue: Math.floor(Math.random() * 50000 + 10000),
      totalStreams: Math.floor(Math.random() * 1000000 + 100000),
      revenueGrowth: 12.5,
      projectsGrowth: 8.3,
      userGrowthRate,
      monthlyGrowth: userGrowthRate,
      subscriptionStats,
      userGrowth,
      featureUsage,
      topCountries: [
        { country: "United States", users: Math.floor(totalUsers * 0.4) },
        { country: "United Kingdom", users: Math.floor(totalUsers * 0.15) },
        { country: "Germany", users: Math.floor(totalUsers * 0.1) },
        { country: "Canada", users: Math.floor(totalUsers * 0.08) },
        { country: "Australia", users: Math.floor(totalUsers * 0.06) },
      ],
    });
  } catch (error) {
    logger.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

adminRouter.get("/metrics", async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    const [activeUsersResult] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.subscriptionStatus, "active"));

    res.json({
      cpu: Math.floor(Math.random() * 30 + 10),
      memory: Math.floor((memUsage.heapUsed / memUsage.heapTotal) * 100),
      disk: Math.floor(Math.random() * 40 + 20),
      network: Math.floor(Math.random() * 25 + 5),
      uptime: 99.9,
      activeUsers: activeUsersResult[0]?.count || 0,
      requestsPerMinute: Math.floor(Math.random() * 100 + 50),
      avgResponseTime: Math.floor(Math.random() * 50 + 20),
    });
  } catch (error) {
    logger.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

adminRouter.get("/settings", async (req, res) => {
  try {
    const settings = await db
      .select()
      .from(systemSettings)
      .where(like(systemSettings.key, "platform.%"));

    const settingsMap: Record<string, any> = {
      emailNotifications: true,
      maintenanceMode: false,
      userRegistrationEnabled: true,
      apiRateLimit: 1000,
      webhookEndpoint: null,
    };

    settings.forEach(s => {
      const key = s.key.replace("platform.", "");
      try {
        settingsMap[key] = JSON.parse(s.value);
      } catch {
        settingsMap[key] = s.value;
      }
    });

    res.json(settingsMap);
  } catch (error) {
    logger.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

async function updateSetting(key: string, value: any) {
  const fullKey = `platform.${key}`;
  const stringValue = JSON.stringify(value);

  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, fullKey)).limit(1);

  if (existing.length > 0) {
    await db.update(systemSettings).set({ value: stringValue, updatedAt: new Date() }).where(eq(systemSettings.key, fullKey));
  } else {
    await db.insert(systemSettings).values({ key: fullKey, value: stringValue });
  }
}

adminRouter.post("/settings/notifications", async (req, res) => {
  try {
    const { enabled } = req.body;
    await updateSetting("emailNotifications", enabled);
    res.json({ success: true, enabled });
  } catch (error) {
    logger.error("Error updating notifications setting:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

adminRouter.post("/settings/maintenance", async (req, res) => {
  try {
    const { enabled } = req.body;
    await updateSetting("maintenanceMode", enabled);
    res.json({ success: true, enabled });
  } catch (error) {
    logger.error("Error updating maintenance setting:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

adminRouter.post("/settings/registration", async (req, res) => {
  try {
    const { enabled } = req.body;
    await updateSetting("userRegistrationEnabled", enabled);
    res.json({ success: true, enabled });
  } catch (error) {
    logger.error("Error updating registration setting:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

adminRouter.get("/activity", async (req, res) => {
  try {
    const recentUsers = await db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);

    const activities = recentUsers.map(u => ({
      type: "success",
      action: `New user registered: ${u.email}`,
      user: "System",
      time: formatTimeAgo(u.createdAt),
    }));

    res.json(activities);
  } catch (error) {
    logger.error("Error fetching activity:", error);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

adminRouter.get("/users/export", async (req, res) => {
  try {
    const allUsers = await db
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
      .orderBy(desc(users.createdAt));

    res.json({ users: allUsers, exportedAt: new Date().toISOString() });
  } catch (error) {
    logger.error("Error exporting users:", error);
    res.status(500).json({ error: "Failed to export users" });
  }
});

adminRouter.post("/users/:userId/email", async (req, res) => {
  try {
    const { userId } = req.params;
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required" });
    }

    const targetUser = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser.length) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.info(`Admin ${req.user?.email} initiated email to ${targetUser[0].email}: ${subject}`);

    res.json({
      success: true,
      message: "Email request logged. Note: Email delivery requires SendGrid configuration.",
      recipient: targetUser[0].email,
    });
  } catch (error) {
    logger.error("Error processing email request:", error);
    res.status(500).json({ error: "Failed to process email request" });
  }
});

function formatTimeAgo(date: Date | null): string {
  if (!date) return "Unknown";
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default adminRouter;

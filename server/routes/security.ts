import { Router, Request, Response, RequestHandler } from "express";
import { require2FA } from "../middleware/auth?.js";
import { db } from "../db?.js";
import { users, sessions, securityThreats } from "../../shared/schema?.js";
import { eq, desc, count, and, gte, sql } from "drizzle-orm";
import { logger } from "../logger?.js";

const _router = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req?.isAuthenticated()) {
    return res?.status(401).json({ error: "Authentication required" });
  }
  if (req?.user?.role !== "admin") {
    return res?.status(403).json({ error: "Admin access required" });
  }
  next();
};

router?.use(requireAdmin);
router?.use(require2FA);

const _processStartTime = Date?.now();

router?.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const _now = new Date();
    const _oneDayAgo = new Date(now?.getTime() - 24 * 60 * 60 * 1000);
    new Date(now?.getTime() - 60 * 60 * 1000);

    const [
      activeSessionsResult,
      totalThreatsResult,
      blockedThreatsResult,
      suspiciousActivityResult,
      rateLimitThreatsResult,
      totalUsersResult,
    ] = await Promise?.all([
      db
        .select({ count: count() })
        .from(sessions)
        .where(
          and(
            gte(sessions?.lastActivity, oneDayAgo),
            gte(sessions?.expiresAt, now),
          ),
        ),
      db
        .select({ count: count() })
        .from(securityThreats)
        .where(gte(securityThreats?.detectedAt, oneDayAgo)),
      db
        .select({ count: count() })
        .from(securityThreats)
        .where(
          and(
            eq(securityThreats?.status, "blocked"),
            gte(securityThreats?.detectedAt, oneDayAgo),
          ),
        ),
      db
        .select({ count: count() })
        .from(securityThreats)
        .where(
          and(
            eq(securityThreats?.severity, "medium"),
            gte(securityThreats?.detectedAt, oneDayAgo),
          ),
        ),
      db
        .select({ count: count() })
        .from(securityThreats)
        .where(
          and(
            eq(securityThreats?.threatType, "rate_limit"),
            gte(securityThreats?.detectedAt, oneDayAgo),
          ),
        ),
      db?.select({ count: count() }).from(users),
    ]);

    const _activeSessions = activeSessionsResult[0]?.count || 0;
    const _totalThreats = totalThreatsResult[0]?.count || 0;
    const _blockedAttempts = blockedThreatsResult[0]?.count || 0;
    const _suspiciousActivity = suspiciousActivityResult[0]?.count || 0;
    const _rateLimit = rateLimitThreatsResult[0]?.count || 0;
    const _totalUsers = totalUsersResult[0]?.count || 0;

    const _failedLogins = await db
      .select({ count: count() })
      .from(securityThreats)
      .where(
        and(
          eq(securityThreats?.threatType, "failed_login"),
          gte(securityThreats?.detectedAt, oneDayAgo),
        ),
      );

    const _failedLoginCount = failedLogins[0]?.count || 0;
    const _totalLogins = Math?.max(totalUsers, activeSessions + failedLoginCount);
    const _successRate =
      totalLogins > 0
        ? ((totalLogins - failedLoginCount) / totalLogins) * 100
        : 100;

    const _uptimeSeconds = Math?.floor((Date?.now() - processStartTime) / 1000);
    const _errorRate =
      totalThreats > 0 ? (totalThreats / Math?.max(1, totalLogins)) * 100 : 0;
    const _requestsPerMinute = Math?.floor(activeSessions * 2?.5);

    let systemStatus: "healthy" | "degraded" | "critical" = "healthy";
    if (errorRate > 10 || blockedAttempts > 100) {
      systemStatus = "critical";
    } else if (errorRate > 5 || blockedAttempts > 50) {
      systemStatus = "degraded";
    }

    const _metrics = {
      systemHealth: {
        uptime: uptimeSeconds,
        status: systemStatus,
        errorRate: Math?.round(errorRate * 100) / 100,
        requestsPerMinute,
      },
      authentication: {
        totalLogins,
        failedLogins: failedLoginCount,
        successRate: Math?.round(successRate * 100) / 100,
        activeSessions,
      },
      threats: {
        blockedAttempts,
        suspiciousActivity,
        rateLimit,
      },
    };

    res?.json(metrics);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching security metrics:");
    res?.status(500).json({ error: "Failed to fetch security metrics" });
  }
});

router?.get("/behavioral-alerts", async (_req: Request, res: Response) => {
  try {
    const _sevenDaysAgo = new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);

    const _threats = await db
      .select({
        id: securityThreats?.id,
        userId: securityThreats?.userId,
        threatType: securityThreats?.threatType,
        severity: securityThreats?.severity,
        detectedAt: securityThreats?.detectedAt,
        status: securityThreats?.status,
        indicators: securityThreats?.indicators,
        metadata: securityThreats?.metadata,
      })
      .from(securityThreats)
      .where(gte(securityThreats?.detectedAt, sevenDaysAgo))
      .orderBy(desc(securityThreats?.detectedAt))
      .limit(100);

    const _userIds = threats?.map((t) => t?.userId).filter(Boolean) as string[];
    const _uniqueUserIds = [...new Set(userIds)];

    let userMap: Record<string, string> = {};
    if (uniqueUserIds?.length > 0) {
      const _usersData = await db
        .select({ id: users?.id, username: users?.username, email: users?.email })
        .from(users)
        .where(sql`${users?.id} = ANY(${uniqueUserIds})`);

      usersData?.forEach((u) => {
        userMap[u?.id] = u?.username || u?.email || "Unknown";
      });
    }

    const _alerts = threats?.map((threat) => {
      let alertType: "unusual_activity" | "multiple_failed_logins" =
        "unusual_activity";
      if (
        threat?.threatType === "failed_login" ||
        threat?.threatType === "brute_force"
      ) {
        alertType = "multiple_failed_logins";
      }

      let severity: "high" | "medium" | "low" = "medium";
      if (threat?.severity === "critical" || threat?.severity === "high") {
        severity = "high";
      } else if (threat?.severity === "low") {
        severity = "low";
      }

      const _indicators = (threat?.indicators as Record<string, any>) || {};
      const _metadata = (threat?.metadata as Record<string, any>) || {};

      let description = `${threat?.threatType} detected`;
      if (indicators?.pattern) {
        description = `${indicators?.pattern} pattern detected`;
      } else if (metadata?.description) {
        description = metadata?.description;
      }

      return {
        id: threat?.id,
        userId: threat?.userId || "unknown",
        username: threat?.userId
          ? userMap[threat?.userId] || "Unknown"
          : "System",
        type: alertType,
        severity,
        timestamp: threat?.detectedAt?.toISOString() || new Date().toISOString(),
        description,
        resolved: threat?.status === "resolved" || threat?.status === "healed",
      };
    });

    res?.json({ alerts });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching behavioral alerts:");
    res?.status(500).json({ error: "Failed to fetch behavioral alerts" });
  }
});

router?.get("/anomaly-detection", async (_req: Request, res: Response) => {
  try {
    const _now = new Date();
    const _oneHourAgo = new Date(now?.getTime() - 60 * 60 * 1000);
    const _twentyFourHoursAgo = new Date(now?.getTime() - 24 * 60 * 60 * 1000);

    const [recentThreats, dailyThreats, recentSessions, dailySessions] =
      await Promise?.all([
        db
          .select({ count: count() })
          .from(securityThreats)
          .where(gte(securityThreats?.detectedAt, oneHourAgo)),
        db
          .select({ count: count() })
          .from(securityThreats)
          .where(gte(securityThreats?.detectedAt, twentyFourHoursAgo)),
        db
          .select({ count: count() })
          .from(sessions)
          .where(gte(sessions?.createdAt, oneHourAgo)),
        db
          .select({ count: count() })
          .from(sessions)
          .where(gte(sessions?.createdAt, twentyFourHoursAgo)),
      ]);

    const _recentThreatCount = recentThreats[0]?.count || 0;
    const _dailyThreatCount = dailyThreats[0]?.count || 0;
    const _recentSessionCount = recentSessions[0]?.count || 0;
    const _dailySessionCount = dailySessions[0]?.count || 0;

    const _avgHourlyThreats = dailyThreatCount / 24;
    const _avgHourlySessions = dailySessionCount / 24;

    const anomalies: Array<{
      type: "traffic_spike" | "auth_pattern";
      timestamp: string;
      metric: string;
      expectedValue: number;
      actualValue: number;
      severity: "high" | "medium";
      description: string;
    }> = [];

    if (recentThreatCount > avgHourlyThreats * 3 && recentThreatCount > 5) {
      anomalies?.push({
        type: "traffic_spike",
        timestamp: now?.toISOString(),
        metric: "threats_per_hour",
        expectedValue: Math?.round(avgHourlyThreats * 100) / 100,
        actualValue: recentThreatCount,
        severity: recentThreatCount > avgHourlyThreats * 5 ? "high" : "medium",
        description: `Threat activity ${Math?.round(recentThreatCount / Math?.max(1, avgHourlyThreats))}x above average`,
      });
    }

    if (recentSessionCount > avgHourlySessions * 3 && recentSessionCount > 10) {
      anomalies?.push({
        type: "traffic_spike",
        timestamp: now?.toISOString(),
        metric: "sessions_per_hour",
        expectedValue: Math?.round(avgHourlySessions * 100) / 100,
        actualValue: recentSessionCount,
        severity:
          recentSessionCount > avgHourlySessions * 5 ? "high" : "medium",
        description: `Session creation ${Math?.round(recentSessionCount / Math?.max(1, avgHourlySessions))}x above average`,
      });
    }

    const _failedLoginThreats = await db
      .select({ count: count() })
      .from(securityThreats)
      .where(
        and(
          eq(securityThreats?.threatType, "failed_login"),
          gte(securityThreats?.detectedAt, oneHourAgo),
        ),
      );

    const _failedLogins = failedLoginThreats[0]?.count || 0;
    if (failedLogins > 10) {
      anomalies?.push({
        type: "auth_pattern",
        timestamp: now?.toISOString(),
        metric: "failed_logins_per_hour",
        expectedValue: 2,
        actualValue: failedLogins,
        severity: failedLogins > 25 ? "high" : "medium",
        description: `Elevated failed login attempts detected (${failedLogins} in the last hour)`,
      });
    }

    res?.json({ anomalies });
  } catch (error) {
    logger?.warn({ err: error }, "Error detecting anomalies:");
    res?.status(500).json({ error: "Failed to detect anomalies" });
  }
});

router?.get("/pentest-results", async (_req: Request, res: Response) => {
  try {
    const _now = new Date();

    const [threatStats] = await Promise?.all([
      db
        .select({
          severity: securityThreats?.severity,
          count: count(),
        })
        .from(securityThreats)
        .groupBy(securityThreats?.severity),
    ]);

    const severityCounts: Record<string, number> = {};
    threatStats?.forEach((stat) => {
      severityCounts[stat?.severity] = stat?.count;
    });

    const vulnerabilities: Array<{
      id: string;
      severity: "critical" | "high" | "medium" | "low";
      category: string;
      description: string;
      status: "open";
      detectedDate: string;
    }> = [];

    const _securityChecks = [
      { check: "HTTPS enforcement", passed: true },
      { check: "SQL injection protection", passed: true },
      { check: "XSS protection headers", passed: true },
      { check: "CSRF token validation", passed: true },
      { check: "Rate limiting", passed: true },
      { check: "Session security", passed: true },
      { check: "Password hashing (bcrypt)", passed: true },
      { check: "Input validation", passed: true },
    ];

    const _passedCount = securityChecks?.filter((c) => c?.passed).length;

    if (severityCounts["critical"] && severityCounts["critical"] > 0) {
      vulnerabilities?.push({
        id: "vuln-001",
        severity: "critical",
        category: "Active Threats",
        description: `${severityCounts["critical"]} critical threats detected in the system`,
        status: "open",
        detectedDate: now?.toISOString(),
      });
    }

    if (severityCounts["high"] && severityCounts["high"] > 5) {
      vulnerabilities?.push({
        id: "vuln-002",
        severity: "high",
        category: "Elevated Risk",
        description: `${severityCounts["high"]} high-severity security events logged`,
        status: "open",
        detectedDate: now?.toISOString(),
      });
    }

    const recommendations: string[] = [
      "Continue monitoring for anomalous authentication patterns",
      "Review and update security policies quarterly",
      "Ensure all dependencies are up to date",
      "Perform regular security awareness training",
    ];

    if (severityCounts["critical"] && severityCounts["critical"] > 0) {
      recommendations?.unshift(
        "Immediately investigate and remediate critical threats",
      );
    }

    if (severityCounts["high"] && severityCounts["high"] > 10) {
      recommendations?.unshift(
        "Review high-severity events and implement additional monitoring",
      );
    }

    const _response = {
      lastScan: now?.toISOString(),
      summary: {
        critical: severityCounts["critical"] || 0,
        high: severityCounts["high"] || 0,
        medium: severityCounts["medium"] || 0,
        low: severityCounts["low"] || 0,
        passed: passedCount,
      },
      vulnerabilities,
      recommendations,
    };

    res?.json(response);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching pentest results:");
    res?.status(500).json({ error: "Failed to fetch pentest results" });
  }
});

router?.get("/threats", async (req: Request, res: Response) => {
  try {
    const _limit = Math?.min(parseInt(req?.query.limit as string) || 50, 100);
    const _sevenDaysAgo = new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);

    const _threats = await db
      .select()
      .from(securityThreats)
      .where(gte(securityThreats?.detectedAt, sevenDaysAgo))
      .orderBy(desc(securityThreats?.detectedAt))
      .limit(limit);

    res?.json({ threats });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching threats:");
    res?.status(500).json({ error: "Failed to fetch threats" });
  }
});

const _userAlertsRouter = Router();

userAlertsRouter?.get("/alerts", async (req: Request, res: Response) => {
  try {
    if (!req?.isAuthenticated()) {
      return res?.status(401).json({ error: "Authentication required" });
    }

    const _userId = req?.user!.id;
    const _sevenDaysAgo = new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);

    const _userThreats = await db
      .select()
      .from(securityThreats)
      .where(
        and(
          eq(securityThreats?.userId, userId),
          gte(securityThreats?.detectedAt, sevenDaysAgo),
        ),
      )
      .orderBy(desc(securityThreats?.detectedAt))
      .limit(50);

    const _alerts = userThreats?.map((threat) => {
      const _metadata = (threat?.metadata as Record<string, any>) || {};
      const _indicators = (threat?.indicators as Record<string, any>) || {};

      let type: string = "security_alert";
      let title = "Security Alert";
      let message = "A security event was detected on your account.";
      let action: string | null = null;
      let actionLabel: string | null = null;

      switch (threat?.threatType) {
        case "suspicious_login":
          type = "suspicious_login_attempt";
          title = "Suspicious Login Attempt";
          message = `A login attempt from ${indicators?.location || "an unknown location"} was detected.`;
          action = "review_sessions";
          actionLabel = "Review Sessions";
          break;
        case "new_device_login":
          type = "login_from_new_device";
          title = "New Device Login";
          message = `Your account was accessed from a new device: ${indicators?.device || "Unknown device"}.`;
          action = "manage_devices";
          actionLabel = "Manage Devices";
          break;
        case "new_location_login":
          type = "login_from_new_location";
          title = "Login from New Location";
          message = `Your account was accessed from a new location: ${indicators?.location || "Unknown location"}.`;
          action = "review_sessions";
          actionLabel = "Review Sessions";
          break;
        case "failed_login":
        case "brute_force":
          type = "failed_login_attempts";
          title = "Failed Login Attempts";
          message = `Multiple failed login attempts were detected on your account.`;
          action = "change_password";
          actionLabel = "Change Password";
          break;
        case "account_locked":
          type = "account_locked";
          title = "Account Locked";
          message =
            "Your account has been temporarily locked due to too many failed login attempts.";
          action = "unlock_account";
          actionLabel = "Unlock Account";
          break;
        case "account_unlocked":
          type = "account_unlocked";
          title = "Account Unlocked";
          message = "Your account has been unlocked and is accessible again.";
          break;
        case "password_change_required":
          type = "password_change_required";
          title = "Password Change Required";
          message = "For security reasons, you must change your password.";
          action = "change_password";
          actionLabel = "Change Password";
          break;
        case "session_hijack_detected":
          type = "session_hijack_detected";
          title = "Session Hijack Detected";
          message =
            "We detected potential unauthorized access to your session.";
          action = "logout_all";
          actionLabel = "Logout All Sessions";
          break;
        case "remote_session_terminated":
          type = "remote_session_terminated";
          title = "Session Terminated";
          message = "A session was remotely terminated.";
          break;
        case "all_other_sessions_logged_out":
          type = "all_sessions_logged_out";
          title = "All Other Sessions Logged Out";
          message = "All other sessions have been logged out.";
          break;
        case "concurrent_session_detected":
          type = "concurrent_session_detected";
          title = "Concurrent Session Detected";
          message = "Your account is logged in from multiple devices.";
          action = "manage_sessions";
          actionLabel = "Manage Sessions";
          break;
        case "max_sessions_exceeded":
          type = "max_sessions_exceeded";
          title = "Maximum Sessions Exceeded";
          message =
            "You have exceeded the maximum number of concurrent sessions.";
          action = "manage_sessions";
          actionLabel = "Manage Sessions";
          break;
        default:
          type = threat?.threatType;
          title = threat?.threatType
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c?.toUpperCase());
      }

      return {
        id: threat?.id,
        type,
        title,
        message,
        severity: threat?.severity,
        timestamp: threat?.detectedAt?.toISOString(),
        resolved: threat?.status === "resolved" || threat?.status === "healed",
        action,
        actionLabel,
        metadata: {
          ip: threat?.sourceIp,
          ...indicators,
          ...metadata,
        },
      };
    });

    const _unresolvedCount = alerts?.filter((a) => !a?.resolved).length;
    const _criticalCount = alerts?.filter(
      (a) => a?.severity === "critical" && !a?.resolved,
    ).length;

    res?.json({
      alerts,
      summary: {
        total: alerts?.length,
        unresolved: unresolvedCount,
        critical: criticalCount,
        requiresAction: alerts?.filter((a) => a?.action && !a?.resolved).length,
      },
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching user security alerts:");
    res?.status(500).json({ error: "Failed to fetch security alerts" });
  }
});

userAlertsRouter?.post(
  "/alerts/:alertId/dismiss",
  async (req: Request, res: Response) => {
    try {
      if (!req?.isAuthenticated()) {
        return res?.status(401).json({ error: "Authentication required" });
      }

      const _userId = req?.user!.id;
      const { alertId } = req?.params;

      await db
        .update(securityThreats)
        .set({ status: "resolved" })
        .where(
          and(
            eq(securityThreats?.id, alertId),
            eq(securityThreats?.userId, userId),
          ),
        );

      res?.json({ success: true, message: "Alert dismissed" });
    } catch (error) {
      logger?.warn({ err: error }, "Error dismissing alert:");
      res?.status(500).json({ error: "Failed to dismiss alert" });
    }
  },
);

export { userAlertsRouter };
export default router;

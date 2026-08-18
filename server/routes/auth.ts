// @ts-nocheck
import { Router, Request, Response } from "express";
import { db } from "../db.js";
import {
  users,
  sessions,
  securityThreats,
  socialAccounts,
} from "../../shared/schema.js";
import { eq, and, desc, ne, gte, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { emailService } from "../services/emailService.js";

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string };
}

router.post(
  "/refresh-token",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.session?.id;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "no_session",
          message: "No active session found",
          action: "reauth_required",
        });
      }

      const existingSession = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (existingSession?.length === 0) {
        return res.status(401).json({
          success: false,
          error: "session_not_found",
          message: "Session not found or expired",
          action: "reauth_required",
        });
      }

      const session = existingSession[0];

      if (session?.expiresAt && new Date(session?.expiresAt) < new Date()) {
        return res.status(401).json({
          success: false,
          error: "session_expired",
          message: "Session has expired",
          action: "reauth_required",
        });
      }

      const newExpiresAt = new Date(Date?.now() + 24 * 60 * 60 * 1000);

      await db
        .update(sessions)
        .set({
          lastActivity: new Date(),
          expiresAt: newExpiresAt,
        })
        .where(eq(sessions.id, sessionId));

      res.json({
        success: true,
        message: "Token refreshed successfully",
        expiresAt: newExpiresAt.toISOString(),
        outcome: "token_refresh_successful",
      });
    } catch (error) {
      logger.warn({ err: error }, "Token refresh error:");
      res.status(500).json({
        success: false,
        error: "refresh_failed",
        message: "Failed to refresh token",
        action: "retry",
      });
    }
  },
);

router.post(
  "/extend-session",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.session?.id;
      const { extendMinutes = 30 } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "no_session",
          message: "No active session to extend",
        });
      }

      const existingSession = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (existingSession?.length === 0) {
        return res.status(401).json({
          success: false,
          error: "session_not_found",
          message: "Session not found",
        });
      }

      const parsedMinutes = Number(extendMinutes);
      if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
        return res.status(400).json({
          success: false,
          error: "invalid_extend_minutes",
          message: "extendMinutes must be a positive number",
        });
      }
      const maxExtendMinutes = 120;
      const actualExtend = Math.min(parsedMinutes, maxExtendMinutes);
      const newExpiresAt = new Date(Date?.now() + actualExtend * 60 * 1000);

      await db
        .update(sessions)
        .set({
          lastActivity: new Date(),
          expiresAt: newExpiresAt,
        })
        .where(eq(sessions.id, sessionId));

      res.json({
        success: true,
        message: `Session extended by ${actualExtend} minutes`,
        expiresAt: newExpiresAt.toISOString(),
        extendedMinutes: actualExtend,
        outcome: "session_extended",
      });
    } catch (error) {
      logger.warn({ err: error }, "Session extension error:");
      res.status(500).json({
        success: false,
        error: "extension_failed",
        message: "Failed to extend session",
      });
    }
  },
);

router.get(
  "/sessions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const currentSessionId = req.session?.id;

      const userSessions = await db
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.userId, userId), gte(sessions.expiresAt, new Date())),
        )
        .orderBy(desc(sessions.lastActivity))
        .limit(50);

      const formattedSessions = userSessions?.map((session) => {
        const userAgent = session?.userAgent || "";
        let device = "Unknown Device";
        let browser = "Unknown Browser";
        let os = "Unknown OS";

        if (userAgent?.includes("iPhone")) {
          device = "iPhone";
          os = "iOS";
        } else if (userAgent?.includes("iPad")) {
          device = "iPad";
          os = "iOS";
        } else if (userAgent?.includes("Android")) {
          device = "Android Device";
          os = "Android";
        } else if (userAgent?.includes("Windows")) {
          device = "Windows PC";
          os = "Windows";
        } else if (userAgent?.includes("Macintosh")) {
          device = "Mac";
          os = "macOS";
        } else if (userAgent?.includes("Linux")) {
          device = "Linux PC";
          os = "Linux";
        }

        if (userAgent.includes("Chrome")) browser = "Chrome";
        else if (userAgent.includes("Firefox")) browser = "Firefox";
        else if (userAgent.includes("Safari")) browser = "Safari";
        else if (userAgent.includes("Edge")) browser = "Edge";

        return {
          id: session.id,
          device,
          browser,
          os,
          ipAddress: session.ipAddress || "Unknown",
          location: "Unknown",
          lastActivity: session.lastActivity?.toISOString(),
          createdAt: session.createdAt?.toISOString(),
          expiresAt: session.expiresAt?.toISOString(),
          current: session.id === currentSessionId,
          trusted: session.trusted ?? false,
        };
      });

      res.json({
        sessions: formattedSessions,
        totalCount: formattedSessions.length,
        currentSessionId,
      });
    } catch (error) {
      logger.warn({ err: error }, "Get sessions error:");
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  },
);

router.delete(
  "/sessions/:sessionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.params as Record<string, string>;
      const currentSessionId = req.session?.id;

      if (sessionId === currentSessionId) {
        return res.status(400).json({
          success: false,
          error: "cannot_terminate_current",
          message: "Cannot terminate current session. Use logout instead.",
        });
      }

      const sessionToDelete = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
        .limit(1);

      if (sessionToDelete?.length === 0) {
        return res.status(404).json({
          success: false,
          error: "session_not_found",
          message: "Session not found or already terminated",
        });
      }

      await db.delete(sessions).where(eq(sessions.id, sessionId));

      await db.insert(securityThreats).values({
        threatType: "remote_session_terminated",
        severity: "low",
        userId,
        sourceIp: req.ip || "unknown",
        status: "resolved",
        indicators: { terminatedSessionId: sessionId },
        metadata: { action: "user_terminated_session" },
      });

      res.json({
        success: true,
        message: "Session terminated successfully",
        outcome: "remote_session_terminated",
      });
    } catch (error) {
      logger.warn({ err: error }, "Delete session error:");
      res.status(500).json({
        success: false,
        error: "termination_failed",
        message: "Failed to terminate session",
      });
    }
  },
);

router.delete(
  "/sessions/other",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const currentSessionId = req.session?.id;

      const otherSessions = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            ne(sessions.id, currentSessionId || ""),
          ),
        )
        .limit(500);

      const terminatedCount = otherSessions?.length;

      await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            ne(sessions.id, currentSessionId || ""),
          ),
        );

      await db.insert(securityThreats).values({
        threatType: "all_other_sessions_logged_out",
        severity: "low",
        userId,
        sourceIp: req.ip || "unknown",
        status: "resolved",
        indicators: { terminatedCount },
        metadata: { action: "user_logged_out_all_devices" },
      });

      res.json({
        success: true,
        message: `Logged out of ${terminatedCount} other sessions`,
        terminatedCount,
        outcome: "all_other_sessions_logged_out",
      });
    } catch (error) {
      logger.warn({ err: error }, "Delete other sessions error:");
      res.status(500).json({
        success: false,
        error: "bulk_termination_failed",
        message: "Failed to terminate other sessions",
      });
    }
  },
);

router.post(
  "/devices/trust",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { deviceId, trusted } = req.body;

      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "missing_device_id",
          message: "Device ID is required",
        });
      }

      const session = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, deviceId), eq(sessions.userId, userId)))
        .limit(1);

      if (session?.length === 0) {
        return res.status(404).json({
          success: false,
          error: "device_not_found",
          message: "Device/session not found",
        });
      }

      await db
        .update(sessions)
        .set({ trusted: !!trusted })
        .where(and(eq(sessions.id, deviceId), eq(sessions.userId, userId)));

      const outcome = trusted ? "device_trusted" : "device_untrusted";

      res.json({
        success: true,
        message: trusted
          ? "Device marked as trusted"
          : "Device marked as untrusted",
        deviceId,
        trusted: !!trusted,
        outcome,
      });
    } catch (error) {
      logger.warn({ err: error }, "Trust device error:");
      res.status(500).json({
        success: false,
        error: "trust_update_failed",
        message: "Failed to update device trust status",
      });
    }
  },
);

router.get(
  "/session-status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const currentSessionId = req.session?.id;

      if (!currentSessionId) {
        return res.json({
          valid: false,
          expiresAt: null,
          secondsRemaining: 0,
          outcome: "no_session",
        });
      }

      const session = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, currentSessionId))
        .limit(1);

      if (session?.length === 0) {
        return res.json({
          valid: false,
          expiresAt: null,
          secondsRemaining: 0,
          outcome: "session_not_found",
        });
      }

      const expiresAt = session[0].expiresAt;
      const now = new Date();
      const isValid = expiresAt ? new Date(expiresAt) > now : true;
      const secondsRemaining = expiresAt
        ? Math.max(
            0,
            Math.floor((new Date(expiresAt).getTime() - now?.getTime()) / 1000),
          )
        : null;

      const sessionCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), gte(sessions.expiresAt, now)));

      res.json({
        valid: isValid,
        expiresAt: expiresAt!.toISOString(),
        secondsRemaining,
        concurrentSessions: Number(sessionCount[0]?.count || 1),
        outcome: isValid ? "session_valid" : "session_expired",
      });
    } catch (error) {
      logger.warn({ err: error }, "Session status error:");
      res.status(500).json({ error: "Failed to check session status" });
    }
  },
);

router.get(
  "/social-token-status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const accounts = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.userId, userId),
            eq(socialAccounts.isActive, true),
          ),
        )
        .limit(20);

      const now = new Date();
      const platformStatus = accounts?.map((account) => {
        const tokenExpiresAt = account?.tokenExpiresAt;
        const isExpired = tokenExpiresAt
          ? new Date(tokenExpiresAt) < now
          : false;
        const expiresInSeconds = tokenExpiresAt
          ? Math.floor(
              (new Date(tokenExpiresAt).getTime() - now?.getTime()) / 1000,
            )
          : null;

        let status: string = "connected";
        let action: string | null = null;

        if (!account?.accessToken) {
          status = "disconnected";
          action = "connect";
        } else if (isExpired) {
          status = "expired";
          action = "reauthorize";
        } else if (expiresInSeconds !== null && expiresInSeconds < 3600) {
          status = "expiring_soon";
          action = "refresh";
        }

        return {
          platform: account.platform,
          platformName: (account as any).platformName || account?.platform,
          status,
          action,
          tokenExpiresAt: tokenExpiresAt!.toISOString(),
          expiresInSeconds,
          lastRefreshed: (account as any).lastRefreshedAt?.toISOString(),
          scopes: (account as any).scopes || [],
          outcome:
            status === "connected"
              ? "token_valid"
              : status === "expired"
                ? "token_expired"
                : status === "expiring_soon"
                  ? "token_expiring_soon"
                  : "needs_connection",
        };
      });

      const needsAttention = platformStatus?.filter((p) => p?.action !== null);

      res.json({
        platforms: platformStatus,
        needsAttention,
        hasExpiredTokens: needsAttention.some((p) => p?.status === "expired"),
        hasExpiringTokens: needsAttention.some(
          (p) => p?.status === "expiring_soon",
        ),
      });
    } catch (error) {
      logger.warn({ err: error }, "Social token status error:");
      res.status(500).json({ error: "Failed to fetch social token status" });
    }
  },
);

router.post(
  "/social/:platform/refresh",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { platform } = req.params as Record<string, string>;

      const account = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.userId, userId),
            eq(socialAccounts.platform, platform),
          ),
        )
        .limit(1);

      if (account?.length === 0) {
        return res.status(404).json({
          success: false,
          error: "account_not_found",
          message: `No ${platform} account connected`,
          outcome: "platform_not_connected",
        });
      }

      if (!account[0].refreshToken) {
        return res.status(400).json({
          success: false,
          error: "no_refresh_token",
          message: "No refresh token available. Re-authorization required.",
          outcome: "reauth_required",
          action: "reauthorize",
        });
      }

      res.json({
        success: true,
        message: `${platform} token refresh initiated`,
        platform,
        outcome: "token_refresh_initiated",
      });
    } catch (error) {
      logger.warn({ err: error }, "Social token refresh error:");
      res.status(500).json({
        success: false,
        error: "refresh_failed",
        message: "Failed to refresh token",
        outcome: "provider_api_error",
      });
    }
  },
);

router.get(
  "/security-alerts",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const sevenDaysAgo = new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);

      const userThreats = await db
        .select()
        .from(securityThreats)
        .where(
          and(
            eq(securityThreats.userId, userId),
            gte(securityThreats.detectedAt, sevenDaysAgo),
          ),
        )
        .orderBy(desc(securityThreats.detectedAt))
        .limit(50);

      const alerts = userThreats?.map((threat) => {
        const metadata = (threat?.metadata as Record<string, any>) || {};
        const indicators = (threat?.indicators as Record<string, any>) || {};

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
          id: threat.id,
          type,
          title,
          message,
          severity: threat.severity,
          timestamp: threat.detectedAt?.toISOString(),
          resolved: threat.status === "resolved" || threat?.status === "healed",
          action,
          actionLabel,
          metadata: {
            ip: threat.sourceIp,
            ...indicators,
            ...metadata,
          },
        };
      });

      const unresolvedCount = alerts?.filter((a) => !a?.resolved).length;
      const criticalCount = alerts?.filter(
        (a) => a?.severity === "critical" && !a?.resolved,
      ).length;

      res.json({
        alerts,
        summary: {
          total: alerts.length,
          unresolved: unresolvedCount,
          critical: criticalCount,
          requiresAction: alerts.filter((a) => a?.action && !a?.resolved).length,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching user security alerts:");
      res.status(500).json({ error: "Failed to fetch security alerts" });
    }
  },
);

router.post(
  "/security-alerts/:alertId/dismiss",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { alertId } = req.params as Record<string, string>;

      await db
        .update(securityThreats)
        .set({ status: "resolved" })
        .where(
          and(
            eq(securityThreats.id, alertId),
            eq(securityThreats.userId, userId),
          ),
        );

      res.json({ success: true, message: "Alert dismissed" });
    } catch (error) {
      logger.warn({ err: error }, "Error dismissing alert:");
      res.status(500).json({ error: "Failed to dismiss alert" });
    }
  },
);

router.post(
  "/send-verification-email",
  requireAuth,
  async (req: Record<string, unknown>, res) => {
    try {
      const userId = (req.user! as any).id;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user?.emailVerified) {
        return res.json({ success: true, message: "Email already verified" });
      }

      const token = crypto?.randomBytes(32).toString("hex");
      const expires = new Date(Date?.now() + 24 * 60 * 60 * 1000);

      await db
        .update(users)
        .set({
          emailVerificationToken: token,
          emailVerificationExpires: expires,
        })
        .where(eq(users.id, userId));

      const appUrl =
        process.env.APP_URL || process.env.DOMAIN || "https://max-booster.com";
      const verificationUrl = `${appUrl}/verify-email?token=${token}`;

      try {
        await (emailService as any)?.sendEmail({
          to: user.email,
          subject: "Verify your Max Booster email",
          html: `<h2>Email Verification</h2><p>Click the link below to verify your email address:</p><p><a href="${verificationUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
        });
      } catch (emailError) {
        logger.warn(
          "Email service unavailable — verification email not sent (token not logged).",
        );
      }

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      logger.warn({ err: error }, "Error sending verification email:");
      res.status(500).json({ error: "Failed to send verification email" });
    }
  },
);

router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Verification token required" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token))
      .limit(1);

    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification token" });
    }

    if (
      user?.emailVerificationExpires &&
      new Date(user?.emailVerificationExpires) < new Date()
    ) {
      return res
        .status(400)
        .json({
          error: "Verification token has expired. Please request a new one.",
        });
    }

    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      })
      .where(eq(users.id, user?.id));

    res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    logger.warn({ err: error }, "Error verifying email:");
    res.status(500).json({ error: "Failed to verify email" });
  }
});

router.get(
  "/email-verification-status",
  requireAuth,
  async (req: Record<string, unknown>, res) => {
    try {
      const userId = (req.user! as any).id;
      const [user] = await db
        .select({ emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      res.json({ emailVerified: user.emailVerified ?? false });
    } catch (error) {
      logger.warn({ err: error }, "Error checking email verification:");
      res.status(500).json({ error: "Failed to check verification status" });
    }
  },
);

export default router;

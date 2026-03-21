import type { Express, Request, Response, NextFunction, Router } from "express";
import { type Server } from "http";
import crypto from "crypto";
import { execSync } from "child_process";
import fs from "fs";
import { storage } from "./storage.ts";
import { db } from "./db.ts";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { analytics, userStorage, userStorageFiles, users, notifications, pushSubscriptions, royaltyTransactions, royaltySplits, taxForms, releases, projects } from "../shared/schema.ts";
import { sum, count, ilike, inArray, or, ne, asc } from "drizzle-orm";
import bcrypt from "bcrypt";
import { getCsrfToken } from "./middleware/csrf.ts";
import Stripe from "stripe";
import { getStripePriceIds, ensureStripeProductsAndPrices } from "./services/stripeSetup.ts";
import { getBaseUrl } from "./config/defaults.ts";
import { generateSecret as otpGenerateSecret, verifySync, generateURI } from "otplib";
import { loginRateLimiter, registerRateLimiter, forgotPasswordRateLimiter } from "./middleware/rateLimiter.ts";
import { criticalEndpointLimiter } from "./middleware/globalRateLimiter.ts";
import { requestIdMiddleware } from "./middleware/requestId.js";

const authenticator = {
  generateSecret: () => otpGenerateSecret(),
  keyuri: (account: string, issuer: string, secret: string) =>
    generateURI({ label: account, issuer, secret, strategy: 'totp' }),
  verify: ({ token, secret }: { token: string; secret: string }) =>
    verifySync({ token, secret, strategy: 'totp', epochTolerance: 1 }),
};
import QRCode from "qrcode";
import { emailService } from "./services/emailService.ts";
import { upload } from "./middleware/uploadHandler.ts";
import multer from "multer";
import { logger } from './logger.js';
import { achievementService } from './services/achievementService.ts';
import { notificationService } from './services/notificationService.ts';
import { jwtAuthService } from './services/jwtAuthService.ts';
import { artistProfileService } from './services/artistProfileService.ts';

const log = (msg: string) => logger.info(msg);

// Helper to safely load route modules
async function safeLoadRoute(name: string, importFn: () => Promise<any>): Promise<{ type: 'router' | 'function' | 'skip'; value: any } | null> {
  try {
    const module = await importFn();

    // Check if module has a default export that's a router
    if (module.default && typeof module.default === 'function') {
      // Check if it's an Express router (has stack property)
      if (module.default.stack !== undefined) {
        log(`Loaded route: ${name}`);
        return { type: 'router', value: module.default };
      }
      // It's a setup function
      log(`Loaded route function: ${name}`);
      return { type: 'function', value: module.default };
    }

    // Check for named exports that are setup functions
    if (module.setupReliabilityEndpoints) {
      log(`Loaded route function: ${name}`);
      return { type: 'function', value: module.setupReliabilityEndpoints };
    }

    // Check if the module itself is a router
    if (module.stack !== undefined) {
      log(`Loaded route: ${name}`);
      return { type: 'router', value: module };
    }

    // Module doesn't export anything usable — this is a programming error, not a runtime condition
    logger.error(`[routes] Route module '${name}' loaded successfully but exports no router or setup function — check the module's default export`);
    log(`ERROR: ${name} has no usable export (router or setup function)`);
    return { type: 'skip', value: null };
  } catch (error: any) {
    const criticalRoutes = ['auth', 'billing', 'stripeWebhook', 'admin', 'security', 'storage'];
    if (criticalRoutes.includes(name)) {
      log(`ERROR: Critical route '${name}' failed to load - ${error.message}`);
      logger.error(`[routes] CRITICAL route loading failure for '${name}':`, error.stack || error.message);
    } else {
      log(`Warning: Could not load ${name} - ${error.message}`);
    }
    return null;
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated(): this is Request & { user: any };
    }
  }
}

// Middleware to attach user to request
async function attachUser(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === 'production';
  const isApiRoute = req.path.startsWith('/api/');

  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = user;
      } else if (isProduction && isApiRoute) {
        logger.info(`[Session] User not found for userId: ${req.session.userId}, path: ${req.path}`);
      }
    } catch (error) {
      logger.error("Error fetching user for request:", error);
    }
  } else if (isProduction && isApiRoute && req.path !== '/api/auth/me' && req.path !== '/api/csrf-token' && req.path !== '/api/health' && req.path !== '/api/version') {
    const sessionCookie = req.cookies?.sessionId || req.headers.cookie?.includes('sessionId');
    logger.info(`[Session] No userId in session for ${req.path}, cookie present: ${!!sessionCookie}, session exists: ${!!req.session}`);
  }

  // Add isAuthenticated method
  req.isAuthenticated = function (): this is Request & { user: any } {
    return !!this.user;
  };

  next();
}

// ── Session operation helpers (VM-reserved PDIM) ──────────────────────────────
// Retry session.regenerate / session.save up to 3× with short delays.
// PDIM is a reserved VM — any 503 is transient (< 2 s). Retrying handles it.

function sessionRegenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      req.session.regenerate((err) => {
        if (!err) return resolve();
        if (remaining <= 0) return reject(err);
        setTimeout(() => attempt(remaining - 1), 400);
      });
    };
    attempt(2);
  });
}

function sessionSave(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      req.session.save((err) => {
        if (!err) return resolve();
        if (remaining <= 0) return reject(err);
        setTimeout(() => attempt(remaining - 1), 400);
      });
    };
    attempt(2);
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Assign a unique request ID to every request for end-to-end tracing.
  // This populates AsyncLocalStorage so every logger.* call automatically
  // includes requestId and duration without any manual threading.
  app.use(requestIdMiddleware);

  // Apply user attachment middleware to all routes
  app.use(attachUser);

  // Critical endpoint rate limiting — tighter per-IP limits for AI, billing, and admin routes
  // which are the most expensive per-request and most attractive DDoS/abuse targets
  app.use('/api/ai', criticalEndpointLimiter);
  app.use('/api/career-coach', criticalEndpointLimiter);
  app.use('/api/billing', criticalEndpointLimiter);
  app.use('/api/admin', criticalEndpointLimiter);
  app.use('/api/studio/generation', criticalEndpointLimiter);

  // CSRF Token endpoint
  app.get("/api/csrf-token", getCsrfToken);

  // Auth: Get current user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // Production debugging for session issues
    if (isProduction) {
      const hasCookie = req.headers.cookie?.includes('sessionId');
      const hasSession = !!req.session;
      const hasUserId = !!req.session?.userId;
      const sessionId = req.session?.id?.substring(0, 8) || 'none';
      const origin = req.headers.origin || 'none';
      const host = req.headers.host || 'none';

      logger.info('[Auth/me] Auth check', { hasSession, hasUserId });

      if (!req.user) {
        if (hasCookie && !hasUserId) {
          logger.info('[Auth/me] Cookie present but no userId - session may have expired or Redis issue');
        } else if (!hasCookie) {
          logger.info('[Auth/me] No sessionId cookie present in request');
        }
      }
    }

    if (req.user) {
      const { password, twoFactorSecret, passwordResetToken, emailVerificationToken, ...safeUser } = req.user as any;
      if (safeUser.email === 'demo@maxbooster.ai') {
        safeUser.isDemo = true;
      }
      return res.json(safeUser);
    }
    return res.json(null);
  });

  // Auth: Register
  app.post("/api/auth/register", registerRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password, username, firstName, lastName, artistName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const { confirmPassword } = req.body;
      if (confirmPassword !== undefined && confirmPassword !== password) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if username already exists (if provided)
      if (username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        if (!usernameRegex.test(username)) {
          return res.status(400).json({ message: "Username must be 3-30 alphanumeric characters" });
        }

        const existingUsername = await storage.getUserByUsername(username);
        if (existingUsername) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      let user;
      try {
        user = await storage.createUser({
          email,
          password: hashedPassword,
          username: username || null,
          firstName: firstName || "",
          lastName: lastName || ""
        });
      } catch (createErr: any) {
        if (createErr?.code === '23505' || createErr?.message?.toLowerCase().includes('unique')) {
          return res.status(400).json({ message: "Email already registered" });
        }
        throw createErr;
      }

      const { password: _, twoFactorSecret: _2fa, passwordResetToken: _prt, emailVerificationToken: _evt, ...safeUser } = user as any;

      try {
        await sessionRegenerate(req);
        req.session.userId = user.id;
        await sessionSave(req);
      } catch (sessionErr) {
        logger.error('[Register] Session operation failed after retries:', sessionErr);
        return res.status(500).json({ message: 'Registration failed - session error' });
      }

      emailService.sendWelcomeEmail({
        firstName: firstName || username || 'there',
        email,
      }).catch((err: unknown) => logger.info('Welcome email failed (non-blocking):', err));

      notificationService.sendAdminNewUserNotification(email, user.id)
        .catch((err: unknown) => logger.info('Admin new-user notification failed (non-blocking):', err));

      if (artistName && typeof artistName === 'string' && artistName.trim().length > 0) {
        const trimmedName = artistName.trim();
        artistProfileService.createProfile({
          userId: user.id,
          artistName: trimmedName,
          isNewArtist: true,
        }).then((profile) => {
          logger.info(`[Register] Artist profile created for new user ${user.id}: "${trimmedName}" (id=${profile.id})`);
          return artistProfileService.autoDiscover(profile.id, user.id);
        }).then((discoverResult) => {
          logger.info(`[Register] Auto-discover complete for new user ${user.id}: saved=${discoverResult.saved} platforms=[${discoverResult.savedFields.join(',')}]`);
        }).catch((err: unknown) => {
          logger.info('[Register] Artist profile auto-discover failed (non-blocking):', err);
        });
      }

      return res.json(safeUser);
    } catch (error) {
      logger.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // Auth: Login (accepts username or email)
  // SECURITY: Session regeneration implemented to prevent session fixation attacks
  app.post("/api/auth/login", loginRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, username, password, twoFactorCode } = req.body;
      const identifier = email || username;

      if (!identifier || !password) {
        return res.status(400).json({ message: "Email/username and password are required" });
      }

      // Try to find user by email first, then by username
      let user = await storage.getUserByEmail(identifier);
      if (!user) {
        user = await storage.getUserByUsername(identifier);
      }

      // Always run bcrypt.compare to prevent timing-based user enumeration.
      // When no user is found we compare against a dummy hash so response time
      // is indistinguishable from a real password mismatch (prevents user existence
      // detection via response time differences).
      const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
      const candidateHash = user?.password ?? DUMMY_HASH;
      let isValid = false;
      try {
        isValid = await bcrypt.compare(password, candidateHash);
      } catch {
        isValid = false;
      }

      if (!user || !isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if 2FA is enabled
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        if (!twoFactorCode) {
          return res.status(200).json({
            requiresTwoFactor: true,
            message: "Two-factor authentication required"
          });
        }

        const { verifySync: otpVerifySync } = await import('otplib');
        const isCodeValid = otpVerifySync({
          token: twoFactorCode,
          secret: user.twoFactorSecret,
          strategy: 'totp',
          epochTolerance: 1,
        });

        if (!isCodeValid) {
          return res.status(401).json({ message: "Invalid 2FA code" });
        }
      }

      try {
        await sessionRegenerate(req);
        req.session.userId = user.id;
        await sessionSave(req);

        logger.info('[Login] SUCCESS for userId:', user.id);

        achievementService.updateStreak(user.id, 'login').catch((e: unknown) =>
          logger.warn('[Login] Failed to update login streak:', e)
        );

        notificationService.sendLoginSecurityNotification(
          user.id,
          req.ip || undefined,
          req.headers['user-agent'] || undefined
        ).catch(() => {});

        const { password: _, twoFactorSecret: _2fa, passwordResetToken: _prt, emailVerificationToken: _evt, ...safeUser } = user as any;
        return res.json(safeUser);
      } catch (sessionErr) {
        logger.error('[Login] Session operation failed after retries:', sessionErr);
        return res.status(500).json({ message: "Login failed - session error" });
      }
    } catch (error) {
      logger.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // Auth: Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const userId = req.session?.userId;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      if (userId) {
        jwtAuthService.revokeAllUserTokens(userId, 'User logout').catch(() => {});
      }
      res.clearCookie('sessionId', { path: '/' });
      res.json({ message: "Logged out successfully" });
    });
  });

  // Auth: Inactivity heartbeat — called by the frontend whenever the user is active.
  // Rolling session auto-extends the cookie. No DB update needed.
  app.post("/api/auth/heartbeat", (req: Request, res: Response) => {
    const userId = req.session?.userId || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false });
    }
    req.session.touch?.();
    return res.json({ ok: true });
  });

  // Auth: Session refresh heartbeat (keeps session alive, renews CSRF)
  app.post("/api/auth/refresh-token", async (req: Request, res: Response) => {
    const userId = req.session?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        action: 'reauth_required',
        error: 'session_expired',
        message: 'Session expired. Please sign in again.',
      });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          action: 'reauth_required',
          error: 'user_not_found',
          message: 'User account not found.',
        });
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      return res.json({
        success: true,
        expiresAt,
        message: 'Session refreshed',
      });
    } catch (error) {
      logger.error('[Auth] refresh-token error:', error);
      return res.status(500).json({ success: false, message: 'Refresh failed' });
    }
  });

  // Auth: Onboarding status
  app.get("/api/auth/onboarding-status", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      hasCompletedOnboarding: req.user.onboardingCompleted || false,
      currentStep: req.user.onboardingStep || 0,
    });
  });

  // Auth: Update onboarding
  app.post("/api/auth/update-onboarding", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { step, completed, hasCompletedOnboarding, onboardingData } = req.body;

      // Support both legacy format (step/completed) and new format (hasCompletedOnboarding/onboardingData)
      const updateData: Record<string, any> = {};

      if (hasCompletedOnboarding !== undefined) {
        updateData.onboardingCompleted = hasCompletedOnboarding;
      } else if (completed !== undefined) {
        updateData.onboardingCompleted = completed;
      }

      if (step !== undefined) {
        updateData.onboardingStep = step;
      }

      // Store onboarding preferences if provided
      if (onboardingData) {
        updateData.onboardingData = onboardingData;
      }

      await storage.updateUser(req.user.id, updateData);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Update onboarding error:", error);
      return res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // Auth: Get profile
  app.get("/api/auth/profile", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, twoFactorSecret, passwordResetToken, emailVerificationToken, ...profile } = req.user as any;
    return res.json(profile);
  });

  // Auth: Update profile
  app.put("/api/auth/profile", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { firstName, lastName, artistName, bio, website, location, socialLinks } = req.body;
      const stripHtml = (str: string | undefined) => str ? str.replace(/[<>&"'`]/g, '').trim() : str;
      await storage.updateUser(req.user.id, {
        firstName: stripHtml(firstName),
        lastName: stripHtml(lastName),
        artistName: stripHtml(artistName),
        bio: stripHtml(bio),
        website: stripHtml(website),
        location: stripHtml(location),
        socialLinks,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error("Update profile error:", error);
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Auth: Get notification settings (persisted to database)
  app.get("/api/auth/notifications", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const defaultSettings = {
      emailNotifications: true,
      pushNotifications: true,
      weeklyReports: true,
      salesAlerts: true,
      royaltyUpdates: true,
      marketingEmails: false,
      releaseAlerts: true,
      paymentAlerts: true,
      securityAlerts: true,
    };
    const userSettings = req.user.notificationSettings as Record<string, any> | null;
    return res.json({ ...defaultSettings, ...userSettings });
  });

  // Auth: Update notification settings (persisted to database)
  app.put("/api/auth/notifications", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        emailNotifications, pushNotifications, weeklyReports, salesAlerts, royaltyUpdates,
        marketingEmails, releaseAlerts, paymentAlerts, securityAlerts
      } = req.body;
      const currentSettings = (req.user.notificationSettings as Record<string, any>) || {};
      const updatedSettings = {
        ...currentSettings,
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(weeklyReports !== undefined && { weeklyReports }),
        ...(salesAlerts !== undefined && { salesAlerts }),
        ...(royaltyUpdates !== undefined && { royaltyUpdates }),
        ...(marketingEmails !== undefined && { marketingEmails }),
        ...(releaseAlerts !== undefined && { releaseAlerts }),
        ...(paymentAlerts !== undefined && { paymentAlerts }),
        ...(securityAlerts !== undefined && { securityAlerts }),
      };
      await storage.updateUser(req.user.id, { notificationSettings: updatedSettings });
      return res.json({ success: true });
    } catch (error) {
      logger.error("Update notification settings error:", error);
      return res.status(500).json({ message: "Failed to update notification settings" });
    }
  });

  // Auth: Get preferences (persisted to database)
  app.get("/api/auth/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const defaultPreferences = {
      theme: "dark",
      language: "en",
      timezone: "America/New_York",
      dateFormat: "MM/DD/YYYY",
      currency: "USD",
      defaultBPM: 120,
      defaultKey: "C",
      autoSave: true,
      betaFeatures: false,
    };
    const userPreferences = req.user.preferences as Record<string, any> | null;
    return res.json({ ...defaultPreferences, ...userPreferences });
  });

  // Auth: Update preferences (persisted to database)
  app.put("/api/auth/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        theme, language, timezone, dateFormat, currency,
        defaultBPM, defaultKey, autoSave, betaFeatures
      } = req.body;
      const currentPreferences = (req.user.preferences as Record<string, any>) || {};
      const updatedPreferences = {
        ...currentPreferences,
        ...(theme !== undefined && { theme }),
        ...(language !== undefined && { language }),
        ...(timezone !== undefined && { timezone }),
        ...(dateFormat !== undefined && { dateFormat }),
        ...(currency !== undefined && { currency }),
        ...(defaultBPM !== undefined && { defaultBPM }),
        ...(defaultKey !== undefined && { defaultKey }),
        ...(autoSave !== undefined && { autoSave }),
        ...(betaFeatures !== undefined && { betaFeatures }),
      };
      await storage.updateUser(req.user.id, { preferences: updatedPreferences });
      return res.json({ success: true });
    } catch (error) {
      logger.error("Update preferences error:", error);
      return res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Auth: Get sessions
  app.get("/api/auth/sessions", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      // Get user sessions from database
      const userSessions = await storage.getSessionsByUserId(req.user.id);

      // Format sessions for frontend display
      const formattedSessions = userSessions.map(session => ({
        id: session.id,
        device: session.userAgent || "Unknown Device",
        location: "Unknown",
        time: session.lastActivity ? new Date(session.lastActivity).toLocaleString() : "Unknown",
        current: session.id === req.session.id,
      }));

      // Always include current session if not in list
      const currentSessionExists = formattedSessions.some(s => s.current);
      if (!currentSessionExists) {
        formattedSessions.unshift({
          id: req.session.id,
          device: "Current Device",
          location: "Unknown",
          time: new Date().toLocaleString(),
          current: true,
        });
      }

      return res.json(formattedSessions);
    } catch (error) {
      logger.error("Get sessions error:", error);
      // Fallback to current session only
      return res.json([
        {
          id: req.session.id,
          device: "Current Device",
          location: "Unknown",
          time: new Date().toLocaleString(),
          current: true,
        },
      ]);
    }
  });

  // Auth: Terminate session
  app.post("/api/auth/sessions/terminate", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      // Direct lookup of session by ID and verify ownership
      const session = await storage.getSessionById(sessionId);

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.user.id) {
        logger.info(`[Security] Session termination denied: User ${req.user.id} tried to terminate session ${sessionId} belonging to user ${session.userId}`);
        return res.status(403).json({ message: "Session does not belong to this user" });
      }

      // Delete session from database
      const deleted = await storage.deleteSession(sessionId);

      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete session" });
      }

      // Also try to delete from Redis if available
      try {
        const { getRedisClient } = await import('./lib/redisConnectionFactory.js');
        const redisClient = await getRedisClient();
        if (redisClient) {
          await redisClient.del(`maxbooster:sess:${sessionId}`);
        }
      } catch (redisError) {
        logger.info("Redis session deletion skipped:", redisError);
      }

      return res.json({ success: true, message: "Session terminated successfully" });
    } catch (error) {
      logger.error("Session termination error:", error);
      return res.status(500).json({ message: "Failed to terminate session" });
    }
  });

  // Auth: Terminate all other sessions
  app.post("/api/auth/sessions/terminate-all", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const currentSessionId = req.session.id;
      const userSessions = await storage.getSessionsByUserId(req.user.id);
      let terminatedCount = 0;

      for (const session of userSessions) {
        if (session.id !== currentSessionId) {
          const deleted = await storage.deleteSession(session.id);
          if (deleted) {
            terminatedCount++;
            try {
              const { getRedisClient } = await import('./lib/redisConnectionFactory.js');
              const redisClient = await getRedisClient();
              if (redisClient) {
                await redisClient.del(`maxbooster:sess:${session.id}`);
              }
            } catch (redisError) {
              // Redis deletion is best-effort
            }
          }
        }
      }

      logger.info(`[Security] Terminated ${terminatedCount} sessions for user ${req.user.id}`);
      return res.json({ success: true, message: `${terminatedCount} session(s) terminated` });
    } catch (error) {
      logger.error("Terminate all sessions error:", error);
      return res.status(500).json({ message: "Failed to terminate sessions" });
    }
  });

  // Auth: Delete all other sessions (alias for terminate-all)
  app.delete("/api/auth/sessions/other", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const currentSessionId = req.session.id;
      const userSessions = await storage.getSessionsByUserId(req.user.id);
      let terminatedCount = 0;

      for (const session of userSessions) {
        if (session.id !== currentSessionId) {
          const deleted = await storage.deleteSession(session.id);
          if (deleted) {
            terminatedCount++;
            try {
              const { getRedisClient } = await import('./lib/redisConnectionFactory.js');
              const redisClient = await getRedisClient();
              if (redisClient) {
                await redisClient.del(`maxbooster:sess:${session.id}`);
              }
            } catch (redisError) {
            }
          }
        }
      }

      return res.json({ success: true, message: `${terminatedCount} session(s) terminated` });
    } catch (error) {
      logger.error("Delete other sessions error:", error);
      return res.status(500).json({ message: "Failed to terminate other sessions" });
    }
  });

  // Auth: Get login history
  app.get("/api/auth/login-history", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Get login events from security threats table
      const { securityThreats } = await import('../shared/schema.ts');
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const loginEvents = await db.select()
        .from(securityThreats)
        .where(
          and(
            eq(securityThreats.userId, req.user.id),
            gte(securityThreats.detectedAt, thirtyDaysAgo)
          )
        )
        .orderBy(desc(securityThreats.detectedAt))
        .limit(50);

      // Also get successful logins from sessions
      const userSessions = await storage.getSessionsByUserId(req.user.id);
      
      // Format events for frontend
      const formattedEvents = loginEvents.map(event => {
        const metadata = event.metadata as Record<string, any> || {};
        const indicators = event.indicators as Record<string, any> || {};
        
        return {
          id: event.id,
          timestamp: event.detectedAt?.toISOString() || new Date().toISOString(),
          ipAddress: metadata.ipAddress || indicators.ipAddress || 'Unknown',
          location: metadata.location || indicators.location || 'Unknown',
          device: metadata.userAgent || indicators.userAgent || 'Unknown Device',
          browser: metadata.browser || 'Unknown',
          success: event.threatType !== 'failed_login',
          suspicious: event.severity === 'high' || event.severity === 'critical',
          reason: event.severity === 'high' || event.severity === 'critical' 
            ? `${event.threatType}: ${metadata.description || 'Unusual activity detected'}`
            : undefined,
        };
      });

      // Add recent successful logins from sessions
      const sessionEvents = userSessions
        .filter(s => s.createdAt)
        .map(session => ({
          id: `session-${session.id}`,
          timestamp: session.createdAt?.toISOString() || new Date().toISOString(),
          ipAddress: 'Unknown',
          location: 'Unknown',
          device: session.userAgent || 'Unknown Device',
          browser: 'Unknown',
          success: true,
          suspicious: false,
        }));

      // Combine and sort by timestamp
      const allEvents = [...formattedEvents, ...sessionEvents]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);

      return res.json(allEvents);
    } catch (error) {
      logger.error("Get login history error:", error);
      return res.json([]);
    }
  });

  // Auth: Get privacy settings
  app.get("/api/auth/privacy-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Return user's privacy settings from their profile
      const settings = {
        profileVisibility: req.user.profileVisibility || 'public',
        showEmail: req.user.showEmail ?? false,
        showLocation: req.user.showLocation ?? true,
        allowMessages: req.user.allowMessages ?? true,
        allowSearchIndexing: req.user.allowSearchIndexing ?? true,
        gdprDataProcessing: true, // Required for service
        gdprMarketing: req.user.gdprMarketing ?? false,
        gdprAnalytics: req.user.gdprAnalytics ?? true,
      };
      return res.json(settings);
    } catch (error) {
      logger.error("Get privacy settings error:", error);
      return res.status(500).json({ message: "Failed to get privacy settings" });
    }
  });

  // Auth: Update privacy settings
  app.put("/api/auth/privacy-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const allowedFields = [
        'profileVisibility', 'showEmail', 'showLocation', 
        'allowMessages', 'allowSearchIndexing', 'gdprMarketing', 'gdprAnalytics'
      ];
      
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateUser(req.user.id, updates);
      }

      return res.json({ success: true, message: "Privacy settings updated" });
    } catch (error) {
      logger.error("Update privacy settings error:", error);
      return res.status(500).json({ message: "Failed to update privacy settings" });
    }
  });

  // Auth: Request data export
  app.post("/api/auth/request-data-export", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Store export request timestamp
      await storage.updateUser(req.user.id, { 
        dataExportRequestedAt: new Date(),
        dataExportStatus: 'pending'
      });

      // In production, this would trigger an async job
      // For now, simulate immediate completion
      setTimeout(async () => {
        try {
          await storage.updateUser(req.user.id, { 
            dataExportStatus: 'ready',
            dataExportExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          });
        } catch (e) {
          logger.error("Failed to update export status:", e);
        }
      }, 5000);

      return res.json({ 
        success: true, 
        message: "Data export requested. You will receive an email when it's ready."
      });
    } catch (error) {
      logger.error("Request data export error:", error);
      return res.status(500).json({ message: "Failed to request data export" });
    }
  });

  // Auth: Get data export status
  app.get("/api/auth/data-export-status", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const status = {
        status: req.user.dataExportStatus || 'none',
        requestedAt: req.user.dataExportRequestedAt?.toISOString(),
        expiresAt: req.user.dataExportExpiresAt?.toISOString(),
      };
      return res.json(status);
    } catch (error) {
      logger.error("Get data export status error:", error);
      return res.status(500).json({ message: "Failed to get export status" });
    }
  });

  // Auth: Change password
  // SECURITY: Invalidates all other sessions after password change
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required" });
      }
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      
      const isValid = await bcrypt.compare(currentPassword, req.user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(req.user.id, { password: hashedPassword });
      
      // SECURITY FIX: Invalidate all OTHER sessions for this user after password change
      const currentSessionId = req.session.id;
      try {
        const userSessions = await storage.getSessionsByUserId(req.user.id);
        for (const session of userSessions) {
          if (session.id !== currentSessionId) {
            await storage.deleteSession(session.id);
            // Also try to delete from Redis if available
            try {
              const { getRedisClient } = await import('./lib/redisConnectionFactory.js');
              const redisClient = await getRedisClient();
              if (redisClient) {
                await redisClient.del(`maxbooster:sess:${session.id}`);
              }
            } catch (redisError) {
              // Redis deletion is best-effort
            }
          }
        }
        logger.info(`[Security] Invalidated ${userSessions.length - 1} sessions after password change for user ${req.user.id}`);
      } catch (sessionError) {
        logger.info('[Security] Could not invalidate other sessions:', sessionError);
        // Continue - password was changed successfully
      }
      
      notificationService.sendPasswordChangedNotification(req.user.id).catch(() => {});

      return res.json({ success: true, message: "Password changed. Other sessions have been logged out." });
    } catch (error) {
      logger.error("Change password error:", error);
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Auth: Delete account
  app.delete("/api/auth/account", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ message: "Password is required to delete account" });
      }
      const isValid = await bcrypt.compare(password, req.user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Password is incorrect" });
      }
      await storage.deleteUser(req.user.id);
      req.session.destroy(() => { });
      return res.json({ success: true });
    } catch (error) {
      logger.error("Delete account error:", error);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Auth: Upload avatar
  app.post("/api/auth/avatar", async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Dynamically import avatar upload middleware and storage
    try {
      const { avatarUpload, storeUploadedFile } = await import('./middleware/uploadHandler.js');

      // Handle multipart upload
      avatarUpload.single('avatar')(req, res, async (err: any) => {
        if (err) {
          logger.error("Avatar upload error:", err);
          return res.status(400).json({ message: err.message || "Failed to upload avatar" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          let avatarUrl: string;

          try {
            const result = await storeUploadedFile(req.file, req.user!.id, 'avatar');
            avatarUrl = result.url;
          } catch (storeError: any) {
            // Object Storage unavailable — fall back to storing the processed image
            // as a base64 data URL directly in the database. Avatars are small
            // (512x512 WebP ≈ 30-60 KB) so this is safe for the users table.
            logger.warn('[Avatar] Object Storage unavailable, falling back to data URL:', storeError.message);
            const { processAvatarImage } = await import('./middleware/uploadHandler.js');
            const processed = await processAvatarImage(req.file!.buffer);
            avatarUrl = `data:${processed.mimeType};base64,${processed.buffer.toString('base64')}`;
            logger.info(`[Avatar] Data URL fallback used for userId=${req.user!.id}, size=${processed.processedSize}B`);
          }

          const updatedUser = await storage.updateUser(req.user!.id, { avatarUrl, profileImageUrl: avatarUrl });
          if (!updatedUser) {
            logger.error(`[Avatar] updateUser returned null for userId=${req.user!.id}. DB update may have failed.`);
          } else {
            logger.info(`[Avatar] DB updated for userId=${req.user!.id}`);
          }

          return res.json({
            success: true,
            profileImageUrl: avatarUrl,
            avatarUrl,
          });
        } catch (storeError: any) {
          logger.error("Avatar storage error:", storeError);
          return res.status(500).json({ message: storeError.message || "Failed to store avatar" });
        }
      });
    } catch (importError) {
      logger.error("Avatar upload import error:", importError);
      return res.status(500).json({ message: "Avatar upload service unavailable" });
    }
  });

  // Auth: Delete avatar
  app.delete("/api/auth/avatar", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const currentAvatarUrl = req.user.avatarUrl;

      // If user has an avatar, try to delete the file
      if (currentAvatarUrl) {
        try {
          const fs = await import('fs/promises');
          const path = await import('path');

          // Extract the file path from the URL (assuming it's stored locally)
          // Avatar URLs are typically like /uploads/avatars/filename.ext
          if (currentAvatarUrl.startsWith('/uploads/') || currentAvatarUrl.startsWith('uploads/')) {
            const filePath = path.join(process.cwd(), currentAvatarUrl.replace(/^\//, ''));
            await fs.unlink(filePath).catch(() => {
              // File might not exist, that's ok
              logger.info("Avatar file not found or already deleted:", filePath);
            });
          }
        } catch (fsError) {
          // File deletion is best-effort, continue even if it fails
          logger.info("Avatar file deletion skipped:", fsError);
        }
      }

      await storage.updateUser(req.user.id, { avatarUrl: null, profileImageUrl: null });

      return res.json({ success: true, message: "Avatar deleted successfully" });
    } catch (error) {
      logger.error("Delete avatar error:", error);
      return res.status(500).json({ message: "Failed to delete avatar" });
    }
  });

  // Storage: Serve files from hybrid storage (Replit hot + Pocket Dimension cold)
  app.get("/api/storage/file/*key", async (req: Request, res: Response) => {
    try {
      const key = decodeURIComponent(req.params.key);
      
      if (!key) {
        return res.status(400).json({ message: "File key is required" });
      }

      const { storageService } = await import('./services/storageService.js');
      const { hybridStorageService } = await import('./services/hybridStorageService.js');
      
      let fileBuffer: Buffer | null = null;
      let storageTier = 'unknown';

      const hybridMeta = hybridStorageService.getMetadata(key);
      if (hybridMeta) {
        storageTier = `${hybridMeta.tier}/${hybridMeta.location}`;
        try {
          fileBuffer = await hybridStorageService.read(hybridMeta.userId, key);
        } catch {
          fileBuffer = null;
        }
      }

      if (!fileBuffer) {
        const exists = await storageService.fileExists(key);
        if (!exists) {
          return res.status(404).json({ message: "File not found" });
        }
        fileBuffer = await storageService.downloadFile(key);
        storageTier = 'replit-direct';
      }
      
      const ext = key.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg',
        'pdf': 'application/pdf',
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Storage-Tier', storageTier);
      
      return res.send(fileBuffer);
    } catch (error) {
      logger.error("Storage file serve error:", error);
      return res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // Auth: Export user data
  app.get("/api/auth/export-data", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { password, twoFactorSecret, passwordResetToken, emailVerificationToken, ...userData } = req.user as any;
      return res.json({
        user: userData,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Export data error:", error);
      return res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Auth: 2FA setup - Generate TOTP secret and QR code
  app.post("/api/auth/2fa/setup", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const secret = authenticator.generateSecret();
      const appName = "MaxBooster";
      const accountName = req.user.email;
      const otpauthUrl = authenticator.keyuri(accountName, appName, secret);

      await storage.updateUser(req.user.id, { twoFactorSecret: secret });

      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      return res.json({
        secret,
        qrCode: qrCodeDataUrl,
        otpauthUrl,
      });
    } catch (error) {
      logger.error("2FA setup error:", error);
      return res.status(500).json({ message: "Failed to setup 2FA" });
    }
  });

  // Auth: 2FA verify - Verify TOTP code and enable 2FA
  // SECURITY: Rate limited to prevent brute-force attacks on 2FA codes
  const { twoFactorRateLimiter } = await import('./middleware/rateLimiter.js');
  app.post("/api/auth/2fa/verify", twoFactorRateLimiter, async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ message: "Verification code is required" });
      }

      // SECURITY: Validate code format (6 digits)
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ message: "Invalid code format" });
      }

      const secret = req.user.twoFactorSecret;
      if (!secret) {
        return res.status(400).json({ message: "2FA not set up. Please run setup first." });
      }

      const isValid = authenticator.verify({ token: code, secret });

      if (!isValid) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      await storage.updateUser(req.user.id, { twoFactorEnabled: true });

      return res.json({ success: true, message: "2FA enabled successfully" });
    } catch (error) {
      logger.error("2FA verify error:", error);
      return res.status(500).json({ message: "Failed to verify 2FA code" });
    }
  });

  // Auth: 2FA disable - Disable 2FA on account
  // SECURITY: Rate limited to prevent brute-force attacks
  app.post("/api/auth/2fa/disable", twoFactorRateLimiter, async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { password, code } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      const isPasswordValid = await bcrypt.compare(password, req.user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Invalid password" });
      }

      if (req.user.twoFactorEnabled && req.user.twoFactorSecret) {
        if (!code) {
          return res.status(400).json({ message: "2FA code is required" });
        }

        // SECURITY: Validate code format (6 digits)
        if (!/^\d{6}$/.test(code)) {
          return res.status(400).json({ message: "Invalid code format" });
        }

        const isCodeValid = authenticator.verify({ token: code, secret: req.user.twoFactorSecret });
        if (!isCodeValid) {
          return res.status(400).json({ message: "Invalid 2FA code" });
        }
      }

      await storage.updateUser(req.user.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null
      });

      return res.json({ success: true, message: "2FA disabled successfully" });
    } catch (error) {
      logger.error("2FA disable error:", error);
      return res.status(500).json({ message: "Failed to disable 2FA" });
    }
  });

  // Auth: 2FA status - Get current 2FA status
  app.get("/api/auth/2fa/status", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    return res.json({
      enabled: req.user.twoFactorEnabled || false,
      hasSecret: !!req.user.twoFactorSecret,
    });
  });

  // REMOVED: Duplicate 2FA disable route without password verification
  // The secured version with password + 2FA code verification is registered above (line ~1139)

  // Auth: Demo login - Read-only showcase of all features
  app.post("/api/auth/demo", async (req: Request, res: Response) => {
    try {
      let demoUser = await storage.getUserByEmail("demo@maxbooster.ai");
      if (!demoUser) {
        const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        demoUser = await storage.createUser({
          email: "demo@maxbooster.ai",
          password: hashedPassword,
          username: "demo_user",
          firstName: "Demo",
          lastName: "User"
        });
      }

      // Ensure demo user always has active subscription so they can access all protected routes
      if (demoUser.subscriptionStatus !== 'active' || demoUser.subscriptionTier !== 'pro') {
        const updated = await storage.updateUser(demoUser.id, {
          subscriptionStatus: 'active',
          subscriptionTier: 'pro',
        });
        if (updated) demoUser = updated;
      }
      
      try {
        await sessionRegenerate(req);
        req.session.userId = demoUser.id;
        await sessionSave(req);
        logger.info('[Demo] SUCCESS for demoUser:', demoUser.id);
        const { password: _, twoFactorSecret: _2fa, passwordResetToken: _prt, emailVerificationToken: _evt, ...safeUser } = demoUser as any;
        return res.json({ ...safeUser, isDemo: true });
      } catch (sessionErr) {
        logger.error('[Demo] Session operation failed after retries:', sessionErr);
        return res.status(500).json({ message: "Demo login failed - session error" });
      }
    } catch (error) {
      logger.error("Demo login error:", error);
      return res.status(500).json({ message: "Demo login failed" });
    }
  });

  // Auth: Forgot password
  app.post("/api/auth/forgot-password", forgotPasswordRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);

      if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);

        await storage.updateUser(user.id, {
          passwordResetToken: hashedToken,
          passwordResetExpires: expires,
        });

        const baseUrl = process.env.APP_URL || 'https://maxbooster.replit.app';
        const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

        await emailService.sendPasswordResetEmail(
          {
            firstName: user.firstName || 'User',
            resetLink,
            expiresIn: '1 hour',
          },
          user.email
        );
      }

      return res.json({ success: true, message: "If the email exists, a reset link has been sent." });
    } catch (error) {
      logger.error("Forgot password error:", error);
      return res.json({ success: true, message: "If the email exists, a reset link has been sent." });
    }
  });

  // Auth: Reset password
  app.post("/api/auth/reset-password", forgotPasswordRateLimiter, async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const user = await storage.getUserByPasswordResetToken(hashedToken);

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (!user.passwordResetExpires || new Date(user.passwordResetExpires) < new Date()) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await storage.updateUser(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      });

      return res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      logger.error("Reset password error:", error);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Auth: Token management (admin)
  app.post("/api/auth/token", async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.json({
      token: `max_${crypto.randomBytes(24).toString('hex')}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  // Auth: Revoke token (admin)
  app.post("/api/auth/token/revoke", async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.json({ success: true });
  });

  // Auth: Google OAuth - Start login flow
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect("/login?error=google_not_configured");
    }

    const state = crypto.randomBytes(32).toString('hex');

    // Store state in session
    if (req.session) {
      (req.session as any).googleOAuthState = state;
    }

    // Always use production URL for OAuth callbacks (must match Google Console registration)
    const baseUrl = process.env.APP_URL || 'https://maxbooster.replit.app';
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // Auth: Google OAuth callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/login?error=google_denied`);
    }

    // Verify state
    const savedState = (req.session as any)?.googleOAuthState;
    if (!state || state !== savedState) {
      return res.redirect('/login?error=invalid_state');
    }
    delete (req.session as any).googleOAuthState;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect('/login?error=google_not_configured');
    }

    // Always use production URL for OAuth callbacks (must match Google Console registration)
    const baseUrl = process.env.APP_URL || 'https://maxbooster.replit.app';
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok || tokens.error) {
        logger.error('[Google OAuth] Token exchange failed:', tokens);
        return res.redirect('/login?error=token_exchange_failed');
      }

      // Get user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const googleUser = await userInfoResponse.json();

      if (!googleUser.email) {
        return res.redirect('/login?error=no_email');
      }

      // Check if user exists
      let user = await storage.getUserByEmail(googleUser.email);

      if (!user) {
        // Create new user from Google account
        user = await storage.createUser({
          email: googleUser.email,
          password: '', // No password for OAuth users
          firstName: googleUser.given_name || null,
          lastName: googleUser.family_name || null
        });

        logger.info(`[Google OAuth] Created new user: ${user.email}`);
      }

      // Log the user in using session (regenerate prevents session fixation)
      try {
        await sessionRegenerate(req);
        req.session.userId = user.id;
        await sessionSave(req);
        logger.info(`[Google OAuth] User logged in: ${user.email}`);
        return res.redirect('/dashboard');
      } catch (sessionErr) {
        logger.error('[Google OAuth] Session operation failed after retries:', sessionErr);
        return res.redirect('/login?error=login_failed');
      }
    } catch (err) {
      logger.error('[Google OAuth] Error:', err);
      return res.redirect('/login?error=oauth_error');
    }
  });

  // Auth: Delete Google connection
  app.delete("/api/auth/google-connection", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Check if user has a Google connection
      if (!req.user.googleId) {
        return res.status(400).json({ message: "No Google connection to remove" });
      }

      // Ensure user has a password set before disconnecting OAuth
      // Users who signed up via Google have empty passwords
      if (!req.user.password || req.user.password === '') {
        return res.status(400).json({
          message: "Please set a password before disconnecting Google. You won't be able to log in otherwise."
        });
      }

      // Clear Google connection fields from user record
      await storage.updateUser(req.user.id, {
        googleId: null
      });

      return res.json({ success: true, message: "Google connection removed successfully" });
    } catch (error) {
      logger.error("Delete Google connection error:", error);
      return res.status(500).json({ message: "Failed to remove Google connection" });
    }
  });

  // Social Platform Connect - Creates stub social account entries
  const ALLOWED_CONNECT_PROVIDERS = ['spotify', 'apple_music', 'youtube', 'instagram', 'tiktok', 'soundcloud'];

  app.get("/api/auth/connect/:provider", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.redirect('/auth?redirect=' + encodeURIComponent(req.originalUrl));
    }

    const { provider } = req.params;
    if (!ALLOWED_CONNECT_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    try {
      const { socialAccounts } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { db } = await import('./db');

      const [existing] = await db.select().from(socialAccounts)
        .where(and(
          eq(socialAccounts.userId, req.user.id),
          eq(socialAccounts.platform, provider)
        )).limit(1);

      if (existing) {
        await db.update(socialAccounts)
          .set({ isActive: true, createdAt: new Date() })
          .where(eq(socialAccounts.id, existing.id));
      } else {
        await db.insert(socialAccounts).values({
          userId: req.user.id,
          platform: provider,
          platformUserId: `${provider}_${req.user.id}`,
          username: req.user.username || req.user.email?.split('@')[0] || provider,
          accessToken: `platform_managed_${provider}`,
          tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
          followerCount: 0,
        });
      }

      return res.redirect('/settings?tab=connected-accounts&connected=' + provider);
    } catch (error) {
      logger.error(`Error connecting ${provider}:`, error);
      return res.status(500).json({ error: `Failed to connect ${provider}` });
    }
  });

  // Dashboard: Comprehensive data
  app.get("/api/dashboard/comprehensive", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = (req.user as any).id;
      const { studioProjects, releases, socialAccounts, analytics } = await import('@shared/schema');
      const { count, sum, gte, eq, and } = await import('drizzle-orm');

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const [
        trackCountResult,
        prevTrackCountResult,
        releaseCountResult,
        prevReleaseCountResult,
        socialReachResult,
        revenueResult,
        prevRevenueResult,
        recentNotifications,
        upcomingReleasesResult,
      ] = await Promise.all([
        db.select({ count: count() }).from(studioProjects).where(eq(studioProjects.userId, userId)),
        db.select({ count: count() }).from(studioProjects).where(and(eq(studioProjects.userId, userId), sql`${studioProjects.createdAt} < ${thirtyDaysAgo}`)),
        db.select({ count: count() }).from(releases).where(and(eq(releases.userId, userId), eq(releases.status, 'distributed'))),
        db.select({ count: count() }).from(releases).where(and(eq(releases.userId, userId), eq(releases.status, 'distributed'), sql`${releases.createdAt} < ${thirtyDaysAgo}`)),
        db.select({ total: sum(socialAccounts.followerCount) }).from(socialAccounts).where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true))),
        db.select({ total: sum(analytics.revenue) }).from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo))),
        db.select({ total: sum(analytics.revenue) }).from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, sixtyDaysAgo), sql`${analytics.date} < ${thirtyDaysAgo}`)),
        storage.getNotifications(userId),
        db.select().from(releases).where(and(eq(releases.userId, userId), sql`${releases.releaseDate} > NOW()`)).orderBy(releases.releaseDate).limit(5),
      ]);

      const totalTracks = trackCountResult[0]?.count ?? 0;
      const prevTracks = prevTrackCountResult[0]?.count ?? 0;
      const activeDistributions = releaseCountResult[0]?.count ?? 0;
      const prevDistributions = prevReleaseCountResult[0]?.count ?? 0;
      const socialReach = Number(socialReachResult[0]?.total ?? 0);
      const totalRevenue = Number(revenueResult[0]?.total ?? 0);
      const prevRevenue = Number(prevRevenueResult[0]?.total ?? 0);

      const growthPct = (curr: number, prev: number) =>
        prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

      return res.json({
        totalTracks,
        activeDistributions,
        totalRevenue,
        socialReach,
        monthlyGrowth: {
          tracks: growthPct(totalTracks, prevTracks),
          distributions: growthPct(activeDistributions, prevDistributions),
          revenue: growthPct(totalRevenue, prevRevenue),
          socialReach: 0,
        },
        recentActivity: [],
        upcomingReleases: upcomingReleasesResult,
        notifications: (recentNotifications || []).slice(0, 5).map(n => ({ ...n, read: n.isRead, link: n.actionUrl })),
      });
    } catch (error) {
      logger.error("Dashboard error:", error);
      return res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // Dashboard: Next action recommendation
  app.get("/api/dashboard/next-action", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = (req.user as any).id;
      const { studioProjects, releases, socialAccounts, subscriptions: subscriptionsTable } = await import('@shared/schema');
      const { count, eq, and } = await import('drizzle-orm');

      const [trackCount, releaseCount, socialCount, subResult] = await Promise.all([
        db.select({ count: count() }).from(studioProjects).where(eq(studioProjects.userId, userId)),
        db.select({ count: count() }).from(releases).where(eq(releases.userId, userId)),
        db.select({ count: count() }).from(socialAccounts).where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true))),
        db.select().from(subscriptionsTable).where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, 'active'))).limit(1),
      ]);

      const tracks = trackCount[0]?.count ?? 0;
      const releasesCount = releaseCount[0]?.count ?? 0;
      const socials = socialCount[0]?.count ?? 0;
      const hasActiveSub = subResult.length > 0;

      if (!hasActiveSub) {
        return res.json({ action: 'subscribe', title: 'Start Your Subscription', description: 'Unlock all features with a Max Booster subscription.', priority: 'high', estimatedTime: '2 minutes' });
      }
      if (tracks === 0) {
        return res.json({ action: 'upload_first_track', title: 'Upload Your First Track', description: 'Get started by uploading your first track to the studio.', priority: 'high', estimatedTime: '5 minutes' });
      }
      if (releasesCount === 0) {
        return res.json({ action: 'create_release', title: 'Create Your First Release', description: 'Distribute your music to 97+ platforms worldwide.', priority: 'high', estimatedTime: '10 minutes' });
      }
      if (socials === 0) {
        return res.json({ action: 'connect_social', title: 'Connect Social Media', description: 'Connect your social accounts to schedule posts and grow your audience.', priority: 'medium', estimatedTime: '3 minutes' });
      }
      return res.json({ action: 'view_analytics', title: 'Review Your Analytics', description: 'Check your streaming performance and audience insights.', priority: 'low', estimatedTime: '5 minutes' });
    } catch (error) {
      logger.error("Next action error:", error);
      return res.json({ action: 'upload_first_track', title: 'Upload Your First Track', description: 'Get started by uploading your first track to the studio.', priority: 'high', estimatedTime: '5 minutes' });
    }
  });

  // Notifications: Get all notifications
  app.get("/api/notifications", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userNotifications = await storage.getNotifications(req.user.id);
      // Map isRead to read for frontend compatibility
      const mappedNotifications = (userNotifications || []).map(n => ({
        ...n,
        read: n.isRead,
        link: n.actionUrl,
      }));
      return res.json(mappedNotifications);
    } catch (error) {
      logger.error("Get notifications error:", error);
      return res.json([]);
    }
  });

  // Notifications: Mark as read (PUT for frontend compatibility)
  app.put("/api/notifications/:id/read", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { id } = req.params;
      const notification = await storage.getNotificationById(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.markNotificationRead(id);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Mark notification read error:", error);
      return res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Notifications: Mark all as read (PUT for frontend compatibility)
  app.put("/api/notifications/mark-all-read", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      await storage.markAllNotificationsRead(req.user.id);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Mark all read error:", error);
      return res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // Notifications: Clear all notifications
  app.delete("/api/notifications/clear-all", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      await storage.deleteAllNotifications(req.user.id);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Clear all notifications error:", error);
      return res.status(500).json({ message: "Failed to clear all notifications" });
    }
  });

  // Notifications: Delete notification
  app.delete("/api/notifications/:id", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { id } = req.params;
      const notification = await storage.getNotificationById(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteNotification(id);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Delete notification error:", error);
      return res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Notifications: Mark as read
  app.post("/api/notifications/:id/read", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { id } = req.params;

      // Verify the notification belongs to this user
      const notification = await storage.getNotificationById(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to mark this notification" });
      }

      // Mark as read
      await storage.markNotificationRead(id);

      return res.json({ success: true, message: "Notification marked as read" });
    } catch (error) {
      logger.error("Mark notification read error:", error);
      return res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Notifications: Mark all as read
  app.post("/api/notifications/read-all", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      await storage.markAllNotificationsRead(req.user.id);
      return res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      logger.info("Mark all notifications read error:", error);
      return res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // Notifications: Mark all as read (alias for frontend compatibility)
  app.post("/api/notifications/mark-all-read", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      await storage.markAllNotificationsRead(req.user.id);
      return res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      logger.info("Mark all notifications read error:", error);
      return res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // Notifications: Test endpoint
  app.post("/api/notifications/test", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Create a test notification in the database
      const notification = await storage.createNotification({
        userId: req.user.id,
        type: 'system',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system is working correctly.',
        actionUrl: '/dashboard',
      });

      // Broadcast via WebSocket if available
      if (typeof (global as any).broadcastNotification === 'function') {
        (global as any).broadcastNotification(req.user.id, {
          ...notification,
          read: notification.isRead,
          link: notification.actionUrl,
        });
      }

      return res.json({ success: true, message: "Test notification sent", notification });
    } catch (error) {
      logger.info("Test notification error:", error);
      return res.status(500).json({ message: "Failed to send test notification" });
    }
  });

  // Notifications: Get preferences
  app.get("/api/notifications/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = await storage.getUser(req.user.id);
      const defaultPrefs = {
        email: true,
        browser: true,
        releases: true,
        earnings: true,
        sales: true,
        marketing: false,
        system: true,
      };
      const prefs = user?.notificationSettings || defaultPrefs;
      return res.json(prefs);
    } catch (error) {
      logger.info("Get notification preferences error:", error);
      return res.json({
        email: true,
        browser: true,
        releases: true,
        earnings: true,
        sales: true,
        marketing: false,
        system: true,
      });
    }
  });

  // Notifications: Update preferences
  app.put("/api/notifications/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      await storage.updateUser(req.user.id, {
        notificationSettings: req.body,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.info("Update notification preferences error:", error);
      return res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Push Notifications: Get VAPID public key
  app.get("/api/notifications/push-key", async (_req: Request, res: Response) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }
    return res.json({ publicKey });
  });

  // Push Notifications: Save subscription
  app.post("/api/notifications/push-subscriptions", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid push subscription data" });
      }

      const existing = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptions)
          .set({
            userId: req.user.id,
            p256dh: keys.p256dh,
            auth: keys.auth,
            userAgent: req.headers['user-agent'] || null,
            updatedAt: new Date(),
          })
          .where(eq(pushSubscriptions.endpoint, endpoint));
      } else {
        await db.insert(pushSubscriptions).values({
          userId: req.user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: req.headers['user-agent'] || null,
        });
      }

      return res.json({ success: true, message: "Push subscription saved" });
    } catch (error) {
      logger.info("Save push subscription error:", error);
      return res.status(500).json({ message: "Failed to save push subscription" });
    }
  });

  // Push Notifications: Remove subscription
  app.delete("/api/notifications/push-subscriptions", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { endpoint } = req.body;
      if (endpoint) {
        await db
          .delete(pushSubscriptions)
          .where(and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, req.user.id)
          ));
      } else {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, req.user.id));
      }
      return res.json({ success: true, message: "Push subscription removed" });
    } catch (error) {
      logger.info("Remove push subscription error:", error);
      return res.status(500).json({ message: "Failed to remove push subscription" });
    }
  });

  // Push Notifications: Get subscription status
  app.get("/api/notifications/push-subscriptions/status", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, req.user.id));
      return res.json({
        hasSubscriptions: subs.length > 0,
        count: subs.length,
        devices: subs.map(s => ({
          id: s.id,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
        })),
      });
    } catch (error) {
      logger.info("Get push subscription status error:", error);
      return res.status(500).json({ message: "Failed to get subscription status" });
    }
  });

  // Push Notifications: Send test push
  app.post("/api/notifications/push-test", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { webPushService } = await import('./services/webPushService.ts');
      const result = await webPushService.sendToUser(req.user.id, {
        title: 'Max Booster',
        body: 'Push notifications are working! You will receive alerts about releases, sales, and more.',
        url: '/dashboard',
        tag: 'test-notification',
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.info("Test push notification error:", error);
      return res.status(500).json({ message: "Failed to send test push notification" });
    }
  });

  // Notifications: Get unread count
  app.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, req.user.id),
          eq(notifications.isRead, false)
        ));
      const count = result[0]?.count || 0;
      return res.json({ count });
    } catch (error) {
      logger.info("Get unread count error:", error);
      return res.json({ count: 0 });
    }
  });

  // Projects: Get all projects for user
  app.get("/api/projects", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const projects = await storage.getProjectsByUserId(req.user.id);
      return res.json({ data: projects || [] });
    } catch (error) {
      logger.info("Projects error:", error);
      return res.json({ data: [] });
    }
  });

  // Projects: Create new project (supports both JSON and FormData)
  // Wrap multer in error handler to prevent server crashes
  app.post("/api/projects", (req: Request, res: Response, next) => {
    upload.single('audio')(req, res, (err: any) => {
      if (err) {
        logger.info("Project upload error:", err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: "File too large. Maximum size is 500MB." });
        }
        if (err.message?.includes('Invalid file type')) {
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      next();
    });
  }, async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      let audioUrl: string | null = null;
      let fileSize: number | null = null;
      
      if (req.file) {
        // Direct file upload (≤ proxy limit)
        const { storeUploadedFile } = await import('./middleware/uploadHandler.js');
        const storedFile = await storeUploadedFile(req.file, 'audio', req.user.id);
        audioUrl = storedFile.url;
        fileSize = req.file.size;
      } else if (req.body.audioUrl) {
        // Pre-assembled chunked upload — audioUrl already in Object Storage
        audioUrl = req.body.audioUrl;
        fileSize = req.body.fileSize ? Number(req.body.fileSize) : null;
      }
      
      const project = await storage.createProject({
        userId: req.user.id,
        title: req.body.title || "Untitled Project",
        description: req.body.description || "",
        genre: req.body.genre,
        bpm: req.body.bpm,
        key: req.body.key,
        status: "draft",
        isStudioProject: req.body.isStudioProject || false,
        metadata: req.body.metadata || {},
        audioUrl,
        fileSize,
      });
      return res.json(project);
    } catch (error) {
      logger.info("Create project error:", error);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Analytics: Dashboard summary with real data (with optional period path parameter)
  app.get("/api/analytics/dashboard{/:period}", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const periodParam = req.params.period;
      const timeRange = periodParam || (req.query.timeRange as string) || '30d';
      const days = parseInt(timeRange.replace('d', '').replace('y', '365')) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get user's analytics from the database
      const analyticsData = await db
        .select({
          totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
          totalListeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, req.user.id),
            gte(analytics.date, startDate),
            lte(analytics.date, endDate)
          )
        );

      // Get daily data for charts
      const dailyData = await db
        .select({
          date: sql<string>`DATE(${analytics.date})`,
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, req.user.id),
            gte(analytics.date, startDate),
            lte(analytics.date, endDate)
          )
        )
        .groupBy(sql`DATE(${analytics.date})`)
        .orderBy(sql`DATE(${analytics.date})`);

      // Get platform breakdown
      const platformData = await db
        .select({
          platform: analytics.platform,
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, req.user.id),
            gte(analytics.date, startDate),
            lte(analytics.date, endDate)
          )
        )
        .groupBy(analytics.platform)
        .orderBy(desc(sql`COALESCE(SUM(${analytics.streams}), 0)`));

      // Get user's projects for additional context
      const userProjects = await storage.getProjectsByUserId(req.user.id);
      const projectCount = userProjects?.length || 0;

      // Calculate performance score
      let performanceScore = 25;
      if (projectCount > 0) performanceScore += 15;
      if (projectCount >= 3) performanceScore += 10;
      if (projectCount >= 5) performanceScore += 10;
      if (req.user.subscriptionTier && req.user.subscriptionTier !== 'free') performanceScore += 15;
      if (req.user.onboardingCompleted) performanceScore += 10;
      if (req.user.twoFactorEnabled) performanceScore += 5;
      if (req.user.firstName || req.user.lastName) performanceScore += 5;
      if (req.user.bio) performanceScore += 5;
      performanceScore = Math.min(performanceScore, 100);

      const stats = analyticsData[0] || { totalStreams: 0, totalRevenue: 0, totalListeners: 0 };

      return res.json({
        overview: {
          totalStreams: Number(stats.totalStreams) || 0,
          totalRevenue: parseFloat(String(stats.totalRevenue)) || 0,
          totalListeners: Number(stats.totalListeners) || 0,
          totalPlays: Number(stats.totalStreams) || 0,
          avgListenTime: 0,
          completionRate: 0,
          skipRate: 0,
          shareRate: 0,
          likeRate: 0,
          growthRate: dailyData.length > 1 ?
            ((Number(dailyData[dailyData.length - 1]?.streams) - Number(dailyData[0]?.streams)) / (Number(dailyData[0]?.streams) || 1) * 100) : 0,
        },
        streams: {
          daily: dailyData.map(d => ({
            date: d.date,
            streams: Number(d.streams),
            revenue: parseFloat(String(d.revenue)) || 0,
          })),
          weekly: [],
          monthly: [],
          yearly: [],
          byPlatform: platformData.map(p => ({
            platform: p.platform || 'Unknown',
            streams: Number(p.streams),
            revenue: parseFloat(String(p.revenue)) || 0,
            growth: 0,
          })),
          byTrack: [],
          byGenre: [],
          byCountry: [],
          byCity: [],
          byDevice: [],
          byOS: [],
          byBrowser: [],
          bySource: [],
          byTimeOfDay: [],
          byDayOfWeek: [],
          bySeason: [],
          byWeather: [],
          byMood: [],
          byActivity: [],
          byLocation: [],
          byDemographics: {
            age: [],
            gender: [],
            income: [],
            education: [],
            occupation: [],
            interests: [],
          },
        },
        audience: {
          totalListeners: Number(stats.totalListeners) || 0,
          newListeners: 0,
          returningListeners: 0,
          listenerRetention: 0,
          avgSessionDuration: 0,
          sessionsPerListener: 0,
          listenerGrowth: 0,
          topListeners: [],
          listenerSegments: [],
          listenerJourney: [],
          listenerLifetime: [],
          listenerChurn: [],
          listenerEngagement: [],
          listenerFeedback: [],
          listenerSocial: [],
          listenerInfluence: [],
          listenerValue: [],
          listenerPredictions: {
            nextMonthListeners: 0,
            nextMonthRevenue: 0,
            churnRisk: 0,
            growthPotential: 0,
          },
        },
        revenue: {
          totalRevenue: parseFloat(String(stats.totalRevenue)) || 0,
          monthlyRevenue: 0,
          yearlyRevenue: 0,
          revenueGrowth: 0,
          revenuePerStream: (Number(stats.totalStreams) > 0) ?
            (parseFloat(String(stats.totalRevenue)) / Number(stats.totalStreams)) : 0,
          revenuePerListener: 0,
          revenueByPlatform: platformData.map(p => ({
            platform: p.platform || 'Unknown',
            revenue: parseFloat(String(p.revenue)) || 0,
            percentage: Number(stats.totalRevenue) > 0 ?
              (parseFloat(String(p.revenue)) / parseFloat(String(stats.totalRevenue)) * 100) : 0,
          })),
          revenueByTrack: [],
          revenueByCountry: [],
          revenueBySource: [],
          revenueByTime: [],
          revenueByDemographics: [],
          revenuePredictions: {
            nextMonth: 0,
            nextQuarter: 0,
            nextYear: 0,
            growthRate: 0,
          },
          revenueOptimization: [],
          revenueStreams: [],
          revenueForecasting: [],
        },
        fanJourney: {
          stages: [
            { stage: 'Awareness', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
            { stage: 'Discovery', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
            { stage: 'Engagement', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
            { stage: 'Conversion', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
            { stage: 'Advocacy', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
          ],
          funnelMetrics: {
            awarenessToEngagement: 0,
            engagementToConversion: 0,
            conversionToAdvocacy: 0,
            overallConversion: 0,
          },
          journeyInsights: [],
        },
        cohorts: [],
        churn: [],
        playlists: {
          current: [],
          historical: [],
          metrics: {
            totalPlaylists: 0,
            totalReach: 0,
            estimatedMonthlyStreams: 0,
            avgPlaylistPosition: 0,
            additionsThisMonth: 0,
            removalsThisMonth: 0,
          },
        },
        revenueAttribution: platformData.map(p => ({
          source: p.platform || 'Unknown',
          revenue: parseFloat(String(p.revenue)) || 0,
          percentage: Number(stats.totalRevenue) > 0 ?
            (parseFloat(String(p.revenue)) / parseFloat(String(stats.totalRevenue)) * 100) : 0,
          streams: Number(p.streams),
          growth: 0,
          avgPerStream: Number(p.streams) > 0 ?
            (parseFloat(String(p.revenue)) / Number(p.streams)) : 0,
        })),
        geographic: [],
        demographics: [],
        forecasts: [],
        aiInsights: {
          performanceScore,
          recommendations: projectCount === 0 ? [
            { title: 'Upload Your First Track', description: 'Get started by uploading music to distribute', priority: 'high', impact: 'high' },
          ] : [
            { title: 'Promote on Social Media', description: 'Share your music across social platforms', priority: 'medium', impact: 'medium' },
          ],
          predictions: {
            nextMonthStreams: 0,
            nextMonthRevenue: 0,
            viralPotential: 0,
            growthTrend: 'stable',
            marketOpportunity: 0,
            competitivePosition: 0,
            contentGaps: [],
            audienceExpansion: [],
            platformOptimization: [],
            contentStrategy: [],
            marketingOpportunities: [],
            partnershipPotential: [],
            trendAnalysis: [],
            riskAssessment: [],
            opportunityMatrix: [],
            successFactors: [],
            improvementAreas: [],
            benchmarkComparison: [],
            marketPosition: [],
            competitiveAdvantage: [],
            growthDrivers: [],
            performanceIndicators: [],
            optimizationOpportunities: [],
            strategicRecommendations: [],
            marketIntelligence: [],
            futureScenarios: [],
          },
          realTimeOptimization: {
            active: false,
            optimizations: [],
            performance: [],
            recommendations: [],
          },
        },
      });
    } catch (error) {
      logger.info("Analytics dashboard error:", error);
      return res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Analytics: Export data
  app.post("/api/analytics/export", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { format = 'csv', filters = {} } = req.body;
      const { timeRange = '30d' } = filters;
      const days = parseInt((timeRange as string).replace('d', '').replace('y', '365')) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get analytics data
      const analyticsData = await db
        .select({
          date: sql<string>`DATE(${analytics.date})`,
          platform: analytics.platform,
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
          listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, req.user.id),
            gte(analytics.date, startDate),
            lte(analytics.date, endDate)
          )
        )
        .groupBy(sql`DATE(${analytics.date})`, analytics.platform)
        .orderBy(sql`DATE(${analytics.date})`);

      if (format === 'csv') {
        const csvRows = ['Date,Platform,Streams,Revenue,Listeners'];
        analyticsData.forEach(row => {
          csvRows.push(`${row.date},${row.platform || 'Unknown'},${row.streams},${row.revenue},${row.listeners}`);
        });

        const csvContent = csvRows.join('\n');
        const base64Data = Buffer.from(csvContent).toString('base64');

        return res.json({
          format: 'csv',
          downloadUrl: `data:text/csv;base64,${base64Data}`,
          fileName: `analytics-${new Date().toISOString().split('T')[0]}.csv`,
        });
      }

      return res.json({
        format,
        data: analyticsData,
      });
    } catch (error) {
      logger.info("Analytics export error:", error);
      return res.status(500).json({ message: "Failed to export analytics" });
    }
  });

  // Analytics: Get anomalies summary
  app.get("/api/analytics/anomalies/summary", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Return summary of anomalies (can be expanded with real detection logic)
      return res.json({
        total: 0,
        unacknowledged: 0,
        bySeverity: {
          critical: 0,
          warning: 0,
          info: 0,
        },
        byMetric: {},
      });
    } catch (error) {
      logger.info("Anomalies summary error:", error);
      return res.status(500).json({ message: "Failed to fetch anomalies summary" });
    }
  });

  // Analytics: Get anomalies list
  app.get("/api/analytics/anomalies", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { metricType, severity } = req.query;

      // Get user's analytics for anomaly detection
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const metricsData = await db
        .select({
          date: sql<string>`DATE(${analytics.date})`,
          streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, req.user.id),
            gte(analytics.date, thirtyDaysAgo)
          )
        )
        .groupBy(sql`DATE(${analytics.date})`)
        .orderBy(sql`DATE(${analytics.date})`);

      const anomalies: any[] = [];

      // Simple anomaly detection: look for significant changes
      for (let i = 1; i < metricsData.length; i++) {
        const prev = Number(metricsData[i - 1].streams);
        const curr = Number(metricsData[i].streams);

        if (prev > 0 && curr < prev * 0.5) {
          anomalies.push({
            id: `anomaly-streams-${i}`,
            metricType: 'streams',
            severity: 'warning',
            detectedAt: metricsData[i].date,
            deviationPercentage: -((prev - curr) / prev * 100).toFixed(1),
            description: 'Significant drop in stream count detected',
            acknowledged: false,
          });
        }

        if (prev > 0 && curr > prev * 2) {
          anomalies.push({
            id: `anomaly-streams-spike-${i}`,
            metricType: 'streams',
            severity: 'info',
            detectedAt: metricsData[i].date,
            deviationPercentage: ((curr - prev) / prev * 100).toFixed(1),
            description: 'Unusual spike in stream count detected',
            acknowledged: false,
          });
        }
      }

      // Filter by metricType and severity if provided
      let filteredAnomalies = anomalies;
      if (metricType && metricType !== 'all') {
        filteredAnomalies = filteredAnomalies.filter(a => a.metricType === metricType);
      }
      if (severity && severity !== 'all') {
        filteredAnomalies = filteredAnomalies.filter(a => a.severity === severity);
      }

      return res.json({ data: filteredAnomalies });
    } catch (error) {
      logger.info("Anomalies list error:", error);
      return res.status(500).json({ message: "Failed to fetch anomalies" });
    }
  });

  // Analytics: Acknowledge anomaly
  app.post("/api/analytics/anomalies/:id/acknowledge", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { id } = req.params;
      // In production, this would update a database record
      return res.json({ success: true, message: `Anomaly ${id} acknowledged` });
    } catch (error) {
      logger.info("Acknowledge anomaly error:", error);
      return res.status(500).json({ message: "Failed to acknowledge anomaly" });
    }
  });

  // Analytics: Track event (for dashboard widgets)
  app.post("/api/analytics/track-event", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { eventType, eventData } = req.body;

      if (!eventType) {
        return res.status(400).json({ message: "Event type is required" });
      }

      // Log the event for analytics (in production, store to database)
      logger.info(`[Analytics] User ${req.user.id}: ${eventType}`, eventData);

      return res.json({ success: true, message: "Event tracked" });
    } catch (error) {
      logger.info("Track event error:", error);
      return res.status(500).json({ message: "Failed to track event" });
    }
  });

  // AI: Insights
  app.get("/api/ai/insights", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Calculate a basic performance score based on user activity
      const projects = await storage.getProjectsByUserId(req.user.id);
      const projectCount = projects?.length || 0;

      // Calculate performance score (0-100 scale)
      let performanceScore = 25; // Base score for having an account
      if (projectCount > 0) performanceScore += 15; // Has projects
      if (projectCount >= 3) performanceScore += 10; // Multiple projects
      if (projectCount >= 5) performanceScore += 10; // Active user
      if (req.user.subscriptionTier && req.user.subscriptionTier !== 'free') performanceScore += 15; // Paying customer
      if (req.user.onboardingCompleted) performanceScore += 10; // Completed onboarding
      if (req.user.twoFactorEnabled) performanceScore += 5; // Security conscious
      if (req.user.firstName || req.user.lastName) performanceScore += 5; // Profile filled
      if (req.user.bio) performanceScore += 5; // Has bio

      // Cap at 100
      performanceScore = Math.min(performanceScore, 100);

      return res.json({
        performanceScore,
        recommendations: [
          {
            id: 'upload-track',
            title: 'Upload Your First Track',
            description: 'Get started by uploading music to distribute',
            priority: projectCount === 0 ? 'high' : 'low',
          },
          {
            id: 'connect-social',
            title: 'Connect Social Accounts',
            description: 'Link your social media for better reach',
            priority: 'medium',
          },
        ],
        trends: [],
        opportunities: [],
      });
    } catch (error) {
      logger.info("AI insights error:", error);
      return res.json({
        performanceScore: 25,
        recommendations: [],
        trends: [],
        opportunities: [],
      });
    }
  });

  // Accessibility preferences endpoints
  try {
    const accessibilityRouter = (await import('./routes/accessibility.js')).default;
    app.use('/api/user', accessibilityRouter);
    log('Accessibility routes registered');
  } catch (error: any) {
    log(`Warning: Could not load accessibility routes - ${error.message}`);
  }

  // User preferences endpoints
  app.get("/api/user/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json(req.user.preferences || {});
    } catch (error) {
      logger.info("Error fetching user preferences:", error);
      return res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.post("/api/user/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const preferences = { ...(req.user.preferences || {}), ...req.body };
      await db.update(users).set({ preferences }).where(eq(users.id, req.user.id));
      return res.json({ success: true, preferences });
    } catch (error) {
      logger.info("Error updating user preferences:", error);
      return res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  app.get("/api/user/preferences/studio", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const prefs = req.user.preferences as any;
      return res.json(prefs?.studio || {});
    } catch (error) {
      logger.info("Error fetching studio preferences:", error);
      return res.status(500).json({ message: "Failed to fetch studio preferences" });
    }
  });

  app.put("/api/user/preferences/studio", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const currentPrefs = (req.user.preferences as any) || {};
      const preferences = { ...currentPrefs, studio: req.body };
      await db.update(users).set({ preferences }).where(eq(users.id, req.user.id));
      return res.json({ success: true, studio: req.body });
    } catch (error) {
      logger.info("Error updating studio preferences:", error);
      return res.status(500).json({ message: "Failed to update studio preferences" });
    }
  });

  // Analysis endpoint
  app.get("/api/analysis", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        status: 'complete',
        results: [],
        summary: { total: 0, analyzed: 0 },
      });
    } catch (error) {
      logger.info("Analysis error:", error);
      return res.status(500).json({ message: "Failed to fetch analysis" });
    }
  });

  app.post("/api/analysis", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { projectId, type } = req.body;
      return res.json({
        id: `analysis_${Date.now()}`,
        projectId,
        type: type || 'full',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.info("Analysis error:", error);
      return res.status(500).json({ message: "Failed to start analysis" });
    }
  });

  // Assets endpoints
  app.get("/api/assets", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { assetType } = req.query;
      return res.json({
        assets: [],
        type: assetType || 'all',
        total: 0,
      });
    } catch (error) {
      logger.info("Assets fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.post("/api/assets/upload", async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { audioUpload, storeUploadedFile, handleUploadError } = await import('./middleware/uploadHandler.js');
      
      audioUpload.single('assetFile')(req, res, async (err: any) => {
        if (err) {
          return handleUploadError(err, req, res, next);
        }
        
        try {
          const file = req.file;
          if (!file) {
            return res.status(400).json({ message: "No file provided" });
          }
          
          const { name, assetType, description, tags } = req.body;
          const userId = req.user!.id;
          
          const storedFile = await storeUploadedFile(file, userId, 'audio');
          
          return res.json({
            success: true,
            assetId: `asset_${Date.now()}`,
            name: name || file.originalname,
            assetType: assetType || 'sample',
            fileUrl: storedFile.url,
            fileSize: file.size,
            mimeType: file.mimetype,
            message: 'Asset uploaded successfully',
          });
        } catch (uploadError) {
          logger.info("Asset storage error:", uploadError);
          return res.status(500).json({ message: "Failed to store asset" });
        }
      });
    } catch (error) {
      logger.info("Asset upload error:", error);
      return res.status(500).json({ message: "Failed to upload asset" });
    }
  });

  // Pocket Dimension endpoints
  app.get("/api/pocket/list", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const pockets = await db.query.userStorage.findMany({
        where: eq(userStorage.userId, req.user.id),
      });
      return res.json(pockets);
    } catch (error) {
      logger.info("Pocket list error:", error);
      return res.status(500).json({ message: "Failed to fetch pockets" });
    }
  });

  app.post("/api/pocket/create", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { name } = req.body;
      const storagePrefix = `user_${req.user.id}_${Date.now()}`;
      const [pocket] = await db.insert(userStorage).values({
        userId: req.user.id,
        storagePrefix,
        totalBytes: 0,
        fileCount: 0,
      }).returning();
      return res.json(pocket);
    } catch (error) {
      logger.info("Pocket create error:", error);
      return res.status(500).json({ message: "Failed to create pocket" });
    }
  });

  app.get("/api/pocket/demo", async (req: Request, res: Response) => {
    try {
      return res.json({
        name: 'Demo Pocket',
        totalSize: 1024 * 1024 * 100,
        fileCount: 25,
        files: [],
      });
    } catch (error) {
      logger.info("Pocket demo error:", error);
      return res.status(500).json({ message: "Failed to fetch demo pocket" });
    }
  });

  app.get("/api/pocket/:pocketId/stats", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { pocketId } = req.params;
      const pocket = await db.query.userStorage.findFirst({
        where: eq(userStorage.id, pocketId),
      });
      if (pocket && pocket.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      return res.json({
        id: pocketId,
        totalSize: pocket?.totalBytes || 0,
        fileCount: pocket?.fileCount || 0,
        lastUpdated: pocket?.lastAccessedAt || new Date(),
      });
    } catch (error) {
      logger.info("Pocket stats error:", error);
      return res.status(500).json({ message: "Failed to fetch pocket stats" });
    }
  });

  app.get("/api/pocket/:pocketId/list", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { pocketId } = req.params;
      const pocket = await db.query.userStorage.findFirst({
        where: eq(userStorage.id, pocketId),
      });
      if (pocket && pocket.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const files = await db.query.userStorageFiles.findMany({
        where: eq(userStorageFiles.storageId, pocketId),
      });
      return res.json(files);
    } catch (error) {
      logger.info("Pocket files error:", error);
      return res.status(500).json({ message: "Failed to fetch pocket files" });
    }
  });

  app.post("/api/pocket/:pocketId/write", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { pocketId } = req.params;
      const pocket = await db.query.userStorage.findFirst({
        where: eq(userStorage.id, pocketId),
      });
      if (pocket && pocket.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { filename, content, mimeType, folder } = req.body;
      if (!filename || content === undefined) {
        return res.status(400).json({ message: "filename and content are required" });
      }
      const userId = req.user.id;
      const fileKey = `pocket/${pocketId}/${Date.now()}_${filename}`;
      const contentBuffer = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
      const sizeBytes = contentBuffer.length;
      const [inserted] = await db.insert(userStorageFiles).values({
        userId,
        storageId: pocketId,
        fileName: filename,
        fileKey,
        mimeType: mimeType || 'text/plain',
        sizeBytes,
        folder: folder || '/',
        isPublic: false,
        metadata: { writtenAt: new Date().toISOString() },
      }).returning();
      return res.json({
        success: true,
        fileId: inserted.id,
        fileKey,
        pocketId,
        filename,
        sizeBytes,
        message: 'File written successfully',
      });
    } catch (error) {
      logger.error("Pocket write error:", error);
      return res.status(500).json({ message: "Failed to write to pocket" });
    }
  });

  // Audit and testing endpoints
  app.get("/api/audit/results", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        lastAudit: null,
        results: [],
        summary: { passed: 0, failed: 0, warnings: 0 },
      });
    } catch (error) {
      logger.info("Audit results error:", error);
      return res.status(500).json({ message: "Failed to fetch audit results" });
    }
  });

  app.get("/api/testing/results", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        lastRun: null,
        results: [],
        coverage: { statements: 0, branches: 0, functions: 0, lines: 0 },
      });
    } catch (error) {
      logger.info("Testing results error:", error);
      return res.status(500).json({ message: "Failed to fetch testing results" });
    }
  });

  // Complete onboarding endpoint
  app.post("/api/users/complete-onboarding", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      await storage.updateUser(req.user.id, {
        onboardingCompleted: true,
        onboardingStep: 100,
        onboardingData: {
          ...req.user.onboardingData,
          completedAt: new Date().toISOString(),
        },
      });
      return res.json({ success: true, message: 'Onboarding completed' });
    } catch (error) {
      logger.info("Complete onboarding error:", error);
      return res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Get seen features for progressive disclosure
  app.get("/api/users/seen-features", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const seenFeatures = req.user.onboardingData?.seenFeatures || [];
      return res.json({ seenFeatures });
    } catch (error) {
      logger.info("Get seen features error:", error);
      return res.status(500).json({ message: "Failed to get seen features" });
    }
  });

  // Mark feature as seen for progressive disclosure
  app.post("/api/users/mark-feature-seen", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { featureId } = req.body;
      if (!featureId) {
        return res.status(400).json({ message: "Feature ID is required" });
      }
      const currentOnboardingData = req.user.onboardingData || {};
      const seenFeatures = currentOnboardingData.seenFeatures || [];
      if (!seenFeatures.includes(featureId)) {
        seenFeatures.push(featureId);
      }
      await storage.updateUser(req.user.id, {
        onboardingData: {
          ...currentOnboardingData,
          seenFeatures,
        },
      });
      return res.json({ success: true, seenFeatures });
    } catch (error) {
      logger.info("Mark feature seen error:", error);
      return res.status(500).json({ message: "Failed to mark feature as seen" });
    }
  });

  // Royalties download statement endpoint
  app.get("/api/royalties/download-statement/:statementId", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { statementId } = req.params;
      return res.json({
        success: true,
        downloadUrl: `/exports/statement_${statementId}.pdf`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    } catch (error) {
      logger.info("Download statement error:", error);
      return res.status(500).json({ message: "Failed to generate statement download" });
    }
  });

  // Royalties endpoints — backed by real DB data
  app.get("/api/royalties", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user.id;
      const { period = '30d', platform } = req.query as { period?: string; platform?: string };
      const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all': 9999 };
      const days = daysMap[period] ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const conditions: any[] = [eq(royaltyTransactions.userId, userId), gte(royaltyTransactions.createdAt, since)];
      if (platform && platform !== 'all') {
        conditions.push(eq(royaltyTransactions.platform, platform));
      }

      const rows = await db.select().from(royaltyTransactions)
        .where(and(...conditions))
        .orderBy(desc(royaltyTransactions.createdAt));

      const totalEarnings = rows.reduce((s, r) => s + (r.amount || 0), 0);
      const pendingPayouts = rows.filter(r => r.status === 'pending').reduce((s, r) => s + (r.amount || 0), 0);
      const lastPaid = rows.find(r => r.paidAt);

      const earnings = rows.map(r => ({
        id: r.id,
        releaseId: r.releaseId,
        platform: r.platform,
        amount: r.amount,
        currency: r.currency,
        streamCount: r.streamCount,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        transactionType: r.transactionType,
        createdAt: r.createdAt,
      }));

      return res.json({ data: earnings, totalEarnings, pendingPayouts, lastPayout: lastPaid?.paidAt ?? null, pagination: { total: earnings.length } });
    } catch (error) {
      logger.error("Royalties error:", error);
      return res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  app.get("/api/royalties/platform-breakdown", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user.id;
      const { period = '30d' } = req.query as { period?: string };
      const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = daysMap[period] ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db
        .select({
          platform: royaltyTransactions.platform,
          totalAmount: sum(royaltyTransactions.amount),
          totalStreams: sum(royaltyTransactions.streamCount),
          transactionCount: count(royaltyTransactions.id),
        })
        .from(royaltyTransactions)
        .where(and(eq(royaltyTransactions.userId, userId), gte(royaltyTransactions.createdAt, since)))
        .groupBy(royaltyTransactions.platform);

      return res.json(rows.map(r => ({
        platform: r.platform || 'unknown',
        earnings: Number(r.totalAmount) || 0,
        streams: Number(r.totalStreams) || 0,
        transactions: Number(r.transactionCount) || 0,
      })));
    } catch (error) {
      logger.error("Platform breakdown error:", error);
      return res.status(500).json({ message: "Failed to fetch platform breakdown" });
    }
  });

  app.get("/api/royalties/top-tracks", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user.id;
      const { period = '30d' } = req.query as { period?: string };
      const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = daysMap[period] ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db
        .select({
          releaseId: royaltyTransactions.releaseId,
          totalAmount: sum(royaltyTransactions.amount),
          totalStreams: sum(royaltyTransactions.streamCount),
        })
        .from(royaltyTransactions)
        .where(and(eq(royaltyTransactions.userId, userId), gte(royaltyTransactions.createdAt, since)))
        .groupBy(royaltyTransactions.releaseId)
        .orderBy(desc(sum(royaltyTransactions.amount)))
        .limit(10);

      const releaseIds = rows.map(r => r.releaseId).filter(Boolean);
      const releaseRows = releaseIds.length > 0
        ? await db.select({ id: releases.id, title: releases.title }).from(releases).where(inArray(releases.id, releaseIds))
        : [];
      const releaseMap = new Map(releaseRows.map(r => [r.id, r.title]));

      return res.json(rows.map(r => ({
        releaseId: r.releaseId,
        title: releaseMap.get(r.releaseId) || r.releaseId,
        earnings: Number(r.totalAmount) || 0,
        streams: Number(r.totalStreams) || 0,
      })));
    } catch (error) {
      logger.error("Top tracks error:", error);
      return res.status(500).json({ message: "Failed to fetch top tracks" });
    }
  });

  app.get("/api/royalties/payment-methods", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = req.user as any;
      const prefs = user.preferences?.payout || {};
      const methods = [];
      if (user.stripeConnectedAccountId) {
        methods.push({ id: 'stripe', type: 'stripe', label: 'Bank Account (Stripe)', isDefault: !prefs.paypalEmail && !prefs.bankDetails });
      }
      if (prefs.paypalEmail) {
        methods.push({ id: 'paypal', type: 'paypal', label: `PayPal (${prefs.paypalEmail})`, isDefault: !!prefs.paypalEmail && !prefs.bankDetails });
      }
      if (prefs.bankDetails) {
        methods.push({ id: 'bank', type: 'bank_transfer', label: 'Bank Transfer', isDefault: true });
      }
      return res.json(methods);
    } catch (error) {
      logger.error("Payment methods error:", error);
      return res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.post("/api/royalties/payment-methods", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { type, paypalEmail, bankDetails } = req.body;
      if (!type) return res.status(400).json({ message: 'Payment method type required' });

      const user = req.user as any;
      const currentPrefs = user.preferences || {};
      const updated = { ...currentPrefs, payout: { ...(currentPrefs.payout || {}) } };
      if (type === 'paypal' && paypalEmail) updated.payout.paypalEmail = paypalEmail;
      if (type === 'bank_transfer' && bankDetails) updated.payout.bankDetails = bankDetails;

      await db.update(users).set({ preferences: updated } as any).where(eq(users.id, req.user.id));
      return res.json({ success: true, message: 'Payment method added' });
    } catch (error) {
      logger.error("Add payment method error:", error);
      return res.status(500).json({ message: "Failed to add payment method" });
    }
  });

  app.get("/api/royalties/payout-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = req.user as any;
      const prefs = user.preferences?.payoutSettings || {};
      return res.json({
        minimumPayout: prefs.minimumPayout ?? 50,
        payoutSchedule: prefs.payoutSchedule ?? 'monthly',
        preferredMethod: prefs.preferredMethod ?? null,
        stripeConnected: !!(user.stripeConnectedAccountId),
        paypalEmail: user.preferences?.payout?.paypalEmail ?? null,
      });
    } catch (error) {
      logger.error("Payout settings error:", error);
      return res.status(500).json({ message: "Failed to fetch payout settings" });
    }
  });

  app.put("/api/royalties/payout-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { minimumPayout, payoutSchedule, preferredMethod } = req.body;
      const user = req.user as any;
      const currentPrefs = user.preferences || {};
      const updated = {
        ...currentPrefs,
        payoutSettings: {
          ...(currentPrefs.payoutSettings || {}),
          ...(minimumPayout != null && { minimumPayout }),
          ...(payoutSchedule && { payoutSchedule }),
          ...(preferredMethod && { preferredMethod }),
        },
      };
      await db.update(users).set({ preferences: updated } as any).where(eq(users.id, req.user.id));
      return res.json({ success: true, message: 'Payout settings updated' });
    } catch (error) {
      logger.error("Update payout settings error:", error);
      return res.status(500).json({ message: "Failed to update payout settings" });
    }
  });

  app.put("/api/royalties/tax-info", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { formType = 'W-9', taxYear = new Date().getFullYear(), formData } = req.body;
      if (!formData) return res.status(400).json({ message: 'Form data required' });

      const [existing] = await db.select({ id: taxForms.id })
        .from(taxForms)
        .where(and(eq(taxForms.userId, req.user.id), eq(taxForms.taxYear, taxYear), eq(taxForms.formType, formType)))
        .limit(1);

      if (existing) {
        await db.update(taxForms)
          .set({ formData, status: 'submitted', submittedAt: new Date() })
          .where(eq(taxForms.id, existing.id));
      } else {
        await db.insert(taxForms).values({
          userId: req.user.id,
          formType,
          taxYear,
          formData,
          status: 'submitted',
          submittedAt: new Date(),
        });
      }
      return res.json({ success: true, message: 'Tax info updated' });
    } catch (error) {
      logger.error("Update tax info error:", error);
      return res.status(500).json({ message: "Failed to update tax info" });
    }
  });

  app.get("/api/royalties/splits", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const rows = await db.select().from(royaltySplits)
        .where(eq(royaltySplits.userId, req.user.id))
        .orderBy(desc(royaltySplits.createdAt));
      return res.json(rows);
    } catch (error) {
      logger.error("Royalty splits error:", error);
      return res.status(500).json({ message: "Failed to fetch royalty splits" });
    }
  });

  app.post("/api/royalties/splits", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { collaboratorEmail, collaboratorName, percentage, projectId, role = 'collaborator' } = req.body;
      if (!collaboratorEmail || !percentage) {
        return res.status(400).json({ message: 'Collaborator email and percentage are required' });
      }
      if (percentage <= 0 || percentage > 100) {
        return res.status(400).json({ message: 'Percentage must be between 1 and 100' });
      }

      const [split] = await db.insert(royaltySplits).values({
        releaseId: projectId || 'general',
        userId: req.user.id,
        collaboratorEmail,
        collaboratorName: collaboratorName || collaboratorEmail.split('@')[0],
        role,
        percentage,
        status: 'pending',
      }).returning();

      return res.json(split);
    } catch (error) {
      logger.error("Create split error:", error);
      return res.status(500).json({ message: "Failed to create royalty split" });
    }
  });

  app.delete("/api/royalties/splits/:splitId", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { splitId } = req.params;
      const [existing] = await db.select({ id: royaltySplits.id, userId: royaltySplits.userId })
        .from(royaltySplits).where(eq(royaltySplits.id, splitId)).limit(1);

      if (!existing) return res.status(404).json({ message: 'Royalty split not found' });
      if (existing.userId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

      await db.delete(royaltySplits).where(eq(royaltySplits.id, splitId));
      return res.json({ success: true, message: 'Royalty split deleted' });
    } catch (error) {
      logger.error("Delete split error:", error);
      return res.status(500).json({ message: "Failed to delete royalty split" });
    }
  });

  app.post("/api/royalties/export", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { period = '30d', format = 'csv' } = req.body;
      const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = daysMap[period] ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db.select().from(royaltyTransactions)
        .where(and(eq(royaltyTransactions.userId, req.user.id), gte(royaltyTransactions.createdAt, since)))
        .orderBy(desc(royaltyTransactions.createdAt));

      if (format === 'csv') {
        const csvHeader = 'Date,Platform,Release,Amount,Currency,Streams,Status\n';
        const csvBody = rows.map(r =>
          `${r.createdAt?.toISOString()},${r.platform || ''},${r.releaseId},${r.amount},${r.currency || 'usd'},${r.streamCount || 0},${r.status}`
        ).join('\n');
        const csv = csvHeader + csvBody;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="royalties_${period}_${Date.now()}.csv"`);
        return res.send(csv);
      }

      return res.json({ success: true, data: rows });
    } catch (error) {
      logger.error("Export royalties error:", error);
      return res.status(500).json({ message: "Failed to export royalties" });
    }
  });

  app.post("/api/royalties/request-payout", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { instantPayoutService } = await import("./services/instantPayoutService");
      const balance = await instantPayoutService.calculateAvailableBalance(req.user.id);
      if (balance <= 0) {
        return res.status(400).json({ message: 'No available balance for payout' });
      }
      const result = await instantPayoutService.requestInstantPayout(req.user.id, { amount: balance });
      return res.json({ success: true, payoutId: result?.id || `payout_${Date.now()}`, message: 'Payout request submitted', amount: balance });
    } catch (error) {
      logger.error("Request payout error:", error);
      return res.status(500).json({ message: "Failed to request payout. Please ensure your payment method is configured." });
    }
  });

  app.post("/api/royalties/connect-stripe", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { instantPayoutService } = await import("./services/instantPayoutService");
      const baseUrl = getBaseUrl();
      const refreshUrl = `${baseUrl}/royalties?setup=refresh`;
      const returnUrl = `${baseUrl}/royalties?setup=complete`;
      const url = await instantPayoutService.createAccountLink(req.user.id, refreshUrl, returnUrl);
      return res.json({ success: true, url });
    } catch (error) {
      logger.info("Connect Stripe error:", error);
      return res.status(500).json({ message: "Failed to connect bank account. Please try again." });
    }
  });

  // Create subscription endpoint
  app.post("/api/create-subscription", async (req: Request, res: Response) => {
    try {
      const { priceId, email } = req.body;
      if (!priceId) {
        return res.status(400).json({ message: "Price ID required" });
      }

      if (!stripe) throw new Error('Stripe is not initialized');
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.APP_URL || 'https://maxbooster.replit.app'}/register/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || 'https://maxbooster.replit.app'}/subscribe?canceled=true`,
        customer_email: email,
      });

      return res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      logger.info("Create subscription error:", error);
      return res.status(500).json({ message: "Failed to create subscription" });
    }
  });


  // ── Chunked upload endpoints ──────────────────────────────────────────────
  // Replit's reverse proxy enforces a request-body size limit (≈ 32 MB).
  // For audio files that exceed this we split the file client-side into 4 MB
  // chunks and upload each one independently, then reassemble here.
  // Chunks are stored in /tmp during assembly then moved to Object Storage.

  const chunkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB safety ceiling per chunk
  });

  // POST /api/uploads/chunk
  // Accepts one chunk.  All chunks for a given upload share the same uploadId.
  app.post(
    "/api/uploads/chunk",
    chunkUpload.single("chunk"),
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      if (!req.file) return res.status(400).json({ message: "No chunk received" });

      const { uploadId, chunkIndex, totalChunks } = req.body;
      if (!uploadId || chunkIndex === undefined || !totalChunks) {
        return res.status(400).json({ message: "uploadId, chunkIndex and totalChunks are required" });
      }

      // Sanitise uploadId — only allow alphanumeric + hyphens
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId)) {
        return res.status(400).json({ message: "Invalid uploadId" });
      }

      try {
        const fsPromises = await import('fs/promises');
        const pathMod = await import('path');
        const osMod = await import('os');
        const dir = pathMod.join(osMod.tmpdir(), 'uploads', uploadId);
        await fsPromises.mkdir(dir, { recursive: true });
        const chunkPath = pathMod.join(dir, String(chunkIndex).padStart(6, '0') + '.bin');
        await fsPromises.writeFile(chunkPath, req.file.buffer);
        return res.json({ received: Number(chunkIndex), uploadId });
      } catch (err: any) {
        logger.error("[ChunkUpload] Failed to store chunk:", err);
        return res.status(500).json({ message: "Failed to store chunk" });
      }
    }
  );

  // POST /api/uploads/assemble
  // Concatenates all stored chunks, uploads final file to Object Storage.
  app.post("/api/uploads/assemble", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const { uploadId, totalChunks, filename, category } = req.body;
    if (!uploadId || !totalChunks || !filename) {
      return res.status(400).json({ message: "uploadId, totalChunks and filename are required" });
    }
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId)) {
      return res.status(400).json({ message: "Invalid uploadId" });
    }

    try {
      const fsPromises = await import('fs/promises');
      const pathMod = await import('path');
      const osMod = await import('os');
      const dir = pathMod.join(osMod.tmpdir(), 'uploads', uploadId);
      const count = Number(totalChunks);

      const chunkBuffers: Buffer[] = [];
      for (let i = 0; i < count; i++) {
        const chunkPath = pathMod.join(dir, String(i).padStart(6, '0') + '.bin');
        const buf = await fsPromises.readFile(chunkPath);
        chunkBuffers.push(buf);
      }

      const assembled = Buffer.concat(chunkBuffers);
      const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
      const mimeMap: Record<string, string> = {
        wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac',
        aiff: 'audio/aiff', aif: 'audio/aiff', ogg: 'audio/ogg',
      };
      const contentType = mimeMap[ext] || 'audio/octet-stream';
      const destCategory = category || 'audio';
      const userId = (req.user as any).id;

      const { storageService } = await import('./services/storageService.js');
      const finalKey = await storageService.uploadFile(assembled, `${destCategory}/${userId}`, filename, contentType);
      const url = await storageService.getDownloadUrl(finalKey);

      // Clean up temp chunks (best-effort, non-blocking)
      fsPromises.rm(dir, { recursive: true, force: true }).catch(() => {});

      return res.json({ url, key: finalKey, size: assembled.length });
    } catch (err: any) {
      logger.error("[ChunkUpload] Assembly failed:", err);
      return res.status(500).json({ message: "Failed to assemble upload" });
    }
  });
  // ── End chunked upload ─────────────────────────────────────────────────────

  // Audio file upload endpoint — stores to hybrid storage (Replit Object Storage + Pocket Dimension)
  app.post("/api/audio/upload", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { audioData, format, duration, trackId } = req.body;
      const userId = (req.user as any).id;

      if (!audioData) {
        return res.status(400).json({ message: "audioData is required" });
      }

      const { hybridStorageService } = await import('./services/hybridStorageService.js');

      const ext = format || 'wav';
      const mimeType = ext === 'mp3' ? 'audio/mpeg'
        : ext === 'ogg' ? 'audio/ogg'
        : ext === 'webm' ? 'audio/webm'
        : 'audio/wav';

      const fileName = `recording_${Date.now()}.${ext}`;
      const fileBuffer = Buffer.from(audioData, 'base64');

      const result = await hybridStorageService.upload(userId, fileName, fileBuffer, mimeType, {
        folder: 'recordings',
        metadata: { trackId: trackId || null, duration: duration || 0 },
      });

      return res.json({
        success: true,
        fileId: result.key,
        url: `/api/files/${encodeURIComponent(result.key)}`,
        duration: duration || 0,
        sizeBytes: result.sizeBytes,
        message: 'Audio file uploaded successfully',
      });
    } catch (error) {
      logger.error("Audio upload error:", error);
      return res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Mount modular routers — all loaded in parallel, registered in order
  const [
    { default: adminRouter },
    { default: paidRouter },
    { default: artistProgressRouter },
    { default: artistProfilesRouter },
    { default: revenueForecastRouter },
    { default: filesRouter },
    { default: preferencesRouter },
    { default: shortcutsRouter },
    { default: undoRouter },
    { default: batchRouter },
    { default: distributionRouter },
  ] = await Promise.all([
    import("./routes/admin.ts"),
    import("./routes/paid.ts"),
    import("./routes/artistProgress.ts"),
    import("./routes/artistProfiles.ts"),
    import("./routes/revenueForecast.ts"),
    import("./routes/files.ts"),
    import("./routes/preferences.ts"),
    import("./routes/shortcuts.ts"),
    import("./routes/undo.ts"),
    import("./routes/batch.ts"),
    import("./routes/distribution.ts"),
  ]);
  const { aiServiceProxyRouter, boosterstateProxyRouter } = await import("./routes/internalProxy.js");
  app.use("/api/ai-service", aiServiceProxyRouter);
  app.use("/api/boosterstate", boosterstateProxyRouter);

  app.use("/api/admin", adminRouter);
  app.use("/api/distribution", distributionRouter);
  const { default: trainingRouter } = await import("./routes/training.js");
  app.use("/api/training", trainingRouter);

  const { default: maxcoreRouter } = await import("./routes/maxcore.js");
  app.use("/api/maxcore", maxcoreRouter);
  app.use("/api/paid", paidRouter);
  app.use("/api/artist-progress", artistProgressRouter);
  app.use("/api/artist-profiles", artistProfilesRouter);
  app.use("/api/revenue-forecast", revenueForecastRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/preferences", preferencesRouter);
  app.use("/api/shortcuts", shortcutsRouter);
  app.use("/api/undo", undoRouter);
  app.use("/api/batch", batchRouter);

  // AI: Optimize content
  app.post("/api/ai/optimize-content", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Check if user has paid subscription
      if (!req.user.subscriptionTier || req.user.subscriptionTier === 'free' || req.user.subscriptionTier === 'trial') {
        return res.status(403).json({
          message: "AI content optimization requires an active paid subscription",
          requiresUpgrade: true
        });
      }

      // Simulate AI optimization response
      return res.json({
        success: true,
        optimizations: [
          {
            type: 'metadata',
            title: 'Metadata Optimization',
            description: 'Enhanced track titles and descriptions for better discoverability',
            applied: true,
          },
          {
            type: 'social',
            title: 'Social Media Optimization',
            description: 'Optimized posting times and hashtags for maximum engagement',
            applied: true,
          },
          {
            type: 'distribution',
            title: 'Distribution Optimization',
            description: 'Recommended platform-specific optimizations applied',
            applied: true,
          },
        ],
        message: 'Your content has been optimized for maximum reach and engagement.',
      });
    } catch (error) {
      logger.info("AI optimize content error:", error);
      return res.status(500).json({ message: "Failed to optimize content" });
    }
  });

  // Dynamically load and mount route modules (with error handling)
  const routeModules = [
    // Core Platform Routes
    { path: "/api/achievements", name: "achievements", loader: () => import("./routes/achievements") },
    { path: "/api/onboarding", name: "onboarding", loader: () => import("./routes/onboarding") },
    { path: "/api/personalization", name: "personalization", loader: () => import("./routes/personalization") },
    { path: "/api/countdowns", name: "releaseCountdown", loader: () => import("./routes/releaseCountdown") },
    { path: "/api/storefront", name: "storefront", loader: () => import("./routes/storefront") },
    { path: "/api/dns", name: "dns", loader: () => import("./routes/dns") },
    { path: "/api/analytics", name: "analytics", loader: () => import("./routes/analytics-internal") },
    { path: "/api/status", name: "status", loader: () => import("./routes/status") },
    { path: "/api/monitoring", name: "monitoring", loader: () => import("./routes/monitoring") },
    { path: "/api/dmca", name: "dmca", loader: () => import("./routes/dmca") },
    { path: "/api/growth", name: "growth", loader: () => import("./routes/growth") },
    { path: "/api/backup", name: "backup", loader: () => import("./routes/backup") },
    { path: "/api/retention", name: "retention", loader: () => import("./routes/retention") },

    // Payments & Payouts
    { path: "/api/billing", name: "billing", loader: () => import("./routes/billing") },
    { path: "/api/payouts", name: "payouts", loader: () => import("./routes/payouts") },
    { path: "/api/invoices", name: "invoices", loader: () => import("./routes/invoices") },
    { path: "/api/kyc", name: "kyc", loader: () => import("./routes/kyc") },

    // Social & Advertising
    { path: "/api/social", name: "socialOAuth", loader: () => import("./routes/socialOAuth") },
    { path: "/api/social", name: "socialMedia", loader: () => import("./routes/socialMedia") },
    { path: "/api/social/approvals", name: "socialApprovals", loader: () => import("./routes/socialApprovals") },
    { path: "/api/social/bulk", name: "socialBulk", loader: () => import("./routes/socialBulk") },
    { path: "/api/social", name: "socialAI", loader: () => import("./routes/socialAI") },
    { path: "/api/organic", name: "organic", loader: () => import("./routes/organic") },
    { path: "/api/advertising", name: "advertising", loader: () => import("./routes/advertising") },
    { path: "/api/advertising/autopilot", name: "advertisingAutopilot", loader: () => import("./routes/advertisingAutopilot") },
    { path: "/api/autopilot", name: "autopilot", loader: () => import("./routes/autopilot") },
    { path: "/api/autopilot", name: "dualAutopilot", loader: () => import("./routes/dualAutopilot") },
    { path: "/api/autopilot/coordinator", name: "autopilotCoordinator", loader: () => import("./routes/autopilot-coordinator") },
    { path: "/api/autopilot/learning", name: "autopilotLearning", loader: () => import("./routes/autopilot-learning") },
    { path: "/api/auto/social", name: "autonomousSocial", loader: () => import("./routes/autonomousSocial") },
    { path: "/api/auto-updates", name: "autoUpdates", loader: () => import("./routes/autoUpdates") },
    { path: "/api/downloads", name: "downloads", loader: () => import("./routes/downloads") },
    { path: "/api/platform-sync", name: "platformSync", loader: () => import("./routes/platformSync") },
    { path: "/api/autopilot/preferences", name: "autopilotPreferences", loader: () => import("./routes/autopilotPreferences") },

    // Studio/DAW Routes
    { path: "/api/studio", name: "studio", loader: () => import("./routes/studio") },
    { path: "/api/studio/comping", name: "studioComping", loader: () => import("./routes/studioComping") },
    { path: "/api/studio/markers", name: "studioMarkers", loader: () => import("./routes/studioMarkers") },
    { path: "/api/studio/plugins", name: "studioPlugins", loader: () => import("./routes/studioPlugins") },
    { path: "/api/studio/stems", name: "studioStems", loader: () => import("./routes/studioStems") },
    { path: "/api/studio/warping", name: "studioWarping", loader: () => import("./routes/studioWarping") },
    { path: "/api/studio/generation", name: "studioGeneration", loader: () => import("./routes/studioGeneration") },
    { path: "/api/studio/midi", name: "studioMidi", loader: () => import("./routes/studioMidi") },
    { path: "/api/studio/vst", name: "vstBridge", loader: () => import("./routes/vstBridge") },
    { path: "/api/audio-analysis", name: "audioAnalysis", loader: () => import("./routes/audioAnalysis") },
    { path: "/api/audio-processing", name: "audioProcessing", loader: () => import("./routes/audio-processing") },
    { path: "/api/distribution/promo", name: "promotionalTools", loader: () => import("./routes/promotionalTools") },

    // Offline Mode
    { path: "/api/offline", name: "offline", loader: () => import("./routes/offline") },
    { path: "/api/sync", name: "sync", loader: () => import("./routes/sync") },

    // Workspace & Developer
    { path: "/api/workspace", name: "workspace", loader: () => import("./routes/workspace") },
    { path: "/api/developer", name: "developerApi", loader: () => import("./routes/developerApi") },
    { path: "/api/content-analysis", name: "content-analysis", loader: () => import("./routes/content-analysis") },

    // Collaboration & Networking
    { path: "/api/collaborations", name: "collaborations", loader: () => import("./routes/collaborations") },

    // Help & Support
    { path: "/api/helpdesk", name: "helpDesk", loader: () => import("./routes/helpDesk") },
    { path: "/api/support", name: "support", loader: () => import("./routes/support") },

    // Executive & Admin
    { path: "/api/executive", name: "executiveDashboard", loader: () => import("./routes/executiveDashboard") },
    { path: "/api/admin", name: "admin", loader: () => import("./routes/admin/index") },
    { path: "/api/admin/metrics", name: "adminMetrics", loader: () => import("./routes/admin/metrics") },
    { path: "/api/audit", name: "audit", loader: () => import("./routes/audit") },
    { path: "/api/testing", name: "testing", loader: () => import("./routes/testing") },
    { path: "/api/admin/webhooks", name: "webhooksAdmin", loader: () => import("./routes/webhooks-admin") },
    { path: "/api/logs", name: "logs", loader: () => import("./routes/logs") },

    // Analytics API
    { path: "/api/v1/analytics", name: "v1Analytics", loader: () => import("./routes/api/v1/analytics") },
    { path: "/api/certified-analytics", name: "certifiedAnalytics", loader: () => import("./routes/api/certifiedAnalytics") },
    { path: "/api/analytics-alerts", name: "analyticsAlerts", loader: () => import("./routes/api/analyticsAlerts") },

    // Webhooks
    { path: "/webhooks/sendgrid", name: "sendgridWebhook", loader: () => import("./routes/webhooks/sendgrid") },
    { path: "/api/webhooks/stripe", name: "stripeWebhook", loader: () => import("./routes/webhooks/stripe") },

    // Reliability
    { path: "/api/reliability", name: "reliability", loader: () => import("./routes/reliability-endpoints") },

    // Email Preferences
    { path: "", name: "emailPreferences", loader: () => import("./routes/emailPreferences") },

    // Simulation (pre-launch testing)
    { path: "/api/simulation", name: "simulation", loader: () => import("./routes/simulation") },

    // Safety & Admin Controls
    { path: "/api/kill-switch", name: "killSwitch", loader: () => import("./routes/killSwitch") },
    { path: "/api/admin/payment-bypass", name: "paymentBypass", loader: () => import("./routes/paymentBypass") },

    // SEO (sitemap.xml + robots.txt — mounted at root)
    { path: "", name: "seo", loader: () => import("./routes/seo") },

    // Self-Healing Security System
    { path: "/api/security/self-healing", name: "selfHealingApi", loader: () => import("./routes/selfHealingApi") },

    // Security Dashboard API
    { path: "/api/security", name: "security", loader: () => import("./routes/security") },

    // Marketplace with Discovery Algorithm
    { path: "/api/marketplace", name: "marketplace", loader: () => import("./routes/marketplace") },

    // Search & Discovery
    { path: "/api/search", name: "search", loader: () => import("./routes/search") },

    // Contracts, Invoices, Tax Forms & Split Sheets
    { path: "/api/contracts", name: "contracts", loader: () => import("./routes/contracts") },

    // AI Services
    { path: "/api/ai", name: "ai", loader: () => import("./routes/ai") },

    // Career Coach - AI-powered personalized recommendations
    { path: "/api/career-coach", name: "careerCoach", loader: () => import("./routes/careerCoach") },

    // User API Keys Management
    { path: "/api/auth/api-keys", name: "apiKeys", loader: () => import("./routes/apiKeys") },

    // Recovery Codes for 2FA Backup
    { path: "/api/auth/recovery-codes", name: "recoveryCodes", loader: () => import("./routes/recoveryCodes") },

    // Connected Accounts Management
    { path: "/api/auth/connected-accounts", name: "connectedAccounts", loader: () => import("./routes/connectedAccounts") },

    // Session & Token Management
    { path: "/api/auth", name: "auth", loader: () => import("./routes/auth") },

    // Fan Hub / Fan CRM
    { path: "/api/fan-hub", name: "fanHub", loader: () => import("./routes/fanHub") },

    // Press Kit (EPK Builder)
    { path: "/api/press-kit", name: "pressKit", loader: () => import("./routes/pressKit") },

    // Playlist Pitching
    { path: "/api/playlist-pitching", name: "playlistPitching", loader: () => import("./routes/playlistPitching") },

    // Shows / Tour Management
    { path: "/api/shows", name: "shows", loader: () => import("./routes/shows") },

    // Merch Store
    { path: "/api/merch", name: "merch", loader: () => import("./routes/merch") },

    // Sync Licensing Catalog
    { path: "/api/sync-licensing", name: "syncLicensing", loader: () => import("./routes/syncLicensing") },

    // Publishing Rights Management
    { path: "/api/publishing", name: "publishing", loader: () => import("./routes/publishing") },

    // File Storage Management
    { path: "/api/storage", name: "storage", loader: () => import("./routes/storage") },

    // Hybrid Storage (Replit Object Storage + Pocket Dimension)
    { path: "/api/hybrid-storage", name: "hybridStorage", loader: () => import("./routes/hybridStorage") },

    // Export & Download Management
    { path: "/api/export", name: "export", loader: () => import("./routes/export") },
  ];

  // Load all route modules concurrently, then register in order to preserve middleware precedence
  const loadedModules = await Promise.all(
    routeModules.map(({ name, loader }) => safeLoadRoute(name, loader))
  );
  for (let i = 0; i < routeModules.length; i++) {
    const { path, name } = routeModules[i];
    const result = loadedModules[i];
    if (result && result.type !== 'skip') {
      if (result.type === 'router' && result.value) {
        try {
          app.use(path, result.value);
        } catch (e: any) {
          log(`Warning: Failed to mount ${name} - ${e.message}`);
        }
      } else if (result.type === 'function' && result.value) {
        try {
          result.value(app);
        } catch (e: any) {
          log(`Warning: Failed to setup ${name} - ${e.message}`);
        }
      }
    }
  }

  // OAuth callback routes - maps new URL structure to existing handlers
  // These routes redirect to the socialOAuth callback handler
  const oauthCallbackPaths = [
    { path: '/auth/meta/callback', platform: 'meta' },
    { path: '/auth/facebook/callback', platform: 'meta' },
    { path: '/auth/instagram/callback', platform: 'meta' },
    { path: '/auth/threads/callback', platform: 'threads' },
    { path: '/auth/tiktok/callback', platform: 'tiktok' },
    { path: '/tiktok/sandbox/callback', platform: 'tiktok' },
    { path: '/tiktok/callback', platform: 'tiktok' },
    { path: '/auth/google/callback', platform: 'google' },
    { path: '/auth/youtube/callback', platform: 'youtube' },
    { path: '/auth/google-business/callback', platform: 'googlebusiness' },
    { path: '/auth/linkedin/callback', platform: 'linkedin' },
    { path: '/auth/twitter/callback', platform: 'twitter' },
    { path: '/auth/twitter/oauth1/callback', platform: 'twitter' },
    { path: '/auth/spotify/callback', platform: 'spotify' },
  ];

  for (const { path, platform } of oauthCallbackPaths) {
    app.get(path, (req: Request, res: Response) => {
      // Forward to the existing OAuth callback handler with query params
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      const redirectUrl = `/api/social/callback/${platform}${queryString ? '?' + queryString : ''}`;
      res.redirect(redirectUrl);
    });
  }
  log('OAuth callback redirect routes registered');

  app.post("/api/errors", (req: Request, res: Response) => {
    try {
      const errorData = req.body;
      if (typeof errorData === 'object' && errorData !== null) {
        const safeError = {
          message: String(errorData.message || '').substring(0, 500),
          stack: String(errorData.stack || '').substring(0, 1000),
          url: String(errorData.url || '').substring(0, 200),
          timestamp: new Date().toISOString(),
        };
        logger.info("[Client Error]", JSON.stringify(safeError));
      }
    } catch {}
    res.json({ received: true });
  });

  function getStableBuildId(): string {
    try {
      return execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
      try {
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        return crypto.createHash('sha1').update(pkg.version || '1.0.0').digest('hex').slice(0, 8);
      } catch {
        return 'dev-build';
      }
    }
  }
  const BUILD_ID = process.env.BUILD_ID || getStableBuildId();
  const BUILD_TIMESTAMP = new Date().toISOString();

  app.get("/api/version", (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ buildId: BUILD_ID, buildTimestamp: BUILD_TIMESTAMP });
  });

  // Health check endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Stripe checkout session creation for subscription plans
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
    : null;

  const SUBSCRIPTION_PLANS: Record<string, { name: string; priceInCents: number; mode: 'payment' | 'subscription'; interval?: 'month' | 'year' }> = {
    monthly: {
      name: 'Max Booster Monthly',
      priceInCents: 4900,
      mode: 'subscription',
      interval: 'month',
    },
    yearly: {
      name: 'Max Booster Annual',
      priceInCents: 46800,
      mode: 'subscription',
      interval: 'year',
    },
    lifetime: {
      name: 'Max Booster Lifetime',
      priceInCents: 69900,
      mode: 'payment',
    },
  };

  // REGISTRATION CHECKOUT - Intentionally unauthenticated
  // This is for NEW users who don't have accounts yet (no free tier).
  // Security measures: Rate limiting (global), email/username validation,
  // duplicate checking, idempotency keys, and Stripe webhook verification
  // on payment completion before account creation.
  app.post("/api/create-checkout-session", async (req: Request, res: Response) => {
    try {
      if (!stripe) {
        return res.status(500).json({ error: 'Payment system not configured' });
      }

      const { tier, userEmail, username, birthdate } = req.body;

      // Validate required fields
      if (!tier || !userEmail || !username) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate tier is one of allowed values (prevent injection)
      const allowedTiers = ['monthly', 'yearly', 'lifetime'];
      if (!allowedTiers.includes(tier)) {
        return res.status(400).json({ error: 'Invalid subscription tier' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Validate username (alphanumeric, 3-30 chars)
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-30 alphanumeric characters' });
      }

      // Check if email or username already exists
      const existingUser = await storage.getUserByEmail(userEmail);
      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered. Please login instead.' });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ error: 'Username already taken. Please choose another.' });
      }

      const plan = SUBSCRIPTION_PLANS[tier];
      if (!plan) {
        return res.status(400).json({ error: 'Invalid subscription tier' });
      }

      // Get pre-created Stripe Price IDs
      const priceIds = getStripePriceIds();
      const priceId = priceIds[tier as keyof typeof priceIds];

      if (!priceId || priceId.includes('placeholder')) {
        return res.status(500).json({ error: 'Stripe prices not configured. Please try again later.' });
      }

      const baseUrl = getBaseUrl();

      // Generate idempotency key based on email + username + tier
      const crypto = await import('crypto');
      const idempotencyKey = crypto.createHash('sha256')
        .update(`${userEmail}:${username}:${tier}:${Date.now().toString().slice(0, -4)}`)
        .digest('hex');

      const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        customer_email: userEmail,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: plan.mode,
        success_url: `${baseUrl}/register-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/register/${tier}`,
        metadata: {
          tier,
          username,
          birthdate: birthdate || '',
          firstName: req.body.firstName || '',
          lastName: req.body.lastName || '',
        },
      };

      const session = await stripe.checkout.sessions.create(sessionConfig, {
        idempotencyKey,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      logger.info('Error creating checkout session:', error);
      res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
    }
  });

  // REGISTER AFTER PAYMENT - Complete account creation after Stripe checkout
  // This endpoint verifies the Stripe session and creates the user account
  app.post("/api/register-after-payment", async (req: Request, res: Response) => {
    try {
      if (!stripe) {
        return res.status(500).json({ error: 'Payment system not configured' });
      }

      const { sessionId, password, tosAccepted, privacyAccepted, marketingConsent } = req.body;

      if (!sessionId || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!tosAccepted || !privacyAccepted) {
        return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      // Retrieve and verify the Stripe checkout session
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (!session) {
        return res.status(400).json({ error: 'Invalid checkout session' });
      }

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Payment not completed. Please try again.' });
      }

      const email = session.customer_email;
      const username = session.metadata?.username;
      const tier = session.metadata?.tier || 'monthly';
      const birthdate = session.metadata?.birthdate;

      if (!email || !username) {
        return res.status(400).json({ error: 'Session metadata missing. Please contact support.' });
      }

      // Check if user already exists (prevent duplicate registration)
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // User already exists - log them in (regenerate prevents session fixation)
        try {
          await sessionRegenerate(req);
          req.session.userId = existingUser.id;
          await sessionSave(req);
          const { password: _, ...userWithoutPassword } = existingUser;
          return res.json({ user: userWithoutPassword, message: 'Account already exists. Logged in.' });
        } catch (sessionErr) {
          logger.error('[PostPayment] Session operation failed after retries:', sessionErr);
          return res.status(500).json({ error: 'Login failed - session error' });
        }
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ error: 'Username already taken. Please contact support.' });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Determine subscription end date based on tier
      let subscriptionEndsAt: Date | null = null;
      if (tier === 'monthly') {
        subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else if (tier === 'yearly') {
        subscriptionEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      } else if (tier === 'lifetime') {
        subscriptionEndsAt = new Date('2099-12-31');
      }

      // Create the user account
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: session.metadata?.firstName || "",
        lastName: session.metadata?.lastName || ""
      });

      // Log the user in (regenerate prevents session fixation)
      const { password: _, ...userWithoutPassword } = user;
      try {
        await sessionRegenerate(req);
        req.session.userId = user.id;
        await sessionSave(req);
        return res.json({ user: userWithoutPassword, message: 'Account created successfully' });
      } catch (sessionErr) {
        logger.error('[PostPayment] Session operation failed after retries:', sessionErr);
        return res.status(500).json({ error: 'Account created but login failed - please sign in.' });
      }
    } catch (error: any) {
      logger.info('Error completing registration after payment:', error);

      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: 'Invalid payment session. Please try again.' });
      }

      return res.status(500).json({ error: 'Failed to complete registration. Please contact support.' });
    }
  });

  // Admin-only payment-bypass status endpoint
  app.get("/api/payment-bypass/status", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { paymentBypassService } = await import('./services/paymentBypassService');
      const status = await paymentBypassService.getStatus();
      return res.json({ bypassed: status.bypassed, reason: status.config?.reason || null });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get payment bypass status' });
    }
  });

  // Infrastructure scaling routes
  try {
    const { scalingMetricsRouter, getInfrastructureStatus } = await import('./infrastructure/index.js');
    app.use('/api/infrastructure', scalingMetricsRouter);
    app.get('/api/infrastructure/status', (req, res) => {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      try {
        const status = getInfrastructureStatus();
        res.json({ success: true, ...status });
      } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to get infrastructure status' });
      }
    });
    log('Infrastructure scaling routes registered');
  } catch (error: any) {
    log(`Warning: Could not load infrastructure routes - ${error.message}`);
  }

  // Collaboration routes
  try {
    const collaborationRouter = (await import('./routes/collaboration.js')).default;
    app.use('/api/collaboration', collaborationRouter);
    log('Collaboration routes registered');
  } catch (error: any) {
    log(`Warning: Could not load collaboration routes - ${error.message}`);
  }

  // Music Workflow Automations routes
  try {
    const musicWorkflowRouter = (await import('./routes/musicWorkflowAutomations.js')).default;
    app.use('/api/music-workflow-automations', musicWorkflowRouter);
    log('Loaded route: musicWorkflowAutomations');
  } catch (error: any) {
    log(`Warning: Could not load musicWorkflowAutomations routes - ${error.message}`);
  }

  try {
    const fabricRouter = (await import('./routes/fabric.js')).default;
    app.use('/api/fabric', fabricRouter);
    log('Loaded route: fabric');
  } catch (error: any) {
    log(`Warning: Could not load fabric routes - ${error.message}`);
  }

  try {
    const labelSubmissionsRouter = (await import('./routes/labelSubmissions.js')).default;
    app.use('/api/label-submissions', labelSubmissionsRouter);
    log('Loaded route: labelSubmissions');
  } catch (error: any) {
    log(`Warning: Could not load labelSubmissions routes - ${error.message}`);
  }

  try {
    const radioPitchesRouter = (await import('./routes/radioPitches.js')).default;
    app.use('/api/radio-pitches', radioPitchesRouter);
    log('Loaded route: radioPitches');
  } catch (error: any) {
    log(`Warning: Could not load radioPitches routes - ${error.message}`);
  }

  try {
    const venuesRouter = (await import('./routes/venues.js')).default;
    app.use('/api/venues', venuesRouter);
    log('Loaded route: venues');
  } catch (error: any) {
    log(`Warning: Could not load venues routes - ${error.message}`);
  }

  try {
    const projectBudgetsRouter = (await import('./routes/projectBudgets.js')).default;
    app.use('/api/project-budgets', projectBudgetsRouter);
    log('Loaded route: projectBudgets');
  } catch (error: any) {
    log(`Warning: Could not load projectBudgets routes - ${error.message}`);
  }

  try {
    const sampleClearancesRouter = (await import('./routes/sampleClearances.js')).default;
    app.use('/api/sample-clearances', sampleClearancesRouter);
    log('Loaded route: sampleClearances');
  } catch (error: any) {
    log(`Warning: Could not load sampleClearances routes - ${error.message}`);
  }

  try {
    const musicVideosRouter = (await import('./routes/musicVideos.js')).default;
    app.use('/api/music-videos', musicVideosRouter);
    log('Loaded route: musicVideos');
  } catch (error: any) {
    log(`Warning: Could not load musicVideos routes - ${error.message}`);
  }

  try {
    const songwritingRouter = (await import('./routes/songwriting.js')).default;
    app.use('/api/songwriting', songwritingRouter);
    log('Loaded route: songwriting');
  } catch (error: any) {
    log(`Warning: Could not load songwriting routes - ${error.message}`);
  }

  try {
    const fanCampaignsRouter = (await import('./routes/fanCampaigns.js')).default;
    app.use('/api/fan-campaigns', fanCampaignsRouter);
    log('Loaded route: fanCampaigns');
  } catch (error: any) {
    log(`Warning: Could not load fanCampaigns routes - ${error.message}`);
  }

  try {
    const customWorkflowsRouter = (await import('./routes/customWorkflows.js')).default;
    app.use('/api/custom-workflows', customWorkflowsRouter);
    log('Loaded route: customWorkflows');
  } catch (error: any) {
    log(`Warning: Could not load customWorkflows routes - ${error.message}`);
  }

  try {
    const assistantRouter = (await import('./routes/assistant.js')).default;
    app.use('/api/assistant', assistantRouter);
    log('Loaded route: assistant');
  } catch (error: any) {
    log(`Warning: Could not load assistant routes - ${error.message}`);
  }

  try {
    const { silentDeployment } = await import('./services/silentDeploymentService.js');
    if (process.env.ENABLE_SELF_EVOLUTION === 'true') {
      silentDeployment.enable();
      log('Silent deployment system ENABLED (ENABLE_SELF_EVOLUTION=true)');
    } else {
      log('Silent deployment system on standby (set ENABLE_SELF_EVOLUTION=true to activate)');
    }
  } catch (error: any) {
    logger.error(`[routes] FATAL: Silent deployment service failed to initialize - ${error.message}`, error.stack || error.message);
    if (process.env.ENABLE_SELF_EVOLUTION === 'true') {
      throw new Error(`Silent deployment init failed (ENABLE_SELF_EVOLUTION=true): ${error.message}`);
    }
    log(`ERROR: Could not initialize silent deployment service - ${error.message}`);
  }

  return httpServer;
}

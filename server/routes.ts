import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import crypto from "crypto";
import { execSync } from "child_process";
import fs from "fs";
import { isProductionEnv } from "./lib/envHelpers.js";
import { storage } from "./storage.js";
import { db, pool } from "./db.js";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { analytics, userStorage, userStorageFiles, users, notifications, pushSubscriptions, royaltyTransactions, royaltySplits, taxForms, releases, royaltyStatements, projects, projectRoyaltySplits } from "../shared/schema.js";
import { sum, count, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { getCsrfToken } from "./middleware/csrf.js";
import { sessionAuthority } from "./services/sessionAuthority.js";
import accountErasureRouter from "./routes/accountErasure.js";
import { mfaLifecycle } from "./services/mfaLifecycle.js";
import { createMfaChallengeRouter } from "./routes/mfaChallenge.js";
import { factorRepository } from "./services/factorRepository.js";
import { getApplicationContainment } from "./services/securityContainment.js";
import { governanceBoundary } from "./middleware/governanceBoundary.js";
import { assertRegistrationEnabled } from "./services/governancePolicyService.js";
import { issueAdminApiToken, revokeAdminApiToken } from "./services/adminApiTokenService.js";
import { consumeTotp } from "./services/totpReplay.js";
import { requireUUIDParam } from "./middleware/requestValidation.js";
import Stripe from "stripe";
import { getStripePriceIds } from "./services/stripeSetup.js";
import {
  createSubscriptionCheckout,
  createSubscriptionCheckoutStore,
  SubscriptionCheckoutConflictError,
} from "./services/subscriptionCheckoutService.js";
import { getBaseUrl } from "./config/defaults.js";
import {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
} from "./middleware/rateLimiter.js";
import { criticalEndpointLimiter } from "./middleware/globalRateLimiter.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import {
  cacheMiddleware,
  invalidateCacheOnMutation,
} from "./middleware/apiCache.js";
import { blockDemoWrite } from "./auth.js";
import { requireAuth, requireAdmin, require2FA } from "./middleware/auth.js";

import { emailService } from "./services/emailService.js";
import { upload, createHardenedUpload } from "./middleware/uploadHandler.js";
import { logger } from "./logger.js";
import { achievementService } from "./services/achievementService.js";
import { notificationService } from "./services/notificationService.js";
import { jwtAuthService } from "./services/jwtAuthService.js";
import { artistProfileService } from "./services/artistProfileService.js";

const log = (msg: string) => logger.info(msg);

// Helper to safely load route modules.
// `module?.default` may be either an Express Router (has a `stack` array) or a
// setup function `(app) => void`. We narrow with a structural cast at each branch.
type LoadedModule = {
  default?: unknown;
  router?: unknown;
  setupReliabilityEndpoints?: unknown;
  stack?: unknown;
};
type RouterLike = ((...args: unknown[]) => unknown) & { stack: unknown };
type SetupFn = (...args: unknown[]) => unknown;

async function safeLoadRoute(
  name: string,
  importFn: () => Promise<LoadedModule>,
): Promise<{ type: "router" | "function" | "skip"; value: unknown } | null> {
  try {
    const mod = await importFn();

    // Check if module has a default export that's a router
    if (mod.default && typeof mod.default === "function") {
      const fn = mod.default as SetupFn;
      // Express routers carry a `stack` array.
      if ((fn as RouterLike).stack !== undefined) {
        log(`Loaded route: ${name}`);
        return { type: "router", value: fn };
      }
      // It's a setup function
      log(`Loaded route function: ${name}`);
      return { type: "function", value: fn };
    }

    // Check for named exports that are setup functions
    if (typeof mod?.setupReliabilityEndpoints === "function") {
      log(`Loaded route function: ${name}`);
      return { type: "function", value: mod.setupReliabilityEndpoints };
    }

    // Check if the module itself is a router
    if (mod?.stack !== undefined) {
      log(`Loaded route: ${name}`);
      return { type: "router", value: mod };
    }

    // Module doesn't export anything usable — this is a programming error, not a runtime condition
    logger.warn(
      `[routes] Route module '${name}' loaded successfully but exports no router or setup function — check the module's default export`,
    );
    log(`ERROR: ${name} has no usable export (router or setup function)`);
    return { type: "skip", value: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error?.message : String(error);
    const criticalRoutes = [
      "auth",
      "billing",
      "stripeWebhook",
      "admin",
      "security",
      "storage",
    ];
    if (criticalRoutes?.includes(name)) {
      log(`ERROR: Critical route '${name}' failed to load - ${message}`);
      logger.warn(
        { err: error },
        `[routes] CRITICAL route loading failure for '${name}'`,
      );
    } else {
      log(`Warning: Could not load ${name} - ${message}`);
    }
    logger.error({ err: error }, `[routes] LOAD FAILURE '${name}'`);
    return null;
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: import("../shared/schema.js").User;
      isAuthenticated(): this is Request & {
        user: import("../shared/schema.js").User;
      };
    }
  }
}

// Middleware to attach user to request
async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const isProduction = isProductionEnv();
  const isApiRoute = req.path.startsWith("/api/");

  if (req.session?.userId) {
    try {
      // Security state is read authoritatively; cross-pod factor changes must
      // not be hidden behind a process-local profile cache.
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = user;
      } else if (isProduction && isApiRoute) {
        logger.info(
          `[Session] User not found for userId: ${req.session.userId}, path: ${req.path}`,
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Error fetching user for request");
    }
  } else if (
    isProduction &&
    isApiRoute &&
    req.path !== "/api/auth/me" &&
    req.path !== "/api/csrf-token" &&
    req.path !== "/api/health" &&
    req.path !== "/api/version"
  ) {
    const sessionCookie =
      req.cookies?.sessionId || req.headers.cookie?.includes("sessionId");
    logger.info(
      `[Session] No userId in session for ${req.path}, cookie present: ${!!sessionCookie}, session exists: ${!!req.session}`,
    );
  }

  // Add isAuthenticated method
  if (req.user?.twoFactorEnabled &&
      (req.session as unknown as Record<string, unknown>).twoFactorVerified !== true) {
    delete req.user;
  }
  req.isAuthenticated = function (): this is Request & {
    user: import("../shared/schema.js").User;
  } {
    return !!this.user;
  };

  next();
}

// ── Session operation helpers (VM-reserved PDIM) ──────────────────────────────
// Retry session?.regenerate / session?.save up to 3× with short delays.
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
  app: Express,
): Promise<Server> {
  // Assign a unique request ID to every request for end-to-end tracing.
  // This populates AsyncLocalStorage so every logger.* call automatically
  // includes requestId and duration without any manual threading.
  app.use(requestIdMiddleware);

  // Apply user attachment middleware to all routes
  app.use(attachUser);
  app.use(getApplicationContainment().guard);
  app.use(governanceBoundary);

  // Demo-account write protection. MUST be mounted after attachUser: it
  // gates on req.user.email, and attachUser is the only middleware in the
  // app that populates req.user (session-based auth, no Passport). Mounting
  // this any earlier means req.user is always undefined here, so the gate's
  // `req.user?.email !== "demo@maxbooster.ai"` check is always true and it
  // silently allows every write, for every user — this previously happened
  // because it was mounted in index.ts before registerRoutes() ran.
  app.use("/api", blockDemoWrite);

  // Smart per-user API response caching (30 s TTL, ETag, stale-while-revalidate)
  // GET responses are cached per-user+path+query; any mutation clears that user's cache.
  app.use(
    cacheMiddleware({ ttlSeconds: 30, varyByUser: true, varyByQuery: true }),
  );
  app.use(invalidateCacheOnMutation());

  // Critical endpoint rate limiting — tighter per-IP limits for AI, billing, and admin routes
  // which are the most expensive per-request and most attractive DDoS/abuse targets
  app.use("/api/ai", criticalEndpointLimiter);
  app.use("/api/career-coach", criticalEndpointLimiter);
  app.use("/api/billing", criticalEndpointLimiter);
  app.use("/api/admin", criticalEndpointLimiter);
  app.use("/api/studio/generation", criticalEndpointLimiter);

  // CSRF Token endpoint
  app.get("/api/csrf-token", getCsrfToken);

  // Auth: Get current user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const isProduction = isProductionEnv();

    // Production debugging for session issues
    if (isProduction) {
      const hasCookie = !!req.headers.cookie?.includes("sessionId");
      const hasSession = !!req.session;
      const hasUserId = !!req.session?.userId;
      const sessionPrefix = req.session?.id?.substring(0, 8) ?? "none";

      logger.info({ hasSession, hasUserId, sessionPrefix }, "[Auth/me] Auth check");

      if (!req.user) {
        if (hasCookie && !hasUserId) {
          logger.info(
            "[Auth/me] Cookie present but no userId - session may have expired or Redis issue",
          );
        } else if (!hasCookie) {
          logger.info("[Auth/me] No sessionId cookie present in request");
        }
      }
    }

    if (req.user) {
      const {
        password,
        twoFactorSecret,
        passwordResetToken,
        emailVerificationToken,
        ...safeUser
      } = req.user!;
      if (safeUser.email === "demo@maxbooster.ai") {
        (safeUser as any).isDemo = true;
      }
      return res.json(safeUser);
    }
    return res.json(null);
  });

  // Auth: Register
  app.post(
    "/api/auth/register",
    registerRateLimiter,
    async (req: Request, res: Response) => {
      try {
        const { email, password, username, firstName, lastName, artistName } =
          req.body;

        if (!email || !password) {
          return res
            .status(400)
            .json({ message: "Email and password are required" });
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
          return res
            .status(400)
            .json({ message: "Password must be at least 8 characters long" });
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
            return res
              .status(400)
              .json({
                message: "Username must be 3-30 alphanumeric characters",
              });
          }

          const existingUsername = await storage.getUserByUsername(username);
          if (existingUsername) {
            return res.status(400).json({ message: "Username already taken" });
          }
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        let user;
        try {
          await assertRegistrationEnabled();
          user = await storage.createUser({
            email,
            password: hashedPassword,
            username: username || null,
            firstName: firstName || "",
            lastName: lastName || "",
          });
        } catch (createErr: unknown) {
          if (
            createErr instanceof Error &&
            (("code" in createErr && createErr.code === "23505") ||
              createErr.message.toLowerCase().includes("unique"))
          ) {
            return res
              .status(400)
              .json({ message: "Email already registered" });
          }
          throw createErr;
        }

        const {
          password: _,
          twoFactorSecret: _2fa,
          passwordResetToken: _prt,
          emailVerificationToken: _evt,
          ...safeUser
        } = user as Record<string, unknown>;

        try {
          await sessionRegenerate(req);
          req.session.userId = user.id;
          Object.assign(req.session, {
            authGeneration: await (await sessionAuthority()).issue(user.id),
            reauthenticatedAt: Date.now(), reauthenticatedUserId: user.id,
          });
          await sessionSave(req);
        } catch (sessionErr) {
          logger.warn(
            { err: sessionErr },
            "[Register] Session operation failed after retries",
          );
          return res
            .status(500)
            .json({ message: "Registration failed - session error" });
        }

        emailService
          .sendWelcomeEmail({
            firstName: firstName || username || "there",
            email,
          })
          .catch((err: unknown) =>
            logger.info({ err: err }, "Welcome email failed (non-blocking)"),
          );

        Promise?.race([
          notificationService?.sendAdminNewUserNotification(email, user?.id),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("bg-timeout")), 3000),
          ),
        ]).catch((err: unknown) =>
          logger.info(
            { err: err },
            "Admin new-user notification failed (non-blocking)",
          ),
        );

        if (
          artistName &&
          typeof artistName === "string" &&
          artistName?.trim().length > 0
        ) {
          const trimmedName = artistName?.trim();
          artistProfileService
            .createProfile({
              userId: user.id,
              artistName: trimmedName,
              isNewArtist: true,
            })
            .then((profile) => {
              logger.info(
                `[Register] Artist profile created for new user ${user.id}: "${trimmedName}" (id=${profile?.id})`,
              );
              return artistProfileService?.autoDiscover(profile?.id, user?.id);
            })
            .then((discoverResult) => {
              logger.info(
                `[Register] Auto-discover complete for new user ${user.id}: saved=${discoverResult.saved} platforms=[${discoverResult?.savedFields.join(",")}]`,
              );
            })
            .catch((err: unknown) => {
              logger.info(
                { err: err },
                "[Register] Artist profile auto-discover failed (non-blocking)",
              );
            });
        }

        return res.json(safeUser);
      } catch (error) {
        logger.warn({ err: error }, "Registration error");
        return res.status(500).json({ message: "Registration failed" });
      }
    },
  );

  // Auth: Login (accepts username or email)
  // SECURITY: Session regeneration implemented to prevent session fixation attacks
  app.post(
    "/api/auth/login",
    loginRateLimiter,
    async (req: Request, res: Response) => {
      try {
        const { email, username, password, twoFactorCode } = req.body;
        const identifier = email || username;

        if (!identifier || !password) {
          return res
            .status(400)
            .json({ message: "Email/username and password are required" });
        }

        // Try to find user by email first, then by username
        let user = await storage.getUserByEmail(identifier);
        if (!user) {
          user = await storage.getUserByUsername(identifier);
        }
        const loginAuthority = await sessionAuthority();
        const loginGeneration = user ? await loginAuthority.issue(user.id) : undefined;
        // Read credentials after capturing the epoch. A concurrent reset either
        // changes these credentials or invalidates this captured epoch.
        if (user) user = await storage.getUser(user.id);

        // Always run bcrypt?.compare to prevent timing-based user enumeration.
        // When no user is found we compare against a dummy hash so response time
        // is indistinguishable from a real password mismatch (prevents user existence
        // detection via response time differences).
        const DUMMY_HASH =
          "$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
        const candidateHash = user?.password ?? DUMMY_HASH;
        let isValid = false;
        try {
          isValid = await bcrypt?.compare(password, candidateHash);
        } catch {
          isValid = false;
        }

        if (!user || !isValid) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        // Check if 2FA is enabled
        if (user?.twoFactorEnabled) {
          if (!user.twoFactorSecret) return res.status(403).json({ message: "Authenticator recovery required" });
          if (!twoFactorCode) {
            return res.status(200).json({
              requiresTwoFactor: true,
              message: "Two-factor authentication required",
            });
          }

          const isCodeValid = await consumeTotp(user.id, user.twoFactorSecret, twoFactorCode);

          if (!isCodeValid) {
            return res.status(401).json({ message: "Invalid or already used 2FA code. Wait for a new code." });
          }
        }

        try {
          if (!await loginAuthority.validate(user.id, loginGeneration)) {
            return res.status(401).json({ message: "Credentials changed. Please sign in again." });
          }
          await sessionRegenerate(req);
          req.session.userId = user?.id;
          Object.assign(req.session, {
            authGeneration: loginGeneration,
            reauthenticatedAt: Date.now(), reauthenticatedUserId: user.id,
          });
          // If the user has 2FA enabled and passed the TOTP check above, mark this
          // session as 2FA-verified so require2FA gates on privileged routes pass.
          if (user?.twoFactorEnabled) {
            (
              req.session as unknown as Record<string, unknown>
            ).twoFactorVerified = true;
          }
          await sessionSave(req);

          logger.info({ userId: user.id }, "[Login] SUCCESS for userId");

          // Background tasks — fire-and-forget with 3 s hard timeout so Neon
          // DB connections are released quickly and don't starve foreground requests.
          const _bgTimeout = (ms: number) =>
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error("bg-timeout")), ms),
            );
          Promise.race([
            achievementService.updateStreak(user.id, "login"),
            _bgTimeout(3000),
          ]).catch((e: unknown) =>
            logger.warn({ err: e }, "[Login] Failed to update login streak:"),
          );

          Promise.race([
            notificationService.sendLoginSecurityNotification(
              user.id,
              req.ip || undefined,
              req.headers["user-agent"] || undefined,
            ),
            _bgTimeout(3000),
          ]).catch(() => {});

          const {
            password: _,
            twoFactorSecret: _2fa,
            passwordResetToken: _prt,
            emailVerificationToken: _evt,
            ...safeUser
          } = user as Record<string, unknown>;

          // Issue a short-lived JWT access token so the client can use it as a
          // Bearer-token fallback when the PDIM session store is unavailable.
          let sessionToken: string | null = null;
          try {
            const tokenPair = await jwtAuthService.issueTokens(
              user.id,
              ((user as Record<string, unknown>).role as string) || "user",
              (req.session as unknown as Record<string, unknown>).twoFactorVerified === true,
              (req.session as unknown as { authGeneration: string }).authGeneration,
            );
            sessionToken = tokenPair.accessToken;
          } catch (tokenErr) {
            logger.warn(
              { err: tokenErr },
              "[Login] Failed to issue JWT session token — session-only auth will be used",
            );
          }

          return res.json({ ...safeUser, sessionToken });
        } catch (sessionErr) {
          logger.warn(
            { err: sessionErr },
            "[Login] Session operation failed after retries",
          );
          return res
            .status(500)
            .json({ message: "Login failed - session error" });
        }
      } catch (error) {
        logger.warn({ err: error }, "Login error");
        return res.status(500).json({ message: "Login failed" });
      }
    },
  );

  // Auth: Logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (userId) await jwtAuthService.revokeAllUserTokens(userId, "User logout");
      await new Promise<void>((resolve, reject) =>
        req.session.destroy(error => error ? reject(error) : resolve()));
      res.clearCookie("sessionId", { path: "/" });
      return res.json({ message: "Logged out successfully" });
    } catch (error) {
      logger.warn({ err: error }, "Logout failed");
      return res.status(503).json({ message: "Logout could not be confirmed. Please retry." });
    }
  });

  // Auth: Inactivity heartbeat — called by the frontend whenever the user is active.
  // Rolling session auto-extends the cookie. No DB update needed.
  app.post("/api/auth/heartbeat", (req: Request, res: Response) => {
    const userId = req.session.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false });
    }
    req.session.touch?.();
    return res.json({ ok: true });
  });

  // Auth: Session refresh heartbeat (keeps session alive, renews CSRF)
  app.post("/api/auth/refresh-token", async (req: Request, res: Response) => {
    const userId = req.session.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        action: "reauth_required",
        error: "session_expired",
        message: "Session expired. Please sign in again.",
      });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          action: "reauth_required",
          error: "user_not_found",
          message: "User account not found.",
        });
      }

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      // Re-issue a fresh JWT access token for the Bearer-token fallback path.
      let sessionToken: string | null = null;
      try {
        const tokenPair = await jwtAuthService.issueTokens(
          String(userId),
          ((user as Record<string, unknown>).role as string) || "user",
          (req.session as unknown as Record<string, unknown>).twoFactorVerified === true,
          (req.session as unknown as { authGeneration: string }).authGeneration,
        );
        sessionToken = tokenPair.accessToken;
      } catch (tokenErr) {
        logger.warn(
          { err: tokenErr },
          "[RefreshToken] Failed to re-issue JWT session token",
        );
      }

      return res.json({
        success: true,
        expiresAt,
        sessionToken,
        message: "Session refreshed",
      });
    } catch (error) {
      logger.warn({ err: error }, "[Auth] refresh-token error:");
      return res
        .status(500)
        .json({ success: false, message: "Refresh failed" });
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
  app.post(
    "/api/auth/update-onboarding",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { step, completed, hasCompletedOnboarding, onboardingData } =
          req.body;

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
        logger.warn({ err: error }, "Update onboarding error");
        return res.status(500).json({ message: "Failed to update onboarding" });
      }
    },
  );

  // Auth: Get profile
  app.get("/api/auth/profile", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const {
      password,
      twoFactorSecret,
      passwordResetToken,
      emailVerificationToken,
      ...profile
    } = req.user!;
    return res.json(profile);
  });

  // Auth: Update profile
  app.put("/api/auth/profile", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        firstName,
        lastName,
        artistName,
        bio,
        website,
        location,
        socialLinks,
      } = req.body;
      const stripHtml = (str: string | undefined) =>
        str ? str.replace(/[<>&"'`]/g, "").trim() : str;
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
      logger.warn({ err: error }, "Update profile error");
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
    const userSettings = req.user.notificationSettings as Record<
      string,
      any
    > | null;
    return res.json({ ...defaultSettings, ...userSettings });
  });

  // Auth: Update notification settings (persisted to database)
  app.put("/api/auth/notifications", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        emailNotifications,
        pushNotifications,
        weeklyReports,
        salesAlerts,
        royaltyUpdates,
        marketingEmails,
        releaseAlerts,
        paymentAlerts,
        securityAlerts,
      } = req.body;
      const currentSettings =
        (req.user.notificationSettings as Record<string, any>) || {};
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
      await storage.updateUser(req.user.id, {
        notificationSettings: updatedSettings,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Update notification settings error");
      return res
        .status(500)
        .json({ message: "Failed to update notification settings" });
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
        theme,
        language,
        timezone,
        dateFormat,
        currency,
        defaultBPM,
        defaultKey,
        autoSave,
        betaFeatures,
      } = req.body;
      const preferenceUpdates = {
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
      if (
        (theme !== undefined && !["dark", "light", "system"].includes(theme)) ||
        (defaultBPM !== undefined &&
          (!Number.isInteger(defaultBPM) || defaultBPM < 20 || defaultBPM > 400)) ||
        (autoSave !== undefined && typeof autoSave !== "boolean") ||
        (betaFeatures !== undefined && typeof betaFeatures !== "boolean")
      ) {
        return res.status(400).json({ message: "Invalid preference value" });
      }
      if (Object.keys(preferenceUpdates).length === 0) {
        return res.status(400).json({ message: "No preferences supplied" });
      }
      await db
        .update(users)
        .set({
          preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${JSON.stringify(preferenceUpdates)}::jsonb`,
        })
        .where(eq(users.id, req.user.id));
      return res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Update preferences error");
      return res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Auth: Get sessions — handled by the dedicated, requireAuth-gated router in
  // server/routes/auth.ts (GET /api/auth/sessions), which additionally decodes
  // device/browser/OS from the user agent. This inline copy was dead code
  // (registered later than the dynamic auth router mount) and has been removed.

  // Auth: Terminate session
  app.post(
    "/api/auth/sessions/terminate",
    async (req: Request, res: Response) => {
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
          logger.info(
            `[Security] Session termination denied: User ${req.user.id} tried to terminate session ${sessionId} belonging to user ${session.userId}`,
          );
          return res
            .status(403)
            .json({ message: "Session does not belong to this user" });
        }

        // Delete session from database
        const deleted = await storage.deleteSession(sessionId);

        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete session" });
        }

        // Also try to delete from Redis if available
        try {
          const { getRedisClient } = await import(
            "./lib/redisConnectionFactory.js"
          );
          const redisClient = await getRedisClient();
          if (redisClient) {
            await (redisClient as any).del(`maxbooster:sess:${sessionId}`);
          }
        } catch (redisError) {
          logger.warn({ err: redisError }, "Redis session deletion skipped");
        }

        return res.json({
          success: true,
          message: "Session terminated successfully",
        });
      } catch (error) {
        logger.warn({ err: error }, "Session termination error");
        return res.status(500).json({ message: "Failed to terminate session" });
      }
    },
  );

  // Auth: Terminate all other sessions
  app.post(
    "/api/auth/sessions/terminate-all",
    criticalEndpointLimiter,
    async (req: Request, res: Response) => {
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
                const { getRedisClient } = await import(
                  "./lib/redisConnectionFactory.js"
                );
                const redisClient = await getRedisClient();
                if (redisClient) {
                  await (redisClient as any).del(`maxbooster:sess:${session.id}`);
                }
              } catch (redisError) {
                // Redis deletion is best-effort
              }
            }
          }
        }

        logger.info(
          `[Security] Terminated ${terminatedCount} sessions for user ${req.user.id}`,
        );
        return res.json({
          success: true,
          message: `${terminatedCount} session(s) terminated`,
        });
      } catch (error) {
        logger.warn({ err: error }, "Terminate all sessions error");
        return res
          .status(500)
          .json({ message: "Failed to terminate sessions" });
      }
    },
  );

  // Auth: Delete all other sessions — handled by the dedicated, requireAuth-gated
  // router in server/routes/auth.ts (DELETE /api/auth/sessions/other), which also
  // records a securityThreats audit entry for the remote termination. This inline
  // copy was dead code (registered later than the dynamic auth router mount) and
  // lacked that audit logging, so it has been removed rather than kept as a
  // shadowed duplicate.

  // Auth: Get login history
  app.get("/api/auth/login-history", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Get login events from security threats table
      const { securityThreats } = await import("../shared/schema.js");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const loginEvents = await db
        .select()
        .from(securityThreats)
        .where(
          and(
            eq(securityThreats.userId, req.user.id),
            gte(securityThreats.detectedAt, thirtyDaysAgo),
          ),
        )
        .orderBy(desc(securityThreats.detectedAt))
        .limit(50);

      // Also get successful logins from sessions
      const userSessions = await storage.getSessionsByUserId(req.user.id);

      // Format events for frontend
      const formattedEvents = loginEvents.map((event) => {
        const metadata = (event.metadata as Record<string, any>) || {};
        const indicators = (event.indicators as Record<string, any>) || {};

        return {
          id: event.id,
          timestamp:
            event.detectedAt!.toISOString() || new Date().toISOString(),
          ipAddress: metadata.ipAddress || indicators.ipAddress || "Unknown",
          location: metadata.location || indicators.location || "Unknown",
          device:
            metadata.userAgent || indicators.userAgent || "Unknown Device",
          browser: metadata.browser || "Unknown",
          success: event.threatType !== "failed_login",
          suspicious:
            event.severity === "high" || event.severity === "critical",
          reason:
            event.severity === "high" || event.severity === "critical"
              ? `${event.threatType}: ${metadata.description || "Unusual activity detected"}`
              : undefined,
        };
      });

      // Add recent successful logins from sessions
      const sessionEvents = userSessions
        .filter((s) => s.createdAt)
        .map((session) => ({
          id: `session-${session.id}`,
          timestamp:
            session.createdAt.toISOString() || new Date().toISOString(),
          ipAddress: "Unknown",
          location: "Unknown",
          device: session.userAgent || "Unknown Device",
          browser: "Unknown",
          success: true,
          suspicious: false,
        }));

      // Combine and sort by timestamp
      const allEvents = [...formattedEvents, ...sessionEvents]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 20);

      return res.json(allEvents);
    } catch (error) {
      logger.warn({ err: error }, "Get login history error");
      return res.status(500).json({ message: "Failed to fetch login history" });
    }
  });

  // Auth: Get privacy settings
  app.get("/api/auth/privacy-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const preferences =
        (req.user.preferences as Record<string, any> | null) || {};
      const privacy = (preferences.privacy as Record<string, any> | undefined) || {};
      const settings = {
        profileVisibility: privacy.profileVisibility || "public",
        showEmail: privacy.showEmail ?? false,
        showLocation: privacy.showLocation ?? true,
        allowMessages: privacy.allowMessages ?? true,
        allowSearchIndexing: privacy.allowSearchIndexing ?? true,
        gdprDataProcessing: true, // Required for service
        gdprMarketing: privacy.gdprMarketing ?? false,
        gdprAnalytics: privacy.gdprAnalytics ?? true,
      };
      return res.json(settings);
    } catch (error) {
      logger.warn({ err: error }, "Get privacy settings error");
      return res
        .status(500)
        .json({ message: "Failed to get privacy settings" });
    }
  });

  // Auth: Update privacy settings
  app.put("/api/auth/privacy-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const allowedFields = [
        "profileVisibility",
        "showEmail",
        "showLocation",
        "allowMessages",
        "allowSearchIndexing",
        "gdprMarketing",
        "gdprAnalytics",
      ];

      const privacyUpdates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (
            (field === "profileVisibility" &&
              !["public", "private", "connections"].includes(req.body[field])) ||
            (field !== "profileVisibility" && typeof req.body[field] !== "boolean")
          ) {
            return res.status(400).json({ message: `Invalid ${field}` });
          }
          privacyUpdates[field] = req.body[field];
        }
      }

      if (Object.keys(privacyUpdates).length > 0) {
        await db
          .update(users)
          .set({
            preferences: sql`jsonb_set(
              coalesce(${users.preferences}, '{}'::jsonb),
              '{privacy}',
              coalesce(${users.preferences}->'privacy', '{}'::jsonb) || ${JSON.stringify(privacyUpdates)}::jsonb,
              true
            )`,
          })
          .where(eq(users.id, req.user.id));
      }

      return res.json({ success: true, message: "Privacy settings updated" });
    } catch (error) {
      logger.warn({ err: error }, "Update privacy settings error");
      return res
        .status(500)
        .json({ message: "Failed to update privacy settings" });
    }
  });

  // Auth: Request data export
  app.post(
    "/api/auth/request-data-export",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await db
          .update(users)
          .set({
            preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${JSON.stringify({
              dataExportRequestedAt: now.toISOString(),
              dataExportStatus: "ready",
              dataExportExpiresAt: expiresAt.toISOString(),
            })}::jsonb`,
          })
          .where(eq(users.id, req.user.id));

        return res.json({
          success: true,
          message:
            "Your data export is ready to download.",
        });
      } catch (error) {
        logger.warn({ err: error }, "Request data export error");
        return res
          .status(500)
          .json({ message: "Failed to request data export" });
      }
    },
  );

  // Auth: Get data export status
  app.get(
    "/api/auth/data-export-status",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const preferences =
          (req.user.preferences as Record<string, any> | null) || {};
        const expiresAt = preferences.dataExportExpiresAt;
        const expired =
          typeof expiresAt === "string" && new Date(expiresAt).getTime() <= Date.now();
        const status = {
          status: expired ? "expired" : preferences.dataExportStatus || "none",
          requestedAt: preferences.dataExportRequestedAt || undefined,
          expiresAt: expiresAt || undefined,
          downloadUrl:
            !expired && preferences.dataExportStatus === "ready"
              ? "/api/auth/export-data"
              : undefined,
        };
        return res.json(status);
      } catch (error) {
        logger.warn({ err: error }, "Get data export status error");
        return res.status(500).json({ message: "Failed to get export status" });
      }
    },
  );

  // Auth: Change password
  // SECURITY: Invalidates all other sessions after password change
  app.post(
    "/api/auth/change-password",
    criticalEndpointLimiter,
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword) {
          return res
            .status(400)
            .json({ message: "Current password is required" });
        }
        if (!newPassword || newPassword.length < 8) {
          return res
            .status(400)
            .json({ message: "New password must be at least 8 characters" });
        }

        const isValid = await bcrypt.compare(
          currentPassword,
          req.user.password,
        );
        if (!isValid) {
          return res
            .status(400)
            .json({ message: "Current password is incorrect" });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        const changedGeneration = await db.transaction(async (tx) => {
          await tx.update(users).set({ password: hashedPassword }).where(eq(users.id, req.user!.id));
          const result = await tx.execute<{ generation: string }>(sql`INSERT INTO auth_session_epochs (user_id, generation)
            VALUES (${req.user!.id}, 2) ON CONFLICT (user_id)
            DO UPDATE SET generation = auth_session_epochs.generation + 1
            RETURNING generation::text`);
          const generation = result.rows[0]?.generation;
          if (typeof generation !== "string" || !/^[1-9]\d*$/.test(generation)) {
            throw new Error("Credential mutation did not return a valid session generation");
          }
          return generation;
        });

        // SECURITY FIX: Invalidate all OTHER sessions for this user after password change
        const currentSessionId = req.session.id;
        try {
          const userSessions = await storage.getSessionsByUserId(req.user.id);
          for (const session of userSessions) {
            if (session.id !== currentSessionId) {
              await storage.deleteSession(session.id);
              // Also try to delete from Redis if available
              try {
                const { getRedisClient } = await import(
                  "./lib/redisConnectionFactory.js"
                );
                const redisClient = await getRedisClient();
                if (redisClient) {
                  await (redisClient as any).del(`maxbooster:sess:${session.id}`);
                }
              } catch (redisError) {
                // Redis deletion is best-effort
              }
            }
          }
          logger.info(
            `[Security] Invalidated ${userSessions.length - 1} sessions after password change for user ${req.user.id}`,
          );
        } catch (sessionError) {
          logger.warn(
            { err: sessionError },
            "[Security] Could not invalidate other sessions",
          );
          // Continue - password was changed successfully
        }

        notificationService
          .sendPasswordChangedNotification(req.user.id)
          .catch(() => {});

        // Credential mutation and durable revocation committed together above.
        // Retain only this freshly reauthenticated session at the new epoch.
        (req.session as unknown as Record<string, unknown>).authGeneration = changedGeneration;
        await sessionSave(req);

        return res.json({
          success: true,
          message: "Password changed. Other sessions have been logged out.",
        });
      } catch (error) {
        logger.warn({ err: error }, "Change password error");
        return res.status(500).json({ message: "Failed to change password" });
      }
    },
  );

  // Auth: Delete account
  app.use("/api/auth", accountErasureRouter);
  app.use("/api/auth", createMfaChallengeRouter());

  // Auth: Upload avatar
  app.post(
    "/api/auth/avatar",
    async (req: Request, res: Response, _next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Dynamically import avatar upload middleware and storage
      try {
        const { avatarUpload, storeUploadedFile } = await import(
          "./middleware/uploadHandler.js"
        );

        // Handle multipart upload
        avatarUpload.single("avatar")(req, res, async (err: unknown) => {
          if (err) {
            logger.warn({ err: err }, "Avatar upload error");
            return res
              .status(400)
              .json({
                message:
                  (err instanceof Error ? err.message : undefined) ||
                  "Failed to upload avatar",
              });
          }

          if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
          }

          try {
            let avatarUrl: string;

            try {
              const result = await storeUploadedFile(
                req.file,
                req.user!.id,
                "avatar",
              );
              avatarUrl = result.url;
            } catch (storeError) {
              // Object Storage unavailable — fall back to storing the processed image
              // as a base64 data URL directly in the database. Avatars are small
              // (512x512 WebP ≈ 30-60 KB) so this is safe for the users table.
              logger.warn(
                { err: storeError },
                "[Avatar] Object Storage unavailable, falling back to data URL",
              );
              const { processAvatarImage } = await import(
                "./middleware/uploadHandler.js"
              );
              const processed = await processAvatarImage(req.file!.buffer);
              avatarUrl = `data:${processed.mimeType};base64,${processed.buffer.toString("base64")}`;
              logger.info(
                `[Avatar] Data URL fallback used for userId=${req.user!.id}, size=${processed.processedSize}B`,
              );
            }

            const updatedUser = await storage.updateUser(req.user!.id, {
              avatarUrl,
              profileImageUrl: avatarUrl,
            });
            if (!updatedUser) {
              logger.warn(
                `[Avatar] updateUser returned null for userId=${req.user!.id}. DB update may have failed.`,
              );
            } else {
              logger.info(`[Avatar] DB updated for userId=${req.user!.id}`);
            }

            return res.json({
              success: true,
              profileImageUrl: avatarUrl,
              avatarUrl,
            });
          } catch (storeError) {
            logger.warn({ err: storeError }, "Avatar storage error");
            return res
              .status(500)
              .json({
                message:
                  (storeError instanceof Error
                    ? storeError.message
                    : undefined) || "Failed to store avatar",
              });
          }
        });
      } catch (importError) {
        logger.warn({ err: importError }, "Avatar upload import error");
        return res
          .status(500)
          .json({ message: "Avatar upload service unavailable" });
      }
    },
  );

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
          const fs = await import("fs/promises");
          const path = await import("path");

          // Extract the file path from the URL (assuming it's stored locally)
          // Avatar URLs are typically like /uploads/avatars/filename.ext
          if (
            currentAvatarUrl.startsWith("/uploads/") ||
            currentAvatarUrl.startsWith("uploads/")
          ) {
            const filePath = path.join(
              process.cwd(),
              currentAvatarUrl.replace(/^\//, ""),
            );
            await fs.unlink(filePath).catch(() => {
              // File might not exist, that's ok
              logger.info(
                { filePath },
                "Avatar file not found or already deleted",
              );
            });
          }
        } catch (fsError) {
          // File deletion is best-effort, continue even if it fails
          logger.warn({ err: fsError }, "Avatar file deletion skipped");
        }
      }

      await storage.updateUser(req.user.id, {
        avatarUrl: null,
        profileImageUrl: null,
      });

      return res.json({
        success: true,
        message: "Avatar deleted successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Delete avatar error");
      return res.status(500).json({ message: "Failed to delete avatar" });
    }
  });

  // Storage: Serve files from hybrid storage (Replit hot + Pocket Dimension cold)
  app.get("/api/storage/file/*key", async (req: Request, res: Response) => {
    try {
      // Requires auth: files under users/<ownerId>/... are private, and without
      // this check any anonymous caller who knows/guesses a storage key could
      // download any user's private uploads.
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Express 5 already percent-decodes params — decoding again would allow
      // double-encoded ".." traversal. Only join the wildcard segments.
      const rawKey = (req.params as Record<string, string | string[]>).key;
      const key = Array.isArray(rawKey) ? rawKey.join("/") : (rawKey ?? "");

      if (!key || key.startsWith("/") || key.includes("..") || key.includes("\0") || key.includes("\\")) {
        return res.status(400).json({ message: "File key is required" });
      }

      // Per-user files are keyed "users/<ownerId>/...". Without this check any
      // authenticated user could read any other user's private uploads just by
      // knowing/guessing their storage key.
      if (key.startsWith("users/")) {
        const ownerId = key.split("/")[1];
        if (ownerId !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const { storageService } = await import("./services/storageService.js");
      const { hybridStorageService } = await import(
        "./services/hybridStorageService.js"
      );

      // Never serve a file whose tracking row is marked deleted — the soft
      // delete keeps the storage object only for the restore window.
      {
        const { userStorageFiles } = await import("../shared/schema.js");
        const { eq, sql: dsql } = await import("drizzle-orm");
        const [row] = await db
          .select({ deletedAt: userStorageFiles.deletedAt })
          .from(userStorageFiles)
          .where(eq(userStorageFiles.fileKey, key))
          .orderBy(dsql`${userStorageFiles.deletedAt} DESC NULLS FIRST`)
          .limit(1);
        if (row?.deletedAt) {
          logger.warn(
            { key, deletedAt: row.deletedAt },
            "Storage file serve: rejected, tracking row is soft-deleted",
          );
          return res.status(404).json({ message: "File not found" });
        }
      }

      let fileBuffer: Buffer | null = null;
      let storageTier = "unknown";
      let hybridReadError: unknown;

      const hybridMeta = hybridStorageService.getMetadata(key);
      if (hybridMeta) {
        storageTier = `${hybridMeta.tier}/${hybridMeta.location}`;
        try {
          fileBuffer = await hybridStorageService.read(hybridMeta.userId, key);
        } catch (err) {
          hybridReadError = err;
          fileBuffer = null;
        }
      }

      if (!fileBuffer) {
        try {
          fileBuffer = await storageService.downloadFile(key);
          storageTier = "replit-direct";
        } catch (err) {
          // Both backends missed this key. Log every input to that outcome
          // (hybrid metadata presence, any hybrid read error, and the final
          // downloadFile error) so a future occurrence is diagnosable from
          // logs alone instead of reproducing a 28-byte 404 with no trail.
          logger.warn(
            {
              key,
              hadHybridMeta: Boolean(hybridMeta),
              hybridReadError:
                hybridReadError instanceof Error
                  ? hybridReadError.message
                  : hybridReadError,
              downloadError: err instanceof Error ? err.message : err,
            },
            "Storage file serve: not found in hybrid storage or storageService",
          );
          return res.status(404).json({ message: "File not found" });
        }
      }

      const ext = (key.split(".").pop() ?? "").toLowerCase();
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        flac: "audio/flac",
        ogg: "audio/ogg",
        pdf: "application/pdf",
      };

      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", fileBuffer.length);
      // "private" (not "public") — this endpoint now requires auth and gates
      // users/* keys by owner, so a shared/CDN cache must never store a
      // response that was only authorized for one specific requester.
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("X-Storage-Tier", storageTier);

      return res.send(fileBuffer);
    } catch (error) {
      logger.warn({ err: error }, "Storage file serve error");
      return res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // Auth: Export user data
  app.get("/api/auth/export-data", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        password,
        twoFactorSecret,
        passwordResetToken,
        emailVerificationToken,
        ...userData
      } = req.user!;
      return res.json({
        user: userData,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn({ err: error }, "Export data error");
      return res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Auth: 2FA setup - Generate TOTP secret and QR code
  const { twoFactorRateLimiter } = await import("./middleware/rateLimiter.js");
  const factorLifecycle = mfaLifecycle();
  app.post(
    "/api/auth/2fa/setup",
    criticalEndpointLimiter,
    twoFactorRateLimiter,
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      try {
        return await factorLifecycle.setup(req, res);
      } catch (error) {
        logger.warn({ err: error }, "2FA setup error");
        return res.status(500).json({ message: "Failed to setup 2FA" });
      }
    },
  );

  // Auth: 2FA verify - Verify TOTP code and enable 2FA
  // SECURITY: Rate limited to prevent brute-force attacks on 2FA codes
  app.post(
    "/api/auth/2fa/verify",
    twoFactorRateLimiter,
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      try {
        return await factorLifecycle.verify(req, res);
      } catch (error) {
        logger.warn({ err: error }, "2FA verify error");
        return res.status(500).json({ message: "Failed to verify 2FA code" });
      }
    },
  );

  // Auth: 2FA disable - Disable 2FA on account
  // SECURITY: Rate limited to prevent brute-force attacks
  app.post(
    "/api/auth/2fa/disable",
    twoFactorRateLimiter,
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      try {
        const { password, code } = req.body;
        if (req.user.password && !password) {
          return res.status(400).json({ message: "Password is required" });
        }
        const recentSession = req.session as unknown as {
          reauthenticatedAt?: number; reauthenticatedUserId?: string;
        };
        const recentOAuth = !req.user.password && recentSession.reauthenticatedUserId === req.user.id &&
          typeof recentSession.reauthenticatedAt === "number" &&
          recentSession.reauthenticatedAt <= Date.now() &&
          Date.now() - recentSession.reauthenticatedAt < 5 * 60_000;
        const isPasswordValid = recentOAuth || (typeof password === "string" &&
          !!req.user.password && await bcrypt.compare(password, req.user.password));
        if (!isPasswordValid) {
          return res.status(403).json({ message: "Recent authentication required", requiresReauthentication: true });
        }

        if (req.user.twoFactorEnabled && req.user.twoFactorSecret) {
          if (!code) {
            return res.status(400).json({ message: "2FA code is required" });
          }

          // SECURITY: Validate code format (6 digits)
          if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: "Invalid code format" });
          }

          const isCodeValid = await consumeTotp(req.user.id, req.user.twoFactorSecret, code);
          if (!isCodeValid) {
            return res.status(400).json({ message: "Invalid 2FA code" });
          }
        }

        const factorGeneration = await (await factorRepository()).replace(req.user.id,
          req.user.twoFactorSecret ?? null, req.user.twoFactorEnabled === true, null, false);
        const factorSession = req.session as unknown as Record<string, unknown>;
        delete factorSession.pendingFactor;
        delete factorSession.twoFactorVerified;
        factorSession.authGeneration = factorGeneration;
        await sessionSave(req);

        return res.json({
          success: true,
          message: "2FA disabled successfully",
        });
      } catch (error) {
        logger.warn({ err: error }, "2FA disable error");
        return res.status(500).json({ message: "Failed to disable 2FA" });
      }
    },
  );

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

  // Auth: 2FA validate - Check a TOTP code against the authenticated user's secret
  // Atomically consumes the factor time step to prevent cross-endpoint replay.
  app.post(
    "/api/auth/2fa/validate",
    twoFactorRateLimiter,
    async (req: Request, res: Response) => {
      try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "code is required" });
      }
      if (!req.user.twoFactorEnabled || !req.user.twoFactorSecret) {
        return res
          .status(400)
          .json({ message: "2FA is not enabled on this account" });
      }
      const isValid = await consumeTotp(req.user.id, req.user.twoFactorSecret, String(code));
      // Mark the session as 2FA-verified so privileged routes (require2FA) allow access.
      if (isValid) {
        (req.session as unknown as Record<string, unknown>).twoFactorVerified =
          true;
        await new Promise<void>((resolve, reject) =>
          req.session.save((err) => (err ? reject(err) : resolve())),
        );
      }
      return res.json({ valid: isValid });
      } catch (error) {
        logger.warn({ err: error }, "Factor validation unavailable");
        return res.status(503).json({ message: "Factor validation unavailable. Please retry with a new code." });
      }
    },
  );

  // Auth: OAuth initiate alias — GET /api/auth/oauth/initiate?platform=<name>
  // Requires auth; for google delegates to /api/auth/google (the dedicated Google handler);
  // for all other platforms redirects to /api/social/connect/:platform (POST via 307 not
  // applicable for GET, so those callers should use /api/social/connect directly).
  app.get("/api/auth/oauth/initiate", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const platform = ((req.query.platform as string | undefined) ?? "")
      .toLowerCase()
      .trim();
    if (!platform) {
      return res.status(400).json({ message: "platform is required" });
    }
    // Google has a dedicated handler that sets session state and redirects to accounts.google.com
    if (platform === "google") {
      return res.redirect(307, "/api/auth/google");
    }
    // For other platforms the caller should use POST /api/social/connect/:platform
    return res
      .status(400)
      .json({
        message: `Use POST /api/social/connect/${platform} for this platform`,
      });
  });

  // Auth: OAuth callback alias — GET /api/auth/oauth/callback?platform=X&[code&state | error]
  // Validates the platform and state presence before forwarding to the social callback handler.
  app.get("/api/auth/oauth/callback", (req: Request, res: Response) => {
    const platform = ((req.query.platform as string | undefined) ?? "")
      .toLowerCase()
      .trim();
    if (!platform) {
      return res.redirect("/login?error=platform_required");
    }
    if (req.query.error) {
      // Short-circuit OAuth provider errors immediately (same behaviour as social callback)
      return res.redirect(
        `/social-media?error=oauth_denied&platform=${encodeURIComponent(platform)}`,
      );
    }
    // Reject missing state before forwarding — prevents unnecessary round-trips
    if (!req.query.state) {
      return res.redirect(
        `/social-media?error=invalid_state&platform=${encodeURIComponent(platform)}`,
      );
    }
    // Forward all other query params (code, state, …) to the real social callback handler.
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== "platform") qs.set(k, String(v));
    }
    return res.redirect(
      307,
      `/api/social/callback/${encodeURIComponent(platform)}?${qs.toString()}`,
    );
  });

  // REMOVED: Duplicate 2FA disable route without password verification
  // The secured version with password + 2FA code verification is registered above (line ~1139)

  // Too Lost callback aliases. Provider registrations use /callback in
  // production and the sandbox root URL. Forward only OAuth-shaped requests
  // to the authenticated Distribution callback.
  const forwardToolostCallback = (req: Request, res: Response) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        for (const item of value) query.append(key, String(item));
      } else if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    return res.redirect(
      307,
      `/api/distribution/toolost/callback${query.toString() ? `?${query.toString()}` : ""}`,
    );
  };
  app.get(
    "/callback",
    requireAuth,
    forwardToolostCallback,
  );
  app.get(
    "/",
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.query.state || (!req.query.code && !req.query.error)) {
        return next();
      }
      return requireAuth(req, res, () => forwardToolostCallback(req, res));
    },
  );

  // Auth: Demo login - Read-only showcase of all features
  app.post("/api/auth/demo", async (req: Request, res: Response) => {
    try {
      let demoUser = await storage.getUserByEmail("demo@maxbooster.ai");
      if (!demoUser) {
        await assertRegistrationEnabled();
        const hashedPassword = await bcrypt.hash(
          crypto.randomBytes(32).toString("hex"),
          12,
        );
        demoUser = await storage.createUser({
          email: "demo@maxbooster.ai",
          password: hashedPassword,
          username: "demo_user",
          firstName: "Demo",
          lastName: "User",
        });
      }

      // Ensure demo user always has active subscription so they can access all protected routes
      if (
        demoUser.subscriptionStatus !== "active" ||
        demoUser.subscriptionTier !== "pro"
      ) {
        const updated = await storage.updateUser(demoUser.id, {
          subscriptionStatus: "active",
          subscriptionTier: "pro",
        });
        if (updated) demoUser = updated;
      }

      try {
        await sessionRegenerate(req);
        req.session.userId = demoUser.id;
        (req.session as unknown as Record<string, unknown>).authGeneration =
          await (await sessionAuthority()).issue(demoUser.id);
        await sessionSave(req);
        logger.info({ demoUserId: demoUser.id }, "[Demo] SUCCESS for demoUser");
        const {
          password: _,
          twoFactorSecret: _2fa,
          passwordResetToken: _prt,
          emailVerificationToken: _evt,
          ...safeUser
        } = demoUser as Record<string, unknown>;
        return res.json({ ...safeUser, isDemo: true });
      } catch (sessionErr) {
        logger.warn(
          { err: sessionErr },
          "[Demo] Session operation failed after retries",
        );
        return res
          .status(500)
          .json({ message: "Demo login failed - session error" });
      }
    } catch (error) {
      logger.warn({ err: error }, "Demo login error");
      return res.status(500).json({ message: "Demo login failed" });
    }
  });

  // Auth: Forgot password
  app.post(
    "/api/auth/forgot-password",
    forgotPasswordRateLimiter,
    async (req: Request, res: Response) => {
      try {
        const email =
          typeof req.body?.email === "string" ? req.body.email.trim() : "";

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ message: "Invalid email address" });
        }

        const user = await storage.getUserByEmail(email);

        if (user) {
          const resetToken = crypto.randomBytes(32).toString("hex");
          const hashedToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");
          const expires = new Date(Date.now() + 60 * 60 * 1000);

          await storage.updateUser(user.id, {
            passwordResetToken: hashedToken,
            passwordResetExpires: expires,
          });

          const baseUrl = process.env.APP_URL || "https://maxbooster.replit.app";
          const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

          const emailSent = await emailService.sendPasswordResetEmail(
            {
              firstName: user.firstName || "User",
              resetLink,
              expiresIn: "1 hour",
            },
            user.email,
          );

          if (!emailSent) {
            logger.error(
              { userId: user.id },
              "Password reset email provider did not accept the message",
            );
            return res.status(503).json({
              message:
                "Unable to send the reset email right now. Please try again shortly.",
            });
          }
        }

        return res.json({
          success: true,
          message: "If the email exists, a reset link has been sent.",
        });
      } catch (error) {
        logger.error({ err: error }, "Forgot password error");
        return res.status(500).json({
          message: "Unable to process the password reset request. Please try again.",
        });
      }
    },
  );

  // Auth: Reset password
  app.post(
    "/api/auth/reset-password",
    forgotPasswordRateLimiter,
    async (req: Request, res: Response) => {
      try {
        const { token, password } = req.body ?? {};

        if (
          typeof token !== "string" ||
          !token ||
          typeof password !== "string" ||
          !password
        ) {
          return res
            .status(400)
            .json({ message: "Token and password are required" });
        }

        if (password.length < 8) {
          return res
            .status(400)
            .json({ message: "Password must be at least 8 characters" });
        }
        if (password.length > 72) {
          return res
            .status(400)
            .json({ message: "Password must be 72 characters or fewer" });
        }

        const hashedToken = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");

        // Cheap fast-fail before paying for bcrypt below. Deliberately the
        // same message whether the token never existed or already expired,
        // so the response can't be used to distinguish which case it was.
        const candidate =
          await storage.getUserByPasswordResetToken(hashedToken);
        if (
          !candidate ||
          !candidate.passwordResetExpires ||
          new Date(candidate.passwordResetExpires) < new Date()
        ) {
          return res
            .status(400)
            .json({ message: "Invalid or expired reset token" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Atomically consume the token: the WHERE clause re-validates the
        // token and its expiry as part of the same statement that clears
        // it, so two concurrent submissions of the same token can never
        // both succeed. Only the request whose UPDATE actually matches a
        // row wins the race, which closes the TOCTOU gap that the
        // check-then-act pattern above would leave open on its own.
        const resetUser = await db.transaction(async (tx) => {
          const [changed] = await tx
          .update(users)
          .set({
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpires: null,
          })
          .where(
            and(
              eq(users.passwordResetToken, hashedToken),
              gte(users.passwordResetExpires, new Date()),
            ),
          )
          .returning({ id: users.id });
          if (changed) {
            await tx.execute(sql`INSERT INTO auth_session_epochs (user_id, generation)
              VALUES (${changed.id}, 2) ON CONFLICT (user_id)
              DO UPDATE SET generation = auth_session_epochs.generation + 1`);
          }
          return changed;
        });

        if (!resetUser) {
          return res
            .status(400)
            .json({ message: "Invalid or expired reset token" });
        }

        // Password, reset-token consumption and durable epoch committed together.

        return res.json({
          success: true,
          message: "Password reset successfully",
        });
      } catch (error) {
        logger.warn({ err: error }, "Reset password error");
        return res.status(500).json({ message: "Failed to reset password" });
      }
    },
  );

  // Compatibility aliases use the same own-account hashed developer-key service
  // and admin + factor gates as /api/admin/tokens (not session/JWT credentials).
  app.post("/api/auth/token", requireAdmin, require2FA, async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json(await issueAdminApiToken(req.user!.id, req.ip || "unknown"));
    } catch (error) {
      logger.warn({ err: error }, "Admin API credential issuance failed");
      return res.status(500).json({ error: "Unable to issue API credential" });
    }
  });

  // Auth: Revoke token (admin)
  app.post("/api/auth/token/revoke", requireAdmin, require2FA, async (req: Request, res: Response) => {
    if (typeof req.body?.tokenId !== "string" || !req.body.tokenId.trim() || req.body.tokenId.length > 100) {
      return res.status(400).json({ error: "A credential ID is required" });
    }
    try {
      return res.json(await revokeAdminApiToken(req.user!.id, req.body.tokenId, req.ip || "unknown"));
    } catch (error) {
      logger.warn({ err: error }, "Admin API credential revocation failed");
      return res.status(400).json({ error: "Unable to revoke credential for current user" });
    }
  });

  // Auth: Google OAuth - Start login flow
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect("/login?error=google_not_configured");
    }

    const state = crypto.randomBytes(32).toString("hex");

    // Store state in session
    if (req.session) {
      (
        req.session as import("express-session").Session & {
          googleOAuthState?: string;
        }
      ).googleOAuthState = state;
    }

    // Always use production URL for OAuth callbacks (must match Google Console registration)
    const baseUrl = process.env.APP_URL || "https://maxbooster.replit.app";
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
  });

  // Auth: Google OAuth callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/login?error=google_denied`);
    }

    // Verify state
    const savedState = (
      req.session as import("express-session").Session & {
        googleOAuthState?: string;
      }
    ).googleOAuthState;
    if (!state || state !== savedState) {
      return res.redirect("/login?error=invalid_state");
    }
    if (typeof code !== "string" || !code.trim()) {
      return res.redirect("/login?error=token_exchange_failed");
    }
    delete (
      req.session as import("express-session").Session & {
        googleOAuthState?: string;
      }
    ).googleOAuthState;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect("/login?error=google_not_configured");
    }

    // Always use production URL for OAuth callbacks (must match Google Console registration)
    const baseUrl = process.env.APP_URL || "https://maxbooster.replit.app";
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(10_000), // 10 s — Google outage must not hang the login flow
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok || tokens.error) {
        logger.warn(
          {
            status: tokenResponse.status,
            error: tokens.error || "unknown",
            hasErrorDescription: Boolean(tokens.error_description),
            hasAccessToken: Boolean(tokens.access_token),
          },
          "[Google OAuth] Token exchange failed",
        );
        return res.redirect("/login?error=token_exchange_failed");
      }

      // Get user info
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          signal: AbortSignal.timeout(10_000), // 10 s — userinfo hang must not block session creation
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      );

      const googleUser = await userInfoResponse.json();

      if (!userInfoResponse.ok || googleUser.verified_email !== true ||
          typeof googleUser.email !== "string" || !googleUser.email ||
          typeof googleUser.id !== "string" || !googleUser.id) {
        return res.redirect("/login?error=unverified_identity");
      }

      // Check if user exists
      let user = await storage.getUserByEmail(googleUser.email);

      if (!user) {
        // Create new user from Google account
        await assertRegistrationEnabled();
        user = await storage.createUser({
          email: googleUser.email,
          password: "", // No password for OAuth users
          firstName: googleUser.given_name || null,
          lastName: googleUser.family_name || null,
          googleId: googleUser.id || null,
        });

        logger.info("[Google OAuth] Created new user");
      } else if (user.googleId && user.googleId !== googleUser.id) {
        return res.redirect("/login?error=identity_mismatch");
      } else if (!user.googleId) {
        // Existing account (e.g. originally created via email/password) is
        // completing Google login for the first time - link it so the
        // Settings "Connected Accounts" disconnect flow has something real
        // to act on instead of permanently reporting no connection.
        user = (await storage.updateUser(user.id, {
          googleId: googleUser.id,
        })) || user;
      }

      // Log the user in using session (regenerate prevents session fixation)
      try {
        await sessionRegenerate(req);
        const generation = await (await sessionAuthority()).issue(user.id);
        const currentUser = await storage.getUser(user.id);
        if (!currentUser) return res.redirect("/login?error=account_unavailable");
        user = currentUser;
        if (user.twoFactorEnabled) {
          if (!user.twoFactorSecret) return res.redirect("/login?error=authenticator_recovery_required");
          Object.assign(req.session, { pendingMfa: {
            userId: user.id, generation, expiresAt: Date.now() + 5 * 60_000,
          } });
          await sessionSave(req);
          return res.redirect("/api/auth/2fa/challenge");
        }
        req.session.userId = user.id;
        Object.assign(req.session, { authGeneration: generation,
          reauthenticatedAt: Date.now(), reauthenticatedUserId: user.id });
        await sessionSave(req);
        logger.info("[Google OAuth] User logged in");
        return res.redirect("/dashboard");
      } catch (sessionErr) {
        logger.warn(
          { err: sessionErr },
          "[Google OAuth] Session operation failed after retries",
        );
        return res.redirect("/login?error=login_failed");
      }
    } catch (err) {
      logger.warn({ err: err }, "[Google OAuth] Error:");
      return res.redirect("/login?error=oauth_error");
    }
  });

  // Auth: Delete Google connection
  app.delete(
    "/api/auth/google-connection",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        // Check if user has a Google connection
        if (!req.user.googleId) {
          return res
            .status(400)
            .json({ message: "No Google connection to remove" });
        }

        // Ensure user has a password set before disconnecting OAuth
        // Users who signed up via Google have empty passwords
        if (!req.user.password || req.user.password === "") {
          return res.status(400).json({
            message:
              "Please set a password before disconnecting Google. You won't be able to log in otherwise.",
          });
        }

        // Clear Google connection fields from user record
        await storage.updateUser(req.user.id, {
          googleId: null,
        });

        return res.json({
          success: true,
          message: "Google connection removed successfully",
        });
      } catch (error) {
        logger.warn({ err: error }, "Delete Google connection error");
        return res
          .status(500)
          .json({ message: "Failed to remove Google connection" });
      }
    },
  );

  // Social Platform Connect - Creates stub social account entries
  const ALLOWED_CONNECT_PROVIDERS = [
    "spotify",
    "apple_music",
    "youtube",
    "instagram",
    "tiktok",
    "soundcloud",
  ];

  app.get(
    "/api/auth/connect/:provider",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.redirect(
          "/auth?redirect=" + encodeURIComponent(req.originalUrl),
        );
      }

      const { provider } = req.params as Record<string, string>;
      if (!ALLOWED_CONNECT_PROVIDERS.includes(provider)) {
        return res
          .status(400)
          .json({ error: `Unsupported provider: ${provider}` });
      }

      try {
        const { socialAccounts } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const { db } = await import("./db.js");

        const [existing] = await db
          .select()
          .from(socialAccounts)
          .where(
            and(
              eq(socialAccounts.userId, req.user.id),
              eq(socialAccounts.platform, provider),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(socialAccounts)
            .set({ isActive: true })
            .where(eq(socialAccounts.id, existing.id));
        } else {
          await db.insert(socialAccounts).values({
            userId: req.user.id,
            platform: provider,
            platformUserId: `${provider}_${req.user.id}`,
            username:
              req.user.username || req.user.email.split("@")[0] || provider,
            accessToken: `platform_managed_${provider}`,
            tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            isActive: true,
            followerCount: 0,
          });
        }

        return res.redirect(
          "/settings?tab=connected-accounts&connected=" + provider,
        );
      } catch (error) {
        logger.warn({ err: error }, `Error connecting ${provider}:`);
        return res.status(500).json({ error: `Failed to connect ${provider}` });
      }
    },
  );

  // Dashboard: Comprehensive data
  app.get(
    "/api/dashboard/comprehensive",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const userId = req.user!.id;
        const { studioProjects, releases, socialAccounts, analytics } =
          await import("@shared/schema");
        const { count, sum, gte, eq, and, desc: descOrder } =
          await import("drizzle-orm");

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        const { shows } = await import("@shared/schema");
        const [
          trackCountResult,
          newTracksThisPeriodResult,
          prevTrackCountResult,
          releaseCountResult,
          newReleasesThisPeriodResult,
          prevReleaseCountResult,
          socialReachResult,
          activeSocialAccountsResult,
          revenueResult,
          prevRevenueResult,
          prevSocialReachResult,
          currentPlatformPerformance,
          previousPlatformPerformance,
          recentNotifications,
          upcomingReleasesResult,
          recentProjects,
          recentReleases,
          recentShows,
        ] = await Promise.all([
          db
            .select({ count: count() })
            .from(studioProjects)
            .where(eq(studioProjects.userId, userId)),
          // Growth badges must compare period-over-period NEW activity (like
          // revenue/socialReach below), not cumulative totals — otherwise a
          // complete stall in new tracks/releases this month can still show
          // 0% ("no change") instead of a real decline versus last month.
          db
            .select({ count: count() })
            .from(studioProjects)
            .where(
              and(
                eq(studioProjects.userId, userId),
                gte(studioProjects.createdAt, thirtyDaysAgo),
              ),
            ),
          db
            .select({ count: count() })
            .from(studioProjects)
            .where(
              and(
                eq(studioProjects.userId, userId),
                gte(studioProjects.createdAt, sixtyDaysAgo),
                sql`${studioProjects.createdAt} < ${thirtyDaysAgo}`,
              ),
            ),
          db
            .select({ count: count() })
            .from(releases)
            .where(
              and(
                eq(releases.userId, userId),
                eq(releases.status, "distributed"),
              ),
            ),
          db
            .select({ count: count() })
            .from(releases)
            .where(
              and(
                eq(releases.userId, userId),
                eq(releases.status, "distributed"),
                gte(releases.createdAt, thirtyDaysAgo),
              ),
            ),
          db
            .select({ count: count() })
            .from(releases)
            .where(
              and(
                eq(releases.userId, userId),
                eq(releases.status, "distributed"),
                gte(releases.createdAt, sixtyDaysAgo),
                sql`${releases.createdAt} < ${thirtyDaysAgo}`,
              ),
            ),
          db
            .select({ total: sum(socialAccounts.followerCount) })
            .from(socialAccounts)
            .where(
              and(
                eq(socialAccounts.userId, userId),
                eq(socialAccounts.isActive, true),
              ),
            ),
          db
            .select({ count: count() })
            .from(socialAccounts)
            .where(
              and(
                eq(socialAccounts.userId, userId),
                eq(socialAccounts.isActive, true),
              ),
            ),
          db
            .select({ total: sum(analytics.revenue) })
            .from(analytics)
            .where(
              and(
                eq(analytics.userId, userId),
                gte(analytics.date, thirtyDaysAgo),
              ),
            ),
          db
            .select({ total: sum(analytics.revenue) })
            .from(analytics)
            .where(
              and(
                eq(analytics.userId, userId),
                gte(analytics.date, sixtyDaysAgo),
                sql`${analytics.date} < ${thirtyDaysAgo}`,
              ),
            ),
          // Previous period social reach from analytics snapshots
          db
            .select({
              followers: sql<number>`COALESCE(MAX(${analytics.followers}), 0)`,
            })
            .from(analytics)
            .where(
              and(
                eq(analytics.userId, userId),
                gte(analytics.date, sixtyDaysAgo),
                sql`${analytics.date} < ${thirtyDaysAgo}`,
              ),
            ),
          db
            .select({
              name: analytics.platform,
              streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
              revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
            })
            .from(analytics)
            .where(
              and(
                eq(analytics.userId, userId),
                gte(analytics.date, thirtyDaysAgo),
                sql`${analytics.platform} IS NOT NULL`,
              ),
            )
            .groupBy(analytics.platform)
            .orderBy(descOrder(sql`COALESCE(SUM(${analytics.streams}), 0)`))
            .limit(5),
          db
            .select({
              name: analytics.platform,
              streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
            })
            .from(analytics)
            .where(
              and(
                eq(analytics.userId, userId),
                gte(analytics.date, sixtyDaysAgo),
                sql`${analytics.date} < ${thirtyDaysAgo}`,
                sql`${analytics.platform} IS NOT NULL`,
              ),
            )
            .groupBy(analytics.platform),
          storage.getNotifications(userId).catch(() => []),
          db
            .select()
            .from(releases)
            .where(
              and(
                eq(releases.userId, userId),
                sql`${releases.releaseDate} > NOW()`,
              ),
            )
            .orderBy(releases.releaseDate)
            .limit(5),
          // Recent activity queries
          db
            .select({
              id: studioProjects.id,
              name: studioProjects.name,
              createdAt: studioProjects.createdAt,
              genre: studioProjects.genre,
            })
            .from(studioProjects)
            .where(eq(studioProjects.userId, userId))
            .orderBy(descOrder(studioProjects.createdAt))
            .limit(5),
          db
            .select({
              id: releases.id,
              title: releases.title,
              createdAt: releases.createdAt,
              status: releases.status,
            })
            .from(releases)
            .where(eq(releases.userId, userId))
            .orderBy(descOrder(releases.createdAt))
            .limit(5),
          db
            .select({
              id: shows.id,
              name: shows.name,
              date: shows.date,
              venue: shows.venue,
              createdAt: shows.createdAt,
            })
            .from(shows)
            .where(eq(shows.userId, userId))
            .orderBy(descOrder(shows.createdAt))
            .limit(5),
        ]);

        const totalTracks = trackCountResult[0]?.count ?? 0;
        const newTracksThisPeriod = newTracksThisPeriodResult[0]?.count ?? 0;
        const prevTracks = prevTrackCountResult[0]?.count ?? 0;
        const activeDistributions = releaseCountResult[0]?.count ?? 0;
        const newReleasesThisPeriod =
          newReleasesThisPeriodResult[0]?.count ?? 0;
        const prevDistributions = prevReleaseCountResult[0]?.count ?? 0;
        const socialReach = Number(socialReachResult[0]?.total ?? 0);
        const activeSocialAccounts =
          activeSocialAccountsResult[0]?.count ?? 0;
        const totalRevenue = Number(revenueResult[0]?.total ?? 0);
        const prevRevenue = Number(prevRevenueResult[0]?.total ?? 0);
        const prevSocialReach = Number(
          prevSocialReachResult[0]?.followers ?? 0,
        );
        const growthPct = (curr: number, prev: number) =>
          prev === 0
            ? curr > 0
              ? 100
              : 0
            : Math.round(((curr - prev) / prev) * 100);
        const previousPlatformStreams = new Map(
          previousPlatformPerformance.map((platform) => [
            platform.name,
            Number(platform.streams ?? 0),
          ]),
        );
        const topPlatforms = currentPlatformPerformance.map((platform) => {
          const streams = Number(platform.streams ?? 0);
          return {
            name: platform.name!,
            streams,
            revenue: Number(platform.revenue ?? 0),
            growth: growthPct(
              streams,
              previousPlatformStreams.get(platform.name) ?? 0,
            ),
          };
        });
        const revenueDataAvailable = currentPlatformPerformance.length > 0;
        const socialReachDataAvailable = Number(activeSocialAccounts) > 0;

        // Build real recent activity feed from DB data
        const activityItems: Array<{
          type: string;
          title: string;
          description: string;
          status: string;
          timestamp: Date;
        }> = [];
        for (const p of recentProjects) {
          activityItems.push({
            type: "project",
            title: `New project: ${p.name}`,
            description: p.genre
              ? `Genre: ${p.genre}`
              : "Studio project created",
            status: "success",
            timestamp: p.createdAt ?? new Date(),
          });
        }
        for (const r of recentReleases) {
          activityItems.push({
            type: "release",
            title: `Release: ${r.title}`,
            description:
              r.status === "distributed"
                ? "Live on all platforms"
                : r.status === "draft"
                  ? "Draft — ready to submit"
                  : `Status: ${r.status}`,
            status: r.status === "distributed" ? "success" : "info",
            timestamp: r.createdAt ?? new Date(),
          });
        }
        for (const s of recentShows) {
          activityItems.push({
            type: "show",
            title: `Show: ${s.name}`,
            description: s.venue ? `At ${s.venue}` : "Live performance",
            status: "info",
            timestamp: s.createdAt ?? s.date ?? new Date(),
          });
        }
        activityItems.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        const recentActivity = activityItems.slice(0, 10);

        return res.json({
          stats: {
            totalTracks,
            activeDistributions,
            totalRevenue,
            socialReach,
            activeSocialAccounts,
            monthlyGrowth: {
              tracks: growthPct(newTracksThisPeriod, prevTracks),
              distributions: growthPct(
                newReleasesThisPeriod,
                prevDistributions,
              ),
              revenue: revenueDataAvailable
                ? growthPct(totalRevenue, prevRevenue)
                : null,
              socialReach: socialReachDataAvailable
                ? growthPct(socialReach, prevSocialReach)
                : null,
            },
          },
          dataAvailability: {
            revenue: revenueDataAvailable,
            socialReach: socialReachDataAvailable,
          },
          topPlatforms,
          recentActivity,
          upcomingReleases: upcomingReleasesResult,
          notifications: (recentNotifications || [])
            .slice(0, 5)
            .map((n) => ({ ...n, read: n.isRead, link: n.actionUrl })),
        });
      } catch (error) {
        logger.warn({ err: error }, "Dashboard error");
        return res
          .status(500)
          .json({ message: "Failed to fetch dashboard data" });
      }
    },
  );

  // Dashboard: Next action recommendation
  app.get("/api/dashboard/next-action", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user!.id;
      const {
        studioProjects,
        releases,
        socialAccounts,
        subscriptions: subscriptionsTable,
      } = await import("@shared/schema");
      const { count, eq, and } = await import("drizzle-orm");

      const [trackCount, releaseCount, socialCount, subResult] =
        await Promise.all([
          db
            .select({ count: count() })
            .from(studioProjects)
            .where(eq(studioProjects.userId, userId)),
          db
            .select({ count: count() })
            .from(releases)
            .where(eq(releases.userId, userId)),
          db
            .select({ count: count() })
            .from(socialAccounts)
            .where(
              and(
                eq(socialAccounts.userId, userId),
                eq(socialAccounts.isActive, true),
              ),
            ),
          db
            .select()
            .from(subscriptionsTable)
            .where(
              and(
                eq(subscriptionsTable.userId, userId),
                eq(subscriptionsTable.status, "active"),
              ),
            )
            .limit(1),
        ]);

      const tracks = trackCount[0]?.count ?? 0;
      const releasesCount = releaseCount[0]?.count ?? 0;
      const socials = socialCount[0]?.count ?? 0;
      const hasActiveSub = subResult.length > 0;

      if (!hasActiveSub) {
        return res.json({
          action: "subscribe",
          title: "Start Your Subscription",
          description: "Unlock all features with a Max Booster subscription.",
          ctaText: "View plans",
          ctaLink: "/pricing",
          reason: "An active subscription is required before you can publish or promote music.",
          icon: "Sparkles",
          priority: "high",
          estimatedTime: "2 minutes",
        });
      }
      if (tracks === 0) {
        return res.json({
          action: "upload_first_track",
          title: "Upload Your First Track",
          description:
            "Get started by uploading your first track to the studio.",
          ctaText: "Open studio",
          ctaLink: "/studio",
          reason: "You do not have a studio project yet.",
          icon: "Music",
          priority: "high",
          estimatedTime: "5 minutes",
        });
      }
      if (releasesCount === 0) {
        return res.json({
          action: "create_release",
          title: "Create Your First Release",
          description: "Distribute your music to 97+ platforms worldwide.",
          ctaText: "Create release",
          ctaLink: "/distribution",
          reason: "You have projects ready, but no releases have been created.",
          icon: "Upload",
          priority: "high",
          estimatedTime: "10 minutes",
        });
      }
      if (socials === 0) {
        return res.json({
          action: "connect_social",
          title: "Connect Social Media",
          description:
            "Connect your social accounts to schedule posts and grow your audience.",
          ctaText: "Connect accounts",
          ctaLink: "/settings?tab=connected-accounts",
          reason: "No active social accounts are connected.",
          icon: "Share2",
          priority: "medium",
          estimatedTime: "3 minutes",
        });
      }
      return res.json({
        action: "view_analytics",
        title: "Review Your Analytics",
        description: "Check your streaming performance and audience insights.",
        ctaText: "View analytics",
        ctaLink: "/analytics",
        reason: "You have projects, releases, and connected social accounts.",
        icon: "BarChart3",
        priority: "low",
        estimatedTime: "5 minutes",
      });
    } catch (error) {
      logger.warn({ err: error }, "Next action error");
      return res.status(500).json({ error: "Failed to determine next action" });
    }
  });

  // Mount the dedicated authenticated router before legacy overlapping handlers.
  // Its exact provider callbacks verify signatures before any persistence.
  app.use("/api/notifications", (await import("./routes/notifications.js")).default);

  // Notifications: Get all notifications
  app.get("/api/notifications", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userNotifications = await storage.getNotifications(req.user.id);
      // Map isRead to read for frontend compatibility
      const mappedNotifications = (userNotifications || []).map((n) => ({
        ...n,
        read: n.isRead,
        link: n.actionUrl,
      }));
      return res.json(mappedNotifications);
    } catch (error) {
      logger.warn({ err: error }, "Get notifications error");
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Notifications: Mark as read (PUT for frontend compatibility)
  app.put(
    "/api/notifications/:id/read",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { id } = req.params as Record<string, string>;
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
        logger.warn({ err: error }, "Mark notification read error");
        return res
          .status(500)
          .json({ message: "Failed to mark notification as read" });
      }
    },
  );

  // Notifications: Mark all as read (PUT for frontend compatibility)
  app.put(
    "/api/notifications/mark-all-read",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        await storage.markAllNotificationsRead(req.user.id);
        return res.json({ success: true });
      } catch (error) {
        logger.warn({ err: error }, "Mark all read error");
        return res.status(500).json({ message: "Failed to mark all as read" });
      }
    },
  );

  // Notifications: Clear all notifications
  app.delete(
    "/api/notifications/clear-all",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        await storage.deleteAllNotifications(req.user.id);
        return res.json({ success: true });
      } catch (error) {
        logger.warn({ err: error }, "Clear all notifications error");
        return res
          .status(500)
          .json({ message: "Failed to clear all notifications" });
      }
    },
  );

  // Mobile Device Tokens: Remove (must be before /:id wildcard)
  app.delete(
    "/api/notifications/mobile-tokens",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { token } = req.body;
        const { mobilePushService } = await import(
          "./services/mobilePushService.js"
        );
        if (token) {
          await mobilePushService.deactivateToken(token);
        } else {
          await mobilePushService.removeUserTokens(req.user.id);
        }
        return res.json({
          success: true,
          outcome: {
            type: "channel_toggled",
            success: true,
            message: token
              ? "Mobile device unregistered"
              : "All mobile devices unregistered",
          },
        });
      } catch (error) {
        logger.warn({ err: error }, "Mobile token remove error:");
        return res
          .status(500)
          .json({ error: "Failed to remove mobile device token" });
      }
    },
  );

  // Notifications: Delete notification
  app.delete("/api/notifications/:id", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { id } = req.params as Record<string, string>;
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
      logger.warn({ err: error }, "Delete notification error");
      return res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Notifications: Mark as read
  app.post(
    "/api/notifications/:id/read",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { id } = req.params as Record<string, string>;

        // Verify the notification belongs to this user
        const notification = await storage.getNotificationById(id);
        if (!notification) {
          return res.status(404).json({ message: "Notification not found" });
        }
        if (notification.userId !== req.user.id) {
          return res
            .status(403)
            .json({ message: "Not authorized to mark this notification" });
        }

        // Mark as read
        await storage.markNotificationRead(id);

        return res.json({
          success: true,
          message: "Notification marked as read",
        });
      } catch (error) {
        logger.warn({ err: error }, "Mark notification read error");
        return res
          .status(500)
          .json({ message: "Failed to mark notification as read" });
      }
    },
  );

  // Notifications: Mark all as read
  app.post(
    "/api/notifications/read-all",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        await storage.markAllNotificationsRead(req.user.id);
        return res.json({
          success: true,
          message: "All notifications marked as read",
        });
      } catch (error) {
        logger.warn({ err: error }, "Mark all notifications read error");
        return res
          .status(500)
          .json({ message: "Failed to mark all notifications as read" });
      }
    },
  );

  // Notifications: Mark all as read (alias for frontend compatibility)
  app.post(
    "/api/notifications/mark-all-read",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        await storage.markAllNotificationsRead(req.user.id);
        return res.json({
          success: true,
          message: "All notifications marked as read",
        });
      } catch (error) {
        logger.warn({ err: error }, "Mark all notifications read error");
        return res
          .status(500)
          .json({ message: "Failed to mark all notifications as read" });
      }
    },
  );

  // Notifications: Test endpoint
  app.post("/api/notifications/test", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      // Create a test notification in the database
      const notification = await storage.createNotification({
        userId: req.user.id,
        type: "system",
        title: "Test Notification",
        message:
          "This is a test notification to verify the system is working correctly.",
        actionUrl: "/dashboard",
      });

      // Broadcast via WebSocket if available
      if (
        typeof (
          global as typeof globalThis & {
            broadcastNotification?: (
              userId: string,
              data: Record<string, unknown>,
            ) => void;
          }
        ).broadcastNotification === "function"
      ) {
        (
          global as typeof globalThis & {
            broadcastNotification?: (
              userId: string,
              data: Record<string, unknown>,
            ) => void;
          }
        ).broadcastNotification!(req.user.id, {
          ...notification,
          read: notification.isRead,
          link: notification.actionUrl,
        });
      }

      return res.json({
        success: true,
        message: "Test notification sent",
        notification,
      });
    } catch (error) {
      logger.warn({ err: error }, "Test notification error");
      return res
        .status(500)
        .json({ message: "Failed to send test notification" });
    }
  });

  // Notifications: Get preferences
  app.get(
    "/api/notifications/preferences",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const user = await storage.getUser(req.user.id);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const savedPrefs = user.notificationSettings as Record<
          string,
          unknown
        > | null;

        const defaultPrefs = {
          muteAll: false,
          quietHours: {
            enabled: false,
            startTime: "22:00",
            endTime: "08:00",
            timezone: "America/New_York",
            allowUrgent: true,
          },
          email: {
            enabled: true,
            frequency: "instant",
            categories: {
              account_security: true,
              distribution: true,
              social_media: true,
              marketplace: true,
              royalties: true,
              collaboration: true,
              system: true,
              direct_interaction: true,
              platform_generated: false,
              content_based: true,
              engagement_summary: true,
              location_based: false,
            },
          },
          push: {
            enabled: false,
            categories: {
              account_security: true,
              distribution: true,
              social_media: false,
              marketplace: true,
              royalties: true,
              collaboration: true,
              system: true,
              direct_interaction: true,
              platform_generated: false,
              content_based: false,
              engagement_summary: false,
              location_based: false,
            },
          },
          sms: {
            enabled: false,
            phoneNumber: null,
            verified: false,
            categories: {
              account_security: true,
              royalties: true,
            },
          },
          inApp: {
            enabled: true,
            sound: true,
            desktop: true,
          },
        };

        if (!savedPrefs) {
          return res.json(defaultPrefs);
        }

        const merged = {
          ...defaultPrefs,
          ...savedPrefs,
          quietHours: {
            ...defaultPrefs.quietHours,
            ...((savedPrefs.quietHours as Record<string, unknown>) || {}),
          },
          email: {
            ...defaultPrefs.email,
            ...((savedPrefs.email as Record<string, unknown>) || {}),
            categories: {
              ...defaultPrefs.email.categories,
              ...(((savedPrefs.email as Record<string, unknown>)
                .categories as Record<string, unknown>) || {}),
            },
          },
          push: {
            ...defaultPrefs.push,
            ...((savedPrefs.push as Record<string, unknown>) || {}),
            categories: {
              ...defaultPrefs.push.categories,
              ...(((savedPrefs.push as Record<string, unknown>)
                .categories as Record<string, unknown>) || {}),
            },
          },
          sms: {
            ...defaultPrefs.sms,
            ...((savedPrefs.sms as Record<string, unknown>) || {}),
            categories: {
              ...defaultPrefs.sms.categories,
              ...(((savedPrefs.sms as Record<string, unknown>)
                .categories as Record<string, unknown>) || {}),
            },
          },
          inApp: {
            ...defaultPrefs.inApp,
            ...((savedPrefs.inApp as Record<string, unknown>) || {}),
          },
        };

        return res.json(merged);
      } catch (error) {
        logger.warn({ err: error }, "Get notification preferences error");
        return res
          .status(500)
          .json({ error: "Failed to get notification preferences" });
      }
    },
  );

  // Notifications: Update preferences
  app.put(
    "/api/notifications/preferences",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const newPreferences = req.body as Record<string, unknown>;
        await storage.updateUser(req.user.id, {
          notificationSettings: newPreferences,
        });

        let outcomeType = "preference_saved";
        let outcomeMessage = "Notification preferences updated";

        if (newPreferences.muteAll !== undefined) {
          outcomeType = "mute_toggled";
          outcomeMessage = newPreferences.muteAll
            ? "All notifications muted"
            : "Notifications unmuted";
        } else if (
          (newPreferences.quietHours as Record<string, unknown>).enabled !==
          undefined
        ) {
          outcomeType = "quiet_hours_set";
          outcomeMessage = (
            newPreferences.quietHours as Record<string, unknown>
          ).enabled
            ? "Quiet hours enabled"
            : "Quiet hours disabled";
        } else if (
          (newPreferences.email as Record<string, unknown>).frequency
        ) {
          outcomeType = "digest_changed";
          outcomeMessage = `Email digest set to ${(newPreferences.email as Record<string, unknown>).frequency}`;
        }

        return res.json({
          success: true,
          outcome: {
            type: outcomeType,
            success: true,
            message: outcomeMessage,
          },
        });
      } catch (error) {
        logger.warn({ err: error }, "Update notification preferences error");
        return res
          .status(500)
          .json({ message: "Failed to update preferences" });
      }
    },
  );

  // Push Notifications: Get VAPID public key
  app.get(
    "/api/notifications/push-key",
    async (_req: Request, res: Response) => {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      if (!publicKey) {
        return res
          .status(503)
          .json({ message: "Push notifications not configured" });
      }
      return res.json({ publicKey });
    },
  );

  // Push Notifications: Save subscription
  app.post(
    "/api/notifications/push-subscriptions",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys.p256dh || !keys.auth) {
          return res
            .status(400)
            .json({ message: "Invalid push subscription data" });
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
              userAgent: req.headers["user-agent"] || null,
              updatedAt: new Date(),
            })
            .where(eq(pushSubscriptions.endpoint, endpoint));
        } else {
          await db.insert(pushSubscriptions).values({
            userId: req.user.id,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            userAgent: req.headers["user-agent"] || null,
          });
        }

        // Auto-enable push in notification settings when user subscribes.
        // The user has already granted browser permission — honour that intent.
        try {
          const currentSettings =
            (req.user.notificationSettings as Record<string, unknown>) || {};
          const currentPush =
            (currentSettings.push as Record<string, unknown>) || {};
          if (currentPush.enabled !== true) {
            await db
              .update(users)
              .set({
                notificationSettings: {
                  ...currentSettings,
                  push: { ...currentPush, enabled: true },
                },
              })
              .where(eq(users.id, req.user.id));
          }
        } catch (settingsErr) {
          logger.warn(
            { err: settingsErr },
            "Push subscribe: could not auto-enable push setting (non-fatal)",
          );
        }

        return res.json({ success: true, message: "Push subscription saved" });
      } catch (error) {
        logger.warn({ err: error }, "Save push subscription error");
        return res
          .status(500)
          .json({ message: "Failed to save push subscription" });
      }
    },
  );

  // Push Notifications: Remove subscription
  app.delete(
    "/api/notifications/push-subscriptions",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { endpoint } = req.body;
        if (endpoint) {
          await db
            .delete(pushSubscriptions)
            .where(
              and(
                eq(pushSubscriptions.endpoint, endpoint),
                eq(pushSubscriptions.userId, req.user.id),
              ),
            );
        } else {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, req.user.id));
        }
        return res.json({
          success: true,
          message: "Push subscription removed",
        });
      } catch (error) {
        logger.warn({ err: error }, "Remove push subscription error");
        return res
          .status(500)
          .json({ message: "Failed to remove push subscription" });
      }
    },
  );

  // Push Notifications: Get subscription status
  app.get(
    "/api/notifications/push-subscriptions/status",
    async (req: Request, res: Response) => {
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
          devices: subs.map((s) => ({
            id: s.id,
            userAgent: s.userAgent,
            createdAt: s.createdAt,
          })),
        });
      } catch (error) {
        logger.warn({ err: error }, "Get push subscription status error");
        return res
          .status(500)
          .json({ message: "Failed to get subscription status" });
      }
    },
  );

  // Push Notifications: Send test push (all channels)
  app.post(
    "/api/notifications/push-test",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { notificationDispatcher } = await import(
          "./services/notificationDispatcher.js"
        );
        const result = await notificationDispatcher.sendTestToUser(req.user.id);
        return res.json({
          success: true,
          push: result,
          message:
            result.totalSent > 0
              ? `Test push sent to ${result.totalSent} device(s) via [${result.channels.join(", ")}]`
              : "No push subscriptions registered",
        });
      } catch (error) {
        logger.warn({ err: error }, "Test push notification error");
        return res
          .status(500)
          .json({ message: "Failed to send test push notification" });
      }
    },
  );

  // SMS Notifications: Request phone verification code (Twilio Verify API)
  app.post(
    "/api/notifications/sms/verify",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { phoneNumber } = req.body;
        if (!phoneNumber)
          return res.status(400).json({ message: "Phone number is required" });

        // Normalize to E.164 using libphonenumber-js
        const { parsePhoneNumber, isValidPhoneNumber } = await import(
          "libphonenumber-js"
        );
        let e164Phone: string;
        try {
          const parsed = parsePhoneNumber(phoneNumber as string, "US");
          if (!parsed || !isValidPhoneNumber(phoneNumber as string, "US")) {
            return res
              .status(400)
              .json({
                message:
                  "Invalid phone number. Please include country code, e.g. +1 (555) 123-4567",
              });
          }
          e164Phone = parsed.format("E.164");
        } catch {
          return res
            .status(400)
            .json({ message: "Invalid phone number format" });
        }

        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
        const verifyTemplateSid = process.env.TWILIO_VERIFY_TEMPLATE_SID;

        if (twilioSid && twilioToken && verifyServiceSid) {
          // ✅ Production path — Twilio Verify API handles code generation, delivery,
          // expiry, retry limits, fraud guard, and global routing automatically.
          // The Verify Service friendly name ("Max Booster") appears in the default
          // message: "Your Max Booster verification code is: XXXXXX"
          // Set TWILIO_VERIFY_TEMPLATE_SID to use a fully custom branded template.
          const twilio = (await import("twilio")).default;
          const client = twilio(twilioSid, twilioToken);

          const verifyParams = {
            to: e164Phone,
            channel: "sms" as const,
            ...(verifyTemplateSid ? { templateSid: verifyTemplateSid } : {}),
          };

          const verification = await client.verify.v2
            .services(verifyServiceSid)
            .verifications.create(verifyParams);

          if (verification.status !== "pending") {
            logger.warn(
              { status: verification.status },
              "[SMS] Unexpected Verify status",
            );
            return res
              .status(502)
              .json({
                message:
                  "Failed to send your Max Booster verification code. Please try again.",
              });
          }

          // Store the normalized phone number (code is managed by Twilio — no DB storage needed)
          const user = await storage.getUser(req.user.id);
          if (!user) {
            return res.status(404).json({ message: "User not found" });
          }
          const currentSettings =
            (user.notificationSettings as Record<string, unknown>) || {};
          await storage.updateUser(req.user.id, {
            notificationSettings: {
              ...currentSettings,
              sms: {
                ...((currentSettings.sms as Record<string, unknown>) || {}),
                phoneNumber: e164Phone,
                verified: false,
              },
            },
          });

          logger.info(
            `[SMS] Max Booster verify code dispatched to ${e164Phone.slice(0, 5)}*** (sid: ${verification.sid})`,
          );
          return res.json({
            success: true,
            message:
              "A Max Booster verification code has been sent to your phone.",
          });
        }

        // ✅ Middle path — Twilio credentials + Messaging Service or phone number but no Verify Service.
        // Sends a branded SMS directly via Twilio Messages API.
        // Messaging Service SID is preferred (matches "Max Booster" service name in console).
        const verificationCode = crypto.randomInt(100000, 1000000).toString();
        if (twilioSid && twilioToken && (messagingServiceSid || twilioPhone)) {
          const twilio = (await import("twilio")).default;
          const client = twilio(twilioSid, twilioToken);
          const smsBody =
            `Your Max Booster verification code is: ${verificationCode}\n\n` +
            `This code expires in 10 minutes. If you didn't request this, you can safely ignore this message.\n\n` +
            `— The Max Booster Team`;
          const msgParams = messagingServiceSid
            ? { to: e164Phone, messagingServiceSid, body: smsBody }
            : { to: e164Phone, from: twilioPhone as string, body: smsBody };
          await client.messages.create(msgParams);

          const user = await storage.getUser(req.user.id);
          if (!user) {
            return res.status(404).json({ message: "User not found" });
          }
          const currentSettings =
            (user.notificationSettings as Record<string, unknown>) || {};
          await storage.updateUser(req.user.id, {
            notificationSettings: {
              ...currentSettings,
              sms: {
                ...((currentSettings.sms as Record<string, unknown>) || {}),
                phoneNumber: e164Phone,
                verified: false,
                pendingVerification: verificationCode,
                pendingVerificationExpiry: Date.now() + 10 * 60 * 1000,
              },
            },
          });

          logger.info(
            `[SMS] Max Booster branded code sent to ${e164Phone.slice(0, 5)}*** via Messages API`,
          );
          return res.json({
            success: true,
            message:
              "A Max Booster verification code has been sent to your phone.",
          });
        }

        // 🔧 Dev/demo fallback — no Twilio credentials configured
        const user = await storage.getUser(req.user.id);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const currentSettings =
          (user.notificationSettings as Record<string, unknown>) || {};
        await storage.updateUser(req.user.id, {
          notificationSettings: {
            ...currentSettings,
            sms: {
              ...((currentSettings.sms as Record<string, unknown>) || {}),
              phoneNumber: e164Phone,
              verified: false,
              pendingVerification: verificationCode,
              pendingVerificationExpiry: Date.now() + 10 * 60 * 1000,
            },
          },
        });
        logger.info(
          `[SMS DEV] Max Booster verification code for ${e164Phone.slice(0, 5)}***: ${verificationCode}`,
        );
        return res.json({
          success: true,
          message:
            "Configure TWILIO_VERIFY_SERVICE_SID or TWILIO_PHONE_NUMBER to enable real SMS delivery. Demo code shown below.",
          devCode: verificationCode,
        });
      } catch (error: unknown) {
        const twilioErr = error as {
          status?: number;
          message?: string;
          code?: number;
        };
        if (twilioErr.status === 429 || twilioErr.code === 60203) {
          return res
            .status(429)
            .json({
              message:
                "Too many attempts. Please wait before requesting another code.",
            });
        }
        if (twilioErr.code === 60200) {
          return res
            .status(400)
            .json({
              message: "Invalid phone number. Please check and try again.",
            });
        }
        logger.warn({ err: error }, "SMS verify error");
        return res
          .status(500)
          .json({ message: "Failed to send verification code" });
      }
    },
  );

  // SMS Notifications: Confirm verification code (Twilio Verify API check)
  app.post(
    "/api/notifications/sms/confirm",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { code, phoneNumber } = req.body;
        if (!code)
          return res
            .status(400)
            .json({ message: "Verification code is required" });

        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Resolve phone: prefer what was sent, fall back to what's stored
        const user = await storage.getUser(req.user.id);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const currentSettings =
          (user.notificationSettings as Record<string, unknown>) || {};
        const smsSettings =
          (currentSettings.sms as Record<string, unknown>) || {};
        const storedPhone = smsSettings.phoneNumber as string | undefined;
        const toPhone = (phoneNumber as string | undefined) || storedPhone;

        if (!toPhone) {
          return res
            .status(400)
            .json({
              message: "Phone number not found. Please restart verification.",
            });
        }

        if (twilioSid && twilioToken && verifyServiceSid) {
          // ✅ Production path — Twilio Verify checks the code
          const twilio = (await import("twilio")).default;
          const client = twilio(twilioSid, twilioToken);

          const check = await client.verify.v2
            .services(verifyServiceSid)
            .verificationChecks.create({
              to: toPhone,
              code: (code as string).trim(),
            });

          if (check.status !== "approved") {
            return res
              .status(400)
              .json({
                message:
                  "Invalid or expired verification code. Please try again.",
              });
          }
        } else {
          // 🔧 Dev/demo fallback — validate against stored code
          const pendingCode = smsSettings.pendingVerification as
            | string
            | undefined;
          const expiry = smsSettings.pendingVerificationExpiry as
            | number
            | undefined;
          if (!pendingCode)
            return res
              .status(400)
              .json({
                message: "No pending verification. Please request a new code.",
              });
          if (expiry && Date.now() > expiry)
            return res
              .status(400)
              .json({ message: "Code expired. Please request a new one." });
          if (pendingCode !== (code as string).trim())
            return res
              .status(400)
              .json({ message: "Invalid verification code." });
        }

        // Mark phone as verified in user settings
        await storage.updateUser(req.user.id, {
          notificationSettings: {
            ...currentSettings,
            sms: {
              ...smsSettings,
              phoneNumber: toPhone,
              verified: true,
              pendingVerification: null,
              pendingVerificationExpiry: null,
            },
          },
        });

        logger.info(`[SMS] Phone verified for user ${req.user.id}`);
        return res.json({
          success: true,
          message: "Phone number verified — SMS notifications are now active.",
        });
      } catch (error: unknown) {
        const twilioErr = error as { status?: number; code?: number };
        if (twilioErr.code === 60202) {
          return res
            .status(400)
            .json({
              message: "Max check attempts reached. Please request a new code.",
            });
        }
        logger.warn({ err: error }, "SMS confirm error");
        return res
          .status(500)
          .json({ message: "Failed to confirm verification code" });
      }
    },
  );

  // Push Notifications: Enhanced multi-channel status
  app.get(
    "/api/notifications/push/status",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { notificationDispatcher } = await import(
          "./services/notificationDispatcher.js"
        );
        const { desktopPushService } = await import(
          "./services/desktopPushService.js"
        );
        const { mobilePushService } = await import(
          "./services/mobilePushService.js"
        );
        const [breakdown, mobileStatus, serviceStatus] = await Promise.all([
          desktopPushService.getSubscriptionBreakdown(req.user.id),
          mobilePushService.getUserTokenStatus(req.user.id),
          Promise.resolve(notificationDispatcher.getStatus()),
        ]);
        return res.json({
          services: serviceStatus,
          subscriptions: { web: breakdown, mobile: mobileStatus },
        });
      } catch (error) {
        logger.warn({ err: error }, "Push status error");
        return res.status(500).json({ error: "Failed to get push status" });
      }
    },
  );

  // Mobile Device Tokens: Register FCM/APNs token
  app.post(
    "/api/notifications/mobile-tokens",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { token, platform, deviceName, appVersion } = req.body;
        if (!token)
          return res.status(400).json({ error: "Device token is required" });
        if (!["android", "ios"].includes(platform)) {
          return res
            .status(400)
            .json({ error: "Platform must be android or ios" });
        }
        const { mobilePushService } = await import(
          "./services/mobilePushService.js"
        );
        await mobilePushService.registerToken(
          req.user.id,
          token,
          platform,
          deviceName,
          appVersion,
        );
        return res.json({
          success: true,
          outcome: {
            type: "push_permission_granted",
            success: true,
            message: `Mobile push registered for ${platform} device`,
          },
        });
      } catch (error) {
        logger.warn({ err: error }, "Mobile token register error:");
        return res
          .status(500)
          .json({ error: "Failed to register mobile device token" });
      }
    },
  );

  // Mobile Device Tokens: Get list
  app.get(
    "/api/notifications/mobile-tokens",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { mobilePushService } = await import(
          "./services/mobilePushService.js"
        );
        const status = await mobilePushService.getUserTokenStatus(req.user.id);
        return res.json(status);
      } catch (error) {
        logger.warn({ err: error }, "Mobile tokens list error:");
        return res
          .status(500)
          .json({ error: "Failed to list mobile device tokens" });
      }
    },
  );

  // Push Notifications: Silent push (background sync)
  app.post(
    "/api/notifications/push/silent",
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      try {
        const { reason = "feed_refresh" } = req.body;
        const { notificationDispatcher } = await import(
          "./services/notificationDispatcher.js"
        );
        const result = await notificationDispatcher.dispatchSilent(
          req.user.id,
          reason,
        );
        return res.json({ success: true, ...result });
      } catch (error) {
        logger.warn({ err: error }, "Silent push error:");
        return res.status(500).json({ error: "Failed to send silent push" });
      }
    },
  );

  // Notifications: Get unread count
  app.get(
    "/api/notifications/unread-count",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, req.user.id),
              eq(notifications.isRead, false),
            ),
          );
        const count = result[0].count || 0;
        return res.json({ count });
      } catch (error) {
        logger.warn({ err: error }, "Get unread count error");
        return res.json({ count: 0 });
      }
    },
  );

  // Projects: Get all projects for user
  app.get("/api/projects", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const projects = await storage.getProjectsByUserId(req.user.id);
      return res.json({ data: projects || [] });
    } catch (error) {
      logger.warn({ err: error }, "Projects error");
      return res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Projects: Create new project (supports both JSON and FormData)
  // Wrap multer in error handler to prevent server crashes
  app.post(
    "/api/projects",
    (req: Request, res: Response, next) => {
      upload.single("audio")(req, res, (err: unknown) => {
        if (err) {
          logger.warn({ err }, "Project upload error");
          const errMsg = err instanceof Error ? err.message : undefined;
          const errCode =
            err instanceof Error && "code" in err ? err.code : undefined;
          if (errCode === "LIMIT_FILE_SIZE") {
            return res
              .status(413)
              .json({ message: "File too large. Maximum size is 500MB." });
          }
          if (errMsg?.includes("Invalid file type")) {
            return res.status(400).json({ message: errMsg });
          }
          return res.status(400).json({ message: errMsg || "Upload failed" });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        let audioUrl: string | null = null;
        let fileSize: number | null = null;

        if (req.file) {
          // Direct file upload (≤ proxy limit)
          const { storeUploadedFile } = await import(
            "./middleware/uploadHandler.js"
          );
          const storedFile = await storeUploadedFile(
            req.file,
            req.user.id,
            "audio",
          );
          audioUrl = storedFile.url;
          fileSize = req.file.size;
        } else if (req.body.audioUrl) {
          // Pre-assembled chunked uploads must refer to this user's PDIM
          // object. Never persist a caller-provided local or third-party URL.
          const urlMatch =
            typeof req.body.audioUrl === "string" &&
            req.body.audioUrl.match(/^\/api\/storage\/file\/([^/?#]+)$/);
          if (!urlMatch) {
            return res.status(400).json({
              message: "audioUrl must be a Pocket Dimension storage URL",
            });
          }

          let storageKey: string;
          try {
            storageKey = decodeURIComponent(urlMatch[1]);
          } catch {
            return res
              .status(400)
              .json({ message: "audioUrl contains an invalid storage key" });
          }
          if (!storageKey.startsWith(`audio/${req.user.id}/`)) {
            return res.status(403).json({
              message: "audioUrl does not belong to the authenticated user",
            });
          }

          const { storageService } = await import(
            "./services/storageService.js"
          );
          if (!(await storageService.fileExists(storageKey))) {
            return res
              .status(400)
              .json({ message: "audioUrl does not reference a stored file" });
          }

          audioUrl = req.body.audioUrl;
          if (req.body.fileSize !== undefined && req.body.fileSize !== null) {
            const parsedFileSize = Number(req.body.fileSize);
            if (!Number.isFinite(parsedFileSize) || parsedFileSize < 0) {
              return res.status(400).json({ message: "Invalid fileSize" });
            }
            fileSize = parsedFileSize;
          }
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
        logger.warn({ err: error }, "Create project error");
        return res.status(500).json({ message: "Failed to create project" });
      }
    },
  );

  // Project royalty splits are kept separate from marketplace royalty splits:
  // these are the collaborators a project owner configures before release.
  const projectSplitRoles = new Set([
    "producer",
    "songwriter",
    "vocalist",
    "engineer",
    "instrumentalist",
    "other",
  ]);
  const validSplitPercentage = (value: unknown): number | null => {
    const percentage = typeof value === "number" ? value : Number(value);
    return Number.isFinite(percentage) && percentage > 0 && percentage <= 100
      ? percentage
      : null;
  };
  const getOwnedProject = async (projectId: string, userId: string) => {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);
    return project;
  };
  const splitTotalForProject = async (
    projectId: string,
    exceptId?: string,
  ) => {
    const existing = await db
      .select({
        id: projectRoyaltySplits.id,
        splitPercentage: projectRoyaltySplits.splitPercentage,
      })
      .from(projectRoyaltySplits)
      .where(eq(projectRoyaltySplits.projectId, projectId));
    return existing
      .filter((split) => split.id !== exceptId)
      .reduce((total, split) => total + split.splitPercentage, 0);
  };

  // Resolves a users row into the best available human-readable identity,
  // so the royalty-split UI never has to show a raw internal user ID.
  const collaboratorDisplayName = (user: {
    artistName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    email: string;
  }) =>
    user.artistName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username?.trim() ||
    user.email;

  app.get(
    "/api/projects/:projectId/royalty-splits",
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      const projectId = req.params.projectId as string;
      const project = await getOwnedProject(projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const rows = await db
        .select({
          id: projectRoyaltySplits.id,
          projectId: projectRoyaltySplits.projectId,
          collaboratorId: projectRoyaltySplits.collaboratorId,
          role: projectRoyaltySplits.role,
          splitPercentage: projectRoyaltySplits.splitPercentage,
          createdAt: projectRoyaltySplits.createdAt,
          collaboratorArtistName: users.artistName,
          collaboratorFirstName: users.firstName,
          collaboratorLastName: users.lastName,
          collaboratorUsername: users.username,
          collaboratorEmail: users.email,
        })
        .from(projectRoyaltySplits)
        .leftJoin(users, eq(projectRoyaltySplits.collaboratorId, users.id))
        .where(eq(projectRoyaltySplits.projectId, projectId));
      const splits = rows.map((r) => {
        const {
          collaboratorArtistName,
          collaboratorFirstName,
          collaboratorLastName,
          collaboratorUsername,
          collaboratorEmail,
          ...rest
        } = r;
        return {
          ...rest,
          collaboratorName: collaboratorEmail
            ? collaboratorDisplayName({
                artistName: collaboratorArtistName,
                firstName: collaboratorFirstName,
                lastName: collaboratorLastName,
                username: collaboratorUsername,
                email: collaboratorEmail,
              })
            : "Deleted user",
          collaboratorEmail,
        };
      });
      return res.json(splits);
    },
  );

  app.post(
    "/api/projects/:projectId/royalty-splits",
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      const projectId = req.params.projectId as string;
      const { collaboratorEmail, role, splitPercentage } = req.body ?? {};
      const percentage = validSplitPercentage(splitPercentage);
      if (typeof collaboratorEmail !== "string" || !collaboratorEmail.trim() || !percentage) {
        return res.status(400).json({ message: "A collaborator email and split percentage between 0 and 100 are required" });
      }
      if (typeof role !== "string" || !projectSplitRoles.has(role)) {
        return res.status(400).json({ message: "A valid collaborator role is required" });
      }
      const project = await getOwnedProject(projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      // Collaborators are identified by email, never a raw user ID: an
      // opaque-ID text field can't be visually confirmed by the project
      // owner, so a single typo would silently route real future royalty
      // earnings to an unrelated account.
      const [collaborator] = await db
        .select({
          id: users.id,
          artistName: users.artistName,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          email: users.email,
        })
        .from(users)
        .where(sql`lower(${users.email}) = lower(${collaboratorEmail.trim()})`)
        .limit(1);
      if (!collaborator) {
        return res.status(400).json({ message: "No account found with that email address" });
      }
      const total = await splitTotalForProject(projectId);
      if (total + percentage > 100.0001) {
        return res.status(400).json({ message: "Royalty splits cannot exceed 100%" });
      }
      const [split] = await db.insert(projectRoyaltySplits).values({
        projectId,
        collaboratorId: collaborator.id,
        role,
        splitPercentage: percentage,
      }).returning();
      return res.status(201).json({
        ...split,
        collaboratorName: collaboratorDisplayName(collaborator),
        collaboratorEmail: collaborator.email,
        isValid: Math.abs(total + percentage - 100) < 0.01,
      });
    },
  );

  app.put(
    "/api/projects/:projectId/royalty-splits/:splitId",
    requireUUIDParam("splitId"),
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      const projectId = req.params.projectId as string;
      const splitId = req.params.splitId as string;
      const { role, splitPercentage } = req.body ?? {};
      const percentage = validSplitPercentage(splitPercentage);
      if (!percentage || (role !== undefined && (typeof role !== "string" || !projectSplitRoles.has(role)))) {
        return res.status(400).json({ message: "Provide a valid split percentage and collaborator role" });
      }
      const project = await getOwnedProject(projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const [existing] = await db.select().from(projectRoyaltySplits)
        .where(and(eq(projectRoyaltySplits.id, splitId), eq(projectRoyaltySplits.projectId, projectId))).limit(1);
      if (!existing) return res.status(404).json({ message: "Royalty split not found" });
      const total = await splitTotalForProject(projectId, splitId);
      if (total + percentage > 100.0001) {
        return res.status(400).json({ message: "Royalty splits cannot exceed 100%" });
      }
      const [split] = await db.update(projectRoyaltySplits)
        .set({ splitPercentage: percentage, ...(role === undefined ? {} : { role }) })
        .where(eq(projectRoyaltySplits.id, splitId)).returning();
      return res.json({ ...split, isValid: Math.abs(total + percentage - 100) < 0.01 });
    },
  );

  app.delete(
    "/api/projects/:projectId/royalty-splits/:splitId",
    requireUUIDParam("splitId"),
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      const projectId = req.params.projectId as string;
      const splitId = req.params.splitId as string;
      const project = await getOwnedProject(projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const [deleted] = await db.delete(projectRoyaltySplits)
        .where(and(eq(projectRoyaltySplits.id, splitId), eq(projectRoyaltySplits.projectId, projectId)))
        .returning({ id: projectRoyaltySplits.id });
      if (!deleted) return res.status(404).json({ message: "Royalty split not found" });
      return res.json({ success: true, message: "Royalty split deleted" });
    },
  );

  // Analytics: Dashboard summary with real data (with optional period path parameter)
  app.get(
    "/api/analytics/dashboard{/:period}",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const periodParam = (req.params.period as string);
        const timeRange =
          periodParam ||
          (req.query.timeRange as string) ||
          (req.query.range as string) ||
          "30d";
        const rangeMatch = /^(\d+)(d|y)$/.exec(timeRange);
        if (!rangeMatch) {
          return res.status(400).json({
            message: "timeRange must use the form '<number>d' or '<number>y'",
          });
        }
        const days =
          Number(rangeMatch[1]) * (rangeMatch[2] === "y" ? 365 : 1);
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
              lte(analytics.date, endDate),
            ),
          );

        // Get daily data for charts
        const dailyData = await db
          .select({
            date: sql<string>`DATE(${analytics.date})`,
            streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
            revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
            listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
          })
          .from(analytics)
          .where(
            and(
              eq(analytics.userId, req.user.id),
              gte(analytics.date, startDate),
              lte(analytics.date, endDate),
            ),
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
              lte(analytics.date, endDate),
            ),
          )
          .groupBy(analytics.platform)
          .orderBy(desc(sql`COALESCE(SUM(${analytics.streams}), 0)`));

        // Get user's projects for additional context
        const userProjects = await storage.getProjectsByUserId(req.user.id);
        const projectCount = userProjects.length || 0;

        // Additional revenue queries for monthly and yearly breakdowns
        const thirtyDaysAgo30 = new Date();
        thirtyDaysAgo30.setDate(thirtyDaysAgo30.getDate() - 30);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const [monthlyRevResult, yearlyRevResult] =
          await Promise.all([
            db
              .select({
                total: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
              })
              .from(analytics)
              .where(
                and(
                  eq(analytics.userId, req.user.id),
                  gte(analytics.date, thirtyDaysAgo30),
                ),
              ),
            db
              .select({
                total: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
              })
              .from(analytics)
              .where(
                and(
                  eq(analytics.userId, req.user.id),
                  gte(analytics.date, oneYearAgo),
                ),
              ),
          ]);
        const monthlyRev = parseFloat(String(monthlyRevResult[0]?.total ?? 0)) || 0;
        const yearlyRev = parseFloat(String(yearlyRevResult[0]?.total ?? 0)) || 0;

        // Compute weekly aggregations from daily data
        const weeklyMap: Record<
          string,
          { date: string; streams: number; revenue: number }
        > = {};
        for (const d of dailyData) {
          const weekStart = new Date(d.date);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const key = weekStart.toISOString().split("T")[0];
          if (!weeklyMap[key])
            weeklyMap[key] = { date: key, streams: 0, revenue: 0 };
          weeklyMap[key].streams += Number(d.streams);
          weeklyMap[key].revenue += parseFloat(String(d.revenue)) || 0;
        }
        const weeklyData = Object.values(weeklyMap).sort((a, b) =>
          a.date.localeCompare(b.date),
        );

        // Compute monthly aggregations from daily data
        const monthlyMap: Record<
          string,
          { date: string; streams: number; revenue: number }
        > = {};
        for (const d of dailyData) {
          const key = d.date.substring(0, 7); // YYYY-MM
          if (!monthlyMap[key])
            monthlyMap[key] = { date: key, streams: 0, revenue: 0 };
          monthlyMap[key].streams += Number(d.streams);
          monthlyMap[key].revenue += parseFloat(String(d.revenue)) || 0;
        }
        const monthlyData = Object.values(monthlyMap).sort((a, b) =>
          a.date.localeCompare(b.date),
        );

        // Aggregate platform reports do not identify a release, so per-release
        // totals cannot be derived honestly from this data.
        const byTrack: Array<Record<string, never>> = [];

        // Calculate performance score
        let performanceScore = 25;
        if (projectCount > 0) performanceScore += 15;
        if (projectCount >= 3) performanceScore += 10;
        if (projectCount >= 5) performanceScore += 10;
        if (req.user.subscriptionTier && req.user.subscriptionTier !== "free")
          performanceScore += 15;
        if (req.user.onboardingCompleted) performanceScore += 10;
        if (req.user.twoFactorEnabled) performanceScore += 5;
        if (req.user.firstName || req.user.lastName) performanceScore += 5;
        if (req.user.bio) performanceScore += 5;
        performanceScore = Math.min(performanceScore, 100);

        const stats = analyticsData[0] || {
          totalStreams: 0,
          totalRevenue: 0,
          totalListeners: 0,
        };

        return res.json({
          overview: {
            totalStreams: Number(stats.totalStreams) || 0,
            totalRevenue: parseFloat(String(stats.totalRevenue)) || 0,
            totalListeners: Number(stats.totalListeners) || 0,
            totalPlays: Number(stats.totalStreams) || 0,
            avgListenTime: null,
            completionRate: null,
            skipRate: null,
            shareRate: null,
            likeRate: null,
            growthRate:
              dailyData.length > 1 && Number(dailyData[0].streams) > 0
                ? ((Number(dailyData[dailyData.length - 1].streams) -
                    Number(dailyData[0].streams)) /
                    Number(dailyData[0].streams)) *
                  100
                : null,
          },
          streams: {
            daily: dailyData.map((d) => ({
              date: d.date,
              streams: Number(d.streams),
              revenue: parseFloat(String(d.revenue)) || 0,
              listeners: Number(d.listeners),
            })),
            weekly: weeklyData,
            monthly: monthlyData,
            yearly:
              monthlyData.length > 0
                ? [
                    {
                      date: new Date().getFullYear().toString(),
                      streams: Number(stats.totalStreams) || 0,
                      revenue: yearlyRev,
                    },
                  ]
                : [],
            byPlatform: platformData.map((p) => ({
              platform: p.platform || "Unknown",
              streams: Number(p.streams),
              revenue: parseFloat(String(p.revenue)) || 0,
              growth: null,
            })),
            byTrack,
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
            newListeners: null,
            returningListeners: null,
            listenerRetention: null,
            avgSessionDuration: null,
            sessionsPerListener: null,
            listenerGrowth: null,
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
            listenerPredictions: null,
          },
          revenue: {
            totalRevenue: parseFloat(String(stats.totalRevenue)) || 0,
            monthlyRevenue: monthlyRev,
            yearlyRevenue: yearlyRev,
            revenueGrowth:
              yearlyRev > 0 && monthlyRev > 0
                ? (monthlyRev / (yearlyRev / 12) - 1) * 100
                : null,
            revenuePerStream:
              Number(stats.totalStreams) > 0
                ? parseFloat(String(stats.totalRevenue)) /
                  Number(stats.totalStreams)
                : null,
            revenuePerListener: null,
            revenueByPlatform: platformData.map((p) => ({
              platform: p.platform || "Unknown",
              revenue: parseFloat(String(p.revenue)) || 0,
              percentage:
                Number(stats.totalRevenue) > 0
                  ? (parseFloat(String(p.revenue)) /
                      parseFloat(String(stats.totalRevenue))) *
                    100
                  : 0,
            })),
            revenueByTrack: [],
            revenueByCountry: [],
            revenueBySource: [],
            revenueByTime: [],
            revenueByDemographics: [],
            revenuePredictions: null,
            revenueOptimization: [],
            revenueStreams: [],
            revenueForecasting: [],
          },
          fanJourney: null,
          cohorts: [],
          churn: [],
          playlists: null,
          revenueAttribution: platformData.map((p) => ({
            source: p.platform || "Unknown",
            revenue: parseFloat(String(p.revenue)) || 0,
            percentage:
              Number(stats.totalRevenue) > 0
                ? (parseFloat(String(p.revenue)) /
                    parseFloat(String(stats.totalRevenue))) *
                  100
                : 0,
            streams: Number(p.streams),
            growth: null,
            avgPerStream:
              Number(p.streams) > 0
                ? parseFloat(String(p.revenue)) / Number(p.streams)
                : null,
          })),
          geographic: [],
          demographics: [],
          forecasts: [],
          aiInsights: {
            performanceScore,
            recommendations:
              projectCount === 0
                ? [
                    {
                      title: "Upload Your First Track",
                      description:
                        "Get started by uploading music to distribute",
                      priority: "high",
                      impact: "high",
                    },
                  ]
                : [
                    {
                      title: "Promote on Social Media",
                      description: "Share your music across social platforms",
                      priority: "medium",
                      impact: "medium",
                    },
                  ],
            predictions: {
              nextMonthStreams: 0,
              nextMonthRevenue: 0,
              viralPotential: 0,
              growthTrend: "stable",
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
        logger.warn({ err: error }, "Analytics dashboard error");
        return res.status(500).json({ message: "Failed to fetch analytics" });
      }
    },
  );

  // Analytics: Export data
  app.post("/api/analytics/export", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { format = "csv", filters = {} } = req.body;
      if (format !== "csv") {
        return res.status(400).json({
          message: "Only CSV export is currently available for analytics data",
        });
      }
      const { timeRange = "30d" } = filters;
      const rangeMatch = /^(\d+)(d|y)$/.exec(String(timeRange));
      if (!rangeMatch) {
        return res.status(400).json({
          message: "timeRange must use the form '<number>d' or '<number>y'",
        });
      }
      const days =
        Number(rangeMatch[1]) * (rangeMatch[2] === "y" ? 365 : 1);
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
            lte(analytics.date, endDate),
          ),
        )
        .groupBy(sql`DATE(${analytics.date})`, analytics.platform)
        .orderBy(sql`DATE(${analytics.date})`);

      if (format === "csv") {
        const csvRows = ["Date,Platform,Streams,Revenue,Listeners"];
        analyticsData.forEach((row) => {
          csvRows.push(
            `${row.date},${row.platform || "Unknown"},${row.streams},${row.revenue},${row.listeners}`,
          );
        });

        const csvContent = csvRows.join("\n");
        const base64Data = Buffer.from(csvContent).toString("base64");

        return res.json({
          format: "csv",
          downloadUrl: `data:text/csv;base64,${base64Data}`,
          fileName: `analytics-${new Date().toISOString().split("T")[0]}.csv`,
          size: Buffer.byteLength(csvContent),
        });
      }

      return res.json({
        format,
        data: analyticsData,
      });
    } catch (error) {
      logger.warn({ err: error }, "Analytics export error");
      return res.status(500).json({ message: "Failed to export analytics" });
    }
  });

  // Analytics: Get anomalies summary
  app.get(
    "/api/analytics/anomalies/summary",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const metricsData = await db
          .select({
            date: sql<string>`DATE(${analytics.date})`,
            streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
            revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
            streamsAcknowledged: sql<boolean>`BOOL_OR(COALESCE((${analytics.metadata} -> 'anomalyAcknowledgements' ->> 'streams') IS NOT NULL, false))`,
            revenueAcknowledged: sql<boolean>`BOOL_OR(COALESCE((${analytics.metadata} -> 'anomalyAcknowledgements' ->> 'revenue') IS NOT NULL, false))`,
          })
          .from(analytics)
          .where(and(eq(analytics.userId, req.user.id), gte(analytics.date, thirtyDaysAgo)))
          .groupBy(sql`DATE(${analytics.date})`)
          .orderBy(sql`DATE(${analytics.date})`);
        const detected = ["streams", "revenue"].flatMap((metricType) =>
          metricsData.flatMap((point, index) => {
            const history = metricsData
              .slice(Math.max(0, index - 7), index)
              .map((row) => Number(row[metricType as "streams" | "revenue"]))
              .filter((value) => Number.isFinite(value));
            if (history.length < 7) return [];
            const mean = history.reduce((sum, value) => sum + value, 0) / (history.length || 1);
            const variance = history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (history.length || 1);
            const standardDeviation = Math.sqrt(variance);
            const current = Number(point[metricType as "streams" | "revenue"]);
            if (standardDeviation === 0 || Math.abs((current - mean) / standardDeviation) < 2) return [];
            const zScore = (current - mean) / standardDeviation;
            const severity = Math.abs(zScore) >= 3 ? "critical" : "warning";
            return [{
              metricType,
              severity,
              acknowledged: metricType === "streams" ? point.streamsAcknowledged : point.revenueAcknowledged,
            }];
          }),
        );
        const bySeverity = { critical: 0, warning: 0, info: 0 };
        const byMetric: Record<string, number> = {};
        for (const anomaly of detected) {
          bySeverity[anomaly.severity as "critical" | "warning" | "info"]++;
          byMetric[anomaly.metricType] = (byMetric[anomaly.metricType] || 0) + 1;
        }
        return res.json({
          total: detected.length,
          unacknowledged: detected.filter((anomaly) => !anomaly.acknowledged).length,
          bySeverity,
          byMetric,
        });
      } catch (error) {
        logger.warn({ err: error }, "Anomalies summary error");
        return res
          .status(500)
          .json({ message: "Failed to fetch anomalies summary" });
      }
    },
  );

  // Analytics: Get anomalies list
  app.get("/api/analytics/anomalies", requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
          streamsAcknowledged: sql<boolean>`BOOL_OR(COALESCE((${analytics.metadata} -> 'anomalyAcknowledgements' ->> 'streams') IS NOT NULL, false))`,
          revenueAcknowledged: sql<boolean>`BOOL_OR(COALESCE((${analytics.metadata} -> 'anomalyAcknowledgements' ->> 'revenue') IS NOT NULL, false))`,
        })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, req.user.id),
            gte(analytics.date, thirtyDaysAgo),
          ),
        )
        .groupBy(sql`DATE(${analytics.date})`)
        .orderBy(sql`DATE(${analytics.date})`);

      const anomalies: Record<string, unknown>[] = [];
      for (const metric of ["streams", "revenue"] as const) {
        for (let index = 7; index < metricsData.length; index++) {
          const history = metricsData.slice(index - 7, index).map((row) => Number(row[metric]));
          const mean = history.reduce((sum, value) => sum + value, 0) / (history.length || 1);
          const variance = history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (history.length || 1);
          const standardDeviation = Math.sqrt(variance);
          const current = Number(metricsData[index][metric]);
          if (standardDeviation === 0) continue;
          const zScore = (current - mean) / standardDeviation;
          if (Math.abs(zScore) < 2) continue;
          const deviationPercentage = mean === 0 ? null : Number((((current - mean) / mean) * 100).toFixed(1));
          anomalies.push({
            id: `${metric}:${metricsData[index].date}`,
            metricType: metric,
            severity: Math.abs(zScore) >= 3 ? "critical" : "warning",
            detectedAt: metricsData[index].date,
            deviationPercentage,
            description: `${metric === "streams" ? "Stream count" : "Revenue"} is ${zScore > 0 ? "above" : "below"} its trailing 7-day baseline (z-score ${zScore.toFixed(2)})`,
            acknowledged: metric === "streams" ? metricsData[index].streamsAcknowledged : metricsData[index].revenueAcknowledged,
          });
        }
      }

      // Filter by metricType and severity if provided
      let filteredAnomalies = anomalies;
      if (metricType && metricType !== "all") {
        filteredAnomalies = filteredAnomalies.filter(
          (a) => a.metricType === metricType,
        );
      }
      if (severity && severity !== "all") {
        filteredAnomalies = filteredAnomalies.filter(
          (a) => a.severity === severity,
        );
      }

      return res.json({ data: filteredAnomalies });
    } catch (error) {
      logger.warn({ err: error }, "Anomalies list error");
      return res.status(500).json({ message: "Failed to fetch anomalies" });
    }
  });

  // Analytics: Acknowledge anomaly
  app.post(
    "/api/analytics/anomalies/:id/acknowledge",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { id } = req.params as Record<string, string>;
        const match = /^(streams|revenue):(\d{4}-\d{2}-\d{2})$/.exec(id);
        if (!match) {
          return res.status(400).json({ message: "Invalid anomaly id" });
        }
        const [, metricType, date] = match;
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        const updated = await db
          .update(analytics)
          .set({
            metadata: sql`jsonb_set(COALESCE(${analytics.metadata}, '{}'::jsonb), ARRAY['anomalyAcknowledgements', ${metricType}], to_jsonb(${new Date().toISOString()}::text), true)`,
          })
          .where(and(eq(analytics.userId, req.user.id), gte(analytics.date, dayStart), lte(analytics.date, dayEnd)))
          .returning({ id: analytics.id });
        if (updated.length === 0) {
          return res.status(404).json({ message: "Analytics data for this anomaly was not found" });
        }
        return res.json({
          success: true,
          id,
          acknowledged: true,
        });
      } catch (error) {
        logger.warn({ err: error }, "Acknowledge anomaly error");
        return res
          .status(500)
          .json({ message: "Failed to acknowledge anomaly" });
      }
    },
  );

  // Analytics: Track event (for dashboard widgets)
  app.post(
    "/api/analytics/track-event",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { eventType, eventData = {} } = req.body;

        if (typeof eventType !== "string" || !eventType.trim()) {
          return res.status(400).json({ message: "Event type is required" });
        }
        if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
          return res.status(400).json({ message: "eventData must be an object" });
        }

        const data = eventData as Record<string, unknown>;
        const metricKeys = ["streams", "revenue", "totalListeners", "followers"] as const;
        const values: Record<string, number> = {};
        for (const key of metricKeys) {
          if (data[key] === undefined) continue;
          const value = Number(data[key]);
          if (!Number.isFinite(value) || value < 0) {
            return res.status(400).json({ message: `${key} must be a non-negative number` });
          }
          values[key] = value;
        }
        const occurredAt = data.occurredAt ? new Date(String(data.occurredAt)) : new Date();
        if (Number.isNaN(occurredAt.getTime())) {
          return res.status(400).json({ message: "occurredAt must be a valid date" });
        }
        if (occurredAt > new Date(Date.now() + 5 * 60 * 1000)) {
          return res.status(400).json({ message: "occurredAt cannot be in the future" });
        }
        const platform =
          typeof data.platform === "string" && data.platform.trim()
            ? data.platform.trim().slice(0, 100)
            : null;
        const [event] = await db
          .insert(analytics)
          .values({
            userId: req.user.id,
            date: occurredAt,
            platform,
            streams: values.streams ?? 0,
            revenue: values.revenue ?? 0,
            totalListeners: values.totalListeners ?? 0,
            followers: values.followers ?? 0,
            metadata: { eventType: eventType.trim(), eventData: data },
          })
          .returning({ id: analytics.id, date: analytics.date });

        return res.status(201).json({ success: true, event });
      } catch (error) {
        logger.warn({ err: error }, "Track event error");
        return res.status(500).json({ message: "Failed to track event" });
      }
    },
  );

  // AI: Insights — handled by the dedicated, requireAuth + MaxCore-gated router
  // in server/routes/ai.ts (GET /api/ai/insights), which calls the real
  // unifiedAIController instead of a hand-rolled account-activity heuristic.
  // This inline copy was dead code (registered earlier, so it always shadowed
  // the real handler) and returned a fabricated "performance score" rather than
  // real insights, so it has been removed.

  // Accessibility preferences endpoints
  try {
    const accessibilityRouter = (await import("./routes/accessibility.js"))
      .default;
    app.use("/api/user", accessibilityRouter);
    log("Accessibility routes registered");
  } catch (error) {
    log(
      `Warning: Could not load accessibility routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // User preferences endpoints
  app.get("/api/user/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json(req.user.preferences || {});
    } catch (error) {
      logger.warn({ err: error }, "Error fetching user preferences");
      return res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.post("/api/user/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const preferences = { ...(req.user.preferences || {}), ...req.body };
      await db
        .update(users)
        .set({ preferences })
        .where(eq(users.id, req.user.id));
      return res.json({ success: true, preferences });
    } catch (error) {
      logger.warn({ err: error }, "Error updating user preferences");
      return res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  app.get(
    "/api/user/preferences/studio",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const prefs = req.user.preferences as Record<string, unknown>;
        return res.json(prefs.studio || {});
      } catch (error) {
        logger.warn({ err: error }, "Error fetching studio preferences");
        return res
          .status(500)
          .json({ message: "Failed to fetch studio preferences" });
      }
    },
  );

  app.put(
    "/api/user/preferences/studio",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const currentPrefs =
          (req.user.preferences as Record<string, unknown> | null) || {};
        const preferences = { ...currentPrefs, studio: req.body };
        await db
          .update(users)
          .set({ preferences })
          .where(eq(users.id, req.user.id));
        return res.json({ success: true, studio: req.body });
      } catch (error) {
        logger.warn({ err: error }, "Error updating studio preferences");
        return res
          .status(500)
          .json({ message: "Failed to update studio preferences" });
      }
    },
  );

  // Analysis endpoint
  app.get("/api/analysis", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        status: "complete",
        results: [],
        summary: { total: 0, analyzed: 0 },
      });
    } catch (error) {
      logger.warn({ err: error }, "Analysis error");
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
        type: type || "full",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn({ err: error }, "Analysis error");
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
        type: assetType || "all",
        total: 0,
      });
    } catch (error) {
      logger.warn({ err: error }, "Assets fetch error");
      return res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.post(
    "/api/assets/upload",
    async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { audioUpload, storeUploadedFile, handleUploadError } =
          await import("./middleware/uploadHandler.js");

        audioUpload.single("assetFile")(req, res, async (err: unknown) => {
          if (err) {
            return handleUploadError(err, req, res, next);
          }

          try {
            const file = req.file;
            if (!file) {
              return res.status(400).json({ message: "No file provided" });
            }

            const { name, assetType } = req.body;
            const userId = req.user!.id;

            const storedFile = await storeUploadedFile(file, userId, "audio");

            return res.json({
              success: true,
              assetId: `asset_${Date.now()}`,
              name: name || file.originalname,
              assetType: assetType || "sample",
              fileUrl: storedFile.url,
              fileSize: file.size,
              mimeType: file.mimetype,
              message: "Asset uploaded successfully",
            });
          } catch (uploadError) {
            logger.warn({ err: uploadError }, "Asset storage error");
            return res.status(500).json({ message: "Failed to store asset" });
          }
        });
      } catch (error) {
        logger.warn({ err: error }, "Asset upload error");
        return res.status(500).json({ message: "Failed to upload asset" });
      }
    },
  );

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
      logger.warn({ err: error }, "Pocket list error");
      return res.status(500).json({ message: "Failed to fetch pockets" });
    }
  });

  app.post("/api/pocket/create", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const storagePrefix = `user_${req.user.id}_${Date.now()}`;
      // Use upsert: if a pocket already exists for this user, return it
      const [pocket] = await db
        .insert(userStorage)
        .values({
          userId: req.user.id,
          storagePrefix,
          totalBytes: 0,
          fileCount: 0,
        })
        .onConflictDoUpdate({
          target: userStorage.userId,
          set: { lastAccessedAt: new Date() },
        })
        .returning();
      return res.json(pocket);
    } catch (error) {
      logger.warn({ err: error }, "Pocket create error");
      return res.status(500).json({ message: "Failed to create pocket" });
    }
  });

  app.get("/api/pocket/demo", async (_req: Request, res: Response) => {
    try {
      return res.json({
        name: "Demo Pocket",
        totalSize: 1024 * 1024 * 100,
        fileCount: 25,
        files: [],
      });
    } catch (error) {
      logger.warn({ err: error }, "Pocket demo error");
      return res.status(500).json({ message: "Failed to fetch demo pocket" });
    }
  });

  app.get(
    "/api/pocket/:pocketId/stats",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { pocketId } = req.params as Record<string, string>;
        const pocket = await db.query.userStorage.findFirst({
          where: eq(userStorage.id, pocketId),
        });
        if (pocket && pocket.userId !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        return res.json({
          id: pocketId,
          totalSize: pocket!.totalBytes || 0,
          fileCount: pocket!.fileCount || 0,
          lastUpdated: pocket!.lastAccessedAt || new Date(),
        });
      } catch (error) {
        logger.warn({ err: error }, "Pocket stats error");
        return res
          .status(500)
          .json({ message: "Failed to fetch pocket stats" });
      }
    },
  );

  app.get("/api/pocket/:pocketId/list", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { pocketId } = req.params as Record<string, string>;
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
      logger.warn({ err: error }, "Pocket files error");
      return res.status(500).json({ message: "Failed to fetch pocket files" });
    }
  });

  app.post(
    "/api/pocket/:pocketId/write",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { pocketId } = req.params as Record<string, string>;
        const pocket = await db.query.userStorage.findFirst({
          where: eq(userStorage.id, pocketId),
        });
        if (pocket && pocket.userId !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        const { filename, content, mimeType, folder } = req.body;
        if (!filename || content === undefined) {
          return res
            .status(400)
            .json({ message: "filename and content are required" });
        }
        const userId = req.user.id;
        const fileKey = `pocket/${pocketId}/${Date.now()}_${filename}`;
        const contentBuffer = Buffer.from(
          typeof content === "string" ? content : JSON.stringify(content),
        );
        const sizeBytes = contentBuffer.length;
        const [inserted] = await db
          .insert(userStorageFiles)
          .values({
            userId,
            storageId: pocketId,
            fileName: filename,
            fileKey,
            mimeType: mimeType || "text/plain",
            sizeBytes,
            folder: folder || "/",
            isPublic: false,
            metadata: { writtenAt: new Date().toISOString() },
          })
          .returning();
        return res.json({
          success: true,
          fileId: inserted.id,
          fileKey,
          pocketId,
          filename,
          sizeBytes,
          message: "File written successfully",
        });
      } catch (error) {
        logger.warn({ err: error }, "Pocket write error");
        return res.status(500).json({ message: "Failed to write to pocket" });
      }
    },
  );

  // Audit and testing endpoints — handled by the dedicated, admin + 2FA-gated
  // routers in server/routes/audit.ts (GET /api/audit/results) and
  // server/routes/testing.ts (GET /api/testing/results). Both inline copies
  // below were dead code (registered earlier, so they always shadowed the real
  // handlers) AND returned fully hardcoded fake scores with no admin/2FA gate,
  // so they have been removed rather than kept as shadowed duplicates.

  // Complete onboarding endpoint
  app.post(
    "/api/users/complete-onboarding",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        await storage.updateUser(req.user.id, {
          onboardingCompleted: true,
          onboardingStep: 100,
          onboardingData: {
            ...(req.user.onboardingData as Record<string, unknown> | null ?? {}),
            completedAt: new Date().toISOString(),
          },
        });
        return res.json({ success: true, message: "Onboarding completed" });
      } catch (error) {
        logger.warn({ err: error }, "Complete onboarding error");
        return res
          .status(500)
          .json({ message: "Failed to complete onboarding" });
      }
    },
  );

  // Get seen features for progressive disclosure
  app.get("/api/users/seen-features", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const seenFeatures = (req.user.onboardingData as any).seenFeatures || [];
      return res.json({ seenFeatures });
    } catch (error) {
      logger.warn({ err: error }, "Get seen features error");
      return res.status(500).json({ message: "Failed to get seen features" });
    }
  });

  // Mark feature as seen for progressive disclosure
  app.post(
    "/api/users/mark-feature-seen",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { featureId } = req.body;
        if (!featureId) {
          return res.status(400).json({ message: "Feature ID is required" });
        }
        const currentOnboardingData = req.user.onboardingData || {};
        const seenFeatures = (currentOnboardingData as any).seenFeatures || [];
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
        logger.warn({ err: error }, "Mark feature seen error");
        return res
          .status(500)
          .json({ message: "Failed to mark feature as seen" });
      }
    },
  );

  // Royalties download statement endpoint
  app.get(
    "/api/royalties/download-statement/:statementId",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { statementId } = req.params as Record<string, string>;
        const userId = req.user.id;
        const [statement] = await db.select().from(royaltyStatements)
          .where(and(eq(royaltyStatements.id, statementId), eq(royaltyStatements.userId, userId))).limit(1);
        const rows = statement
          ? await db.select().from(royaltyTransactions).where(and(
              eq(royaltyTransactions.userId, userId),
              gte(royaltyTransactions.createdAt, statement.periodStart),
              lte(royaltyTransactions.createdAt, statement.periodEnd),
            )).orderBy(desc(royaltyTransactions.createdAt))
          : await db.select().from(royaltyTransactions).where(and(
              eq(royaltyTransactions.id, statementId),
              eq(royaltyTransactions.userId, userId),
            )).limit(1);
        if (!statement && rows.length === 0) {
          return res.status(404).json({ message: "Statement not found" });
        }
        const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = [
          "Date,Period Start,Period End,Platform,Release,Amount,Currency,Streams,Status",
          ...rows.map((row) => [
            row.createdAt?.toISOString(), row.periodStart?.toISOString(), row.periodEnd?.toISOString(),
            row.platform, row.releaseId, row.amount, row.currency, row.streamCount, row.status,
          ].map(cell).join(",")),
        ].join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="royalty-statement-${statementId}.csv"`);
        return res.send(csv);
      } catch (error) {
        logger.warn({ err: error }, "Download statement error");
        return res
          .status(500)
          .json({ message: "Failed to generate statement download" });
      }
    },
  );

  // Royalties summary endpoint (used by royalties page header cards)
  app.get("/api/royalties/summary", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user.id;
      const [aggregates, [lastPaidRow], platformRows] = await Promise.all([
        db
          .select({
            totalEarnings: sum(royaltyTransactions.amount),
            pendingPayouts: sql<number>`coalesce(sum(case when ${royaltyTransactions.status} = 'pending' then ${royaltyTransactions.amount} else 0 end), 0)`,
          })
          .from(royaltyTransactions)
          .where(eq(royaltyTransactions.userId, userId)),

        db
          .select({ paidAt: royaltyTransactions.paidAt })
          .from(royaltyTransactions)
          .where(
            and(
              eq(royaltyTransactions.userId, userId),
              sql`${royaltyTransactions.paidAt} is not null`,
            ),
          )
          .orderBy(desc(royaltyTransactions.paidAt))
          .limit(1),

        db
          .selectDistinct({ platform: royaltyTransactions.platform })
          .from(royaltyTransactions)
          .where(eq(royaltyTransactions.userId, userId)),
      ]);

      const agg = aggregates[0];
      return res.json({
        totalEarnings: Number(agg.totalEarnings || 0),
        pendingPayouts: Number(agg.pendingPayouts || 0),
        lastPayout: lastPaidRow?.paidAt ?? null,
        platformsCount: platformRows.length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Royalties summary error");
      return res
        .status(500)
        .json({ message: "Failed to fetch royalties summary" });
    }
  });

  // Royalties endpoints — backed by real DB data
  // The royalties page's period selector (client/src/pages/Royalties.tsx)
  // only ever sends "current" | "last" | "quarter" | "year" — real calendar
  // boundaries, not rolling day counts. "last month" must exclude the
  // current month even though "now" falls inside it, so an explicit
  // optional upper bound is returned alongside the lower bound.
  function resolveRoyaltyPeriodRange(period: string | undefined): {
    since: Date;
    until?: Date;
  } {
    const now = new Date();
    switch (period) {
      case "last": {
        const since = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
          0,
          0,
          0,
          0,
        );
        // Day 0 of the current month normalizes to the last day of the
        // previous month — end-of-day so the whole last day is included.
        const until = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
          999,
        );
        return { since, until };
      }
      case "quarter": {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        return {
          since: new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0),
        };
      }
      case "year":
        return { since: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0) };
      case "current":
      default:
        return {
          since: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        };
    }
  }

  app.get("/api/royalties", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user.id;
      const { period = "current", platform } = req.query as {
        period?: string;
        platform?: string;
      };
      const pageParam = parseInt(String(req.query.page || "1"), 10);
      const limitParam = Math.min(
        Math.max(parseInt(String(req.query.limit || "100"), 10), 1),
        500,
      );
      const offset = (Math.max(pageParam, 1) - 1) * limitParam;

      const { since, until } = resolveRoyaltyPeriodRange(period);

      const conditions: import("drizzle-orm").SQL<unknown>[] = [
        eq(royaltyTransactions.userId, userId),
        gte(royaltyTransactions.createdAt, since),
      ];
      if (until) {
        conditions.push(lte(royaltyTransactions.createdAt, until));
      }
      if (platform && platform !== "all") {
        conditions.push(eq(royaltyTransactions.platform, platform));
      }
      const where = and(...conditions);

      const [aggregates, rows, [lastPaidRow]] = await Promise.all([
        db
          .select({
            totalEarnings: sum(royaltyTransactions.amount),
            totalRows: count(),
            pendingPayouts: sql<number>`coalesce(sum(case when ${royaltyTransactions.status} = 'pending' then ${royaltyTransactions.amount} else 0 end), 0)`,
          })
          .from(royaltyTransactions)
          .where(where),

        db
          .select({
            id: royaltyTransactions.id,
            releaseId: royaltyTransactions.releaseId,
            platform: royaltyTransactions.platform,
            amount: royaltyTransactions.amount,
            currency: royaltyTransactions.currency,
            streamCount: royaltyTransactions.streamCount,
            periodStart: royaltyTransactions.periodStart,
            periodEnd: royaltyTransactions.periodEnd,
            status: royaltyTransactions.status,
            transactionType: royaltyTransactions.transactionType,
            createdAt: royaltyTransactions.createdAt,
            paidAt: royaltyTransactions.paidAt,
          })
          .from(royaltyTransactions)
          .where(where)
          .orderBy(desc(royaltyTransactions.createdAt))
          .limit(limitParam)
          .offset(offset),

        db
          .select({ paidAt: royaltyTransactions.paidAt })
          .from(royaltyTransactions)
          .where(
            and(
              eq(royaltyTransactions.userId, userId),
              sql`${royaltyTransactions.paidAt} is not null`,
            ),
          )
          .orderBy(desc(royaltyTransactions.paidAt))
          .limit(1),
      ]);

      const agg = aggregates[0];
      return res.json({
        data: rows.map((row) => ({
          ...row,
          amount: Number(row.amount),
          streams: row.streamCount ?? 0,
          payoutStatus: row.status ?? "pending",
          payoutDate: row.paidAt?.toISOString(),
          period: row.periodStart && row.periodEnd
            ? `${row.periodStart.toLocaleDateString()} – ${row.periodEnd.toLocaleDateString()}`
            : row.createdAt?.toLocaleDateString() ?? "",
        })),
        totalEarnings: Number(agg.totalEarnings || 0),
        pendingPayouts: Number(agg.pendingPayouts || 0),
        lastPayout: lastPaidRow?.paidAt ?? null,
        pagination: {
          total: Number(agg.totalRows || 0),
          page: pageParam,
          limit: limitParam,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Royalties error");
      return res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  app.get(
    "/api/royalties/platform-breakdown",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const userId = req.user.id;
        const { period = "current" } = req.query as { period?: string };
        const { since, until } = resolveRoyaltyPeriodRange(period);

        const breakdownConditions = [
          eq(royaltyTransactions.userId, userId),
          gte(royaltyTransactions.createdAt, since),
        ];
        if (until) {
          breakdownConditions.push(lte(royaltyTransactions.createdAt, until));
        }

        const rows = await db
          .select({
            platform: royaltyTransactions.platform,
            totalAmount: sum(royaltyTransactions.amount),
            totalStreams: sum(royaltyTransactions.streamCount),
            transactionCount: count(royaltyTransactions.id),
          })
          .from(royaltyTransactions)
          .where(and(...breakdownConditions))
          .groupBy(royaltyTransactions.platform);

        return res.json(
          rows.map((r) => ({
            platform: r.platform || "unknown",
            earnings: Number(r.totalAmount) || 0,
            streams: Number(r.totalStreams) || 0,
            transactions: Number(r.transactionCount) || 0,
          })),
        );
      } catch (error) {
        logger.warn({ err: error }, "Platform breakdown error");
        return res
          .status(500)
          .json({ message: "Failed to fetch platform breakdown" });
      }
    },
  );

  app.get("/api/royalties/top-tracks", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const userId = req.user.id;
      const { period = "current" } = req.query as { period?: string };
      const { since, until } = resolveRoyaltyPeriodRange(period);

      const topTracksConditions = [
        eq(royaltyTransactions.userId, userId),
        gte(royaltyTransactions.createdAt, since),
      ];
      if (until) {
        topTracksConditions.push(lte(royaltyTransactions.createdAt, until));
      }

      const rows = await db
        .select({
          releaseId: royaltyTransactions.releaseId,
          totalAmount: sum(royaltyTransactions.amount),
          totalStreams: sum(royaltyTransactions.streamCount),
        })
        .from(royaltyTransactions)
        .where(and(...topTracksConditions))
        .groupBy(royaltyTransactions.releaseId)
        .orderBy(desc(sum(royaltyTransactions.amount)))
        .limit(10);

      const releaseIds = rows.map((r) => r.releaseId).filter(Boolean);
      const releaseRows =
        releaseIds.length > 0
          ? await db
              .select({ id: releases.id, title: releases.title })
              .from(releases)
              .where(inArray(releases.id, releaseIds))
          : [];
      const releaseMap = new Map(releaseRows.map((r) => [r.id, r.title]));

      return res.json(
        rows.map((r) => ({
          releaseId: r.releaseId,
          title: releaseMap.get(r.releaseId) || r.releaseId,
          earnings: Number(r.totalAmount) || 0,
          streams: Number(r.totalStreams) || 0,
        })),
      );
    } catch (error) {
      logger.warn({ err: error }, "Top tracks error");
      return res.status(500).json({ message: "Failed to fetch top tracks" });
    }
  });

  app.get(
    "/api/royalties/payment-methods",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const user = req.user!;
        const preferences = (user.preferences as any) || {};
        const prefs = preferences.payoutSettings || preferences.payout || {};
        const methods = [];
        if (user.stripeConnectedAccountId) {
          methods.push({
            id: "stripe",
            type: "stripe",
            label: "Bank Account (Stripe)",
            isDefault: !prefs.paypalEmail && !prefs.bankDetails,
          });
        }
        if (prefs.paypalEmail) {
          methods.push({
            id: "paypal",
            type: "paypal",
            label: `PayPal (${prefs.paypalEmail})`,
            isDefault: !!prefs.paypalEmail && !prefs.bankDetails,
          });
        }
        if (prefs.bankDetails) {
          methods.push({
            id: "bank",
            type: "bank_transfer",
            label: "Bank Transfer",
            isDefault: true,
          });
        }
        return res.json(methods);
      } catch (error) {
        logger.warn({ err: error }, "Payment methods error");
        return res
          .status(500)
          .json({ message: "Failed to fetch payment methods" });
      }
    },
  );

  app.post(
    "/api/royalties/payment-methods",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { type, paypalEmail, bankDetails } = req.body ?? {};
        if (type !== "paypal" && type !== "bank_transfer")
          return res
            .status(400)
            .json({ message: "Payment method must be PayPal or bank transfer" });
        if (type === "paypal" && (typeof paypalEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail.trim()))) {
          return res.status(400).json({ message: "A valid PayPal email is required" });
        }
        if (type === "bank_transfer" && (!bankDetails || ["accountHolderName", "bankName", "accountNumber", "routingNumber"].some(
          (key) => typeof bankDetails[key] !== "string" || !bankDetails[key].trim(),
        ))) {
          return res.status(400).json({ message: "Complete bank details are required" });
        }

        const user = req.user!;
        const currentPrefs = user.preferences || {};
        const updated = {
          ...currentPrefs,
          payoutSettings: { ...((currentPrefs as any).payoutSettings || {}) },
        };
        if (type === "paypal" && paypalEmail)
          updated.payoutSettings.paypalEmail = paypalEmail.trim();
        if (type === "bank_transfer" && bankDetails)
          updated.payoutSettings.bankDetails = bankDetails;

        await db
          .update(users)
          .set({ preferences: updated } as Record<string, unknown>)
          .where(eq(users.id, req.user.id));
        return res.json({ success: true, message: "Payment method added" });
      } catch (error) {
        logger.warn({ err: error }, "Add payment method error");
        return res
          .status(500)
          .json({ message: "Failed to add payment method" });
      }
    },
  );

  app.get(
    "/api/royalties/payout-settings",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const user = req.user!;
        const preferences = (user.preferences as any) || {};
        const prefs = preferences.payoutSettings || {};

        // Pull the latest submitted tax form to surface taxCountry / taxId
        const [latestTaxForm] = await db
          .select({
            formData: taxForms.formData,
            formType: taxForms.formType,
            status: taxForms.status,
          })
          .from(taxForms)
          .where(eq(taxForms.userId, req.user.id))
          .orderBy(desc(taxForms.submittedAt))
          .limit(1);

        const taxFormData =
          (latestTaxForm?.formData as Record<string, unknown>) || {};
        const taxCountry =
          taxFormData.taxCountry ??
          (taxFormData.address as any)?.country ??
          null;
        const taxId = taxFormData.taxId
          ? "***-**-" + String(taxFormData.taxId).slice(-4)
          : null;

        return res.json({
          minimumPayout: prefs.minimumPayout ?? 50,
          payoutSchedule: prefs.payoutSchedule ?? "monthly",
          preferredMethod: prefs.preferredMethod ?? null,
          stripeConnected: !!user.stripeConnectedAccountId,
          paypalEmail: prefs.paypalEmail ?? null,
          taxCountry,
          taxId,
          taxFormType: latestTaxForm?.formType ?? null,
          taxFormStatus: latestTaxForm?.status ?? null,
        });
      } catch (error) {
        logger.warn({ err: error }, "Payout settings error");
        return res
          .status(500)
          .json({ message: "Failed to fetch payout settings" });
      }
    },
  );

  app.put(
    "/api/royalties/payout-settings",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { minimumPayout, payoutSchedule, preferredMethod } = req.body ?? {};
        if (
          minimumPayout != null &&
          (!Number.isFinite(Number(minimumPayout)) || Number(minimumPayout) < 0)
        ) {
          return res.status(400).json({ message: "Minimum payout must be a non-negative number" });
        }
        if (
          payoutSchedule != null &&
          !["weekly", "monthly", "quarterly"].includes(payoutSchedule)
        ) {
          return res.status(400).json({ message: "Payout schedule must be weekly, monthly, or quarterly" });
        }
        const user = req.user!;
        const currentPrefs = user.preferences || {};
        const updated = {
          ...currentPrefs,
          payoutSettings: {
            ...((currentPrefs as any).payoutSettings || {}),
            ...(minimumPayout != null && { minimumPayout: Number(minimumPayout) }),
            ...(payoutSchedule && { payoutSchedule }),
            ...(preferredMethod && { preferredMethod }),
          },
        };
        await db
          .update(users)
          .set({ preferences: updated } as Record<string, unknown>)
          .where(eq(users.id, req.user.id));
        return res.json({ success: true, message: "Payout settings updated" });
      } catch (error) {
        logger.warn({ err: error }, "Update payout settings error");
        return res
          .status(500)
          .json({ message: "Failed to update payout settings" });
      }
    },
  );

  app.put("/api/royalties/tax-info", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        formType = "W-9",
        taxYear = new Date().getFullYear(),
        formData,
        taxCountry,
        taxId,
      } = req.body;
      // Accept either a full nested formData object OR the simple flat {taxCountry, taxId} shape
      const resolvedFormData =
        formData ?? (taxCountry || taxId ? { taxCountry, taxId } : null);
      if (!resolvedFormData)
        return res.status(400).json({ message: "Form data required" });

      const [existing] = await db
        .select({ id: taxForms.id })
        .from(taxForms)
        .where(
          and(
            eq(taxForms.userId, req.user.id),
            eq(taxForms.taxYear, taxYear),
            eq(taxForms.formType, formType),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(taxForms)
          .set({
            formData: resolvedFormData,
            status: "submitted",
            submittedAt: new Date(),
          })
          .where(eq(taxForms.id, existing.id));
      } else {
        await db.insert(taxForms).values({
          userId: req.user.id,
          formType,
          taxYear,
          formData: resolvedFormData,
          status: "submitted",
          submittedAt: new Date(),
        });
      }
      return res.json({ success: true, message: "Tax info updated" });
    } catch (error) {
      logger.warn({ err: error }, "Update tax info error");
      return res.status(500).json({ message: "Failed to update tax info" });
    }
  });

  app.get("/api/royalties/splits", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const rows = await db
        .select()
        .from(royaltySplits)
        .where(eq(royaltySplits.userId, req.user.id))
        .orderBy(desc(royaltySplits.createdAt))
        .limit(500);
      return res.json(rows);
    } catch (error) {
      logger.warn({ err: error }, "Royalty splits error");
      return res
        .status(500)
        .json({ message: "Failed to fetch royalty splits" });
    }
  });

  app.post("/api/royalties/splits", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const {
        collaboratorEmail: suppliedEmail,
        collaboratorName: suppliedName,
        email,
        name,
        percentage,
        projectId,
        role = "collaborator",
      } = req.body;
      const collaboratorEmail = suppliedEmail || email;
      const collaboratorName = suppliedName || name;
      const normalizedPercentage =
        typeof percentage === "number" ? percentage : Number(percentage);
      if (
        typeof collaboratorEmail !== "string" ||
        !collaboratorEmail.trim() ||
        !Number.isFinite(normalizedPercentage)
      ) {
        return res
          .status(400)
          .json({ message: "Collaborator email and percentage are required" });
      }
      if (normalizedPercentage <= 0 || normalizedPercentage > 100) {
        return res
          .status(400)
          .json({ message: "Percentage must be between 1 and 100" });
      }
      const releaseId = projectId || "general";
      const existing = await db.select({ percentage: royaltySplits.percentage })
        .from(royaltySplits)
        .where(and(eq(royaltySplits.userId, req.user.id), eq(royaltySplits.releaseId, releaseId)));
      if (existing.reduce((total, split) => total + split.percentage, 0) + normalizedPercentage > 100.0001) {
        return res.status(400).json({ message: "Royalty splits cannot exceed 100%" });
      }

      const [split] = await db
        .insert(royaltySplits)
        .values({
          releaseId,
          userId: req.user.id,
          collaboratorEmail,
          collaboratorName: collaboratorName || collaboratorEmail.split("@")[0],
          role,
          percentage: normalizedPercentage,
          status: "pending",
        })
        .returning();

      return res.json(split);
    } catch (error) {
      logger.warn({ err: error }, "Create split error");
      return res
        .status(500)
        .json({ message: "Failed to create royalty split" });
    }
  });

  app.put("/api/royalties/splits/:splitId", async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { splitId } = req.params as Record<string, string>;
      const [existing] = await db.select().from(royaltySplits)
        .where(and(eq(royaltySplits.id, splitId), eq(royaltySplits.userId, req.user.id))).limit(1);
      if (!existing) return res.status(404).json({ message: "Royalty split not found" });
      const { name, email, role, percentage } = req.body ?? {};
      const normalizedPercentage = percentage === undefined ? existing.percentage : Number(percentage);
      if (!Number.isFinite(normalizedPercentage) || normalizedPercentage <= 0 || normalizedPercentage > 100) {
        return res.status(400).json({ message: "Percentage must be between 1 and 100" });
      }
      if (email !== undefined && (typeof email !== "string" || !email.trim())) {
        return res.status(400).json({ message: "Collaborator email must be a non-empty string" });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ message: "Collaborator name must be a non-empty string" });
      }
      const siblings = await db.select({ percentage: royaltySplits.percentage }).from(royaltySplits)
        .where(and(eq(royaltySplits.userId, req.user.id), eq(royaltySplits.releaseId, existing.releaseId)));
      if (siblings.reduce((total, split) => total + split.percentage, 0) - existing.percentage + normalizedPercentage > 100.0001) {
        return res.status(400).json({ message: "Royalty splits cannot exceed 100%" });
      }
      const [split] = await db.update(royaltySplits).set({
        percentage: normalizedPercentage,
        ...(name === undefined ? {} : { collaboratorName: name.trim() }),
        ...(email === undefined ? {} : { collaboratorEmail: email.trim() }),
        ...(role === undefined ? {} : { role }),
        updatedAt: new Date(),
      }).where(eq(royaltySplits.id, splitId)).returning();
      return res.json(split);
    } catch (error) {
      logger.warn({ err: error }, "Update split error");
      return res.status(500).json({ message: "Failed to update royalty split" });
    }
  });

  app.delete(
    "/api/royalties/splits/:splitId",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { splitId } = req.params as Record<string, string>;
        const [existing] = await db
          .select({ id: royaltySplits.id, userId: royaltySplits.userId })
          .from(royaltySplits)
          .where(eq(royaltySplits.id, splitId))
          .limit(1);

        if (!existing)
          return res.status(404).json({ message: "Royalty split not found" });
        if (existing.userId !== req.user.id)
          return res.status(403).json({ message: "Not authorized" });

        await db.delete(royaltySplits).where(eq(royaltySplits.id, splitId));
        return res.json({ success: true, message: "Royalty split deleted" });
      } catch (error) {
        logger.warn({ err: error }, "Delete split error");
        return res
          .status(500)
          .json({ message: "Failed to delete royalty split" });
      }
    },
  );

  app.post("/api/royalties/export", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { period = "30d", format = "csv" } = req.body;
      const daysMap: Record<string, number> = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "1y": 365,
      };
      const days = daysMap[period] ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Hard cap: 50 000 rows prevents a multi-year user from generating a
      // 500 MB CSV that exhausts server memory and stalls the event loop.
      // The X-Truncated header lets the client show a "results capped" notice.
      const EXPORT_ROW_LIMIT = 50_000;

      const rows = await db
        .select()
        .from(royaltyTransactions)
        .where(
          and(
            eq(royaltyTransactions.userId, req.user.id),
            gte(royaltyTransactions.createdAt, since),
          ),
        )
        .orderBy(desc(royaltyTransactions.createdAt))
        .limit(EXPORT_ROW_LIMIT + 1); // fetch one extra to detect truncation

      const truncated = rows.length > EXPORT_ROW_LIMIT;
      const safeRows = truncated ? rows.slice(0, EXPORT_ROW_LIMIT) : rows;

      if (format === "csv") {
        const csvHeader =
          "Date,Platform,Release,Amount,Currency,Streams,Status\n";
        const csvBody = safeRows
          .map(
            (r) =>
              `${r.createdAt!.toISOString()},${r.platform || ""},${r.releaseId},${r.amount},${r.currency || "usd"},${r.streamCount || 0},${r.status}`,
          )
          .join("\n");
        const csv = csvHeader + csvBody;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="royalties_${period}_${Date?.now()}.csv"`,
        );
        if (truncated) res.setHeader("X-Truncated", "true");
        return res.send(csv);
      }

      if (truncated) res.setHeader("X-Truncated", "true");
      return res.json({ success: true, data: safeRows, truncated });
    } catch (error) {
      logger.warn({ err: error }, "Export royalties error");
      return res.status(500).json({ message: "Failed to export royalties" });
    }
  });

  app.post(
    "/api/royalties/request-payout",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const idempotencyKey = req.get("Idempotency-Key")?.trim();
        if (
          !idempotencyKey ||
          idempotencyKey.length > 180 ||
          /[\u0000-\u001f\u007f]/.test(idempotencyKey)
        ) {
          return res.status(400).json({
            message: "A valid Idempotency-Key header is required for payouts",
          });
        }
        const { instantPayoutService } = await import(
          "./services/instantPayoutService"
        );
        const balance = await instantPayoutService.calculateAvailableBalance(
          req.user.id,
        );
        const availableAmount = balance.availableBalance;
        if (availableAmount <= 0) {
          return res
            .status(400)
            .json({ message: "No available balance for payout" });
        }
        const result = await instantPayoutService.requestInstantPayout(
          req.user.id,
          availableAmount,
          balance.currency,
          idempotencyKey,
        );
        if (!result.success || !result.payoutId) {
          return res.status(400).json({
            message: result.error || "Payout request could not be submitted",
          });
        }
        return res.json({
          success: true,
          payoutId: result.payoutId,
          message: "Payout request submitted",
          amount: result.amount ?? availableAmount,
        });
      } catch (error) {
        logger.warn({ err: error }, "Request payout error");
        return res
          .status(500)
          .json({
            message:
              "Failed to request payout. Please ensure your payment method is configured.",
          });
      }
    },
  );

  // GET /api/royalties/transactions — paginated royalty transaction ledger for the current user.
  // Supports ?limit=&offset=&platform=&status= query params.
  app.get("/api/royalties/transactions", async (req: Request, res: Response) => {
    if (!req.user)
      return res.status(401).json({ message: "Not authenticated" });
    try {
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
      const platform = req.query.platform as string | undefined;
      const status = req.query.status as string | undefined;

      const conditions = [eq(royaltyTransactions.userId, req.user.id as string)];
      if (platform) conditions.push(eq(royaltyTransactions.platform, platform));
      if (status) conditions.push(eq(royaltyTransactions.status, status));

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(royaltyTransactions)
          .where(and(...conditions))
          .orderBy(desc(royaltyTransactions.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(royaltyTransactions)
          .where(and(...conditions)),
      ]);

      return res.json({
        transactions: rows,
        total: countResult[0]?.total ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      logger.warn({ err: error }, "Get royalty transactions error");
      return res.status(500).json({ message: "Failed to fetch royalty transactions" });
    }
  });

  // GET /api/royalties/statements — Royalty period statements (for Tax Intelligence tab)
  app.get("/api/royalties/statements", async (req: Request, res: Response) => {
    if (!req.user)
      return res.status(401).json({ message: "Not authenticated" });
    try {
      const statements = await db
        .select()
        .from(royaltyStatements)
        .where(eq(royaltyStatements.userId, req.user.id))
        .orderBy(desc(royaltyStatements.periodEnd))
        .limit(24);
      return res.json({ statements, total: statements.length });
    } catch (error) {
      logger.warn({ err: error }, "Get royalty statements error");
      return res.status(500).json({ message: "Failed to fetch royalty statements" });
    }
  });

  // GET /api/royalties/forecast — Project future royalty income from recent trends
  app.get("/api/royalties/forecast", async (req: Request, res: Response) => {
    if (!req.user)
      return res.status(401).json({ message: "Not authenticated" });
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const transactions = await db
        .select({
          amount: royaltyTransactions.amount,
          platform: royaltyTransactions.platform,
        })
        .from(royaltyTransactions)
        .where(
          and(
            eq(royaltyTransactions.userId, req.user.id as string),
            gte(royaltyTransactions.createdAt, threeMonthsAgo),
          ),
        );
      const total = transactions.reduce((s, t) => s + (t.amount || 0), 0);
      const monthlyAvg = total / 3;
      const forecast = [1, 2, 3, 6, 12].map((months) => ({
        months,
        label:
          months === 1
            ? "1 Month"
            : months === 12
              ? "1 Year"
              : `${months} Months`,
        projected: parseFloat((monthlyAvg * months).toFixed(2)),
        growthRate: 0,
        confidence: months <= 3 ? "high" : months <= 6 ? "medium" : "low",
      }));
      const byPlatform: Record<string, number> = {};
      for (const t of transactions) {
        const p = t.platform || "Unknown";
        byPlatform[p] = (byPlatform[p] || 0) + (t.amount || 0);
      }
      return res.json({
        monthlyAverage: parseFloat(monthlyAvg.toFixed(2)),
        annualProjected: parseFloat((monthlyAvg * 12).toFixed(2)),
        forecast,
        byPlatform,
        basedOnMonths: 3,
        dataPoints: transactions.length,
      });
    } catch (error) {
      logger.warn({ err: error }, "Get royalty forecast error");
      return res.status(500).json({ message: "Failed to calculate royalty forecast" });
    }
  });

  app.post(
    "/api/royalties/connect-stripe",
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      try {
        const { instantPayoutService } = await import(
          "./services/instantPayoutService"
        );
        const baseUrl = getBaseUrl();
        const refreshUrl = `${baseUrl}/royalties?setup=refresh`;
        const returnUrl = `${baseUrl}/royalties?setup=complete`;
        const url = await instantPayoutService.createAccountLink(
          req.user.id,
          refreshUrl,
          returnUrl,
        );
        return res.json({ success: true, url });
      } catch (error: unknown) {
        logger.warn({ err: error }, "Connect Stripe error");
        if (
          error instanceof Error &&
          (("type" in error && error.type === "StripeInvalidRequestError") ||
            ("rawType" in error && error.rawType === "invalid_request_error") ||
            error.message.toLowerCase().includes("connect"))
        ) {
          return res.status(400).json({
            message:
              "Stripe Connect payouts are not yet enabled on this account. Please contact support to enable direct payouts.",
            code: "STRIPE_CONNECT_NOT_ENABLED",
          });
        }
        return res
          .status(500)
          .json({
            message: "Failed to connect bank account. Please try again.",
          });
      }
    },
  );

  // Create subscription endpoint — accepts planName (monthly/yearly/lifetime)
  // and returns a Stripe clientSecret for use with Stripe Elements.
  app.post("/api/create-subscription", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (!stripe) {
        return res
          .status(503)
          .json({
            message: "Payment service unavailable",
            code: "STRIPE_NOT_CONFIGURED",
          });
      }

      // Accept either planName (preferred) or a raw priceId (legacy)
      const { planName, priceId: rawPriceId } = req.body;
      const validPlans = ["monthly", "yearly", "lifetime"] as const;

      let resolvedPriceId: string;
      let canonicalPlan: typeof validPlans[number];
      const priceIds = getStripePriceIds();

      if (planName && validPlans.includes(planName)) {
        // Look up the real Stripe price ID from server-side cache
        canonicalPlan = planName;
        resolvedPriceId = priceIds[canonicalPlan];
      } else if (!planName && typeof rawPriceId === "string" &&
        validPlans.some(plan => priceIds[plan] === rawPriceId)) {
        canonicalPlan = validPlans.find(plan => priceIds[plan] === rawPriceId)!;
        resolvedPriceId = rawPriceId;
      } else {
        return res
          .status(400)
          .json({ message: "planName (monthly/yearly/lifetime) is required" });
      }

      if (typeof resolvedPriceId !== "string" || !resolvedPriceId.startsWith("price_")) {
        return res.status(503).json({ message: "Selected billing plan is not configured" });
      }
      const user = req.user!;
      const result = await createSubscriptionCheckout({
        stripe,
        store: createSubscriptionCheckoutStore(pool),
        user,
        plan: canonicalPlan,
        priceId: resolvedPriceId,
        requestKey: req.get("Idempotency-Key") ?? "",
        saveCustomerId: (userId, customerId) =>
          storage.updateUser(userId, { stripeCustomerId: customerId }),
      });
      return res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Create subscription error");
      if (error instanceof SubscriptionCheckoutConflictError) {
        return res.status(409).json({ message: error.message, code: "IDEMPOTENCY_CONFLICT", retryable: false });
      }
      const checkoutError = error as Error & { statusCode?: number; code?: string; retryable?: boolean };
      if (checkoutError.statusCode) {
        return res.status(checkoutError.statusCode).json({
          message: checkoutError.message,
          code: checkoutError.code,
          retryable: checkoutError.retryable ?? checkoutError.statusCode >= 500,
        });
      }
      return res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // ── Chunked upload endpoints ──────────────────────────────────────────────
  // Replit's reverse proxy enforces a request-body size limit (≈ 32 MB).
  // For audio files that exceed this we split the file client-side into 4 MB
  // chunks and upload each one independently, then reassemble here.
  // Chunks are stored in /tmp during assembly then moved to Object Storage.

  const chunkUpload = createHardenedUpload({
    maxFileSize: 6 * 1024 * 1024, // 6 MB safety ceiling per chunk
    maxFiles: 1,
    label: "upload chunk",
  });

  // POST /api/uploads/chunk
  // Accepts one chunk.  All chunks for a given upload share the same uploadId.
  app.post(
    "/api/uploads/chunk",
    chunkUpload.single("chunk"),
    async (req: Request, res: Response) => {
      if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
      if (!req.file)
        return res.status(400).json({ message: "No chunk received" });

      const { uploadId, chunkIndex, totalChunks } = req.body;
      if (!uploadId || chunkIndex === undefined || !totalChunks) {
        return res
          .status(400)
          .json({
            message: "uploadId, chunkIndex and totalChunks are required",
          });
      }

      // Sanitise uploadId — only allow alphanumeric + hyphens
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId)) {
        return res.status(400).json({ message: "Invalid uploadId" });
      }
      const index = Number(chunkIndex);
      const count = Number(totalChunks);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 10_000 ||
        index >= count
      ) {
        return res.status(400).json({ message: "Invalid chunk index or count" });
      }

      let dir: string | undefined;
      try {
        const fsPromises = await import("fs/promises");
        const pathMod = await import("path");
        const osMod = await import("os");
        dir = pathMod.join(
          osMod.tmpdir(),
          "uploads",
          encodeURIComponent(req.user.id),
          uploadId,
        );
        await fsPromises.mkdir(dir, { recursive: true });
        const chunkPath = pathMod.join(
          dir,
          String(index).padStart(6, "0") + ".bin",
        );
        await fsPromises.writeFile(chunkPath, req.file.buffer);
        return res.json({ received: index, uploadId });
      } catch (err) {
        logger.warn({ err: err }, "[ChunkUpload] Failed to store chunk");
        return res.status(500).json({ message: "Failed to store chunk" });
      } finally {
        if (dir && res.statusCode >= 500) {
          const fsPromises = await import("fs/promises");
          await fsPromises.rm(dir, { recursive: true, force: true });
        }
      }
    },
  );

  // POST /api/uploads/assemble
  // Concatenates all stored chunks, uploads final file to Object Storage.
  app.post("/api/uploads/assemble", async (req: Request, res: Response) => {
    if (!req.user)
      return res.status(401).json({ message: "Not authenticated" });

    const { uploadId, totalChunks, filename, category } = req.body;
    if (!uploadId || !totalChunks || !filename) {
      return res
        .status(400)
        .json({ message: "uploadId, totalChunks and filename are required" });
    }
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId)) {
      return res.status(400).json({ message: "Invalid uploadId" });
    }

    let dir: string | undefined;
    try {
      const fsPromises = await import("fs/promises");
      const pathMod = await import("path");
      const osMod = await import("os");
      dir = pathMod.join(
        osMod.tmpdir(),
        "uploads",
        encodeURIComponent(req.user.id),
        uploadId,
      );
      const count = Number(totalChunks);
      if (!Number.isInteger(count) || count < 1 || count > 10_000) {
        return res.status(400).json({ message: "Invalid totalChunks" });
      }

      const chunkBuffers: Buffer[] = [];
      for (let i = 0; i < count; i++) {
        const chunkPath = pathMod.join(
          dir,
          String(i).padStart(6, "0") + ".bin",
        );
        const buf = await fsPromises.readFile(chunkPath);
        chunkBuffers.push(buf);
      }

      const assembled = Buffer.concat(chunkBuffers);
      const ext = filename.split(".").pop().toLowerCase() || "bin";
      const mimeMap: Record<string, string> = {
        wav: "audio/wav",
        mp3: "audio/mpeg",
        flac: "audio/flac",
        aiff: "audio/aiff",
        aif: "audio/aiff",
        ogg: "audio/ogg",
      };
      const contentType = mimeMap[ext] || "audio/octet-stream";
      const destCategory = category || "audio";
      const userId = req.user!.id;

      const { storageService } = await import("./services/storageService.js");
      const finalKey = await storageService.uploadFile(
        assembled,
        `${destCategory}/${userId}`,
        filename,
        contentType,
      );
      const url = await storageService.getDownloadUrl(finalKey);

      return res.json({ url, key: finalKey, size: assembled.length });
    } catch (err) {
      logger.warn({ err: err }, "[ChunkUpload] Assembly failed");
      return res.status(500).json({ message: "Failed to assemble upload" });
    } finally {
      if (dir) {
        const fsPromises = await import("fs/promises");
        await fsPromises.rm(dir, { recursive: true, force: true });
      }
    }
  });
  // ── End chunked upload ─────────────────────────────────────────────────────

  // Audio file upload endpoint — stores to hybrid storage (Replit Object Storage + Pocket Dimension)
  app.post("/api/audio/upload", async (req: Request, res: Response, next) => {
    // Raw audio belongs to the authenticated MaxCore streaming transport.
    // Keep the existing JSON/base64 storage contract for current clients.
    if (req.is("audio/*")) {
      next();
      return;
    }
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { audioData, format, duration, trackId } = req.body;
      const userId = req.user!.id;

      if (!audioData) {
        return res.status(400).json({ message: "audioData is required" });
      }

      const { hybridStorageService } = await import(
        "./services/hybridStorageService.js"
      );

      const ext = format || "wav";
      const mimeType =
        ext === "mp3"
          ? "audio/mpeg"
          : ext === "ogg"
            ? "audio/ogg"
            : ext === "webm"
              ? "audio/webm"
              : "audio/wav";

      const fileName = `recording_${Date.now()}.${ext}`;
      const fileBuffer = Buffer.from(audioData, "base64");

      const result = await hybridStorageService.upload(
        userId,
        fileName,
        fileBuffer,
        mimeType,
        {
          folder: "recordings",
          metadata: { trackId: trackId || null, duration: duration || 0 },
        },
      );

      return res.json({
        success: true,
        fileId: result.key,
        url: `/api/files/${encodeURIComponent(result.key)}`,
        duration: duration || 0,
        sizeBytes: result.sizeBytes,
        message: "Audio file uploaded successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Audio upload error");
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
    import("./routes/admin.js"),
    import("./routes/paid.js"),
    import("./routes/artistProgress.js"),
    import("./routes/artistProfiles.js"),
    import("./routes/revenueForecast.js"),
    import("./routes/files.js"),
    import("./routes/preferences.js"),
    import("./routes/shortcuts.js"),
    import("./routes/undo.js"),
    import("./routes/batch.js"),
    import("./routes/distribution.js"),
  ]);
  const { aiServiceProxyRouter, boosterstateProxyRouter } = await import(
    "./routes/internalProxy.js"
  );
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
      if (
        !req.user.subscriptionTier ||
        req.user.subscriptionTier === "free" ||
        req.user.subscriptionTier === "trial"
      ) {
        return res.status(403).json({
          message:
            "AI content optimization requires an active paid subscription",
          requiresUpgrade: true,
        });
      }

      // Simulate AI optimization response
      return res.json({
        success: true,
        optimizations: [
          {
            type: "metadata",
            title: "Metadata Optimization",
            description:
              "Enhanced track titles and descriptions for better discoverability",
            applied: true,
          },
          {
            type: "social",
            title: "Social Media Optimization",
            description:
              "Optimized posting times and hashtags for maximum engagement",
            applied: true,
          },
          {
            type: "distribution",
            title: "Distribution Optimization",
            description: "Recommended platform-specific optimizations applied",
            applied: true,
          },
        ],
        message:
          "Your content has been optimized for maximum reach and engagement.",
      });
    } catch (error) {
      logger.warn({ err: error }, "AI optimize content error");
      return res.status(500).json({ message: "Failed to optimize content" });
    }
  });

  // Direct registration for socialMedia — bypasses the lazy module loader entirely.
  // In production CJS bundles, the lazy-init ordering can cause socialMedia's
  // module-level `log` helper (Jt) to be undefined when safeLoadRoute first calls it,
  // making the catch-block throw silently and leaving the routes unregistered.
  // Eagerly importing + mounting here guarantees the router is always present.
  try {
    const { default: socialMediaRouter } = await import(
      "./routes/socialMedia.js"
    );
    if (
      socialMediaRouter &&
      typeof socialMediaRouter === "function" &&
      socialMediaRouter.stack !== undefined
    ) {
      app.use("/api/social", socialMediaRouter);
      log("Loaded route: socialMedia (direct)");
      logger.info(
        "[routes] socialMedia router registered directly at /api/social",
      );
    } else {
      logger.error(
        "[routes] socialMedia direct load: no usable router export (type=" +
          typeof socialMediaRouter +
          ")",
      );
    }
  } catch (e) {
    logger.error({ err: e }, "[routes] socialMedia direct load FAILED");
  }

  // Dynamically load and mount route modules (with error handling)
  const routeModules = [
    // Bootstrap — single parallel query for all initial dashboard data
    {
      path: "/api/bootstrap",
      name: "bootstrap",
      loader: () => import("./routes/bootstrap"),
    },
    // Core Platform Routes
    {
      path: "/api/achievements",
      name: "achievements",
      loader: () => import("./routes/achievements"),
    },
    {
      path: "/api/onboarding",
      name: "onboarding",
      loader: () => import("./routes/onboarding"),
    },
    {
      path: "/api/personalization",
      name: "personalization",
      loader: () => import("./routes/personalization"),
    },
    {
      path: "/api/countdowns",
      name: "releaseCountdown",
      loader: () => import("./routes/releaseCountdown"),
    },
    {
      path: "/api/storefront",
      name: "storefront",
      loader: () => import("./routes/storefront"),
    },
    {
      path: "/api/storefront-domains",
      name: "storefrontDomains",
      loader: () => import("./routes/storefrontDomains"),
    },
    { path: "/api/dns", name: "dns", loader: () => import("./routes/dns") },
    {
      path: "/api/dns-manager",
      name: "dnsManager",
      loader: () => import("./routes/dnsManager"),
    },
    {
      path: "/api/domain-registrar",
      name: "domainRegistrar",
      loader: () => import("./routes/domainRegistrar"),
    },
    { path: "/api/hns", name: "hns", loader: () => import("./routes/hns") },
    {
      path: "/api/analytics",
      name: "analytics",
      loader: () => import("./routes/analytics-internal"),
    },
    {
      path: "/api/status",
      name: "status",
      loader: () => import("./routes/status"),
    },
    {
      path: "/api/monitoring",
      name: "monitoring",
      loader: () => import("./routes/monitoring"),
    },
    { path: "/api/dmca", name: "dmca", loader: () => import("./routes/dmca") },
    {
      path: "/api/growth",
      name: "growth",
      loader: () => import("./routes/growth"),
    },
    {
      path: "/api/backup",
      name: "backup",
      loader: () => import("./routes/backup"),
    },
    {
      path: "/api/retention",
      name: "retention",
      loader: () => import("./routes/retention"),
    },

    // Payments & Payouts
    {
      path: "/api/billing",
      name: "billing",
      loader: () => import("./routes/billing"),
    },
    {
      path: "/api/payouts",
      name: "payouts",
      loader: () => import("./routes/payouts"),
    },
    {
      path: "/api/invoices",
      name: "invoices",
      loader: () => import("./routes/invoices"),
    },
    { path: "/api/kyc", name: "kyc", loader: () => import("./routes/kyc") },

    // Social & Advertising
    {
      path: "/api/social",
      name: "socialOAuth",
      loader: () => import("./routes/socialOAuth"),
    },
    // socialMedia is registered directly above via eager import (avoids production bundle lazy-init issue)
    {
      path: "/api/social/approvals",
      name: "socialApprovals",
      loader: () => import("./routes/socialApprovals"),
    },
    {
      path: "/api/social/bulk",
      name: "socialBulk",
      loader: () => import("./routes/socialBulk"),
    },
    {
      path: "/api/social",
      name: "socialAI",
      loader: () => import("./routes/socialAI"),
    },
    {
      path: "/api/multimodal",
      name: "multimodal",
      loader: () => import("./routes/multimodal"),
    },
    {
      path: "/api/organic",
      name: "organic",
      loader: () => import("./routes/organic"),
    },
    {
      path: "/api/advertising",
      name: "advertising",
      loader: () => import("./routes/advertising"),
    },
    {
      path: "/api/advertising/autopilot",
      name: "advertisingAutopilot",
      loader: () => import("./routes/advertisingAutopilot"),
    },
    {
      path: "/api/autopilot",
      name: "autopilot",
      loader: () => import("./routes/autopilot"),
    },
    {
      path: "/api/autopilot",
      name: "dualAutopilot",
      loader: () => import("./routes/dualAutopilot"),
    },
    {
      path: "/api/autopilot/coordinator",
      name: "autopilotCoordinator",
      loader: () => import("./routes/autopilot-coordinator"),
    },
    {
      path: "/api/autopilot/learning",
      name: "autopilotLearning",
      loader: () => import("./routes/autopilot-learning"),
    },
    {
      path: "/api/auto/social",
      name: "autonomousSocial",
      loader: () => import("./routes/autonomousSocial"),
    },
    {
      path: "/api/auto-updates",
      name: "autoUpdates",
      loader: () => import("./routes/autoUpdates"),
    },
    {
      path: "/api/downloads",
      name: "downloads",
      loader: () => import("./routes/downloads"),
    },
    {
      path: "/api/platform-sync",
      name: "platformSync",
      loader: () => import("./routes/platformSync"),
    },
    {
      path: "/api/autopilot/preferences",
      name: "autopilotPreferences",
      loader: () => import("./routes/autopilotPreferences"),
    },

    // Studio/DAW Routes
    {
      path: "/api/studio",
      name: "studio",
      loader: () => import("./routes/studio"),
    },
    {
      path: "/api/studio",
      name: "studioComping",
      loader: () => import("./routes/studioComping"),
    },
    {
      path: "/api/studio",
      name: "studioMarkers",
      loader: () => import("./routes/studioMarkers"),
    },
    {
      path: "/api/studio/plugins",
      name: "studioPlugins",
      loader: () => import("./routes/studioPlugins"),
    },
    {
      path: "/api/studio",
      name: "studioStems",
      loader: () => import("./routes/studioStems"),
    },
    {
      path: "/api/studio/warping",
      name: "studioWarping",
      loader: () => import("./routes/studioWarping"),
    },
    {
      path: "/api/studio/generation",
      name: "studioGeneration",
      loader: () => import("./routes/studioGeneration"),
    },
    {
      path: "/api/studio",
      name: "studioMidi",
      loader: () => import("./routes/studioMidi"),
    },
    {
      path: "/api/studio/vst",
      name: "vstBridge",
      loader: () => import("./routes/vstBridge"),
    },
    {
      path: "/api/audio-analysis",
      name: "audioAnalysis",
      loader: () => import("./routes/audioAnalysis"),
    },
    {
      path: "/api/audio-processing",
      name: "audioProcessing",
      loader: () => import("./routes/audio-processing"),
    },
    {
      path: "/api/distribution/promo",
      name: "promotionalTools",
      loader: () => import("./routes/promotionalTools"),
    },

    // Offline Mode
    {
      path: "/api/offline",
      name: "offline",
      loader: () => import("./routes/offline"),
    },
    { path: "/api/sync", name: "sync", loader: () => import("./routes/sync") },

    // Workspace & Developer
    {
      path: "/api/workspace",
      name: "workspace",
      loader: () => import("./routes/workspace"),
    },
    {
      path: "/api/developer",
      name: "developerApi",
      loader: () => import("./routes/developerApi"),
    },
    {
      path: "/api/content-analysis",
      name: "content-analysis",
      loader: () => import("./routes/content-analysis"),
    },

    // Collaboration & Networking
    {
      path: "/api/collaborations",
      name: "collaborations",
      loader: () => import("./routes/collaborations"),
    },

    // Help & Support
    {
      path: "/api/helpdesk",
      name: "helpDesk",
      loader: () => import("./routes/helpDesk"),
    },
    {
      path: "/api/support",
      name: "support",
      loader: () => import("./routes/support"),
    },

    // Executive & Admin
    {
      path: "/api/executive",
      name: "executiveDashboard",
      loader: () => import("./routes/executiveDashboard"),
    },
    {
      path: "/api/admin",
      name: "admin",
      loader: () => import("./routes/admin/index"),
    },
    {
      path: "/api/admin/metrics",
      name: "adminMetrics",
      loader: () => import("./routes/admin/metrics"),
    },
    {
      path: "/api/admin/beat-money-loop",
      name: "adminBeatMoneyLoop",
      loader: () => import("./routes/admin/beatMoneyLoop"),
    },
    {
      path: "/api/admin/audit-log",
      name: "adminAuditLog",
      loader: () => import("./routes/admin/auditLog"),
    },
    {
      path: "/api/admin/content-sampler",
      name: "adminContentSampler",
      loader: () => import("./routes/admin/contentSampler"),
    },
    {
      path: "/api/audit",
      name: "audit",
      loader: () => import("./routes/audit"),
    },
    {
      path: "/api/testing",
      name: "testing",
      loader: () => import("./routes/testing"),
    },
    {
      path: "/api/admin/webhooks",
      name: "webhooksAdmin",
      loader: () => import("./routes/webhooks-admin"),
    },
    { path: "/api/logs", name: "logs", loader: () => import("./routes/logs") },

    // Analytics API
    {
      path: "/api/v1/analytics",
      name: "v1Analytics",
      loader: () => import("./routes/api/v1/analytics"),
    },
    {
      path: "/api/certified-analytics",
      name: "certifiedAnalytics",
      loader: () => import("./routes/api/certifiedAnalytics"),
    },
    {
      path: "/api/analytics-alerts",
      name: "analyticsAlerts",
      loader: () => import("./routes/api/analyticsAlerts"),
    },

    // Webhooks
    {
      path: "/api/webhooks/resend",
      name: "resendWebhook",
      loader: () => import("./routes/webhooks/resend"),
    },
    {
      path: "/webhooks/sendgrid",
      name: "sendgridWebhook",
      loader: () => import("./routes/webhooks/sendgrid"),
    },
    {
      path: "/api/webhooks/stripe",
      name: "stripeWebhook",
      loader: () => import("./routes/webhooks/stripe"),
    },

    // Reliability
    {
      path: "/api/reliability",
      name: "reliability",
      loader: () => import("./routes/reliability-endpoints"),
    },

    // Email Preferences
    {
      path: "",
      name: "emailPreferences",
      loader: () => import("./routes/emailPreferences"),
    },

    // Simulation (pre-launch testing)
    {
      path: "/api/simulation",
      name: "simulation",
      loader: () => import("./routes/simulation"),
    },

    // Safety & Admin Controls
    {
      path: "/api/kill-switch",
      name: "killSwitch",
      loader: () => import("./routes/killSwitch"),
    },
    {
      path: "/api/admin/payment-bypass",
      name: "paymentBypass",
      loader: () => import("./routes/paymentBypass"),
    },
    {
      path: "/api/admin/dns-node-local",
      name: "dnsNodeLocalStatus",
      loader: () => import("./routes/dnsNodeLocalStatus"),
    },

    // SEO (sitemap.xml + robots.txt — mounted at root)
    { path: "", name: "seo", loader: () => import("./routes/seo") },

    // Self-Healing Security System
    {
      path: "/api/security/self-healing",
      name: "selfHealingApi",
      loader: () => import("./routes/selfHealingApi"),
    },

    // Security Dashboard API
    {
      path: "/api/security",
      name: "security",
      loader: () => import("./routes/security"),
    },

    // Marketplace with Discovery Algorithm
    {
      path: "/api/marketplace",
      name: "marketplace",
      loader: () => import("./routes/marketplace"),
    },

    // Adaptive Beat Pricing Engine
    {
      path: "/api/adaptive-pricing",
      name: "adaptivePricing",
      loader: () => import("./routes/adaptivePricing"),
    },

    // Search & Discovery
    {
      path: "/api/search",
      name: "search",
      loader: () => import("./routes/search"),
    },

    // Contracts, Invoices, Tax Forms & Split Sheets
    {
      path: "/api/contracts",
      name: "contracts",
      loader: () => import("./routes/contracts"),
    },

    // AI Services
    { path: "/api/ai", name: "ai", loader: () => import("./routes/ai") },

    // Career Coach - AI-powered personalized recommendations
    {
      path: "/api/career-coach",
      name: "careerCoach",
      loader: () => import("./routes/careerCoach"),
    },

    // A&R Intelligence — trend forecasting + catalog gap + release timing
    {
      path: "/api/ar-intelligence",
      name: "arIntelligence",
      loader: () => import("./routes/arIntelligence"),
    },

    // Outreach CRM — pitch tracking
    {
      path: "/api/outreach",
      name: "outreach",
      loader: () => import("./routes/outreach"),
    },

    // User API Keys Management
    {
      path: "/api/auth/api-keys",
      name: "apiKeys",
      loader: () => import("./routes/apiKeys"),
    },

    // Recovery Codes for 2FA Backup
    {
      path: "/api/auth/recovery-codes",
      name: "recoveryCodes",
      loader: () => import("./routes/recoveryCodes"),
    },

    // Connected Accounts Management
    {
      path: "/api/auth/connected-accounts",
      name: "connectedAccounts",
      loader: () => import("./routes/connectedAccounts"),
    },

    // Session & Token Management
    { path: "/api/auth", name: "auth", loader: () => import("./routes/auth") },

    // Fan Hub / Fan CRM
    {
      path: "/api/fan-hub",
      name: "fanHub",
      loader: () => import("./routes/fanHub"),
    },

    // Fan Memberships (tiers + loyalty wallet)
    {
      path: "/api/fan-memberships",
      name: "fanMemberships",
      loader: () => import("./routes/fanMemberships"),
    },

    // Press Kit (EPK Builder)
    {
      path: "/api/press-kit",
      name: "pressKit",
      loader: () => import("./routes/pressKit"),
    },

    // Playlist Pitching
    {
      path: "/api/playlist-pitching",
      name: "playlistPitching",
      loader: () => import("./routes/playlistPitching"),
    },

    // Shows / Tour Management
    {
      path: "/api/shows",
      name: "shows",
      loader: () => import("./routes/shows"),
    },

    // Merch Store
    {
      path: "/api/merch",
      name: "merch",
      loader: () => import("./routes/merch"),
    },

    // Sync Licensing Catalog
    {
      path: "/api/sync-licensing",
      name: "syncLicensing",
      loader: () => import("./routes/syncLicensing"),
    },

    // Publishing Rights Management
    {
      path: "/api/publishing",
      name: "publishing",
      loader: () => import("./routes/publishing"),
    },

    // File Storage Management
    {
      path: "/api/uploads",
      name: "uploads",
      loader: () => import("./routes/uploads"),
    },

    // File Storage Management
    {
      path: "/api/storage",
      name: "storage",
      loader: () => import("./routes/storage"),
    },

    // Hybrid Storage (Replit Object Storage + Pocket Dimension)
    {
      path: "/api/hybrid-storage",
      name: "hybridStorage",
      loader: () => import("./routes/hybridStorage"),
    },

    // Export & Download Management
    {
      path: "/api/export",
      name: "export",
      loader: () => import("./routes/export"),
    },
  ];

  // Load all route modules concurrently, then register in order to preserve middleware precedence
  const loadedModules = await Promise.all(
    routeModules.map(({ name, loader }) => safeLoadRoute(name, loader)),
  );
  for (let i = 0; i < routeModules.length; i++) {
    const { path, name } = routeModules[i];
    const result = loadedModules[i];
    if (result && result.type !== "skip") {
      if (result.type === "router" && result.value) {
        try {
          app.use(path, result.value as RouterLike);
        } catch (e) {
          log(`Warning: Failed to mount ${name} - ${(e as Error).message}`);
        }
      } else if (result.type === "function" && result.value) {
        try {
          (result.value as SetupFn)(app);
        } catch (e) {
          log(`Warning: Failed to setup ${name} - ${(e as Error).message}`);
        }
      }
    }
  }

  // OAuth callback routes - maps new URL structure to existing handlers
  // These routes redirect to the socialOAuth callback handler
  const oauthCallbackPaths = [
    { path: "/auth/meta/callback", platform: "meta" },
    { path: "/auth/facebook/callback", platform: "meta" },
    { path: "/auth/instagram/callback", platform: "meta" },
    { path: "/auth/threads/callback", platform: "threads" },
    { path: "/auth/tiktok/callback", platform: "tiktok" },
    { path: "/tiktok/sandbox/callback", platform: "tiktok" },
    { path: "/tiktok/callback", platform: "tiktok" },
    { path: "/auth/google/callback", platform: "google" },
    { path: "/auth/youtube/callback", platform: "youtube" },
    { path: "/auth/google-business/callback", platform: "googlebusiness" },
    { path: "/auth/linkedin/callback", platform: "linkedin" },
    { path: "/auth/twitter/callback", platform: "twitter" },
    { path: "/auth/twitter/oauth1/callback", platform: "twitter" },
    { path: "/auth/spotify/callback", platform: "spotify" },
  ];

  for (const { path, platform } of oauthCallbackPaths) {
    app.get(path, (req: Request, res: Response) => {
      // Preserve the raw query string exactly as received — re-serialising via
      // URLSearchParams can corrupt OAuth codes/state that contain '+' or other
      // characters that round-trip differently through qs.parse → URLSearchParams.
      const rawQuery = req.url.split("?").slice(1).join("?");
      const redirectUrl = `/api/social/callback/${platform}${rawQuery ? "?" + rawQuery : ""}`;
      res.redirect(302, redirectUrl);
    });
  }
  log("OAuth callback redirect routes registered");

  app.post(
    "/api/errors",
    criticalEndpointLimiter,
    (req: Request, res: Response) => {
      try {
        const errorData = req.body;
        if (typeof errorData === "object" && errorData !== null) {
          const safeError = {
            message: String(errorData.message || "").substring(0, 500),
            stack: String(errorData.stack || "").substring(0, 1000),
            url: String(errorData.url || "").substring(0, 200),
            timestamp: new Date().toISOString(),
          };
          logger.info(
            `[Client Error] ${safeError.message} | stack: ${safeError.stack.split("\n")[0] || ""} | url: ${safeError.url}`,
          );
        }
      } catch {
        /* intentional: client error handler must always respond even if logging fails */
      }
      res.json({ received: true });
    },
  );

  function getStableBuildId(): string {
    try {
      return execSync("git rev-parse --short HEAD", {
        stdio: "pipe",
        timeout: 3000,
      })
        .toString()
        .trim();
    } catch {
      try {
        const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"));
        return crypto
          .createHash("sha1")
          .update(pkg.version || "1.0.0")
          .digest("hex")
          .slice(0, 8);
      } catch {
        return "dev-build";
      }
    }
  }
  const BUILD_ID = process.env.BUILD_ID || getStableBuildId();
  const BUILD_TIMESTAMP = new Date().toISOString();

  app.get("/api/version", (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({ buildId: BUILD_ID, buildTimestamp: BUILD_TIMESTAMP });
  });

  // Liveness — cheap probe used by deployment infra. Always 200 if the
  // process can serve requests, regardless of subsystem state.
  // Registered under both /api/health and /api/health/live (k8s convention).
  const livenessHandler = (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      buildId: BUILD_ID,
    });
  };
  app.get("/api/health", livenessHandler);
  app.get("/api/health/live", livenessHandler);

  // Readiness — checks downstream subsystems (DB, Redis, audit, automation).
  // Returns 200 only when every subsystem is fully `ok`; `degraded` or `down`
  // both return 503 so a caller relying on the status code alone never reads
  // a degraded system as fully ready. `unknown` (e.g. MaxCore intentionally
  // not configured) does not count against the aggregate — see healthRegistry
  // checkAll() — so an honest absence signal doesn't produce a false 503.
  // Note: this is stricter than before — transient dependency congestion
  // (e.g. a PDIM blip) now surfaces as a real, self-resolving 503 here instead
  // of being silently reported as ready.
  // Registered under both /api/ready and /api/health/ready (k8s convention).
  const readinessHandler = async (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    try {
      const { healthRegistry } = await import("./lib/healthRegistry.js");
      const { responseTimeTracker } = await import("./services/monitoringService.js");
      const [result, rtStats] = await Promise.all([
        healthRegistry.checkAll(),
        Promise.resolve(responseTimeTracker.getStats()),
      ]);
      // Readiness only: never add an external fetch to the liveness endpoint.
      const { getUnifiedAwarenessStatus } = await import("./services/awarenessContext.js");
      const unifiedAwareness = await getUnifiedAwarenessStatus();
      const { endpointLatencyRegistry } = await import("./services/monitoringService.js");
      const slowestEndpoints = endpointLatencyRegistry
        .getSlowestEndpoints(10)
        .map((e) => ({
          endpoint: e.endpoint,
          avgMs: Math.round(e.avg),
          p95Ms: Math.round(e.p95),
          p99Ms: Math.round(e.p99),
          samples: e.count,
        }));
      const awarenessReady = unifiedAwareness.ready === true;
      const code = result.status === "ok" && awarenessReady ? 200 : 503;
      res.status(code).json({
        status: awarenessReady ? result.status : "degraded",
        timestamp: new Date().toISOString(),
        buildId: BUILD_ID,
        subsystems: result.subsystems,
        unifiedAwareness,
        latency: {
          avgMs:   Math.round(rtStats.avg),
          p95Ms:   Math.round(rtStats.p95),
          p99Ms:   Math.round(rtStats.p99),
          minMs:   Math.round(rtStats.min),
          maxMs:   Math.round(rtStats.max),
          samples: rtStats.count,
          windowSec: 300,
          // Per-endpoint breakdown (slowest-p95-first) so a single slow route
          // surfaces on its own instead of hiding inside the global average.
          slowestEndpoints,
        },
      });
    } catch (err) {
      // Log full detail internally; never leak dependency error text
      // (DB hosts, Redis addresses, driver messages) to unauthenticated callers.
      logger.warn({ err }, "[Readiness] health check failed");
      res.status(503).json({
        status: "down",
        timestamp: new Date().toISOString(),
        error: "health check failed",
      });
    }
  };
  app.get("/api/ready", readinessHandler);
  app.get("/api/health/ready", readinessHandler);

  // Self-test endpoints (/api/health/selftest[/last]) — the module was built
  // and its periodic runner started from index.ts, but the HTTP surface was
  // never mounted, so the endpoint 404'd despite being documented.
  try {
    const { setupSelfTestEndpoint } = await import(
      "./post-deploy-selftest.js"
    );
    setupSelfTestEndpoint(app);
  } catch (err) {
    logger.warn({ err }, "[Routes] Failed to mount self-test endpoints");
  }

  // Stripe checkout session creation for subscription plans
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2026-02-25.clover",
      })
    : null;

  const SUBSCRIPTION_PLANS: Record<
    string,
    {
      name: string;
      priceInCents: number;
      mode: "payment" | "subscription";
      interval?: "month" | "year";
    }
  > = {
    monthly: {
      name: "Max Booster Monthly",
      priceInCents: 4900,
      mode: "subscription",
      interval: "month",
    },
    yearly: {
      name: "Max Booster Annual",
      priceInCents: 46800,
      mode: "subscription",
      interval: "year",
    },
    lifetime: {
      name: "Max Booster Lifetime",
      priceInCents: 69900,
      mode: "payment",
    },
  };

  // REGISTRATION CHECKOUT - Intentionally unauthenticated
  // This is for NEW users who don't have accounts yet (no free tier).
  // Security measures: Rate limiting (global), email/username validation,
  // duplicate checking, idempotency keys, and Stripe webhook verification
  // on payment completion before account creation.
  app.post(
    "/api/create-checkout-session",
    async (req: Request, res: Response) => {
      try {
        if (!stripe) {
          return res
            .status(500)
            .json({ error: "Payment system not configured" });
        }

        const { tier, userEmail, username, birthdate, artistName } = req.body;

        // Validate required fields
        if (!tier || !userEmail || !username) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // Validate tier is one of allowed values (prevent injection)
        const allowedTiers = ["monthly", "yearly", "lifetime"];
        if (!allowedTiers.includes(tier)) {
          return res.status(400).json({ error: "Invalid subscription tier" });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
          return res.status(400).json({ error: "Invalid email format" });
        }

        if (
          typeof birthdate !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)
        ) {
          return res.status(400).json({ error: "A valid birthdate is required" });
        }
        const parsedBirthdate = new Date(`${birthdate}T00:00:00.000Z`);
        if (Number.isNaN(parsedBirthdate.getTime())) {
          return res.status(400).json({ error: "A valid birthdate is required" });
        }
        const minimumBirthdate = new Date();
        minimumBirthdate.setFullYear(minimumBirthdate.getFullYear() - 13);
        if (parsedBirthdate > minimumBirthdate) {
          return res.status(400).json({
            error: "You must be at least 13 years old to create an account",
          });
        }

        // Validate username (alphanumeric, 3-30 chars)
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        if (!usernameRegex.test(username)) {
          return res
            .status(400)
            .json({ error: "Username must be 3-30 alphanumeric characters" });
        }

        // Check if email or username already exists
        const existingUser = await storage.getUserByEmail(userEmail);
        if (existingUser) {
          return res
            .status(409)
            .json({ error: "Email already registered. Please login instead." });
        }

        const existingUsername = await storage.getUserByUsername(username);
        if (existingUsername) {
          return res
            .status(409)
            .json({ error: "Username already taken. Please choose another." });
        }

        const plan = SUBSCRIPTION_PLANS[tier];
        if (!plan) {
          return res.status(400).json({ error: "Invalid subscription tier" });
        }

        // Get pre-created Stripe Price IDs
        const priceIds = getStripePriceIds();
        const priceId = priceIds[tier as keyof typeof priceIds];

        if (!priceId || priceId.includes("placeholder")) {
          return res
            .status(500)
            .json({
              error: "Stripe prices not configured. Please try again later.",
            });
        }

        const baseUrl = getBaseUrl();

        // Generate idempotency key based on email + username + tier
        const crypto = await import("crypto");
        const idempotencyKey = crypto
          .createHash("sha256")
          .update(
            `${userEmail}:${username}:${tier}:${Date.now().toString().slice(0, -4)}`,
          )
          .digest("hex");

        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
          payment_method_types: ["card"],
          customer_email: userEmail,
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          mode: plan.mode,
          success_url: `${baseUrl}/register/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/register/payment/${tier}`,
          metadata: {
            tier,
            username,
            birthdate: birthdate || "",
            artistName:
              typeof artistName === "string" ? artistName.trim().slice(0, 100) : "",
            firstName: req.body.firstName || "",
            lastName: req.body.lastName || "",
          },
        };

        const session = await stripe.checkout.sessions.create(sessionConfig, {
          idempotencyKey,
        });

        res.json({ url: session.url, sessionId: session.id });
      } catch (error) {
        logger.warn({ err: error }, "Error creating checkout session:");
        res
          .status(500)
          .json({
            error: "Failed to create checkout session. Please try again.",
          });
      }
    },
  );

  // Verify a registration Checkout session before rendering the password form.
  // The endpoint deliberately returns no session metadata: the client only needs
  // to know whether it may continue, and account creation remains server-side.
  app.post(
    "/api/verify-checkout-session",
    registerRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!stripe) {
          return res.status(500).json({ error: "Payment system not configured" });
        }

        const { sessionId } = req.body;
        if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
          return res.status(400).json({ error: "Invalid checkout session" });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["line_items.data.price"],
        });
        const tier = session.metadata?.tier;
        const plan = tier ? SUBSCRIPTION_PLANS[tier] : undefined;
        const expectedPriceId =
          plan && getStripePriceIds()[tier as keyof ReturnType<typeof getStripePriceIds>];
        const paidForExpectedPlan =
          !!expectedPriceId &&
          session.payment_status === "paid" &&
          session.mode === plan?.mode &&
          session.line_items?.data.some(
            (item) =>
              typeof item.price !== "string" && item.price?.id === expectedPriceId,
          );

        if (!paidForExpectedPlan) {
          return res.status(400).json({ error: "Payment could not be verified" });
        }

        return res.json({ verified: true });
      } catch (error) {
        logger.warn({ err: error }, "Error verifying registration checkout session:");
        if ((error as { type?: string }).type === "StripeInvalidRequestError") {
          return res.status(400).json({ error: "Invalid checkout session" });
        }
        return res
          .status(500)
          .json({ error: "Unable to verify payment. Please try again." });
      }
    },
  );

  // REGISTER AFTER PAYMENT - Complete account creation after Stripe checkout
  // This endpoint verifies the Stripe session and creates the user account
  app.post(
    "/api/register-after-payment",
    registerRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!stripe) {
          return res
            .status(500)
            .json({ error: "Payment system not configured" });
        }

        const {
          sessionId,
          password,
          tosAccepted,
          privacyAccepted,
        } = req.body;

        if (!sessionId || !password) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        if (!tosAccepted || !privacyAccepted) {
          return res
            .status(400)
            .json({
              error: "You must accept the Terms of Service and Privacy Policy",
            });
        }

        if (password.length < 8) {
          return res
            .status(400)
            .json({ error: "Password must be at least 8 characters long" });
        }

        // Retrieve and verify the Stripe checkout session
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["line_items.data.price"],
        });

        if (!session) {
          return res.status(400).json({ error: "Invalid checkout session" });
        }

        if (session.payment_status !== "paid") {
          return res
            .status(400)
            .json({ error: "Payment not completed. Please try again." });
        }

        const email = session.customer_email;
        const username = session.metadata?.username;
        const tier = session.metadata?.tier;
        const plan = tier ? SUBSCRIPTION_PLANS[tier] : undefined;
        const expectedPriceId =
          plan && getStripePriceIds()[tier as keyof ReturnType<typeof getStripePriceIds>];
        const paidForExpectedPlan =
          !!expectedPriceId &&
          session.mode === plan?.mode &&
          session.line_items?.data.some(
            (item) =>
              typeof item.price !== "string" && item.price?.id === expectedPriceId,
          );

        if (!paidForExpectedPlan) {
          return res.status(400).json({ error: "Payment session does not match a valid plan" });
        }

        if (!email || !username) {
          return res
            .status(400)
            .json({
              error: "Session metadata missing. Please contact support.",
            });
        }

        // Check if user already exists (prevent duplicate registration)
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          // A paid checkout/email is not account authentication or an MFA proof.
          return res.status(409).json({
            error: "Account already exists. Please sign in using normal login.",
            code: "LOGIN_REQUIRED",
          });
        }

        const existingUsername = await storage.getUserByUsername(username);
        if (existingUsername) {
          return res
            .status(409)
            .json({ error: "Username already taken. Please contact support." });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Determine subscription end date based on tier
        let subscriptionEndsAt: Date | null = null;
        if (tier === "monthly") {
          subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (tier === "yearly") {
          subscriptionEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else if (tier === "lifetime") {
          subscriptionEndsAt = new Date("2099-12-31");
        }

        // Create the user account
        const { assertRegistrationEnabled } = await import("./services/governancePolicyService.js");
        await assertRegistrationEnabled();
        const user = await storage.createUser({
          email,
          password: hashedPassword,
          username,
          firstName: session.metadata!.firstName || "",
          lastName: session.metadata!.lastName || "",
        });
        // Apply subscription details that are not part of the base insert schema
        if (tier || subscriptionEndsAt) {
          await storage.updateUser(user.id, {
            subscriptionTier: tier ?? undefined,
            subscriptionEndsAt: subscriptionEndsAt ?? undefined,
          });
        }
        const artistName = session.metadata?.artistName?.trim();
        if (artistName) {
          await storage.updateUser(user.id, { artistName });
        }

        // Log the user in (regenerate prevents session fixation)
        const {
          password: _, twoFactorSecret: _factor, passwordResetToken: _reset,
          emailVerificationToken: _verification, ...userWithoutPassword
        } = user;
        try {
          await sessionRegenerate(req);
          req.session.userId = user.id;
          Object.assign(req.session, {
            authGeneration: await (await sessionAuthority()).issue(user.id),
            reauthenticatedAt: Date.now(), reauthenticatedUserId: user.id,
          });
          await sessionSave(req);
          return res.json({
            user: userWithoutPassword,
            message: "Account created successfully",
          });
        } catch (sessionErr) {
          logger.warn(
            { err: sessionErr },
            "[PostPayment] Session operation failed after retries",
          );
          return res
            .status(500)
            .json({
              error: "Account created but login failed - please sign in.",
            });
        }
      } catch (error) {
        logger.warn(
          { err: error },
          "Error completing registration after payment:",
        );

        if ((error as any).type === "StripeInvalidRequestError") {
          return res
            .status(400)
            .json({ error: "Invalid payment session. Please try again." });
        }

        return res
          .status(500)
          .json({
            error: "Failed to complete registration. Please contact support.",
          });
      }
    },
  );

  // Admin-only payment-bypass status endpoint
  app.get("/api/payment-bypass/status", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { paymentBypassService } = await import(
        "./services/paymentBypassService"
      );
      const status = await paymentBypassService.getStatus();
      return res.json({
        bypassed: status.bypassed,
        reason: status.config.reason || null,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to get payment bypass status" });
    }
  });

  // Infrastructure scaling routes
  try {
    const { scalingMetricsRouter, getInfrastructureStatus } = await import(
      "./infrastructure/index.js"
    );
    app.use("/api/infrastructure", scalingMetricsRouter);
    app.get("/api/infrastructure/status", (req, res) => {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      try {
        const status = getInfrastructureStatus();
        res.json({ success: true, ...status });
      } catch (error) {
        res
          .status(500)
          .json({
            success: false,
            error: "Failed to get infrastructure status",
          });
      }
    });
    log("Infrastructure scaling routes registered");
  } catch (error) {
    log(
      `Warning: Could not load infrastructure routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Unified Content Generation Pipeline — social + ad content for artist AND Max Booster
  try {
    const unifiedContentRouter = (await import("./routes/unifiedContent.js"))
      .default;
    app.use("/api/content/generate-unified", unifiedContentRouter);
    log("Loaded route: unifiedContent");
  } catch (error) {
    log(
      `Warning: Could not load unifiedContent routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // AdvancedCreativeModel pipeline — music-synced short-form video creative generation
  try {
    const creativeModelRouter = (await import("./routes/creativeModel.js"))
      .default;
    app.use("/api/content/creative-model", creativeModelRouter);
    log("Loaded route: creativeModel");
  } catch (error) {
    log(
      `Warning: Could not load creativeModel routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Collaboration routes
  try {
    const collaborationRouter = (await import("./routes/collaboration.js"))
      .default;
    app.use("/api/collaboration", collaborationRouter);
    log("Collaboration routes registered");
  } catch (error) {
    log(
      `Warning: Could not load collaboration routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Music Workflow Automations routes
  try {
    const musicWorkflowRouter = (
      await import("./routes/musicWorkflowAutomations.js")
    ).default;
    app.use("/api/music-workflow-automations", musicWorkflowRouter);
    log("Loaded route: musicWorkflowAutomations");
  } catch (error) {
    log(
      `Warning: Could not load musicWorkflowAutomations routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const fabricRouter = (await import("./routes/fabric.js")).default;
    app.use("/api/fabric", fabricRouter);
    log("Loaded route: fabric");
  } catch (error) {
    log(
      `Warning: Could not load fabric routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const labelSubmissionsRouter = (
      await import("./routes/labelSubmissions.js")
    ).default;
    app.use("/api/label-submissions", labelSubmissionsRouter);
    log("Loaded route: labelSubmissions");
  } catch (error) {
    log(
      `Warning: Could not load labelSubmissions routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const radioPitchesRouter = (await import("./routes/radioPitches.js"))
      .default;
    app.use("/api/radio-pitches", radioPitchesRouter);
    log("Loaded route: radioPitches");
  } catch (error) {
    log(
      `Warning: Could not load radioPitches routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const venuesRouter = (await import("./routes/venues.js")).default;
    app.use("/api/venues", venuesRouter);
    log("Loaded route: venues");
  } catch (error) {
    log(
      `Warning: Could not load venues routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const projectBudgetsRouter = (await import("./routes/projectBudgets.js"))
      .default;
    app.use("/api/project-budgets", projectBudgetsRouter);
    log("Loaded route: projectBudgets");
  } catch (error) {
    log(
      `Warning: Could not load projectBudgets routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const sampleClearancesRouter = (
      await import("./routes/sampleClearances.js")
    ).default;
    app.use("/api/sample-clearances", sampleClearancesRouter);
    log("Loaded route: sampleClearances");
  } catch (error) {
    log(
      `Warning: Could not load sampleClearances routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const musicVideosRouter = (await import("./routes/musicVideos.js")).default;
    app.use("/api/music-videos", musicVideosRouter);
    log("Loaded route: musicVideos");
  } catch (error) {
    log(
      `Warning: Could not load musicVideos routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const songwritingRouter = (await import("./routes/songwriting.js")).default;
    app.use("/api/songwriting", songwritingRouter);
    log("Loaded route: songwriting");
  } catch (error) {
    log(
      `Warning: Could not load songwriting routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const fanCampaignsRouter = (await import("./routes/fanCampaigns.js"))
      .default;
    app.use("/api/fan-campaigns", fanCampaignsRouter);
    log("Loaded route: fanCampaigns");
  } catch (error) {
    log(
      `Warning: Could not load fanCampaigns routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const customWorkflowsRouter = (await import("./routes/customWorkflows.js"))
      .default;
    app.use("/api/custom-workflows", customWorkflowsRouter);
    log("Loaded route: customWorkflows");
  } catch (error) {
    log(
      `Warning: Could not load customWorkflows routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const assistantRouter = (await import("./routes/assistant.js")).default;
    app.use("/api/assistant", assistantRouter);
    log("Loaded route: assistant");
  } catch (error) {
    log(
      `Warning: Could not load assistant routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    // MaxCore proxy — exposes the internal MaxCore endpoint surface through the
    // Node /api/* layer. Mounted last (its own try block) so it only handles
    // paths not already served by a real Node route, and so an unrelated route
    // load failure never disables it. Uses full /api/* paths internally.
    const maxcoreProxyRouter = (await import("./routes/maxcoreProxy.js"))
      .default;
    app.use(maxcoreProxyRouter);
    log("Loaded route: maxcore-proxy");
  } catch (error) {
    log(
      `Warning: Could not load maxcore-proxy routes - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    // Warm the Self-Evolution registry from persisted state so the autopilot
    // timing/content consumers see active enhancements immediately on boot.
    const { evolutionRegistry } = await import(
      "./services/evolutionRegistry.js"
    );
    await evolutionRegistry.load(true);
    const stats = evolutionRegistry.getStats();
    log(
      `Evolution registry loaded: ${stats.active} active enhancement(s), ${stats.consumedActive} live`,
    );
  } catch (error) {
    log(
      `Warning: Could not load evolution registry - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const { silentDeployment } = await import(
      "./services/silentDeploymentService.js"
    );
    if (process.env.ENABLE_SELF_EVOLUTION === "true") {
      silentDeployment.enable();
      log("Silent deployment system ENABLED (ENABLE_SELF_EVOLUTION=true)");
    } else {
      log(
        "Silent deployment system on standby (set ENABLE_SELF_EVOLUTION=true to activate)",
      );
    }
  } catch (error) {
    logger.warn(
      { err: error },
      `[routes] FATAL: Silent deployment service failed to initialize - ${error instanceof Error ? error.message : String(error)}`,
    );
    if (process.env.ENABLE_SELF_EVOLUTION === "true") {
      throw new Error(
        `Silent deployment init failed (ENABLE_SELF_EVOLUTION=true): ${error instanceof Error ? error?.message : String(error)}`,
      );
    }
    log(
      `ERROR: Could not initialize silent deployment service - ${error instanceof Error ? error?.message : String(error)}`,
    );
  }

  return httpServer;
}

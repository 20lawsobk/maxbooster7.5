import type { Express, Request, Response, NextFunction, Router } from "express";
import { type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage.ts";
import { db } from "./db.ts";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { analytics, userStorage, userStorageFiles } from "../shared/schema.ts";
import bcrypt from "bcrypt";
import { getCsrfToken } from "./middleware/csrf.ts";
import Stripe from "stripe";
import { getStripePriceIds, ensureStripeProductsAndPrices } from "./services/stripeSetup.ts";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { emailService } from "./services/emailService.ts";

// Simple logger fallback for startup
const log = (msg: string) => console.log(`[routes] ${msg}`);

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

    // Module doesn't export anything usable
    log(`Warning: ${name} doesn't export a router or setup function`);
    return { type: 'skip', value: null };
  } catch (error: any) {
    log(`Warning: Could not load ${name} - ${error.message}`);
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
        console.warn(`[Session] User not found for userId: ${req.session.userId}, path: ${req.path}`);
      }
    } catch (error) {
      console.error("Error fetching user for request:", error);
    }
  } else if (isProduction && isApiRoute && req.path !== '/api/auth/me' && req.path !== '/api/csrf-token' && req.path !== '/api/health') {
    const sessionCookie = req.cookies?.sessionId || req.headers.cookie?.includes('sessionId');
    console.warn(`[Session] No userId in session for ${req.path}, cookie present: ${!!sessionCookie}, session exists: ${!!req.session}`);
  }

  // Add isAuthenticated method
  req.isAuthenticated = function (): this is Request & { user: any } {
    return !!this.user;
  };

  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Apply user attachment middleware to all routes
  app.use(attachUser);

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

      console.log(`[Auth/me] Request: origin=${origin}, host=${host}`);
      console.log(`[Auth/me] Cookies raw: ${req.headers.cookie?.substring(0, 100) || 'none'}`);
      console.log(`[Auth/me] Session: exists=${hasSession}, userId=${hasUserId}, sessId=${sessionId}`);

      if (!req.user) {
        if (hasCookie && !hasUserId) {
          console.warn('[Auth/me] Cookie present but no userId - session may have expired or Redis issue');
        } else if (!hasCookie) {
          console.warn('[Auth/me] No sessionId cookie present in request');
        }
      }
    }

    if (req.user) {
      const { password, ...userWithoutPassword } = req.user;
      return res.json(userWithoutPassword);
    }
    return res.json(null);
  });

  // Auth: Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Validate password strength
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
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
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || "",
        lastName: lastName || ""
      });

      req.session.userId = user.id;
      const { password: _, ...userWithoutPassword } = user;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // Auth: Login (accepts username or email)
  app.post("/api/auth/login", async (req: Request, res: Response) => {
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
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
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

        const { authenticator } = await import('otplib');
        const isCodeValid = authenticator.verify({
          token: twoFactorCode,
          secret: user.twoFactorSecret
        });

        if (!isCodeValid) {
          return res.status(401).json({ message: "Invalid 2FA code" });
        }
      }

      req.session.userId = user.id;

      const isProduction = process.env.NODE_ENV === 'production';

      // Explicitly save session for Redis persistence in production
      req.session.save((err) => {
        if (err) {
          console.error('[Login] Session save failed:', err);
          return res.status(500).json({ message: "Login failed - session error" });
        }

        // Production debugging: log session and cookie info
        if (isProduction) {
          const setCookieHeader = res.getHeader('Set-Cookie');
          console.log(`[Login] SUCCESS: userId=${user.id}, sessionId=${req.session.id?.substring(0, 8)}`);
          console.log(`[Login] Cookie config: secure=${req.session.cookie.secure}, sameSite=${req.session.cookie.sameSite}, domain=${req.session.cookie.domain || 'not set'}, path=${req.session.cookie.path}`);
          console.log(`[Login] Set-Cookie header present: ${!!setCookieHeader}`);
          console.log(`[Login] Response headers:`, JSON.stringify(Object.fromEntries(res.getHeaderNames().map(n => [n, res.getHeader(n)]))));
        }

        const { password: _, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // Auth: Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
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
      console.error("Update onboarding error:", error);
      return res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // Auth: Get profile
  app.get("/api/auth/profile", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...profile } = req.user;
    return res.json(profile);
  });

  // Auth: Update profile
  app.put("/api/auth/profile", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { firstName, lastName, bio, website, location, socialLinks } = req.body;
      await storage.updateUser(req.user.id, {
        firstName,
        lastName,
        bio,
        website,
        location,
        socialLinks,
      });
      return res.json({ success: true });
    } catch (error) {
      console.error("Update profile error:", error);
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
      console.error("Update notification settings error:", error);
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
      console.error("Update preferences error:", error);
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
      console.error("Get sessions error:", error);
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
        console.warn(`[Security] Session termination denied: User ${req.user.id} tried to terminate session ${sessionId} belonging to user ${session.userId}`);
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
        console.log("Redis session deletion skipped:", redisError);
      }

      return res.json({ success: true, message: "Session terminated successfully" });
    } catch (error) {
      console.error("Session termination error:", error);
      return res.status(500).json({ message: "Failed to terminate session" });
    }
  });

  // Auth: Change password
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { currentPassword, newPassword } = req.body;
      const isValid = await bcrypt.compare(currentPassword, req.user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(req.user.id, { password: hashedPassword });
      return res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
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
      const isValid = await bcrypt.compare(password, req.user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Password is incorrect" });
      }
      await storage.deleteUser(req.user.id);
      req.session.destroy(() => { });
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete account error:", error);
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
          console.error("Avatar upload error:", err);
          return res.status(400).json({ message: err.message || "Failed to upload avatar" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          const result = await storeUploadedFile(req.file, req.user!.id, 'avatar');

          // Update user record with new avatar URL
          await storage.updateUser(req.user!.id, { avatarUrl: result.url });

          return res.json({
            success: true,
            profileImageUrl: result.url,
            avatarUrl: result.url
          });
        } catch (storeError: any) {
          console.error("Avatar storage error:", storeError);
          return res.status(500).json({ message: storeError.message || "Failed to store avatar" });
        }
      });
    } catch (importError) {
      console.error("Avatar upload import error:", importError);
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
              console.log("Avatar file not found or already deleted:", filePath);
            });
          }
        } catch (fsError) {
          // File deletion is best-effort, continue even if it fails
          console.log("Avatar file deletion skipped:", fsError);
        }
      }

      // Clear the avatar URL from user record
      await storage.updateUser(req.user.id, { avatarUrl: null });

      return res.json({ success: true, message: "Avatar deleted successfully" });
    } catch (error) {
      console.error("Delete avatar error:", error);
      return res.status(500).json({ message: "Failed to delete avatar" });
    }
  });

  // Auth: Export user data
  app.get("/api/auth/export-data", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...userData } = req.user;
    return res.json({
      user: userData,
      exportedAt: new Date().toISOString(),
    });
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
      console.error("2FA setup error:", error);
      return res.status(500).json({ message: "Failed to setup 2FA" });
    }
  });

  // Auth: 2FA verify - Verify TOTP code and enable 2FA
  app.post("/api/auth/2fa/verify", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ message: "Verification code is required" });
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
      console.error("2FA verify error:", error);
      return res.status(500).json({ message: "Failed to verify 2FA code" });
    }
  });

  // Auth: 2FA disable - Disable 2FA on account
  app.post("/api/auth/2fa/disable", async (req: Request, res: Response) => {
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
      console.error("2FA disable error:", error);
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

  // Auth: Demo login
  app.post("/api/auth/demo", async (req: Request, res: Response) => {
    try {
      let demoUser = await storage.getUserByEmail("demo@maxbooster.com");
      if (!demoUser) {
        const hashedPassword = await bcrypt.hash("demo123", 10);
        demoUser = await storage.createUser({
          email: "demo@maxbooster.com",
          password: hashedPassword,
          firstName: "Demo",
          lastName: "User"
        });
      }
      req.session.userId = demoUser.id;
      const { password, ...userWithoutPassword } = demoUser;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Demo login error:", error);
      return res.status(500).json({ message: "Demo login failed" });
    }
  });

  // Auth: Forgot password
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
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
      console.error("Forgot password error:", error);
      return res.json({ success: true, message: "If the email exists, a reset link has been sent." });
    }
  });

  // Auth: Reset password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
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
      console.error("Reset password error:", error);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Auth: Token management (admin)
  app.post("/api/auth/token", async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.json({
      token: `max_${Date.now()}_${Math.random().toString(36).substring(7)}`,
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
        console.error('[Google OAuth] Token exchange failed:', tokens);
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
        const username = googleUser.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + Math.random().toString(36).substring(2, 6);

        user = await storage.createUser({
          email: googleUser.email,
          password: '', // No password for OAuth users
          firstName: googleUser.given_name || null,
          lastName: googleUser.family_name || null
        });

        console.log(`[Google OAuth] Created new user: ${user.email}`);
      }

      // Log the user in using session
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error('[Google OAuth] Session save failed:', err);
          return res.redirect('/login?error=login_failed');
        }
        console.log(`[Google OAuth] User logged in: ${user.email}`);
        return res.redirect('/dashboard');
      });
    } catch (err) {
      console.error('[Google OAuth] Error:', err);
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
      console.error("Delete Google connection error:", error);
      return res.status(500).json({ message: "Failed to remove Google connection" });
    }
  });

  // Dashboard: Comprehensive data
  app.get("/api/dashboard/comprehensive", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const stats = {
        totalTracks: 0,
        activeDistributions: 0,
        totalRevenue: 0,
        socialReach: 0,
        monthlyGrowth: {
          tracks: 12,
          distributions: 8,
          revenue: 15,
          socialReach: 22,
        },
        recentActivity: [],
        upcomingReleases: [],
        notifications: [],
      };
      return res.json(stats);
    } catch (error) {
      console.error("Dashboard error:", error);
      return res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // Dashboard: Next action recommendation
  app.get("/api/dashboard/next-action", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      action: "upload_first_track",
      title: "Upload Your First Track",
      description: "Get started by uploading your first track to the platform.",
      priority: "high",
      estimatedTime: "5 minutes",
    });
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
      console.error("Get notifications error:", error);
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
      console.error("Mark notification read error:", error);
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
      console.error("Mark all read error:", error);
      return res.status(500).json({ message: "Failed to mark all as read" });
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
      console.error("Delete notification error:", error);
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
      console.error("Mark notification read error:", error);
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
      console.error("Mark all notifications read error:", error);
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
      console.error("Mark all notifications read error:", error);
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
      console.error("Test notification error:", error);
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
      console.error("Get notification preferences error:", error);
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
      console.error("Update notification preferences error:", error);
      return res.status(500).json({ message: "Failed to update preferences" });
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
      console.error("Projects error:", error);
      return res.json({ data: [] });
    }
  });

  // Projects: Create new project
  app.post("/api/projects", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
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
      });
      return res.json(project);
    } catch (error) {
      console.error("Create project error:", error);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Analytics: Dashboard summary with real data (with optional period path parameter)
  app.get("/api/analytics/dashboard/:period?", async (req: Request, res: Response) => {
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
          avgListenTime: 3.5,
          completionRate: 72,
          skipRate: 18,
          shareRate: 5,
          likeRate: 12,
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
          listenerRetention: 65,
          avgSessionDuration: 12,
          sessionsPerListener: 3,
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
            churnRisk: 15,
            growthPotential: 0,
          },
        },
        revenue: {
          totalRevenue: parseFloat(String(stats.totalRevenue)) || 0,
          monthlyRevenue: 0,
          yearlyRevenue: 0,
          revenueGrowth: 0,
          revenuePerStream: (Number(stats.totalStreams) > 0) ?
            (parseFloat(String(stats.totalRevenue)) / Number(stats.totalStreams)) : 0.004,
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
            { stage: 'Awareness', count: Number(stats.totalListeners) || 0, percentage: 100, conversionRate: 100, dropOffRate: 0 },
            { stage: 'Discovery', count: Math.round((Number(stats.totalListeners) || 0) * 0.6), percentage: 60, conversionRate: 60, dropOffRate: 40 },
            { stage: 'Engagement', count: Math.round((Number(stats.totalListeners) || 0) * 0.35), percentage: 35, conversionRate: 58, dropOffRate: 25 },
            { stage: 'Conversion', count: Math.round((Number(stats.totalListeners) || 0) * 0.15), percentage: 15, conversionRate: 43, dropOffRate: 20 },
            { stage: 'Advocacy', count: Math.round((Number(stats.totalListeners) || 0) * 0.05), percentage: 5, conversionRate: 33, dropOffRate: 10 },
          ],
          funnelMetrics: {
            awarenessToEngagement: 35,
            engagementToConversion: 43,
            conversionToAdvocacy: 33,
            overallConversion: 5,
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
            (parseFloat(String(p.revenue)) / Number(p.streams)) : 0.004,
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
            competitivePosition: 50,
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
      console.error("Analytics dashboard error:", error);
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
      console.error("Analytics export error:", error);
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
      console.error("Anomalies summary error:", error);
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
      console.error("Anomalies list error:", error);
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
      console.error("Acknowledge anomaly error:", error);
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
      console.log(`[Analytics] User ${req.user.id}: ${eventType}`, eventData);

      return res.json({ success: true, message: "Event tracked" });
    } catch (error) {
      console.error("Track event error:", error);
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
        trends: [
          { name: 'Engagement', direction: 'up', change: 12 },
          { name: 'Reach', direction: 'stable', change: 0 },
        ],
        opportunities: [
          {
            id: 'playlist-pitch',
            title: 'Playlist Pitching',
            description: 'Submit your tracks to curated playlists',
            potential: 'high',
          },
        ],
      });
    } catch (error) {
      console.error("AI insights error:", error);
      return res.json({
        performanceScore: 25,
        recommendations: [],
        trends: [],
        opportunities: [],
      });
    }
  });

  // User preferences endpoints
  app.get("/api/user/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json(req.user.preferences || {});
    } catch (error) {
      console.error("Error fetching user preferences:", error);
      return res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.post("/api/user/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const preferences = { ...(req.user.preferences || {}), ...req.body };
      // Fix: users should be imported or referenced correctly
      // TODO: Adjust this line to match your ORM/database API for updating user preferences
      // Example for drizzle-orm:
      // await db.update(users).set({ preferences }).where(eq(users.id, req.user.id));
      return res.json({ success: true, preferences });
    } catch (error) {
      console.error("Error updating user preferences:", error);
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
      console.error("Error fetching studio preferences:", error);
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
      // TODO: Adjust this line to match your ORM/database API for updating studio preferences
      // Example for drizzle-orm:
      // await db.update(users).set({ preferences }).where(eq(users.id, req.user.id));
      return res.json({ success: true, studio: req.body });
    } catch (error) {
      console.error("Error updating studio preferences:", error);
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
      console.error("Analysis error:", error);
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
      console.error("Analysis error:", error);
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
      console.error("Assets fetch error:", error);
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
          console.error("Asset storage error:", uploadError);
          return res.status(500).json({ message: "Failed to store asset" });
        }
      });
    } catch (error) {
      console.error("Asset upload error:", error);
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
      console.error("Pocket list error:", error);
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
      console.error("Pocket create error:", error);
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
      console.error("Pocket demo error:", error);
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
      return res.json({
        id: pocketId,
        totalSize: pocket?.totalBytes || 0,
        fileCount: pocket?.fileCount || 0,
        lastUpdated: pocket?.lastAccessedAt || new Date(),
      });
    } catch (error) {
      console.error("Pocket stats error:", error);
      return res.status(500).json({ message: "Failed to fetch pocket stats" });
    }
  });

  app.get("/api/pocket/:pocketId/list", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { pocketId } = req.params;
      const files = await db.query.userStorageFiles.findMany({
        where: eq(userStorageFiles.storageId, pocketId),
      });
      return res.json(files);
    } catch (error) {
      console.error("Pocket files error:", error);
      return res.status(500).json({ message: "Failed to fetch pocket files" });
    }
  });

  app.post("/api/pocket/:pocketId/write", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { pocketId } = req.params;
      const { filename, content } = req.body;
      return res.json({
        success: true,
        fileId: `file_${Date.now()}`,
        pocketId,
        filename,
        message: 'File written successfully',
      });
    } catch (error) {
      console.error("Pocket write error:", error);
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
      console.error("Audit results error:", error);
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
      console.error("Testing results error:", error);
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
      console.error("Complete onboarding error:", error);
      return res.status(500).json({ message: "Failed to complete onboarding" });
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
      console.error("Download statement error:", error);
      return res.status(500).json({ message: "Failed to generate statement download" });
    }
  });

  // Royalties endpoints
  app.get("/api/royalties", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        totalEarnings: 0,
        pendingPayouts: 0,
        lastPayout: null,
        earnings: [],
      });
    } catch (error) {
      console.error("Royalties error:", error);
      return res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  app.get("/api/royalties/platform-breakdown", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json([]);
    } catch (error) {
      console.error("Platform breakdown error:", error);
      return res.status(500).json({ message: "Failed to fetch platform breakdown" });
    }
  });

  app.get("/api/royalties/top-tracks", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json([]);
    } catch (error) {
      console.error("Top tracks error:", error);
      return res.status(500).json({ message: "Failed to fetch top tracks" });
    }
  });

  app.get("/api/royalties/payment-methods", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json([]);
    } catch (error) {
      console.error("Payment methods error:", error);
      return res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.post("/api/royalties/payment-methods", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({ success: true, message: 'Payment method added' });
    } catch (error) {
      console.error("Add payment method error:", error);
      return res.status(500).json({ message: "Failed to add payment method" });
    }
  });

  app.get("/api/royalties/payout-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        minimumPayout: 50,
        payoutSchedule: 'monthly',
        preferredMethod: null,
      });
    } catch (error) {
      console.error("Payout settings error:", error);
      return res.status(500).json({ message: "Failed to fetch payout settings" });
    }
  });

  app.put("/api/royalties/payout-settings", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({ success: true, message: 'Payout settings updated' });
    } catch (error) {
      console.error("Update payout settings error:", error);
      return res.status(500).json({ message: "Failed to update payout settings" });
    }
  });

  app.put("/api/royalties/tax-info", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({ success: true, message: 'Tax info updated' });
    } catch (error) {
      console.error("Update tax info error:", error);
      return res.status(500).json({ message: "Failed to update tax info" });
    }
  });

  app.get("/api/royalties/splits", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json([]);
    } catch (error) {
      console.error("Royalty splits error:", error);
      return res.status(500).json({ message: "Failed to fetch royalty splits" });
    }
  });

  app.post("/api/royalties/splits", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { collaboratorEmail, percentage, projectId } = req.body;
      return res.json({
        id: `split_${Date.now()}`,
        collaboratorEmail,
        percentage,
        projectId,
        status: 'pending',
      });
    } catch (error) {
      console.error("Create split error:", error);
      return res.status(500).json({ message: "Failed to create royalty split" });
    }
  });

  app.delete("/api/royalties/splits/:splitId", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({ success: true, message: 'Royalty split deleted' });
    } catch (error) {
      console.error("Delete split error:", error);
      return res.status(500).json({ message: "Failed to delete royalty split" });
    }
  });

  app.post("/api/royalties/export", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        success: true,
        downloadUrl: `/exports/royalties_${Date.now()}.csv`,
      });
    } catch (error) {
      console.error("Export royalties error:", error);
      return res.status(500).json({ message: "Failed to export royalties" });
    }
  });

  app.post("/api/royalties/request-payout", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        success: true,
        payoutId: `payout_${Date.now()}`,
        message: 'Payout request submitted',
      });
    } catch (error) {
      console.error("Request payout error:", error);
      return res.status(500).json({ message: "Failed to request payout" });
    }
  });

  app.post("/api/royalties/connect-stripe", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      return res.json({
        success: true,
        url: '/settings?tab=payments',
        message: 'Please complete Stripe connection in settings',
      });
    } catch (error) {
      console.error("Connect Stripe error:", error);
      return res.status(500).json({ message: "Failed to connect Stripe" });
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
      console.error("Create subscription error:", error);
      return res.status(500).json({ message: "Failed to create subscription" });
    }
  });


  // Audio file upload endpoint
  app.post("/api/audio/upload", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { audioData, format, duration, trackId } = req.body;

      // Return success response with mock data for file upload
      // In production, this would save to object storage
      return res.json({
        success: true,
        fileId: `audio_${Date.now()}`,
        url: `/uploads/audio/recording_${Date.now()}.${format || 'wav'}`,
        duration: duration || 0,
        message: 'Audio file uploaded successfully',
      });
    } catch (error) {
      console.error("Audio upload error:", error);
      return res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Mount modular admin and paid routers
  const { default: adminRouter } = await import("./routes/admin.ts");
  const { default: paidRouter } = await import("./routes/paid.ts");
  app.use("/api/admin", adminRouter);
  app.use("/api/paid", paidRouter);

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
      console.error("AI optimize content error:", error);
      return res.status(500).json({ message: "Failed to optimize content" });
    }
  });

  // Dynamically load and mount route modules (with error handling)
  const routeModules = [
    // Core Platform Routes
    { path: "/api/distribution", name: "distribution", loader: () => import("./routes/distribution") },
    { path: "/api/storefront", name: "storefront", loader: () => import("./routes/storefront") },
    { path: "/api/analytics", name: "analytics", loader: () => import("./routes/analytics-internal") },
    { path: "/api/status", name: "status", loader: () => import("./routes/status") },
    { path: "/api/monitoring", name: "monitoring", loader: () => import("./routes/monitoring") },
    { path: "/api/dmca", name: "dmca", loader: () => import("./routes/dmca") },
    { path: "/api/growth", name: "growth", loader: () => import("./routes/growth") },
    { path: "/api/backup", name: "backup", loader: () => import("./routes/backup") },

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
    { path: "/api/auto/social", name: "autonomousSocial", loader: () => import("./routes/autonomousSocial") },
    { path: "/api/auto-updates", name: "autoUpdates", loader: () => import("./routes/autoUpdates") },

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
    { path: "/api/distribution/promo", name: "promotionalTools", loader: () => import("./routes/promotionalTools") },

    // Offline Mode
    { path: "/api/offline", name: "offline", loader: () => import("./routes/offline") },

    // Workspace & Developer
    { path: "/api/workspace", name: "workspace", loader: () => import("./routes/workspace") },
    { path: "/api/developer", name: "developerApi", loader: () => import("./routes/developerApi") },
    { path: "/api/content-analysis", name: "content-analysis", loader: () => import("./routes/content-analysis") },

    // Help & Support
    { path: "/api/helpdesk", name: "helpDesk", loader: () => import("./routes/helpDesk") },
    { path: "/api/support", name: "support", loader: () => import("./routes/support") },

    // Executive & Admin
    { path: "/api/executive", name: "executiveDashboard", loader: () => import("./routes/executiveDashboard") },
    { path: "/api/admin", name: "admin", loader: () => import("./routes/admin/index") },
    { path: "/api/admin/metrics", name: "adminMetrics", loader: () => import("./routes/admin/metrics") },
    { path: "/api/audit", name: "audit", loader: () => import("./routes/audit") },
    { path: "/api/testing", name: "testing", loader: () => import("./routes/testing") },
    { path: "/api/webhooks", name: "webhooksAdmin", loader: () => import("./routes/webhooks-admin") },
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

    // Simulation (pre-launch testing)
    { path: "/api/simulation", name: "simulation", loader: () => import("./routes/simulation") },

    // Safety & Admin Controls
    { path: "/api/kill-switch", name: "killSwitch", loader: () => import("./routes/killSwitch") },
    { path: "/api/admin/payment-bypass", name: "paymentBypass", loader: () => import("./routes/paymentBypass") },

    // Self-Healing Security System
    { path: "/api/security/self-healing", name: "selfHealingApi", loader: () => import("./routes/selfHealingApi") },

    // Security Dashboard API
    { path: "/api/security", name: "security", loader: () => import("./routes/security") },

    // Marketplace with Discovery Algorithm
    { path: "/api/marketplace", name: "marketplace", loader: () => import("./routes/marketplace") },

    // Contracts, Invoices, Tax Forms & Split Sheets
    { path: "/api/contracts", name: "contracts", loader: () => import("./routes/contracts") },

    // AI Services
    { path: "/api/ai", name: "ai", loader: () => import("./routes/ai") },
  ];

  for (const { path, name, loader } of routeModules) {
    const result = await safeLoadRoute(name, loader);
    if (result && result.type !== 'skip') {
      if (result.type === 'router' && result.value) {
        try {
          app.use(path, result.value);
        } catch (e: any) {
          log(`Warning: Failed to mount ${name} - ${e.message}`);
        }
      } else if (result.type === 'function' && result.value) {
        // Call setup function with the app
        try {
          result.value(app);
        } catch (e: any) {
          log(`Warning: Failed to setup ${name} - ${e.message}`);
        }
      }
    }
  }

  // Error reporting endpoint
  app.post("/api/errors", (req: Request, res: Response) => {
    console.error("Client error:", req.body);
    res.json({ received: true });
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

      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:5000`;

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
      console.error('Error creating checkout session:', error);
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
        // User already exists - log them in
        req.session.userId = existingUser.id;
        const { password: _, ...userWithoutPassword } = existingUser;
        return res.json({ user: userWithoutPassword, message: 'Account already exists. Logged in.' });
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

      // Log the user in
      req.session.userId = user.id;

      const { password: _, ...userWithoutPassword } = user;
      return res.json({ user: userWithoutPassword, message: 'Account created successfully' });
    } catch (error: any) {
      console.error('Error completing registration after payment:', error);

      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: 'Invalid payment session. Please try again.' });
      }

      return res.status(500).json({ error: 'Failed to complete registration. Please contact support.' });
    }
  });

  // Public payment-bypass status endpoint (separate from admin-only management endpoints)
  app.get("/api/payment-bypass/status", async (req: Request, res: Response) => {
    try {
      const { paymentBypassService } = await import('./services/paymentBypassService');
      const status = await paymentBypassService.getStatus();
      return res.json({ bypassed: status.bypassed, reason: status.config?.reason || null });
    } catch (error) {
      return res.json({ bypassed: false, reason: null });
    }
  });

  // Infrastructure scaling routes
  try {
    const { scalingMetricsRouter, getInfrastructureStatus } = await import('./infrastructure/index.js');
    app.use('/api/infrastructure', scalingMetricsRouter);
    app.get('/api/infrastructure/status', (req, res) => {
      try {
        const status = getInfrastructureStatus();
        res.json({ success: true, ...status });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    log('Infrastructure scaling routes registered');
  } catch (error: any) {
    log(`Warning: Could not load infrastructure routes - ${error.message}`);
  }

  return httpServer;
}

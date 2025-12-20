import type { Express, Request, Response, NextFunction, Router } from "express";
import { type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { getCsrfToken } from "./middleware/csrf";
import Stripe from "stripe";
import { getStripePriceIds, ensureStripeProductsAndPrices } from "./services/stripeSetup.js";

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
      isAuthenticated(): boolean;
    }
  }
}

// Middleware to attach user to request
async function attachUser(req: Request, res: Response, next: NextFunction) {
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = user;
      }
    } catch (error) {
      console.error("Error fetching user for request:", error);
    }
  }
  
  // Add isAuthenticated method
  req.isAuthenticated = () => !!req.user;
  
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
    if (req.user) {
      const { password, ...userWithoutPassword } = req.user;
      return res.json(userWithoutPassword);
    }
    return res.json(null);
  });

  // Auth: Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || "",
        lastName: lastName || "",
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
      const { email, username, password } = req.body;
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

      req.session.userId = user.id;
      const { password: _, ...userWithoutPassword } = user;
      return res.json(userWithoutPassword);
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

  // Auth: Get notification settings
  app.get("/api/auth/notifications", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      emailNotifications: true,
      pushNotifications: true,
      marketingEmails: false,
      releaseAlerts: true,
      paymentAlerts: true,
      securityAlerts: true,
    });
  });

  // Auth: Update notification settings
  app.put("/api/auth/notifications", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
  });

  // Auth: Get preferences
  app.get("/api/auth/preferences", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      theme: "dark",
      language: "en",
      timezone: "America/New_York",
      dateFormat: "MM/DD/YYYY",
      currency: "USD",
    });
  });

  // Auth: Update preferences
  app.put("/api/auth/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
  });

  // Auth: Get sessions
  app.get("/api/auth/sessions", (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json([
      {
        id: req.session.id,
        device: "Current Device",
        location: "Unknown",
        lastActive: new Date().toISOString(),
        isCurrent: true,
      },
    ]);
  });

  // Auth: Terminate session
  app.post("/api/auth/sessions/terminate", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
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
      req.session.destroy(() => {});
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete account error:", error);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Auth: Upload avatar
  app.post("/api/auth/avatar", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true, avatarUrl: "/uploads/avatar-default.png" });
  });

  // Auth: Delete avatar
  app.delete("/api/auth/avatar", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
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

  // Auth: 2FA setup
  app.post("/api/auth/2fa/setup", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      secret: "MOCK2FASECRET",
      qrCode: "data:image/png;base64,mock",
    });
  });

  // Auth: 2FA verify
  app.post("/api/auth/2fa/verify", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
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
          lastName: "User",
          username: "demouser",
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
    const { email } = req.body;
    // In production, send a reset email
    return res.json({ success: true, message: "If the email exists, a reset link has been sent." });
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
          username,
          password: '', // No password for OAuth users
          firstName: googleUser.given_name || null,
          lastName: googleUser.family_name || null,
          role: 'user',
          subscriptionTier: 'free',
          subscriptionStatus: 'inactive',
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
    return res.json({ success: true });
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
    return res.json([]);
  });

  // Notifications: Mark as read
  app.post("/api/notifications/:id/read", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
  });

  // Notifications: Mark all as read
  app.post("/api/notifications/read-all", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
  });

  // Notifications: Get preferences
  app.get("/api/notifications/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      email: true,
      push: true,
      sms: false,
      releaseAlerts: true,
      paymentAlerts: true,
      marketingEmails: false,
    });
  });

  // Notifications: Update preferences
  app.put("/api/notifications/preferences", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ success: true });
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

  // Analytics: Dashboard summary
  app.get("/api/analytics/dashboard", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      streams: { total: 0, change: 0 },
      revenue: { total: 0, change: 0 },
      followers: { total: 0, change: 0 },
      engagement: { rate: 0, change: 0 },
    });
  });

  // AI: Insights
  app.get("/api/ai/insights", async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      recommendations: [],
      trends: [],
      opportunities: [],
    });
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
    { path: "/api/kyc", name: "kyc", loader: () => import("./routes/kyc") },
    
    // Social & Advertising
    { path: "/api/social", name: "socialOAuth", loader: () => import("./routes/socialOAuth") },
    { path: "/api/social", name: "socialMedia", loader: () => import("./routes/socialMedia") },
    { path: "/api/social/approvals", name: "socialApprovals", loader: () => import("./routes/socialApprovals") },
    { path: "/api/social/bulk", name: "socialBulk", loader: () => import("./routes/socialBulk") },
    { path: "/api/social", name: "socialAI", loader: () => import("./routes/socialAI") },
    { path: "/api/organic", name: "organic", loader: () => import("./routes/organic") },
    { path: "/api/advertising", name: "advertisingAutopilot", loader: () => import("./routes/advertisingAutopilot") },
    { path: "/api/autopilot", name: "autopilot", loader: () => import("./routes/autopilot") },
    
    // Studio/DAW Routes
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
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
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

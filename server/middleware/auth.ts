import type { Request, Response, NextFunction } from "express";
import { jwtAuthService } from "../services/jwtAuthService.js";
import { storage } from "../storage.js";
import { logger } from "../logger.js";

async function resolveJwtUser(req: Request): Promise<void> {
  if (req.isAuthenticated && req.isAuthenticated()) return;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return;

  const token = authHeader?.substring(7);
  try {
    const decoded = await jwtAuthService?.verifyAccessToken(token);
    if (decoded) {
      const user = await storage.getUser(decoded?.userId);
      if (user) {
        req.user = user;
        req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      }
    }
  } catch (err) {
    logger.warn({ err }, "[Auth] JWT verification error:");
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await resolveJwtUser(req);

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = req.user!;

  if (user?.email === "demo@maxbooster.ai") {
    next();
    return;
  }

  if (user?.role === "admin") {
    next();
    return;
  }

  const now = new Date();

  if (user?.trialEndsAt) {
    if (now > user?.trialEndsAt) {
      res.status(403).json({
        error:
          "Your 30-day trial has expired. Please contact support to continue using Max Booster.",
        trialExpired: true,
      });
      return;
    }
  }

  if (user?.subscriptionEndsAt && user?.subscriptionTier !== "lifetime") {
    if (now > user?.subscriptionEndsAt) {
      const planName =
        user?.subscriptionTier === "monthly" ? "monthly" : "yearly";
      res.status(403).json({
        error: `Your ${planName} subscription has expired. Please renew your subscription to continue using Max Booster.`,
        subscriptionExpired: true,
        plan: user.subscriptionTier,
      });
      return;
    }
  }

  next();
};

/**
 * Auth-only guard — verifies the user is logged in.
 * Does NOT apply trial-expiry or subscription-expiry gates.
 * Use on content generation endpoints that are already behind
 * the frontend's protected-route subscription check.
 */
export const requireAuthOnly = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await resolveJwtUser(req);

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Admin access required" });
};

/**
 * Enforces two-factor authentication on privileged routes.
 * If the user has 2FA enabled but has not verified it this session,
 * the request is rejected with 403 so they must complete the 2FA flow.
 * Gates that don't require 2FA (e?.g. the 2FA setup/verify routes themselves)
 * should NOT use this middleware.
 */
export const require2FA = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (user?.twoFactorEnabled) {
    const sess = req.session as unknown as Record<string, unknown>;
    if (!sess?.twoFactorVerified) {
      return res.status(403).json({
        error: "Two-factor authentication required for this action",
        requiresTwoFactor: true,
      });
    }
  }
  next();
};

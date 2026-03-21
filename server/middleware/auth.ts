import type { Request, Response, NextFunction } from 'express';
import { jwtAuthService } from '../services/jwtAuthService.js';
import { storage } from '../storage.js';
import { logger } from '../logger.js';

interface AuthenticatedRequest extends Request {
  isAuthenticated(): boolean;
  user?: any;
}

/**
 * Shared JWT bearer-token resolution.
 * If the session already has an authenticated user, this is a no-op.
 * Otherwise it tries to decode the Authorization header and loads the user.
 */
async function resolveJwtUser(req: AuthenticatedRequest): Promise<void> {
  if (req.isAuthenticated && req.isAuthenticated()) return;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return;

  const token = authHeader.substring(7);
  try {
    const decoded = await jwtAuthService.verifyAccessToken(token);
    if (decoded) {
      const user = await storage.getUser(decoded.userId);
      if (user) {
        req.user = user;
        req.isAuthenticated = () => true;
      }
    }
  } catch (err) {
    logger.error('[Auth] JWT verification error:', err);
  }
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  await resolveJwtUser(req);

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.user.email === 'demo@maxbooster.ai') {
    next();
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  const now = new Date();

  if (req.user.trialEndsAt) {
    const trialEnd = new Date(req.user.trialEndsAt);
    if (now > trialEnd) {
      res.status(403).json({
        message: 'Your 30-day trial has expired. Please contact support to continue using Max Booster.',
        trialExpired: true,
      });
      return;
    }
  }

  if (req.user.subscriptionEndsAt && req.user.subscriptionTier !== 'lifetime') {
    const subscriptionEnd = new Date(req.user.subscriptionEndsAt);
    if (now > subscriptionEnd) {
      const planName = req.user.subscriptionTier === 'monthly' ? 'monthly' : 'yearly';
      res.status(403).json({
        message: `Your ${planName} subscription has expired. Please renew your subscription to continue using Max Booster.`,
        subscriptionExpired: true,
        plan: req.user.subscriptionTier,
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
export const requireAuthOnly = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  await resolveJwtUser(req);

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  next();
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (req.user?.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: 'Admin access required' });
};

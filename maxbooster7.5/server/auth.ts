import type { Request, Response, NextFunction } from 'express';
import { jwtAuthService } from './services/jwtAuthService';
import { storage } from './storage';
import { logger } from './logger.js';

export const verifyJWT = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No JWT token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = await jwtAuthService.verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or revoked token' });
    }

    const user = await storage.getUser(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      subscriptionType: user.subscriptionTier || null,
      subscriptionStatus: user.subscriptionStatus || null,
      stripeCustomerId: user.stripeCustomerId || null,
      subscriptionEndDate: user.subscriptionEndsAt || null,
      trialEndDate: user.trialEndsAt || null,
    };

    next();
  } catch (error: unknown) {
    logger.error('JWT verification error:', error);
    return res.status(401).json({ message: 'Token verification failed' });
  }
};

export const requireAuthDual = async (req: Request, res: Response, next: NextFunction) => {
  // First check for passport.js session authentication (req.isAuthenticated checks req.user)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  // Fallback: check for custom session userId
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          subscriptionType: user.subscriptionTier || null,
          subscriptionStatus: user.subscriptionStatus || null,
          stripeCustomerId: user.stripeCustomerId || null,
          subscriptionEndDate: user.subscriptionEndsAt || null,
          trialEndDate: user.trialEndsAt || null,
        };
        return next();
      }
    } catch (error: unknown) {
      logger.error('Session auth error:', error);
    }
  }

  // Final fallback: try JWT authentication
  return verifyJWT(req, res, next);
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const user = await storage.getUser(req.user.id);

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

// Alias for backwards compatibility
export const requireAuth = requireAuthDual;

// Block write operations for demo users (read-only mode)
export const blockDemoWrite = async (req: Request, res: Response, next: NextFunction) => {
  // Allow if not a demo session
  if (!req.session?.isDemo) {
    return next();
  }
  
  // Block all write methods for demo users
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (writeMethods.includes(req.method)) {
    // Allow certain read-like POST endpoints (analytics, search, etc.)
    const allowedDemoPaths = [
      '/api/auth/logout',
      '/api/auth/demo',
      '/api/search',
      '/api/analytics',
    ];
    
    if (allowedDemoPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    logger.info(`Demo user blocked from write operation: ${req.method} ${req.path}`);
    return res.status(403).json({ 
      message: 'Demo mode is read-only. Subscribe to unlock full access.',
      isDemo: true,
      upgradeUrl: '/pricing'
    });
  }
  
  next();
};

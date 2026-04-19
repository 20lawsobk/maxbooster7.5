import type { Request, Response, NextFunction } from 'express';
import { jwtAuthService } from './services/jwtAuthService';
import { storage } from './storage';
import { logger } from './logger.js';
import { getRedisClient } from './lib/redisConnectionFactory.js';

// Brute-force guard for JWT verification.
// 60 failed attempts per 15min per IP and per token-prefix.
const JWT_RL_WINDOW_MS = 15 * 60 * 1000;
const JWT_RL_MAX = 60;

const localRl = new Map<string, { count: number; resetAt: number }>();
const localRlPrune = () => {
  const now = Date.now();
  for (const [k, v] of localRl) if (v.resetAt <= now) localRl.delete(k);
};

async function jwtRateLimit(key: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (client) {
      const redisKey = `ratelimit:jwt:${key}`;
      const count = await (client as any).incr(redisKey);
      if (count === 1) await (client as any).pexpire(redisKey, JWT_RL_WINDOW_MS);
      return count <= JWT_RL_MAX;
    }
  } catch {
    // fall through to in-memory fallback
  }
  if (localRl.size > 50_000) localRlPrune();
  const now = Date.now();
  const entry = localRl.get(key);
  if (!entry || entry.resetAt <= now) {
    localRl.set(key, { count: 1, resetAt: now + JWT_RL_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= JWT_RL_MAX;
}

export const verifyJWT = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No JWT token provided' });
  }

  const token = authHeader.substring(7);

  // Rate-limit failed attempts by IP + token prefix to thwart brute-force.
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown').toString();
  const tokenPrefix = token.slice(0, 16);
  const rlKey = `${ip}:${tokenPrefix}`;
  if (!(await jwtRateLimit(rlKey))) {
    return res
      .status(429)
      .json({ message: 'Too many JWT verification attempts. Try again later.' });
  }

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
    logger.warn({ err: error }, 'JWT verification error:');
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
          username: user.username,
          displayName: (user as any).displayName || user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: (user as any).avatarUrl || null,
          profileImageUrl: (user as any).profileImageUrl || null,
          bio: (user as any).bio || null,
          role: (user as any).role || 'user',
          subscriptionType: user.subscriptionTier || null,
          subscriptionStatus: user.subscriptionStatus || null,
          stripeCustomerId: user.stripeCustomerId || null,
          subscriptionEndDate: user.subscriptionEndsAt || null,
          trialEndDate: user.trialEndsAt || null,
        };
        return next();
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, 'Session auth error:');
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
// NOTE: This middleware is mounted at '/api', so req.path strips the '/api' prefix.
// Use req.originalUrl for full-path matching or paths without the /api prefix.
export const blockDemoWrite = async (req: Request, res: Response, next: NextFunction) => {
  if ((req as any).user?.email !== 'demo@maxbooster.ai') {
    return next();
  }
  
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (writeMethods.includes(req.method)) {
    const fullPath = req.originalUrl.split('?')[0];
    const allowedDemoPaths = [
      '/api/auth/logout',
      '/api/auth/demo',
      '/api/auth/me',
      '/api/search',
      '/api/analytics',
    ];
    
    if (allowedDemoPaths.some(path => fullPath.startsWith(path))) {
      return next();
    }
    
    logger.info(`Demo user blocked from write operation: ${req.method} ${fullPath}`);
    return res.status(403).json({ 
      message: 'Demo mode is read-only. Subscribe to unlock full access.',
      isDemo: true,
      upgradeUrl: '/pricing'
    });
  }
  
  next();
};

import session from 'express-session';
import crypto from 'crypto';
import { getBoosterStateClient } from '../lib/boosterStateClient.js';
import { logger } from '../logger.js';

class BoosterStateSessionStore extends session.Store {
  get(sid: string, callback: (err?: any, session?: session.SessionData | null) => void): void {
    getBoosterStateClient()
      .then((client) => {
        if (!client) return callback(null, null);
        return client.get('sess:' + sid);
      })
      .then((data) => {
        if (!data) return callback(null, null);
        try {
          callback(null, JSON.parse(data));
        } catch {
          callback(null, null);
        }
      })
      .catch((err) => callback(err));
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): void {
    const ttl = Math.floor((sessionData?.cookie?.maxAge || 86400000) / 1000);
    getBoosterStateClient()
      .then((client) => {
        if (!client) return;
        return client.setex('sess:' + sid, ttl, JSON.stringify(sessionData));
      })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    getBoosterStateClient()
      .then((client) => {
        if (!client) return;
        return client.del('sess:' + sid);
      })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  touch(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): void {
    const ttl = Math.floor((sessionData?.cookie?.maxAge || 86400000) / 1000);
    getBoosterStateClient()
      .then((client) => {
        if (!client) return;
        return client.expire('sess:' + sid, ttl);
      })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }
}

/**
 * TODO: Add function documentation
 */
export async function createSessionStore() {
  try {
    const client = await getBoosterStateClient();
    if (client) {
      const store = new BoosterStateSessionStore();
      logger.info('✅ BoosterState session store created');
      return store;
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Failed to create BoosterState session store:', errMsg);
  }
  logger.warn('⚠️ Using in-memory session store. Not suitable for production!');
  return new session.MemoryStore();
}

/**
 * TODO: Add function documentation
 */
export function getSessionConfig(store: session.Store | session.MemoryStore) {
  const isProduction = process.env.NODE_ENV === 'production';

  // CRITICAL: Validate SESSION_SECRET exists in production
  const sessionSecret = process.env.SESSION_SECRET;

  if (isProduction) {
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET environment variable is required in production');
    }

    if (sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters for cryptographic security');
    }
  } else if (!sessionSecret) {
    logger.warn('⚠️  WARNING: SESSION_SECRET not set. Using default for development only.');
    logger.warn('⚠️  Set SESSION_SECRET environment variable for production security.');
  }

  // Use provided secret or secure development default
  const finalSecret = sessionSecret || crypto.randomBytes(32).toString('hex');

  return {
    store,
    secret: finalSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on activity
    name: 'sessionId', // Don't use default 'connect.sid' (security)
    proxy: isProduction, // CRITICAL: Trust X-Forwarded-Proto header in production for secure cookies behind reverse proxy
    cookie: {
      secure: isProduction, // HTTPS only in production
      httpOnly: true, // Prevent XSS access to session cookie
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax' as const, // 'lax' works for same-origin requests (frontend/backend on same domain)
      path: '/',
    },
    // Enhanced session security
    genid: () => {
      // Generate cryptographically secure session IDs
      return crypto.randomBytes(32).toString('hex');
    },
  };
}

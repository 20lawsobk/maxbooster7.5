import session from 'express-session';
import { RedisStore } from 'connect-redis';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redisClient.js';
import { logger } from '../logger.js';

export async function createSessionStore(): Promise<session.Store> {
  try {
    const client = getRedisClient();
    await client.ping();

    const store = new RedisStore({
      client,
      prefix: 'sess:',
      ttl: 24 * 60 * 60,
    });

    logger.info('✅ Redis session store created (sessions survive restarts, shared across instances)');
    return store;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Failed to create Redis session store:', errMsg);
    throw new Error(`Session store initialization failed: ${errMsg}. Sessions cannot be stored safely.`);
  }
}

export function getSessionConfig(store: session.Store) {
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;

  if (isProduction) {
    if (!sessionSecret) throw new Error('SESSION_SECRET environment variable is required in production');
    if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  } else if (!sessionSecret) {
    logger.warn('⚠️  SESSION_SECRET not set. Using random default for development only.');
  }

  const finalSecret = sessionSecret || crypto.randomBytes(32).toString('hex');

  return {
    store,
    secret: finalSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'sessionId',
    proxy: isProduction,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax' as const,
      path: '/',
    },
    genid: () => crypto.randomBytes(32).toString('hex'),
  };
}

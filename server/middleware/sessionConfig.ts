import session from 'express-session';
import { RedisStore } from 'connect-redis';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redisClient.js';
import { logger } from '../logger.js';

const PgSessionStore = connectPgSimple(session);

/**
 * Adapter that wraps an ioredis client to satisfy the connect-redis v9 interface,
 * which expects node-redis v5 API calls:
 *   set(key, val, { expiration: { type: "EX", value: ttl } })
 *   del([key1, key2])
 *   scanIterator({ MATCH: pattern, COUNT: count })
 *
 * ioredis uses:
 *   set(key, val, 'EX', ttl)
 *   del(key1, key2)   ← spread, not array
 *   scan / no scanIterator
 */
function createIoredisAdapter(ioredisClient: any) {
  return {
    get(key: string): Promise<string | null> {
      return ioredisClient.get(key);
    },

    set(
      key: string,
      val: string,
      opts?: { expiration?: { type?: string; value?: number } }
    ): Promise<any> {
      const ttl = opts?.expiration?.value;
      if (ttl && ttl > 0) {
        return ioredisClient.set(key, val, 'EX', ttl);
      }
      return ioredisClient.set(key, val);
    },

    expire(key: string, ttl: number): Promise<any> {
      return ioredisClient.expire(key, ttl);
    },

    del(keys: string | string[]): Promise<any> {
      if (Array.isArray(keys)) {
        if (keys.length === 0) return Promise.resolve(0);
        return ioredisClient.del(...keys);
      }
      return ioredisClient.del(keys);
    },

    async *scanIterator(
      opts: { MATCH?: string; COUNT?: number } = {}
    ): AsyncGenerator<string[]> {
      const pattern = opts.MATCH || '*';
      const count = opts.COUNT || 100;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await ioredisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          yield keys;
        }
      } while (cursor !== '0');
    },
  };
}

export async function createSessionStore(): Promise<session.Store> {
  try {
    const ioredisClient = getRedisClient();
    await ioredisClient.ping();

    const store = new RedisStore({
      client: createIoredisAdapter(ioredisClient) as any,
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

/**
 * Create a PostgreSQL-backed session store using the app's existing DB connection.
 * Shared across all cluster workers — unlike MemoryStore which is per-process.
 * Falls back gracefully if the table can't be created.
 */
export async function createPgSessionStore(): Promise<session.Store> {
  try {
    const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('No database connection string available');
    }

    const store = new PgSessionStore({
      conString: connectionString,
      createTableIfMissing: true,
      tableName: 'session',
      ttl: 24 * 60 * 60, // 24 hours in seconds
      pruneSessionInterval: 60 * 60, // Prune expired sessions every hour
    });

    // Verify the store is working
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PG session store ping timed out')), 5000);
      (store as any).pool?.query('SELECT 1', (err: any) => {
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve();
      });
      // If pool isn't exposed, just resolve — createTableIfMissing handles setup
      if (!(store as any).pool) {
        clearTimeout(timeout);
        resolve();
      }
    });

    logger.info('✅ PostgreSQL session store ready (shared across all workers)');
    return store;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ PostgreSQL session store failed:', errMsg);
    throw new Error(`PostgreSQL session store failed: ${errMsg}`);
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

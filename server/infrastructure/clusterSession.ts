import session from 'express-session';
import connectRedis from 'connect-redis';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../logger.js';

interface ClusterSessionConfig {
  redisUrl?: string;
  sessionSecret: string;
  sessionName: string;
  maxAge: number;
  secure: boolean;
}

class ClusterSessionManager {
  private static instance: ClusterSessionManager;
  private redisClient: RedisClientType | null = null;
  private sessionMiddleware: any = null;
  private isRedisConnected: boolean = false;
  private config: ClusterSessionConfig;

  private constructor() {
    this.config = {
      redisUrl: process.env.REDIS_URL,
      sessionSecret: process.env.SESSION_SECRET || 'max-booster-session-secret-change-in-production',
      sessionName: 'maxbooster.sid',
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'),
      secure: process.env.NODE_ENV === 'production',
    };
  }

  static getInstance(): ClusterSessionManager {
    if (!ClusterSessionManager.instance) {
      ClusterSessionManager.instance = new ClusterSessionManager();
    }
    return ClusterSessionManager.instance;
  }

  async initialize(): Promise<any> {
    if (this.sessionMiddleware) {
      return this.sessionMiddleware;
    }

    const sessionOptions: session.SessionOptions = {
      secret: this.config.sessionSecret,
      name: this.config.sessionName,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: this.config.secure,
        httpOnly: true,
        maxAge: this.config.maxAge,
        sameSite: 'lax',
      },
    };

    if (this.config.redisUrl) {
      try {
        this.redisClient = createClient({ url: this.config.redisUrl });
        
        this.redisClient.on('error', (err) => {
          logger.error('Redis session store error:', err);
          this.isRedisConnected = false;
        });

        this.redisClient.on('connect', () => {
          logger.info('Redis session store connected');
          this.isRedisConnected = true;
        });

        await this.redisClient.connect();
        
        const RedisStore = connectRedis(session);
        sessionOptions.store = new RedisStore({
          client: this.redisClient as any,
          prefix: 'maxbooster:sess:',
          ttl: this.config.maxAge / 1000,
        });

        logger.info('Cluster session manager initialized with Redis store');
      } catch (error) {
        logger.warn('Failed to connect to Redis for sessions, using memory store:', error);
        this.isRedisConnected = false;
      }
    } else {
      logger.info('No Redis URL configured, using memory session store (not recommended for production)');
    }

    this.sessionMiddleware = session(sessionOptions);
    return this.sessionMiddleware;
  }

  getMiddleware(): any {
    if (!this.sessionMiddleware) {
      throw new Error('Session middleware not initialized. Call initialize() first.');
    }
    return this.sessionMiddleware;
  }

  isDistributed(): boolean {
    return this.isRedisConnected;
  }

  async invalidateSession(sessionId: string): Promise<boolean> {
    if (!this.isRedisConnected || !this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.del(`maxbooster:sess:${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Failed to invalidate session:', error);
      return false;
    }
  }

  async invalidateUserSessions(userId: string): Promise<number> {
    if (!this.isRedisConnected || !this.redisClient) {
      return 0;
    }

    try {
      const keys = await this.redisClient.keys('maxbooster:sess:*');
      let invalidated = 0;

      for (const key of keys) {
        const sessionData = await this.redisClient.get(key);
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData);
            if (parsed.passport?.user?.id === userId) {
              await this.redisClient.del(key);
              invalidated++;
            }
          } catch {
          }
        }
      }

      logger.info(`Invalidated ${invalidated} sessions for user ${userId}`);
      return invalidated;
    } catch (error) {
      logger.error('Failed to invalidate user sessions:', error);
      return 0;
    }
  }

  async getActiveSessionCount(): Promise<number> {
    if (!this.isRedisConnected || !this.redisClient) {
      return -1;
    }

    try {
      const keys = await this.redisClient.keys('maxbooster:sess:*');
      return keys.length;
    } catch (error) {
      logger.error('Failed to get session count:', error);
      return -1;
    }
  }

  getStatus(): { mode: string; connected: boolean; prefix: string } {
    return {
      mode: this.isRedisConnected ? 'redis' : 'memory',
      connected: this.isRedisConnected,
      prefix: 'maxbooster:sess:',
    };
  }

  async shutdown(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.isRedisConnected = false;
    }
  }
}

export const clusterSessionManager = ClusterSessionManager.getInstance();

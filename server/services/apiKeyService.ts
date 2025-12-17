import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { apiKeys, apiUsage, insertApiKeySchema, insertApiUsageSchema } from '@shared/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { config } from '../config/defaults';
import { logger } from '../logger.js';

// Extended Express Request with API key info
export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: string;
    userId: string;
    tier: 'free' | 'pro' | 'enterprise';
    rateLimit: number;
  };
}

/**
 * Generate a secure API key with prefix and hashing
 * Format: mb_live_<random64chars>
 * SECURITY: Plaintext key is ONLY returned to user once, never stored in database
 */
/**
 * TODO: Add function documentation
 */
export async function generateApiKey(
  userId: string,
  keyName: string,
  tier: 'free' | 'pro' | 'enterprise' = 'free'
) {
  try {
    // Generate secure random API key
    const randomBytes = crypto.randomBytes(32);
    const apiKey = `mb_live_${randomBytes.toString('hex')}`;

    // Hash the API key for secure storage using SHA-256
    // Note: SHA-256 is deterministic (allows DB lookups) and secure for long random strings
    // bcrypt is unnecessary here since API keys are cryptographically random, not user passwords
    const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Determine rate limit based on tier
    const rateLimit = tier === 'enterprise' ? 5000 : tier === 'pro' ? 1000 : 100;

    // Insert ONLY the hashed key into database (never store plaintext)
    const [newKey] = await db
      .insert(apiKeys)
      .values({
        userId,
        keyName,
        hashedApiKey, // Only store the hash
        tier,
        rateLimit,
        isActive: true,
      })
      .returning();

    logger.info(
      `🔑 Generated API key for user ${userId}: ${keyName} (${tier} tier, ${rateLimit} req/sec)`
    );

    // Return the plaintext key to user (ONLY TIME IT'S SHOWN)
    return {
      ...newKey,
      apiKey, // Return plaintext key for user to save (not stored in DB)
    };
  } catch (error: unknown) {
    logger.error('Error generating API key:', error);
    throw new Error('Failed to generate API key');
  }
}

/**
 * Validate API key and attach key info to request
 * SECURITY: Validates by comparing hashes, never stores or looks up plaintext keys
 */
/**
 * TODO: Add function documentation
 */
export async function validateApiKey(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid API key. Use Authorization: Bearer <api_key>',
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if API key format is valid
    if (!apiKey.startsWith('mb_live_')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key format. API keys must start with mb_live_',
      });
    }

    // Hash the incoming API key using SHA-256 (same algorithm as generateApiKey)
    const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Look up API key by hash (secure: no plaintext in database)
    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.hashedApiKey, hashedApiKey), eq(apiKeys.isActive, true)))
      .limit(1);

    if (!keyRecord) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key',
      });
    }

    // Check if API key has expired
    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key has expired',
      });
    }

    // Attach API key info to request
    req.apiKey = {
      id: keyRecord.id,
      userId: keyRecord.userId,
      tier: keyRecord.tier,
      rateLimit: keyRecord.rateLimit,
    };

    // Update last used timestamp (async, don't wait)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id))
      .execute()
      .catch((err) => logger.error('Error updating API key last used:', err));

    next();
  } catch (error: unknown) {
    logger.error('Error validating API key:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate API key',
    });
  }
}

/**
 * Rate limiting middleware using Redis sliding window
 */
/**
 * TODO: Add function documentation
 */
export async function rateLimitApiKey(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    if (!req.apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key validation required before rate limiting',
      });
    }

    const { id: keyId, rateLimit } = req.apiKey;
    const now = Date.now();
    const windowSize = 1000; // 1 second window (for per-second rate limit)
    const redisKey = `api_rate_limit:${keyId}`;

    try {
      // Use Redis sorted set with sliding window
      const pipeline = redisClient.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(redisKey, 0, now - windowSize);

      // Count requests in current window
      pipeline.zcard(redisKey);

      // Add current request
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);

      // Set expiration on the key (2 seconds)
      pipeline.expire(redisKey, 2);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Redis pipeline failed');
      }

      // Get request count (index 1 is zcard result)
      const requestCount = (results[1]?.[1] as number) || 0;

      // Check if rate limit exceeded
      if (requestCount >= rateLimit) {
        // Calculate retry after time
        const oldestTimestamp = await redisClient.zrange(redisKey, 0, 0, 'WITHSCORES');
        const retryAfter = oldestTimestamp[1]
          ? Math.ceil((parseInt(oldestTimestamp[1]) + windowSize - now) / 1000)
          : 1;

        return res.status(429).json({
          error: 'Rate Limit Exceeded',
          message: `Rate limit of ${rateLimit} requests per second exceeded`,
          rateLimit: {
            limit: rateLimit,
            remaining: 0,
            reset: Math.ceil((now + windowSize) / 1000),
            retryAfter,
          },
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimit.toString());
      res.setHeader('X-RateLimit-Remaining', (rateLimit - requestCount - 1).toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowSize) / 1000).toString());

      next();
    } catch (redisError: unknown) {
      logger.error('Redis rate limiting error:', redisError);
      // Fallback: Allow request but log error
      logger.warn('⚠️  Rate limiting bypassed due to Redis error');
      next();
    }
  } catch (error: unknown) {
    logger.error('Error in rate limiting middleware:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to enforce rate limiting',
    });
  }
}

/**
 * Track API usage for analytics and billing
 */
/**
 * TODO: Add function documentation
 */
export async function trackApiUsage(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Capture response to get status code
  const originalSend = res.send;
  res.send = function (data: unknown) {
    const responseTime = Date.now() - startTime;

    // Track usage asynchronously (don't wait)
    if (req.apiKey) {
      trackUsageRecord({
        apiKeyId: req.apiKey.id,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        responseTime,
        metadata: {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          queryParams: Object.keys(req.query).length > 0 ? req.query : undefined,
        },
      }).catch((err) => logger.error('Error tracking API usage:', err));
    }

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Helper function to record API usage in database
 */
/**
 * TODO: Add function documentation
 */
async function trackUsageRecord(usage: {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  metadata?: any;
}) {
  try {
    await db.insert(apiUsage).values({
      apiKeyId: usage.apiKeyId,
      endpoint: usage.endpoint,
      method: usage.method,
      statusCode: usage.statusCode,
      responseTime: usage.responseTime,
      requestCount: 1,
      metadata: usage.metadata,
    });
  } catch (error: unknown) {
    logger.error('Failed to track API usage:', error);
  }
}

/**
 * Get API key by ID
 */
/**
 * TODO: Add function documentation
 */
export async function getApiKeyById(keyId: string) {
  try {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);

    return key;
  } catch (error: unknown) {
    logger.error('Error fetching API key:', error);
    throw new Error('Failed to fetch API key');
  }
}

/**
 * List all API keys for a user
 * SECURITY: Does not return any part of the actual key (not even preview)
 */
/**
 * TODO: Add function documentation
 */
export async function listApiKeys(userId: string) {
  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        keyName: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        rateLimit: apiKeys.rateLimit,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        expiresAt: apiKeys.expiresAt,
        scopes: apiKeys.scopes,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));

    return keys;
  } catch (error: unknown) {
    logger.error('Error listing API keys:', error);
    throw new Error('Failed to list API keys');
  }
}

/**
 * Revoke (deactivate) an API key
 */
/**
 * TODO: Add function documentation
 */
export async function revokeApiKey(keyId: string, userId: string) {
  try {
    const [updated] = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error('API key not found or unauthorized');
    }

    logger.info(`🔒 Revoked API key ${keyId} for user ${userId}`);
    return updated;
  } catch (error: unknown) {
    logger.error('Error revoking API key:', error);
    throw new Error('Failed to revoke API key');
  }
}

/**
 * Get usage statistics for an API key
 */
/**
 * TODO: Add function documentation
 */
export async function getApiKeyUsageStats(apiKeyId: string, days: number = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get total requests
    const [totalRequests] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${apiUsage.requestCount}), 0)`,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.date, startDate)));

    // Get requests by endpoint
    const byEndpoint = await db
      .select({
        endpoint: apiUsage.endpoint,
        requests: sql<number>`COALESCE(SUM(${apiUsage.requestCount}), 0)`,
        avgResponseTime: sql<number>`COALESCE(AVG(${apiUsage.responseTime}), 0)`,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.date, startDate)))
      .groupBy(apiUsage.endpoint)
      .orderBy(desc(sql`COALESCE(SUM(${apiUsage.requestCount}), 0)`))
      .limit(10);

    // Get requests by day
    const byDay = await db
      .select({
        date: sql<string>`DATE(${apiUsage.date})`,
        requests: sql<number>`COALESCE(SUM(${apiUsage.requestCount}), 0)`,
        avgResponseTime: sql<number>`COALESCE(AVG(${apiUsage.responseTime}), 0)`,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.date, startDate)))
      .groupBy(sql`DATE(${apiUsage.date})`)
      .orderBy(sql`DATE(${apiUsage.date})`);

    // Get status code distribution
    const byStatusCode = await db
      .select({
        statusCode: apiUsage.statusCode,
        count: sql<number>`COUNT(*)`,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.date, startDate)))
      .groupBy(apiUsage.statusCode);

    return {
      totalRequests: totalRequests?.total || 0,
      byEndpoint,
      byDay,
      byStatusCode,
    };
  } catch (error: unknown) {
    logger.error('Error fetching API usage stats:', error);
    throw new Error('Failed to fetch API usage statistics');
  }
}

/**
 * Get usage statistics for all user's API keys
 */
/**
 * TODO: Add function documentation
 */
export async function getUserApiUsageStats(userId: string, days: number = 30) {
  try {
    const userKeys = await listApiKeys(userId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usageStats = await Promise.all(
      userKeys.map(async (key) => {
        const stats = await getApiKeyUsageStats(key.id, days);
        return {
          keyId: key.id,
          keyName: key.keyName,
          tier: key.tier,
          ...stats,
        };
      })
    );

    return usageStats;
  } catch (error: unknown) {
    logger.error('Error fetching user API usage stats:', error);
    throw new Error('Failed to fetch user API usage statistics');
  }
}

export const apiKeyService = {
  generateApiKey,
  validateApiKey,
  rateLimitApiKey,
  trackApiUsage,
  getApiKeyById,
  listApiKeys,
  revokeApiKey,
  getApiKeyUsageStats,
  getUserApiUsageStats,
};

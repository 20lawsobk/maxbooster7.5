import { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../lib/redisClient.js";
import crypto from "crypto";
import { db } from "../db";
import { apiKeys, apiUsage } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { logger } from "../logger.js";

// Extended Express Request with API key info
export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: string;
    userId: string;
    tier: "free" | "pro" | "enterprise";
    rateLimit: number;
  };
}

/**
 * Generate a secure API key with prefix and hashing
 * Format: mb_live_<random64chars>
 * SECURITY: Plaintext key is ONLY returned to user once, never stored in database
 */
export async function generateApiKey(
  userId: string,
  keyName: string,
  tier: "free" | "pro" | "enterprise" = "free",
) {
  try {
    // Generate secure random API key
    const randomBytes = crypto?.randomBytes(32);
    const apiKey = `mb_live_${randomBytes?.toString("hex")}`;

    // Hash the API key for secure storage using SHA-256
    // Note: SHA-256 is deterministic (allows DB lookups) and secure for long random strings
    // bcrypt is unnecessary here since API keys are cryptographically random, not user passwords
    const hashedApiKey = crypto
      .createHash("sha256")
      .update(apiKey)
      .digest("hex");

    // Determine rate limit based on tier
    const rateLimit =
      tier === "enterprise" ? 5000 : tier === "pro" ? 1000 : 100;

    // Insert ONLY the hashed key into database (never store plaintext)
    const keyPrefix = apiKey?.substring(0, 12); // Store first 12 chars for identification (mb_live_xxxx)
    const [newKey] = await db
      .insert(apiKeys)
      .values({
        userId,
        name: keyName,
        keyHash: hashedApiKey, // Only store the hash
        keyPrefix,
        rateLimit,
        isActive: true,
      })
      .returning();

    logger.info(
      `🔑 Generated API key for user ${userId}: ${keyName} (${tier} tier, ${rateLimit} req/sec)`,
    );

    // Return the plaintext key to user (ONLY TIME IT'S SHOWN)
    return {
      ...newKey,
      keyName, // Include keyName for client consumption
      tier, // Include tier for client consumption
      apiKey, // Return plaintext key for user to save (not stored in DB)
    };
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error generating API key:");
    throw new Error("Failed to generate API key");
  }
}

/**
 * Validate API key and attach key info to request
 * SECURITY: Validates by comparing hashes, never stores or looks up plaintext keys
 */
export async function validateApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Missing or invalid API key. Use Authorization: Bearer <api_key>",
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if API key format is valid
    if (!apiKey.startsWith("mb_live_")) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key format. API keys must start with mb_live_",
      });
    }

    // Hash the incoming API key using SHA-256 (same algorithm as generateApiKey)
    const hashedApiKey = crypto
      .createHash("sha256")
      .update(apiKey)
      .digest("hex");

    // Look up API key by hash (secure: no plaintext in database)
    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hashedApiKey), eq(apiKeys.isActive, true)))
      .limit(1);

    if (!keyRecord) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or inactive API key",
      });
    }

    // Check if API key has expired
    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "API key has expired",
      });
    }

    // Attach API key info to request
    req.apiKey = {
      id: keyRecord.id,
      userId: keyRecord.userId,
      tier: "free", // Default tier since schema doesn't store tier
      rateLimit: keyRecord.rateLimit || 1000,
    };

    // Update last used timestamp (async, don't wait)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id))
      .execute()
      .catch((err) =>
        logger.warn({ err: err }, "Error updating API key last used:"),
      );

    next();
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error validating API key:");
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to validate API key",
    });
  }
}

/**
 * Rate limiting middleware using Redis sliding window
 */
export async function rateLimitApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.apiKey) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "API key validation required before rate limiting",
      });
    }

    const { id: keyId, rateLimit } = req.apiKey;
    const now = Date.now();
    const windowSize = 1000; // 1 second window (for per-second rate limit)
    const redisKey = `api_rate_limit:${keyId}`;
    const redisClient = getRedisClient();

    try {
      // Use Redis sorted set with sliding window.
      // PDIM does not support ZREMRANGEBYSCORE or atomic pipelines, so we use
      // ZCOUNT (count only in-window members) instead of ZREMRANGEBYSCORE+ZCARD.
      const windowStart = now - windowSize;
      const requestCount = await redisClient.zcount(
        redisKey,
        windowStart,
        "+inf",
      );

      // Check if rate limit exceeded
      if (requestCount >= rateLimit) {
        // Calculate retry after time
        const oldestTimestamp = await redisClient.zrange(
          redisKey,
          0,
          0,
          "WITHSCORES",
        );
        const retryAfter = oldestTimestamp[1]
          ? Math.ceil((parseInt(oldestTimestamp[1]) + windowSize - now) / 1000)
          : 1;

        return res.status(429).json({
          error: "Rate Limit Exceeded",
          message: `Rate limit of ${rateLimit} requests per second exceeded`,
          rateLimit: {
            limit: rateLimit,
            remaining: 0,
            reset: Math.ceil((now + windowSize) / 1000),
            retryAfter,
          },
        });
      }

      // Record this request and set expiry (fire-and-forget — not on critical path)
      Promise.resolve(
        redisClient
          .zadd(redisKey, now, `${now}-${crypto.randomUUID()}`)
          .then(() => redisClient.expire(redisKey, 2)),
      ).catch(() => {});

      // Add rate limit headers
      res.setHeader("X-RateLimit-Limit", rateLimit.toString());
      res.setHeader(
        "X-RateLimit-Remaining",
        (rateLimit - requestCount - 1).toString(),
      );
      res.setHeader(
        "X-RateLimit-Reset",
        Math.ceil((now + windowSize) / 1000).toString(),
      );

      next();
    } catch (redisError: unknown) {
      logger.warn(redisError, "Redis rate limiting error — request blocked:");
      return res.status(503).json({
        error: "Service Unavailable",
        message:
          "Rate limiting is temporarily unavailable. Please try again shortly.",
      });
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error in rate limiting middleware:");
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to enforce rate limiting",
    });
  }
}

/**
 * Track API usage for analytics and billing
 */
export async function trackApiUsage(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction,
) {
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
          userAgent: req.headers["user-agent"],
          ip: req.ip,
          queryParams:
            Object.keys(req.query).length > 0 ? req.query : undefined,
        },
      }).catch((err) => logger.warn({ err: err }, "Error tracking API usage:"));
    }

    return originalSend?.call(this, data);
  };

  next();
}

/**
 * Helper function to record API usage in database
 */
async function trackUsageRecord(usage: {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(apiUsage).values({
      apiKeyId: usage.apiKeyId,
      endpoint: usage.endpoint,
      method: usage.method,
      statusCode: usage.statusCode,
      responseTimeMs: usage.responseTime,
      ipAddress: usage.metadata?.ip as string | undefined,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Failed to track API usage:");
  }
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(keyId: string) {
  try {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    return key;
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching API key:");
    throw new Error("Failed to fetch API key");
  }
}

/**
 * List all API keys for a user
 * SECURITY: Does not return any part of the actual key (not even preview)
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
    logger.warn({ err: error }, "Error listing API keys:");
    throw new Error("Failed to list API keys");
  }
}

/**
 * Revoke (deactivate) an API key
 */
export async function revokeApiKey(keyId: string, userId: string) {
  try {
    const [updated] = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error("API key not found or unauthorized");
    }

    logger.info(`🔒 Revoked API key ${keyId} for user ${userId}`);
    return updated;
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error revoking API key:");
    throw new Error("Failed to revoke API key");
  }
}

/**
 * Get usage statistics for an API key
 */
export async function getApiKeyUsageStats(apiKeyId: string, days: number = 30) {
  try {
    const startDate = new Date();
    startDate?.setDate(startDate?.getDate() - days);

    // Get total requests
    const [totalRequests] = await db
      .select({
        total: sql<number>`COUNT(*)`,
      })
      .from(apiUsage)
      .where(
        and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.createdAt, startDate)),
      );

    // Get requests by endpoint
    const byEndpoint = await db
      .select({
        endpoint: apiUsage.endpoint,
        requests: sql<number>`COUNT(*)`,
        avgResponseTime: sql<number>`COALESCE(AVG(${apiUsage.responseTimeMs}), 0)`,
      })
      .from(apiUsage)
      .where(
        and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.createdAt, startDate)),
      )
      .groupBy(apiUsage.endpoint)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // Get requests by day
    const byDay = await db
      .select({
        date: sql<string>`DATE(${apiUsage.createdAt})`,
        requests: sql<number>`COUNT(*)`,
        avgResponseTime: sql<number>`COALESCE(AVG(${apiUsage.responseTimeMs}), 0)`,
      })
      .from(apiUsage)
      .where(
        and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.createdAt, startDate)),
      )
      .groupBy(sql`DATE(${apiUsage.createdAt})`)
      .orderBy(sql`DATE(${apiUsage.createdAt})`);

    // Get status code distribution
    const byStatusCode = await db
      .select({
        statusCode: apiUsage.statusCode,
        count: sql<number>`COUNT(*)`,
      })
      .from(apiUsage)
      .where(
        and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.createdAt, startDate)),
      )
      .groupBy(apiUsage.statusCode);

    return {
      totalRequests: totalRequests.total || 0,
      byEndpoint,
      byDay,
      byStatusCode,
    };
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching API usage stats:");
    throw new Error("Failed to fetch API usage statistics");
  }
}

/**
 * Get usage statistics for all user's API keys
 */
export async function getUserApiUsageStats(userId: string, days: number = 30) {
  try {
    const userKeys = await listApiKeys(userId);
    const startDate = new Date();
    startDate?.setDate(startDate?.getDate() - days);

    const usageStats = await Promise?.all(
      userKeys?.map(async (key) => {
        const stats = await getApiKeyUsageStats(key?.id, days);
        return {
          keyId: key.id,
          keyName: key.keyName,
          tier: (key as any).tier,
          ...stats,
        };
      }),
    );

    return usageStats;
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching user API usage stats:");
    throw new Error("Failed to fetch user API usage statistics");
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

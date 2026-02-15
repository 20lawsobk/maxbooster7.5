import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';

/**
 * Session Tracking Service
 * 
 * Optimizes session revocation from O(N) to O(1) by maintaining
 * userId → sessionId mappings in Redis.
 * 
 * Performance Comparison:
 * - OLD: Scan all session keys (O(N)) and check if userId matches - slow at scale
 * - NEW: Direct lookup via userId index (O(1)) - constant time regardless of session count
 * 
 * Architecture:
 * - Redis Set per user: `user:sessions:{userId}` → Set of sessionIds
 * - Automatically cleaned up on session expiry
 * - Enables instant session revocation for GDPR compliance
 */

export class SessionTrackingService {
  private static readonly USER_SESSIONS_PREFIX = 'user:sessions:';
  private static readonly SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

  /**
   * Track a new session for a user
   * Called when session is created
   * 
   * @param userId - User ID
   * @param sessionId - Session ID
   */
  public static async trackSession(userId: string, sessionId: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.warn('⚠️ Redis unavailable - session tracking skipped');
        return;
      }

      const key = `${this.USER_SESSIONS_PREFIX}${userId}`;
      
      // Add sessionId to user's session set (node-redis v4 uses camelCase)
      await redis.sAdd(key, sessionId);
      
      // Set TTL to auto-cleanup (same as session TTL)
      await redis.expire(key, this.SESSION_TTL);
      
      logger.debug(`📝 Session tracked: user=${userId}, session=${sessionId}`);
    } catch (error: unknown) {
      logger.error('Error tracking session:', error);
      // Don't throw - session tracking is non-critical
    }
  }

  /**
   * Untrack a session when it expires or is destroyed
   * Called when session is destroyed
   * 
   * @param userId - User ID
   * @param sessionId - Session ID
   */
  public static async untrackSession(userId: string, sessionId: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      const key = `${this.USER_SESSIONS_PREFIX}${userId}`;
      await redis.sRem(key, sessionId);
      
      logger.debug(`🗑️ Session untracked: user=${userId}, session=${sessionId}`);
    } catch (error: unknown) {
      logger.error('Error untracking session:', error);
    }
  }

  /**
   * Get all session IDs for a user (O(1) lookup)
   * 
   * @param userId - User ID
   * @returns Array of session IDs
   */
  public static async getUserSessions(userId: string): Promise<string[]> {
    try {
      const redis = await getRedisClient();
      if (!redis) return [];

      const key = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionIds = await redis.sMembers(key);
      
      return sessionIds;
    } catch (error: unknown) {
      logger.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Revoke all sessions for a user (O(1) lookup + O(N) deletion where N = user's sessions)
   * Much faster than O(N) scan of ALL sessions
   * 
   * @param userId - User ID
   * @returns Number of sessions revoked
   */
  public static async revokeAllUserSessions(userId: string): Promise<number> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.warn('⚠️ Redis unavailable - falling back to slow session revocation');
        return await this.fallbackRevokeAllSessions(userId);
      }

      // O(1) lookup of user's sessions
      const sessionIds = await this.getUserSessions(userId);
      
      if (sessionIds.length === 0) {
        logger.info(`No sessions found for user ${userId}`);
        return 0;
      }

      logger.info(`🔐 Revoking ${sessionIds.length} sessions for user ${userId}`);

      // Delete all sessions in parallel
      const sessionKeys = sessionIds.map(id => `sess:${id}`);
      const deletePromises = sessionKeys.map(key => redis.del(key));
      await Promise.all(deletePromises);

      // Clean up the tracking index
      const trackingKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      await redis.del(trackingKey);

      logger.info(`✅ Revoked ${sessionIds.length} sessions for user ${userId} (O(1) lookup)`);
      return sessionIds.length;
    } catch (error: unknown) {
      logger.error('Error revoking user sessions:', error);
      // Fallback to slow method if tracking fails
      return await this.fallbackRevokeAllSessions(userId);
    }
  }

  /**
   * Fallback: Revoke sessions using O(N) scan
   * Used when Redis tracking is unavailable
   * 
   * @param userId - User ID
   * @returns Number of sessions revoked
   */
  private static async fallbackRevokeAllSessions(userId: string): Promise<number> {
    try {
      const redis = await getRedisClient();
      if (!redis) return 0;

      logger.warn(`⚠️ Using O(N) fallback session revocation for user ${userId}`);

      const sessionKeys = await redis.keys('sess:*');
      const deletionPromises = [];
      
      for (const key of sessionKeys) {
        const sessionData = await redis.get(key);
        // Check if session belongs to this user
        if (sessionData && (sessionData.includes(userId) || sessionData.includes(`"id":"${userId}"`))) {
          deletionPromises.push(redis.del(key));
        }
      }
      
      await Promise.all(deletionPromises);
      logger.info(`✅ Revoked ${deletionPromises.length} sessions for user ${userId} (O(N) fallback)`);
      
      return deletionPromises.length;
    } catch (error: unknown) {
      logger.error('Error in fallback session revocation:', error);
      return 0;
    }
  }

  /**
   * Clean up stale session tracking entries
   * Run periodically to remove orphaned tracking data
   */
  public static async cleanupStaleTracking(): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      logger.info('🧹 Starting session tracking cleanup...');

      const trackingKeys = await redis.keys(`${this.USER_SESSIONS_PREFIX}*`);
      let cleaned = 0;

      for (const key of trackingKeys) {
        const sessionIds = await redis.sMembers(key);
        
        // Check if any sessions still exist
        const validSessions = [];
        for (const sessionId of sessionIds) {
          const exists = await redis.exists(`sess:${sessionId}`);
          if (exists) {
            validSessions.push(sessionId);
          }
        }

        // If no valid sessions, delete the tracking key
        if (validSessions.length === 0) {
          await redis.del(key);
          cleaned++;
        } else if (validSessions.length < sessionIds.length) {
          // Update with only valid sessions
          await redis.del(key);
          if (validSessions.length > 0) {
            await redis.sAdd(key, ...validSessions);
            await redis.expire(key, this.SESSION_TTL);
          }
        }
      }

      logger.info(`✅ Session tracking cleanup complete - cleaned ${cleaned} stale entries`);
    } catch (error: unknown) {
      logger.error('Error cleaning up session tracking:', error);
    }
  }

  /**
   * Get session statistics
   * Useful for monitoring and debugging
   */
  public static async getStats(): Promise<{
    totalUsers: number;
    totalSessions: number;
    avgSessionsPerUser: number;
  }> {
    try {
      const redis = await getRedisClient();
      if (!redis) return { totalUsers: 0, totalSessions: 0, avgSessionsPerUser: 0 };

      const trackingKeys = await redis.keys(`${this.USER_SESSIONS_PREFIX}*`);
      let totalSessions = 0;

      for (const key of trackingKeys) {
        const count = await redis.sCard(key);
        totalSessions += count;
      }

      return {
        totalUsers: trackingKeys.length,
        totalSessions,
        avgSessionsPerUser: trackingKeys.length > 0 ? totalSessions / trackingKeys.length : 0
      };
    } catch (error: unknown) {
      logger.error('Error getting session stats:', error);
      return { totalUsers: 0, totalSessions: 0, avgSessionsPerUser: 0 };
    }
  }
}

export const sessionTracking = SessionTrackingService;

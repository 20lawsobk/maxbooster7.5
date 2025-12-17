import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';
import crypto from 'crypto';

export interface CursorPosition {
  trackIndex: number;
  timePosition: number;
  x?: number;
  y?: number;
}

export interface SelectionState {
  trackId?: string;
  startTime: number;
  endTime: number;
  clipIds?: string[];
}

export type PresenceStatus = 'online' | 'away' | 'editing';

export interface PresenceState {
  odisableCI?: boolean;
  userId: string;
  displayName: string;
  color: string;
  cursor: CursorPosition | null;
  selection: SelectionState | null;
  status: PresenceStatus;
  lastActivity: number;
  connectedAt: number;
  connectionId: string;
}

export interface CollaboratorInfo {
  userId: string;
  displayName: string;
  color: string;
  status: PresenceStatus;
  cursor: CursorPosition | null;
  selection: SelectionState | null;
}

const PRESENCE_PREFIX = 'presence:project:';
const HEARTBEAT_INTERVAL_MS = 15000;
const STALE_TIMEOUT_MS = 45000;
const AWAY_TIMEOUT_MS = 30000;

const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF4500',
];

function generateUserColor(userId: string): string {
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  const index = parseInt(hash.slice(0, 8), 16) % USER_COLORS.length;
  return USER_COLORS[index];
}

function generateConnectionId(): string {
  return crypto.randomUUID();
}

export class PresenceManager {
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private cleanupIntervals: Map<string, NodeJS.Timeout> = new Map();
  private localPresence: Map<string, Map<string, PresenceState>> = new Map();

  private getRedisKey(projectId: string): string {
    return `${PRESENCE_PREFIX}${projectId}`;
  }

  async addCollaborator(
    projectId: string,
    userId: string,
    displayName: string,
    existingColor?: string
  ): Promise<PresenceState> {
    const connectionId = generateConnectionId();
    const now = Date.now();

    const presence: PresenceState = {
      userId,
      displayName,
      color: existingColor || generateUserColor(userId),
      cursor: null,
      selection: null,
      status: 'online',
      lastActivity: now,
      connectedAt: now,
      connectionId,
    };

    await this.savePresence(projectId, presence);
    this.startHeartbeat(projectId, userId, connectionId);

    if (!this.cleanupIntervals.has(projectId)) {
      this.startStaleCleanup(projectId);
    }

    logger.info(`[Presence] User ${displayName} (${userId}) joined project ${projectId}`);
    return presence;
  }

  async removeCollaborator(projectId: string, userId: string, connectionId?: string): Promise<void> {
    const key = `${userId}:${connectionId || '*'}`;
    this.stopHeartbeat(key);

    try {
      const redis = await getRedisClient();
      if (redis) {
        const redisKey = this.getRedisKey(projectId);
        const allPresence = await redis.hGetAll(redisKey);

        for (const [fieldKey, _value] of Object.entries(allPresence)) {
          if (fieldKey.startsWith(userId)) {
            if (!connectionId || fieldKey === `${userId}:${connectionId}`) {
              await redis.hDel(redisKey, fieldKey);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[Presence] Failed to remove collaborator from Redis:`, error);
    }

    const projectPresence = this.localPresence.get(projectId);
    if (projectPresence) {
      for (const [key, presence] of projectPresence.entries()) {
        if (presence.userId === userId) {
          if (!connectionId || presence.connectionId === connectionId) {
            projectPresence.delete(key);
          }
        }
      }
      if (projectPresence.size === 0) {
        this.localPresence.delete(projectId);
        this.stopStaleCleanup(projectId);
      }
    }

    logger.info(`[Presence] User ${userId} left project ${projectId}`);
  }

  async updateCursor(
    projectId: string,
    userId: string,
    connectionId: string,
    cursor: CursorPosition
  ): Promise<void> {
    const presence = await this.getPresence(projectId, userId, connectionId);
    if (presence) {
      presence.cursor = cursor;
      presence.lastActivity = Date.now();
      presence.status = 'editing';
      await this.savePresence(projectId, presence);
    }
  }

  async updateSelection(
    projectId: string,
    userId: string,
    connectionId: string,
    selection: SelectionState | null
  ): Promise<void> {
    const presence = await this.getPresence(projectId, userId, connectionId);
    if (presence) {
      presence.selection = selection;
      presence.lastActivity = Date.now();
      presence.status = 'editing';
      await this.savePresence(projectId, presence);
    }
  }

  async updateStatus(
    projectId: string,
    userId: string,
    connectionId: string,
    status: PresenceStatus
  ): Promise<void> {
    const presence = await this.getPresence(projectId, userId, connectionId);
    if (presence) {
      presence.status = status;
      presence.lastActivity = Date.now();
      await this.savePresence(projectId, presence);
    }
  }

  async heartbeat(projectId: string, userId: string, connectionId: string): Promise<void> {
    const presence = await this.getPresence(projectId, userId, connectionId);
    if (presence) {
      const now = Date.now();
      const timeSinceActivity = now - presence.lastActivity;

      if (presence.status === 'editing' && timeSinceActivity > AWAY_TIMEOUT_MS) {
        presence.status = 'online';
      }
      presence.lastActivity = now;
      await this.savePresence(projectId, presence);
    }
  }

  async getCollaborators(projectId: string): Promise<CollaboratorInfo[]> {
    const collaborators: CollaboratorInfo[] = [];
    const seen = new Set<string>();

    try {
      const redis = await getRedisClient();
      if (redis) {
        const redisKey = this.getRedisKey(projectId);
        const allPresence = await redis.hGetAll(redisKey);

        for (const value of Object.values(allPresence)) {
          try {
            const presence: PresenceState = JSON.parse(value);
            if (!seen.has(presence.userId)) {
              seen.add(presence.userId);
              collaborators.push({
                userId: presence.userId,
                displayName: presence.displayName,
                color: presence.color,
                status: presence.status,
                cursor: presence.cursor,
                selection: presence.selection,
              });
            }
          } catch (e) {
            logger.error('[Presence] Failed to parse presence data:', e);
          }
        }
      }
    } catch (error) {
      logger.error('[Presence] Failed to get collaborators from Redis:', error);
    }

    if (collaborators.length === 0) {
      const projectPresence = this.localPresence.get(projectId);
      if (projectPresence) {
        for (const presence of projectPresence.values()) {
          if (!seen.has(presence.userId)) {
            seen.add(presence.userId);
            collaborators.push({
              userId: presence.userId,
              displayName: presence.displayName,
              color: presence.color,
              status: presence.status,
              cursor: presence.cursor,
              selection: presence.selection,
            });
          }
        }
      }
    }

    return collaborators;
  }

  async getCollaboratorCount(projectId: string): Promise<number> {
    const collaborators = await this.getCollaborators(projectId);
    return collaborators.length;
  }

  private async savePresence(projectId: string, presence: PresenceState): Promise<void> {
    const fieldKey = `${presence.userId}:${presence.connectionId}`;

    let projectPresence = this.localPresence.get(projectId);
    if (!projectPresence) {
      projectPresence = new Map();
      this.localPresence.set(projectId, projectPresence);
    }
    projectPresence.set(fieldKey, presence);

    try {
      const redis = await getRedisClient();
      if (redis) {
        const redisKey = this.getRedisKey(projectId);
        await redis.hSet(redisKey, fieldKey, JSON.stringify(presence));
        await redis.expire(redisKey, 3600);
      }
    } catch (error) {
      logger.error('[Presence] Failed to save presence to Redis:', error);
    }
  }

  private async getPresence(
    projectId: string,
    userId: string,
    connectionId: string
  ): Promise<PresenceState | null> {
    const fieldKey = `${userId}:${connectionId}`;

    const projectPresence = this.localPresence.get(projectId);
    if (projectPresence?.has(fieldKey)) {
      return projectPresence.get(fieldKey)!;
    }

    try {
      const redis = await getRedisClient();
      if (redis) {
        const redisKey = this.getRedisKey(projectId);
        const data = await redis.hGet(redisKey, fieldKey);
        if (data) {
          return JSON.parse(data);
        }
      }
    } catch (error) {
      logger.error('[Presence] Failed to get presence from Redis:', error);
    }

    return null;
  }

  private startHeartbeat(projectId: string, userId: string, connectionId: string): void {
    const key = `${userId}:${connectionId}`;
    const interval = setInterval(() => {
      this.heartbeat(projectId, userId, connectionId).catch((err) => {
        logger.error('[Presence] Heartbeat failed:', err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    this.heartbeatIntervals.set(key, interval);
  }

  private stopHeartbeat(key: string): void {
    const interval = this.heartbeatIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(key);
    }
  }

  private startStaleCleanup(projectId: string): void {
    const interval = setInterval(async () => {
      await this.cleanupStalePresence(projectId);
    }, STALE_TIMEOUT_MS);

    this.cleanupIntervals.set(projectId, interval);
  }

  private stopStaleCleanup(projectId: string): void {
    const interval = this.cleanupIntervals.get(projectId);
    if (interval) {
      clearInterval(interval);
      this.cleanupIntervals.delete(projectId);
    }
  }

  private async cleanupStalePresence(projectId: string): Promise<string[]> {
    const now = Date.now();
    const staleUsers: string[] = [];

    try {
      const redis = await getRedisClient();
      if (redis) {
        const redisKey = this.getRedisKey(projectId);
        const allPresence = await redis.hGetAll(redisKey);

        for (const [fieldKey, value] of Object.entries(allPresence)) {
          try {
            const presence: PresenceState = JSON.parse(value);
            if (now - presence.lastActivity > STALE_TIMEOUT_MS) {
              await redis.hDel(redisKey, fieldKey);
              staleUsers.push(presence.userId);
              logger.info(`[Presence] Cleaned up stale presence for user ${presence.userId}`);
            }
          } catch (e) {
            await redis.hDel(redisKey, fieldKey);
          }
        }
      }
    } catch (error) {
      logger.error('[Presence] Failed to cleanup stale presence:', error);
    }

    const projectPresence = this.localPresence.get(projectId);
    if (projectPresence) {
      for (const [key, presence] of projectPresence.entries()) {
        if (now - presence.lastActivity > STALE_TIMEOUT_MS) {
          projectPresence.delete(key);
          if (!staleUsers.includes(presence.userId)) {
            staleUsers.push(presence.userId);
          }
        }
      }
    }

    return staleUsers;
  }

  async shutdown(): Promise<void> {
    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();

    for (const interval of this.cleanupIntervals.values()) {
      clearInterval(interval);
    }
    this.cleanupIntervals.clear();

    this.localPresence.clear();

    logger.info('[Presence] PresenceManager shutdown complete');
  }
}

export const presenceManager = new PresenceManager();

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { z } from 'zod';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { projects, studioProjects, studioTracks, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

const batchSyncActionSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const batchSyncRequestSchema = z.object({
  actions: z.array(batchSyncActionSchema).min(1).max(50),
});

interface SyncResult {
  actionId: string;
  success: boolean;
  error?: string;
  serverResponse?: unknown;
}

interface ConflictInfo {
  actionId: string;
  localData: unknown;
  serverData: unknown;
}

// Whitelist of project fields that the client is allowed to update via sync.
const ALLOWED_PROJECT_FIELDS = new Set([
  'title', 'description', 'genre', 'bpm', 'key', 'status',
  'workflowStage', 'metadata', 'favorite', 'coverImageUrl',
  'tags', 'timeSignature', 'sampleRate', 'bitDepth',
]);

// Whitelist of studio-project fields allowed via sync.
const ALLOWED_STUDIO_PROJECT_FIELDS = new Set([
  'name', 'title', 'description', 'genre', 'bpm', 'key',
  'timeSignature', 'sampleRate', 'bitDepth', 'metadata',
  'mixBusConfig', 'masterSettings', 'automationData', 'markerData', 'status',
]);

// Whitelist of track fields allowed via sync.
const ALLOWED_TRACK_FIELDS = new Set([
  'name', 'trackType', 'color', 'volume', 'pan',
  'isMuted', 'isSolo', 'isArmed', 'inputSource', 'outputBus', 'order', 'metadata',
]);

function pickAllowed(changes: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      result[key] = changes[key];
    }
  }
  return result;
}

const ACTION_HANDLERS: Record<string, (payload: unknown, userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>> = {

  // ── Projects ─────────────────────────────────────────────────────────────

  'project.update': async (payload, userId) => {
    try {
      const data = payload as { projectId: string; changes: Record<string, unknown>; isStudio?: boolean };
      const changes = data.changes ?? {};

      if (data.isStudio) {
        const allowed = pickAllowed(changes, ALLOWED_STUDIO_PROJECT_FIELDS);
        if (Object.keys(allowed).length === 0) return { success: true, data: { updated: false, reason: 'no allowed fields' } };

        const [updated] = await db
          .update(studioProjects)
          .set({ ...allowed, updatedAt: new Date() })
          .where(and(eq(studioProjects.id, data.projectId), eq(studioProjects.userId, userId)))
          .returning({ id: studioProjects.id });

        return { success: true, data: { updated: !!updated, projectId: data.projectId } };
      }

      const allowed = pickAllowed(changes, ALLOWED_PROJECT_FIELDS);
      if (Object.keys(allowed).length === 0) return { success: true, data: { updated: false, reason: 'no allowed fields' } };

      const [updated] = await db
        .update(projects)
        .set({ ...allowed, updatedAt: new Date() })
        .where(and(eq(projects.id, data.projectId), eq(projects.userId, userId)))
        .returning({ id: projects.id });

      return { success: true, data: { updated: !!updated, projectId: data.projectId } };
    } catch (error) {
      logger.warn({ err: error }, '[sync] project.update failed');
      return { success: false, error: String(error) };
    }
  },

  'project.create': async (payload, userId) => {
    try {
      const data = payload as { name?: string; title?: string; settings?: Record<string, unknown>; isStudio?: boolean };
      const title = data.title ?? data.name ?? 'Untitled';

      if (data.isStudio) {
        const [created] = await db
          .insert(studioProjects)
          .values({ name: title, userId, status: 'active' })
          .returning({ id: studioProjects.id });
        return { success: true, data: { projectId: created.id } };
      }

      const [created] = await db
        .insert(projects)
        .values({ title, userId, status: 'draft' })
        .returning({ id: projects.id });

      return { success: true, data: { projectId: created.id } };
    } catch (error) {
      logger.warn({ err: error }, '[sync] project.create failed');
      return { success: false, error: String(error) };
    }
  },

  // ── Tracks ────────────────────────────────────────────────────────────────

  'track.add': async (payload, userId) => {
    try {
      const data = payload as { projectId: string; trackData: Record<string, unknown> };
      const allowed = pickAllowed(data.trackData ?? {}, ALLOWED_TRACK_FIELDS);
      const name = (allowed.name as string | undefined) ?? 'New Track';

      const [created] = await db
        .insert(studioTracks)
        .values({ projectId: data.projectId, name, ...allowed })
        .returning({ id: studioTracks.id });

      return { success: true, data: { trackId: created.id } };
    } catch (error) {
      logger.warn({ err: error }, '[sync] track.add failed');
      return { success: false, error: String(error) };
    }
  },

  'track.update': async (payload, userId) => {
    try {
      const data = payload as { trackId: string; changes: Record<string, unknown> };
      const allowed = pickAllowed(data.changes ?? {}, ALLOWED_TRACK_FIELDS);
      if (Object.keys(allowed).length === 0) return { success: true, data: { updated: false, reason: 'no allowed fields' } };

      const [updated] = await db
        .update(studioTracks)
        .set(allowed)
        .where(eq(studioTracks.id, data.trackId))
        .returning({ id: studioTracks.id });

      return { success: true, data: { updated: !!updated, trackId: data.trackId } };
    } catch (error) {
      logger.warn({ err: error }, '[sync] track.update failed');
      return { success: false, error: String(error) };
    }
  },

  'track.delete': async (payload, userId) => {
    try {
      const data = payload as { trackId: string };

      await db
        .delete(studioTracks)
        .where(eq(studioTracks.id, data.trackId));

      return { success: true, data: { deleted: true, trackId: data.trackId } };
    } catch (error) {
      logger.warn({ err: error }, '[sync] track.delete failed');
      return { success: false, error: String(error) };
    }
  },

  // ── Settings ─────────────────────────────────────────────────────────────

  'settings.update': async (payload, userId) => {
    try {
      const data = payload as { settings: Record<string, unknown> };
      const settings = data.settings ?? {};

      // Merge into the user's JSONB preferences column.
      // Raw SQL merge so we don't blow away keys we don't know about.
      const [existing] = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const merged = { ...(existing?.preferences as Record<string, unknown> ?? {}), ...settings };

      await db
        .update(users)
        .set({ preferences: merged })
        .where(eq(users.id, userId));

      return { success: true, data: { updated: true } };
    } catch (error) {
      logger.warn({ err: error }, '[sync] settings.update failed');
      return { success: false, error: String(error) };
    }
  },

  // ── Drafts ────────────────────────────────────────────────────────────────
  // Drafts live in the client-side IndexedDB; the server only needs to ACK.
  'draft.save': async (payload, userId) => {
    return { success: true, data: { saved: true } };
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  // Audio files are uploaded separately via multipart. This action ACKs
  // pending metadata so the queue item can be cleared.
  'audio.upload': async (payload, userId) => {
    return { success: true, data: { acknowledged: true } };
  },

  // ── Fallback ─────────────────────────────────────────────────────────────
  'default': async (payload, userId) => {
    logger.warn('[sync] Unhandled action type', { userId });
    return { success: true, data: { processed: true } };
  },
};

router.post('/batch', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { actions } = batchSyncRequestSchema.parse(req.body);

    logger.info('Processing batch sync request', { userId, actionCount: actions.length });

    const results: SyncResult[] = [];
    const conflicts: ConflictInfo[] = [];

    for (const action of actions) {
      try {
        const handler = ACTION_HANDLERS[action.type] ?? ACTION_HANDLERS['default'];
        const result = await handler(action.payload, userId);

        results.push({
          actionId: action.id,
          success: result.success,
          ...(result.success ? { serverResponse: result.data } : { error: result.error ?? 'Unknown error' }),
        });
      } catch (error: unknown) {
        logger.warn('Sync action failed', { actionId: action.id, error });
        results.push({
          actionId: action.id,
          success: false,
          error: error instanceof Error ? error.message : 'Processing failed',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info('Batch sync completed', {
      userId,
      total: actions.length,
      success: successCount,
      failed: failCount,
      conflicts: conflicts.length,
    });

    res.json({
      results,
      conflicts,
      summary: {
        total: actions.length,
        success: successCount,
        failed: failCount,
        conflicts: conflicts.length,
      },
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Batch sync request failed:');

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({ error: 'Failed to process batch sync' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    res.json({
      success: true,
      serverTime: Date.now(),
      userId,
      syncEnabled: true,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Sync status check failed:');
    res.status(500).json({ error: 'Failed to check sync status' });
  }
});

router.post('/resolve-conflict', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { actionId, resolution, mergedData } = req.body;

    if (!actionId || !['local', 'server', 'merged'].includes(resolution)) {
      return res.status(400).json({ error: 'Invalid conflict resolution request' });
    }

    logger.info('Resolving sync conflict', { userId, actionId, resolution });

    res.json({
      success: true,
      actionId,
      resolution,
      resolved: true,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Conflict resolution failed:');
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

export default router;

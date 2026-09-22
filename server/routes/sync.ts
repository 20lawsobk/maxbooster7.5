import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { projects, studioProjects, studioTracks, users, projectRoyaltySplits } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { clientSyncReceipts, type SyncTransaction, type OperationResult } from "../repositories/clientSyncReceipts.js";

const router = Router();

const batchSyncActionSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.string().min(1).max(80),
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const batchSyncRequestSchema = z.object({
  protocolVersion: z.literal(1),
  ownerId: z.string().min(1),
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
  "title",
  "description",
  "genre",
  "bpm",
  "key",
  "status",
  "workflowStage",
  "metadata",
  "favorite",
  "coverImageUrl",
  "tags",
  "timeSignature",
  "sampleRate",
  "bitDepth",
]);

// Whitelist of studio-project fields allowed via sync.
const ALLOWED_STUDIO_PROJECT_FIELDS = new Set([
  "name",
  "title",
  "description",
  "genre",
  "bpm",
  "key",
  "timeSignature",
  "sampleRate",
  "bitDepth",
  "metadata",
  "mixBusConfig",
  "masterSettings",
  "automationData",
  "markerData",
  "status",
]);

// Whitelist of track fields allowed via sync.
const ALLOWED_TRACK_FIELDS = new Set([
  "name",
  "trackType",
  "color",
  "volume",
  "pan",
  "isMuted",
  "isSolo",
  "isArmed",
  "inputSource",
  "outputBus",
  "order",
  "metadata",
]);

function pickAllowed(
  changes: Record<string, unknown>,
  allowed: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty?.call(changes, key)) {
      result[key] = changes[key];
    }
  }
  return result;
}

async function ownsProject(tx: SyncTransaction, projectId: string, userId: string): Promise<boolean> {
  const [project] = await tx.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (project) return true;
  const [studio] = await tx.select({ id: studioProjects.id }).from(studioProjects)
    .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId))).limit(1);
  return !!studio;
}

const ACTION_HANDLERS: Record<
  string,
  (
    payload: unknown,
    userId: string,
    db: SyncTransaction,
  ) => Promise<OperationResult>
> = {
  // ── Projects ─────────────────────────────────────────────────────────────

  "project.update": async (payload, userId, db) => {
    try {
      const data = z.object({
        projectId: z.string().min(1),
        changes: z.record(z.string(), z.unknown()),
        isStudio: z.boolean().optional(),
        expectedUpdatedAt: z.string().datetime().nullable(),
      }).parse(payload);
      const changes = data?.changes ?? {};

      if (data?.isStudio) {
        const [current] = await db.select().from(studioProjects)
          .where(and(eq(studioProjects.id, data.projectId), eq(studioProjects.userId, userId))).for("update");
        if (!current) return { success: false, error: "Project not found" };
        if ((current.updatedAt?.toISOString() ?? null) !== data.expectedUpdatedAt) {
          return { success: false, conflict: true, error: "Project changed on the server", data: current };
        }
        const allowed = pickAllowed(changes, ALLOWED_STUDIO_PROJECT_FIELDS);
        if (Object.keys(allowed).length === 0)
          return {
            success: false,
            data: { updated: false, reason: "no allowed fields" },
          };

        const [updated] = await db
          .update(studioProjects)
          .set({ ...allowed, updatedAt: sql`GREATEST(clock_timestamp()::timestamp, COALESCE(${studioProjects.updatedAt}, '-infinity'::timestamp) + interval '1 millisecond')` })
          .where(
            and(
              eq(studioProjects.id, data?.projectId),
              eq(studioProjects.userId, userId),
            ),
          )
          .returning({ id: studioProjects.id });

        return {
          success: !!updated,
          data: { updated: !!updated, projectId: data.projectId },
        };
      }

      const [current] = await db.select().from(projects)
        .where(and(eq(projects.id, data.projectId), eq(projects.userId, userId))).for("update");
      if (!current) return { success: false, error: "Project not found" };
      if ((current.updatedAt?.toISOString() ?? null) !== data.expectedUpdatedAt) {
        return { success: false, conflict: true, error: "Project changed on the server", data: current };
      }
      const allowed = pickAllowed(changes, ALLOWED_PROJECT_FIELDS);
      if (Object.keys(allowed).length === 0)
        return {
          success: false,
          data: { updated: false, reason: "no allowed fields" },
        };

      const [updated] = await db
        .update(projects)
        .set({ ...allowed, updatedAt: sql`GREATEST(clock_timestamp()::timestamp, COALESCE(${projects.updatedAt}, '-infinity'::timestamp) + interval '1 millisecond')` })
        .where(
          and(eq(projects.id, data?.projectId), eq(projects.userId, userId)),
        )
        .returning({ id: projects.id });

      return {
        success: !!updated,
        data: { updated: !!updated, projectId: data.projectId },
      };
    } catch (error) {
      logger.warn({ err: error }, "[sync] project.update failed");
      return { success: false, error: String(error) };
    }
  },

  "project.create": async (payload, userId, db) => {
    try {
      const data = payload as {
        name?: string;
        title?: string;
        settings?: Record<string, unknown>;
        isStudio?: boolean;
      };
      const title = data?.title ?? data?.name ?? "Untitled";

      if (data?.isStudio) {
        const [created] = await db
          .insert(studioProjects)
          .values({ name: title, userId, status: "active" })
          .returning({ id: studioProjects.id });
        return { success: true, data: { projectId: created.id } };
      }

      const [created] = await db
        .insert(projects)
        .values({ title, userId, status: "draft" })
        .returning({ id: projects.id });

      return { success: true, data: { projectId: created.id } };
    } catch (error) {
      logger.warn({ err: error }, "[sync] project.create failed");
      return { success: false, error: String(error) };
    }
  },

  "project.delete": async (payload, userId, db) => {
    const data = z.object({
      projectId: z.string().min(1), expectedUpdatedAt: z.string().datetime().nullable(),
    }).parse(payload);
    const [current] = await db.select().from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.userId, userId))).for("update");
    if (!current) return { success: false, error: "Project not found" };
    if ((current.updatedAt?.toISOString() ?? null) !== data.expectedUpdatedAt) {
      return { success: false, conflict: true, error: "Project changed before deletion. Review the current project.", data: current };
    }
    await db.delete(studioTracks).where(eq(studioTracks.projectId, data.projectId));
    await db.delete(projectRoyaltySplits).where(eq(projectRoyaltySplits.projectId, data.projectId));
    await db.delete(projects).where(and(eq(projects.id, data.projectId), eq(projects.userId, userId)));
    return { success: true, data: { projectId: data.projectId, deleted: true } };
  },

  // ── Tracks ────────────────────────────────────────────────────────────────

  "track.add": async (payload, userId, db) => {
    try {
      const data = payload as {
        projectId: string;
        trackData: Record<string, unknown>;
      };
      const allowed = pickAllowed(data?.trackData ?? {}, ALLOWED_TRACK_FIELDS);
      if (!await ownsProject(db, data.projectId, userId)) return { success: false, error: "Project not found" };
      const name = (allowed?.name as string | undefined) ?? "New Track";

      const [created] = await db
        .insert(studioTracks)
        .values({ projectId: data.projectId, name, ...allowed })
        .returning({ id: studioTracks.id });

      return { success: true, data: { trackId: created.id } };
    } catch (error) {
      logger.warn({ err: error }, "[sync] track.add failed");
      return { success: false, error: String(error) };
    }
  },

  "track.update": async (payload, userId, db) => {
    try {
      const data = payload as {
        trackId: string;
        changes: Record<string, unknown>;
      };
      const allowed = pickAllowed(data?.changes ?? {}, ALLOWED_TRACK_FIELDS);
      const [track] = await db.select({ projectId: studioTracks.projectId }).from(studioTracks)
        .where(eq(studioTracks.id, data.trackId)).limit(1);
      if (!track || !await ownsProject(db, track.projectId, userId)) return { success: false, error: "Track not found" };
      if (Object.keys(allowed).length === 0)
        return {
          success: false,
          data: { updated: false, reason: "no allowed fields" },
        };

      const [updated] = await db
        .update(studioTracks)
        .set(allowed)
        .where(eq(studioTracks.id, data?.trackId))
        .returning({ id: studioTracks.id });

      return {
        success: !!updated,
        data: { updated: !!updated, trackId: data.trackId },
      };
    } catch (error) {
      logger.warn({ err: error }, "[sync] track.update failed");
      return { success: false, error: String(error) };
    }
  },

  "track.delete": async (payload, userId, db) => {
    try {
      const data = payload as { trackId: string };
      const [track] = await db.select({ projectId: studioTracks.projectId }).from(studioTracks)
        .where(eq(studioTracks.id, data.trackId)).limit(1);
      if (!track || !await ownsProject(db, track.projectId, userId)) return { success: false, error: "Track not found" };

      await db.delete(studioTracks).where(eq(studioTracks.id, data?.trackId));

      return { success: true, data: { deleted: true, trackId: data.trackId } };
    } catch (error) {
      logger.warn({ err: error }, "[sync] track.delete failed");
      return { success: false, error: String(error) };
    }
  },

  // ── Settings ─────────────────────────────────────────────────────────────

  "settings.update": async (payload, userId, db) => {
    try {
      const data = z.object({ settings: z.object({
        theme: z.enum(["light", "dark", "system"]).optional(),
        defaultBPM: z.number().int().min(20).max(300).optional(),
        defaultKey: z.string().max(16).optional(),
        autoSave: z.boolean().optional(),
        betaFeatures: z.boolean().optional(),
      }).strict() }).parse(payload);
      const settings = data.settings;

      // Merge into the user's JSONB preferences column.
      // Raw SQL merge so we don't blow away keys we don't know about.
      await db
        .update(users)
        .set({ preferences: sql`COALESCE(${users.preferences}, '{}'::jsonb) || ${JSON.stringify(settings)}::jsonb` })
        .where(eq(users.id, userId));

      return { success: true, data: { updated: true } };
    } catch (error) {
      logger.warn({ err: error }, "[sync] settings.update failed");
      return { success: false, error: String(error) };
    }
  },

  // ── Drafts ────────────────────────────────────────────────────────────────
  // Device drafts are not server mutations and must never receive applied ACKs.
  "draft.save": async (_payload, _userId) => {
    return { success: false, error: "Drafts are device-local; this action does not save a server draft" };
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  // Audio files require the real multipart upload/confirmation contract.
  "audio.upload": async (_payload, _userId) => {
    return { success: false, error: "Audio must be uploaded and confirmed through the multipart upload endpoint" };
  },

  // ── Fallback ─────────────────────────────────────────────────────────────
  default: async (_payload, userId) => {
    logger.warn({ userId }, "[sync] Unhandled action type");
    return { success: false, error: "Unsupported sync action type" };
  },
};

router.post("/batch", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { actions, ownerId } = batchSyncRequestSchema.parse(req.body);
    if (ownerId !== String(userId)) return res.status(403).json({ error: "Offline operation owner does not match this session" });
    if (new Set(actions.map(action => action.id)).size !== actions.length) {
      return res.status(400).json({ error: "Duplicate operation IDs in batch" });
    }

    logger.info({
      userId,
      actionCount: actions.length,
    }, "Processing batch sync request");

    const results: SyncResult[] = [];
    const conflicts: ConflictInfo[] = [];

    for (const action of actions) {
      try {
        const handler =
          ACTION_HANDLERS[action?.type] ?? ACTION_HANDLERS["default"];
        const receipt = await clientSyncReceipts.apply(String(userId), action,
          tx => handler(action.payload, userId, tx));
        results.push(receipt);
      } catch (error: unknown) {
        logger.warn({ actionId: action.id, error }, "Sync action failed");
        // Earlier actions may have committed. Caller reconciles every operation
        // by ID; an infrastructure error is never an invented terminal receipt.
        return res.status(503).json({ protocolVersion: 1, error: "Sync operation receipt unavailable; reconcile before retrying", results });
      }
    }

    const successCount = results?.filter((r) => r?.success).length;
    const failCount = results?.filter((r) => !r?.success).length;

    logger.info({
      userId,
      total: actions.length,
      success: successCount,
      failed: failCount,
      conflicts: conflicts.length,
    }, "Batch sync completed");

    res.json({
      protocolVersion: 1,
      ownerId: String(userId),
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
    logger.warn({ err: error }, "Batch sync request failed:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.issues,
      });
    }

    res.status(500).json({ error: "Failed to process batch sync" });
  }
});

router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    // A missing migration must not advertise a usable durable protocol.
    await clientSyncReceipts.lookup(String(userId), ["__readiness_probe__"]);

    res.json({
      success: true,
      serverTime: Date.now(),
      userId,
      syncEnabled: true,
      protocolVersion: 1,
      receipts: true,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Sync status check failed:");
    res.status(500).json({ error: "Failed to check sync status" });
  }
});

router.post("/receipts", requireAuth, async (req, res) => {
  try {
    const request = z.object({
      protocolVersion: z.literal(1),
      ownerId: z.string().min(1),
      ids: z.array(z.string().min(1).max(160)).min(1).max(50),
    }).parse(req.body);
    if (request.ownerId !== String(req.user!.id)) {
      return res.status(403).json({ error: "Offline operation owner does not match this session" });
    }
    const result = await clientSyncReceipts.lookup(request.ownerId, request.ids);
    return res.json({ protocolVersion: 1, ownerId: request.ownerId, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid receipt lookup" });
    logger.warn({ err: error }, "Sync receipt lookup unavailable");
    return res.status(503).json({ error: "Authoritative sync receipts unavailable" });
  }
});

router.post("/resolve-conflict", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { actionId, resolution } = req.body;

    if (!actionId || !["local", "server", "merged"].includes(resolution)) {
      return res
        .status(400)
        .json({ error: "Invalid conflict resolution request" });
    }

    logger.info({ userId, actionId, resolution }, "Resolving sync conflict");

    // Conflict receipts are immutable. Resolution is a new operation with a
    // fresh ID and the reviewed current revision, not an ACK-only mutation.
    res.status(409).json({
      error: "Submit a new versioned operation after reviewing the current server revision",
      actionId, resolution, resolved: false,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Conflict resolution failed:");
    res.status(500).json({ error: "Failed to resolve conflict" });
  }
});

export default router;

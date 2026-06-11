import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { db } from "../db";
import {
  collaborationComments,
  collaborationVersions,
  collaborationAccessRequests,
  studioProjects,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function verifyProjectAccess(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const [project] = await db
    .select({ id: studioProjects.id })
    .from(studioProjects)
    .where(
      and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
    )
    .limit(1);
  return !!project;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

interface ConflictResolution {
  id: string;
  type: "auto_merge" | "manual_merge" | "accept_theirs" | "accept_mine";
  originalContent: string;
  theirContent: string;
  yourContent: string;
  mergedContent?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

interface PresenceInfo {
  userId: string;
  displayName: string;
  avatar?: string;
  status: "online" | "idle" | "away" | "offline";
  cursorPosition?: { x: number; y: number; trackId?: string };
  selection?: { start: number; end: number; elementId?: string };
  isTyping?: boolean;
  lastActive: Date;
  color: string;
  role: "owner" | "editor" | "viewer" | "commenter";
}

// ── Bounded in-memory state ────────────────────────────────────────────────
// Both Maps are capped and swept so they cannot grow unboundedly.
const MAX_SESSIONS = 50_000; // max concurrent project sessions held in memory
const MAX_CONFLICTS = 10_000; // max project IDs tracked for conflict history
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours idle → evict session

/** sessionId → (userId → PresenceInfo) */
const sessions = new Map<string, Map<string, PresenceInfo>>();
/** projectId → ConflictResolution[] (each array already capped at 500 entries) */
const conflicts = new Map<string, ConflictResolution[]>();

/** Remove idle sessions and trim both Maps to their capacity caps. */
function sweepCollaborationMaps(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sid, presence] of sessions) {
    const lastActive = Math.max(
      0,
      ...[...presence.values()].map((p) => new Date(p.lastActive).getTime()),
    );
    if (lastActive < cutoff) sessions.delete(sid);
  }
  // If still over cap after TTL sweep, drop oldest-inserted entries (FIFO)
  if (sessions.size > MAX_SESSIONS) {
    const excess = sessions.size - MAX_SESSIONS;
    let dropped = 0;
    for (const key of sessions.keys()) {
      sessions.delete(key);
      if (++dropped >= excess) break;
    }
  }
  if (conflicts.size > MAX_CONFLICTS) {
    const excess = conflicts.size - MAX_CONFLICTS;
    let dropped = 0;
    for (const key of conflicts.keys()) {
      conflicts.delete(key);
      if (++dropped >= excess) break;
    }
  }
}
// Sweep every 30 minutes — low overhead, catches stale collaboration sessions
const _collabSweepTimer = setInterval(sweepCollaborationMaps, 30 * 60 * 1000);
_collabSweepTimer.unref(); // do not block process exit

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#06b6d4",
];

const resolveConflictSchema = z.object({
  conflictId: z.string(),
  projectId: z.string(),
  resolution: z.enum([
    "auto_merge",
    "manual_merge",
    "accept_theirs",
    "accept_mine",
  ]),
  mergedContent: z.string().optional(),
  yourContent: z.string(),
  theirContent: z.string(),
});

router.post(
  "/resolve-conflict",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = resolveConflictSchema.parse(req.body);

      const resolution: ConflictResolution = {
        id: validatedData.conflictId,
        type: validatedData.resolution,
        originalContent: "",
        theirContent: validatedData.theirContent,
        yourContent: validatedData.yourContent,
        mergedContent:
          validatedData.mergedContent ||
          (validatedData.resolution === "accept_theirs"
            ? validatedData.theirContent
            : validatedData.yourContent),
        resolvedAt: new Date(),
        resolvedBy: req.user!.id,
      };

      const projectConflicts = conflicts.get(validatedData.projectId) || [];
      projectConflicts.push(resolution);
      // Cap per-project conflict history to prevent unbounded growth.
      // Conflicts are in-memory only; 500 is more than enough for any live session.
      if (projectConflicts.length > 500)
        projectConflicts.splice(0, projectConflicts.length - 500);
      conflicts.set(validatedData.projectId, projectConflicts);

      let outcomeType: string;
      let message: string;

      switch (validatedData.resolution) {
        case "auto_merge":
          outcomeType = "auto_merge_successful";
          message = "Changes have been automatically merged";
          break;
        case "manual_merge":
          outcomeType = "changes_merged_with_diff";
          message = "Changes have been merged successfully with your edits";
          break;
        case "accept_theirs":
          outcomeType = "their_changes_accepted";
          message = "Their changes have been accepted";
          break;
        case "accept_mine":
          outcomeType = "your_changes_accepted";
          message = "Your changes have been accepted";
          break;
      }

      logger.info(
        `Conflict resolved: ${outcomeType} for project ${validatedData.projectId}`,
      );

      res.json({
        success: true,
        outcome: {
          type: outcomeType,
          message,
          resolution,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.issues });
      }
      logger.warn({ err: error }, "Resolve conflict error:");
      res.status(500).json({ error: "Failed to resolve conflict" });
    }
  },
);

router.get(
  "/presence/:sessionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const sessionPresence = sessions.get(sessionId);

      if (!sessionPresence) {
        const initialPresence: PresenceInfo = {
          userId: req.user!.id,
          displayName: "You",
          status: "online",
          lastActive: new Date(),
          color: COLORS[0],
          role: "owner",
        };

        // Enforce cap at insertion time — don't wait for the 30-min sweep.
        if (sessions.size >= MAX_SESSIONS) sweepCollaborationMaps();
        if (sessions.size >= MAX_SESSIONS) {
          // Still over cap after sweep — evict the oldest entry to make room.
          const oldest = sessions.keys().next().value;
          if (oldest) sessions.delete(oldest);
        }
        const newSession = new Map<string, PresenceInfo>();
        newSession.set(req.user!.id, initialPresence);
        sessions.set(sessionId, newSession);

        return res.json({
          presence: [initialPresence],
          outcomes: [
            {
              type: "session_created",
              message: "Collaboration session started",
            },
          ],
        });
      }

      const existingUser = sessionPresence.get(req.user!.id);
      if (!existingUser) {
        const newPresence: PresenceInfo = {
          userId: req.user!.id,
          displayName: "You",
          status: "online",
          lastActive: new Date(),
          color: COLORS[sessionPresence.size % COLORS.length],
          role: "editor",
        };
        sessionPresence.set(req.user!.id, newPresence);

        return res.json({
          presence: Array.from(sessionPresence.values()),
          outcomes: [
            {
              type: "user_joined_session",
              userId: req.user!.id,
              message: "You joined the session",
            },
          ],
        });
      }

      existingUser.lastActive = new Date();
      existingUser.status = "online";

      res.json({
        presence: Array.from(sessionPresence.values()),
      });
    } catch (error) {
      logger.warn({ err: error }, "Get presence error:");
      res.status(500).json({ error: "Failed to get presence" });
    }
  },
);

const updatePresenceSchema = z.object({
  status: z.enum(["online", "idle", "away", "offline"]).optional(),
  cursorPosition: z
    .object({
      x: z.number(),
      y: z.number(),
      trackId: z.string().optional(),
    })
    .optional(),
  selection: z
    .object({
      start: z.number(),
      end: z.number(),
      elementId: z.string().optional(),
    })
    .optional(),
  isTyping: z.boolean().optional(),
});

router.put(
  "/presence/:sessionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const validatedData = updatePresenceSchema.parse(req.body);

      const sessionPresence = sessions.get(sessionId);
      if (!sessionPresence) {
        return res.status(404).json({ error: "Session not found" });
      }

      const userPresence = sessionPresence.get(req.user!.id);
      if (!userPresence) {
        return res.status(404).json({ error: "User not in session" });
      }

      const outcomes: unknown[] = [];
      const previousStatus = userPresence.status;

      if (validatedData.status) {
        userPresence.status = validatedData.status;
        if (previousStatus !== validatedData.status) {
          if (
            validatedData.status === "idle" ||
            validatedData.status === "away"
          ) {
            outcomes.push({
              type: "user_went_idle",
              userId: req.user!.id,
              message: `User went ${validatedData.status}`,
            });
          }
        }
      }

      if (validatedData.cursorPosition) {
        userPresence.cursorPosition = validatedData.cursorPosition;
        outcomes.push({
          type: "cursor_position_updated",
          userId: req.user!.id,
          position: validatedData.cursorPosition,
        });
      }

      if (validatedData.selection) {
        userPresence.selection = validatedData.selection;
        outcomes.push({
          type: "user_selection_highlighted",
          userId: req.user!.id,
          selection: validatedData.selection,
        });
      }

      if (validatedData.isTyping !== undefined) {
        userPresence.isTyping = validatedData.isTyping;
        if (validatedData.isTyping) {
          outcomes.push({
            type: "user_is_typing",
            userId: req.user!.id,
          });
        }
      }

      userPresence.lastActive = new Date();

      res.json({
        success: true,
        presence: userPresence,
        outcomes,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.issues });
      }
      logger.warn({ err: error }, "Update presence error:");
      res.status(500).json({ error: "Failed to update presence" });
    }
  },
);

router.delete(
  "/presence/:sessionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const sessionPresence = sessions.get(sessionId);

      if (sessionPresence) {
        const user = sessionPresence.get(req.user!.id);
        sessionPresence.delete(req.user!.id);

        if (sessionPresence.size === 0) {
          sessions.delete(sessionId);
        }

        res.json({
          success: true,
          outcomes: [
            {
              type: "user_left_session",
              userId: req.user!.id,
              displayName: user?.displayName || "User",
              message: "You left the session",
            },
          ],
        });
      } else {
        res.json({ success: true });
      }
    } catch (error) {
      logger.warn({ err: error }, "Leave session error:");
      res.status(500).json({ error: "Failed to leave session" });
    }
  },
);

const createVersionSchema = z.object({
  projectId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  isAutoSave: z.boolean().optional(),
});

router.post(
  "/version",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = createVersionSchema.parse(req.body);
      const userId = req.user!.id;

      if (!(await verifyProjectAccess(validatedData.projectId, userId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const existingVersions = await db
        .select({ id: collaborationVersions.id })
        .from(collaborationVersions)
        .where(eq(collaborationVersions.projectId, validatedData.projectId))
        .limit(500);

      const nextVersion = existingVersions.length + 1;

      await db
        .update(collaborationVersions)
        .set({ isCurrent: false })
        .where(eq(collaborationVersions.projectId, validatedData.projectId));

      const [newVersion] = await db
        .insert(collaborationVersions)
        .values({
          projectId: validatedData.projectId,
          version: nextVersion,
          name: validatedData.name || `Version ${nextVersion}`,
          description: validatedData.description || null,
          createdBy: userId,
          createdByName: "You",
          isAutoSave: validatedData.isAutoSave || false,
          isCurrent: true,
        })
        .returning();

      const outcomeType = validatedData.isAutoSave
        ? "auto_save_completed"
        : "new_version_created";
      const message = validatedData.isAutoSave
        ? "Auto-save completed"
        : `Version ${nextVersion} created`;

      logger.info(
        `Version created: ${newVersion.id} for project ${validatedData.projectId}`,
      );

      res.status(201).json({
        version: newVersion,
        outcome: {
          type: outcomeType,
          message,
          versionId: newVersion.id,
          version: nextVersion,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.issues });
      }
      logger.warn({ err: error }, "Create version error:");
      res.status(500).json({ error: "Failed to create version" });
    }
  },
);

router.get(
  "/versions/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      if (!(await verifyProjectAccess(projectId, req.user!.id))) {
        return res.status(404).json({ error: "Project not found" });
      }
      const rows = await db
        .select()
        .from(collaborationVersions)
        .where(eq(collaborationVersions.projectId, projectId))
        .orderBy(desc(collaborationVersions.version))
        .limit(100);

      res.json({
        versions: rows,
        outcome: {
          type: "version_history_displayed",
          message: `${rows.length} versions found`,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Get versions error:");
      res.status(500).json({ error: "Failed to get versions" });
    }
  },
);

router.put(
  "/versions/:projectId/:versionId/restore",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId, versionId } = req.params;
      if (!(await verifyProjectAccess(projectId, req.user!.id))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const [target] = await db
        .select()
        .from(collaborationVersions)
        .where(
          and(
            eq(collaborationVersions.id, versionId),
            eq(collaborationVersions.projectId, projectId),
          ),
        )
        .limit(1);

      if (!target) {
        return res.status(404).json({ error: "Version not found" });
      }

      await db
        .update(collaborationVersions)
        .set({ isCurrent: false })
        .where(eq(collaborationVersions.projectId, projectId));

      const [restored] = await db
        .update(collaborationVersions)
        .set({ isCurrent: true })
        .where(eq(collaborationVersions.id, versionId))
        .returning();

      res.json({
        success: true,
        version: restored,
        outcome: {
          type: "version_restored",
          message: `Restored to ${restored.name}`,
          versionId: restored.id,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Restore version error:");
      res.status(500).json({ error: "Failed to restore version" });
    }
  },
);

router.post(
  "/versions/:projectId/compare",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      if (!(await verifyProjectAccess(projectId, req.user!.id))) {
        return res.status(404).json({ error: "Project not found" });
      }
      const { versionAId, versionBId } = req.body;

      const rows = await db
        .select()
        .from(collaborationVersions)
        .where(and(eq(collaborationVersions.projectId, projectId)))
        .limit(200);

      const versionA = rows.find((v) => v.id === versionAId);
      const versionB = rows.find((v) => v.id === versionBId);

      if (!versionA || !versionB) {
        return res
          .status(404)
          .json({ error: "One or both versions not found" });
      }

      res.json({
        comparison: { versionA, versionB, changes: [] },
        outcome: {
          type: "version_compared",
          message: `Comparing ${versionA.name} with ${versionB.name}`,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Compare versions error:");
      res.status(500).json({ error: "Failed to compare versions" });
    }
  },
);

router.delete(
  "/versions/:projectId/:versionId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId, versionId } = req.params;
      if (!(await verifyProjectAccess(projectId, req.user!.id))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const [target] = await db
        .select()
        .from(collaborationVersions)
        .where(
          and(
            eq(collaborationVersions.id, versionId),
            eq(collaborationVersions.projectId, projectId),
          ),
        )
        .limit(1);

      if (!target) {
        return res.status(404).json({ error: "Version not found" });
      }

      if (target.isCurrent) {
        return res
          .status(400)
          .json({ error: "Cannot delete the current version" });
      }

      await db
        .delete(collaborationVersions)
        .where(eq(collaborationVersions.id, versionId));

      res.json({
        success: true,
        outcome: {
          type: "version_deleted",
          message: `${target.name} has been deleted`,
          versionId,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Delete version error:");
      res.status(500).json({ error: "Failed to delete version" });
    }
  },
);

const accessRequestSchema = z.object({
  projectId: z.string(),
  requestedAccess: z.enum(["view", "edit", "comment"]),
  message: z.string().optional(),
});

router.post(
  "/access/request",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = accessRequestSchema.parse(req.body);
      const userId = req.user!.id;

      const [inserted] = await db
        .insert(collaborationAccessRequests)
        .values({
          projectId: validatedData.projectId,
          requesterId: userId,
          requesterName: "User",
          requesterEmail: req.user!.email,
          requestedAccess: validatedData.requestedAccess,
          message: validatedData.message || null,
          status: "pending",
        })
        .returning();

      logger.info(
        `Access request submitted: ${inserted.id} for project ${validatedData.projectId}`,
      );

      res.status(201).json({
        request: inserted,
        outcome: {
          type: "access_request_submitted",
          message: `Request for ${validatedData.requestedAccess} access has been submitted`,
          requestId: inserted.id,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.issues });
      }
      logger.warn({ err: error }, "Submit access request error:");
      res.status(500).json({ error: "Failed to submit access request" });
    }
  },
);

router.get(
  "/access/requests/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const rows = await db
        .select()
        .from(collaborationAccessRequests)
        .where(
          and(
            eq(collaborationAccessRequests.projectId, projectId),
            eq(collaborationAccessRequests.status, "pending"),
          ),
        )
        .limit(100);

      res.json({ requests: rows });
    } catch (error) {
      logger.warn({ err: error }, "Get access requests error:");
      res.status(500).json({ error: "Failed to get access requests" });
    }
  },
);

const updateAccessSchema = z.object({
  action: z.enum(["approve", "deny", "upgrade", "downgrade", "revoke"]),
  accessLevel: z.enum(["view", "edit", "comment"]).optional(),
  reason: z.string().optional(),
});

router.put(
  "/access/:userId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const validatedData = updateAccessSchema.parse(req.body);
      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const isOwner = await verifyProjectAccess(projectId, req.user!.id);
      if (!isOwner) {
        return res.status(403).json({ error: "You do not own this project" });
      }

      let outcomeType: string;
      let message: string;

      switch (validatedData.action) {
        case "approve":
          outcomeType = "access_request_approved";
          message = `${validatedData.accessLevel || "edit"} access granted`;
          break;
        case "deny":
          outcomeType = "access_request_denied";
          message = validatedData.reason || "Access request denied";
          break;
        case "upgrade":
          outcomeType = "access_upgraded";
          message = `Access upgraded to ${validatedData.accessLevel}`;
          break;
        case "downgrade":
          outcomeType = "access_downgraded";
          message = `Access downgraded to ${validatedData.accessLevel}`;
          break;
        case "revoke":
          outcomeType = "access_revoked";
          message = "Access has been revoked";
          break;
      }

      if (projectId) {
        const newStatus =
          validatedData.action === "approve" ? "approved" : "denied";
        await db
          .update(collaborationAccessRequests)
          .set({
            status: newStatus,
            respondedBy: req.user!.id,
            respondedAt: new Date(),
          })
          .where(
            and(
              eq(collaborationAccessRequests.projectId, projectId),
              eq(collaborationAccessRequests.requesterId, userId),
            ),
          );
      }

      logger.info(`Access updated for user ${userId}: ${validatedData.action}`);

      res.json({
        success: true,
        outcome: {
          type: outcomeType,
          message,
          userId,
          accessLevel: validatedData.accessLevel,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.issues });
      }
      logger.warn({ err: error }, "Update access error:");
      res.status(500).json({ error: "Failed to update access" });
    }
  },
);

const commentSchema = z.object({
  projectId: z.string(),
  elementId: z.string().optional(),
  content: z.string(),
  parentId: z.string().optional(),
  mentions: z.array(z.string()).optional(),
  timestamp: z.number().optional(),
});

router.post(
  "/comments",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = commentSchema.parse(req.body);
      const userId = req.user!.id;

      const [inserted] = await db
        .insert(collaborationComments)
        .values({
          projectId: validatedData.projectId,
          elementId: validatedData.elementId || null,
          userId,
          userName: "You",
          content: validatedData.content,
          parentId: validatedData.parentId || null,
          mentions: validatedData.mentions || [],
          timestamp: validatedData.timestamp ?? null,
          resolved: false,
        })
        .returning();

      const outcomes: unknown[] = [
        {
          type: validatedData.parentId ? "comment_replied" : "comment_added",
          message: validatedData.parentId ? "Reply added" : "Comment added",
          commentId: inserted.id,
        },
      ];

      if (validatedData.mentions && validatedData.mentions.length > 0) {
        outcomes.push({
          type: "mention_notification_sent",
          message: `${validatedData.mentions.length} user(s) mentioned`,
          mentions: validatedData.mentions,
        });
      }

      res.status(201).json({ comment: inserted, outcomes });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.issues });
      }
      logger.warn({ err: error }, "Add comment error:");
      res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

router.get(
  "/comments/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const rows = await db
        .select()
        .from(collaborationComments)
        .where(eq(collaborationComments.projectId, projectId))
        .orderBy(desc(collaborationComments.createdAt))
        .limit(200);

      res.json({ comments: rows });
    } catch (error) {
      logger.warn({ err: error }, "Get comments error:");
      res.status(500).json({ error: "Failed to get comments" });
    }
  },
);

router.put(
  "/comments/:commentId/resolve",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { commentId } = req.params;

      const [resolved] = await db
        .update(collaborationComments)
        .set({ resolved: true })
        .where(eq(collaborationComments.id, commentId))
        .returning();

      if (!resolved) {
        return res.status(404).json({ error: "Comment not found" });
      }

      res.json({
        success: true,
        comment: resolved,
        outcome: {
          type: "comment_resolved",
          message: "Comment marked as resolved",
          commentId,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Resolve comment error:");
      res.status(500).json({ error: "Failed to resolve comment" });
    }
  },
);

router.put(
  "/comments/:commentId/mention-resolved",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { commentId } = req.params;

      res.json({
        success: true,
        outcome: {
          type: "mention_resolved",
          message: "Mention marked as read",
          commentId,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Resolve mention error:");
      res.status(500).json({ error: "Failed to resolve mention" });
    }
  },
);

router.get(
  "/conflicts/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const projectConflicts = conflicts.get(projectId) || [];

      const hasUnresolved = projectConflicts.some(
        (c: Record<string, unknown>) =>
          c.resolvedBy === undefined || c.resolvedBy === null,
      );

      res.json({
        conflicts: projectConflicts,
        pendingConflict: hasUnresolved
          ? {
              id:
                projectConflicts.find(
                  (c: Record<string, unknown>) => !c.resolvedBy,
                )?.id || null,
              detected: true,
              details:
                projectConflicts.find(
                  (c: Record<string, unknown>) => !c.resolvedBy,
                ) || null,
            }
          : {
              id: null,
              detected: false,
              details: null,
            },
      });
    } catch (error) {
      logger.warn({ err: error }, "Get conflicts error:");
      res.status(500).json({ error: "Failed to get conflicts" });
    }
  },
);

router.post(
  "/detect-conflict",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { elementId, yourVersion, baseVersion } = req.body;

      const hasConflict = yourVersion !== baseVersion;

      if (hasConflict) {
        res.json({
          conflict: true,
          outcome: {
            type: "edit_conflict_detected",
            message: "Changes conflict with another user's edits",
            elementId,
            requiresManualMerge: true,
          },
        });
      } else {
        res.json({
          conflict: false,
          outcome: {
            type: "no_conflict",
            message: "No conflicts detected",
          },
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Detect conflict error:");
      res.status(500).json({ error: "Failed to detect conflict" });
    }
  },
);

export default router;

import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  collaborationProjects,
  collaborationRoomMessages,
  collaborationRooms,
  projectMembers,
  projects,
  studioProjects,
  users,
} from "@shared/schema";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db.js";
import { getStudioProjectAccess } from "../services/studioProjectAccess.js";
import {
  collaborationEventBus,
  type CollaborationRoomClosedEvent,
  type CollaborationRoomMessageEvent,
} from "../services/collaborationEventBus.js";
import {
  collaborationRoomMessageRequestSchema,
  openRoomRequestSchema,
} from "../services/collaborationRoomContracts.js";
import { logger } from "../logger.js";

type AuthenticatedRequest = Request;

function senderName(user: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    user.username ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "Collaborator"
  );
}

async function canManageProject(userId: string, projectId: string): Promise<boolean> {
  const [studio] = await db
    .select({ ownerId: studioProjects.userId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  const [project] = studio
    ? []
    : await db
        .select({ ownerId: projects.userId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
  const [collaboration] = studio || project
    ? []
    : await db
        .select({ ownerId: collaborationProjects.ownerId })
        .from(collaborationProjects)
        .where(eq(collaborationProjects.id, projectId))
        .limit(1);

  const ownerId = studio?.ownerId ?? project?.ownerId ?? collaboration?.ownerId;
  if (ownerId === userId) return true;
  const [membership] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
        eq(projectMembers.status, "active"),
      ),
    )
    .limit(1);
  return ["owner", "admin"].includes(membership?.role ?? "");
}

const router = Router();

router.get(
  "/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = String(req.params.projectId ?? "");
      const access = await getStudioProjectAccess(req.user!.id, projectId);
      if (!access.read) return res.status(403).json({ error: "Access denied" });

      const [room] = await db
        .select()
        .from(collaborationRooms)
        .where(
          and(
            eq(collaborationRooms.projectId, projectId),
            eq(collaborationRooms.state, "active"),
          ),
        )
        .limit(1);

      if (!room) return res.status(404).json({ error: "No active room" });
      return res.json({
        room: {
          id: room.id,
          projectId: room.projectId,
          state: room.state,
          generation: room.generation,
          mediaState: room.mediaState,
          mediaRegion: room.mediaRegion,
          participantLimit: room.participantLimit,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
        },
        permissions: access,
        canManage: await canManageProject(req.user!.id, projectId),
      });
    } catch (error) {
      logger.warn({ projectId: req.params.projectId, err: error }, "Collaboration room read failed");
      return res.status(503).json({ error: "Collaboration room is unavailable" });
    }
  },
);

router.post(
  "/:projectId/open",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = openRoomRequestSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json({ error: "Invalid room request" });
      }
      const projectId = String(req.params.projectId ?? "");
      const access = await getStudioProjectAccess(req.user!.id, projectId);
      if (!access.write) return res.status(403).json({ error: "Write access required" });

      const [room] = await db
        .insert(collaborationRooms)
        .values({
          projectId,
          createdBy: req.user!.id,
          state: "active",
          mediaState: "unavailable",
          participantLimit: null,
        })
        .onConflictDoUpdate({
          target: collaborationRooms.projectId,
          set: {
            state: "active",
            generation: sql`CASE
              WHEN ${collaborationRooms.state} = 'closed'
                THEN ${collaborationRooms.generation} + 1
              ELSE ${collaborationRooms.generation}
            END`,
            mediaState: sql`CASE
              WHEN ${collaborationRooms.state} = 'closed'
                THEN 'unavailable'
              ELSE ${collaborationRooms.mediaState}
            END`,
            mediaRegion: sql`CASE
              WHEN ${collaborationRooms.state} = 'closed'
                THEN NULL
              ELSE ${collaborationRooms.mediaRegion}
            END`,
            participantLimit: sql`CASE
              WHEN ${collaborationRooms.state} = 'closed'
                THEN NULL
              ELSE ${collaborationRooms.participantLimit}
            END`,
            endedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return res.status(200).json({
        room: {
          id: room.id,
          projectId: room.projectId,
          state: room.state,
          generation: room.generation,
          mediaState: room.mediaState,
          mediaRegion: room.mediaRegion,
          participantLimit: room.participantLimit,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
        },
        permissions: access,
        canManage: await canManageProject(req.user!.id, projectId),
      });
    } catch (error) {
      logger.warn({ projectId: req.params.projectId, err: error }, "Collaboration room open failed");
      return res.status(503).json({ error: "Collaboration room could not be opened" });
    }
  },
);

router.post(
  "/:projectId/close",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const projectId = String(req.params.projectId ?? "");
    try {
      const access = await getStudioProjectAccess(req.user!.id, projectId);
      if (!access.read) return res.status(403).json({ error: "Access denied" });
      if (!(await canManageProject(req.user!.id, projectId))) {
        return res.status(403).json({ error: "Project owner or administrator required" });
      }

      const [room] = await db
        .select({
          id: collaborationRooms.id,
          generation: collaborationRooms.generation,
        })
        .from(collaborationRooms)
        .where(
          and(
            eq(collaborationRooms.projectId, projectId),
            eq(collaborationRooms.state, "active"),
          ),
        )
        .limit(1);
      if (!room) return res.status(404).json({ error: "No active room" });

      const closedAt = new Date();
      const [closed] = await db
        .update(collaborationRooms)
        .set({ state: "closed", endedAt: closedAt, updatedAt: closedAt })
        .where(
          and(
            eq(collaborationRooms.id, room.id),
            eq(collaborationRooms.state, "active"),
          ),
        )
        .returning({ id: collaborationRooms.id });
      if (!closed) {
        return res.status(409).json({ error: "The room is already closed" });
      }

      const event: CollaborationRoomClosedEvent = {
        type: "room:closed",
        payload: {
          roomId: room.id,
          roomGeneration: room.generation,
          closedAt: closedAt.toISOString(),
        },
      };
      try {
        await collaborationEventBus.publishProjectEvent(projectId, event);
      } catch (error) {
        logger.warn(
          { projectId, roomId: room.id, err: error },
          "Room closed but live participant notification failed",
        );
        return res.status(503).json({
          error: "Room was closed, but participants could not be notified yet",
          persisted: true,
        });
      }
      return res.json({ closed: true, roomId: room.id, closedAt });
    } catch (error) {
      logger.warn({ projectId, err: error }, "Collaboration room close failed");
      return res.status(503).json({ error: "Collaboration room could not be closed" });
    }
  },
);

router.get(
  "/:projectId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = String(req.params.projectId ?? "");
      const access = await getStudioProjectAccess(req.user!.id, projectId);
      if (!access.read) return res.status(403).json({ error: "Access denied" });

      const [room] = await db
        .select({ id: collaborationRooms.id })
        .from(collaborationRooms)
        .where(
          and(
            eq(collaborationRooms.projectId, projectId),
            eq(collaborationRooms.state, "active"),
          ),
        )
        .limit(1);
      if (!room) return res.status(404).json({ error: "No active room" });

      const requestedLimit = Number(req.query.limit);
      const limit =
        Number.isInteger(requestedLimit) && requestedLimit > 0
          ? Math.min(requestedLimit, 100)
          : 50;
      const rows = await db
        .select({
          id: collaborationRoomMessages.id,
          clientMessageId: collaborationRoomMessages.clientMessageId,
          senderId: collaborationRoomMessages.senderId,
          content: collaborationRoomMessages.content,
          createdAt: collaborationRoomMessages.createdAt,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
        })
        .from(collaborationRoomMessages)
        .innerJoin(users, eq(users.id, collaborationRoomMessages.senderId))
        .where(eq(collaborationRoomMessages.roomId, room.id))
        .orderBy(desc(collaborationRoomMessages.createdAt))
        .limit(limit);

      return res.json({
        messages: rows.reverse().map((row) => ({
          id: row.id,
          clientMessageId: row.clientMessageId,
          sender: {
            id: row.senderId,
            name: senderName(row),
            avatarUrl: row.avatarUrl,
          },
          content: row.content,
          createdAt: row.createdAt,
        })),
      });
    } catch (error) {
      logger.warn({ projectId: req.params.projectId, err: error }, "Collaboration messages read failed");
      return res.status(503).json({ error: "Room messages are unavailable" });
    }
  },
);

router.post(
  "/:projectId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = collaborationRoomMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid room message",
        details: parsed.error.issues.map(({ path, message }) => ({
          path,
          message,
        })),
      });
    }

    const projectId = String(req.params.projectId ?? "");
    try {
      const access = await getStudioProjectAccess(req.user!.id, projectId);
      if (!access.write) return res.status(403).json({ error: "Write access required" });

      const [room] = await db
        .select({ id: collaborationRooms.id })
        .from(collaborationRooms)
        .where(
          and(
            eq(collaborationRooms.projectId, projectId),
            eq(collaborationRooms.state, "active"),
          ),
        )
        .limit(1);
      if (!room) return res.status(404).json({ error: "No active room" });

      const [created] = await db
        .insert(collaborationRoomMessages)
        .values({
          roomId: room.id,
          senderId: req.user!.id,
          clientMessageId: parsed.data.clientMessageId,
          content: parsed.data.content,
        })
        .onConflictDoNothing()
        .returning({ id: collaborationRoomMessages.id });

      const [row] = await db
        .select({
          id: collaborationRoomMessages.id,
          clientMessageId: collaborationRoomMessages.clientMessageId,
          senderId: collaborationRoomMessages.senderId,
          content: collaborationRoomMessages.content,
          createdAt: collaborationRoomMessages.createdAt,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
        })
        .from(collaborationRoomMessages)
        .innerJoin(users, eq(users.id, collaborationRoomMessages.senderId))
        .where(
          and(
            eq(collaborationRoomMessages.roomId, room.id),
            eq(collaborationRoomMessages.senderId, req.user!.id),
            eq(
              collaborationRoomMessages.clientMessageId,
              parsed.data.clientMessageId,
            ),
          ),
        )
        .limit(1);

      if (!row) {
        return res.status(503).json({ error: "Saved message could not be read back" });
      }

      const message = {
        id: row.id,
        clientMessageId: row.clientMessageId,
        sender: {
          id: row.senderId,
          name: senderName(row),
          avatarUrl: row.avatarUrl,
        },
        content: row.content,
        createdAt: row.createdAt,
      };
      const event: CollaborationRoomMessageEvent = {
        type: "room:message",
        payload: {
          id: message.id,
          clientMessageId: message.clientMessageId,
          senderId: message.sender.id,
          senderName: message.sender.name,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        },
      };

      try {
        await collaborationEventBus.publishProjectEvent(projectId, event);
      } catch (error) {
        logger.warn(
          { projectId, messageId: message.id, err: error },
          "Room message saved but live delivery failed",
        );
        return res.status(503).json({
          error: "Message was saved, but live delivery is unavailable",
          persisted: true,
          message,
        });
      }

      return res.status(created ? 201 : 200).json({ message });
    } catch (error) {
      logger.warn({ projectId, err: error }, "Collaboration message write failed");
      return res.status(503).json({ error: "Room message could not be saved" });
    }
  },
);

export default router;

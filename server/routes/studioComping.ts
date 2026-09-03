// @ts-nocheck
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db";
import {
  audioClips,
  compVersions,
  projects,
  studioTracks,
  takeGroups,
  takeLanes,
  takeSegments,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { compingService } from "../services/compingService";
import { logger } from "../logger.js";

const router = Router();

const createTakeGroupSchema = z.object({
  trackId: z.string().min(1),
  name: z.string().min(1).max(255),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateTakeGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  status: z
    .enum(["recording", "editing", "comped", "rendered", "archived"])
    .optional(),
  isExpanded: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const createTakeLaneSchema = z.object({
  takeGroupId: z.string().min(1),
  audioClipId: z.string().optional(),
  name: z.string().min(1).max(255),
  laneIndex: z.number().int().min(0).optional(),
  volume: z.number().min(0).max(2).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  rating: z.number().int().min(0).max(5).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateTakeLaneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isMuted: z.boolean().optional(),
  isSolo: z.boolean().optional(),
  isActive: z.boolean().optional(),
  volume: z.number().min(0).max(2).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  rating: z.number().int().min(0).max(5).optional(),
  notes: z.string().optional(),
  audioClipId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const createTakeSegmentSchema = z.object({
  takeGroupId: z.string().min(1),
  takeLaneId: z.string().min(1),
  compVersionId: z.string().optional(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  crossfadeType: z
    .enum(["linear", "exponential", "logarithmic", "equal_power"])
    .optional(),
  gain: z.number().optional(),
  isSelected: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateTakeSegmentSchema = z.object({
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  crossfadeType: z
    .enum(["linear", "exponential", "logarithmic", "equal_power"])
    .optional(),
  gain: z.number().optional(),
  isSelected: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const createCompVersionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const reorderLanesSchema = z.object({
  laneIds: z.array(z.string().min(1)),
});

async function verifyProjectOwnership(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  return !!project;
}

async function verifyTrackOwnership(
  trackId: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (!(await verifyProjectOwnership(projectId, userId))) return false;
  return !!(await db.query.studioTracks.findFirst({
    where: and(eq(studioTracks.id, trackId), eq(studioTracks.projectId, projectId)),
  }));
}

async function verifyTakeGroupOwnership(
  groupId: string,
  projectId: string,
  userId: string,
) {
  if (!(await verifyProjectOwnership(projectId, userId))) return undefined;
  return db.query.takeGroups.findFirst({
    where: and(eq(takeGroups.id, groupId), eq(takeGroups.projectId, projectId)),
  });
}

async function verifyTakeLaneOwnership(
  laneId: string,
  projectId: string,
  userId: string,
) {
  if (!(await verifyProjectOwnership(projectId, userId))) return undefined;
  const lane = await db.query.takeLanes.findFirst({
    where: eq(takeLanes.id, laneId),
  });
  if (!lane) return undefined;
  const group = await db.query.takeGroups.findFirst({
    where: and(
      eq(takeGroups.id, lane.takeGroupId),
      eq(takeGroups.projectId, projectId),
    ),
  });
  return group ? { lane, group } : undefined;
}

async function verifyTakeSegmentOwnership(
  segmentId: string,
  projectId: string,
  userId: string,
) {
  if (!(await verifyProjectOwnership(projectId, userId))) return undefined;
  const segment = await db.query.takeSegments.findFirst({
    where: eq(takeSegments.id, segmentId),
  });
  if (!segment) return undefined;
  const group = await db.query.takeGroups.findFirst({
    where: and(
      eq(takeGroups.id, segment.takeGroupId),
      eq(takeGroups.projectId, projectId),
    ),
  });
  return group ? { segment, group } : undefined;
}

async function verifyCompVersionOwnership(
  versionId: string,
  projectId: string,
  userId: string,
) {
  if (!(await verifyProjectOwnership(projectId, userId))) return undefined;
  return db.query.compVersions.findFirst({
    where: and(
      eq(compVersions.id, versionId),
      eq(compVersions.projectId, projectId),
    ),
  });
}

router.post(
  "/projects/:projectId/comping/groups",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyProjectOwnership(projectId, userId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const data = createTakeGroupSchema?.parse(req.body);
      if (!(await verifyTrackOwnership(data.trackId, projectId, userId))) {
        return res.status(404).json({ error: "Track not found" });
      }

      const takeGroup = await compingService?.createTakeGroup({
        projectId,
        ...data,
      });

      res.status(201).json(takeGroup);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating take group:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create take group" });
    }
  },
);

router.get(
  "/projects/:projectId/comping/groups",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyProjectOwnership(projectId, userId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const takeGroups = await compingService?.getProjectTakeGroups(projectId);
      res.json({ takeGroups });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take groups:");
      res.status(500).json({ error: "Failed to fetch take groups" });
    }
  },
);

router.get(
  "/projects/:projectId/comping/groups/:groupId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyProjectOwnership(projectId, userId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const takeGroup = await compingService?.getTakeGroupWithDetails(groupId);
      if (!takeGroup || takeGroup?.projectId !== projectId) {
        return res.status(404).json({ error: "Take group not found" });
      }

      res.json(takeGroup);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take group:");
      res.status(500).json({ error: "Failed to fetch take group" });
    }
  },
);

router.put(
  "/projects/:projectId/comping/groups/:groupId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const updates = updateTakeGroupSchema?.parse(req.body);
      const takeGroup = await compingService?.updateTakeGroup(groupId, updates);

      res.json(takeGroup);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating take group:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update take group" });
    }
  },
);

router.delete(
  "/projects/:projectId/comping/groups/:groupId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      await compingService?.deleteTakeGroup(groupId);
      res.status(204).send();
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting take group:");
      res.status(500).json({ error: "Failed to delete take group" });
    }
  },
);

router.post(
  "/projects/:projectId/comping/groups/:groupId/duplicate",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const newGroup = await compingService?.duplicateTakeGroup(groupId);
      res.status(201).json(newGroup);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error duplicating take group:");
      res.status(500).json({ error: "Failed to duplicate take group" });
    }
  },
);

router.post(
  "/projects/:projectId/comping/lanes",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyProjectOwnership(projectId, userId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const data = createTakeLaneSchema?.parse(req.body);
      const group = await verifyTakeGroupOwnership(
        data.takeGroupId,
        projectId,
        userId,
      );
      if (!group) {
        return res.status(404).json({ error: "Take group not found" });
      }
      if (data.audioClipId) {
        const clip = await db.query.audioClips.findFirst({
          where: and(
            eq(audioClips.id, data.audioClipId),
            eq(audioClips.projectId, projectId),
          ),
        });
        if (!clip || clip.trackId !== group.trackId) {
          return res.status(404).json({ error: "Audio clip not found" });
        }
      }
      const takeLane = await compingService?.createTakeLane(data);

      res.status(201).json(takeLane);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating take lane:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create take lane" });
    }
  },
);

router.get(
  "/projects/:projectId/comping/groups/:groupId/lanes",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const lanes = await compingService?.getGroupLanes(groupId);
      res.json({ lanes });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take lanes:");
      res.status(500).json({ error: "Failed to fetch take lanes" });
    }
  },
);

router.put(
  "/projects/:projectId/comping/lanes/:laneId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, laneId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const owned = await verifyTakeLaneOwnership(laneId, projectId, userId);
      if (!owned) {
        return res.status(404).json({ error: "Take lane not found" });
      }

      const updates = updateTakeLaneSchema?.parse(req.body);
      if (updates.audioClipId) {
        const clip = await db.query.audioClips.findFirst({
          where: and(
            eq(audioClips.id, updates.audioClipId),
            eq(audioClips.projectId, projectId),
          ),
        });
        if (!clip || clip.trackId !== owned.group.trackId) {
          return res.status(404).json({ error: "Audio clip not found" });
        }
      }
      const lane = await compingService?.updateTakeLane(laneId, updates);

      res.json(lane);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating take lane:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update take lane" });
    }
  },
);

router.delete(
  "/projects/:projectId/comping/lanes/:laneId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, laneId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeLaneOwnership(laneId, projectId, userId))) {
        return res.status(404).json({ error: "Take lane not found" });
      }

      await compingService?.deleteTakeLane(laneId);
      res.status(204).send();
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting take lane:");
      res.status(500).json({ error: "Failed to delete take lane" });
    }
  },
);

router.put(
  "/projects/:projectId/comping/groups/:groupId/lanes/reorder",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const { laneIds } = reorderLanesSchema?.parse(req.body) ?? {};
      const ownedLanes = await Promise.all(
        laneIds.map((laneId) =>
          verifyTakeLaneOwnership(laneId, projectId, userId),
        ),
      );
      if (ownedLanes.some((entry) => !entry || entry.group.id !== groupId)) {
        return res.status(400).json({ error: "laneIds must belong to this take group" });
      }
      await compingService?.reorderLanes(groupId, laneIds);

      res.json({ success: true });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error reordering lanes:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to reorder lanes" });
    }
  },
);

router.post(
  "/projects/:projectId/comping/segments",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyProjectOwnership(projectId, userId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const data = createTakeSegmentSchema?.parse(req.body);
      const group = await verifyTakeGroupOwnership(
        data.takeGroupId,
        projectId,
        userId,
      );
      const lane = await verifyTakeLaneOwnership(
        data.takeLaneId,
        projectId,
        userId,
      );
      if (!group || !lane || lane.group.id !== group.id) {
        return res.status(404).json({ error: "Take group or lane not found" });
      }
      if (data.compVersionId) {
        const version = await verifyCompVersionOwnership(
          data.compVersionId,
          projectId,
          userId,
        );
        if (!version || version.takeGroupId !== group.id) {
          return res.status(404).json({ error: "Comp version not found" });
        }
      }
      if (data.endTime <= data.startTime) {
        return res.status(400).json({ error: "endTime must be greater than startTime" });
      }
      const segment = await compingService?.createTakeSegment(data);

      res.status(201).json(segment);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating take segment:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create take segment" });
    }
  },
);

router.get(
  "/projects/:projectId/comping/groups/:groupId/segments",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const segments = await compingService?.getGroupSegments(groupId);
      res.json({ segments });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take segments:");
      res.status(500).json({ error: "Failed to fetch take segments" });
    }
  },
);

router.put(
  "/projects/:projectId/comping/segments/:segmentId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, segmentId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const owned = await verifyTakeSegmentOwnership(
        segmentId,
        projectId,
        userId,
      );
      if (!owned) {
        return res.status(404).json({ error: "Take segment not found" });
      }

      const updates = updateTakeSegmentSchema?.parse(req.body);
      const nextStart = updates.startTime ?? owned.segment.startTime;
      const nextEnd = updates.endTime ?? owned.segment.endTime;
      if (nextEnd <= nextStart) {
        return res.status(400).json({ error: "endTime must be greater than startTime" });
      }
      const segment = await compingService?.updateTakeSegment(
        segmentId,
        updates,
      );

      res.json(segment);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating take segment:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update take segment" });
    }
  },
);

router.delete(
  "/projects/:projectId/comping/segments/:segmentId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, segmentId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeSegmentOwnership(segmentId, projectId, userId))) {
        return res.status(404).json({ error: "Take segment not found" });
      }

      await compingService?.deleteTakeSegment(segmentId);
      res.status(204).send();
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting take segment:");
      res.status(500).json({ error: "Failed to delete take segment" });
    }
  },
);

router.post(
  "/projects/:projectId/comping/groups/:groupId/versions",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const data = createCompVersionSchema?.parse(req.body);
      const version = await compingService?.createCompVersion(groupId, {
        ...data,
        createdBy: userId,
      });

      res.status(201).json(version);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating comp version:");
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create comp version" });
    }
  },
);

router.get(
  "/projects/:projectId/comping/groups/:groupId/versions",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const history = await compingService?.getCompHistory(groupId);
      res.json(history);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching comp versions:");
      res.status(500).json({ error: "Failed to fetch comp versions" });
    }
  },
);

router.put(
  "/projects/:projectId/comping/groups/:groupId/versions/:versionId/activate",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, groupId, versionId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const group = await verifyTakeGroupOwnership(groupId, projectId, userId);
      const version = await verifyCompVersionOwnership(
        versionId,
        projectId,
        userId,
      );
      if (!group || !version || version.takeGroupId !== group.id) {
        return res.status(404).json({ error: "Comp version not found" });
      }

      await compingService?.setActiveCompVersion(groupId, versionId);
      res.json({ success: true });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error activating comp version:");
      res.status(500).json({ error: "Failed to activate comp version" });
    }
  },
);

router.delete(
  "/projects/:projectId/comping/versions/:versionId",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId, versionId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      if (!(await verifyCompVersionOwnership(versionId, projectId, userId))) {
        return res.status(404).json({ error: "Comp version not found" });
      }

      await compingService?.deleteCompVersion(versionId);
      res.status(204).send();
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting comp version:");
      if (
        error instanceof Error &&
        error?.message === "Cannot delete active comp version"
      ) {
        return res
          .status(400)
          .json({ error: "Cannot delete active comp version" });
      }
      res.status(500).json({ error: "Failed to delete comp version" });
    }
  },
);

router.post(
  "/projects/:projectId/comping/render",
  requireAuth,
  async (req, res) => {
    try {
      const { projectId } = req.params as Record<string, string>;
      const { groupId } = req.body;
      const userId = req.user!.id;

      if (!groupId) {
        return res.status(400).json({ error: "groupId is required" });
      }

      if (!(await verifyTakeGroupOwnership(groupId, projectId, userId))) {
        return res.status(404).json({ error: "Take group not found" });
      }

      const result = await compingService?.renderComp(groupId, userId);
      res.status(201).json(result);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error rendering comp:");
      if (
        error instanceof Error &&
        error?.message === "No segments selected for rendering"
      ) {
        return res
          .status(400)
          .json({ error: "No segments selected for rendering" });
      }
      res.status(500).json({ error: "Failed to render comp" });
    }
  },
);

export default router;

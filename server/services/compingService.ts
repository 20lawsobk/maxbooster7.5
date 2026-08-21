// @ts-nocheck
import { randomBytes } from "crypto";
import { db } from "../db";
import { takeGroups, takeLanes, takeSegments, compVersions, audioClips, type TakeGroup, type TakeLane, type TakeSegment, type CompVersion } from "@shared/schema";
type InsertTakeGroup = typeof takeGroups.$inferInsert;
type InsertTakeLane = typeof takeLanes.$inferInsert;
type InsertTakeSegment = typeof takeSegments.$inferInsert;
import { eq, and, desc, asc } from "drizzle-orm";

import { logger } from "../logger.js";

export interface CompRenderResult {
  clipId: string;
  filePath: string;
  duration: number;
  status: "processing" | "completed" | "failed";
}

export interface TakeGroupWithLanes extends TakeGroup {
  lanes: TakeLaneWithSegments[];
  versions: CompVersion[];
}

export interface TakeLaneWithSegments extends TakeLane {
  segments: TakeSegment[];
}

export class CompingService {
  async createTakeGroup(data: InsertTakeGroup): Promise<TakeGroup> {
    try {
      const [takeGroup] = await db
        .insert(takeGroups)
        .values({
          ...data,
          id: `tg_${randomBytes(8).toString("hex")}`,
        })
        .returning();

      const initialVersion = await this.createCompVersion(takeGroup?.id, {
        name: "Version 1",
        versionNumber: 1,
        createdBy: data.trackId,
      });

      await db
        .update(takeGroups)
        .set({ activeCompVersionId: initialVersion.id } as any)
        .where(eq(takeGroups.id, takeGroup?.id));

      return { ...takeGroup, activeCompVersionId: initialVersion.id };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating take group:");
      throw new Error("Failed to create take group");
    }
  }

  async getTakeGroup(groupId: string): Promise<TakeGroup | undefined> {
    try {
      const result = await db.query.takeGroups.findFirst({
        where: eq(takeGroups.id, groupId),
      });
      return result;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take group:");
      throw new Error("Failed to fetch take group");
    }
  }

  async getProjectTakeGroups(projectId: string): Promise<TakeGroup[]> {
    try {
      const results = await db.query.takeGroups.findMany({
        where: eq(takeGroups.projectId, projectId),
        orderBy: [asc((takeGroups as any)?.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching project take groups:");
      throw new Error("Failed to fetch project take groups");
    }
  }

  async getTrackTakeGroups(trackId: string): Promise<TakeGroup[]> {
    try {
      const results = await db.query.takeGroups.findMany({
        where: eq(takeGroups.trackId, trackId),
        orderBy: [asc((takeGroups as any)?.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching track take groups:");
      throw new Error("Failed to fetch track take groups");
    }
  }

  async getTakeGroupWithDetails(
    groupId: string,
  ): Promise<TakeGroupWithLanes | undefined> {
    try {
      const takeGroup = await this.getTakeGroup(groupId);
      if (!takeGroup) return undefined;

      const lanes = await this.getGroupLanes(groupId);
      const versions = await this.getCompVersions(groupId);

      const lanesWithSegments: TakeLaneWithSegments[] = await Promise.all(
        lanes?.map(async (lane) => {
          const segments = await this.getLaneSegments(lane?.id);
          return { ...lane, segments };
        }),
      );

      return {
        ...takeGroup,
        lanes: lanesWithSegments,
        versions,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take group with details:");
      throw new Error("Failed to fetch take group details");
    }
  }

  async updateTakeGroup(
    groupId: string,
    updates: Partial<TakeGroup>,
  ): Promise<TakeGroup> {
    try {
      const [updated] = await db
        .update(takeGroups)
        .set({ ...updates } as any)
        .where(eq(takeGroups.id, groupId))
        .returning();

      if (!updated) {
        throw new Error("Take group not found");
      }

      return updated;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating take group:");
      throw new Error("Failed to update take group");
    }
  }

  async deleteTakeGroup(groupId: string): Promise<void> {
    try {
      await db.delete(takeGroups).where(eq(takeGroups.id, groupId));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting take group:");
      throw new Error("Failed to delete take group");
    }
  }

  async createTakeLane(data: InsertTakeLane): Promise<TakeLane> {
    try {
      const existingLanes = await this.getGroupLanes(data?.takeGroupId);
      const nextIndex = existingLanes?.length;

      const [takeLane] = await db
        .insert(takeLanes)
        .values({
          ...data,
          id: `tl_${randomBytes(8).toString("hex")}`,
          laneIndex: (data as any).laneIndex ?? nextIndex,
        } as any)
        .returning();

      await db
        .update(takeGroups)
        .set({
          takeCount: existingLanes.length + 1,
          updatedAt: new Date(),
        } as any)
        .where(eq(takeGroups.id, data?.takeGroupId));

      return takeLane;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating take lane:");
      throw new Error("Failed to create take lane");
    }
  }

  async getTakeLane(laneId: string): Promise<TakeLane | undefined> {
    try {
      const result = await db.query.takeLanes.findFirst({
        where: eq(takeLanes.id, laneId),
      });
      return result;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take lane:");
      throw new Error("Failed to fetch take lane");
    }
  }

  async getGroupLanes(groupId: string): Promise<TakeLane[]> {
    try {
      const results = await db.query.takeLanes.findMany({
        where: eq(takeLanes.takeGroupId, groupId),
        orderBy: [asc((takeLanes as any)?.laneIndex)],
      });
      return results;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching group lanes:");
      throw new Error("Failed to fetch group lanes");
    }
  }

  async updateTakeLane(
    laneId: string,
    updates: Partial<TakeLane>,
  ): Promise<TakeLane> {
    try {
      const [updated] = await db
        .update(takeLanes)
        .set({ ...updates, updatedAt: new Date() } as any)
        .where(eq(takeLanes.id, laneId))
        .returning();

      if (!updated) {
        throw new Error("Take lane not found");
      }

      return updated;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating take lane:");
      throw new Error("Failed to update take lane");
    }
  }

  async deleteTakeLane(laneId: string): Promise<void> {
    try {
      const lane = await this.getTakeLane(laneId);
      if (!lane) {
        throw new Error("Take lane not found");
      }

      await db.delete(takeLanes).where(eq(takeLanes.id, laneId));

      const remainingLanes = await this.getGroupLanes(lane?.takeGroupId);
      await db
        .update(takeGroups)
        .set({
          takeCount: remainingLanes.length,
          updatedAt: new Date(),
        })
        .where(eq(takeGroups.id, lane?.takeGroupId));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting take lane:");
      throw new Error("Failed to delete take lane");
    }
  }

  async reorderLanes(_groupId: string, laneIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < laneIds?.length; i++) {
        await db
          .update(takeLanes)
          .set({ laneIndex: i, updatedAt: new Date() } as any)
          .where(eq(takeLanes.id, laneIds[i]));
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error reordering lanes:");
      throw new Error("Failed to reorder lanes");
    }
  }

  async createTakeSegment(data: InsertTakeSegment): Promise<TakeSegment> {
    try {
      const existingSegments = await this.getGroupSegments((data as any)?.takeGroupId);
      const nextOrder = existingSegments?.length;

      const [segment] = await db
        .insert(takeSegments)
        .values({
          ...data,
          id: `ts_${randomBytes(8).toString("hex")}`,
          order: data.order ?? nextOrder,
        } as any)
        .returning();

      return segment;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating take segment:");
      throw new Error("Failed to create take segment");
    }
  }

  async getTakeSegment(segmentId: string): Promise<TakeSegment | undefined> {
    try {
      const result = await db.query.takeSegments.findFirst({
        where: eq(takeSegments.id, segmentId),
      });
      return result;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching take segment:");
      throw new Error("Failed to fetch take segment");
    }
  }

  async getGroupSegments(groupId: string): Promise<TakeSegment[]> {
    try {
      const results = await db.query.takeSegments.findMany({
        where: eq((takeSegments as any)?.takeGroupId, groupId),
        orderBy: [asc(takeSegments.order), asc(takeSegments.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching group segments:");
      throw new Error("Failed to fetch group segments");
    }
  }

  async getLaneSegments(laneId: string): Promise<TakeSegment[]> {
    try {
      const results = await db.query.takeSegments.findMany({
        where: eq(takeSegments.takeLaneId, laneId),
        orderBy: [asc(takeSegments.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching lane segments:");
      throw new Error("Failed to fetch lane segments");
    }
  }

  async updateTakeSegment(
    segmentId: string,
    updates: Partial<TakeSegment>,
  ): Promise<TakeSegment> {
    try {
      const [updated] = await db
        .update(takeSegments)
        .set({ ...updates, updatedAt: new Date() } as any)
        .where(eq(takeSegments.id, segmentId))
        .returning();

      if (!updated) {
        throw new Error("Take segment not found");
      }

      return updated;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating take segment:");
      throw new Error("Failed to update take segment");
    }
  }

  async deleteTakeSegment(segmentId: string): Promise<void> {
    try {
      await db.delete(takeSegments).where(eq(takeSegments.id, segmentId));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting take segment:");
      throw new Error("Failed to delete take segment");
    }
  }

  async selectSegmentFromLane(
    groupId: string,
    laneId: string,
    startTime: number,
    endTime: number,
    compVersionId?: string,
  ): Promise<TakeSegment> {
    try {
      await db
        .delete(takeSegments)
        .where(
          and(
            eq((takeSegments as any)?.takeGroupId, groupId),
            eq((takeSegments as any)?.isSelected, true),
          ),
        );

      const segment = await this.createTakeSegment({
        takeGroupId: groupId,
        takeLaneId: laneId,
        compVersionId,
        startTime,
        endTime,
        isSelected: true,
      } as any);

      return segment;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error selecting segment from lane:");
      throw new Error("Failed to select segment from lane");
    }
  }

  async createCompVersion(
    groupId: string,
    data: {
      name: string;
      versionNumber?: number;
      description?: string;
      createdBy?: string;
    },
  ): Promise<CompVersion> {
    try {
      const existingVersions = await this.getCompVersions(groupId);
      const nextVersionNumber =
        data?.versionNumber ?? existingVersions?.length + 1;

      const segments = await this.getGroupSegments(groupId);

      const [version] = await db
        .insert(compVersions)
        .values({
          id: `cv_${randomBytes(8).toString("hex")}`,
          takeGroupId: groupId,
          name: data.name,
          versionNumber: nextVersionNumber,
          description: data.description,
          createdBy: data.createdBy,
          segmentData: segments,
          isActive: false,
        } as any)
        .returning();

      return version;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating comp version:");
      throw new Error("Failed to create comp version");
    }
  }

  async getCompVersion(versionId: string): Promise<CompVersion | undefined> {
    try {
      const result = await db.query.compVersions.findFirst({
        where: eq(compVersions.id, versionId),
      });
      return result;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching comp version:");
      throw new Error("Failed to fetch comp version");
    }
  }

  async getCompVersions(groupId: string): Promise<CompVersion[]> {
    try {
      const results = await db.query.compVersions.findMany({
        where: eq((compVersions as any)?.takeGroupId, groupId),
        orderBy: [desc((compVersions as any)?.versionNumber)],
      });
      return results;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching comp versions:");
      throw new Error("Failed to fetch comp versions");
    }
  }

  async setActiveCompVersion(
    groupId: string,
    versionId: string,
  ): Promise<void> {
    try {
      await db
        .update(compVersions)
        .set({ isActive: false })
        .where(eq((compVersions as any)?.takeGroupId, groupId));

      await db
        .update(compVersions)
        .set({ isActive: true })
        .where(eq(compVersions.id, versionId));

      await db
        .update(takeGroups)
        .set({
          activeCompVersionId: versionId,
          updatedAt: new Date(),
        })
        .where(eq(takeGroups.id, groupId));

      const version = await this.getCompVersion(versionId);
      if ((version as any)?.segmentData) {
        await db
          .delete(takeSegments)
          .where(eq((takeSegments as any)?.takeGroupId, groupId));

        const segments = (version as any)?.segmentData as TakeSegment[];
        for (const segment of segments) {
          await this.createTakeSegment({
            takeGroupId: groupId,
            takeLaneId: segment.takeLaneId,
            compVersionId: versionId,
            startTime: segment.startTime,
            endTime: segment.endTime,
            fadeIn: segment.fadeIn,
            fadeOut: segment.fadeOut,
            crossfadeType: (segment as any).crossfadeType,
            gain: (segment as any).gain,
            isSelected: (segment as any).isSelected,
            order: segment.order,
          });
        }
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error setting active comp version:");
      throw new Error("Failed to set active comp version");
    }
  }

  async deleteCompVersion(versionId: string): Promise<void> {
    try {
      const version = await this.getCompVersion(versionId);
      if (!version) {
        throw new Error("Comp version not found");
      }

      if (version?.isActive) {
        throw new Error("Cannot delete active comp version");
      }

      await db.delete(compVersions).where(eq(compVersions.id, versionId));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting comp version:");
      throw new Error("Failed to delete comp version");
    }
  }

  async renderComp(groupId: string, _userId: string): Promise<CompRenderResult> {
    try {
      const takeGroup = await this.getTakeGroup(groupId);
      if (!takeGroup) {
        throw new Error("Take group not found");
      }

      const segments = await this.getGroupSegments(groupId);
      const selectedSegments = segments?.filter((s) => (s as any)?.isSelected);

      if (selectedSegments?.length === 0) {
        throw new Error("No segments selected for rendering");
      }

      const clipId = `comp_${randomBytes(8).toString("hex")}`;
      const filePath = `/uploads/audio/comps/${clipId}.wav`;

      const [newClip] = await db
        .insert(audioClips)
        .values({
          id: clipId,
          trackId: takeGroup.trackId,
          name: `${takeGroup?.name} (Comp)`,
          filePath,
          duration: (takeGroup as any).endTime - (takeGroup as any)?.startTime,
          startTime: (takeGroup as any).startTime,
          endTime: (takeGroup as any).endTime,
          isComped: true,
          compSourceIds: selectedSegments.map((s) => s?.id),
        } as any)
        .returning();

      await this.updateTakeGroup(groupId, { status: "rendered" } as any);

      if ((takeGroup as any)?.activeCompVersionId) {
        await db
          .update(compVersions)
          .set({ renderedClipId: clipId } as any)
          .where(eq(compVersions.id, (takeGroup as any)?.activeCompVersionId));
      }

      return {
        clipId: newClip.id,
        filePath: (newClip as any).filePath,
        duration: newClip.duration,
        status: "completed",
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error rendering comp:");
      throw new Error("Failed to render comp");
    }
  }

  async duplicateTakeGroup(groupId: string): Promise<TakeGroup> {
    try {
      const original = await this.getTakeGroupWithDetails(groupId);
      if (!original) {
        throw new Error("Take group not found");
      }

      const newGroup = await this.createTakeGroup({
        projectId: original.projectId,
        trackId: original.trackId,
        name: `${original?.name} (Copy)`,
        startTime: (original as any).startTime,
        endTime: (original as any).endTime,
        color: (original as any).color,
        metadata: (original as any).metadata,
      });

      for (const lane of original?.lanes ?? []) {
        const newLane = await this.createTakeLane({
          takeGroupId: newGroup.id,
          audioClipId: (lane as any).audioClipId,
          name: lane.name,
          laneIndex: (lane as any).laneIndex,
          volume: (lane as any).volume,
          color: (lane as any).color,
          rating: (lane as any).rating,
          notes: (lane as any).notes,
        });

        for (const segment of lane?.segments ?? []) {
          await this.createTakeSegment({
            takeGroupId: newGroup.id,
            takeLaneId: newLane.id,
            startTime: segment.startTime,
            endTime: segment.endTime,
            fadeIn: segment.fadeIn,
            fadeOut: segment.fadeOut,
            crossfadeType: (segment as any).crossfadeType,
            gain: (segment as any).gain,
            isSelected: (segment as any).isSelected,
            order: segment.order,
          });
        }
      }

      return newGroup;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error duplicating take group:");
      throw new Error("Failed to duplicate take group");
    }
  }

  async getCompHistory(groupId: string): Promise<{
    versions: CompVersion[];
    activeVersion: CompVersion | undefined;
    totalVersions: number;
  }> {
    try {
      const versions = await this.getCompVersions(groupId);
      const activeVersion = versions?.find((v) => v?.isActive);

      return {
        versions,
        activeVersion,
        totalVersions: versions.length,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error getting comp history:");
      throw new Error("Failed to get comp history");
    }
  }
}

export const compingService = new CompingService();

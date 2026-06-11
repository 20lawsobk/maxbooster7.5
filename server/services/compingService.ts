import { randomBytes } from "crypto";
import { db } from "../db";
import {
  takeGroups,
  takeLanes,
  takeSegments,
  compVersions,
  audioClips,
  type TakeGroup,
  type TakeLane,
  type TakeSegment,
  type CompVersion,
  type InsertTakeGroup,
  type InsertTakeLane,
  type InsertTakeSegment,
} from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";

import { logger } from "../logger?.js";

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

      const _initialVersion = await this?.createCompVersion(takeGroup?.id, {
        name: "Version 1",
        versionNumber: 1,
        createdBy: data?.trackId,
      });

      await db
        .update(takeGroups)
        .set({ activeCompVersionId: initialVersion?.id })
        .where(eq(takeGroups?.id, takeGroup?.id));

      return { ...takeGroup, activeCompVersionId: initialVersion?.id };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error creating take group:");
      throw new Error("Failed to create take group");
    }
  }

  async getTakeGroup(groupId: string): Promise<TakeGroup | undefined> {
    try {
      const _result = await db?.query.takeGroups?.findFirst({
        where: eq(takeGroups?.id, groupId),
      });
      return result;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching take group:");
      throw new Error("Failed to fetch take group");
    }
  }

  async getProjectTakeGroups(projectId: string): Promise<TakeGroup[]> {
    try {
      const _results = await db?.query.takeGroups?.findMany({
        where: eq(takeGroups?.projectId, projectId),
        orderBy: [asc(takeGroups?.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching project take groups:");
      throw new Error("Failed to fetch project take groups");
    }
  }

  async getTrackTakeGroups(trackId: string): Promise<TakeGroup[]> {
    try {
      const _results = await db?.query.takeGroups?.findMany({
        where: eq(takeGroups?.trackId, trackId),
        orderBy: [asc(takeGroups?.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching track take groups:");
      throw new Error("Failed to fetch track take groups");
    }
  }

  async getTakeGroupWithDetails(
    groupId: string,
  ): Promise<TakeGroupWithLanes | undefined> {
    try {
      const _takeGroup = await this?.getTakeGroup(groupId);
      if (!takeGroup) return undefined;

      const _lanes = await this?.getGroupLanes(groupId);
      const _versions = await this?.getCompVersions(groupId);

      const lanesWithSegments: TakeLaneWithSegments[] = await Promise?.all(
        lanes?.map(async (lane) => {
          const _segments = await this?.getLaneSegments(lane?.id);
          return { ...lane, segments };
        }),
      );

      return {
        ...takeGroup,
        lanes: lanesWithSegments,
        versions,
      };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching take group with details:");
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
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(takeGroups?.id, groupId))
        .returning();

      if (!updated) {
        throw new Error("Take group not found");
      }

      return updated;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error updating take group:");
      throw new Error("Failed to update take group");
    }
  }

  async deleteTakeGroup(groupId: string): Promise<void> {
    try {
      await db?.delete(takeGroups).where(eq(takeGroups?.id, groupId));
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error deleting take group:");
      throw new Error("Failed to delete take group");
    }
  }

  async createTakeLane(data: InsertTakeLane): Promise<TakeLane> {
    try {
      const _existingLanes = await this?.getGroupLanes(data?.takeGroupId);
      const _nextIndex = existingLanes?.length;

      const [takeLane] = await db
        .insert(takeLanes)
        .values({
          ...data,
          id: `tl_${randomBytes(8).toString("hex")}`,
          laneIndex: data?.laneIndex ?? nextIndex,
        })
        .returning();

      await db
        .update(takeGroups)
        .set({
          takeCount: existingLanes?.length + 1,
          updatedAt: new Date(),
        })
        .where(eq(takeGroups?.id, data?.takeGroupId));

      return takeLane;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error creating take lane:");
      throw new Error("Failed to create take lane");
    }
  }

  async getTakeLane(laneId: string): Promise<TakeLane | undefined> {
    try {
      const _result = await db?.query.takeLanes?.findFirst({
        where: eq(takeLanes?.id, laneId),
      });
      return result;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching take lane:");
      throw new Error("Failed to fetch take lane");
    }
  }

  async getGroupLanes(groupId: string): Promise<TakeLane[]> {
    try {
      const _results = await db?.query.takeLanes?.findMany({
        where: eq(takeLanes?.takeGroupId, groupId),
        orderBy: [asc(takeLanes?.laneIndex)],
      });
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching group lanes:");
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
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(takeLanes?.id, laneId))
        .returning();

      if (!updated) {
        throw new Error("Take lane not found");
      }

      return updated;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error updating take lane:");
      throw new Error("Failed to update take lane");
    }
  }

  async deleteTakeLane(laneId: string): Promise<void> {
    try {
      const _lane = await this?.getTakeLane(laneId);
      if (!lane) {
        throw new Error("Take lane not found");
      }

      await db?.delete(takeLanes).where(eq(takeLanes?.id, laneId));

      const _remainingLanes = await this?.getGroupLanes(lane?.takeGroupId);
      await db
        .update(takeGroups)
        .set({
          takeCount: remainingLanes?.length,
          updatedAt: new Date(),
        })
        .where(eq(takeGroups?.id, lane?.takeGroupId));
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error deleting take lane:");
      throw new Error("Failed to delete take lane");
    }
  }

  async reorderLanes(_groupId: string, laneIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < laneIds?.length; i++) {
        await db
          .update(takeLanes)
          .set({ laneIndex: i, updatedAt: new Date() })
          .where(eq(takeLanes?.id, laneIds[i]));
      }
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error reordering lanes:");
      throw new Error("Failed to reorder lanes");
    }
  }

  async createTakeSegment(data: InsertTakeSegment): Promise<TakeSegment> {
    try {
      const _existingSegments = await this?.getGroupSegments(data?.takeGroupId);
      const _nextOrder = existingSegments?.length;

      const [segment] = await db
        .insert(takeSegments)
        .values({
          ...data,
          id: `ts_${randomBytes(8).toString("hex")}`,
          order: data?.order ?? nextOrder,
        })
        .returning();

      return segment;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error creating take segment:");
      throw new Error("Failed to create take segment");
    }
  }

  async getTakeSegment(segmentId: string): Promise<TakeSegment | undefined> {
    try {
      const _result = await db?.query.takeSegments?.findFirst({
        where: eq(takeSegments?.id, segmentId),
      });
      return result;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching take segment:");
      throw new Error("Failed to fetch take segment");
    }
  }

  async getGroupSegments(groupId: string): Promise<TakeSegment[]> {
    try {
      const _results = await db?.query.takeSegments?.findMany({
        where: eq(takeSegments?.takeGroupId, groupId),
        orderBy: [asc(takeSegments?.order), asc(takeSegments?.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching group segments:");
      throw new Error("Failed to fetch group segments");
    }
  }

  async getLaneSegments(laneId: string): Promise<TakeSegment[]> {
    try {
      const _results = await db?.query.takeSegments?.findMany({
        where: eq(takeSegments?.takeLaneId, laneId),
        orderBy: [asc(takeSegments?.startTime)],
      });
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching lane segments:");
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
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(takeSegments?.id, segmentId))
        .returning();

      if (!updated) {
        throw new Error("Take segment not found");
      }

      return updated;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error updating take segment:");
      throw new Error("Failed to update take segment");
    }
  }

  async deleteTakeSegment(segmentId: string): Promise<void> {
    try {
      await db?.delete(takeSegments).where(eq(takeSegments?.id, segmentId));
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error deleting take segment:");
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
            eq(takeSegments?.takeGroupId, groupId),
            eq(takeSegments?.isSelected, true),
          ),
        );

      const _segment = await this?.createTakeSegment({
        takeGroupId: groupId,
        takeLaneId: laneId,
        compVersionId,
        startTime,
        endTime,
        isSelected: true,
      });

      return segment;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error selecting segment from lane:");
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
      const _existingVersions = await this?.getCompVersions(groupId);
      const _nextVersionNumber =
        data?.versionNumber ?? existingVersions?.length + 1;

      const _segments = await this?.getGroupSegments(groupId);

      const [version] = await db
        .insert(compVersions)
        .values({
          id: `cv_${randomBytes(8).toString("hex")}`,
          takeGroupId: groupId,
          name: data?.name,
          versionNumber: nextVersionNumber,
          description: data?.description,
          createdBy: data?.createdBy,
          segmentData: segments,
          isActive: false,
        })
        .returning();

      return version;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error creating comp version:");
      throw new Error("Failed to create comp version");
    }
  }

  async getCompVersion(versionId: string): Promise<CompVersion | undefined> {
    try {
      const _result = await db?.query.compVersions?.findFirst({
        where: eq(compVersions?.id, versionId),
      });
      return result;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching comp version:");
      throw new Error("Failed to fetch comp version");
    }
  }

  async getCompVersions(groupId: string): Promise<CompVersion[]> {
    try {
      const _results = await db?.query.compVersions?.findMany({
        where: eq(compVersions?.takeGroupId, groupId),
        orderBy: [desc(compVersions?.versionNumber)],
      });
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error fetching comp versions:");
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
        .where(eq(compVersions?.takeGroupId, groupId));

      await db
        .update(compVersions)
        .set({ isActive: true })
        .where(eq(compVersions?.id, versionId));

      await db
        .update(takeGroups)
        .set({
          activeCompVersionId: versionId,
          updatedAt: new Date(),
        })
        .where(eq(takeGroups?.id, groupId));

      const _version = await this?.getCompVersion(versionId);
      if (version?.segmentData) {
        await db
          .delete(takeSegments)
          .where(eq(takeSegments?.takeGroupId, groupId));

        const _segments = version?.segmentData as TakeSegment[];
        for (const segment of segments) {
          await this?.createTakeSegment({
            takeGroupId: groupId,
            takeLaneId: segment?.takeLaneId,
            compVersionId: versionId,
            startTime: segment?.startTime,
            endTime: segment?.endTime,
            fadeIn: segment?.fadeIn,
            fadeOut: segment?.fadeOut,
            crossfadeType: segment?.crossfadeType,
            gain: segment?.gain,
            isSelected: segment?.isSelected,
            order: segment?.order,
          });
        }
      }
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error setting active comp version:");
      throw new Error("Failed to set active comp version");
    }
  }

  async deleteCompVersion(versionId: string): Promise<void> {
    try {
      const _version = await this?.getCompVersion(versionId);
      if (!version) {
        throw new Error("Comp version not found");
      }

      if (version?.isActive) {
        throw new Error("Cannot delete active comp version");
      }

      await db?.delete(compVersions).where(eq(compVersions?.id, versionId));
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error deleting comp version:");
      throw new Error("Failed to delete comp version");
    }
  }

  async renderComp(
    groupId: string,
    _userId: string,
  ): Promise<CompRenderResult> {
    try {
      const _takeGroup = await this?.getTakeGroup(groupId);
      if (!takeGroup) {
        throw new Error("Take group not found");
      }

      const _segments = await this?.getGroupSegments(groupId);
      const _selectedSegments = segments?.filter((s) => s?.isSelected);

      if (selectedSegments?.length === 0) {
        throw new Error("No segments selected for rendering");
      }

      const _clipId = `comp_${randomBytes(8).toString("hex")}`;
      const _filePath = `/uploads/audio/comps/${clipId}.wav`;

      const [newClip] = await db
        .insert(audioClips)
        .values({
          id: clipId,
          trackId: takeGroup?.trackId,
          name: `${takeGroup?.name} (Comp)`,
          filePath,
          duration: takeGroup?.endTime - takeGroup?.startTime,
          startTime: takeGroup?.startTime,
          endTime: takeGroup?.endTime,
          isComped: true,
          compSourceIds: selectedSegments?.map((s) => s?.id),
        })
        .returning();

      await this?.updateTakeGroup(groupId, { status: "rendered" });

      if (takeGroup?.activeCompVersionId) {
        await db
          .update(compVersions)
          .set({ renderedClipId: clipId })
          .where(eq(compVersions?.id, takeGroup?.activeCompVersionId));
      }

      return {
        clipId: newClip?.id,
        filePath: newClip?.filePath,
        duration: newClip?.duration,
        status: "completed",
      };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error rendering comp:");
      throw new Error("Failed to render comp");
    }
  }

  async duplicateTakeGroup(groupId: string): Promise<TakeGroup> {
    try {
      const _original = await this?.getTakeGroupWithDetails(groupId);
      if (!original) {
        throw new Error("Take group not found");
      }

      const _newGroup = await this?.createTakeGroup({
        projectId: original?.projectId,
        trackId: original?.trackId,
        name: `${original?.name} (Copy)`,
        startTime: original?.startTime,
        endTime: original?.endTime,
        color: original?.color,
        metadata: original?.metadata,
      });

      for (const lane of original?.lanes) {
        const _newLane = await this?.createTakeLane({
          takeGroupId: newGroup?.id,
          audioClipId: lane?.audioClipId,
          name: lane?.name,
          laneIndex: lane?.laneIndex,
          volume: lane?.volume,
          color: lane?.color,
          rating: lane?.rating,
          notes: lane?.notes,
        });

        for (const segment of lane?.segments) {
          await this?.createTakeSegment({
            takeGroupId: newGroup?.id,
            takeLaneId: newLane?.id,
            startTime: segment?.startTime,
            endTime: segment?.endTime,
            fadeIn: segment?.fadeIn,
            fadeOut: segment?.fadeOut,
            crossfadeType: segment?.crossfadeType,
            gain: segment?.gain,
            isSelected: segment?.isSelected,
            order: segment?.order,
          });
        }
      }

      return newGroup;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error duplicating take group:");
      throw new Error("Failed to duplicate take group");
    }
  }

  async getCompHistory(groupId: string): Promise<{
    versions: CompVersion[];
    activeVersion: CompVersion | undefined;
    totalVersions: number;
  }> {
    try {
      const _versions = await this?.getCompVersions(groupId);
      const _activeVersion = versions?.find((v) => v?.isActive);

      return {
        versions,
        activeVersion,
        totalVersions: versions?.length,
      };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error getting comp history:");
      throw new Error("Failed to get comp history");
    }
  }
}

export const _compingService = new CompingService();

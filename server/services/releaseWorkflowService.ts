// @ts-nocheck
import { db } from "../db";
import {
  releases,
  users,
  releaseWorkflowRequests,
  releaseVersionHistory,
  releaseScheduledActions,
} from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { logger } from "../logger.js";

export type ReleaseStatus =
  | "draft"
  | "pending_review"
  | "in_review"
  | "approved"
  | "rejected"
  | "scheduled"
  | "processing"
  | "live"
  | "update_requested"
  | "update_pending"
  | "takedown_requested"
  | "taken_down"
  | "reinstated"
  | "archived";

export type RequestType =
  | "submit_for_review"
  | "approve"
  | "reject"
  | "schedule"
  | "publish"
  | "request_update"
  | "apply_update"
  | "request_takedown"
  | "confirm_takedown"
  | "request_reinstatement"
  | "confirm_reinstatement"
  | "archive";

export interface WorkflowTransitionResult {
  success: boolean;
  previousStatus: ReleaseStatus;
  newStatus: ReleaseStatus;
  requestId?: string;
  error?: string;
  statusCode?: number;
}

export interface TakedownRequest {
  releaseId: string;
  userId: string;
  reason: string;
  platforms?: string[];
  effectiveDate?: Date;
}

export interface UpdateRequest {
  releaseId: string;
  userId: string;
  changes: {
    field: string;
    oldValue: Record<string, unknown>;
    newValue: Record<string, unknown>;
  }[];
  reason?: string;
}

const VALID_TRANSITIONS: Record<ReleaseStatus, ReleaseStatus[]> = {
  draft: ["pending_review", "archived"],
  pending_review: ["in_review", "draft", "archived"],
  in_review: ["approved", "rejected"],
  approved: ["scheduled", "processing"],
  rejected: ["draft", "archived"],
  scheduled: ["processing", "draft"],
  processing: ["live", "rejected"],
  live: ["update_requested", "takedown_requested"],
  update_requested: ["update_pending", "live"],
  update_pending: ["live"],
  takedown_requested: ["taken_down", "live"],
  taken_down: ["reinstated", "archived"],
  reinstated: ["live", "takedown_requested"],
  archived: [],
};

class ReleaseWorkflowService {
  private async accessibleRelease(releaseId: string, userId: string, connection = db, lock = false) {
    if (!userId) return null;
    const ownedQuery = connection.select().from(releases)
      .where(and(eq(releases.id, releaseId), eq(releases.userId, userId))).limit(1);
    const [owned] = await (lock ? ownedQuery.for("update") : ownedQuery);
    if (owned && owned.userId === userId) return owned;
    // Administrative authority comes from the stored actor, never request metadata.
    const [actor] = await connection.select({ role: users.role }).from(users)
      .where(eq(users.id, userId)).limit(1);
    if (actor?.role !== "admin") return null;
    const releaseQuery = connection.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
    const [release] = await (lock ? releaseQuery.for("update") : releaseQuery);
    return release ?? null;
  }

  canTransition(
    currentStatus: ReleaseStatus,
    targetStatus: ReleaseStatus,
  ): boolean {
    const validTransitions = VALID_TRANSITIONS[currentStatus];
    return validTransitions?.includes(targetStatus) ?? false;
  }

  getValidTransitions(currentStatus: ReleaseStatus): ReleaseStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  async transition(
    releaseId: string,
    userId: string,
    targetStatus: ReleaseStatus,
    requestType: RequestType,
    options?: {
      reason?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<WorkflowTransitionResult> {
    try {
      return await db.transaction(async connection => {
        const accessible = await this.accessibleRelease(releaseId, userId, connection, true);
        const release = accessible ? [accessible] : [];

        if (release?.length === 0) {
          return {
            success: false,
            previousStatus: "draft",
            newStatus: "draft",
            error: "Release not found or access denied",
            statusCode: 404,
          };
        }

        const currentStatus = (release[0].status || "draft") as ReleaseStatus;

        if (!this.canTransition(currentStatus, targetStatus)) {
          return {
            success: false,
            previousStatus: currentStatus,
            newStatus: currentStatus,
            error: `Cannot transition from ${currentStatus} to ${targetStatus}`,
            statusCode: 409,
          };
        }

        // The locked release serializes history versions. State, request and
        // version history commit together, or all roll back on an audit failure.
        // Apply the actual status change and verify it matched a real row
        // BEFORE recording the request/version-history as completed. Only
        // checking the earlier SELECT is not enough: the release could be
        // deleted (or otherwise stop matching) in the gap between that read
        // and this write, and an UPDATE whose WHERE clause matches zero rows
        // still resolves without error — silently telling the caller a
        // transition happened when the releases row was never touched.
        const updatedRelease = await connection
          .update(releases)
          .set({ status: targetStatus })
          .where(and(eq(releases.id, releaseId), eq(releases.userId, release[0].userId), release[0].status === null ? isNull(releases.status) : eq(releases.status, currentStatus)))
          .returning({ id: releases.id });

        if (updatedRelease?.length === 0) {
          return {
            success: false,
            previousStatus: currentStatus,
            newStatus: currentStatus,
            error:
              "Release not found or was removed before the update could be applied",
          };
        }

        const [request] = await connection
          .insert(releaseWorkflowRequests)
          .values({
            releaseId,
            requestedBy: userId,
            requestType,
            metadata: { ...options?.metadata, previousStatus: currentStatus,
              newStatus: targetStatus, reason: options?.reason },
            status: "completed",
            processedBy: userId,
            processedAt: new Date(),
          })
          .returning();

        await this.createVersionHistoryEntry(
          releaseId,
          userId,
          "status_change",
          { status: currentStatus },
          { status: targetStatus },
          options?.reason,
          connection,
        );

        logger.info(
          `Release ${releaseId} transitioned from ${currentStatus} to ${targetStatus}`,
        );

        return {
          success: true,
          previousStatus: currentStatus,
          newStatus: targetStatus,
          requestId: request.id,
        };
      });
    } catch (error) {
      logger.warn({ err: error }, "Error transitioning release:");
      return {
        success: false,
        previousStatus: "draft",
        newStatus: "draft",
        error: error instanceof Error ? error?.message : "Unknown error",
      };
    }
  }

  async submitForReview(
    releaseId: string,
    userId: string,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(
      releaseId,
      userId,
      "pending_review",
      "submit_for_review",
    );
  }

  async approve(
    releaseId: string,
    reviewerId: string,
    notes?: string,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, reviewerId, "approved", "approve", {
      reason: notes,
      metadata: { approvedAt: new Date() },
    });
  }

  async reject(
    releaseId: string,
    reviewerId: string,
    reason: string,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, reviewerId, "rejected", "reject", {
      reason,
      metadata: { rejectedAt: new Date() },
    });
  }

  async schedule(
    releaseId: string,
    userId: string,
    scheduledDate: Date,
  ): Promise<WorkflowTransitionResult> {
    const result = await this.transition(
      releaseId,
      userId,
      "scheduled",
      "schedule",
      {
        metadata: { scheduledFor: scheduledDate },
      },
    );

    if (result?.success) {
      await db.insert(releaseScheduledActions).values({
        releaseId,
        actionType: "publish",
        scheduledFor: scheduledDate,
        status: "pending",
      });
    }

    return result;
  }

  async publish(
    releaseId: string,
    userId: string,
  ): Promise<WorkflowTransitionResult> {
    const processingResult = await this.transition(
      releaseId,
      userId,
      "processing",
      "publish",
    );

    if (!processingResult?.success) {
      return processingResult;
    }

    return this.transition(releaseId, userId, "live", "publish", {
      metadata: { publishedAt: new Date() },
    });
  }

  async requestTakedown(
    request: TakedownRequest,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(
      request?.releaseId,
      request?.userId,
      "takedown_requested",
      "request_takedown",
      {
        reason: request.reason,
        metadata: {
          platforms: request.platforms,
          effectiveDate: request.effectiveDate,
          requestedAt: new Date(),
        },
      },
    );
  }

  async confirmTakedown(
    releaseId: string,
    adminId: string,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(
      releaseId,
      adminId,
      "taken_down",
      "confirm_takedown",
      {
        metadata: { takenDownAt: new Date() },
      },
    );
  }

  async requestUpdate(
    request: UpdateRequest,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(
      request?.releaseId,
      request?.userId,
      "update_requested",
      "request_update",
      {
        reason: request.reason,
        metadata: {
          changes: request.changes,
          requestedAt: new Date(),
        },
      },
    );
  }

  async applyUpdate(
    releaseId: string,
    userId: string,
  ): Promise<WorkflowTransitionResult> {
    const pendingResult = await this.transition(
      releaseId,
      userId,
      "update_pending",
      "apply_update",
    );

    if (!pendingResult?.success) {
      return pendingResult;
    }

    return this.transition(releaseId, userId, "live", "apply_update", {
      metadata: { updatedAt: new Date() },
    });
  }

  async requestReinstatement(
    releaseId: string,
    userId: string,
    reason: string,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(
      releaseId,
      userId,
      "reinstated",
      "request_reinstatement",
      {
        reason,
        metadata: { reinstatedAt: new Date() },
      },
    );
  }

  async archive(
    releaseId: string,
    userId: string,
    reason?: string,
  ): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, userId, "archived", "archive", {
      reason,
    });
  }

  async getWorkflowHistory(releaseId: string, userId: string): Promise<any[]> {
    if (!await this.accessibleRelease(releaseId, userId)) return [];
    const requests = await db
      .select()
      .from(releaseWorkflowRequests)
      .where(eq(releaseWorkflowRequests.releaseId, releaseId))
      .orderBy(desc(releaseWorkflowRequests.createdAt))
      .limit(100);

    return requests;
  }

  async getVersionHistory(releaseId: string, userId: string): Promise<any[]> {
    if (!await this.accessibleRelease(releaseId, userId)) return [];
    const versions = await db
      .select()
      .from(releaseVersionHistory)
      .where(eq(releaseVersionHistory.releaseId, releaseId))
      .orderBy(desc(releaseVersionHistory.version))
      .limit(50);

    return versions;
  }

  async getPendingRequests(userId: string): Promise<any[]> {
    if (!userId) return [];
    const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    const baseQuery = db
      .select()
      .from(releaseWorkflowRequests)
      .where(actor?.role === "admin" ? eq(releaseWorkflowRequests.status, "pending") : and(eq(releaseWorkflowRequests.status, "pending"), eq(releaseWorkflowRequests.requestedBy, userId)))
      .orderBy(desc(releaseWorkflowRequests.createdAt))
      .limit(100);

    return baseQuery;
  }

  private async createVersionHistoryEntry(
    releaseId: string,
    changedBy: string,
    changeType: string,
    previousData: Record<string, unknown>,
    newData: Record<string, unknown>,
    changeReason?: string,
    connection = db,
  ): Promise<void> {
    const latestVersion = await connection
      .select()
      .from(releaseVersionHistory)
      .where(eq(releaseVersionHistory.releaseId, releaseId))
      .orderBy(desc(releaseVersionHistory.version))
      .limit(1);

    const nextVersion = (latestVersion[0]?.version || 0) + 1;

    await connection.insert(releaseVersionHistory).values({
      releaseId,
      version: nextVersion,
      changeType,
      changedBy,
      previousData,
      changes: { newData, reason: changeReason },
    });
  }

  async updateMetadata(
    releaseId: string,
    userId: string,
    changes: Record<string, any>,
    reason?: string,
  ): Promise<{ success: boolean; version: number; error?: string }> {
    try {
      const allowed = new Set(["title", "releaseDate", "artworkUrl", "metadata"]);
      if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
          Object.keys(changes).some(key => !allowed.has(key))) {
        return { success: false, version: 0, error: "Unsupported or immutable release field" };
      }
      return await db.transaction(async connection => {
        const accessible = await this.accessibleRelease(releaseId, userId, connection, true);
        const release = accessible ? [accessible] : [];

        if (release?.length === 0) {
          return { success: false, version: 0, error: "Release not found" };
        }

        const previousData = {
          title: release[0].title,
          artist: (release[0] as any).artist,
          metadata: release[0].metadata,
        };

        const updatedRelease = await connection
          .update(releases)
          .set(changes)
          .where(and(eq(releases.id, releaseId), eq(releases.userId, release[0].userId)))
          .returning({ id: releases.id });

        if (updatedRelease?.length === 0) {
          return {
            success: false,
            version: 0,
            error:
              "Release not found or was removed before the update could be applied",
          };
        }

        await this.createVersionHistoryEntry(
          releaseId,
          userId,
          "metadata_update",
          previousData,
          changes,
          reason,
          connection,
        );

        const latestVersion = await connection
          .select()
          .from(releaseVersionHistory)
          .where(eq(releaseVersionHistory.releaseId, releaseId))
          .orderBy(desc(releaseVersionHistory.version))
          .limit(1);

        return {
          success: true,
          version: latestVersion[0]?.version || 1,
        };
      });
    } catch (error) {
      logger.warn({ err: error }, "Error updating release metadata:");
      return {
        success: false,
        version: 0,
        error: error instanceof Error ? error?.message : "Unknown error",
      };
    }
  }

  getStatusDisplayName(status: ReleaseStatus): string {
    const displayNames: Record<ReleaseStatus, string> = {
      draft: "Draft",
      pending_review: "Pending Review",
      in_review: "In Review",
      approved: "Approved",
      rejected: "Rejected",
      scheduled: "Scheduled",
      processing: "Processing",
      live: "Live",
      update_requested: "Update Requested",
      update_pending: "Update Pending",
      takedown_requested: "Takedown Requested",
      taken_down: "Taken Down",
      reinstated: "Reinstated",
      archived: "Archived",
    };

    return displayNames[status] || status;
  }

  getStatusColor(status: ReleaseStatus): string {
    const colors: Record<ReleaseStatus, string> = {
      draft: "#6B7280",
      pending_review: "#F59E0B",
      in_review: "#3B82F6",
      approved: "#10B981",
      rejected: "#EF4444",
      scheduled: "#8B5CF6",
      processing: "#F97316",
      live: "#22C55E",
      update_requested: "#FBBF24",
      update_pending: "#FB923C",
      takedown_requested: "#F87171",
      taken_down: "#DC2626",
      reinstated: "#14B8A6",
      archived: "#9CA3AF",
    };

    return colors[status] || "#6B7280";
  }
}

export const releaseWorkflowService = new ReleaseWorkflowService();

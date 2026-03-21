import { db } from '../db';
import { 
  releases, 
  releaseWorkflowRequests, 
  releaseVersionHistory,
  releaseScheduledActions 
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../logger.js';

export type ReleaseStatus = 
  | 'draft'
  | 'pending_review'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'processing'
  | 'live'
  | 'update_requested'
  | 'update_pending'
  | 'takedown_requested'
  | 'taken_down'
  | 'reinstated'
  | 'archived';

export type RequestType = 
  | 'submit_for_review'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'publish'
  | 'request_update'
  | 'apply_update'
  | 'request_takedown'
  | 'confirm_takedown'
  | 'request_reinstatement'
  | 'confirm_reinstatement'
  | 'archive';

export interface WorkflowTransitionResult {
  success: boolean;
  previousStatus: ReleaseStatus;
  newStatus: ReleaseStatus;
  requestId?: string;
  error?: string;
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
    oldValue: any;
    newValue: any;
  }[];
  reason?: string;
}

const VALID_TRANSITIONS: Record<ReleaseStatus, ReleaseStatus[]> = {
  'draft': ['pending_review', 'archived'],
  'pending_review': ['in_review', 'draft', 'archived'],
  'in_review': ['approved', 'rejected'],
  'approved': ['scheduled', 'processing'],
  'rejected': ['draft', 'archived'],
  'scheduled': ['processing', 'draft'],
  'processing': ['live', 'rejected'],
  'live': ['update_requested', 'takedown_requested'],
  'update_requested': ['update_pending', 'live'],
  'update_pending': ['live'],
  'takedown_requested': ['taken_down', 'live'],
  'taken_down': ['reinstated', 'archived'],
  'reinstated': ['live', 'takedown_requested'],
  'archived': []
};

class ReleaseWorkflowService {
  canTransition(currentStatus: ReleaseStatus, targetStatus: ReleaseStatus): boolean {
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
    }
  ): Promise<WorkflowTransitionResult> {
    try {
      const release = await db.select()
        .from(releases)
        .where(eq(releases.id, releaseId))
        .limit(1);

      if (release.length === 0) {
        return {
          success: false,
          previousStatus: 'draft',
          newStatus: 'draft',
          error: 'Release not found'
        };
      }

      const currentStatus = (release[0].status || 'draft') as ReleaseStatus;

      if (!this.canTransition(currentStatus, targetStatus)) {
        return {
          success: false,
          previousStatus: currentStatus,
          newStatus: currentStatus,
          error: `Cannot transition from ${currentStatus} to ${targetStatus}`
        };
      }

      const [request] = await db.insert(releaseWorkflowRequests).values({
        releaseId,
        userId,
        requestType,
        previousStatus: currentStatus,
        newStatus: targetStatus,
        reason: options?.reason,
        metadata: options?.metadata,
        status: 'completed',
        processedBy: userId,
        processedAt: new Date()
      }).returning();

      await db.update(releases)
        .set({
          status: targetStatus,
          updatedAt: new Date()
        })
        .where(eq(releases.id, releaseId));

      await this.createVersionHistoryEntry(
        releaseId,
        userId,
        'status_change',
        { status: currentStatus },
        { status: targetStatus },
        options?.reason
      );

      logger.info(`Release ${releaseId} transitioned from ${currentStatus} to ${targetStatus}`);

      return {
        success: true,
        previousStatus: currentStatus,
        newStatus: targetStatus,
        requestId: request.id
      };
    } catch (error) {
      logger.error('Error transitioning release:', error);
      return {
        success: false,
        previousStatus: 'draft',
        newStatus: 'draft',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async submitForReview(releaseId: string, userId: string): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, userId, 'pending_review', 'submit_for_review');
  }

  async approve(releaseId: string, reviewerId: string, notes?: string): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, reviewerId, 'approved', 'approve', {
      reason: notes,
      metadata: { approvedAt: new Date() }
    });
  }

  async reject(releaseId: string, reviewerId: string, reason: string): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, reviewerId, 'rejected', 'reject', {
      reason,
      metadata: { rejectedAt: new Date() }
    });
  }

  async schedule(releaseId: string, userId: string, scheduledDate: Date): Promise<WorkflowTransitionResult> {
    const result = await this.transition(releaseId, userId, 'scheduled', 'schedule', {
      metadata: { scheduledFor: scheduledDate }
    });

    if (result.success) {
      await db.insert(releaseScheduledActions).values({
        releaseId,
        actionType: 'publish',
        scheduledFor: scheduledDate,
        status: 'pending'
      });
    }

    return result;
  }

  async publish(releaseId: string, userId: string): Promise<WorkflowTransitionResult> {
    const processingResult = await this.transition(releaseId, userId, 'processing', 'publish');
    
    if (!processingResult.success) {
      return processingResult;
    }

    return this.transition(releaseId, userId, 'live', 'publish', {
      metadata: { publishedAt: new Date() }
    });
  }

  async requestTakedown(request: TakedownRequest): Promise<WorkflowTransitionResult> {
    return this.transition(
      request.releaseId,
      request.userId,
      'takedown_requested',
      'request_takedown',
      {
        reason: request.reason,
        metadata: {
          platforms: request.platforms,
          effectiveDate: request.effectiveDate,
          requestedAt: new Date()
        }
      }
    );
  }

  async confirmTakedown(releaseId: string, adminId: string): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, adminId, 'taken_down', 'confirm_takedown', {
      metadata: { takenDownAt: new Date() }
    });
  }

  async requestUpdate(request: UpdateRequest): Promise<WorkflowTransitionResult> {
    return this.transition(
      request.releaseId,
      request.userId,
      'update_requested',
      'request_update',
      {
        reason: request.reason,
        metadata: {
          changes: request.changes,
          requestedAt: new Date()
        }
      }
    );
  }

  async applyUpdate(releaseId: string, userId: string): Promise<WorkflowTransitionResult> {
    const pendingResult = await this.transition(releaseId, userId, 'update_pending', 'apply_update');
    
    if (!pendingResult.success) {
      return pendingResult;
    }

    return this.transition(releaseId, userId, 'live', 'apply_update', {
      metadata: { updatedAt: new Date() }
    });
  }

  async requestReinstatement(releaseId: string, userId: string, reason: string): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, userId, 'reinstated', 'request_reinstatement', {
      reason,
      metadata: { reinstatedAt: new Date() }
    });
  }

  async archive(releaseId: string, userId: string, reason?: string): Promise<WorkflowTransitionResult> {
    return this.transition(releaseId, userId, 'archived', 'archive', { reason });
  }

  async getWorkflowHistory(releaseId: string): Promise<any[]> {
    const requests = await db.select()
      .from(releaseWorkflowRequests)
      .where(eq(releaseWorkflowRequests.releaseId, releaseId))
      .orderBy(desc(releaseWorkflowRequests.createdAt));

    return requests;
  }

  async getVersionHistory(releaseId: string): Promise<any[]> {
    const versions = await db.select()
      .from(releaseVersionHistory)
      .where(eq(releaseVersionHistory.releaseId, releaseId))
      .orderBy(desc(releaseVersionHistory.version));

    return versions;
  }

  async getPendingRequests(userId?: string): Promise<any[]> {
    const baseQuery = db.select()
      .from(releaseWorkflowRequests)
      .where(eq(releaseWorkflowRequests.status, 'pending'))
      .orderBy(desc(releaseWorkflowRequests.createdAt));

    return baseQuery;
  }

  private async createVersionHistoryEntry(
    releaseId: string,
    changedBy: string,
    changeType: string,
    previousData: any,
    newData: any,
    changeReason?: string
  ): Promise<void> {
    const latestVersion = await db.select()
      .from(releaseVersionHistory)
      .where(eq(releaseVersionHistory.releaseId, releaseId))
      .orderBy(desc(releaseVersionHistory.version))
      .limit(1);

    const nextVersion = (latestVersion[0]?.version || 0) + 1;

    await db.insert(releaseVersionHistory).values({
      releaseId,
      version: nextVersion,
      changeType,
      changedBy,
      previousData,
      newData,
      changeReason
    });
  }

  async updateMetadata(
    releaseId: string,
    userId: string,
    changes: Record<string, any>,
    reason?: string
  ): Promise<{ success: boolean; version: number; error?: string }> {
    try {
      const release = await db.select()
        .from(releases)
        .where(eq(releases.id, releaseId))
        .limit(1);

      if (release.length === 0) {
        return { success: false, version: 0, error: 'Release not found' };
      }

      const previousData = {
        title: release[0].title,
        artist: release[0].artist,
        metadata: release[0].metadata
      };

      await db.update(releases)
        .set({
          ...changes,
          updatedAt: new Date()
        })
        .where(eq(releases.id, releaseId));

      await this.createVersionHistoryEntry(
        releaseId,
        userId,
        'metadata_update',
        previousData,
        changes,
        reason
      );

      const latestVersion = await db.select()
        .from(releaseVersionHistory)
        .where(eq(releaseVersionHistory.releaseId, releaseId))
        .orderBy(desc(releaseVersionHistory.version))
        .limit(1);

      return {
        success: true,
        version: latestVersion[0]?.version || 1
      };
    } catch (error) {
      logger.error('Error updating release metadata:', error);
      return {
        success: false,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  getStatusDisplayName(status: ReleaseStatus): string {
    const displayNames: Record<ReleaseStatus, string> = {
      'draft': 'Draft',
      'pending_review': 'Pending Review',
      'in_review': 'In Review',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'scheduled': 'Scheduled',
      'processing': 'Processing',
      'live': 'Live',
      'update_requested': 'Update Requested',
      'update_pending': 'Update Pending',
      'takedown_requested': 'Takedown Requested',
      'taken_down': 'Taken Down',
      'reinstated': 'Reinstated',
      'archived': 'Archived'
    };

    return displayNames[status] || status;
  }

  getStatusColor(status: ReleaseStatus): string {
    const colors: Record<ReleaseStatus, string> = {
      'draft': '#6B7280',
      'pending_review': '#F59E0B',
      'in_review': '#3B82F6',
      'approved': '#10B981',
      'rejected': '#EF4444',
      'scheduled': '#8B5CF6',
      'processing': '#F97316',
      'live': '#22C55E',
      'update_requested': '#FBBF24',
      'update_pending': '#FB923C',
      'takedown_requested': '#F87171',
      'taken_down': '#DC2626',
      'reinstated': '#14B8A6',
      'archived': '#9CA3AF'
    };

    return colors[status] || '#6B7280';
  }
}

export const releaseWorkflowService = new ReleaseWorkflowService();

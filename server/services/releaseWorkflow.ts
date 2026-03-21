import { logger } from '../logger.js';
import { storage } from '../storage.js';
import { nanoid } from 'nanoid';

export type ReleaseState = 'draft' | 'pending_review' | 'approved' | 'processing' | 'live' | 'updated' | 'update_pending' | 'taken_down' | 'rejected';

export interface StateTransition {
  from: ReleaseState;
  to: ReleaseState;
  action: string;
  userId: string;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface TakedownRequest {
  id: string;
  releaseId: string;
  userId: string;
  reason: TakedownReason;
  customReason?: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  processedAt?: Date;
  processedBy?: string;
  platforms?: string[];
  urgency: 'normal' | 'urgent' | 'emergency';
  notes?: string;
}

export interface UpdateRequest {
  id: string;
  releaseId: string;
  userId: string;
  changes: ReleaseChange[];
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
  processedAt?: Date;
  processedBy?: string;
  notes?: string;
  affectedPlatforms?: string[];
}

export interface ReleaseChange {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'metadata' | 'audio' | 'artwork' | 'credits' | 'pricing' | 'availability';
}

export interface AuditLogEntry {
  id: string;
  releaseId: string;
  action: string;
  userId: string;
  timestamp: Date;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export type TakedownReason = 
  | 'artist_request'
  | 'rights_dispute'
  | 'copyright_claim'
  | 'quality_issue'
  | 'incorrect_metadata'
  | 'duplicate_content'
  | 'policy_violation'
  | 'legal_order'
  | 'label_request'
  | 'distribution_agreement_terminated'
  | 'other';

const TAKEDOWN_REASON_LABELS: Record<TakedownReason, string> = {
  artist_request: 'Artist requested removal',
  rights_dispute: 'Rights ownership dispute',
  copyright_claim: 'Copyright infringement claim',
  quality_issue: 'Audio quality issues',
  incorrect_metadata: 'Incorrect or misleading metadata',
  duplicate_content: 'Duplicate release detected',
  policy_violation: 'Platform policy violation',
  legal_order: 'Legal order or court requirement',
  label_request: 'Record label requested removal',
  distribution_agreement_terminated: 'Distribution agreement ended',
  other: 'Other reason'
};

const STATE_TRANSITIONS: { [fromState in ReleaseState]?: ReleaseState[] } = {
  draft: ['pending_review', 'taken_down'],
  pending_review: ['approved', 'rejected', 'draft'],
  approved: ['processing', 'draft'],
  processing: ['live', 'rejected'],
  live: ['update_pending', 'taken_down'],
  updated: ['live', 'update_pending', 'taken_down'],
  update_pending: ['updated', 'live', 'rejected'],
  rejected: ['draft', 'pending_review'],
  taken_down: ['draft']
};

export class ReleaseWorkflowService {
  private auditLog: Map<string, AuditLogEntry[]> = new Map();
  private takedownRequests: Map<string, TakedownRequest> = new Map();
  private updateRequests: Map<string, UpdateRequest> = new Map();
  private stateHistory: Map<string, StateTransition[]> = new Map();

  canTransition(currentState: ReleaseState, targetState: ReleaseState): boolean {
    const allowedTransitions = STATE_TRANSITIONS[currentState];
    return allowedTransitions?.includes(targetState) ?? false;
  }

  getValidTransitions(currentState: ReleaseState): ReleaseState[] {
    return STATE_TRANSITIONS[currentState] || [];
  }

  async transition(
    releaseId: string,
    userId: string,
    targetState: ReleaseState,
    options: {
      reason?: string;
      metadata?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<{ success: boolean; error?: string; newState?: ReleaseState }> {
    try {
      const release = await this.getRelease(releaseId);
      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      const currentState = (release.status as ReleaseState) || 'draft';

      if (!this.canTransition(currentState, targetState)) {
        return {
          success: false,
          error: `Cannot transition from "${currentState}" to "${targetState}". Valid transitions: ${this.getValidTransitions(currentState).join(', ')}`
        };
      }

      const transition: StateTransition = {
        from: currentState,
        to: targetState,
        action: `${currentState}_to_${targetState}`,
        userId,
        timestamp: new Date(),
        reason: options.reason,
        metadata: options.metadata
      };

      const history = this.stateHistory.get(releaseId) || [];
      history.push(transition);
      this.stateHistory.set(releaseId, history);

      await this.logAudit(releaseId, {
        action: 'state_transition',
        userId,
        details: {
          from: currentState,
          to: targetState,
          reason: options.reason,
          metadata: options.metadata
        },
        ipAddress: options.ipAddress,
        userAgent: options.userAgent
      });

      logger.info(`Release ${releaseId} transitioned from ${currentState} to ${targetState} by user ${userId}`);

      return { success: true, newState: targetState };
    } catch (error) {
      logger.error('Error transitioning release state:', error);
      return { success: false, error: 'Failed to transition release state' };
    }
  }

  async submitForReview(releaseId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.transition(releaseId, userId, 'pending_review', {
      reason: 'Submitted for distribution review'
    });

    if (result.success) {
      await this.logAudit(releaseId, {
        action: 'submit_for_review',
        userId,
        details: { message: 'Release submitted for review' }
      });
    }

    return result;
  }

  async approve(releaseId: string, reviewerId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.transition(releaseId, reviewerId, 'approved', {
      reason: 'Approved for distribution',
      metadata: { notes, reviewedBy: reviewerId }
    });

    if (result.success) {
      await this.logAudit(releaseId, {
        action: 'approved',
        userId: reviewerId,
        details: { notes, status: 'approved' }
      });
    }

    return result;
  }

  async reject(releaseId: string, reviewerId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.transition(releaseId, reviewerId, 'rejected', {
      reason,
      metadata: { rejectionReason: reason, reviewedBy: reviewerId }
    });

    if (result.success) {
      await this.logAudit(releaseId, {
        action: 'rejected',
        userId: reviewerId,
        details: { reason, status: 'rejected' }
      });
    }

    return result;
  }

  async requestTakedown(
    releaseId: string,
    userId: string,
    options: {
      reason: TakedownReason;
      customReason?: string;
      platforms?: string[];
      urgency?: 'normal' | 'urgent' | 'emergency';
      notes?: string;
    }
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      const release = await this.getRelease(releaseId);
      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      const currentState = release.status as ReleaseState;
      if (!['live', 'updated', 'update_pending'].includes(currentState)) {
        return { success: false, error: `Cannot takedown release in "${currentState}" state. Must be live.` };
      }

      const requestId = `takedown_${nanoid()}`;
      const request: TakedownRequest = {
        id: requestId,
        releaseId,
        userId,
        reason: options.reason,
        customReason: options.customReason,
        requestedAt: new Date(),
        status: 'pending',
        platforms: options.platforms,
        urgency: options.urgency || 'normal',
        notes: options.notes
      };

      this.takedownRequests.set(requestId, request);

      await this.logAudit(releaseId, {
        action: 'takedown_requested',
        userId,
        details: {
          requestId,
          reason: options.reason,
          customReason: options.customReason,
          urgency: options.urgency,
          platforms: options.platforms
        }
      });

      logger.info(`Takedown request ${requestId} created for release ${releaseId}`);

      return { success: true, requestId };
    } catch (error) {
      logger.error('Error creating takedown request:', error);
      return { success: false, error: 'Failed to create takedown request' };
    }
  }

  async processTakedown(
    requestId: string,
    processedBy: string,
    action: 'approve' | 'reject',
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const request = this.takedownRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Takedown request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request already ${request.status}` };
    }

    request.status = action === 'approve' ? 'approved' : 'rejected';
    request.processedAt = new Date();
    request.processedBy = processedBy;
    request.notes = notes;

    if (action === 'approve') {
      const transitionResult = await this.transition(request.releaseId, processedBy, 'taken_down', {
        reason: `Takedown approved: ${request.reason}`,
        metadata: { takedownRequestId: requestId }
      });

      if (transitionResult.success) {
        request.status = 'completed';
      }
    }

    this.takedownRequests.set(requestId, request);

    await this.logAudit(request.releaseId, {
      action: `takedown_${action}ed`,
      userId: processedBy,
      details: { requestId, notes, action }
    });

    return { success: true };
  }

  async requestUpdate(
    releaseId: string,
    userId: string,
    changes: ReleaseChange[],
    notes?: string
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      const release = await this.getRelease(releaseId);
      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      const currentState = release.status as ReleaseState;
      if (!['live', 'updated'].includes(currentState)) {
        return { success: false, error: `Cannot update release in "${currentState}" state. Must be live.` };
      }

      if (changes.length === 0) {
        return { success: false, error: 'No changes provided' };
      }

      const requestId = `update_${nanoid()}`;
      const request: UpdateRequest = {
        id: requestId,
        releaseId,
        userId,
        changes,
        requestedAt: new Date(),
        status: 'pending',
        notes,
        affectedPlatforms: this.determineAffectedPlatforms(changes)
      };

      this.updateRequests.set(requestId, request);

      await this.transition(releaseId, userId, 'update_pending', {
        reason: 'Update request submitted',
        metadata: { updateRequestId: requestId }
      });

      await this.logAudit(releaseId, {
        action: 'update_requested',
        userId,
        details: {
          requestId,
          changeCount: changes.length,
          changeTypes: [...new Set(changes.map(c => c.changeType))]
        }
      });

      logger.info(`Update request ${requestId} created for release ${releaseId}`);

      return { success: true, requestId };
    } catch (error) {
      logger.error('Error creating update request:', error);
      return { success: false, error: 'Failed to create update request' };
    }
  }

  async processUpdate(
    requestId: string,
    processedBy: string,
    action: 'approve' | 'reject',
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const request = this.updateRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Update request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request already ${request.status}` };
    }

    request.status = action === 'approve' ? 'approved' : 'rejected';
    request.processedAt = new Date();
    request.processedBy = processedBy;
    request.notes = notes;

    if (action === 'approve') {
      request.status = 'processing';

      const transitionResult = await this.transition(request.releaseId, processedBy, 'updated', {
        reason: 'Update applied',
        metadata: { updateRequestId: requestId, changes: request.changes }
      });

      if (transitionResult.success) {
        request.status = 'completed';
      }
    } else {
      await this.transition(request.releaseId, processedBy, 'live', {
        reason: 'Update rejected, reverting to live state',
        metadata: { updateRequestId: requestId }
      });
    }

    this.updateRequests.set(requestId, request);

    await this.logAudit(request.releaseId, {
      action: `update_${action}ed`,
      userId: processedBy,
      details: { requestId, notes, action, changes: request.changes }
    });

    return { success: true };
  }

  private determineAffectedPlatforms(changes: ReleaseChange[]): string[] {
    const platforms = new Set<string>();
    const allPlatforms = ['spotify', 'appleMusic', 'amazonMusic', 'youtubeMusic', 'tidal', 'deezer'];

    for (const change of changes) {
      switch (change.changeType) {
        case 'audio':
          allPlatforms.forEach(p => platforms.add(p));
          break;
        case 'artwork':
          allPlatforms.forEach(p => platforms.add(p));
          break;
        case 'metadata':
          allPlatforms.forEach(p => platforms.add(p));
          break;
        case 'pricing':
          ['appleMusic', 'amazonMusic'].forEach(p => platforms.add(p));
          break;
        case 'availability':
          allPlatforms.forEach(p => platforms.add(p));
          break;
      }
    }

    return Array.from(platforms);
  }

  async logAudit(
    releaseId: string,
    entry: Omit<AuditLogEntry, 'id' | 'releaseId' | 'timestamp'>
  ): Promise<void> {
    const auditEntry: AuditLogEntry = {
      id: `audit_${nanoid()}`,
      releaseId,
      timestamp: new Date(),
      ...entry
    };

    const log = this.auditLog.get(releaseId) || [];
    log.push(auditEntry);
    this.auditLog.set(releaseId, log);

    logger.debug(`Audit log entry created for release ${releaseId}: ${entry.action}`);
  }

  getAuditLog(releaseId: string, options: {
    startDate?: Date;
    endDate?: Date;
    actions?: string[];
    limit?: number;
  } = {}): AuditLogEntry[] {
    let log = this.auditLog.get(releaseId) || [];

    if (options.startDate) {
      log = log.filter(e => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      log = log.filter(e => e.timestamp <= options.endDate!);
    }

    if (options.actions && options.actions.length > 0) {
      log = log.filter(e => options.actions!.includes(e.action));
    }

    log = log.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      log = log.slice(0, options.limit);
    }

    return log;
  }

  getStateHistory(releaseId: string): StateTransition[] {
    return this.stateHistory.get(releaseId) || [];
  }

  getTakedownRequest(requestId: string): TakedownRequest | undefined {
    return this.takedownRequests.get(requestId);
  }

  getTakedownRequestsForRelease(releaseId: string): TakedownRequest[] {
    return Array.from(this.takedownRequests.values())
      .filter(r => r.releaseId === releaseId)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  getUpdateRequest(requestId: string): UpdateRequest | undefined {
    return this.updateRequests.get(requestId);
  }

  getUpdateRequestsForRelease(releaseId: string): UpdateRequest[] {
    return Array.from(this.updateRequests.values())
      .filter(r => r.releaseId === releaseId)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  getPendingTakedowns(): TakedownRequest[] {
    return Array.from(this.takedownRequests.values())
      .filter(r => r.status === 'pending')
      .sort((a, b) => {
        const urgencyOrder = { emergency: 0, urgent: 1, normal: 2 };
        if (a.urgency !== b.urgency) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return a.requestedAt.getTime() - b.requestedAt.getTime();
      });
  }

  getPendingUpdates(): UpdateRequest[] {
    return Array.from(this.updateRequests.values())
      .filter(r => r.status === 'pending')
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  }

  getTakedownReasonLabel(reason: TakedownReason): string {
    return TAKEDOWN_REASON_LABELS[reason] || 'Unknown reason';
  }

  getAllTakedownReasons(): { code: TakedownReason; label: string }[] {
    return Object.entries(TAKEDOWN_REASON_LABELS).map(([code, label]) => ({
      code: code as TakedownReason,
      label
    }));
  }

  getWorkflowStats(): {
    totalReleases: number;
    byState: Record<ReleaseState, number>;
    pendingTakedowns: number;
    pendingUpdates: number;
    recentActivity: number;
  } {
    const stateCount: Record<ReleaseState, number> = {
      draft: 0,
      pending_review: 0,
      approved: 0,
      processing: 0,
      live: 0,
      updated: 0,
      update_pending: 0,
      taken_down: 0,
      rejected: 0
    };

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let recentActivity = 0;

    for (const history of this.stateHistory.values()) {
      if (history.length > 0) {
        const currentState = history[history.length - 1].to;
        stateCount[currentState]++;
      }
      recentActivity += history.filter(t => t.timestamp >= dayAgo).length;
    }

    return {
      totalReleases: this.stateHistory.size,
      byState: stateCount,
      pendingTakedowns: this.getPendingTakedowns().length,
      pendingUpdates: this.getPendingUpdates().length,
      recentActivity
    };
  }

  private async getRelease(releaseId: string): Promise<any> {
    try {
      return await storage.getDistroRelease(releaseId);
    } catch (error) {
      logger.error('Error fetching release:', error);
      return null;
    }
  }

  createChangeRecord(field: string, oldValue: any, newValue: any, changeType: ReleaseChange['changeType']): ReleaseChange {
    return {
      field,
      oldValue,
      newValue,
      changeType
    };
  }

  diffReleases(oldRelease: Record<string, any>, newRelease: Record<string, any>): ReleaseChange[] {
    const changes: ReleaseChange[] = [];
    
    const fieldTypeMap: Record<string, ReleaseChange['changeType']> = {
      title: 'metadata',
      artist: 'metadata',
      albumArtist: 'metadata',
      genre: 'metadata',
      label: 'metadata',
      releaseDate: 'metadata',
      copyright: 'metadata',
      isExplicit: 'metadata',
      language: 'metadata',
      coverArt: 'artwork',
      artworkUrl: 'artwork',
      audioFile: 'audio',
      audioUrl: 'audio',
      price: 'pricing',
      territories: 'availability',
      platforms: 'availability',
      credits: 'credits',
      producers: 'credits',
      composers: 'credits'
    };

    const allKeys = new Set([...Object.keys(oldRelease), ...Object.keys(newRelease)]);
    
    for (const key of allKeys) {
      const oldVal = oldRelease[key];
      const newVal = newRelease[key];
      
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const changeType = fieldTypeMap[key] || 'metadata';
        changes.push(this.createChangeRecord(key, oldVal, newVal, changeType));
      }
    }

    return changes;
  }
}

export const releaseWorkflowService = new ReleaseWorkflowService();

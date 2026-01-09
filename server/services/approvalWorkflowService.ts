import { db } from '../db';
import {
  approvalWorkflows,
  approvalRequests,
  approvalSteps,
  workspaceAuditLog,
  users,
  type ApprovalWorkflow,
  type ApprovalRequest,
  type ApprovalStep,
  type InsertApprovalWorkflow,
  type InsertApprovalRequest,
  type InsertApprovalStep,
} from '@shared/schema';
import { eq, and, desc, sql, or, gte, lte } from 'drizzle-orm';
import { logger } from '../logger.js';
import { notificationService } from './notificationService';
import { rbacService } from './rbacService';

export type ApprovalTrigger = 'release' | 'payout' | 'social_post' | 'royalty_split' | 'contract' | 'catalog_change';
export type ApprovalWorkflowStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'escalated' | 'expired';

export interface WorkflowStep {
  stepNumber: number;
  name: string;
  approverType: 'user' | 'role' | 'any_admin';
  approverId?: string;
  approverRoleId?: string;
  required: boolean;
  timeoutHours?: number;
}

export interface EscalationPolicy {
  enabled: boolean;
  timeoutHours: number;
  escalateTo?: string;
  notifyOnEscalate: boolean;
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
}

interface CreateWorkflowParams {
  workspaceId: string;
  name: string;
  description?: string;
  trigger: ApprovalTrigger;
  steps: WorkflowStep[];
  escalationPolicy?: EscalationPolicy;
  conditions?: WorkflowCondition[];
  createdBy: string;
}

interface SubmitApprovalParams {
  workspaceId: string;
  requesterId: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, any>;
}

export class ApprovalWorkflowService {
  async createWorkflow(params: CreateWorkflowParams): Promise<{ success: boolean; workflow?: ApprovalWorkflow; error?: string }> {
    try {
      const [workflow] = await db
        .insert(approvalWorkflows)
        .values({
          workspaceId: params.workspaceId,
          name: params.name,
          description: params.description,
          trigger: params.trigger,
          steps: params.steps,
          escalationPolicy: params.escalationPolicy || {
            enabled: false,
            timeoutHours: 48,
            escalateTo: null,
          },
          conditions: params.conditions || {},
          createdBy: params.createdBy,
        })
        .returning();

      await this.logAuditEvent({
        workspaceId: params.workspaceId,
        userId: params.createdBy,
        action: 'workflow.created',
        resourceType: 'approval_workflow',
        resourceId: workflow.id,
        newValues: { name: params.name, trigger: params.trigger },
      });

      return { success: true, workflow };
    } catch (error: unknown) {
      logger.error('Create workflow error:', error);
      return { success: false, error: 'Failed to create workflow' };
    }
  }

  async getWorkflow(workflowId: string): Promise<ApprovalWorkflow | null> {
    try {
      const [workflow] = await db
        .select()
        .from(approvalWorkflows)
        .where(eq(approvalWorkflows.id, workflowId))
        .limit(1);
      return workflow || null;
    } catch (error: unknown) {
      logger.error('Get workflow error:', error);
      return null;
    }
  }

  async getWorkspaceWorkflows(workspaceId: string): Promise<ApprovalWorkflow[]> {
    try {
      const workflows = await db
        .select()
        .from(approvalWorkflows)
        .where(eq(approvalWorkflows.workspaceId, workspaceId))
        .orderBy(desc(approvalWorkflows.createdAt));

      return workflows;
    } catch (error: unknown) {
      logger.error('Get workspace workflows error:', error);
      return [];
    }
  }

  async getWorkflowByTrigger(workspaceId: string, trigger: ApprovalTrigger): Promise<ApprovalWorkflow | null> {
    try {
      const [workflow] = await db
        .select()
        .from(approvalWorkflows)
        .where(and(
          eq(approvalWorkflows.workspaceId, workspaceId),
          eq(approvalWorkflows.trigger, trigger),
          eq(approvalWorkflows.isActive, true)
        ))
        .limit(1);
      return workflow || null;
    } catch (error: unknown) {
      logger.error('Get workflow by trigger error:', error);
      return null;
    }
  }

  async updateWorkflow(
    workflowId: string,
    updates: Partial<InsertApprovalWorkflow>,
    updatedBy: string
  ): Promise<{ success: boolean; workflow?: ApprovalWorkflow; error?: string }> {
    try {
      const existingWorkflow = await this.getWorkflow(workflowId);
      if (!existingWorkflow) {
        return { success: false, error: 'Workflow not found' };
      }

      const [workflow] = await db
        .update(approvalWorkflows)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(approvalWorkflows.id, workflowId))
        .returning();

      await this.logAuditEvent({
        workspaceId: existingWorkflow.workspaceId,
        userId: updatedBy,
        action: 'workflow.updated',
        resourceType: 'approval_workflow',
        resourceId: workflowId,
        previousValues: existingWorkflow,
        newValues: updates,
      });

      return { success: true, workflow };
    } catch (error: unknown) {
      logger.error('Update workflow error:', error);
      return { success: false, error: 'Failed to update workflow' };
    }
  }

  async deleteWorkflow(workflowId: string, deletedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      const [pendingRequests] = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvalRequests)
        .where(and(
          eq(approvalRequests.workflowId, workflowId),
          or(
            eq(approvalRequests.status, 'pending'),
            eq(approvalRequests.status, 'in_progress')
          )
        ));

      if (pendingRequests && pendingRequests.count > 0) {
        return { success: false, error: 'Cannot delete workflow with pending approval requests' };
      }

      await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, workflowId));

      await this.logAuditEvent({
        workspaceId: workflow.workspaceId,
        userId: deletedBy,
        action: 'workflow.deleted',
        resourceType: 'approval_workflow',
        resourceId: workflowId,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('Delete workflow error:', error);
      return { success: false, error: 'Failed to delete workflow' };
    }
  }

  async submitForApproval(params: SubmitApprovalParams): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
    try {
      const trigger = this.mapResourceTypeToTrigger(params.resourceType);
      const workflow = await this.getWorkflowByTrigger(params.workspaceId, trigger);

      if (!workflow) {
        return { success: true, request: undefined };
      }

      const steps = workflow.steps as WorkflowStep[];
      const dueAt = new Date();
      dueAt.setHours(dueAt.getHours() + 48);

      const [request] = await db
        .insert(approvalRequests)
        .values({
          workflowId: workflow.id,
          workspaceId: params.workspaceId,
          requesterId: params.requesterId,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          status: 'pending',
          currentStep: 0,
          totalSteps: steps.length,
          metadata: params.metadata || {},
          dueAt,
        })
        .returning();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepDueAt = new Date();
        stepDueAt.setHours(stepDueAt.getHours() + (step.timeoutHours || 24));

        await db.insert(approvalSteps).values({
          requestId: request.id,
          stepNumber: i,
          approverId: step.approverType === 'user' ? step.approverId : null,
          approverRoleId: step.approverType === 'role' ? step.approverRoleId : null,
          status: i === 0 ? 'pending' : 'waiting',
          dueAt: stepDueAt,
          metadata: { stepConfig: step },
        });
      }

      await this.notifyApprovers(request.id, 0);

      await this.logAuditEvent({
        workspaceId: params.workspaceId,
        userId: params.requesterId,
        action: 'approval.submitted',
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        newValues: { requestId: request.id, workflowId: workflow.id },
      });

      return { success: true, request };
    } catch (error: unknown) {
      logger.error('Submit for approval error:', error);
      return { success: false, error: 'Failed to submit for approval' };
    }
  }

  async processApprovalDecision(
    requestId: string,
    stepNumber: number,
    decision: 'approved' | 'rejected',
    approverId: string,
    comment?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [request] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, requestId))
        .limit(1);

      if (!request) {
        return { success: false, error: 'Approval request not found' };
      }

      if (request.status === 'approved' || request.status === 'rejected') {
        return { success: false, error: 'This request has already been finalized' };
      }

      const [step] = await db
        .select()
        .from(approvalSteps)
        .where(and(
          eq(approvalSteps.requestId, requestId),
          eq(approvalSteps.stepNumber, stepNumber)
        ))
        .limit(1);

      if (!step) {
        return { success: false, error: 'Approval step not found' };
      }

      if (step.status !== 'pending') {
        return { success: false, error: 'This step is not pending approval' };
      }

      await db
        .update(approvalSteps)
        .set({
          status: decision,
          decision,
          decidedBy: approverId,
          decidedAt: new Date(),
          comment,
        })
        .where(eq(approvalSteps.id, step.id));

      if (decision === 'rejected') {
        await db
          .update(approvalRequests)
          .set({
            status: 'rejected',
            completedAt: new Date(),
            finalDecision: 'rejected',
            finalDecisionBy: approverId,
            finalComment: comment,
            updatedAt: new Date(),
          })
          .where(eq(approvalRequests.id, requestId));

        await this.notifyRequester(request, 'rejected', comment);
      } else {
        const nextStepNumber = stepNumber + 1;
        if (nextStepNumber >= request.totalSteps!) {
          await db
            .update(approvalRequests)
            .set({
              status: 'approved',
              completedAt: new Date(),
              finalDecision: 'approved',
              finalDecisionBy: approverId,
              finalComment: comment,
              updatedAt: new Date(),
            })
            .where(eq(approvalRequests.id, requestId));

          await this.notifyRequester(request, 'approved', comment);
        } else {
          await db
            .update(approvalRequests)
            .set({
              currentStep: nextStepNumber,
              status: 'in_progress',
              updatedAt: new Date(),
            })
            .where(eq(approvalRequests.id, requestId));

          await db
            .update(approvalSteps)
            .set({ status: 'pending' })
            .where(and(
              eq(approvalSteps.requestId, requestId),
              eq(approvalSteps.stepNumber, nextStepNumber)
            ));

          await this.notifyApprovers(requestId, nextStepNumber);
        }
      }

      await this.logAuditEvent({
        workspaceId: request.workspaceId,
        userId: approverId,
        action: `approval.${decision}`,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        newValues: { decision, stepNumber, comment },
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('Process approval decision error:', error);
      return { success: false, error: 'Failed to process approval decision' };
    }
  }

  async getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
    try {
      const [request] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, requestId))
        .limit(1);
      return request || null;
    } catch (error: unknown) {
      logger.error('Get approval request error:', error);
      return null;
    }
  }

  async getApprovalRequestWithSteps(requestId: string): Promise<{ request: ApprovalRequest; steps: ApprovalStep[] } | null> {
    try {
      const request = await this.getApprovalRequest(requestId);
      if (!request) return null;

      const steps = await db
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.requestId, requestId))
        .orderBy(approvalSteps.stepNumber);

      return { request, steps };
    } catch (error: unknown) {
      logger.error('Get approval request with steps error:', error);
      return null;
    }
  }

  async getPendingApprovals(workspaceId: string, userId: string): Promise<any[]> {
    try {
      const pendingRequests = await db
        .select({
          id: approvalRequests.id,
          workflowId: approvalRequests.workflowId,
          resourceType: approvalRequests.resourceType,
          resourceId: approvalRequests.resourceId,
          status: approvalRequests.status,
          currentStep: approvalRequests.currentStep,
          totalSteps: approvalRequests.totalSteps,
          metadata: approvalRequests.metadata,
          dueAt: approvalRequests.dueAt,
          createdAt: approvalRequests.createdAt,
          requesterId: approvalRequests.requesterId,
          requesterEmail: users.email,
          requesterName: users.firstName,
        })
        .from(approvalRequests)
        .leftJoin(users, eq(approvalRequests.requesterId, users.id))
        .where(and(
          eq(approvalRequests.workspaceId, workspaceId),
          or(
            eq(approvalRequests.status, 'pending'),
            eq(approvalRequests.status, 'in_progress')
          )
        ))
        .orderBy(desc(approvalRequests.createdAt));

      return pendingRequests;
    } catch (error: unknown) {
      logger.error('Get pending approvals error:', error);
      return [];
    }
  }

  async getUserPendingApprovals(userId: string): Promise<any[]> {
    try {
      const pendingSteps = await db
        .select({
          stepId: approvalSteps.id,
          stepNumber: approvalSteps.stepNumber,
          dueAt: approvalSteps.dueAt,
          requestId: approvalRequests.id,
          resourceType: approvalRequests.resourceType,
          resourceId: approvalRequests.resourceId,
          workspaceId: approvalRequests.workspaceId,
          metadata: approvalRequests.metadata,
          createdAt: approvalRequests.createdAt,
        })
        .from(approvalSteps)
        .innerJoin(approvalRequests, eq(approvalSteps.requestId, approvalRequests.id))
        .where(and(
          eq(approvalSteps.approverId, userId),
          eq(approvalSteps.status, 'pending')
        ))
        .orderBy(approvalSteps.dueAt);

      return pendingSteps;
    } catch (error: unknown) {
      logger.error('Get user pending approvals error:', error);
      return [];
    }
  }

  async getApprovalHistory(workspaceId: string, limit: number = 50): Promise<any[]> {
    try {
      const history = await db
        .select({
          id: approvalRequests.id,
          resourceType: approvalRequests.resourceType,
          resourceId: approvalRequests.resourceId,
          status: approvalRequests.status,
          finalDecision: approvalRequests.finalDecision,
          finalComment: approvalRequests.finalComment,
          completedAt: approvalRequests.completedAt,
          createdAt: approvalRequests.createdAt,
          requesterId: approvalRequests.requesterId,
          requesterEmail: users.email,
          requesterName: users.firstName,
        })
        .from(approvalRequests)
        .leftJoin(users, eq(approvalRequests.requesterId, users.id))
        .where(and(
          eq(approvalRequests.workspaceId, workspaceId),
          or(
            eq(approvalRequests.status, 'approved'),
            eq(approvalRequests.status, 'rejected')
          )
        ))
        .orderBy(desc(approvalRequests.completedAt))
        .limit(limit);

      return history;
    } catch (error: unknown) {
      logger.error('Get approval history error:', error);
      return [];
    }
  }

  async checkEscalations(): Promise<void> {
    try {
      const overdueRequests = await db
        .select()
        .from(approvalRequests)
        .where(and(
          or(
            eq(approvalRequests.status, 'pending'),
            eq(approvalRequests.status, 'in_progress')
          ),
          lte(approvalRequests.dueAt, new Date())
        ));

      for (const request of overdueRequests) {
        const workflow = await this.getWorkflow(request.workflowId);
        if (!workflow) continue;

        const escalationPolicy = workflow.escalationPolicy as EscalationPolicy;
        if (escalationPolicy?.enabled) {
          await this.escalateRequest(request.id, escalationPolicy);
        }
      }
    } catch (error: unknown) {
      logger.error('Check escalations error:', error);
    }
  }

  private async escalateRequest(requestId: string, policy: EscalationPolicy): Promise<void> {
    try {
      await db
        .update(approvalRequests)
        .set({
          status: 'escalated',
          escalatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(approvalRequests.id, requestId));

      if (policy.notifyOnEscalate && policy.escalateTo) {
        await notificationService.createNotification({
          userId: policy.escalateTo,
          type: 'approval_escalated',
          title: 'Approval Request Escalated',
          message: 'An approval request requires your immediate attention',
          link: `/approvals/${requestId}`,
          metadata: { requestId },
        });
      }
    } catch (error: unknown) {
      logger.error('Escalate request error:', error);
    }
  }

  private async notifyApprovers(requestId: string, stepNumber: number): Promise<void> {
    try {
      const [step] = await db
        .select()
        .from(approvalSteps)
        .where(and(
          eq(approvalSteps.requestId, requestId),
          eq(approvalSteps.stepNumber, stepNumber)
        ))
        .limit(1);

      if (!step) return;

      const [request] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, requestId))
        .limit(1);

      if (!request) return;

      if (step.approverId) {
        await notificationService.createNotification({
          userId: step.approverId,
          type: 'approval_request',
          title: 'Approval Required',
          message: `A ${request.resourceType} requires your approval`,
          link: `/approvals/${requestId}`,
          metadata: { requestId, resourceType: request.resourceType, resourceId: request.resourceId },
        });
      }
    } catch (error: unknown) {
      logger.error('Notify approvers error:', error);
    }
  }

  private async notifyRequester(request: ApprovalRequest, decision: string, comment?: string): Promise<void> {
    try {
      await notificationService.createNotification({
        userId: request.requesterId,
        type: decision === 'approved' ? 'approval_approved' : 'approval_rejected',
        title: `Approval ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your ${request.resourceType} has been ${decision}${comment ? `: ${comment}` : ''}`,
        link: `/${request.resourceType}s/${request.resourceId}`,
        metadata: { requestId: request.id, decision, resourceType: request.resourceType, resourceId: request.resourceId },
      });
    } catch (error: unknown) {
      logger.error('Notify requester error:', error);
    }
  }

  private mapResourceTypeToTrigger(resourceType: string): ApprovalTrigger {
    const mapping: Record<string, ApprovalTrigger> = {
      release: 'release',
      payout: 'payout',
      post: 'social_post',
      social_post: 'social_post',
      royalty_split: 'royalty_split',
      contract: 'contract',
      catalog: 'catalog_change',
    };
    return mapping[resourceType] || 'release';
  }

  private async logAuditEvent(params: any): Promise<void> {
    try {
      await db.insert(workspaceAuditLog).values(params);
    } catch (error: unknown) {
      logger.error('Log audit event error:', error);
    }
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();

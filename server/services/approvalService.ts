import { db } from '../db';
import { posts, approvalHistory, users, notifications } from '@shared/schema';
import { eq, and, or, desc } from 'drizzle-orm';
import { notificationService } from './notificationService';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published';
export type UserRole = 'content_creator' | 'reviewer' | 'manager' | 'admin';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    socialRole?: UserRole;
  };
}

export class ApprovalService {
  private stateTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
    draft: ['pending_review'],
    pending_review: ['approved', 'rejected', 'draft'],
    approved: ['published', 'draft'],
    rejected: ['draft'],
    published: [],
  };

  private rolePermissions: Record<UserRole, string[]> = {
    content_creator: ['submit', 'view_own'],
    reviewer: ['submit', 'approve', 'reject', 'view_all'],
    manager: ['submit', 'approve', 'reject', 'publish', 'view_all'],
    admin: ['submit', 'approve', 'reject', 'publish', 'view_all', 'manage_roles'],
  };

  async getUserRole(userId: string): Promise<UserRole> {
    const [user] = await db
      .select({ socialRole: users.socialRole })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return (user?.socialRole as UserRole) || 'content_creator';
  }

  async checkPermission(userId: string, action: string): Promise<boolean> {
    const userRole = await this.getUserRole(userId);
    const permissions = this.rolePermissions[userRole] || [];
    return permissions.includes(action);
  }

  roleCheckMiddleware(requiredAction: string) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const hasPermission = await this.checkPermission(req.user.id, requiredAction);
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to perform this action',
        });
      }

      next();
    };
  }

  async canTransition(currentStatus: ApprovalStatus, newStatus: ApprovalStatus): Promise<boolean> {
    const allowedTransitions = this.stateTransitions[currentStatus] || [];
    return allowedTransitions.includes(newStatus);
  }

  async validateStateTransition(
    postId: string,
    newStatus: ApprovalStatus,
    userId: string
  ): Promise<{ valid: boolean; error?: string }> {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

    if (!post) {
      return { valid: false, error: 'Post not found' };
    }

    const currentStatus = post.approvalStatus as ApprovalStatus;
    const canTransition = await this.canTransition(currentStatus, newStatus);

    if (!canTransition) {
      return {
        valid: false,
        error: `Cannot transition from ${currentStatus} to ${newStatus}`,
      };
    }

    return { valid: true };
  }

  async submitForReview(
    postId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = await this.validateStateTransition(postId, 'pending_review', userId);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: 'pending_review',
          submittedBy: userId,
        })
        .where(eq(posts.id, postId));

      await this.logApprovalAction({
        postId,
        userId,
        action: 'submit_for_review',
        fromStatus: post.approvalStatus as ApprovalStatus,
        toStatus: 'pending_review',
      });

      await this.notifyReviewers(postId, userId);

      return { success: true };
    } catch (error: unknown) {
      logger.error('Submit for review error:', error);
      return { success: false, error: 'Failed to submit for review' };
    }
  }

  async approvePost(
    postId: string,
    userId: string,
    comment?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = await this.validateStateTransition(postId, 'approved', userId);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: 'approved',
          reviewedBy: userId,
          reviewedAt: new Date(),
          rejectionReason: null,
        })
        .where(eq(posts.id, postId));

      await this.logApprovalAction({
        postId,
        userId,
        action: 'approve',
        fromStatus: post.approvalStatus as ApprovalStatus,
        toStatus: 'approved',
        comment,
      });

      await this.notifyPostCreator(postId, userId, 'approved', comment);

      return { success: true };
    } catch (error: unknown) {
      logger.error('Approve post error:', error);
      return { success: false, error: 'Failed to approve post' };
    }
  }

  async rejectPost(
    postId: string,
    userId: string,
    reason: string,
    comment?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = await this.validateStateTransition(postId, 'rejected', userId);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: 'rejected',
          reviewedBy: userId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        })
        .where(eq(posts.id, postId));

      await this.logApprovalAction({
        postId,
        userId,
        action: 'reject',
        fromStatus: post.approvalStatus as ApprovalStatus,
        toStatus: 'rejected',
        comment: `${reason}${comment ? ` - ${comment}` : ''}`,
      });

      await this.notifyPostCreator(postId, userId, 'rejected', reason);

      return { success: true };
    } catch (error: unknown) {
      logger.error('Reject post error:', error);
      return { success: false, error: 'Failed to reject post' };
    }
  }

  async logApprovalAction(params: {
    postId: string;
    userId: string;
    action: string;
    fromStatus: ApprovalStatus | null;
    toStatus: ApprovalStatus;
    comment?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await db.insert(approvalHistory).values({
        postId: params.postId,
        userId: params.userId,
        action: params.action,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        comment: params.comment,
        metadata: params.metadata || {},
      });
    } catch (error: unknown) {
      logger.error('Log approval action error:', error);
    }
  }

  async getApprovalHistory(postId: string): Promise<any[]> {
    try {
      const history = await db
        .select({
          id: approvalHistory.id,
          userId: approvalHistory.userId,
          action: approvalHistory.action,
          fromStatus: approvalHistory.fromStatus,
          toStatus: approvalHistory.toStatus,
          comment: approvalHistory.comment,
          createdAt: approvalHistory.createdAt,
          userEmail: users.email,
          userName: users.firstName,
        })
        .from(approvalHistory)
        .leftJoin(users, eq(approvalHistory.userId, users.id))
        .where(eq(approvalHistory.postId, postId))
        .orderBy(desc(approvalHistory.createdAt));

      return history;
    } catch (error: unknown) {
      logger.error('Get approval history error:', error);
      return [];
    }
  }

  async getPendingApprovals(userId: string): Promise<any[]> {
    try {
      const userRole = await this.getUserRole(userId);

      if (!['reviewer', 'manager', 'admin'].includes(userRole)) {
        return [];
      }

      const pendingPosts = await db
        .select({
          id: posts.id,
          campaignId: posts.campaignId,
          platform: posts.platform,
          content: posts.content,
          mediaUrls: posts.mediaUrls,
          approvalStatus: posts.approvalStatus,
          submittedBy: posts.submittedBy,
          scheduledAt: posts.scheduledAt,
          createdAt: posts.createdAt,
          submitterEmail: users.email,
          submitterName: users.firstName,
        })
        .from(posts)
        .leftJoin(users, eq(posts.submittedBy, users.id))
        .where(eq(posts.approvalStatus, 'pending_review'))
        .orderBy(desc(posts.createdAt));

      return pendingPosts;
    } catch (error: unknown) {
      logger.error('Get pending approvals error:', error);
      return [];
    }
  }

  private async notifyReviewers(postId: string, submitterId: string): Promise<void> {
    try {
      const reviewers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          or(
            eq(users.socialRole, 'reviewer'),
            eq(users.socialRole, 'manager'),
            eq(users.socialRole, 'admin')
          )
        );

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

      for (const reviewer of reviewers) {
        if (reviewer.id !== submitterId) {
          await notificationService.createNotification({
            userId: reviewer.id,
            type: 'approval_request',
            title: 'New Post Awaiting Review',
            message: `A new ${post.platform} post has been submitted for review`,
            link: `/social/approvals/${postId}`,
            metadata: { postId, platform: post.platform },
          });
        }
      }
    } catch (error: unknown) {
      logger.error('Notify reviewers error:', error);
    }
  }

  private async notifyPostCreator(
    postId: string,
    reviewerId: string,
    status: 'approved' | 'rejected',
    comment?: string
  ): Promise<void> {
    try {
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

      if (!post.submittedBy) return;

      const title = status === 'approved' ? 'Post Approved' : 'Post Rejected';
      const message =
        status === 'approved'
          ? `Your ${post.platform} post has been approved and is ready to publish`
          : `Your ${post.platform} post has been rejected. Reason: ${comment}`;

      await notificationService.createNotification({
        userId: post.submittedBy,
        type: status === 'approved' ? 'approval_approved' : 'approval_rejected',
        title,
        message,
        link: `/social/posts/${postId}`,
        metadata: { postId, status, reviewerId },
      });
    } catch (error: unknown) {
      logger.error('Notify post creator error:', error);
    }
  }

  async getUserPosts(userId: string, status?: ApprovalStatus): Promise<any[]> {
    try {
      const userRole = await this.getUserRole(userId);
      let query = db
        .select({
          id: posts.id,
          campaignId: posts.campaignId,
          platform: posts.platform,
          content: posts.content,
          mediaUrls: posts.mediaUrls,
          approvalStatus: posts.approvalStatus,
          status: posts.status,
          submittedBy: posts.submittedBy,
          reviewedBy: posts.reviewedBy,
          reviewedAt: posts.reviewedAt,
          rejectionReason: posts.rejectionReason,
          scheduledAt: posts.scheduledAt,
          createdAt: posts.createdAt,
        })
        .from(posts);

      if (['content_creator'].includes(userRole)) {
        query = query.where(eq(posts.submittedBy, userId)) as any;
      }

      if (status) {
        const existingCondition = (query as any)._config?.where;
        query = existingCondition
          ? (query.where(and(existingCondition, eq(posts.approvalStatus, status))) as any)
          : (query.where(eq(posts.approvalStatus, status)) as any);
      }

      const results = await (query as any).orderBy(desc(posts.createdAt));
      return results;
    } catch (error: unknown) {
      logger.error('Get user posts error:', error);
      return [];
    }
  }
}

export const approvalService = new ApprovalService();

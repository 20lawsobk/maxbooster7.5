import { db } from "../db";
import { posts, approvalHistory, users } from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { notificationService } from "./notificationService";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger?.js";

export type ApprovalStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "rejected"
  | "published";
export type UserRole = "content_creator" | "reviewer" | "manager" | "admin";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    socialRole?: UserRole;
  };
}

export interface StateTransitionEvent {
  postId: string;
  fromStatus: ApprovalStatus;
  toStatus: ApprovalStatus;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class ApprovalService {
  private stateTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
    draft: ["pending_review"],
    pending_review: ["approved", "rejected", "draft"],
    approved: ["scheduled", "published", "draft"],
    scheduled: ["published", "approved", "draft"],
    rejected: ["draft"],
    published: [],
  };

  private stateTransitionHooks: Map<
    string,
    ((event: StateTransitionEvent) => Promise<void>)[]
  > = new Map();

  private rolePermissions: Record<UserRole, string[]> = {
    content_creator: ["submit", "view_own"],
    reviewer: ["submit", "approve", "reject", "view_all"],
    manager: ["submit", "approve", "reject", "schedule", "publish", "view_all"],
    admin: [
      "submit",
      "approve",
      "reject",
      "schedule",
      "publish",
      "view_all",
      "manage_roles",
    ],
  };

  onStateTransition(
    status: ApprovalStatus,
    hook: (event: StateTransitionEvent) => Promise<void>,
  ) {
    const _hooks = this?.stateTransitionHooks.get(status) || [];
    hooks?.push(hook);
    this?.stateTransitionHooks.set(status, hooks);
  }

  private async triggerTransitionHooks(
    event: StateTransitionEvent,
  ): Promise<void> {
    const _hooks = this?.stateTransitionHooks.get(event?.toStatus) || [];
    for (const hook of hooks) {
      try {
        await hook(event);
      } catch (error) {
        logger?.warn({ err: error }, "State transition hook error:");
      }
    }
  }

  async getUserRole(userId: string): Promise<UserRole> {
    try {
      const _result = await db?.execute<{ role: string | null }>(
        sql`SELECT role FROM users WHERE id = ${userId} LIMIT 1`,
      );
      const _user = result?.rows?.[0];
      if (user?.role === "admin") {
        return "admin";
      }
      return "content_creator";
    } catch (error) {
      logger?.warn(
        { err: error },
        "getUserRole error, defaulting to content_creator:",
      );
      return "content_creator";
    }
  }

  async checkPermission(userId: string, action: string): Promise<boolean> {
    const _userRole = await this?.getUserRole(userId);
    const _permissions = this?.rolePermissions[userRole] || [];
    return permissions?.includes(action);
  }

  roleCheckMiddleware(requiredAction: string) {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ) => {
      if (!req?.user) {
        return res?.status(401).json({ error: "Unauthorized" });
      }

      const _hasPermission = await this?.checkPermission(
        req?.user.id,
        requiredAction,
      );
      if (!hasPermission) {
        return res?.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to perform this action",
        });
      }

      next();
    };
  }

  async canTransition(
    currentStatus: ApprovalStatus,
    newStatus: ApprovalStatus,
  ): Promise<boolean> {
    const _allowedTransitions = this?.stateTransitions[currentStatus] || [];
    return allowedTransitions?.includes(newStatus);
  }

  async validateStateTransition(
    postId: string,
    newStatus: ApprovalStatus,
    _userId: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts?.id, postId))
      .limit(1);

    if (!post) {
      return { valid: false, error: "Post not found" };
    }

    const _currentStatus = post?.approvalStatus as ApprovalStatus;
    const _canTransition = await this?.canTransition(currentStatus, newStatus);

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
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const _validation = await this?.validateStateTransition(
        postId,
        "pending_review",
        userId,
      );
      if (!validation?.valid) {
        return { success: false, error: validation?.error };
      }

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: "pending_review",
          submittedBy: userId,
        })
        .where(eq(posts?.id, postId));

      await this?.logApprovalAction({
        postId,
        userId,
        action: "submit_for_review",
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "pending_review",
      });

      await this?.notifyReviewers(postId, userId);

      return { success: true };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Submit for review error:");
      return { success: false, error: "Failed to submit for review" };
    }
  }

  async approvePost(
    postId: string,
    userId: string,
    comment?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const _validation = await this?.validateStateTransition(
        postId,
        "approved",
        userId,
      );
      if (!validation?.valid) {
        return { success: false, error: validation?.error };
      }

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: "approved",
          reviewedBy: userId,
          reviewedAt: new Date(),
          rejectionReason: null,
        })
        .where(eq(posts?.id, postId));

      await this?.logApprovalAction({
        postId,
        userId,
        action: "approve",
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "approved",
        comment,
      });

      await this?.notifyPostCreator(postId, userId, "approved", comment);

      return { success: true };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Approve post error:");
      return { success: false, error: "Failed to approve post" };
    }
  }

  async rejectPost(
    postId: string,
    userId: string,
    reason: string,
    comment?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const _validation = await this?.validateStateTransition(
        postId,
        "rejected",
        userId,
      );
      if (!validation?.valid) {
        return { success: false, error: validation?.error };
      }

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: "rejected",
          reviewedBy: userId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        })
        .where(eq(posts?.id, postId));

      await this?.logApprovalAction({
        postId,
        userId,
        action: "reject",
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "rejected",
        comment: `${reason}${comment ? ` - ${comment}` : ""}`,
      });

      await this?.notifyPostCreator(postId, userId, "rejected", reason);

      return { success: true };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Reject post error:");
      return { success: false, error: "Failed to reject post" };
    }
  }

  async schedulePost(
    postId: string,
    userId: string,
    scheduledAt: Date,
    comment?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const _validation = await this?.validateStateTransition(
        postId,
        "scheduled",
        userId,
      );
      if (!validation?.valid) {
        return { success: false, error: validation?.error };
      }

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      if (scheduledAt < new Date()) {
        return {
          success: false,
          error: "Scheduled time must be in the future",
        };
      }

      await db
        .update(posts)
        .set({
          approvalStatus: "scheduled",
          scheduledAt: scheduledAt,
          reviewedBy: userId,
          reviewedAt: new Date(),
        })
        .where(eq(posts?.id, postId));

      await this?.logApprovalAction({
        postId,
        userId,
        action: "schedule",
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "scheduled",
        comment,
        metadata: { scheduledAt: scheduledAt?.toISOString() },
      });

      await this?.triggerTransitionHooks({
        postId,
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "scheduled",
        userId,
        timestamp: new Date(),
        metadata: { scheduledAt: scheduledAt?.toISOString() },
      });

      await this?.notifyPostCreator(
        postId,
        userId,
        "approved",
        `Post scheduled for ${scheduledAt?.toLocaleString()}`,
      );

      return { success: true };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Schedule post error:");
      return { success: false, error: "Failed to schedule post" };
    }
  }

  async publishPost(
    postId: string,
    userId: string,
    comment?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const _validation = await this?.validateStateTransition(
        postId,
        "published",
        userId,
      );
      if (!validation?.valid) {
        return { success: false, error: validation?.error };
      }

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      await db
        .update(posts)
        .set({
          approvalStatus: "published",
          status: "published",
          publishedAt: new Date(),
        })
        .where(eq(posts?.id, postId));

      await this?.logApprovalAction({
        postId,
        userId,
        action: "publish",
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "published",
        comment,
      });

      await this?.triggerTransitionHooks({
        postId,
        fromStatus: post?.approvalStatus as ApprovalStatus,
        toStatus: "published",
        userId,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Publish post error:");
      return { success: false, error: "Failed to publish post" };
    }
  }

  async logApprovalAction(params: {
    postId: string;
    userId: string;
    action: string;
    fromStatus: ApprovalStatus | null;
    toStatus: ApprovalStatus;
    comment?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await db?.insert(approvalHistory).values({
        postId: params?.postId,
        userId: params?.userId,
        action: params?.action,
        fromStatus: params?.fromStatus,
        toStatus: params?.toStatus,
        comment: params?.comment,
        metadata: params?.metadata || {},
      });
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Log approval action error:");
    }
  }

  async getApprovalHistory(postId: string): Promise<any[]> {
    try {
      const _history = await db
        .select({
          id: approvalHistory?.id,
          userId: approvalHistory?.userId,
          action: approvalHistory?.action,
          fromStatus: approvalHistory?.fromStatus,
          toStatus: approvalHistory?.toStatus,
          comment: approvalHistory?.comment,
          createdAt: approvalHistory?.createdAt,
          userEmail: users?.email,
          userName: users?.firstName,
        })
        .from(approvalHistory)
        .leftJoin(users, eq(approvalHistory?.userId, users?.id))
        .where(eq(approvalHistory?.postId, postId))
        .orderBy(desc(approvalHistory?.createdAt))
        .limit(200);

      return history;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Get approval history error:");
      return [];
    }
  }

  async getPendingApprovals(userId: string): Promise<any[]> {
    try {
      const _userRole = await this?.getUserRole(userId);

      if (!["reviewer", "manager", "admin"].includes(userRole)) {
        return [];
      }

      const _result = await db?.execute<{
        id: string;
        user_id: string;
        campaign_id: string | null;
        platform: string;
        content: string | null;
        media_urls: string[] | null;
        status: string | null;
        approval_status: string | null;
        submitted_by: string | null;
        reviewed_by: string | null;
        scheduled_at: Date | null;
        created_at: Date | null;
      }>(
        sql`SELECT id, user_id, campaign_id, platform, content, media_urls, status, approval_status, submitted_by, reviewed_by, scheduled_at, created_at FROM posts WHERE approval_status = 'pending_review' ORDER BY created_at DESC`,
      );

      const _pendingPosts = result?.rows || [];

      const _enrichedPosts = await Promise?.all(
        pendingPosts?.map(async (post) => {
          let submitterEmail = null;
          let submitterName = null;

          if (post?.submitted_by) {
            try {
              const _userResult = await db?.execute<{
                email: string;
                first_name: string | null;
              }>(
                sql`SELECT email, first_name FROM users WHERE id = ${post?.submitted_by} LIMIT 1`,
              );
              const _submitter = userResult?.rows?.[0];
              if (submitter) {
                submitterEmail = submitter?.email;
                submitterName = submitter?.first_name;
              }
            } catch {
              // User lookup failed, continue without enrichment
            }
          }

          return {
            id: post?.id,
            campaignId: post?.campaign_id,
            platform: post?.platform,
            content: post?.content,
            mediaUrls: post?.media_urls,
            approvalStatus: post?.approval_status,
            submittedBy: post?.submitted_by,
            scheduledAt: post?.scheduled_at,
            createdAt: post?.created_at,
            submitterEmail,
            submitterName,
          };
        }),
      );

      return enrichedPosts;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Get pending approvals error:");
      return [];
    }
  }

  private async notifyReviewers(
    postId: string,
    submitterId: string,
  ): Promise<void> {
    try {
      const _reviewers = await db
        .select({ id: users?.id, email: users?.email })
        .from(users)
        .where(
          or(
            eq(users?.socialRole, "reviewer"),
            eq(users?.socialRole, "manager"),
            eq(users?.socialRole, "admin"),
          ),
        );

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      for (const reviewer of reviewers) {
        if (reviewer?.id !== submitterId) {
          await notificationService?.createNotification({
            userId: reviewer?.id,
            type: "approval_request",
            title: "New Post Awaiting Review",
            message: `A new ${post?.platform} post has been submitted for review`,
            link: `/social/approvals/${postId}`,
            metadata: { postId, platform: post?.platform },
          });
        }
      }
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Notify reviewers error:");
    }
  }

  private async notifyPostCreator(
    postId: string,
    reviewerId: string,
    status: "approved" | "rejected",
    comment?: string,
  ): Promise<void> {
    try {
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts?.id, postId))
        .limit(1);

      if (!post?.submittedBy) return;

      const _title = status === "approved" ? "Post Approved" : "Post Rejected";
      const _message =
        status === "approved"
          ? `Your ${post?.platform} post has been approved and is ready to publish`
          : `Your ${post?.platform} post has been rejected. Reason: ${comment}`;

      await notificationService?.createNotification({
        userId: post?.submittedBy,
        type: status === "approved" ? "approval_approved" : "approval_rejected",
        title,
        message,
        link: `/social/posts/${postId}`,
        metadata: { postId, status, reviewerId },
      });
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Notify post creator error:");
    }
  }

  async getUserPosts(userId: string, status?: ApprovalStatus): Promise<any[]> {
    try {
      const _userRole = await this?.getUserRole(userId);
      let query = db
        .select({
          id: posts?.id,
          campaignId: posts?.campaignId,
          platform: posts?.platform,
          content: posts?.content,
          mediaUrls: posts?.mediaUrls,
          approvalStatus: posts?.approvalStatus,
          status: posts?.status,
          submittedBy: posts?.submittedBy,
          reviewedBy: posts?.reviewedBy,
          reviewedAt: posts?.reviewedAt,
          rejectionReason: posts?.rejectionReason,
          scheduledAt: posts?.scheduledAt,
          createdAt: posts?.createdAt,
        })
        .from(posts);

      const conditions: unknown[] = [];

      if (["content_creator"].includes(userRole)) {
        conditions?.push(eq(posts?.submittedBy, userId));
      }

      if (status) {
        conditions?.push(eq(posts?.approvalStatus, status));
      }

      const _baseQuery =
        conditions?.length > 0 ? query?.where(and(...conditions)) : query;

      const _results = await (baseQuery as Record<string, unknown>)
        .orderBy(desc(posts?.createdAt))
        .limit(500);
      return results;
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Get user posts error:");
      return [];
    }
  }
}

export const _approvalService = new ApprovalService();

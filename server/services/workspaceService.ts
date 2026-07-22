import { db } from "../db";
import { workspaces, workspaceMembers, workspaceRoles, workspaceInvitations, workspaceCatalogs, workspaceAuditLog, users, type Workspace, type WorkspaceMember, type WorkspaceRole, type WorkspaceInvitation, type InsertWorkspace, type InsertWorkspaceAuditLog } from "@shared/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { logger } from "../logger.js";
import crypto from "crypto";

export type WorkspaceType = "artist" | "label" | "agency" | "management";
export type WorkspaceRoleType =
  | "owner"
  | "admin"
  | "manager"
  | "member"
  | "viewer";

interface WorkspaceSettings {
  allowMemberInvites: boolean;
  requireApprovalForReleases: boolean;
  requireApprovalForPayouts: boolean;
  defaultMemberRole: string;
  catalogVisibility: "private" | "team" | "public";
  notificationSettings: {
    newMember: boolean;
    releaseUpdates: boolean;
    payoutAlerts: boolean;
  };
}

interface WorkspaceBranding {
  logo?: string;
  colors?: { primary: string; secondary: string };
  customDomain?: string;
}


interface CreateWorkspaceParams {
  name: string;
  type: WorkspaceType;
  ownerId: string;
  description?: string;
  settings?: Partial<WorkspaceSettings>;
  branding?: Partial<WorkspaceBranding>;
}

interface InviteMemberParams {
  workspaceId: string;
  email: string;
  role: WorkspaceRoleType;
  roleId?: string;
  invitedBy: string;
  message?: string;
}

export class WorkspaceService {
  private generateSlug(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      crypto?.randomBytes(4).toString("hex")
    );
  }

  private generateInviteToken(): string {
    return crypto?.randomBytes(32).toString("hex");
  }

  async createWorkspace(
    params: CreateWorkspaceParams,
  ): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
    try {
      const slug = this.generateSlug(params?.name);

      const [workspace] = await db
        .insert(workspaces)
        .values({
          name: params.name,
          slug,
          type: params.type,
          ownerId: params.ownerId,
          description: params.description,
          settings: params.settings || undefined,
          branding: params.branding || undefined,
        })
        .returning();

      await this.initializeDefaultRoles(workspace?.id);

      const ownerRole = await this.getRoleByName(workspace?.id, "Owner");
      if (ownerRole) {
        await this.addMember({
          workspaceId: workspace.id,
          userId: params.ownerId,
          roleId: ownerRole.id,
          role: "owner",
        });
      }

      await this.logAuditEvent({
        workspaceId: workspace.id,
        userId: params.ownerId,
        action: "workspace.created",
        resourceType: "workspace",
        resourceId: workspace.id,
        newValues: { name: params.name, type: params.type },
      });

      return { success: true, workspace };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Create workspace error:");
      return { success: false, error: "Failed to create workspace" };
    }
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    try {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces?.id, workspaceId))
        .limit(1);
      return workspace || null;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get workspace error:");
      return null;
    }
  }

  async getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    try {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces?.slug, slug))
        .limit(1);
      return workspace || null;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get workspace by slug error:");
      return null;
    }
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    try {
      const memberships = await db
        .select({
          workspace: workspaces,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers?.workspaceId, workspaces?.id))
        .where(
          and(
            eq(workspaceMembers?.userId, userId),
            eq(workspaceMembers?.status, "active"),
          ),
        );

      return memberships?.map((m) => m?.workspace);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get user workspaces error:");
      return [];
    }
  }

  async updateWorkspace(
    workspaceId: string,
    updates: Partial<InsertWorkspace>,
    userId: string,
  ): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
    try {
      const existingWorkspace = await this.getWorkspace(workspaceId);
      if (!existingWorkspace) {
        return { success: false, error: "Workspace not found" };
      }

      const [workspace] = await db
        .update(workspaces)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(workspaces?.id, workspaceId))
        .returning();

      await this.logAuditEvent({
        workspaceId,
        userId,
        action: "workspace.updated",
        resourceType: "workspace",
        resourceId: workspaceId,
        previousValues: existingWorkspace,
        newValues: updates,
      });

      return { success: true, workspace };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Update workspace error:");
      return { success: false, error: "Failed to update workspace" };
    }
  }

  async deleteWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) {
        return { success: false, error: "Workspace not found" };
      }

      if (workspace?.ownerId !== userId) {
        return {
          success: false,
          error: "Only the workspace owner can delete it",
        };
      }

      await db?.delete(workspaces).where(eq(workspaces?.id, workspaceId));

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Delete workspace error:");
      return { success: false, error: "Failed to delete workspace" };
    }
  }

  private async initializeDefaultRoles(workspaceId: string): Promise<void> {
    const defaultRoles = [
      {
        name: "Owner",
        description: "Full access to all workspace features",
        permissions: [
          {
            resource: "releases",
            actions: ["create", "read", "update", "delete", "approve"],
          },
          { resource: "analytics", actions: ["read"] },
          {
            resource: "royalties",
            actions: ["create", "read", "update", "delete", "approve"],
          },
          {
            resource: "social",
            actions: ["create", "read", "update", "delete", "approve"],
          },
          { resource: "settings", actions: ["read", "update"] },
          { resource: "team", actions: ["create", "read", "update", "delete"] },
        ],
        isSystem: true,
        priority: 100,
      },
      {
        name: "Admin",
        description: "Administrative access with team management",
        permissions: [
          {
            resource: "releases",
            actions: ["create", "read", "update", "delete", "approve"],
          },
          { resource: "analytics", actions: ["read"] },
          {
            resource: "royalties",
            actions: ["create", "read", "update", "approve"],
          },
          {
            resource: "social",
            actions: ["create", "read", "update", "delete", "approve"],
          },
          { resource: "settings", actions: ["read", "update"] },
          { resource: "team", actions: ["create", "read", "update"] },
        ],
        isSystem: true,
        priority: 80,
      },
      {
        name: "Manager",
        description: "Manage releases and approve content",
        permissions: [
          {
            resource: "releases",
            actions: ["create", "read", "update", "approve"],
          },
          { resource: "analytics", actions: ["read"] },
          { resource: "royalties", actions: ["read"] },
          {
            resource: "social",
            actions: ["create", "read", "update", "approve"],
          },
          { resource: "settings", actions: ["read"] },
          { resource: "team", actions: ["read"] },
        ],
        isSystem: true,
        priority: 60,
      },
      {
        name: "Member",
        description: "Standard team member access",
        permissions: [
          { resource: "releases", actions: ["create", "read", "update"] },
          { resource: "analytics", actions: ["read"] },
          { resource: "royalties", actions: ["read"] },
          { resource: "social", actions: ["create", "read", "update"] },
          { resource: "settings", actions: ["read"] },
          { resource: "team", actions: ["read"] },
        ],
        isSystem: true,
        priority: 40,
      },
      {
        name: "Viewer",
        description: "Read-only access",
        permissions: [
          { resource: "releases", actions: ["read"] },
          { resource: "analytics", actions: ["read"] },
          { resource: "royalties", actions: ["read"] },
          { resource: "social", actions: ["read"] },
          { resource: "settings", actions: ["read"] },
          { resource: "team", actions: ["read"] },
        ],
        isSystem: true,
        priority: 20,
      },
    ];

    for (const role of defaultRoles) {
      await db?.insert(workspaceRoles).values({
        workspaceId,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: role.isSystem,
        priority: role.priority,
      });
    }
  }

  async getRoleByName(
    workspaceId: string,
    name: string,
  ): Promise<WorkspaceRole | null> {
    try {
      const [role] = await db
        .select()
        .from(workspaceRoles)
        .where(
          and(
            eq(workspaceRoles?.workspaceId, workspaceId),
            eq(workspaceRoles?.name, name),
          ),
        )
        .limit(1);
      return role || null;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get role by name error:");
      return null;
    }
  }

  async addMember(params: {
    workspaceId: string;
    userId: string;
    roleId?: string;
    role: WorkspaceRoleType;
    invitedBy?: string;
  }): Promise<{ success: boolean; member?: WorkspaceMember; error?: string }> {
    try {
      const existingMember = await this.getMember(
        params?.workspaceId,
        params?.userId,
      );
      if (existingMember) {
        return {
          success: false,
          error: "User is already a member of this workspace",
        };
      }

      const [member] = await db
        .insert(workspaceMembers)
        .values({
          workspaceId: params.workspaceId,
          userId: params.userId,
          roleId: params.roleId,
          role: params.role,
          invitedBy: params.invitedBy,
          invitedAt: params.invitedBy ? new Date() : undefined,
          joinedAt: new Date(),
          status: "active",
        })
        .returning();

      return { success: true, member };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Add member error:");
      return { success: false, error: "Failed to add member" };
    }
  }

  async getMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    try {
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers?.workspaceId, workspaceId),
            eq(workspaceMembers?.userId, userId),
          ),
        )
        .limit(1);
      return member || null;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get member error:");
      return null;
    }
  }

  async getMembers(workspaceId: string): Promise<any[]> {
    try {
      const members = await db
        .select({
          id: workspaceMembers.id,
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          roleId: workspaceMembers.roleId,
          status: workspaceMembers.status,
          joinedAt: workspaceMembers.joinedAt,
          lastActiveAt: workspaceMembers.lastActiveAt,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userProfileImage: users.profileImageUrl,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers?.userId, users?.id))
        .where(eq(workspaceMembers?.workspaceId, workspaceId))
        .orderBy(desc(workspaceMembers?.joinedAt));

      return members;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get members error:");
      return [];
    }
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    newRole: WorkspaceRoleType,
    newRoleId?: string,
    updatedBy?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers?.workspaceId, workspaceId),
            eq(workspaceMembers?.id, memberId),
          ),
        )
        .limit(1);

      if (!member) {
        return { success: false, error: "Member not found" };
      }

      const previousRole = member?.role;

      await db
        .update(workspaceMembers)
        .set({
          role: newRole,
          roleId: newRoleId,
          updatedAt: new Date(),
        })
        .where(eq(workspaceMembers?.id, memberId));

      if (updatedBy) {
        await this.logAuditEvent({
          workspaceId,
          userId: updatedBy,
          action: "member.role_changed",
          resourceType: "member",
          resourceId: memberId,
          previousValues: { role: previousRole },
          newValues: { role: newRole },
        });
      }

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Update member role error:");
      return { success: false, error: "Failed to update member role" };
    }
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    removedBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers?.workspaceId, workspaceId),
            eq(workspaceMembers?.id, memberId),
          ),
        )
        .limit(1);

      if (!member) {
        return { success: false, error: "Member not found" };
      }

      if (member?.role === "owner") {
        return { success: false, error: "Cannot remove the workspace owner" };
      }

      await db
        .delete(workspaceMembers)
        .where(eq(workspaceMembers?.id, memberId));

      await this.logAuditEvent({
        workspaceId,
        userId: removedBy,
        action: "member.removed",
        resourceType: "member",
        resourceId: memberId,
        previousValues: { userId: member.userId, role: member.role },
      });

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Remove member error:");
      return { success: false, error: "Failed to remove member" };
    }
  }

  async inviteMember(
    params: InviteMemberParams,
  ): Promise<{
    success: boolean;
    invitation?: WorkspaceInvitation;
    error?: string;
  }> {
    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users?.email, params?.email))
        .limit(1);

      if (existingUser?.length > 0) {
        const existingMember = await this.getMember(
          params?.workspaceId,
          existingUser[0].id,
        );
        if (existingMember) {
          return {
            success: false,
            error: "User is already a member of this workspace",
          };
        }
      }

      const [existingInvitation] = await db
        .select()
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations?.workspaceId, params?.workspaceId),
            eq(workspaceInvitations?.email, params?.email),
            eq(workspaceInvitations?.status, "pending"),
          ),
        )
        .limit(1);

      if (existingInvitation) {
        return {
          success: false,
          error: "An invitation has already been sent to this email",
        };
      }

      const token = this.generateInviteToken();
      const expiresAt = new Date();
      expiresAt?.setDate(expiresAt?.getDate() + 7);

      const [invitation] = await db
        .insert(workspaceInvitations)
        .values({
          workspaceId: params.workspaceId,
          email: params.email,
          role: params.role,
          roleId: params.roleId,
          token,
          invitedBy: params.invitedBy,
          message: params.message,
          expiresAt,
        })
        .returning();

      await this.logAuditEvent({
        workspaceId: params.workspaceId,
        userId: params.invitedBy,
        action: "invitation.sent",
        resourceType: "invitation",
        resourceId: invitation.id,
        newValues: { email: params.email, role: params.role },
      });

      return { success: true, invitation };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Invite member error:");
      return { success: false, error: "Failed to send invitation" };
    }
  }

  async acceptInvitation(
    token: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [invitation] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations?.token, token))
        .limit(1);

      if (!invitation) {
        return { success: false, error: "Invalid invitation token" };
      }

      if (invitation?.status !== "pending") {
        return {
          success: false,
          error: "Invitation has already been used or expired",
        };
      }

      if (new Date() > invitation?.expiresAt) {
        await db
          .update(workspaceInvitations)
          .set({ status: "expired" })
          .where(eq(workspaceInvitations?.id, invitation?.id));
        return { success: false, error: "Invitation has expired" };
      }

      const addResult = await this.addMember({
        workspaceId: invitation.workspaceId,
        userId,
        roleId: invitation.roleId ?? undefined,
        role: invitation.role ?? "member",
        invitedBy: invitation.invitedBy,
      });

      if (!addResult?.success) {
        return addResult;
      }

      await db
        .update(workspaceInvitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          acceptedByUserId: userId,
        })
        .where(eq(workspaceInvitations?.id, invitation?.id));

      await this.logAuditEvent({
        workspaceId: invitation.workspaceId,
        userId,
        action: "invitation.accepted",
        resourceType: "invitation",
        resourceId: invitation.id,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Accept invitation error:");
      return { success: false, error: "Failed to accept invitation" };
    }
  }

  async getPendingInvitations(
    workspaceId: string,
  ): Promise<WorkspaceInvitation[]> {
    try {
      const invitations = await db
        .select()
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations?.workspaceId, workspaceId),
            eq(workspaceInvitations?.status, "pending"),
          ),
        )
        .orderBy(desc(workspaceInvitations?.createdAt));

      return invitations;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get pending invitations error:");
      return [];
    }
  }

  async cancelInvitation(
    invitationId: string,
    cancelledBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [invitation] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations?.id, invitationId))
        .limit(1);

      if (!invitation) {
        return { success: false, error: "Invitation not found" };
      }

      await db
        .update(workspaceInvitations)
        .set({ status: "cancelled" })
        .where(eq(workspaceInvitations?.id, invitationId));

      await this.logAuditEvent({
        workspaceId: invitation.workspaceId,
        userId: cancelledBy,
        action: "invitation.cancelled",
        resourceType: "invitation",
        resourceId: invitationId,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Cancel invitation error:");
      return { success: false, error: "Failed to cancel invitation" };
    }
  }

  async addToCatalog(
    workspaceId: string,
    projectId: string,
    addedBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db?.insert(workspaceCatalogs).values({
        workspaceId,
        projectId,
        addedBy,
      });

      await this.logAuditEvent({
        workspaceId,
        userId: addedBy,
        action: "catalog.project_added",
        resourceType: "project",
        resourceId: projectId,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Add to catalog error:");
      return { success: false, error: "Failed to add to catalog" };
    }
  }

  async removeFromCatalog(
    workspaceId: string,
    projectId: string,
    removedBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db
        .delete(workspaceCatalogs)
        .where(
          and(
            eq(workspaceCatalogs?.workspaceId, workspaceId),
            eq(workspaceCatalogs?.projectId, projectId),
          ),
        );

      await this.logAuditEvent({
        workspaceId,
        userId: removedBy,
        action: "catalog.project_removed",
        resourceType: "project",
        resourceId: projectId,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Remove from catalog error:");
      return { success: false, error: "Failed to remove from catalog" };
    }
  }

  async getCatalog(workspaceId: string): Promise<any[]> {
    try {
      const catalog = await db
        .select()
        .from(workspaceCatalogs)
        .where(eq(workspaceCatalogs?.workspaceId, workspaceId))
        .orderBy(desc(workspaceCatalogs?.createdAt));

      return catalog;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get catalog error:");
      return [];
    }
  }

  async logAuditEvent(
    params: Omit<InsertWorkspaceAuditLog, "createdAt">,
  ): Promise<void> {
    try {
      await db?.insert(workspaceAuditLog).values(params);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Log audit event error:");
    }
  }

  async getAuditLog(
    workspaceId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<any[]> {
    try {
      const logs = await db
        .select({
          id: workspaceAuditLog.id,
          action: workspaceAuditLog.action,
          resourceType: workspaceAuditLog.resourceType,
          resourceId: workspaceAuditLog.resourceId,
          changes: workspaceAuditLog.changes,
          previousValues: workspaceAuditLog.previousValues,
          newValues: workspaceAuditLog.newValues,
          createdAt: workspaceAuditLog.createdAt,
          userId: workspaceAuditLog.userId,
          userEmail: users.email,
          userName: users.firstName,
        })
        .from(workspaceAuditLog)
        .leftJoin(users, eq(workspaceAuditLog?.userId, users?.id))
        .where(eq(workspaceAuditLog?.workspaceId, workspaceId))
        .orderBy(desc(workspaceAuditLog?.createdAt))
        .limit(limit)
        .offset(offset);

      return logs;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get audit log error:");
      return [];
    }
  }

  async getMemberCount(workspaceId: string): Promise<number> {
    try {
      const [result] = await db
        .select({ count: count() })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers?.workspaceId, workspaceId),
            eq(workspaceMembers?.status, "active"),
          ),
        );
      return result?.count || 0;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get member count error:");
      return 0;
    }
  }

  async isWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.getMember(workspaceId, userId);
    return member !== null && member?.status === "active";
  }

  async getMemberRole(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRoleType | null> {
    const member = await this.getMember(workspaceId, userId);
    return (member?.role as WorkspaceRoleType) || null;
  }

  async shareProject(params: {
    workspaceId: string;
    projectId: string;
    memberIds: string[];
    permission: string;
    sharedBy: string;
  }): Promise<{ success: boolean; shares?: unknown[]; error?: string }> {
    try {
      const shares = [];

      for (const memberId of params?.memberIds) {
        const share = {
          id: crypto.randomUUID(),
          projectId: params.projectId,
          userId: memberId,
          permission: params.permission,
          sharedBy: params.sharedBy,
          createdAt: new Date().toISOString(),
        };
        shares?.push(share);
      }

      await this.logAuditEvent({
        workspaceId: params.workspaceId,
        userId: params.sharedBy,
        action: "project.shared",
        resourceType: "project",
        resourceId: params.projectId,
        newValues: {
          memberCount: params.memberIds.length,
          permission: params.permission,
        },
      });

      return { success: true, shares };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Share project error:");
      return { success: false, error: "Failed to share project" };
    }
  }

  async getProjectShares(_projectId: string): Promise<any[]> {
    return [];
  }

  async updateSharePermission(
    _shareId: string,
    _permission: string,
    _updatedBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async revokeShare(
    _shareId: string,
    _revokedBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async createShareLink(params: {
    workspaceId: string;
    projectId: string;
    permission: string;
    expirationDays?: number;
    password?: string;
    allowDownload?: boolean;
    requireSignIn?: boolean;
    createdBy: string;
  }): Promise<{
    success: boolean;
    link?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      const token = crypto?.randomBytes(16).toString("hex");
      const baseUrl = process.env.BASE_URL || "https://maxbooster.app";

      let expiresAt = null;
      if (params?.expirationDays) {
        const expDate = new Date();
        expDate?.setDate(expDate?.getDate() + params?.expirationDays);
        expiresAt = expDate?.toISOString();
      }

      const link = {
        id: crypto.randomUUID(),
        url: `${baseUrl}/share/${token}`,
        projectId: params.projectId,
        permission: params.permission,
        expiresAt,
        password: !!params?.password,
        accessCount: 0,
        createdAt: new Date().toISOString(),
        createdBy: params.createdBy,
        allowDownload: params.allowDownload ?? true,
        requireSignIn: params.requireSignIn ?? false,
      };

      await this.logAuditEvent({
        workspaceId: params.workspaceId,
        userId: params.createdBy,
        action: "share_link.created",
        resourceType: "share_link",
        resourceId: link.id,
        newValues: { permission: params.permission, expiresAt },
      });

      return { success: true, link };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Create share link error:");
      return { success: false, error: "Failed to create share link" };
    }
  }

  async getShareLinks(_projectId: string): Promise<any[]> {
    return [];
  }

  async revokeShareLink(
    _linkId: string,
    _revokedBy: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async getWorkspacePresence(workspaceId: string): Promise<any[]> {
    try {
      const members = await this.getMembers(workspaceId);

      return members?.map((member) => ({
        userId: member.userId,
        displayName:
          `${member?.userFirstName || ""} ${member?.userLastName || ""}`.trim() ||
          member?.userEmail,
        avatar: member.userProfileImage,
        color: this.generateUserColor(member?.userId),
        status:
          member?.lastActiveAt &&
          Date?.now() - new Date(member?.lastActiveAt).getTime() < 5 * 60 * 1000
            ? "online"
            : "offline",
        cursor: null,
        selection: null,
      }));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Get workspace presence error:");
      return [];
    }
  }

  private generateUserColor(userId: string): string {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
    ];
    const hash = userId
      .split("")
      .reduce((acc, char) => acc + char?.charCodeAt(0), 0);
    return colors[hash % colors?.length];
  }
}

export const workspaceService = new WorkspaceService();

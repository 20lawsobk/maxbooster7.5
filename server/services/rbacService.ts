import { db } from '../db';
import {
  workspaceRoles,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
  type InsertWorkspaceRole,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '../logger.js';

export type ResourceType = 'releases' | 'analytics' | 'royalties' | 'social' | 'settings' | 'team' | 'catalog' | 'billing';
export type ActionType = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'publish' | 'export';

export interface Permission {
  resource: ResourceType;
  actions: ActionType[];
}

export interface RoleTemplate {
  name: string;
  description: string;
  permissions: Permission[];
  priority: number;
}

export const DEFAULT_ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  owner: {
    name: 'Owner',
    description: 'Full access to all workspace features including billing and team management',
    permissions: [
      { resource: 'releases', actions: ['create', 'read', 'update', 'delete', 'approve', 'publish'] },
      { resource: 'analytics', actions: ['read', 'export'] },
      { resource: 'royalties', actions: ['create', 'read', 'update', 'delete', 'approve', 'export'] },
      { resource: 'social', actions: ['create', 'read', 'update', 'delete', 'approve', 'publish'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'team', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'catalog', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'billing', actions: ['read', 'update'] },
    ],
    priority: 100,
  },
  admin: {
    name: 'Admin',
    description: 'Administrative access with team management capabilities',
    permissions: [
      { resource: 'releases', actions: ['create', 'read', 'update', 'delete', 'approve', 'publish'] },
      { resource: 'analytics', actions: ['read', 'export'] },
      { resource: 'royalties', actions: ['create', 'read', 'update', 'approve', 'export'] },
      { resource: 'social', actions: ['create', 'read', 'update', 'delete', 'approve', 'publish'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'team', actions: ['create', 'read', 'update'] },
      { resource: 'catalog', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'billing', actions: ['read'] },
    ],
    priority: 80,
  },
  manager: {
    name: 'Manager',
    description: 'Manage releases, approve content, and view team activity',
    permissions: [
      { resource: 'releases', actions: ['create', 'read', 'update', 'approve'] },
      { resource: 'analytics', actions: ['read', 'export'] },
      { resource: 'royalties', actions: ['read', 'export'] },
      { resource: 'social', actions: ['create', 'read', 'update', 'approve'] },
      { resource: 'settings', actions: ['read'] },
      { resource: 'team', actions: ['read'] },
      { resource: 'catalog', actions: ['read', 'update'] },
      { resource: 'billing', actions: [] },
    ],
    priority: 60,
  },
  member: {
    name: 'Member',
    description: 'Standard team member with content creation access',
    permissions: [
      { resource: 'releases', actions: ['create', 'read', 'update'] },
      { resource: 'analytics', actions: ['read'] },
      { resource: 'royalties', actions: ['read'] },
      { resource: 'social', actions: ['create', 'read', 'update'] },
      { resource: 'settings', actions: ['read'] },
      { resource: 'team', actions: ['read'] },
      { resource: 'catalog', actions: ['read'] },
      { resource: 'billing', actions: [] },
    ],
    priority: 40,
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access to workspace content',
    permissions: [
      { resource: 'releases', actions: ['read'] },
      { resource: 'analytics', actions: ['read'] },
      { resource: 'royalties', actions: ['read'] },
      { resource: 'social', actions: ['read'] },
      { resource: 'settings', actions: ['read'] },
      { resource: 'team', actions: ['read'] },
      { resource: 'catalog', actions: ['read'] },
      { resource: 'billing', actions: [] },
    ],
    priority: 20,
  },
};

export class RBACService {
  async createRole(
    workspaceId: string,
    params: {
      name: string;
      description?: string;
      permissions: Permission[];
      parentRoleId?: string;
      priority?: number;
    }
  ): Promise<{ success: boolean; role?: WorkspaceRole; error?: string }> {
    try {
      const existingRole = await this.getRoleByName(workspaceId, params.name);
      if (existingRole) {
        return { success: false, error: 'A role with this name already exists' };
      }

      let effectivePermissions = params.permissions;
      if (params.parentRoleId) {
        const parentRole = await this.getRole(params.parentRoleId);
        if (parentRole) {
          effectivePermissions = this.mergePermissions(
            parentRole.permissions as Permission[],
            params.permissions
          );
        }
      }

      const [role] = await db
        .insert(workspaceRoles)
        .values({
          workspaceId,
          name: params.name,
          description: params.description,
          permissions: effectivePermissions,
          isCustom: true,
          parentRoleId: params.parentRoleId,
          priority: params.priority || 50,
        })
        .returning();

      return { success: true, role };
    } catch (error: unknown) {
      logger.error('Create role error:', error);
      return { success: false, error: 'Failed to create role' };
    }
  }

  async getRole(roleId: string): Promise<WorkspaceRole | null> {
    try {
      const [role] = await db
        .select()
        .from(workspaceRoles)
        .where(eq(workspaceRoles.id, roleId))
        .limit(1);
      return role || null;
    } catch (error: unknown) {
      logger.error('Get role error:', error);
      return null;
    }
  }

  async getRoleByName(workspaceId: string, name: string): Promise<WorkspaceRole | null> {
    try {
      const [role] = await db
        .select()
        .from(workspaceRoles)
        .where(and(
          eq(workspaceRoles.workspaceId, workspaceId),
          eq(workspaceRoles.name, name)
        ))
        .limit(1);
      return role || null;
    } catch (error: unknown) {
      logger.error('Get role by name error:', error);
      return null;
    }
  }

  async getWorkspaceRoles(workspaceId: string): Promise<WorkspaceRole[]> {
    try {
      const roles = await db
        .select()
        .from(workspaceRoles)
        .where(eq(workspaceRoles.workspaceId, workspaceId))
        .orderBy(desc(workspaceRoles.priority));

      return roles;
    } catch (error: unknown) {
      logger.error('Get workspace roles error:', error);
      return [];
    }
  }

  async updateRole(
    roleId: string,
    updates: Partial<{
      name: string;
      description: string;
      permissions: Permission[];
      priority: number;
    }>
  ): Promise<{ success: boolean; role?: WorkspaceRole; error?: string }> {
    try {
      const existingRole = await this.getRole(roleId);
      if (!existingRole) {
        return { success: false, error: 'Role not found' };
      }

      if (existingRole.isSystem) {
        return { success: false, error: 'System roles cannot be modified' };
      }

      const [role] = await db
        .update(workspaceRoles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(workspaceRoles.id, roleId))
        .returning();

      return { success: true, role };
    } catch (error: unknown) {
      logger.error('Update role error:', error);
      return { success: false, error: 'Failed to update role' };
    }
  }

  async deleteRole(roleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const role = await this.getRole(roleId);
      if (!role) {
        return { success: false, error: 'Role not found' };
      }

      if (role.isSystem) {
        return { success: false, error: 'System roles cannot be deleted' };
      }

      const [memberCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.roleId, roleId));

      if (memberCount && memberCount.count > 0) {
        return { success: false, error: 'Cannot delete role with assigned members' };
      }

      await db.delete(workspaceRoles).where(eq(workspaceRoles.id, roleId));

      return { success: true };
    } catch (error: unknown) {
      logger.error('Delete role error:', error);
      return { success: false, error: 'Failed to delete role' };
    }
  }

  async getUserPermissions(workspaceId: string, userId: string): Promise<Permission[]> {
    try {
      const [member] = await db
        .select({
          roleId: workspaceMembers.roleId,
          role: workspaceMembers.role,
          customPermissions: workspaceMembers.permissions,
        })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, 'active')
        ))
        .limit(1);

      if (!member) {
        return [];
      }

      let permissions: Permission[] = [];

      if (member.roleId) {
        const role = await this.getRole(member.roleId);
        if (role) {
          permissions = role.permissions as Permission[];
        }
      } else if (member.role) {
        const template = DEFAULT_ROLE_TEMPLATES[member.role];
        if (template) {
          permissions = template.permissions;
        }
      }

      if (member.customPermissions) {
        permissions = this.mergePermissions(permissions, member.customPermissions as Permission[]);
      }

      return permissions;
    } catch (error: unknown) {
      logger.error('Get user permissions error:', error);
      return [];
    }
  }

  async checkPermission(
    workspaceId: string,
    userId: string,
    resource: ResourceType,
    action: ActionType
  ): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(workspaceId, userId);
      
      for (const permission of permissions) {
        if (permission.resource === resource && permission.actions.includes(action)) {
          return true;
        }
      }

      return false;
    } catch (error: unknown) {
      logger.error('Check permission error:', error);
      return false;
    }
  }

  async checkMultiplePermissions(
    workspaceId: string,
    userId: string,
    checks: Array<{ resource: ResourceType; action: ActionType }>
  ): Promise<Record<string, boolean>> {
    try {
      const permissions = await this.getUserPermissions(workspaceId, userId);
      const results: Record<string, boolean> = {};

      for (const check of checks) {
        const key = `${check.resource}:${check.action}`;
        results[key] = permissions.some(
          p => p.resource === check.resource && p.actions.includes(check.action)
        );
      }

      return results;
    } catch (error: unknown) {
      logger.error('Check multiple permissions error:', error);
      return {};
    }
  }

  async canManageTeam(workspaceId: string, userId: string): Promise<boolean> {
    return this.checkPermission(workspaceId, userId, 'team', 'update');
  }

  async canApproveContent(workspaceId: string, userId: string, contentType: ResourceType): Promise<boolean> {
    return this.checkPermission(workspaceId, userId, contentType, 'approve');
  }

  async isWorkspaceOwner(workspaceId: string, userId: string): Promise<boolean> {
    try {
      const [workspace] = await db
        .select({ ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      return workspace?.ownerId === userId;
    } catch (error: unknown) {
      logger.error('Check workspace owner error:', error);
      return false;
    }
  }

  async isAdmin(workspaceId: string, userId: string): Promise<boolean> {
    try {
      const [member] = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        ))
        .limit(1);

      return member?.role === 'owner' || member?.role === 'admin';
    } catch (error: unknown) {
      logger.error('Check admin error:', error);
      return false;
    }
  }

  private mergePermissions(base: Permission[], override: Permission[]): Permission[] {
    const merged = new Map<ResourceType, Set<ActionType>>();

    for (const permission of base) {
      if (!merged.has(permission.resource)) {
        merged.set(permission.resource, new Set());
      }
      permission.actions.forEach(action => merged.get(permission.resource)!.add(action));
    }

    for (const permission of override) {
      if (!merged.has(permission.resource)) {
        merged.set(permission.resource, new Set());
      }
      permission.actions.forEach(action => merged.get(permission.resource)!.add(action));
    }

    return Array.from(merged.entries()).map(([resource, actions]) => ({
      resource,
      actions: Array.from(actions),
    }));
  }

  async createRoleFromTemplate(
    workspaceId: string,
    templateKey: string,
    customName?: string
  ): Promise<{ success: boolean; role?: WorkspaceRole; error?: string }> {
    const template = DEFAULT_ROLE_TEMPLATES[templateKey];
    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    return this.createRole(workspaceId, {
      name: customName || template.name,
      description: template.description,
      permissions: template.permissions,
      priority: template.priority,
    });
  }

  async grantPermission(
    roleId: string,
    resource: ResourceType,
    actions: ActionType[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const role = await this.getRole(roleId);
      if (!role) {
        return { success: false, error: 'Role not found' };
      }

      if (role.isSystem) {
        return { success: false, error: 'System roles cannot be modified' };
      }

      const currentPermissions = role.permissions as Permission[];
      const existingPermIndex = currentPermissions.findIndex(p => p.resource === resource);

      if (existingPermIndex >= 0) {
        const existingActions = new Set(currentPermissions[existingPermIndex].actions);
        actions.forEach(action => existingActions.add(action));
        currentPermissions[existingPermIndex].actions = Array.from(existingActions);
      } else {
        currentPermissions.push({ resource, actions });
      }

      await db
        .update(workspaceRoles)
        .set({ permissions: currentPermissions, updatedAt: new Date() })
        .where(eq(workspaceRoles.id, roleId));

      return { success: true };
    } catch (error: unknown) {
      logger.error('Grant permission error:', error);
      return { success: false, error: 'Failed to grant permission' };
    }
  }

  async revokePermission(
    roleId: string,
    resource: ResourceType,
    actions?: ActionType[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const role = await this.getRole(roleId);
      if (!role) {
        return { success: false, error: 'Role not found' };
      }

      if (role.isSystem) {
        return { success: false, error: 'System roles cannot be modified' };
      }

      let currentPermissions = role.permissions as Permission[];
      const permIndex = currentPermissions.findIndex(p => p.resource === resource);

      if (permIndex >= 0) {
        if (actions) {
          currentPermissions[permIndex].actions = currentPermissions[permIndex].actions.filter(
            a => !actions.includes(a)
          );
          if (currentPermissions[permIndex].actions.length === 0) {
            currentPermissions = currentPermissions.filter((_, i) => i !== permIndex);
          }
        } else {
          currentPermissions = currentPermissions.filter((_, i) => i !== permIndex);
        }
      }

      await db
        .update(workspaceRoles)
        .set({ permissions: currentPermissions, updatedAt: new Date() })
        .where(eq(workspaceRoles.id, roleId));

      return { success: true };
    } catch (error: unknown) {
      logger.error('Revoke permission error:', error);
      return { success: false, error: 'Failed to revoke permission' };
    }
  }

  getRoleTemplates(): Record<string, RoleTemplate> {
    return DEFAULT_ROLE_TEMPLATES;
  }
}

export const rbacService = new RBACService();

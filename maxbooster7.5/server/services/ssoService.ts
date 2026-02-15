import { db } from '../db';
import {
  ssoConfigs,
  workspaceMembers,
  workspaceRoles,
  users,
  workspaceAuditLog,
  type SSOConfig,
  type InsertSSOConfig,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';

export type SSOProvider = 'saml' | 'oidc';

export interface SAMLMetadata {
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
}

export interface OIDCMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
}

export interface AttributeMapping {
  email: string;
  firstName: string;
  lastName: string;
  groups?: string;
}

export interface SCIMUser {
  schemas: string[];
  userName: string;
  name?: {
    givenName?: string;
    familyName?: string;
  };
  emails?: Array<{ value: string; primary?: boolean }>;
  active: boolean;
  externalId?: string;
  groups?: Array<{ value: string; display?: string }>;
}

export interface SCIMGroup {
  schemas: string[];
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
  externalId?: string;
}

interface ConfigureSSOParams {
  workspaceId: string;
  provider: SSOProvider;
  metadata: SAMLMetadata | OIDCMetadata;
  attributeMapping?: AttributeMapping;
  allowedDomains?: string[];
  autoProvision?: boolean;
  jitProvisioning?: boolean;
  defaultRoleId?: string;
  configuredBy: string;
}

export class SSOService {
  private generateSCIMToken(): string {
    return `scim_${crypto.randomBytes(32).toString('hex')}`;
  }

  async configureSAML(
    workspaceId: string,
    metadata: SAMLMetadata,
    options: {
      attributeMapping?: AttributeMapping;
      allowedDomains?: string[];
      autoProvision?: boolean;
      jitProvisioning?: boolean;
      defaultRoleId?: string;
      configuredBy: string;
    }
  ): Promise<{ success: boolean; config?: SSOConfig; error?: string }> {
    return this.configureSSOInternal({
      workspaceId,
      provider: 'saml',
      metadata,
      ...options,
    });
  }

  async configureOIDC(
    workspaceId: string,
    metadata: OIDCMetadata,
    options: {
      attributeMapping?: AttributeMapping;
      allowedDomains?: string[];
      autoProvision?: boolean;
      jitProvisioning?: boolean;
      defaultRoleId?: string;
      configuredBy: string;
    }
  ): Promise<{ success: boolean; config?: SSOConfig; error?: string }> {
    return this.configureSSOInternal({
      workspaceId,
      provider: 'oidc',
      metadata,
      ...options,
    });
  }

  private async configureSSOInternal(params: ConfigureSSOParams): Promise<{ success: boolean; config?: SSOConfig; error?: string }> {
    try {
      const existingConfig = await this.getSSOConfig(params.workspaceId);

      if (existingConfig) {
        const [config] = await db
          .update(ssoConfigs)
          .set({
            provider: params.provider,
            metadata: params.metadata,
            attributeMapping: params.attributeMapping || {
              email: 'email',
              firstName: 'given_name',
              lastName: 'family_name',
              groups: 'groups',
            },
            allowedDomains: params.allowedDomains || [],
            autoProvision: params.autoProvision ?? true,
            jitProvisioning: params.jitProvisioning ?? true,
            defaultRoleId: params.defaultRoleId,
            updatedAt: new Date(),
          })
          .where(eq(ssoConfigs.workspaceId, params.workspaceId))
          .returning();

        await this.logAuditEvent({
          workspaceId: params.workspaceId,
          userId: params.configuredBy,
          action: 'sso.updated',
          resourceType: 'sso_config',
          resourceId: config.id,
          newValues: { provider: params.provider },
        });

        return { success: true, config };
      }

      const [config] = await db
        .insert(ssoConfigs)
        .values({
          workspaceId: params.workspaceId,
          provider: params.provider,
          enabled: false,
          metadata: params.metadata,
          attributeMapping: params.attributeMapping || {
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            groups: 'groups',
          },
          allowedDomains: params.allowedDomains || [],
          autoProvision: params.autoProvision ?? true,
          jitProvisioning: params.jitProvisioning ?? true,
          defaultRoleId: params.defaultRoleId,
        })
        .returning();

      await this.logAuditEvent({
        workspaceId: params.workspaceId,
        userId: params.configuredBy,
        action: 'sso.configured',
        resourceType: 'sso_config',
        resourceId: config.id,
        newValues: { provider: params.provider },
      });

      return { success: true, config };
    } catch (error: unknown) {
      logger.error('Configure SSO error:', error);
      return { success: false, error: 'Failed to configure SSO' };
    }
  }

  async getSSOConfig(workspaceId: string): Promise<SSOConfig | null> {
    try {
      const [config] = await db
        .select()
        .from(ssoConfigs)
        .where(eq(ssoConfigs.workspaceId, workspaceId))
        .limit(1);
      return config || null;
    } catch (error: unknown) {
      logger.error('Get SSO config error:', error);
      return null;
    }
  }

  async enableSSO(workspaceId: string, enabledBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config) {
        return { success: false, error: 'SSO is not configured for this workspace' };
      }

      await db
        .update(ssoConfigs)
        .set({ enabled: true, updatedAt: new Date() })
        .where(eq(ssoConfigs.workspaceId, workspaceId));

      await this.logAuditEvent({
        workspaceId,
        userId: enabledBy,
        action: 'sso.enabled',
        resourceType: 'sso_config',
        resourceId: config.id,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('Enable SSO error:', error);
      return { success: false, error: 'Failed to enable SSO' };
    }
  }

  async disableSSO(workspaceId: string, disabledBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config) {
        return { success: false, error: 'SSO is not configured for this workspace' };
      }

      await db
        .update(ssoConfigs)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(ssoConfigs.workspaceId, workspaceId));

      await this.logAuditEvent({
        workspaceId,
        userId: disabledBy,
        action: 'sso.disabled',
        resourceType: 'sso_config',
        resourceId: config.id,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('Disable SSO error:', error);
      return { success: false, error: 'Failed to disable SSO' };
    }
  }

  async enableSCIM(workspaceId: string, enabledBy: string): Promise<{ success: boolean; token?: string; endpoint?: string; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config) {
        return { success: false, error: 'SSO must be configured before enabling SCIM' };
      }

      const token = this.generateSCIMToken();
      const endpoint = `/api/scim/v2/${workspaceId}`;

      await db
        .update(ssoConfigs)
        .set({
          scimEnabled: true,
          scimToken: token,
          scimEndpoint: endpoint,
          updatedAt: new Date(),
        })
        .where(eq(ssoConfigs.workspaceId, workspaceId));

      await this.logAuditEvent({
        workspaceId,
        userId: enabledBy,
        action: 'scim.enabled',
        resourceType: 'sso_config',
        resourceId: config.id,
      });

      return { success: true, token, endpoint };
    } catch (error: unknown) {
      logger.error('Enable SCIM error:', error);
      return { success: false, error: 'Failed to enable SCIM' };
    }
  }

  async disableSCIM(workspaceId: string, disabledBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config) {
        return { success: false, error: 'SSO is not configured for this workspace' };
      }

      await db
        .update(ssoConfigs)
        .set({
          scimEnabled: false,
          scimToken: null,
          updatedAt: new Date(),
        })
        .where(eq(ssoConfigs.workspaceId, workspaceId));

      await this.logAuditEvent({
        workspaceId,
        userId: disabledBy,
        action: 'scim.disabled',
        resourceType: 'sso_config',
        resourceId: config.id,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('Disable SCIM error:', error);
      return { success: false, error: 'Failed to disable SCIM' };
    }
  }

  async rotateSCIMToken(workspaceId: string, rotatedBy: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config || !config.scimEnabled) {
        return { success: false, error: 'SCIM is not enabled for this workspace' };
      }

      const newToken = this.generateSCIMToken();

      await db
        .update(ssoConfigs)
        .set({
          scimToken: newToken,
          updatedAt: new Date(),
        })
        .where(eq(ssoConfigs.workspaceId, workspaceId));

      await this.logAuditEvent({
        workspaceId,
        userId: rotatedBy,
        action: 'scim.token_rotated',
        resourceType: 'sso_config',
        resourceId: config.id,
      });

      return { success: true, token: newToken };
    } catch (error: unknown) {
      logger.error('Rotate SCIM token error:', error);
      return { success: false, error: 'Failed to rotate SCIM token' };
    }
  }

  async validateSCIMToken(workspaceId: string, token: string): Promise<boolean> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      return config?.scimEnabled === true && config?.scimToken === token;
    } catch (error: unknown) {
      logger.error('Validate SCIM token error:', error);
      return false;
    }
  }

  async handleSAMLResponse(
    workspaceId: string,
    samlResponse: any
  ): Promise<{ success: boolean; userId?: string; isNewUser?: boolean; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config || !config.enabled || config.provider !== 'saml') {
        return { success: false, error: 'SAML SSO is not enabled for this workspace' };
      }

      const attributeMapping = config.attributeMapping as AttributeMapping;
      const email = samlResponse[attributeMapping.email];
      const firstName = samlResponse[attributeMapping.firstName];
      const lastName = samlResponse[attributeMapping.lastName];

      if (!email) {
        return { success: false, error: 'Email not found in SAML response' };
      }

      const allowedDomains = config.allowedDomains as string[];
      if (allowedDomains.length > 0) {
        const emailDomain = email.split('@')[1];
        if (!allowedDomains.includes(emailDomain)) {
          return { success: false, error: 'Email domain not allowed' };
        }
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let userId: string;
      let isNewUser = false;

      if (existingUser) {
        userId = existingUser.id;
      } else if (config.jitProvisioning || config.autoProvision) {
        const [newUser] = await db
          .insert(users)
          .values({
            email,
            firstName,
            lastName,
          })
          .returning();

        userId = newUser.id;
        isNewUser = true;

        const [existingMember] = await db
          .select()
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId)
          ))
          .limit(1);

        if (!existingMember) {
          await db.insert(workspaceMembers).values({
            workspaceId,
            userId,
            roleId: config.defaultRoleId,
            role: config.defaultRole || 'member',
            joinedAt: new Date(),
            status: 'active',
          });
        }

        await this.logAuditEvent({
          workspaceId,
          userId,
          action: 'sso.jit_provision',
          resourceType: 'user',
          resourceId: userId,
          newValues: { email, provider: 'saml' },
        });
      } else {
        return { success: false, error: 'User does not exist and auto-provisioning is disabled' };
      }

      return { success: true, userId, isNewUser };
    } catch (error: unknown) {
      logger.error('Handle SAML response error:', error);
      return { success: false, error: 'Failed to process SAML response' };
    }
  }

  async handleOIDCCallback(
    workspaceId: string,
    tokenData: any,
    userInfo: any
  ): Promise<{ success: boolean; userId?: string; isNewUser?: boolean; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config || !config.enabled || config.provider !== 'oidc') {
        return { success: false, error: 'OIDC SSO is not enabled for this workspace' };
      }

      const attributeMapping = config.attributeMapping as AttributeMapping;
      const email = userInfo[attributeMapping.email];
      const firstName = userInfo[attributeMapping.firstName];
      const lastName = userInfo[attributeMapping.lastName];

      if (!email) {
        return { success: false, error: 'Email not found in user info' };
      }

      const allowedDomains = config.allowedDomains as string[];
      if (allowedDomains.length > 0) {
        const emailDomain = email.split('@')[1];
        if (!allowedDomains.includes(emailDomain)) {
          return { success: false, error: 'Email domain not allowed' };
        }
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let userId: string;
      let isNewUser = false;

      if (existingUser) {
        userId = existingUser.id;
      } else if (config.jitProvisioning || config.autoProvision) {
        const [newUser] = await db
          .insert(users)
          .values({
            email,
            firstName,
            lastName,
          })
          .returning();

        userId = newUser.id;
        isNewUser = true;

        const [existingMember] = await db
          .select()
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId)
          ))
          .limit(1);

        if (!existingMember) {
          await db.insert(workspaceMembers).values({
            workspaceId,
            userId,
            roleId: config.defaultRoleId,
            role: config.defaultRole || 'member',
            joinedAt: new Date(),
            status: 'active',
          });
        }

        await this.logAuditEvent({
          workspaceId,
          userId,
          action: 'sso.jit_provision',
          resourceType: 'user',
          resourceId: userId,
          newValues: { email, provider: 'oidc' },
        });
      } else {
        return { success: false, error: 'User does not exist and auto-provisioning is disabled' };
      }

      return { success: true, userId, isNewUser };
    } catch (error: unknown) {
      logger.error('Handle OIDC callback error:', error);
      return { success: false, error: 'Failed to process OIDC callback' };
    }
  }

  async createSCIMUser(
    workspaceId: string,
    scimUser: SCIMUser
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config || !config.scimEnabled) {
        return { success: false, error: 'SCIM is not enabled for this workspace' };
      }

      const email = scimUser.emails?.find(e => e.primary)?.value || scimUser.emails?.[0]?.value || scimUser.userName;
      if (!email) {
        return { success: false, error: 'Email is required' };
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        return { success: false, error: 'User already exists' };
      }

      const [newUser] = await db
        .insert(users)
        .values({
          email,
          firstName: scimUser.name?.givenName,
          lastName: scimUser.name?.familyName,
        })
        .returning();

      if (scimUser.active) {
        await db.insert(workspaceMembers).values({
          workspaceId,
          userId: newUser.id,
          roleId: config.defaultRoleId,
          role: config.defaultRole || 'member',
          joinedAt: new Date(),
          status: 'active',
        });
      }

      await this.updateSyncStatus(workspaceId, 'success');

      await this.logAuditEvent({
        workspaceId,
        action: 'scim.user_created',
        resourceType: 'user',
        resourceId: newUser.id,
        newValues: { email, externalId: scimUser.externalId },
      });

      return {
        success: true,
        user: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          id: newUser.id,
          userName: email,
          name: {
            givenName: newUser.firstName,
            familyName: newUser.lastName,
          },
          emails: [{ value: email, primary: true }],
          active: scimUser.active,
          externalId: scimUser.externalId,
        },
      };
    } catch (error: unknown) {
      logger.error('Create SCIM user error:', error);
      await this.updateSyncStatus(workspaceId, 'error', String(error));
      return { success: false, error: 'Failed to create user' };
    }
  }

  async updateSCIMUser(
    workspaceId: string,
    userId: string,
    scimUser: Partial<SCIMUser>
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config || !config.scimEnabled) {
        return { success: false, error: 'SCIM is not enabled for this workspace' };
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) {
        return { success: false, error: 'User not found' };
      }

      const updates: any = {};
      if (scimUser.name?.givenName) updates.firstName = scimUser.name.givenName;
      if (scimUser.name?.familyName) updates.lastName = scimUser.name.familyName;
      if (scimUser.emails?.[0]?.value) updates.email = scimUser.emails[0].value;

      if (Object.keys(updates).length > 0) {
        await db
          .update(users)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      if (scimUser.active !== undefined) {
        await db
          .update(workspaceMembers)
          .set({
            status: scimUser.active ? 'active' : 'inactive',
            updatedAt: new Date(),
          })
          .where(and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId)
          ));
      }

      await this.updateSyncStatus(workspaceId, 'success');

      await this.logAuditEvent({
        workspaceId,
        action: 'scim.user_updated',
        resourceType: 'user',
        resourceId: userId,
        previousValues: existingUser,
        newValues: updates,
      });

      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return {
        success: true,
        user: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          id: updatedUser.id,
          userName: updatedUser.email,
          name: {
            givenName: updatedUser.firstName,
            familyName: updatedUser.lastName,
          },
          emails: [{ value: updatedUser.email, primary: true }],
          active: scimUser.active ?? true,
        },
      };
    } catch (error: unknown) {
      logger.error('Update SCIM user error:', error);
      await this.updateSyncStatus(workspaceId, 'error', String(error));
      return { success: false, error: 'Failed to update user' };
    }
  }

  async deleteSCIMUser(
    workspaceId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config || !config.scimEnabled) {
        return { success: false, error: 'SCIM is not enabled for this workspace' };
      }

      await db
        .update(workspaceMembers)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        ));

      await this.updateSyncStatus(workspaceId, 'success');

      await this.logAuditEvent({
        workspaceId,
        action: 'scim.user_deleted',
        resourceType: 'user',
        resourceId: userId,
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('Delete SCIM user error:', error);
      await this.updateSyncStatus(workspaceId, 'error', String(error));
      return { success: false, error: 'Failed to delete user' };
    }
  }

  async getSCIMUsers(
    workspaceId: string,
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<{ totalResults: number; itemsPerPage: number; startIndex: number; Resources: any[] }> {
    try {
      const members = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          status: workspaceMembers.status,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .limit(count)
        .offset(startIndex - 1);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId));

      const resources = members.map(member => ({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: member.id,
        userName: member.email,
        name: {
          givenName: member.firstName,
          familyName: member.lastName,
        },
        emails: [{ value: member.email, primary: true }],
        active: member.status === 'active',
      }));

      return {
        totalResults: countResult?.count || 0,
        itemsPerPage: count,
        startIndex,
        Resources: resources,
      };
    } catch (error: unknown) {
      logger.error('Get SCIM users error:', error);
      return { totalResults: 0, itemsPerPage: count, startIndex, Resources: [] };
    }
  }

  private async updateSyncStatus(workspaceId: string, status: string, error?: string): Promise<void> {
    try {
      await db
        .update(ssoConfigs)
        .set({
          syncStatus: status,
          syncError: error || null,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ssoConfigs.workspaceId, workspaceId));
    } catch (err: unknown) {
      logger.error('Update sync status error:', err);
    }
  }

  private async logAuditEvent(params: any): Promise<void> {
    try {
      await db.insert(workspaceAuditLog).values(params);
    } catch (error: unknown) {
      logger.error('Log audit event error:', error);
    }
  }

  async getIdPMetadata(workspaceId: string): Promise<{ success: boolean; metadata?: any; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config) {
        return { success: false, error: 'SSO is not configured for this workspace' };
      }

      return { success: true, metadata: config.metadata };
    } catch (error: unknown) {
      logger.error('Get IdP metadata error:', error);
      return { success: false, error: 'Failed to get IdP metadata' };
    }
  }

  async testSSOConnection(workspaceId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const config = await this.getSSOConfig(workspaceId);
      if (!config) {
        return { success: false, error: 'SSO is not configured' };
      }

      if (config.provider === 'saml') {
        const metadata = config.metadata as SAMLMetadata;
        if (!metadata.entityId || !metadata.ssoUrl || !metadata.certificate) {
          return { success: false, error: 'Incomplete SAML configuration' };
        }
      } else if (config.provider === 'oidc') {
        const metadata = config.metadata as OIDCMetadata;
        if (!metadata.issuer || !metadata.authorizationEndpoint || !metadata.clientId) {
          return { success: false, error: 'Incomplete OIDC configuration' };
        }
      }

      return { success: true, message: 'SSO configuration is valid' };
    } catch (error: unknown) {
      logger.error('Test SSO connection error:', error);
      return { success: false, error: 'Failed to test SSO connection' };
    }
  }
}

export const ssoService = new SSOService();

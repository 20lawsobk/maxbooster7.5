import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { workspaceService } from '../services/workspaceService';
import { rbacService, type Permission } from '../services/rbacService';
import { approvalWorkflowService, type WorkflowStep } from '../services/approvalWorkflowService';
import { ssoService, type SAMLMetadata, type OIDCMetadata } from '../services/ssoService';
import { logger } from '../logger.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireWorkspaceMember = async (req: AuthenticatedRequest, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const workspaceId = req.params.id || req.params.workspaceId;
  const isMember = await workspaceService.isWorkspaceMember(workspaceId, req.user.id);
  
  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this workspace' });
  }
  next();
};

const requireWorkspaceAdmin = async (req: AuthenticatedRequest, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const workspaceId = req.params.id || req.params.workspaceId;
  const isAdmin = await rbacService.isAdmin(workspaceId, req.user.id);
  
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['artist', 'label', 'agency', 'management']),
  description: z.string().optional(),
  settings: z.object({
    allowMemberInvites: z.boolean().optional(),
    requireApprovalForReleases: z.boolean().optional(),
    requireApprovalForPayouts: z.boolean().optional(),
    defaultMemberRole: z.string().optional(),
    catalogVisibility: z.enum(['private', 'team', 'public']).optional(),
  }).optional(),
  branding: z.object({
    logo: z.string().optional(),
    colors: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
    }).optional(),
  }).optional(),
});

router.post('/create', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createWorkspaceSchema.parse(req.body);
    
    const result = await workspaceService.createWorkspace({
      ...validatedData,
      ownerId: req.user!.id,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ workspace: result.workspace });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Create workspace error:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

router.get('/:id', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspace = await workspaceService.getWorkspace(req.params.id);
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({ workspace });
  } catch (error) {
    logger.error('Get workspace error:', error);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

router.get('/user/workspaces', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaces = await workspaceService.getUserWorkspaces(req.user!.id);
    res.json({ workspaces });
  } catch (error) {
    logger.error('Get user workspaces error:', error);
    res.status(500).json({ error: 'Failed to get workspaces' });
  }
});

router.put('/:id', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await workspaceService.updateWorkspace(
      req.params.id,
      req.body,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ workspace: result.workspace });
  } catch (error) {
    logger.error('Update workspace error:', error);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await workspaceService.deleteWorkspace(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete workspace error:', error);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

router.get('/:id/members', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const members = await workspaceService.getMembers(req.params.id);
    res.json({ members });
  } catch (error) {
    logger.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to get members' });
  }
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
  roleId: z.string().optional(),
  message: z.string().optional(),
});

router.post('/:id/invite', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = inviteSchema.parse(req.body);
    
    const result = await workspaceService.inviteMember({
      workspaceId: req.params.id,
      email: validatedData.email,
      role: validatedData.role,
      roleId: validatedData.roleId,
      invitedBy: req.user!.id,
      message: validatedData.message,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ invitation: result.invitation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Invite member error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

router.post('/invitations/accept', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required' });
    }

    const result = await workspaceService.acceptInvitation(token, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

router.get('/:id/invitations', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invitations = await workspaceService.getPendingInvitations(req.params.id);
    res.json({ invitations });
  } catch (error) {
    logger.error('Get invitations error:', error);
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

router.delete('/:id/invitations/:invitationId', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await workspaceService.cancelInvitation(
      req.params.invitationId,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Cancel invitation error:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
  roleId: z.string().optional(),
});

router.put('/:id/members/:memberId/role', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = updateMemberRoleSchema.parse(req.body);
    
    const result = await workspaceService.updateMemberRole(
      req.params.id,
      req.params.memberId,
      validatedData.role,
      validatedData.roleId,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

router.delete('/:id/members/:memberId', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await workspaceService.removeMember(
      req.params.id,
      req.params.memberId,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

router.get('/:id/roles', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const roles = await rbacService.getWorkspaceRoles(req.params.id);
    res.json({ roles });
  } catch (error) {
    logger.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.object({
    resource: z.enum(['releases', 'analytics', 'royalties', 'social', 'settings', 'team', 'catalog', 'billing']),
    actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'approve', 'publish', 'export'])),
  })),
  parentRoleId: z.string().optional(),
  priority: z.number().optional(),
});

router.post('/:id/roles', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createRoleSchema.parse(req.body);
    
    const result = await rbacService.createRole(req.params.id, {
      name: validatedData.name,
      description: validatedData.description,
      permissions: validatedData.permissions as Permission[],
      parentRoleId: validatedData.parentRoleId,
      priority: validatedData.priority,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ role: result.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Create role error:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.put('/:id/roles/:roleId', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await rbacService.updateRole(req.params.roleId, req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ role: result.role });
  } catch (error) {
    logger.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

router.delete('/:id/roles/:roleId', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await rbacService.deleteRole(req.params.roleId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

router.get('/roles/templates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templates = rbacService.getRoleTemplates();
    res.json({ templates });
  } catch (error) {
    logger.error('Get role templates error:', error);
    res.status(500).json({ error: 'Failed to get role templates' });
  }
});

router.get('/:id/my-permissions', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const permissions = await rbacService.getUserPermissions(req.params.id, req.user!.id);
    res.json({ permissions });
  } catch (error) {
    logger.error('Get my permissions error:', error);
    res.status(500).json({ error: 'Failed to get permissions' });
  }
});

router.get('/:id/workflows', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workflows = await approvalWorkflowService.getWorkspaceWorkflows(req.params.id);
    res.json({ workflows });
  } catch (error) {
    logger.error('Get workflows error:', error);
    res.status(500).json({ error: 'Failed to get workflows' });
  }
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger: z.enum(['release', 'payout', 'social_post', 'royalty_split', 'contract', 'catalog_change']),
  steps: z.array(z.object({
    stepNumber: z.number(),
    name: z.string(),
    approverType: z.enum(['user', 'role', 'any_admin']),
    approverId: z.string().optional(),
    approverRoleId: z.string().optional(),
    required: z.boolean(),
    timeoutHours: z.number().optional(),
  })),
  escalationPolicy: z.object({
    enabled: z.boolean(),
    timeoutHours: z.number(),
    escalateTo: z.string().optional().nullable(),
    notifyOnEscalate: z.boolean().optional(),
  }).optional(),
  conditions: z.any().optional(),
});

router.post('/:id/workflows', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createWorkflowSchema.parse(req.body);
    
    const result = await approvalWorkflowService.createWorkflow({
      workspaceId: req.params.id,
      name: validatedData.name,
      description: validatedData.description,
      trigger: validatedData.trigger,
      steps: validatedData.steps as WorkflowStep[],
      escalationPolicy: validatedData.escalationPolicy,
      conditions: validatedData.conditions,
      createdBy: req.user!.id,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ workflow: result.workflow });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

router.put('/:id/workflows/:workflowId', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await approvalWorkflowService.updateWorkflow(
      req.params.workflowId,
      req.body,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ workflow: result.workflow });
  } catch (error) {
    logger.error('Update workflow error:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

router.delete('/:id/workflows/:workflowId', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await approvalWorkflowService.deleteWorkflow(
      req.params.workflowId,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete workflow error:', error);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

router.get('/:id/approvals/pending', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pendingApprovals = await approvalWorkflowService.getPendingApprovals(
      req.params.id,
      req.user!.id
    );
    res.json({ approvals: pendingApprovals });
  } catch (error) {
    logger.error('Get pending approvals error:', error);
    res.status(500).json({ error: 'Failed to get pending approvals' });
  }
});

router.get('/:id/approvals/history', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await approvalWorkflowService.getApprovalHistory(req.params.id, limit);
    res.json({ history });
  } catch (error) {
    logger.error('Get approval history error:', error);
    res.status(500).json({ error: 'Failed to get approval history' });
  }
});

router.get('/:id/approvals/:requestId', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await approvalWorkflowService.getApprovalRequestWithSteps(req.params.requestId);
    
    if (!result) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    res.json(result);
  } catch (error) {
    logger.error('Get approval request error:', error);
    res.status(500).json({ error: 'Failed to get approval request' });
  }
});

const approvalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});

router.post('/:id/approvals/:requestId/decide', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = approvalDecisionSchema.parse(req.body);
    const { stepNumber } = req.body;
    
    const result = await approvalWorkflowService.processApprovalDecision(
      req.params.requestId,
      stepNumber,
      validatedData.decision,
      req.user!.id,
      validatedData.comment
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Process approval decision error:', error);
    res.status(500).json({ error: 'Failed to process decision' });
  }
});

router.get('/:id/sso/config', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await ssoService.getSSOConfig(req.params.id);
    res.json({ config });
  } catch (error) {
    logger.error('Get SSO config error:', error);
    res.status(500).json({ error: 'Failed to get SSO config' });
  }
});

const samlConfigSchema = z.object({
  entityId: z.string(),
  ssoUrl: z.string().url(),
  sloUrl: z.string().url().optional(),
  certificate: z.string(),
  signatureAlgorithm: z.string().optional(),
  digestAlgorithm: z.string().optional(),
});

const oidcConfigSchema = z.object({
  issuer: z.string().url(),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  userinfoEndpoint: z.string().url(),
  jwksUri: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()),
});

const ssoConfigSchema = z.object({
  provider: z.enum(['saml', 'oidc']),
  metadata: z.union([samlConfigSchema, oidcConfigSchema]),
  attributeMapping: z.object({
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    groups: z.string().optional(),
  }).optional(),
  allowedDomains: z.array(z.string()).optional(),
  autoProvision: z.boolean().optional(),
  jitProvisioning: z.boolean().optional(),
  defaultRoleId: z.string().optional(),
});

router.put('/:id/sso/config', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = ssoConfigSchema.parse(req.body);
    
    let result;
    if (validatedData.provider === 'saml') {
      result = await ssoService.configureSAML(
        req.params.id,
        validatedData.metadata as SAMLMetadata,
        {
          attributeMapping: validatedData.attributeMapping,
          allowedDomains: validatedData.allowedDomains,
          autoProvision: validatedData.autoProvision,
          jitProvisioning: validatedData.jitProvisioning,
          defaultRoleId: validatedData.defaultRoleId,
          configuredBy: req.user!.id,
        }
      );
    } else {
      result = await ssoService.configureOIDC(
        req.params.id,
        validatedData.metadata as OIDCMetadata,
        {
          attributeMapping: validatedData.attributeMapping,
          allowedDomains: validatedData.allowedDomains,
          autoProvision: validatedData.autoProvision,
          jitProvisioning: validatedData.jitProvisioning,
          defaultRoleId: validatedData.defaultRoleId,
          configuredBy: req.user!.id,
        }
      );
    }

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ config: result.config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Configure SSO error:', error);
    res.status(500).json({ error: 'Failed to configure SSO' });
  }
});

router.post('/:id/sso/enable', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ssoService.enableSSO(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Enable SSO error:', error);
    res.status(500).json({ error: 'Failed to enable SSO' });
  }
});

router.post('/:id/sso/disable', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ssoService.disableSSO(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Disable SSO error:', error);
    res.status(500).json({ error: 'Failed to disable SSO' });
  }
});

router.post('/:id/sso/test', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ssoService.testSSOConnection(req.params.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    logger.error('Test SSO error:', error);
    res.status(500).json({ error: 'Failed to test SSO connection' });
  }
});

router.post('/:id/scim/enable', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ssoService.enableSCIM(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ 
      success: true,
      token: result.token,
      endpoint: result.endpoint,
    });
  } catch (error) {
    logger.error('Enable SCIM error:', error);
    res.status(500).json({ error: 'Failed to enable SCIM' });
  }
});

router.post('/:id/scim/disable', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ssoService.disableSCIM(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Disable SCIM error:', error);
    res.status(500).json({ error: 'Failed to disable SCIM' });
  }
});

router.post('/:id/scim/rotate-token', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ssoService.rotateSCIMToken(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, token: result.token });
  } catch (error) {
    logger.error('Rotate SCIM token error:', error);
    res.status(500).json({ error: 'Failed to rotate SCIM token' });
  }
});

router.get('/:id/audit-log', requireAuth, requireWorkspaceAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const logs = await workspaceService.getAuditLog(req.params.id, limit, offset);
    res.json({ logs });
  } catch (error) {
    logger.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

router.get('/:id/catalog', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const catalog = await workspaceService.getCatalog(req.params.id);
    res.json({ catalog });
  } catch (error) {
    logger.error('Get catalog error:', error);
    res.status(500).json({ error: 'Failed to get catalog' });
  }
});

router.post('/:id/catalog', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const hasPermission = await rbacService.checkPermission(req.params.id, req.user!.id, 'catalog', 'create');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { projectId } = req.body;
    const result = await workspaceService.addToCatalog(
      req.params.id,
      projectId,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Add to catalog error:', error);
    res.status(500).json({ error: 'Failed to add to catalog' });
  }
});

router.delete('/:id/catalog/:projectId', requireAuth, requireWorkspaceMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const hasPermission = await rbacService.checkPermission(req.params.id, req.user!.id, 'catalog', 'delete');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const result = await workspaceService.removeFromCatalog(
      req.params.id,
      req.params.projectId,
      req.user!.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Remove from catalog error:', error);
    res.status(500).json({ error: 'Failed to remove from catalog' });
  }
});

export default router;

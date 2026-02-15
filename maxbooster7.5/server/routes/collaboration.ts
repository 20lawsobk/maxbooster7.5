import { Router, Request, Response } from 'express';
import { z } from 'zod';
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

interface ConflictResolution {
  id: string;
  type: 'auto_merge' | 'manual_merge' | 'accept_theirs' | 'accept_mine';
  originalContent: string;
  theirContent: string;
  yourContent: string;
  mergedContent?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

interface PresenceInfo {
  userId: string;
  displayName: string;
  avatar?: string;
  status: 'online' | 'idle' | 'away' | 'offline';
  cursorPosition?: { x: number; y: number; trackId?: string };
  selection?: { start: number; end: number; elementId?: string };
  isTyping?: boolean;
  lastActive: Date;
  color: string;
  role: 'owner' | 'editor' | 'viewer' | 'commenter';
}

interface Version {
  id: string;
  projectId: string;
  version: number;
  name: string;
  description?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  size?: number;
  changes?: string[];
  isAutoSave?: boolean;
  isCurrent?: boolean;
}

interface AccessRequest {
  id: string;
  projectId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requestedAccess: 'view' | 'edit' | 'comment';
  message?: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Date;
  respondedBy?: string;
  respondedAt?: Date;
}

const sessions = new Map<string, Map<string, PresenceInfo>>();
const versions = new Map<string, Version[]>();
const accessRequests = new Map<string, AccessRequest[]>();
const conflicts = new Map<string, ConflictResolution[]>();

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4'
];

const resolveConflictSchema = z.object({
  conflictId: z.string(),
  projectId: z.string(),
  resolution: z.enum(['auto_merge', 'manual_merge', 'accept_theirs', 'accept_mine']),
  mergedContent: z.string().optional(),
  yourContent: z.string(),
  theirContent: z.string(),
});

router.post('/resolve-conflict', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = resolveConflictSchema.parse(req.body);
    
    const resolution: ConflictResolution = {
      id: validatedData.conflictId,
      type: validatedData.resolution,
      originalContent: '',
      theirContent: validatedData.theirContent,
      yourContent: validatedData.yourContent,
      mergedContent: validatedData.mergedContent || 
        (validatedData.resolution === 'accept_theirs' ? validatedData.theirContent : validatedData.yourContent),
      resolvedAt: new Date(),
      resolvedBy: req.user!.id,
    };

    const projectConflicts = conflicts.get(validatedData.projectId) || [];
    projectConflicts.push(resolution);
    conflicts.set(validatedData.projectId, projectConflicts);

    let outcomeType: string;
    let message: string;

    switch (validatedData.resolution) {
      case 'auto_merge':
        outcomeType = 'auto_merge_successful';
        message = 'Changes have been automatically merged';
        break;
      case 'manual_merge':
        outcomeType = 'changes_merged_with_diff';
        message = 'Changes have been merged successfully with your edits';
        break;
      case 'accept_theirs':
        outcomeType = 'their_changes_accepted';
        message = 'Their changes have been accepted';
        break;
      case 'accept_mine':
        outcomeType = 'your_changes_accepted';
        message = 'Your changes have been accepted';
        break;
    }

    logger.info(`Conflict resolved: ${outcomeType} for project ${validatedData.projectId}`);

    res.json({
      success: true,
      outcome: {
        type: outcomeType,
        message,
        resolution,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Resolve conflict error:', error);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

router.get('/presence/:sessionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const sessionPresence = sessions.get(sessionId);

    if (!sessionPresence) {
      const initialPresence: PresenceInfo = {
        userId: req.user!.id,
        displayName: 'You',
        status: 'online',
        lastActive: new Date(),
        color: COLORS[0],
        role: 'owner',
      };
      
      const newSession = new Map<string, PresenceInfo>();
      newSession.set(req.user!.id, initialPresence);
      sessions.set(sessionId, newSession);

      return res.json({
        presence: [initialPresence],
        outcomes: [{
          type: 'session_created',
          message: 'Collaboration session started',
        }],
      });
    }

    const existingUser = sessionPresence.get(req.user!.id);
    if (!existingUser) {
      const newPresence: PresenceInfo = {
        userId: req.user!.id,
        displayName: 'You',
        status: 'online',
        lastActive: new Date(),
        color: COLORS[sessionPresence.size % COLORS.length],
        role: 'editor',
      };
      sessionPresence.set(req.user!.id, newPresence);

      return res.json({
        presence: Array.from(sessionPresence.values()),
        outcomes: [{
          type: 'user_joined_session',
          userId: req.user!.id,
          message: 'You joined the session',
        }],
      });
    }

    existingUser.lastActive = new Date();
    existingUser.status = 'online';

    res.json({
      presence: Array.from(sessionPresence.values()),
    });
  } catch (error) {
    logger.error('Get presence error:', error);
    res.status(500).json({ error: 'Failed to get presence' });
  }
});

const updatePresenceSchema = z.object({
  status: z.enum(['online', 'idle', 'away', 'offline']).optional(),
  cursorPosition: z.object({
    x: z.number(),
    y: z.number(),
    trackId: z.string().optional(),
  }).optional(),
  selection: z.object({
    start: z.number(),
    end: z.number(),
    elementId: z.string().optional(),
  }).optional(),
  isTyping: z.boolean().optional(),
});

router.put('/presence/:sessionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const validatedData = updatePresenceSchema.parse(req.body);
    
    const sessionPresence = sessions.get(sessionId);
    if (!sessionPresence) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const userPresence = sessionPresence.get(req.user!.id);
    if (!userPresence) {
      return res.status(404).json({ error: 'User not in session' });
    }

    const outcomes: any[] = [];
    const previousStatus = userPresence.status;

    if (validatedData.status) {
      userPresence.status = validatedData.status;
      if (previousStatus !== validatedData.status) {
        if (validatedData.status === 'idle' || validatedData.status === 'away') {
          outcomes.push({
            type: 'user_went_idle',
            userId: req.user!.id,
            message: `User went ${validatedData.status}`,
          });
        }
      }
    }

    if (validatedData.cursorPosition) {
      userPresence.cursorPosition = validatedData.cursorPosition;
      outcomes.push({
        type: 'cursor_position_updated',
        userId: req.user!.id,
        position: validatedData.cursorPosition,
      });
    }

    if (validatedData.selection) {
      userPresence.selection = validatedData.selection;
      outcomes.push({
        type: 'user_selection_highlighted',
        userId: req.user!.id,
        selection: validatedData.selection,
      });
    }

    if (validatedData.isTyping !== undefined) {
      userPresence.isTyping = validatedData.isTyping;
      if (validatedData.isTyping) {
        outcomes.push({
          type: 'user_is_typing',
          userId: req.user!.id,
        });
      }
    }

    userPresence.lastActive = new Date();

    res.json({
      success: true,
      presence: userPresence,
      outcomes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Update presence error:', error);
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

router.delete('/presence/:sessionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const sessionPresence = sessions.get(sessionId);
    
    if (sessionPresence) {
      const user = sessionPresence.get(req.user!.id);
      sessionPresence.delete(req.user!.id);
      
      if (sessionPresence.size === 0) {
        sessions.delete(sessionId);
      }

      res.json({
        success: true,
        outcomes: [{
          type: 'user_left_session',
          userId: req.user!.id,
          displayName: user?.displayName || 'User',
          message: 'You left the session',
        }],
      });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    logger.error('Leave session error:', error);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

const createVersionSchema = z.object({
  projectId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  isAutoSave: z.boolean().optional(),
});

router.post('/version', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createVersionSchema.parse(req.body);
    
    const projectVersions = versions.get(validatedData.projectId) || [];
    const nextVersion = projectVersions.length + 1;
    
    projectVersions.forEach(v => v.isCurrent = false);

    const newVersion: Version = {
      id: `v-${Date.now()}`,
      projectId: validatedData.projectId,
      version: nextVersion,
      name: validatedData.name || `Version ${nextVersion}`,
      description: validatedData.description,
      createdBy: req.user!.id,
      createdByName: 'You',
      createdAt: new Date(),
      isAutoSave: validatedData.isAutoSave || false,
      isCurrent: true,
    };

    projectVersions.push(newVersion);
    versions.set(validatedData.projectId, projectVersions);

    const outcomeType = validatedData.isAutoSave ? 'auto_save_completed' : 'new_version_created';
    const message = validatedData.isAutoSave 
      ? 'Auto-save completed' 
      : `Version ${nextVersion} created`;

    logger.info(`Version created: ${newVersion.id} for project ${validatedData.projectId}`);

    res.status(201).json({
      version: newVersion,
      outcome: {
        type: outcomeType,
        message,
        versionId: newVersion.id,
        version: nextVersion,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Create version error:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

router.get('/versions/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectVersions = versions.get(projectId) || [];

    res.json({
      versions: projectVersions.sort((a, b) => b.version - a.version),
      outcome: {
        type: 'version_history_displayed',
        message: `${projectVersions.length} versions found`,
      },
    });
  } catch (error) {
    logger.error('Get versions error:', error);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

router.put('/versions/:projectId/:versionId/restore', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, versionId } = req.params;
    const projectVersions = versions.get(projectId);
    
    if (!projectVersions) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const targetVersion = projectVersions.find(v => v.id === versionId);
    if (!targetVersion) {
      return res.status(404).json({ error: 'Version not found' });
    }

    projectVersions.forEach(v => v.isCurrent = false);
    targetVersion.isCurrent = true;

    res.json({
      success: true,
      version: targetVersion,
      outcome: {
        type: 'version_restored',
        message: `Restored to ${targetVersion.name}`,
        versionId: targetVersion.id,
      },
    });
  } catch (error) {
    logger.error('Restore version error:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

router.post('/versions/:projectId/compare', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { versionAId, versionBId } = req.body;
    
    const projectVersions = versions.get(projectId);
    if (!projectVersions) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const versionA = projectVersions.find(v => v.id === versionAId);
    const versionB = projectVersions.find(v => v.id === versionBId);

    if (!versionA || !versionB) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    res.json({
      comparison: {
        versionA,
        versionB,
        changes: ['Sample change 1', 'Sample change 2'],
      },
      outcome: {
        type: 'version_compared',
        message: `Comparing ${versionA.name} with ${versionB.name}`,
      },
    });
  } catch (error) {
    logger.error('Compare versions error:', error);
    res.status(500).json({ error: 'Failed to compare versions' });
  }
});

router.delete('/versions/:projectId/:versionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, versionId } = req.params;
    const projectVersions = versions.get(projectId);
    
    if (!projectVersions) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const versionIndex = projectVersions.findIndex(v => v.id === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const deletedVersion = projectVersions[versionIndex];
    if (deletedVersion.isCurrent) {
      return res.status(400).json({ error: 'Cannot delete the current version' });
    }

    projectVersions.splice(versionIndex, 1);

    res.json({
      success: true,
      outcome: {
        type: 'version_deleted',
        message: `${deletedVersion.name} has been deleted`,
        versionId,
      },
    });
  } catch (error) {
    logger.error('Delete version error:', error);
    res.status(500).json({ error: 'Failed to delete version' });
  }
});

const accessRequestSchema = z.object({
  projectId: z.string(),
  requestedAccess: z.enum(['view', 'edit', 'comment']),
  message: z.string().optional(),
});

router.post('/access/request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = accessRequestSchema.parse(req.body);
    
    const request: AccessRequest = {
      id: `ar-${Date.now()}`,
      projectId: validatedData.projectId,
      requesterId: req.user!.id,
      requesterName: 'User',
      requesterEmail: req.user!.email,
      requestedAccess: validatedData.requestedAccess,
      message: validatedData.message,
      status: 'pending',
      createdAt: new Date(),
    };

    const projectRequests = accessRequests.get(validatedData.projectId) || [];
    projectRequests.push(request);
    accessRequests.set(validatedData.projectId, projectRequests);

    logger.info(`Access request submitted: ${request.id} for project ${validatedData.projectId}`);

    res.status(201).json({
      request,
      outcome: {
        type: 'access_request_submitted',
        message: `Request for ${validatedData.requestedAccess} access has been submitted`,
        requestId: request.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Submit access request error:', error);
    res.status(500).json({ error: 'Failed to submit access request' });
  }
});

router.get('/access/requests/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectRequests = accessRequests.get(projectId) || [];

    res.json({
      requests: projectRequests.filter(r => r.status === 'pending'),
    });
  } catch (error) {
    logger.error('Get access requests error:', error);
    res.status(500).json({ error: 'Failed to get access requests' });
  }
});

const updateAccessSchema = z.object({
  action: z.enum(['approve', 'deny', 'upgrade', 'downgrade', 'revoke']),
  accessLevel: z.enum(['view', 'edit', 'comment']).optional(),
  reason: z.string().optional(),
});

router.put('/access/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const validatedData = updateAccessSchema.parse(req.body);
    const { projectId } = req.body;

    let outcomeType: string;
    let message: string;

    switch (validatedData.action) {
      case 'approve':
        outcomeType = 'access_request_approved';
        message = `${validatedData.accessLevel || 'edit'} access granted`;
        break;
      case 'deny':
        outcomeType = 'access_request_denied';
        message = validatedData.reason || 'Access request denied';
        break;
      case 'upgrade':
        outcomeType = 'access_upgraded';
        message = `Access upgraded to ${validatedData.accessLevel}`;
        break;
      case 'downgrade':
        outcomeType = 'access_downgraded';
        message = `Access downgraded to ${validatedData.accessLevel}`;
        break;
      case 'revoke':
        outcomeType = 'access_revoked';
        message = 'Access has been revoked';
        break;
    }

    if (projectId) {
      const projectRequests = accessRequests.get(projectId);
      if (projectRequests) {
        const request = projectRequests.find(r => r.requesterId === userId);
        if (request) {
          request.status = validatedData.action === 'approve' ? 'approved' : 'denied';
          request.respondedBy = req.user!.id;
          request.respondedAt = new Date();
        }
      }
    }

    logger.info(`Access updated for user ${userId}: ${validatedData.action}`);

    res.json({
      success: true,
      outcome: {
        type: outcomeType,
        message,
        userId,
        accessLevel: validatedData.accessLevel,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Update access error:', error);
    res.status(500).json({ error: 'Failed to update access' });
  }
});

const commentSchema = z.object({
  projectId: z.string(),
  elementId: z.string().optional(),
  content: z.string(),
  parentId: z.string().optional(),
  mentions: z.array(z.string()).optional(),
  timestamp: z.number().optional(),
});

interface Comment {
  id: string;
  projectId: string;
  elementId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  parentId?: string;
  mentions: string[];
  timestamp?: number;
  resolved: boolean;
  createdAt: Date;
  replies: Comment[];
}

const comments = new Map<string, Comment[]>();

router.post('/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = commentSchema.parse(req.body);
    
    const comment: Comment = {
      id: `c-${Date.now()}`,
      projectId: validatedData.projectId,
      elementId: validatedData.elementId,
      userId: req.user!.id,
      userName: 'You',
      content: validatedData.content,
      parentId: validatedData.parentId,
      mentions: validatedData.mentions || [],
      timestamp: validatedData.timestamp,
      resolved: false,
      createdAt: new Date(),
      replies: [],
    };

    const projectComments = comments.get(validatedData.projectId) || [];
    
    if (validatedData.parentId) {
      const findAndAddReply = (commentsList: Comment[]): boolean => {
        for (const c of commentsList) {
          if (c.id === validatedData.parentId) {
            c.replies.push(comment);
            return true;
          }
          if (findAndAddReply(c.replies)) return true;
        }
        return false;
      };
      findAndAddReply(projectComments);
    } else {
      projectComments.push(comment);
    }
    
    comments.set(validatedData.projectId, projectComments);

    const outcomes: any[] = [{
      type: validatedData.parentId ? 'comment_replied' : 'comment_added',
      message: validatedData.parentId ? 'Reply added' : 'Comment added',
      commentId: comment.id,
    }];

    if (validatedData.mentions && validatedData.mentions.length > 0) {
      outcomes.push({
        type: 'mention_notification_sent',
        message: `${validatedData.mentions.length} user(s) mentioned`,
        mentions: validatedData.mentions,
      });
    }

    res.status(201).json({
      comment,
      outcomes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    logger.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

router.get('/comments/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectComments = comments.get(projectId) || [];

    res.json({
      comments: projectComments,
    });
  } catch (error) {
    logger.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

router.put('/comments/:commentId/resolve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commentId } = req.params;
    const { projectId } = req.body;
    
    const projectComments = comments.get(projectId);
    if (!projectComments) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const findAndResolve = (commentsList: Comment[]): Comment | null => {
      for (const c of commentsList) {
        if (c.id === commentId) {
          c.resolved = true;
          return c;
        }
        const found = findAndResolve(c.replies);
        if (found) return found;
      }
      return null;
    };

    const resolved = findAndResolve(projectComments);
    if (!resolved) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({
      success: true,
      comment: resolved,
      outcome: {
        type: 'comment_resolved',
        message: 'Comment marked as resolved',
        commentId,
      },
    });
  } catch (error) {
    logger.error('Resolve comment error:', error);
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
});

router.put('/comments/:commentId/mention-resolved', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commentId } = req.params;

    res.json({
      success: true,
      outcome: {
        type: 'mention_resolved',
        message: 'Mention marked as read',
        commentId,
      },
    });
  } catch (error) {
    logger.error('Resolve mention error:', error);
    res.status(500).json({ error: 'Failed to resolve mention' });
  }
});

router.get('/conflicts/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectConflicts = conflicts.get(projectId) || [];

    const hasUnresolved = projectConflicts.some((c: any) => c.resolvedBy === undefined || c.resolvedBy === null);

    res.json({
      conflicts: projectConflicts,
      pendingConflict: hasUnresolved
        ? {
            id: projectConflicts.find((c: any) => !c.resolvedBy)?.id || null,
            detected: true,
            details: projectConflicts.find((c: any) => !c.resolvedBy) || null,
          }
        : {
            id: null,
            detected: false,
            details: null,
          },
    });
  } catch (error) {
    logger.error('Get conflicts error:', error);
    res.status(500).json({ error: 'Failed to get conflicts' });
  }
});

router.post('/detect-conflict', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, elementId, yourVersion, baseVersion } = req.body;

    const hasConflict = yourVersion !== baseVersion;

    if (hasConflict) {
      res.json({
        conflict: true,
        outcome: {
          type: 'edit_conflict_detected',
          message: 'Changes conflict with another user\'s edits',
          elementId,
          requiresManualMerge: true,
        },
      });
    } else {
      res.json({
        conflict: false,
        outcome: {
          type: 'no_conflict',
          message: 'No conflicts detected',
        },
      });
    }
  } catch (error) {
    logger.error('Detect conflict error:', error);
    res.status(500).json({ error: 'Failed to detect conflict' });
  }
});

// ===================
// COLLABORATION INVITES
// ===================

interface CollaborationInvite {
  id: string;
  projectId: string;
  inviterId: string;
  inviterName: string;
  inviteeEmail: string;
  role: 'owner' | 'editor' | 'viewer' | 'commenter';
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

const collaborationInvites = new Map<string, CollaborationInvite[]>();

// POST /api/collaborations/invites - Create a collaboration invite
router.post('/invites', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, inviteeEmail, role = 'editor', message } = req.body;
    
    if (!projectId || !inviteeEmail) {
      return res.status(400).json({ error: 'projectId and inviteeEmail are required' });
    }
    
    if (!['owner', 'editor', 'viewer', 'commenter'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, editor, viewer, or commenter' });
    }
    
    const userId = req.user!.id;
    
    // Create collaboration invite
    const invite: CollaborationInvite = {
      id: `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      inviterId: userId,
      inviterName: req.user?.email || 'Unknown User',
      inviteeEmail,
      role,
      message,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };
    
    // Store invite
    if (!collaborationInvites.has(projectId)) {
      collaborationInvites.set(projectId, []);
    }
    collaborationInvites.get(projectId)!.push(invite);
    
    logger.info(`Collaboration invite created: ${invite.id} for project ${projectId}`);
    
    // TODO: Send notification email to invitee
    // await notificationService.sendCollaborationInvite({
    //   to: inviteeEmail,
    //   inviterName: req.user?.username || 'A user',
    //   projectId,
    //   inviteId: invite.id,
    // });
    
    res.json({ 
      success: true, 
      invite: {
        id: invite.id,
        projectId: invite.projectId,
        inviteeEmail: invite.inviteeEmail,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      }
    });
  } catch (error: any) {
    logger.error('Error creating collaboration invite:', error);
    res.status(500).json({ error: 'Failed to create collaboration invite' });
  }
});

// GET /api/collaborations/invites/pending - Get pending collaboration invites
router.get('/invites/pending', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    
    // Get invites sent by user
    const sentInvites: CollaborationInvite[] = [];
    for (const [projectId, invites] of collaborationInvites.entries()) {
      const userInvites = invites.filter(inv => 
        inv.inviterId === userId && inv.status === 'pending'
      );
      sentInvites.push(...userInvites);
    }
    
    // Get invites received by user (by email)
    const receivedInvites: CollaborationInvite[] = [];
    for (const [projectId, invites] of collaborationInvites.entries()) {
      const emailInvites = invites.filter(inv => 
        inv.inviteeEmail === userEmail && inv.status === 'pending'
      );
      receivedInvites.push(...emailInvites);
    }
    
    res.json({
      sent: sentInvites.map(inv => ({
        id: inv.id,
        projectId: inv.projectId,
        inviteeEmail: inv.inviteeEmail,
        role: inv.role,
        status: inv.status,
        message: inv.message,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      })),
      received: receivedInvites.map(inv => ({
        id: inv.id,
        projectId: inv.projectId,
        inviterName: inv.inviterName,
        role: inv.role,
        status: inv.status,
        message: inv.message,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching pending invites:', error);
    res.status(500).json({ error: 'Failed to fetch pending invites' });
  }
});

// POST /api/collaborations/invites/:inviteId/accept - Accept an invite
router.post('/invites/:inviteId/accept', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inviteId } = req.params;
    const userEmail = req.user!.email;
    
    // Find invite
    let foundInvite: CollaborationInvite | null = null;
    let projectId: string | null = null;
    
    for (const [pid, invites] of collaborationInvites.entries()) {
      const invite = invites.find(inv => inv.id === inviteId);
      if (invite) {
        foundInvite = invite;
        projectId = pid;
        break;
      }
    }
    
    if (!foundInvite || !projectId) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    
    if (foundInvite.inviteeEmail !== userEmail) {
      return res.status(403).json({ error: 'Not authorized to accept this invite' });
    }
    
    if (foundInvite.status !== 'pending') {
      return res.status(400).json({ error: 'Invite already responded to' });
    }
    
    if (new Date() > foundInvite.expiresAt) {
      foundInvite.status = 'expired';
      return res.status(400).json({ error: 'Invite has expired' });
    }
    
    // Accept invite
    foundInvite.status = 'accepted';
    foundInvite.respondedAt = new Date();
    
    logger.info(`Collaboration invite accepted: ${inviteId}`);
    
    res.json({ 
      success: true,
      message: 'Invite accepted successfully',
      projectId,
      role: foundInvite.role,
    });
  } catch (error: any) {
    logger.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// POST /api/collaborations/invites/:inviteId/decline - Decline an invite
router.post('/invites/:inviteId/decline', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inviteId } = req.params;
    const userEmail = req.user!.email;
    
    // Find invite
    let foundInvite: CollaborationInvite | null = null;
    
    for (const [pid, invites] of collaborationInvites.entries()) {
      const invite = invites.find(inv => inv.id === inviteId);
      if (invite) {
        foundInvite = invite;
        break;
      }
    }
    
    if (!foundInvite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    
    if (foundInvite.inviteeEmail !== userEmail) {
      return res.status(403).json({ error: 'Not authorized to decline this invite' });
    }
    
    if (foundInvite.status !== 'pending') {
      return res.status(400).json({ error: 'Invite already responded to' });
    }
    
    // Decline invite
    foundInvite.status = 'declined';
    foundInvite.respondedAt = new Date();
    
    logger.info(`Collaboration invite declined: ${inviteId}`);
    
    res.json({ 
      success: true,
      message: 'Invite declined successfully',
    });
  } catch (error: any) {
    logger.error('Error declining invite:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

export default router;

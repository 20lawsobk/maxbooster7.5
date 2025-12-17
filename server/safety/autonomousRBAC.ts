/**
 * AUTONOMOUS SYSTEMS RBAC
 * 
 * Role-Based Access Control for autonomous AI operations.
 * Prevents autonomous systems from performing unauthorized actions.
 */

import { logger } from '../logger.js';

/**
 * Action categories that autonomous systems can perform
 */
export type AutonomousAction = 
  // Content operations
  | 'content:create'
  | 'content:update'
  | 'content:delete'
  | 'content:publish'
  | 'content:schedule'
  
  // Social media operations
  | 'social:post'
  | 'social:schedule'
  | 'social:delete'
  | 'social:analyze'
  
  // Financial operations
  | 'payment:charge'
  | 'payment:refund'
  | 'payment:payout'
  | 'subscription:create'
  | 'subscription:cancel'
  
  // User operations
  | 'user:read'
  | 'user:update'
  | 'user:suspend'
  | 'user:delete'
  
  // Analytics operations
  | 'analytics:read'
  | 'analytics:generate'
  | 'analytics:export'
  
  // Distribution operations
  | 'distribution:submit'
  | 'distribution:update'
  | 'distribution:withdraw'
  
  // System operations
  | 'system:config'
  | 'system:maintenance'
  | 'system:backup'
  
  // Campaign operations
  | 'campaign:create'
  | 'campaign:update'
  | 'campaign:pause'
  | 'campaign:spend';

/**
 * Permission levels for autonomous operations
 */
export type PermissionLevel = 'none' | 'read' | 'suggest' | 'execute' | 'full';

/**
 * RBAC configuration for each autonomous system
 */
interface SystemPermissions {
  name: string;
  description: string;
  permissions: Partial<Record<AutonomousAction, PermissionLevel>>;
  maxSpendPerDay: number; // In cents
  maxActionsPerHour: number;
  requiresApproval: AutonomousAction[];
}

const SYSTEM_PERMISSIONS: Record<string, SystemPermissions> = {
  'autonomous-service': {
    name: 'Autonomous Service',
    description: 'Core autonomous operations for social, ads, distribution',
    permissions: {
      'content:create': 'execute',
      'content:update': 'execute',
      'content:publish': 'suggest', // Requires approval
      'content:schedule': 'execute',
      'social:post': 'suggest', // Requires approval
      'social:schedule': 'execute',
      'social:analyze': 'full',
      'analytics:read': 'full',
      'analytics:generate': 'full',
      'distribution:submit': 'suggest', // Requires approval
    },
    maxSpendPerDay: 0, // Cannot spend money
    maxActionsPerHour: 100,
    requiresApproval: ['content:publish', 'social:post', 'distribution:submit'],
  },
  
  'automation-system': {
    name: 'Automation System',
    description: 'Workflow automation and scheduled tasks',
    permissions: {
      'content:create': 'execute',
      'content:update': 'execute',
      'content:schedule': 'execute',
      'analytics:read': 'full',
      'analytics:generate': 'execute',
      'user:read': 'read',
      'system:maintenance': 'execute',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 500,
    requiresApproval: [],
  },

  'autonomous-updates': {
    name: 'Autonomous Updates',
    description: 'Self-updating and monitoring',
    permissions: {
      'system:config': 'suggest',
      'system:maintenance': 'execute',
      'analytics:read': 'full',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 20,
    requiresApproval: ['system:config'],
  },

  'autonomous-autopilot': {
    name: 'Autonomous Autopilot',
    description: 'Content generation and adaptive learning',
    permissions: {
      'content:create': 'execute',
      'content:update': 'execute',
      'social:analyze': 'full',
      'analytics:read': 'full',
      'analytics:generate': 'full',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 200,
    requiresApproval: [],
  },

  'autopilot-engine': {
    name: 'Autopilot Engine',
    description: 'Social/Ads/Security personas',
    permissions: {
      'social:post': 'suggest',
      'social:schedule': 'execute',
      'campaign:create': 'suggest',
      'campaign:update': 'execute',
      'campaign:pause': 'execute',
      'campaign:spend': 'suggest', // Cannot spend without approval
    },
    maxSpendPerDay: 10000, // $100/day max
    maxActionsPerHour: 100,
    requiresApproval: ['social:post', 'campaign:create', 'campaign:spend'],
  },

  'auto-posting-v1': {
    name: 'Auto Posting V1',
    description: 'Original platform scheduler',
    permissions: {
      'social:schedule': 'execute',
      'content:read': 'full',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 50,
    requiresApproval: [],
  },

  'auto-posting-v2': {
    name: 'Auto Posting V2',
    description: 'Enhanced queue management with BullMQ',
    permissions: {
      'social:schedule': 'execute',
      'social:post': 'execute', // Can post pre-approved content
      'content:read': 'full',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 200,
    requiresApproval: [],
  },

  'auto-post-generator': {
    name: 'Auto Post Generator',
    description: 'AI content generation and trend analysis',
    permissions: {
      'content:create': 'execute',
      'content:update': 'execute',
      'social:analyze': 'full',
      'analytics:read': 'full',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 100,
    requiresApproval: [],
  },

  'autopilot-publisher': {
    name: 'Autopilot Publisher',
    description: 'Cross-platform publishing and analytics',
    permissions: {
      'social:post': 'suggest',
      'social:schedule': 'execute',
      'content:publish': 'suggest',
      'analytics:read': 'full',
    },
    maxSpendPerDay: 0,
    maxActionsPerHour: 100,
    requiresApproval: ['social:post', 'content:publish'],
  },
};

/**
 * Action tracking for rate limiting
 */
interface ActionTracker {
  actionCount: number;
  spentToday: number;
  lastHourActions: number;
  hourStart: Date;
  dayStart: Date;
}

const actionTrackers = new Map<string, ActionTracker>();

/**
 * Pending approval queue
 */
interface PendingApproval {
  id: string;
  systemName: string;
  action: AutonomousAction;
  params: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

const pendingApprovals = new Map<string, PendingApproval>();

/**
 * Check if an autonomous system can perform an action
 */
export function canPerformAction(
  systemName: string,
  action: AutonomousAction,
  spendAmount: number = 0
): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
  const permissions = SYSTEM_PERMISSIONS[systemName];
  
  if (!permissions) {
    return { allowed: false, reason: `Unknown system: ${systemName}` };
  }

  // Check permission level
  const level = permissions.permissions[action];
  if (!level || level === 'none') {
    logger.warn(`[RBAC] ${systemName} attempted unauthorized action: ${action}`);
    return { allowed: false, reason: `Action not permitted: ${action}` };
  }

  // Check if requires approval
  if (permissions.requiresApproval.includes(action)) {
    if (level === 'suggest') {
      return { allowed: false, requiresApproval: true, reason: 'Requires approval' };
    }
  }

  // Check rate limits
  const tracker = getOrCreateTracker(systemName);
  const now = new Date();

  // Reset hourly counter if needed
  if (now.getTime() - tracker.hourStart.getTime() > 3600000) {
    tracker.lastHourActions = 0;
    tracker.hourStart = now;
  }

  // Reset daily counter if needed
  if (now.getTime() - tracker.dayStart.getTime() > 86400000) {
    tracker.spentToday = 0;
    tracker.dayStart = now;
  }

  // Check hourly action limit
  if (tracker.lastHourActions >= permissions.maxActionsPerHour) {
    logger.warn(`[RBAC] ${systemName} exceeded hourly action limit`);
    return { allowed: false, reason: 'Hourly action limit exceeded' };
  }

  // Check daily spend limit
  if (spendAmount > 0 && tracker.spentToday + spendAmount > permissions.maxSpendPerDay) {
    logger.warn(`[RBAC] ${systemName} exceeded daily spend limit`);
    return { allowed: false, reason: 'Daily spend limit exceeded' };
  }

  return { allowed: true };
}

/**
 * Record an action (for rate limiting)
 */
export function recordAction(
  systemName: string,
  action: AutonomousAction,
  spendAmount: number = 0
): void {
  const tracker = getOrCreateTracker(systemName);
  tracker.actionCount++;
  tracker.lastHourActions++;
  tracker.spentToday += spendAmount;
  
  logger.debug(`[RBAC] ${systemName} performed ${action} (hourly: ${tracker.lastHourActions}, spent: $${(tracker.spentToday / 100).toFixed(2)})`);
}

/**
 * Request approval for an action
 */
export function requestApproval(
  systemName: string,
  action: AutonomousAction,
  params: Record<string, any>
): string {
  const id = crypto.randomUUID();
  const approval: PendingApproval = {
    id,
    systemName,
    action,
    params,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    status: 'pending',
  };
  
  pendingApprovals.set(id, approval);
  logger.info(`[RBAC] Approval requested: ${systemName} wants to ${action} (ID: ${id})`);
  
  return id;
}

/**
 * Approve or reject a pending action
 */
export function processApproval(
  approvalId: string,
  approved: boolean,
  approvedBy: string
): boolean {
  const approval = pendingApprovals.get(approvalId);
  
  if (!approval) {
    return false;
  }
  
  if (approval.status !== 'pending') {
    return false;
  }
  
  if (approval.expiresAt < new Date()) {
    approval.status = 'rejected';
    return false;
  }
  
  approval.status = approved ? 'approved' : 'rejected';
  
  logger.info(`[RBAC] Approval ${approvalId} ${approved ? 'APPROVED' : 'REJECTED'} by ${approvedBy}`);
  
  return true;
}

/**
 * Get pending approvals
 */
export function getPendingApprovals(systemName?: string): PendingApproval[] {
  const approvals = Array.from(pendingApprovals.values())
    .filter(a => a.status === 'pending' && a.expiresAt > new Date());
  
  if (systemName) {
    return approvals.filter(a => a.systemName === systemName);
  }
  
  return approvals;
}

/**
 * Get or create action tracker for a system
 */
function getOrCreateTracker(systemName: string): ActionTracker {
  let tracker = actionTrackers.get(systemName);
  
  if (!tracker) {
    tracker = {
      actionCount: 0,
      spentToday: 0,
      lastHourActions: 0,
      hourStart: new Date(),
      dayStart: new Date(),
    };
    actionTrackers.set(systemName, tracker);
  }
  
  return tracker;
}

/**
 * Get RBAC status for all systems
 */
export function getRBACStatus(): Record<string, {
  permissions: Partial<Record<AutonomousAction, PermissionLevel>>;
  actionCount: number;
  spentToday: number;
  pendingApprovals: number;
}> {
  const result: Record<string, any> = {};
  
  for (const [name, config] of Object.entries(SYSTEM_PERMISSIONS)) {
    const tracker = actionTrackers.get(name);
    const pending = getPendingApprovals(name);
    
    result[name] = {
      permissions: config.permissions,
      actionCount: tracker?.actionCount || 0,
      spentToday: tracker?.spentToday || 0,
      pendingApprovals: pending.length,
    };
  }
  
  return result;
}

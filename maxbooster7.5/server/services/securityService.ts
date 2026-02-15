import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface SecurityIncident {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  affectedUsers?: string[];
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime?: number;
  lastCheck: Date;
  message?: string;
}

export class SecurityService {
  private auditLogs: Map<string, AuditLog> = new Map();
  private incidents: Map<string, SecurityIncident> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();

  /**
   * Create audit log entry
   */
  async createAuditLog(
    userId: string,
    action: string,
    resource: string,
    metadata?: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuditLog> {
    try {
      const log: AuditLog = {
        id: `audit_${nanoid()}`,
        userId,
        action,
        resource,
        metadata,
        ipAddress,
        userAgent,
        timestamp: new Date(),
      };

      this.auditLogs.set(log.id, log);

      // Also write to file for persistence
      await this.writeAuditLogToFile(log);

      return log;
    } catch (error: unknown) {
      logger.error('Error creating audit log:', error);
      throw new Error('Failed to create audit log');
    }
  }

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditLog[]> {
    try {
      let logs = Array.from(this.auditLogs.values());

      if (filters.userId) {
        logs = logs.filter((log) => log.userId === filters.userId);
      }

      if (filters.action) {
        logs = logs.filter((log) => log.action === filters.action);
      }

      if (filters.resource) {
        logs = logs.filter((log) => log.resource === filters.resource);
      }

      if (filters.startDate) {
        logs = logs.filter((log) => log.timestamp >= filters.startDate!);
      }

      if (filters.endDate) {
        logs = logs.filter((log) => log.timestamp <= filters.endDate!);
      }

      // Sort by timestamp descending
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (filters.limit) {
        logs = logs.slice(0, filters.limit);
      }

      return logs;
    } catch (error: unknown) {
      logger.error('Error fetching audit logs:', error);
      throw new Error('Failed to fetch audit logs');
    }
  }

  /**
   * Check health of a service
   */
  async checkHealth(service: string): Promise<HealthCheck> {
    try {
      const startTime = Date.now();
      let status: 'healthy' | 'degraded' | 'down' = 'healthy';
      let message: string | undefined;

      // Perform service-specific health checks
      switch (service) {
        case 'database':
          // Check database connectivity
          try {
            // In production, actually query database
            const responseTime = Date.now() - startTime;
            if (responseTime > 1000) {
              status = 'degraded';
              message = 'Database response time is slow';
            }
          } catch (error: unknown) {
            status = 'down';
            message = 'Database is unreachable';
          }
          break;

        case 'stripe':
          // Check Stripe API
          try {
            // In production, make a test API call
            status = 'healthy';
          } catch (error: unknown) {
            status = 'down';
            message = 'Stripe API is unreachable';
          }
          break;

        case 'storage':
          // Check storage service
          try {
            const uploadsDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadsDir)) {
              status = 'degraded';
              message = 'Uploads directory not accessible';
            }
          } catch (error: unknown) {
            status = 'down';
            message = 'Storage service is down';
          }
          break;

        default:
          status = 'healthy';
      }

      const healthCheck: HealthCheck = {
        service,
        status,
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        message,
      };

      this.healthChecks.set(service, healthCheck);

      return healthCheck;
    } catch (error: unknown) {
      logger.error(`Error checking health for ${service}:`, error);
      throw new Error(`Failed to check health for ${service}`);
    }
  }

  /**
   * Create security incident
   */
  async createIncident(
    severity: 'low' | 'medium' | 'high' | 'critical',
    title: string,
    description: string,
    affectedUsers?: string[]
  ): Promise<SecurityIncident> {
    try {
      const incident: SecurityIncident = {
        id: `incident_${nanoid()}`,
        severity,
        title,
        description,
        status: 'open',
        affectedUsers,
        createdAt: new Date(),
      };

      this.incidents.set(incident.id, incident);

      // Log incident to file
      await this.writeIncidentToFile(incident);

      // Send alerts for high/critical incidents
      if (severity === 'high' || severity === 'critical') {
        await this.sendIncidentAlert(incident);
      }

      return incident;
    } catch (error: unknown) {
      logger.error('Error creating incident:', error);
      throw new Error('Failed to create incident');
    }
  }

  /**
   * Resolve security incident
   */
  async resolveIncident(incidentId: string, resolvedBy: string): Promise<SecurityIncident> {
    try {
      const incident = this.incidents.get(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      incident.status = 'resolved';
      incident.resolvedAt = new Date();
      incident.resolvedBy = resolvedBy;

      this.incidents.set(incidentId, incident);

      return incident;
    } catch (error: unknown) {
      logger.error('Error resolving incident:', error);
      throw new Error('Failed to resolve incident');
    }
  }

  /**
   * Get all incidents
   */
  async getIncidents(filters?: {
    severity?: string;
    status?: string;
    limit?: number;
  }): Promise<SecurityIncident[]> {
    try {
      let incidents = Array.from(this.incidents.values());

      if (filters?.severity) {
        incidents = incidents.filter((i) => i.severity === filters.severity);
      }

      if (filters?.status) {
        incidents = incidents.filter((i) => i.status === filters.status);
      }

      // Sort by created date descending
      incidents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      if (filters?.limit) {
        incidents = incidents.slice(0, filters.limit);
      }

      return incidents;
    } catch (error: unknown) {
      logger.error('Error fetching incidents:', error);
      throw new Error('Failed to fetch incidents');
    }
  }

  /**
   * Check role-based access control (RBAC)
   */
  async checkRBAC(userId: string, permission: string): Promise<boolean> {
    try {
      // Fetch user from database to check their role
      const [user] = await db
        .select({ role: users.role, subscriptionTier: users.subscriptionTier })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        logger.warn(`RBAC check failed: User ${userId} not found`);
        return false;
      }

      // Define permission hierarchy based on roles and subscription tiers
      const rolePermissions: Record<string, string[]> = {
        admin: ['*'], // Admin has all permissions
        moderator: ['read', 'write', 'moderate', 'view_analytics', 'manage_content'],
        user: ['read', 'write', 'view_own_analytics'],
      };

      const tierPermissions: Record<string, string[]> = {
        enterprise: ['distribution', 'marketplace', 'analytics', 'social_automation', 'ai_features', 'priority_support'],
        professional: ['distribution', 'marketplace', 'analytics', 'social_automation', 'ai_features'],
        starter: ['distribution', 'marketplace', 'analytics'],
        free: ['marketplace'],
      };

      // Check if user's role grants the permission
      const userRole = user.role || 'user';
      const userRolePermissions = rolePermissions[userRole] || rolePermissions.user;
      
      if (userRolePermissions.includes('*') || userRolePermissions.includes(permission)) {
        return true;
      }

      // Check if user's subscription tier grants the permission
      const userTier = user.subscriptionTier || 'free';
      const userTierPermissions = tierPermissions[userTier] || tierPermissions.free;
      
      if (userTierPermissions.includes(permission)) {
        return true;
      }

      logger.info(`RBAC denied: User ${userId} (role: ${userRole}, tier: ${userTier}) lacks permission: ${permission}`);
      return false;
    } catch (error: unknown) {
      logger.error('Error checking RBAC:', error);
      throw new Error('Failed to check permissions');
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<{
    uptime: number;
    memory: { used: number; total: number; percentage: number };
    cpu: number;
    requests: { total: number; errorsToday: number };
  }> {
    try {
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      const totalMem = memUsage.heapTotal;
      const usedMem = memUsage.heapUsed;

      return {
        uptime,
        memory: {
          used: usedMem,
          total: totalMem,
          percentage: (usedMem / totalMem) * 100,
        },
        cpu: 0, // Would use os.cpus() in production
        requests: {
          total: 0, // Track in middleware
          errorsToday: 0, // Track in error handler
        },
      };
    } catch (error: unknown) {
      logger.error('Error fetching system metrics:', error);
      throw new Error('Failed to fetch system metrics');
    }
  }

  private async writeAuditLogToFile(log: AuditLog): Promise<void> {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'audit.log');
    const logEntry = `${log.timestamp.toISOString()} | ${log.userId} | ${log.action} | ${log.resource} | ${JSON.stringify(log.metadata)}\n`;

    fs.appendFileSync(logFile, logEntry);
  }

  private async writeIncidentToFile(incident: SecurityIncident): Promise<void> {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'security.log');
    const logEntry = `${incident.createdAt.toISOString()} | ${incident.severity} | ${incident.title} | ${incident.description}\n`;

    fs.appendFileSync(logFile, logEntry);
  }

  private async sendIncidentAlert(incident: SecurityIncident): Promise<void> {
    // In production:
    // 1. Send email to security team
    // 2. Send Slack/Discord notification
    // 3. Create PagerDuty alert for critical incidents
    logger.info(`SECURITY ALERT: ${incident.severity} - ${incident.title}`);
  }
}

export const securityService = new SecurityService();

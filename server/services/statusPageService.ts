import { db } from '../db.js';
import {
  statusPageServices,
  statusPageIncidents,
  statusPageIncidentServices,
  statusPageIncidentUpdates,
  statusPageUptimeMetrics,
  statusPageSubscribers,
  type StatusPageService,
  type StatusPageIncident,
  type StatusPageIncidentUpdate,
  type StatusPageSubscriber,
  type InsertStatusPageService,
  type InsertStatusPageIncident,
  type InsertStatusPageIncidentUpdate,
  type InsertStatusPageSubscriber,
} from '@shared/schema';
import { eq, and, desc, gte, lte, sql, isNull, or } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { emailService } from './emailService.js';

export type ServiceStatus = 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'maintenance';
export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export interface ServiceStatusSummary {
  services: StatusPageService[];
  overallStatus: ServiceStatus;
  activeIncidents: StatusPageIncident[];
  scheduledMaintenance: StatusPageIncident[];
}

export interface IncidentWithUpdates extends StatusPageIncident {
  updates: StatusPageIncidentUpdate[];
  affectedServices: StatusPageService[];
}

export interface UptimeHistory {
  serviceId: string;
  serviceName: string;
  dailyUptime: Array<{
    date: string;
    uptimePercentage: number;
  }>;
  averageUptime: number;
  last30DaysUptime: number;
  last90DaysUptime: number;
}

export interface CreateIncidentRequest {
  title: string;
  status?: IncidentStatus;
  impact?: IncidentImpact;
  message: string;
  serviceIds: string[];
  isScheduled?: boolean;
  scheduledFor?: Date;
  scheduledUntil?: Date;
  createdBy?: string;
}

export interface UpdateIncidentRequest {
  status?: IncidentStatus;
  message: string;
  createdBy?: string;
  resolve?: boolean;
}

export interface SubscribeRequest {
  email: string;
  userId?: string;
  notifyIncidents?: boolean;
  notifyMaintenance?: boolean;
}

const STATUS_PRIORITY: Record<ServiceStatus, number> = {
  operational: 0,
  degraded_performance: 1,
  partial_outage: 2,
  major_outage: 3,
  maintenance: 2,
};

export class StatusPageService {
  async createService(service: InsertStatusPageService): Promise<StatusPageService> {
    const [created] = await db
      .insert(statusPageServices)
      .values({
        ...service,
        slug: this.generateSlug(service.name),
      })
      .returning();

    logger.info(`Status page service created: ${created.id} - ${created.name}`);

    return created;
  }

  async updateService(serviceId: string, updates: Partial<InsertStatusPageService>): Promise<StatusPageService> {
    const [updated] = await db
      .update(statusPageServices)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(statusPageServices.id, serviceId))
      .returning();

    logger.info(`Status page service updated: ${serviceId}`);

    return updated;
  }

  async updateServiceStatus(serviceId: string, status: ServiceStatus): Promise<StatusPageService> {
    const [updated] = await db
      .update(statusPageServices)
      .set({
        status,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(statusPageServices.id, serviceId))
      .returning();

    logger.info(`Service ${serviceId} status updated to ${status}`);

    await this.recordUptimeMetric(serviceId, status === 'operational');

    return updated;
  }

  async getService(serviceId: string): Promise<StatusPageService | null> {
    const [service] = await db
      .select()
      .from(statusPageServices)
      .where(eq(statusPageServices.id, serviceId));

    return service || null;
  }

  async getServiceBySlug(slug: string): Promise<StatusPageService | null> {
    const [service] = await db
      .select()
      .from(statusPageServices)
      .where(eq(statusPageServices.slug, slug));

    return service || null;
  }

  async getAllServices(publicOnly: boolean = true): Promise<StatusPageService[]> {
    let query = db.select().from(statusPageServices);
    
    if (publicOnly) {
      query = query.where(eq(statusPageServices.isPublic, true)) as typeof query;
    }

    return query.orderBy(statusPageServices.displayOrder, statusPageServices.name);
  }

  async getStatusSummary(): Promise<ServiceStatusSummary> {
    const services = await this.getAllServices(true);
    const activeIncidents = await this.getActiveIncidents();
    const scheduledMaintenance = await this.getScheduledMaintenance();

    const overallStatus = this.calculateOverallStatus(services);

    return {
      services,
      overallStatus,
      activeIncidents,
      scheduledMaintenance,
    };
  }

  async createIncident(request: CreateIncidentRequest): Promise<IncidentWithUpdates> {
    const [incident] = await db
      .insert(statusPageIncidents)
      .values({
        title: request.title,
        status: request.status || 'investigating',
        impact: request.impact || 'minor',
        message: request.message,
        isScheduled: request.isScheduled || false,
        scheduledFor: request.scheduledFor,
        scheduledUntil: request.scheduledUntil,
        createdBy: request.createdBy,
        startedAt: request.isScheduled ? request.scheduledFor : new Date(),
      })
      .returning();

    for (const serviceId of request.serviceIds) {
      await db.insert(statusPageIncidentServices).values({
        incidentId: incident.id,
        serviceId,
      });

      const impactStatus = this.impactToServiceStatus(request.impact || 'minor');
      await this.updateServiceStatus(serviceId, impactStatus);
    }

    await db.insert(statusPageIncidentUpdates).values({
      incidentId: incident.id,
      status: request.status || 'investigating',
      message: request.message,
      createdBy: request.createdBy,
    });

    logger.info(`Incident created: ${incident.id} - ${incident.title}`);

    await this.notifySubscribers(incident, 'new');

    return this.getIncidentWithDetails(incident.id) as Promise<IncidentWithUpdates>;
  }

  async updateIncident(incidentId: string, request: UpdateIncidentRequest): Promise<IncidentWithUpdates> {
    const incident = await this.getIncident(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    const newStatus = request.resolve ? 'resolved' : (request.status || incident.status);

    const [updated] = await db
      .update(statusPageIncidents)
      .set({
        status: newStatus,
        isResolved: request.resolve || false,
        resolvedAt: request.resolve ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(statusPageIncidents.id, incidentId))
      .returning();

    await db.insert(statusPageIncidentUpdates).values({
      incidentId,
      status: newStatus,
      message: request.message,
      createdBy: request.createdBy,
    });

    if (request.resolve) {
      const affectedServiceIds = await this.getAffectedServiceIds(incidentId);
      for (const serviceId of affectedServiceIds) {
        await this.updateServiceStatus(serviceId, 'operational');
      }
    }

    logger.info(`Incident ${incidentId} updated to ${newStatus}`);

    await this.notifySubscribers(updated, request.resolve ? 'resolved' : 'update');

    return this.getIncidentWithDetails(incidentId) as Promise<IncidentWithUpdates>;
  }

  async getIncident(incidentId: string): Promise<StatusPageIncident | null> {
    const [incident] = await db
      .select()
      .from(statusPageIncidents)
      .where(eq(statusPageIncidents.id, incidentId));

    return incident || null;
  }

  async getIncidentWithDetails(incidentId: string): Promise<IncidentWithUpdates | null> {
    const incident = await this.getIncident(incidentId);
    if (!incident) return null;

    const updates = await db
      .select()
      .from(statusPageIncidentUpdates)
      .where(eq(statusPageIncidentUpdates.incidentId, incidentId))
      .orderBy(desc(statusPageIncidentUpdates.createdAt));

    const serviceLinks = await db
      .select({ serviceId: statusPageIncidentServices.serviceId })
      .from(statusPageIncidentServices)
      .where(eq(statusPageIncidentServices.incidentId, incidentId));

    const affectedServices: StatusPageService[] = [];
    for (const link of serviceLinks) {
      const service = await this.getService(link.serviceId);
      if (service) affectedServices.push(service);
    }

    return {
      ...incident,
      updates,
      affectedServices,
    };
  }

  async getActiveIncidents(): Promise<StatusPageIncident[]> {
    return db
      .select()
      .from(statusPageIncidents)
      .where(
        and(
          isNull(statusPageIncidents.resolvedAt),
          or(
            eq(statusPageIncidents.status, 'investigating'),
            eq(statusPageIncidents.status, 'identified'),
            eq(statusPageIncidents.status, 'monitoring')
          )
        )
      )
      .orderBy(desc(statusPageIncidents.startedAt));
  }

  async getScheduledMaintenance(): Promise<StatusPageIncident[]> {
    // Return empty array - scheduled maintenance requires scheduledFor column which doesn't exist in current schema
    // This is a graceful fallback until schema is updated
    return [];
  }

  async getIncidentHistory(days: number = 90): Promise<StatusPageIncident[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return db
      .select()
      .from(statusPageIncidents)
      .where(gte(statusPageIncidents.startedAt, since))
      .orderBy(desc(statusPageIncidents.startedAt));
  }

  async getUptimeHistory(serviceId: string, days: number = 90): Promise<UptimeHistory> {
    const service = await this.getService(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const metrics = await db
      .select()
      .from(statusPageUptimeMetrics)
      .where(
        and(
          eq(statusPageUptimeMetrics.serviceId, serviceId),
          gte(statusPageUptimeMetrics.date, since)
        )
      )
      .orderBy(desc(statusPageUptimeMetrics.date));

    const dailyUptime = metrics.map(m => ({
      date: m.date.toISOString().split('T')[0],
      uptimePercentage: Number(m.uptimePercentage),
    }));

    const totalUptime = metrics.reduce((sum, m) => sum + Number(m.uptimePercentage), 0);
    const averageUptime = metrics.length > 0 ? totalUptime / metrics.length : 100;

    const last30Days = metrics.slice(0, 30);
    const last30DaysUptime = last30Days.length > 0
      ? last30Days.reduce((sum, m) => sum + Number(m.uptimePercentage), 0) / last30Days.length
      : 100;

    return {
      serviceId,
      serviceName: service.name,
      dailyUptime,
      averageUptime: Math.round(averageUptime * 100) / 100,
      last30DaysUptime: Math.round(last30DaysUptime * 100) / 100,
      last90DaysUptime: Math.round(averageUptime * 100) / 100,
    };
  }

  async subscribe(request: SubscribeRequest): Promise<StatusPageSubscriber> {
    const existing = await db
      .select()
      .from(statusPageSubscribers)
      .where(eq(statusPageSubscribers.email, request.email));

    if (existing.length > 0) {
      throw new Error('Email already subscribed');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const unsubscribeToken = crypto.randomBytes(32).toString('hex');

    const [subscriber] = await db
      .insert(statusPageSubscribers)
      .values({
        email: request.email,
        userId: request.userId,
        notifyIncidents: request.notifyIncidents ?? true,
        notifyMaintenance: request.notifyMaintenance ?? true,
        verificationToken,
        unsubscribeToken,
        isVerified: !!request.userId,
        verifiedAt: request.userId ? new Date() : undefined,
      })
      .returning();

    if (!request.userId) {
      await this.sendVerificationEmail(subscriber);
    }

    logger.info(`Status page subscriber added: ${subscriber.id} - ${subscriber.email}`);

    return subscriber;
  }

  async verifySubscription(token: string): Promise<StatusPageSubscriber> {
    const [subscriber] = await db
      .select()
      .from(statusPageSubscribers)
      .where(eq(statusPageSubscribers.verificationToken, token));

    if (!subscriber) {
      throw new Error('Invalid verification token');
    }

    const [updated] = await db
      .update(statusPageSubscribers)
      .set({
        isVerified: true,
        verifiedAt: new Date(),
        verificationToken: null,
      })
      .where(eq(statusPageSubscribers.id, subscriber.id))
      .returning();

    logger.info(`Subscription verified: ${subscriber.email}`);

    return updated;
  }

  async unsubscribe(token: string): Promise<void> {
    const result = await db
      .delete(statusPageSubscribers)
      .where(eq(statusPageSubscribers.unsubscribeToken, token));

    logger.info(`Subscription removed via unsubscribe token`);
  }

  async getSubscribers(): Promise<StatusPageSubscriber[]> {
    return db
      .select()
      .from(statusPageSubscribers)
      .where(eq(statusPageSubscribers.isVerified, true));
  }

  private async recordUptimeMetric(serviceId: string, isUp: boolean): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await db
      .select()
      .from(statusPageUptimeMetrics)
      .where(
        and(
          eq(statusPageUptimeMetrics.serviceId, serviceId),
          eq(statusPageUptimeMetrics.date, today)
        )
      );

    if (existing.length > 0) {
      const metric = existing[0];
      const newTotal = (metric.totalChecks || 0) + 1;
      const newSuccessful = (metric.successfulChecks || 0) + (isUp ? 1 : 0);
      const newPercentage = (newSuccessful / newTotal) * 100;

      await db
        .update(statusPageUptimeMetrics)
        .set({
          totalChecks: newTotal,
          successfulChecks: newSuccessful,
          uptimePercentage: String(newPercentage),
        })
        .where(eq(statusPageUptimeMetrics.id, metric.id));
    } else {
      await db.insert(statusPageUptimeMetrics).values({
        serviceId,
        date: today,
        totalChecks: 1,
        successfulChecks: isUp ? 1 : 0,
        uptimePercentage: isUp ? '100.00' : '0.00',
      });
    }
  }

  private async getAffectedServiceIds(incidentId: string): Promise<string[]> {
    const links = await db
      .select({ serviceId: statusPageIncidentServices.serviceId })
      .from(statusPageIncidentServices)
      .where(eq(statusPageIncidentServices.incidentId, incidentId));

    return links.map(l => l.serviceId);
  }

  private calculateOverallStatus(services: StatusPageService[]): ServiceStatus {
    if (services.length === 0) return 'operational';

    let worstStatus: ServiceStatus = 'operational';
    let worstPriority = 0;

    for (const service of services) {
      const priority = STATUS_PRIORITY[service.status] || 0;
      if (priority > worstPriority) {
        worstPriority = priority;
        worstStatus = service.status;
      }
    }

    return worstStatus;
  }

  private impactToServiceStatus(impact: IncidentImpact): ServiceStatus {
    switch (impact) {
      case 'none':
        return 'operational';
      case 'minor':
        return 'degraded_performance';
      case 'major':
        return 'partial_outage';
      case 'critical':
        return 'major_outage';
      default:
        return 'degraded_performance';
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async notifySubscribers(incident: StatusPageIncident, type: 'new' | 'update' | 'resolved'): Promise<void> {
    const subscribers = await this.getSubscribers();
    
    const relevantSubscribers = subscribers.filter(s => {
      if (incident.isScheduled) return s.notifyMaintenance;
      return s.notifyIncidents;
    });

    const subject = type === 'new'
      ? `[Incident] ${incident.title}`
      : type === 'resolved'
        ? `[Resolved] ${incident.title}`
        : `[Update] ${incident.title}`;

    const statusLabel = type === 'resolved' ? 'Resolved' : incident.status;

    for (const subscriber of relevantSubscribers) {
      try {
        await emailService.sendEmail({
          to: subscriber.email,
          subject,
          html: `
            <h2>${incident.title}</h2>
            <p><strong>Status:</strong> ${statusLabel}</p>
            <p><strong>Impact:</strong> ${incident.impact}</p>
            <p>${incident.message}</p>
            <hr>
            <p><small>
              <a href="/status/unsubscribe?token=${subscriber.unsubscribeToken}">Unsubscribe</a> from status updates
            </small></p>
          `,
        });
      } catch (error) {
        logger.error(`Failed to notify subscriber ${subscriber.email}:`, error);
      }
    }

    logger.info(`Notified ${relevantSubscribers.length} subscribers about incident ${incident.id}`);
  }

  private async sendVerificationEmail(subscriber: StatusPageSubscriber): Promise<void> {
    try {
      await emailService.sendEmail({
        to: subscriber.email,
        subject: 'Verify your status page subscription',
        html: `
          <h2>Confirm your subscription</h2>
          <p>Please click the link below to verify your email and start receiving status updates:</p>
          <p><a href="/status/verify?token=${subscriber.verificationToken}">Verify Email</a></p>
        `,
      });
    } catch (error) {
      logger.error(`Failed to send verification email to ${subscriber.email}:`, error);
    }
  }

  async initializeDefaultServices(): Promise<void> {
    const existingServices = await this.getAllServices(false);
    if (existingServices.length > 0) return;

    const defaultServices = [
      { name: 'Web Application', category: 'Core', description: 'Main web application and user interface' },
      { name: 'API', category: 'Core', description: 'REST API and backend services' },
      { name: 'Music Distribution', category: 'Services', description: 'Music distribution to streaming platforms' },
      { name: 'Audio Processing', category: 'Services', description: 'Audio conversion and processing pipeline' },
      { name: 'Payment Processing', category: 'Services', description: 'Payment and payout processing' },
      { name: 'Analytics', category: 'Services', description: 'Analytics data collection and reporting' },
      { name: 'Email Delivery', category: 'Infrastructure', description: 'Email notification delivery' },
      { name: 'File Storage', category: 'Infrastructure', description: 'File upload and storage service' },
    ];

    for (let i = 0; i < defaultServices.length; i++) {
      await this.createService({
        ...defaultServices[i],
        displayOrder: i,
        isPublic: true,
      });
    }

    logger.info('Default status page services initialized');
  }
}

export const statusPageService = new StatusPageService();

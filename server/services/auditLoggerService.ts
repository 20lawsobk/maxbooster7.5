import { db } from "../db.js";
import { auditLogs, type AuditLog } from "@shared/schema";
import { eq, and, lt, desc, sql, gte, type SQL, type SQLWrapper } from "drizzle-orm";
import { logger } from "../logger.js";
import cron, { type ScheduledTask } from "node-cron";
import crypto from "crypto";

export interface AuditLogEntry {
  userId?: string;
  userEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  result?: "success" | "failure" | "error";
  riskLevel?: "low" | "medium" | "high" | "critical";
  requestId?: string;
  sessionId?: string;
  statusCode?: number;
}

export interface AuditLogQueryOptions {
  userId?: string;
  action?: string;
  resourceType?: string;
  riskLevel?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export class AuditLoggerService {
  private static instance: AuditLoggerService;
  private lastHash: string | null = null;
  private archivalCronJob: ScheduledTask | null = null;
  private readonly RETENTION_DAYS = 90;

  private constructor() {}

  public static getInstance(): AuditLoggerService {
    if (!AuditLoggerService?.instance) {
      AuditLoggerService.instance = new AuditLoggerService();
    }
    return AuditLoggerService?.instance;
  }

  public initialize(): void {
    this.archivalCronJob = cron?.schedule(
      "0 3 * * *",
      async () => {
        await this.archiveOldLogs();
      },
      {
        timezone: "UTC",
      },
    );

    logger.info(
      "✅ AuditLoggerService initialized - daily archival job at 3 AM UTC",
    );
  }

  public stop(): void {
    if (this.archivalCronJob) {
      this.archivalCronJob.stop();
      logger.info("🛑 AuditLoggerService stopped");
    }
  }

  private generateHash(entry: AuditLogEntry, timestamp: Date): string {
    const data = JSON.stringify({
      ...entry,
      timestamp: timestamp.toISOString(),
      prevHash: this.lastHash,
    });
    return crypto?.createHash("sha256").update(data).digest("hex");
  }

  public async log(entry: AuditLogEntry): Promise<AuditLog | null> {
    try {
      const timestamp = new Date();
      // Generate hash for chaining (stored in details since schema has no hash column)
      const hash = this.generateHash(entry, timestamp);
      const prevHash = this.lastHash;

      const [auditLog] = await db
        .insert(auditLogs)
        .values({
          timestamp,
          userId: entry.userId || null,
          userEmail: entry.userEmail || null,
          action: entry.action,
          // schema column is "resource" (not resourceType); combine type+id for context
          resource: entry.resourceType || "unknown",
          ip: entry.ipAddress || "0.0.0.0",
          userAgent: entry.userAgent || null,
          details: {
            ...(entry.details || {}),
            resourceId: entry.resourceId || null,
            requestId: entry.requestId || null,
            statusCode: entry.statusCode || null,
            hash,
            prevHash,
          },
          result: entry.result || "success",
          // schema column is "risk" (not riskLevel)
          risk: entry.riskLevel || "low",
          sessionId: entry.sessionId || null,
        })
        .returning();

      this.lastHash = hash;

      if (entry?.riskLevel === "high" || entry?.riskLevel === "critical") {
        logger.warn({
          userId: entry.userId,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          riskLevel: entry.riskLevel,
        }, `🔒 High-risk audit event: ${entry?.action}`);
      }

      return auditLog;
    } catch (error) {
      logger.warn({ err: error }, "❌ Failed to persist audit log:");
      return null;
    }
  }

  public async logLogin(
    userId: string | undefined,
    userEmail: string | undefined,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    sessionId?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "LOGIN",
      resourceType: "auth",
      resourceId: userId,
      ipAddress,
      userAgent,
      result: success ? "success" : "failure",
      riskLevel: success ? "low" : "medium",
      sessionId,
      details: {
        ...details,
        attemptedEmail: userEmail,
      },
    });
  }

  public async logLogout(
    userId: string,
    userEmail: string,
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "LOGOUT",
      resourceType: "auth",
      resourceId: userId,
      ipAddress,
      userAgent,
      result: "success",
      riskLevel: "low",
      sessionId,
    });
  }

  public async logRegistration(
    userId: string | undefined,
    userEmail: string | undefined,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    sessionId?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "REGISTER",
      resourceType: "auth",
      resourceId: userId,
      ipAddress,
      userAgent,
      result: success ? "success" : "failure",
      riskLevel: "medium",
      sessionId,
      details,
    });
  }

  public async logPayment(
    userId: string,
    userEmail: string,
    ipAddress: string,
    userAgent: string,
    amount: number,
    success: boolean,
    sessionId?: string,
    stripeSessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "PAYMENT",
      resourceType: "stripe",
      resourceId: stripeSessionId,
      ipAddress,
      userAgent,
      result: success ? "success" : "failure",
      riskLevel: "high",
      sessionId,
      details: {
        amount,
        currency: "USD",
        stripeSessionId,
        type: "subscription",
      },
    });
  }

  public async logAdminAction(
    userId: string,
    userEmail: string,
    action: string,
    targetUserId: string | undefined,
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: `ADMIN_${action?.toUpperCase()}`,
      resourceType: "admin",
      resourceId: targetUserId,
      ipAddress,
      userAgent,
      result: "success",
      riskLevel: "critical",
      sessionId,
      details: {
        ...details,
        targetUserId,
      },
    });
  }

  public async logFileUpload(
    userId: string,
    userEmail: string,
    ipAddress: string,
    userAgent: string,
    fileName: string,
    fileSize: number,
    success: boolean,
    sessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "FILE_UPLOAD",
      resourceType: "storage",
      resourceId: fileName,
      ipAddress,
      userAgent,
      result: success ? "success" : "failure",
      riskLevel: "medium",
      sessionId,
      details: {
        fileName,
        fileSize,
        type: "audio",
      },
    });
  }

  public async logOAuthConnection(
    userId: string,
    userEmail: string,
    platform: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    sessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "OAUTH_CONNECT",
      resourceType: "social_media",
      resourceId: platform,
      ipAddress,
      userAgent,
      result: success ? "success" : "failure",
      riskLevel: "medium",
      sessionId,
      details: { platform },
    });
  }

  public async logSecurityEvent(
    event: string,
    riskLevel: "low" | "medium" | "high" | "critical",
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      action: `SECURITY_${event?.toUpperCase()}`,
      resourceType: "security",
      ipAddress,
      userAgent,
      result: "success",
      riskLevel,
      sessionId,
      details,
    });
  }

  public async logRateLimit(
    limitType: string,
    path: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    await this.log({
      action: "RATE_LIMIT_EXCEEDED",
      resourceType: "security",
      ipAddress,
      userAgent,
      result: "failure",
      riskLevel: "medium",
      details: {
        limitType,
        path,
      },
    });
  }

  public async logDataExport(
    userId: string,
    userEmail: string,
    requestId: string,
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "DATA_EXPORT",
      resourceType: "privacy",
      resourceId: requestId,
      ipAddress,
      userAgent,
      result: "success",
      riskLevel: "high",
      sessionId,
      details: {
        requestId,
        gdprArticle: "Article 15 - Right of Access",
      },
    });
  }

  public async logDataDeletion(
    userId: string,
    userEmail: string,
    requestId: string,
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "DATA_DELETE",
      resourceType: "privacy",
      resourceId: requestId,
      ipAddress,
      userAgent,
      result: "success",
      riskLevel: "critical",
      sessionId,
      details: {
        requestId,
        gdprArticle: "Article 17 - Right to Erasure",
      },
    });
  }

  public async logConsentUpdate(
    userId: string,
    userEmail: string,
    consentType: string,
    consentGiven: boolean,
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      userEmail,
      action: "CONSENT_UPDATE",
      resourceType: "privacy",
      resourceId: consentType,
      ipAddress,
      userAgent,
      result: "success",
      riskLevel: "medium",
      sessionId,
      details: {
        consentType,
        consentGiven,
      },
    });
  }

  public async queryLogs(options: AuditLogQueryOptions = {}): Promise<{
    logs: AuditLog[];
    total: number;
  }> {
    try {
      const conditions: (SQL | SQLWrapper)[] = [];

      if (options?.userId) {
        conditions?.push(eq(auditLogs.userId, options?.userId));
      }
      if (options?.action) {
        conditions?.push(eq(auditLogs.action, options?.action));
      }
      if (options?.resourceType) {
        // schema column is "resource"
        conditions?.push(eq(auditLogs.resource, options?.resourceType));
      }
      if (options?.riskLevel) {
        // schema column is "risk"
        conditions?.push(eq(auditLogs.risk, options?.riskLevel));
      }
      if (options?.startDate) {
        conditions?.push(gte(auditLogs.timestamp, options?.startDate));
      }
      if (options?.endDate) {
        conditions?.push(lt(auditLogs.timestamp, options?.endDate));
      }
      // schema has no "archived" column — includeArchived option is a no-op for filtering

      const whereClause =
        conditions?.length > 0 ? and(...conditions) : undefined;

      const logs = await db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.timestamp))
        .limit(options?.limit || 100)
        .offset(options?.offset || 0);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(whereClause)
        .limit(1);

      return {
        logs,
        total: countResult.count || 0,
      };
    } catch (error) {
      logger.warn({ err: error }, "❌ Failed to query audit logs:");
      throw error;
    }
  }

  public async getUserAuditLogs(
    userId: string,
    limit: number = 100,
  ): Promise<AuditLog[]> {
    const result = await this.queryLogs({
      userId,
      limit,
      includeArchived: false,
    });
    return result?.logs;
  }

  public async archiveOldLogs(): Promise<{
    archived: number;
    errors: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate?.setDate(cutoffDate?.getDate() - this.RETENTION_DAYS);

    logger.info(
      `📦 Starting audit log archival for logs older than ${cutoffDate?.toISOString()}`,
    );

    try {
      // schema has no "archived" column — delete old logs instead of archiving
      const result = await db
        .delete(auditLogs)
        .where(lt(auditLogs.timestamp, cutoffDate))
        .returning({ id: auditLogs.id });

      const archivedCount = result?.length;
      logger.info(
        `✅ Archived ${archivedCount} audit logs older than ${this.RETENTION_DAYS} days`,
      );

      return {
        archived: archivedCount,
        errors: 0,
      };
    } catch (error) {
      logger.warn({ err: error }, "❌ Failed to archive audit logs:");
      return {
        archived: 0,
        errors: 1,
      };
    }
  }

  public async purgeArchivedLogs(olderThanDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate?.setDate(cutoffDate?.getDate() - olderThanDays);

    try {
      // schema has no "archived" column — purge all logs older than cutoff
      const result = await db
        .delete(auditLogs)
        .where(lt(auditLogs.timestamp, cutoffDate))
        .returning({ id: auditLogs.id });

      const purgedCount = result?.length;
      logger.info(
        `🗑️ Purged ${purgedCount} archived audit logs older than ${olderThanDays} days`,
      );
      return purgedCount;
    } catch (error) {
      logger.warn({ err: error }, "❌ Failed to purge archived logs:");
      throw error;
    }
  }

  public async getLogStats(): Promise<{
    totalLogs: number;
    archivedLogs: number;
    activeLogs: number;
    logsByRiskLevel: Record<string, number>;
    logsByAction: Record<string, number>;
    oldestActiveLog: Date | null;
    newestLog: Date | null;
  }> {
    try {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .limit(1);

      // schema has no "archived" column — report 0 archived
      const archivedResult = { count: 0 };

      const riskLevelStats = await db
        .select({
          riskLevel: auditLogs.risk,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLogs)
        .groupBy(auditLogs.risk);

      const actionStats = await db
        .select({
          action: auditLogs.action,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLogs)
        .groupBy(auditLogs.action)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

      const [oldestActive] = await db
        .select({ timestamp: auditLogs.timestamp })
        .from(auditLogs)
        .orderBy(auditLogs.timestamp)
        .limit(1);

      const [newestLog] = await db
        .select({ timestamp: auditLogs.timestamp })
        .from(auditLogs)
        .orderBy(desc(auditLogs.timestamp))
        .limit(1);

      const logsByRiskLevel: Record<string, number> = {};
      for (const stat of riskLevelStats) {
        if (stat?.riskLevel) {
          logsByRiskLevel[stat.riskLevel] = stat?.count;
        }
      }

      const logsByAction: Record<string, number> = {};
      for (const stat of actionStats) {
        logsByAction[stat.action] = stat?.count;
      }

      return {
        totalLogs: totalResult.count || 0,
        archivedLogs: archivedResult.count || 0,
        activeLogs: (totalResult?.count || 0) - (archivedResult?.count || 0),
        logsByRiskLevel,
        logsByAction,
        oldestActiveLog: oldestActive?.timestamp || null,
        newestLog: newestLog?.timestamp || null,
      };
    } catch (error) {
      logger.warn({ err: error }, "❌ Failed to get audit log stats:");
      throw error;
    }
  }
}

export const auditLoggerService = AuditLoggerService?.getInstance();

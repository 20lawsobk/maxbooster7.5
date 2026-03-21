import { db } from '../db.js';
import {
  emailMessages,
  emailEvents,
  type InsertEmailMessage,
  type InsertEmailEvent,
} from '@shared/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import nacl from 'tweetnacl';
import { logger } from '../logger.js';

export class EmailTrackingService {
  /**
   * Record a sent email for tracking
   */
  async recordSentEmail(data: InsertEmailMessage): Promise<void> {
    try {
      await db.insert(emailMessages).values(data).onConflictDoNothing();
    } catch (error: unknown) {
      logger.error('Failed to record sent email:', error);
    }
  }

  /**
   * Record an email event from SendGrid webhook
   */
  async recordEmailEvent(data: InsertEmailEvent): Promise<void> {
    try {
      await db.insert(emailEvents).values(data).onConflictDoNothing();
    } catch (error: unknown) {
      logger.error('Failed to record email event:', error);
    }
  }

  /**
   * Get email delivery stats
   */
  async getEmailStats(startDate?: Date): Promise<{
    sent: number;
    delivered: number;
    bounced: number;
    spam: number;
    unsubscribed: number;
    opened: number;
    clicked: number;
  }> {
    try {
      const dateFilter = startDate ? gte(emailMessages.sentAt, startDate) : undefined;

      const [sentCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailMessages)
        .where(dateFilter);

      const eventCounts = await db
        .select({
          eventType: emailEvents.eventType,
          count: sql<number>`count(*)::int`,
        })
        .from(emailEvents)
        .innerJoin(emailMessages, eq(emailEvents.messageId, emailMessages.messageId))
        .where(dateFilter ? gte(emailMessages.sentAt, startDate) : undefined)
        .groupBy(emailEvents.eventType);

      const stats = {
        sent: sentCount?.count || 0,
        delivered: 0,
        bounced: 0,
        spam: 0,
        unsubscribed: 0,
        opened: 0,
        clicked: 0,
      };

      eventCounts.forEach((row) => {
        if (row.eventType === 'delivered') stats.delivered = row.count;
        if (row.eventType === 'bounce') stats.bounced = row.count;
        if (row.eventType === 'spam') stats.spam = row.count;
        if (row.eventType === 'unsubscribe') stats.unsubscribed = row.count;
        if (row.eventType === 'open') stats.opened = row.count;
        if (row.eventType === 'click') stats.clicked = row.count;
      });

      return stats;
    } catch (error: unknown) {
      logger.error('Failed to get email stats:', error);
      return {
        sent: 0,
        delivered: 0,
        bounced: 0,
        spam: 0,
        unsubscribed: 0,
        opened: 0,
        clicked: 0,
      };
    }
  }

  /**
   * Get recent bounced emails
   */
  async getRecentBounces(limit: number = 50): Promise<any[]> {
    try {
      const bounces = await db
        .select({
          messageId: emailMessages.messageId,
          toEmail: emailMessages.toEmail,
          subject: emailMessages.subject,
          sentAt: emailMessages.sentAt,
          reason: emailEvents.reason,
          smtpResponse: emailEvents.smtpResponse,
          eventAt: emailEvents.eventAt,
        })
        .from(emailEvents)
        .innerJoin(emailMessages, eq(emailEvents.messageId, emailMessages.messageId))
        .where(eq(emailEvents.eventType, 'bounce'))
        .orderBy(desc(emailEvents.eventAt))
        .limit(limit);

      return bounces;
    } catch (error: unknown) {
      logger.error('Failed to get recent bounces:', error);
      return [];
    }
  }

  /**
   * Verify SendGrid webhook signature using Ed25519
   * SendGrid uses Ed25519 digital signatures for webhook verification
   */
  verifySendGridSignature(payload: string, signature: string, timestamp: string): boolean {
    const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    if (!publicKey) {
      logger.warn('SendGrid webhook public key not configured');
      return false;
    }

    try {
      const signedPayload = timestamp + payload;

      const publicKeyBytes = Buffer.from(publicKey, 'base64');

      const signatureBytes = Buffer.from(signature, 'base64');

      const messageBytes = Buffer.from(signedPayload, 'utf-8');

      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

      return isValid;
    } catch (error: unknown) {
      logger.error('Ed25519 signature verification failed:', error);
      return false;
    }
  }
}

export const emailTrackingService = new EmailTrackingService();

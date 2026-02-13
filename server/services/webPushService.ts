import webpush from 'web-push';
import { db } from '../db';
import { pushSubscriptions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  actions?: Array<{ action: string; title: string }>;
}

class WebPushService {
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@maxbooster.ai';

    if (!publicKey || !privateKey) {
      logger.warn('VAPID keys not configured - Web Push disabled');
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.initialized = true;
      logger.info('Web Push service initialized with VAPID keys');
    } catch (error) {
      logger.error('Failed to initialize Web Push:', error);
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  async saveSubscription(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string
  ): Promise<void> {
    try {
      const existing = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptions)
          .set({
            userId,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            userAgent: userAgent || null,
            updatedAt: new Date(),
          })
          .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        logger.info(`Push subscription updated for user ${userId}`);
      } else {
        await db.insert(pushSubscriptions).values({
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: userAgent || null,
        });
        logger.info(`Push subscription saved for user ${userId}`);
      }
    } catch (error) {
      logger.error('Failed to save push subscription:', error);
      throw error;
    }
  }

  async removeSubscription(endpoint: string): Promise<void> {
    try {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      logger.info('Push subscription removed');
    } catch (error) {
      logger.error('Failed to remove push subscription:', error);
      throw error;
    }
  }

  async removeUserSubscriptions(userId: string): Promise<void> {
    try {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      logger.info(`All push subscriptions removed for user ${userId}`);
    } catch (error) {
      logger.error('Failed to remove user push subscriptions:', error);
      throw error;
    }
  }

  async getUserSubscriptions(userId: string) {
    try {
      return await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
    } catch (error) {
      logger.error('Failed to get user push subscriptions:', error);
      return [];
    }
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    if (!this.initialized) {
      logger.warn('Web Push not initialized, skipping push notification');
      return { sent: 0, failed: 0 };
    }

    const subscriptions = await this.getUserSubscriptions(userId);
    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/icon-72x72.png',
      tag: payload.tag,
      actions: payload.actions || [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          pushPayload
        );
        sent++;
      } catch (error: any) {
        failed++;
        if (error.statusCode === 410 || error.statusCode === 404) {
          logger.info(`Removing expired push subscription: ${sub.endpoint.substring(0, 50)}...`);
          await this.removeSubscription(sub.endpoint);
        } else {
          logger.error(`Push notification failed for subscription ${sub.id}:`, error.statusCode || error.message);
        }
      }
    }

    if (sent > 0) {
      logger.info(`Push notification sent to ${sent}/${subscriptions.length} devices for user ${userId}`);
    }

    return { sent, failed };
  }
}

export const webPushService = new WebPushService();

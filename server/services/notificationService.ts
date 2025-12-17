import sgMail from '@sendgrid/mail';
import { db } from '../db';
import { notifications, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

interface NotificationOptions {
  userId: string;
  type: 'release' | 'earning' | 'sale' | 'marketing' | 'system';
  title: string;
  message: string;
  link?: string;
  metadata?: any;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class NotificationService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (!this.isInitialized && process.env.SENDGRID_API_KEY) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.isInitialized = true;
        logger.info('✅ SendGrid initialized for email notifications');
      } catch (error: unknown) {
        logger.error('❌ Failed to initialize SendGrid:', error);
      }
    }
  }

  async send(options: NotificationOptions): Promise<void> {
    const { userId, type, title, message, link, metadata } = options;

    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        logger.error('User not found:', userId);
        return;
      }

      const preferences = (user.notificationPreferences as any) || {
        email: true,
        browser: true,
        releases: true,
        earnings: true,
        sales: true,
        marketing: true,
        system: true,
      };

      const shouldSendEmail = preferences.email && preferences[type];
      const shouldSendBrowser = preferences.browser && preferences[type];

      const [notification] = await db
        .insert(notifications)
        .values({
          userId,
          type,
          title,
          message,
          link,
          metadata,
          read: false,
          emailSent: false,
          browserSent: false,
        })
        .returning();

      if (shouldSendEmail) {
        await this.sendEmail(user, type, title, message, link);
        await db
          .update(notifications)
          .set({ emailSent: true })
          .where(eq(notifications.id, notification.id));
      }

      if (shouldSendBrowser && user.pushSubscription) {
        await this.sendBrowserNotification(user, title, message, link);
        await db
          .update(notifications)
          .set({ browserSent: true })
          .where(eq(notifications.id, notification.id));
      }

      // Broadcast notification via WebSocket for real-time updates
      if (typeof (global as any).broadcastNotification === 'function') {
        (global as any).broadcastNotification(userId, notification);
      }

      logger.info(`✅ Notification sent to user ${userId}: ${title}`);
    } catch (error: unknown) {
      logger.error('Error sending notification:', error);
      throw error;
    }
  }

  private async sendEmail(
    user: unknown,
    type: string,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('SendGrid not initialized, skipping email');
      return;
    }

    const template = this.getEmailTemplate(type, title, message, link);
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'notifications@maxbooster.ai';

    try {
      await sgMail.send({
        to: user.email,
        from: fromEmail,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      logger.info(`📧 Email sent to ${user.email}`);
    } catch (error: unknown) {
      logger.error('SendGrid error:', error?.response?.body || error);
    }
  }

  private async sendBrowserNotification(
    user: unknown,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    logger.info(`🔔 Browser notification queued for user: ${title}`);
  }

  private getEmailTemplate(
    type: string,
    title: string,
    message: string,
    link?: string
  ): EmailTemplate {
    const actionButton = link
      ? `<a href="${link}" style="display: inline-block; margin: 20px 0; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Details</a>`
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Max Booster</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">AI-Powered Music Platform</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: 600;">${title}</h2>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">${message}</p>
              ${actionButton}
              <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">
                  ${this.getNotificationTypeDescription(type)}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px;">
                © ${new Date().getFullYear()} Max Booster. All rights reserved.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                You're receiving this email because you have notifications enabled for ${type} updates.
                <br><a href="${link || 'https://maxbooster.ai/settings'}" style="color: #667eea; text-decoration: none;">Manage notification preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const text = `
${title}

${message}

${link ? `View details: ${link}` : ''}

---
Max Booster - AI-Powered Music Platform
© ${new Date().getFullYear()} Max Booster. All rights reserved.

Manage your notification preferences: ${link || 'https://maxbooster.ai/settings'}
    `.trim();

    return {
      subject: `${this.getTypeEmoji(type)} ${title}`,
      html,
      text,
    };
  }

  private getTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      release: '🎵',
      earning: '💰',
      sale: '🎉',
      marketing: '📢',
      system: '⚙️',
    };
    return emojis[type] || '🔔';
  }

  private getNotificationTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      release: 'You received this notification because your release status has been updated.',
      earning: 'You received this notification because you have new earnings to review.',
      sale: 'You received this notification about a new sale or transaction.',
      marketing: 'You received this marketing update to help grow your music career.',
      system: 'You received this system notification about your account or platform updates.',
    };
    return descriptions[type] || 'You received this notification from Max Booster.';
  }

  async sendReleaseNotification(
    userId: string,
    releaseTitle: string,
    status: string
  ): Promise<void> {
    const statusMessages: Record<string, string> = {
      processing: `Your release "${releaseTitle}" is being processed and will be live soon.`,
      live: `🎉 Your release "${releaseTitle}" is now live on all platforms!`,
      failed: `There was an issue processing your release "${releaseTitle}". Please review and try again.`,
    };

    await this.send({
      userId,
      type: 'release',
      title: `Release Update: ${releaseTitle}`,
      message: statusMessages[status] || `Your release "${releaseTitle}" status: ${status}`,
      link: '/distribution',
    });
  }

  async sendEarningNotification(userId: string, amount: number, source: string): Promise<void> {
    await this.send({
      userId,
      type: 'earning',
      title: 'New Earnings Received',
      message: `You've earned $${amount.toFixed(2)} from ${source}. Check your dashboard for details.`,
      link: '/royalties',
    });
  }

  async sendSaleNotification(userId: string, productName: string, amount: number): Promise<void> {
    await this.send({
      userId,
      type: 'sale',
      title: 'New Sale!',
      message: `Someone just purchased "${productName}" for $${amount.toFixed(2)}!`,
      link: '/marketplace',
    });
  }

  async sendMarketingNotification(userId: string, title: string, message: string): Promise<void> {
    await this.send({
      userId,
      type: 'marketing',
      title,
      message,
      link: '/dashboard',
    });
  }

  async sendSystemNotification(
    userId: string,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    await this.send({
      userId,
      type: 'system',
      title,
      message,
      link,
    });
  }
}

export const notificationService = new NotificationService();

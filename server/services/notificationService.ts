import { Resend } from "resend";
import { db } from "../db";
import { notifications, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { webPushService } from "./webPushService.js";
import { buildPushPayload } from "./pushNotificationTypes.js";
import { env } from "../config/env.js";

interface NotificationOptions {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class NotificationService {
  private isInitialized = false;
  private resend: Resend | null = null;

  constructor() {
    this?.initialize();
  }

  private initialize() {
    if (!this?.isInitialized && env?.RESEND_API_KEY) {
      try {
        this.resend = new Resend(env?.RESEND_API_KEY);
        this.isInitialized = true;
        logger?.info("✅ Resend initialized for email notifications");
      } catch (error: unknown) {
        logger?.warn({ err: error }, "❌ Failed to initialize SendGrid:");
      }
    }
  }

  async send(options: NotificationOptions): Promise<void> {
    const { userId, type, title, message, link, metadata } = options;

    try {
      const user = await db?.query.users?.findFirst({
        where: eq(users?.id, userId),
      });

      if (!user) {
        logger?.warn("User not found:", userId);
        return;
      }

      const preferences = (user?.notificationSettings as Record<
        string,
        unknown
      >) || {
        email: true,
        browser: true,
        releases: true,
        earnings: true,
        sales: true,
        marketing: true,
        system: true,
      };

      const shouldSendEmail = preferences?.email && preferences[type];
      const shouldSendBrowser = preferences?.browser && preferences[type];

      const [notification] = await db
        .insert(notifications)
        .values({
          userId,
          type,
          title,
          message,
          actionUrl: link,
          metadata,
          isRead: false,
        })
        .returning();

      if (shouldSendEmail) {
        await this?.sendEmail(user, type, title, message, link);
      }

      if (shouldSendBrowser) {
        await this?.sendBrowserNotification(
          user,
          title,
          message,
          link,
          type,
          metadata,
        );
      }

      // Broadcast notification via WebSocket for real-time updates
      if (
        typeof (global as Record<string, unknown>).broadcastNotification ===
        "function"
      ) {
        (global as Record<string, unknown>).broadcastNotification(
          userId,
          notification,
        );
      }

      logger?.info(`✅ Notification sent to user ${userId}: ${title}`);
    } catch (error: unknown) {
      logger?.warn({ err: error }, "Error sending notification:");
      throw error;
    }
  }

  private async sendEmail(
    user: unknown,
    type: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<void> {
    if (!this?.isInitialized || !this?.resend) {
      logger?.warn("Resend not initialized, skipping email");
      return;
    }

    const template = this?.getEmailTemplate(type, title, message, link);
    const fromEmail = env?.SENDGRID_FROM_EMAIL || "noreply@max-booster.com";

    try {
      await this?.resend.emails?.send({
        to: user.email,
        from: fromEmail,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      logger?.info(`📧 Email sent to ${user?.email}`);
    } catch (error: unknown) {
      logger?.warn("Resend error:", (error as Error)?.message || error);
    }
  }

  private async sendBrowserNotification(
    user: unknown,
    title: string,
    message: string,
    link?: string,
    type?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!webPushService?.isReady()) {
        logger?.info("Web Push not ready, skipping push notification");
        return;
      }

      let richPayload;
      if (type) {
        const ctx = {
          actorName: metadata.actorName,
          contentTitle: metadata.contentTitle || title,
          contentPreview: metadata.contentPreview || message,
          platform: metadata.platform,
          url: link,
          imageUrl: metadata.imageUrl,
          location: metadata.location,
          count: metadata.count,
          milestone: metadata.milestone,
          amount: metadata.amount,
        };
        richPayload = buildPushPayload(type, ctx);
      } else {
        richPayload = {
          title,
          body: message,
          url: link || "/",
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-72x72.png",
          tag: `notification-${Date?.now()}`,
          category: "system",
          actions: [
            { action: "open", title: "Open" },
            { action: "dismiss", title: "Dismiss" },
          ],
          silent: false,
          requireInteraction: false,
          renotify: false,
          vibrate: [100, 50, 100],
          data: { url: link || "/" },
          timestamp: Date.now(),
        };
      }

      const result = await webPushService?.sendRichToUser(
        (user as Record<string, unknown>).id,
        richPayload as Record<string, unknown>,
      );
      if (result?.sent > 0) {
        logger?.info(
          `🔔 Push notification [${type || "generic"}] delivered to ${result?.sent} device(s)`,
        );
      }
    } catch (error) {
      logger?.warn({ err: error }, "Failed to send push notification:");
    }
  }

  private getEmailTemplate(
    type: string,
    title: string,
    message: string,
    link?: string,
  ): EmailTemplate {
    const actionButton = link
      ? `<a href="${link}" style="display: inline-block; margin: 20px 0; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Details</a>`
      : "";

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
                  ${this?.getNotificationTypeDescription(type)}
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
                <br><a href="${link || "https://maxbooster.ai/settings"}" style="color: #667eea; text-decoration: none;">Manage notification preferences</a>
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

${link ? `View details: ${link}` : ""}

---
Max Booster - AI-Powered Music Platform
© ${new Date().getFullYear()} Max Booster. All rights reserved.

Manage your notification preferences: ${link || "https://maxbooster.ai/settings"}
    `.trim();

    return {
      subject: `${this.getTypeEmoji(type)} ${title}`,
      html,
      text,
    };
  }

  private getTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      release: "🎵",
      earning: "💰",
      sale: "🎉",
      marketing: "📢",
      system: "⚙️",
    };
    return emojis[type] || "🔔";
  }

  private getNotificationTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      release:
        "You received this notification because your release status has been updated.",
      earning:
        "You received this notification because you have new earnings to review.",
      sale: "You received this notification about a new sale or transaction.",
      marketing:
        "You received this marketing update to help grow your music career.",
      system:
        "You received this system notification about your account or platform updates.",
    };
    return (
      descriptions[type] || "You received this notification from Max Booster."
    );
  }

  async sendReleaseNotification(
    userId: string,
    releaseTitle: string,
    status: string,
  ): Promise<void> {
    const statusMessages: Record<string, string> = {
      processing: `Your release "${releaseTitle}" is being processed and will be live soon.`,
      live: `🎉 Your release "${releaseTitle}" is now live on all platforms!`,
      failed: `There was an issue processing your release "${releaseTitle}". Please review and try again.`,
    };

    await this.send({
      userId,
      type: "release",
      title: `Release Update: ${releaseTitle}`,
      message:
        statusMessages[status] ||
        `Your release "${releaseTitle}" status: ${status}`,
      link: "/distribution",
    });
  }

  async sendEarningNotification(
    userId: string,
    amount: number,
    source: string,
  ): Promise<void> {
    await this.send({
      userId,
      type: "earning",
      title: "New Earnings Received",
      message: `You've earned $${amount?.toFixed(2)} from ${source}. Check your dashboard for details.`,
      link: "/royalties",
    });
  }

  async sendSaleNotification(
    userId: string,
    productName: string,
    amount: number,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "sale",
      title: "New Sale!",
      message: `Someone just purchased "${productName}" for $${amount?.toFixed(2)}!`,
      link: "/marketplace",
    });
  }

  async sendMarketingNotification(
    userId: string,
    title: string,
    message: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "marketing",
      title,
      message,
      link: "/dashboard",
    });
  }

  async sendSystemNotification(
    userId: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "system",
      title,
      message,
      link,
    });
  }

  async createNotification(options: NotificationOptions): Promise<void> {
    return this?.send(options);
  }

  async sendAchievementNotification(
    userId: string,
    achievementName: string,
    description: string,
    points: number,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "achievement_unlocked",
      title: `Achievement Unlocked: ${achievementName}`,
      message: `${description} You earned ${points} points!`,
      link: "/dashboard",
      metadata: { points },
    });
  }

  async sendStreakMilestoneNotification(
    userId: string,
    streakType: string,
    days: number,
  ): Promise<void> {
    const typeLabel = streakType === "login" ? "login" : streakType;
    await this?.send({
      userId,
      type: "streak_milestone",
      title: `${days}-Day Streak!`,
      message: `You've maintained a ${days}-day ${typeLabel} streak. Keep it up!`,
      link: "/dashboard",
      metadata: { streakType, days },
    });
  }

  async sendLoginSecurityNotification(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.send({
      userId,
      type: "security_new_login",
      title: "New Login Detected",
      message: `Your account was accessed from a new session${ipAddress ? ` (IP: ${ipAddress})` : ""}. If this wasn't you, change your password immediately.`,
      link: "/settings",
      metadata: { ipAddress, userAgent },
    });
  }

  async sendPasswordChangedNotification(userId: string): Promise<void> {
    await this?.send({
      userId,
      type: "security_password_changed",
      title: "Password Changed",
      message:
        "Your account password was changed. If you did not do this, contact support immediately.",
      link: "/settings",
    });
  }

  async sendStorageQuotaNotification(
    userId: string,
    usedPercent: number,
  ): Promise<void> {
    const isNearFull = usedPercent >= 90;
    await this?.send({
      userId,
      type: "storage_quota_warning",
      title: isNearFull ? "Storage Almost Full" : "Storage Warning",
      message: `You've used ${usedPercent}% of your storage. ${isNearFull ? "Upgrade your plan or delete files to continue uploading." : "Consider freeing up space soon."}`,
      link: "/settings",
      metadata: { usedPercent },
    });
  }

  async sendUploadCompleteNotification(
    userId: string,
    fileName: string,
    fileType: string,
  ): Promise<void> {
    await this.send({
      userId,
      type: "upload_complete",
      title: "Upload Complete",
      message: `"${fileName}" has been uploaded successfully.`,
      link: fileType === "track" ? "/projects" : "/studio",
      metadata: { fileName, fileType },
    });
  }

  async sendAiProcessingCompleteNotification(
    userId: string,
    taskType: string,
    trackName: string,
  ): Promise<void> {
    const labels: Record<string, string> = {
      mix: "AI Mix",
      master: "AI Master",
      stem_separation: "Stem Separation",
      analysis: "AI Analysis",
      vocal_removal: "Vocal Removal",
    };
    const label = labels[taskType] || "AI Processing";
    await this.send({
      userId,
      type: "ai_processing_complete",
      title: `${label} Complete`,
      message: `${label} for "${trackName}" has finished. Open your Studio to view results.`,
      link: "/studio",
      metadata: { taskType, trackName },
    });
  }

  async sendStreamMilestoneNotification(
    userId: string,
    trackName: string,
    streams: number,
  ): Promise<void> {
    const formatted =
      streams >= 1_000_000
        ? `${(streams / 1_000_000).toFixed(1)}M`
        : streams >= 1_000
          ? `${(streams / 1_000).toFixed(0)}K`
          : `${streams}`;
    await this.send({
      userId,
      type: "stream_milestone",
      title: `${formatted} Streams!`,
      message: `"${trackName}" just hit ${formatted} streams. Congratulations!`,
      link: "/analytics",
      metadata: { trackName, streams },
    });
  }

  async sendFollowerMilestoneNotification(
    userId: string,
    platform: string,
    followers: number,
  ): Promise<void> {
    const formatted =
      followers >= 1_000_000
        ? `${(followers / 1_000_000).toFixed(1)}M`
        : followers >= 1_000
          ? `${(followers / 1_000).toFixed(0)}K`
          : `${followers}`;
    await this.send({
      userId,
      type: "follower_milestone",
      title: `${formatted} Followers on ${platform}!`,
      message: `You've reached ${formatted} followers on ${platform}. Keep growing!`,
      link: "/social-media",
      metadata: { platform, followers },
    });
  }

  async sendSocialTokenExpiringNotification(
    userId: string,
    platform: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "social_token_expiring",
      title: `${platform} Connection Needs Renewal`,
      message: `Your ${platform} connection is expiring. Reconnect now to keep your social posts and analytics running.`,
      link: "/social-media",
      metadata: { platform },
    });
  }

  async sendSubscriptionExpiringNotification(
    userId: string,
    plan: string,
    daysLeft: number,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "subscription_expiring",
      title: "Subscription Expiring Soon",
      message: `Your ${plan} plan expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Renew to keep access to all features.`,
      link: "/settings",
      metadata: { plan, daysLeft },
    });
  }

  async sendSubscriptionRenewedNotification(
    userId: string,
    plan: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "subscription_renewed",
      title: "Subscription Renewed",
      message: `Your ${plan} plan has been renewed successfully. Thank you for your continued support!`,
      link: "/settings",
      metadata: { plan },
    });
  }

  async sendSubscriptionChangedNotification(
    userId: string,
    oldPlan: string,
    newPlan: string,
  ): Promise<void> {
    const isUpgrade =
      ["monthly", "yearly", "lifetime"].indexOf(newPlan) >
      ["monthly", "yearly", "lifetime"].indexOf(oldPlan);
    await this?.send({
      userId,
      type: "subscription_changed",
      title: isUpgrade ? "Plan Upgraded" : "Plan Changed",
      message: `Your subscription has been changed from ${oldPlan} to ${newPlan}.`,
      link: "/settings",
      metadata: { oldPlan, newPlan },
    });
  }

  async sendPaymentFailedNotification(
    userId: string,
    amount: number,
    reason?: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "payment_failed",
      title: "Payment Failed",
      message: `A payment of $${amount?.toFixed(2)} failed${reason ? `: ${reason}` : ". Please update your payment method."}`,
      link: "/settings",
      metadata: { amount, reason },
    });
  }

  async sendBeatPlayMilestoneNotification(
    userId: string,
    beatName: string,
    plays: number,
  ): Promise<void> {
    const formatted =
      plays >= 1_000 ? `${(plays / 1_000).toFixed(0)}K` : `${plays}`;
    await this?.send({
      userId,
      type: "beat_play_milestone",
      title: `${formatted} Plays on "${beatName}"`,
      message: `Your beat "${beatName}" just hit ${formatted} plays on the marketplace!`,
      link: "/marketplace",
      metadata: { beatName, plays },
    });
  }

  private async getAdminUserId(): Promise<string | null> {
    try {
      const adminEmail = process?.env.ADMIN_EMAIL || "noreply@max-booster.com";
      const admin = await db?.query.users?.findFirst({
        where: eq(users?.email, adminEmail),
        columns: { id: true },
      });
      return admin?.id ?? null;
    } catch {
      return null;
    }
  }

  private async sendToAdmin(
    options: Omit<NotificationOptions, "userId">,
  ): Promise<void> {
    const adminId = await this?.getAdminUserId();
    if (!adminId) return;
    await this?.send({ ...options, userId: adminId });
  }

  async sendAdminNewUserNotification(
    newUserEmail: string,
    newUserId: string,
    plan?: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_new_user",
      title: "New User Registered",
      message: `${newUserEmail} just joined Max Booster${plan ? ` on the ${plan} plan` : ""}.`,
      link: `/admin/users`,
      metadata: { newUserEmail, newUserId, plan },
    });
  }

  async sendAdminPaymentIssueNotification(
    userEmail: string,
    userId: string,
    amount: number,
    reason?: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_payment_issue",
      title: "User Payment Failed",
      message: `Payment of $${amount?.toFixed(2)} failed for ${userEmail}${reason ? `: ${reason}` : "."}`,
      link: `/admin/users`,
      metadata: { userEmail, userId, amount, reason },
    });
  }

  async sendAdminStorageCriticalNotification(
    usedPercent: number,
    usedGB: number,
    totalGB: number,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_storage_critical",
      title: "Platform Storage Critical",
      message: `Platform storage is at ${usedPercent}% capacity (${usedGB?.toFixed(1)} GB / ${totalGB?.toFixed(1)} GB). Immediate action may be required.`,
      link: "/admin",
      metadata: { usedPercent, usedGB, totalGB },
    });
  }

  async sendAdminMarketplaceReviewNotification(
    itemName: string,
    itemId: string,
    sellerEmail: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_marketplace_review",
      title: "Marketplace Listing Pending Review",
      message: `"${itemName}" by ${sellerEmail} is awaiting moderation review.`,
      link: `/admin/marketplace`,
      metadata: { itemName, itemId, sellerEmail },
    });
  }

  async sendAdminUserReportNotification(
    reporterEmail: string,
    reportedEmail: string,
    reason: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_user_report",
      title: "User Report Filed",
      message: `${reporterEmail} reported ${reportedEmail}: "${reason}"`,
      link: `/admin/users`,
      metadata: { reporterEmail, reportedEmail, reason },
    });
  }

  async sendAdminRevenueMilestoneNotification(
    milestone: number,
    period: string,
  ): Promise<void> {
    const formatted =
      milestone >= 1_000_000
        ? `$${(milestone / 1_000_000).toFixed(1)}M`
        : milestone >= 1_000
          ? `$${(milestone / 1_000).toFixed(0)}K`
          : `$${milestone}`;
    await this?.sendToAdmin({
      type: "admin_revenue_milestone",
      title: `Platform Revenue Milestone: ${formatted}`,
      message: `Max Booster has reached ${formatted} in total revenue for ${period}. Congratulations!`,
      link: "/admin",
      metadata: { milestone, period },
    });
  }

  async sendAdminHealthAlertNotification(
    service: string,
    status: string,
    details?: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_health_alert",
      title: `Platform Health Alert: ${service}`,
      message: `${service} is reporting ${status}${details ? `: ${details}` : "."}`,
      link: "/admin",
      metadata: { service, status, details },
    });
  }

  async sendAdminUserFlaggedNotification(
    userEmail: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_user_flagged",
      title: "Account Flagged for Review",
      message: `${userEmail} has been automatically flagged: ${reason}`,
      link: `/admin/users`,
      metadata: { userEmail, userId, reason },
    });
  }

  async sendAdminSupportTicketNotification(
    userEmail: string,
    subject: string,
    ticketId?: string,
  ): Promise<void> {
    await this?.sendToAdmin({
      type: "admin_support_ticket",
      title: "New Support Ticket",
      message: `${userEmail} submitted a support request: "${subject}"`,
      link: `/admin`,
      metadata: { userEmail, subject, ticketId },
    });
  }

  async sendSocialPostPublishedNotification(
    userId: string,
    platform: string,
    content: string,
  ): Promise<void> {
    const preview =
      content?.length > 60 ? content?.slice(0, 57) + "..." : content;
    await this?.send({
      userId,
      type: "social_post_published",
      title: `Post Published on ${platform}`,
      message: `Your post has been published on ${platform}: "${preview}"`,
      link: "/social-media",
      metadata: { platform, content },
    });
  }

  async sendSocialPostScheduledNotification(
    userId: string,
    platform: string,
    content: string,
    scheduledAt: Date,
  ): Promise<void> {
    const preview =
      content?.length > 60 ? content?.slice(0, 57) + "..." : content;
    const timeStr = scheduledAt?.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    await this?.send({
      userId,
      type: "social_post_scheduled",
      title: `Post Scheduled on ${platform}`,
      message: `Your post has been scheduled for ${timeStr} on ${platform}: "${preview}"`,
      link: "/social-media",
      metadata: { platform, content, scheduledAt },
    });
  }

  async sendAdCampaignCreatedNotification(
    userId: string,
    campaignName: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "ad_campaign_created",
      title: "Ad Campaign Created",
      message: `Your advertising campaign "${campaignName}" has been created and is ready to run.`,
      link: "/advertising",
      metadata: { campaignName },
    });
  }

  async sendAdCampaignMilestoneNotification(
    userId: string,
    campaignName: string,
    metric: string,
    value: number,
  ): Promise<void> {
    const formatted =
      value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M`
        : value >= 1_000
          ? `${(value / 1_000).toFixed(0)}K`
          : `${value}`;
    await this?.send({
      userId,
      type: "ad_campaign_milestone",
      title: `Campaign Milestone: ${formatted} ${metric}`,
      message: `Your campaign "${campaignName}" just hit ${formatted} ${metric}. Keep it up!`,
      link: "/advertising",
      metadata: { campaignName, metric, value },
    });
  }

  async sendAdCampaignOptimizedNotification(
    userId: string,
    campaignName: string,
    suggestion: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "ad_campaign_optimized",
      title: "Campaign Optimization Ready",
      message: `AI has optimized your campaign "${campaignName}": ${suggestion}`,
      link: "/advertising",
      metadata: { campaignName, suggestion },
    });
  }

  // ── Distribution notifications ───────────────────────────────────────────────

  async sendReleaseSubmittedNotification(
    userId: string,
    releaseTitle: string,
    platformCount: number,
    estimatedLiveDate?: string,
  ): Promise<void> {
    const eta = estimatedLiveDate
      ? ` Estimated live: ${new Date(estimatedLiveDate).toLocaleDateString("en-US", { dateStyle: "medium" })}.`
      : "";
    await this?.send({
      userId,
      type: "release_submitted",
      title: "🎵 Release Submitted for Distribution",
      message: `"${releaseTitle}" has been submitted to ${platformCount} platform${platformCount !== 1 ? "s" : ""}.${eta} We'll notify you when it goes live.`,
      link: "/distribution",
      metadata: { releaseTitle, platformCount, estimatedLiveDate },
    });
  }

  async sendReleaseScheduledNotification(
    userId: string,
    releaseTitle: string,
    releaseDate: Date,
  ): Promise<void> {
    const dateStr = releaseDate.toLocaleDateString("en-US", {
      dateStyle: "full",
    });
    await this.send({
      userId,
      type: "release_scheduled",
      title: "📅 Release Date Confirmed",
      message: `"${releaseTitle}" is locked in for ${dateStr}. Start your pre-save campaign to build momentum!`,
      link: "/distribution",
      metadata: { releaseTitle, releaseDate: releaseDate.toISOString() },
    });
  }

  async sendReleaseLiveNotification(
    userId: string,
    releaseTitle: string,
    platformCount: number,
  ): Promise<void> {
    await this.send({
      userId,
      type: "release_live",
      title: "🎉 Your Release is LIVE!",
      message: `"${releaseTitle}" is now live across ${platformCount} platform${platformCount !== 1 ? "s" : ""}. Share it with the world!`,
      link: "/distribution",
      metadata: { releaseTitle, platformCount },
    });
  }

  async sendReleaseTakedownNotification(
    userId: string,
    releaseTitle: string,
    platformCount: number,
  ): Promise<void> {
    await this.send({
      userId,
      type: "release_takedown",
      title: "🔴 Takedown Request Submitted",
      message: `Takedown for "${releaseTitle}" has been requested across ${platformCount} platform${platformCount !== 1 ? "s" : ""}. Processing takes up to 14 business days.`,
      link: "/distribution",
      metadata: { releaseTitle, platformCount },
    });
  }

  // ── Marketplace notifications ────────────────────────────────────────────────

  async sendBeatListingLiveNotification(
    userId: string,
    beatTitle: string,
    price: number,
  ): Promise<void> {
    await this.send({
      userId,
      type: "beat_listing_live",
      title: "🎹 Beat Now Live on Marketplace",
      message: `"${beatTitle}" is live and ready to sell at $${price.toFixed(2)}. Share it to maximize your reach!`,
      link: "/marketplace",
      metadata: { beatTitle, price },
    });
  }

  async sendBeatSoldNotification(
    userId: string,
    beatTitle: string,
    licenseType: string,
    amount: number,
  ): Promise<void> {
    const licenseLabel =
      licenseType.charAt(0).toUpperCase() + licenseType.slice(1);
    await this.send({
      userId,
      type: "beat_sold",
      title: "💰 Beat Sold!",
      message: `Your beat "${beatTitle}" just sold a ${licenseLabel} license for $${amount.toFixed(2)}. Payout is on its way!`,
      link: "/marketplace",
      metadata: { beatTitle, licenseType, amount },
    });
  }

  async sendBeatPurchasedNotification(
    userId: string,
    beatTitle: string,
    licenseType: string,
  ): Promise<void> {
    const licenseLabel =
      licenseType.charAt(0).toUpperCase() + licenseType.slice(1);
    await this.send({
      userId,
      type: "beat_purchased",
      title: "✅ Beat Purchase Confirmed",
      message: `You've licensed "${beatTitle}" with a ${licenseLabel} license. Access your files in your downloads.`,
      link: "/marketplace",
      metadata: { beatTitle, licenseType },
    });
  }

  async sendStemsPurchasedNotification(
    userId: string,
    stemId: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "stems_purchased",
      title: "🎚️ Stem Pack Unlocked",
      message: `Your stem pack purchase is confirmed. Download your individual stems from the marketplace to start building.`,
      link: "/marketplace",
      metadata: { stemId },
    });
  }

  // ── Studio / Music creation notifications ────────────────────────────────────

  async sendProjectCreatedNotification(
    userId: string,
    projectTitle: string,
    genre?: string | null,
  ): Promise<void> {
    const genreStr = genre ? ` (${genre})` : "";
    await this?.send({
      userId,
      type: "studio_project_created",
      title: "🎛️ Project Created",
      message: `"${projectTitle}"${genreStr} is ready. Add tracks and start making something great!`,
      link: "/studio",
      metadata: { projectTitle, genre },
    });
  }

  async sendProjectRenderCompleteNotification(
    userId: string,
    projectTitle: string,
    format: string,
    downloadUrl: string,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "studio_render_complete",
      title: "✅ Render Complete",
      message: `"${projectTitle}" finished rendering as a ${format?.toUpperCase()} file and is ready to download.`,
      link: downloadUrl,
      metadata: { projectTitle, format, downloadUrl },
    });
  }

  async sendStemExportStartedNotification(
    userId: string,
    projectTitle: string,
    trackCount: number,
  ): Promise<void> {
    await this?.send({
      userId,
      type: "studio_stem_export",
      title: "🎚️ Stem Export Started",
      message: `Exporting ${trackCount} stem${trackCount !== 1 ? "s" : ""} from "${projectTitle}". We'll notify you when it's ready.`,
      link: "/studio",
      metadata: { projectTitle, trackCount },
    });
  }

  // ── Social media management notifications ────────────────────────────────────

  async sendSocialContentGeneratedNotification(
    userId: string,
    platform: string,
    contentSnippet: string,
  ): Promise<void> {
    const preview =
      contentSnippet?.length > 80
        ? contentSnippet?.slice(0, 77) + "..."
        : contentSnippet;
    await this?.send({
      userId,
      type: "social_content_generated",
      title: `✨ AI Content Ready for ${platform}`,
      message: `New post ready: "${preview}" — Review and schedule it now.`,
      link: "/social-media",
      metadata: { platform, contentSnippet },
    });
  }

  async sendAutoPostPublishedNotification(
    userId: string,
    platform: string,
    contentSnippet: string,
  ): Promise<void> {
    const preview =
      contentSnippet?.length > 80
        ? contentSnippet?.slice(0, 77) + "..."
        : contentSnippet;
    await this?.send({
      userId,
      type: "social_auto_published",
      title: `🤖 Autopilot Published on ${platform}`,
      message: `Your autopilot posted: "${preview}"`,
      link: "/social-media",
      metadata: { platform, contentSnippet },
    });
  }
}

export const notificationService = new NotificationService();

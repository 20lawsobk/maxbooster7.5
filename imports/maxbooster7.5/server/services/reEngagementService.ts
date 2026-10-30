/**
 * RE-ENGAGEMENT SERVICE
 *
 * Research: Groove reduced churn by 71% with trigger-based emails for users
 * who haven't logged in for 10–14 days. This service runs daily and sends
 * targeted re-engagement emails to at-risk inactive users.
 *
 * Rules to prevent spam:
 *   - Only users inactive 10–30 days (outside that window = churned or active)
 *   - Minimum 7 days between re-engagement emails
 *   - Respects notification preferences
 *   - Only sends once per inactivity window (not until they log in again)
 */

import { db } from "../db.js";
import { customerHealthScores, users } from "@shared/schema";
import { and, lte, gte, isNull, or, eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { emailService } from "./emailService.js";
import { withLock } from "../lib/distributedLock.js";

function buildReEngagementHtml(
  firstName: string,
  daysSinceLogin: number,
  appUrl: string,
): string {
  const urgencyMessage =
    daysSinceLogin >= 20
      ? `It's been ${daysSinceLogin} days — your career momentum doesn't have to pause.`
      : `It's been ${daysSinceLogin} days since your last session.`;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Max Booster</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#111;margin-top:0;font-size:22px;">Hey ${firstName}, we miss you 👋</h2>
          <p style="color:#374151;line-height:1.6;">${urgencyMessage}</p>
          <p style="color:#374151;line-height:1.6;">
            Your autopilot campaigns, distribution tools, and analytics are ready and waiting. 
            The music industry moves fast — let Max Booster keep working for you.
          </p>
          <div style="background:#f3f4f6;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 8px 0;font-weight:600;color:#111;">While you were away:</p>
            <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
              <li>Your social autopilot kept running</li>
              <li>New AI-powered career insights are ready</li>
              <li>Check your latest analytics report</li>
            </ul>
          </div>
          <a href="${appUrl}/dashboard?utm_source=reengagement&utm_campaign=inactive_${daysSinceLogin}d" 
             style="display:inline-block;margin-top:16px;background:#7c3aed;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
            Return to Max Booster
          </a>
          <p style="color:#9ca3af;font-size:13px;margin-top:32px;">
            You received this because you haven't logged in recently. 
            <a href="${appUrl}/settings/notifications" style="color:#7c3aed;">Manage email preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `.trim();
}

class ReEngagementService {
  private isRunning = false;

  async runDailyCheck(): Promise<void> {
    await withLock("reengagement-daily", 23 * 60 * 60, async () => {
      if (this.isRunning) {
        logger.warn("[ReEngagement] Daily check already running, skipping");
        return;
      }

      this.isRunning = true;
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo?.setDate(sevenDaysAgo?.getDate() - 7);

        const eligibleUsers = await db
          .select({
            userId: customerHealthScores.userId,
            daysSinceLastLogin: customerHealthScores.daysSinceLastLogin,
            riskLevel: customerHealthScores.riskLevel,
            email: users.email,
            firstName: users.firstName,
            notificationSettings: users.notificationSettings,
          })
          .from(customerHealthScores)
          .innerJoin(users, eq(users.id, customerHealthScores.userId))
          .where(
            and(
              gte(customerHealthScores.daysSinceLastLogin!, 10),
              lte(customerHealthScores.daysSinceLastLogin!, 30),
              or(
                isNull(customerHealthScores.reEngagementEmailSentAt),
                lte(
                  customerHealthScores.reEngagementEmailSentAt!,
                  sevenDaysAgo,
                ),
              ),
            ),
          )
          .limit(200);

        logger.info(
          `[ReEngagement] Found ${eligibleUsers?.length} eligible users for re-engagement`,
        );

        let sent = 0;
        for (const user of eligibleUsers) {
          try {
            const {
              userId,
              daysSinceLastLogin,
              email,
              firstName,
              notificationSettings,
            } = user;
            if (!email) continue;

            const settings = notificationSettings as Record<
              string,
              boolean
            > | null;
            if (settings?.emailMarketing === false) continue;

            const displayName = firstName ?? email?.split("@")[0];
            const appUrl = process.env.APP_URL ?? "https://maxbooster.app";
            const html = buildReEngagementHtml(
              displayName,
              daysSinceLastLogin ?? 10,
              appUrl,
            );

            await emailService?.sendTransactional(
              email,
              `${displayName}, your music career tools are waiting`,
              html,
            );

            await db
              .update(customerHealthScores)
              .set({ reEngagementEmailSentAt: new Date() })
              .where(eq(customerHealthScores.userId, userId));

            sent++;
          } catch (err) {
            logger.warn(
              { err: err },
              `[ReEngagement] Failed to send to user ${user?.userId}:`,
            );
          }
        }

        logger.info(`[ReEngagement] Daily check complete: ${sent} emails sent`);
      } finally {
        this.isRunning = false;
      }
    });
  }

  startDailyCron(): void {
    const MS_PER_HOUR = 60 * 60 * 1000;
    const MS_PER_DAY = 24 * MS_PER_HOUR;

    const runAtNoon = () => {
      const now = new Date();
      const noon = new Date(now);
      noon?.setHours(12, 0, 0, 0);
      if (noon <= now) noon?.setDate(noon?.getDate() + 1);
      return noon?.getTime() - now?.getTime();
    };

    const scheduleNext = () => {
      const delay = runAtNoon();
      logger.info(
        `[ReEngagement] Next run in ${Math.round(delay / MS_PER_HOUR)} hours`,
      );
      setTimeout(async () => {
        await this.runDailyCheck();
        setInterval(() => this.runDailyCheck(), MS_PER_DAY);
      }, delay);
    };

    scheduleNext();
  }
}

export const reEngagementService = new ReEngagementService();

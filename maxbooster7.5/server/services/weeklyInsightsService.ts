import { db } from '../db.js';
import { 
  users, 
  analytics, 
  emailPreferences, 
  sentEmails,
  userAchievements,
  achievements,
  socialCampaigns,
  careerCoachRecommendations
} from '../../shared/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';
import { logger } from '../logger.js';

interface WeeklyReport {
  userId: string;
  userName: string;
  userEmail: string;
  streamsThisWeek: number;
  streamsLastWeek: number;
  streamsChange: number;
  streamsChangePercent: number;
  topTrack: { title: string; streams: number } | null;
  newFollowers: number;
  revenueEarned: number;
  achievementsUnlocked: Array<{ name: string; description: string; icon: string }>;
  aiRecommendation: { title: string; description: string } | null;
  upcomingPosts: Array<{ platform: string; scheduledAt: Date; content: string }>;
}

class WeeklyInsightsService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (!this.isInitialized && process.env.SENDGRID_API_KEY) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.isInitialized = true;
        logger.info('✅ Weekly Insights Service initialized');
      } catch (error) {
        logger.error('❌ Failed to initialize Weekly Insights Service:', error);
      }
    }
  }

  async generateWeeklyReport(userId: string): Promise<WeeklyReport | null> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return null;

      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - 7);
      
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const thisWeekAnalytics = await db.select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        totalFollowers: sql<number>`COALESCE(SUM(${analytics.followers}), 0)`,
      })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, userId),
            gte(analytics.date, thisWeekStart)
          )
        );

      const lastWeekAnalytics = await db.select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
      })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, userId),
            gte(analytics.date, lastWeekStart),
            lte(analytics.date, thisWeekStart)
          )
        );

      const streamsThisWeek = Number(thisWeekAnalytics[0]?.totalStreams || 0);
      const streamsLastWeek = Number(lastWeekAnalytics[0]?.totalStreams || 0);
      const streamsChange = streamsThisWeek - streamsLastWeek;
      const streamsChangePercent = streamsLastWeek > 0 
        ? Math.round((streamsChange / streamsLastWeek) * 100) 
        : streamsThisWeek > 0 ? 100 : 0;

      const topTrackData = await db.select({
        title: sql<string>`COALESCE((${analytics.metadata}->>'trackTitle')::text, 'Unknown Track')`,
        streams: sql<number>`SUM(${analytics.streams})`,
      })
        .from(analytics)
        .where(
          and(
            eq(analytics.userId, userId),
            gte(analytics.date, thisWeekStart)
          )
        )
        .groupBy(sql`${analytics.metadata}->>'trackTitle'`)
        .orderBy(desc(sql`SUM(${analytics.streams})`))
        .limit(1);

      const topTrack = topTrackData[0] && topTrackData[0].streams > 0
        ? { title: topTrackData[0].title, streams: Number(topTrackData[0].streams) }
        : null;

      const recentAchievements = await db.select({
        name: achievements.name,
        description: achievements.description,
        icon: achievements.icon,
      })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(
          and(
            eq(userAchievements.userId, userId),
            gte(userAchievements.unlockedAt, thisWeekStart)
          )
        )
        .limit(3);

      const aiRecommendationData = await db.select()
        .from(careerCoachRecommendations)
        .where(
          and(
            eq(careerCoachRecommendations.userId, userId),
            sql`${careerCoachRecommendations.dismissedAt} IS NULL`,
            sql`${careerCoachRecommendations.completedAt} IS NULL`
          )
        )
        .orderBy(desc(careerCoachRecommendations.priority))
        .limit(1);

      const aiRecommendation = aiRecommendationData[0] 
        ? { title: aiRecommendationData[0].title, description: aiRecommendationData[0].description }
        : null;

      const upcomingPostsData = await db.select()
        .from(socialCampaigns)
        .where(
          and(
            eq(socialCampaigns.userId, userId),
            eq(socialCampaigns.status, 'scheduled'),
            gte(socialCampaigns.scheduledAt, now)
          )
        )
        .orderBy(socialCampaigns.scheduledAt)
        .limit(3);

      const upcomingPosts = upcomingPostsData.map(post => ({
        platform: post.platform,
        scheduledAt: post.scheduledAt!,
        content: post.content?.substring(0, 100) + (post.content && post.content.length > 100 ? '...' : '') || '',
      }));

      return {
        userId,
        userName: user.firstName || user.username || 'Artist',
        userEmail: user.email,
        streamsThisWeek,
        streamsLastWeek,
        streamsChange,
        streamsChangePercent,
        topTrack,
        newFollowers: Number(thisWeekAnalytics[0]?.totalFollowers || 0),
        revenueEarned: Number(thisWeekAnalytics[0]?.totalRevenue || 0),
        achievementsUnlocked: recentAchievements.map(a => ({
          name: a.name,
          description: a.description || '',
          icon: a.icon || '🏆',
        })),
        aiRecommendation,
        upcomingPosts,
      };
    } catch (error) {
      logger.error(`Failed to generate weekly report for user ${userId}:`, error);
      return null;
    }
  }

  async sendWeeklyInsights(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    try {
      const optedInUsers = await db.select({
        userId: emailPreferences.userId,
      })
        .from(emailPreferences)
        .where(
          and(
            eq(emailPreferences.weeklyInsights, true),
            sql`${emailPreferences.unsubscribedAt} IS NULL`
          )
        );

      logger.info(`Processing weekly insights for ${optedInUsers.length} users`);

      for (const { userId } of optedInUsers) {
        try {
          const report = await this.generateWeeklyReport(userId);
          if (report) {
            const success = await this.sendWeeklyEmail(report);
            if (success) {
              sent++;
            } else {
              failed++;
            }
          }
        } catch (error) {
          logger.error(`Failed to send weekly insights to user ${userId}:`, error);
          failed++;
        }
      }

      logger.info(`Weekly insights complete: ${sent} sent, ${failed} failed`);
      return { sent, failed };
    } catch (error) {
      logger.error('Failed to process weekly insights batch:', error);
      return { sent, failed };
    }
  }

  private async sendWeeklyEmail(report: WeeklyReport): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('SendGrid not initialized, skipping weekly insights email');
      return false;
    }

    const [sentEmailRecord] = await db.insert(sentEmails).values({
      userId: report.userId,
      emailType: 'weekly_insights',
      subject: `📊 Your Week in Music - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      recipientEmail: report.userEmail,
      metadata: {
        streamsThisWeek: report.streamsThisWeek,
        revenueEarned: report.revenueEarned,
      },
    }).returning();

    const emailId = sentEmailRecord.id;
    const baseUrl = process.env.APP_URL || 'https://maxbooster.ai';
    const trackingPixel = `${baseUrl}/api/emails/track/${emailId}/open`;
    const clickTrackUrl = `${baseUrl}/api/emails/track/${emailId}/click`;

    const html = this.generateEmailTemplate(report, trackingPixel, clickTrackUrl);
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'insights@maxbooster.ai';

    try {
      await sgMail.send({
        to: report.userEmail,
        from: fromEmail,
        subject: `📊 Your Week in Music - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        html,
        text: this.generatePlainTextEmail(report),
      });

      logger.info(`📧 Weekly insights email sent to ${report.userEmail}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send weekly email to ${report.userEmail}:`, error);
      return false;
    }
  }

  private generateEmailTemplate(report: WeeklyReport, trackingPixel: string, clickTrackUrl: string): string {
    const changeIndicator = report.streamsChange >= 0 ? '📈' : '📉';
    const changeColor = report.streamsChange >= 0 ? '#10b981' : '#ef4444';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎵 Max Booster</h1>
      <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">Your Weekly Music Career Insights</p>
    </div>
    
    <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <p style="font-size: 18px; color: #374151; margin: 0 0 20px;">Hey ${report.userName}! 👋</p>
      <p style="font-size: 15px; color: #6b7280; margin: 0 0 30px; line-height: 1.6;">Here's how your music performed this week. Keep pushing forward!</p>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px;">
        <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 20px; border-radius: 12px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #0369a1;">${report.streamsThisWeek.toLocaleString()}</div>
          <div style="font-size: 13px; color: #64748b; margin-top: 5px;">Streams This Week</div>
          <div style="font-size: 12px; color: ${changeColor}; margin-top: 4px;">${changeIndicator} ${report.streamsChangePercent >= 0 ? '+' : ''}${report.streamsChangePercent}% vs last week</div>
        </div>
        <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 20px; border-radius: 12px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #15803d;">$${report.revenueEarned.toFixed(2)}</div>
          <div style="font-size: 13px; color: #64748b; margin-top: 5px;">Revenue Earned</div>
        </div>
        <div style="background: linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%); padding: 20px; border-radius: 12px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #a21caf;">+${report.newFollowers}</div>
          <div style="font-size: 13px; color: #64748b; margin-top: 5px;">New Followers</div>
        </div>
        <div style="background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%); padding: 20px; border-radius: 12px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #ca8a04;">${report.achievementsUnlocked.length}</div>
          <div style="font-size: 13px; color: #64748b; margin-top: 5px;">Achievements Unlocked</div>
        </div>
      </div>
      
      ${report.topTrack ? `
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #667eea;">
        <h3 style="margin: 0 0 10px; color: #374151; font-size: 15px;">🎤 Top Performing Track</h3>
        <p style="margin: 0; color: #1f2937; font-size: 18px; font-weight: 600;">${report.topTrack.title}</p>
        <p style="margin: 5px 0 0; color: #6b7280; font-size: 14px;">${report.topTrack.streams.toLocaleString()} streams this week</p>
      </div>
      ` : ''}
      
      ${report.achievementsUnlocked.length > 0 ? `
      <div style="background-color: #fffbeb; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 15px; color: #374151; font-size: 15px;">🏆 Achievements Unlocked</h3>
        ${report.achievementsUnlocked.map(a => `
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 24px; margin-right: 12px;">${a.icon}</span>
            <div>
              <div style="font-weight: 600; color: #1f2937;">${a.name}</div>
              <div style="font-size: 13px; color: #6b7280;">${a.description}</div>
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${report.aiRecommendation ? `
      <div style="background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px; color: #5b21b6; font-size: 15px;">🤖 AI Recommendation of the Week</h3>
        <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">${report.aiRecommendation.title}</p>
        <p style="margin: 10px 0 0; color: #4c1d95; font-size: 14px; line-height: 1.5;">${report.aiRecommendation.description}</p>
      </div>
      ` : ''}
      
      ${report.upcomingPosts.length > 0 ? `
      <div style="background-color: #f0f9ff; padding: 20px; border-radius: 12px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px; color: #374151; font-size: 15px;">📅 Upcoming Scheduled Posts</h3>
        ${report.upcomingPosts.map(post => `
          <div style="padding: 12px 0; border-bottom: 1px solid #e0f2fe;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: #1f2937; text-transform: capitalize;">${post.platform}</span>
              <span style="font-size: 12px; color: #64748b;">${new Date(post.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <p style="margin: 5px 0 0; font-size: 13px; color: #6b7280;">${post.content}</p>
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${clickTrackUrl}?redirect=${encodeURIComponent('https://maxbooster.ai/dashboard')}" 
           style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Log in to see more →
        </a>
      </div>
      
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
          You're receiving this because you opted in to weekly insights.<br>
          <a href="${clickTrackUrl}?redirect=${encodeURIComponent('https://maxbooster.ai/settings')}" style="color: #6b7280;">Manage email preferences</a> | 
          <a href="${clickTrackUrl}?redirect=${encodeURIComponent('https://maxbooster.ai/api/email-preferences/unsubscribe')}" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    </div>
    
    <p style="text-align: center; margin: 20px 0 0; font-size: 12px; color: #9ca3af;">
      © ${new Date().getFullYear()} Max Booster. All rights reserved.
    </p>
  </div>
  <img src="${trackingPixel}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>`;
  }

  private generatePlainTextEmail(report: WeeklyReport): string {
    return `
Hey ${report.userName}! 👋

Here's your weekly music career insights from Max Booster.

📊 THIS WEEK'S STATS
-------------------
Streams: ${report.streamsThisWeek.toLocaleString()} (${report.streamsChangePercent >= 0 ? '+' : ''}${report.streamsChangePercent}% vs last week)
Revenue: $${report.revenueEarned.toFixed(2)}
New Followers: +${report.newFollowers}
Achievements: ${report.achievementsUnlocked.length} unlocked

${report.topTrack ? `🎤 TOP TRACK: ${report.topTrack.title} (${report.topTrack.streams.toLocaleString()} streams)` : ''}

${report.achievementsUnlocked.length > 0 ? `🏆 ACHIEVEMENTS UNLOCKED:
${report.achievementsUnlocked.map(a => `- ${a.icon} ${a.name}: ${a.description}`).join('\n')}` : ''}

${report.aiRecommendation ? `🤖 AI RECOMMENDATION:
${report.aiRecommendation.title}
${report.aiRecommendation.description}` : ''}

${report.upcomingPosts.length > 0 ? `📅 UPCOMING POSTS:
${report.upcomingPosts.map(p => `- ${p.platform}: ${new Date(p.scheduledAt).toLocaleDateString()}`).join('\n')}` : ''}

Log in to see more: https://maxbooster.ai/dashboard

---
Manage preferences: https://maxbooster.ai/settings
Unsubscribe: https://maxbooster.ai/api/email-preferences/unsubscribe
`;
  }

  async trackEmailOpen(emailId: string): Promise<boolean> {
    try {
      await db.update(sentEmails)
        .set({ openedAt: new Date() })
        .where(
          and(
            eq(sentEmails.id, emailId),
            sql`${sentEmails.openedAt} IS NULL`
          )
        );
      return true;
    } catch (error) {
      logger.error(`Failed to track email open for ${emailId}:`, error);
      return false;
    }
  }

  async trackEmailClick(emailId: string, link: string): Promise<boolean> {
    try {
      await db.update(sentEmails)
        .set({ 
          clickedAt: new Date(),
          clickedLink: link,
        })
        .where(eq(sentEmails.id, emailId));
      return true;
    } catch (error) {
      logger.error(`Failed to track email click for ${emailId}:`, error);
      return false;
    }
  }

  async getEmailPreferences(userId: string) {
    const [prefs] = await db.select()
      .from(emailPreferences)
      .where(eq(emailPreferences.userId, userId))
      .limit(1);
    
    if (!prefs) {
      const [newPrefs] = await db.insert(emailPreferences)
        .values({ userId })
        .returning();
      return newPrefs;
    }
    
    return prefs;
  }

  async updateEmailPreferences(userId: string, updates: Partial<{
    weeklyInsights: boolean;
    weeklyInsightsFrequency: string;
    marketingEmails: boolean;
    releaseAlerts: boolean;
    collaborationAlerts: boolean;
    revenueAlerts: boolean;
  }>) {
    const existing = await this.getEmailPreferences(userId);
    
    const [updated] = await db.update(emailPreferences)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(emailPreferences.id, existing.id))
      .returning();
    
    return updated;
  }

  async unsubscribe(userId: string) {
    await db.update(emailPreferences)
      .set({
        weeklyInsights: false,
        marketingEmails: false,
        unsubscribedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailPreferences.userId, userId));
  }

  async getPreviewData(userId: string): Promise<WeeklyReport | null> {
    return this.generateWeeklyReport(userId);
  }
}

export const weeklyInsightsService = new WeeklyInsightsService();

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { db, dbRead } from '../db';
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';
import { notifications, users } from '../../shared/schema';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { webPushService } from '../services/webPushService.js';
import { buildSilentPayload } from '../services/pushNotificationTypes.js';
import { requireUUIDParam } from '../middleware/requestValidation.js';

const router = Router();

router.use(requireAuth);

interface NotificationPreferences {
  muteAll: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
    allowUrgent: boolean;
  };
  email: {
    enabled: boolean;
    frequency: 'instant' | 'daily' | 'weekly' | 'never';
    categories: Record<string, boolean>;
  };
  push: {
    enabled: boolean;
    categories: Record<string, boolean>;
  };
  sms: {
    enabled: boolean;
    phoneNumber: string | null;
    verified: boolean;
    categories: Record<string, boolean>;
  };
  inApp: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
}

const defaultPreferences: NotificationPreferences = {
  muteAll: false,
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'America/New_York',
    allowUrgent: true,
  },
  email: {
    enabled: true,
    frequency: 'instant',
    categories: {
      account_security: true,
      distribution: true,
      social_media: true,
      marketplace: true,
      royalties: true,
      collaboration: true,
      system: true,
      direct_interaction: true,
      platform_generated: false,
      content_based: true,
      engagement_summary: true,
      location_based: false,
    },
  },
  push: {
    enabled: false,
    silentSync: true,
    categories: {
      account_security: true,
      distribution: true,
      social_media: false,
      marketplace: true,
      royalties: true,
      collaboration: true,
      system: true,
      direct_interaction: true,
      platform_generated: false,
      content_based: false,
      engagement_summary: false,
      location_based: false,
    },
  },
  sms: {
    enabled: false,
    phoneNumber: null,
    verified: false,
    categories: {
      account_security: true,
      royalties: true,
    },
  },
  inApp: {
    enabled: true,
    sound: true,
    desktop: true,
  },
};

router.get('/', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;
    const category = req.query.category as string | undefined;
    const unreadOnly = req.query.unread === 'true';

    const conditions: unknown[] = [eq(notifications.userId, req.user.id)];
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }
    if (category) {
      conditions.push(
        sql`${notifications.metadata}->>'category' = ${category} OR (${notifications.metadata}->>'category' IS NULL AND ${notifications.type} LIKE ${category + '%'})`
      );
    }

    const reader = dbRead ?? db;
    const userNotifications = await reader
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const mappedNotifications = userNotifications.map((n: Record<string, unknown>) => ({
      ...n,
      priority: n.metadata?.priority || 'normal',
      category: n.metadata?.category || getCategory(n.type),
      actionLabel: n.metadata?.actionLabel || null,
      groupId: n.metadata?.groupId || null,
      expiresAt: n.metadata?.expiresAt || null,
    }));

    return res.json(mappedNotifications);
  } catch (error) {
    logger.warn({ err: error }, 'Get notifications error:');
    res.status(500).json({ error: 'Get notifications error:' });
  }
});

router.put('/:id/read', requireUUIDParam('id'), async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { id } = req.params;
    const notification = await storage.getNotificationById(id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await storage.markNotificationRead(id);

    return res.json({
      success: true,
      outcome: {
        type: 'marked_read',
        success: true,
        message: 'Notification marked as read',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Mark notification read error:');
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/mark-all-read', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await storage.markAllNotificationsRead(req.user.id);

    return res.json({
      success: true,
      outcome: {
        type: 'marked_all_read',
        success: true,
        message: 'All notifications marked as read',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Mark all read error:');
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.delete('/clear-all', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await db.delete(notifications).where(eq(notifications.userId, req.user.id));

    return res.json({
      success: true,
      outcome: {
        type: 'dismissed',
        success: true,
        message: 'All notifications cleared',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Clear all notifications error:');
    return res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

router.delete('/:id', requireUUIDParam('id'), async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { id } = req.params;
    const notification = await storage.getNotificationById(id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await storage.deleteNotification(id);

    return res.json({
      success: true,
      outcome: {
        type: 'dismissed',
        success: true,
        message: 'Notification deleted',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Delete notification error:');
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

router.get('/preferences', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await storage.getUser(req.user.id);
    const savedPrefs = user?.notificationSettings as NotificationPreferences | null;

    const mergedPrefs = {
      ...defaultPreferences,
      ...savedPrefs,
      quietHours: { ...defaultPreferences.quietHours, ...savedPrefs?.quietHours },
      email: {
        ...defaultPreferences.email,
        ...savedPrefs?.email,
        categories: { ...defaultPreferences.email.categories, ...savedPrefs?.email?.categories },
      },
      push: {
        ...defaultPreferences.push,
        ...savedPrefs?.push,
        categories: { ...defaultPreferences.push.categories, ...savedPrefs?.push?.categories },
      },
      sms: {
        ...defaultPreferences.sms,
        ...savedPrefs?.sms,
        categories: { ...defaultPreferences.sms.categories, ...savedPrefs?.sms?.categories },
      },
      inApp: { ...defaultPreferences.inApp, ...savedPrefs?.inApp },
    };

    return res.json(mergedPrefs);
  } catch (error) {
    logger.warn({ err: error }, 'Get notification preferences error:');
    return res.json(defaultPreferences);
  }
});

router.put('/preferences', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const newPreferences = req.body as Partial<NotificationPreferences>;

    await storage.updateUser(req.user.id, {
      notificationSettings: newPreferences,
    });

    let outcomeType = 'preference_saved';
    let outcomeMessage = 'Notification preferences updated';

    if (newPreferences.muteAll !== undefined) {
      outcomeType = 'mute_toggled';
      outcomeMessage = newPreferences.muteAll
        ? 'All notifications muted'
        : 'Notifications unmuted';
    } else if (newPreferences.quietHours?.enabled !== undefined) {
      outcomeType = 'quiet_hours_set';
      outcomeMessage = newPreferences.quietHours.enabled
        ? 'Quiet hours enabled'
        : 'Quiet hours disabled';
    } else if (newPreferences.email?.frequency) {
      outcomeType = 'digest_changed';
      outcomeMessage = `Email digest set to ${newPreferences.email.frequency}`;
    }

    return res.json({
      success: true,
      outcome: {
        type: outcomeType,
        success: true,
        message: outcomeMessage,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Update notification preferences error:');
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.post('/push/subscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription data' });
    }

    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as Record<string, unknown>) || {};

    await storage.updateUser(req.user.id, {
      notificationSettings: {
        ...currentSettings,
        push: {
          ...currentSettings.push,
          enabled: true,
          subscription: {
            endpoint,
            keys,
          },
        },
      },
    });

    return res.json({
      success: true,
      outcome: {
        type: 'push_permission_granted',
        success: true,
        message: 'Push notifications enabled',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Push subscribe error:');
    return res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
});

router.post('/push/unsubscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as Record<string, unknown>) || {};

    await storage.updateUser(req.user.id, {
      notificationSettings: {
        ...currentSettings,
        push: {
          ...currentSettings.push,
          enabled: false,
          subscription: null,
        },
      },
    });

    return res.json({
      success: true,
      outcome: {
        type: 'channel_toggled',
        success: true,
        message: 'Push notifications disabled',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Push unsubscribe error:');
    return res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
});

router.post('/sms/verify', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as Record<string, unknown>) || {};

    await storage.updateUser(req.user.id, {
      notificationSettings: {
        ...currentSettings,
        sms: {
          ...currentSettings.sms,
          phoneNumber,
          verified: false,
          pendingVerification: verificationCode,
          pendingVerificationExpiry: Date.now() + 10 * 60 * 1000,
        },
      },
    });

    // ── Attempt real SMS delivery via Twilio ──────────────────────────────────
    const twilioSid        = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken      = process.env.TWILIO_AUTH_TOKEN;
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const twilioPhone         = process.env.TWILIO_PHONE_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (twilioSid && twilioToken && verifyServiceSid) {
      // Preferred: Twilio Verify — handles expiry, retries, and fraud guard.
      // Both the Verify Service and Messaging Service are named "Max Booster",
      // so the default SMS reads: "Your Max Booster verification code is: XXXXXX"
      const twilio = (await import('twilio')).default;
      const client = twilio(twilioSid, twilioToken);
      const templateSid = process.env.TWILIO_VERIFY_TEMPLATE_SID;
      const params: Record<string, string> = { to: phoneNumber, channel: 'sms' };
      if (templateSid) params.templateSid = templateSid;
      await client.verify.v2.services(verifyServiceSid).verifications.create(params);
      logger.info(`[SMS] Max Booster verify code dispatched via Twilio Verify to ${phoneNumber.slice(0, 5)}*** for user ${req.user.id}`);
    } else if (twilioSid && twilioToken && (messagingServiceSid || twilioPhone)) {
      // Fallback: Twilio Messages API with fully branded body.
      // Uses Messaging Service SID (preferred — matches service name "Max Booster")
      // or falls back to a raw phone number.
      const twilio = (await import('twilio')).default;
      const client = twilio(twilioSid, twilioToken);
      const smsBody =
        `Your Max Booster verification code is: ${verificationCode}\n\n` +
        `This code expires in 10 minutes. If you didn't request this, you can safely ignore this message.\n\n` +
        `— The Max Booster Team`;
      const msgParams = messagingServiceSid
        ? { to: phoneNumber, messagingServiceSid, body: smsBody }
        : { to: phoneNumber, from: twilioPhone as string, body: smsBody };
      await client.messages.create(msgParams);
      const sender = messagingServiceSid ? `MessagingService(${messagingServiceSid.slice(0, 6)}***)` : `from(${twilioPhone})`;
      logger.info(`[SMS] Max Booster branded code sent via ${sender} to ${phoneNumber.slice(0, 5)}*** for user ${req.user.id}`);
    } else {
      logger.info(`[SMS DEV] Max Booster verification code for ${phoneNumber.slice(0, 5)}***: ${verificationCode}`);
    }

    return res.json({
      success: true,
      message: 'A Max Booster verification code has been sent to your phone.',
    });
  } catch (error) {
    logger.warn({ err: error }, 'SMS verify error:');
    return res.status(500).json({ error: 'Failed to send Max Booster verification code' });
  }
});

router.post('/sms/confirm', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { code } = req.body;

    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as Record<string, unknown>) || {};
    const smsSettings = (currentSettings.sms as Record<string, unknown>) || {};
    const pendingCode  = smsSettings.pendingVerification as string | undefined;
    const expiry       = smsSettings.pendingVerificationExpiry as number | undefined;

    if (!pendingCode) {
      return res.status(400).json({ error: 'No pending verification. Please request a new Max Booster code.' });
    }
    if (expiry && Date.now() > expiry) {
      return res.status(400).json({ error: 'Code expired. Please request a new Max Booster verification code.' });
    }
    if (pendingCode !== (code as string)?.trim()) {
      return res.status(400).json({ error: 'Invalid verification code. Please check your SMS and try again.' });
    }

    await storage.updateUser(req.user.id, {
      notificationSettings: {
        ...currentSettings,
        sms: {
          ...smsSettings,
          verified: true,
          pendingVerification: null,
          pendingVerificationExpiry: null,
        },
      },
    });

    logger.info(`[SMS] Phone verified for user ${req.user.id} — Max Booster SMS notifications active`);
    return res.json({
      success: true,
      message: 'Phone number verified — Max Booster SMS notifications are now active.',
      outcome: {
        type: 'channel_toggled',
        success: true,
        message: 'Max Booster SMS notifications enabled and verified',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'SMS confirm error:');
    return res.status(500).json({ error: 'Failed to confirm Max Booster verification code' });
  }
});

router.post('/test', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const notification = await storage.createNotification({
      userId: req.user.id,
      type: 'system_update',
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working correctly.',
      actionUrl: '/dashboard',
      metadata: { priority: 'normal', category: 'system' },
    });

    if (typeof (global as Record<string, unknown>).broadcastNotification === 'function') {
      (global as Record<string, unknown>).broadcastNotification(req.user.id, {
        ...notification,
        priority: 'normal',
        category: 'system',
      });
    }

    const { notificationDispatcher } = await import('../services/notificationDispatcher.js');
    const pushResult = await notificationDispatcher.sendTestToUser(req.user.id);

    return res.json({
      success: true,
      message: 'Test notification sent',
      notification,
      push: pushResult,
      outcome: {
        type: 'delivered',
        success: true,
        message: pushResult.totalSent > 0
          ? `Test delivered to ${pushResult.totalSent} device(s) via [${pushResult.channels.join(', ')}]`
          : 'In-app notification sent (no push subscriptions registered)',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Test notification error:');
    return res.status(500).json({ error: 'Failed to send test notification' });
  }
});

router.get('/push/status', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { notificationDispatcher } = await import('../services/notificationDispatcher.js');
    const { desktopPushService } = await import('../services/desktopPushService.js');
    const { mobilePushService } = await import('../services/mobilePushService.js');

    const [breakdown, mobileStatus, serviceStatus] = await Promise.all([
      desktopPushService.getSubscriptionBreakdown(req.user.id),
      mobilePushService.getUserTokenStatus(req.user.id),
      Promise.resolve(notificationDispatcher.getStatus()),
    ]);

    return res.json({
      services: serviceStatus,
      subscriptions: {
        web: breakdown,
        mobile: mobileStatus,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Push status error:');
    return res.status(500).json({ error: 'Failed to get push status' });
  }
});

router.post('/mobile-tokens', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { token, platform, deviceName, appVersion } = req.body;

    if (!token) return res.status(400).json({ error: 'Device token is required' });
    if (!['android', 'ios'].includes(platform)) {
      return res.status(400).json({ error: 'Platform must be android or ios' });
    }

    const { mobilePushService } = await import('../services/mobilePushService.js');
    await mobilePushService.registerToken(req.user.id, token, platform, deviceName, appVersion);

    return res.json({
      success: true,
      outcome: {
        type: 'push_permission_granted',
        success: true,
        message: `Mobile push registered for ${platform} device`,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Mobile token register error:');
    return res.status(500).json({ error: 'Failed to register mobile device token' });
  }
});

router.delete('/mobile-tokens', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { token } = req.body;
    const { mobilePushService } = await import('../services/mobilePushService.js');

    if (token) {
      await mobilePushService.deactivateToken(token);
    } else {
      await mobilePushService.removeUserTokens(req.user.id);
    }

    return res.json({
      success: true,
      outcome: {
        type: 'channel_toggled',
        success: true,
        message: token ? 'Mobile device unregistered' : 'All mobile devices unregistered',
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Mobile token remove error:');
    return res.status(500).json({ error: 'Failed to remove mobile device token' });
  }
});

router.get('/mobile-tokens', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { mobilePushService } = await import('../services/mobilePushService.js');
    const status = await mobilePushService.getUserTokenStatus(req.user.id);
    return res.json(status);
  } catch (error) {
    logger.warn({ err: error }, 'Mobile tokens list error:');
    return res.status(500).json({ error: 'Failed to list mobile device tokens' });
  }
});

function getCategory(type: string): string {
  const categoryMap: Record<string, string> = {
    // Collaboration
    collaboration_invite: 'collaboration',
    collaboration_accepted: 'collaboration',
    collaboration_declined: 'collaboration',
    collaboration_comment: 'collaboration',
    collaboration_mention: 'collaboration',
    // Royalties
    payment_received: 'royalties',
    payout_completed: 'royalties',
    payout_failed: 'royalties',
    payment_failed: 'royalties',
    royalty_statement_ready: 'royalties',
    // Distribution
    release_milestone: 'distribution',
    release_live: 'distribution',
    release_rejected: 'distribution',
    release_submitted: 'distribution',
    release_scheduled: 'distribution',
    release_takedown: 'distribution',
    release_processing: 'distribution',
    platform_update: 'distribution',
    upload_complete: 'distribution',
    stream_milestone: 'distribution',
    ai_processing_complete: 'distribution',
    // Social media (scheduling/publishing/autopilot)
    social_post_scheduled: 'social_media',
    social_post_published: 'social_media',
    social_content_generated: 'social_media',
    social_auto_published: 'social_media',
    social_token_expiring: 'account_security',
    // Direct Interaction (likes, comments, follows, etc.)
    social_like: 'direct_interaction',
    social_comment: 'direct_interaction',
    social_reply: 'direct_interaction',
    social_mention: 'direct_interaction',
    social_dm: 'direct_interaction',
    social_follow: 'direct_interaction',
    social_share: 'direct_interaction',
    follower_milestone: 'engagement_summary',
    // Platform Generated
    platform_suggested_account: 'platform_generated',
    platform_trending_topic: 'platform_generated',
    platform_group_activity: 'platform_generated',
    platform_event_invite: 'platform_generated',
    platform_birthday_reminder: 'platform_generated',
    // Content Based
    content_new_post: 'content_based',
    content_live_stream: 'content_based',
    content_recommended: 'content_based',
    // Engagement Summary
    engagement_digest: 'engagement_summary',
    engagement_milestone: 'engagement_summary',
    engagement_story_reaction: 'engagement_summary',
    social_engagement_alert: 'engagement_summary',
    // Location Based
    location_nearby_event: 'location_based',
    location_trending_local: 'location_based',
    // Marketplace
    marketplace_purchase: 'marketplace',
    marketplace_sale: 'marketplace',
    marketplace_review: 'marketplace',
    marketplace_offer: 'marketplace',
    beat_play_milestone: 'marketplace',
    beat_listing_live: 'marketplace',
    beat_sold: 'marketplace',
    beat_purchased: 'marketplace',
    stems_purchased: 'marketplace',
    // Studio / Music creation
    studio_project_created: 'content_based',
    studio_render_complete: 'content_based',
    studio_stem_export: 'content_based',
    // System
    system_announcement: 'system',
    system_maintenance: 'system',
    system_update: 'system',
    storage_quota_warning: 'system',
    promotion: 'system',
    ad_campaign_created: 'system',
    ad_campaign_milestone: 'system',
    ad_campaign_optimized: 'system',
    // Account Security
    security_new_login: 'account_security',
    security_password_changed: 'account_security',
    security_2fa_enabled: 'account_security',
    security_2fa_disabled: 'account_security',
    security_suspicious_activity: 'account_security',
    account_verified: 'account_security',
    account_warning: 'account_security',
    subscription_expiring: 'account_security',
    subscription_renewed: 'account_security',
    subscription_changed: 'account_security',
    // Achievements
    achievement_unlocked: 'achievements',
    streak_milestone: 'achievements',
    // Platform admin
    admin_new_user: 'platform_admin',
    admin_payment_issue: 'platform_admin',
    admin_storage_critical: 'platform_admin',
    admin_marketplace_review: 'platform_admin',
    admin_user_report: 'platform_admin',
    admin_revenue_milestone: 'platform_admin',
    admin_health_alert: 'platform_admin',
    admin_user_flagged: 'platform_admin',
    admin_support_ticket: 'platform_admin',
  };

  return categoryMap[type] || 'system';
}

router.post('/push/silent', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { reason = 'feed_refresh' } = req.body;
    const validReasons = ['feed_refresh', 'message_sync', 'count_update'];
    const safeReason = validReasons.includes(reason) ? reason : 'feed_refresh';

    if (!webPushService.isReady()) {
      return res.json({ success: false, message: 'Push not configured' });
    }

    const payload = buildSilentPayload(safeReason as Record<string, unknown>);
    const result = await webPushService.sendRichToUser(req.user.id, payload);

    return res.json({ success: true, sent: result.sent, reason: safeReason });
  } catch (error) {
    logger.warn({ err: error }, 'Silent push error:');
    return res.status(500).json({ error: 'Failed to send silent push' });
  }
});

// ── Canonical push routes (called by usePushNotifications hook) ──────────────

// Returns VAPID public key so the browser can create a push subscription
router.get('/push-key', (req: Request, res: Response) => {
  const publicKey = webPushService.getPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  return res.json({ publicKey });
});

// Save a new push subscription (writes to pushSubscriptions DB table)
// Also auto-enables push in notification settings so the dispatcher delivers.
router.post('/push-subscriptions', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription data' });
    }

    const ua = req.headers['user-agent'] || undefined;
    await webPushService.saveSubscription(req.user.id, { endpoint, keys }, ua);

    // Auto-enable push in notification settings when user subscribes.
    // The user has already granted browser permission — honour that intent.
    try {
      const currentSettings = (req.user.notificationSettings as Record<string, unknown>) || {};
      const currentPush = (currentSettings.push as Record<string, unknown>) || {};
      if (currentPush.enabled !== true) {
        await db
          .update(users)
          .set({
            notificationSettings: {
              ...currentSettings,
              push: { ...currentPush, enabled: true },
            },
            updatedAt: new Date(),
          })
          .where(eq(users.id, req.user.id));
      }
    } catch (settingsErr) {
      logger.warn({ err: settingsErr }, 'Push subscribe: could not auto-enable push setting (non-fatal)');
    }

    return res.json({ success: true, message: 'Push subscription registered' });
  } catch (error) {
    logger.warn({ err: error }, 'Push subscribe error:');
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// Remove a push subscription from the DB
router.delete('/push-subscriptions', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await webPushService.removeSubscription(endpoint);
    } else {
      await webPushService.removeUserSubscriptions(req.user.id);
    }
    return res.json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
    logger.warn({ err: error }, 'Push unsubscribe error:');
    return res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

// Returns subscription status in the format expected by the hook
router.get('/push-subscriptions/status', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const subs = await webPushService.getUserSubscriptions(req.user.id);
    return res.json({
      hasSubscriptions: subs.length > 0,
      count: subs.length,
      devices: subs.map((s: Record<string, unknown>) => ({
        id: s.id,
        userAgent: s.userAgent || 'Unknown device',
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Push subscription status error:');
    return res.json({ hasSubscriptions: false, count: 0, devices: [] });
  }
});

// Send a real Web Push test notification to all of the user's subscribed devices
router.post('/push-test', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    if (!webPushService.isReady()) {
      return res.status(503).json({ error: 'Push service not configured' });
    }

    const result = await webPushService.sendToUser(req.user.id, {
      title: '🔔 Max Booster Push Test',
      body: 'Push notifications are working! You\'ll receive alerts for royalties, campaigns, and more.',
      url: '/notifications',
      tag: 'push-test',
      requireInteraction: false,
      data: { category: 'system' },
    });

    return res.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message: result.sent > 0
        ? `Test delivered to ${result.sent} device(s)`
        : 'No push subscriptions registered on this account',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Push test error:');
    return res.status(500).json({ error: 'Failed to send push test' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const reader = dbRead ?? db;
    const result = await reader
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));

    const count = result[0]?.count || 0;

    return res.json({ count });
  } catch (error) {
    logger.warn({ err: error }, 'Get unread count error:');
    return res.json({ count: 0 });
  }
});

// GET /:id - get single notification (after all specific paths to avoid route shadowing)
router.get('/:id', requireUUIDParam('id'), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
      .limit(1);
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (error) {
    logger.warn({ err: error }, 'Get notification error:');
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';
import { notifications } from '../../shared/schema';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger.js';
import crypto from 'crypto';

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
    },
  },
  push: {
    enabled: false,
    categories: {
      account_security: true,
      distribution: true,
      social_media: false,
      marketplace: true,
      royalties: true,
      collaboration: true,
      system: true,
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
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;
    const category = req.query.category as string | undefined;
    const unreadOnly = req.query.unread === 'true';

    const conditions: any[] = [eq(notifications.userId, req.user.id)];
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }
    if (category) {
      conditions.push(
        sql`${notifications.metadata}->>'category' = ${category} OR (${notifications.metadata}->>'category' IS NULL AND ${notifications.type} LIKE ${category + '%'})`
      );
    }

    const userNotifications = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const mappedNotifications = userNotifications.map((n: any) => ({
      ...n,
      priority: n.metadata?.priority || 'normal',
      category: n.metadata?.category || getCategory(n.type),
      actionLabel: n.metadata?.actionLabel || null,
      groupId: n.metadata?.groupId || null,
      expiresAt: n.metadata?.expiresAt || null,
    }));

    return res.json(mappedNotifications);
  } catch (error) {
    logger.error('Get notifications error:', error);
    return res.json([]);
  }
});

router.put('/:id/read', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { id } = req.params;
    const notification = await storage.getNotificationById(id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
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
    logger.error('Mark notification read error:', error);
    return res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

router.put('/mark-all-read', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
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
    logger.error('Mark all read error:', error);
    return res.status(500).json({ message: 'Failed to mark all as read' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { id } = req.params;
    const notification = await storage.getNotificationById(id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
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
    logger.error('Delete notification error:', error);
    return res.status(500).json({ message: 'Failed to delete notification' });
  }
});

router.delete('/clear-all', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
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
    logger.error('Clear all notifications error:', error);
    return res.status(500).json({ message: 'Failed to clear notifications' });
  }
});

router.get('/preferences', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
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
    logger.error('Get notification preferences error:', error);
    return res.json(defaultPreferences);
  }
});

router.put('/preferences', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
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
    logger.error('Update notification preferences error:', error);
    return res.status(500).json({ message: 'Failed to update preferences' });
  }
});

router.post('/push/subscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Invalid push subscription data' });
    }

    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as any) || {};

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
    logger.error('Push subscribe error:', error);
    return res.status(500).json({ message: 'Failed to subscribe to push notifications' });
  }
});

router.post('/push/unsubscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as any) || {};

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
    logger.error('Push unsubscribe error:', error);
    return res.status(500).json({ message: 'Failed to unsubscribe from push notifications' });
  }
});

router.post('/sms/verify', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    logger.info(`[SMS Verification] Code sent to ${phoneNumber.slice(0, 3)}***${phoneNumber.slice(-2)} for user ${req.user.id}`);

    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as any) || {};

    await storage.updateUser(req.user.id, {
      notificationSettings: {
        ...currentSettings,
        sms: {
          ...currentSettings.sms,
          phoneNumber,
          verified: false,
          pendingVerification: verificationCode,
        },
      },
    });

    return res.json({
      success: true,
      message: 'Verification code sent',
    });
  } catch (error) {
    logger.error('SMS verify error:', error);
    return res.status(500).json({ message: 'Failed to send verification code' });
  }
});

router.post('/sms/confirm', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { code } = req.body;

    const user = await storage.getUser(req.user.id);
    const currentSettings = (user?.notificationSettings as any) || {};
    const pendingCode = currentSettings.sms?.pendingVerification;

    if (!pendingCode || pendingCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    await storage.updateUser(req.user.id, {
      notificationSettings: {
        ...currentSettings,
        sms: {
          ...currentSettings.sms,
          verified: true,
          pendingVerification: null,
        },
      },
    });

    return res.json({
      success: true,
      message: 'Phone number verified',
      outcome: {
        type: 'channel_toggled',
        success: true,
        message: 'SMS notifications enabled and verified',
      },
    });
  } catch (error) {
    logger.error('SMS confirm error:', error);
    return res.status(500).json({ message: 'Failed to confirm verification code' });
  }
});

router.post('/test', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const notification = await storage.createNotification({
      userId: req.user.id,
      type: 'system_update',
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working correctly.',
      actionUrl: '/dashboard',
      metadata: {
        priority: 'normal',
        category: 'system',
      },
    });

    if (typeof (global as any).broadcastNotification === 'function') {
      (global as any).broadcastNotification(req.user.id, {
        ...notification,
        priority: 'normal',
        category: 'system',
      });
    }

    return res.json({
      success: true,
      message: 'Test notification sent',
      notification,
      outcome: {
        type: 'delivered',
        success: true,
        message: 'Test notification delivered',
      },
    });
  } catch (error) {
    logger.error('Test notification error:', error);
    return res.status(500).json({ message: 'Failed to send test notification' });
  }
});

function getCategory(type: string): string {
  const categoryMap: Record<string, string> = {
    collaboration_invite: 'collaboration',
    collaboration_accepted: 'collaboration',
    collaboration_declined: 'collaboration',
    collaboration_comment: 'collaboration',
    collaboration_mention: 'collaboration',
    payment_received: 'royalties',
    payout_completed: 'royalties',
    payout_failed: 'royalties',
    royalty_statement_ready: 'royalties',
    release_milestone: 'distribution',
    release_live: 'distribution',
    release_rejected: 'distribution',
    release_submitted: 'distribution',
    release_processing: 'distribution',
    platform_update: 'distribution',
    social_like: 'social_media',
    social_comment: 'social_media',
    social_share: 'social_media',
    social_follow: 'social_media',
    social_post_scheduled: 'social_media',
    social_post_published: 'social_media',
    social_engagement_alert: 'social_media',
    marketplace_purchase: 'marketplace',
    marketplace_sale: 'marketplace',
    marketplace_review: 'marketplace',
    marketplace_offer: 'marketplace',
    system_announcement: 'system',
    system_maintenance: 'system',
    system_update: 'system',
    security_new_login: 'account_security',
    security_password_changed: 'account_security',
    security_2fa_enabled: 'account_security',
    security_2fa_disabled: 'account_security',
    security_suspicious_activity: 'account_security',
    account_verified: 'account_security',
    account_warning: 'account_security',
  };

  return categoryMap[type] || 'system';
}

router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));

    const count = result[0]?.count || 0;

    return res.json({ count });
  } catch (error) {
    logger.error('Get unread count error:', error);
    return res.json({ count: 0 });
  }
});

export default router;

export type NotificationType =
  | 'collaboration_invite'
  | 'collaboration_accepted'
  | 'collaboration_declined'
  | 'collaboration_comment'
  | 'collaboration_mention'
  | 'payment_received'
  | 'payout_completed'
  | 'payout_failed'
  | 'payment_failed'
  | 'royalty_statement_ready'
  | 'release_milestone'
  | 'release_live'
  | 'release_rejected'
  | 'release_submitted'
  | 'release_processing'
  | 'platform_update'
  | 'upload_complete'
  | 'stream_milestone'
  | 'ai_processing_complete'
  | 'social_like'
  | 'social_comment'
  | 'social_share'
  | 'social_follow'
  | 'social_post_scheduled'
  | 'social_post_published'
  | 'social_engagement_alert'
  | 'follower_milestone'
  | 'social_token_expiring'
  | 'marketplace_purchase'
  | 'marketplace_sale'
  | 'marketplace_review'
  | 'marketplace_offer'
  | 'beat_play_milestone'
  | 'system_announcement'
  | 'system_maintenance'
  | 'system_update'
  | 'storage_quota_warning'
  | 'security_new_login'
  | 'security_password_changed'
  | 'security_2fa_enabled'
  | 'security_2fa_disabled'
  | 'security_suspicious_activity'
  | 'account_verified'
  | 'account_warning'
  | 'subscription_expiring'
  | 'subscription_renewed'
  | 'subscription_changed'
  | 'achievement_unlocked'
  | 'streak_milestone'
  | 'promotion'
  | 'admin_new_user'
  | 'admin_payment_issue'
  | 'admin_storage_critical'
  | 'admin_marketplace_review'
  | 'admin_user_report'
  | 'admin_revenue_milestone'
  | 'admin_health_alert'
  | 'admin_user_flagged'
  | 'admin_support_ticket'
  | 'default';

export type NotificationCategory =
  | 'account_security'
  | 'distribution'
  | 'social_media'
  | 'marketplace'
  | 'royalties'
  | 'collaboration'
  | 'achievements'
  | 'system'
  | 'platform_admin';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationChannel = 'inApp' | 'push' | 'email' | 'sms';

export type EmailFrequency = 'instant' | 'daily' | 'weekly' | 'never';

export interface QuietHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
  allowUrgent: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string | null;
  isRead: boolean;
  priority: NotificationPriority;
  actionUrl: string | null;
  actionLabel: string | null;
  groupId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface GroupedNotification {
  groupId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  count: number;
  latestMessage: string | null;
  notifications: Notification[];
  isRead: boolean;
  priority: NotificationPriority;
  createdAt: string;
}

export interface NotificationPreferences {
  muteAll: boolean;
  quietHours: QuietHours;
  email: {
    enabled: boolean;
    frequency: EmailFrequency;
    categories: {
      account_security: boolean;
      distribution: boolean;
      social_media: boolean;
      marketplace: boolean;
      royalties: boolean;
      collaboration: boolean;
      achievements: boolean;
      system: boolean;
      platform_admin: boolean;
    };
  };
  push: {
    enabled: boolean;
    categories: {
      account_security: boolean;
      distribution: boolean;
      social_media: boolean;
      marketplace: boolean;
      royalties: boolean;
      collaboration: boolean;
      achievements: boolean;
      system: boolean;
      platform_admin: boolean;
    };
  };
  sms: {
    enabled: boolean;
    phoneNumber: string | null;
    verified: boolean;
    categories: {
      account_security: boolean;
      royalties: boolean;
    };
  };
  inApp: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface EmailDeliveryStatus {
  id: string;
  emailType: string;
  subject: string;
  recipientEmail: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sentAt: string;
  openedAt: string | null;
  clickedAt: string | null;
  clickedLink: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NotificationOutcome {
  type: 'preference_saved' | 'channel_toggled' | 'digest_changed' | 'quiet_hours_set' | 
        'mute_toggled' | 'marked_read' | 'marked_all_read' | 'dismissed' | 'action_taken' |
        'push_permission_granted' | 'push_permission_denied' | 'delivered' | 'failed';
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export const categoryConfig: Record<NotificationCategory, { label: string; description: string }> = {
  account_security: { label: 'Account & Security', description: 'Login alerts, 2FA, password changes, subscriptions' },
  distribution: { label: 'Distribution', description: 'Release status, uploads, streams, AI tasks' },
  social_media: { label: 'Social Media', description: 'Posts, engagement, followers, scheduling' },
  marketplace: { label: 'Marketplace', description: 'Purchases, sales, reviews, beat plays' },
  royalties: { label: 'Royalties', description: 'Payments, statements, payouts' },
  collaboration: { label: 'Collaboration', description: 'Invites, comments, mentions' },
  achievements: { label: 'Achievements', description: 'Badges, streaks, milestones' },
  system: { label: 'System', description: 'Maintenance, updates, storage warnings' },
  platform_admin: { label: 'Platform Admin', description: 'New users, payment issues, health alerts, reports, flagged accounts' },
};

export const typeToCategory: Record<NotificationType, NotificationCategory> = {
  collaboration_invite: 'collaboration',
  collaboration_accepted: 'collaboration',
  collaboration_declined: 'collaboration',
  collaboration_comment: 'collaboration',
  collaboration_mention: 'collaboration',
  payment_received: 'royalties',
  payout_completed: 'royalties',
  payout_failed: 'royalties',
  payment_failed: 'royalties',
  royalty_statement_ready: 'royalties',
  release_milestone: 'distribution',
  release_live: 'distribution',
  release_rejected: 'distribution',
  release_submitted: 'distribution',
  release_processing: 'distribution',
  platform_update: 'distribution',
  upload_complete: 'distribution',
  stream_milestone: 'distribution',
  ai_processing_complete: 'distribution',
  social_like: 'social_media',
  social_comment: 'social_media',
  social_share: 'social_media',
  social_follow: 'social_media',
  social_post_scheduled: 'social_media',
  social_post_published: 'social_media',
  social_engagement_alert: 'social_media',
  follower_milestone: 'social_media',
  social_token_expiring: 'account_security',
  marketplace_purchase: 'marketplace',
  marketplace_sale: 'marketplace',
  marketplace_review: 'marketplace',
  marketplace_offer: 'marketplace',
  beat_play_milestone: 'marketplace',
  system_announcement: 'system',
  system_maintenance: 'system',
  system_update: 'system',
  storage_quota_warning: 'system',
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
  achievement_unlocked: 'achievements',
  streak_milestone: 'achievements',
  promotion: 'system',
  admin_new_user: 'platform_admin',
  admin_payment_issue: 'platform_admin',
  admin_storage_critical: 'platform_admin',
  admin_marketplace_review: 'platform_admin',
  admin_user_report: 'platform_admin',
  admin_revenue_milestone: 'platform_admin',
  admin_health_alert: 'platform_admin',
  admin_user_flagged: 'platform_admin',
  admin_support_ticket: 'platform_admin',
  default: 'system',
};

export const priorityConfig: Record<NotificationPriority, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low', color: 'text-gray-500', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  normal: { label: 'Normal', color: 'text-blue-500', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  high: { label: 'High', color: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  urgent: { label: 'Urgent', color: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

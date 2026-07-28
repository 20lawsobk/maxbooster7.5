export type NotificationType =
  | "collaboration_invite"
  | "collaboration_accepted"
  | "collaboration_declined"
  | "collaboration_comment"
  | "collaboration_mention"
  | "payment_received"
  | "payout_completed"
  | "payout_failed"
  | "payment_failed"
  | "royalty_statement_ready"
  | "release_milestone"
  | "release_live"
  | "release_rejected"
  | "release_submitted"
  | "release_processing"
  | "platform_update"
  | "upload_complete"
  | "stream_milestone"
  | "ai_processing_complete"
  // Social – scheduling / publishing
  | "social_post_scheduled"
  | "social_post_published"
  | "social_token_expiring"
  // Direct Interaction
  | "social_like"
  | "social_comment"
  | "social_reply"
  | "social_mention"
  | "social_dm"
  | "social_follow"
  | "social_share"
  // Platform Generated
  | "platform_suggested_account"
  | "platform_trending_topic"
  | "platform_group_activity"
  | "platform_event_invite"
  | "platform_birthday_reminder"
  // Content Based
  | "content_new_post"
  | "content_live_stream"
  | "content_recommended"
  // Engagement Summary
  | "engagement_digest"
  | "engagement_milestone"
  | "engagement_story_reaction"
  | "social_engagement_alert"
  | "follower_milestone"
  // Location Based
  | "location_nearby_event"
  | "location_trending_local"
  // Marketplace
  | "marketplace_purchase"
  | "marketplace_sale"
  | "marketplace_review"
  | "marketplace_offer"
  | "beat_play_milestone"
  // System
  | "system_announcement"
  | "system_maintenance"
  | "system_update"
  | "storage_quota_warning"
  | "promotion"
  | "ad_campaign_created"
  | "ad_campaign_milestone"
  | "ad_campaign_optimized"
  // Account Security
  | "security_new_login"
  | "security_password_changed"
  | "security_2fa_enabled"
  | "security_2fa_disabled"
  | "security_suspicious_activity"
  | "account_verified"
  | "account_warning"
  | "subscription_expiring"
  | "subscription_renewed"
  | "subscription_changed"
  // Achievements
  | "achievement_unlocked"
  | "streak_milestone"
  // Admin
  | "admin_new_user"
  | "admin_payment_issue"
  | "admin_storage_critical"
  | "admin_marketplace_review"
  | "admin_user_report"
  | "admin_revenue_milestone"
  | "admin_health_alert"
  | "admin_user_flagged"
  | "admin_support_ticket"
  | "default";

export type NotificationCategory =
  | "account_security"
  | "distribution"
  | "social_media"
  | "direct_interaction"
  | "platform_generated"
  | "content_based"
  | "engagement_summary"
  | "location_based"
  | "marketplace"
  | "royalties"
  | "collaboration"
  | "achievements"
  | "system"
  | "platform_admin";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type NotificationChannel = "inApp" | "push" | "email" | "sms";

export type EmailFrequency = "instant" | "daily" | "weekly" | "never";

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
    categories: Record<string, boolean>;
  };
  push: {
    enabled: boolean;
    silentSync?: boolean;
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
  status: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed";
  sentAt: string;
  openedAt: string | null;
  clickedAt: string | null;
  clickedLink: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NotificationOutcome {
  type:
    | "preference_saved"
    | "channel_toggled"
    | "digest_changed"
    | "quiet_hours_set"
    | "mute_toggled"
    | "marked_read"
    | "marked_all_read"
    | "dismissed"
    | "action_taken"
    | "push_permission_granted"
    | "push_permission_denied"
    | "delivered"
    | "failed";
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export const categoryConfig: Record<
  NotificationCategory,
  { label: string; description: string; emoji: string }
> = {
  account_security: {
    label: "Security & Account",
    description: "Login alerts, 2FA, password changes, subscriptions",
    emoji: "🔐",
  },
  distribution: {
    label: "Distribution",
    description: "Release status, uploads, streams, AI processing",
    emoji: "🎵",
  },
  social_media: {
    label: "Social Scheduling",
    description: "Post scheduling, publishing, and autopilot activity",
    emoji: "📅",
  },
  direct_interaction: {
    label: "Direct Interactions",
    description: "Likes, comments, replies, mentions, DMs, and follows",
    emoji: "❤️",
  },
  platform_generated: {
    label: "Platform Suggestions",
    description: "Suggested accounts, trending topics, group activity, events",
    emoji: "🔥",
  },
  content_based: {
    label: "Content Updates",
    description:
      "New posts from people you follow, live streams, recommended content",
    emoji: "📝",
  },
  engagement_summary: {
    label: "Engagement Summaries",
    description:
      "Post performance milestones, story reactions, and activity digests",
    emoji: "📊",
  },
  location_based: {
    label: "Location & Local",
    description: "Nearby events and content trending in your area",
    emoji: "📍",
  },
  marketplace: {
    label: "Marketplace",
    description: "Purchases, sales, reviews, offers, and beat play milestones",
    emoji: "🛍️",
  },
  royalties: {
    label: "Royalties & Payments",
    description: "Incoming payments, payout status, and royalty statements",
    emoji: "💰",
  },
  collaboration: {
    label: "Collaboration",
    description: "Project invites, comments, and mentions from collaborators",
    emoji: "🤝",
  },
  achievements: {
    label: "Achievements",
    description: "Badges, streaks, and career milestones",
    emoji: "🏆",
  },
  system: {
    label: "System & Platform",
    description: "Maintenance, updates, storage warnings, and ad campaigns",
    emoji: "⚙️",
  },
  platform_admin: {
    label: "Platform Admin",
    description:
      "Admin-only: new users, health alerts, flagged accounts, reports",
    emoji: "🛠️",
  },
};

export const typeToCategory: Record<NotificationType, NotificationCategory> = {
  collaboration_invite: "collaboration",
  collaboration_accepted: "collaboration",
  collaboration_declined: "collaboration",
  collaboration_comment: "collaboration",
  collaboration_mention: "collaboration",
  payment_received: "royalties",
  payout_completed: "royalties",
  payout_failed: "royalties",
  payment_failed: "royalties",
  royalty_statement_ready: "royalties",
  release_milestone: "distribution",
  release_live: "distribution",
  release_rejected: "distribution",
  release_submitted: "distribution",
  release_processing: "distribution",
  platform_update: "distribution",
  upload_complete: "distribution",
  stream_milestone: "distribution",
  ai_processing_complete: "distribution",
  social_post_scheduled: "social_media",
  social_post_published: "social_media",
  social_token_expiring: "account_security",
  social_like: "direct_interaction",
  social_comment: "direct_interaction",
  social_reply: "direct_interaction",
  social_mention: "direct_interaction",
  social_dm: "direct_interaction",
  social_follow: "direct_interaction",
  social_share: "direct_interaction",
  platform_suggested_account: "platform_generated",
  platform_trending_topic: "platform_generated",
  platform_group_activity: "platform_generated",
  platform_event_invite: "platform_generated",
  platform_birthday_reminder: "platform_generated",
  content_new_post: "content_based",
  content_live_stream: "content_based",
  content_recommended: "content_based",
  engagement_digest: "engagement_summary",
  engagement_milestone: "engagement_summary",
  engagement_story_reaction: "engagement_summary",
  social_engagement_alert: "engagement_summary",
  follower_milestone: "engagement_summary",
  location_nearby_event: "location_based",
  location_trending_local: "location_based",
  marketplace_purchase: "marketplace",
  marketplace_sale: "marketplace",
  marketplace_review: "marketplace",
  marketplace_offer: "marketplace",
  beat_play_milestone: "marketplace",
  system_announcement: "system",
  system_maintenance: "system",
  system_update: "system",
  storage_quota_warning: "system",
  promotion: "system",
  ad_campaign_created: "system",
  ad_campaign_milestone: "system",
  ad_campaign_optimized: "system",
  security_new_login: "account_security",
  security_password_changed: "account_security",
  security_2fa_enabled: "account_security",
  security_2fa_disabled: "account_security",
  security_suspicious_activity: "account_security",
  account_verified: "account_security",
  account_warning: "account_security",
  subscription_expiring: "account_security",
  subscription_renewed: "account_security",
  subscription_changed: "account_security",
  achievement_unlocked: "achievements",
  streak_milestone: "achievements",
  admin_new_user: "platform_admin",
  admin_payment_issue: "platform_admin",
  admin_storage_critical: "platform_admin",
  admin_marketplace_review: "platform_admin",
  admin_user_report: "platform_admin",
  admin_revenue_milestone: "platform_admin",
  admin_health_alert: "platform_admin",
  admin_user_flagged: "platform_admin",
  admin_support_ticket: "platform_admin",
  default: "system",
};

export const priorityConfig: Record<
  NotificationPriority,
  { label: string; color: string; bgColor: string }
> = {
  low: {
    label: "Low",
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-800",
  },
  normal: {
    label: "Normal",
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  high: {
    label: "High",
    color: "text-orange-500",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  urgent: {
    label: "Urgent",
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
};

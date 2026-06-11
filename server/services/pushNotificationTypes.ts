export interface RichPushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
  badge: string;
  tag: string;
  category: string;
  actions: Array<{ action: string; title: string }>;
  silent: boolean;
  requireInteraction: boolean;
  renotify: boolean;
  vibrate: number[];
  data: Record<string, unknown>;
  image?: string;
  timestamp?: number;
}

export interface PushContext {
  actorName?: string;
  contentTitle?: string;
  contentPreview?: string;
  platform?: string;
  url?: string;
  imageUrl?: string;
  location?: string;
  count?: number;
  milestone?: number | string;
  amount?: string;
  [key: string]: unknown;
}

const ICON = "/icons/icon-192x192.png";
const BADGE = "/icons/icon-72x72.png";

const VIBRATE = {
  subtle: [50],
  normal: [100, 50, 100],
  alert: [200, 100, 200],
  urgent: [300, 100, 300, 100, 300],
};

export function buildPushPayload(
  type: string,
  ctx: PushContext = {},
): RichPushPayload {
  const base: RichPushPayload = {
    title: "Max Booster",
    body: "You have a new notification.",
    url: "/notifications",
    icon: ICON,
    badge: BADGE,
    tag: type,
    category: "system",
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
    silent: false,
    requireInteraction: false,
    renotify: false,
    vibrate: VIBRATE.normal,
    data: { type, ...ctx },
    timestamp: Date.now(),
  };

  switch (type) {
    // ── Direct Interaction ─────────────────────────────────────────────────────

    case "social_like":
      return {
        ...base,
        title: "❤️ New Like",
        body: ctx.actorName
          ? `${ctx?.actorName} liked your post${ctx?.contentTitle ? `: "${ctx.contentTitle}"` : "."}`
          : "Someone liked your post.",
        url: ctx.url || "/social",
        tag: "social_like",
        category: "direct_interaction",
        actions: [
          { action: "open", title: "View Post" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
        requireInteraction: false,
      };

    case "social_comment":
      return {
        ...base,
        title: "💬 New Comment",
        body: ctx.actorName
          ? `${ctx?.actorName}: "${ctx.contentPreview || "commented on your post"}"`
          : "Someone commented on your post.",
        url: ctx.url || "/social",
        tag: "social_comment",
        category: "direct_interaction",
        actions: [
          { action: "reply", title: "Reply" },
          { action: "open", title: "View" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "social_reply":
      return {
        ...base,
        title: "↩️ New Reply",
        body: ctx.actorName
          ? `${ctx?.actorName} replied: "${ctx.contentPreview || "to your comment"}"`
          : "Someone replied to your comment.",
        url: ctx.url || "/social",
        tag: "social_reply",
        category: "direct_interaction",
        actions: [
          { action: "reply", title: "Reply" },
          { action: "open", title: "View Thread" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "social_mention":
      return {
        ...base,
        title: "📢 You Were Mentioned",
        body: ctx.actorName
          ? `${ctx?.actorName} mentioned you${ctx?.contentPreview ? `: "${ctx.contentPreview}"` : "."}`
          : "Someone mentioned you in a post.",
        url: ctx.url || "/social",
        tag: "social_mention",
        category: "direct_interaction",
        actions: [
          { action: "open", title: "View Post" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: false,
      };

    case "social_dm":
      return {
        ...base,
        title: "✉️ New Message",
        body: ctx.actorName
          ? `${ctx?.actorName}: "${ctx.contentPreview || "Sent you a message"}"`
          : "You have a new direct message.",
        url: ctx.url || "/social",
        tag: `social_dm_${ctx?.actorName || "unknown"}`,
        category: "direct_interaction",
        actions: [
          { action: "reply", title: "Reply" },
          { action: "open", title: "View" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
        renotify: true,
      };

    case "social_follow":
      return {
        ...base,
        title: "👤 New Follower",
        body: ctx.actorName
          ? `${ctx?.actorName} started following you.`
          : "You have a new follower.",
        url: ctx.url || "/social",
        tag: "social_follow",
        category: "direct_interaction",
        actions: [
          { action: "open", title: "View Profile" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "social_share":
      return {
        ...base,
        title: "🔁 Post Shared",
        body: ctx.actorName
          ? `${ctx?.actorName} shared your post.`
          : "Someone shared your post.",
        url: ctx.url || "/social",
        tag: "social_share",
        category: "direct_interaction",
        actions: [
          { action: "open", title: "View Post" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    // ── Platform-Generated ─────────────────────────────────────────────────────

    case "platform_suggested_account":
      return {
        ...base,
        title: "👥 People You May Know",
        body: ctx.actorName
          ? `${ctx?.actorName} and others are on Max Booster.`
          : "Discover artists and producers like you.",
        url: "/social",
        tag: "platform_suggested",
        category: "platform_generated",
        actions: [
          { action: "open", title: "Explore" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
        requireInteraction: false,
      };

    case "platform_trending_topic":
      return {
        ...base,
        title: "🔥 Trending Now",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is trending${ctx?.platform ? ` on ${ctx?.platform}` : ""}.`
          : "Check out what's trending on the platform.",
        url: "/social",
        tag: "platform_trending",
        category: "platform_generated",
        actions: [
          { action: "open", title: "View Trend" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "platform_group_activity":
      return {
        ...base,
        title: "👥 New Group Activity",
        body: ctx.contentTitle
          ? `New activity in ${ctx.contentTitle}.`
          : "There's new activity in a group you follow.",
        url: "/social",
        tag: "platform_group",
        category: "platform_generated",
        actions: [
          { action: "open", title: "View Group" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "platform_event_invite":
      return {
        ...base,
        title: "📅 Event Invitation",
        body: ctx.contentTitle
          ? `You\'re invited to: ${ctx.contentTitle}.`
          : "You've been invited to an event.",
        url: ctx.url || "/social",
        tag: "platform_event",
        category: "platform_generated",
        actions: [
          { action: "accept", title: "Accept" },
          { action: "open", title: "View" },
        ],
        vibrate: VIBRATE.normal,
        requireInteraction: true,
      };

    case "platform_birthday_reminder":
      return {
        ...base,
        title: "🎂 Birthday Reminder",
        body: ctx.actorName
          ? `Today is ${ctx?.actorName}\'s birthday! Send them a message.`
          : "Someone in your network has a birthday today.",
        url: "/social",
        tag: "platform_birthday",
        category: "platform_generated",
        actions: [
          { action: "open", title: "Send Message" },
          { action: "dismiss", title: "Maybe Later" },
        ],
        vibrate: VIBRATE.subtle,
      };

    // ── Content-Based ──────────────────────────────────────────────────────────

    case "content_new_post":
      return {
        ...base,
        title: "📝 New Post",
        body: ctx.actorName
          ? `${ctx.actorName} just posted${ctx.contentTitle ? `: "${ctx.contentTitle}"` : "."}`
          : "New content from someone you follow.",
        url: ctx.url || "/social",
        tag: `content_post_${ctx.actorName || ""}`,
        category: "content_based",
        actions: [
          { action: "open", title: "View Post" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
        image: ctx.imageUrl,
      };

    case "content_live_stream":
      return {
        ...base,
        title: "🔴 Going Live Now",
        body: ctx.actorName
          ? `${ctx.actorName} is live${ctx.contentTitle ? `: ${ctx.contentTitle}` : "!"}`
          : "Someone you follow just went live.",
        url: ctx.url || "/social",
        tag: `content_live_${ctx.actorName || ""}`,
        category: "content_based",
        actions: [
          { action: "open", title: "Watch Now" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
        renotify: true,
        image: ctx.imageUrl,
      };

    case "content_recommended":
      return {
        ...base,
        title: "✨ Recommended For You",
        body: ctx.contentTitle
          ? `Check out: "${ctx.contentTitle}"`
          : "We found content you might enjoy.",
        url: ctx.url || "/social",
        tag: "content_recommended",
        category: "content_based",
        actions: [
          { action: "open", title: "View" },
          { action: "dismiss", title: "Not Interested" },
        ],
        vibrate: VIBRATE.subtle,
        image: ctx.imageUrl,
      };

    // ── Engagement & Activity Summaries ────────────────────────────────────────

    case "engagement_digest":
      return {
        ...base,
        title: "📊 Activity Summary",
        body: ctx.count
          ? `You have ${ctx.count} new interaction${ctx.count !== 1 ? "s" : ""} since your last visit.`
          : "Here's a summary of your recent activity.",
        url: "/notifications",
        tag: "engagement_digest",
        category: "engagement_summary",
        actions: [
          { action: "open", title: "View All" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "engagement_milestone":
    case "social_engagement_alert":
      return {
        ...base,
        title: "🎉 Post Performing Well",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is getting lots of engagement!`
          : ctx?.milestone
            ? `Your post reached ${ctx?.milestone} interactions!`
            : "One of your posts is trending with your audience.",
        url: ctx.url || "/social",
        tag: "engagement_milestone",
        category: "engagement_summary",
        actions: [
          { action: "open", title: "View Post" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "engagement_story_reaction":
      return {
        ...base,
        title: "👀 Story Reaction",
        body: ctx.actorName
          ? `${ctx?.actorName} reacted to your story.`
          : "People are reacting to your story.",
        url: ctx.url || "/social",
        tag: "engagement_story",
        category: "engagement_summary",
        actions: [
          { action: "open", title: "View Story" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "follower_milestone":
      return {
        ...base,
        title: "🌟 Follower Milestone",
        body: ctx.milestone
          ? `You hit ${ctx?.milestone} followers! Keep up the great work.`
          : "You reached a new follower milestone!",
        url: "/social",
        tag: "follower_milestone",
        category: "engagement_summary",
        actions: [
          { action: "open", title: "View Profile" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
      };

    // ── Security & Account ─────────────────────────────────────────────────────

    case "security_new_login":
      return {
        ...base,
        title: "🔐 New Login Detected",
        body: ctx.location
          ? `A new login to your account from ${ctx?.location}. If this wasn\'t you, secure your account immediately.`
          : "A new login to your account was detected. Verify it was you.",
        url: "/settings",
        tag: "security_login",
        category: "account_security",
        actions: [
          { action: "open", title: "Review" },
          { action: "dismiss", title: "Was Me" },
        ],
        vibrate: VIBRATE.urgent,
        requireInteraction: true,
      };

    case "security_password_changed":
      return {
        ...base,
        title: "🔑 Password Changed",
        body: "Your account password was recently changed. If you didn't do this, contact support immediately.",
        url: "/settings",
        tag: "security_password",
        category: "account_security",
        actions: [
          { action: "open", title: "Review Account" },
          { action: "dismiss", title: "I Changed It" },
        ],
        vibrate: VIBRATE.urgent,
        requireInteraction: true,
      };

    case "security_suspicious_activity":
      return {
        ...base,
        title: "⚠️ Suspicious Activity",
        body: "We detected unusual activity on your account. Please review and take action immediately.",
        url: "/settings",
        tag: "security_suspicious",
        category: "account_security",
        actions: [
          { action: "open", title: "Review Now" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.urgent,
        requireInteraction: true,
      };

    case "security_2fa_enabled":
      return {
        ...base,
        title: "✅ 2FA Enabled",
        body: "Two-factor authentication has been enabled on your account.",
        url: "/settings",
        tag: "security_2fa",
        category: "account_security",
        actions: [
          { action: "open", title: "View Settings" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "security_2fa_disabled":
      return {
        ...base,
        title: "⚠️ 2FA Disabled",
        body: "Two-factor authentication has been disabled on your account. Re-enable it for better security.",
        url: "/settings",
        tag: "security_2fa",
        category: "account_security",
        actions: [
          { action: "open", title: "Re-enable 2FA" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
      };

    case "account_warning":
      return {
        ...base,
        title: "⚠️ Account Notice",
        body:
          ctx?.contentPreview ||
          "Your account has received a notice. Please review it.",
        url: "/settings",
        tag: "account_warning",
        category: "account_security",
        actions: [
          { action: "open", title: "Review" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
      };

    case "account_verified":
      return {
        ...base,
        title: "✅ Account Verified",
        body: "Your Max Booster account has been verified.",
        url: "/dashboard",
        tag: "account_verified",
        category: "account_security",
        actions: [
          { action: "open", title: "View Profile" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── Location-Based ─────────────────────────────────────────────────────────

    case "location_nearby_event":
      return {
        ...base,
        title: "📍 Events Near You",
        body: ctx.contentTitle
          ? `${ctx?.contentTitle} is happening near you.`
          : ctx?.location
            ? `There\'s an event near ${ctx.location} you might like.`
            : "There are music events happening in your area.",
        url: ctx.url || "/social",
        tag: "location_event",
        category: "location_based",
        actions: [
          { action: "open", title: "View on Map" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "location_trending_local":
      return {
        ...base,
        title: "📍 Trending in Your Area",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is trending ${ctx.location ? `in ${ctx.location}` : "near you"}.`
          : "See what's trending in music around you.",
        url: "/social",
        tag: "location_trending",
        category: "location_based",
        actions: [
          { action: "open", title: "View Trends" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.subtle,
      };

    // ── Distribution ───────────────────────────────────────────────────────────

    case "release_live":
      return {
        ...base,
        title: "🚀 Release Is Live!",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is now live on streaming platforms!`
          : "Your music release is now live!",
        url: ctx.url || "/distribution",
        tag: "release_live",
        category: "distribution",
        actions: [
          { action: "open", title: "View Release" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
      };

    case "release_milestone":
    case "stream_milestone":
      return {
        ...base,
        title: "🎵 Stream Milestone",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" hit ${ctx?.milestone || "a new"} streams!`
          : `You reached ${ctx?.milestone || "a new stream milestone"}!`,
        url: ctx.url || "/distribution",
        tag: "stream_milestone",
        category: "distribution",
        actions: [
          { action: "open", title: "View Stats" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
      };

    case "release_rejected":
      return {
        ...base,
        title: "❌ Release Update",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" needs attention before it can be published.`
          : "One of your releases requires your attention.",
        url: ctx.url || "/distribution",
        tag: "release_rejected",
        category: "distribution",
        actions: [
          { action: "open", title: "Review Now" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
      };

    case "release_submitted":
      return {
        ...base,
        title: "📤 Release Submitted",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" has been submitted for distribution.`
          : "Your release has been submitted successfully.",
        url: ctx.url || "/distribution",
        tag: "release_submitted",
        category: "distribution",
        actions: [
          { action: "open", title: "Track Status" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "release_processing":
      return {
        ...base,
        title: "⚙️ Processing Release",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is being processed for distribution.`
          : "Your release is being processed.",
        url: ctx.url || "/distribution",
        tag: "release_processing",
        category: "distribution",
        actions: [
          { action: "open", title: "View Progress" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "upload_complete":
      return {
        ...base,
        title: "✅ Upload Complete",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" finished uploading.`
          : "Your upload has completed successfully.",
        url: ctx.url || "/studio",
        tag: "upload_complete",
        category: "distribution",
        actions: [
          { action: "open", title: "View File" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "ai_processing_complete":
      return {
        ...base,
        title: "🤖 AI Task Complete",
        body: ctx.contentTitle
          ? `AI finished processing: "${ctx.contentTitle}"`
          : "Your AI-powered task has completed.",
        url: ctx.url || "/studio",
        tag: "ai_complete",
        category: "distribution",
        actions: [
          { action: "open", title: "View Result" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── Royalties ──────────────────────────────────────────────────────────────

    case "payment_received":
    case "payout_completed":
      return {
        ...base,
        title: "💰 Payment Received",
        body: ctx.amount
          ? `You received ${ctx?.amount} in royalty earnings!`
          : "Your royalty payout has been processed.",
        url: "/royalties",
        tag: "payment_received",
        category: "royalties",
        actions: [
          { action: "open", title: "View Earnings" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.alert,
      };

    case "payout_failed":
    case "payment_failed":
      return {
        ...base,
        title: "⚠️ Payment Issue",
        body: "A royalty payment could not be processed. Please check your payment information.",
        url: "/royalties",
        tag: "payment_failed",
        category: "royalties",
        actions: [
          { action: "open", title: "Fix Now" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.urgent,
        requireInteraction: true,
      };

    case "royalty_statement_ready":
      return {
        ...base,
        title: "📄 Statement Ready",
        body: "Your royalty statement is ready to view.",
        url: "/royalties",
        tag: "royalty_statement",
        category: "royalties",
        actions: [
          { action: "open", title: "View Statement" },
          { action: "dismiss", title: "Later" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── Collaboration ──────────────────────────────────────────────────────────

    case "collaboration_invite":
      return {
        ...base,
        title: "🤝 Collaboration Invite",
        body: ctx.actorName
          ? `${ctx?.actorName} invited you to collaborate${ctx?.contentTitle ? ` on "${ctx.contentTitle}"` : "."}`
          : "You have a new collaboration invitation.",
        url: ctx.url || "/collaboration",
        tag: "collab_invite",
        category: "collaboration",
        actions: [
          { action: "open", title: "View Invite" },
          { action: "dismiss", title: "Later" },
        ],
        vibrate: VIBRATE.normal,
        requireInteraction: true,
      };

    case "collaboration_accepted":
      return {
        ...base,
        title: "✅ Invite Accepted",
        body: ctx.actorName
          ? `${ctx?.actorName} accepted your collaboration invite!`
          : "Your collaboration invite was accepted.",
        url: ctx.url || "/collaboration",
        tag: "collab_accepted",
        category: "collaboration",
        actions: [
          { action: "open", title: "Start Collaborating" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "collaboration_comment":
      return {
        ...base,
        title: "💬 Collaboration Comment",
        body: ctx.actorName
          ? `${ctx?.actorName} commented on your project${ctx?.contentTitle ? `: "${ctx.contentTitle}"` : "."}`
          : "Someone commented on your collaboration.",
        url: ctx.url || "/collaboration",
        tag: "collab_comment",
        category: "collaboration",
        actions: [
          { action: "reply", title: "Reply" },
          { action: "open", title: "View" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "collaboration_mention":
      return {
        ...base,
        title: "📢 Mentioned in Project",
        body: ctx.actorName
          ? `${ctx?.actorName} mentioned you in a collaboration.`
          : "You were mentioned in a collaboration.",
        url: ctx.url || "/collaboration",
        tag: "collab_mention",
        category: "collaboration",
        actions: [
          { action: "open", title: "View" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── Marketplace ────────────────────────────────────────────────────────────

    case "marketplace_purchase":
      return {
        ...base,
        title: "🛍️ Purchase Complete",
        body: ctx.contentTitle
          ? `You successfully purchased "${ctx.contentTitle}".`
          : "Your marketplace purchase is confirmed.",
        url: "/marketplace",
        tag: "marketplace_purchase",
        category: "marketplace",
        actions: [
          { action: "open", title: "View Purchase" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "marketplace_sale":
      return {
        ...base,
        title: "💵 New Sale",
        body: ctx.contentTitle
          ? `Someone purchased "${ctx.contentTitle}"${ctx?.amount ? ` for ${ctx?.amount}` : ""}!`
          : "You just made a sale on the marketplace.",
        url: "/marketplace",
        tag: "marketplace_sale",
        category: "marketplace",
        actions: [
          { action: "open", title: "View Sale" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.alert,
      };

    case "marketplace_offer":
      return {
        ...base,
        title: "💬 New Offer",
        body: ctx.contentTitle
          ? `You received an offer on "${ctx.contentTitle}".`
          : "You have a new offer on the marketplace.",
        url: "/marketplace",
        tag: "marketplace_offer",
        category: "marketplace",
        actions: [
          { action: "open", title: "View Offer" },
          { action: "dismiss", title: "Later" },
        ],
        vibrate: VIBRATE.normal,
        requireInteraction: true,
      };

    case "marketplace_review":
      return {
        ...base,
        title: "⭐ New Review",
        body: ctx.contentTitle
          ? `Someone left a review on "${ctx.contentTitle}".`
          : "You received a new marketplace review.",
        url: "/marketplace",
        tag: "marketplace_review",
        category: "marketplace",
        actions: [
          { action: "open", title: "View Review" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "beat_play_milestone":
      return {
        ...base,
        title: "🎧 Beat Milestone",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" just hit ${ctx?.milestone || "a new"} plays!`
          : "One of your beats reached a play milestone!",
        url: "/marketplace",
        tag: "beat_milestone",
        category: "marketplace",
        actions: [
          { action: "open", title: "View Beat" },
          { action: "dismiss", title: "Dismiss" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── Achievements ───────────────────────────────────────────────────────────

    case "achievement_unlocked":
      return {
        ...base,
        title: "🏆 Achievement Unlocked",
        body: ctx.contentTitle
          ? `You earned: "${ctx.contentTitle}"!`
          : "You just unlocked a new achievement!",
        url: "/dashboard",
        tag: "achievement",
        category: "achievements",
        actions: [
          { action: "open", title: "View Achievement" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.alert,
      };

    case "streak_milestone":
      return {
        ...base,
        title: "🔥 Streak Milestone",
        body: ctx.milestone
          ? `You\'re on a ${ctx.milestone}-day streak! Keep going!`
          : "You reached a new streak milestone!",
        url: "/dashboard",
        tag: "streak",
        category: "achievements",
        actions: [
          { action: "open", title: "View Streak" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── Subscriptions ──────────────────────────────────────────────────────────

    case "subscription_expiring":
      return {
        ...base,
        title: "⏰ Subscription Expiring",
        body: "Your Max Booster subscription is expiring soon. Renew now to keep access.",
        url: "/settings",
        tag: "subscription_expiring",
        category: "account_security",
        actions: [
          { action: "open", title: "Renew Now" },
          { action: "dismiss", title: "Remind Later" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
      };

    case "subscription_renewed":
      return {
        ...base,
        title: "✅ Subscription Renewed",
        body: "Your Max Booster subscription has been renewed. Keep creating!",
        url: "/settings",
        tag: "subscription_renewed",
        category: "account_security",
        actions: [
          { action: "open", title: "View Account" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    // ── System ─────────────────────────────────────────────────────────────────

    case "system_announcement":
    case "system_update":
      return {
        ...base,
        title: "📣 Platform Update",
        body:
          ctx.contentTitle ||
          ctx.contentPreview ||
          "A new update is available on Max Booster.",
        url: "/dashboard",
        tag: "system_update",
        category: "system",
        actions: [
          { action: "open", title: "Learn More" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "system_maintenance":
      return {
        ...base,
        title: "🔧 Scheduled Maintenance",
        body:
          ctx.contentTitle ||
          "Max Booster will undergo scheduled maintenance soon.",
        url: "/dashboard",
        tag: "system_maintenance",
        category: "system",
        actions: [
          { action: "open", title: "View Details" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
        requireInteraction: true,
      };

    case "storage_quota_warning":
      return {
        ...base,
        title: "💾 Storage Warning",
        body: "You're running low on storage space. Upgrade your plan or free up space.",
        url: "/settings",
        tag: "storage_warning",
        category: "system",
        actions: [
          { action: "open", title: "Manage Storage" },
          { action: "dismiss", title: "Later" },
        ],
        vibrate: VIBRATE.alert,
        requireInteraction: true,
      };

    case "social_post_scheduled":
      return {
        ...base,
        title: "📅 Post Scheduled",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is scheduled${ctx?.platform ? ` for ${ctx?.platform}` : ""}.`
          : "Your post has been scheduled successfully.",
        url: ctx.url || "/social",
        tag: "post_scheduled",
        category: "social_media",
        actions: [
          { action: "open", title: "View Schedule" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.subtle,
      };

    case "social_post_published":
      return {
        ...base,
        title: "✅ Post Published",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" is now live${ctx?.platform ? ` on ${ctx?.platform}` : ""}!`
          : "Your scheduled post has been published.",
        url: ctx.url || "/social",
        tag: "post_published",
        category: "social_media",
        actions: [
          { action: "open", title: "View Post" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "ad_campaign_created":
      return {
        ...base,
        title: "📢 Campaign Created",
        body: ctx.contentTitle
          ? `Ad campaign "${ctx.contentTitle}" is now active.`
          : "Your advertising campaign is now running.",
        url: "/advertising",
        tag: "ad_campaign",
        category: "system",
        actions: [
          { action: "open", title: "View Campaign" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    case "ad_campaign_milestone":
      return {
        ...base,
        title: "📊 Campaign Milestone",
        body: ctx.contentTitle
          ? `"${ctx.contentTitle}" reached ${ctx?.milestone || "a new milestone"}!`
          : "Your ad campaign hit a performance milestone.",
        url: "/advertising",
        tag: "ad_milestone",
        category: "system",
        actions: [
          { action: "open", title: "View Stats" },
          { action: "dismiss", title: "Got It" },
        ],
        vibrate: VIBRATE.normal,
      };

    default:
      return base;
  }
}

export function isSilentPushType(type: string): boolean {
  return type?.startsWith("silent_");
}

export function buildSilentPayload(
  reason: "feed_refresh" | "message_sync" | "count_update",
): RichPushPayload {
  return {
    title: "",
    body: "",
    url: "/",
    icon: ICON,
    badge: BADGE,
    tag: `silent_${reason}`,
    category: "system",
    actions: [],
    silent: true,
    requireInteraction: false,
    renotify: false,
    vibrate: [],
    data: { silent: true, reason },
    timestamp: Date.now(),
  };
}

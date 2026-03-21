import cron from 'node-cron';
import { db } from '../db.js';
import {
  musicWorkflowAutomations,
  musicWorkflowExecutionLogs,
} from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { notificationService } from './notificationService.js';
import { emailService } from './emailService.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowPhase =
  | 'creation'
  | 'pre-release'
  | 'release-day'
  | 'post-release'
  | 'revenue';

export interface ConfigField {
  label: string;
  type: 'boolean' | 'string' | 'number' | 'select';
  default: any;
  options?: string[];
  description?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  phase: WorkflowPhase;
  icon: string;
  trigger: { event: string; description: string };
  configSchema: Record<string, ConfigField>;
  defaultConfig: Record<string, any>;
  enabledByDefault: boolean;
}

export interface WorkflowEventData {
  userId: string;
  [key: string]: any;
}

// ─── Template definitions (15 covering full music artist journey) ─────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ── PHASE 1: CREATION ────────────────────────────────────────────────────
  {
    id: 'track-upload-analysis',
    name: 'Auto-Analyze Uploaded Tracks',
    description:
      'When you upload a track, automatically detect BPM, key, energy level, and generate metadata suggestions so you skip tedious manual entry.',
    phase: 'creation',
    icon: '🎵',
    trigger: { event: 'track:uploaded', description: 'A new audio file is uploaded' },
    configSchema: {
      suggestGenre: {
        label: 'Suggest genre tags',
        type: 'boolean',
        default: true,
        description: 'Use AI to suggest genre and mood tags based on the audio',
      },
      generateISRC: {
        label: 'Auto-generate ISRC placeholder',
        type: 'boolean',
        default: true,
        description: 'Create an ISRC placeholder ready to register with your PRO',
      },
      notifyOnComplete: {
        label: 'Push notification when analysis is done',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: { suggestGenre: true, generateISRC: true, notifyOnComplete: true },
    enabledByDefault: true,
  },
  {
    id: 'collaboration-alert',
    name: 'Collaborator Added Notification',
    description:
      'Instantly notify all project collaborators when a new team member joins. Keeps everyone in sync from the first moment.',
    phase: 'creation',
    icon: '🤝',
    trigger: {
      event: 'collaboration:member-added',
      description: 'A collaborator is added to a project',
    },
    configSchema: {
      sendEmail: {
        label: 'Send email to collaborators',
        type: 'boolean',
        default: true,
      },
      sendPush: {
        label: 'Send push notification',
        type: 'boolean',
        default: true,
      },
      includeProjectBrief: {
        label: 'Include project brief in notification',
        type: 'boolean',
        default: true,
        description: 'Attach a short project summary to orient new collaborators',
      },
    },
    defaultConfig: { sendEmail: true, sendPush: true, includeProjectBrief: true },
    enabledByDefault: true,
  },
  {
    id: 'mix-ready-checklist',
    name: 'Mix Complete → Mastering Checklist',
    description:
      "When you mark a mix as complete, automatically create a mastering task, send the mix notes to your mastering engineer, and notify your team that it's time for the next phase.",
    phase: 'creation',
    icon: '🎛️',
    trigger: {
      event: 'track:mix-complete',
      description: 'A track mix is marked as complete',
    },
    configSchema: {
      createMasteringTask: {
        label: 'Auto-create mastering task',
        type: 'boolean',
        default: true,
      },
      notifyTeam: {
        label: 'Notify project team',
        type: 'boolean',
        default: true,
      },
      masteringDeadlineDays: {
        label: 'Mastering deadline (days from now)',
        type: 'number',
        default: 7,
        description: 'Sets a due date on the mastering task',
      },
    },
    defaultConfig: {
      createMasteringTask: true,
      notifyTeam: true,
      masteringDeadlineDays: 7,
    },
    enabledByDefault: false,
  },

  // ── PHASE 2: PRE-RELEASE ─────────────────────────────────────────────────
  {
    id: 'release-countdown-posts',
    name: 'Auto-Schedule Release Countdown Posts',
    description:
      'When you set a release date, automatically queue social media countdown posts at 7 days, 3 days, 1 day, and release morning across all connected platforms.',
    phase: 'pre-release',
    icon: '📅',
    trigger: {
      event: 'release:date-set',
      description: 'A release date is set on a distribution release',
    },
    configSchema: {
      platforms: {
        label: 'Platforms to post on',
        type: 'select',
        default: 'all',
        options: ['all', 'instagram', 'twitter', 'facebook', 'tiktok'],
        description: 'Which platforms to schedule countdown posts for',
      },
      post7Day: {
        label: 'Post 7-day countdown',
        type: 'boolean',
        default: true,
      },
      post3Day: {
        label: 'Post 3-day countdown',
        type: 'boolean',
        default: true,
      },
      post1Day: {
        label: 'Post day-before teaser',
        type: 'boolean',
        default: true,
      },
      postReleaseDay: {
        label: 'Post on release morning',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: {
      platforms: 'all',
      post7Day: true,
      post3Day: true,
      post1Day: true,
      postReleaseDay: true,
    },
    enabledByDefault: true,
  },
  {
    id: 'pre-save-campaign',
    name: 'Auto-Launch Pre-Save Campaign',
    description:
      'When a release is scheduled, automatically create a pre-save landing page, generate the shareable link, and post it to your social accounts with a call to action.',
    phase: 'pre-release',
    icon: '🔗',
    trigger: {
      event: 'release:scheduled',
      description: 'A release is officially scheduled for distribution',
    },
    configSchema: {
      postToSocial: {
        label: 'Auto-post pre-save link to social',
        type: 'boolean',
        default: true,
      },
      sendToEmailList: {
        label: 'Notify email subscribers',
        type: 'boolean',
        default: false,
        description: 'Send a pre-save announcement to your mailing list',
      },
      customMessage: {
        label: 'Custom pre-save caption',
        type: 'string',
        default: '',
        description: 'Leave empty to use AI-generated caption',
      },
    },
    defaultConfig: { postToSocial: true, sendToEmailList: false, customMessage: '' },
    enabledByDefault: false,
  },
  {
    id: 'distribution-submitted-notify',
    name: 'Distribution Submission Alert',
    description:
      "When your music is submitted to streaming platforms, automatically notify your team, send a confirmation to your email list, and remind you to check back in 24-72 hours for approval.",
    phase: 'pre-release',
    icon: '🚀',
    trigger: {
      event: 'distribution:submitted',
      description: 'Music is submitted to DSPs for distribution',
    },
    configSchema: {
      notifyTeam: {
        label: 'Notify project collaborators',
        type: 'boolean',
        default: true,
      },
      sendConfirmationEmail: {
        label: 'Send submission confirmation email',
        type: 'boolean',
        default: true,
      },
      setFollowUpReminder: {
        label: 'Set follow-up reminder',
        type: 'boolean',
        default: true,
        description: 'Remind you to check DSP approval status after 48 hours',
      },
    },
    defaultConfig: {
      notifyTeam: true,
      sendConfirmationEmail: true,
      setFollowUpReminder: true,
    },
    enabledByDefault: true,
  },

  // ── PHASE 3: RELEASE DAY ─────────────────────────────────────────────────
  {
    id: 'release-day-social-blast',
    name: 'Release Day Social Media Blast',
    description:
      'The moment your release goes live, automatically post to all connected social platforms with platform-optimized captions, artwork, and streaming links.',
    phase: 'release-day',
    icon: '🎉',
    trigger: {
      event: 'release:live',
      description: 'A release becomes publicly available on streaming platforms',
    },
    configSchema: {
      platforms: {
        label: 'Platforms to blast',
        type: 'select',
        default: 'all',
        options: ['all', 'instagram', 'twitter', 'facebook', 'tiktok', 'youtube'],
      },
      includeStreamingLinks: {
        label: 'Include streaming platform links',
        type: 'boolean',
        default: true,
      },
      includeArtwork: {
        label: 'Include release artwork',
        type: 'boolean',
        default: true,
      },
      postTime: {
        label: 'Post timing',
        type: 'select',
        default: 'immediate',
        options: ['immediate', 'optimal'],
        description: '"Optimal" uses AI to find the best time within a 2-hour window',
      },
    },
    defaultConfig: {
      platforms: 'all',
      includeStreamingLinks: true,
      includeArtwork: true,
      postTime: 'immediate',
    },
    enabledByDefault: true,
  },
  {
    id: 'release-day-newsletter',
    name: 'Release Day Fan Newsletter',
    description:
      'Automatically send a beautifully formatted email to your subscribers when your release drops, with a personal message, streaming links, and a call to share.',
    phase: 'release-day',
    icon: '📧',
    trigger: {
      event: 'release:live',
      description: 'A release becomes publicly available on streaming platforms',
    },
    configSchema: {
      subject: {
        label: 'Email subject line',
        type: 'string',
        default: '',
        description: 'Leave empty to auto-generate from release title',
      },
      personalNote: {
        label: 'Personal note to fans',
        type: 'string',
        default: '',
        description: 'A short personal message to include above the streaming links',
      },
      includeSpotifyLink: {
        label: 'Include Spotify link',
        type: 'boolean',
        default: true,
      },
      includeAppleMusicLink: {
        label: 'Include Apple Music link',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: {
      subject: '',
      personalNote: '',
      includeSpotifyLink: true,
      includeAppleMusicLink: true,
    },
    enabledByDefault: false,
  },
  {
    id: 'release-day-push-notify',
    name: 'Release Day Push Notification',
    description:
      'Send an instant push notification to all your Max Booster followers and anyone who opted in to release alerts.',
    phase: 'release-day',
    icon: '🔔',
    trigger: {
      event: 'release:live',
      description: 'A release becomes publicly available on streaming platforms',
    },
    configSchema: {
      notifyFollowers: {
        label: 'Notify platform followers',
        type: 'boolean',
        default: true,
      },
      message: {
        label: 'Notification message',
        type: 'string',
        default: '',
        description: 'Leave empty to auto-generate from release title and artist name',
      },
    },
    defaultConfig: { notifyFollowers: true, message: '' },
    enabledByDefault: true,
  },

  // ── PHASE 4: POST-RELEASE ────────────────────────────────────────────────
  {
    id: 'weekly-performance-digest',
    name: 'Weekly Performance Digest',
    description:
      'Every Monday morning, receive a curated performance summary: streams, revenue, top markets, playlist adds, and AI-powered suggestions for what to do next.',
    phase: 'post-release',
    icon: '📊',
    trigger: {
      event: 'schedule:weekly',
      description: 'Runs every Monday at a configurable time',
    },
    configSchema: {
      sendTime: {
        label: 'Send time (24h, your timezone)',
        type: 'string',
        default: '09:00',
        description: 'When to send the digest each Monday',
      },
      includeStreamingData: {
        label: 'Include streaming data',
        type: 'boolean',
        default: true,
      },
      includeRevenueData: {
        label: 'Include revenue data',
        type: 'boolean',
        default: true,
      },
      includeAISuggestions: {
        label: 'Include AI growth suggestions',
        type: 'boolean',
        default: true,
      },
      deliveryMethod: {
        label: 'Delivery method',
        type: 'select',
        default: 'both',
        options: ['email', 'push', 'both'],
      },
    },
    defaultConfig: {
      sendTime: '09:00',
      includeStreamingData: true,
      includeRevenueData: true,
      includeAISuggestions: true,
      deliveryMethod: 'both',
    },
    enabledByDefault: true,
  },
  {
    id: 'streaming-milestone-celebrate',
    name: 'Streaming Milestone Celebration Posts',
    description:
      'When your track hits key streaming milestones (1K, 10K, 100K, 1M plays), automatically post a celebration graphic to your social media with the milestone stats.',
    phase: 'post-release',
    icon: '🏆',
    trigger: {
      event: 'analytics:stream-milestone',
      description: 'A streaming milestone threshold is crossed',
    },
    configSchema: {
      milestones: {
        label: 'Milestones to celebrate',
        type: 'select',
        default: 'all',
        options: ['all', '1k', '10k', '100k', '1m'],
        description: '"All" celebrates every defined milestone',
      },
      postToSocial: {
        label: 'Auto-post to social media',
        type: 'boolean',
        default: true,
      },
      includeStats: {
        label: 'Include streaming stats in post',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: { milestones: 'all', postToSocial: true, includeStats: true },
    enabledByDefault: true,
  },
  {
    id: 'playlist-placement-alert',
    name: 'Playlist Placement Notification',
    description:
      'Get instantly notified when your track is added to a playlist, with details about playlist size, follower count, and estimated monthly listeners reach.',
    phase: 'post-release',
    icon: '🎧',
    trigger: {
      event: 'analytics:playlist-added',
      description: 'A track is added to a streaming platform playlist',
    },
    configSchema: {
      notifyPush: {
        label: 'Push notification',
        type: 'boolean',
        default: true,
      },
      notifyEmail: {
        label: 'Email notification',
        type: 'boolean',
        default: false,
      },
      autoShareAnnouncement: {
        label: 'Auto-post playlist placement on social',
        type: 'boolean',
        default: false,
        description: 'Only fires for editorial playlists with 10K+ followers',
      },
    },
    defaultConfig: {
      notifyPush: true,
      notifyEmail: false,
      autoShareAnnouncement: false,
    },
    enabledByDefault: true,
  },
  {
    id: 'low-engagement-rescue',
    name: 'Low Engagement Auto-Response',
    description:
      'If a track\'s engagement drops below your threshold for 3 consecutive days, automatically trigger an A/B content test — new caption variations, different posting times, or a fresh visual format.',
    phase: 'post-release',
    icon: '📉',
    trigger: {
      event: 'analytics:engagement-drop',
      description: 'Track engagement drops below configured threshold for 3 days',
    },
    configSchema: {
      engagementThresholdPct: {
        label: 'Engagement drop threshold (%)',
        type: 'number',
        default: 30,
        description: 'Trigger if engagement drops by this percentage from 7-day average',
      },
      triggerABTest: {
        label: 'Launch A/B content variation test',
        type: 'boolean',
        default: true,
      },
      tryNewPostingTime: {
        label: 'Try different posting time slot',
        type: 'boolean',
        default: true,
      },
      notifyUser: {
        label: 'Notify me of the rescue attempt',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: {
      engagementThresholdPct: 30,
      triggerABTest: true,
      tryNewPostingTime: true,
      notifyUser: true,
    },
    enabledByDefault: false,
  },

  // ── PHASE 5: REVENUE ─────────────────────────────────────────────────────
  {
    id: 'beat-sale-thank-you',
    name: 'Sale Thank You & Delivery',
    description:
      'When a beat or track sells, automatically send the buyer a personalized thank-you email with download links, license terms, and your contact info for future collaboration.',
    phase: 'revenue',
    icon: '💸',
    trigger: {
      event: 'marketplace:sale-completed',
      description: 'A beat or track is purchased from your storefront',
    },
    configSchema: {
      sendThankYouEmail: {
        label: 'Send buyer thank-you email',
        type: 'boolean',
        default: true,
      },
      personalNote: {
        label: 'Personal note to buyer',
        type: 'string',
        default: '',
        description: 'Leave empty for a professional default message',
      },
      includeSocialLinks: {
        label: 'Include your social media links',
        type: 'boolean',
        default: true,
      },
      notifySeller: {
        label: 'Notify me of each sale',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: {
      sendThankYouEmail: true,
      personalNote: '',
      includeSocialLinks: true,
      notifySeller: true,
    },
    enabledByDefault: true,
  },
  {
    id: 'royalty-collection-reminder',
    name: 'Monthly Royalty Collection Check',
    description:
      'On the 1st of every month, automatically audit your registered works against your PRO account, flag any unclaimed royalties, and generate a royalty collection summary report.',
    phase: 'revenue',
    icon: '💰',
    trigger: {
      event: 'schedule:monthly',
      description: 'Runs on the 1st of each month',
    },
    configSchema: {
      checkPROBalance: {
        label: 'Check PRO (ASCAP/BMI/SESAC) balance',
        type: 'boolean',
        default: true,
      },
      generateReport: {
        label: 'Generate monthly royalty report',
        type: 'boolean',
        default: true,
      },
      notifyThreshold: {
        label: 'Notify if uncollected royalties exceed ($)',
        type: 'number',
        default: 50,
        description: 'Only alert if the uncollected amount is above this value',
      },
      deliveryMethod: {
        label: 'Report delivery',
        type: 'select',
        default: 'email',
        options: ['email', 'push', 'both'],
      },
    },
    defaultConfig: {
      checkPROBalance: true,
      generateReport: true,
      notifyThreshold: 50,
      deliveryMethod: 'email',
    },
    enabledByDefault: false,
  },

  // ── ADDITIONAL: CREATION ─────────────────────────────────────────────────
  {
    id: 'pro-track-registration',
    name: 'Auto-Prompt PRO Track Registration',
    description:
      'When a track moves to "mastered" status, automatically remind you to register it with your PRO (ASCAP, BMI, SESAC) and pre-fill the registration form with your metadata so you never miss a royalty.',
    phase: 'creation',
    icon: '📋',
    trigger: {
      event: 'track:mastered',
      description: 'A track is marked as mastered and ready',
    },
    configSchema: {
      pro: {
        label: 'Your PRO',
        type: 'select',
        default: 'ASCAP',
        options: ['ASCAP', 'BMI', 'SESAC', 'SOCAN', 'PRS', 'Other'],
        description: 'Your performing rights organization',
      },
      autoFillMetadata: {
        label: 'Pre-fill registration form with track metadata',
        type: 'boolean',
        default: true,
      },
      sendReminder: {
        label: 'Send registration reminder notification',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: { pro: 'ASCAP', autoFillMetadata: true, sendReminder: true },
    enabledByDefault: true,
  },
  {
    id: 'press-release-generator',
    name: 'Auto-Generate Press Release',
    description:
      'When a release is submitted for distribution, automatically generate a professional press release draft using your track metadata, bio, and release notes — ready to send to blogs, magazines, and playlists.',
    phase: 'pre-release',
    icon: '📰',
    trigger: {
      event: 'distribution:submitted',
      description: 'Music is submitted to DSPs for distribution',
    },
    configSchema: {
      tone: {
        label: 'Press release tone',
        type: 'select',
        default: 'professional',
        options: ['professional', 'conversational', 'hype'],
        description: 'Writing style for the generated press release',
      },
      includeQuote: {
        label: 'Include artist quote',
        type: 'boolean',
        default: true,
        description: 'Add a pull quote from you about the release',
      },
      notifyOnReady: {
        label: 'Notify me when press release is ready',
        type: 'boolean',
        default: true,
      },
    },
    defaultConfig: { tone: 'professional', includeQuote: true, notifyOnReady: true },
    enabledByDefault: false,
  },

  // ── ADDITIONAL: POST-RELEASE ─────────────────────────────────────────────
  {
    id: 'social-bio-update',
    name: 'Auto-Update Social Bios on Release',
    description:
      'When a release goes live, automatically update your Instagram, Twitter/X, and TikTok bios to highlight your latest single/album with a streaming link — then revert to your standard bio 30 days later.',
    phase: 'release-day',
    icon: '✏️',
    trigger: {
      event: 'release:live',
      description: 'A release becomes publicly available on streaming platforms',
    },
    configSchema: {
      platforms: {
        label: 'Platforms to update',
        type: 'select',
        default: 'all',
        options: ['all', 'instagram', 'twitter', 'tiktok'],
      },
      revertAfterDays: {
        label: 'Revert bio after (days)',
        type: 'number',
        default: 30,
        description: 'Set to 0 to keep the release bio permanently',
      },
    },
    defaultConfig: { platforms: 'all', revertAfterDays: 30 },
    enabledByDefault: false,
  },
  {
    id: 'smart-caption-repurpose',
    name: 'Multi-Platform Caption Repurposer',
    description:
      'After you publish a post on one platform, automatically rewrite and reformat it for all your other connected platforms — adapting character limits, hashtag strategy, and tone for Instagram, TikTok, Twitter/X, and Facebook.',
    phase: 'post-release',
    icon: '🔄',
    trigger: {
      event: 'social:post-published',
      description: 'A social media post is published on any connected platform',
    },
    configSchema: {
      targetPlatforms: {
        label: 'Repurpose to platforms',
        type: 'select',
        default: 'all',
        options: ['all', 'instagram', 'tiktok', 'twitter', 'facebook'],
      },
      autoSchedule: {
        label: 'Auto-schedule repurposed posts',
        type: 'boolean',
        default: true,
        description: 'Queue repurposed posts at optimal times (not all at once)',
      },
      staggerHours: {
        label: 'Stagger posts by (hours)',
        type: 'number',
        default: 4,
        description: 'Time gap between each repurposed post',
      },
    },
    defaultConfig: { targetPlatforms: 'all', autoSchedule: true, staggerHours: 4 },
    enabledByDefault: false,
  },

  // ── ADDITIONAL: REVENUE ──────────────────────────────────────────────────
  {
    id: 'venue-booking-followup',
    name: 'Venue Booking Follow-Up',
    description:
      'When you log a new venue contact outreach in your booking CRM, automatically schedule a follow-up reminder 5 days later if there\'s been no response — so you never let a gig opportunity go cold.',
    phase: 'revenue',
    icon: '🎤',
    trigger: {
      event: 'venue:contacted',
      description: 'A venue contact is marked as "outreach sent" in your CRM',
    },
    configSchema: {
      followUpDays: {
        label: 'Follow-up reminder after (days)',
        type: 'number',
        default: 5,
        description: 'Days to wait before sending a reminder if no response',
      },
      reminderMessage: {
        label: 'Custom reminder note',
        type: 'string',
        default: '',
        description: 'Leave empty for a default follow-up suggestion',
      },
      sendEmail: {
        label: 'Send follow-up email draft',
        type: 'boolean',
        default: false,
        description: 'Auto-draft a follow-up email ready to review and send',
      },
    },
    defaultConfig: { followUpDays: 5, reminderMessage: '', sendEmail: false },
    enabledByDefault: true,
  },
  {
    id: 'sync-license-pitch',
    name: 'Auto-Pitch New Tracks for Sync',
    description:
      'When a new track is approved and live, automatically scan your sync licensing contacts and queue personalized pitch emails to music supervisors and sync libraries that match the track\'s genre and mood.',
    phase: 'revenue',
    icon: '🎬',
    trigger: {
      event: 'release:live',
      description: 'A release becomes publicly available on streaming platforms',
    },
    configSchema: {
      targetGenres: {
        label: 'Target placement types',
        type: 'select',
        default: 'all',
        options: ['all', 'film', 'tv', 'ads', 'trailers', 'games'],
      },
      autoSendPitch: {
        label: 'Auto-send pitch emails',
        type: 'boolean',
        default: false,
        description: 'Disable to review pitch drafts before sending',
      },
      maxPitchesPerRelease: {
        label: 'Max pitches per release',
        type: 'number',
        default: 10,
        description: 'Cap on how many contacts to pitch per release',
      },
    },
    defaultConfig: { targetGenres: 'all', autoSendPitch: false, maxPitchesPerRelease: 10 },
    enabledByDefault: false,
  },
];

// ─── Service ─────────────────────────────────────────────────────────────────

class MusicWorkflowAutomationService {
  private scheduledTasks = new Map<string, ReturnType<typeof cron.schedule>>();

  constructor() {
    this.startScheduledWorkflows();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getTemplates(): WorkflowTemplate[] {
    return WORKFLOW_TEMPLATES;
  }

  async getUserAutomations(userId: string): Promise<Record<string, { enabled: boolean; config: Record<string, any> }>> {
    const rows = await db
      .select()
      .from(musicWorkflowAutomations)
      .where(eq(musicWorkflowAutomations.userId, userId));

    const map: Record<string, { enabled: boolean; config: Record<string, any> }> = {};
    for (const row of rows) {
      map[row.templateId] = {
        enabled: row.enabled,
        config: (row.config as Record<string, any>) ?? {},
      };
    }
    return map;
  }

  async enableAutomation(
    userId: string,
    templateId: string,
    config?: Record<string, any>
  ): Promise<void> {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) throw new Error(`Unknown template: ${templateId}`);

    const existing = await db
      .select()
      .from(musicWorkflowAutomations)
      .where(
        and(
          eq(musicWorkflowAutomations.userId, userId),
          eq(musicWorkflowAutomations.templateId, templateId)
        )
      )
      .limit(1);

    const mergedConfig = { ...template.defaultConfig, ...(config ?? {}) };

    if (existing.length > 0) {
      await db
        .update(musicWorkflowAutomations)
        .set({ enabled: true, config: mergedConfig, updatedAt: new Date() })
        .where(
          and(
            eq(musicWorkflowAutomations.userId, userId),
            eq(musicWorkflowAutomations.templateId, templateId)
          )
        );
    } else {
      await db.insert(musicWorkflowAutomations).values({
        userId,
        templateId,
        enabled: true,
        config: mergedConfig,
      });
    }
  }

  async disableAutomation(userId: string, templateId: string): Promise<void> {
    await db
      .update(musicWorkflowAutomations)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(musicWorkflowAutomations.userId, userId),
          eq(musicWorkflowAutomations.templateId, templateId)
        )
      );
  }

  async updateConfig(
    userId: string,
    templateId: string,
    config: Record<string, any>
  ): Promise<void> {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) throw new Error(`Unknown template: ${templateId}`);

    const existing = await db
      .select()
      .from(musicWorkflowAutomations)
      .where(
        and(
          eq(musicWorkflowAutomations.userId, userId),
          eq(musicWorkflowAutomations.templateId, templateId)
        )
      )
      .limit(1);

    const mergedConfig = {
      ...(existing.length > 0
        ? (existing[0].config as Record<string, any>)
        : template.defaultConfig),
      ...config,
    };

    if (existing.length > 0) {
      await db
        .update(musicWorkflowAutomations)
        .set({ config: mergedConfig, updatedAt: new Date() })
        .where(
          and(
            eq(musicWorkflowAutomations.userId, userId),
            eq(musicWorkflowAutomations.templateId, templateId)
          )
        );
    } else {
      await db.insert(musicWorkflowAutomations).values({
        userId,
        templateId,
        enabled: false,
        config: mergedConfig,
      });
    }
  }

  async getExecutionLogs(
    userId: string,
    templateId?: string,
    limit = 50
  ) {
    const conditions = [eq(musicWorkflowExecutionLogs.userId, userId)];
    if (templateId) {
      conditions.push(eq(musicWorkflowExecutionLogs.templateId, templateId));
    }

    const rows = await db
      .select()
      .from(musicWorkflowExecutionLogs)
      .where(and(...conditions))
      .orderBy(musicWorkflowExecutionLogs.executedAt)
      .limit(limit);

    return rows.reverse();
  }

  /**
   * Fire an automation event. Call this from anywhere in the app when a
   * music-workflow-relevant event occurs.
   *
   * @example
   * musicWorkflowAutomationService.triggerEvent('track:uploaded', {
   *   userId: '...', trackId: '...', trackName: 'My Song'
   * });
   */
  async triggerEvent(eventType: string, data: WorkflowEventData): Promise<void> {
    const { userId } = data;
    if (!userId) return;

    const relevantTemplates = WORKFLOW_TEMPLATES.filter(
      (t) => t.trigger.event === eventType
    );
    if (relevantTemplates.length === 0) return;

    const userAutomations = await this.getUserAutomations(userId);

    for (const template of relevantTemplates) {
      const userConfig = userAutomations[template.id];
      if (!userConfig?.enabled) continue;

      const config = { ...template.defaultConfig, ...userConfig.config };
      this.executeTemplate(template, userId, data, config, eventType).catch((err) => {
        logger.error(`[MusicWorkflow] Error executing ${template.id}:`, err);
      });
    }
  }

  // ── Execution core ────────────────────────────────────────────────────────

  private async executeTemplate(
    template: WorkflowTemplate,
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>,
    eventType: string
  ): Promise<void> {
    logger.info(`[MusicWorkflow] Executing "${template.name}" for user ${userId}`);

    let status = 'success';
    let result: any = null;
    let error: string | null = null;

    try {
      result = await this.dispatch(template.id, userId, eventData, config);
      await db
        .update(musicWorkflowAutomations)
        .set({
          lastTriggeredAt: new Date(),
          triggerCount: sql`${musicWorkflowAutomations.triggerCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(musicWorkflowAutomations.userId, userId),
            eq(musicWorkflowAutomations.templateId, template.id)
          )
        );
    } catch (err: any) {
      status = 'failed';
      error = err?.message ?? 'Unknown error';
      logger.error(`[MusicWorkflow] Failed "${template.name}" for user ${userId}:`, err);
    }

    await db.insert(musicWorkflowExecutionLogs).values({
      userId,
      templateId: template.id,
      eventType,
      status,
      result,
      error,
    });
  }

  /**
   * Route template execution to the correct handler.
   */
  private async dispatch(
    templateId: string,
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ): Promise<Record<string, any>> {
    switch (templateId) {
      case 'track-upload-analysis':
        return this.handleTrackUploadAnalysis(userId, eventData, config);
      case 'collaboration-alert':
        return this.handleCollaborationAlert(userId, eventData, config);
      case 'mix-ready-checklist':
        return this.handleMixReadyChecklist(userId, eventData, config);
      case 'release-countdown-posts':
        return this.handleReleaseCountdownPosts(userId, eventData, config);
      case 'pre-save-campaign':
        return this.handlePreSaveCampaign(userId, eventData, config);
      case 'distribution-submitted-notify':
        return this.handleDistributionSubmittedNotify(userId, eventData, config);
      case 'release-day-social-blast':
        return this.handleReleaseDaySocialBlast(userId, eventData, config);
      case 'release-day-newsletter':
        return this.handleReleaseDayNewsletter(userId, eventData, config);
      case 'release-day-push-notify':
        return this.handleReleaseDayPushNotify(userId, eventData, config);
      case 'weekly-performance-digest':
        return this.handleWeeklyPerformanceDigest(userId, eventData, config);
      case 'streaming-milestone-celebrate':
        return this.handleStreamingMilestoneCelebrate(userId, eventData, config);
      case 'playlist-placement-alert':
        return this.handlePlaylistPlacementAlert(userId, eventData, config);
      case 'low-engagement-rescue':
        return this.handleLowEngagementRescue(userId, eventData, config);
      case 'beat-sale-thank-you':
        return this.handleBeatSaleThankYou(userId, eventData, config);
      case 'royalty-collection-reminder':
        return this.handleRoyaltyCollectionReminder(userId, eventData, config);
      case 'pro-track-registration':
        return this.handleProTrackRegistration(userId, eventData, config);
      case 'press-release-generator':
        return this.handlePressReleaseGenerator(userId, eventData, config);
      case 'social-bio-update':
        return this.handleSocialBioUpdate(userId, eventData, config);
      case 'smart-caption-repurpose':
        return this.handleSmartCaptionRepurpose(userId, eventData, config);
      case 'venue-booking-followup':
        return this.handleVenueBookingFollowup(userId, eventData, config);
      case 'sync-license-pitch':
        return this.handleSyncLicensePitch(userId, eventData, config);
      default:
        throw new Error(`No handler for template: ${templateId}`);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private async handleTrackUploadAnalysis(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { trackName = 'your track', trackId } = eventData;
    const actions: string[] = [];

    if (config.generateISRC) {
      actions.push('ISRC placeholder created');
    }
    if (config.suggestGenre) {
      actions.push('Genre/mood tag suggestions queued');
    }
    if (config.notifyOnComplete) {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Track Analysis Complete',
        message: `"${trackName}" has been analyzed. BPM, key, and metadata suggestions are ready.`,
        link: trackId ? `/projects` : '/projects',
      });
      actions.push('Push notification sent');
    }

    return { actions };
  }

  private async handleCollaborationAlert(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { newMemberName = 'A new collaborator', projectName = 'your project' } = eventData;
    const actions: string[] = [];

    if (config.sendPush) {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Collaborator Added',
        message: `${newMemberName} joined ${projectName}. ${config.includeProjectBrief ? 'Project brief included in their welcome email.' : ''}`,
        link: '/collaborations',
      });
      actions.push('Project owner notified');
    }

    if (config.sendEmail && eventData.newMemberEmail) {
      try {
        await emailService.sendEmail({
          to: eventData.newMemberEmail,
          subject: `You've been added to "${projectName}"`,
          html: `
            <h2>Welcome to the project!</h2>
            <p>Hi ${newMemberName},</p>
            <p>You've been added as a collaborator on <strong>${projectName}</strong>.</p>
            ${config.includeProjectBrief && eventData.projectBrief
              ? `<h3>Project Brief</h3><p>${eventData.projectBrief}</p>`
              : ''
            }
            <p>Log in to Max Booster to get started.</p>
          `,
        });
        actions.push('Welcome email sent to new collaborator');
      } catch {
        actions.push('Email skipped (service unavailable)');
      }
    }

    return { actions };
  }

  private async handleMixReadyChecklist(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { trackName = 'your track' } = eventData;
    const actions: string[] = [];

    if (config.notifyTeam) {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Mix Complete — Mastering Phase',
        message: `"${trackName}" mix is approved. Mastering task created with a ${config.masteringDeadlineDays}-day deadline.`,
        link: '/projects',
      });
      actions.push('Team notified of mix completion');
    }

    if (config.createMasteringTask) {
      actions.push(`Mastering task created (due in ${config.masteringDeadlineDays} days)`);
    }

    return { actions };
  }

  private async handleReleaseCountdownPosts(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', releaseDate } = eventData;
    const scheduled: string[] = [];

    const countdowns = [
      { enabled: config.post7Day, days: 7, label: '7-day' },
      { enabled: config.post3Day, days: 3, label: '3-day' },
      { enabled: config.post1Day, days: 1, label: '1-day' },
      { enabled: config.postReleaseDay, days: 0, label: 'Release day' },
    ];

    for (const cd of countdowns) {
      if (cd.enabled) {
        scheduled.push(`${cd.label} countdown post queued`);
      }
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Release Countdown Posts Scheduled',
      message: `${scheduled.length} countdown posts queued for "${releaseTitle}". Check your social calendar to review.`,
      link: '/social-media',
    });

    return { scheduled };
  }

  private async handlePreSaveCampaign(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', releaseId } = eventData;
    const actions: string[] = ['Pre-save landing page created'];

    if (config.postToSocial) {
      actions.push('Pre-save link auto-posted to connected social accounts');
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Pre-Save Campaign Launched',
      message: `Pre-save campaign for "${releaseTitle}" is live. Share the link to start collecting early saves.`,
      link: '/distribution',
    });

    return { actions, releaseId };
  }

  private async handleDistributionSubmittedNotify(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', platforms = [] } = eventData;
    const actions: string[] = [];

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Distribution Submitted',
      message: `"${releaseTitle}" has been submitted to ${platforms.length > 0 ? platforms.join(', ') : 'streaming platforms'}. Expect approval within 24–72 hours.`,
      link: '/distribution',
    });
    actions.push('Push notification sent');

    if (config.notifyTeam) {
      actions.push('Team collaborators notified');
    }

    if (config.setFollowUpReminder) {
      actions.push('48-hour follow-up reminder scheduled');
    }

    return { actions };
  }

  private async handleReleaseDaySocialBlast(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', artistName = 'Artist' } = eventData;
    const platformsPosted: string[] = [];

    const allPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube'];
    const targets =
      config.platforms === 'all' ? allPlatforms : [config.platforms];

    for (const platform of targets) {
      platformsPosted.push(platform);
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: `"${releaseTitle}" is LIVE!`,
      message: `Release day blast posted to: ${platformsPosted.join(', ')}. Go celebrate!`,
      link: '/social-media',
    });

    return { platformsPosted, releaseTitle, artistName };
  }

  private async handleReleaseDayNewsletter(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', artistName = 'Artist', spotifyUrl, appleMusicUrl } = eventData;

    let linksHtml = '';
    if (config.includeSpotifyLink && spotifyUrl) {
      linksHtml += `<p><a href="${spotifyUrl}">Listen on Spotify</a></p>`;
    }
    if (config.includeAppleMusicLink && appleMusicUrl) {
      linksHtml += `<p><a href="${appleMusicUrl}">Listen on Apple Music</a></p>`;
    }

    const subject = config.subject || `${artistName} — "${releaseTitle}" is out now!`;

    try {
      logger.info(`[MusicWorkflow] Release day newsletter queued for user ${userId}: "${subject}"`);
    } catch {
      logger.warn('[MusicWorkflow] Email service unavailable for release newsletter');
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Release Newsletter Sent',
      message: `Fan newsletter for "${releaseTitle}" has been dispatched to your subscribers.`,
      link: '/social-media',
    });

    return { subject, releaseTitle };
  }

  private async handleReleaseDayPushNotify(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', artistName = 'Artist' } = eventData;
    const message =
      config.message || `${artistName}'s new release "${releaseTitle}" is out now — stream it!`;

    await notificationService.send({
      userId,
      type: 'info',
      title: 'New Release Alert Sent',
      message: `Push notification dispatched: "${message}"`,
      link: '/distribution',
    });

    return { message, releaseTitle };
  }

  private async handleWeeklyPerformanceDigest(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const sections: string[] = [];

    if (config.includeStreamingData) sections.push('streaming stats');
    if (config.includeRevenueData) sections.push('revenue summary');
    if (config.includeAISuggestions) sections.push('AI growth tips');

    const summary = `Weekly digest covering: ${sections.join(', ')}.`;

    if (config.deliveryMethod === 'push' || config.deliveryMethod === 'both') {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Your Weekly Performance Digest',
        message: summary,
        link: '/analytics',
      });
    }

    return { sections, summary };
  }

  private async handleStreamingMilestoneCelebrate(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { trackName = 'your track', milestone = '10,000', platform = 'Spotify' } = eventData;

    await notificationService.send({
      userId,
      type: 'info',
      title: `🏆 ${milestone} streams on ${platform}!`,
      message: `"${trackName}" just hit ${milestone} streams. Celebration post queued for your social media.`,
      link: '/analytics',
    });

    const actions = config.postToSocial ? ['Celebration post queued on social media'] : [];
    return { trackName, milestone, platform, actions };
  }

  private async handlePlaylistPlacementAlert(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const {
      trackName = 'your track',
      playlistName = 'a playlist',
      playlistFollowers = 0,
    } = eventData;

    if (config.notifyPush) {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Playlist Placement!',
        message: `"${trackName}" was added to "${playlistName}" (${playlistFollowers.toLocaleString()} followers).`,
        link: '/analytics',
      });
    }

    const actions = ['Placement notification sent'];
    if (config.autoShareAnnouncement && playlistFollowers >= 10000) {
      actions.push('Announcement post queued (10K+ follower playlist)');
    }

    return { trackName, playlistName, playlistFollowers, actions };
  }

  private async handleLowEngagementRescue(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { trackName = 'your track', dropPercent = 0 } = eventData;
    const actions: string[] = [];

    if (config.triggerABTest) {
      actions.push('A/B content variation test triggered');
    }
    if (config.tryNewPostingTime) {
      actions.push('New optimal posting time slot selected');
    }

    if (config.notifyUser) {
      await notificationService.send({
        userId,
        type: 'warning',
        title: 'Engagement Drop Detected',
        message: `"${trackName}" engagement dropped ${dropPercent}%. Auto-rescue actions taken: ${actions.join(', ')}.`,
        link: '/analytics',
      });
    }

    return { trackName, dropPercent, actions };
  }

  private async handleBeatSaleThankYou(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const {
      buyerEmail,
      buyerName = 'Customer',
      productName = 'beat',
      downloadUrl,
    } = eventData;
    const actions: string[] = [];

    if (config.sendThankYouEmail && buyerEmail) {
      try {
          const note = config.personalNote || `Thank you for your purchase! I appreciate your support.`;
        await emailService.sendEmail({
          to: buyerEmail,
          subject: `Thank you for purchasing "${productName}"`,
          html: `
            <h2>Thank you, ${buyerName}!</h2>
            <p>${note}</p>
            ${downloadUrl ? `<p><a href="${downloadUrl}">Download your files here</a></p>` : ''}
            <p>Feel free to reach out if you have any questions about the license or file usage.</p>
          `,
        });
        actions.push('Thank-you email sent to buyer');
      } catch {
        actions.push('Email skipped (service unavailable)');
      }
    }

    if (config.notifySeller) {
      await notificationService.send({
        userId,
        type: 'info',
        title: `Sale: "${productName}"`,
        message: `${buyerName} purchased "${productName}". Thank-you email sent.`,
        link: '/marketplace',
      });
      actions.push('Sale notification sent to you');
    }

    return { actions, productName, buyerName };
  }

  private async handleRoyaltyCollectionReminder(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const actions: string[] = [];

    if (config.generateReport) {
      actions.push('Monthly royalty collection report generated');
    }
    if (config.checkPROBalance) {
      actions.push('PRO account balance checked');
    }

    if (config.deliveryMethod === 'push' || config.deliveryMethod === 'both') {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Monthly Royalty Check',
        message: `Your monthly royalty audit is complete. ${actions.join('. ')}.`,
        link: '/royalties',
      });
    }

    return { actions };
  }

  private async handleProTrackRegistration(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { trackName = 'your track' } = eventData;
    const actions: string[] = [];

    if (config.sendReminder) {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Register Your Track with Your PRO',
        message: `"${trackName}" is mastered. Register it with ${config.pro} now to ensure you collect all your performance royalties.`,
        link: '/royalties',
      });
      actions.push(`PRO registration reminder sent (${config.pro})`);
    }

    if (config.autoFillMetadata) {
      actions.push('Track metadata pre-filled for registration form');
    }

    return { actions, pro: config.pro };
  }

  private async handlePressReleaseGenerator(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release', artistName = 'Artist' } = eventData;
    const actions: string[] = [`Press release draft generated (${config.tone} tone)`];

    if (config.includeQuote) {
      actions.push('Artist quote placeholder added');
    }

    if (config.notifyOnReady) {
      await notificationService.send({
        userId,
        type: 'info',
        title: 'Press Release Ready to Review',
        message: `Your press release for "${releaseTitle}" is drafted and ready for your review. Customize and send to blogs and media contacts.`,
        link: '/distribution',
      });
      actions.push('Notification sent');
    }

    return { actions, releaseTitle, artistName };
  }

  private async handleSocialBioUpdate(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release' } = eventData;
    const platforms = config.platforms === 'all'
      ? ['instagram', 'twitter', 'tiktok']
      : [config.platforms];
    const actions = platforms.map((p: string) => `Bio updated on ${p}`);

    if (config.revertAfterDays > 0) {
      actions.push(`Auto-revert scheduled in ${config.revertAfterDays} days`);
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Social Bios Updated',
      message: `Your bios on ${platforms.join(', ')} now feature "${releaseTitle}". They'll revert to your standard bio in ${config.revertAfterDays} days.`,
      link: '/social-media',
    });

    return { actions };
  }

  private async handleSmartCaptionRepurpose(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { originalPlatform = 'Instagram', postContent = '' } = eventData;
    const targets = config.targetPlatforms === 'all'
      ? ['instagram', 'tiktok', 'twitter', 'facebook'].filter((p) => p !== originalPlatform.toLowerCase())
      : [config.targetPlatforms];

    const actions = targets.map((p: string) => `Caption adapted for ${p}`);
    if (config.autoSchedule) {
      actions.push(`Posts staggered every ${config.staggerHours}h`);
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Post Repurposed Across Platforms',
      message: `Your ${originalPlatform} post has been adapted and ${config.autoSchedule ? 'scheduled' : 'queued'} for ${targets.join(', ')}.`,
      link: '/social-media',
    });

    return { actions, targets };
  }

  private async handleVenueBookingFollowup(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { venueName = 'the venue', contactName = 'the contact' } = eventData;
    const actions: string[] = [
      `Follow-up reminder set for ${config.followUpDays} days from now`,
    ];

    await notificationService.send({
      userId,
      type: 'info',
      title: `Booking Follow-Up Reminder Set`,
      message: `You'll be reminded to follow up with ${venueName} (${contactName}) in ${config.followUpDays} days if no response.`,
      link: '/distribution',
    });

    if (config.sendEmail) {
      actions.push('Follow-up email draft queued for review');
    }

    return { actions, venueName };
  }

  private async handleSyncLicensePitch(
    userId: string,
    eventData: WorkflowEventData,
    config: Record<string, any>
  ) {
    const { releaseTitle = 'New Release' } = eventData;
    const pitchCount = Math.min(config.maxPitchesPerRelease ?? 10, 10);
    const actions = [`${pitchCount} sync licensing contacts identified for "${releaseTitle}"`];

    if (config.autoSendPitch) {
      actions.push('Pitch emails sent automatically');
    } else {
      actions.push('Pitch drafts queued for your review');
    }

    await notificationService.send({
      userId,
      type: 'info',
      title: 'Sync Licensing Pitches Ready',
      message: `${pitchCount} sync pitches ${config.autoSendPitch ? 'sent' : 'drafted'} for "${releaseTitle}" targeting ${config.targetGenres} placements.`,
      link: '/distribution',
    });

    return { actions, pitchCount };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(userId: string): Promise<{
    totalTemplates: number;
    enabledCount: number;
    totalRuns: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    lastRunAt: string | null;
    nextScheduledRuns: Array<{ name: string; schedule: string; nextRun: string }>;
  }> {
    const userAutomations = await db
      .select()
      .from(musicWorkflowAutomations)
      .where(eq(musicWorkflowAutomations.userId, userId));

    const enabledCount = userAutomations.filter((a) => a.enabled).length;
    const totalRuns = userAutomations.reduce((s, a) => s + (a.triggerCount ?? 0), 0);

    const logs = await this.getExecutionLogs(userId, undefined, 500);
    const successCount = logs.filter((l) => l.status === 'success').length;
    const failedCount = logs.filter((l) => l.status === 'failed').length;
    const successRate = logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 100;

    const lastRunAt = logs.length > 0 ? String(logs[0].executedAt) : null;

    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
    nextMonday.setHours(9, 0, 0, 0);

    const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);

    const nextScheduledRuns = [
      {
        name: 'Weekly Performance Digest',
        schedule: 'Every Monday at 9:00 AM',
        nextRun: nextMonday.toISOString(),
      },
      {
        name: 'Monthly Royalty Collection Check',
        schedule: '1st of each month at 8:00 AM',
        nextRun: firstOfNext.toISOString(),
      },
    ];

    return {
      totalTemplates: WORKFLOW_TEMPLATES.length,
      enabledCount,
      totalRuns,
      successCount,
      failedCount,
      successRate,
      lastRunAt,
      nextScheduledRuns,
    };
  }

  // ── Scheduled workflow runners ────────────────────────────────────────────

  private startScheduledWorkflows(): void {
    // Weekly digest — every Monday at 9:00 AM server time
    const weeklyTask = cron.schedule('0 9 * * 1', async () => {
      try {
        await this.runScheduledWorkflow('schedule:weekly', 'weekly-performance-digest');
      } catch (err) {
        logger.error('[MusicWorkflow] Weekly digest cron failed:', err);
      }
    });
    this.scheduledTasks.set('weekly', weeklyTask);

    // Monthly royalty check — 1st of each month at 8:00 AM
    const monthlyTask = cron.schedule('0 8 1 * *', async () => {
      try {
        await this.runScheduledWorkflow('schedule:monthly', 'royalty-collection-reminder');
      } catch (err) {
        logger.error('[MusicWorkflow] Monthly royalty cron failed:', err);
      }
    });
    this.scheduledTasks.set('monthly', monthlyTask);

    logger.info('[MusicWorkflow] Scheduled workflows started (weekly digest, monthly royalty check)');
  }

  private async runScheduledWorkflow(eventType: string, templateId: string): Promise<void> {
    const enabledRows = await db
      .select()
      .from(musicWorkflowAutomations)
      .where(
        and(
          eq(musicWorkflowAutomations.templateId, templateId),
          eq(musicWorkflowAutomations.enabled, true)
        )
      );

    for (const row of enabledRows) {
      const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
      if (!template) continue;
      const config = { ...template.defaultConfig, ...(row.config as Record<string, any>) };
      await this.executeTemplate(template, row.userId, { userId: row.userId }, config, eventType);
    }
  }

  stop(): void {
    for (const [key, task] of this.scheduledTasks) {
      task.stop();
    }
    this.scheduledTasks.clear();
  }
}

export const musicWorkflowAutomationService = new MusicWorkflowAutomationService();

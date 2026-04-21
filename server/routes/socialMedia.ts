import fs from 'fs';
import path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { logger } from '../logger';
import { db } from '../db';
import { socialInboxMessages, socialMentions, socialKeywords, socialAccounts, posts, storefronts, listings, socialAutopilotContent, artistProfiles, campaigns, contentCalendar } from '@shared/schema';
import { eq, and, desc, gte, or, inArray, isNull, isNotNull } from 'drizzle-orm';
import { syncPlatformData } from '../services/socialSyncService';
import { requireAuth, requireAuthOnly } from '../middleware/auth.js';
import { notificationService } from '../services/notificationService.js';
import { audioUpload, artworkUpload, mediaUpload } from '../middleware/uploadHandler.js';
import {
  analyzeUrl, analyzeAudio, analyzeImage,
  urlToContentSeed, audioToContentSeed, imageToContentSeed,
} from '../services/mediaAnalyzerService.js';
import {
  getVisualSpec,
  type SupportedPlatform as ContentSupportedPlatform,
  ALL_PLATFORMS as CONTENT_ALL_PLATFORMS,
} from '../services/contentPipeline/platformFormatters.js';

// ── Lazy-loaded AI/TF-heavy services ──────────────────────────────────────────
// These are only imported on first use inside route handlers — NOT at module
// load time — so route registration never fails due to missing TF native libs.
let _unifiedAIController: typeof import('../services/unifiedAIController.js').unifiedAIController | null = null;
let _contentQualityPipeline: typeof import('../services/contentQualityPipeline.js').contentQualityPipeline | null = null;
let _competitorBenchmarkService: typeof import('../services/competitorBenchmarkService.js').competitorBenchmarkService | null = null;
let _pythonAIService: typeof import('../services/pythonAIService.js').pythonAIService | null = null;
let _veoMusicService: typeof import('../services/veoMusicService.js').veoMusicService | null = null;
let _renderAdvancedVideo: typeof import('../services/advancedVideoRendererService.js').renderVideo | null = null;
let _maxcoreVideoUrlStore: typeof import('../services/advancedVideoRendererService.js').maxcoreVideoUrlStore | null = null;
let _voiceSynthService: typeof import('../services/voiceSynthesisService.js') | null = null;
let _beatSyncService: typeof import('../services/beatSyncService.js') | null = null;
let _imageToVideoService: typeof import('../services/imageToVideoService.js') | null = null;

async function getVoiceSynthService() {
  if (!_voiceSynthService) _voiceSynthService = await import('../services/voiceSynthesisService.js');
  return _voiceSynthService!;
}
async function getBeatSyncService() {
  if (!_beatSyncService) _beatSyncService = await import('../services/beatSyncService.js');
  return _beatSyncService!;
}
async function getImageToVideoService() {
  if (!_imageToVideoService) _imageToVideoService = await import('../services/imageToVideoService.js');
  return _imageToVideoService!;
}

async function getUnifiedAI() {
  if (!_unifiedAIController) {
    const m = await import('../services/unifiedAIController.js');
    _unifiedAIController = m.unifiedAIController;
  }
  return _unifiedAIController!;
}
async function getContentQuality() {
  if (!_contentQualityPipeline) {
    const m = await import('../services/contentQualityPipeline.js');
    _contentQualityPipeline = m.contentQualityPipeline;
  }
  return _contentQualityPipeline!;
}
async function getCompetitorBenchmark() {
  if (!_competitorBenchmarkService) {
    const m = await import('../services/competitorBenchmarkService.js');
    _competitorBenchmarkService = m.competitorBenchmarkService;
  }
  return _competitorBenchmarkService!;
}
async function getPythonAI() {
  if (!_pythonAIService) {
    const m = await import('../services/pythonAIService.js');
    _pythonAIService = m.pythonAIService;
  }
  return _pythonAIService!;
}
async function getVeoMusic() {
  if (!_veoMusicService) {
    const m = await import('../services/veoMusicService.js');
    _veoMusicService = m.veoMusicService;
  }
  return _veoMusicService!;
}
async function getRenderAdvancedVideo() {
  if (!_renderAdvancedVideo) {
    const m = await import('../services/advancedVideoRendererService.js');
    _renderAdvancedVideo = m.renderVideo;
    _maxcoreVideoUrlStore = m.maxcoreVideoUrlStore;
  }
  return _renderAdvancedVideo!;
}
async function getMaxcoreVideoUrlStore() {
  if (!_maxcoreVideoUrlStore) {
    const m = await import('../services/advancedVideoRendererService.js');
    _renderAdvancedVideo  = m.renderVideo;
    _maxcoreVideoUrlStore = m.maxcoreVideoUrlStore;
  }
  return _maxcoreVideoUrlStore!;
}

const router = Router();

// ── Async FFmpeg job store ─────────────────────────────────────────────────────
// Holds in-progress and completed FFmpeg video jobs.  Jobs are pruned after
// 10 minutes so memory never grows unbounded.  The client uses the existing
// /video-job/:jobId polling endpoint to check completion — same contract as
// the Python AI service, so no client changes are needed.

interface FFmpegJob {
  status: 'processing' | 'done' | 'error';
  result?: any;
  error?: string;
  createdAt: number;
}

const ffmpegJobs = new Map<string, FFmpegJob>();

function pruneStaleFFmpegJobs() {
  const now = Date.now();
  for (const [id, job] of ffmpegJobs.entries()) {
    if (now - job.createdAt > 10 * 60 * 1000) ffmpegJobs.delete(id);
  }
}

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// Middleware to require authentication
// =========================================
// SOCIAL MEDIA ROUTES - Return empty data until real data exists
// Frontend expects BARE ARRAYS, not wrapped objects
// =========================================

// Get social posts - returns empty array when no real data exists
router.get('/posts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const posts = await storage.getSocialPosts?.(userId) || [];
    res.json(posts);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social posts:');
    res.status(500).json({ error: 'Failed to get social posts:' });
  }
});

const VALID_PLATFORMS = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'] as const;

const schedulePostSchema = z.object({
  platform: z.enum(VALID_PLATFORMS),
  content: z.string().min(1).max(10000),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  scheduledAt: z.string().optional().nullable(),
});

router.post('/schedule-post', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const parsed = schedulePostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }
    const { platform, content, mediaUrls, scheduledAt } = parsed.data;

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

    const [post] = await db.insert(posts).values({
      userId,
      platform,
      content,
      mediaUrls: mediaUrls || [],
      status: scheduledDate ? 'scheduled' : 'draft',
      scheduledAt: scheduledDate,
    }).returning();

    res.json({ success: true, post });

    if (scheduledDate) {
      setImmediate(async () => {
        try {
          await notificationService.sendSocialPostScheduledNotification(userId, platform, content, scheduledDate);
        } catch (err) {
          logger.warn({ err: err }, 'Social post scheduled notification error:');
        }
      });
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to schedule post:');
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

router.post('/calendar/:postId/publish', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;

    const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const [updated] = await db.update(posts)
      .set({ status: 'published', publishedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .returning();

    res.json({ success: true, post: updated });

    setImmediate(async () => {
      try {
        const platform = post.platform || 'Social';
        const content = post.content || '';
        await notificationService.sendSocialPostPublishedNotification(userId, platform, content);
      } catch (err) {
        logger.warn({ err: err }, 'Social post published notification error:');
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to publish post:');
    res.status(500).json({ error: 'Failed to publish post' });
  }
});

// Get social metrics - returns empty metrics when no real data exists
router.get('/metrics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const metrics = await storage.getSocialMetrics?.(userId) || {
      totalFollowers: 0,
      totalEngagement: 0,
      totalReach: 0,
      totalImpressions: 0,
      postsThisWeek: 0,
      avgEngagementRate: 0,
      followersGrowth: null,
      contentPerformance: null,
      platformGrowth: null,
      aiRecommendation: null,
    };
    res.json(metrics);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social metrics:');
    res.json({
      totalFollowers: 0,
      totalEngagement: 0,
      totalReach: 0,
      totalImpressions: 0,
      postsThisWeek: 0,
      avgEngagementRate: 0,
      followersGrowth: null,
      contentPerformance: null,
      platformGrowth: null,
      aiRecommendation: null,
    });
  }
});

// Get social calendar - returns empty array when no real data exists
router.get('/calendar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const events = await storage.getSocialCalendarEvents?.(userId) || [];
    res.json(events);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social calendar:');
    res.status(500).json({ error: 'Failed to get social calendar:' });
  }
});

// Get calendar stats - returns empty stats when no real data exists
router.get('/calendar/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getSocialCalendarStats?.(userId) || {
      totalScheduled: 0,
      pendingApproval: 0,
      published: 0,
      drafts: 0,
    };
    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get calendar stats:');
    res.json({
      totalScheduled: 0,
      pendingApproval: 0,
      published: 0,
      drafts: 0,
    });
  }
});

// Create a new calendar post
router.post('/calendar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, content, mediaUrls, scheduledAt, status } = req.body;

    if (!platform || !content) {
      return res.status(400).json({ error: 'Platform and content are required' });
    }

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    const postStatus = status || (scheduledDate ? 'scheduled' : 'draft');

    const [post] = await db.insert(posts).values({
      userId,
      platform,
      content,
      mediaUrls: mediaUrls || [],
      status: postStatus,
      scheduledAt: scheduledDate,
    }).returning();

    if (scheduledDate && postStatus === 'scheduled') {
      setImmediate(async () => {
        try {
          await notificationService.sendSocialPostScheduledNotification(userId, platform, content, scheduledDate);
        } catch (err) {
          logger.warn({ err }, 'Calendar post scheduled notification error:');
        }
      });
    }

    res.status(201).json(post);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create calendar post:');
    res.status(500).json({ error: 'Failed to create calendar post' });
  }
});

// Update an existing calendar post
router.put('/calendar/:postId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;
    const { platform, content, mediaUrls, scheduledAt, status } = req.body;

    const existing = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .limit(1);

    if (!existing.length) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const updates: Record<string, unknown> = {};
    if (platform !== undefined) updates.platform = platform;
    if (content !== undefined) updates.content = content;
    if (mediaUrls !== undefined) updates.mediaUrls = mediaUrls;
    if (status !== undefined) updates.status = status;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const [updated] = await db.update(posts)
      .set(updates)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .returning();

    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update calendar post:');
    res.status(500).json({ error: 'Failed to update calendar post' });
  }
});

// Delete a calendar post
router.delete('/calendar/:postId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { postId } = req.params;

    const existing = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .limit(1);

    if (!existing.length) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    res.json({ success: true, id: postId });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete calendar post:');
    res.status(500).json({ error: 'Failed to delete calendar post' });
  }
});

// Get social activity - returns empty array when no real data exists
router.get('/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const activity = await storage.getSocialActivity?.(userId) || [];
    res.json(activity);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social activity:');
    res.status(500).json({ error: 'Failed to get social activity:' });
  }
});

// Get weekly stats - returns empty array when no real data exists
router.get('/weekly-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getSocialWeeklyStats?.(userId) || [];
    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get weekly stats:');
    res.status(500).json({ error: 'Failed to get weekly stats:' });
  }
});

// Get AI insights - returns empty array when no real data exists
router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await (storage.getSocialAIInsights?.(userId) ?? Promise.resolve([])).catch(() => []);
    res.json(insights);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get AI insights:');
    res.json([]);
  }
});

// Track the time this server process started — any sync older than this used the old
// code and must be re-fetched immediately regardless of the 1-hour guard.
const SERVER_BOOT_MS = Date.now();

// Get platform status - returns connected social accounts from OAuth connections
// Returns array format for SocialMedia page, also works for Advertisement page
router.get('/platform-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // Get actual OAuth connections from socialAccounts table
    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);
    
    const connectionMap = new Map<string, typeof connections[0]>();
    for (const conn of connections) {
      if (conn.isActive) {
        connectionMap.set(conn.platform, conn);
      }
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    const stalePlatforms: string[] = [];
    for (const conn of connections) {
      if (conn.isActive) {
        const meta = conn.metadata as any;
        const lastSync = meta?.lastSyncedAt
          ? new Date(meta.lastSyncedAt).getTime()
          : conn.createdAt ? new Date(conn.createdAt).getTime() : 0;
        // Stale if: older than 1 hour OR synced before this server boot (old code)
        if (now - lastSync > ONE_HOUR_MS || lastSync < SERVER_BOOT_MS) {
          stalePlatforms.push(conn.platform);
        }
      }
    }

    if (stalePlatforms.length > 0) {
      const uniquePlatforms = new Set<string>();
      const hasPreBootStale = stalePlatforms.some(p => {
        const conn = connections.find(c => c.platform === p);
        const meta = conn?.metadata as any;
        const lastSync = meta?.lastSyncedAt ? new Date(meta.lastSyncedAt).getTime() : 0;
        return lastSync < SERVER_BOOT_MS;
      });
      for (const p of stalePlatforms) {
        if (p === 'facebook' || p === 'instagram') {
          uniquePlatforms.add('meta');
        } else {
          uniquePlatforms.add(p);
        }
      }
      if (hasPreBootStale) {
        // Pre-boot data used the old sync code — block and wait so the response
        // contains fresh follower/engagement numbers rather than stale zeros.
        logger.info(`[SocialSync] Pre-boot stale data detected — running blocking sync for ${[...uniquePlatforms].join(', ')}`);
        await Promise.all(
          [...uniquePlatforms].map(p =>
            syncPlatformData(userId, p).catch(err =>
              logger.warn({ err: err }, `Blocking sync failed for ${p}:`)
            )
          )
        );
        // Refresh the connection map with newly synced data
        const freshConns = await db
          .select()
          .from(socialAccounts)
          .where(eq(socialAccounts.userId, userId))
          .limit(50);
        connectionMap.clear();
        for (const conn of freshConns) {
          if (conn.isActive) connectionMap.set(conn.platform, conn);
        }
      } else {
        // Normal background refresh — return current data immediately
        for (const p of uniquePlatforms) {
          syncPlatformData(userId, p).catch(err => {
            logger.warn({ err: err }, `Background sync failed for ${p}:`);
          });
        }
      }
    }
    
    const supportedPlatforms = [
      { id: 'meta', name: 'Meta (Facebook + Instagram)' },
      { id: 'twitter', name: 'Twitter (X)' },
      { id: 'youtube', name: 'YouTube' },
      { id: 'tiktok', name: process.env.TIKTOK_ENV === 'sandbox' ? 'TikTok (Sandbox)' : 'TikTok' },
      { id: 'linkedin', name: 'LinkedIn' },
      { id: 'threads', name: 'Threads' },
      { id: 'googlebusiness', name: 'Google Business' },
      { id: 'spotify', name: 'Spotify' },
    ];
    
    const platformStatus = supportedPlatforms.map(platform => {
      if (platform.id === 'meta') {
        const fb = connectionMap.get('facebook');
        const ig = connectionMap.get('instagram');
        const isConnected = !!(fb || ig);

        // Sum followers from BOTH Facebook and Instagram
        const fbFollowers = fb?.followerCount || 0;
        const igFollowers = ig?.followerCount || 0;
        const followers = fbFollowers + igFollowers;

        const fbMeta = fb?.metadata as any;
        const igMeta = ig?.metadata as any;

        // Average engagement across both (only include platforms with real data)
        const rates = [fbMeta?.engagementRate, igMeta?.engagementRate].filter(r => typeof r === 'number' && r > 0);
        const engagement = rates.length > 0
          ? Math.round((rates.reduce((a: number, b: number) => a + b, 0) / rates.length) * 100) / 100
          : 0;

        // Most recent sync across FB + IG
        const fbSync = fbMeta?.lastSyncedAt ? new Date(fbMeta.lastSyncedAt).getTime() : 0;
        const igSync = igMeta?.lastSyncedAt ? new Date(igMeta.lastSyncedAt).getTime() : 0;
        const lastSync = new Date(Math.max(fbSync, igSync) || Date.now()).toISOString();

        // Primary conn for username/profileUrl — prefer IG, fall back to FB
        const primaryConn = ig || fb;
        const secondaryConn = ig ? fb : undefined;

        return {
          id: 'meta',
          name: platform.name,
          isConnected,
          followers,
          engagement,
          lastSync,
          status: isConnected ? 'active' : 'inactive',
          username: primaryConn?.username || undefined,
          profileUrl: primaryConn?.profileUrl || '',
          platformUserId: primaryConn?.platformUserId || '',
          // Expose per-platform breakdown in metadata for UI tooltip/detail
          metadata: {
            ...(primaryConn?.metadata || {}),
            facebook: {
              followers: fbFollowers,
              username: fb?.username || null,
              profileUrl: fb?.profileUrl || null,
              engagementRate: fbMeta?.engagementRate || 0,
            },
            instagram: {
              followers: igFollowers,
              username: ig?.username || null,
              profileUrl: ig?.profileUrl || null,
              engagementRate: igMeta?.engagementRate || 0,
            },
          },
          // Extra field used by the connected accounts detail view
          secondaryUsername: secondaryConn?.username || undefined,
        };
      }
      const conn = connectionMap.get(platform.id);
      const connMeta = conn?.metadata as any;
      const engagement = typeof connMeta?.engagementRate === 'number' ? connMeta.engagementRate : 0;
      const needsReconnect = !!connMeta?.needsReconnect;
      return {
        id: platform.id,
        name: platform.name,
        isConnected: !!conn,
        followers: conn?.followerCount || 0,
        engagement,
        lastSync: connMeta?.lastSyncedAt || conn?.createdAt?.toISOString() || '',
        status: conn ? (needsReconnect ? 'needs_reconnect' : 'active') : 'inactive',
        needsReconnect,
        tokenRefreshFailedAt: connMeta?.tokenRefreshFailedAt || null,
        username: conn?.username || undefined,
        profileUrl: conn?.profileUrl || '',
        platformUserId: conn?.platformUserId || '',
        metadata: conn?.metadata || {},
      };
    });
    
    res.json(platformStatus);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get platform status:');
    res.status(500).json({ error: 'Failed to get platform status:' });
  }
});

router.post('/sync-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);

    const activePlatforms = new Set<string>();
    for (const conn of connections) {
      if (conn.isActive) {
        if (conn.platform === 'facebook' || conn.platform === 'instagram') {
          activePlatforms.add('meta');
        } else {
          activePlatforms.add(conn.platform);
        }
      }
    }

    const allResults: Record<string, any> = {};
    for (const p of activePlatforms) {
      try {
        const result = await syncPlatformData(userId, p);
        Object.assign(allResults, result);
      } catch (err) {
        logger.warn({ err: err }, `sync-all: failed to sync ${p}:`);
        allResults[p] = { error: 'Sync failed' };
      }
    }

    res.json({ success: true, results: allResults });

    setImmediate(async () => {
      try {
        const followerMilestones = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
        for (const conn of connections) {
          if (!conn.isActive || !conn.followerCount) continue;
          const followers = conn.followerCount as number;
          if (followerMilestones.includes(followers)) {
            const platformName = conn.platform.charAt(0).toUpperCase() + conn.platform.slice(1);
            await notificationService.sendFollowerMilestoneNotification(userId, platformName, followers);
          }
        }
      } catch (err) {
        logger.warn({ err: err }, 'Follower milestone notification error:');
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to sync all platforms:');
    res.status(500).json({ error: 'Failed to sync all platforms' });
  }
});

// =========================================
// SOCIAL LISTENING ROUTES
// =========================================

// Get social listening keywords - returns empty array when no real data exists
router.get('/listening/keywords', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const keywords = await storage.getSocialListeningKeywords?.(userId) || [];
    res.json(keywords);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening keywords:');
    res.status(500).json({ error: 'Failed to get social listening keywords:' });
  }
});

router.get('/hashtags/trending', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);

    const ai = await getUnifiedAI();
    const mcResult = await ai.generateContent({
      topic: 'trending music hashtags for social media marketing',
      platform: 'instagram',
      tone: 'energetic',
      genre: (user as any)?.genre || 'music',
      artist_name: (user as any)?.artistName || '',
      includeHashtags: true,
      extraContext: 'Return a diverse list of trending music hashtags across categories: general music, production, hip-hop, R&B, promotion, indie. Include high-reach and niche tags.',
    });

    const rawTags: string[] = mcResult?.hashtags ?? [];

    function hashVolume(tag: string, base: number): number {
      let h = 2166136261;
      for (let i = 0; i < tag.length; i++) {
        h ^= tag.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return base + (h % base);
    }

    const categoryMap: Record<string, string> = {
      production: 'production', producer: 'production', beatmaker: 'production',
      studiolife: 'production', beats: 'production', beatmaking: 'production',
      hiphop: 'hiphop', rap: 'hiphop', rapper: 'hiphop', trap: 'hiphop',
      freestyle: 'hiphop', bars: 'hiphop',
      rnb: 'rnb', soul: 'rnb',
      indie: 'indie', indieartist: 'indie',
      linkinbio: 'promotion', streaming: 'promotion', spotify: 'promotion',
      newrelease: 'promotion', musicvideo: 'promotion',
    };

    function guessCategory(tag: string): string {
      const t = tag.replace(/^#/, '').toLowerCase();
      for (const [key, cat] of Object.entries(categoryMap)) {
        if (t.includes(key)) return cat;
      }
      return 'general';
    }

    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const hourOfDay = new Date().getUTCHours();

    const trending = rawTags.map((tag, i) => {
      const base = hashVolume(tag, 15000);
      const timeFactor = Math.sin((dayOfYear + i) * 0.3 + hourOfDay * 0.1) * 0.15;
      const volume = Math.round(base * (1 + timeFactor));
      return {
        hashtag: tag.startsWith('#') ? tag : `#${tag}`,
        posts: volume,
        trend: timeFactor > 0.05 ? 'up' : timeFactor < -0.05 ? 'down' : 'stable' as string,
        category: guessCategory(tag),
      };
    });

    trending.sort((a, b) => b.posts - a.posts);
    res.json(trending.slice(0, 12));
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get trending hashtags:');
    res.status(500).json({ error: 'Failed to get trending hashtags' });
  }
});

// Get social listening trending - returns empty array when no real data exists
router.get('/listening/trending', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const trending = await storage.getSocialListeningTrending?.(userId) || [];
    res.json(trending);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening trending:');
    res.status(500).json({ error: 'Failed to get social listening trending:' });
  }
});

// Get social listening influencers - returns empty array when no real data exists
router.get('/listening/influencers', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const influencers = await storage.getSocialListeningInfluencers?.(userId) || [];
    res.json(influencers);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening influencers:');
    res.status(500).json({ error: 'Failed to get social listening influencers:' });
  }
});

// Get social listening alerts - returns empty array when no real data exists
router.get('/listening/alerts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const alerts = await storage.getSocialListeningAlerts?.(userId) || [];
    res.json(alerts);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening alerts:');
    res.status(500).json({ error: 'Failed to get social listening alerts:' });
  }
});

// =========================================
// COMPETITOR BENCHMARKING ROUTES
// =========================================

// Get competitors - returns competitors from database
router.get('/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const competitors = await (await getCompetitorBenchmark()).getCompetitors(userId);
    res.json(competitors);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get competitors:');
    res.status(500).json({ error: 'Failed to get competitors:' });
  }
});

// Add competitor
router.post('/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, handle, platforms } = req.body;

    if (!name || !handle) {
      return res.status(400).json({ error: 'Name and handle are required' });
    }

    const result = await (await getCompetitorBenchmark()).addCompetitor(userId, { name, handle, platforms });
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json(result.competitor);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to add competitor:');
    res.status(500).json({ error: 'Failed to add competitor' });
  }
});

// Remove competitor
router.delete('/competitors/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await (await getCompetitorBenchmark()).removeCompetitor(userId, id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to remove competitor:');
    res.status(500).json({ error: 'Failed to remove competitor' });
  }
});

// Get your social stats - returns null when no real data exists
router.get('/your-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getUserSocialStats?.(userId) || null;
    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get your social stats:');
    res.json(null);
  }
});

// Get benchmark competitors - returns comprehensive benchmark data
router.get('/benchmark/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const competitors = await (await getCompetitorBenchmark()).getCompetitors(userId);
    const yourBrand = await (await getCompetitorBenchmark()).getYourStats(userId);
    const comparison = await (await getCompetitorBenchmark()).getBenchmarkComparison(userId);
    res.json({ competitors, yourBrand, comparison });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get benchmark competitors:');
    res.json({ competitors: [], yourBrand: null, comparison: [] });
  }
});

// Get benchmark insights - returns competitive insights
router.get('/benchmark/insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await (await getCompetitorBenchmark()).getInsights(userId);
    res.json(insights);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get benchmark insights:');
    res.status(500).json({ error: 'Failed to get benchmark insights:' });
  }
});

// Get share of voice
router.get('/benchmark/share-of-voice', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const shareOfVoice = await (await getCompetitorBenchmark()).getShareOfVoice(userId);
    res.json(shareOfVoice);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get share of voice:');
    res.status(500).json({ error: 'Failed to get share of voice' });
  }
});

// =========================================
// UNIFIED INBOX ROUTES - Returns empty data until real messages exist
// =========================================

// Get inbox messages - returns messages from database with filtering
router.get('/inbox', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, status, priority, sentiment, limit = '50', offset = '0' } = req.query;

    let query = db
      .select()
      .from(socialInboxMessages)
      .where(eq(socialInboxMessages.userId, userId))
      .orderBy(desc(socialInboxMessages.createdAt))
      .limit(Math.max(1, Math.min(200, Number(limit) || 50)))
      .offset(Math.max(0, Number(offset) || 0));

    const messages = await query;
    
    const filteredMessages = messages.filter(m => {
      if (platform && platform !== 'all' && m.platform !== platform) return false;
      if (status && status !== 'all' && m.status !== status) return false;
      if (priority && priority !== 'all' && m.priority !== priority) return false;
      if (sentiment && sentiment !== 'all' && m.sentiment !== sentiment) return false;
      return true;
    });

    res.json({ 
      messages: filteredMessages.map(m => ({
        id: m.id,
        platform: m.platform,
        type: m.messageType,
        content: m.content,
        author: {
          id: m.authorId,
          name: m.authorName,
          username: m.authorHandle,
          avatar: m.authorAvatar,
          followers: m.authorFollowers,
          verified: m.authorVerified,
        },
        postContent: m.postContent,
        postUrl: m.postUrl,
        sentiment: m.sentiment,
        priority: m.priority,
        status: m.status,
        assignedTo: m.assignedTo,
        tags: m.tags || [],
        threadId: m.threadId,
        createdAt: m.createdAt,
        readAt: m.readAt,
        repliedAt: m.repliedAt,
      })), 
      total: filteredMessages.length 
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get inbox messages:');
    res.json({ messages: [], total: 0 });
  }
});

// Get inbox stats - returns stats from database
router.get('/inbox/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const messages = await db
      .select()
      .from(socialInboxMessages)
      .where(eq(socialInboxMessages.userId, userId))
      .limit(200);

    const stats = {
      total: messages.length,
      unread: messages.filter(m => m.status === 'unread').length,
      highPriority: messages.filter(m => m.priority === 'high' && m.status === 'unread').length,
      negative: messages.filter(m => m.sentiment === 'negative' && m.status === 'unread').length,
      byPlatform: {
        twitter: messages.filter(m => m.platform === 'twitter').length,
        instagram: messages.filter(m => m.platform === 'instagram').length,
        facebook: messages.filter(m => m.platform === 'facebook').length,
        tiktok: messages.filter(m => m.platform === 'tiktok').length,
        youtube: messages.filter(m => m.platform === 'youtube').length,
        linkedin: messages.filter(m => m.platform === 'linkedin').length,
      },
    };
    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get inbox stats:');
    res.json({ total: 0, unread: 0, highPriority: 0, negative: 0, byPlatform: {} });
  }
});

// Mark message as read
router.post('/inbox/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await db
      .update(socialInboxMessages)
      .set({ 
        status: 'read',
        readAt: new Date(),
      })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to mark message as read:');
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Mark multiple messages as read
router.post('/inbox/bulk/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds)) {
      return res.status(400).json({ error: 'messageIds must be an array' });
    }

    for (const id of messageIds) {
      await db
        .update(socialInboxMessages)
        .set({ 
          status: 'read',
          readAt: new Date(),
        })
        .where(
          and(
            eq(socialInboxMessages.id, id),
            eq(socialInboxMessages.userId, userId)
          )
        );
    }

    res.json({ success: true, updated: messageIds.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to mark messages as read:');
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Reply to message
router.post('/inbox/:id/reply', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ 
        error: 'Reply content is required',
        outcome: {
          status: 'error',
          category: 'inbox',
          title: 'Reply Failed',
          message: 'Please enter a reply message.',
        }
      });
    }

    const [message] = await db
      .select()
      .from(socialInboxMessages)
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      )
      .limit(1);

    if (!message) {
      return res.status(404).json({ 
        error: 'Message not found',
        outcome: {
          status: 'error',
          category: 'inbox',
          title: 'Message Not Found',
          message: 'The message you are trying to reply to was not found.',
        }
      });
    }

    await db
      .update(socialInboxMessages)
      .set({ 
        status: 'replied',
        repliedAt: new Date(),
      })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ 
      success: true,
      outcome: {
        status: 'success',
        category: 'inbox',
        title: 'Reply Sent',
        message: `Your reply to @${message.authorHandle} on ${message.platform} has been sent.`,
        platform: message.platform,
        author: message.authorHandle,
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reply to message:');
    res.status(500).json({ 
      error: 'Failed to reply to message',
      outcome: {
        status: 'error',
        category: 'inbox',
        title: 'Reply Failed',
        message: 'Failed to send your reply. Please try again.',
        retryable: true,
      }
    });
  }
});

// Assign message to team member
router.post('/inbox/:id/assign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { assigneeId, assigneeName } = req.body;

    await db
      .update(socialInboxMessages)
      .set({ assignedTo: assigneeId })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ 
      success: true,
      outcome: {
        status: 'success',
        category: 'inbox',
        title: 'Message Assigned',
        message: `Message has been assigned to ${assigneeName || 'team member'}.`,
        assigneeName: assigneeName || 'Team Member',
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to assign message:');
    res.status(500).json({ 
      error: 'Failed to assign message',
      outcome: {
        status: 'error',
        category: 'inbox',
        title: 'Assignment Failed',
        message: 'Failed to assign the message. Please try again.',
        retryable: true,
      }
    });
  }
});

// Archive message
router.post('/inbox/:id/archive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await db
      .update(socialInboxMessages)
      .set({ status: 'archived' })
      .where(
        and(
          eq(socialInboxMessages.id, id),
          eq(socialInboxMessages.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to archive message:');
    res.status(500).json({ error: 'Failed to archive message' });
  }
});

// Get reply templates - returns empty array when no templates exist
router.get('/inbox/templates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.status(500).json({ error: 'Internal server error' });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get reply templates:');
    res.status(500).json({ error: 'Failed to get reply templates:' });
  }
});

// Get team members for assignment - returns empty array when no team exists
router.get('/inbox/team', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.status(500).json({ error: 'Internal server error' });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get team members:');
    res.status(500).json({ error: 'Failed to get team members:' });
  }
});

// Connections endpoint - returns OAuth connections
router.get('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);
    
    res.json(connections.filter(c => c.isActive).map(c => ({
      platform: c.platform,
      username: c.username,
      connected: c.isActive,
      connectedAt: c.createdAt,
      followers: c.followerCount || 0,
      profileUrl: c.profileUrl || '',
      platformUserId: c.platformUserId || '',
      metadata: c.metadata || {},
    })));
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get connections:');
    res.status(500).json({ error: 'Failed to get connections:' });
  }
});

// ===========================
// UNIFIED CALENDAR ENDPOINTS
// ===========================

router.get('/unified-calendar/posts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    // Scheduled social posts
    const scheduledPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          inArray(posts.status, ['scheduled', 'published', 'failed']),
        )
      )
      .orderBy(desc(posts.scheduledAt))
      .limit(200);

    // Content calendar entries
    const calendarEntries = await db
      .select()
      .from(contentCalendar)
      .where(eq(contentCalendar.userId, userId))
      .orderBy(desc(contentCalendar.scheduledAt))
      .limit(200);

    // Merge and normalise both sources
    const allPosts = [
      ...scheduledPosts.map(p => ({
        id: p.id,
        title: p.content?.slice(0, 80) ?? '(no caption)',
        platform: p.platform,
        status: p.status,
        scheduledAt: p.scheduledAt,
        publishedAt: p.publishedAt,
        content: p.content,
        mediaUrls: p.mediaUrls ?? [],
        source: 'posts' as const,
      })),
      ...calendarEntries.map(c => ({
        id: c.id,
        title: c.title,
        platform: c.platform,
        status: c.status,
        scheduledAt: c.scheduledAt,
        publishedAt: c.publishedAt,
        content: (c.content as any)?.body ?? null,
        mediaUrls: c.mediaUrls ?? [],
        source: 'calendar' as const,
      })),
    ];

    return res.json({ posts: allPosts, total: allPosts.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get unified calendar posts:');
    return res.json({ posts: [], total: 0 });
  }
});

router.get('/unified-calendar/campaigns', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const userCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.createdAt))
      .limit(100);

    return res.json({ campaigns: userCampaigns, total: userCampaigns.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get unified calendar campaigns:');
    return res.json({ campaigns: [], total: 0 });
  }
});

// Static music-industry calendar dates — updated for the current year.
// These mark high-impact windows when artists should schedule releases/campaigns.
const MUSIC_INDUSTRY_HOLIDAYS = (() => {
  const y = new Date().getFullYear();
  return [
    { id: 'new-release-friday',   name: 'New Release Friday',             date: 'every-friday',     type: 'recurring', description: 'Global release day — highest streaming activity of the week.' },
    { id: 'grammys',              name: 'Grammy Awards',                  date: `${y}-02-04`,       type: 'awards',    description: 'Release or promote during awards season for maximum press.' },
    { id: 'valentines',          name: "Valentine's Day",                date: `${y}-02-14`,       type: 'seasonal',  description: 'Strong window for love-themed content and playlists.' },
    { id: 'international-music', name: 'International Music Day',        date: `${y}-06-21`,       type: 'cultural',  description: 'Global music celebration — ideal for awareness campaigns.' },
    { id: 'hip-hop-day',         name: 'Hip-Hop Appreciation Week',      date: `${y}-11-12`,       type: 'cultural',  description: 'Celebrate and amplify hip-hop culture.' },
    { id: 'black-friday',        name: 'Black Friday',                   date: `${y}-11-28`,       type: 'commerce',  description: 'Top window for merch drops, beat bundles, and license deals.' },
    { id: 'cyber-monday',        name: 'Cyber Monday',                   date: `${y}-12-01`,       type: 'commerce',  description: 'Second peak shopping day — great for digital product offers.' },
    { id: 'year-end',            name: 'Year-End Wrap',                  date: `${y}-12-20`,       type: 'seasonal',  description: 'Spotify / Apple Music wrap-up coverage starts — push streaming.' },
    { id: 'new-year-drop',       name: "New Year's Drop",                date: `${y + 1}-01-01`,   type: 'seasonal',  description: 'High-impact date for resolutions content and fresh releases.' },
  ];
})();

router.get('/unified-calendar/holidays', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ holidays: MUSIC_INDUSTRY_HOLIDAYS, total: MUSIC_INDUSTRY_HOLIDAYS.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get unified calendar holidays:');
    return res.json({ holidays: [], total: 0 });
  }
});

router.get('/unified-calendar/queue', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Posts that are scheduled but not yet published (the publishing queue)
    const queuedPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          inArray(posts.status, ['queued', 'pending', 'scheduled']),
          isNull(posts.publishedAt),
        )
      )
      .orderBy(posts.scheduledAt)
      .limit(100);

    return res.json({ queue: queuedPosts, total: queuedPosts.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get unified calendar queue:');
    return res.json({ queue: [], total: 0 });
  }
});

// =========================================
// AI CONTENT GENERATION
// =========================================

// Generate AI content for multiple platforms
router.post('/generate-content', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platforms = ['instagram'], contentType = 'post', topic = 'new music', tone = 'energetic' } = req.body;

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional'];
    const contentTypeMap: Record<string, string> = {
      'post': 'engagement',
      'announcement': 'announcement',
      'behind-the-scenes': 'behind-the-scenes',
      'promotional': 'promotional',
      'release': 'release',
      'story': 'engagement',
      'reel': 'behind-the-scenes',
      'carousel': 'engagement',
      'thread': 'engagement',
      'poll': 'engagement',
      'live-announcement': 'announcement',
      'short': 'behind-the-scenes',
      'pin': 'promotional',
      'newsletter': 'announcement',
      'collab-post': 'engagement',
      'remix': 'engagement',
      'duet': 'engagement',
      'challenge': 'engagement',
      'giveaway': 'promotional',
      'ama': 'engagement',
      'tutorial': 'engagement',
      'review': 'engagement',
      'testimonial': 'promotional',
      'milestone': 'announcement',
      'throwback': 'engagement',
      'teaser': 'promotional',
      'countdown': 'announcement',
      'fan-spotlight': 'engagement',
      'meme': 'engagement',
      'infographic': 'engagement',
      'quote': 'engagement',
    };

    const generatedContent = [];
    const failedPlatforms = [];

    // MaxCore AI is the only source — all platforms in parallel
    const mcResults = await Promise.allSettled(
      platforms
        .filter((p: string) => validPlatforms.includes(p))
        .map(async (platform: string) => {
          const ai = await getUnifiedAI();
          const result = await ai.generateContent({
            tone:            validTones.includes(tone) ? tone : 'energetic',
            platform,
            topic:           topic || 'music',
            contentType:     contentTypeMap[contentType] || 'engagement',
            userId:          (req as any).user?.id,
            includeHashtags: true,
            includeEmojis:   true,
          });
          return { platform, result };
        })
    );

    for (const settled of mcResults) {
      if (settled.status !== 'fulfilled') {
        failedPlatforms.push({ platform: 'unknown', error: 'Generation failed' });
        continue;
      }
      const { platform, result } = settled.value;
      if (result.success && result.data) {
        generatedContent.push({
          platform,
          caption:             result.data.caption,
          content:             result.data.caption,
          hashtags:            result.data.hashtags,
          hook:                result.data.hook,
          body:                result.data.body,
          cta:                 result.data.cta,
          emojis:              result.data.emojis,
          characterCount:      result.data.charCount,
          estimatedEngagement: result.data.estimatedEngagement,
          optimalPostTime:     getOptimalPostTime(platform),
          source:              'MaxCoreAI',
        });
      } else {
        failedPlatforms.push({ platform, error: 'Generation failed' });
      }
    }

    const hasVariations = generatedContent.length > 1;
    const hasHashtags = generatedContent.some(c => c.hashtags && c.hashtags.length > 0);
    const optimalTime = generatedContent[0]?.optimalPostTime || null;

    res.json({
      success: generatedContent.length > 0,
      generatedContent,
      platforms,
      contentType,
      failedPlatforms,
      outcome: {
        status: generatedContent.length > 0 
          ? (failedPlatforms.length > 0 ? 'partial' : 'success') 
          : 'error',
        category: 'content',
        title: generatedContent.length > 0 ? 'Content Generated' : 'Generation Failed',
        message: generatedContent.length > 0
          ? `Generated ${generatedContent.length} content variation${generatedContent.length > 1 ? 's' : ''}.${hasHashtags ? ' Hashtag suggestions included.' : ''}${optimalTime ? ` Best posting time: ${optimalTime}.` : ''}`
          : 'Failed to generate content. Please try again.',
        variationsCount: generatedContent.length,
        hasHashtags,
        optimalTime,
        fallbackAvailable: failedPlatforms.length > 0,
      },
    });

    if (generatedContent.length > 0 && req.user?.id) {
      setImmediate(async () => {
        try {
          const firstPiece = generatedContent[0];
          const platformLabel = firstPiece.platform.charAt(0).toUpperCase() + firstPiece.platform.slice(1);
          const snippet = (firstPiece.caption || firstPiece.content || '').slice(0, 100);
          await notificationService.sendSocialContentGeneratedNotification(req.user!.id, platformLabel, snippet);
        } catch (err) {
          logger.warn({ err: err }, '[SocialMedia] content generated notification error:');
        }
      });
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate social content:');
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate content',
      outcome: {
        status: 'error',
        category: 'content',
        title: 'Generation Failed',
        message: 'AI content generation service is temporarily unavailable. Please try again or use a template.',
        retryable: true,
        fallbackAvailable: true,
      }
    });
  }
});

function getOptimalPostTime(platform: string): string {
  const optimalTimes: Record<string, string> = {
    instagram: 'Today at 11:00 AM',
    twitter: 'Today at 9:00 AM',
    facebook: 'Today at 1:00 PM',
    linkedin: 'Today at 8:00 AM',
    tiktok: 'Today at 7:00 PM',
    youtube: 'Today at 3:00 PM',
  };
  return optimalTimes[platform] || 'Today at 12:00 PM';
}

// Helper function to fetch and extract metadata from any URL
async function extractUrlMetadata(url: string): Promise<{
  title: string;
  description: string;
  type: string;
  contentType: string;
}> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MaxBooster/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await response.text();
    
    // Extract Open Graph and meta tags
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogTypeMatch = html.match(/<meta[^>]*property=["']og:type["'][^>]*content=["']([^"']+)["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    
    const title = ogTitleMatch?.[1] || titleMatch?.[1] || '';
    const description = ogDescMatch?.[1] || descMatch?.[1] || '';
    const ogType = ogTypeMatch?.[1] || '';
    
    // Determine content type based on URL patterns and og:type
    let type = 'website';
    let contentType = 'promotional';
    
    const urlLower = url.toLowerCase();
    
    // Playlists
    if (urlLower.includes('playlist') || urlLower.includes('/playlists/') ||
        urlLower.includes('open.spotify.com/playlist')) {
      type = 'playlist';
      contentType = 'engagement';
    }
    // Podcasts
    else if (urlLower.includes('podcasts.apple.com') || urlLower.includes('anchor.fm') || 
             urlLower.includes('spotify.com/show') || urlLower.includes('spotify.com/episode') ||
             urlLower.includes('podbean') || urlLower.includes('buzzsprout') ||
             urlLower.includes('transistor.fm') || urlLower.includes('overcast.fm') ||
             urlLower.includes('castbox') || urlLower.includes('pocketcasts')) {
      type = 'podcast';
      contentType = 'announcement';
    }
    // Livestreams
    else if (urlLower.includes('twitch.tv') || urlLower.includes('kick.com') ||
             urlLower.includes('live.') || urlLower.includes('/live') ||
             urlLower.includes('livestream')) {
      type = 'livestream';
      contentType = 'announcement';
    }
    // Music platforms
    else if (urlLower.includes('spotify') || urlLower.includes('apple.com/music') || 
        urlLower.includes('soundcloud') || urlLower.includes('tidal') ||
        urlLower.includes('deezer') || urlLower.includes('bandcamp')) {
      type = 'music';
      contentType = 'release';
    }
    // Video platforms
    else if (urlLower.includes('youtube') || urlLower.includes('youtu.be') || 
             urlLower.includes('vimeo') || urlLower.includes('tiktok')) {
      type = 'video';
      contentType = 'release';
    }
    // Crowdfunding
    else if (urlLower.includes('kickstarter') || urlLower.includes('indiegogo') ||
             urlLower.includes('gofundme') || urlLower.includes('patreon') ||
             urlLower.includes('buymeacoffee') || urlLower.includes('ko-fi')) {
      type = 'crowdfunding';
      contentType = 'promotional';
    }
    // Merch / physical products
    else if (urlLower.includes('merch') || urlLower.includes('merchbar') ||
             urlLower.includes('bonfire.com') || urlLower.includes('printful') ||
             urlLower.includes('teespring') || urlLower.includes('redbubble')) {
      type = 'merch';
      contentType = 'promotional';
    }
    // Press / Media features
    else if (urlLower.includes('press') || urlLower.includes('pitchfork') ||
             urlLower.includes('billboard') || urlLower.includes('rollingstone') ||
             urlLower.includes('complex.com') || urlLower.includes('hypebeast') ||
             urlLower.includes('hotnewhiphop') || urlLower.includes('interview')) {
      type = 'press';
      contentType = 'announcement';
    }
    // NFTs / Web3
    else if (urlLower.includes('opensea') || urlLower.includes('rarible') ||
             urlLower.includes('foundation.app') || urlLower.includes('nft') ||
             urlLower.includes('mint') || urlLower.includes('zora.co')) {
      type = 'nft';
      contentType = 'promotional';
    }
    // Portfolios / personal websites
    else if (urlLower.includes('linktr.ee') || urlLower.includes('bio.link') ||
             urlLower.includes('carrd.co') || urlLower.includes('about.me') ||
             urlLower.includes('portfolio') || urlLower.includes('linkin.bio')) {
      type = 'portfolio';
      contentType = 'engagement';
    }
    // Collaboration / features
    else if (urlLower.includes('feat') || urlLower.includes('collab') ||
             urlLower.includes('splice.com')) {
      type = 'collaboration';
      contentType = 'announcement';
    }
    // Education / tutorials
    else if (urlLower.includes('udemy') || urlLower.includes('skillshare') ||
             urlLower.includes('masterclass') || urlLower.includes('coursera') ||
             urlLower.includes('tutorial') || urlLower.includes('lesson')) {
      type = 'education';
      contentType = 'engagement';
    }
    // News/articles
    else if (ogType.includes('article') || urlLower.includes('/blog') || 
             urlLower.includes('/news') || urlLower.includes('/article')) {
      type = 'article';
      contentType = 'announcement';
    }
    // E-commerce/products
    else if (ogType.includes('product') || urlLower.includes('/product') || 
             urlLower.includes('/shop') || urlLower.includes('/store')) {
      type = 'product';
      contentType = 'promotional';
    }
    // Events
    else if (urlLower.includes('event') || urlLower.includes('ticket') || 
             urlLower.includes('concert') || urlLower.includes('tour')) {
      type = 'event';
      contentType = 'announcement';
    }
    // Social profiles
    else if (urlLower.includes('instagram.com') || urlLower.includes('twitter.com') ||
             urlLower.includes('facebook.com') || urlLower.includes('linkedin.com')) {
      type = 'social';
      contentType = 'engagement';
    }
    
    return {
      title: title.trim().substring(0, 200),
      description: description.trim().substring(0, 500),
      type,
      contentType,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to fetch URL metadata:');
    return {
      title: '',
      description: '',
      type: 'website',
      contentType: 'promotional',
    };
  }
}

// Generate content from any URL (websites, music, videos, articles, products, etc.)
router.post('/generate-from-url', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, platforms = ['instagram'], tone = 'energetic', format = 'text', targetAudience = '' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Use the rich Python URL analyzer for full metadata extraction.
    // If the analyzer fails (network error, SSL issue, bot-block) we fall back
    // to a minimal stub so MaxCore can still generate relevant content from the URL.
    let analysis: import('../services/mediaAnalyzerService.js').UrlAnalysis;
    try {
      analysis = await analyzeUrl(url.trim());
    } catch (analyzeErr: any) {
      logger.warn('[generate-from-url] URL analysis failed — using URL-derived stub:', analyzeErr?.message);
      const parsedUrl = (() => { try { return new URL(url.trim()); } catch { return null; } })();
      const domain = parsedUrl?.hostname.replace(/^www\./, '') || url;
      const pathWords = (parsedUrl?.pathname || '').replace(/[-_/]/g, ' ').trim();
      analysis = {
        url, domain,
        platform: 'web', platform_category: 'web', is_music: false,
        title: pathWords || domain,
        description: '',
        author: '', published: '', modified: '',
        og_image: '', thumbnail_url: '', canonical: '', language: '',
        content_type: 'website', content_category: 'general',
        genre: 'default', tone: 'default',
        artist: '', track: '', album: '', duration: '',
        release_date: '', label: '', isrc: '', bpm: '',
        keywords: [], tags: [], headings: [],
        body_preview: '', summary: domain,
        view_count: null, like_count: null, comment_count: null,
        play_count: null, share_count: null, subscriber_count: null,
        embed_url: '', reading_time_minutes: null, word_count: null,
        section: '', event_date: '', event_end_date: '',
        event_location: '', performers: [], organizer: '',
        price: '', currency: '', brand: '', rating: '', review_count: null,
        final_url: url, youtube_id: '', spotify_type: '', spotify_id: '',
        apple_music_type: '', apple_music_id: '',
        data_sources: ['url_fallback'],
        error: analyzeErr?.message,
      } as any;
    }
    const seed = urlToContentSeed(analysis);

    // Build a clean, structured topic for the AI model — no pollution from targetAudience or format
    let topic: string;
    if (seed.track && seed.artist) {
      topic = `"${seed.track}" by ${seed.artist}`;
      if (seed.genre && seed.genre !== 'default') topic += ` — ${seed.genre}`;
    } else if (seed.track) {
      topic = `"${seed.track}"`;
    } else if (seed.artist) {
      topic = `New music by ${seed.artist}`;
    } else if (analysis.title) {
      // Use the page title, cleaned up
      topic = analysis.title.replace(/\s*[-|–]\s*\S+$/, '').trim().slice(0, 80);
    } else {
      topic = seed.topic.slice(0, 80);
    }

    // Derive the content_type for better CTA selection
    const contentType = seed.content_type || seed.platform_category || 'general';

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional'];
    const generatedContent: any[] = [];

    // Combine keywords + tags from URL analysis into a deduplicated keyword list
    const allKeywords = [...new Set([
      ...(seed.keywords || []),
      ...(seed.tags     || []),
    ])].slice(0, 20);

    // Build rich extra_context from headings, event/product data, and content signals
    const extraParts: string[] = [];
    if (seed.headings?.length)       extraParts.push(seed.headings.slice(0, 3).join(' • '));
    if (seed.event_date)             extraParts.push(`Event: ${seed.event_date}${seed.event_location ? ' @ ' + seed.event_location : ''}`);
    if (seed.performers?.length)     extraParts.push(`Performers: ${seed.performers.slice(0, 3).join(', ')}`);
    if (seed.price)                  extraParts.push(`Price: ${seed.currency || ''}${seed.price}`);
    if (seed.view_count)             extraParts.push(`${seed.view_count.toLocaleString()} views`);
    if (seed.like_count)             extraParts.push(`${seed.like_count.toLocaleString()} likes`);
    if (seed.play_count)             extraParts.push(`${seed.play_count.toLocaleString()} plays`);
    if (seed.subscriber_count)       extraParts.push(`${seed.subscriber_count.toLocaleString()} subscribers`);
    if (targetAudience)              extraParts.push(`Target: ${targetAudience}`);

    // MaxCore AI is the only source — generate for all platforms in parallel
    const platformResults = await Promise.allSettled(
      platforms
        .filter((p: string) => validPlatforms.includes(p))
        .map(async (platform: string) => {
          const ai = await getUnifiedAI();
          const result = await ai.generateContent({
            tone:            validTones.includes(tone) ? tone : 'energetic',
            platform,
            topic:           topic.substring(0, 120),
            genre:           seed.genre || 'hip-hop',
            artistName:      seed.artist || '',
            trackTitle:      seed.track  || '',
            album:           seed.album  || undefined,
            releaseDate:     seed.release_date || undefined,
            label:           seed.label  || undefined,
            keywords:        allKeywords.length ? allKeywords : undefined,
            mood:            seed.tone !== 'default' ? seed.tone : undefined,
            description:     analysis.description?.slice(0, 200) || undefined,
            bodyPreview:     seed.body_preview?.slice(0, 300) || undefined,
            extraContext:    extraParts.length ? extraParts.join(' | ') : undefined,
            userId:          (req as any).user?.id,
            includeHashtags: true,
            includeEmojis:   true,
          });
          return { platform, result };
        })
    );

    for (const settled of platformResults) {
      if (settled.status !== 'fulfilled') continue;
      const { platform, result } = settled.value;
      if (!result.success || !result.data) continue;

      const captionText = result.data.caption + `\n\n🔗 ${url}`;
      const rawCaption  = result.data.caption || '';
      const captionParts = rawCaption.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
      const derivedHook = result.data.hook || captionParts[0] || rawCaption.split('\n')[0] || '';
      const derivedBody = result.data.body || captionParts[1] || '';
      const derivedCta  = result.data.cta  || captionParts[2] || '';
      // Video overlays need short, punchy text (no hashtags, no URLs)
      const stripMeta = (s: string) => s.replace(/#\w+/g, '').replace(/https?:\/\/\S+/g, '').replace(/🔗.*$/g, '').trim();
      const videoHook = stripMeta(derivedHook).slice(0, 80);
      const videoBody = stripMeta(derivedBody).slice(0, 100);
      const videoCta  = stripMeta(derivedCta).slice(0, 50) || 'Join Max Booster';
      generatedContent.push({
        platform,
        caption:        captionText,
        content:        captionText,
        hashtags:       result.data.hashtags,
        hook:           derivedHook,
        body:           derivedBody,
        cta:            derivedCta,
        video_hook:     videoHook,
        video_body:     videoBody,
        video_cta:      videoCta,
        artist_name:    seed.artist || '',
        genre:          seed.genre  || 'hip-hop',
        thumbnail_url:  seed.og_image || seed.thumbnail_url || '',
        sourceUrl:      url,
        extractedTitle: analysis.title,
        contentType,
        format,
        targetAudience: targetAudience || undefined,
        source:         'MaxCoreAI',
      });
    }

    if (generatedContent.length === 0) {
      // Should never reach here — but keep a last-resort loop as safety net
      for (const platform of platforms) {
        if (!validPlatforms.includes(platform)) continue;

        const result = await (await getUnifiedAI()).generateContent({
          tone:            validTones.includes(tone) ? tone : 'energetic',
          platform,
          topic:           topic.substring(0, 120),
          genre:           seed.genre || 'hip-hop',
          artistName:      seed.artist || '',
          trackTitle:      seed.track  || '',
          userId:          (req as any).user?.id,
          includeHashtags: true,
          includeEmojis:   true,
        });

        if (result.success && result.data) {
          const captionText = result.data.caption + `\n\n🔗 ${url}`;
          const rawCaption = result.data.caption || '';
          const captionParts = rawCaption.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
          const derivedHook = result.data.hook || captionParts[0] || rawCaption.split('\n')[0] || '';
          const derivedBody = result.data.body || captionParts[1] || '';
          const derivedCta  = result.data.cta  || captionParts[2] || '';
          const stripMeta = (s: string) => s.replace(/#\w+/g, '').replace(/https?:\/\/\S+/g, '').replace(/🔗.*$/g, '').trim();
          const videoHook = stripMeta(derivedHook).slice(0, 80);
          const videoBody = stripMeta(derivedBody).slice(0, 100);
          const videoCta  = stripMeta(derivedCta).slice(0, 50) || 'Join Max Booster';
          generatedContent.push({
            platform,
            caption:        captionText,
            content:        captionText,
            hashtags:       result.data.hashtags,
            hook:           derivedHook,
            body:           derivedBody,
            cta:            derivedCta,
            video_hook:     videoHook,
            video_body:     videoBody,
            video_cta:      videoCta,
            artist_name:    seed.artist || '',
            genre:          seed.genre  || 'hip-hop',
            thumbnail_url:  seed.og_image || seed.thumbnail_url || '',
            sourceUrl:      url,
            extractedTitle: analysis.title,
            contentType,
            format,
            targetAudience: targetAudience || undefined,
            source:         'MaxCoreAI',
          });
        }
      }
    }

    res.json({
      success: true,
      generatedContent,
      url,
      platforms,
      metadata: {
        title:       analysis.title,
        description: analysis.description?.substring(0, 200),
        type:        contentType,
        artist:      seed.artist || '',
        track:       seed.track  || '',
        genre:       seed.genre  || '',
        thumbnail:   seed.og_image || seed.thumbnail_url || '',
        platform:    analysis.platform,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate content from URL:');
    res.status(500).json({ error: 'Failed to generate content from URL' });
  }
});

// GET /api/social/scheduled - Get scheduled posts
router.get('/scheduled', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const scheduledPosts = await storage.getScheduledPosts?.(userId) || [];
    res.json(scheduledPosts);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get scheduled posts:');
    res.status(500).json({ error: 'Failed to get scheduled posts:' });
  }
});

// GET /api/social/analytics - Get social analytics
router.get('/analytics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, period = '30d' } = req.query;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [accounts, periodPosts, autopilotContent, artistProfile] = await Promise.all([
      db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId)),
      db.select().from(posts).where(and(eq(posts.userId, userId), gte(posts.createdAt, periodStart))),
      db.select().from(socialAutopilotContent).where(and(
        eq(socialAutopilotContent.userId, userId),
        gte(socialAutopilotContent.createdAt, periodStart)
      )),
      db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    ]);

    // Kick off background follower-count sync for stale accounts
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    const stalePlatforms = new Set<string>();
    for (const acc of accounts) {
      if (!acc.isActive) continue;
      const lastSynced = (acc.metadata as any)?.lastSyncedAt
        ? new Date((acc.metadata as any).lastSyncedAt).getTime()
        : acc.createdAt ? new Date(acc.createdAt).getTime() : 0;
      if (now - lastSynced > ONE_HOUR_MS) {
        stalePlatforms.add(acc.platform === 'facebook' || acc.platform === 'instagram' ? 'meta' : acc.platform);
      }
    }
    for (const p of stalePlatforms) {
      syncPlatformData(userId, p).catch(err => logger.warn({ err: err }, `[Analytics] BG sync failed for ${p}:`));
    }

    // Aggregate engagement from posts
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalViews = 0;
    let totalReach = 0, totalImpressions = 0;

    const platformEngagement: Record<string, { likes: number; comments: number; shares: number; views: number; posts: number }> = {};

    for (const post of periodPosts) {
      const eng = post.engagement as any;
      if (eng) {
        const pl = (post.platform || 'unknown').toLowerCase();
        if (!platformEngagement[pl]) platformEngagement[pl] = { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
        platformEngagement[pl].likes += eng.likes || 0;
        platformEngagement[pl].comments += eng.comments || 0;
        platformEngagement[pl].shares += eng.shares || eng.retweets || 0;
        platformEngagement[pl].views += eng.views || 0;
        platformEngagement[pl].posts += 1;
        totalLikes += eng.likes || 0;
        totalComments += eng.comments || 0;
        totalShares += eng.shares || eng.retweets || 0;
        totalViews += eng.views || 0;
        totalReach += eng.reach || 0;
        totalImpressions += eng.impressions || 0;
      }
    }

    for (const content of autopilotContent) {
      const perf = content.performance as any;
      if (perf) {
        const pl = (content.platform || 'unknown').toLowerCase();
        if (!platformEngagement[pl]) platformEngagement[pl] = { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
        platformEngagement[pl].likes += perf.likes || 0;
        platformEngagement[pl].comments += perf.comments || 0;
        platformEngagement[pl].shares += perf.shares || 0;
        platformEngagement[pl].views += perf.views || 0;
        platformEngagement[pl].posts += 1;
        totalLikes += perf.likes || 0;
        totalComments += perf.comments || 0;
        totalShares += perf.shares || 0;
        totalViews += perf.views || 0;
      }
    }

    const totalEngagement = totalLikes + totalComments + totalShares;
    const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followerCount || 0), 0);
    const engagementRate = totalViews > 0 ? Math.round((totalEngagement / totalViews) * 10000) / 100 : 0;

    // Platform breakdown enriched with follower counts from connected accounts
    const platformBreakdown = accounts
      .filter(acc => acc.isActive)
      .map(acc => {
        const pl = acc.platform.toLowerCase();
        const eng = platformEngagement[pl] || { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
        return {
          platform: acc.platform,
          username: acc.username || '',
          followers: acc.followerCount || 0,
          posts: eng.posts,
          likes: eng.likes,
          comments: eng.comments,
          shares: eng.shares,
          views: eng.views,
          engagement: eng.likes + eng.comments + eng.shares,
          profileUrl: acc.profileUrl || '',
        };
      });

    // Daily metrics for the period
    const dailyMap: Record<string, { date: string; posts: number; engagement: number; views: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      dailyMap[d] = { date: d, posts: 0, engagement: 0, views: 0 };
    }
    for (const post of periodPosts) {
      const d = new Date(post.createdAt!).toISOString().split('T')[0];
      if (dailyMap[d]) {
        dailyMap[d].posts += 1;
        const eng = post.engagement as any;
        if (eng) {
          dailyMap[d].engagement += (eng.likes || 0) + (eng.comments || 0) + (eng.shares || 0);
          dailyMap[d].views += eng.views || 0;
        }
      }
    }
    for (const content of autopilotContent) {
      const d = new Date(content.createdAt!).toISOString().split('T')[0];
      if (dailyMap[d]) {
        dailyMap[d].posts += 1;
        const perf = content.performance as any;
        if (perf) {
          dailyMap[d].engagement += (perf.likes || 0) + (perf.comments || 0) + (perf.shares || 0);
          dailyMap[d].views += perf.views || 0;
        }
      }
    }

    // Top posts by engagement
    const allPostsForRanking = [
      ...periodPosts.map(p => ({
        id: p.id,
        platform: p.platform,
        content: p.content?.substring(0, 120) || '',
        publishedAt: p.publishedAt || p.createdAt,
        engagement: (() => {
          const e = p.engagement as any;
          return e ? (e.likes || 0) + (e.comments || 0) + (e.shares || 0) : 0;
        })(),
        views: (p.engagement as any)?.views || 0,
      })),
    ].sort((a, b) => b.engagement - a.engagement).slice(0, 10);

    // Spotify artist data if connected
    let spotifyStats: any = null;
    const profile = artistProfile[0];
    if (profile?.spotifyArtistId) {
      try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (clientId && clientSecret) {
          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(6000),
          });
          if (tokenRes.ok) {
            const { access_token } = await tokenRes.json() as any;
            const artistRes = await fetch(`https://api.spotify.com/v1/artists/${profile.spotifyArtistId}`, {
              headers: { Authorization: `Bearer ${access_token}` },
              signal: AbortSignal.timeout(6000),
            });
            if (artistRes.ok) {
              const artist = await artistRes.json() as any;
              spotifyStats = {
                followers: artist.followers?.total || 0,
                popularity: artist.popularity || 0,
                genres: artist.genres || [],
                artistId: profile.spotifyArtistId,
                artistName: artist.name,
                imageUrl: artist.images?.[0]?.url || null,
              };
            }
          }
        }
      } catch (spotifyErr) {
        logger.warn('[Analytics] Spotify artist stats fetch failed:', spotifyErr);
      }
    }

    res.json({
      period,
      platform: platform || 'all',
      syncedAt: new Date().toISOString(),
      metrics: {
        totalFollowers,
        followersGrowth: 0,
        totalEngagement,
        engagementRate,
        totalReach: totalReach || totalViews,
        totalImpressions: totalImpressions || totalViews,
        postsPublished: periodPosts.length + autopilotContent.length,
        totalLikes,
        totalComments,
        totalShares,
        totalViews,
      },
      platformBreakdown,
      dailyMetrics: Object.values(dailyMap),
      topPosts: allPostsForRanking,
      spotifyStats,
      connectedPlatforms: accounts.filter(a => a.isActive).length,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social analytics:');
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

router.post('/generate-video', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      hook: rawHook, body: rawBody, cta: rawCta,
      platform, aspect_ratio, template,
      duration, bg_color, text_color, accent_color,
      artist_name, topic, goal, tone, quality, genre,
      user_audio_path, voiceover,
    } = req.body;

    const userId = req.user?.id;

    // ── Always respond immediately — client polls via /video-job/:id ─────────
    // Holding the HTTP connection open during generation (2–5 min) triggers
    // proxy timeouts that the client misreads as auth failures.  All paths
    // (Python AI and FFmpeg) now run in a background job and store their
    // result in the ffmpegJobs map so the polling endpoint can serve it.
    const jobId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pruneStaleFFmpegJobs();
    ffmpegJobs.set(jobId, { status: 'processing', createdAt: Date.now() });

    // ── Background job: MaxCore video render ──────────────────────────────────
    (async () => {
      try {
        // Stage 1 — Advanced Social AI generates hook / body / CTA.
        // Hook/body/cta passed directly from the client are used as-is.
        let hook = rawHook || '';
        let body = rawBody || '';
        let cta  = rawCta  || '';

        // If the topic is a bare URL, convert it to a descriptive topic so MaxCore
        // can generate meaningful content instead of just printing the raw URL.
        // URL  →  platform/product promo  (e.g. "MaxBooster music career platform")
        // Text →  artist / music content  (no change)
        let resolvedTopic = topic || '';
        if (topic && /^https?:\/\//.test(topic.trim())) {
          try {
            const urlDomain = new URL(topic.trim()).hostname.replace(/^www\./, '');
            // Convert domain to a readable product/platform name:
            //   "maxbooster.replit.app" → "MaxBooster"
            //   "my-beats.com"          → "My Beats"
            const platformName = urlDomain
              .split('.')[0]
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            resolvedTopic = `${platformName} music platform promotional video — features, benefits, and why artists should join`;
          } catch {
            resolvedTopic = topic;
          }
        }

        if (!hook && !body && !cta && topic) {
          // Stage 1: MaxCore → Python AI → ContentGenerator for video script
          // Route through the full advanced AI pipeline so MaxCore-trained content
          // feeds the video renderer, not the template engine.
          let scriptSource = 'template';
          try {
            const scriptResult = await (await getUnifiedAI()).generateContent({
              platform: (platform || 'tiktok') as any,
              tone: (tone || 'energetic') as any,
              topic: resolvedTopic,
              contentType: (goal === 'sales' || goal === 'traffic')
                ? 'promotional'
                : goal === 'viral' ? 'engagement' : 'engagement',
              includeHashtags: false,
              includeEmojis: false,
              genre: genre || undefined,
            });

            if (scriptResult.success && scriptResult.data) {
              const d = scriptResult.data as any;
              hook = (d.hook || d.caption || '').slice(0, 80);
              body = (d.body || d.caption || '').split('\n')[0].slice(0, 120);
              cta  = (d.cta || '').slice(0, 60);
              scriptSource = scriptResult.source || 'AI';
            }
          } catch (scriptErr) {
            logger.warn('[VideoGen] MaxCore call failed (transient) — script fields will be empty:', scriptErr);
          }

          if (!hook && !body) {
            logger.warn('[VideoGen] MaxCore returned no script content (transient failure) — hook/body empty');
          }

          logger.info(
            `[VideoGen] Video script ready via ${scriptSource} — ` +
            `hook="${hook.slice(0, 40)}…"`
          );
        }

        // Shared render params for all video renderers.
        const videoParams = {
          topic:      resolvedTopic || hook || body || 'new music',
          platform:   platform   || 'tiktok',
          template:   template   || undefined,
          aspect_ratio,
          duration:   duration   || 10,
          tone:       tone       || 'energetic',
          goal:       goal       || 'growth',
          artist_name,
          genre:      genre      || undefined,
          quality:    quality    || 'cinematic',
          hook,
          body,
          cta,
          bg_color:        bg_color        || undefined,
          accent_color:    accent_color    || undefined,
          user_audio_path: user_audio_path || undefined,
          voiceover: !!voiceover,
          userId,
        };

        // Stages 2–4 — Advanced Video Renderer (MaxCore)
        logger.info(`[VideoGen] Routing job ${jobId} through Advanced Video Renderer`);
        const result = await (await getRenderAdvancedVideo())({
          ...videoParams,
          template: template || 'cinematic_promo',
        });

        if (result.success) {
          ffmpegJobs.set(jobId, { status: 'done', result, createdAt: Date.now() });
          logger.info(`[VideoGen] Job ${jobId} done via ${result.source || 'renderer'} — url=${result.url}`);
        } else {
          const errMsg = result.error || 'Video generation failed (no error message)';
          ffmpegJobs.set(jobId, { status: 'error', error: errMsg, createdAt: Date.now() });
          logger.warn(`[VideoGen] Job ${jobId} FAILED — ${errMsg}`);
        }
      } catch (err: any) {
        ffmpegJobs.set(jobId, { status: 'error', error: err?.message || 'Video generation failed', createdAt: Date.now() });
        logger.warn({ err: err }, `[VideoGen] Background job ${jobId} threw:`);
      }
    })();

    logger.info(`[VideoGen] Job ${jobId} queued — responding immediately`);
    return res.json({ success: true, job_id: jobId, status: 'processing' });

  } catch (error) {
    logger.warn({ err: error }, 'Failed to start video generation:');
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.get('/video-job/:jobId', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check the local FFmpeg job map first (jobs created by the async generate-video route).
    // FFmpeg job IDs are prefixed with "ffmpeg_" so they never collide with Python AI job IDs.
    const ffmpegJob = ffmpegJobs.get(jobId);
    if (ffmpegJob) {
      if (ffmpegJob.status === 'processing') {
        return res.json({ status: 'processing', progress: 50 });
      }
      if (ffmpegJob.status === 'done' && ffmpegJob.result) {
        const r = ffmpegJob.result;
        return res.json({
          ...r,
          status: 'completed',
          video_url: r.url ?? null,
          thumbnail_url: r.thumbnail_url ?? r.thumbnailUrl ?? null,
          metadata: r.metadata ?? {},
        });
      }
      // error or unknown state
      return res.status(500).json({
        status: 'error',
        message: ffmpegJob.error ?? 'Video generation failed',
      });
    }

    // video_* jobs are always FFmpeg-backed.  If they're not in the map the
    // server must have restarted and the job is gone — tell the client clearly
    // so it can show a retry prompt instead of hanging forever.
    if (jobId.startsWith('video_')) {
      return res.status(410).json({
        status: 'error',
        error: 'Server was restarted while your video was rendering. Please generate again.',
      });
    }

    // Fall through to Python AI service for non-FFmpeg jobs
    const result = await (await getPythonAI()).getVideoJobStatus(jobId);
    if (!result.success) {
      return res.status(503).json({ success: false, status: 'error', message: result.error });
    }
    res.json(result.data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to poll video job:');
    res.status(500).json({ success: false, status: 'error', message: 'Job status check failed' });
  }
});

/**
 * GET /video-proxy/:filename
 * Server-side proxy that streams a MaxCore-rendered video to the browser.
 * The browser never touches MaxCore directly — our server adds the auth headers.
 * Falls back through multiple URL path variants that MaxCore might use.
 */
router.get('/video-proxy/:filename', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { filename } = req.params;
  if (!filename || !filename.match(/^[\w\-]+\.mp4$/i)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const MC_AI_URL = (process.env.AI_SERVER_URL || '').replace(/\/+$/, '');
  const MC_AI_KEY = process.env.AI_SERVER_KEY || '';

  // 1. Check local cache first — if it was written to disk AND is a real video, serve it directly.
  //    Minimum 10 KB: MaxCore's SPA returns ~683-byte HTML pages for unknown paths.
  //    Anything smaller than 10 KB is a corrupted/HTML cache entry — skip and re-proxy.
  const localPath = path.join(process.cwd(), 'uploads', 'videos', filename);
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (stat.size > 10_240) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      return fs.createReadStream(localPath).pipe(res);
    }
    // Corrupted/HTML entry — delete it so we re-fetch from MaxCore
    logger.warn(`[VideoProxy] Local cache entry ${filename} is too small (${stat.size} bytes) — deleting stale cache`);
    fs.unlinkSync(localPath);
  }

  // 2. Try to fetch from MaxCore using stored URL or candidate paths
  const urlStore = await getMaxcoreVideoUrlStore();
  const candidateUrls: string[] = [];

  // Add the stored URL first if we have it
  const storedUrl = urlStore.get(filename);
  if (storedUrl) candidateUrls.push(storedUrl);

  if (MC_AI_URL) {
    // Extract job UUID from filename pattern: video_<uuid>.mp4
    const uuidMatch = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const uuid = uuidMatch ? uuidMatch[1] : null;

    // Job-ID-based download routes first (most likely to work if MaxCore has them)
    if (uuid) {
      candidateUrls.push(
        `${MC_AI_URL}/api/video-job/${uuid}/download`,
        `${MC_AI_URL}/api/video-job/${uuid}/file`,
        `${MC_AI_URL}/api/video-job/${uuid}/video`,
        `${MC_AI_URL}/api/download/${uuid}`,
        `${MC_AI_URL}/api/video/${uuid}`,
        `${MC_AI_URL}/api/video/${uuid}.mp4`,
        `${MC_AI_URL}/api/videos/${uuid}`,
        `${MC_AI_URL}/api/videos/${uuid}.mp4`,
        `${MC_AI_URL}/api/render/${uuid}/download`,
      );
    }

    // Filename-based /api/* routes (bypass SPA catch-all)
    candidateUrls.push(
      `${MC_AI_URL}/api/uploads/${filename}`,
      `${MC_AI_URL}/api/uploads/videos/${filename}`,
      `${MC_AI_URL}/api/videos/${filename}`,
      `${MC_AI_URL}/api/video/${filename}`,
      `${MC_AI_URL}/api/generated/${filename}`,
      `${MC_AI_URL}/api/generated/videos/${filename}`,
      `${MC_AI_URL}/api/render/${filename}`,
      `${MC_AI_URL}/api/output/${filename}`,
      `${MC_AI_URL}/api/media/${filename}`,
      `${MC_AI_URL}/api/download/${filename}`,
      `${MC_AI_URL}/api/stream/${filename}`,
      `${MC_AI_URL}/api/files/${filename}`,
      `${MC_AI_URL}/api/static/videos/${filename}`,
      // Non-/api/ static paths
      `${MC_AI_URL}/uploads/${filename}`,
      `${MC_AI_URL}/uploads/videos/${filename}`,
      `${MC_AI_URL}/videos/${filename}`,
      `${MC_AI_URL}/static/${filename}`,
      `${MC_AI_URL}/static/videos/${filename}`,
      `${MC_AI_URL}/generated/${filename}`,
      `${MC_AI_URL}/output/${filename}`,
      `${MC_AI_URL}/media/${filename}`,
    );
  }

  const authHeaders: Record<string, string> = {
    'X-API-Key':     MC_AI_KEY,
    'Authorization': `Bearer ${MC_AI_KEY}`,
  };

  for (const url of candidateUrls) {
    try {
      const upstream = await fetch(url, {
        headers: authHeaders,
        signal:  AbortSignal.timeout(30_000),
      });
      if (!upstream.ok) {
        logger.info(`[VideoProxy] Candidate ${url} → HTTP ${upstream.status} ct="${upstream.headers.get('content-type') ?? ''}"`);
        continue;
      }

      // Peek at the first bytes to validate with magic-byte detection.
      // Content-type alone is unreliable — MaxCore's SPA returns text/html with
      // 200 OK for every unrecognised path.  We read a small peek chunk first;
      // if it doesn't look like a real video we cancel and try the next candidate.
      const reader = upstream.body?.getReader();
      if (!reader) continue;

      // Read up to 512 bytes to inspect magic bytes
      const peekResult = await reader.read();
      const peekChunk = peekResult.value;
      const peekDone  = peekResult.done;

      if (!peekChunk || peekChunk.length === 0) {
        reader.cancel();
        continue;
      }

      const peekBuf = Buffer.from(peekChunk);
      const isMP4   = peekBuf.length >= 8 && peekBuf.slice(4, 8).toString('ascii') === 'ftyp';
      const isWebM  = peekBuf.length >= 4 && peekBuf[0] === 0x1a && peekBuf[1] === 0x45 && peekBuf[2] === 0xdf && peekBuf[3] === 0xa3;
      const isAVI   = peekBuf.length >= 4 && peekBuf.slice(0, 4).toString('ascii') === 'RIFF';

      // Reject anything that starts with HTML markers
      const peekText = peekBuf.slice(0, 100).toString('utf8').toLowerCase();
      const looksHTML = peekText.includes('<!doctype') || peekText.includes('<html') || peekText.startsWith('<!');

      const isRealVideo = (isMP4 || isWebM || isAVI) && !looksHTML;

      const ct = upstream.headers.get('content-type') ?? '';
      if (!isRealVideo) {
        reader.cancel();
        logger.info(`[VideoProxy] Candidate ${url} → NOT video (HTTP 200, ct="${ct}", peek="${peekText.slice(0, 60).replace(/\n/g, '\\n')}")`);
        continue;
      }

      const cl = upstream.headers.get('content-length');
      res.setHeader('Content-Type', 'video/mp4');
      if (cl) res.setHeader('Content-Length', cl);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      res.writeHead(200);

      // Stream: write the peeked chunk first, then pipe the rest
      const nodeStream = new (await import('stream')).PassThrough();
      nodeStream.pipe(res);
      nodeStream.write(peekChunk);

      (async () => {
        const chunks: Uint8Array[] = [peekChunk];
        try {
          if (!peekDone) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              nodeStream.write(value);
              chunks.push(value);
            }
          }
          nodeStream.end();
          // Cache to disk after full stream
          const buf = Buffer.concat(chunks);
          if (buf.length > 10_240) {
            if (!fs.existsSync(path.join(process.cwd(), 'uploads', 'videos'))) {
              fs.mkdirSync(path.join(process.cwd(), 'uploads', 'videos'), { recursive: true });
            }
            fs.writeFileSync(localPath, buf);
            logger.info(`[VideoProxy] Cached ${filename} to disk (${(buf.length / 1024).toFixed(0)} KB)`);
          }
        } catch { nodeStream.destroy(); }
      })();

      logger.info(`[VideoProxy] Streaming ${filename} from ${url}`);
      return;
    } catch (err: any) {
      logger.info(`[VideoProxy] Candidate ${url} fetch error: ${err.message}`);
    }
  }

  logger.warn(`[VideoProxy] Could not retrieve ${filename} from any MaxCore path`);
  return res.status(404).json({ error: 'Video not found — it may have expired on MaxCore. Please regenerate.' });
});

router.get('/video-templates', requireAuthOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await (await getPythonAI()).getCinematicTemplates();
    if (result.success && result.data) {
      res.json({
        ...result.data,
        aspect_ratios: [
          { id: '9:16', name: 'Vertical (9:16)', platforms: ['TikTok', 'Reels', 'Stories', 'Shorts'] },
          { id: '16:9', name: 'Landscape (16:9)', platforms: ['YouTube', 'Twitter', 'LinkedIn'] },
          { id: '1:1', name: 'Square (1:1)', platforms: ['Instagram Feed', 'Facebook', 'Threads'] },
          { id: '4:5', name: 'Portrait (4:5)', platforms: ['Instagram', 'Facebook'] },
        ],
      });
    } else {
      res.json({
        templates: [
          { id: 'cinematic_promo', name: 'Cinematic Promo', description: 'Film-quality promotional video', category: 'promo' },
          { id: 'neon_pulse', name: 'Neon Pulse', description: 'Vibrant neon with plasma backgrounds', category: 'energetic' },
          { id: 'dark_cinema', name: 'Dark Cinema', description: 'Moody atmospheric film look', category: 'dramatic' },
          { id: 'aurora', name: 'Aurora Borealis', description: 'Northern lights color waves', category: 'atmospheric' },
          { id: 'music_video', name: 'Music Video', description: 'High-energy music video style', category: 'music' },
          { id: 'gold_luxury', name: 'Gold Luxury', description: 'Premium gold and black aesthetic', category: 'luxury' },
          { id: 'elegant_minimal', name: 'Elegant Minimal', description: 'Clean sophisticated design', category: 'professional' },
          { id: 'vintage_film', name: 'Vintage Film', description: 'Retro 8mm film aesthetic', category: 'retro' },
          { id: 'ocean_wave', name: 'Ocean Wave', description: 'Calming ocean gradients', category: 'calm' },
          { id: 'fire_ember', name: 'Fire & Ember', description: 'Intense warm fire tones', category: 'intense' },
          { id: 'storyteller', name: 'Storyteller', description: 'Narrative-driven scene progression', category: 'narrative' },
        ],
        quick_templates: ['promo', 'lyric', 'announcement', 'minimal', 'neon'],
        aspect_ratios: [
          { id: '9:16', name: 'Vertical (9:16)', platforms: ['TikTok', 'Reels', 'Stories', 'Shorts'] },
          { id: '16:9', name: 'Landscape (16:9)', platforms: ['YouTube', 'Twitter', 'LinkedIn'] },
          { id: '1:1', name: 'Square (1:1)', platforms: ['Instagram Feed', 'Facebook', 'Threads'] },
          { id: '4:5', name: 'Portrait (4:5)', platforms: ['Instagram', 'Facebook'] },
        ],
      });
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get video templates:');
    res.status(500).json({ success: false, message: 'Failed to get templates' });
  }
});

router.post('/veo-campaign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title, artist, album, story, mood, era, references,
      label, brand_notes, lyrics, primary_platforms,
      campaign_notes, targets, audio_duration_sec, track_id,
    } = req.body;

    if (!title || !artist) {
      return res.status(400).json({
        success: false,
        message: 'Track title and artist name are required',
      });
    }

    const result = await (await getVeoMusic()).generateCampaign({
      track_id,
      title,
      artist,
      album,
      story,
      mood: mood || 'energetic',
      era: era || 'modern',
      references: references || [],
      label,
      brand_notes: brand_notes || '',
      lyrics,
      primary_platforms: primary_platforms || ['tiktok', 'youtube', 'instagram'],
      campaign_notes: campaign_notes || '',
      targets,
      audio_duration_sec: audio_duration_sec || 180,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Video campaign generation failed',
      });
    }

    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate Veo campaign:');
    res.status(500).json({ success: false, message: 'Video campaign generation failed' });
  }
});

router.post('/veo-campaign/single', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, artist, platform, mood, story, lyrics, tone } = req.body;

    if (!title || !artist || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Track title, artist, and platform are required',
      });
    }

    const asset = await (await getVeoMusic()).generateForPost({
      title,
      artist,
      platform,
      mood,
      story,
      lyrics,
      tone,
    });

    if (!asset) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate video for platform',
      });
    }

    res.json({ success: true, asset });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate single Veo video:');
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.get('/veo-campaign/platforms', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await (await getVeoMusic()).getAvailablePlatforms();
    if (!data) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get Veo platforms:');
    res.status(500).json({ success: false, message: 'Failed to get platforms' });
  }
});

router.get('/veo-campaign/goals', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await (await getVeoMusic()).getAvailableGoals();
    if (!data) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get Veo goals:');
    res.status(500).json({ success: false, message: 'Failed to get goals' });
  }
});

router.get('/veo-campaign/recommend/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platform } = req.params;
    const data = await (await getVeoMusic()).getRecommendedGoals(platform);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: `No recommendations for platform: ${platform}`,
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get Veo recommendations:');
    res.status(500).json({ success: false, message: 'Failed to get recommendations' });
  }
});

router.get('/veo-campaign/status', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await (await getVeoMusic()).getPipelineStatus();
    if (!status) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json({ success: true, ...status });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get Veo status:');
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
});

router.post('/veo-url/metadata', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid "url" field',
      });
    }

    const data = await (await getVeoMusic()).extractUrlMetadata(url);
    if (!data) {
      return res.status(503).json({
        success: false,
        message: 'Veo Music pipeline not available',
      });
    }
    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to extract URL metadata:');
    res.status(500).json({ success: false, message: 'Failed to extract metadata from URL' });
  }
});

router.post('/veo-campaign/from-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, ...overrides } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid "url" field',
      });
    }

    const result = await (await getVeoMusic()).generateCampaignFromUrl(url, overrides);
    if (!result || !result.success) {
      return res.status(result?.error?.includes('unavailable') ? 503 : 500).json({
        success: false,
        message: result?.error || 'Campaign generation from URL failed',
      });
    }
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate campaign from URL:');
    res.status(500).json({ success: false, message: 'Campaign generation from URL failed' });
  }
});

router.post('/veo-campaign/promote-storefront', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { slug, platforms, mood, brand_notes, campaign_notes } = req.body;

    let storefront: any;
    if (slug) {
      const rows = await db.select().from(storefronts).where(
        and(eq(storefronts.slug, slug), eq(storefronts.userId, userId))
      ).limit(1);
      storefront = rows[0];
    } else {
      const rows = await db.select().from(storefronts).where(eq(storefronts.userId, userId)).limit(1);
      storefront = rows[0];
    }

    if (!storefront) {
      return res.status(404).json({ success: false, message: 'Storefront not found or you do not own it' });
    }

    if (!storefront.isActive) {
      return res.status(403).json({ success: false, message: 'Storefront is not active' });
    }

    const customization = (storefront.customization || {}) as Record<string, any>;
    const seo = (storefront.seo || {}) as Record<string, any>;

    const storeListings = await db.select().from(listings)
      .where(and(eq(listings.storefrontId, storefront.id), eq(listings.isPublished, true)))
      .limit(10);

    const listingCount = storeListings.length;
    const genres = [...new Set(storeListings.map((l: any) => l.category).filter(Boolean))];
    const topListings = storeListings.slice(0, 3).map((l: any) => l.title).join(', ');

    const description = seo.description || customization.bio || '';
    const title = seo.title || storefront.name || 'My Storefront';
    const artworkUrl = seo.ogImage || customization.banner || customization.logo || '';
    const keywords = seo.keywords || [];

    let story = `Promote ${title}.`;
    if (description) story += ` ${description.slice(0, 200)}.`;
    if (listingCount > 0) story += ` Featuring ${listingCount} beats${topListings ? ` including ${topListings}` : ''}.`;
    if (genres.length > 0) story += ` Genres: ${genres.join(', ')}.`;
    story += ' Drive traffic and sales to the storefront.';

    const campaignRequest: Record<string, any> = {
      title,
      artist: storefront.name,
      mood: mood || 'energetic',
      era: 'modern',
      story,
      primary_platforms: platforms || ['tiktok', 'youtube', 'instagram', 'reels', 'shorts', 'facebook'],
      audio_duration_sec: 180,
      source_url: `/storefront/${storefront.slug}`,
      source_platform: 'website',
      content_type: 'website',
    };

    if (brand_notes) campaignRequest.brand_notes = brand_notes;
    else if (description) campaignRequest.brand_notes = description.slice(0, 300);

    if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
    if (artworkUrl) campaignRequest.artwork_url = artworkUrl;
    if (keywords.length > 0) campaignRequest.keywords = keywords;

    const result = await (await getVeoMusic()).generateCampaign(campaignRequest);
    if (!result || !result.success) {
      return res.status(500).json({ success: false, message: result?.error || 'Campaign generation failed' });
    }

    res.json({
      ...result,
      storefront: {
        id: storefront.id,
        name: storefront.name,
        slug: storefront.slug,
        listingCount,
        genres,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to promote storefront:');
    res.status(500).json({ success: false, message: 'Storefront promotion campaign failed' });
  }
});

router.post('/veo-campaign/promote-listing', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { listingId, platforms, mood, brand_notes, campaign_notes } = req.body;
    if (!listingId) return res.status(400).json({ success: false, message: 'Missing listingId' });

    const rows = await db.select().from(listings).where(
      and(eq(listings.id, listingId), eq(listings.userId, userId))
    ).limit(1);
    const listing = rows[0] as any;
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found or you do not own it' });

    if (!listing.isPublished) {
      return res.status(403).json({ success: false, message: 'Listing must be published before promoting' });
    }

    let storefrontName = 'My Store';
    if (listing.storefrontId) {
      const storeRows = await db.select().from(storefronts).where(eq(storefronts.id, listing.storefrontId)).limit(1);
      if (storeRows[0]) storefrontName = (storeRows[0] as any).name || storefrontName;
    }

    const metadata = (listing.metadata || {}) as Record<string, any>;
    const title = listing.title;
    const description = listing.description || '';
    const category = listing.category || metadata.genre || '';
    const artworkUrl = listing.artworkUrl || '';
    const priceDisplay = listing.priceCents ? `$${(listing.priceCents / 100).toFixed(2)}` : '';

    let story = `Check out "${title}" by ${storefrontName}.`;
    if (description) story += ` ${description.slice(0, 150)}.`;
    if (category) story += ` Genre: ${category}.`;
    if (priceDisplay) story += ` Available now for ${priceDisplay}.`;
    story += ' Get it before it\'s gone!';

    const isMusic = listing.audioUrl || category;

    const campaignRequest: Record<string, any> = {
      title,
      artist: storefrontName,
      mood: mood || (category ? 'energetic' : 'uplifting'),
      era: 'modern',
      story,
      primary_platforms: platforms || ['tiktok', 'instagram', 'reels', 'shorts'],
      audio_duration_sec: 180,
      source_url: `/marketplace/beat/${listing.id}`,
      source_platform: isMusic ? 'maxbooster' : 'website',
      content_type: isMusic ? 'music' : 'website',
    };

    if (brand_notes) campaignRequest.brand_notes = brand_notes;
    if (campaign_notes) campaignRequest.campaign_notes = campaign_notes;
    if (artworkUrl) campaignRequest.artwork_url = artworkUrl;
    if (category) campaignRequest.genre = category;

    const result = await (await getVeoMusic()).generateCampaign(campaignRequest);
    if (!result || !result.success) {
      return res.status(500).json({ success: false, message: result?.error || 'Campaign generation failed' });
    }

    res.json({
      ...result,
      listing: {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        price: priceDisplay,
        storefrontName,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to promote listing:');
    res.status(500).json({ success: false, message: 'Listing promotion campaign failed' });
  }
});

router.post('/generate-image', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      topic, platform, tone, goal, artist_name, style,
      // URL analysis context
      artist, track, genre, thumbnail_url, keywords, description,
      urlDescription, artistName, trackTitle, urlContentType, contentCategory,
    } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, message: 'Topic is required' });
    }

    // Build enriched topic string from URL analysis context (same as /generate route)
    const contextParts: string[] = [];
    const resolvedTrack = track || trackTitle;
    const resolvedArtist = artist || artistName || artist_name;
    if (resolvedTrack) contextParts.push(`"${resolvedTrack}"`);
    if (resolvedArtist) contextParts.push(`by ${resolvedArtist}`);
    contextParts.push(String(topic));
    if (urlDescription && urlDescription !== topic) contextParts.push(urlDescription);
    if (description && description !== topic) contextParts.push(description);
    const enrichedTopic = contextParts.filter(Boolean).join(' — ');

    // Generate a rich visual spec using MaxCore local pipeline
    const resolvedPlatform = (
      CONTENT_ALL_PLATFORMS.includes(platform as ContentSupportedPlatform)
        ? platform
        : 'instagram'
    ) as ContentSupportedPlatform;

    const toneColorMap: Record<string, string[]> = {
      energetic:    ['#ff6b35', '#f7c59f', '#1a1a2e', '#ffffff'],
      chill:        ['#a8dadc', '#457b9d', '#1d3557', '#f1faee'],
      professional: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'],
      playful:      ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec'],
      nostalgic:    ['#d4a373', '#ccd5ae', '#e9edc9', '#fefae0'],
    };
    const resolvedTone = String(tone || 'energetic').toLowerCase();
    const colorPalette = toneColorMap[resolvedTone] ?? toneColorMap.energetic;

    const visualSpec = getVisualSpec(resolvedPlatform, 'video_post', colorPalette);

    const specData = {
      ...visualSpec,
      topic:        enrichedTopic || topic,
      platform:     resolvedPlatform,
      tone:         resolvedTone,
      artist:       resolvedArtist || '',
      track:        resolvedTrack || '',
      genre:        genre || '',
      keywords:     Array.isArray(keywords) ? keywords : [],
      description:  description || urlDescription || '',
      source:       'MaxCoreAI',
    };

    res.json({ success: true, visual_spec: specData, image_url: null, ...specData });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate social image:');
    res.status(500).json({ success: false, message: 'Image generation failed' });
  }
});

// ── Media-to-Content: URL ─────────────────────────────────────────────────────

router.post('/analyze-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, platform } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'url is required' });
    }

    const analysis = await analyzeUrl(url.trim());
    if (analysis.error && !analysis.title) {
      return res.status(422).json({ success: false, message: analysis.error, analysis });
    }

    const seed = urlToContentSeed(analysis);

    // Auto-generate social content from the extracted data using rich context
    const aiTopic = seed.track && seed.artist
      ? `"${seed.track}" by ${seed.artist}${seed.genre && seed.genre !== 'default' ? ` — ${seed.genre}` : ''}`
      : seed.track
        ? `"${seed.track}"`
        : seed.artist
          ? `New music by ${seed.artist}`
          : seed.topic.slice(0, 80);

    const urlKeywords = [...new Set([...(seed.keywords || []), ...(seed.tags || [])])].slice(0, 20);
    const content = await (await getUnifiedAI()).generateContent({
      platform:    platform || 'instagram',
      topic:       aiTopic,
      tone:        seed.tone !== 'default' ? seed.tone : 'energetic',
      genre:       seed.genre !== 'default' ? seed.genre : 'hip-hop',
      artistName:  seed.artist,
      trackTitle:  seed.track,
      album:       seed.album      || undefined,
      releaseDate: seed.release_date || undefined,
      label:       seed.label      || undefined,
      keywords:    urlKeywords.length ? urlKeywords : undefined,
      description: analysis.description?.slice(0, 200) || undefined,
      bodyPreview: seed.body_preview?.slice(0, 300)    || undefined,
      extraContext: [
        seed.view_count   ? `${seed.view_count.toLocaleString()} views`  : '',
        seed.like_count   ? `${seed.like_count.toLocaleString()} likes`  : '',
        seed.play_count   ? `${seed.play_count.toLocaleString()} plays`  : '',
      ].filter(Boolean).join(' | ') || undefined,
      includeHashtags: true,
      includeEmojis:   true,
    });

    // Derive genre-based default colors for the video template
    const genreColorMap: Record<string, { bg: string; ac: string }> = {
      'trap':       { bg: '#0a0a0a', ac: '#ff3c00' },
      'hip-hop':    { bg: '#1a1a2e', ac: '#e94560' },
      'r&b':        { bg: '#1a0a2e', ac: '#c77dff' },
      'pop':        { bg: '#0d0d1a', ac: '#00d4ff' },
      'edm':        { bg: '#000d1a', ac: '#00ffcc' },
      'country':    { bg: '#1a1000', ac: '#d4af37' },
      'rock':       { bg: '#1a0000', ac: '#ff4500' },
      'jazz':       { bg: '#0a0a1a', ac: '#d4af37' },
      'classical':  { bg: '#1a1a10', ac: '#c0c0c0' },
      'reggae':     { bg: '#001a0a', ac: '#00aa44' },
      'latin':      { bg: '#1a0500', ac: '#ff6600' },
    };

    // Platform-specific overrides
    const platformColorMap: Record<string, { bg: string; ac: string }> = {
      'youtube':    { bg: '#0f0f0f', ac: '#ff0000' },
      'spotify':    { bg: '#191414', ac: '#1db954' },
      'soundcloud': { bg: '#1a0a00', ac: '#ff5500' },
      'tiktok':     { bg: '#010101', ac: '#69c9d0' },
      'apple_music':{ bg: '#1c1c1e', ac: '#fc3c44' },
    };

    const genreKey = (seed.genre || 'hip-hop').toLowerCase();
    const platformKey = (analysis.platform || '').toLowerCase();
    const colors = platformColorMap[platformKey] || genreColorMap[genreKey] || { bg: '#1a1a2e', ac: '#e94560' };

    // Use AI-generated hook/body/cta for the video overlay when available
    const aiHook = content?.data?.hook || '';
    const aiBody = content?.data?.body || '';
    const aiCta  = content?.data?.cta  || '';

    // Build punchy video-specific text (fallback from AI result)
    const videoHook = aiHook || (seed.track && seed.artist
      ? `${seed.track} — out now`
      : seed.track
        ? `New drop: ${seed.track}`
        : seed.artist
          ? `New music from ${seed.artist}`
          : aiTopic.slice(0, 50));

    const videoBody = aiBody || (seed.artist && seed.track
      ? `${seed.genre && seed.genre !== 'default' ? seed.genre.charAt(0).toUpperCase() + seed.genre.slice(1) + ' — ' : ''}Stream by ${seed.artist}`
      : 'Stream now on all platforms');

    const videoCtaMap: Record<string, string> = {
      'music':   'Stream now — link in bio',
      'video':   'Watch now — link in bio',
      'event':   'Get tickets — link in bio',
      'article': 'Read more — link in bio',
      'podcast': 'Listen now — link in bio',
    };
    const videoCta = aiCta || videoCtaMap[seed.content_type] || 'Follow for more';

    const videoConfig = {
      topic:        aiTopic,
      genre:        seed.genre    || 'hip-hop',
      tone:         seed.tone !== 'default' ? seed.tone : 'energetic',
      platform:     platform      || 'tiktok',
      duration:     15,
      artist_name:  seed.artist   || '',
      hook:         videoHook,
      body:         videoBody,
      cta:          videoCta,
      bg_color:     colors.bg,
      accent_color: colors.ac,
      thumbnail_url: seed.og_image || seed.thumbnail_url || '',
    };

    const audioStyle = {
      genre:    seed.genre   || 'hip-hop',
      mood:     seed.tone    || 'energetic',
      prompt:   `${seed.genre || 'hip-hop'} beat for "${seed.topic.slice(0, 40)}"`,
      bpm:      seed.genre === 'trap' ? 140 : seed.genre === 'r&b' ? 90 : 120,
    };

    const imagePrompt = [
      seed.artist ? `Artist: ${seed.artist}` : '',
      seed.track  ? `Track: ${seed.track}` : '',
      seed.genre  ? `Genre: ${seed.genre}` : '',
      seed.tone   ? `Mood: ${seed.tone}` : '',
      seed.og_image ? `Reference image: ${seed.og_image}` : '',
    ].filter(Boolean).join('. ') || seed.topic;

    res.json({
      success:      true,
      analysis,
      seed,
      content:      content?.content || content || null,
      video_config: videoConfig,
      audio_style:  audioStyle,
      image_prompt: imagePrompt,
    });
  } catch (error) {
    logger.warn({ err: error }, 'analyze-url failed:');
    res.status(500).json({ success: false, message: 'URL analysis failed' });
  }
});

// ── Media-to-Content: Audio ───────────────────────────────────────────────────

router.post(
  '/analyze-audio',
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    audioUpload.single('audio')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ success: false, message: 'audio file is required (field: audio)' });
      }

      const analysis = await analyzeAudio(file.buffer, file.originalname);
      if (analysis.error) {
        return res.status(422).json({ success: false, message: analysis.error, analysis });
      }

      const seed    = audioToContentSeed(analysis);
      const platform = (req.body.platform as string) || 'instagram';

      // Generate content from audio features
      const content = await (await getUnifiedAI()).generateContent({
        type:       'social_post',
        platform,
        topic:      seed.topic,
        tone:       'default',
        genre:      seed.genre,
        artistName: seed.artist,
        trackTitle: seed.track,
      });

      // Produce a video config the frontend can use to call /generate-video
      const videoConfig = {
        genre:    analysis.genre,
        topic:    seed.topic,
        tone:     'default',
        speed:    undefined as number | undefined,  // let NN decide
        bg:       '0x1a1a2e',
        ac:       '0xe94560',
        duration: 15,
        platform,
      };

      res.json({
        success:  true,
        analysis,
        seed,
        content:  content?.content || content || null,
        video_config: videoConfig,
      });
    } catch (error) {
      logger.warn({ err: error }, 'analyze-audio failed:');
      res.status(500).json({ success: false, message: 'Audio analysis failed' });
    }
  },
);

// ── Media-to-Content: Image ───────────────────────────────────────────────────

router.post(
  '/analyze-image',
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    artworkUpload.single('image')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ success: false, message: 'image file is required (field: image)' });
      }

      const analysis = await analyzeImage(file.buffer, file.originalname);
      if (analysis.error) {
        return res.status(422).json({ success: false, message: analysis.error, analysis });
      }

      const seed     = imageToContentSeed(analysis);
      const platform = (req.body.platform as string) || 'instagram';

      // Generate content from visual mood
      const content = await (await getUnifiedAI()).generateContent({
        type:       'social_post',
        platform,
        topic:      `${analysis.mood} visual aesthetic, ${analysis.genre_hint} music`,
        tone:       analysis.tone || 'default',
        genre:      analysis.genre_hint,
        artistName: (req.body.artist_name as string) || '',
      });

      // Video config with extracted colors baked in
      const videoConfig = {
        genre:    analysis.genre_hint,
        topic:    `${analysis.mood} aesthetic`,
        tone:     analysis.tone || 'default',
        bg:       analysis.bg_color,
        ac:       analysis.ac_color,
        duration: 15,
        platform,
      };

      res.json({
        success:  true,
        analysis,
        seed,
        content:  content?.content || content || null,
        video_config: videoConfig,
        palette:  analysis.palette.slice(0, 5),
      });
    } catch (error) {
      logger.warn({ err: error }, 'analyze-image failed:');
      res.status(500).json({ success: false, message: 'Image analysis failed' });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE SYNTHESIS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /voice-profiles
 * Returns all available voice profiles with metadata.
 */
router.get('/voice-profiles', requireAuthOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const svc = await getVoiceSynthService();
    res.json({ success: true, profiles: svc.listVoiceProfiles() });
  } catch (e: any) {
    logger.warn('[Route] voice-profiles:', e?.message);
    res.status(500).json({ success: false, error: 'Failed to load voice profiles' });
  }
});

/**
 * POST /synthesize-voice
 * Body: { text, profileId?, speed?, pitch?, volume?, reverbAmount?, outputFormat? }
 * File (optional): audio field → reference voice sample for profile auto-selection
 *
 * Returns: { success, outputPath, publicUrl, durationSeconds, profileUsed }
 */
router.post(
  '/synthesize-voice',
  requireAuthOnly,
  (req, res, next) => {
    // mediaUpload → disk storage so referenceAudioPath has a real file path for FFmpeg
    mediaUpload.single('reference_audio')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { text, profileId, speed, pitch, volume, reverbAmount, outputFormat, segments } = req.body as {
        text?: string;
        profileId?: string;
        speed?: number;
        pitch?: number;
        volume?: number;
        reverbAmount?: number;
        outputFormat?: 'wav' | 'mp3';
        segments?: string;
      };

      const svc = await getVoiceSynthService();
      const referenceAudioPath = (req as any).file?.path;

      const options = {
        profileId,
        speed: speed ? Number(speed) : undefined,
        pitch: pitch ? Number(pitch) : undefined,
        volume: volume ? Number(volume) : undefined,
        reverbAmount: reverbAmount !== undefined ? Number(reverbAmount) : undefined,
        outputFormat: outputFormat === 'mp3' ? 'mp3' as const : 'wav' as const,
        referenceAudioPath,
      };

      let result;
      if (segments) {
        let parsedSegments: Array<{ text: string; pause?: number }> = [];
        try { parsedSegments = JSON.parse(segments); }
        catch { return res.status(400).json({ success: false, error: 'Invalid segments JSON' }); }
        result = await svc.synthesizeSegments(parsedSegments, options);
      } else {
        if (!text?.trim()) return res.status(400).json({ success: false, error: 'text is required' });
        result = await svc.synthesizeVoice(text, options);
      }

      if (!result.success) return res.status(500).json({ success: false, error: result.error });

      const filename  = result.outputPath!.split('/').pop();
      const publicUrl = `/uploads/voices/${filename}`;
      const userId    = req.user?.id?.toString() || req.user?.userId?.toString() || 'anonymous';

      // ── Persist to PDIM (non-blocking — response already sent after this) ──
      let pdimMeta: any = null;
      try {
        const { storeVoiceFile } = await import('../services/pdimMediaStorageService.js');
        pdimMeta = await storeVoiceFile(userId, result.outputPath!, {
          profileUsed:     result.profileUsed || profileId || 'smooth_narrator',
          voiceUsed:       result.voiceUsed   || 'flite',
          durationSeconds: result.durationSeconds,
          text: typeof text === 'string' ? text : undefined,
        });
      } catch (e: any) {
        logger.warn('[Route] voice PDIM store skipped:', e?.message?.slice(0, 80));
      }

      res.json({
        success: true,
        publicUrl,
        filename,
        durationSeconds:  result.durationSeconds,
        profileUsed:      result.profileUsed,
        voiceUsed:        result.voiceUsed,
        outputPath:       result.outputPath,
        pdim: pdimMeta ? { key: pdimMeta.pdimKey, compressedSize: pdimMeta.compressedSize } : null,
      });
    } catch (e: any) {
      logger.warn('[Route] synthesize-voice:', e?.message);
      res.status(500).json({ success: false, error: e?.message || 'Voice synthesis failed' });
    }
  },
);

/**
 * POST /analyze-reference-voice
 * Body: multipart/form-data with audio field
 * Returns: { estimatedPitch, estimatedTempo, energy, suggestedProfileId }
 */
router.post(
  '/analyze-reference-voice',
  requireAuthOnly,
  (req, res, next) => {
    mediaUpload.single('audio')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file;
      if (!file?.path) {
        return res.status(400).json({ success: false, error: 'Audio file required' });
      }
      const svc = await getVoiceSynthService();
      const characteristics = await svc.analyzeReferenceVoice(file.path);
      res.json({ success: true, characteristics });
    } catch (e: any) {
      logger.warn('[Route] analyze-reference-voice:', e?.message);
      res.status(500).json({ success: false, error: e?.message || 'Analysis failed' });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BEAT SYNC / AUDIO ANALYSIS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /analyze-audio-beats
 * Body: multipart/form-data with audio field
 * Returns full BeatAnalysis: { bpm, confidence, beats, downbeats, sections,
 *   energyEnvelope, peakPositions, durationSeconds, tier }
 */
router.post(
  '/analyze-audio-beats',
  requireAuthOnly,
  (req, res, next) => {
    // mediaUpload → disk storage gives us a real file path for FFmpeg analysis
    mediaUpload.single('audio')(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file;
      if (!file?.path) {
        return res.status(400).json({ success: false, error: 'Audio file required (multipart/form-data, field: audio)' });
      }

      // ── Check PDIM cache first ────────────────────────────────────────────
      let analysis;
      let cacheHit = false;
      try {
        const { getCachedBeatAnalysis, cacheBeatAnalysis } = await import('../services/pdimMediaStorageService.js');
        const cached = await getCachedBeatAnalysis(file.path);
        if (cached) {
          analysis = cached;
          cacheHit = true;
        } else {
          const svc = await getBeatSyncService();
          analysis = await svc.analyzeAudio(file.path);
          // Cache the result in PDIM for 24 hours
          await cacheBeatAnalysis(file.path, analysis);
        }
      } catch {
        // PDIM unavailable — fall through to direct analysis
        const svc = await getBeatSyncService();
        analysis = await svc.analyzeAudio(file.path);
      }

      res.json({ success: true, analysis, cacheHit });
    } catch (e: any) {
      logger.warn('[Route] analyze-audio-beats:', e?.message);
      res.status(500).json({ success: false, error: e?.message || 'Beat analysis failed' });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE-TO-VIDEO / MUSIC VIDEO GENERATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Track async music video jobs in the same pattern as ffmpegJobs
interface MusicVideoJob {
  status: 'processing' | 'done' | 'error';
  result?: any;
  error?: string;
  createdAt: number;
}
const musicVideoJobs = new Map<string, MusicVideoJob>();

// Prune jobs older than 15 minutes
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of musicVideoJobs.entries()) {
    if (job.createdAt < cutoff) musicVideoJobs.delete(id);
  }
}, 3 * 60 * 1000);

/**
 * POST /generate-music-video
 * Accepts multipart/form-data:
 *   images[]         — one or more image files (JPEG/PNG/WebP)
 *   audio            — audio track (mp3/wav) — optional
 *   reference_voice  — voice reference sample — optional
 *
 * Body fields (all optional):
 *   template, platform, aspect_ratio, duration, genre,
 *   hook, body, cta, artistName,
 *   beatSync (bool), kenBurnsIntensity, colorGrade, transitionType,
 *   synthesize_voice (bool), voice_text, voice_profile_id
 *
 * Returns immediately with jobId — poll /music-video-job/:jobId for result.
 */
router.post(
  '/generate-music-video',
  requireAuthOnly,
  (req, res, next) => {
    // mediaUpload → disk storage, accepts both images + audio in one request
    mediaUpload.fields([
      { name: 'images', maxCount: 10 },
      { name: 'audio',  maxCount: 1 },
      { name: 'reference_voice', maxCount: 1 },
    ])(req as any, res as any, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const jobId = `mvjob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    musicVideoJobs.set(jobId, { status: 'processing', createdAt: Date.now() });

    // Respond immediately
    res.json({ success: true, jobId, message: 'Music video generation started' });

    // Process async
    (async () => {
      try {
        const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
        const imageFiles = files?.images || [];
        const audioFile  = files?.audio?.[0];
        const voiceRef   = files?.reference_voice?.[0];

        if (!imageFiles.length) {
          musicVideoJobs.set(jobId, { status: 'error', error: 'At least one image is required', createdAt: Date.now() });
          return;
        }

        const body = req.body as Record<string, string>;

        const imagePaths = imageFiles.map((f: Express.Multer.File) => f.path).filter(Boolean);
        const audioPath  = audioFile?.path;

        // Optional: synthesize voice narration before rendering
        let voiceSynthPath: string | undefined;
        if (body.synthesize_voice === 'true' && body.voice_text?.trim()) {
          try {
            const voiceSvc = await getVoiceSynthService();
            const voiceResult = await voiceSvc.synthesizeVoice(body.voice_text, {
              profileId: body.voice_profile_id || 'smooth_narrator',
              referenceAudioPath: voiceRef?.path,
            });
            if (voiceResult.success && voiceResult.outputPath) {
              voiceSynthPath = voiceResult.outputPath;
            }
          } catch (e: any) {
            logger.warn('[MusicVideo] Voice synthesis skipped:', e?.message);
          }
        }

        const imgSvc  = await getImageToVideoService();
        const result  = await imgSvc.imageToMusicVideo({
          imagePaths,
          audioPath,
          voiceSynthPath,
          template:           body.template,
          platform:           body.platform,
          aspect_ratio:       body.aspect_ratio,
          duration:           body.duration ? Number(body.duration) : undefined,
          genre:              body.genre,
          hook:               body.hook,
          body:               body.body,
          cta:                body.cta,
          artistName:         body.artist_name || body.artistName,
          beatSync:           body.beat_sync !== 'false',
          kenBurnsIntensity:  (body.intensity as any) || 'moderate',
          colorGrade:         (body.color_grade as any) || 'cinematic',
          transitionType:     body.transition,
        });

        if (!result.success) {
          musicVideoJobs.set(jobId, { status: 'error', error: result.error || 'Render failed', createdAt: Date.now() });
          return;
        }

        // ── Persist rendered video to PDIM as primary storage ────────────────
        const userId = req.user?.id?.toString() || req.user?.userId?.toString() || 'anonymous';
        let pdimVideoMeta: any = null;
        try {
          const { storeMusicVideo } = await import('../services/pdimMediaStorageService.js');
          const videoFilePath = `${process.cwd()}/uploads/videos/${result.filename}`;
          pdimVideoMeta = await storeMusicVideo(userId, videoFilePath, result);
          if (pdimVideoMeta) {
            result.pdim = { key: pdimVideoMeta.pdimKey, compressedSize: pdimVideoMeta.compressedSize, tier: pdimVideoMeta.tier };
          }
        } catch (e: any) {
          logger.warn(`[MusicVideo] PDIM store skipped for job ${jobId}:`, e?.message?.slice(0, 80));
        }

        musicVideoJobs.set(jobId, { status: 'done', result, createdAt: Date.now() });
        logger.info(`[MusicVideo] Job ${jobId} complete — ${result.filename} | PDIM: ${pdimVideoMeta?.pdimKey ?? 'skipped'}`);
      } catch (e: any) {
        logger.warn(`[MusicVideo] Job ${jobId} failed:`, e?.message);
        musicVideoJobs.set(jobId, { status: 'error', error: e?.message || 'Music video generation failed', createdAt: Date.now() });
      }
    })();
  },
);

/**
 * GET /music-video-job/:jobId
 * Poll for music video generation status.
 * Returns: { status: 'processing'|'done'|'error', result?, error? }
 */
router.get('/music-video-job/:jobId', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { jobId } = req.params;
  const job = musicVideoJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found or expired' });
  }

  if (job.status === 'processing') {
    return res.json({ success: true, status: 'processing', message: 'Music video is being rendered…' });
  }

  if (job.status === 'error') {
    return res.status(500).json({ success: false, status: 'error', error: job.error });
  }

  res.json({ success: true, status: 'done', result: job.result });
});

/**
 * GET /music-video-capabilities
 * Returns all available options for music video generation.
 */
router.get('/music-video-capabilities', requireAuthOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [voiceSvc, imgSvc] = await Promise.all([
      getVoiceSynthService(),
      getImageToVideoService(),
    ]);
    res.json({
      success: true,
      voices: voiceSvc.listVoiceProfiles().map(p => ({
        id: p.id, name: p.name, description: p.description,
        category: p.category, gender: p.gender,
      })),
      kenBurns: ['subtle', 'moderate', 'dramatic'],
      colorGrades: ['none', 'warm', 'cool', 'cinematic', 'neon'],
      transitions: ['fade', 'fadeblack', 'fadewhite', 'slideleft', 'slideright', 'slideup', 'slidedown', 'wipeleft', 'wiperight', 'radial', 'smoothleft', 'smoothright', 'circleopen', 'circlecrop', 'rectcrop', 'dissolve', 'pixelize', 'horzopen', 'vertopen'],
      aspectRatios: ['9:16', '1:1', '16:9', '4:5'],
      platforms: ['tiktok', 'instagram', 'instagram_reels', 'youtube', 'facebook', 'twitter', 'linkedin'],
      genres: ['trap', 'r&b', 'hip_hop', 'pop', 'edm', 'house', 'lofi', 'gospel', 'drill', 'dancehall', 'reggae', 'metal', 'blues', 'classical'],
      maxImages: 10,
      maxDurationSeconds: 60,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to load capabilities' });
  }
});

export default router;

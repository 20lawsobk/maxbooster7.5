/**
 * Content Analysis API Routes
 * Provides endpoints for analyzing multimodal content (images, videos, audio, text, websites)
 * Powers AI autopilot learning from actual content features, not just engagement metrics
 */

import { Router } from 'express';
import { contentAnalysisService } from '../services/contentAnalysisService';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { users, posts, adCampaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|fc|fd)/i;

function validateExternalUrl(raw: string): string {
  let normalised = raw.trim();
  if (normalised && !/^https?:\/\//i.test(normalised)) {
    normalised = 'https://' + normalised;
  }
  let parsed: URL;
  try {
    parsed = new URL(normalised);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid URL protocol');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || PRIVATE_IP_RE.test(hostname)) {
    throw new Error('URL resolves to a private or reserved address');
  }
  return parsed.href;
}

const router = Router();

// 120M req/s system capacity — 7.2B per 15-minute window per user/IP.
// Content analysis is compute-heavy; the AI inference layer (MaxCore) handles
// back-pressure independently, so the HTTP rate limit matches global capacity.
const contentAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7_200_000_000,
  message: 'Too many content analysis requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// Middleware to check if user has a paid subscription (required for content analysis)
// Note: There is no free tier - all content analysis requires a paid subscription
const requirePremium = async (req: Record<string, unknown>, res: Record<string, unknown>, next: Record<string, unknown>) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only paid subscribers (monthly/yearly/lifetime) and admins can access
    const paidTiers = ['monthly', 'yearly', 'lifetime'];
    if (user.subscriptionTier && paidTiers.includes(user.subscriptionTier) || user.role === 'admin' || user.isAdmin) {
      return next();
    }

    return res.status(403).json({
      error: 'Paid subscription required',
      message: 'Content analysis features require a paid subscription. Upgrade to access multimodal AI analysis.',
      upgradeUrl: '/pricing',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Premium check error:');
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
};

// Apply rate limiting, authentication, and premium requirement to all routes
router.use(contentAnalysisLimiter);
router.use(requireAuth);
router.use(requirePremium);

/**
 * Analyze image content
 * POST /api/content-analysis/image
 * Body: { imageUrl: string }
 */
router.post('/image', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    let safeImageUrl: string;
    try {
      safeImageUrl = validateExternalUrl(imageUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid or unsafe URL' });
    }

    const analysis = await contentAnalysisService.analyzeImage(safeImageUrl);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Image analysis error:');
    res.status(500).json({
      success: false,
      error: 'Failed to analyze image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Analyze video content
 * POST /api/content-analysis/video
 * Body: { videoUrl: string, duration?: number }
 */
router.post('/video', async (req, res) => {
  try {
    const { videoUrl, duration } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    let safeVideoUrl: string;
    try {
      safeVideoUrl = validateExternalUrl(videoUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid or unsafe URL' });
    }

    const analysis = await contentAnalysisService.analyzeVideo(
      safeVideoUrl,
      duration || 30
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Video analysis error:');
    res.status(500).json({
      success: false,
      error: 'Failed to analyze video',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Analyze audio content
 * POST /api/content-analysis/audio
 * Body: { audioUrl: string, metadata?: any }
 */
router.post('/audio', async (req, res) => {
  try {
    const { audioUrl, metadata } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl is required' });
    }

    let safeAudioUrl: string;
    try {
      safeAudioUrl = validateExternalUrl(audioUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid or unsafe URL' });
    }

    const analysis = await contentAnalysisService.analyzeAudio(
      safeAudioUrl,
      metadata
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Audio analysis error:');
    res.status(500).json({
      success: false,
      error: 'Failed to analyze audio',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Analyze text content
 * POST /api/content-analysis/text
 * Body: { text: string }
 */
router.post('/text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const analysis = await contentAnalysisService.analyzeText(text);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Text analysis error:');
    res.status(500).json({
      success: false,
      error: 'Failed to analyze text',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Analyze website content
 * POST /api/content-analysis/website
 * Body: { url: string }
 */
router.post('/website', async (req, res) => {
  try {
    const { url } = req.body;

    logger.info({ receivedUrl: url, bodyKeys: Object.keys(req.body || {}), contentType: req.headers['content-type'] }, '[ContentAnalysis] /website request received');

    if (!url) {
      logger.warn({ body: req.body }, '[ContentAnalysis] /website rejected — url missing');
      return res.status(400).json({ error: 'url is required' });
    }

    let safeUrl: string;
    try {
      safeUrl = validateExternalUrl(url);
    } catch (validationError) {
      logger.warn({ url, err: validationError }, '[ContentAnalysis] /website rejected — URL validation failed');
      return res.status(400).json({ error: 'Invalid or unsafe URL' });
    }

    const analysis = await contentAnalysisService.analyzeWebsite(safeUrl);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Website analysis error:');
    res.status(500).json({
      success: false,
      error: 'Failed to analyze website',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Batch analyze content for a social media post or campaign
 * POST /api/content-analysis/batch
 * Body: {
 *   mediaType: 'image' | 'video' | 'text',
 *   mediaUrl?: string,
 *   text?: string,
 *   landingPageUrl?: string,
 *   videoDuration?: number
 * }
 */
router.post('/batch', async (req, res) => {
  try {
    const { mediaType, mediaUrl, text, landingPageUrl, videoDuration } = req.body;

    const results: Record<string, unknown> = {};

    if (mediaType === 'image' && mediaUrl) {
      results.image = await contentAnalysisService.analyzeImage(mediaUrl);
    }

    if (mediaType === 'video' && mediaUrl) {
      results.video = await contentAnalysisService.analyzeVideo(
        mediaUrl,
        videoDuration || 30
      );
    }

    if (text) {
      results.text = await contentAnalysisService.analyzeText(text);
    }

    if (landingPageUrl) {
      results.website = await contentAnalysisService.analyzeWebsite(landingPageUrl);
    }

    res.json({
      success: true,
      contentAnalysis: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Batch analysis error:');
    res.status(500).json({
      success: false,
      error: 'Failed to perform batch analysis',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get content analysis for existing post or campaign
 * GET /api/content-analysis/:type/:id
 * type: 'post' | 'campaign'
 * id: post or campaign ID
 */
router.get('/:type/:id', requireAuth, async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type !== 'post' && type !== 'campaign') {
      return res.status(400).json({
        error: 'Invalid type. Must be "post" or "campaign"',
      });
    }

    if (type === 'post') {
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);

      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      return res.json({
        success: true,
        type: 'post',
        id: post.id,
        content: post.content,
        platform: post.platform,
        status: post.status,
        approvalStatus: post.approvalStatus,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        engagementData: post.engagement || null,
        mediaUrls: post.mediaUrls || [],
      });
    }

    if (type === 'campaign') {
      const [campaign] = await db
        .select()
        .from(adCampaigns)
        .where(eq(adCampaigns.id, id))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      return res.json({
        success: true,
        type: 'campaign',
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        platform: campaign.platform,
        budget: campaign.budget,
        performance: campaign.performance,
        targetAudience: campaign.targetAudience,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      });
    }
  } catch (error) {
    logger.warn({ err: error }, 'Content analysis retrieval error:');
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve content analysis',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

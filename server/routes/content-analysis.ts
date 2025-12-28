/**
 * Content Analysis API Routes
 * Provides endpoints for analyzing multimodal content (images, videos, audio, text, websites)
 * Powers AI autopilot learning from actual content features, not just engagement metrics
 */

import { Router } from 'express';
import { contentAnalysisService } from '../services/contentAnalysisService.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { logger } from '../logger.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for content analysis endpoints (expensive operations)
const contentAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per 15 minutes
  message: 'Too many content analysis requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

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

    const analysis = await contentAnalysisService.analyzeImage(imageUrl);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Image analysis error:', error);
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

    const analysis = await contentAnalysisService.analyzeVideo(
      videoUrl,
      duration || 30
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Video analysis error:', error);
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

    const analysis = await contentAnalysisService.analyzeAudio(
      audioUrl,
      metadata
    );

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Audio analysis error:', error);
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
    logger.error('Text analysis error:', error);
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

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    const analysis = await contentAnalysisService.analyzeWebsite(url);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Website analysis error:', error);
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

    const results: any = {};

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
    logger.error('Batch analysis error:', error);
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
router.get('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type !== 'post' && type !== 'campaign') {
      return res.status(400).json({
        error: 'Invalid type. Must be "post" or "campaign"',
      });
    }

    res.json({
      success: true,
      message: 'Content analysis retrieval endpoint',
      note: 'To be implemented with database integration',
    });
  } catch (error) {
    logger.error('Content analysis retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve content analysis',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

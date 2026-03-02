import { Router, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { db } from '../db';
import { eq, and, desc, sql, gte, lte, sum, count, inArray } from 'drizzle-orm';
import { royaltyTransactions, royaltyStatements, instantPayouts, royaltySplits, taxForms, royaltyDisputes, systemSettings, distroReleases, distroTracks } from '@shared/schema';
import { storageService } from '../services/storageService';
import * as codeGenerationService from '../services/distributionCodeGenerationService';
import { distributionService } from '../services/distributionService';
import { labelGridService } from '../services/labelgrid-service';
import { musicCodesService, isrcGenerator, upcGenerator } from '../services/musicCodes';
import { labelCopyLinter, type ReleaseMetadata, type LintResult } from '../services/labelCopyLinter';
import { dspPolicyChecker, DSP_POLICIES, type ComplianceResult } from '../services/dspPolicyChecker';
import { releaseWorkflowService, type TakedownReason } from '../services/releaseWorkflow';
import { audioFingerprintService, type DuplicateCheckResult } from '../services/audioFingerprint';
import { logger } from '../logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

interface AuthenticatedUser {
  id: string;
  email?: string;
  username?: string;
  role?: string;
}

interface DispatchStatus {
  id: string;
  providerId: string;
  providerName?: string;
  status: string;
  logs?: string;
}

interface TakedownStatus {
  platform: string;
  platformName?: string;
  status: string;
  requestedAt?: string;
  completedAt?: string;
  reason?: string;
  explanation?: string;
}

interface HyperFollowLinks {
  platforms?: Array<{ id: string; name: string; enabled: boolean; url?: string }>;
  socialLinks?: Array<{ platform: string; url: string }>;
  artistName?: string;
  description?: string;
  releaseId?: string;
  collectEmails?: boolean;
  theme?: { primaryColor: string; backgroundColor: string; textColor: string; buttonStyle: string };
  analytics?: {
    pageViews: number;
    preSaves: number;
    emailSignups: number;
    platformClicks: Record<string, number>;
  };
  emailList?: string[];
}

interface HyperFollowPage {
  id: string;
  userId: string;
  title: string;
  slug: string;
  imageUrl?: string | null;
  links: HyperFollowLinks;
  clicks?: number;
  presaves?: number;
}

interface PayoutRecord {
  id: string;
  amount: number;
  status?: string;
  createdAt?: Date;
}

const router = Router();

// Configure multer for audio and artwork uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'distribution');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// Validation schemas
const createReleaseSchema = z.object({
  title: z.string().min(1),
  artistName: z.string().min(1),
  releaseType: z.enum(['single', 'EP', 'album']),
  primaryGenre: z.string().min(1),
  secondaryGenre: z.string().optional(),
  language: z.string().min(1),
  labelName: z.string().optional(),
  copyrightYear: z.number().int().min(1900),
  copyrightOwner: z.string().min(1),
  publishingRights: z.string().optional(),
  isExplicit: z.boolean().default(false),
  moodTags: z.array(z.string()).optional(),
  releaseDate: z.string().optional(),
  territoryMode: z.enum(['worldwide', 'include', 'exclude']).default('worldwide'),
  territories: z.array(z.string()).optional(),
  selectedPlatforms: z.array(z.string()).optional(),
});

const updateReleaseSchema = createReleaseSchema.partial();

const createTrackSchema = z.object({
  title: z.string().min(1),
  trackNumber: z.number().int().min(1),
  explicit: z.boolean().default(false),
  lyrics: z.string().optional(),
  lyricsLanguage: z.string().optional(),
});

const generateCodeSchema = z.object({
  trackId: z.string().optional(),
  releaseId: z.string().optional(),
  artist: z.string(),
  title: z.string(),
});

const createRoyaltySplitSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['songwriter', 'producer', 'performer', 'manager', 'featured_artist']),
  percentage: z.number().min(0.1).max(100),
});

// Middleware to ensure user is authenticated
// ===================
// RELEASE ENDPOINTS
// ===================

// GET /api/distribution/releases - List user's releases
router.get('/releases', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const distroRels = await storage.getDistroReleasesByArtist(userId);
    res.json(distroRels);
  } catch (error: unknown) {
    logger.error('Error fetching releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
});

// POST /api/distribution/releases - Create new release draft
router.post('/releases', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const data = createReleaseSchema.parse(req.body);

    const release = await storage.createDistroRelease({
      artistId: userId,
      title: data.title,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
      metadata: {
        artistName: data.artistName,
        releaseType: data.releaseType,
        primaryGenre: data.primaryGenre,
        secondaryGenre: data.secondaryGenre,
        language: data.language,
        labelName: data.labelName,
        copyrightYear: data.copyrightYear,
        copyrightOwner: data.copyrightOwner,
        publishingRights: data.publishingRights,
        isExplicit: data.isExplicit,
        moodTags: data.moodTags,
        territoryMode: data.territoryMode,
        territories: data.territories,
        selectedPlatforms: data.selectedPlatforms,
      },
    });

    res.json(release);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error creating release:', error);
    res.status(500).json({ error: 'Failed to create release' });
  }
});

// GET /api/distribution/releases/:id - Get single release
router.get('/releases/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    res.json(release);
  } catch (error: unknown) {
    logger.error('Error fetching release:', error);
    res.status(500).json({ error: 'Failed to fetch release' });
  }
});

// PATCH /api/distribution/releases/:id - Update release metadata
router.patch('/releases/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;
    const updates = updateReleaseSchema.parse(req.body);

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const updatedRelease = await storage.updateDistroRelease(id, {
      title: updates.title,
      releaseDate: updates.releaseDate ? new Date(updates.releaseDate) : undefined,
      metadata: {
        ...release.metadata,
        ...updates,
      },
    });

    res.json(updatedRelease);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error updating release:', error);
    res.status(500).json({ error: 'Failed to update release' });
  }
});

// DELETE /api/distribution/releases/:id - Delete/takedown release
router.delete('/releases/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    // If release is live on LabelGrid, initiate takedown
    const metadata = release.metadata as any;
    if (metadata?.labelGridReleaseId && release.status !== 'draft') {
      try {
        await labelGridService.takedownRelease(metadata.labelGridReleaseId);
        logger.info(`✅ LabelGrid takedown initiated for release ${metadata.labelGridReleaseId}`);
      } catch (error: unknown) {
        logger.error('Error initiating LabelGrid takedown:', error);
        // Continue with local deletion even if LabelGrid fails
      }
    }

    // Delete from local database
    await storage.deleteDistroRelease(id);
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting release:', error);
    res.status(500).json({ error: 'Failed to delete release' });
  }
});

// ===================
// TRACK ENDPOINTS
// ===================

// POST /api/distribution/releases/:id/tracks - Upload track audio
router.post(
  '/releases/:id/tracks',
  requireAuth,
  upload.single('audio'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as AuthenticatedUser).id;
      const { id: releaseId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Audio file required' });
      }

      const release = await storage.getDistroRelease(releaseId);
      if (!release || release.artistId !== userId) {
        return res.status(404).json({ error: 'Release not found' });
      }

      // SECURITY FIX: Wrap JSON.parse in try-catch to prevent unhandled exceptions on invalid JSON
      let parsedMetadata: unknown;
      try {
        parsedMetadata = JSON.parse(req.body.metadata || '{}');
      } catch (parseError) {
        return res.status(400).json({ error: 'Invalid JSON in metadata field' });
      }
      const data = createTrackSchema.parse(parsedMetadata);

      const track = await storage.createDistroTrack({
        releaseId,
        title: data.title,
        trackNumber: data.trackNumber,
        audioUrl: `/uploads/distribution/${file.filename}`,
        metadata: {
          explicit: data.explicit,
          lyrics: data.lyrics,
          lyricsLanguage: data.lyricsLanguage,
        },
      });

      res.json(track);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error uploading track:', error);
      res.status(500).json({ error: 'Failed to upload track' });
    }
  }
);

// PATCH /api/distribution/releases/:releaseId/tracks/:trackId - Update track metadata
router.patch(
  '/releases/:releaseId/tracks/:trackId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as AuthenticatedUser).id;
      const { releaseId, trackId } = req.params;

      const release = await storage.getDistroRelease(releaseId);
      if (!release || release.artistId !== userId) {
        return res.status(404).json({ error: 'Release not found' });
      }

      const updates = createTrackSchema.partial().parse(req.body);
      const track = await storage.updateDistroTrack(trackId, releaseId, updates);
      if (!track) {
        return res.status(404).json({ error: 'Track not found in this release' });
      }

      res.json(track);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error updating track:', error);
      res.status(500).json({ error: 'Failed to update track' });
    }
  }
);

// DELETE /api/distribution/releases/:releaseId/tracks/:trackId - Remove track
router.delete(
  '/releases/:releaseId/tracks/:trackId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as AuthenticatedUser).id;
      const { releaseId, trackId } = req.params;

      const release = await storage.getDistroRelease(releaseId);
      if (!release || release.artistId !== userId) {
        return res.status(404).json({ error: 'Release not found' });
      }

      const deleted = await storage.deleteDistroTrack(trackId, releaseId);
      if (!deleted) {
        return res.status(404).json({ error: 'Track not found in this release' });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      logger.error('Error deleting track:', error);
      res.status(500).json({ error: 'Failed to delete track' });
    }
  }
);

// ===================
// CODE GENERATION ENDPOINTS
// ===================

// POST /api/distribution/codes/isrc - Generate ISRC code
router.post('/codes/isrc', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { trackId, artist, title } = generateCodeSchema.parse(req.body);

    let isrcCode: string;
    let assignedTo: string = `${artist} - ${title}`;

    try {
      const result = await labelGridService.generateISRC(artist, title);
      isrcCode = result.code;
      assignedTo = result.assignedTo || assignedTo;
    } catch (lgError) {
      logger.warn('LabelGrid ISRC generation failed, falling back to internal generator:', lgError);
      const fallback = musicCodesService.generateISRC(userId);
      isrcCode = fallback.code;
    }

    if (trackId && trackId !== `temp_${Date.now()}`) {
      try {
        await codeGenerationService.generateISRC(userId, trackId, artist, title);
      } catch (storeErr) {
        logger.warn('Failed to store ISRC in database:', storeErr);
      }
    }

    res.json({ isrc: isrcCode, assignedTo });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error generating ISRC:', error);
    res.status(500).json({ error: 'Failed to generate ISRC' });
  }
});

// POST /api/distribution/codes/upc - Generate UPC code
router.post('/codes/upc', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const upcSchema = z.object({ releaseId: z.string().optional(), title: z.string() });
    const { releaseId, title } = upcSchema.parse(req.body);

    let upcCode: string;
    let assignedTo: string = title;

    try {
      const result = await labelGridService.generateUPC(title);
      upcCode = result.code;
      assignedTo = result.assignedTo || assignedTo;
    } catch (lgError) {
      logger.warn('LabelGrid UPC generation failed, falling back to internal generator:', lgError);
      const fallback = musicCodesService.generateUPC(userId);
      upcCode = fallback.code;
    }

    if (releaseId && releaseId !== `temp_${Date.now()}`) {
      try {
        await codeGenerationService.generateUPC(userId, releaseId, title);
      } catch (storeErr) {
        logger.warn('Failed to store UPC in database:', storeErr);
      }
    }

    res.json({ upc: upcCode, assignedTo });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error generating UPC:', error);
    res.status(500).json({ error: 'Failed to generate UPC' });
  }
});

// POST /api/distribution/codes/validate - Validate existing code
router.post('/codes/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { code, type } = z
      .object({
        code: z.string(),
        type: z.enum(['isrc', 'upc']),
      })
      .parse(req.body);

    let result;
    if (type === 'isrc') {
      result = await codeGenerationService.verifyISRC(code);
    } else {
      result = await codeGenerationService.verifyUPC(code);
    }

    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error validating code:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

// ===================
// PLATFORM ENDPOINTS
// ===================

// GET /api/distribution/platforms - Get all DSP providers
// Uses LabelGrid API when configured, falls back to local database
router.get('/platforms', requireAuth, async (_req: Request, res: Response) => {
  try {
    // Use LabelGrid's dynamic DSP fetching (correct method)
    // This fetches from LabelGrid API if configured, otherwise uses local catalog
    const response = await labelGridService.getAvailableDSPs();
    
    // Transform to expected format for frontend
    const platforms = response.dsps.map(dsp => ({
      id: dsp.id,
      name: dsp.name,
      slug: dsp.slug,
      category: dsp.category,
      region: dsp.region,
      isActive: dsp.isActive,
      processingTime: dsp.processingTime,
      requirements: dsp.requirements,
      logoUrl: dsp.logoUrl,
    }));
    
    res.json({
      platforms,
      total: response.total,
      source: labelGridService.isApiConfigured() ? 'labelgrid_api' : 'local_catalog',
      syncedAt: response.syncedAt,
    });
  } catch (error: unknown) {
    logger.error('Error fetching platforms:', error);
    res.status(500).json({ error: 'Failed to fetch platforms' });
  }
});

// POST /api/distribution/platforms/verify - Verify local DSP catalog status
router.post('/platforms/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await labelGridService.verifyDSPCatalog();
    res.json({
      success: true,
      ...result,
      message: `DSP catalog verified: ${result.total} platforms (${result.active} active)`,
    });
  } catch (error: unknown) {
    logger.error('Error verifying platforms:', error);
    res.status(500).json({ error: 'Failed to verify platforms' });
  }
});

// GET /api/distribution/platforms/status - Check LabelGrid API and DSP catalog status
router.get('/platforms/status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const catalogStatus = await labelGridService.verifyDSPCatalog();
    res.json({
      labelGridConfigured: labelGridService.isApiConfigured(),
      catalogSource: 'local_database',
      catalog: catalogStatus,
      message: labelGridService.isApiConfigured()
        ? 'LabelGrid API configured. DSP catalog maintained locally, platforms validated during distribution.'
        : 'LabelGrid API not configured. DSP catalog available for reference.',
      architecture: 'LabelGrid API handles releases/distribution/analytics. DSP catalog maintained locally.',
    });
  } catch (error: unknown) {
    logger.error('Error checking platform status:', error);
    res.status(500).json({ error: 'Failed to check platform status' });
  }
});

// POST /api/distribution/releases/:id/schedule - Schedule release date
router.post('/releases/:id/schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;
    const { releaseDate } = z
      .object({
        releaseDate: z.string(),
      })
      .parse(req.body);

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const updatedRelease = await storage.updateDistroRelease(id, {
      releaseDate: new Date(releaseDate),
    });

    res.json(updatedRelease);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error scheduling release:', error);
    res.status(500).json({ error: 'Failed to schedule release' });
  }
});

// ===========================
// HYPERFOLLOW CAMPAIGN ENDPOINTS
// ===========================

const hyperFollowSchema = z.object({
  title: z.string().min(1),
  artistName: z.string().min(1),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  headerImage: z.string().optional(),
  releaseId: z.string().optional(),
  collectEmails: z.boolean().default(true),
  platforms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      url: z.string().optional(),
    })
  ),
  socialLinks: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string(),
      })
    )
    .optional(),
  theme: z.object({
    primaryColor: z.string(),
    backgroundColor: z.string(),
    textColor: z.string(),
    buttonStyle: z.enum(['rounded', 'square', 'pill']),
  }),
});

// POST /api/distribution/hyperfollow - Create campaign
router.post(
  '/hyperfollow',
  requireAuth,
  upload.single('headerImage'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as AuthenticatedUser).id;
      const file = req.file;

      let bodyData: any;
      try {
        bodyData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : (req.body.data || req.body);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Invalid JSON in request body' });
      }

      const hyperFollowCreateSchema = z.object({
        title: z.string().min(1),
        artistName: z.string().min(1),
        slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/).optional(),
        description: z.string().optional(),
        headerImage: z.string().optional(),
        releaseId: z.string().optional(),
        collectEmails: z.boolean().default(true),
        platforms: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            enabled: z.boolean(),
            url: z.string().optional(),
          })
        ).optional().default([]),
        socialLinks: z.array(
          z.object({
            platform: z.string(),
            url: z.string(),
          })
        ).optional(),
        theme: z.object({
          primaryColor: z.string(),
          backgroundColor: z.string(),
          textColor: z.string(),
          buttonStyle: z.enum(['rounded', 'square', 'pill']),
        }).optional(),
      });

      const data = hyperFollowCreateSchema.parse(bodyData);

      const slug = data.slug || data.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 40) + '-' + Math.random().toString(36).substring(2, 8);

      const headerImageUrl = file ? `/uploads/distribution/${file.filename}` : data.headerImage || null;

      const campaign = await storage.createHyperFollowPage({
        userId,
        title: data.title,
        slug,
        imageUrl: headerImageUrl,
        links: {
          platforms: data.platforms,
          socialLinks: data.socialLinks,
          artistName: data.artistName,
          description: data.description,
          releaseId: data.releaseId,
          collectEmails: data.collectEmails,
          theme: data.theme || { primaryColor: '#6366f1', backgroundColor: '#1e1b4b', textColor: '#ffffff', buttonStyle: 'rounded' },
          analytics: {
            pageViews: 0,
            preSaves: 0,
            emailSignups: 0,
            platformClicks: {},
          },
          emailList: [],
        },
      });

      if (!campaign) {
        return res.status(500).json({ error: 'Failed to create campaign - database insert returned null' });
      }

      res.json(campaign);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error creating HyperFollow campaign:', error);
      res.status(500).json({ error: 'Failed to create campaign' });
    }
  }
);

// GET /api/distribution/hyperfollow - List user campaigns
router.get('/hyperfollow', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const campaigns = await storage.getHyperFollowPages(userId);
    res.json(campaigns);
  } catch (error: unknown) {
    logger.error('Error fetching HyperFollow campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// GET /api/distribution/hyperfollow/analytics - Get hyperfollow analytics (MUST be before :slug)
router.get('/hyperfollow/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const pages = await storage.getHyperFollowPages(userId) as HyperFollowPage[];
    
    if (pages.length === 0) {
      return res.json({
        totalClicks: 0,
        totalPresaves: 0,
        conversionRate: 0,
        topPlatforms: [],
      });
    }
    
    const totalClicks = pages.reduce((sum: number, p: HyperFollowPage) => sum + (p.clicks || 0), 0);
    const totalPresaves = pages.reduce((sum: number, p: HyperFollowPage) => sum + (p.presaves || 0), 0);
    const conversionRate = totalClicks > 0 ? (totalPresaves / totalClicks) * 100 : 0;
    
    res.json({
      totalClicks,
      totalPresaves,
      conversionRate,
      topPlatforms: [],
    });
  } catch (error: unknown) {
    logger.error('Error fetching hyperfollow analytics:', error);
    res.status(500).json({ error: 'Failed to fetch hyperfollow analytics' });
  }
});

// GET /api/distribution/hyperfollow/:slug - Get campaign by slug (public endpoint)
router.get('/hyperfollow/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const campaign = await storage.getHyperFollowPageBySlug(slug);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error: unknown) {
    logger.error('Error fetching HyperFollow campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// PATCH /api/distribution/hyperfollow/:id - Update campaign
router.patch(
  '/hyperfollow/:id',
  requireAuth,
  upload.single('headerImage'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as AuthenticatedUser).id;
      const { id } = req.params;
      const file = req.file;

      const campaign = await storage.getHyperFollowPage(id);
      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const data = hyperFollowSchema.partial().parse(JSON.parse(req.body.data || '{}'));

      const headerImageUrl = file
        ? `/uploads/distribution/${file.filename}`
        : data.headerImage || campaign.imageUrl;

      const existingLinks = campaign.links as HyperFollowLinks;
      const updatedCampaign = await storage.updateHyperFollowPage(id, {
        title: data.title || campaign.title,
        slug: data.slug || campaign.slug,
        imageUrl: headerImageUrl,
        links: {
          ...existingLinks,
          platforms: data.platforms || existingLinks.platforms,
          socialLinks: data.socialLinks || existingLinks.socialLinks,
          artistName: data.artistName || existingLinks.artistName,
          description:
            data.description !== undefined ? data.description : existingLinks.description,
          collectEmails:
            data.collectEmails !== undefined
              ? data.collectEmails
              : existingLinks.collectEmails,
          theme: data.theme || existingLinks.theme,
        },
      });

      res.json(updatedCampaign);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error updating HyperFollow campaign:', error);
      res.status(500).json({ error: 'Failed to update campaign' });
    }
  }
);

// DELETE /api/distribution/hyperfollow/:id - Delete campaign
router.delete('/hyperfollow/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const campaign = await storage.getHyperFollowPage(id);
    if (!campaign || campaign.userId !== userId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await storage.deleteHyperFollowPage(id);
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting HyperFollow campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// POST /api/distribution/hyperfollow/:slug/track - Track visitor (analytics)
router.post('/hyperfollow/:slug/track', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { eventType, platform, email } = z
      .object({
        eventType: z.enum(['pageView', 'preSave', 'emailSignup', 'platformClick']),
        platform: z.string().optional(),
        email: z.string().email().optional(),
      })
      .parse(req.body);

    const campaign = await storage.getHyperFollowPageBySlug(slug);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const links = campaign.links as HyperFollowLinks;
    const analytics = links.analytics || {
      pageViews: 0,
      preSaves: 0,
      emailSignups: 0,
      platformClicks: {} as Record<string, number>,
    };

    // Update analytics
    if (eventType === 'pageView') {
      analytics.pageViews = (analytics.pageViews || 0) + 1;
    } else if (eventType === 'preSave') {
      analytics.preSaves = (analytics.preSaves || 0) + 1;
    } else if (eventType === 'emailSignup' && email) {
      analytics.emailSignups = (analytics.emailSignups || 0) + 1;
      const emailList = links.emailList || [];
      if (!emailList.includes(email)) {
        emailList.push(email);
        links.emailList = emailList;
      }
    } else if (eventType === 'platformClick' && platform) {
      analytics.platformClicks = analytics.platformClicks || {};
      analytics.platformClicks[platform] = (analytics.platformClicks[platform] || 0) + 1;
    }

    // Save updated analytics
    await storage.updateHyperFollowPage(campaign.id, {
      links: {
        ...links,
        analytics,
      },
    });

    res.json({ success: true, analytics });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error tracking HyperFollow event:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// ===========================
// RELEASE STATUS & MONITORING ENDPOINTS
// ===========================

// GET /api/distribution/releases/:id/status - Get delivery status per DSP
router.get('/releases/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    // Get real-time status from LabelGrid if we have an external release ID
    const metadata = release.metadata as any;
    let labelGridStatus = null;

    if (metadata?.labelGridReleaseId) {
      try {
        labelGridStatus = await labelGridService.getReleaseStatus(metadata.labelGridReleaseId);

        // Update local database with latest status
        if (labelGridStatus.platforms) {
          for (const platformStatus of labelGridStatus.platforms) {
            await storage.updateDistroDispatchStatus(id, {
              providerId: platformStatus.platform,
              status: platformStatus.status,
              liveAt: platformStatus.liveDate ? new Date(platformStatus.liveDate) : undefined,
              error: platformStatus.errorMessage,
            });
          }
        }
      } catch (error: unknown) {
        logger.error('Error fetching LabelGrid status:', error);
        // Fall back to database status
      }
    }

    // Get dispatch status from database
    const statuses = await storage.getDistroDispatchStatuses(id);

    // Calculate overall progress
    const liveCount = statuses.filter((s: unknown) => s.status === 'live').length;
    const totalCount = statuses.length || 1;
    const overallProgress = (liveCount / totalCount) * 100;

    res.json({
      statuses: statuses.map((status: unknown) => ({
        platform: status.providerId,
        platformName: status.providerName || status.providerId,
        status: status.status,
        externalId: status.externalId,
        estimatedGoLive: status.estimatedGoLive,
        deliveredAt: status.deliveredAt,
        liveAt: status.liveAt,
        errorMessage: status.error,
        errorResolution: status.errorResolution,
        lastChecked: status.updatedAt,
      })),
      overallProgress: Math.round(overallProgress),
      labelGridStatus: labelGridStatus
        ? {
            releaseId: labelGridStatus.releaseId,
            status: labelGridStatus.status,
            estimatedLiveDate: labelGridStatus.estimatedLiveDate,
          }
        : null,
    });
  } catch (error: unknown) {
    logger.error('Error fetching release status:', error);
    res.status(500).json({ error: 'Failed to fetch release status' });
  }
});

// POST /api/distribution/releases/:id/check-status - Force status refresh
router.post('/releases/:id/check-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const releaseMetadata = release.metadata as any;
    const currentStatus = releaseMetadata?.status || release.status || 'draft';

    if (currentStatus === 'draft') {
      return res.json({
        success: true,
        status: 'draft',
        message: 'Release has not been submitted yet. Submit it first before checking status.',
        platforms: [],
        lastChecked: new Date(),
      });
    }

    try {
      const statusResult = await distributionService.refreshReleaseStatus(id);
      res.json({
        success: true,
        status: statusResult.status,
        platforms: statusResult.platforms,
        lastChecked: statusResult.lastChecked,
        message: 'Status refreshed successfully',
      });
    } catch (refreshError) {
      logger.warn('Status refresh failed, returning current status:', refreshError);
      const currentPlatforms = (release.metadata as any)?.platforms || [];
      res.json({
        success: true,
        status: currentStatus,
        platforms: Array.isArray(currentPlatforms) ? currentPlatforms.map((p: any) => ({
          platform: typeof p === 'string' ? p : p.platform || p.name,
          status: p.status || 'unknown',
        })) : [],
        lastChecked: new Date(),
        message: 'Could not reach distribution service. Showing last known status.',
      });
    }
  } catch (error: unknown) {
    logger.error('Error refreshing release status:', error);
    res.status(500).json({ error: 'Failed to refresh release status' });
  }
});

// ===========================
// DDEX PACKAGE ENDPOINTS
// ===========================

import { ddexPackageService } from '../services/ddexPackageService';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '../logger.js';

// POST /api/distribution/releases/:id/ddex/preview - Generate and preview XML
router.post('/releases/:id/ddex/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const tracks = await storage.getDistroTracks(id);

    const metadata = (release.metadata as any) || {};
    const xml = await ddexPackageService.generateDDEXXML(
      {
        id: release.id,
        title: release.title || '',
        artistName: metadata.artistName || 'Unknown Artist',
        releaseType: metadata.releaseType || 'Single',
        upc: metadata.upc || '',
        releaseDate: release.releaseDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        labelName: metadata.labelName || '',
        copyrightYear: metadata.copyrightYear || new Date().getFullYear().toString(),
        copyrightOwner: metadata.copyrightOwner || metadata.artistName || '',
        publishingRights: metadata.publishingRights || '',
        primaryGenre: metadata.primaryGenre || 'Other',
        secondaryGenre: metadata.secondaryGenre,
        isExplicit: metadata.isExplicit || false,
        coverArtPath: release.artworkUrl || metadata.coverArtUrl || null,
        territories: metadata.territories || ['worldwide'],
      },
      tracks.map((track: any, index: number) => {
        const trackMeta = (track.metadata as any) || {};
        return {
          id: track.id,
          title: track.title || `Track ${index + 1}`,
          isrc: track.isrc || trackMeta.isrc || '',
          trackNumber: index + 1,
          duration: track.duration || 0,
          audioFilePath: track.audioUrl || '',
          explicit: trackMeta.explicit || false,
          lyrics: trackMeta.lyrics,
          primaryArtist: metadata.artistName || 'Unknown Artist',
          featuredArtists: trackMeta.featuredArtists,
          songwriters: trackMeta.songwriters,
          producers: trackMeta.producers,
        };
      })
    );

    // Validate XML
    const validation = await ddexPackageService.validateDDEXXML(xml);

    res.json({
      xml,
      validation,
    });
  } catch (error: unknown) {
    logger.error('Error generating DDEX preview:', error);
    res.status(500).json({ error: 'Failed to generate DDEX preview' });
  }
});

// GET /api/distribution/releases/:id/ddex/download - Download DDEX package (.zip)
router.get('/releases/:id/ddex/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const tracks = await storage.getDistroTracks(id);
    if (!tracks || tracks.length === 0) {
      return res.status(400).json({ error: 'Release has no tracks. Add tracks before downloading a DDEX package.' });
    }

    const metadata = (release.metadata as any) || {};
    const upc = metadata.upc || '';
    const coverArtPath = release.artworkUrl || metadata.coverArtUrl || null;

    const outputPath = path.join(uploadDir, `ddex_${id}_${Date.now()}.zip`);

    try {
      await ddexPackageService.createDDEXPackage(
        {
          id: release.id,
          title: release.title || '',
          artistName: metadata.artistName || 'Unknown Artist',
          releaseType: metadata.releaseType || 'Single',
          upc: upc,
          releaseDate: release.releaseDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
          labelName: metadata.labelName || '',
          copyrightYear: metadata.copyrightYear || new Date().getFullYear().toString(),
          copyrightOwner: metadata.copyrightOwner || metadata.artistName || '',
          publishingRights: metadata.publishingRights || '',
          primaryGenre: metadata.primaryGenre || 'Other',
          secondaryGenre: metadata.secondaryGenre,
          isExplicit: metadata.isExplicit || false,
          coverArtPath: coverArtPath,
          territories: metadata.territories || ['worldwide'],
        },
        tracks.map((track: any, index: number) => {
          const trackMeta = (track.metadata as any) || {};
          return {
            id: track.id,
            title: track.title || `Track ${index + 1}`,
            isrc: track.isrc || trackMeta.isrc || '',
            trackNumber: index + 1,
            duration: track.duration || 0,
            audioFilePath: track.audioUrl ? path.join(process.cwd(), track.audioUrl) : '',
            explicit: trackMeta.explicit || false,
            lyrics: trackMeta.lyrics,
            primaryArtist: metadata.artistName || 'Unknown Artist',
            featuredArtists: trackMeta.featuredArtists,
            songwriters: trackMeta.songwriters,
            producers: trackMeta.producers,
          };
        }),
        outputPath
      );
    } catch (packageError) {
      logger.error('Error generating DDEX package content:', packageError);
      return res.status(500).json({ error: 'Failed to generate DDEX package. Some required track files may be missing.' });
    }

    res.download(outputPath, `${release.title || 'release'}_DDEX.zip`, (err) => {
      if (err && !res.headersSent) {
        logger.error('Error downloading DDEX package:', err);
      }
      try {
        fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        logger.warn('Failed to clean up DDEX temp file:', cleanupErr);
      }
    });
  } catch (error: unknown) {
    logger.error('Error creating DDEX package:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create DDEX package' });
    }
  }
});

// POST /api/distribution/releases/:id/submit - Submit release for distribution
router.post('/releases/:id/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const metadata = release.metadata as any;

    // HARDENING: Validate status transition - prevent duplicate submissions
    const currentStatus = metadata?.status || release.status;
    const validSubmissionStatuses = ['draft', 'pending', 'rejected'];
    if (!validSubmissionStatuses.includes(currentStatus)) {
      return res.status(400).json({ 
        error: 'Invalid status transition',
        message: `Cannot submit release with status '${currentStatus}'. Only releases in draft, pending, or rejected status can be submitted.`
      });
    }

    // HARDENING: Validate UPC before submission
    if (!release.upc) {
      return res.status(400).json({ 
        error: 'Missing UPC',
        message: 'A valid UPC code is required before submission. Generate one in the release metadata.'
      });
    }
    // Basic UPC format validation (12-13 digits)
    const upcClean = release.upc.replace(/\D/g, '');
    if (upcClean.length !== 12 && upcClean.length !== 13) {
      return res.status(400).json({ 
        error: 'Invalid UPC format',
        message: 'UPC must be 12 or 13 digits.'
      });
    }

    // HARDENING: Validate tracks exist and have ISRCs
    const tracks = await storage.getDistroTracks(id);
    if (!tracks || tracks.length === 0) {
      return res.status(400).json({ 
        error: 'No tracks',
        message: 'At least one track is required before submission.'
      });
    }

    const tracksWithoutISRC = tracks.filter((t: any) => !t.isrc);
    if (tracksWithoutISRC.length > 0) {
      return res.status(400).json({ 
        error: 'Missing ISRC codes',
        message: `${tracksWithoutISRC.length} track(s) are missing ISRC codes. All tracks require valid ISRC codes before submission.`,
        tracksMissing: tracksWithoutISRC.map((t: any) => ({ id: t.id, title: t.title }))
      });
    }

    // HARDENING: Validate ISRC format for all tracks (12 alphanumeric characters)
    const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
    const invalidISRCs = tracks.filter((t: any) => {
      const isrcClean = (t.isrc || '').replace(/[-\s]/g, '').toUpperCase();
      return !isrcPattern.test(isrcClean);
    });
    if (invalidISRCs.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid ISRC format',
        message: `${invalidISRCs.length} track(s) have invalid ISRC format. ISRC must be 12 characters (CC-XXX-YY-NNNNN).`,
        tracksInvalid: invalidISRCs.map((t: any) => ({ id: t.id, title: t.title, isrc: t.isrc }))
      });
    }

    // HARDENING: Validate selected platforms
    const selectedPlatforms = metadata.selectedPlatforms || [];
    if (selectedPlatforms.length === 0) {
      return res.status(400).json({ 
        error: 'No platforms selected',
        message: 'At least one distribution platform must be selected.'
      });
    }

    // Update release status to submitted
    await storage.updateDistroRelease(id, {
      metadata: { ...metadata, status: 'submitted' },
    });

    // Create dispatch records for each selected platform
    for (const platformSlug of selectedPlatforms) {
      const provider = await storage.getDSPProviderBySlug(platformSlug);
      if (provider) {
        await storage.createDistroDispatch({
          releaseId: id,
          providerId: provider.id,
          status: 'queued',
        });
      }
    }

    // AUDIT: Log successful submission for tracking
    logger.info(`Release ${id} submitted for distribution to ${selectedPlatforms.length} platforms`, {
      releaseId: id,
      userId,
      platforms: selectedPlatforms,
      trackCount: tracks.length
    });

    res.json({ success: true, message: 'Release submitted for distribution' });
  } catch (error: unknown) {
    logger.error('Error submitting release:', error);
    res.status(500).json({ error: 'Failed to submit release' });
  }
});

// ===========================
// TAKEDOWN ENDPOINTS
// ===========================

const takedownSchema = z.object({
  reason: z.string().min(1),
  explanation: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  allPlatforms: z.boolean().default(true),
});

// POST /api/distribution/releases/:id/takedown - Request takedown
router.post('/releases/:id/takedown', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const data = takedownSchema.parse(req.body);

    // Update dispatch statuses for takedown
    const statuses = await storage.getDistroDispatchStatuses(id) as DispatchStatus[];
    const platformsToTakedown = data.allPlatforms
      ? statuses.map((s: DispatchStatus) => s.providerId)
      : data.platforms || [];

    for (const status of statuses) {
      if (platformsToTakedown.includes(status.providerId)) {
        await storage.updateDistroDispatch(status.id, {
          status: 'takedown_requested',
          logs: JSON.stringify({
            reason: data.reason,
            explanation: data.explanation,
            requestedAt: new Date().toISOString(),
          }),
        });
      }
    }

    // Log takedown request
    await storage.createAuditLog({
      userId,
      action: 'release_takedown_requested',
      resourceType: 'release',
      resourceId: id,
      metadata: {
        reason: data.reason,
        explanation: data.explanation,
        platforms: platformsToTakedown,
      },
    });

    res.json({
      success: true,
      message: 'Takedown request submitted',
      estimatedCompletionDays: 14,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error requesting takedown:', error);
    res.status(500).json({ error: 'Failed to request takedown' });
  }
});

// GET /api/distribution/releases/:id/takedown-status - Check takedown progress
router.get('/releases/:id/takedown-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const statuses = await storage.getDistroDispatchStatuses(id) as DispatchStatus[];
    const takedownStatuses: TakedownStatus[] = statuses
      .filter((s: DispatchStatus) => s.status === 'takedown_requested' || s.status === 'removed')
      .map((s: DispatchStatus) => {
        const logs = s.logs ? JSON.parse(s.logs) : {};
        return {
          platform: s.providerId,
          platformName: s.providerName,
          status: s.status,
          requestedAt: logs.requestedAt,
          completedAt: logs.completedAt,
          reason: logs.reason,
          explanation: logs.explanation,
        };
      });

    const allCompleted = takedownStatuses.every((s: TakedownStatus) => s.status === 'removed');
    const totalRequested = takedownStatuses.length;
    const totalCompleted = takedownStatuses.filter((s: TakedownStatus) => s.status === 'removed').length;

    res.json({
      statuses: takedownStatuses,
      summary: {
        totalRequested,
        totalCompleted,
        allCompleted,
        progressPercentage: totalRequested > 0 ? (totalCompleted / totalRequested) * 100 : 0,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching takedown status:', error);
    res.status(500).json({ error: 'Failed to fetch takedown status' });
  }
});

// ===========================
// ANALYTICS ENDPOINTS
// ===========================

// GET /api/distribution/releases/:id/analytics - Get release analytics from LabelGrid
router.get('/releases/:id/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const metadata = release.metadata as any;

    // Get analytics from LabelGrid if we have an external release ID
    if (metadata?.labelGridReleaseId) {
      try {
        const analytics = await labelGridService.getReleaseAnalytics(metadata.labelGridReleaseId);

        // Save analytics to database for historical tracking
        await storage.createAnalytics({
          userId,
          projectId: release.projectId || undefined,
          date: new Date(),
          totalStreams: analytics.totalStreams,
          totalRevenue: analytics.totalRevenue.toString(),
          platformData: analytics.platforms,
          trackData: analytics.timeline,
        });

        res.json(analytics);
      } catch (error: unknown) {
        logger.error('Error fetching LabelGrid analytics:', error);
        res.status(500).json({
          error: 'Failed to fetch analytics from LabelGrid',
          message: 'Please try again later or check your LabelGrid connection',
        });
      }
    } else {
      // Return empty analytics if no LabelGrid release ID
      res.json({
        releaseId: id,
        totalStreams: 0,
        totalRevenue: 0,
        platforms: {},
        timeline: [],
        message: 'Release not yet distributed to LabelGrid',
      });
    }
  } catch (error: unknown) {
    logger.error('Error fetching release analytics:', error);
    res.status(500).json({ error: 'Failed to fetch release analytics' });
  }
});

// ===========================
// DISTRIBUTION RIGOR ENDPOINTS
// ===========================

// Validation schemas for Distribution Rigor
const validateReleaseSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  albumArtist: z.string().optional(),
  genre: z.string().optional(),
  subGenre: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseType: z.enum(['single', 'EP', 'album', 'compilation']).optional(),
  label: z.string().optional(),
  copyrightHolder: z.string().optional(),
  copyrightYear: z.number().optional(),
  publishingHolder: z.string().optional(),
  upc: z.string().optional(),
  isExplicit: z.boolean().optional(),
  language: z.string().optional(),
  tracks: z.array(z.object({
    title: z.string(),
    artist: z.string().optional(),
    featuredArtists: z.array(z.string()).optional(),
    isrc: z.string().optional(),
    duration: z.number().optional(),
    trackNumber: z.number().optional(),
    discNumber: z.number().optional(),
    isExplicit: z.boolean().optional(),
    lyrics: z.string().optional(),
    lyricsLanguage: z.string().optional(),
    composers: z.array(z.string()).optional(),
    producers: z.array(z.string()).optional(),
    genre: z.string().optional(),
  })).optional(),
  coverArt: z.object({
    url: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    format: z.string().optional(),
    fileSize: z.number().optional(),
  }).optional(),
  dsp: z.string().optional(),
});

const generateCodesSchema = z.object({
  type: z.enum(['isrc', 'upc', 'both']),
  countryCode: z.string().length(2).optional(),
  count: z.number().int().min(1).max(100).optional(),
  releaseId: z.string().optional(),
  trackIds: z.array(z.string()).optional(),
});

const validateCodeSchema = z.object({
  code: z.string(),
  type: z.enum(['isrc', 'upc']),
});

const workflowTakedownSchema = z.object({
  releaseId: z.string(),
  reason: z.enum([
    'artist_request',
    'rights_dispute',
    'copyright_claim',
    'quality_issue',
    'incorrect_metadata',
    'duplicate_content',
    'policy_violation',
    'legal_order',
    'label_request',
    'distribution_agreement_terminated',
    'other'
  ]),
  customReason: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  urgency: z.enum(['normal', 'urgent', 'emergency']).optional(),
  notes: z.string().optional(),
});

const updateRequestSchema = z.object({
  releaseId: z.string(),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
    changeType: z.enum(['metadata', 'audio', 'artwork', 'credits', 'pricing', 'availability']),
  })),
  notes: z.string().optional(),
});

const duplicateCheckSchema = z.object({
  audioPath: z.string().optional(),
  trackId: z.string(),
  releaseId: z.string(),
  threshold: z.number().min(0).max(1).optional(),
  excludeOwn: z.boolean().optional(),
});

// POST /api/distribution/validate - Validate release for distribution
router.post('/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = validateReleaseSchema.parse(req.body);
    
    const releaseMetadata: ReleaseMetadata = {
      title: data.title,
      artist: data.artist,
      albumArtist: data.albumArtist,
      genre: data.genre,
      subGenre: data.subGenre,
      releaseDate: data.releaseDate,
      releaseType: data.releaseType,
      label: data.label,
      copyrightHolder: data.copyrightHolder,
      copyrightYear: data.copyrightYear,
      publishingHolder: data.publishingHolder,
      upc: data.upc,
      isExplicit: data.isExplicit,
      language: data.language,
      tracks: data.tracks?.map(t => ({
        title: t.title,
        artist: t.artist,
        featuredArtists: t.featuredArtists,
        isrc: t.isrc,
        duration: t.duration,
        trackNumber: t.trackNumber,
        discNumber: t.discNumber,
        isExplicit: t.isExplicit,
        lyrics: t.lyrics,
        lyricsLanguage: t.lyricsLanguage,
        composers: t.composers,
        producers: t.producers,
        genre: t.genre,
      })),
      coverArt: data.coverArt,
    };

    let lintResult: LintResult;
    if (data.dsp) {
      lintResult = labelCopyLinter.validateForDSP(releaseMetadata, data.dsp);
    } else {
      lintResult = labelCopyLinter.lint(releaseMetadata);
    }

    let dspCompliance: { [dsp: string]: ComplianceResult } | undefined;
    if (data.dsp) {
      const compliance = await dspPolicyChecker.checkCompliance({
        title: data.title,
        artist: data.artist,
        albumArtist: data.albumArtist,
        label: data.label,
        genre: data.genre,
        releaseDate: data.releaseDate,
        coverArtMetadata: data.coverArt,
        tracks: data.tracks?.map(t => ({
          title: t.title,
          artist: t.artist,
          lyrics: t.lyrics,
          duration: t.duration,
        })),
      }, data.dsp);
      dspCompliance = { [data.dsp]: compliance };
    } else {
      dspCompliance = await dspPolicyChecker.checkAllDSPs({
        title: data.title,
        artist: data.artist,
        albumArtist: data.albumArtist,
        label: data.label,
        genre: data.genre,
        releaseDate: data.releaseDate,
        coverArtMetadata: data.coverArt,
        tracks: data.tracks?.map(t => ({
          title: t.title,
          artist: t.artist,
          lyrics: t.lyrics,
          duration: t.duration,
        })),
      });
    }

    const fixSuggestions = labelCopyLinter.suggestFixes(lintResult.errors);

    res.json({
      valid: lintResult.valid && Object.values(dspCompliance).every(c => c.compliant),
      lint: lintResult,
      dspCompliance,
      fixSuggestions,
      summary: {
        errorCount: lintResult.errors.length,
        warningCount: lintResult.warnings.length,
        score: lintResult.score,
        compliantDSPs: Object.entries(dspCompliance)
          .filter(([_, c]) => c.compliant)
          .map(([dsp]) => dsp),
        nonCompliantDSPs: Object.entries(dspCompliance)
          .filter(([_, c]) => !c.compliant)
          .map(([dsp]) => dsp),
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error validating release:', error);
    res.status(500).json({ error: 'Failed to validate release' });
  }
});

// POST /api/distribution/generate-codes - Generate UPC/ISRC codes
router.post('/generate-codes', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const data = generateCodesSchema.parse(req.body);
    
    const results: {
      isrcs?: { code: string; formatted: string }[];
      upc?: { code: string; formatted: string; checkDigit: string };
    } = {};

    const countryCode = data.countryCode?.toUpperCase() || 'US';

    if (data.type === 'isrc' || data.type === 'both') {
      const count = data.count || 1;
      results.isrcs = musicCodesService.generateBulkISRCs(userId, count, countryCode);
    }

    if (data.type === 'upc' || data.type === 'both') {
      const upcResult = musicCodesService.generateUPC(userId);
      results.upc = {
        code: upcResult.code,
        formatted: upcResult.formatted,
        checkDigit: upcResult.checkDigit || '',
      };
    }

    res.json({
      success: true,
      codes: results,
      metadata: {
        generatedAt: new Date().toISOString(),
        countryCode,
        userId,
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error generating codes:', error);
    res.status(500).json({ error: 'Failed to generate codes' });
  }
});

// POST /api/distribution/validate-code - Validate existing UPC/ISRC code
router.post('/validate-code', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = validateCodeSchema.parse(req.body);
    
    let result;
    let parsed = null;

    if (data.type === 'isrc') {
      result = musicCodesService.validateISRC(data.code);
      if (result.valid) {
        try {
          parsed = musicCodesService.parseISRC(data.code);
        } catch (e) {
          // Ignore parse errors
        }
      }
    } else {
      result = musicCodesService.validateUPC(data.code);
    }

    res.json({
      code: data.code,
      type: data.type,
      valid: result.valid,
      errors: result.errors,
      parsed,
      formatted: data.type === 'isrc' && result.valid 
        ? musicCodesService.formatISRC(data.code) 
        : data.code,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error validating code:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

// POST /api/distribution/lint - Lint release metadata
router.post('/lint', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = validateReleaseSchema.parse(req.body);
    
    const releaseMetadata: ReleaseMetadata = {
      title: data.title,
      artist: data.artist,
      albumArtist: data.albumArtist,
      genre: data.genre,
      releaseDate: data.releaseDate,
      releaseType: data.releaseType,
      label: data.label,
      copyrightHolder: data.copyrightHolder,
      copyrightYear: data.copyrightYear,
      publishingHolder: data.publishingHolder,
      upc: data.upc,
      isExplicit: data.isExplicit,
      language: data.language,
      tracks: data.tracks?.map(t => ({
        title: t.title,
        artist: t.artist,
        featuredArtists: t.featuredArtists,
        isrc: t.isrc,
        duration: t.duration,
        trackNumber: t.trackNumber,
        discNumber: t.discNumber,
        isExplicit: t.isExplicit,
        lyrics: t.lyrics,
        lyricsLanguage: t.lyricsLanguage,
        composers: t.composers,
        producers: t.producers,
        genre: t.genre,
      })),
      coverArt: data.coverArt,
    };

    const result = data.dsp 
      ? labelCopyLinter.validateForDSP(releaseMetadata, data.dsp)
      : labelCopyLinter.lint(releaseMetadata);

    const suggestions = labelCopyLinter.suggestFixes(result.errors);
    const { fixed, appliedFixes } = labelCopyLinter.autoFix(releaseMetadata);

    res.json({
      result,
      suggestions,
      autoFix: {
        available: appliedFixes.length > 0,
        fixes: appliedFixes,
        fixedMetadata: appliedFixes.length > 0 ? fixed : undefined,
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error linting release:', error);
    res.status(500).json({ error: 'Failed to lint release' });
  }
});

// GET /api/distribution/policies/:dsp - Get DSP policies
router.get('/policies/:dsp', async (req: Request, res: Response) => {
  try {
    const { dsp } = req.params;
    
    const policy = dspPolicyChecker.getPolicy(dsp);
    if (!policy) {
      return res.status(404).json({ 
        error: 'DSP not found',
        availableDSPs: dspPolicyChecker.listDSPs(),
      });
    }

    const summary = dspPolicyChecker.getRequirementsSummary(dsp);

    res.json({
      dsp: policy.id,
      name: policy.name,
      policy,
      summary,
    });
  } catch (error: unknown) {
    logger.error('Error fetching DSP policy:', error);
    res.status(500).json({ error: 'Failed to fetch DSP policy' });
  }
});

// GET /api/distribution/policies - Get all DSP policies
router.get('/policies', async (_req: Request, res: Response) => {
  try {
    const policies = dspPolicyChecker.getAllPolicies();
    const dsps = dspPolicyChecker.listDSPs();

    res.json({
      count: policies.length,
      dsps,
      policies: policies.map(p => ({
        id: p.id,
        name: p.name,
        summary: dspPolicyChecker.getRequirementsSummary(p.id),
      })),
    });
  } catch (error: unknown) {
    logger.error('Error fetching DSP policies:', error);
    res.status(500).json({ error: 'Failed to fetch DSP policies' });
  }
});

// POST /api/distribution/workflow/takedown - Request release takedown via workflow
router.post('/workflow/takedown', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const data = workflowTakedownSchema.parse(req.body);
    
    const release = await storage.getDistroRelease(data.releaseId);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const result = await releaseWorkflowService.requestTakedown(
      data.releaseId,
      userId,
      {
        reason: data.reason as TakedownReason,
        customReason: data.customReason,
        platforms: data.platforms,
        urgency: data.urgency,
        notes: data.notes,
      }
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      requestId: result.requestId,
      message: 'Takedown request submitted successfully',
      estimatedProcessingTime: data.urgency === 'emergency' ? '24 hours' : 
                               data.urgency === 'urgent' ? '3-5 days' : '7-14 days',
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error requesting takedown:', error);
    res.status(500).json({ error: 'Failed to request takedown' });
  }
});

// POST /api/distribution/workflow/update - Request release update via workflow
router.post('/workflow/update', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const data = updateRequestSchema.parse(req.body);
    
    const release = await storage.getDistroRelease(data.releaseId);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const result = await releaseWorkflowService.requestUpdate(
      data.releaseId,
      userId,
      data.changes,
      data.notes
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      requestId: result.requestId,
      message: 'Update request submitted successfully',
      changeCount: data.changes.length,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error requesting update:', error);
    res.status(500).json({ error: 'Failed to request update' });
  }
});

// GET /api/distribution/workflow/:releaseId/history - Get release workflow history
router.get('/workflow/:releaseId/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId } = req.params;
    
    const release = await storage.getDistroRelease(releaseId);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const stateHistory = releaseWorkflowService.getStateHistory(releaseId);
    const auditLog = releaseWorkflowService.getAuditLog(releaseId, { limit: 50 });
    const takedownRequests = releaseWorkflowService.getTakedownRequestsForRelease(releaseId);
    const updateRequests = releaseWorkflowService.getUpdateRequestsForRelease(releaseId);

    res.json({
      releaseId,
      currentState: release.status,
      stateHistory,
      auditLog,
      takedownRequests,
      updateRequests,
      validTransitions: releaseWorkflowService.getValidTransitions(release.status as any),
    });
  } catch (error: unknown) {
    logger.error('Error fetching workflow history:', error);
    res.status(500).json({ error: 'Failed to fetch workflow history' });
  }
});

// GET /api/distribution/workflow/takedown-reasons - Get available takedown reasons
router.get('/workflow/takedown-reasons', async (_req: Request, res: Response) => {
  try {
    const reasons = releaseWorkflowService.getAllTakedownReasons();
    res.json({ reasons });
  } catch (error: unknown) {
    logger.error('Error fetching takedown reasons:', error);
    res.status(500).json({ error: 'Failed to fetch takedown reasons' });
  }
});

// POST /api/distribution/fingerprint/check - Check for duplicate audio content
router.post('/fingerprint/check', requireAuth, upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const file = req.file;
    
    let data;
    if (req.body.data) {
      data = duplicateCheckSchema.parse(JSON.parse(req.body.data));
    } else {
      data = duplicateCheckSchema.parse(req.body);
    }
    
    const audioPath = file ? file.path : data.audioPath;
    if (!audioPath) {
      return res.status(400).json({ error: 'Audio file or path is required' });
    }

    const result = await audioFingerprintService.checkDuplicates(
      audioPath,
      data.trackId,
      data.releaseId,
      {
        threshold: data.threshold,
        excludeOwn: data.excludeOwn,
      }
    );

    res.json({
      isDuplicate: result.isDuplicate,
      confidence: result.confidence,
      matchCount: result.matches.length,
      matches: result.matches.slice(0, 5),
      warnings: result.warnings,
      checkedAt: result.checkedAt,
      recommendation: result.isDuplicate 
        ? 'This content appears to match existing releases. Please verify you have the rights to distribute.'
        : result.warnings.length > 0
          ? 'Some similarities detected. Review warnings before proceeding.'
          : 'No duplicates detected. Content appears to be original.',
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error checking duplicates:', error);
    res.status(500).json({ error: 'Failed to check for duplicates' });
  }
});

// POST /api/distribution/fingerprint/generate - Generate fingerprint for a track
router.post('/fingerprint/generate', requireAuth, upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { trackId, releaseId } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    if (!trackId || !releaseId) {
      return res.status(400).json({ error: 'trackId and releaseId are required' });
    }

    const fingerprint = await audioFingerprintService.generateFingerprint(
      file.path,
      trackId,
      releaseId
    );

    res.json({
      success: true,
      fingerprint: {
        id: fingerprint.id,
        trackId: fingerprint.trackId,
        releaseId: fingerprint.releaseId,
        duration: fingerprint.duration,
        algorithm: fingerprint.algorithm,
        createdAt: fingerprint.createdAt,
      },
    });
  } catch (error: unknown) {
    logger.error('Error generating fingerprint:', error);
    res.status(500).json({ error: 'Failed to generate fingerprint' });
  }
});

// GET /api/distribution/fingerprint/:trackId/similar - Find similar tracks
router.get('/fingerprint/:trackId/similar', requireAuth, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;
    const threshold = parseFloat(req.query.threshold as string) || 0.5;
    const maxResults = parseInt(req.query.maxResults as string) || 10;

    const similarTracks = await audioFingerprintService.findSimilarTracks(trackId, {
      threshold,
      maxResults,
    });

    res.json({
      trackId,
      similarCount: similarTracks.length,
      threshold,
      results: similarTracks,
    });
  } catch (error: unknown) {
    logger.error('Error finding similar tracks:', error);
    res.status(500).json({ error: 'Failed to find similar tracks' });
  }
});

// GET /api/distribution/fingerprint/stats - Get fingerprint system stats
router.get('/fingerprint/stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = audioFingerprintService.getStats();
    res.json(stats);
  } catch (error: unknown) {
    logger.error('Error fetching fingerprint stats:', error);
    res.status(500).json({ error: 'Failed to fetch fingerprint stats' });
  }
});

// GET /api/distribution/country-codes - Get valid ISRC country codes
router.get('/country-codes', async (_req: Request, res: Response) => {
  try {
    const countryCodes = musicCodesService.getValidCountryCodes();
    res.json({ countryCodes });
  } catch (error: unknown) {
    logger.error('Error fetching country codes:', error);
    res.status(500).json({ error: 'Failed to fetch country codes' });
  }
});

// POST /api/distribution/register-codes - Register custom ISRC/UPC prefixes
router.post('/register-codes', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { isrcRegistrantCode, upcCompanyPrefix } = z.object({
      isrcRegistrantCode: z.string().length(3).optional(),
      upcCompanyPrefix: z.string().min(6).max(10).optional(),
    }).parse(req.body);

    const registered: string[] = [];

    if (isrcRegistrantCode) {
      musicCodesService.registerISRCCode(userId, isrcRegistrantCode);
      registered.push(`ISRC registrant code: ${isrcRegistrantCode}`);
    }

    if (upcCompanyPrefix) {
      musicCodesService.registerUPCPrefix(userId, upcCompanyPrefix);
      registered.push(`UPC company prefix: ${upcCompanyPrefix}`);
    }

    if (registered.length === 0) {
      return res.status(400).json({ error: 'No codes provided to register' });
    }

    res.json({
      success: true,
      registered,
      message: 'Code prefixes registered successfully',
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error registering codes:', error);
    res.status(500).json({ error: 'Failed to register codes' });
  }
});

// ============================================================================
// CATALOG IMPORT ROUTES
// ============================================================================

import { catalogImporter } from '../services/catalogImporter';

const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const releaseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// POST /api/distribution/catalog/import - Start catalog import from file
router.post('/catalog/import', requireAuth, catalogUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const extension = path.extname(file.originalname).toLowerCase();
    let fileType: 'csv' | 'xlsx' | 'ddex';
    
    if (extension === '.csv') {
      fileType = 'csv';
    } else if (extension === '.xlsx' || extension === '.xls') {
      fileType = 'xlsx';
    } else if (extension === '.xml') {
      fileType = 'ddex';
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Use CSV, XLSX, or DDEX XML' });
    }

    const jobId = await catalogImporter.createImportJob(
      userId,
      file.originalname,
      fileType,
      file.size
    );

    let rows;
    
    if (fileType === 'csv') {
      const content = file.buffer.toString('utf-8');
      rows = await catalogImporter.parseCSV(content);
    } else if (fileType === 'ddex') {
      const content = file.buffer.toString('utf-8');
      rows = await catalogImporter.parseDDEX(content);
    } else if (fileType === 'xlsx') {
      rows = await catalogImporter.parseXLSX(file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ 
        error: 'No valid data rows found',
        message: 'The file must contain at least one row with title or track title'
      });
    }

    const preValidation = await catalogImporter.validateRows(rows, jobId);
    
    if (preValidation.validRows.length === 0) {
      return res.status(400).json({
        error: 'Schema validation failed',
        message: 'No valid rows found after validation',
        errors: preValidation.errors,
        warnings: preValidation.warnings
      });
    }

    const result = await catalogImporter.importRows(jobId, userId, rows);

    res.json({
      success: true,
      ...result
    });
  } catch (error: unknown) {
    logger.error('Error importing catalog:', error);
    res.status(500).json({ error: 'Failed to import catalog' });
  }
});

// GET /api/distribution/catalog/jobs - Get import jobs for user
router.get('/catalog/jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const jobs = await catalogImporter.getImportJobs(userId);
    res.json({ jobs });
  } catch (error: unknown) {
    logger.error('Error fetching import jobs:', error);
    res.status(500).json({ error: 'Failed to fetch import jobs' });
  }
});

// GET /api/distribution/catalog/jobs/:jobId - Get specific import job details
router.get('/catalog/jobs/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await catalogImporter.getImportJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    const rows = await catalogImporter.getImportRows(jobId);
    
    res.json({ job, rows });
  } catch (error: unknown) {
    logger.error('Error fetching import job:', error);
    res.status(500).json({ error: 'Failed to fetch import job' });
  }
});

// GET /api/distribution/catalog/template - Get CSV template
router.get('/catalog/template', async (_req: Request, res: Response) => {
  try {
    const template = catalogImporter.getTemplateCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=catalog-import-template.csv');
    res.send(template);
  } catch (error: unknown) {
    logger.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// GET /api/distribution/catalog/formats - Get supported import formats
router.get('/catalog/formats', async (_req: Request, res: Response) => {
  try {
    const formats = catalogImporter.getSupportedFormats();
    res.json({ formats });
  } catch (error: unknown) {
    logger.error('Error fetching formats:', error);
    res.status(500).json({ error: 'Failed to fetch formats' });
  }
});

// ============================================================================
// RELEASE SCHEDULING ROUTES
// ============================================================================

import { releaseScheduler } from '../services/releaseScheduler';

// POST /api/distribution/schedule - Schedule a release
router.post('/schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId, scheduledDate, timezone, platforms, optimizeForFriday } = z.object({
      releaseId: z.string().uuid(),
      scheduledDate: z.string().transform(s => new Date(s)),
      timezone: z.string().optional(),
      platforms: z.array(z.string()).optional(),
      optimizeForFriday: z.boolean().optional()
    }).parse(req.body);

    const result = await releaseScheduler.scheduleRelease({
      releaseId,
      userId,
      scheduledDate,
      timezone,
      platforms,
      optimizeForFriday
    });

    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error scheduling release:', error);
    res.status(500).json({ error: 'Failed to schedule release' });
  }
});

// GET /api/distribution/schedule/upcoming - Get upcoming scheduled releases
router.get('/schedule/upcoming', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const releases = await releaseScheduler.getUpcomingReleases(userId, limit);
    res.json({ releases });
  } catch (error: unknown) {
    logger.error('Error fetching upcoming releases:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming releases' });
  }
});

// GET /api/distribution/schedule/countdown/:releaseId - Get countdown for release
router.get('/schedule/countdown/:releaseId', async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.params;
    const countdown = await releaseScheduler.getCountdown(releaseId);
    
    if (!countdown) {
      return res.status(404).json({ error: 'Release not found or not scheduled' });
    }

    res.json(countdown);
  } catch (error: unknown) {
    logger.error('Error fetching countdown:', error);
    res.status(500).json({ error: 'Failed to fetch countdown' });
  }
});

// GET /api/distribution/schedule/platforms - Get platform scheduling windows
router.get('/schedule/platforms', async (_req: Request, res: Response) => {
  try {
    const windows = releaseScheduler.getPlatformWindows();
    res.json({ platforms: windows });
  } catch (error: unknown) {
    logger.error('Error fetching platform windows:', error);
    res.status(500).json({ error: 'Failed to fetch platform windows' });
  }
});

// GET /api/distribution/schedule/optimal - Get optimal release time
router.get('/schedule/optimal', async (req: Request, res: Response) => {
  try {
    const timezone = (req.query.timezone as string) || 'UTC';
    const optimal = releaseScheduler.getOptimalReleaseTime(timezone);
    res.json(optimal);
  } catch (error: unknown) {
    logger.error('Error fetching optimal time:', error);
    res.status(500).json({ error: 'Failed to fetch optimal time' });
  }
});

// POST /api/distribution/schedule/validate - Validate scheduling for platforms
router.post('/schedule/validate', async (req: Request, res: Response) => {
  try {
    const { scheduledDate, platforms } = z.object({
      scheduledDate: z.string().transform(s => new Date(s)),
      platforms: z.array(z.string())
    }).parse(req.body);

    const validation = releaseScheduler.validateScheduleForPlatforms(scheduledDate, platforms);
    res.json(validation);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error validating schedule:', error);
    res.status(500).json({ error: 'Failed to validate schedule' });
  }
});

// GET /api/distribution/schedule/lead-time - Get recommended lead time for platforms
router.get('/schedule/lead-time', async (req: Request, res: Response) => {
  try {
    const platforms = (req.query.platforms as string)?.split(',') || [];
    const recommendation = releaseScheduler.getRecommendedLeadTime(platforms);
    res.json(recommendation);
  } catch (error: unknown) {
    logger.error('Error fetching lead time recommendation:', error);
    res.status(500).json({ error: 'Failed to fetch lead time recommendation' });
  }
});

// GET /api/distribution/schedule/timezones - Get supported timezones
router.get('/schedule/timezones', async (_req: Request, res: Response) => {
  try {
    const timezones = releaseScheduler.getSupportedTimezones();
    res.json({ timezones });
  } catch (error: unknown) {
    logger.error('Error fetching timezones:', error);
    res.status(500).json({ error: 'Failed to fetch timezones' });
  }
});

// POST /api/distribution/presave - Create pre-save campaign
router.post('/presave', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId, name, startDate, platforms, artwork } = z.object({
      releaseId: z.string().uuid(),
      name: z.string().min(1),
      startDate: z.string().transform(s => new Date(s)),
      platforms: z.array(z.string()),
      artwork: z.string().optional()
    }).parse(req.body);

    const result = await releaseScheduler.createPreSaveCampaign({
      releaseId,
      userId,
      name,
      startDate,
      platforms,
      artwork
    });

    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error creating pre-save campaign:', error);
    res.status(500).json({ error: 'Failed to create pre-save campaign' });
  }
});

// ============================================================================
// ENHANCED IDENTIFIER SERVICE ROUTES
// ============================================================================

import { identifierService } from '../services/identifierService';

// POST /api/distribution/identifiers/upc/generate - Generate UPC
router.post('/identifiers/upc/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId } = req.body;
    
    const upc = await identifierService.generateUPC({ userId, releaseId });
    res.json({ upc, valid: true });
  } catch (error: unknown) {
    logger.error('Error generating UPC:', error);
    res.status(500).json({ error: 'Failed to generate UPC' });
  }
});

// POST /api/distribution/identifiers/upc/validate - Validate UPC
router.post('/identifiers/upc/validate', async (req: Request, res: Response) => {
  try {
    const { upc } = z.object({ upc: z.string() }).parse(req.body);
    const result = identifierService.validateUPC(upc);
    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error validating UPC:', error);
    res.status(500).json({ error: 'Failed to validate UPC' });
  }
});

// POST /api/distribution/identifiers/isrc/generate - Generate ISRC
router.post('/identifiers/isrc/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { countryCode, registrantCode, trackId } = z.object({
      countryCode: z.string().length(2).default('US'),
      registrantCode: z.string().min(3).max(5).default('MXB'),
      trackId: z.string().optional()
    }).parse(req.body);
    
    const isrc = await identifierService.generateISRC(countryCode, registrantCode, undefined, { userId, trackId });
    res.json({ isrc, valid: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error generating ISRC:', error);
    res.status(500).json({ error: 'Failed to generate ISRC' });
  }
});

// POST /api/distribution/identifiers/isrc/validate - Validate ISRC
router.post('/identifiers/isrc/validate', async (req: Request, res: Response) => {
  try {
    const { isrc } = z.object({ isrc: z.string() }).parse(req.body);
    const result = identifierService.validateISRC(isrc);
    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error validating ISRC:', error);
    res.status(500).json({ error: 'Failed to validate ISRC' });
  }
});

// POST /api/distribution/identifiers/isrc/batch - Reserve batch of ISRCs
router.post('/identifiers/isrc/batch', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { count, countryCode, registrantCode } = z.object({
      count: z.number().int().min(1).max(100),
      countryCode: z.string().length(2).default('US'),
      registrantCode: z.string().min(3).max(5).default('MXB')
    }).parse(req.body);
    
    const isrcs = await identifierService.reserveISRCBatch(count, countryCode, registrantCode, userId);
    res.json({ isrcs, count: isrcs.length });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error reserving ISRC batch:', error);
    res.status(500).json({ error: 'Failed to reserve ISRC batch' });
  }
});

// GET /api/distribution/identifiers/country-codes - Get valid ISRC country codes
router.get('/identifiers/country-codes', async (_req: Request, res: Response) => {
  try {
    const countryCodes = identifierService.getValidCountryCodes();
    res.json({ countryCodes });
  } catch (error: unknown) {
    logger.error('Error fetching country codes:', error);
    res.status(500).json({ error: 'Failed to fetch country codes' });
  }
});

// GET /api/distribution/identifiers/genres - Get valid genres
router.get('/identifiers/genres', async (_req: Request, res: Response) => {
  try {
    const genres = identifierService.getValidGenres();
    res.json({ genres });
  } catch (error: unknown) {
    logger.error('Error fetching genres:', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

// ============================================================================
// ENHANCED WORKFLOW SERVICE ROUTES
// ============================================================================

import { releaseWorkflowService as enhancedWorkflowService } from '../services/releaseWorkflowService';

// POST /api/distribution/workflow/transition - Transition release status
router.post('/workflow/transition', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId, targetStatus, requestType, reason, metadata } = z.object({
      releaseId: z.string().uuid(),
      targetStatus: z.string(),
      requestType: z.string(),
      reason: z.string().optional(),
      metadata: z.record(z.any()).optional()
    }).parse(req.body);
    
    const result = await enhancedWorkflowService.transition(
      releaseId,
      userId,
      targetStatus as any,
      requestType as any,
      { reason, metadata }
    );
    
    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error transitioning release:', error);
    res.status(500).json({ error: 'Failed to transition release' });
  }
});

// GET /api/distribution/workflow/history/:releaseId - Get workflow history
router.get('/workflow/history/:releaseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.params;
    const history = await enhancedWorkflowService.getWorkflowHistory(releaseId);
    res.json({ history });
  } catch (error: unknown) {
    logger.error('Error fetching workflow history:', error);
    res.status(500).json({ error: 'Failed to fetch workflow history' });
  }
});

// GET /api/distribution/workflow/versions/:releaseId - Get version history
router.get('/workflow/versions/:releaseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.params;
    const versions = await enhancedWorkflowService.getVersionHistory(releaseId);
    res.json({ versions });
  } catch (error: unknown) {
    logger.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// GET /api/distribution/workflow/transitions/:status - Get valid transitions for status
router.get('/workflow/transitions/:status', async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    const validTransitions = enhancedWorkflowService.getValidTransitions(status as any);
    res.json({ 
      currentStatus: status, 
      validTransitions,
      displayName: enhancedWorkflowService.getStatusDisplayName(status as any),
      color: enhancedWorkflowService.getStatusColor(status as any)
    });
  } catch (error: unknown) {
    logger.error('Error fetching transitions:', error);
    res.status(500).json({ error: 'Failed to fetch transitions' });
  }
});

// POST /api/distribution/workflow/takedown - Request takedown
router.post('/workflow/takedown', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId, reason, platforms, effectiveDate } = z.object({
      releaseId: z.string().uuid(),
      reason: z.string().min(1),
      platforms: z.array(z.string()).optional(),
      effectiveDate: z.string().transform(s => new Date(s)).optional()
    }).parse(req.body);
    
    const result = await enhancedWorkflowService.requestTakedown({
      releaseId,
      userId,
      reason,
      platforms,
      effectiveDate
    });
    
    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error requesting takedown:', error);
    res.status(500).json({ error: 'Failed to request takedown' });
  }
});

// POST /api/distribution/workflow/update - Request metadata update
router.post('/workflow/update', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { releaseId, changes, reason } = z.object({
      releaseId: z.string().uuid(),
      changes: z.array(z.object({
        field: z.string(),
        oldValue: z.any(),
        newValue: z.any()
      })),
      reason: z.string().optional()
    }).parse(req.body);
    
    const result = await enhancedWorkflowService.requestUpdate({
      releaseId,
      userId,
      changes,
      reason
    });
    
    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error requesting update:', error);
    res.status(500).json({ error: 'Failed to request update' });
  }
});

// ============================================================================
// DISTRIBUTION ANALYTICS ENDPOINTS (Frontend Compatibility)
// These endpoints return real data from the database, or empty/null when dormant
// ============================================================================

// GET /api/distribution/analytics/growth - Get analytics growth data
router.get('/analytics/growth', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const analyticsData = await storage.getDistroAnalytics(userId);
    
    if (!analyticsData) {
      return res.json({ streams: 0, downloads: 0, revenue: 0, growth: 0, platforms: [], trends: [] });
    }
    
    res.json(analyticsData);
  } catch (error: unknown) {
    logger.error('Error fetching analytics growth:', error);
    res.status(500).json({ error: 'Failed to fetch analytics growth' });
  }
});

// GET /api/distribution/streaming-trends - Get streaming trends data
router.get('/streaming-trends', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const trends = await storage.getStreamingTrends(userId);
    res.json(trends);
  } catch (error: unknown) {
    logger.error('Error fetching streaming trends:', error);
    res.status(500).json({ error: 'Failed to fetch streaming trends' });
  }
});

// GET /api/distribution/geographic - Get geographic distribution data
router.get('/geographic', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const data = await storage.getGeographicData(userId);
    res.json(data);
  } catch (error: unknown) {
    logger.error('Error fetching geographic data:', error);
    res.status(500).json({ error: 'Failed to fetch geographic data' });
  }
});

// GET /api/distribution/earnings/breakdown - Get earnings breakdown
router.get('/earnings/breakdown', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Single SQL aggregate query — returns 1 row regardless of transaction count
    const [agg] = await db.select({
      totalEarnings: sql<number>`COALESCE(SUM(${royaltyTransactions.amount}), 0)`,
      pendingEarnings: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.status} = 'pending' THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
      paidOut: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.status} = 'paid' THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
      thisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.createdAt} >= ${thisMonthStart} THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
      lastMonth: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.createdAt} >= ${lastMonthStart} AND ${royaltyTransactions.createdAt} <= ${lastMonthEnd} THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
    }).from(royaltyTransactions).where(eq(royaltyTransactions.userId, userId));

    const te = Number(agg.totalEarnings);
    const lm = Number(agg.lastMonth);
    const tm = Number(agg.thisMonth);
    const growth = lm > 0 ? ((tm - lm) / lm) * 100 : 0;

    res.json({
      totalEarnings: te,
      pendingEarnings: Number(agg.pendingEarnings),
      paidOut: Number(agg.paidOut),
      thisMonth: tm,
      lastMonth: lm,
      growth,
    });
  } catch (error: unknown) {
    logger.error('Error fetching earnings breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch earnings breakdown' });
  }
});

// GET /api/distribution/platform-earnings - Get earnings by platform
router.get('/platform-earnings', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;

    // SQL GROUP BY — O(platforms) rows instead of O(all_transactions)
    const rows = await db.select({
      platform: sql<string>`COALESCE(${royaltyTransactions.platform}, 'unknown')`,
      totalEarnings: sql<number>`COALESCE(SUM(${royaltyTransactions.amount}), 0)`,
      streams: sql<number>`COALESCE(SUM(${royaltyTransactions.streamCount}), 0)`,
      transactions: sql<number>`COUNT(*)`,
    }).from(royaltyTransactions)
      .where(eq(royaltyTransactions.userId, userId))
      .groupBy(sql`COALESCE(${royaltyTransactions.platform}, 'unknown')`)
      .orderBy(sql`SUM(${royaltyTransactions.amount}) DESC`);

    res.json(rows.map(r => ({
      platform: r.platform,
      totalEarnings: Number(r.totalEarnings),
      streams: Number(r.streams),
      transactions: Number(r.transactions),
    })));
  } catch (error: unknown) {
    logger.error('Error fetching platform earnings:', error);
    res.status(500).json({ error: 'Failed to fetch platform earnings' });
  }
});

// GET /api/distribution/payout-history - Get payout history
router.get('/payout-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const payouts = await storage.getPayoutHistory(userId);
    res.json(payouts);
  } catch (error: unknown) {
    logger.error('Error fetching payout history:', error);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});


// ===========================
// ADDITIONAL MISSING ENDPOINTS
// ===========================

// GET /api/distribution/claims - Get content claims
router.get('/claims', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ claims: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// GET /api/distribution/disputes - Get disputes
router.get('/disputes', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ disputes: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching disputes:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// GET /api/distribution/qc - Quality control status
router.get('/qc', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ pending: [], passed: [], failed: [] });
  } catch (error: unknown) {
    logger.error('Error fetching QC status:', error);
    res.status(500).json({ error: 'Failed to fetch QC status' });
  }
});

// GET /api/distribution/takedowns - Get takedowns
router.get('/takedowns', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ takedowns: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching takedowns:', error);
    res.status(500).json({ error: 'Failed to fetch takedowns' });
  }
});

// GET /api/distribution/reinstatements - Get reinstatement requests
router.get('/reinstatements', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ reinstatements: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching reinstatements:', error);
    res.status(500).json({ error: 'Failed to fetch reinstatements' });
  }
});

// POST /api/distribution/upload - Upload distribution release with audio files and artwork
router.post('/upload', requireAuth, releaseUpload.any(), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const files = (req.files as Express.Multer.File[]) || [];

    const {
      title,
      artistName,
      releaseType = 'single',
      primaryGenre,
      secondaryGenre,
      language = 'English',
      releaseDate,
      labelName,
      copyrightYear,
      copyrightOwner,
      publishingRights,
      selectedPlatforms,
      isExplicit,
      leaveALegacy,
      legacyPrice,
      tracks: tracksJson,
      collaborators: collaboratorsJson,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Release title is required' });
    }

    let artworkUrl: string | null = null;
    const artworkFile = files.find(f => f.fieldname === 'albumArt');
    if (artworkFile) {
      const artworkKey = await storageService.uploadFile(
        artworkFile.buffer,
        `users/${userId}/artwork`,
        artworkFile.originalname,
        artworkFile.mimetype
      );
      artworkUrl = await storageService.getDownloadUrl(artworkKey);
    }

    const parsedTracks = tracksJson ? JSON.parse(tracksJson) : [];
    const parsedPlatforms = selectedPlatforms ? JSON.parse(selectedPlatforms) : [];
    const parsedCollaborators = collaboratorsJson ? JSON.parse(collaboratorsJson) : [];

    const [release] = await db.insert(distroReleases).values({
      artistId: userId,
      title,
      releaseDate: releaseDate ? new Date(releaseDate) : null,
      status: 'processing',
      artworkUrl,
      metadata: {
        artistName,
        releaseType,
        primaryGenre,
        secondaryGenre,
        language,
        labelName,
        copyrightYear: copyrightYear ? parseInt(copyrightYear) : new Date().getFullYear(),
        copyrightOwner,
        publishingRights,
        selectedPlatforms: parsedPlatforms,
        isExplicit: isExplicit === 'true',
        leaveALegacy: leaveALegacy === 'true',
        legacyPrice: legacyPrice ? parseFloat(legacyPrice) : null,
        collaborators: parsedCollaborators,
      },
    }).returning();

    const trackInserts = [];
    for (let i = 0; i < parsedTracks.length; i++) {
      const track = parsedTracks[i];
      const audioFile = files.find(f => f.fieldname === `audioFile_${i}`);

      let audioUrl: string | null = null;
      if (audioFile) {
        const audioKey = await storageService.uploadFile(
          audioFile.buffer,
          `users/${userId}/audio`,
          audioFile.originalname,
          audioFile.mimetype
        );
        audioUrl = await storageService.getDownloadUrl(audioKey);
      }

      trackInserts.push({
        releaseId: release.id,
        title: track.title || `Track ${i + 1}`,
        trackNumber: i + 1,
        isrc: track.isrc || null,
        audioUrl,
        metadata: {
          explicit: track.explicit || false,
          writers: track.writers || [],
          producers: track.producers || [],
        },
      });
    }

    if (trackInserts.length > 0) {
      await db.insert(distroTracks).values(trackInserts);
    }

    logger.info(`Distribution release created: ${release.id} by user ${userId}`);

    res.json({
      success: true,
      releaseId: release.id,
      fileId: release.id,
      message: 'Release uploaded successfully and is being processed for distribution.',
    });
  } catch (error: unknown) {
    logger.error('Error uploading distribution release:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload release' });
  }
});

// POST /api/distribution/export-report - Export report
router.post('/export-report', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, reportId: `report_${Date.now()}`, downloadUrl: null });
  } catch (error: unknown) {
    logger.error('Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// GET /api/distribution/codes/stats - Get code generation stats
router.get('/codes/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ isrcGenerated: 0, upcGenerated: 0, remaining: 1000 });
  } catch (error: unknown) {
    logger.error('Error fetching code stats:', error);
    res.status(500).json({ error: 'Failed to fetch code stats' });
  }
});

// ===========================
// EARNINGS ENDPOINTS
// ===========================

// GET /api/distribution/earnings/entries - Get earnings entries (paginated)
router.get('/earnings/entries', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const pageLimit = Math.min(Number(req.query.limit) || 100, 500);
    const pageOffset = Math.max(Number(req.query.offset) || 0, 0);

    const [entries, [{ total }]] = await Promise.all([
      db
        .select({
          id: royaltyTransactions.id,
          splitId: royaltyTransactions.splitId,
          releaseId: royaltyTransactions.releaseId,
          amount: royaltyTransactions.amount,
          currency: royaltyTransactions.currency,
          transactionType: royaltyTransactions.transactionType,
          platform: royaltyTransactions.platform,
          periodStart: royaltyTransactions.periodStart,
          periodEnd: royaltyTransactions.periodEnd,
          streamCount: royaltyTransactions.streamCount,
          status: royaltyTransactions.status,
          paidAt: royaltyTransactions.paidAt,
          metadata: royaltyTransactions.metadata,
          createdAt: royaltyTransactions.createdAt,
          releaseTitle: distroReleases.title,
        })
        .from(royaltyTransactions)
        .leftJoin(distroReleases, eq(royaltyTransactions.releaseId, distroReleases.id))
        .where(eq(royaltyTransactions.userId, userId))
        .orderBy(desc(royaltyTransactions.createdAt))
        .limit(pageLimit)
        .offset(pageOffset),
      db
        .select({ total: count() })
        .from(royaltyTransactions)
        .where(eq(royaltyTransactions.userId, userId)),
    ]);

    res.json({ entries, total: Number(total), limit: pageLimit, offset: pageOffset });
  } catch (error: unknown) {
    logger.error('Error fetching earnings entries:', error);
    res.status(500).json({ error: 'Failed to fetch earnings entries' });
  }
});

// GET /api/distribution/earnings/payouts - Get earnings payouts
router.get('/earnings/payouts', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const payouts = await db
      .select()
      .from(instantPayouts)
      .where(eq(instantPayouts.userId, userId))
      .orderBy(desc(instantPayouts.createdAt));
    res.json({ payouts, total: payouts.length });
  } catch (error: unknown) {
    logger.error('Error fetching earnings payouts:', error);
    res.status(500).json({ error: 'Failed to fetch earnings payouts' });
  }
});

// GET /api/distribution/earnings/statements - Get earnings statements
router.get('/earnings/statements', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const statements = await db
      .select()
      .from(royaltyStatements)
      .where(eq(royaltyStatements.userId, userId))
      .orderBy(desc(royaltyStatements.createdAt));
    res.json({ statements });
  } catch (error: unknown) {
    logger.error('Error fetching earnings statements:', error);
    res.status(500).json({ error: 'Failed to fetch earnings statements' });
  }
});

// GET /api/distribution/earnings/summary - Get earnings summary
router.get('/earnings/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Single SQL aggregate query — returns 1 row regardless of transaction count
    const [agg] = await db.select({
      totalEarnings: sql<number>`COALESCE(SUM(${royaltyTransactions.amount}), 0)`,
      pendingEarnings: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.status} = 'pending' THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
      paidOut: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.status} = 'paid' THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
      thisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.createdAt} >= ${thisMonthStart} THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
      lastMonth: sql<number>`COALESCE(SUM(CASE WHEN ${royaltyTransactions.createdAt} >= ${lastMonthStart} AND ${royaltyTransactions.createdAt} <= ${lastMonthEnd} THEN ${royaltyTransactions.amount} ELSE 0 END), 0)`,
    }).from(royaltyTransactions).where(eq(royaltyTransactions.userId, userId));

    res.json({
      totalEarnings: Number(agg.totalEarnings),
      pendingEarnings: Number(agg.pendingEarnings),
      paidOut: Number(agg.paidOut),
      thisMonth: Number(agg.thisMonth),
      lastMonth: Number(agg.lastMonth),
    });
  } catch (error: unknown) {
    logger.error('Error fetching earnings summary:', error);
    res.status(500).json({ error: 'Failed to fetch earnings summary' });
  }
});

// GET /api/distribution/earnings/territories - Get earnings by territory
router.get('/earnings/territories', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;

    // SQL GROUP BY on JSONB territory field — O(territories) rows instead of O(all_transactions)
    const rows = await db.select({
      territory: sql<string>`COALESCE(${royaltyTransactions.metadata}->>'territory', ${royaltyTransactions.metadata}->>'country', ${royaltyTransactions.platform}, 'unknown')`,
      totalEarnings: sql<number>`COALESCE(SUM(${royaltyTransactions.amount}), 0)`,
      streams: sql<number>`COALESCE(SUM(${royaltyTransactions.streamCount}), 0)`,
      transactions: sql<number>`COUNT(*)`,
    }).from(royaltyTransactions)
      .where(eq(royaltyTransactions.userId, userId))
      .groupBy(sql`COALESCE(${royaltyTransactions.metadata}->>'territory', ${royaltyTransactions.metadata}->>'country', ${royaltyTransactions.platform}, 'unknown')`)
      .orderBy(sql`SUM(${royaltyTransactions.amount}) DESC`);

    res.json({ territories: rows.map(r => ({
      territory: r.territory,
      totalEarnings: Number(r.totalEarnings),
      streams: Number(r.streams),
      transactions: Number(r.transactions),
    })) });
  } catch (error: unknown) {
    logger.error('Error fetching earnings territories:', error);
    res.status(500).json({ error: 'Failed to fetch earnings territories' });
  }
});

// ===========================
// ROYALTIES ENDPOINTS
// ===========================

// GET /api/distribution/royalties/currency-rates - Get currency rates
router.get('/royalties/currency-rates', requireAuth, async (req: Request, res: Response) => {
  try {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'currency_rates'));

    if (setting && setting.value) {
      const val = setting.value as any;
      res.json({
        rates: val.rates || { USD: 1, EUR: 0.92, GBP: 0.79 },
        baseCurrency: val.baseCurrency || 'USD',
        lastUpdated: setting.updatedAt?.toISOString() || new Date().toISOString(),
      });
    } else {
      res.json({ rates: { USD: 1, EUR: 0.92, GBP: 0.79 }, baseCurrency: 'USD', lastUpdated: new Date().toISOString() });
    }
  } catch (error: unknown) {
    logger.error('Error fetching currency rates:', error);
    res.status(500).json({ error: 'Failed to fetch currency rates' });
  }
});

// GET /api/distribution/royalties/discrepancies - Get royalty discrepancies
router.get('/royalties/discrepancies', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const discrepancies = await db
      .select()
      .from(royaltyDisputes)
      .where(eq(royaltyDisputes.userId, userId))
      .orderBy(desc(royaltyDisputes.createdAt));
    res.json({ discrepancies, total: discrepancies.length });
  } catch (error: unknown) {
    logger.error('Error fetching royalty discrepancies:', error);
    res.status(500).json({ error: 'Failed to fetch royalty discrepancies' });
  }
});

// GET /api/distribution/royalties/payouts - Get royalty payouts (paginated)
router.get('/royalties/payouts', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const pageLimit = Math.min(Number(req.query.limit) || 100, 500);
    const pageOffset = Math.max(Number(req.query.offset) || 0, 0);

    const paidFilter = and(eq(royaltyTransactions.userId, userId), eq(royaltyTransactions.status, 'paid'));

    const [payouts, [{ total }]] = await Promise.all([
      db
        .select()
        .from(royaltyTransactions)
        .where(paidFilter)
        .orderBy(desc(royaltyTransactions.paidAt))
        .limit(pageLimit)
        .offset(pageOffset),
      db
        .select({ total: count() })
        .from(royaltyTransactions)
        .where(paidFilter),
    ]);

    res.json({ payouts, total: Number(total), limit: pageLimit, offset: pageOffset });
  } catch (error: unknown) {
    logger.error('Error fetching royalty payouts:', error);
    res.status(500).json({ error: 'Failed to fetch royalty payouts' });
  }
});

// GET /api/distribution/royalties/platforms - Get royalties by platform
router.get('/royalties/platforms', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;

    // SQL GROUP BY — O(platforms) rows instead of O(all_transactions)
    const rows = await db.select({
      platform: sql<string>`COALESCE(${royaltyTransactions.platform}, 'unknown')`,
      totalEarnings: sql<number>`COALESCE(SUM(${royaltyTransactions.amount}), 0)`,
      streams: sql<number>`COALESCE(SUM(${royaltyTransactions.streamCount}), 0)`,
      transactions: sql<number>`COUNT(*)`,
    }).from(royaltyTransactions)
      .where(eq(royaltyTransactions.userId, userId))
      .groupBy(sql`COALESCE(${royaltyTransactions.platform}, 'unknown')`)
      .orderBy(sql`SUM(${royaltyTransactions.amount}) DESC`);

    res.json({ platforms: rows.map(r => ({
      platform: r.platform,
      totalEarnings: Number(r.totalEarnings),
      streams: Number(r.streams),
      transactions: Number(r.transactions),
    })) });
  } catch (error: unknown) {
    logger.error('Error fetching royalties platforms:', error);
    res.status(500).json({ error: 'Failed to fetch royalties platforms' });
  }
});

// GET /api/distribution/royalties/splits - Get royalty splits
router.get('/royalties/splits', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const userReleases = await db
      .select({ id: distroReleases.id })
      .from(distroReleases)
      .where(eq(distroReleases.artistId, userId));

    if (userReleases.length === 0) {
      return res.json({ splits: [] });
    }

    const releaseIds = userReleases.map(r => r.id);
    const splits = await db.select().from(royaltySplits)
      .where(inArray(royaltySplits.releaseId, releaseIds))
      .limit(500);

    res.json({ splits });
  } catch (error: unknown) {
    logger.error('Error fetching royalty splits:', error);
    res.status(500).json({ error: 'Failed to fetch royalty splits' });
  }
});

// GET /api/distribution/royalties/tax-documents - Get tax documents
router.get('/royalties/tax-documents', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const documents = await db
      .select()
      .from(taxForms)
      .where(eq(taxForms.userId, userId))
      .orderBy(desc(taxForms.createdAt));
    res.json({ documents });
  } catch (error: unknown) {
    logger.error('Error fetching tax documents:', error);
    res.status(500).json({ error: 'Failed to fetch tax documents' });
  }
});

// ===================
// DATA TRANSFER & PROFILE SYNC ENDPOINTS
// ===================

import { distributionDataTransferService, SUPPORTED_DISTRIBUTORS, STREAMING_PLATFORMS } from '../services/distributionDataTransferService';

// GET /api/distribution/transfer/distributors - Get supported distributors for import
router.get('/transfer/distributors', requireAuth, async (_req: Request, res: Response) => {
  try {
    const distributors = distributionDataTransferService.getSupportedDistributors();
    res.json({ distributors });
  } catch (error: unknown) {
    logger.error('Error fetching supported distributors:', error);
    res.status(500).json({ error: 'Failed to fetch distributors' });
  }
});

// GET /api/distribution/transfer/platforms - Get supported streaming platforms for profile sync
router.get('/transfer/platforms', requireAuth, async (_req: Request, res: Response) => {
  try {
    const platforms = distributionDataTransferService.getSupportedPlatforms();
    res.json({ platforms });
  } catch (error: unknown) {
    logger.error('Error fetching supported platforms:', error);
    res.status(500).json({ error: 'Failed to fetch platforms' });
  }
});

// POST /api/distribution/transfer/validate - Validate import CSV before processing
router.post('/transfer/validate', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { distributor } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'CSV file required' });
    }

    if (!distributor) {
      return res.status(400).json({ error: 'Distributor must be specified' });
    }

    const csvContent = fs.readFileSync(file.path, 'utf-8');
    const validation = await distributionDataTransferService.validateImportData(csvContent, distributor);

    fs.unlinkSync(file.path);

    res.json(validation);
  } catch (error: unknown) {
    logger.error('Error validating import data:', error);
    res.status(500).json({ error: 'Failed to validate import data' });
  }
});

// POST /api/distribution/transfer/import - Import releases from another distributor
router.post('/transfer/import', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const file = req.file;
    const { distributor } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'CSV file required' });
    }

    if (!distributor) {
      return res.status(400).json({ error: 'Distributor must be specified' });
    }

    const csvContent = fs.readFileSync(file.path, 'utf-8');
    const job = await distributionDataTransferService.importFromDistributor(userId, distributor, csvContent);

    fs.unlinkSync(file.path);

    res.json({
      success: true,
      job,
      message: `Import ${job.status}: ${job.successItems} releases imported, ${job.failedItems} failed`,
    });
  } catch (error: unknown) {
    logger.error('Error importing from distributor:', error);
    res.status(500).json({ error: 'Failed to import releases' });
  }
});

// GET /api/distribution/transfer/jobs - Get user's transfer jobs history
router.get('/transfer/jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const jobs = await distributionDataTransferService.getUserTransferJobs(userId);
    res.json({ jobs });
  } catch (error: unknown) {
    logger.error('Error fetching transfer jobs:', error);
    res.status(500).json({ error: 'Failed to fetch transfer jobs' });
  }
});

// GET /api/distribution/transfer/jobs/:id - Get specific transfer job status
router.get('/transfer/jobs/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await distributionDataTransferService.getTransferJob(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ job });
  } catch (error: unknown) {
    logger.error('Error fetching transfer job:', error);
    res.status(500).json({ error: 'Failed to fetch transfer job' });
  }
});

// POST /api/distribution/profiles/link - Link a streaming platform profile
router.post('/profiles/link', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { platformId, profileUrl, artistName } = req.body;

    if (!platformId || !profileUrl) {
      return res.status(400).json({ error: 'Platform ID and profile URL are required' });
    }

    const profile = await distributionDataTransferService.linkStreamingProfile(
      userId,
      platformId,
      profileUrl,
      { artistName }
    );

    res.json({
      success: true,
      profile,
      message: `Successfully linked ${platformId} profile`,
    });
  } catch (error: unknown) {
    logger.error('Error linking streaming profile:', error);
    res.status(500).json({ error: 'Failed to link streaming profile' });
  }
});

// GET /api/distribution/profiles - Get all linked streaming profiles
router.get('/profiles', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const profiles = await distributionDataTransferService.getLinkedProfiles(userId);
    res.json({ profiles });
  } catch (error: unknown) {
    logger.error('Error fetching linked profiles:', error);
    res.status(500).json({ error: 'Failed to fetch linked profiles' });
  }
});

// POST /api/distribution/profiles/:platformId/sync - Sync profile data from platform
router.post('/profiles/:platformId/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { platformId } = req.params;

    const profile = await distributionDataTransferService.syncProfileData(userId, platformId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not linked' });
    }

    res.json({
      success: true,
      profile,
      message: `Successfully synced ${platformId} profile data`,
    });
  } catch (error: unknown) {
    logger.error('Error syncing streaming profile:', error);
    res.status(500).json({ error: 'Failed to sync streaming profile' });
  }
});

// DELETE /api/distribution/profiles/:platformId - Unlink a streaming platform profile
router.delete('/profiles/:platformId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { platformId } = req.params;

    const deleted = await distributionDataTransferService.unlinkStreamingProfile(userId, platformId);

    if (!deleted) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      success: true,
      message: `Successfully unlinked ${platformId} profile`,
    });
  } catch (error: unknown) {
    logger.error('Error unlinking streaming profile:', error);
    res.status(500).json({ error: 'Failed to unlink streaming profile' });
  }
});

// POST /api/distribution/profiles/sync-all - Sync all linked streaming profiles at once
router.post('/profiles/sync-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const result = await distributionDataTransferService.syncAllProfiles(userId);
    res.json({
      success: true,
      ...result,
      message: `Synced ${result.succeeded} of ${result.total} profiles`,
    });
  } catch (error: unknown) {
    logger.error('Error syncing all profiles:', error);
    res.status(500).json({ error: 'Failed to sync all profiles' });
  }
});

// POST /api/distribution/profiles/auto-sync/start - Start auto-sync for all linked profiles
router.post('/profiles/auto-sync/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { intervalMinutes } = req.body;
    distributionDataTransferService.startAutoSync(userId, intervalMinutes || 60);
    const status = distributionDataTransferService.getAutoSyncStatus(userId);
    res.json({
      success: true,
      status,
      message: `Auto-sync started (every ${intervalMinutes || 60} minutes)`,
    });
  } catch (error: unknown) {
    logger.error('Error starting auto-sync:', error);
    res.status(500).json({ error: 'Failed to start auto-sync' });
  }
});

// POST /api/distribution/profiles/auto-sync/stop - Stop auto-sync
router.post('/profiles/auto-sync/stop', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    distributionDataTransferService.stopAutoSync(userId);
    res.json({
      success: true,
      message: 'Auto-sync stopped',
    });
  } catch (error: unknown) {
    logger.error('Error stopping auto-sync:', error);
    res.status(500).json({ error: 'Failed to stop auto-sync' });
  }
});

// GET /api/distribution/profiles/auto-sync/status - Get auto-sync status
router.get('/profiles/auto-sync/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const status = distributionDataTransferService.getAutoSyncStatus(userId);
    res.json(status);
  } catch (error: unknown) {
    logger.error('Error fetching auto-sync status:', error);
    res.status(500).json({ error: 'Failed to fetch auto-sync status' });
  }
});

// GET /api/distribution/profiles/sync-history - Get sync history
router.get('/profiles/sync-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const history = distributionDataTransferService.getSyncHistory(userId);
    res.json({ history });
  } catch (error: unknown) {
    logger.error('Error fetching sync history:', error);
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

// GET /api/distribution/migration/report - Get migration report for user's catalog
router.get('/migration/report', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const report = await distributionDataTransferService.generateMigrationReport(userId);
    res.json(report);
  } catch (error: unknown) {
    logger.error('Error generating migration report:', error);
    res.status(500).json({ error: 'Failed to generate migration report' });
  }
});

// ===========================
// ENHANCED SUBMISSION STATUS ENDPOINTS
// ===========================

// GET /api/distribution/releases/:id/submission-status - Get detailed submission status with queue info
router.get('/releases/:id/submission-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const dispatches = await storage.getDistroDispatchStatuses(id) as DispatchStatus[];
    
    const statuses = dispatches.map((dispatch: DispatchStatus, index: number) => {
      const logs = dispatch.logs ? JSON.parse(dispatch.logs) : {};
      return {
        platform: dispatch.providerId,
        platformName: dispatch.providerName || dispatch.providerId,
        status: dispatch.status,
        queuePosition: dispatch.status === 'queued' ? index + 1 : undefined,
        estimatedTime: dispatch.status === 'queued' ? '2-4 hours' : undefined,
        estimatedGoLive: logs.estimatedGoLive,
        deliveredAt: logs.deliveredAt,
        liveAt: logs.liveAt,
        errorMessage: logs.errorMessage,
        errorCode: logs.errorCode,
        errorResolution: logs.errorResolution,
        retryCount: logs.retryCount || 0,
        maxRetries: 3,
        lastAttempt: logs.lastAttempt,
        externalId: logs.externalId,
        validationErrors: logs.validationErrors,
      };
    });

    const queued = statuses.filter(s => s.status === 'queued').length;
    const processing = statuses.filter(s => ['pending', 'processing'].includes(s.status)).length;
    const delivered = statuses.filter(s => s.status === 'delivered').length;
    const live = statuses.filter(s => s.status === 'live').length;
    const failed = statuses.filter(s => ['failed', 'rejected'].includes(s.status)).length;

    const overallProgress = statuses.length > 0 
      ? ((live + delivered) / statuses.length) * 100 
      : 0;

    res.json({
      statuses,
      summary: {
        totalPlatforms: statuses.length,
        queued,
        processing,
        delivered,
        live,
        failed,
        overallProgress,
        estimatedCompletion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching submission status:', error);
    res.status(500).json({ error: 'Failed to fetch submission status' });
  }
});

// POST /api/distribution/releases/:id/retry - Retry failed platform submission
router.post('/releases/:id/retry', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;
    const { platform } = req.body;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const dispatches = await storage.getDistroDispatchStatuses(id) as DispatchStatus[];
    const dispatch = dispatches.find((d: DispatchStatus) => d.providerId === platform);
    
    if (!dispatch) {
      return res.status(404).json({ error: 'Platform dispatch not found' });
    }

    const logs = dispatch.logs ? JSON.parse(dispatch.logs) : {};
    const retryCount = (logs.retryCount || 0) + 1;

    if (retryCount > 3) {
      return res.status(400).json({ error: 'Maximum retry attempts exceeded' });
    }

    await storage.updateDistroDispatch(dispatch.id, {
      status: 'queued',
      logs: JSON.stringify({
        ...logs,
        retryCount,
        lastAttempt: new Date().toISOString(),
        errorMessage: null,
      }),
    });

    logger.info(`Retrying submission for release ${id} to platform ${platform}`, {
      releaseId: id,
      platform,
      retryCount,
    });

    res.json({
      success: true,
      message: `Retry initiated for ${platform}`,
      retryCount,
    });
  } catch (error: unknown) {
    logger.error('Error retrying submission:', error);
    res.status(500).json({ error: 'Failed to retry submission' });
  }
});

// ===========================
// CONTENT ID ENDPOINTS
// ===========================

// GET /api/distribution/releases/:id/content-id - Get Content ID registrations for release
router.get('/releases/:id/content-id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const tracks = await storage.getDistroTracks(id);
    const registrations = tracks.map((track: any) => {
      const metadata = track.metadata || {};
      return {
        id: `cid_${track.id}`,
        trackId: track.id,
        trackTitle: track.title,
        fingerprint: metadata.fingerprint || null,
        status: metadata.contentIdStatus || 'pending',
        registeredAt: metadata.contentIdRegisteredAt,
        platforms: metadata.contentIdPlatforms || ['YouTube', 'Facebook', 'Instagram'],
        conflictDetails: metadata.conflictDetails,
      };
    });

    res.json(registrations);
  } catch (error: unknown) {
    logger.error('Error fetching content ID registrations:', error);
    res.status(500).json({ error: 'Failed to fetch content ID registrations' });
  }
});

// POST /api/distribution/content-id/generate - Generate fingerprint for track
router.post('/content-id/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { releaseId, trackId } = req.body;

    const track = await storage.getDistroTrack(trackId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const fingerprint = `fp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    await storage.updateDistroTrack(trackId, {
      metadata: {
        ...track.metadata,
        fingerprint,
        contentIdStatus: 'generating',
      },
    });

    res.json({
      success: true,
      message: 'Fingerprint generation initiated',
      fingerprint,
    });
  } catch (error: unknown) {
    logger.error('Error generating fingerprint:', error);
    res.status(500).json({ error: 'Failed to generate fingerprint' });
  }
});

// POST /api/distribution/content-id/generate-all - Generate fingerprints for all tracks
router.post('/content-id/generate-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.body;

    const tracks = await storage.getDistroTracks(releaseId);
    let count = 0;

    for (const track of tracks) {
      const fingerprint = `fp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await storage.updateDistroTrack(track.id, {
        metadata: {
          ...track.metadata,
          fingerprint,
          contentIdStatus: 'generating',
        },
      });
      count++;
    }

    res.json({
      success: true,
      message: `Generated fingerprints for ${count} tracks`,
      count,
    });
  } catch (error: unknown) {
    logger.error('Error generating all fingerprints:', error);
    res.status(500).json({ error: 'Failed to generate fingerprints' });
  }
});

// POST /api/distribution/content-id/register - Register track for Content ID
router.post('/content-id/register', requireAuth, async (req: Request, res: Response) => {
  try {
    const { releaseId, trackId } = req.body;

    const track = await storage.getDistroTrack(trackId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    await storage.updateDistroTrack(trackId, {
      metadata: {
        ...track.metadata,
        contentIdStatus: 'registered',
        contentIdRegisteredAt: new Date().toISOString(),
        contentIdPlatforms: ['YouTube', 'Facebook', 'Instagram', 'TikTok'],
      },
    });

    res.json({
      success: true,
      message: 'Track registered for Content ID protection',
    });
  } catch (error: unknown) {
    logger.error('Error registering for content ID:', error);
    res.status(500).json({ error: 'Failed to register for content ID' });
  }
});

// POST /api/distribution/content-id/resolve - Resolve Content ID conflict
router.post('/content-id/resolve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { registrationId, resolution, notes } = req.body;

    const trackId = registrationId.replace('cid_', '');
    const track = await storage.getDistroTrack(trackId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    await storage.updateDistroTrack(trackId, {
      metadata: {
        ...track.metadata,
        contentIdStatus: resolution === 'claim_ownership' ? 'registered' : 'pending',
        conflictResolution: {
          type: resolution,
          notes,
          resolvedAt: new Date().toISOString(),
        },
      },
    });

    res.json({
      success: true,
      message: 'Conflict resolution submitted',
    });
  } catch (error: unknown) {
    logger.error('Error resolving content ID conflict:', error);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

// ===========================
// DISTRIBUTION OUTCOMES ENDPOINT
// ===========================

// GET /api/distribution/releases/:id/outcomes - Get all distribution outcomes
router.get('/releases/:id/outcomes', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const metadata = release.metadata as any;
    const dispatches = await storage.getDistroDispatchStatuses(id) as DispatchStatus[];
    const tracks = await storage.getDistroTracks(id);

    const releaseOutcomes = [];
    if (release.status === 'draft' || metadata?.status === 'draft') {
      releaseOutcomes.push({
        type: 'draft_saved',
        status: 'success',
        message: 'Release saved as draft',
        timestamp: release.createdAt?.toISOString() || new Date().toISOString(),
      });
    }
    if (release.coverArtUrl) {
      releaseOutcomes.push({
        type: 'cover_upload',
        status: 'success',
        message: 'Cover art uploaded successfully',
        timestamp: new Date().toISOString(),
      });
    }
    if (tracks.length > 0) {
      releaseOutcomes.push({
        type: 'track_upload',
        status: 'success',
        message: `${tracks.length} track(s) uploaded successfully`,
        timestamp: new Date().toISOString(),
      });
    }

    const submissionOutcomes = [];
    if (dispatches.length > 0) {
      const live = dispatches.filter(d => d.status === 'live');
      const failed = dispatches.filter(d => d.status === 'failed');
      const processing = dispatches.filter(d => ['queued', 'pending', 'processing', 'delivered'].includes(d.status));

      if (live.length === dispatches.length) {
        submissionOutcomes.push({
          type: 'all_success',
          status: 'success',
          message: `Successfully live on all ${dispatches.length} platforms`,
          platforms: dispatches.map(d => ({ name: d.providerName || d.providerId, status: 'live' })),
          timestamp: new Date().toISOString(),
        });
      } else if (failed.length > 0 && live.length > 0) {
        submissionOutcomes.push({
          type: 'partial_success',
          status: 'warning',
          message: `Live on ${live.length} platforms, ${failed.length} failed`,
          platforms: dispatches.map(d => ({ name: d.providerName || d.providerId, status: d.status })),
          timestamp: new Date().toISOString(),
        });
      } else if (processing.length > 0) {
        submissionOutcomes.push({
          type: 'submission_started',
          status: 'in_progress',
          message: `Processing ${processing.length} platform submissions`,
          platforms: dispatches.map(d => ({ name: d.providerName || d.providerId, status: d.status })),
          queuePosition: processing.length > 0 ? 1 : undefined,
          estimatedTime: '2-5 days',
          timestamp: new Date().toISOString(),
        });
      }
    }

    const contentIdOutcomes = [];
    const tracksWithFingerprint = tracks.filter((t: any) => t.metadata?.fingerprint);
    if (tracksWithFingerprint.length > 0) {
      contentIdOutcomes.push({
        type: 'fingerprint_generated',
        status: 'success',
        message: `Fingerprints generated for ${tracksWithFingerprint.length} track(s)`,
        timestamp: new Date().toISOString(),
      });
    }
    const registeredTracks = tracks.filter((t: any) => t.metadata?.contentIdStatus === 'registered');
    if (registeredTracks.length > 0) {
      contentIdOutcomes.push({
        type: 'registration_confirmed',
        status: 'success',
        message: `${registeredTracks.length} track(s) registered for Content ID protection`,
        timestamp: new Date().toISOString(),
      });
    }

    const codeOutcomes = [];
    if (release.upc) {
      codeOutcomes.push({
        type: 'upc_generated',
        status: 'success',
        message: `UPC code generated: ${release.upc}`,
        code: release.upc,
        codeType: 'upc',
        timestamp: new Date().toISOString(),
      });
    }
    const tracksWithISRC = tracks.filter((t: any) => t.isrc);
    if (tracksWithISRC.length > 0) {
      codeOutcomes.push({
        type: 'isrc_generated',
        status: 'success',
        message: `ISRC codes generated for ${tracksWithISRC.length} track(s)`,
        codeType: 'isrc',
        timestamp: new Date().toISOString(),
      });
    }

    const takedownOutcomes = [];
    const takedownDispatches = dispatches.filter(d => 
      d.status === 'takedown_requested' || d.status === 'removed'
    );
    if (takedownDispatches.length > 0) {
      const completed = takedownDispatches.filter(d => d.status === 'removed').length;
      takedownOutcomes.push({
        type: completed === takedownDispatches.length ? 'completed' : 'in_progress',
        status: completed === takedownDispatches.length ? 'success' : 'in_progress',
        message: completed === takedownDispatches.length 
          ? 'Takedown completed on all requested platforms'
          : `Takedown in progress: ${completed}/${takedownDispatches.length} complete`,
        platforms: takedownDispatches.map(d => d.providerName || d.providerId),
        progressPercentage: (completed / takedownDispatches.length) * 100,
        timestamp: new Date().toISOString(),
      });
    }

    const analyticsOutcomes = [];
    if (metadata?.labelGridReleaseId) {
      analyticsOutcomes.push({
        type: 'loading',
        status: 'info',
        message: 'Analytics data available',
        timestamp: new Date().toISOString(),
      });
    } else {
      analyticsOutcomes.push({
        type: 'no_data',
        status: 'info',
        message: 'No analytics data available yet - release is not live',
        timestamp: new Date().toISOString(),
      });
    }

    const allOutcomes = [
      ...releaseOutcomes, 
      ...submissionOutcomes, 
      ...contentIdOutcomes, 
      ...codeOutcomes,
      ...takedownOutcomes,
      ...analyticsOutcomes
    ];

    res.json({
      release: releaseOutcomes,
      submission: submissionOutcomes,
      contentId: contentIdOutcomes,
      codes: codeOutcomes,
      takedown: takedownOutcomes,
      analytics: analyticsOutcomes,
      summary: {
        totalOutcomes: allOutcomes.length,
        errors: allOutcomes.filter(o => o.status === 'error').length,
        warnings: allOutcomes.filter(o => o.status === 'warning').length,
        successes: allOutcomes.filter(o => o.status === 'success').length,
        inProgress: allOutcomes.filter(o => o.status === 'in_progress').length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching distribution outcomes:', error);
    res.status(500).json({ error: 'Failed to fetch distribution outcomes' });
  }
});

// POST /api/distribution/releases/:id/retry-outcome - Retry a failed outcome
router.post('/releases/:id/retry-outcome', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { id } = req.params;
    const { type, data } = req.body;

    const release = await storage.getDistroRelease(id);
    if (!release || release.artistId !== userId) {
      return res.status(404).json({ error: 'Release not found' });
    }

    logger.info(`Retrying outcome ${type} for release ${id}`, { type, data });

    res.json({
      success: true,
      message: `Retry initiated for ${type}`,
    });
  } catch (error: unknown) {
    logger.error('Error retrying outcome:', error);
    res.status(500).json({ error: 'Failed to retry outcome' });
  }
});

// POST /api/distribution/isrc/generate - Generate ISRC code
router.post('/isrc/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { artist, title, trackId } = req.body;

    if (!artist || !title) {
      return res.status(400).json({ error: 'artist and title are required' });
    }

    const result = await labelGridService.generateISRC(artist, title);

    if (trackId && trackId !== `temp_${Date.now()}`) {
      await codeGenerationService.generateISRC(userId, trackId, artist, title);
    }

    res.json({ 
      success: true,
      isrc: result.code, 
      assignedTo: result.assignedTo 
    });
  } catch (error: unknown) {
    logger.error('Error generating ISRC:', error);
    res.status(500).json({ error: 'Failed to generate ISRC' });
  }
});

// POST /api/distribution/upc/generate - Generate UPC code
router.post('/upc/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const { title, releaseId } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const result = await labelGridService.generateUPC(title);

    if (releaseId && releaseId !== `temp_${Date.now()}`) {
      await codeGenerationService.generateUPC(userId, releaseId, title);
    }

    res.json({ 
      success: true,
      upc: result.code, 
      assignedTo: result.assignedTo 
    });
  } catch (error: unknown) {
    logger.error('Error generating UPC:', error);
    res.status(500).json({ error: 'Failed to generate UPC' });
  }
});

export default router;

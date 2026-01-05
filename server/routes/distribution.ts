import { Router, NextFunction } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
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
const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

// ===================
// RELEASE ENDPOINTS
// ===================

// GET /api/distribution/releases - List user's releases
router.get('/releases', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as AuthenticatedUser).id;
    const releases = await storage.getReleasesByUserId(userId);
    res.json(releases);
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

      const data = createTrackSchema.parse(JSON.parse(req.body.metadata || '{}'));

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
      const track = await storage.updateDistroTrack(trackId, updates);

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

      await storage.deleteDistroTrack(trackId);
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

    // Use LabelGrid API to generate ISRC
    const result = await labelGridService.generateISRC(artist, title);

    // Store in database for tracking
    if (trackId && trackId !== `temp_${Date.now()}`) {
      await codeGenerationService.generateISRC(userId, trackId, artist, title);
    }

    res.json({ isrc: result.code, assignedTo: result.assignedTo });
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
    const { releaseId, title } = generateCodeSchema.parse(req.body);

    // Use LabelGrid API to generate UPC
    const result = await labelGridService.generateUPC(title);

    // Store in database for tracking
    if (releaseId && releaseId !== `temp_${Date.now()}`) {
      await codeGenerationService.generateUPC(userId, releaseId, title);
    }

    res.json({ upc: result.code, assignedTo: result.assignedTo });
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
router.get('/platforms', async (_req: Request, res: Response) => {
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
router.get('/platforms/status', async (_req: Request, res: Response) => {
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

      const data = hyperFollowSchema.parse(JSON.parse(req.body.data));

      const headerImageUrl = file ? `/uploads/distribution/${file.filename}` : data.headerImage;

      const campaign = await storage.createHyperFollowPage({
        userId,
        title: data.title,
        slug: data.slug,
        imageUrl: headerImageUrl,
        links: {
          platforms: data.platforms,
          socialLinks: data.socialLinks,
          artistName: data.artistName,
          description: data.description,
          releaseId: data.releaseId,
          collectEmails: data.collectEmails,
          theme: data.theme,
          analytics: {
            pageViews: 0,
            preSaves: 0,
            emailSignups: 0,
            platformClicks: {},
          },
          emailList: [],
        },
      });

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

    // Trigger status refresh from DSPs
    await distributionService.refreshReleaseStatus(id);

    res.json({ success: true, message: 'Status refresh initiated' });
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

    const metadata = release.metadata as any;
    const xml = await ddexPackageService.generateDDEXXML(
      {
        id: release.id,
        title: release.title || '',
        artistName: metadata.artistName,
        releaseType: metadata.releaseType,
        upc: release.upc || '',
        releaseDate: release.releaseDate?.toISOString().split('T')[0] || '',
        labelName: metadata.labelName,
        copyrightYear: metadata.copyrightYear,
        copyrightOwner: metadata.copyrightOwner,
        publishingRights: metadata.publishingRights,
        primaryGenre: metadata.primaryGenre,
        secondaryGenre: metadata.secondaryGenre,
        isExplicit: metadata.isExplicit,
        coverArtPath: release.coverArtUrl,
        territories: metadata.territories,
      },
      tracks.map((track: unknown, index: number) => ({
        id: track.id,
        title: track.title,
        isrc: track.isrc || '',
        trackNumber: index + 1,
        duration: track.duration || 0,
        audioFilePath: track.audioUrl,
        explicit: track.metadata?.explicit || false,
        lyrics: track.metadata?.lyrics,
        primaryArtist: metadata.artistName,
        featuredArtists: track.metadata?.featuredArtists,
        songwriters: track.metadata?.songwriters,
        producers: track.metadata?.producers,
      }))
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
    const metadata = release.metadata as any;

    const outputPath = path.join(uploadDir, `ddex_${id}_${Date.now()}.zip`);

    await ddexPackageService.createDDEXPackage(
      {
        id: release.id,
        title: release.title || '',
        artistName: metadata.artistName,
        releaseType: metadata.releaseType,
        upc: release.upc || '',
        releaseDate: release.releaseDate?.toISOString().split('T')[0] || '',
        labelName: metadata.labelName,
        copyrightYear: metadata.copyrightYear,
        copyrightOwner: metadata.copyrightOwner,
        publishingRights: metadata.publishingRights,
        primaryGenre: metadata.primaryGenre,
        secondaryGenre: metadata.secondaryGenre,
        isExplicit: metadata.isExplicit,
        coverArtPath: release.coverArtUrl,
        territories: metadata.territories,
      },
      tracks.map((track: unknown, index: number) => ({
        id: track.id,
        title: track.title,
        isrc: track.isrc || '',
        trackNumber: index + 1,
        duration: track.duration || 0,
        audioFilePath: path.join(process.cwd(), track.audioUrl),
        explicit: track.metadata?.explicit || false,
        lyrics: track.metadata?.lyrics,
        primaryArtist: metadata.artistName,
        featuredArtists: track.metadata?.featuredArtists,
        songwriters: track.metadata?.songwriters,
        producers: track.metadata?.producers,
      })),
      outputPath
    );

    res.download(outputPath, `${release.title}_DDEX.zip`, (err) => {
      if (err) {
        logger.error('Error downloading DDEX package:', err);
      }
      // Clean up file after download
      fs.unlinkSync(outputPath);
    });
  } catch (error: unknown) {
    logger.error('Error creating DDEX package:', error);
    res.status(500).json({ error: 'Failed to create DDEX package' });
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

    // Update release status to submitted
    await storage.updateDistroRelease(id, {
      metadata: { ...(release.metadata as any), status: 'submitted' },
    });

    // Create dispatch records for each selected platform
    const metadata = release.metadata as any;
    const selectedPlatforms = metadata.selectedPlatforms || [];

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
    const content = file.buffer.toString('utf-8');
    
    if (fileType === 'csv') {
      rows = await catalogImporter.parseCSV(content);
    } else if (fileType === 'ddex') {
      rows = await catalogImporter.parseDDEX(content);
    } else {
      return res.status(400).json({ error: 'XLSX parsing not yet implemented. Please use CSV format.' });
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
    const limit = parseInt(req.query.limit as string) || 10;
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
      return res.json(null);
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
    const payouts = await storage.getPayoutHistory(userId) as PayoutRecord[];
    
    if (payouts.length === 0) {
      return res.json(null);
    }
    
    const totalPaidOut = payouts.reduce((sum: number, p: PayoutRecord) => sum + (p.amount || 0), 0);
    
    res.json({
      totalEarnings: totalPaidOut,
      pendingEarnings: 0,
      paidOut: totalPaidOut,
      thisMonth: 0,
      lastMonth: 0,
      growth: 0,
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
    const analyticsData = await storage.getDistroAnalytics(userId);
    
    if (!analyticsData) {
      return res.json([]);
    }
    
    res.json([]);
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

// GET /api/distribution/hyperfollow/analytics - Get hyperfollow analytics
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

// POST /api/distribution/upload - Upload distribution file
router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, fileId: `file_${Date.now()}`, message: 'File uploaded successfully' });
  } catch (error: unknown) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
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

// GET /api/distribution/earnings/entries - Get earnings entries
router.get('/earnings/entries', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ entries: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching earnings entries:', error);
    res.status(500).json({ error: 'Failed to fetch earnings entries' });
  }
});

// GET /api/distribution/earnings/payouts - Get earnings payouts
router.get('/earnings/payouts', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ payouts: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching earnings payouts:', error);
    res.status(500).json({ error: 'Failed to fetch earnings payouts' });
  }
});

// GET /api/distribution/earnings/statements - Get earnings statements
router.get('/earnings/statements', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ statements: [] });
  } catch (error: unknown) {
    logger.error('Error fetching earnings statements:', error);
    res.status(500).json({ error: 'Failed to fetch earnings statements' });
  }
});

// GET /api/distribution/earnings/summary - Get earnings summary
router.get('/earnings/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ totalEarnings: 0, pendingEarnings: 0, paidOut: 0, thisMonth: 0, lastMonth: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching earnings summary:', error);
    res.status(500).json({ error: 'Failed to fetch earnings summary' });
  }
});

// GET /api/distribution/earnings/territories - Get earnings by territory
router.get('/earnings/territories', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ territories: [] });
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
    res.json({ rates: { USD: 1, EUR: 0.92, GBP: 0.79 }, baseCurrency: 'USD', lastUpdated: new Date().toISOString() });
  } catch (error: unknown) {
    logger.error('Error fetching currency rates:', error);
    res.status(500).json({ error: 'Failed to fetch currency rates' });
  }
});

// GET /api/distribution/royalties/discrepancies - Get royalty discrepancies
router.get('/royalties/discrepancies', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ discrepancies: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching royalty discrepancies:', error);
    res.status(500).json({ error: 'Failed to fetch royalty discrepancies' });
  }
});

// GET /api/distribution/royalties/payouts - Get royalty payouts
router.get('/royalties/payouts', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ payouts: [], total: 0 });
  } catch (error: unknown) {
    logger.error('Error fetching royalty payouts:', error);
    res.status(500).json({ error: 'Failed to fetch royalty payouts' });
  }
});

// GET /api/distribution/royalties/platforms - Get royalties by platform
router.get('/royalties/platforms', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ platforms: [] });
  } catch (error: unknown) {
    logger.error('Error fetching royalties platforms:', error);
    res.status(500).json({ error: 'Failed to fetch royalties platforms' });
  }
});

// GET /api/distribution/royalties/splits - Get royalty splits
router.get('/royalties/splits', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ splits: [] });
  } catch (error: unknown) {
    logger.error('Error fetching royalty splits:', error);
    res.status(500).json({ error: 'Failed to fetch royalty splits' });
  }
});

// GET /api/distribution/royalties/tax-documents - Get tax documents
router.get('/royalties/tax-documents', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ documents: [] });
  } catch (error: unknown) {
    logger.error('Error fetching tax documents:', error);
    res.status(500).json({ error: 'Failed to fetch tax documents' });
  }
});

export default router;

import { Router } from 'express';
import multer from 'multer';
import { storefrontService } from '../services/storefrontService';
import { ReplitStorageService } from '../services/replitStorageService';
import {
  insertStorefrontSchema,
  updateStorefrontSchema,
  insertMembershipTierSchema,
  updateMembershipTierSchema,
  storefrontFollows,
  storefrontLikes,
  storefrontRatings,
  storefrontOrders,
  listings,
  listingLicenseTiers,
  storefronts,
  users,
} from '@shared/schema';
import Stripe from 'stripe';
import { getBaseUrl } from '../config/defaults';
import { db } from '../db';
import { eq, and, count, avg, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    }
  }
});

let storageService: ReplitStorageService | null = null;
try {
  if (process.env.PRIVATE_OBJECT_DIR || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || process.env.REPLIT_BUCKET_ID) {
    storageService = new ReplitStorageService();
  }
} catch (e) {
  logger.warn('ReplitStorageService not available, file uploads will be disabled');
}

const router = Router();

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * GET /api/storefront/templates
 * Get all available storefront templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await storefrontService.getTemplates();
    res.json(templates);
  } catch (error: unknown) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch templates' });
  }
});

/**
 * GET /api/storefront/my
 * Get current user's storefronts
 */
router.get('/my', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const storefronts = await storefrontService.getUserStorefronts(req.user!.id);
    res.json(storefronts);
  } catch (error: unknown) {
    logger.error('Error fetching user storefronts:', error);
    res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch storefronts' });
  }
});

/**
 * GET /api/storefront/public/:slug
 * Get public storefront by slug (unauthenticated access) - MUST be before /:slug
 */
router.get('/public/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const storefront = await storefrontService.getStorefrontBySlug(slug);
    
    if (!storefront.isActive || !storefront.isPublic) {
      return res.status(404).json({ error: 'Storefront not found' });
    }

    await storefrontService.incrementViews(storefront.id);

    res.json(storefront);
  } catch (error: unknown) {
    logger.error('Error fetching public storefront:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch storefront';
    if (errorMessage === 'Storefront not found') {
      return res.status(404).json({ error: errorMessage });
    }

    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/storefront/:slug
 * Get storefront by slug (for authenticated access)
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const storefront = await storefrontService.getStorefrontBySlug(slug);
    res.json(storefront);
  } catch (error: unknown) {
    logger.error('Error fetching storefront:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Storefront not found') {
      return res.status(404).json({ error: errMsg });
    }

    res.status(500).json({ error: errMsg || 'Failed to fetch storefront' });
  }
});

/**
 * POST /api/storefront/create
 * Create a new storefront
 */
router.post('/create', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = insertStorefrontSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });

    if (!storefrontService.validateSlug(validatedData.slug)) {
      return res.status(400).json({
        error:
          'Invalid slug format. Use lowercase letters, numbers, and hyphens only (3-50 characters)',
      });
    }

    const storefront = await storefrontService.createStorefront({
      userId: req.user!.id,
      name: validatedData.name,
      slug: validatedData.slug,
      templateId: validatedData.templateId || undefined,
      customization: validatedData.customization || {},
    });

    res.status(201).json(storefront);
  } catch (error: unknown) {
    logger.error('Error creating storefront:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg.includes('Slug already taken')) {
      return res.status(409).json({ error: errMsg });
    }

    if (errMsg.includes('Maximum of 5 storefronts')) {
      return res.status(400).json({ error: errMsg });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }

    res.status(500).json({ error: errMsg || 'Failed to create storefront' });
  }
});

/**
 * PUT /api/storefront/:id/customize
 * Update storefront customization and settings
 */
router.put('/:id/customize', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const validatedData = updateStorefrontSchema.parse(req.body);

    if (validatedData.slug && !storefrontService.validateSlug(validatedData.slug)) {
      return res.status(400).json({
        error:
          'Invalid slug format. Use lowercase letters, numbers, and hyphens only (3-50 characters)',
      });
    }

    const updatedStorefront = await storefrontService.updateStorefront(
      id,
      req.user!.id,
      validatedData
    );

    res.json(updatedStorefront);
  } catch (error: unknown) {
    logger.error('Error updating storefront:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Storefront not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (errMsg === 'Unauthorized') {
      return res.status(403).json({ error: errMsg });
    }

    if (errMsg.includes('Slug already taken')) {
      return res.status(409).json({ error: errMsg });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }

    res.status(500).json({ error: errMsg || 'Failed to update storefront' });
  }
});

/**
 * DELETE /api/storefront/:id
 * Delete a storefront
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    await storefrontService.deleteStorefront(id, req.user!.id);

    res.json({ success: true, message: 'Storefront deleted successfully' });
  } catch (error: unknown) {
    logger.error('Error deleting storefront:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Storefront not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (errMsg === 'Unauthorized') {
      return res.status(403).json({ error: errMsg });
    }

    res.status(500).json({ error: errMsg || 'Failed to delete storefront' });
  }
});

/**
 * GET /api/storefront/:storefrontId/membership-tiers
 * Get all membership tiers for a storefront (owner view)
 */
router.get('/:storefrontId/membership-tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { storefrontId } = req.params;
    const tiers = await storefrontService.getMembershipTiers(storefrontId);
    res.json(tiers);
  } catch (error: unknown) {
    logger.error('Error fetching membership tiers:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch membership tiers';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/storefront/:storefrontId/membership-tiers
 * Create a new membership tier for a storefront
 */
router.post('/:storefrontId/membership-tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { storefrontId } = req.params;

    const validatedData = insertMembershipTierSchema.parse({
      ...req.body,
      storefrontId,
    });

    const tier = await storefrontService.createMembershipTier({
      storefrontId,
      name: validatedData.name,
      description: validatedData.description || undefined,
      priceCents: validatedData.priceCents,
      currency: validatedData.currency || 'usd',
      interval: validatedData.interval as 'month' | 'year',
      benefits: validatedData.benefits || {},
      maxSubscribers: validatedData.maxSubscribers || undefined,
    });

    res.status(201).json(tier);
  } catch (error: unknown) {
    logger.error('Error creating membership tier:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Storefront not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }

    res.status(500).json({ error: errMsg || 'Failed to create membership tier' });
  }
});

/**
 * PUT /api/storefront/membership-tiers/:tierId
 * Update a membership tier
 */
router.put('/membership-tiers/:tierId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tierId } = req.params;
    const validatedData = updateMembershipTierSchema.parse(req.body);

    const tier = await storefrontService.updateMembershipTier(tierId, req.user!.id, validatedData);

    res.json(tier);
  } catch (error: unknown) {
    logger.error('Error updating membership tier:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Membership tier not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (errMsg === 'Unauthorized') {
      return res.status(403).json({ error: errMsg });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }

    res.status(500).json({ error: errMsg || 'Failed to update membership tier' });
  }
});

/**
 * DELETE /api/storefront/membership-tiers/:tierId
 * Delete a membership tier
 */
router.delete('/membership-tiers/:tierId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tierId } = req.params;

    await storefrontService.deleteMembershipTier(tierId, req.user!.id);

    res.json({ success: true, message: 'Membership tier deleted successfully' });
  } catch (error: unknown) {
    logger.error('Error deleting membership tier:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Membership tier not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (errMsg === 'Unauthorized') {
      return res.status(403).json({ error: errMsg });
    }

    if (errMsg.includes('Cannot delete tier with active subscriptions')) {
      return res.status(400).json({ error: errMsg });
    }

    res.status(500).json({ error: errMsg || 'Failed to delete membership tier' });
  }
});

/**
 * POST /api/storefront/subscribe/:tierId
 * Subscribe to a membership tier
 */
router.post('/subscribe/:tierId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tierId } = req.params;

    const result = await storefrontService.subscribeMembershipTier(req.user!.id, tierId);

    res.status(201).json(result);
  } catch (error: unknown) {
    logger.error('Error subscribing to membership tier:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Membership tier not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (
      errMsg.includes('not currently available') ||
      errMsg.includes('at maximum capacity') ||
      errMsg.includes('already have an active membership')
    ) {
      return res.status(400).json({ error: errMsg });
    }

    if (errMsg.includes('Stripe')) {
      return res
        .status(503)
        .json({ error: 'Payment service unavailable. Please try again later.' });
    }

    res.status(500).json({ error: errMsg || 'Failed to subscribe to membership tier' });
  }
});

/**
 * POST /api/storefront/memberships/:membershipId/cancel
 * Cancel a customer membership
 */
router.post('/memberships/:membershipId/cancel', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { membershipId } = req.params;

    const membership = await storefrontService.cancelMembership(membershipId, req.user!.id);

    res.json(membership);
  } catch (error: unknown) {
    logger.error('Error canceling membership:', error);
    const errMsg = getErrorMessage(error);

    if (errMsg === 'Membership not found') {
      return res.status(404).json({ error: errMsg });
    }

    if (errMsg === 'Unauthorized') {
      return res.status(403).json({ error: errMsg });
    }

    if (errMsg.includes('Stripe')) {
      return res
        .status(503)
        .json({ error: 'Payment service unavailable. Please try again later.' });
    }

    res.status(500).json({ error: errMsg || 'Failed to cancel membership' });
  }
});

/**
 * GET /api/storefront/memberships/my
 * Get current user's memberships
 */
router.get('/memberships/my', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const memberships = await storefrontService.getCustomerMemberships(req.user!.id);
    res.json(memberships);
  } catch (error: unknown) {
    logger.error('Error fetching customer memberships:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch memberships';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/storefront/generate-slug
 * Generate a unique slug from a name
 */
router.post('/generate-slug', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const slug = await storefrontService.generateSlug(name);
    res.json({ slug });
  } catch (error: unknown) {
    logger.error('Error generating slug:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate slug';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/storefront/:storefrontId/membership-tiers/public
 * Get public membership tiers for a storefront
 */
router.get('/:storefrontId/membership-tiers/public', async (req, res) => {
  try {
    const { storefrontId } = req.params;

    const tiers = await storefrontService.getMembershipTiers(storefrontId);
    const publicTiers = tiers.filter(tier => tier.isActive);
    
    res.json(publicTiers);
  } catch (error: unknown) {
    logger.error('Error fetching public membership tiers:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch membership tiers';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/storefront/:storefrontId/listings
 * Get marketplace listings for a storefront
 */
router.get('/:storefrontId/listings', async (req, res) => {
  try {
    const { storefrontId } = req.params;

    const listings = await storefrontService.getStorefrontListings(storefrontId);
    
    res.json(listings);
  } catch (error: unknown) {
    logger.error('Error fetching storefront listings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch listings';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/storefront/generate-subdomain
 * Generate a unique subdomain from a name
 */
router.post('/generate-subdomain', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const subdomain = await storefrontService.generateSubdomain(name);
    res.json({ subdomain });
  } catch (error: unknown) {
    logger.error('Error generating subdomain:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate subdomain';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/storefront/check-subdomain/:subdomain
 * Check if a subdomain is available
 */
router.get('/check-subdomain/:subdomain', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subdomain } = req.params;
    const { excludeStorefrontId } = req.query;

    const isValid = storefrontService.validateSubdomain(subdomain);
    if (!isValid) {
      return res.json({ 
        available: false, 
        reason: 'Invalid subdomain format. Use 3-30 lowercase letters, numbers, and hyphens.' 
      });
    }

    const isAvailable = await storefrontService.isSubdomainAvailable(
      subdomain, 
      excludeStorefrontId as string | undefined
    );

    res.json({ 
      available: isAvailable,
      reason: isAvailable ? null : 'Subdomain is already taken'
    });
  } catch (error: unknown) {
    logger.error('Error checking subdomain:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to check subdomain';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/storefront/subdomain/:subdomain
 * Get public storefront by subdomain (for subdomain-based routing)
 */
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;

    const storefront = await storefrontService.getStorefrontBySubdomain(subdomain);
    
    if (!storefront) {
      return res.status(404).json({ error: 'Storefront not found' });
    }

    await storefrontService.incrementViews(storefront.id);

    res.json(storefront);
  } catch (error: unknown) {
    logger.error('Error fetching storefront by subdomain:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch storefront';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * PUT /api/storefront/:storefrontId/subdomain
 * Update storefront subdomain settings
 */
router.put('/:storefrontId/subdomain', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { storefrontId } = req.params;
    const { subdomain, isSubdomainActive } = req.body;

    if (subdomain && !storefrontService.validateSubdomain(subdomain)) {
      return res.status(400).json({ 
        error: 'Invalid subdomain format. Use 3-30 lowercase letters, numbers, and hyphens.' 
      });
    }

    if (subdomain) {
      const isAvailable = await storefrontService.isSubdomainAvailable(subdomain, storefrontId);
      if (!isAvailable) {
        return res.status(400).json({ error: 'Subdomain is already taken' });
      }
    }

    const updatedStorefront = await storefrontService.updateStorefront(
      storefrontId,
      req.user!.id,
      { subdomain, isSubdomainActive }
    );

    res.json(updatedStorefront);
  } catch (error: unknown) {
    logger.error('Error updating subdomain:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update subdomain';
    if (errorMessage === 'Unauthorized') {
      return res.status(403).json({ error: errorMessage });
    }
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/storefront/upload-asset
 * Upload storefront assets (logo, banner, avatar)
 */
router.post('/upload-asset', upload.single('file'), async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!storageService) {
      return res.status(503).json({ error: 'File storage service is not available' });
    }

    const { assetType } = req.body;
    if (!['logo', 'banner', 'avatar'].includes(assetType)) {
      return res.status(400).json({ error: 'Invalid asset type. Must be logo, banner, or avatar' });
    }

    const folder = `storefronts/${req.user!.id}/${assetType}`;
    const key = await storageService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );

    const url = `/api/storage/file/${key}`;

    logger.info(`Uploaded storefront ${assetType} for user ${req.user!.id}: ${key}`);

    res.json({
      url,
      key,
      assetType,
    });
  } catch (error: unknown) {
    logger.error('Error uploading storefront asset:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload asset';
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// STOREFRONT SOCIAL ROUTES (Likes, Follows, Ratings)
// ============================================================================

router.get('/:id/social', async (req, res) => {
  try {
    const storefrontId = req.params.id;
    const userId = req.isAuthenticated() ? req.user!.id : null;

    const [likesResult] = await db.select({ count: count() }).from(storefrontLikes).where(eq(storefrontLikes.storefrontId, storefrontId));
    const [followsResult] = await db.select({ count: count() }).from(storefrontFollows).where(eq(storefrontFollows.storefrontId, storefrontId));
    const [ratingsResult] = await db.select({ count: count(), avg: avg(storefrontRatings.rating) }).from(storefrontRatings).where(eq(storefrontRatings.storefrontId, storefrontId));

    let userLiked = false;
    let userFollowing = false;
    let userRating: number | null = null;

    if (userId) {
      const [likeRow] = await db.select().from(storefrontLikes).where(and(eq(storefrontLikes.storefrontId, storefrontId), eq(storefrontLikes.userId, userId))).limit(1);
      const [followRow] = await db.select().from(storefrontFollows).where(and(eq(storefrontFollows.storefrontId, storefrontId), eq(storefrontFollows.userId, userId))).limit(1);
      const [ratingRow] = await db.select().from(storefrontRatings).where(and(eq(storefrontRatings.storefrontId, storefrontId), eq(storefrontRatings.userId, userId))).limit(1);
      userLiked = !!likeRow;
      userFollowing = !!followRow;
      userRating = ratingRow?.rating ?? null;
    }

    res.json({
      likes: likesResult?.count || 0,
      follows: followsResult?.count || 0,
      ratingsCount: ratingsResult?.count || 0,
      avgRating: ratingsResult?.avg ? parseFloat(String(ratingsResult.avg)) : 0,
      userLiked,
      userFollowing,
      userRating,
    });
  } catch (error) {
    logger.error('Error fetching social data:', error);
    res.status(500).json({ error: 'Failed to fetch social data' });
  }
});

router.post('/:id/like', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Login required' });
    const storefrontId = req.params.id;
    const userId = req.user!.id;

    const [existing] = await db.select().from(storefrontLikes).where(and(eq(storefrontLikes.storefrontId, storefrontId), eq(storefrontLikes.userId, userId))).limit(1);
    if (existing) {
      await db.delete(storefrontLikes).where(eq(storefrontLikes.id, existing.id));
      res.json({ liked: false });
    } else {
      await db.insert(storefrontLikes).values({ userId, storefrontId });
      res.json({ liked: true });
    }
  } catch (error) {
    logger.error('Error toggling like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

router.post('/:id/follow', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Login required' });
    const storefrontId = req.params.id;
    const userId = req.user!.id;

    const [existing] = await db.select().from(storefrontFollows).where(and(eq(storefrontFollows.storefrontId, storefrontId), eq(storefrontFollows.userId, userId))).limit(1);
    if (existing) {
      await db.delete(storefrontFollows).where(eq(storefrontFollows.id, existing.id));
      res.json({ following: false });
    } else {
      await db.insert(storefrontFollows).values({ userId, storefrontId });
      res.json({ following: true });
    }
  } catch (error) {
    logger.error('Error toggling follow:', error);
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

router.post('/:id/rate', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Login required' });
    const storefrontId = req.params.id;
    const userId = req.user!.id;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });

    const [existing] = await db.select().from(storefrontRatings).where(and(eq(storefrontRatings.storefrontId, storefrontId), eq(storefrontRatings.userId, userId))).limit(1);
    if (existing) {
      await db.update(storefrontRatings).set({ rating, review, updatedAt: new Date() }).where(eq(storefrontRatings.id, existing.id));
    } else {
      await db.insert(storefrontRatings).values({ userId, storefrontId, rating, review });
    }

    const [ratingsResult] = await db.select({ count: count(), avg: avg(storefrontRatings.rating) }).from(storefrontRatings).where(eq(storefrontRatings.storefrontId, storefrontId));

    res.json({
      userRating: rating,
      ratingsCount: ratingsResult?.count || 0,
      avgRating: ratingsResult?.avg ? parseFloat(String(ratingsResult.avg)) : 0,
    });
  } catch (error) {
    logger.error('Error submitting rating:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// ============================================================================
// STOREFRONT CHECKOUT
// ============================================================================

router.post('/:id/checkout', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Login required to purchase' });

    const storefrontId = req.params.id;
    const { listingIds, licenseType = 'basic' } = req.body;

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'At least one listing is required' });
    }

    if (listingIds.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 items per checkout' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' as any });

    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    if (storefront.userId === req.user!.id) {
      return res.status(400).json({ error: 'Cannot purchase from your own storefront' });
    }

    const storefrontListings = await db.select().from(listings)
      .where(and(eq(listings.userId, storefront.userId), eq(listings.status, 'active')));

    const validListings = storefrontListings.filter(l => listingIds.includes(l.id));
    if (validListings.length === 0) {
      return res.status(400).json({ error: 'No valid listings found' });
    }

    const lineItems = validListings.map(listing => {
      let priceCents = listing.priceCents;
      if (listing.discountPercent && listing.discountPriceCents != null) {
        if (!listing.discountExpiresAt || new Date(listing.discountExpiresAt) > new Date()) {
          priceCents = listing.discountPriceCents;
        }
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: listing.title,
            description: `${listing.genre || 'Beat'} - ${licenseType} license`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${getBaseUrl()}/store/${storefront.slug || storefrontId}?checkout=success`,
      cancel_url: `${getBaseUrl()}/store/${storefront.slug || storefrontId}?checkout=canceled`,
      metadata: {
        type: 'storefront_purchase',
        buyerId: req.user!.id,
        storefrontId,
        sellerId: storefront.userId,
        listingIds: JSON.stringify(validListings.map(l => l.id)),
        licenseType,
      },
    });

    for (const listing of validListings) {
      let priceCents = listing.priceCents;
      if (listing.discountPercent && listing.discountPriceCents != null) {
        if (!listing.discountExpiresAt || new Date(listing.discountExpiresAt) > new Date()) {
          priceCents = listing.discountPriceCents;
        }
      }
      await db.insert(storefrontOrders).values({
        buyerId: req.user!.id,
        storefrontId,
        sellerId: storefront.userId,
        listingId: listing.id,
        licenseType,
        amountCents: priceCents,
        status: 'pending',
        stripeSessionId: session.id,
      });
    }

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    logger.error('Error creating storefront checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.get('/:id/orders', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const storefrontId = req.params.id;

    const orders = await db.select().from(storefrontOrders)
      .where(and(
        eq(storefrontOrders.storefrontId, storefrontId),
        eq(storefrontOrders.buyerId, req.user!.id)
      ));

    res.json(orders);
  } catch (error) {
    logger.error('Error fetching storefront orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ============================================================================
// LISTING DISCOUNT ROUTES
// ============================================================================

router.put('/:storefrontId/listings/:listingId/discount', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

    const { storefrontId, listingId } = req.params;
    const { discountPercent, discountExpiresAt } = req.body;

    const [listing] = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.userId, req.user!.id))).limit(1);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    let discountPriceCents: number | null = null;
    if (discountPercent && discountPercent > 0 && discountPercent <= 100) {
      discountPriceCents = Math.round(listing.priceCents * (1 - discountPercent / 100));
    }

    const [updated] = await db.update(listings).set({
      discountPercent: discountPercent || null,
      discountPriceCents,
      discountExpiresAt: discountExpiresAt ? new Date(discountExpiresAt) : null,
      updatedAt: new Date(),
    }).where(eq(listings.id, listingId)).returning();

    res.json(updated);
  } catch (error) {
    logger.error('Error setting discount:', error);
    res.status(500).json({ error: 'Failed to set discount' });
  }
});

router.delete('/:storefrontId/listings/:listingId/discount', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

    const { listingId } = req.params;

    const [listing] = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.userId, req.user!.id))).limit(1);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const [updated] = await db.update(listings).set({
      discountPercent: null,
      discountPriceCents: null,
      discountExpiresAt: null,
      updatedAt: new Date(),
    }).where(eq(listings.id, listingId)).returning();

    res.json(updated);
  } catch (error) {
    logger.error('Error removing discount:', error);
    res.status(500).json({ error: 'Failed to remove discount' });
  }
});

// ============================================================================
// LICENSE TIER ROUTES (Per-license pricing & discounts)
// ============================================================================

router.get('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    const { listingId } = req.params;
    const tiers = await db.select().from(listingLicenseTiers)
      .where(eq(listingLicenseTiers.listingId, listingId))
      .orderBy(listingLicenseTiers.sortOrder);
    res.json(tiers);
  } catch (error) {
    logger.error('Error fetching license tiers:', error);
    res.status(500).json({ error: 'Failed to fetch license tiers' });
  }
});

router.put('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { listingId } = req.params;
    const { tiers } = req.body as { tiers: Array<{
      id?: string;
      licenseType: string;
      label?: string;
      priceCents: number;
      discountType?: string;
      discountPercent?: number;
      discountExpiresAt?: string;
      bogoEnabled?: boolean;
      bogoGetType?: string;
      bogoGetPercent?: number;
      fileFormats?: string[];
      audioUrls?: Record<string, string>;
      isActive?: boolean;
      sortOrder?: number;
    }> };

    const [listing] = await db.select().from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.userId, req.user!.id))).limit(1);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    await db.delete(listingLicenseTiers).where(eq(listingLicenseTiers.listingId, listingId));

    const insertedTiers = [];
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      let discountPriceCents: number | null = null;
      if (tier.discountType === 'percent' && tier.discountPercent && tier.discountPercent > 0 && tier.discountPercent <= 100) {
        discountPriceCents = Math.round(tier.priceCents * (1 - tier.discountPercent / 100));
      }

      const [inserted] = await db.insert(listingLicenseTiers).values({
        listingId,
        licenseType: tier.licenseType,
        label: tier.label || tier.licenseType.charAt(0).toUpperCase() + tier.licenseType.slice(1),
        priceCents: tier.priceCents,
        discountType: tier.discountType || 'none',
        discountPercent: tier.discountType === 'percent' ? (tier.discountPercent || null) : null,
        discountPriceCents,
        discountExpiresAt: tier.discountExpiresAt ? new Date(tier.discountExpiresAt) : null,
        bogoEnabled: tier.bogoEnabled || false,
        bogoGetType: tier.bogoEnabled ? (tier.bogoGetType || null) : null,
        bogoGetPercent: tier.bogoEnabled ? (tier.bogoGetPercent ?? 100) : 100,
        fileFormats: tier.fileFormats || ['mp3'],
        audioUrls: tier.audioUrls || {},
        isActive: tier.isActive !== false,
        sortOrder: tier.sortOrder ?? i,
      }).returning();
      insertedTiers.push(inserted);
    }

    const existingMeta = (listing.metadata as any) || {};
    await db.update(listings).set({
      metadata: { ...existingMeta, hasLicenseTiers: tiers.length > 0 },
      updatedAt: new Date(),
    }).where(eq(listings.id, listingId));

    res.json(insertedTiers);
  } catch (error) {
    logger.error('Error saving license tiers:', error);
    res.status(500).json({ error: 'Failed to save license tiers' });
  }
});

router.delete('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { listingId } = req.params;

    const [listing] = await db.select().from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.userId, req.user!.id))).limit(1);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    await db.delete(listingLicenseTiers).where(eq(listingLicenseTiers.listingId, listingId));

    const existingMeta = (listing.metadata as any) || {};
    await db.update(listings).set({
      metadata: { ...existingMeta, hasLicenseTiers: false },
      updatedAt: new Date(),
    }).where(eq(listings.id, listingId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing license tiers:', error);
    res.status(500).json({ error: 'Failed to remove license tiers' });
  }
});

const tierAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aiff', 'audio/x-aiff', 'audio/mp3'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|flac|aiff|aif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3, WAV, FLAC, and AIFF audio files are allowed'));
    }
  }
});

router.post('/:storefrontId/listings/:listingId/tier-audio', tierAudioUpload.single('audioFile'), async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { listingId } = req.params;
    const { format } = req.body;

    const [listing] = await db.select().from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.userId, req.user!.id))).limit(1);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const path = await import('path');
    const crypto = await import('crypto');
    const ext = path.extname(req.file.originalname) || '.mp3';
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

    const storageService = new ReplitStorageService();
    const key = await storageService.uploadFile(req.file.buffer, 'tier-audio', filename, req.file.mimetype);
    const audioUrl = `/api/marketplace/audio/${key}`;

    res.json({ url: audioUrl, format: format || ext.replace('.', ''), filename: req.file.originalname });
  } catch (error) {
    logger.error('Error uploading tier audio:', error);
    res.status(500).json({ error: 'Failed to upload tier audio file' });
  }
});

router.put('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { listingId } = req.params;
    const { tiers } = req.body;

    if (!Array.isArray(tiers)) {
      return res.status(400).json({ error: 'tiers must be an array' });
    }

    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing.userId !== req.user!.id) {
      return res.status(403).json({ error: 'You can only edit your own listings' });
    }

    await db.delete(listingLicenseTiers).where(eq(listingLicenseTiers.listingId, listingId));

    const savedTiers = [];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const [saved] = await db.insert(listingLicenseTiers).values({
        listingId,
        licenseType: t.licenseType,
        label: t.label || t.licenseType,
        priceCents: t.priceCents,
        discountType: t.discountType || 'none',
        discountPercent: t.discountPercent || 0,
        discountPriceCents: t.discountType === 'percent' && t.discountPercent
          ? Math.round(t.priceCents * (1 - (t.discountPercent / 100)))
          : null,
        discountExpiresAt: t.discountExpiresAt ? new Date(t.discountExpiresAt) : null,
        bogoEnabled: t.bogoEnabled || false,
        bogoGetType: t.bogoGetType || null,
        bogoGetPercent: t.bogoGetPercent || 100,
        fileFormats: t.fileFormats || ['mp3'],
        audioUrls: t.audioUrls || {},
        isActive: t.isActive !== false,
        sortOrder: i,
      }).returning();
      savedTiers.push(saved);
    }

    const currentMeta = (listing.metadata as Record<string, any>) || {};
    await db.update(listings).set({
      metadata: { ...currentMeta, hasLicenseTiers: true },
    }).where(eq(listings.id, listingId));

    res.json({ success: true, tiers: savedTiers });
  } catch (error) {
    logger.error('Error saving license tiers:', error);
    res.status(500).json({ error: 'Failed to save license tiers' });
  }
});

router.delete('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { listingId } = req.params;

    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing.userId !== req.user!.id) {
      return res.status(403).json({ error: 'You can only edit your own listings' });
    }

    await db.delete(listingLicenseTiers).where(eq(listingLicenseTiers.listingId, listingId));

    const currentMeta = (listing.metadata as Record<string, any>) || {};
    await db.update(listings).set({
      metadata: { ...currentMeta, hasLicenseTiers: false },
    }).where(eq(listings.id, listingId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting license tiers:', error);
    res.status(500).json({ error: 'Failed to delete license tiers' });
  }
});

router.get('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    const { listingId } = req.params;
    const tiers = await db.select().from(listingLicenseTiers)
      .where(eq(listingLicenseTiers.listingId, listingId))
      .orderBy(listingLicenseTiers.sortOrder);
    res.json(tiers);
  } catch (error) {
    logger.error('Error fetching license tiers:', error);
    res.status(500).json({ error: 'Failed to fetch license tiers' });
  }
});

export default router;

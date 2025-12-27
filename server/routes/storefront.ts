import { Router } from 'express';
import { storefrontService } from '../services/storefrontService';
import {
  insertStorefrontSchema,
  updateStorefrontSchema,
  insertMembershipTierSchema,
  updateMembershipTierSchema,
} from '@shared/schema';
import { z } from 'zod';
import { logger } from '../logger.js';

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
 * GET /api/storefront/:slug
 * Get public storefront by slug
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
 * GET /api/storefront/public/:slug
 * Get public storefront by slug (unauthenticated access)
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

export default router;

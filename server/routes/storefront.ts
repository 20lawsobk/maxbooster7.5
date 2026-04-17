import { Router } from 'express';
import { createHardenedUpload } from '../middleware/uploadHandler.js';
import path from 'path';
import { storefrontService } from '../services/storefrontService';
import { hybridStorageService } from '../services/hybridStorageService';
import { storeUploadedFile } from '../middleware/uploadHandler.js';
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
  storefrontDomains,
  users,
  bogoPromotions,
  membershipTiers,
  customerMemberships,
} from '@shared/schema';
import Stripe from 'stripe';
import { getBaseUrl } from '../config/defaults';
import { db } from '../db';
import { eq, and, count, avg, sql, lte, gte, or, isNull, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';
import dns from 'dns';
import { validateDnsLabel, validateDomain } from '../modules/domains/dnsValidators.js';

const dnsPromises = dns.promises;
const PLATFORM_IP = process.env.DNS_SERVER_IP || '34.111.179.208';


const upload = createHardenedUpload({
  maxFileSize: 200 * 1024 * 1024, // 200MB
  maxFiles: 1,
  allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  label: 'storefront image',
});

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
    logger.warn({ err: error }, 'Error fetching templates:');
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
    logger.warn({ err: error }, 'Error fetching user storefronts:');
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
    logger.warn({ err: error }, 'Error fetching public storefront:');

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch storefront';
    if (errorMessage === 'Storefront not found') {
      return res.status(404).json({ error: errorMessage });
    }

    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/storefront/suggest-url
 * Suggest a slug + check managed subdomain availability.
 * MUST be registered before /:slug to avoid being swallowed by the wildcard.
 */
router.get('/suggest-url', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const slug = await storefrontService.generateRandomSlug();
    const baseDomain = process.env.BASE_DOMAIN || 'maxbooster.replit.app';
    const suggestedDomain = `${slug}.${baseDomain}`;

    const existingDomain = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, suggestedDomain))
      .limit(1);

    res.json({
      slug,
      suggestedDomain,
      domainAvailable: existingDomain.length === 0,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error suggesting URL:');
    res.status(500).json({ error: 'Failed to suggest URL' });
  }
});

/**
 * GET /api/storefront/check-domain
 * Validate format and check availability of a custom domain against storefrontDomains table.
 */
router.get('/check-domain', async (req, res) => {
  try {
    const raw = (req.query.domain as string || '').toLowerCase().trim();
    if (!raw) {
      return res.status(400).json({ error: 'domain query param required' });
    }

    const result = validateDomain(raw);
    if (!result.ok) {
      return res.status(200).json({ available: false, valid: false, reason: result.error });
    }

    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, result.normalized))
      .limit(1);

    res.json({ available: existing.length === 0, valid: true, domain: result.normalized });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error checking custom domain:');
    res.status(500).json({ error: 'Failed to check domain' });
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
    logger.warn({ err: error }, 'Error fetching storefront:');
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
    logger.warn({ err: error }, 'Error creating storefront:');
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
    logger.warn({ err: error }, 'Error updating storefront:');
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
 * PATCH /api/storefront/:id/publish
 * Publish or unpublish a storefront (toggle isPublic)
 */
router.patch('/:id/publish', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { isPublished } = req.body;

    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({ error: 'isPublished must be a boolean' });
    }

    const storefront = await db.query.storefronts.findFirst({
      where: eq(storefronts.id, id),
    });

    if (!storefront) {
      return res.status(404).json({ error: 'Storefront not found' });
    }

    if (storefront.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [updated] = await db
      .update(storefronts)
      .set({
        isPublic: isPublished,
        updatedAt: new Date(),
      })
      .where(eq(storefronts.id, id))
      .returning();

    logger.info(`Storefront ${id} ${isPublished ? 'published' : 'unpublished'} by user ${req.user!.id}`);

    res.json(updated);
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error toggling storefront publish status:');
    res.status(500).json({ error: getErrorMessage(error) || 'Failed to update publish status' });
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
    logger.warn({ err: error }, 'Error deleting storefront:');
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
    logger.warn({ err: error }, 'Error fetching membership tiers:');
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
    logger.warn({ err: error }, 'Error creating membership tier:');
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
    logger.warn({ err: error }, 'Error updating membership tier:');
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
    logger.warn({ err: error }, 'Error deleting membership tier:');
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
    const user = req.user!;

    const tierResults = await db
      .select({ tier: membershipTiers, storefront: storefronts })
      .from(membershipTiers)
      .leftJoin(storefronts, eq(membershipTiers.storefrontId, storefronts.id))
      .where(eq(membershipTiers.id, tierId))
      .limit(1);

    const tier = tierResults[0]?.tier;
    const storefront = tierResults[0]?.storefront;

    if (!tier) {
      return res.status(404).json({ error: 'Membership tier not found' });
    }

    if (!tier.isActive) {
      return res.status(400).json({ error: 'This membership tier is not currently available' });
    }

    const existingMemberships = await db
      .select()
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.customerId, user.id),
          eq(customerMemberships.tierId, tierId),
          eq(customerMemberships.status, 'active')
        )
      )
      .limit(1);

    if (existingMemberships[0]) {
      return res.status(400).json({ error: 'You already have an active membership to this tier' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey?.startsWith('sk_')) {
      return res.status(503).json({ error: 'Payment service unavailable. Please try again later.' });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });

    let stripeCustomerId = (user as any).stripeCustomerId as string | undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;
      await db.update(users).set({ stripeCustomerId }).where(eq(users.id, user.id));
    }

    let stripePriceId = (tier as any).stripePriceId as string | null | undefined;
    if (!stripePriceId) {
      const price = await stripe.prices.create({
        unit_amount: tier.priceCents,
        currency: tier.currency || 'usd',
        recurring: { interval: tier.interval as 'month' | 'year' },
        product_data: {
          name: `${storefront?.name || 'Artist'} - ${tier.name}`,
          description: tier.description || undefined,
        },
        metadata: {
          storefrontId: tier.storefrontId,
          tierName: tier.name,
        },
      });
      stripePriceId = price.id;
      await db.update(membershipTiers).set({ stripePriceId }).where(eq(membershipTiers.id, tierId));
    }

    const appUrl = process.env.APP_URL || 'https://maxbooster.replit.app';
    const storefrontSlug = storefront?.slug || '';
    const returnBase = `${appUrl}/storefront/${storefrontSlug}`;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${returnBase}?membership=success`,
      cancel_url: `${returnBase}?membership=canceled`,
      metadata: {
        type: 'storefront_membership',
        customerId: user.id,
        tierId,
        storefrontId: tier.storefrontId,
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error creating membership checkout session:');
    const errMsg = getErrorMessage(error);
    res.status(500).json({ error: errMsg || 'Failed to initiate subscription' });
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
    logger.warn({ err: error }, 'Error canceling membership:');
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
    logger.warn({ err: error }, 'Error fetching customer memberships:');
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
    logger.warn({ err: error }, 'Error generating slug:');
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
    logger.warn({ err: error }, 'Error fetching public membership tiers:');
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
    logger.warn({ err: error }, 'Error fetching storefront listings:');
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
    logger.warn({ err: error }, 'Error generating subdomain:');
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
    logger.warn({ err: error }, 'Error checking subdomain:');
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
    logger.warn({ err: error }, 'Error fetching storefront by subdomain:');
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
    logger.warn({ err: error }, 'Error updating subdomain:');
    const errorMessage = error instanceof Error ? error.message : 'Failed to update subdomain';
    if (errorMessage === 'Unauthorized') {
      return res.status(403).json({ error: errorMessage });
    }
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * PUT /api/storefront/:storefrontId/custom-domain
 * Save and activate a custom domain for a storefront
 */
router.put('/:storefrontId/custom-domain', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { storefrontId } = req.params;
    const { customDomain, isCustomDomainActive } = req.body;

    if (customDomain) {
      const domResult = validateDomain(customDomain);
      if (!domResult.ok) {
        return res.status(400).json({ error: domResult.error });
      }
      const normalized = domResult.normalized;
      const existingDomain = await db
        .select({ id: storefrontDomains.id, storefrontId: storefrontDomains.storefrontId })
        .from(storefrontDomains)
        .where(eq(storefrontDomains.domain, normalized))
        .limit(1);
      if (existingDomain.length > 0 && existingDomain[0].storefrontId !== storefrontId) {
        return res.status(400).json({ error: 'This domain is already in use by another storefront' });
      }

      const updatedStorefront = await storefrontService.updateStorefront(storefrontId, req.user!.id, {
        customDomain: normalized,
        isCustomDomainActive: isCustomDomainActive ?? false,
      });
      return res.json(updatedStorefront);
    }

    const updatedStorefront = await storefrontService.updateStorefront(storefrontId, req.user!.id, {
      customDomain: null,
      isCustomDomainActive: false,
    });
    res.json(updatedStorefront);
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error updating custom domain:');
    const errorMessage = error instanceof Error ? error.message : 'Failed to update custom domain';
    if (errorMessage === 'Unauthorized') {
      return res.status(403).json({ error: errorMessage });
    }
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/storefront/:storefrontId/verify-domain
 * Perform DNS verification of the custom domain
 * Checks for CNAME pointing to maxbooster.replit.app
 */
router.post('/:storefrontId/verify-domain', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { storefrontId } = req.params;

    const [storefront] = await db.select({
      id: storefronts.id,
      userId: storefronts.userId,
      customDomain: storefronts.customDomain,
    }).from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);

    if (!storefront) {
      return res.status(404).json({ error: 'Storefront not found' });
    }
    if (storefront.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!storefront.customDomain) {
      return res.status(400).json({ error: 'No custom domain configured' });
    }

    const domain = storefront.customDomain;
    const result: {
      verified: boolean;
      cnameFound: boolean;
      aRecordFound: boolean;
      cnameTarget?: string;
      aRecords?: string[];
      error?: string;
    } = { verified: false, cnameFound: false, aRecordFound: false };

    try {
      const cnames = await dnsPromises.resolveCname(domain);
      result.cnameFound = cnames.length > 0;
      result.cnameTarget = cnames[0];
      if (cnames.some(c => c.toLowerCase().includes('maxbooster') || c.toLowerCase().includes('replit'))) {
        result.verified = true;
      }
    } catch {
      result.cnameFound = false;
    }

    if (!result.verified) {
      try {
        const addresses = await dnsPromises.resolve4(domain);
        result.aRecordFound = addresses.length > 0;
        result.aRecords = addresses;
        if (addresses.includes(PLATFORM_IP)) {
          result.verified = true;
        }
      } catch {
        result.aRecordFound = false;
      }
    }

    if (result.verified) {
      await storefrontService.updateStorefront(storefrontId, req.user!.id, {
        isCustomDomainActive: true,
      });
    }

    res.json(result);
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error verifying custom domain:');
    res.status(500).json({ error: 'Failed to verify domain' });
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

    const { assetType } = req.body;
    if (!['logo', 'banner', 'avatar'].includes(assetType)) {
      return res.status(400).json({ error: 'Invalid asset type. Must be logo, banner, or avatar' });
    }

    const category = assetType === 'avatar' ? 'avatar' : 'artwork';
    const result = await storeUploadedFile(req.file, req.user!.id, category);

    logger.info(`Uploaded storefront ${assetType} via storeUploadedFile for user ${req.user!.id}: ${result.key} (processed: ${result.processed})`);

    res.json({
      url: result.url,
      key: result.key,
      assetType,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Error uploading storefront asset:');
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

    const [likesResult] = await db.select({ count: count() }).from(storefrontLikes).where(eq(storefrontLikes.storefrontId, storefrontId))
      .limit(1);
    const [followsResult] = await db.select({ count: count() }).from(storefrontFollows).where(eq(storefrontFollows.storefrontId, storefrontId))
      .limit(1);
    const [ratingsResult] = await db.select({ count: count(), avg: avg(storefrontRatings.rating) }).from(storefrontRatings).where(eq(storefrontRatings.storefrontId, storefrontId))
      .limit(1);

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
    logger.warn({ err: error }, 'Error fetching social data:');
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
    logger.warn({ err: error }, 'Error toggling like:');
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
    logger.warn({ err: error }, 'Error toggling follow:');
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

    const [ratingsResult] = await db.select({ count: count(), avg: avg(storefrontRatings.rating) }).from(storefrontRatings).where(eq(storefrontRatings.storefrontId, storefrontId))
      .limit(1);

    res.json({
      userRating: rating,
      ratingsCount: ratingsResult?.count || 0,
      avgRating: ratingsResult?.avg ? parseFloat(String(ratingsResult.avg)) : 0,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error submitting rating:');
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

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      logger.warn('Stripe secret key is not configured');
      return res.status(503).json({ error: 'Payment processing is not available. Please contact support.' });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });

    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    if (storefront.userId === req.user!.id) {
      return res.status(400).json({ error: 'Cannot purchase from your own storefront' });
    }

    const validListings = await db.select().from(listings)
      .where(and(
        eq(listings.userId, storefront.userId),
        eq(listings.isPublished, true),
        inArray(listings.id, listingIds)
      ))
      .limit(50);
    if (validListings.length === 0) {
      return res.status(400).json({ error: 'No valid listings found' });
    }

    const cartItems = validListings.map(listing => {
      let priceCents = listing.priceCents;
      if (listing.discountPercent && listing.discountPriceCents != null) {
        if (!listing.discountExpiresAt || new Date(listing.discountExpiresAt) > new Date()) {
          priceCents = listing.discountPriceCents;
        }
      }
      return { id: listing.id, title: listing.title, priceCents, genre: listing.genre };
    });

    const activePromos = await db.select().from(bogoPromotions)
      .where(getActivePromotionsFilter(storefrontId))
      .limit(50);

    const customerRedemptions = new Map<string, number>();
    if (req.user?.id && activePromos.length > 0) {
      const pastOrders = await db.select({
        promoId: storefrontOrders.appliedPromotionId,
      }).from(storefrontOrders).where(and(
        eq(storefrontOrders.buyerId, req.user.id),
        eq(storefrontOrders.storefrontId, storefrontId),
        eq(storefrontOrders.status, 'completed'),
      )).limit(1000);
      for (const order of pastOrders) {
        if (order.promoId) {
          customerRedemptions.set(order.promoId, (customerRedemptions.get(order.promoId) || 0) + 1);
        }
      }
    }
    const bogoResult = applyBogoToCart(cartItems, activePromos, customerRedemptions, licenseType);

    const bogoLicenseType = bogoResult.appliedPromotion?.bogoLicenseType;

    const lineItems = cartItems.map((item, index) => {
      let unitAmount = item.priceCents;
      const isBogo = bogoResult.freeItemIndices.includes(index) || bogoResult.discountedItems.some(d => d.index === index);
      const itemLicense = (isBogo && bogoLicenseType) ? bogoLicenseType : licenseType;
      let desc = `${validListings[index].genre || 'Beat'} - ${itemLicense} license`;

      if (bogoResult.freeItemIndices.includes(index)) {
        unitAmount = 0;
        desc += ' (FREE - BOGO Deal)';
      } else {
        const discountInfo = bogoResult.discountedItems.find(d => d.index === index);
        if (discountInfo) {
          unitAmount = Math.round(item.priceCents * (100 - discountInfo.discountPercent) / 100);
          desc += ` (${discountInfo.discountPercent}% off - BOGO Deal)`;
        }
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            description: desc,
          },
          unit_amount: Math.max(unitAmount, 0),
        },
        quantity: 1,
      };
    }).filter(item => item.price_data.unit_amount > 0);

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
        promotionId: bogoResult.appliedPromotion?.id || '',
        promotionSummary: bogoResult.summary || '',
      },
    });

    for (let i = 0; i < validListings.length; i++) {
      const item = cartItems[i];
      const isFree = bogoResult.freeItemIndices.includes(i);
      const discountInfo = bogoResult.discountedItems.find(d => d.index === i);
      let finalAmount = item.priceCents;
      let discountCents = 0;

      if (isFree) {
        discountCents = item.priceCents;
        finalAmount = 0;
      } else if (discountInfo) {
        discountCents = Math.round(item.priceCents * discountInfo.discountPercent / 100);
        finalAmount = item.priceCents - discountCents;
      }

      const orderLicenseType = ((isFree || discountInfo) && bogoLicenseType) ? bogoLicenseType : licenseType;
      await db.insert(storefrontOrders).values({
        buyerId: req.user!.id,
        storefrontId,
        sellerId: storefront.userId,
        listingId: validListings[i].id,
        licenseType: orderLicenseType,
        amountCents: finalAmount,
        status: 'pending',
        stripeSessionId: session.id,
        appliedPromotionId: bogoResult.appliedPromotion?.id || null,
        discountCents,
        isFreeItem: isFree,
      });
    }

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    logger.warn({ err: error }, 'Error creating storefront checkout:');
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.get('/:id/orders', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const storefrontId = req.params.id;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;
    const orders = await db.select().from(storefrontOrders)
      .where(and(
        eq(storefrontOrders.storefrontId, storefrontId),
        eq(storefrontOrders.buyerId, req.user!.id)
      ))
      .limit(limit)
      .offset(offset);

    res.json(orders);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching storefront orders:');
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
    logger.warn({ err: error }, 'Error setting discount:');
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
    logger.warn({ err: error }, 'Error removing discount:');
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
      .orderBy(listingLicenseTiers.sortOrder)
      .limit(20);
    res.json(tiers);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching license tiers:');
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
    logger.warn({ err: error }, 'Error saving license tiers:');
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
    logger.warn({ err: error }, 'Error removing license tiers:');
    res.status(500).json({ error: 'Failed to remove license tiers' });
  }
});

const tierAudioUpload = createHardenedUpload({
  maxFileSize: 200 * 1024 * 1024, // 200MB
  maxFiles: 1,
  allowedMimes: [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff',
  ],
  allowedExtensions: ['.mp3', '.wav', '.flac', '.aiff', '.aif'],
  label: 'storefront tier audio',
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

    const ext = path.extname(req.file.originalname) || '.mp3';
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

    const audioResult = await hybridStorageService.upload(
      req.user!.id,
      filename,
      req.file.buffer,
      req.file.mimetype,
      { folder: 'tier-audio', forceLocation: 'pocket-dimension' as const }
    );
    const audioUrl = `/api/marketplace/audio/${audioResult.key}`;

    res.json({ url: audioUrl, format: format || ext.replace('.', ''), filename: req.file.originalname });
  } catch (error) {
    logger.warn({ err: error }, 'Error uploading tier audio:');
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

    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
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
    logger.warn({ err: error }, 'Error saving license tiers:');
    res.status(500).json({ error: 'Failed to save license tiers' });
  }
});

router.delete('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { listingId } = req.params;

    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
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
    logger.warn({ err: error }, 'Error deleting license tiers:');
    res.status(500).json({ error: 'Failed to delete license tiers' });
  }
});

router.get('/:storefrontId/listings/:listingId/tiers', async (req, res) => {
  try {
    const { listingId } = req.params;
    const tiers = await db.select().from(listingLicenseTiers)
      .where(eq(listingLicenseTiers.listingId, listingId))
      .orderBy(listingLicenseTiers.sortOrder)
      .limit(20);
    res.json(tiers);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching license tiers:');
    res.status(500).json({ error: 'Failed to fetch license tiers' });
  }
});

// ============================================================================
// BOGO PROMOTIONS
// ============================================================================

function getActivePromotionsFilter(storefrontId: string) {
  const now = new Date();
  return and(
    eq(bogoPromotions.storefrontId, storefrontId),
    eq(bogoPromotions.status, 'active'),
    or(isNull(bogoPromotions.startAt), lte(bogoPromotions.startAt, now)),
    or(isNull(bogoPromotions.endAt), gte(bogoPromotions.endAt, now))
  );
}

interface BogoResult {
  appliedPromotion: any | null;
  freeItemIndices: number[];
  discountedItems: { index: number; discountPercent: number }[];
  totalSavingsCents: number;
  summary: string;
}

function applyBogoToCart(
  cartListings: Array<{ id: string; priceCents: number; genre?: string | null }>,
  promotions: any[],
  customerRedemptions?: Map<string, number>,
  cartLicenseType?: string
): BogoResult {
  if (!promotions.length || !cartListings.length) {
    return { appliedPromotion: null, freeItemIndices: [], discountedItems: [], totalSavingsCents: 0, summary: '' };
  }

  const sortedPromos = [...promotions].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  let bestResult: BogoResult = { appliedPromotion: null, freeItemIndices: [], discountedItems: [], totalSavingsCents: 0, summary: '' };

  for (const promo of sortedPromos) {
    if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) continue;

    if (promo.perCustomerLimit && customerRedemptions) {
      const customerUses = customerRedemptions.get(promo.id) || 0;
      if (customerUses >= promo.perCustomerLimit) continue;
    }

    if (promo.buyLicenseType && cartLicenseType && promo.buyLicenseType !== cartLicenseType) {
      continue;
    }

    const totalNeeded = promo.buyQuantity + promo.getQuantity;
    
    let eligibleItems: Array<{ index: number; priceCents: number }>;
    if (promo.appliesTo === 'specific' && promo.applicableListingIds?.length > 0) {
      eligibleItems = cartListings
        .map((l, i) => ({ index: i, priceCents: l.priceCents, id: l.id }))
        .filter(item => promo.applicableListingIds.includes((item as any).id));
    } else if (promo.appliesTo === 'genre' && promo.applicableGenres?.length > 0) {
      eligibleItems = cartListings
        .map((l, i) => ({ index: i, priceCents: l.priceCents, genre: l.genre }))
        .filter(item => promo.applicableGenres.includes((item as any).genre));
    } else {
      eligibleItems = cartListings.map((l, i) => ({ index: i, priceCents: l.priceCents }));
    }

    if (eligibleItems.length < totalNeeded) continue;

    const sorted = [...eligibleItems].sort((a, b) => a.priceCents - b.priceCents);

    const setsApplicable = Math.floor(sorted.length / totalNeeded);
    const freeIndices: number[] = [];
    const discountedItems: { index: number; discountPercent: number }[] = [];
    let savings = 0;
    const discountPercent = promo.getDiscountPercent;

    for (let setIdx = 0; setIdx < setsApplicable; setIdx++) {
      const setStart = setIdx * totalNeeded;
      const freeOrDiscounted = sorted.slice(setStart, setStart + promo.getQuantity);

      for (const item of freeOrDiscounted) {
        if (discountPercent === 100) {
          freeIndices.push(item.index);
          savings += item.priceCents;
        } else {
          discountedItems.push({ index: item.index, discountPercent });
          savings += Math.round(item.priceCents * discountPercent / 100);
        }
      }
    }

    if (savings > bestResult.totalSavingsCents) {
      const buyLabel = promo.buyLicenseType
        ? `${promo.buyQuantity} ${promo.buyLicenseType}`
        : `${promo.buyQuantity}`;
      const getLabel = promo.bogoLicenseType
        ? `${promo.getQuantity} ${promo.bogoLicenseType}`
        : `${promo.getQuantity}`;
      let summary: string;
      if (discountPercent === 100) {
        summary = setsApplicable > 1
          ? `${promo.name}: Buy ${buyLabel}, Get ${getLabel} FREE! (${setsApplicable}x applied)`
          : `${promo.name}: Buy ${buyLabel}, Get ${getLabel} FREE!`;
      } else {
        summary = setsApplicable > 1
          ? `${promo.name}: Buy ${buyLabel}, Get ${getLabel} at ${discountPercent}% off! (${setsApplicable}x applied)`
          : `${promo.name}: Buy ${buyLabel}, Get ${getLabel} at ${discountPercent}% off!`;
      }
      bestResult = { appliedPromotion: promo, freeItemIndices: freeIndices, discountedItems, totalSavingsCents: savings, summary };
    }
  }

  return bestResult;
}

router.get('/:storefrontId/bogo-promotions', async (req, res) => {
  try {
    const { storefrontId } = req.params;
    const promos = await db.select().from(bogoPromotions)
      .where(getActivePromotionsFilter(storefrontId))
      .orderBy(bogoPromotions.priority)
      .limit(100);
    res.json(promos);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching BOGO promotions:');
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

router.get('/:storefrontId/bogo-promotions/all', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { storefrontId } = req.params;
    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront || storefront.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not your storefront' });
    }
    const promos = await db.select().from(bogoPromotions)
      .where(eq(bogoPromotions.storefrontId, storefrontId))
      .orderBy(bogoPromotions.createdAt)
      .limit(100);
    res.json(promos);
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching all BOGO promotions:');
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

router.post('/:storefrontId/bogo-promotions', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { storefrontId } = req.params;
    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront || storefront.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not your storefront' });
    }

    const { name, description, promoType, buyQuantity, getQuantity, getDiscountPercent,
            appliesTo, applicableListingIds, applicableGenres, buyLicenseType, bogoLicenseType,
            maxRedemptions, perCustomerLimit, stackable, priority, status, startAt, endAt } = req.body;

    if (!name || !buyQuantity || !getQuantity) {
      return res.status(400).json({ error: 'Name, buy quantity, and get quantity are required' });
    }
    if (buyQuantity < 1 || getQuantity < 1) {
      return res.status(400).json({ error: 'Quantities must be at least 1' });
    }
    if (getDiscountPercent != null && (getDiscountPercent < 1 || getDiscountPercent > 100)) {
      return res.status(400).json({ error: 'Discount percent must be between 1 and 100' });
    }

    const [promo] = await db.insert(bogoPromotions).values({
      storefrontId,
      userId: req.user!.id,
      name,
      description: description || null,
      promoType: promoType || 'buy_x_get_y_free',
      buyQuantity,
      getQuantity,
      getDiscountPercent: getDiscountPercent ?? 100,
      appliesTo: appliesTo || 'all',
      applicableListingIds: applicableListingIds || [],
      applicableGenres: applicableGenres || [],
      buyLicenseType: buyLicenseType || null,
      bogoLicenseType: bogoLicenseType || null,
      maxRedemptions: maxRedemptions || null,
      perCustomerLimit: perCustomerLimit || null,
      stackable: stackable ?? false,
      priority: priority ?? 0,
      status: status || 'active',
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
    }).returning();

    res.json(promo);
  } catch (error) {
    logger.warn({ err: error }, 'Error creating BOGO promotion:');
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

router.put('/:storefrontId/bogo-promotions/:promoId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { storefrontId, promoId } = req.params;
    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront || storefront.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not your storefront' });
    }

    const { name, description, promoType, buyQuantity, getQuantity, getDiscountPercent,
            appliesTo, applicableListingIds, applicableGenres, buyLicenseType, bogoLicenseType,
            maxRedemptions, perCustomerLimit, stackable, priority, status, startAt, endAt } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (promoType !== undefined) updateData.promoType = promoType;
    if (buyQuantity !== undefined) updateData.buyQuantity = buyQuantity;
    if (getQuantity !== undefined) updateData.getQuantity = getQuantity;
    if (getDiscountPercent !== undefined) updateData.getDiscountPercent = getDiscountPercent;
    if (appliesTo !== undefined) updateData.appliesTo = appliesTo;
    if (applicableListingIds !== undefined) updateData.applicableListingIds = applicableListingIds;
    if (applicableGenres !== undefined) updateData.applicableGenres = applicableGenres;
    if (buyLicenseType !== undefined) updateData.buyLicenseType = buyLicenseType;
    if (bogoLicenseType !== undefined) updateData.bogoLicenseType = bogoLicenseType;
    if (maxRedemptions !== undefined) updateData.maxRedemptions = maxRedemptions;
    if (perCustomerLimit !== undefined) updateData.perCustomerLimit = perCustomerLimit;
    if (stackable !== undefined) updateData.stackable = stackable;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (startAt !== undefined) updateData.startAt = startAt ? new Date(startAt) : null;
    if (endAt !== undefined) updateData.endAt = endAt ? new Date(endAt) : null;

    const [promo] = await db.update(bogoPromotions)
      .set(updateData)
      .where(and(eq(bogoPromotions.id, promoId), eq(bogoPromotions.storefrontId, storefrontId)))
      .returning();

    if (!promo) return res.status(404).json({ error: 'Promotion not found' });
    res.json(promo);
  } catch (error) {
    logger.warn({ err: error }, 'Error updating BOGO promotion:');
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

router.delete('/:storefrontId/bogo-promotions/:promoId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { storefrontId, promoId } = req.params;
    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront || storefront.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not your storefront' });
    }

    await db.delete(bogoPromotions)
      .where(and(eq(bogoPromotions.id, promoId), eq(bogoPromotions.storefrontId, storefrontId)));
    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Error deleting BOGO promotion:');
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
});

router.post('/:id/checkout/preview', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Login required' });
    const storefrontId = req.params.id;
    const { listingIds, licenseType = 'basic' } = req.body;

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'At least one listing is required' });
    }

    const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    const validListings = await db.select().from(listings)
      .where(and(
        eq(listings.userId, storefront.userId),
        eq(listings.isPublished, true),
        inArray(listings.id, listingIds)
      ))
      .limit(50);

    const cartItems = validListings.map(l => {
      let priceCents = l.priceCents;
      if (l.discountPercent && l.discountPriceCents != null) {
        if (!l.discountExpiresAt || new Date(l.discountExpiresAt) > new Date()) {
          priceCents = l.discountPriceCents;
        }
      }
      return { id: l.id, title: l.title, priceCents, genre: l.genre };
    });

    const activePromos = await db.select().from(bogoPromotions)
      .where(getActivePromotionsFilter(storefrontId))
      .limit(50);

    const customerRedemptions = new Map<string, number>();
    if (req.user?.id && activePromos.length > 0) {
      const pastOrders = await db.select({
        promoId: storefrontOrders.appliedPromotionId,
      }).from(storefrontOrders).where(and(
        eq(storefrontOrders.buyerId, req.user.id),
        eq(storefrontOrders.storefrontId, storefrontId),
        eq(storefrontOrders.status, 'completed'),
      )).limit(1000);
      for (const order of pastOrders) {
        if (order.promoId) {
          customerRedemptions.set(order.promoId, (customerRedemptions.get(order.promoId) || 0) + 1);
        }
      }
    }
    const bogoResult = applyBogoToCart(cartItems, activePromos, customerRedemptions, licenseType);

    const subtotalCents = cartItems.reduce((s, item) => s + item.priceCents, 0);

    res.json({
      items: cartItems.map((item, i) => ({
        ...item,
        isFree: bogoResult.freeItemIndices.includes(i),
        discountPercent: bogoResult.discountedItems.find(d => d.index === i)?.discountPercent || 0,
      })),
      subtotalCents,
      discountCents: bogoResult.totalSavingsCents,
      totalCents: subtotalCents - bogoResult.totalSavingsCents,
      promotionApplied: bogoResult.appliedPromotion ? {
        id: bogoResult.appliedPromotion.id,
        name: bogoResult.appliedPromotion.name,
        summary: bogoResult.summary,
      } : null,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error previewing checkout:');
    res.status(500).json({ error: 'Failed to preview checkout' });
  }
});

export default router;

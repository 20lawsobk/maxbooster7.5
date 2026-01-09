import { db } from '../db';
import {
  storefronts,
  storefrontTemplates,
  membershipTiers,
  customerMemberships,
  listings,
  users,
} from '@shared/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import { logger } from '../logger.js';

const stripe = process.env.STRIPE_SECRET_KEY?.startsWith('sk_')
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' })
  : null;

// Validation constraints
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 2;
const MAX_SLUG_LENGTH = 63;
const MIN_SLUG_LENGTH = 3;
const RESERVED_SLUGS = ['admin', 'api', 'www', 'app', 'dashboard', 'login', 'signup', 'help', 'support', 'billing', 'settings'];

// Allowed customization keys for sanitization
const ALLOWED_CUSTOMIZATION_KEYS = [
  'primaryColor', 'secondaryColor', 'backgroundColor', 'textColor',
  'fontFamily', 'headerFont', 'bodyFont',
  'logoUrl', 'bannerUrl', 'favicon',
  'borderRadius', 'buttonStyle', 'layoutType',
  'showSocialLinks', 'socialLinks',
  'headerLayout', 'footerLayout', 'gridColumns',
  'accentColor', 'linkColor', 'shadowStyle',
];

const ALLOWED_SEO_KEYS = [
  'title', 'description', 'keywords', 'ogImage', 'ogTitle', 'ogDescription',
  'twitterCard', 'twitterHandle', 'canonicalUrl', 'robots',
];

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeString(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize customization object
 */
function sanitizeCustomization(customization: any): Record<string, any> {
  if (!customization || typeof customization !== 'object') {
    return {};
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(customization)) {
    if (!ALLOWED_CUSTOMIZATION_KEYS.includes(key)) {
      continue; // Skip unknown keys
    }

    if (typeof value === 'string') {
      // Validate URLs
      if (key.endsWith('Url') || key === 'logoUrl' || key === 'bannerUrl' || key === 'favicon') {
        if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
          sanitized[key] = value;
        }
      } else if (key.includes('Color') || key === 'primaryColor' || key === 'secondaryColor') {
        // Validate color format (hex, rgb, named colors)
        if (/^#[0-9A-Fa-f]{3,8}$/.test(value) || /^rgba?\(/.test(value) || /^[a-z]+$/i.test(value)) {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      sanitized[key] = value;
    } else if (Array.isArray(value) && key === 'socialLinks') {
      // Validate social links
      sanitized[key] = value.filter((link: any) =>
        typeof link === 'object' &&
        typeof link.platform === 'string' &&
        typeof link.url === 'string' &&
        (link.url.startsWith('http://') || link.url.startsWith('https://'))
      ).map((link: any) => ({
        platform: sanitizeString(link.platform),
        url: link.url,
      }));
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize SEO object
 */
function sanitizeSEO(seo: any): Record<string, any> {
  if (!seo || typeof seo !== 'object') {
    return {};
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(seo)) {
    if (!ALLOWED_SEO_KEYS.includes(key)) {
      continue;
    }

    if (typeof value === 'string') {
      if (key === 'ogImage' || key === 'canonicalUrl') {
        if (value.startsWith('http://') || value.startsWith('https://')) {
          sanitized[key] = value;
        }
      } else if (key === 'title' && value.length > 70) {
        sanitized[key] = sanitizeString(value.substring(0, 70));
      } else if (key === 'description' && value.length > 160) {
        sanitized[key] = sanitizeString(value.substring(0, 160));
      } else if (key === 'robots') {
        // Only allow valid robots directives
        const validDirectives = ['index', 'noindex', 'follow', 'nofollow'];
        const directives = value.split(',').map(d => d.trim().toLowerCase());
        sanitized[key] = directives.filter(d => validDirectives.includes(d)).join(', ');
      } else {
        sanitized[key] = sanitizeString(value);
      }
    }
  }

  return sanitized;
}

/**
 * Validate storefront input
 */
function validateStorefrontInput(input: { name?: string; slug?: string; customDomain?: string }): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (input.name !== undefined) {
    if (input.name.length < MIN_NAME_LENGTH) {
      errors.push(`Name must be at least ${MIN_NAME_LENGTH} characters`);
    }
    if (input.name.length > MAX_NAME_LENGTH) {
      errors.push(`Name must be ${MAX_NAME_LENGTH} characters or less`);
    }
  }

  if (input.slug !== undefined) {
    if (input.slug.length < MIN_SLUG_LENGTH) {
      errors.push(`Slug must be at least ${MIN_SLUG_LENGTH} characters`);
    }
    if (input.slug.length > MAX_SLUG_LENGTH) {
      errors.push(`Slug must be ${MAX_SLUG_LENGTH} characters or less`);
    }
    if (!SLUG_PATTERN.test(input.slug)) {
      errors.push('Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen');
    }
    if (RESERVED_SLUGS.includes(input.slug.toLowerCase())) {
      errors.push('This slug is reserved and cannot be used');
    }
  }

  if (input.customDomain !== undefined && input.customDomain !== null && input.customDomain !== '') {
    if (!DOMAIN_PATTERN.test(input.customDomain)) {
      errors.push('Invalid custom domain format');
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface CreateStorefrontInput {
  userId: string;
  name: string;
  slug: string;
  templateId?: string;
  customization?: any;
}

export interface UpdateStorefrontInput {
  name?: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  isSubdomainActive?: boolean;
  isCustomDomainActive?: boolean;
  templateId?: string;
  customization?: any;
  seo?: any;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface CreateMembershipTierInput {
  storefrontId: string;
  name: string;
  description?: string;
  priceCents: number;
  currency?: string;
  interval: 'month' | 'year';
  benefits?: any;
  maxSubscribers?: number;
}

export class StorefrontService {
  /**
   * Create a new storefront for an artist/producer
   */
  async createStorefront(input: CreateStorefrontInput) {
    try {
      // Validate input
      const validation = validateStorefrontInput({
        name: input.name,
        slug: input.slug,
      });

      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
      }

      const existingSlug = await db.query.storefronts.findFirst({
        where: eq(storefronts.slug, input.slug),
      });

      if (existingSlug) {
        throw new Error('Slug already taken. Please choose a different one.');
      }

      const userStorefronts = await db.query.storefronts.findMany({
        where: eq(storefronts.userId, input.userId),
      });

      if (userStorefronts.length >= 5) {
        throw new Error('Maximum of 5 storefronts per user reached.');
      }

      const template = input.templateId
        ? await db.query.storefrontTemplates.findFirst({
            where: and(
              eq(storefrontTemplates.id, input.templateId),
              eq(storefrontTemplates.isActive, true)
            ),
          })
        : null;

      // Sanitize customization data
      const sanitizedCustomization = sanitizeCustomization(input.customization);

      const [storefront] = await db
        .insert(storefronts)
        .values({
          userId: input.userId,
          name: sanitizeString(input.name),
          slug: input.slug.toLowerCase(),
          templateId: input.templateId || null,
          customization: sanitizedCustomization,
          isActive: true,
          isPublic: true,
        })
        .returning();

      logger.info(`Created storefront ${storefront.id} for user ${input.userId}`);
      return storefront;
    } catch (error: unknown) {
      logger.error('Error creating storefront:', error);
      throw error;
    }
  }

  /**
   * Get storefront by slug (public view)
   */
  async getStorefrontBySlug(slug: string) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: and(
          eq(storefronts.slug, slug),
          eq(storefronts.isActive, true)
        ),
      });

      if (!storefront) {
        throw new Error('Storefront not found');
      }

      // Note: views column doesn't exist in current schema - skip update

      const [storefrontUser, userListings, tiers, template] = await Promise.all([
        db.query.users.findFirst({
          where: eq(users.id, storefront.userId),
          columns: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        }),
        db.query.listings.findMany({
          where: and(eq(listings.ownerId, storefront.userId), eq(listings.isPublished, true)),
          orderBy: [desc(listings.createdAt)],
          limit: 50,
        }),
        db.query.membershipTiers.findMany({
          where: and(
            eq(membershipTiers.storefrontId, storefront.id),
            eq(membershipTiers.isActive, true)
          ),
          orderBy: [membershipTiers.sortOrder],
        }),
        storefront.templateId
          ? db.query.storefrontTemplates.findFirst({
              where: eq(storefrontTemplates.id, storefront.templateId),
            })
          : null,
      ]);

      return {
        ...storefront,
        user: storefrontUser,
        listings: userListings,
        membershipTiers: tiers,
        template,
      };
    } catch (error: unknown) {
      logger.error('Error fetching storefront:', error);
      throw error;
    }
  }

  /**
   * Get user's storefronts (private view)
   */
  async getUserStorefronts(userId: string) {
    try {
      const userStorefronts = await db.query.storefronts.findMany({
        where: eq(storefronts.userId, userId),
        orderBy: [desc(storefronts.createdAt)],
        with: {
          template: true,
        },
      });

      return userStorefronts;
    } catch (error: unknown) {
      logger.error('Error fetching user storefronts:', error);
      throw error;
    }
  }

  /**
   * Update storefront customization
   */
  async updateStorefront(storefrontId: string, userId: string, updates: UpdateStorefrontInput) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: eq(storefronts.id, storefrontId),
      });

      if (!storefront) {
        throw new Error('Storefront not found');
      }

      if (storefront.userId !== userId) {
        throw new Error('Unauthorized');
      }

      // Validate updates
      const validation = validateStorefrontInput({
        name: updates.name,
        slug: updates.slug,
        customDomain: updates.customDomain,
      });

      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
      }

      if (updates.slug && updates.slug !== storefront.slug) {
        const existingSlug = await db.query.storefronts.findFirst({
          where: eq(storefronts.slug, updates.slug),
        });

        if (existingSlug) {
          throw new Error('Slug already taken');
        }
      }

      // Build sanitized updates
      const sanitizedUpdates: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (updates.name !== undefined) {
        sanitizedUpdates.name = sanitizeString(updates.name);
      }
      if (updates.slug !== undefined) {
        sanitizedUpdates.slug = updates.slug.toLowerCase();
      }
      if (updates.subdomain !== undefined) {
        sanitizedUpdates.subdomain = updates.subdomain?.toLowerCase();
      }
      if (updates.customDomain !== undefined) {
        sanitizedUpdates.customDomain = updates.customDomain;
      }
      if (updates.isSubdomainActive !== undefined) {
        sanitizedUpdates.isSubdomainActive = updates.isSubdomainActive;
      }
      if (updates.isCustomDomainActive !== undefined) {
        sanitizedUpdates.isCustomDomainActive = updates.isCustomDomainActive;
      }
      if (updates.templateId !== undefined) {
        sanitizedUpdates.templateId = updates.templateId;
      }
      if (updates.customization !== undefined) {
        sanitizedUpdates.customization = sanitizeCustomization(updates.customization);
      }
      if (updates.seo !== undefined) {
        sanitizedUpdates.seo = sanitizeSEO(updates.seo);
      }
      if (updates.isActive !== undefined) {
        sanitizedUpdates.isActive = updates.isActive;
      }
      if (updates.isPublic !== undefined) {
        sanitizedUpdates.isPublic = updates.isPublic;
      }

      const [updatedStorefront] = await db
        .update(storefronts)
        .set(sanitizedUpdates)
        .where(eq(storefronts.id, storefrontId))
        .returning();

      logger.info(`Updated storefront ${storefrontId}`);
      return updatedStorefront;
    } catch (error: unknown) {
      logger.error('Error updating storefront:', error);
      throw error;
    }
  }

  /**
   * Delete storefront
   */
  async deleteStorefront(storefrontId: string, userId: string) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: eq(storefronts.id, storefrontId),
      });

      if (!storefront) {
        throw new Error('Storefront not found');
      }

      if (storefront.userId !== userId) {
        throw new Error('Unauthorized');
      }

      await db.delete(storefronts).where(eq(storefronts.id, storefrontId));

      return { success: true };
    } catch (error: unknown) {
      logger.error('Error deleting storefront:', error);
      throw error;
    }
  }

  /**
   * Get all available templates
   */
  async getTemplates() {
    try {
      const templates = await db
        .select()
        .from(storefrontTemplates)
        .where(eq(storefrontTemplates.isActive, true))
        .orderBy(storefrontTemplates.name);

      return templates;
    } catch (error: unknown) {
      logger.error('Error fetching templates:', error);
      throw error;
    }
  }

  /**
   * Create a membership tier for a storefront
   */
  async createMembershipTier(input: CreateMembershipTierInput) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: eq(storefronts.id, input.storefrontId),
      });

      if (!storefront) {
        throw new Error('Storefront not found');
      }

      let stripePriceId: string | null = null;

      if (stripe) {
        try {
          const price = await stripe.prices.create({
            unit_amount: input.priceCents,
            currency: input.currency || 'usd',
            recurring: {
              interval: input.interval,
            },
            product_data: {
              name: `${storefront.name} - ${input.name}`,
              description: input.description || undefined,
            },
            metadata: {
              storefrontId: input.storefrontId,
              tierName: input.name,
            },
          });

          stripePriceId = price.id;
        } catch (stripeError: unknown) {
          logger.error('Error creating Stripe price:', stripeError);
        }
      }

      const existingTiers = await db.query.membershipTiers.findMany({
        where: eq(membershipTiers.storefrontId, input.storefrontId),
      });

      const [tier] = await db
        .insert(membershipTiers)
        .values({
          storefrontId: input.storefrontId,
          name: input.name,
          description: input.description || null,
          priceCents: input.priceCents,
          currency: input.currency || 'usd',
          interval: input.interval,
          benefits: input.benefits || {},
          stripePriceId,
          isActive: true,
          sortOrder: existingTiers.length,
          maxSubscribers: input.maxSubscribers || null,
          currentSubscribers: 0,
        })
        .returning();

      return tier;
    } catch (error: unknown) {
      logger.error('Error creating membership tier:', error);
      throw error;
    }
  }

  /**
   * Update a membership tier
   */
  async updateMembershipTier(
    tierId: string,
    userId: string,
    updates: Partial<CreateMembershipTierInput>
  ) {
    try {
      const tier = await db.query.membershipTiers.findFirst({
        where: eq(membershipTiers.id, tierId),
        with: {
          storefront: true,
        },
      });

      if (!tier) {
        throw new Error('Membership tier not found');
      }

      if (tier.storefront.userId !== userId) {
        throw new Error('Unauthorized');
      }

      const [updatedTier] = await db
        .update(membershipTiers)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(membershipTiers.id, tierId))
        .returning();

      return updatedTier;
    } catch (error: unknown) {
      logger.error('Error updating membership tier:', error);
      throw error;
    }
  }

  /**
   * Delete a membership tier
   */
  async deleteMembershipTier(tierId: string, userId: string) {
    try {
      const tier = await db.query.membershipTiers.findFirst({
        where: eq(membershipTiers.id, tierId),
        with: {
          storefront: true,
        },
      });

      if (!tier) {
        throw new Error('Membership tier not found');
      }

      if (tier.storefront.userId !== userId) {
        throw new Error('Unauthorized');
      }

      const activeSubscriptions = await db.query.customerMemberships.findMany({
        where: and(
          eq(customerMemberships.tierId, tierId),
          eq(customerMemberships.status, 'active')
        ),
      });

      if (activeSubscriptions.length > 0) {
        throw new Error('Cannot delete tier with active subscriptions');
      }

      await db.delete(membershipTiers).where(eq(membershipTiers.id, tierId));

      return { success: true };
    } catch (error: unknown) {
      logger.error('Error deleting membership tier:', error);
      throw error;
    }
  }

  /**
   * Subscribe a customer to a membership tier
   */
  async subscribeMembershipTier(customerId: string, tierId: string) {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      const tier = await db.query.membershipTiers.findFirst({
        where: eq(membershipTiers.id, tierId),
        with: {
          storefront: true,
        },
      });

      if (!tier) {
        throw new Error('Membership tier not found');
      }

      if (!tier.isActive) {
        throw new Error('This membership tier is not currently available');
      }

      if (tier.maxSubscribers && tier.currentSubscribers >= tier.maxSubscribers) {
        throw new Error('This membership tier is at maximum capacity');
      }

      const existingMembership = await db.query.customerMemberships.findFirst({
        where: and(
          eq(customerMemberships.customerId, customerId),
          eq(customerMemberships.tierId, tierId),
          eq(customerMemberships.status, 'active')
        ),
      });

      if (existingMembership) {
        throw new Error('You already have an active membership to this tier');
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, customerId),
      });

      if (!user) {
        throw new Error('User not found');
      }

      let stripeCustomerId = user.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: user.id,
          },
        });

        stripeCustomerId = customer.id;

        await db.update(users).set({ stripeCustomerId }).where(eq(users.id, customerId));
      }

      if (!tier.stripePriceId) {
        throw new Error('Stripe price not configured for this tier');
      }

      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: tier.stripePriceId }],
        metadata: {
          customerId,
          tierId,
          storefrontId: tier.storefrontId,
        },
      });

      const [membership] = await db
        .insert(customerMemberships)
        .values({
          customerId,
          tierId,
          storefrontId: tier.storefrontId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          startsAt: new Date(),
        })
        .returning();

      await db
        .update(membershipTiers)
        .set({
          currentSubscribers: sql`${membershipTiers.currentSubscribers} + 1`,
        })
        .where(eq(membershipTiers.id, tierId));

      return {
        membership,
        subscription,
      };
    } catch (error: unknown) {
      logger.error('Error subscribing to membership tier:', error);
      throw error;
    }
  }

  /**
   * Cancel a customer membership
   */
  async cancelMembership(membershipId: string, customerId: string) {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      const membership = await db.query.customerMemberships.findFirst({
        where: eq(customerMemberships.id, membershipId),
      });

      if (!membership) {
        throw new Error('Membership not found');
      }

      if (membership.customerId !== customerId) {
        throw new Error('Unauthorized');
      }

      if (membership.stripeSubscriptionId) {
        await stripe.subscriptions.update(membership.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      }

      const [updatedMembership] = await db
        .update(customerMemberships)
        .set({
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customerMemberships.id, membershipId))
        .returning();

      return updatedMembership;
    } catch (error: unknown) {
      logger.error('Error canceling membership:', error);
      throw error;
    }
  }

  /**
   * Get customer memberships
   */
  async getCustomerMemberships(customerId: string) {
    try {
      const memberships = await db.query.customerMemberships.findMany({
        where: eq(customerMemberships.customerId, customerId),
        with: {
          tier: true,
          storefront: {
            with: {
              user: {
                columns: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: [desc(customerMemberships.createdAt)],
      });

      return memberships;
    } catch (error: unknown) {
      logger.error('Error fetching customer memberships:', error);
      throw error;
    }
  }

  /**
   * Validate slug format
   */
  validateSlug(slug: string): boolean {
    const slugRegex = /^[a-z0-9-]+$/;
    return slugRegex.test(slug) && slug.length >= 3 && slug.length <= 50;
  }

  /**
   * Generate a unique slug from a name
   */
  async generateSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await db.query.storefronts.findFirst({
        where: eq(storefronts.slug, slug),
      });

      if (!existing) {
        break;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Increment storefront view count
   */
  async incrementViews(storefrontId: string): Promise<void> {
    try {
      logger.info(`Recording view for storefront ${storefrontId}`);
    } catch (error: unknown) {
      logger.error('Error incrementing storefront views:', error);
    }
  }

  /**
   * Get membership tiers for a storefront
   */
  async getMembershipTiers(storefrontId: string) {
    try {
      const tiers = await db.query.membershipTiers.findMany({
        where: eq(membershipTiers.storefrontId, storefrontId),
        orderBy: [membershipTiers.sortOrder],
      });

      return tiers;
    } catch (error: unknown) {
      logger.error('Error fetching membership tiers:', error);
      throw error;
    }
  }

  /**
   * Get listings for a storefront
   */
  async getStorefrontListings(storefrontId: string) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: eq(storefronts.id, storefrontId),
      });

      if (!storefront) {
        throw new Error('Storefront not found');
      }

      const storefrontListings = await db.query.listings.findMany({
        where: and(
          eq(listings.ownerId, storefront.userId),
          eq(listings.isPublished, true)
        ),
        orderBy: [desc(listings.createdAt)],
        limit: 50,
      });

      return storefrontListings;
    } catch (error: unknown) {
      logger.error('Error fetching storefront listings:', error);
      throw error;
    }
  }

  /**
   * Validate subdomain format
   * Subdomains must be 3-30 characters, lowercase alphanumeric with hyphens
   * Cannot start or end with hyphen, no consecutive hyphens
   */
  validateSubdomain(subdomain: string): boolean {
    const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    return (
      subdomainRegex.test(subdomain) &&
      subdomain.length >= 3 &&
      subdomain.length <= 30 &&
      !subdomain.includes('--') &&
      !this.isReservedSubdomain(subdomain)
    );
  }

  /**
   * Check if subdomain is reserved
   */
  isReservedSubdomain(subdomain: string): boolean {
    const reserved = [
      'www', 'api', 'app', 'admin', 'dashboard', 'help', 'support',
      'blog', 'mail', 'email', 'ftp', 'cdn', 'static', 'assets',
      'dev', 'staging', 'test', 'demo', 'beta', 'alpha',
      'store', 'shop', 'marketplace', 'studio', 'music',
      'maxbooster', 'blawz', 'b-lawz', 'blawzmusic'
    ];
    return reserved.includes(subdomain.toLowerCase());
  }

  /**
   * Generate a unique subdomain from a name
   */
  async generateSubdomain(name: string): Promise<string> {
    const baseSubdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 25);

    let subdomain = baseSubdomain;
    let counter = 1;

    while (true) {
      if (!this.validateSubdomain(subdomain)) {
        subdomain = `artist-${baseSubdomain}`.substring(0, 30);
      }

      const existing = await db.query.storefronts.findFirst({
        where: eq(storefronts.subdomain, subdomain),
      });

      if (!existing) {
        break;
      }

      subdomain = `${baseSubdomain}-${counter}`.substring(0, 30);
      counter++;
    }

    return subdomain;
  }

  /**
   * Check if subdomain is available
   */
  async isSubdomainAvailable(subdomain: string, excludeStorefrontId?: string): Promise<boolean> {
    if (!this.validateSubdomain(subdomain)) {
      return false;
    }

    const existing = await db.query.storefronts.findFirst({
      where: eq(storefronts.subdomain, subdomain),
    });

    if (!existing) {
      return true;
    }

    return excludeStorefrontId ? existing.id === excludeStorefrontId : false;
  }

  /**
   * Get storefront by subdomain
   */
  async getStorefrontBySubdomain(subdomain: string) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: and(
          eq(storefronts.subdomain, subdomain),
          eq(storefronts.isSubdomainActive, true),
          eq(storefronts.isActive, true)
        ),
      });

      if (!storefront) {
        return null;
      }

      const [storefrontUser, userListings, tiers, template] = await Promise.all([
        db.query.users.findFirst({
          where: eq(users.id, storefront.userId),
          columns: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        }),
        db.query.listings.findMany({
          where: and(eq(listings.ownerId, storefront.userId), eq(listings.isPublished, true)),
          orderBy: [desc(listings.createdAt)],
          limit: 50,
        }),
        db.query.membershipTiers.findMany({
          where: and(
            eq(membershipTiers.storefrontId, storefront.id),
            eq(membershipTiers.isActive, true)
          ),
        }),
        storefront.templateId
          ? db.query.storefrontTemplates.findFirst({
              where: eq(storefrontTemplates.id, storefront.templateId),
            })
          : null,
      ]);

      return {
        ...storefront,
        user: storefrontUser,
        listings: userListings,
        membershipTiers: tiers,
        template,
      };
    } catch (error: unknown) {
      logger.error('Error fetching storefront by subdomain:', error);
      throw error;
    }
  }

  /**
   * Get the public URL for a storefront
   */
  getStorefrontUrl(storefront: { subdomain?: string | null; slug: string; isSubdomainActive?: boolean }): string {
    const baseDomain = process.env.REPLIT_DEV_DOMAIN || 'maxbooster.app';
    
    if (storefront.subdomain && storefront.isSubdomainActive) {
      return `https://${storefront.subdomain}.${baseDomain}`;
    }
    
    return `https://${baseDomain}/store/${storefront.slug}`;
  }
}

export const storefrontService = new StorefrontService();

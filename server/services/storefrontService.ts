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

      const [storefront] = await db
        .insert(storefronts)
        .values({
          userId: input.userId,
          name: input.name,
          slug: input.slug,
          templateId: input.templateId || null,
          customization: input.customization || {},
          isActive: true,
          isPublic: true,
        })
        .returning();

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

      if (updates.slug && updates.slug !== storefront.slug) {
        const existingSlug = await db.query.storefronts.findFirst({
          where: eq(storefronts.slug, updates.slug),
        });

        if (existingSlug) {
          throw new Error('Slug already taken');
        }
      }

      const [updatedStorefront] = await db
        .update(storefronts)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(storefronts.id, storefrontId))
        .returning();

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
}

export const storefrontService = new StorefrontService();

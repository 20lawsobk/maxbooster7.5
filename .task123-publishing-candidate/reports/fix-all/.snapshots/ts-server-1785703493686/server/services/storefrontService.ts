import { db } from "../db";
import {
  storefronts,
  storefrontTemplates,
  membershipTiers,
  customerMemberships,
  listings,
  users,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import Stripe from "stripe";

import { logger } from "../logger.js";

const stripe = process.env.STRIPE_SECRET_KEY?.startsWith("sk_")
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    })
  : null;

// Validation constraints
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 2;
const MAX_SLUG_LENGTH = 63;
const MIN_SLUG_LENGTH = 3;
const RESERVED_SLUGS = [
  "admin",
  "api",
  "www",
  "app",
  "dashboard",
  "login",
  "signup",
  "help",
  "support",
  "billing",
  "settings",
];

const ALLOWED_CUSTOMIZATION_KEYS = [
  "primaryColor",
  "secondaryColor",
  "backgroundColor",
  "textColor",
  "fontFamily",
  "headerFont",
  "bodyFont",
  "logoUrl",
  "bannerUrl",
  "favicon",
  "borderRadius",
  "buttonStyle",
  "layoutType",
  "showSocialLinks",
  "socialLinks",
  "headerLayout",
  "footerLayout",
  "gridColumns",
  "accentColor",
  "linkColor",
  "shadowStyle",
  "colors",
  "fonts",
  "layout",
  "bio",
  "logo",
  "banner",
  "avatar",
];

const ALLOWED_SEO_KEYS = [
  "title",
  "description",
  "keywords",
  "ogImage",
  "ogTitle",
  "ogDescription",
  "twitterCard",
  "twitterHandle",
  "canonicalUrl",
  "robots",
];

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeString(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Validate and sanitize customization object
 */
function sanitizeCustomization(
  customization: Record<string, unknown>,
): Record<string, any> {
  if (!customization || typeof customization !== "object") {
    return {};
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(customization)) {
    if (!ALLOWED_CUSTOMIZATION_KEYS.includes(key)) {
      continue;
    }

    if (typeof value === "string") {
      if (
        key === "logo" ||
        key === "banner" ||
        key === "avatar" ||
        key.endsWith("Url") ||
        key === "logoUrl" ||
        key === "bannerUrl" ||
        key === "favicon"
      ) {
        if (
          value.startsWith("http://") ||
          value.startsWith("https://") ||
          value.startsWith("/") ||
          value === ""
        ) {
          sanitized[key] = value;
        }
      } else if (
        key.includes("Color") ||
        key === "primaryColor" ||
        key === "secondaryColor"
      ) {
        if (
          /^#[0-9A-Fa-f]{3,8}$/.test(value) ||
          /^rgba?\(/.test(value) ||
          /^[a-z]+$/i.test(value)
        ) {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (typeof value === "boolean" || typeof value === "number") {
      sanitized[key] = value;
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      if (key === "colors") {
        const colorObj: Record<string, string> = {};
        for (const [ck, cv] of Object.entries(value)) {
          if (
            typeof cv === "string" &&
            (/^#[0-9A-Fa-f]{3,8}$/.test(cv) ||
              /^rgba?\(/.test(cv) ||
              /^[a-z]+$/i.test(cv))
          ) {
            colorObj[ck] = cv;
          }
        }
        sanitized[key] = colorObj;
      } else if (key === "fonts") {
        const fontObj: Record<string, string> = {};
        for (const [fk, fv] of Object.entries(value)) {
          if (typeof fv === "string") {
            fontObj[fk] = sanitizeString(fv);
          }
        }
        sanitized[key] = fontObj;
      } else if (key === "layout") {
        const layoutObj: Record<string, any> = {};
        for (const [lk, lv] of Object.entries(value)) {
          if (typeof lv === "string") layoutObj[lk] = sanitizeString(lv);
          else if (typeof lv === "number") layoutObj[lk] = lv;
          else if (typeof lv === "boolean") layoutObj[lk] = lv;
        }
        sanitized[key] = layoutObj;
      } else if (key === "socialLinks") {
        const linksObj: Record<string, string> = {};
        for (const [sk, sv] of Object.entries(value)) {
          if (
            typeof sv === "string" &&
            (sv.startsWith("http://") || sv.startsWith("https://") || sv === "")
          ) {
            linksObj[sk] = sv;
          }
        }
        sanitized[key] = linksObj;
      }
    } else if (Array.isArray(value) && key === "socialLinks") {
      sanitized[key] = value
        .filter(
          (link: Record<string, unknown>) =>
            typeof link === "object" &&
            typeof link.platform === "string" &&
            typeof link.url === "string" &&
            (link.url.startsWith("http://") || link.url.startsWith("https://")),
        )
        .map((link: Record<string, unknown>) => ({
          platform: sanitizeString((link.platform as string)),
          url: link.url,
        }));
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize SEO object
 */
function sanitizeSEO(seo: Record<string, unknown>): Record<string, any> {
  if (!seo || typeof seo !== "object") {
    return {};
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(seo)) {
    if (!ALLOWED_SEO_KEYS.includes(key)) {
      continue;
    }

    if (typeof value === "string") {
      if (key === "ogImage" || key === "canonicalUrl") {
        if (value.startsWith("http://") || value.startsWith("https://")) {
          sanitized[key] = value;
        }
      } else if (key === "title" && value.length > 70) {
        sanitized[key] = sanitizeString(value.substring(0, 70));
      } else if (key === "description" && value.length > 160) {
        sanitized[key] = sanitizeString(value.substring(0, 160));
      } else if (key === "robots") {
        // Only allow valid robots directives
        const validDirectives = ["index", "noindex", "follow", "nofollow"];
        const directives = value.split(",").map((d) => d.trim().toLowerCase());
        sanitized[key] = directives
          .filter((d) => validDirectives.includes(d))
          .join(", ");
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
function validateStorefrontInput(input: {
  name?: string;
  slug?: string;
  customDomain?: string;
}): { valid: boolean; errors: string[] } {
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
      errors.push(
        "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
      );
    }
    if (RESERVED_SLUGS.includes(input.slug.toLowerCase())) {
      errors.push("This slug is reserved and cannot be used");
    }
  }

  if (
    input.customDomain !== undefined &&
    input.customDomain !== null &&
    input.customDomain !== ""
  ) {
    if (!DOMAIN_PATTERN.test(input.customDomain)) {
      errors.push("Invalid custom domain format");
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface CreateStorefrontInput {
  userId: string;
  name: string;
  slug: string;
  templateId?: string;
  customization?: Record<string, unknown>;
}

export interface UpdateStorefrontInput {
  name?: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  isSubdomainActive?: boolean;
  isCustomDomainActive?: boolean;
  templateId?: string;
  customization?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface CreateMembershipTierInput {
  storefrontId: string;
  name: string;
  description?: string;
  priceCents: number;
  currency?: string;
  interval: "month" | "year";
  benefits?: Record<string, unknown>;
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
        throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
      }

      const existingSlug = await db.query.storefronts.findFirst({
        where: eq(storefronts.slug, input.slug),
      });

      if (existingSlug) {
        throw new Error("Slug already taken. Please choose a different one.");
      }

      const userStorefronts = await db.query.storefronts.findMany({
        where: eq(storefronts.userId, input.userId),
      });

      if (userStorefronts.length >= 5) {
        throw new Error("Maximum of 5 storefronts per user reached.");
      }

      const template = input.templateId
        ? await db.query.storefrontTemplates.findFirst({
            where: and(
              eq(storefrontTemplates.id, input.templateId),
              eq(storefrontTemplates.isActive, true),
            ),
          })
        : null;

      // Merge: template configuration is the base, user-supplied customization
      // overrides on top (so colors/fonts from the chosen template are always
      // applied even when the user hasn't touched the customization panel yet).
      // Guard: template may be undefined when templateId doesn't match any row.
      const templateConfig =
        template?.configuration &&
        typeof template.configuration === "object" &&
        !Array.isArray(template.configuration)
          ? (template.configuration as Record<string, unknown>)
          : {};
      const mergedCustomization: Record<string, unknown> = {
        ...templateConfig,
        ...(input.customization || {}),
      };
      const sanitizedCustomization = sanitizeCustomization(mergedCustomization);

      const autoSubdomain = await this.generateSubdomain(input.slug);

      const [storefront] = await db
        .insert(storefronts)
        .values({
          userId: input.userId,
          name: sanitizeString(input.name),
          slug: input.slug.toLowerCase(),
          subdomain: autoSubdomain,
          isSubdomainActive: true,
          templateId: input.templateId || null,
          customization: sanitizedCustomization,
          isActive: true,
          isPublic: true,
        })
        .returning();

      logger.info(
        `Created storefront ${storefront.id} for user ${input.userId} at ${autoSubdomain}.maxbooster.app`,
      );
      return storefront;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating storefront:");
      throw error;
    }
  }

  /**
   * Get storefront by slug (public view)
   */
  async getStorefrontBySlug(slug: string) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: and(eq(storefronts.slug, slug), eq(storefronts.isActive, true)),
      });

      if (!storefront) {
        throw new Error("Storefront not found");
      }

      // Note: views column doesn't exist in current schema - skip update

      const [storefrontUser, userListings, tiers, template] = await Promise.all(
        [
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
            where: and(
              eq(listings.userId, storefront.userId),
              eq(listings.isPublished, true),
            ),
            orderBy: [desc(listings.createdAt)],
            limit: 50,
          }),
          db.query.membershipTiers.findMany({
            where: and(
              eq(membershipTiers.storefrontId, storefront.id),
              eq(membershipTiers.isActive, true),
            ),
            orderBy: [membershipTiers.createdAt],
          }),
          storefront.templateId
            ? db.query.storefrontTemplates.findFirst({
                where: eq(storefrontTemplates.id, storefront.templateId),
              })
            : null,
        ],
      );

      return {
        ...storefront,
        publicUrl: this.getStorefrontUrl(storefront),
        user: storefrontUser,
        listings: userListings,
        membershipTiers: tiers,
        template,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching storefront:");
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

      return userStorefronts.map((sf) => ({
        ...sf,
        publicUrl: this.getStorefrontUrl(sf),
      }));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching user storefronts:");
      throw error;
    }
  }

  /**
   * Update storefront customization
   */
  async updateStorefront(
    storefrontId: string,
    userId: string,
    updates: UpdateStorefrontInput,
  ) {
    try {
      const storefront = await db.query.storefronts.findFirst({
        where: eq(storefronts.id, storefrontId),
      });

      if (!storefront) {
        throw new Error("Storefront not found");
      }

      if (storefront.userId !== userId) {
        throw new Error("Unauthorized");
      }

      // Validate updates
      const validation = validateStorefrontInput({
        name: updates.name,
        slug: updates.slug,
        customDomain: updates.customDomain,
      });

      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
      }

      if (updates.slug && updates.slug !== storefront.slug) {
        const existingSlug = await db.query.storefronts.findFirst({
          where: eq(storefronts.slug, updates.slug),
        });

        if (existingSlug) {
          throw new Error("Slug already taken");
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
        sanitizedUpdates.subdomain = updates.subdomain.toLowerCase();
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
        sanitizedUpdates.customization = sanitizeCustomization(
          updates.customization,
        );
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
      logger.warn({ err: error }, "Error updating storefront:");
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
        throw new Error("Storefront not found");
      }

      if (storefront.userId !== userId) {
        throw new Error("Unauthorized");
      }

      await db.delete(storefronts).where(eq(storefronts.id, storefrontId));

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting storefront:");
      throw error;
    }
  }

  /**
   * Get all available templates (auto-seeds built-ins on first call)
   */
  async getTemplates() {
    try {
      const templates = await db
        .select()
        .from(storefrontTemplates)
        .where(eq(storefrontTemplates.isActive, true))
        .orderBy(storefrontTemplates.name);

      if (templates.length === 0) {
        // Lazy-seed built-in templates so they are always available without a
        // separate migration step.
        const { seedStorefrontTemplates } = await import(
          "../seed/seedStorefrontTemplates.js"
        );
        await seedStorefrontTemplates();
        return db
          .select()
          .from(storefrontTemplates)
          .where(eq(storefrontTemplates.isActive, true))
          .orderBy(storefrontTemplates.name);
      }

      return templates;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching templates:");
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
        throw new Error("Storefront not found");
      }

      let stripePriceId: string | null = null;

      if (stripe) {
        try {
          const price = await stripe.prices.create({
            unit_amount: input.priceCents,
            currency: input.currency || "usd",
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
          logger.warn(stripeError, "Error creating Stripe price:");
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
          currency: input.currency || "usd",
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
      logger.warn({ err: error }, "Error creating membership tier:");
      throw error;
    }
  }

  /**
   * Update a membership tier
   */
  async updateMembershipTier(
    tierId: string,
    userId: string,
    updates: Partial<CreateMembershipTierInput>,
  ) {
    try {
      const tierResults = await db
        .select({ tier: membershipTiers, storefront: storefronts })
        .from(membershipTiers)
        .leftJoin(storefronts, eq(membershipTiers.storefrontId, storefronts.id))
        .where(eq(membershipTiers.id, tierId))
        .limit(1);

      const tier = tierResults[0].tier;
      const storefront = tierResults[0].storefront;

      if (!tier) {
        throw new Error("Membership tier not found");
      }

      if (storefront!.userId !== userId) {
        throw new Error("Unauthorized");
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
      logger.warn({ err: error }, "Error updating membership tier:");
      throw error;
    }
  }

  /**
   * Delete a membership tier
   */
  async deleteMembershipTier(tierId: string, userId: string) {
    try {
      const tierResults = await db
        .select({ tier: membershipTiers, storefront: storefronts })
        .from(membershipTiers)
        .leftJoin(storefronts, eq(membershipTiers.storefrontId, storefronts.id))
        .where(eq(membershipTiers.id, tierId))
        .limit(1);

      const tier = tierResults[0].tier;
      const storefront = tierResults[0].storefront;

      if (!tier) {
        throw new Error("Membership tier not found");
      }

      if (storefront!.userId !== userId) {
        throw new Error("Unauthorized");
      }

      const activeSubscriptions = await db.query.customerMemberships.findMany({
        where: and(
          eq(customerMemberships.tierId, tierId),
          eq(customerMemberships.status, "active"),
        ),
      });

      if (activeSubscriptions.length > 0) {
        throw new Error("Cannot delete tier with active subscriptions");
      }

      await db.delete(membershipTiers).where(eq(membershipTiers.id, tierId));

      return { success: true };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting membership tier:");
      throw error;
    }
  }

  /**
   * Subscribe a customer to a membership tier
   */
  async subscribeMembershipTier(customerId: string, tierId: string) {
    try {
      if (!stripe) {
        throw new Error("Stripe not configured");
      }

      const tierResults = await db
        .select({
          tier: membershipTiers,
          storefront: storefronts,
        })
        .from(membershipTiers)
        .leftJoin(storefronts, eq(membershipTiers.storefrontId, storefronts.id))
        .where(eq(membershipTiers.id, tierId))
        .limit(1);

      const tier = tierResults[0].tier;

      if (!tier) {
        throw new Error("Membership tier not found");
      }

      if (!tier.isActive) {
        throw new Error("This membership tier is not currently available");
      }

      if (
        tier.maxSubscribers &&
        tier.currentSubscribers! >= tier.maxSubscribers
      ) {
        throw new Error("This membership tier is at maximum capacity");
      }

      const existingMemberships = await db
        .select()
        .from(customerMemberships)
        .where(
          and(
            eq(customerMemberships.customerId, customerId),
            eq(customerMemberships.tierId, tierId),
            eq(customerMemberships.status, "active"),
          ),
        )
        .limit(1);
      const existingMembership = existingMemberships[0];

      if (existingMembership) {
        throw new Error("You already have an active membership to this tier");
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, customerId),
      });

      if (!user) {
        throw new Error("User not found");
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

        await db
          .update(users)
          .set({ stripeCustomerId })
          .where(eq(users.id, customerId));
      }

      if (!tier.stripePriceId) {
        throw new Error("Stripe price not configured for this tier");
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
      logger.warn({ err: error }, "Error subscribing to membership tier:");
      throw error;
    }
  }

  /**
   * Cancel a customer membership
   */
  async cancelMembership(membershipId: string, customerId: string) {
    try {
      if (!stripe) {
        throw new Error("Stripe not configured");
      }

      const membership = await db.query.customerMemberships.findFirst({
        where: eq(customerMemberships.id, membershipId),
      });

      if (!membership) {
        throw new Error("Membership not found");
      }

      if (membership.customerId !== customerId) {
        throw new Error("Unauthorized");
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
      logger.warn({ err: error }, "Error canceling membership:");
      throw error;
    }
  }

  /**
   * Get customer memberships
   */
  async getCustomerMemberships(customerId: string) {
    try {
      const results = await db
        .select({
          id: customerMemberships.id,
          customerId: customerMemberships.customerId,
          tierId: customerMemberships.tierId,
          storefrontId: customerMemberships.storefrontId,
          stripeSubscriptionId: customerMemberships.stripeSubscriptionId,
          status: customerMemberships.status,
          startDate: customerMemberships.startDate,
          endDate: customerMemberships.endDate,
          createdAt: customerMemberships.createdAt,
          tierName: membershipTiers.name,
          tierPriceCents: membershipTiers.priceCents,
          tierDescription: membershipTiers.description,
          storefrontName: storefronts.name,
          storefrontSlug: storefronts.slug,
          ownerUsername: users.username,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(customerMemberships)
        .leftJoin(
          membershipTiers,
          eq(customerMemberships.tierId, membershipTiers.id),
        )
        .leftJoin(
          storefronts,
          eq(customerMemberships.storefrontId, storefronts.id),
        )
        .leftJoin(users, eq(storefronts.userId, users.id))
        .where(eq(customerMemberships.customerId, customerId))
        .orderBy(desc(customerMemberships.createdAt));

      return results.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        tierId: r.tierId,
        storefrontId: r.storefrontId,
        stripeSubscriptionId: r.stripeSubscriptionId,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        createdAt: r.createdAt,
        tier: r.tierName
          ? {
              name: r.tierName,
              priceCents: r.tierPriceCents,
              description: r.tierDescription,
            }
          : null,
        storefront: r.storefrontName
          ? {
              name: r.storefrontName,
              slug: r.storefrontSlug,
              user: {
                username: r.ownerUsername,
                firstName: r.ownerFirstName,
                lastName: r.ownerLastName,
              },
            }
          : null,
      }));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching customer memberships:");
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
  // Music-themed word lists for Replit-style memorable URL generation
  private static readonly SLUG_ADJECTIVES = [
    "acoustic",
    "amber",
    "atomic",
    "azure",
    "blazing",
    "bold",
    "bright",
    "chrome",
    "cobalt",
    "cosmic",
    "crisp",
    "crystal",
    "dark",
    "deep",
    "divine",
    "dusk",
    "dusty",
    "electric",
    "emerald",
    "epic",
    "fluid",
    "golden",
    "grand",
    "hollow",
    "infinite",
    "jade",
    "kinetic",
    "laser",
    "live",
    "lost",
    "loud",
    "lunar",
    "mellow",
    "midnight",
    "minor",
    "mystic",
    "neon",
    "noble",
    "obsidian",
    "ocean",
    "onyx",
    "open",
    "phantom",
    "polar",
    "prism",
    "pure",
    "quiet",
    "radiant",
    "rapid",
    "rare",
    "raw",
    "rebel",
    "regal",
    "retro",
    "rich",
    "risen",
    "roaming",
    "rustic",
    "sacred",
    "savage",
    "serene",
    "sharp",
    "silent",
    "silver",
    "smooth",
    "soft",
    "solar",
    "solo",
    "sonic",
    "spectral",
    "steady",
    "stellar",
    "still",
    "stone",
    "stormy",
    "subtle",
    "swift",
    "thunder",
    "twilight",
    "ultra",
    "urban",
    "vast",
    "vibrant",
    "vivid",
    "void",
    "warm",
    "wild",
    "wired",
    "zenith",
  ];

  private static readonly SLUG_NOUNS = [
    "amp",
    "anthem",
    "arc",
    "aria",
    "atlas",
    "aura",
    "bar",
    "bass",
    "beat",
    "bloom",
    "bridge",
    "canon",
    "chord",
    "clef",
    "coda",
    "current",
    "decibel",
    "demo",
    "drop",
    "drum",
    "echo",
    "fade",
    "fender",
    "flow",
    "freq",
    "funk",
    "gate",
    "groove",
    "harmony",
    "hook",
    "hum",
    "key",
    "kick",
    "lab",
    "layer",
    "loop",
    "lush",
    "lyric",
    "melody",
    "mix",
    "mode",
    "motion",
    "muse",
    "note",
    "octave",
    "orbit",
    "origin",
    "peak",
    "pitch",
    "pivot",
    "prism",
    "pulse",
    "reverb",
    "riff",
    "rise",
    "root",
    "sample",
    "scale",
    "signal",
    "snare",
    "sol",
    "sound",
    "spark",
    "stage",
    "stem",
    "strum",
    "studio",
    "sub",
    "surge",
    "synth",
    "tempo",
    "tone",
    "track",
    "treble",
    "tune",
    "valve",
    "verse",
    "vibe",
    "vinyl",
    "voice",
    "volt",
    "wave",
    "wire",
    "wub",
  ];

  /**
   * Generate a Replit-style memorable random slug (adjective-noun or adjective-noun-number).
   * Falls back to kebab-casing the provided name when a name is given.
   */
  async generateSlug(name: string): Promise<string> {
    // If the user provided a name, base the slug on it (same as before)
    // but offer a Replit-style word combo as fallback when the name is empty
    const useWordCombo = !name || name.trim().length === 0;

    if (useWordCombo) {
      return this.generateRandomSlug();
    }

    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await db.query.storefronts.findFirst({
        where: eq(storefronts.slug, slug),
      });

      if (!existing) break;

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Generate a Replit-style memorable URL slug — adjective-noun, guaranteed unique.
   * Appends a short number suffix only when needed to resolve collisions.
   */
  async generateRandomSlug(): Promise<string> {
    const adj = StorefrontService.SLUG_ADJECTIVES;
    const nouns = StorefrontService.SLUG_NOUNS;

    for (let attempt = 0; attempt < 20; attempt++) {
      const a = adj[Math.floor(Math.random() * adj.length)];
      const n = nouns[Math.floor(Math.random() * nouns.length)];
      const suffix =
        attempt === 0 ? "" : `-${Math.floor(Math.random() * 90 + 10)}`;
      const candidate = `${a}-${n}${suffix}`;

      const existing = await db.query.storefronts.findFirst({
        where: eq(storefronts.slug, candidate),
      });

      if (!existing) return candidate;
    }

    // Last-resort: name-based slug with timestamp suffix
    return `artist-studio-${Date.now().toString(36)}`;
  }

  /**
   * Increment storefront view count
   */
  async incrementViews(storefrontId: string): Promise<void> {
    try {
      logger.info(`Recording view for storefront ${storefrontId}`);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error incrementing storefront views:");
    }
  }

  /**
   * Get membership tiers for a storefront
   */
  async getMembershipTiers(storefrontId: string) {
    try {
      const tiers = await db.query.membershipTiers.findMany({
        where: eq(membershipTiers.storefrontId, storefrontId),
        orderBy: [membershipTiers.createdAt],
      });

      return tiers;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching membership tiers:");
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
        throw new Error("Storefront not found");
      }

      const storefrontListings = await db.query.listings.findMany({
        where: and(
          eq(listings.userId, storefront.userId),
          eq(listings.isPublished, true),
        ),
        orderBy: [desc(listings.createdAt)],
        limit: 50,
      });

      return storefrontListings.map((listing: Record<string, unknown>) => {
        const meta = (listing.metadata as Record<string, unknown>) || {};
        return {
          ...listing,
          coverArtUrl: listing.artworkUrl || "",
          audioUrl: listing.audioUrl || listing.previewUrl || "",
          bpm: meta.bpm || null,
          key: meta.key || null,
          genre: listing.category || meta.genre || "",
          mood: meta.mood || null,
          tags: meta.tags || [],
          isExclusive: meta.isExclusive || false,
          priceCents: listing.priceCents || 0,
          discountPercent: meta.discountPercent || null,
          discountPriceCents: meta.discountPriceCents || null,
          discountExpiresAt: meta.discountExpiresAt || null,
        };
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching storefront listings:");
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
      !subdomain.includes("--") &&
      !this.isReservedSubdomain(subdomain)
    );
  }

  /**
   * Check if subdomain is reserved
   */
  isReservedSubdomain(subdomain: string): boolean {
    const reserved = [
      "www",
      "api",
      "app",
      "admin",
      "dashboard",
      "help",
      "support",
      "blog",
      "mail",
      "email",
      "ftp",
      "cdn",
      "static",
      "assets",
      "dev",
      "staging",
      "test",
      "demo",
      "beta",
      "alpha",
      "store",
      "shop",
      "marketplace",
      "studio",
      "music",
      "maxbooster",
      "blawz",
      "b-lawz",
      "blawzmusic",
    ];
    return reserved.includes(subdomain.toLowerCase());
  }

  /**
   * Generate a unique subdomain from a name
   */
  async generateSubdomain(name: string): Promise<string> {
    const baseSubdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
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
  async isSubdomainAvailable(
    subdomain: string,
    excludeStorefrontId?: string,
  ): Promise<boolean> {
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
          eq(storefronts.isActive, true),
        ),
      });

      if (!storefront) {
        return null;
      }

      const [storefrontUser, userListings, tiers, template] = await Promise.all(
        [
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
            where: and(
              eq(listings.userId, storefront.userId),
              eq(listings.isPublished, true),
            ),
            orderBy: [desc(listings.createdAt)],
            limit: 50,
          }),
          db.query.membershipTiers.findMany({
            where: and(
              eq(membershipTiers.storefrontId, storefront.id),
              eq(membershipTiers.isActive, true),
            ),
          }),
          storefront.templateId
            ? db.query.storefrontTemplates.findFirst({
                where: eq(storefrontTemplates.id, storefront.templateId),
              })
            : null,
        ],
      );

      return {
        ...storefront,
        publicUrl: this.getStorefrontUrl(storefront),
        user: storefrontUser,
        listings: userListings,
        membershipTiers: tiers,
        template,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching storefront by subdomain:");
      throw error;
    }
  }

  /**
   * Get the public URL for a storefront.
   *
   * Normal priority: custom domain (when active) → managed subdomain → slug path.
   *
   * Temporary override: when STOREFRONT_URL_FORMAT=slug the slug-path URL is always
   * returned regardless of custom domain / subdomain state.  This is used while the
   * platform wildcard SSL cert is being provisioned so that autopilot-generated
   * social posts and ads always link to a URL that is guaranteed to resolve over
   * HTTPS.  Remove / unset the env var once the wildcard cert is live.
   */
  getStorefrontUrl(storefront: {
    subdomain?: string | null;
    slug: string;
    isSubdomainActive?: boolean;
    customDomain?: string | null;
    isCustomDomainActive?: boolean;
  }): string {
    const baseDomain = process.env.BASE_DOMAIN || "max-booster.com";
    const slugUrl = `https://${baseDomain}/storefront/${storefront.slug}`;

    if (process.env.STOREFRONT_URL_FORMAT === "slug") {
      return slugUrl;
    }

    if (storefront?.customDomain && storefront?.isCustomDomainActive) {
      return `https://${storefront.customDomain}`;
    }

    if (storefront?.subdomain && storefront?.isSubdomainActive) {
      return `https://${storefront.subdomain}.${baseDomain}`;
    }

    return slugUrl;
  }
}

export const storefrontService = new StorefrontService();

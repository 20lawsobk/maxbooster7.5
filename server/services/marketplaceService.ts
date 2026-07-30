import { storage } from "../storage";
import { db } from "../db";
import { randomUUID } from "crypto";

import Stripe from "stripe";
import {
  listingLicenseTiers,
  listings,
  orders,
  royaltySplits,
  royaltyTransactions,
  revenueEvents,
  type ListingLicenseTier,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { instantPayoutService } from "./instantPayoutService";
import { logger } from "../logger.js";
import { getBaseUrl } from "../config/defaults.js";

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY?.startsWith("sk_")
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    })
  : null;

export interface BeatListing {
  id: string;
  userId: string;
  title: string;
  description?: string;
  genre?: string;
  bpm?: number;
  key?: string;
  price: number;
  audioUrl: string;
  artworkUrl?: string;
  coverArt?: string;
  tags?: string[];
  licenses: BeatLicense[];
  hasLicenseTiers?: boolean;
  licenseTiers?: ListingLicenseTierView[];
  status: "draft" | "active" | "sold" | "inactive";
  createdAt: Date;
}

export interface BeatLicense {
  type: "basic" | "premium" | "exclusive" | "unlimited";
  price: number;
  features: string[];
  streams?: number | "unlimited";
  copies?: number | "unlimited";
  radioStations?: number | "unlimited";
  musicVideos?: number | "unlimited";
  duration?: string;
  allowsBroadcast?: boolean;
  allowsProfit?: boolean;
  allowsSync?: boolean;
}

export const DEFAULT_LICENSE_TEMPLATES: Record<string, BeatLicense> = {
  basic: {
    type: "basic",
    price: 29.99,
    features: [
      "MP3 Download",
      "Non-exclusive rights",
      "Up to 100K streams",
      "Up to 5K copies",
    ],
    streams: 100000,
    copies: 5000,
    radioStations: 2,
    musicVideos: 1,
    duration: "1 year",
    allowsBroadcast: false,
    allowsProfit: true,
    allowsSync: false,
  },
  premium: {
    type: "premium",
    price: 99.99,
    features: [
      "WAV + MP3 Download",
      "Non-exclusive rights",
      "Up to 500K streams",
      "Up to 25K copies",
      "Broadcast rights",
    ],
    streams: 500000,
    copies: 25000,
    radioStations: 10,
    musicVideos: 3,
    duration: "2 years",
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
  },
  unlimited: {
    type: "unlimited",
    price: 199.99,
    features: [
      "WAV + MP3 + Stems",
      "Non-exclusive rights",
      "Unlimited streams",
      "Unlimited copies",
      "Full broadcast rights",
    ],
    streams: "unlimited",
    copies: "unlimited",
    radioStations: "unlimited",
    musicVideos: "unlimited",
    duration: "Lifetime",
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
  },
  exclusive: {
    type: "exclusive",
    price: 999.99,
    features: [
      "Full ownership transfer",
      "All source files + Stems",
      "Complete exclusivity",
      "No royalty splits",
    ],
    streams: "unlimited",
    copies: "unlimited",
    radioStations: "unlimited",
    musicVideos: "unlimited",
    duration: "Lifetime (Full Ownership)",
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
  },
};

// Service-layer Order type (domain model)
export interface Order {
  id: string;
  beatId: string; // Maps to listingId in database
  buyerId: string;
  sellerId: string;
  licenseType: string;
  amount: number; // Maps to amountCents / 100 in database
  status: "pending" | "processing" | "completed" | "failed" | "refunded";
  paymentIntentId?: string; // Maps to stripePaymentIntentId in database
  licenseDocumentUrl?: string;
  createdAt: Date;
}

// Shape of a listing's JSONB metadata bag (genre/bpm/key/licenses/tags…)
interface ListingMetadata {
  genre?: string;
  mood?: string;
  bpm?: number;
  key?: string;
  licenseType?: string;
  licenses?: BeatLicense[];
  tags?: string[];
}

// Shape of a listing row as returned by storage.createListing/updateListing
interface ListingRow {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priceCents: number;
  audioUrl?: string | null;
  previewUrl?: string | null;
  artworkUrl?: string | null;
  isPublished?: boolean | null;
  metadata?: unknown;
  createdAt?: Date | null;
}

// Shape of a per-license tier view attached to enriched listings
interface ListingLicenseTierView {
  id: string;
  licenseType: string;
  label?: string | null;
  priceCents: number;
  price: number;
  discountPriceCents?: number | null;
  fileFormats?: string[] | null;
  bogoEnabled?: boolean | null;
  bogoGetType?: string | null;
  bogoGetPercent?: number | null;
  isActive?: boolean | null;
}

// Shape of an order row as returned by storage order queries
interface DbOrderRow {
  id: string;
  listingId?: string | null;
  userId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  licenseType?: string | null;
  amount?: number | null;
  amountCents?: number | null;
  status?: string | null;
  stripePaymentIntentId?: string | null;
  licenseDocumentUrl?: string | null;
  createdAt?: Date | null;
}

// Helper functions to map between service and database Order types
function toServiceOrder(dbOrder: DbOrderRow): Order {
  return {
    id: dbOrder.id,
    beatId: dbOrder.listingId || "",
    buyerId: dbOrder.userId || dbOrder.buyerId || "",
    sellerId: dbOrder.sellerId || "",
    licenseType: dbOrder.licenseType || "",
    amount: dbOrder.amount ?? (dbOrder.amountCents || 0) / 100,
    status: dbOrder.status as Order["status"],
    paymentIntentId: dbOrder.stripePaymentIntentId || undefined,
    licenseDocumentUrl: dbOrder.licenseDocumentUrl || undefined,
    createdAt: dbOrder.createdAt || new Date(),
  };
}


// Valid musical keys for validation
const VALID_MUSICAL_KEYS = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
  "Cm",
  "C#m",
  "Dbm",
  "Dm",
  "D#m",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gbm",
  "Gm",
  "G#m",
  "Abm",
  "Am",
  "A#m",
  "Bbm",
  "Bm",
  "C Major",
  "C Minor",
  "D Major",
  "D Minor",
  "E Major",
  "E Minor",
  "F Major",
  "F Minor",
  "G Major",
  "G Minor",
  "A Major",
  "A Minor",
  "B Major",
  "B Minor",
];

// Price constraints
const MIN_PRICE = 0;
const MAX_PRICE = 100000; // $100,000 max
const MIN_BPM = 20;
const MAX_BPM = 300;
const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 200;

export class MarketplaceService {
  /**
   * Validate listing data
   */
  private validateListingData(data: {
    title: string;
    price: number;
    bpm?: number;
    key?: string;
    licenses?: BeatLicense[];
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Title validation
    if (!data.title || data.title.trim().length < MIN_TITLE_LENGTH) {
      errors.push("Title is required and cannot be empty");
    }
    if (data.title && data.title.length > MAX_TITLE_LENGTH) {
      errors.push(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
    }

    // Price validation
    if (data.price === undefined || data.price === null) {
      errors.push("Price is required");
    } else if (typeof data.price !== "number" || isNaN(data.price)) {
      errors.push("Price must be a valid number");
    } else if (data.price < MIN_PRICE) {
      errors.push("Price cannot be negative");
    } else if (data.price > MAX_PRICE) {
      errors.push(`Price cannot exceed $${MAX_PRICE.toLocaleString()}`);
    }

    // BPM validation
    if (data.bpm !== undefined && data.bpm !== null) {
      if (typeof data.bpm !== "number" || isNaN(data.bpm)) {
        errors.push("BPM must be a valid number");
      } else if (data.bpm < MIN_BPM || data.bpm > MAX_BPM) {
        errors.push(`BPM must be between ${MIN_BPM} and ${MAX_BPM}`);
      }
    }

    // Key validation
    if (data.key !== undefined && data.key !== null && data.key !== "") {
      const normalizedKey = data.key.trim();
      if (!VALID_MUSICAL_KEYS.includes(normalizedKey)) {
        errors.push(
          `Invalid musical key: ${data.key}. Must be a valid key (e.g., C, Am, F# Minor)`,
        );
      }
    }

    // License validation
    if (data.licenses && data.licenses.length > 0) {
      for (const license of data.licenses) {
        if (
          !["basic", "premium", "exclusive", "unlimited"].includes(license.type)
        ) {
          errors.push(`Invalid license type: ${license.type}`);
        }
        if (license.price < MIN_PRICE) {
          errors.push(
            `License price cannot be negative for type: ${license.type}`,
          );
        }
        if (license.price > MAX_PRICE) {
          errors.push(
            `License price cannot exceed $${MAX_PRICE.toLocaleString()} for type: ${license.type}`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Create a new beat listing
   */
  async createListing(data: {
    userId: string;
    title: string;
    description?: string;
    genre?: string;
    bpm?: number;
    key?: string;
    price: number;
    audioUrl: string;
    artworkUrl?: string;
    tags?: string[];
    licenses: BeatLicense[];
  }): Promise<BeatListing> {
    try {
      // Validate input data
      const validation = this.validateListingData({
        title: data.title,
        price: data.price,
        bpm: data.bpm,
        key: data.key,
        licenses: data.licenses,
      });

      if (!validation.valid) {
        throw new Error(
          `Listing validation failed: ${validation.errors.join("; ")}`,
        );
      }

      // Map service data to database schema
      const dbListing = {
        userId: data.userId,
        title: data.title,
        description: data.description,
        priceCents: Math.round(data.price * 100), // Convert to cents
        category: data.genre,
        audioUrl: data.audioUrl,
        artworkUrl: data.artworkUrl,
        previewUrl: data.audioUrl,
        isPublished: true,
        metadata: {
          genre: data.genre,
          bpm: data.bpm,
          key: data.key,
          licenses: data.licenses,
          tags: data.tags || [],
        },
      };

      // Create listing in database (UUID generated automatically)
      const createdListing = (await storage.createListing(
        dbListing,
      )) as ListingRow;

      // Map database result back to service format
      const metadata = (createdListing.metadata as ListingMetadata) || {};
      return {
        id: createdListing.id,
        userId: createdListing.userId,
        title: createdListing.title,
        description: createdListing.description || undefined,
        genre: (metadata.genre || createdListing.category) ?? undefined,
        bpm: metadata.bpm,
        key: metadata.key,
        price: createdListing.priceCents / 100,
        audioUrl: createdListing.audioUrl || createdListing.previewUrl || "",
        artworkUrl: createdListing.artworkUrl || undefined,
        coverArt: createdListing.artworkUrl || undefined,
        tags: metadata.tags || [],
        licenses: metadata.licenses || data.licenses,
        status: createdListing.isPublished ? "active" : "inactive",
        createdAt: createdListing.createdAt || new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating listing:");
      throw new Error("Failed to create beat listing");
    }
  }

  /**
   * Get listing details
   */
  async getListing(listingId: string): Promise<BeatListing | null> {
    try {
      const listing = await storage.getBeatListing(listingId);
      return listing;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching listing:");
      throw new Error("Failed to fetch listing");
    }
  }

  /**
   * Browse marketplace listings with filters
   */
  async browseListings(filters: {
    search?: string;
    genre?: string;
    minPrice?: number;
    maxPrice?: number;
    bpm?: number;
    key?: string;
    tags?: string[];
    sortBy?: "recent" | "popular" | "price_low" | "price_high";
    limit?: number;
    offset?: number;
  }): Promise<BeatListing[]> {
    try {
      const listings = await storage.getBeatListings(filters);
      return listings;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error browsing listings:");
      throw new Error("Failed to browse listings");
    }
  }

  /**
   * Create an order for a beat purchase
   */
  async createOrder(data: {
    beatId: string;
    buyerId: string;
    licenseType: string;
  }): Promise<Order> {
    try {
      // Get beat details
      const beat = await this.getListing(data.beatId);
      if (!beat) {
        throw new Error("Beat not found");
      }

      // Find the license price
      const license = beat.licenses.find((l) => l.type === data.licenseType);
      if (!license) {
        throw new Error("Invalid license type");
      }

      // Map service data to database schema
      const dbOrder = {
        buyerId: data.buyerId,
        sellerId: beat.userId,
        listingId: data.beatId,
        licenseType: data.licenseType,
        amountCents: Math.round(license.price * 100), // Convert to cents
        status: "pending",
        currency: "usd",
      };

      // Create order in database (UUID generated automatically, payout event created in transaction)
      const createdOrder = await storage.createOrder(dbOrder);

      // Convert database order to service order
      return toServiceOrder(createdOrder);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating order:");
      throw new Error("Failed to create order");
    }
  }

  /**
   * Process payment for an order using Stripe
   */
  async processPayment(
    orderId: string,
    paymentIntentId: string,
  ): Promise<Order> {
    try {
      if (!stripe) {
        throw new Error("Stripe not configured");
      }

      // Get existing order from database
      const dbOrder = await storage.getOrder(orderId);
      if (!dbOrder) {
        throw new Error("Order not found");
      }

      // ── Idempotency guard ─────────────────────────────────────────────────
      // Stripe webhooks and client retries can replay processPayment for the
      // same PaymentIntent. If the order is already completed all downstream
      // ledger writes were already executed; return the existing record.
      if (dbOrder.status === "completed") {
        logger.info(
          `[Marketplace] processPayment: order ${orderId} already completed — returning cached result (idempotent replay)`,
        );
        return toServiceOrder(dbOrder);
      }

      // Retrieve payment intent
      const paymentIntent =
        await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== "succeeded") {
        // Handle failed payment - update order status
        await storage.updateOrder(orderId, {
          status: "failed",
          metadata: {
            ...((dbOrder.metadata as object) || {}),
            failureReason: `Payment ${paymentIntent.status}`,
            failedAt: new Date().toISOString(),
            paymentIntentStatus: paymentIntent.status,
          },
        });

        logger.warn(
          `Payment failed for order ${orderId}: status ${paymentIntent.status}`,
        );
        throw new Error(`Payment not successful: ${paymentIntent.status}`);
      }

      // Update order status to completed
      const updatedDBOrder = await storage.updateOrder(orderId, {
        status: "completed",
        stripePaymentIntentId: paymentIntentId,
      });

      // Trigger INSTANT PAYOUT to seller via Stripe Transfer (T+0)
      if (dbOrder.sellerId && dbOrder.amountCents) {
        const totalAmount = dbOrder.amountCents / 100;
        const platformFeePercentage =
          Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10;

        logger.info(
          `Initiating instant payout for order ${orderId}: $${totalAmount} to seller ${dbOrder.sellerId}`,
        );

        // Create instant transfer to seller's connected account
        const payoutResult = await instantPayoutService?.createInstantTransfer(
          dbOrder?.sellerId,
          totalAmount,
          orderId,
          platformFeePercentage,
        );

        if (payoutResult?.success) {
          logger.info(
            `✅ Instant payout successful: $${payoutResult?.amount} transferred to seller ${dbOrder?.sellerId}`,
          );
        } else {
          logger.warn(
            `⚠️ Instant payout failed for order ${orderId}: ${payoutResult?.error}`,
          );
          // Payout failed but order still completes - seller can withdraw manually later
        }
      }

      // Generate license document
      await this.generateLicense(orderId);

      // Distribute royalty splits if applicable
      await this.distributeSplits(orderId);

      // Record marketplace revenue event so royaltyEngine aggregates beat sales
      // in monthly statements.  Non-fatal: sale already succeeded.
      try {
        const saleAmount =
          dbOrder.amount ?? (dbOrder.amountCents || 0) / 100;
        if ((dbOrder.sellerId) && saleAmount > 0) {
          // ON CONFLICT DO NOTHING: the unique constraint on order_id
          // prevents a duplicate row if processPayment somehow reaches
          // this branch twice (belt-and-suspenders with the status guard above).
          await db
            .insert(revenueEvents)
            .values({
              userId: dbOrder.sellerId,
              source: "marketplace",
              sourceType: "beat_sale",
              amount: saleAmount,
              currency: "usd",
              projectId: dbOrder.listingId ?? undefined,
              listingId: dbOrder.listingId ?? undefined,
              orderId,
              occurredAt: new Date(),
            })
            .onConflictDoNothing();
          logger.info(
            `[Marketplace] Revenue event recorded for order ${orderId}: $${saleAmount.toFixed(2)} → seller ${dbOrder.sellerId}`,
          );
        }
      } catch (revErr) {
        logger.warn(
          { err: revErr },
          "[Marketplace] Failed to record revenue event (non-fatal):",
        );
      }

      // Convert database order to service order
      return toServiceOrder(updatedDBOrder);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error processing payment:");
      throw new Error("Failed to process payment");
    }
  }

  /**
   * Distribute royalty splits to collaborators.
   *
   * For each split row tied to this listing (looked up via listingId or via
   * listing.metadata.beatId), we:
   *   1. Write a `royalty_transactions` row so the earning appears in statements.
   *   2. Increment `royalty_splits.totalEarned` and `pendingPayout`.
   *
   * Non-fatal: if this fails the sale has already succeeded and splits will be
   * reconciled in the next royalty-engine run.
   */
  async distributeSplits(orderId: string): Promise<{ success: boolean }> {
    try {
      // ── 1. Fetch order ───────────────────────────────────────────────────
      const [orderRow] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!orderRow) {
        logger.warn(
          `[Marketplace] distributeSplits: order ${orderId} not found`,
        );
        return { success: true };
      }

      const listingId = orderRow.listingId;
      const amount = orderRow.amount ?? 0; // real("amount") stored in dollars
      const sellerId = orderRow.sellerId;

      if (!listingId || amount <= 0) return { success: true };

      // ── Idempotency guard ─────────────────────────────────────────────────
      // If this order was already processed (e.g. webhook retry), skip all
      // writes rather than double-crediting collaborators.
      const existingTx = await db
        .select({ id: royaltyTransactions.id })
        .from(royaltyTransactions)
        .where(sql`${royaltyTransactions.metadata}->>'orderId' = ${orderId}`)
        .limit(1);

      if (existingTx.length > 0) {
        logger.info(
          `[Marketplace] distributeSplits: order ${orderId} already has royalty records — skipping (idempotent replay)`,
        );
        return { success: true };
      }

      // ── 2. Find royalty splits ───────────────────────────────────────────
      // Beat-loop stores releaseId = beatId (UUID from `beats` table).
      // Try listingId first; fall back to listing.metadata.beatId.
      let splits = await db
        .select()
        .from(royaltySplits)
        .where(eq(royaltySplits.releaseId, listingId))
        .limit(20);

      if (splits.length === 0) {
        const [listingRow] = await db
          .select()
          .from(listings)
          .where(eq(listings.id, listingId))
          .limit(1);
        const beatId = (
          listingRow?.metadata as Record<string, unknown> | null
        )?.beatId as string | undefined;
        if (beatId) {
          splits = await db
            .select()
            .from(royaltySplits)
            .where(eq(royaltySplits.releaseId, beatId))
            .limit(20);
        }
      }

      // ── 3. Resolve effective splits (default: 100 % to seller) ──────────
      type MinSplit = {
        id: string | null;
        releaseId: string;
        userId: string | null;
        role: string;
        percentage: number;
      };
      const totalPct = splits.reduce((s, r) => s + (r.percentage ?? 0), 0);
      const effectiveSplits: MinSplit[] =
        splits.length > 0 && totalPct > 0
          ? splits.map((s) => ({
              id: s.id,
              releaseId: s.releaseId,
              userId: s.userId,
              role: s.role,
              percentage: s.percentage ?? 0,
            }))
          : [
              {
                id: null,
                releaseId: listingId,
                userId: sellerId,
                role: "producer",
                percentage: 100,
              },
            ];

      // ── 4. Write royalty_transaction per split + update running totals ───
      await db.transaction(async (tx) => {
        for (const split of effectiveSplits) {
          const splitAmount = (split.percentage / 100) * amount;
          const recipientId = split.userId ?? sellerId;

          await tx.insert(royaltyTransactions).values({
            splitId: split.id ?? randomUUID(),
            releaseId: split.releaseId,
            userId: recipientId,
            amount: splitAmount,
            currency: orderRow.currency ?? "usd",
            transactionType: "marketplace_sale",
            platform: "marketplace",
            status: "completed",
            metadata: {
              orderId,
              listingId,
              beatSale: true,
            } as Record<string, unknown>,
          });

          if (split.id) {
            await tx
              .update(royaltySplits)
              .set({
                totalEarned: sql`coalesce(${royaltySplits.totalEarned}, 0) + ${splitAmount}`,
                pendingPayout: sql`coalesce(${royaltySplits.pendingPayout}, 0) + ${splitAmount}`,
                updatedAt: new Date(),
              })
              .where(eq(royaltySplits.id, split.id));
          }
        }
      });

      logger.info(
        `[Marketplace] ✅ distributeSplits: ${effectiveSplits.length} split(s) recorded for order ${orderId} — total $${amount.toFixed(2)}`,
      );
      return { success: true };
    } catch (error: unknown) {
      // Non-fatal: sale already completed; splits reconciled in next engine run.
      logger.warn({ err: error }, "[Marketplace] Error distributing splits (non-fatal):");
      return { success: false };
    }
  }

  /**
   * Generate license document for completed purchase
   */
  async generateLicense(orderId: string): Promise<{ licenseUrl: string }> {
    try {
      // Fetch order details
      const order = await storage?.getOrder(orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      // Fetch beat details
      const beat = await this.getListing(order?.listingId || "");
      if (!beat) {
        throw new Error("Beat not found for license generation");
      }

      // Get buyer and seller details
      const buyer = await storage?.getUser(order?.buyerId || "");
      const seller = await storage?.getUser(order?.sellerId || "");

      // Get license template based on license type
      const licenseType = order?.licenseType || "basic";
      const licenseTemplate = DEFAULT_LICENSE_TEMPLATES[licenseType];
      if (!licenseTemplate) {
        throw new Error(`Invalid license type: ${licenseType}`);
      }

      // Generate license document content
      const licenseContent = {
        orderId: order.id,
        licenseType: licenseType,
        beatTitle: beat.title,
        beatId: beat.id,
        producer: {
          name: seller.username || seller?.firstName || "Producer",
          id: order.sellerId,
        },
        buyer: {
          name: buyer.username || buyer?.firstName || "Buyer",
          id: order.buyerId,
        },
        purchaseDate:
          order?.createdAt?.toISOString() || new Date().toISOString(),
        amount: (order?.amountCents || 0) / 100,
        currency: "USD",
        terms: {
          streams: licenseTemplate.streams,
          copies: licenseTemplate.copies,
          radioStations: licenseTemplate.radioStations,
          musicVideos: licenseTemplate.musicVideos,
          duration: licenseTemplate.duration,
          allowsBroadcast: licenseTemplate.allowsBroadcast,
          allowsProfit: licenseTemplate.allowsProfit,
          allowsSync: licenseTemplate.allowsSync,
          features: licenseTemplate.features,
        },
        isExclusive: licenseType === "exclusive",
        restrictions: this.getLicenseRestrictions(licenseType),
      };

      // Store license document URL
      const licenseUrl = `/licenses/${orderId}.pdf`;

      // Update order with license document
      await storage?.updateOrder(orderId, {
        licenseDocumentUrl: licenseUrl,
        metadata: {
          ...((order?.metadata as object) || {}),
          licenseContent,
          generatedAt: new Date().toISOString(),
        },
      });

      logger.info(
        `Generated license document for order ${orderId}, type: ${licenseType}`,
      );

      return { licenseUrl };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error generating license:");
      throw new Error("Failed to generate license");
    }
  }

  /**
   * Get license restrictions based on type
   */
  private getLicenseRestrictions(licenseType: string): string[] {
    switch (licenseType) {
      case "basic":
        return [
          "No broadcast television rights",
          "No sync licensing for film/TV",
          "Must credit producer",
          "Non-exclusive - producer may sell to others",
          "Stream and sales limits apply",
        ];
      case "premium":
        return [
          "Must credit producer",
          "Non-exclusive - producer may sell to others",
          "Stream and sales limits apply",
        ];
      case "unlimited":
        return [
          "Must credit producer",
          "Non-exclusive - producer may sell to others",
        ];
      case "exclusive":
        return [
          "Beat will be removed from marketplace",
          "No future licenses will be granted",
          "Full ownership transfer",
        ];
      default:
        return ["Standard license terms apply"];
    }
  }

  /**
   * Create Stripe checkout session for beat purchase
   */
  async createCheckoutSession(data: {
    beatId: string;
    licenseType: string;
    buyerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }> {
    try {
      if (!stripe) {
        throw new Error("Stripe not configured");
      }

      const beat = await this.getListing(data?.beatId);
      if (!beat) {
        throw new Error("Beat not found");
      }

      const license = beat?.licenses.find((l) => l?.type === data?.licenseType);
      if (!license) {
        throw new Error("Invalid license type");
      }

      const session = await stripe?.checkout.sessions?.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${beat?.title} - ${license?.type} License`,
                description: license.features.join(", "),
              },
              unit_amount: license.price * 100,
            },
            quantity: 1,
          },
        ],
        metadata: {
          beatId: data.beatId,
          licenseType: data.licenseType,
          buyerId: data.buyerId,
        },
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
      });

      return {
        sessionId: session.id,
        url: session.url!,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating checkout session:");
      throw new Error("Failed to create checkout session");
    }
  }

  /**
   * Get user's purchase history
   */
  async getUserOrders(userId: string): Promise<Order[]> {
    try {
      const dbOrders = await storage.getUserOrders(userId);
      return dbOrders.map(toServiceOrder);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching user orders:");
      throw new Error("Failed to fetch user orders");
    }
  }

  /**
   * Get user's sales (for sellers)
   */
  async getUserSales(userId: string): Promise<Order[]> {
    try {
      // Query orders where user is the seller
      const dbOrders = await storage?.getSellerOrders(userId);
      return dbOrders?.map(toServiceOrder);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching user sales:");
      throw new Error("Failed to fetch user sales");
    }
  }

  /**
   * Setup Stripe Connect for sellers
   */
  async setupStripeConnect(
    userId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ url: string }> {
    try {
      if (!stripe) {
        throw new Error("Stripe not configured");
      }

      // Check if user already has a Connect account
      const user = await storage?.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      let accountId = user?.stripeCustomerId;

      if (!accountId) {
        // Create new Connect account
        const account = await stripe?.accounts.create({
          type: "express",
          email: user.email,
        });
        accountId = account?.id;

        // Update user with account ID
        await storage?.updateUser(userId, { stripeCustomerId: accountId });
      }

      // Create account link for onboarding
      const accountLink = await stripe?.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return { url: accountLink.url };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error setting up Stripe Connect:");
      throw new Error("Failed to setup Stripe Connect");
    }
  }

  async getUserListings(userId: string): Promise<any[]> {
    try {
      const listings = await storage?.getBeatListings({ userId });
      const user = await storage?.getUser(userId);

      const listingIds = listings?.map((l) => l?.id);
      const allTiers: ListingLicenseTier[] = [];
      if (listingIds?.length > 0) {
        for (const lid of listingIds) {
          const tiers = await db
            .select()
            .from(listingLicenseTiers)
            .where(eq(listingLicenseTiers?.listingId, lid))
            .orderBy(listingLicenseTiers?.sortOrder)
            .limit(20);
          allTiers?.push(...tiers);
        }
      }

      return listings?.map((listing) => {
        const tiers = allTiers?.filter((t) => t?.listingId === listing?.id);
        const mappedTiers = tiers?.map((t) => ({
          id: t.id,
          licenseType: t.licenseType,
          label: t.label,
          priceCents: t.priceCents,
          price: t.priceCents / 100,
          discountType: t.discountType,
          discountPercent: t.discountPercent,
          discountPriceCents: t.discountPriceCents,
          discountPrice: t.discountPriceCents
            ? t?.discountPriceCents / 100
            : null,
          discountExpiresAt: t.discountExpiresAt,
          bogoEnabled: t.bogoEnabled,
          bogoGetType: t.bogoGetType,
          bogoGetPercent: t.bogoGetPercent,
          fileFormats: t.fileFormats || ["mp3"],
          audioUrls: t.audioUrls || {},
          isActive: t.isActive,
        }));
        return {
          // Preserve every field storage already mapped (genre, mood, tempo, key,
          // licenseType, tags, plays, likes, avgRating, ratingCount, coverArt, …)
          ...listing,
          producer:
            user?.username ||
            `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
            "Producer",
          producerId: listing.userId,
          // Derive hasLicenseTiers from the live tiers table, not stale metadata.
          hasLicenseTiers: mappedTiers.length > 0,
          licenseTiers: mappedTiers,
        };
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching user listings:");
      return [];
    }
  }

  async getListingsByProducer(producerId: string): Promise<any[]> {
    try {
      const listings = await storage?.getBeatListings({ userId: producerId });
      const producer = await storage?.getUser(producerId);

      const listingIds = listings?.map((l) => l?.id);
      const allTiers: ListingLicenseTier[] = [];
      if (listingIds?.length > 0) {
        for (const lid of listingIds) {
          const tiers = await db
            .select()
            .from(listingLicenseTiers)
            .where(eq(listingLicenseTiers?.listingId, lid))
            .orderBy(listingLicenseTiers?.sortOrder)
            .limit(20);
          allTiers?.push(...tiers);
        }
      }

      return listings?.map((listing) => {
        const tiers = allTiers?.filter((t) => t?.listingId === listing?.id);
        const mappedTiers = tiers?.map((t) => ({
          id: t.id,
          licenseType: t.licenseType,
          label: t.label,
          priceCents: t.priceCents,
          price: t.priceCents / 100,
          discountType: t.discountType,
          discountPercent: t.discountPercent,
          discountPriceCents: t.discountPriceCents,
          discountPrice: t.discountPriceCents
            ? t?.discountPriceCents / 100
            : null,
          discountExpiresAt: t.discountExpiresAt,
          bogoEnabled: t.bogoEnabled,
          bogoGetType: t.bogoGetType,
          bogoGetPercent: t.bogoGetPercent,
          fileFormats: t.fileFormats || ["mp3"],
          audioUrls: t.audioUrls || {},
          isActive: t.isActive,
        }));
        return {
          // Preserve every field storage already mapped, including counters,
          // genre, mood, tempo, key, licenseType, tags, coverArt, etc.
          ...listing,
          producer:
            producer?.username ||
            `${producer?.firstName || ""} ${producer?.lastName || ""}`.trim() ||
            "Producer",
          producerId: listing.userId,
          isNew: true,
          isHot: false,
          // Derive hasLicenseTiers from the live tiers table, not stale metadata.
          hasLicenseTiers: mappedTiers.length > 0,
          licenseTiers: mappedTiers,
        };
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching producer listings:");
      return [];
    }
  }

  async updateListing(
    listingId: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      genre?: string;
      mood?: string;
      bpm?: number;
      key?: string;
      price?: number;
      licenseType?: string;
      tags?: string[];
      audioUrl?: string;
      artworkUrl?: string;
    },
  ): Promise<BeatListing | null> {
    try {
      const listing = await storage?.getBeatListing(listingId);
      if (!listing) {
        throw new Error("Listing not found");
      }
      if (listing?.userId !== userId) {
        throw new Error("Not authorized to update this listing");
      }

      // Validate update data
      const validation = this.validateListingData({
        title: data.title || listing?.title,
        price: data.price ?? listing?.price,
        bpm: data.bpm,
        key: data.key,
      });

      if (!validation?.valid) {
        throw new Error(
          `Listing validation failed: ${validation?.errors.join("; ")}`,
        );
      }

      const updateData: Record<string, unknown> = {};
      if (data?.title !== undefined) updateData.title = data?.title;
      if (data?.description !== undefined)
        updateData.description = data?.description;
      if (data?.price !== undefined)
        updateData.priceCents = Math.round(data?.price * 100);
      if (data?.genre !== undefined) updateData.category = data?.genre;
      if (data?.audioUrl !== undefined) updateData.audioUrl = data?.audioUrl;
      if (data?.artworkUrl !== undefined)
        updateData.artworkUrl = data?.artworkUrl;

      const existingMetadata = (listing?.metadata as ListingMetadata) || {};
      updateData.metadata = {
        ...existingMetadata,
        genre: data.genre ?? existingMetadata?.genre,
        mood: data.mood ?? existingMetadata?.mood,
        bpm: data.bpm ?? existingMetadata?.bpm,
        key: data.key ?? existingMetadata?.key,
        licenseType: data.licenseType ?? existingMetadata?.licenseType,
        tags: data.tags ?? existingMetadata?.tags ?? [],
      };

      const updatedListing = (await storage?.updateListing(
        listingId,
        updateData,
      )) as ListingRow | null;
      if (!updatedListing) return null;

      const metadata = (updatedListing?.metadata as ListingMetadata) || {};
      return {
        id: updatedListing.id,
        userId: updatedListing.userId,
        title: updatedListing.title,
        description: updatedListing.description || undefined,
        genre: (metadata?.genre || updatedListing?.category) ?? undefined,
        bpm: metadata.bpm,
        key: metadata.key,
        price: updatedListing.priceCents / 100,
        audioUrl: updatedListing.audioUrl || updatedListing?.previewUrl || "",
        artworkUrl: updatedListing.artworkUrl || undefined,
        tags: metadata.tags || [],
        licenses: metadata.licenses || [],
        status: updatedListing.isPublished ? "active" : "inactive",
        createdAt: updatedListing.createdAt || new Date(),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error updating listing:");
      throw error;
    }
  }

  async deleteListing(listingId: string, userId: string): Promise<boolean> {
    try {
      const listing = await storage?.getBeatListing(listingId);
      if (!listing) {
        throw new Error("Listing not found");
      }
      if (listing?.userId !== userId) {
        throw new Error("Not authorized to delete this listing");
      }

      await storage?.deleteListing(listingId);
      return true;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error deleting listing:");
      throw error;
    }
  }

  async getUserPurchases(userId: string): Promise<any[]> {
    try {
      const orders = await storage?.getUserOrders(userId);
      return orders || [];
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching user purchases:");
      return [];
    }
  }

  async getSalesAnalytics(userId: string): Promise<unknown> {
    try {
      const sales = await this.getUserSales(userId);
      const totalSales = sales?.reduce(
        (sum, sale) => sum + (sale?.amount || 0),
        0,
      );
      const totalOrders = sales?.length;

      return {
        totalRevenue: totalSales,
        totalSales: totalOrders,
        averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
        recentSales: sales.slice(0, 10),
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching sales analytics:");
      return {
        totalRevenue: 0,
        totalSales: 0,
        averageOrderValue: 0,
        recentSales: [],
      };
    }
  }

  async initiatePurchase(
    buyerId: string,
    beatId: string,
    licenseType: string,
  ): Promise<unknown> {
    try {
      if (!stripe) {
        throw new Error("Payment system not configured");
      }

      const beat = await this.getListing(beatId);
      if (!beat) {
        throw new Error("Beat not found");
      }

      let priceInCents: number;
      let licenseLabel = licenseType;
      let licenseSnapshot: Record<string, unknown> | null = null;

      if (beat?.hasLicenseTiers && beat?.licenseTiers?.length) {
        const tier = beat?.licenseTiers.find(
          (t) => t?.licenseType === licenseType && t?.isActive,
        );
        if (!tier) {
          throw new Error("Invalid or inactive license type");
        }
        priceInCents = tier?.discountPriceCents || tier?.priceCents;
        licenseLabel = tier?.label || licenseType;
        licenseSnapshot = {
          licenseType: tier.licenseType,
          label: tier.label,
          priceCents: tier.priceCents,
          discountPriceCents: tier.discountPriceCents,
          fileFormats: tier.fileFormats,
          bogoEnabled: tier.bogoEnabled,
          bogoGetType: tier.bogoGetType,
          bogoGetPercent: tier.bogoGetPercent,
        };
      } else {
        const license = beat?.licenses.find(
          (l) => l?.type === licenseType,
        );
        if (!license) {
          throw new Error("Invalid license type");
        }
        priceInCents = Math.round(license?.price * 100);
        licenseSnapshot = {
          licenseType,
          label: license.type,
          price: license.price,
        };
      }

      const session = await stripe?.checkout.sessions?.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${beat?.title} - ${licenseLabel} License`,
                description: `Beat purchase: ${beat?.title}`,
              },
              unit_amount: priceInCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${getBaseUrl()}/marketplace?success=true`,
        cancel_url: `${getBaseUrl()}/marketplace?canceled=true`,
        metadata: {
          buyerId,
          beatId,
          licenseType,
          sellerId: beat.userId,
          licenseSnapshot: JSON.stringify(licenseSnapshot),
        },
      });

      return { url: session.url };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error initiating purchase:");
      const msg = (error as Error).message;
      if (
        msg === "Beat not found" ||
        msg === "Invalid license type" ||
        msg === "Invalid or inactive license type" ||
        msg === "Payment system not configured" ||
        msg === "Cannot purchase your own beat"
      ) {
        throw error;
      }
      throw new Error("Failed to initiate purchase");
    }
  }
}

export const marketplaceService = new MarketplaceService();

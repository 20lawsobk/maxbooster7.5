import { storage } from '../storage';
import { db } from '../db';
import { nanoid } from 'nanoid';
import Stripe from 'stripe';
import { type Order as DBOrder } from '@shared/schema';
import { instantPayoutService } from './instantPayoutService';
import { logger } from '../logger.js';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY?.startsWith('sk_')
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' })
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
  tags?: string[];
  licenses: BeatLicense[];
  status: 'draft' | 'active' | 'sold' | 'inactive';
  createdAt: Date;
}

export interface BeatLicense {
  type: 'basic' | 'premium' | 'exclusive';
  price: number;
  features: string[];
}

// Service-layer Order type (domain model)
export interface Order {
  id: string;
  beatId: string; // Maps to listingId in database
  buyerId: string;
  sellerId: string;
  licenseType: string;
  amount: number; // Maps to amountCents / 100 in database
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  paymentIntentId?: string; // Maps to stripePaymentIntentId in database
  licenseDocumentUrl?: string;
  createdAt: Date;
}

// Helper functions to map between service and database Order types
function toServiceOrder(dbOrder: DBOrder): Order {
  return {
    id: dbOrder.id,
    beatId: dbOrder.listingId || '',
    buyerId: dbOrder.buyerId || '',
    sellerId: dbOrder.sellerId || '',
    licenseType: dbOrder.licenseType || '',
    amount: (dbOrder.amountCents || 0) / 100,
    status: dbOrder.status as Order['status'],
    paymentIntentId: dbOrder.stripePaymentIntentId || undefined,
    licenseDocumentUrl: dbOrder.licenseDocumentUrl || undefined,
    createdAt: dbOrder.createdAt || new Date(),
  };
}

/**
 * TODO: Add function documentation
 */
function toDBOrder(serviceOrder: Partial<Order>): Partial<DBOrder> {
  const dbOrder: Partial<DBOrder> = {};

  if (serviceOrder.id) dbOrder.id = serviceOrder.id;
  if (serviceOrder.beatId) dbOrder.listingId = serviceOrder.beatId;
  if (serviceOrder.buyerId) dbOrder.buyerId = serviceOrder.buyerId;
  if (serviceOrder.sellerId) dbOrder.sellerId = serviceOrder.sellerId;
  if (serviceOrder.licenseType) dbOrder.licenseType = serviceOrder.licenseType;
  if (serviceOrder.amount !== undefined)
    dbOrder.amountCents = Math.round(serviceOrder.amount * 100);
  if (serviceOrder.status) dbOrder.status = serviceOrder.status;
  if (serviceOrder.paymentIntentId) dbOrder.stripePaymentIntentId = serviceOrder.paymentIntentId;
  if (serviceOrder.licenseDocumentUrl) dbOrder.licenseDocumentUrl = serviceOrder.licenseDocumentUrl;

  return dbOrder;
}

export class MarketplaceService {
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
      // Map service data to database schema
      const dbListing = {
        ownerId: data.userId,
        title: data.title,
        description: data.description,
        priceCents: Math.round(data.price * 100), // Convert to cents
        licenseType: data.licenses[0]?.type || 'basic', // Store first license as primary
        isPublished: true, // Maps to 'active' status
        tags: data.tags || [],
        metadata: {
          genre: data.genre,
          bpm: data.bpm,
          key: data.key,
          licenses: data.licenses, // Store full license array in metadata
        },
        previewUrl: data.audioUrl,
        downloadUrl: data.audioUrl,
        coverArtUrl: data.artworkUrl,
      };

      // Create listing in database (UUID generated automatically)
      const createdListing = await storage.createListing(dbListing);

      // Map database result back to service format
      const metadata = (createdListing.metadata as any) || {};
      return {
        id: createdListing.id,
        userId: createdListing.ownerId,
        title: createdListing.title,
        description: createdListing.description || undefined,
        genre: metadata.genre,
        bpm: metadata.bpm,
        key: metadata.key,
        price: createdListing.priceCents / 100,
        audioUrl: createdListing.previewUrl || createdListing.downloadUrl || '',
        artworkUrl: createdListing.coverArtUrl || undefined,
        tags: Array.isArray(createdListing.tags) ? (createdListing.tags as string[]) : [],
        licenses: metadata.licenses || data.licenses,
        status: createdListing.isPublished ? 'active' : 'inactive',
        createdAt: createdListing.createdAt || new Date(),
      };
    } catch (error: unknown) {
      logger.error('Error creating listing:', error);
      throw new Error('Failed to create beat listing');
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
      logger.error('Error fetching listing:', error);
      throw new Error('Failed to fetch listing');
    }
  }

  /**
   * Browse marketplace listings with filters
   */
  async browseListings(filters: {
    genre?: string;
    minPrice?: number;
    maxPrice?: number;
    bpm?: number;
    key?: string;
    tags?: string[];
    sortBy?: 'recent' | 'popular' | 'price_low' | 'price_high';
    limit?: number;
    offset?: number;
  }): Promise<BeatListing[]> {
    try {
      const listings = await storage.getBeatListings(filters);
      return listings;
    } catch (error: unknown) {
      logger.error('Error browsing listings:', error);
      throw new Error('Failed to browse listings');
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
        throw new Error('Beat not found');
      }

      // Find the license price
      const license = beat.licenses.find((l) => l.type === data.licenseType);
      if (!license) {
        throw new Error('Invalid license type');
      }

      // Map service data to database schema
      const dbOrder = {
        buyerId: data.buyerId,
        sellerId: beat.userId,
        listingId: data.beatId,
        licenseType: data.licenseType,
        amountCents: Math.round(license.price * 100), // Convert to cents
        status: 'pending',
        currency: 'usd',
      };

      // Create order in database (UUID generated automatically, payout event created in transaction)
      const createdOrder = await storage.createOrder(dbOrder);

      // Convert database order to service order
      return toServiceOrder(createdOrder);
    } catch (error: unknown) {
      logger.error('Error creating order:', error);
      throw new Error('Failed to create order');
    }
  }

  /**
   * Process payment for an order using Stripe
   */
  async processPayment(orderId: string, paymentIntentId: string): Promise<Order> {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      // Get existing order from database
      const dbOrder = await storage.getOrder(orderId);
      if (!dbOrder) {
        throw new Error('Order not found');
      }

      // Retrieve payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment not successful');
      }

      // Update order status to completed
      const updatedDBOrder = await storage.updateOrder(orderId, {
        status: 'completed',
        stripePaymentIntentId: paymentIntentId,
      });

      // Trigger INSTANT PAYOUT to seller via Stripe Transfer (T+0)
      if (dbOrder.sellerId && dbOrder.amountCents) {
        const totalAmount = dbOrder.amountCents / 100;
        const platformFeePercentage = Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10;

        logger.info(
          `Initiating instant payout for order ${orderId}: $${totalAmount} to seller ${dbOrder.sellerId}`
        );

        // Create instant transfer to seller's connected account
        const payoutResult = await instantPayoutService.createInstantTransfer(
          dbOrder.sellerId,
          totalAmount,
          orderId,
          platformFeePercentage
        );

        if (payoutResult.success) {
          logger.info(
            `✅ Instant payout successful: $${payoutResult.amount} transferred to seller ${dbOrder.sellerId}`
          );
        } else {
          logger.warn(`⚠️ Instant payout failed for order ${orderId}: ${payoutResult.error}`);
          // Payout failed but order still completes - seller can withdraw manually later
        }
      }

      // Generate license document
      await this.generateLicense(orderId);

      // Distribute royalty splits if applicable
      await this.distributeSplits(orderId);

      // Convert database order to service order
      return toServiceOrder(updatedDBOrder);
    } catch (error: unknown) {
      logger.error('Error processing payment:', error);
      throw new Error('Failed to process payment');
    }
  }

  /**
   * Distribute royalty splits to collaborators using Stripe Connect
   */
  async distributeSplits(orderId: string): Promise<{ success: boolean }> {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      // In production:
      // 1. Get order details and beat metadata
      // 2. Calculate split percentages for collaborators
      // 3. Use Stripe Connect transfers to distribute funds
      // 4. Record distribution in database

      return { success: true };
    } catch (error: unknown) {
      logger.error('Error distributing splits:', error);
      throw new Error('Failed to distribute royalty splits');
    }
  }

  /**
   * Generate license document for completed purchase
   */
  async generateLicense(orderId: string): Promise<{ licenseUrl: string }> {
    try {
      // In production:
      // 1. Fetch order and beat details
      // 2. Generate PDF license document with terms
      // 3. Store in cloud storage (S3/R2)
      // 4. Return download URL

      const licenseUrl = `/licenses/${orderId}.pdf`;

      return { licenseUrl };
    } catch (error: unknown) {
      logger.error('Error generating license:', error);
      throw new Error('Failed to generate license');
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
        throw new Error('Stripe not configured');
      }

      const beat = await this.getListing(data.beatId);
      if (!beat) {
        throw new Error('Beat not found');
      }

      const license = beat.licenses.find((l) => l.type === data.licenseType);
      if (!license) {
        throw new Error('Invalid license type');
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${beat.title} - ${license.type} License`,
                description: license.features.join(', '),
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
      logger.error('Error creating checkout session:', error);
      throw new Error('Failed to create checkout session');
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
      logger.error('Error fetching user orders:', error);
      throw new Error('Failed to fetch user orders');
    }
  }

  /**
   * Get user's sales (for sellers)
   */
  async getUserSales(userId: string): Promise<Order[]> {
    try {
      // Query orders where user is the seller
      const dbOrders = await storage.getSellerOrders(userId);
      return dbOrders.map(toServiceOrder);
    } catch (error: unknown) {
      logger.error('Error fetching user sales:', error);
      throw new Error('Failed to fetch user sales');
    }
  }

  /**
   * Setup Stripe Connect for sellers
   */
  async setupStripeConnect(
    userId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<{ url: string }> {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      // Check if user already has a Connect account
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      let accountId = user.stripeCustomerId;

      if (!accountId) {
        // Create new Connect account
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email,
        });
        accountId = account.id;

        // Update user with account ID
        await storage.updateUser(userId, { stripeCustomerId: accountId });
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return { url: accountLink.url };
    } catch (error: unknown) {
      logger.error('Error setting up Stripe Connect:', error);
      throw new Error('Failed to setup Stripe Connect');
    }
  }

  async getUserListings(userId: string): Promise<any[]> {
    try {
      const listings = await storage.getBeatListings({ userId });
      return listings.map(listing => ({
        ...listing,
        price: listing.price,
      }));
    } catch (error: unknown) {
      logger.error('Error fetching user listings:', error);
      return [];
    }
  }

  async getUserPurchases(userId: string): Promise<any[]> {
    try {
      const orders = await storage.getUserOrders(userId);
      return orders || [];
    } catch (error: unknown) {
      logger.error('Error fetching user purchases:', error);
      return [];
    }
  }

  async getSalesAnalytics(userId: string): Promise<any> {
    try {
      const sales = await this.getUserSales(userId);
      const totalSales = sales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
      const totalOrders = sales.length;
      
      return {
        totalRevenue: totalSales,
        totalSales: totalOrders,
        averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
        recentSales: sales.slice(0, 10),
      };
    } catch (error: unknown) {
      logger.error('Error fetching sales analytics:', error);
      return {
        totalRevenue: 0,
        totalSales: 0,
        averageOrderValue: 0,
        recentSales: [],
      };
    }
  }

  async initiatePurchase(buyerId: string, beatId: string, licenseType: string): Promise<any> {
    try {
      if (!stripe) {
        throw new Error('Payment system not configured');
      }

      const beat = await this.getListing(beatId);
      if (!beat) {
        throw new Error('Beat not found');
      }

      const license = beat.licenses.find((l) => l.type === licenseType);
      if (!license) {
        throw new Error('Invalid license type');
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${beat.title} - ${licenseType} License`,
                description: `Beat purchase: ${beat.title}`,
              },
              unit_amount: Math.round(license.price * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}/marketplace?success=true`
          : 'http://localhost:5000/marketplace?success=true',
        cancel_url: process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}/marketplace?canceled=true`
          : 'http://localhost:5000/marketplace?canceled=true',
        metadata: {
          buyerId,
          beatId,
          licenseType,
          sellerId: beat.userId,
        },
      });

      return { url: session.url };
    } catch (error: unknown) {
      logger.error('Error initiating purchase:', error);
      throw new Error('Failed to initiate purchase');
    }
  }
}

export const marketplaceService = new MarketplaceService();

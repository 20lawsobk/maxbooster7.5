import Stripe from 'stripe';
import { db } from '../db';
import { users, orders, instantPayouts, notifications, ledgerEntries, splitPayments, refunds } from '@shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { logger } from '../logger.js';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY?.startsWith('sk_')
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' })
  : null;

export interface PayoutBalance {
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
  currency: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  stripePayoutId?: string;
  amount?: number;
  estimatedArrival?: Date;
  error?: string;
  riskScore?: number;
}

export interface RiskAssessment {
  score: number;
  flags: string[];
  approved: boolean;
  reason?: string;
}

export interface LedgerEntryData {
  userId: string;
  entryType: 'credit' | 'debit' | 'payout' | 'refund' | 'split_payment' | 'platform_fee';
  amountCents: number;
  currency?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export class InstantPayoutService {
  /**
   * Record a ledger entry for audit trail
   */
  async recordLedgerEntry(data: LedgerEntryData): Promise<string> {
    try {
      const currentBalance = await this.calculateAvailableBalance(data.userId);
      const balanceAfterCents = Math.round(currentBalance.availableBalance * 100) + 
        (data.entryType === 'credit' ? data.amountCents : -data.amountCents);

      const [entry] = await db
        .insert(ledgerEntries)
        .values({
          userId: data.userId,
          entryType: data.entryType,
          amountCents: data.amountCents,
          currency: data.currency || 'usd',
          balanceAfterCents,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          description: data.description,
          metadata: data.metadata,
        })
        .returning();

      logger.info('Ledger entry recorded', { 
        entryId: entry.id, 
        userId: data.userId, 
        type: data.entryType,
        amountCents: data.amountCents 
      });
      
      return entry.id;
    } catch (error: unknown) {
      logger.error('Error recording ledger entry:', error);
      throw new Error('Failed to record ledger entry');
    }
  }

  /**
   * Get ledger history for a user
   */
  async getLedgerHistory(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, userId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(limit)
        .offset(offset);
      return entries;
    } catch (error: unknown) {
      logger.error('Error fetching ledger history:', error);
      throw new Error('Failed to fetch ledger history');
    }
  }

  /**
   * Perform risk assessment before payout
   */
  async assessPayoutRisk(userId: string, amount: number): Promise<RiskAssessment> {
    const flags: string[] = [];
    let score = 0;

    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Check payout velocity (last 24 hours)
      const recentPayoutsResult = await db.execute(
        sql`SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total
            FROM instant_payouts 
            WHERE user_id = ${userId} 
            AND created_at >= ${last24Hours.toISOString()}
            AND status IN ('pending', 'completed', 'in_transit')`
      );
      const recentCount = Number(recentPayoutsResult.rows?.[0]?.count || 0);
      const recentTotal = Number(recentPayoutsResult.rows?.[0]?.total || 0) / 100;

      if (recentCount >= 3) {
        flags.push('HIGH_VELOCITY_24H');
        score += 25;
      }
      if (recentTotal > 5000) {
        flags.push('HIGH_VOLUME_24H');
        score += 20;
      }

      // Check weekly payout patterns
      const weeklyPayoutsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount_cents), 0) as total
            FROM instant_payouts 
            WHERE user_id = ${userId} 
            AND created_at >= ${last7Days.toISOString()}
            AND status = 'completed'`
      );
      const weeklyTotal = Number(weeklyPayoutsResult.rows?.[0]?.total || 0) / 100;
      if (weeklyTotal > 10000) {
        flags.push('HIGH_VOLUME_7D');
        score += 15;
      }

      // Check account age
      const [user] = await db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user?.createdAt) {
        const accountAgeDays = (now.getTime() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000);
        if (accountAgeDays < 7) {
          flags.push('NEW_ACCOUNT');
          score += 30;
        } else if (accountAgeDays < 30) {
          flags.push('YOUNG_ACCOUNT');
          score += 10;
        }
      }

      // Check for large single payout
      const balance = await this.calculateAvailableBalance(userId);
      if (amount > balance.availableBalance * 0.9) {
        flags.push('NEAR_FULL_WITHDRAWAL');
        score += 15;
      }
      if (amount > 2000) {
        flags.push('LARGE_PAYOUT');
        score += 10;
      }

      // Check for recent refunds
      const recentRefundsResult = await db.execute(
        sql`SELECT COUNT(*) as count
            FROM refunds 
            WHERE seller_id = ${userId} 
            AND created_at >= ${last30Days.toISOString()}`
      );
      const refundCount = Number(recentRefundsResult.rows?.[0]?.count || 0);
      if (refundCount > 3) {
        flags.push('HIGH_REFUND_RATE');
        score += 25;
      }

      // Determine approval
      const approved = score < 60;
      let reason: string | undefined;
      
      if (!approved) {
        reason = `Risk score ${score} exceeds threshold. Flags: ${flags.join(', ')}`;
        logger.warn('Payout risk check failed', { userId, amount, score, flags });
      }

      return { score, flags, approved, reason };
    } catch (error: unknown) {
      logger.error('Error assessing payout risk:', error);
      return { score: 0, flags: ['ASSESSMENT_ERROR'], approved: true };
    }
  }

  /**
   * Calculate user's available balance from completed marketplace orders
   */
  async calculateAvailableBalance(userId: string): Promise<PayoutBalance> {
    try {
      // Get total earnings from completed orders where user is the seller
      const earningsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount), 0) as total_earnings
            FROM orders 
            WHERE seller_id = ${userId} AND status = 'completed'`
      );
      const totalEarnings = Number(earningsResult.rows?.[0]?.total_earnings || 0);

      // Get total payouts already processed for this user (amount_cents / 100 to convert to dollars)
      const payoutsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount_cents), 0) / 100.0 as total_paid
            FROM instant_payouts 
            WHERE user_id = ${userId} AND status = 'completed'`
      );
      const totalPaid = Number(payoutsResult.rows?.[0]?.total_paid || 0);

      // Get pending payouts (requested but not completed)
      const pendingPayoutsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount_cents), 0) / 100.0 as pending_paid
            FROM instant_payouts 
            WHERE user_id = ${userId} AND status = 'pending'`
      );
      const pendingPaid = Number(pendingPayoutsResult.rows?.[0]?.pending_paid || 0);

      // Available balance = earnings - completed payouts - pending payouts
      const availableBalance = Math.max(0, totalEarnings - totalPaid - pendingPaid);
      const pendingBalance = pendingPaid;

      return {
        availableBalance,
        pendingBalance,
        totalEarnings,
        currency: 'usd',
      };
    } catch (error: unknown) {
      // Log the full error for observability
      logger.error('Error calculating available balance:', {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Re-throw for proper error handling - caller should handle gracefully
      throw new Error('Failed to calculate available balance');
    }
  }

  /**
   * Update user's available balance based on new sales
   * Note: Balance is calculated dynamically from orders and payouts tables
   * This method is kept for API compatibility but is a no-op
   */
  async updateAvailableBalance(userId: string, amount: number): Promise<void> {
    // Balance is calculated dynamically from orders and payouts tables
    // No need to update a column - this is intentionally a no-op
    logger.info('Balance update requested for user - calculated dynamically', { userId, amount });
  }

  /**
   * Verify Stripe Connect Express account status
   */
  async verifyStripeAccount(userId: string): Promise<{
    verified: boolean;
    accountId?: string;
    requiresOnboarding?: boolean;
    error?: string;
  }> {
    try {
      if (!stripe) {
        return {
          verified: false,
          error: 'Stripe not configured',
        };
      }

      // Get user's Stripe Connected Account ID
      const [user] = await db
        .select({
          stripeConnectedAccountId: users.stripeConnectedAccountId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user || !user.stripeConnectedAccountId) {
        return {
          verified: false,
          requiresOnboarding: true,
          error: 'No Stripe account connected',
        };
      }

      // Verify account with Stripe
      const account = await stripe.accounts.retrieve(user.stripeConnectedAccountId);

      // Check if account is verified and can receive payouts
      const canReceivePayouts = account.payouts_enabled && account.charges_enabled;

      if (!canReceivePayouts) {
        return {
          verified: false,
          accountId: user.stripeConnectedAccountId,
          requiresOnboarding: !account.details_submitted,
          error: 'Account verification incomplete',
        };
      }

      return {
        verified: true,
        accountId: user.stripeConnectedAccountId,
        requiresOnboarding: false,
      };
    } catch (error: unknown) {
      logger.error('Error verifying Stripe account:', error);
      return {
        verified: false,
        error: error.message || 'Failed to verify Stripe account',
      };
    }
  }

  /**
   * Create Stripe Connect Express account link for onboarding
   */
  async createAccountLink(userId: string, refreshUrl: string, returnUrl: string): Promise<string> {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      // Get or create Stripe Connected Account
      const [user] = await db
        .select({
          stripeConnectedAccountId: users.stripeConnectedAccountId,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      let accountId = user.stripeConnectedAccountId;

      // Create account if it doesn't exist
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          settings: {
            payouts: {
              schedule: {
                interval: 'manual', // Allow instant payouts
              },
            },
          },
        });

        accountId = account.id;

        // Save account ID to database
        await db
          .update(users)
          .set({
            stripeConnectedAccountId: accountId,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return accountLink.url;
    } catch (error: unknown) {
      logger.error('Error creating account link:', error);
      throw new Error(error.message || 'Failed to create account link');
    }
  }

  /**
   * Create instant transfer to seller's connected account (for marketplace sales)
   * This is the CORRECT method for marketplace payouts - transfers FROM platform TO seller
   */
  async createInstantTransfer(
    userId: string,
    amount: number,
    orderId: string,
    platformFeePercentage: number = 10,
    currency: string = 'usd'
  ): Promise<PayoutResult> {
    try {
      if (!stripe) {
        return {
          success: false,
          error: 'Stripe not configured',
        };
      }

      // Verify Stripe account
      const accountVerification = await this.verifyStripeAccount(userId);
      if (!accountVerification.verified) {
        // Seller not onboarded - store payout as pending
        logger.warn(`Seller ${userId} not onboarded to Stripe Connect. Payout delayed.`);

        await db.insert(notifications).values({
          userId,
          type: 'payout',
          title: 'Payout Pending - Action Required',
          message: `You have a pending payout of $${amount.toFixed(2)}, but you need to connect your bank account first to receive payments.`,
          metadata: {
            amount,
            orderId,
            action: 'connect_bank_account',
          },
        });

        return {
          success: false,
          error: 'Seller must complete Stripe Connect onboarding',
        };
      }

      // Calculate platform fee and seller amount
      const platformFee = amount * (platformFeePercentage / 100);
      const sellerAmount = amount - platformFee;

      // Create payout record in database (pending)
      // Note: Only storing fields that exist in schema (no metadata column)
      const [payoutRecord] = await db
        .insert(instantPayouts)
        .values({
          userId,
          amountCents: Math.round(sellerAmount * 100),
          currency,
          status: 'pending',
        })
        .returning();
      
      // Log metadata for audit purposes
      logger.info('Payout record created', { payoutId: payoutRecord.id, orderId, platformFee, platformFeePercentage });

      try {
        // Create TRANSFER from platform to seller's connected account
        const transfer = await stripe.transfers.create({
          amount: Math.round(sellerAmount * 100), // Convert to cents
          currency,
          destination: accountVerification.accountId!,
          description: `Marketplace sale payout - Order #${orderId}`,
          metadata: {
            userId,
            payoutId: payoutRecord.id,
            orderId,
            platformFee: platformFee.toFixed(2),
          },
        });

        // Update payout record with Stripe transfer ID
        await db
          .update(instantPayouts)
          .set({
            stripePayoutId: transfer.id,
            status: 'in_transit',
          })
          .where(eq(instantPayouts.id, payoutRecord.id));
        
        // Log transfer details for audit purposes
        logger.info('Payout transfer initiated', { payoutId: payoutRecord.id, transferId: transfer.id, orderId });

        // Log payout for audit (balance is calculated dynamically from orders/payouts tables)
        logger.info('Seller payout completed - balance calculated dynamically', {
          userId,
          sellerAmount,
          orderId,
          payoutId: payoutRecord.id,
          operation: 'increment_total_payouts',
        });

        // Send success notification
        await db.insert(notifications).values({
          userId,
          type: 'payout',
          title: 'Payout Sent!',
          message: `Your payout of $${sellerAmount.toFixed(2)} has been sent to your bank account and will arrive within 1-2 business days.`,
          metadata: {
            payoutId: payoutRecord.id,
            amount: sellerAmount,
            platformFee,
            orderId,
          },
        });

        return {
          success: true,
          payoutId: payoutRecord.id,
          stripePayoutId: transfer.id,
          amount: sellerAmount,
        };
      } catch (stripeError: unknown) {
        const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
        
        // Log failure reason for audit (not stored in DB - column doesn't exist)
        logger.error('Payout transfer failed', { payoutId: payoutRecord.id, orderId, failureReason: errorMessage });
        
        // Update payout record as failed
        await db
          .update(instantPayouts)
          .set({
            status: 'failed',
          })
          .where(eq(instantPayouts.id, payoutRecord.id));

        // Send failure notification
        await db.insert(notifications).values({
          userId,
          type: 'payout',
          title: 'Payout Failed',
          message: `Your payout failed: ${errorMessage}. Please contact support if this continues.`,
          metadata: {
            payoutId: payoutRecord.id,
            error: errorMessage,
            orderId,
          },
        });

        return {
          success: false,
          error: errorMessage || 'Transfer failed',
        };
      }
    } catch (error: unknown) {
      logger.error('Error creating instant transfer:', error);
      return {
        success: false,
        error: error.message || 'Failed to create transfer',
      };
    }
  }

  /**
   * Request manual payout (for accumulated balance withdrawal)
   * Uses Stripe Payouts to pay out FROM connected account TO bank
   * Includes risk assessment and ledger tracking
   */
  async requestInstantPayout(
    userId: string,
    amount: number,
    currency: string = 'usd'
  ): Promise<PayoutResult> {
    try {
      if (!stripe) {
        return {
          success: false,
          error: 'Stripe not configured',
        };
      }

      // Verify Stripe account
      const accountVerification = await this.verifyStripeAccount(userId);
      if (!accountVerification.verified) {
        return {
          success: false,
          error: accountVerification.error || 'Account not verified',
        };
      }

      // Check available balance
      const balance = await this.calculateAvailableBalance(userId);
      if (balance.availableBalance < amount) {
        return {
          success: false,
          error: `Insufficient balance. Available: $${balance.availableBalance.toFixed(2)}`,
        };
      }

      // Perform risk assessment
      const riskAssessment = await this.assessPayoutRisk(userId, amount);
      if (!riskAssessment.approved) {
        logger.warn('Payout blocked by risk assessment', { userId, amount, riskAssessment });
        
        await db.insert(notifications).values({
          userId,
          type: 'payout',
          title: 'Payout Under Review',
          message: `Your payout request of $${amount.toFixed(2)} requires additional review. Our team will process it within 24-48 hours.`,
          metadata: { amount, riskScore: riskAssessment.score, flags: riskAssessment.flags },
        });
        
        return {
          success: false,
          error: 'Payout requires manual review due to risk assessment',
          riskScore: riskAssessment.score,
        };
      }

      // Create payout record in database (pending) with risk data
      const [payoutRecord] = await db
        .insert(instantPayouts)
        .values({
          userId,
          amountCents: Math.round(amount * 100),
          currency,
          status: 'pending',
          riskScore: riskAssessment.score,
          riskFlags: riskAssessment.flags,
          metadata: { requestedAt: new Date().toISOString() },
        })
        .returning();

      // Record ledger entry for the payout
      await this.recordLedgerEntry({
        userId,
        entryType: 'payout',
        amountCents: Math.round(amount * 100),
        currency,
        referenceType: 'payout',
        referenceId: payoutRecord.id,
        description: `Payout withdrawal request`,
      });

      try {
        const payout = await stripe.payouts.create(
          {
            amount: Math.round(amount * 100),
            currency,
            description: `Manual payout withdrawal`,
            metadata: {
              userId,
              payoutId: payoutRecord.id,
            },
          },
          {
            stripeAccount: accountVerification.accountId,
          }
        );

        await db
          .update(instantPayouts)
          .set({
            stripePayoutId: payout.id,
            status: payout.status,
            metadata: { 
              requestedAt: new Date().toISOString(),
              estimatedArrival: payout.arrival_date,
              method: payout.method,
            },
          })
          .where(eq(instantPayouts.id, payoutRecord.id));

        await db.insert(notifications).values({
          userId,
          type: 'payout',
          title: 'Withdrawal Initiated',
          message: `Your withdrawal of $${amount.toFixed(2)} has been initiated and will arrive within minutes.`,
          metadata: {
            payoutId: payoutRecord.id,
            amount,
            estimatedArrival: payout.arrival_date,
          },
        });

        return {
          success: true,
          payoutId: payoutRecord.id,
          stripePayoutId: payout.id,
          amount,
          estimatedArrival: new Date(payout.arrival_date * 1000),
          riskScore: riskAssessment.score,
        };
      } catch (stripeError: unknown) {
        const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
        
        await db
          .update(instantPayouts)
          .set({
            status: 'failed',
            failureReason: errorMessage,
          })
          .where(eq(instantPayouts.id, payoutRecord.id));

        await db.insert(notifications).values({
          userId,
          type: 'payout',
          title: 'Withdrawal Failed',
          message: `Your withdrawal request failed: ${errorMessage}`,
          metadata: { payoutId: payoutRecord.id, error: errorMessage },
        });

        return {
          success: false,
          error: errorMessage || 'Payout failed',
        };
      }
    } catch (error: unknown) {
      logger.error('Error requesting instant payout:', error);
      return {
        success: false,
        error: (error as Error).message || 'Failed to request payout',
      };
    }
  }

  /**
   * Enhanced split payment with tracking and ledger entries
   */
  async createEnhancedSplitPayment(
    orderId: string,
    totalAmount: number,
    splits: Array<{ userId: string; percentage: number; role?: string }>,
    platformFeePercentage: number = 10,
    currency: string = 'usd'
  ): Promise<{ success: boolean; splitPaymentIds?: string[]; transfers?: string[]; errors?: string[] }> {
    try {
      if (!stripe) {
        return { success: false, errors: ['Stripe not configured'] };
      }

      const platformFee = totalAmount * (platformFeePercentage / 100);
      const distributableAmount = totalAmount - platformFee;

      const splitPaymentIds: string[] = [];
      const transfers: string[] = [];
      const errors: string[] = [];

      // Record platform fee in ledger
      await this.recordLedgerEntry({
        userId: 'platform',
        entryType: 'platform_fee',
        amountCents: Math.round(platformFee * 100),
        currency,
        referenceType: 'order',
        referenceId: orderId,
        description: `Platform fee for order ${orderId}`,
      });

      for (const split of splits) {
        const accountVerification = await this.verifyStripeAccount(split.userId);
        const splitAmount = distributableAmount * (split.percentage / 100);
        
        // Create split payment record
        const [splitRecord] = await db
          .insert(splitPayments)
          .values({
            orderId,
            userId: split.userId,
            collaboratorId: split.userId,
            percentage: split.percentage,
            amountCents: Math.round(splitAmount * 100),
            currency,
            status: 'pending',
          })
          .returning();
        
        splitPaymentIds.push(splitRecord.id);

        if (!accountVerification.verified || !accountVerification.accountId) {
          errors.push(`User ${split.userId} not onboarded to Stripe Connect`);
          await db
            .update(splitPayments)
            .set({ status: 'pending_onboarding', failureReason: 'User not onboarded' })
            .where(eq(splitPayments.id, splitRecord.id));
          continue;
        }

        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(splitAmount * 100),
            currency,
            destination: accountVerification.accountId,
            description: `Split payment for Order #${orderId} (${split.role || 'collaborator'})`,
            metadata: {
              orderId,
              userId: split.userId,
              percentage: split.percentage.toString(),
              role: split.role || 'collaborator',
              splitPaymentId: splitRecord.id,
            },
          });

          transfers.push(transfer.id);
          
          await db
            .update(splitPayments)
            .set({ status: 'completed', stripeTransferId: transfer.id, processedAt: new Date() })
            .where(eq(splitPayments.id, splitRecord.id));

          // Record ledger entry
          await this.recordLedgerEntry({
            userId: split.userId,
            entryType: 'split_payment',
            amountCents: Math.round(splitAmount * 100),
            currency,
            referenceType: 'split_payment',
            referenceId: splitRecord.id,
            description: `Split payment from order ${orderId} (${split.percentage}%)`,
            metadata: { orderId, percentage: split.percentage, role: split.role },
          });

          logger.info('Split transfer created:', { orderId, userId: split.userId, amount: splitAmount });
        } catch (transferError: unknown) {
          const errorMsg = (transferError as Error).message;
          errors.push(`Failed to transfer to ${split.userId}: ${errorMsg}`);
          await db
            .update(splitPayments)
            .set({ status: 'failed', failureReason: errorMsg })
            .where(eq(splitPayments.id, splitRecord.id));
        }
      }

      return {
        success: transfers.length > 0,
        splitPaymentIds,
        transfers,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: unknown) {
      logger.error('Error creating enhanced split payment:', error);
      return { success: false, errors: [(error as Error).message || 'Failed to create split payment'] };
    }
  }

  /**
   * Generate payout report for a user within a date range
   */
  async generatePayoutReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalPayouts: number;
    totalAmount: number;
    completedPayouts: number;
    failedPayouts: number;
    pendingPayouts: number;
    payouts: any[];
    summary: {
      byStatus: Record<string, { count: number; amount: number }>;
      byMonth: Record<string, { count: number; amount: number }>;
    };
  }> {
    try {
      const payouts = await db
        .select()
        .from(instantPayouts)
        .where(
          and(
            eq(instantPayouts.userId, userId),
            gte(instantPayouts.createdAt, startDate),
            lte(instantPayouts.createdAt, endDate)
          )
        )
        .orderBy(desc(instantPayouts.createdAt));

      const byStatus: Record<string, { count: number; amount: number }> = {};
      const byMonth: Record<string, { count: number; amount: number }> = {};
      let completedPayouts = 0;
      let failedPayouts = 0;
      let pendingPayouts = 0;
      let totalAmount = 0;

      for (const payout of payouts) {
        const amount = payout.amountCents / 100;
        const status = payout.status || 'unknown';
        const month = new Date(payout.createdAt!).toISOString().slice(0, 7);

        if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 };
        byStatus[status].count++;
        byStatus[status].amount += amount;

        if (!byMonth[month]) byMonth[month] = { count: 0, amount: 0 };
        byMonth[month].count++;
        byMonth[month].amount += amount;

        if (status === 'completed') {
          completedPayouts++;
          totalAmount += amount;
        } else if (status === 'failed') {
          failedPayouts++;
        } else if (status === 'pending' || status === 'in_transit') {
          pendingPayouts++;
        }
      }

      return {
        totalPayouts: payouts.length,
        totalAmount,
        completedPayouts,
        failedPayouts,
        pendingPayouts,
        payouts,
        summary: { byStatus, byMonth },
      };
    } catch (error: unknown) {
      logger.error('Error generating payout report:', error);
      throw new Error('Failed to generate payout report');
    }
  }

  /**
   * Legacy requestInstantPayout - redirects to new implementation
   * This is kept for compatibility but the logic has been moved above
   */
  async requestInstantPayoutLegacy(
    userId: string,
    amount: number,
    currency: string = 'usd'
  ): Promise<PayoutResult> {
    return this.requestInstantPayout(userId, amount, currency);
  }

  /**
   * Get payout history for user
   */
  async getPayoutHistory(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const payouts = await db
        .select()
        .from(instantPayouts)
        .where(eq(instantPayouts.userId, userId))
        .orderBy(desc(instantPayouts.createdAt))
        .limit(limit)
        .offset(offset);

      return payouts;
    } catch (error: unknown) {
      logger.error('Error fetching payout history:', error);
      throw new Error('Failed to fetch payout history');
    }
  }

  /**
   * Get payout status by ID
   */
  async getPayoutStatus(payoutId: string) {
    try {
      const [payout] = await db
        .select()
        .from(instantPayouts)
        .where(eq(instantPayouts.id, payoutId))
        .limit(1);

      if (!payout) {
        throw new Error('Payout not found');
      }

      // If we have a Stripe payout ID and it's still pending, check status with Stripe
      if (payout.stripePayoutId && payout.status === 'pending' && stripe) {
        try {
          const [user] = await db
            .select({ stripeConnectedAccountId: users.stripeConnectedAccountId })
            .from(users)
            .where(eq(users.id, payout.userId))
            .limit(1);

          if (user?.stripeConnectedAccountId) {
            const stripePayout = await stripe.payouts.retrieve(payout.stripePayoutId, {
              stripeAccount: user.stripeConnectedAccountId,
            });

            // Update status if changed
            if (stripePayout.status !== payout.status) {
              // Log failure reason for audit (not stored in DB - column doesn't exist)
              if (stripePayout.failure_message) {
                logger.error('Payout failure from Stripe', { payoutId, failureReason: stripePayout.failure_message });
              }
              
              await db
                .update(instantPayouts)
                .set({
                  status: stripePayout.status,
                  processedAt: stripePayout.status === 'paid' ? new Date() : null,
                })
                .where(eq(instantPayouts.id, payoutId));

              payout.status = stripePayout.status;
              if (stripePayout.status === 'paid') {
                payout.processedAt = new Date();
              }
            }
          }
        } catch (stripeError: unknown) {
          logger.error('Error checking Stripe payout status:', stripeError);
        }
      }

      return payout;
    } catch (error: unknown) {
      logger.error('Error fetching payout status:', error);
      throw new Error('Failed to fetch payout status');
    }
  }

  /**
   * Handle Stripe transfer webhook events (for marketplace payouts)
   */
  async handleTransferWebhook(event: Stripe.Event): Promise<void> {
    try {
      const transfer = event.data.object as Stripe.Transfer;

      // Find payout record by Stripe transfer ID
      const [payoutRecord] = await db
        .select()
        .from(instantPayouts)
        .where(eq(instantPayouts.stripePayoutId, transfer.id))
        .limit(1);

      if (!payoutRecord) {
        logger.info('Payout record not found for transfer webhook:', transfer.id);
        return;
      }

      // Update status based on event type
      let status = payoutRecord.status;
      let processedAt = payoutRecord.processedAt;
      let failureReason: string | null = null;

      switch (event.type) {
        case 'transfer.created':
          status = 'in_transit';
          logger.info('Transfer created:', transfer.id);
          break;

        case 'transfer.paid':
          status = 'completed';
          processedAt = new Date();

          // Send success notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: 'payout',
            title: 'Money Received!',
            message: `Your payout of $${(payoutRecord.amountCents / 100).toFixed(2)} has been successfully transferred to your bank account.`,
            metadata: {
              payoutId: payoutRecord.id,
              amount: payoutRecord.amountCents / 100,
              transferId: transfer.id,
            },
          });
          break;

        case 'transfer.failed':
          status = 'failed';
          failureReason = transfer.failure_message || 'Transfer failed';

          // Log transfer failure for audit (balance is calculated dynamically from orders/payouts tables)
          logger.info('Transfer failed - balance calculated dynamically', {
            userId: payoutRecord.userId,
            amount: payoutRecord.amountCents / 100,
            payoutId: payoutRecord.id,
            transferId: transfer.id,
            operation: 'transfer_failed_balance_restored',
          });

          // Send failure notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: 'payout',
            title: 'Payout Failed',
            message: `Your payout of $${(payoutRecord.amountCents / 100).toFixed(2)} failed: ${failureReason}. The amount has been returned to your available balance. Please ensure your bank account is verified.`,
            metadata: {
              payoutId: payoutRecord.id,
              error: failureReason,
              transferId: transfer.id,
            },
          });
          break;

        case 'transfer.reversed':
          status = 'refunded';

          // Log transfer reversal for audit (balance is calculated dynamically from orders/payouts tables)
          logger.info('Transfer reversed - balance calculated dynamically', {
            userId: payoutRecord.userId,
            amount: payoutRecord.amountCents / 100,
            payoutId: payoutRecord.id,
            transferId: transfer.id,
            operation: 'transfer_reversed_balance_restored',
          });

          // Send notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: 'payout',
            title: 'Payout Reversed',
            message: `Your payout of $${(payoutRecord.amountCents / 100).toFixed(2)} was reversed and the funds have been returned to your available balance.`,
            metadata: {
              payoutId: payoutRecord.id,
              transferId: transfer.id,
            },
          });
          break;
      }

      // Log failure reason for audit (not stored in DB - column doesn't exist)
      if (failureReason) {
        logger.error('Transfer webhook failure', { payoutId: payoutRecord.id, transferId: transfer.id, failureReason });
      }
      
      // Update payout record
      await db
        .update(instantPayouts)
        .set({
          status,
          processedAt,
        })
        .where(eq(instantPayouts.id, payoutRecord.id));
    } catch (error: unknown) {
      logger.error('Error handling transfer webhook:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe account webhook events (for Connect onboarding status)
   */
  async handleAccountWebhook(event: Stripe.Event): Promise<void> {
    try {
      const account = event.data.object as Stripe.Account;

      // Find user by Stripe Connected Account ID
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeConnectedAccountId, account.id))
        .limit(1);

      if (!user) {
        logger.info('User not found for account webhook:', account.id);
        return;
      }

      switch (event.type) {
        case 'account.updated':
          // Check if account is now verified and can receive payouts
          const canReceivePayouts = account.payouts_enabled && account.charges_enabled;

          if (canReceivePayouts && account.details_submitted) {
            // Send success notification
            await db.insert(notifications).values({
              userId: user.id,
              type: 'account',
              title: 'Bank Account Connected!',
              message: `Your bank account has been successfully connected. You can now receive instant payouts when you sell beats.`,
              metadata: {
                accountId: account.id,
                payoutsEnabled: account.payouts_enabled,
                chargesEnabled: account.charges_enabled,
              },
            });
          } else if (!account.details_submitted) {
            // Remind user to complete onboarding
            await db.insert(notifications).values({
              userId: user.id,
              type: 'account',
              title: 'Complete Bank Account Setup',
              message: `Please complete your bank account setup to receive payouts from your sales.`,
              metadata: {
                accountId: account.id,
                action: 'complete_onboarding',
              },
            });
          }
          break;

        case 'account.application.deauthorized':
          // User has disconnected their account
          await db
            .update(users)
            .set({
              stripeConnectedAccountId: null,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          await db.insert(notifications).values({
            userId: user.id,
            type: 'account',
            title: 'Bank Account Disconnected',
            message: `Your bank account has been disconnected. You will not be able to receive payouts until you reconnect it.`,
            metadata: {
              accountId: account.id,
            },
          });
          break;
      }
    } catch (error: unknown) {
      logger.error('Error handling account webhook:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe payout webhook events (for manual withdrawals)
   */
  async handlePayoutWebhook(event: Stripe.Event): Promise<void> {
    try {
      const payout = event.data.object as Stripe.Payout;

      // Find payout record by Stripe payout ID
      const [payoutRecord] = await db
        .select()
        .from(instantPayouts)
        .where(eq(instantPayouts.stripePayoutId, payout.id))
        .limit(1);

      if (!payoutRecord) {
        logger.info('Payout record not found for webhook:', payout.id);
        return;
      }

      // Update status based on event type
      let status = payoutRecord.status;
      let processedAt = payoutRecord.processedAt;
      let failureReason: string | null = null;

      switch (event.type) {
        case 'payout.paid':
          status = 'completed';
          processedAt = new Date();

          // Send success notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: 'payout',
            title: 'Withdrawal Completed',
            message: `Your withdrawal of $${(payoutRecord.amountCents / 100).toFixed(2)} has been completed and is on its way to your bank account.`,
            metadata: {
              payoutId: payoutRecord.id,
              amount: payoutRecord.amountCents / 100,
            },
          });
          break;

        case 'payout.failed':
          status = 'failed';
          failureReason = payout.failure_message || 'Unknown error';

          // Log payout failure for audit (balance is calculated dynamically from orders/payouts tables)
          logger.info('Payout failed - balance calculated dynamically', {
            userId: payoutRecord.userId,
            amount: payoutRecord.amountCents / 100,
            payoutId: payoutRecord.id,
            stripePayoutId: payout.id,
            failureReason,
            operation: 'payout_failed_balance_restored',
          });

          // Send failure notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: 'payout',
            title: 'Withdrawal Failed',
            message: `Your withdrawal failed: ${failureReason}. The amount has been returned to your available balance.`,
            metadata: {
              payoutId: payoutRecord.id,
              error: failureReason,
            },
          });
          break;

        case 'payout.canceled':
          status = 'cancelled';

          // Log payout cancellation for audit (balance is calculated dynamically from orders/payouts tables)
          logger.info('Payout canceled - balance calculated dynamically', {
            userId: payoutRecord.userId,
            amount: payoutRecord.amountCents / 100,
            payoutId: payoutRecord.id,
            stripePayoutId: payout.id,
            operation: 'payout_canceled_balance_restored',
          });
          break;
      }

      // Log failure reason for audit (not stored in DB - column doesn't exist)
      if (failureReason) {
        logger.error('Payout webhook failure', { payoutId: payoutRecord.id, stripePayoutId: payout.id, failureReason });
      }
      
      // Update payout record
      await db
        .update(instantPayouts)
        .set({
          status,
          processedAt,
        })
        .where(eq(instantPayouts.id, payoutRecord.id));
    } catch (error: unknown) {
      logger.error('Error handling payout webhook:', error);
      throw error;
    }
  }

  /**
   * Create a destination charge - payment goes directly to seller with platform fee
   * This is an alternative to separate transfers, collecting payment and paying seller in one step
   */
  async createDestinationCharge(
    sellerId: string,
    amount: number,
    orderId: string,
    platformFeePercentage: number = 10,
    currency: string = 'usd'
  ): Promise<{ success: boolean; paymentIntentId?: string; error?: string }> {
    try {
      if (!stripe) {
        return { success: false, error: 'Stripe not configured' };
      }

      const accountVerification = await this.verifyStripeAccount(sellerId);
      if (!accountVerification.verified || !accountVerification.accountId) {
        return { success: false, error: 'Seller must complete Stripe Connect onboarding' };
      }

      const platformFee = Math.round(amount * 100 * (platformFeePercentage / 100));

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        application_fee_amount: platformFee,
        transfer_data: {
          destination: accountVerification.accountId,
        },
        metadata: {
          orderId,
          sellerId,
          platformFeePercentage: platformFeePercentage.toString(),
        },
      });

      logger.info('Destination charge created:', { orderId, sellerId, amount, platformFee });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error: unknown) {
      logger.error('Error creating destination charge:', error);
      return { success: false, error: error.message || 'Failed to create destination charge' };
    }
  }

  /**
   * Create split payment to multiple collaborators
   * Distributes payment among multiple sellers with different percentages
   */
  async createSplitPayment(
    orderId: string,
    totalAmount: number,
    splits: Array<{ userId: string; percentage: number }>,
    platformFeePercentage: number = 10,
    currency: string = 'usd'
  ): Promise<{ success: boolean; transfers?: string[]; errors?: string[] }> {
    try {
      if (!stripe) {
        return { success: false, errors: ['Stripe not configured'] };
      }

      const platformFee = totalAmount * (platformFeePercentage / 100);
      const distributableAmount = totalAmount - platformFee;

      const transfers: string[] = [];
      const errors: string[] = [];

      for (const split of splits) {
        const accountVerification = await this.verifyStripeAccount(split.userId);
        
        if (!accountVerification.verified || !accountVerification.accountId) {
          errors.push(`User ${split.userId} not onboarded to Stripe Connect`);
          continue;
        }

        const splitAmount = distributableAmount * (split.percentage / 100);

        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(splitAmount * 100),
            currency,
            destination: accountVerification.accountId,
            description: `Split payment for Order #${orderId}`,
            metadata: {
              orderId,
              userId: split.userId,
              percentage: split.percentage.toString(),
              type: 'split_payment',
            },
          });

          transfers.push(transfer.id);
          logger.info('Split transfer created:', { orderId, userId: split.userId, amount: splitAmount });
        } catch (transferError: unknown) {
          errors.push(`Failed to transfer to ${split.userId}: ${transferError.message}`);
        }
      }

      return {
        success: transfers.length > 0,
        transfers,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: unknown) {
      logger.error('Error creating split payment:', error);
      return { success: false, errors: [error.message || 'Failed to create split payment'] };
    }
  }

  /**
   * Get Stripe Express Dashboard link for seller to view their account
   */
  async getExpressDashboardLink(userId: string): Promise<{ url?: string; error?: string }> {
    try {
      if (!stripe) {
        return { error: 'Stripe not configured' };
      }

      const accountVerification = await this.verifyStripeAccount(userId);
      if (!accountVerification.verified || !accountVerification.accountId) {
        return { error: 'No verified Stripe account found' };
      }

      const loginLink = await stripe.accounts.createLoginLink(accountVerification.accountId);
      
      return { url: loginLink.url };
    } catch (error: unknown) {
      logger.error('Error creating dashboard link:', error);
      return { error: error.message || 'Failed to create dashboard link' };
    }
  }

  /**
   * Get seller earnings summary
   */
  async getEarningsSummary(userId: string): Promise<{
    totalEarnings: number;
    thisMonthEarnings: number;
    pendingPayouts: number;
    availableBalance: number;
    totalSales: number;
    averageOrderValue: number;
  }> {
    try {
      const balance = await this.calculateAvailableBalance(userId);
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthlyEarningsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount), 0) as monthly_earnings, COUNT(*) as monthly_sales
            FROM orders 
            WHERE seller_id = ${userId} AND status = 'completed'
            AND created_at >= ${startOfMonth.toISOString()}`
      );
      
      const thisMonthEarnings = Number(monthlyEarningsResult.rows?.[0]?.monthly_earnings || 0);
      const monthlyCount = Number(monthlyEarningsResult.rows?.[0]?.monthly_sales || 0);

      const totalSalesResult = await db.execute(
        sql`SELECT COUNT(*) as total_sales FROM orders 
            WHERE seller_id = ${userId} AND status = 'completed'`
      );
      const totalSales = Number(totalSalesResult.rows?.[0]?.total_sales || 0);

      return {
        totalEarnings: balance.totalEarnings,
        thisMonthEarnings,
        pendingPayouts: balance.pendingBalance,
        availableBalance: balance.availableBalance,
        totalSales,
        averageOrderValue: totalSales > 0 ? balance.totalEarnings / totalSales : 0,
      };
    } catch (error: unknown) {
      logger.error('Error getting earnings summary:', error);
      throw new Error('Failed to get earnings summary');
    }
  }
}

export const instantPayoutService = new InstantPayoutService();

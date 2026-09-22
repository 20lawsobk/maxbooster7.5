// @ts-nocheck
import Stripe from "stripe";
import { db } from "../db";
import { users, instantPayouts, notifications, ledgerEntries, splitPayments } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "../logger.js";
import { auditConfirmed } from "../safety/auditLogger";
import { commerceRepository, commerceEngine } from "./commerce/runtime";
import { requestCommercePayout, payOrderBeneficiaries } from "./commerce/payouts";
import { legacyReconciliation, withdrawalView, commercePayoutReport } from "./commerce/readModels";

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY?.startsWith("sk_")
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    })
  : null;

export interface PayoutBalance {
  reconciliation?: Awaited<ReturnType<typeof legacyReconciliation>>;
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
  currency: string;
}

export interface PayoutResult {
  success: boolean;
  state?: string;
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
  entryType:
    | "credit"
    | "debit"
    | "payout"
    | "refund"
    | "split_payment"
    | "platform_fee";
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
      const currentBalance = await this.calculateAvailableBalance(data?.userId);
      const balanceAfterCents =
        Math.round(currentBalance?.availableBalance * 100) +
        (data?.entryType === "credit" ? data?.amountCents : -data?.amountCents);

      const [entry] = await db
        .insert(ledgerEntries)
        .values({
          userId: data.userId,
          entryType: data.entryType,
          amountCents: data.amountCents,
          currency: data.currency || "usd",
          balanceAfterCents,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          description: data.description,
          metadata: data.metadata,
        })
        .returning();

      logger.info({
        entryId: entry.id,
        userId: data.userId,
        type: data.entryType,
        amountCents: data.amountCents,
      }, "Ledger entry recorded");

      return entry?.id;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error recording ledger entry:");
      throw new Error("Failed to record ledger entry");
    }
  }

  /**
   * Get ledger history for a user
   */
  async getLedgerHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
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
      logger.warn({ err: error }, "Error fetching ledger history:");
      throw new Error("Failed to fetch ledger history");
    }
  }

  /**
   * Perform risk assessment before payout
   */
  async assessPayoutRisk(
    userId: string,
    amount: number,
  ): Promise<RiskAssessment> {
    const flags: string[] = [];
    let score = 0;

    try {
      const now = new Date();
      const last24Hours = new Date(now?.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now?.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now?.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Check payout velocity (last 24 hours)
      const recentPayoutsResult = await db.execute(
        sql`SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total
            FROM instant_payouts 
            WHERE user_id = ${userId} 
            AND created_at >= ${last24Hours?.toISOString()}
            AND status IN ('pending', 'completed', 'in_transit')`,
      );
      const recentCount = Number(recentPayoutsResult?.rows?.[0]?.count || 0);
      const recentTotal =
        Number(recentPayoutsResult?.rows?.[0]?.total || 0) / 100;

      if (recentCount >= 3) {
        flags?.push("HIGH_VELOCITY_24H");
        score += 25;
      }
      if (recentTotal > 5000) {
        flags?.push("HIGH_VOLUME_24H");
        score += 20;
      }

      // Check weekly payout patterns
      const weeklyPayoutsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount_cents), 0) as total
            FROM instant_payouts 
            WHERE user_id = ${userId} 
            AND created_at >= ${last7Days?.toISOString()}
            AND status = 'completed'`,
      );
      const weeklyTotal =
        Number(weeklyPayoutsResult?.rows?.[0]?.total || 0) / 100;
      if (weeklyTotal > 10000) {
        flags?.push("HIGH_VOLUME_7D");
        score += 15;
      }

      // Check account age
      const [user] = await db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user?.createdAt) {
        const accountAgeDays =
          (now?.getTime() - new Date(user?.createdAt).getTime()) /
          (24 * 60 * 60 * 1000);
        if (accountAgeDays < 7) {
          flags?.push("NEW_ACCOUNT");
          score += 30;
        } else if (accountAgeDays < 30) {
          flags?.push("YOUNG_ACCOUNT");
          score += 10;
        }
      }

      // Check for large single payout
      const balance = await this.calculateAvailableBalance(userId);
      if (amount > balance?.availableBalance * 0.9) {
        flags?.push("NEAR_FULL_WITHDRAWAL");
        score += 15;
      }
      if (amount > 2000) {
        flags?.push("LARGE_PAYOUT");
        score += 10;
      }

      // Check for recent refunds
      const recentRefundsResult = await db.execute(
        sql`SELECT COUNT(*) as count
            FROM refunds 
            WHERE seller_id = ${userId} 
            AND created_at >= ${last30Days?.toISOString()}`,
      );
      const refundCount = Number(recentRefundsResult?.rows?.[0]?.count || 0);
      if (refundCount > 3) {
        flags?.push("HIGH_REFUND_RATE");
        score += 25;
      }

      // Determine approval
      const approved = score < 60;
      let reason: string | undefined;

      if (!approved) {
        reason = `Risk score ${score} exceeds threshold. Flags: ${flags?.join(", ")}`;
        logger.warn({
          userId,
          amount,
          score,
          flags,
        }, "Payout risk check failed");
      }

      return { score, flags, approved, reason };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error assessing payout risk:");
      return { score: 100, flags: ["ASSESSMENT_ERROR"], approved: false, reason:"Payout risk assessment is unavailable" };
    }
  }

  /**
   * Calculate user's available balance from completed marketplace orders
   */
  async calculateAvailableBalance(userId: string): Promise<PayoutBalance> {
    const balance=await commerceRepository.balance(userId,"usd");
    return {availableBalance:Math.max(0,balance.available)/100,pendingBalance:balance.reserved/100,
      totalEarnings:(balance.available+balance.reserved+balance.paid)/100,currency:"usd",
      reconciliation:await legacyReconciliation(userId)};
  }

  /**
   * Update user's available balance based on new sales
   * Note: Balance is calculated dynamically from orders and payouts tables
   * This method is kept for API compatibility but is a no-op
   */
  async updateAvailableBalance(userId: string, amount: number): Promise<void> {
    // Balance is calculated dynamically from orders and payouts tables
    // No need to update a column - this is intentionally a no-op
    logger.info({
      userId,
      amount,
    }, "Balance update requested for user - calculated dynamically");
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
          error: "Stripe not configured",
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
          error: "No Stripe account connected",
        };
      }

      // Verify account with Stripe
      const account = await stripe.accounts.retrieve(
        user.stripeConnectedAccountId,
      );

      // Check if account is verified and can receive payouts
      const canReceivePayouts =
        account.payouts_enabled && account.charges_enabled;

      if (!canReceivePayouts) {
        return {
          verified: false,
          accountId: user.stripeConnectedAccountId,
          requiresOnboarding: !account.details_submitted,
          error: "Account verification incomplete",
        };
      }

      return {
        verified: true,
        accountId: user.stripeConnectedAccountId,
        requiresOnboarding: false,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error verifying Stripe account:");
      return {
        verified: false,
        error: (error as Error).message || "Failed to verify Stripe account",
      };
    }
  }

  /**
   * Create Stripe Connect Express account link for onboarding
   */
  async createAccountLink(
    userId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      if (!stripe) {
        throw new Error("Stripe not configured");
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
        throw new Error("User not found");
      }

      let accountId = user.stripeConnectedAccountId;

      // Create account if it doesn't exist
      if (!accountId) {
        const account = await stripe?.accounts.create({
          type: "express",
          email: user.email,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          settings: {
            payouts: {
              schedule: {
                interval: "manual", // Allow instant payouts
              },
            },
          },
        });

        accountId = account?.id;

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
      const accountLink = await stripe?.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return accountLink?.url;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating account link:");
      throw new Error((error as any)?.message || "Failed to create account link");
    }
  }

  /**
   * Create instant transfer to seller's connected account (for marketplace sales)
   * This is the CORRECT method for marketplace payouts - transfers FROM platform TO seller
   */
  async createInstantTransfer(userId:string,_amount:number,orderId:string,_platformFeePercentage=10,_currency="usd"):Promise<PayoutResult> {
    const result=await payOrderBeneficiaries(orderId,userId);
    return {success:result.success,payoutId:result.splitPaymentIds[0],error:result.errors.join("; ")||undefined};
  }

  /**
   * Request manual payout (for accumulated balance withdrawal)
   * Uses Stripe Payouts to pay out FROM connected account TO bank
   * Includes risk assessment and ledger tracking
   */
  async requestInstantPayout(
    userId: string,
    amount: number,
    currency: string = "usd",
    idempotencyKey?: string,
  ): Promise<PayoutResult> {
    try { return await requestCommercePayout(userId,amount,currency,idempotencyKey); }
    catch(error) { return {success:false,error:error instanceof Error?error.message:String(error)}; }
  }

  /**
   * Enhanced split payment with tracking and ledger entries
   */
  async createEnhancedSplitPayment(orderId:string,_totalAmount:number,_splits:unknown[],_platformFeePercentage=10,_currency="usd",actorId?:string) {
    if(!actorId) throw new Error("Authenticated sale owner is required");
    return payOrderBeneficiaries(orderId,actorId);
  }

  /**
   * Generate payout report for a user within a date range
   */
  async generatePayoutReport(
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return commercePayoutReport(userId,startDate,endDate);
  }

  /**
   * Retry a previously failed payout by re-initiating it with the same amount.
   */
  async retryFailedPayout(
    userId: string,
    payoutId: string,
  ): Promise<PayoutResult> {
    const op=await commerceRepository.get(payoutId);
    if(!op || op.user_id!==userId) return {success:false,error:"Payout not found"};
    await commerceEngine().execute(op.id);
    const current=await commerceRepository.get(op.id);
    return {success:true,payoutId:op.id,stripePayoutId:current?.provider_id,amount:op.amount_cents/100};
  }

  /**
   * Get payout history for user
   */
  async getPayoutHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    return (await commerceRepository.history(userId,limit,offset)).map(withdrawalView);
  }

  /**
   * Get payout status by ID
   */
  async getPayoutStatus(payoutId: string) {
    const op=await commerceRepository.get(payoutId);
    if(!op) throw new Error("Payout not found");
    if(op.kind!=="withdrawal") throw new Error("Payout not found");
    return withdrawalView(op);
  }

  /**
   * Handle Stripe transfer webhook events (for marketplace payouts)
   */
  async handleTransferWebhook(event: Stripe.Event): Promise<void> {
    try {
      const transfer = event.data.object as Stripe.Transfer;
      const metadata = ((transfer as any)?.metadata || {}) as Record<
        string,
        string | undefined
      >;
      const metadataPayoutId = metadata.payoutId;
      const metadataSplitPaymentId = metadata.splitPaymentId;

      // Three distinct code paths create Stripe transfers on this platform's
      // Connect account, each tagging metadata differently:
      //   - requestInstantPayout()       -> metadata.payoutId
      //   - createEnhancedSplitPayment() -> metadata.splitPaymentId
      //   - createSplitPayment() (legacy)-> metadata.type="split_payment", no id, no local row at all
      // Both id-carrying paths stamp their metadata BEFORE calling
      // stripe.transfers.create(), so an id-based lookup has no
      // create-vs-webhook race window; the matching stripe*Id column is only
      // a fallback for older records.
      let payoutRecord: any;
      if (metadataPayoutId) {
        [payoutRecord] = await db
          .select()
          .from(instantPayouts)
          .where(eq(instantPayouts.id, metadataPayoutId))
          .limit(1);
      }
      if (!payoutRecord && !metadataSplitPaymentId) {
        [payoutRecord] = await db
          .select()
          .from(instantPayouts)
          .where(eq(instantPayouts.stripePayoutId, transfer.id))
          .limit(1);
      }
      if (payoutRecord) {
        await this.reconcileInstantPayoutTransfer(event, transfer, payoutRecord);
        return;
      }

      let splitRecord: any;
      if (metadataSplitPaymentId) {
        [splitRecord] = await db
          .select()
          .from(splitPayments)
          .where(eq(splitPayments.id, metadataSplitPaymentId))
          .limit(1);
      }
      if (!splitRecord && !metadataPayoutId) {
        [splitRecord] = await db
          .select()
          .from(splitPayments)
          .where(eq(splitPayments.stripeTransferId, transfer.id))
          .limit(1);
      }
      if (splitRecord) {
        await this.reconcileSplitPaymentTransfer(event, transfer, splitRecord);
        return;
      }

      if (metadataPayoutId || metadataSplitPaymentId) {
        // Metadata explicitly named a local record that both the id- and
        // Stripe-id-based lookups failed to find — a genuine reconciliation
        // gap, not a legitimate no-op.
        throw new Error(
          `No local record found for Stripe transfer ${transfer.id} (metadata.payoutId=${metadataPayoutId || "none"}, metadata.splitPaymentId=${metadataSplitPaymentId || "none"})`,
        );
      }

      // No id metadata at all: this is the legacy createSplitPayment() path
      // (metadata.type="split_payment", no id) or any other transfer our
      // code creates without a trackable local row. There is no record to
      // reconcile by design, so this is a legitimate no-op — but it must
      // still leave a persisted, auditable trace rather than silently doing
      // nothing. No other table gets a write on this branch, so the audit
      // row IS the entire record that this event was ever handled: use
      // auditConfirmed (not audit) so we don't report success to Stripe
      // until that row is actually confirmed durable.
      await auditConfirmed({
        category: "payment",
        severity: "info",
        action: "stripe_transfer_untracked_reconciled",
        targetId: transfer.id,
        targetType: "stripe_transfer",
        details: {
          eventType: event.type,
          amountCents: transfer.amount,
          currency: transfer.currency,
          destination:
            typeof transfer.destination === "string"
              ? transfer.destination
              : (transfer.destination as any)?.id,
          metadata: transfer.metadata,
        },
        success: true,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error handling transfer webhook:");
      throw error;
    }
  }

  /**
   * Reconcile a Stripe transfer webhook against its instantPayouts record.
   * Throws if the confirming update matches zero rows.
   */
  private async reconcileInstantPayoutTransfer(
    event: Stripe.Event,
    transfer: Stripe.Transfer,
    payoutRecord: any,
  ): Promise<void> {
    // Update status based on event type
    let status = payoutRecord.status;
    let processedAt = payoutRecord.processedAt;
    let failureReason: string | null = null;

    switch (event.type) {
      case "transfer.created":
        status = "in_transit";
        logger.info({ value: transfer.id }, "Transfer created:");
        break;

      case "transfer.paid":
        status = "completed";
        processedAt = new Date();

        // Send success notification
        await db.insert(notifications).values({
          userId: payoutRecord.userId,
          type: "payout",
          title: "Money Received!",
          message: `Your payout of $${(payoutRecord.amountCents / 100).toFixed(2)} has been successfully transferred to your bank account.`,
          metadata: {
            payoutId: payoutRecord.id,
            amount: payoutRecord.amountCents / 100,
            transferId: transfer.id,
          },
        });
        break;

      case "transfer.failed":
        status = "failed";
        failureReason = (transfer as any).failure_message || "Transfer failed";

        // Log transfer failure for audit (balance is calculated dynamically from orders/payouts tables)
        logger.info({
          userId: payoutRecord.userId,
          amount: payoutRecord.amountCents / 100,
          payoutId: payoutRecord.id,
          transferId: transfer.id,
          operation: "transfer_failed_balance_restored",
        }, "Transfer failed - balance calculated dynamically");

        // Send failure notification
        await db.insert(notifications).values({
          userId: payoutRecord.userId,
          type: "payout",
          title: "Payout Failed",
          message: `Your payout of $${(payoutRecord.amountCents / 100).toFixed(2)} failed: ${failureReason}. The amount has been returned to your available balance. Please ensure your bank account is verified.`,
          metadata: {
            payoutId: payoutRecord.id,
            error: failureReason,
            transferId: transfer.id,
          },
        });
        break;

      case "transfer.reversed":
        status = "refunded";

        // Log transfer reversal for audit (balance is calculated dynamically from orders/payouts tables)
        logger.info({
          userId: payoutRecord.userId,
          amount: payoutRecord.amountCents / 100,
          payoutId: payoutRecord.id,
          transferId: transfer.id,
          operation: "transfer_reversed_balance_restored",
        }, "Transfer reversed - balance calculated dynamically");

        // Send notification
        await db.insert(notifications).values({
          userId: payoutRecord.userId,
          type: "payout",
          title: "Payout Reversed",
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
      logger.warn({
        payoutId: payoutRecord.id,
        transferId: transfer.id,
        failureReason,
      }, "Transfer webhook failure");
    }

    // Update payout record — confirm the write actually matched a row
    // instead of assuming success just because nothing threw.
    const updatedTransferPayout = await db
      .update(instantPayouts)
      .set({
        status,
        processedAt,
      })
      .where(eq(instantPayouts.id, payoutRecord?.id))
      .returning({ id: instantPayouts.id });

    if (updatedTransferPayout.length === 0) {
      throw new Error(
        `Transfer webhook update matched no rows for payout ${payoutRecord.id} (transfer ${transfer.id})`,
      );
    }
  }

  /**
   * Reconcile a Stripe transfer webhook against its splitPayments record
   * (createEnhancedSplitPayment). Throws if the confirming update matches
   * zero rows.
   */
  private async reconcileSplitPaymentTransfer(
    event: Stripe.Event,
    transfer: Stripe.Transfer,
    splitRecord: any,
  ): Promise<void> {
    let status = splitRecord.status;
    let processedAt = splitRecord.processedAt;
    let failureReason: string | null = splitRecord.failureReason ?? null;

    switch (event.type) {
      case "transfer.created":
        // createEnhancedSplitPayment() already marks the row "completed"
        // synchronously once stripe.transfers.create() resolves, so this is
        // a confirming re-affirmation rather than a state transition —
        // unless a later event already moved it to a terminal failure/refund
        // state, which must not be clobbered.
        if (status !== "failed" && status !== "refunded") {
          status = "completed";
        }
        if (!processedAt) {
          processedAt = new Date();
        }
        logger.info({ value: transfer.id }, "Split payment transfer created:");
        break;

      case "transfer.paid":
        status = "completed";
        processedAt = new Date();
        break;

      case "transfer.failed":
        status = "failed";
        failureReason = (transfer as any).failure_message || "Transfer failed";

        await db.insert(notifications).values({
          userId: splitRecord.collaboratorId || splitRecord.userId,
          type: "payout",
          title: "Split Payment Failed",
          message: `Your split payment of $${(splitRecord.amountCents / 100).toFixed(2)} failed: ${failureReason}.`,
          metadata: {
            splitPaymentId: splitRecord.id,
            orderId: splitRecord.orderId,
            error: failureReason,
            transferId: transfer.id,
          },
        });
        break;

      case "transfer.reversed":
        status = "refunded";

        await db.insert(notifications).values({
          userId: splitRecord.collaboratorId || splitRecord.userId,
          type: "payout",
          title: "Split Payment Reversed",
          message: `Your split payment of $${(splitRecord.amountCents / 100).toFixed(2)} was reversed.`,
          metadata: {
            splitPaymentId: splitRecord.id,
            orderId: splitRecord.orderId,
            transferId: transfer.id,
          },
        });
        break;
    }

    if (failureReason && event.type === "transfer.failed") {
      logger.warn({
        splitPaymentId: splitRecord.id,
        transferId: transfer.id,
        failureReason,
      }, "Split payment transfer webhook failure");
    }

    const updatedSplit = await db
      .update(splitPayments)
      .set({
        status,
        processedAt,
        ...(failureReason ? { failureReason } : {}),
      })
      .where(eq(splitPayments.id, splitRecord.id))
      .returning({ id: splitPayments.id });

    if (updatedSplit.length === 0) {
      throw new Error(
        `Split payment transfer webhook update matched no rows for split payment ${splitRecord.id} (transfer ${transfer.id})`,
      );
    }
  }

  /**
   * Handle Stripe account webhook events (for Connect onboarding status)
   */
  async handleAccountWebhook(event: Stripe.Event): Promise<void> {
    try {
      const account = event?.data.object as Stripe.Account;

      // Find user by Stripe Connected Account ID
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeConnectedAccountId, account?.id))
        .limit(1);

      if (!user) {
        // createAccountLink() writes stripeConnectedAccountId right after
        // stripe.accounts.create() returns, so a webhook for an account with
        // no matching user is a reconciliation gap (the write may not have
        // landed yet, or the account was disconnected mid-flight) — throw so
        // the route reports failure and Stripe retries instead of the event
        // being silently dropped.
        throw new Error(
          `No user found for Stripe Connect account ${account?.id} on ${event?.type}`,
        );
      }

      switch (event?.type) {
        case "account.updated": {
          // Check if account is now verified and can receive payouts
          const canReceivePayouts =
            account?.payouts_enabled && account?.charges_enabled;

          if (canReceivePayouts && account?.details_submitted) {
            // Send success notification
            await db.insert(notifications).values({
              userId: user.id,
              type: "account",
              title: "Bank Account Connected!",
              message: `Your bank account has been successfully connected. You can now receive instant payouts when you sell beats.`,
              metadata: {
                accountId: account.id,
                payoutsEnabled: account.payouts_enabled,
                chargesEnabled: account.charges_enabled,
              },
            });
          } else if (!account?.details_submitted) {
            // Remind user to complete onboarding
            await db.insert(notifications).values({
              userId: user.id,
              type: "account",
              title: "Complete Bank Account Setup",
              message: `Please complete your bank account setup to receive payouts from your sales.`,
              metadata: {
                accountId: account.id,
                action: "complete_onboarding",
              },
            });
          } else {
            // details_submitted but payouts/charges aren't both enabled yet
            // (e.g. pending Stripe review). No user-facing notification is
            // warranted for every intermediate ping, but the event must
            // still leave a persisted reconciliation record rather than
            // silently reporting success with no write of any kind. As with
            // the untracked-transfer branch above, this audit row is the
            // only record of this event, so it must be confirmed durable
            // before we report success — use auditConfirmed, not audit.
            await auditConfirmed({
              category: "payment",
              severity: "info",
              action: "stripe_connect_account_pending_capabilities",
              userId: user.id,
              targetId: account.id,
              targetType: "stripe_connect_account",
              details: {
                payoutsEnabled: !!account?.payouts_enabled,
                chargesEnabled: !!account?.charges_enabled,
                detailsSubmitted: !!account?.details_submitted,
              },
              success: true,
            });
          }
          break;
        }

        case "account.application.deauthorized": {
          // User has disconnected their account — confirm the update
          // actually matched a row instead of assuming success just because
          // nothing threw.
          const deauthorized = await db
            .update(users)
            .set({
              stripeConnectedAccountId: null,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user?.id))
            .returning({ id: users.id });

          if (deauthorized.length === 0) {
            throw new Error(
              `Deauthorize update matched no rows for user ${user.id} (account ${account?.id})`,
            );
          }

          await db.insert(notifications).values({
            userId: user.id,
            type: "account",
            title: "Bank Account Disconnected",
            message: `Your bank account has been disconnected. You will not be able to receive payouts until you reconnect it.`,
            metadata: {
              accountId: account.id,
            },
          });
          break;
        }
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error handling account webhook:");
      throw error;
    }
  }

  /**
   * Handle Stripe payout webhook events (for manual withdrawals)
   */
  async handlePayoutWebhook(event: Stripe.Event): Promise<void> {
    try {
      const payout = event?.data.object as Stripe.Payout;
      const metadataPayoutId = (payout as any)?.metadata?.payoutId as
        | string
        | undefined;

      // requestInstantPayout() inserts the instantPayouts row and stamps its
      // id into payout.metadata.payoutId BEFORE calling stripe.payouts.create(),
      // so looking up by metadata.payoutId first has no create-vs-webhook race
      // window. stripePayoutId (written just after the Stripe call returns)
      // is only a fallback.
      let payoutRecord: any;
      if (metadataPayoutId) {
        [payoutRecord] = await db
          .select()
          .from(instantPayouts)
          .where(eq(instantPayouts.id, metadataPayoutId))
          .limit(1);
      }
      if (!payoutRecord) {
        [payoutRecord] = await db
          .select()
          .from(instantPayouts)
          .where(eq(instantPayouts.stripePayoutId, payout?.id))
          .limit(1);
      }

      if (!payoutRecord) {
        // Every payout on this platform's Connect account is created by
        // requestInstantPayout with metadata.payoutId set, so an unmatched
        // payout is a reconciliation gap, not a legitimate no-op — throw so
        // the route reports failure and Stripe retries the event instead of
        // it being silently dropped.
        throw new Error(
          `No local payout record found for Stripe payout ${payout?.id} (checked metadata.payoutId=${metadataPayoutId || "none"} and stripePayoutId)`,
        );
      }

      // Update status based on event type
      let status = payoutRecord?.status;
      let processedAt = payoutRecord?.processedAt;
      let failureReason: string | null = null;

      switch (event?.type) {
        case "payout.paid":
          status = "completed";
          processedAt = new Date();

          // Send success notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: "payout",
            title: "Withdrawal Completed",
            message: `Your withdrawal of $${(payoutRecord?.amountCents / 100).toFixed(2)} has been completed and is on its way to your bank account.`,
            metadata: {
              payoutId: payoutRecord.id,
              amount: payoutRecord.amountCents / 100,
            },
          });
          break;

        case "payout.failed":
          status = "failed";
          failureReason = payout?.failure_message || "Unknown error";

          // Log payout failure for audit (balance is calculated dynamically from orders/payouts tables)
          logger.info({
            userId: payoutRecord.userId,
            amount: payoutRecord.amountCents / 100,
            payoutId: payoutRecord.id,
            stripePayoutId: payout.id,
            failureReason,
            operation: "payout_failed_balance_restored",
          }, "Payout failed - balance calculated dynamically");

          // Send failure notification
          await db.insert(notifications).values({
            userId: payoutRecord.userId,
            type: "payout",
            title: "Withdrawal Failed",
            message: `Your withdrawal failed: ${failureReason}. The amount has been returned to your available balance.`,
            metadata: {
              payoutId: payoutRecord.id,
              error: failureReason,
            },
          });
          break;

        case "payout.canceled":
          status = "cancelled";

          // Log payout cancellation for audit (balance is calculated dynamically from orders/payouts tables)
          logger.info({
            userId: payoutRecord.userId,
            amount: payoutRecord.amountCents / 100,
            payoutId: payoutRecord.id,
            stripePayoutId: payout.id,
            operation: "payout_canceled_balance_restored",
          }, "Payout canceled - balance calculated dynamically");
          break;
      }

      // Log failure reason for audit (not stored in DB - column doesn't exist)
      if (failureReason) {
        logger.warn({
          payoutId: payoutRecord.id,
          stripePayoutId: payout.id,
          failureReason,
        }, "Payout webhook failure");
      }

      // Update payout record — confirm the write actually matched a row
      // instead of assuming success just because nothing threw.
      const updatedPayout = await db
        .update(instantPayouts)
        .set({
          status,
          processedAt,
        })
        .where(eq(instantPayouts.id, payoutRecord.id))
        .returning({ id: instantPayouts.id });

      if (updatedPayout.length === 0) {
        throw new Error(
          `Payout webhook update matched no rows for payout ${payoutRecord.id} (Stripe payout ${payout?.id})`,
        );
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error handling payout webhook:");
      throw error;
    }
  }

  /**
   * Create split payment to multiple collaborators
   * Distributes payment among multiple sellers with different percentages
   */
  async createSplitPayment(orderId:string,_totalAmount:number,_splits:unknown[],_platformFeePercentage=10,_currency="usd",actorId?:string) {
    if(!actorId) throw new Error("Authenticated sale owner is required");
    return payOrderBeneficiaries(orderId,actorId);
  }

  /**
   * Get Stripe Express Dashboard link for seller to view their account
   */
  async getExpressDashboardLink(
    userId: string,
  ): Promise<{ url?: string; error?: string }> {
    try {
      if (!stripe) {
        return { error: "Stripe not configured" };
      }

      const accountVerification = await this.verifyStripeAccount(userId);
      if (!accountVerification.verified || !accountVerification.accountId) {
        return { error: "No verified Stripe account found" };
      }

      const loginLink = await stripe.accounts.createLoginLink(
        accountVerification.accountId,
      );

      return { url: loginLink.url };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error creating dashboard link:");
      return { error: (error as Error).message || "Failed to create dashboard link" };
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
            AND created_at >= ${startOfMonth.toISOString()}`,
      );

      const thisMonthEarnings = Number(
        monthlyEarningsResult.rows[0].monthly_earnings || 0,
      );
      Number(
        monthlyEarningsResult.rows[0].monthly_sales || 0,
      );

      const totalSalesResult = await db.execute(
        sql`SELECT COUNT(*) as total_sales FROM orders 
            WHERE seller_id = ${userId} AND status = 'completed'`,
      );
      const totalSales = Number(totalSalesResult?.rows?.[0]?.total_sales || 0);

      return {
        totalEarnings: balance.totalEarnings,
        thisMonthEarnings,
        pendingPayouts: balance.pendingBalance,
        availableBalance: balance.availableBalance,
        totalSales,
        averageOrderValue:
          totalSales > 0 ? balance?.totalEarnings / (totalSales || 1) : 0,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error getting earnings summary:");
      throw new Error("Failed to get earnings summary");
    }
  }
}

export const instantPayoutService = new InstantPayoutService();

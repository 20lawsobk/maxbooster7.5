/**
 * REFUND & CHARGEBACK HANDLER
 * 
 * Automated handling of payment disputes, refunds, and chargebacks.
 * Critical for protecting revenue and maintaining payment processor trust.
 */

import Stripe from 'stripe';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { registerWebhookHandler } from './stripeWebhookSecurity';

interface RefundRecord {
  id: string;
  stripeChargeId: string;
  stripeRefundId?: string;
  userId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  type: 'refund' | 'chargeback' | 'dispute';
  createdAt: Date;
  processedAt?: Date;
  metadata?: Record<string, any>;
}

interface ChargebackRecord {
  id: string;
  stripeDisputeId: string;
  stripeChargeId: string;
  userId: string;
  amount: number;
  reason: string;
  status: 'warning_needs_response' | 'warning_under_review' | 'warning_closed' | 
          'needs_response' | 'under_review' | 'charge_refunded' | 'won' | 'lost';
  evidence_due_by: Date;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory cache for quick lookup (also persisted to DB)
const refundRecords = new Map<string, RefundRecord>();
const chargebackRecords = new Map<string, ChargebackRecord>();

/**
 * Initialize Stripe instance
 */
function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(secretKey, { apiVersion: '2023-10-16' });
}

/**
 * Process a refund request
 */
export async function processRefund(params: {
  chargeId: string;
  amount?: number; // Optional - full refund if not specified
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  userId: string;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; refundId?: string; error?: string }> {
  const stripe = getStripe();
  
  try {
    logger.info(`[Refund] Processing refund for charge ${params.chargeId}`);

    const refund = await stripe.refunds.create({
      charge: params.chargeId,
      amount: params.amount, // In cents, omit for full refund
      reason: params.reason,
      metadata: {
        userId: params.userId,
        ...params.metadata,
      },
    });

    const record: RefundRecord = {
      id: crypto.randomUUID(),
      stripeChargeId: params.chargeId,
      stripeRefundId: refund.id,
      userId: params.userId,
      amount: refund.amount,
      reason: params.reason,
      status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
      type: 'refund',
      createdAt: new Date(),
      processedAt: refund.status === 'succeeded' ? new Date() : undefined,
      metadata: params.metadata,
    };

    refundRecords.set(refund.id, record);
    await persistRefundRecord(record);

    logger.info(`[Refund] Refund ${refund.id} created - Status: ${refund.status}`);

    // Update user's subscription if needed
    await handlePostRefundActions(params.userId, refund);

    return { success: true, refundId: refund.id };
  } catch (error: any) {
    logger.error(`[Refund] Failed to process refund for ${params.chargeId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle chargeback/dispute
 */
export async function handleDispute(dispute: Stripe.Dispute): Promise<void> {
  logger.warn('═══════════════════════════════════════════════════════');
  logger.warn('⚠️ CHARGEBACK/DISPUTE RECEIVED');
  logger.warn(`   Dispute ID: ${dispute.id}`);
  logger.warn(`   Charge: ${dispute.charge}`);
  logger.warn(`   Amount: $${(dispute.amount / 100).toFixed(2)}`);
  logger.warn(`   Reason: ${dispute.reason}`);
  logger.warn(`   Status: ${dispute.status}`);
  logger.warn('═══════════════════════════════════════════════════════');

  const record: ChargebackRecord = {
    id: crypto.randomUUID(),
    stripeDisputeId: dispute.id,
    stripeChargeId: dispute.charge as string,
    userId: dispute.metadata?.userId || 'unknown',
    amount: dispute.amount,
    reason: dispute.reason,
    status: dispute.status,
    evidence_due_by: new Date(dispute.evidence_details?.due_by! * 1000),
    createdAt: new Date(dispute.created * 1000),
    updatedAt: new Date(),
  };

  chargebackRecords.set(dispute.id, record);
  await persistChargebackRecord(record);

  // Take immediate action
  await handleChargebackActions(record, dispute);
}

/**
 * Take action based on chargeback
 */
async function handleChargebackActions(record: ChargebackRecord, dispute: Stripe.Dispute): Promise<void> {
  const stripe = getStripe();

  // 1. Flag the user account
  try {
    await db.execute(sql`
      UPDATE users 
      SET chargeback_count = COALESCE(chargeback_count, 0) + 1,
          last_chargeback_at = NOW(),
          account_status = CASE 
            WHEN COALESCE(chargeback_count, 0) >= 2 THEN 'suspended'
            ELSE account_status
          END
      WHERE stripe_customer_id = ${dispute.metadata?.customerId}
    `);
  } catch (error) {
    logger.error('[Chargeback] Failed to update user account:', error);
  }

  // 2. Submit evidence if we have it
  if (dispute.status === 'needs_response') {
    try {
      // Gather evidence (simplified - in production, gather actual evidence)
      const evidence: Stripe.DisputeUpdateParams.Evidence = {
        product_description: 'Digital music distribution and marketing services',
        customer_name: dispute.metadata?.customerName,
        customer_email_address: dispute.metadata?.customerEmail,
        service_date: dispute.metadata?.serviceDate,
        uncategorized_text: `
          This is a valid charge for Max Booster music services.
          The customer signed up on ${dispute.metadata?.signupDate} and 
          has been actively using the service.
          Service accessed: ${dispute.metadata?.lastAccess}
        `.trim(),
      };

      await stripe.disputes.update(dispute.id, { evidence });
      logger.info(`[Chargeback] Evidence submitted for dispute ${dispute.id}`);
    } catch (error) {
      logger.error('[Chargeback] Failed to submit evidence:', error);
    }
  }

  // 3. Send internal alert
  await sendChargebackAlert(record);
}

/**
 * Post-refund cleanup
 */
async function handlePostRefundActions(userId: string, refund: Stripe.Refund): Promise<void> {
  try {
    // Update user's refund count
    await db.execute(sql`
      UPDATE users 
      SET refund_count = COALESCE(refund_count, 0) + 1,
          total_refunded = COALESCE(total_refunded, 0) + ${refund.amount}
      WHERE id = ${userId}
    `);
  } catch (error) {
    logger.error('[Refund] Failed to update user record:', error);
  }
}

/**
 * Send alert for chargeback
 */
async function sendChargebackAlert(record: ChargebackRecord): Promise<void> {
  // In production, send email/Slack/PagerDuty alert
  logger.warn(`[ALERT] Chargeback alert - Dispute ${record.stripeDisputeId}, Amount: $${(record.amount / 100).toFixed(2)}`);
}

/**
 * Persist refund to database
 */
async function persistRefundRecord(record: RefundRecord): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO refund_records (
        id, stripe_charge_id, stripe_refund_id, user_id, amount, 
        reason, status, type, created_at, processed_at, metadata
      ) VALUES (
        ${record.id}, ${record.stripeChargeId}, ${record.stripeRefundId}, 
        ${record.userId}, ${record.amount}, ${record.reason}, 
        ${record.status}, ${record.type}, ${record.createdAt}, 
        ${record.processedAt}, ${JSON.stringify(record.metadata)}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        processed_at = EXCLUDED.processed_at
    `);
  } catch (error) {
    // Table might not exist yet, log but don't fail
    logger.debug('[Refund] Could not persist refund record:', error);
  }
}

/**
 * Persist chargeback to database
 */
async function persistChargebackRecord(record: ChargebackRecord): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO chargeback_records (
        id, stripe_dispute_id, stripe_charge_id, user_id, amount,
        reason, status, evidence_due_by, created_at, updated_at
      ) VALUES (
        ${record.id}, ${record.stripeDisputeId}, ${record.stripeChargeId},
        ${record.userId}, ${record.amount}, ${record.reason}, ${record.status},
        ${record.evidence_due_by}, ${record.createdAt}, ${record.updatedAt}
      )
      ON CONFLICT (stripe_dispute_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
    `);
  } catch (error) {
    // Table might not exist yet, log but don't fail
    logger.debug('[Chargeback] Could not persist chargeback record:', error);
  }
}

/**
 * Register Stripe webhook handlers for refunds/disputes
 */
export function registerRefundWebhookHandlers(): void {
  // Handle refund events
  registerWebhookHandler('charge.refunded', async (event) => {
    const charge = event.data.object as Stripe.Charge;
    logger.info(`[Webhook] Charge refunded: ${charge.id}`);
    return { success: true, message: 'Refund recorded' };
  });

  registerWebhookHandler('refund.created', async (event) => {
    const refund = event.data.object as Stripe.Refund;
    logger.info(`[Webhook] Refund created: ${refund.id}`);
    return { success: true, message: 'Refund created' };
  });

  registerWebhookHandler('refund.updated', async (event) => {
    const refund = event.data.object as Stripe.Refund;
    const existingRecord = refundRecords.get(refund.id);
    if (existingRecord) {
      existingRecord.status = refund.status === 'succeeded' ? 'succeeded' : 
                              refund.status === 'failed' ? 'failed' : 
                              refund.status === 'canceled' ? 'canceled' : 'pending';
      existingRecord.processedAt = new Date();
      await persistRefundRecord(existingRecord);
    }
    return { success: true, message: 'Refund updated' };
  });

  // Handle dispute events
  registerWebhookHandler('charge.dispute.created', async (event) => {
    const dispute = event.data.object as Stripe.Dispute;
    await handleDispute(dispute);
    return { success: true, message: 'Dispute handled' };
  });

  registerWebhookHandler('charge.dispute.updated', async (event) => {
    const dispute = event.data.object as Stripe.Dispute;
    const existing = chargebackRecords.get(dispute.id);
    if (existing) {
      existing.status = dispute.status;
      existing.updatedAt = new Date();
      await persistChargebackRecord(existing);
    }
    return { success: true, message: 'Dispute updated' };
  });

  registerWebhookHandler('charge.dispute.closed', async (event) => {
    const dispute = event.data.object as Stripe.Dispute;
    const existing = chargebackRecords.get(dispute.id);
    if (existing) {
      existing.status = dispute.status;
      existing.updatedAt = new Date();
      await persistChargebackRecord(existing);
      
      logger.info(`[Dispute] Dispute ${dispute.id} closed with status: ${dispute.status}`);
    }
    return { success: true, message: 'Dispute closed' };
  });

  logger.info('[RefundHandler] Webhook handlers registered');
}

/**
 * Get refund/chargeback statistics
 */
export function getRefundStats(): {
  totalRefunds: number;
  totalChargebacks: number;
  pendingRefunds: number;
  pendingChargebacks: number;
} {
  let pendingRefunds = 0;
  let pendingChargebacks = 0;

  for (const record of refundRecords.values()) {
    if (record.status === 'pending') pendingRefunds++;
  }

  for (const record of chargebackRecords.values()) {
    if (record.status === 'needs_response' || record.status === 'under_review') {
      pendingChargebacks++;
    }
  }

  return {
    totalRefunds: refundRecords.size,
    totalChargebacks: chargebackRecords.size,
    pendingRefunds,
    pendingChargebacks,
  };
}

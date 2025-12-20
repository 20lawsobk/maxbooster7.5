import { Router } from 'express';
import { instantPayoutService } from '../services/instantPayoutService';
import { requestInstantPayoutSchema } from '@shared/schema';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

/**
 * GET /api/payouts/balance
 * Get user's available balance for payouts
 */
router.get('/balance', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const balance = await instantPayoutService.calculateAvailableBalance(req.user.id);
    res.json(balance);
  } catch (error: unknown) {
    logger.error('Error fetching payout balance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch balance' });
  }
});

/**
 * POST /api/payouts/instant
 * Request instant payout (T+0 settlement)
 */
router.post('/instant', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate request body
    const validatedData = requestInstantPayoutSchema.parse(req.body);

    // Request instant payout
    const result = await instantPayoutService.requestInstantPayout(
      req.user.id,
      validatedData.amount,
      validatedData.currency
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      payoutId: result.payoutId,
      amount: result.amount,
      estimatedArrival: result.estimatedArrival,
      message: 'Payout initiated successfully. Funds will arrive within minutes.',
    });
  } catch (error: unknown) {
    logger.error('Error requesting instant payout:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({ error: error.message || 'Failed to request payout' });
  }
});

/**
 * GET /api/payouts/history
 * Get user's payout history
 */
router.get('/history', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const payouts = await instantPayoutService.getPayoutHistory(req.user.id, limit, offset);

    res.json({
      payouts,
      pagination: {
        limit,
        offset,
        total: payouts.length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching payout history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payout history' });
  }
});

/**
 * GET /api/payouts/status/:payoutId
 * Check payout status by ID
 */
router.get('/status/:payoutId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { payoutId } = req.params;

    const payout = await instantPayoutService.getPayoutStatus(payoutId);

    // Verify the payout belongs to the requesting user
    if (payout.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(payout);
  } catch (error: unknown) {
    logger.error('Error fetching payout status:', error);

    if (error.message === 'Payout not found') {
      return res.status(404).json({ error: 'Payout not found' });
    }

    res.status(500).json({ error: error.message || 'Failed to fetch payout status' });
  }
});

/**
 * POST /api/payouts/setup
 * Complete Stripe Connect Express onboarding
 */
router.post('/setup', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 5000}`;

    const refreshUrl = `${baseUrl}/marketplace?tab=payouts&setup=refresh`;
    const returnUrl = `${baseUrl}/marketplace?tab=payouts&setup=complete`;

    // Create Stripe account link
    const accountLinkUrl = await instantPayoutService.createAccountLink(
      req.user.id,
      refreshUrl,
      returnUrl
    );

    res.json({ url: accountLinkUrl });
  } catch (error: unknown) {
    logger.error('Error setting up payout account:', error);
    res.status(500).json({ error: error.message || 'Failed to setup payout account' });
  }
});

/**
 * GET /api/payouts/verify
 * Verify Stripe Connect account status
 */
router.get('/verify', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const verification = await instantPayoutService.verifyStripeAccount(req.user.id);
    res.json(verification);
  } catch (error: unknown) {
    logger.error('Error verifying payout account:', error);
    res.status(500).json({ error: error.message || 'Failed to verify account' });
  }
});

/**
 * GET /api/payouts/dashboard
 * Get Stripe Express dashboard link for seller
 */
router.get('/dashboard', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await instantPayoutService.getExpressDashboardLink(req.user.id);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ url: result.url });
  } catch (error: unknown) {
    logger.error('Error getting dashboard link:', error);
    res.status(500).json({ error: error.message || 'Failed to get dashboard link' });
  }
});

/**
 * GET /api/payouts/earnings
 * Get seller earnings summary
 */
router.get('/earnings', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const earnings = await instantPayoutService.getEarningsSummary(req.user.id);
    res.json(earnings);
  } catch (error: unknown) {
    logger.error('Error getting earnings summary:', error);
    res.status(500).json({ error: error.message || 'Failed to get earnings summary' });
  }
});

/**
 * POST /api/payouts/split
 * Create split payment to multiple collaborators
 */
router.post('/split', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId, totalAmount, splits, platformFeePercentage } = req.body;

    if (!orderId || !totalAmount || !splits || !Array.isArray(splits)) {
      return res.status(400).json({ error: 'orderId, totalAmount, and splits array required' });
    }

    const result = await instantPayoutService.createSplitPayment(
      orderId,
      totalAmount,
      splits,
      platformFeePercentage
    );

    if (!result.success) {
      return res.status(400).json({ error: 'Split payment failed', errors: result.errors });
    }

    res.json({
      success: true,
      transfers: result.transfers,
      errors: result.errors,
    });
  } catch (error: unknown) {
    logger.error('Error creating split payment:', error);
    res.status(500).json({ error: error.message || 'Failed to create split payment' });
  }
});

export default router;

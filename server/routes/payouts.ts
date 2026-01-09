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
    const message = error instanceof Error ? error.message : 'Failed to fetch balance';
    res.status(500).json({ error: message });
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

    // Convert amountCents to dollars for the service
    const amountDollars = validatedData.amountCents / 100;

    // Request instant payout
    const result = await instantPayoutService.requestInstantPayout(
      req.user.id,
      amountDollars,
      validatedData.currency
    );

    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        riskScore: result.riskScore,
      });
    }

    res.json({
      success: true,
      payoutId: result.payoutId,
      amount: result.amount,
      estimatedArrival: result.estimatedArrival,
      riskScore: result.riskScore,
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

    res.status(500).json({ error: (error as Error).message || 'Failed to request payout' });
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
    const message = error instanceof Error ? error.message : 'Failed to fetch payout history';
    res.status(500).json({ error: message });
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
    const message = error instanceof Error ? error.message : 'Failed to fetch payout status';

    if (message === 'Payout not found') {
      return res.status(404).json({ error: 'Payout not found' });
    }

    res.status(500).json({ error: message });
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
    const message = error instanceof Error ? error.message : 'Failed to setup payout account';
    res.status(500).json({ error: message });
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
    const message = error instanceof Error ? error.message : 'Failed to verify account';
    res.status(500).json({ error: message });
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
    const message = error instanceof Error ? error.message : 'Failed to get dashboard link';
    res.status(500).json({ error: message });
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
    const message = error instanceof Error ? error.message : 'Failed to get earnings summary';
    res.status(500).json({ error: message });
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
    res.status(500).json({ error: (error as Error).message || 'Failed to create split payment' });
  }
});

/**
 * POST /api/payouts/split-enhanced
 * Create enhanced split payment with ledger tracking
 */
router.post('/split-enhanced', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId, totalAmount, splits, platformFeePercentage } = req.body;

    if (!orderId || !totalAmount || !splits || !Array.isArray(splits)) {
      return res.status(400).json({ error: 'orderId, totalAmount, and splits array required' });
    }

    const result = await instantPayoutService.createEnhancedSplitPayment(
      orderId,
      totalAmount,
      splits,
      platformFeePercentage || 10
    );

    if (!result.success) {
      return res.status(400).json({ error: 'Split payment failed', errors: result.errors });
    }

    res.json({
      success: true,
      splitPaymentIds: result.splitPaymentIds,
      transfers: result.transfers,
      errors: result.errors,
    });
  } catch (error: unknown) {
    logger.error('Error creating enhanced split payment:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to create split payment' });
  }
});

/**
 * GET /api/payouts/report
 * Generate payout report for date range
 */
router.get('/report', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const report = await instantPayoutService.generatePayoutReport(req.user.id, startDate, endDate);

    res.json(report);
  } catch (error: unknown) {
    logger.error('Error generating payout report:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate report' });
  }
});

/**
 * GET /api/payouts/risk-assessment
 * Get risk assessment for a potential payout amount
 */
router.get('/risk-assessment', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const amount = parseFloat(req.query.amount as string);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const assessment = await instantPayoutService.assessPayoutRisk(req.user.id, amount);

    res.json(assessment);
  } catch (error: unknown) {
    logger.error('Error assessing payout risk:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to assess risk' });
  }
});

/**
 * GET /api/payouts/ledger
 * Get user's ledger history
 */
router.get('/ledger', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const entries = await instantPayoutService.getLedgerHistory(req.user.id, limit, offset);

    res.json({
      entries,
      pagination: { limit, offset, total: entries.length },
    });
  } catch (error: unknown) {
    logger.error('Error fetching ledger history:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to fetch ledger history' });
  }
});

/**
 * GET /api/payouts/tax-form/:year
 * Generate or retrieve 1099-K tax form data
 */
router.get('/tax-form/:year', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const taxYear = parseInt(req.params.year);
    const currentYear = new Date().getFullYear();
    
    if (isNaN(taxYear) || taxYear < 2020 || taxYear > currentYear) {
      return res.status(400).json({ error: 'Invalid tax year' });
    }

    const { stripeService } = await import('../services/stripeService');
    const formData = await stripeService.generateTaxFormData(req.user.id, taxYear);

    res.json(formData);
  } catch (error: unknown) {
    logger.error('Error generating tax form:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate tax form' });
  }
});

/**
 * GET /api/payouts/tax-forms
 * Get all tax forms for user
 */
router.get('/tax-forms', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { db } = await import('../db');
    const { taxForms } = await import('@shared/schema');
    const { eq, desc } = await import('drizzle-orm');

    const forms = await db
      .select()
      .from(taxForms)
      .where(eq(taxForms.userId, req.user.id))
      .orderBy(desc(taxForms.taxYear));

    res.json({ forms });
  } catch (error: unknown) {
    logger.error('Error fetching tax forms:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to fetch tax forms' });
  }
});

export default router;

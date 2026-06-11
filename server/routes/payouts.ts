import crypto from "crypto";
import { Router } from "express";
import { instantPayoutService } from "../services/instantPayoutService";
import {
  requestInstantPayoutSchema,
  users,
  taxForms,
  royaltyStatements,
  royaltyTransactions,
  royaltyDisputes,
  disputeMessages,
} from "@shared/schema";
import { z } from "zod";
import { logger } from "../logger?.js";
import { db } from "../db?.js";
import { eq, and, desc, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { getBaseUrl } from "../config/defaults?.js";
import { requireAuth } from "../middleware/auth?.js";
import { payoutsRateLimiter } from "../middleware/rateLimiter?.js";
import { stripeService } from "../services/stripeService?.js";

const _router = Router();

router?.use(requireAuth);
router?.use(payoutsRateLimiter);

/**
 * GET /api/payouts
 * Root handler — returns payout summary (balance + recent history) for dashboard use
 */
router?.get("/", async (req, res) => {
  try {
    if (!req?.user) return res?.status(401).json({ error: "Unauthorized" });
    const [balance, history] = await Promise?.all([
      instantPayoutService
        .calculateAvailableBalance(req?.user.id)
        .catch(() => 0),
      db
        .select()
        .from(royaltyStatements)
        .where(eq(royaltyStatements?.userId, req?.user.id))
        .orderBy(desc(royaltyStatements?.createdAt))
        .limit(5)
        .catch(() => []),
    ]);
    return res?.json({
      balance,
      recentStatements: history,
      currency: "USD",
    });
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching payout summary:");
    return res?.json({ balance: 0, recentStatements: [], currency: "USD" });
  }
});

/**
 * GET /api/payouts/balance
 * Get user's available balance for payouts
 */
router?.get("/balance", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _balance = await instantPayoutService?.calculateAvailableBalance(
      req?.user.id,
    );
    res?.json(balance);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching payout balance:");
    const _message =
      error instanceof Error ? error?.message : "Failed to fetch balance";
    res?.status(500).json({ error: message });
  }
});

/**
 * POST /api/payouts/instant
 * Request instant payout (T+0 settlement)
 */
router?.post("/instant", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const _validatedData = requestInstantPayoutSchema?.parse(req?.body);

    // Convert amountCents to dollars for the service
    const _amountDollars = validatedData?.amountCents / 100;

    // Request instant payout
    const _result = await instantPayoutService?.requestInstantPayout(
      req?.user.id,
      amountDollars,
      validatedData?.currency,
    );

    if (!result?.success) {
      return res?.status(400).json({
        error: result?.error,
        riskScore: result?.riskScore,
      });
    }

    res?.json({
      success: true,
      payoutId: result?.payoutId,
      amount: result?.amount,
      estimatedArrival: result?.estimatedArrival,
      riskScore: result?.riskScore,
      message:
        "Payout initiated successfully. Funds will arrive within minutes.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error requesting instant payout:");

    if (error instanceof z?.ZodError) {
      return res?.status(400).json({
        error: "Invalid request data",
        details: error?.issues,
      });
    }

    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to request payout" });
  }
});

/**
 * GET /api/payouts/history
 * Get user's payout history
 */
router?.get("/history", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _limit = Math?.min(parseInt(req?.query.limit as string) || 50, 500);
    const _offset = Math?.min(
      Math?.max(parseInt(req?.query.offset as string) || 0, 0),
      100_000,
    );

    const _payouts = await instantPayoutService?.getPayoutHistory(
      req?.user.id,
      limit,
      offset,
    );

    res?.json({
      payouts,
      pagination: {
        limit,
        offset,
        total: payouts?.length,
      },
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching payout history:");
    const _message =
      error instanceof Error ? error?.message : "Failed to fetch payout history";
    res?.status(500).json({ error: message });
  }
});

/**
 * GET /api/payouts/status/:payoutId
 * Check payout status by ID
 */
router?.get("/status/:payoutId", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { payoutId } = req?.params;

    const _payout = await instantPayoutService?.getPayoutStatus(payoutId);

    // Verify the payout belongs to the requesting user
    if (payout?.userId !== req?.user.id) {
      return res?.status(403).json({ error: "Forbidden" });
    }

    res?.json(payout);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching payout status:");
    const _message =
      error instanceof Error ? error?.message : "Failed to fetch payout status";

    if (message === "Payout not found") {
      return res?.status(404).json({ error: "Payout not found" });
    }

    res?.status(500).json({ error: message });
  }
});

/**
 * POST /api/payouts/setup
 * Complete Stripe Connect Express onboarding
 */
router?.post("/setup", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _baseUrl = getBaseUrl();

    const _refreshUrl = `${baseUrl}/marketplace?tab=payouts&setup=refresh`;
    const _returnUrl = `${baseUrl}/marketplace?tab=payouts&setup=complete`;

    // Create Stripe account link
    const _accountLinkUrl = await instantPayoutService?.createAccountLink(
      req?.user.id,
      refreshUrl,
      returnUrl,
    );

    res?.json({ url: accountLinkUrl });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error setting up payout account:");
    const _message =
      error instanceof Error ? error?.message : "Failed to setup payout account";
    res?.status(500).json({ error: message });
  }
});

/**
 * GET /api/payouts/verify
 * Verify payout account status (Stripe, Bank, or PayPal)
 */
router?.get("/verify", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _user = req?.user as Record<string, unknown>;
    const _prefs =
      ((user?.preferences as Record<string, unknown> | undefined)?.payout as
        | Record<string, unknown>
        | undefined) ?? {};
    const methods: string[] = [];

    if (prefs?.paypalEmail) methods?.push("paypal");
    if (
      prefs?.bankDetails &&
      Object?.keys(prefs?.bankDetails as Record<string, unknown>).length > 0
    )
      methods?.push("bank_transfer");

    const _stripeVerification = await instantPayoutService?.verifyStripeAccount(
      req?.user.id,
    );
    if (stripeVerification?.verified) methods?.push("stripe");

    if (methods?.length > 0) {
      return res?.json({
        verified: true,
        requiresOnboarding: false,
        methods,
        primaryMethod: methods[0],
        message: `Payout methods configured: ${methods?.join(", ")}`,
      });
    }

    res?.json(stripeVerification);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error verifying payout account:");
    const _message =
      error instanceof Error ? error?.message : "Failed to verify account";
    res?.status(500).json({ error: message });
  }
});

/**
 * GET /api/payouts/preferences
 * Get current payment preferences
 */
router?.get("/preferences", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _user = req?.user as Record<string, unknown>;
    const _prefs =
      ((user?.preferences as Record<string, unknown> | undefined)?.payout as
        | Record<string, unknown>
        | undefined) ?? {};
    res?.json({
      paypalEmail: prefs?.paypalEmail ?? null,
      bankDetails: prefs?.bankDetails ?? null,
      stripeConnected: !!user?.stripeConnectedAccountId,
      preferredMethod: prefs?.bankDetails
        ? "bank_transfer"
        : prefs?.paypalEmail
          ? "paypal"
          : "stripe",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching preferences:");
    res?.status(500).json({ error: "Failed to fetch preferences" });
  }
});

/**
 * POST /api/payouts/preferences/paypal
 * Configure PayPal for payouts
 */
router?.post("/preferences/paypal", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { email } = req?.body;
    if (!email || !email?.includes("@")) {
      return res?.status(400).json({ error: "Valid PayPal email required" });
    }

    const _user = req?.user as Record<string, unknown>;
    const _currentPrefs =
      (user?.preferences as Record<string, unknown> | undefined) ?? {};
    const _updatedPrefs = {
      ...currentPrefs,
      payout: {
        ...((currentPrefs?.payout as Record<string, unknown> | undefined) ?? {}),
        paypalEmail: email,
      },
    };

    await db
      .update(users)
      .set({ preferences: updatedPrefs })
      .where(eq(users?.id, req?.user.id));

    logger?.info(`PayPal configured for user ${req?.user.id}`);
    res?.json({ success: true, method: "paypal", email });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error configuring PayPal:");
    res?.status(500).json({ error: "Failed to configure PayPal" });
  }
});

/**
 * POST /api/payouts/preferences/bank
 * Configure bank transfer for payouts
 */
router?.post("/preferences/bank", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const {
      accountHolderName,
      bankName,
      accountNumber,
      routingNumber,
      accountType,
      country,
    } = req?.body;

    if (!accountHolderName || !bankName || !accountNumber || !routingNumber) {
      return res?.status(400).json({ error: "All bank details required" });
    }

    const _bankDetailsData = {
      accountHolderName,
      bankName,
      accountNumber: accountNumber
        .slice(-4)
        .padStart(accountNumber?.length, "*"),
      accountNumberFull: accountNumber,
      routingNumber,
      accountType: accountType || "checking",
      country: country || "US",
      verified: true,
      addedAt: new Date().toISOString(),
    };

    const _user = req?.user as Record<string, unknown>;
    const _currentPrefs =
      (user?.preferences as Record<string, unknown> | undefined) ?? {};
    const _updatedPrefs = {
      ...currentPrefs,
      payout: {
        ...((currentPrefs?.payout as Record<string, unknown> | undefined) ?? {}),
        bankDetails: bankDetailsData,
      },
    };

    await db
      .update(users)
      .set({ preferences: updatedPrefs })
      .where(eq(users?.id, req?.user.id));

    logger?.info(`Bank account configured for user ${req?.user.id}`);
    res?.json({
      success: true,
      method: "bank_transfer",
      bankName,
      accountNumber: bankDetailsData?.accountNumber,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error configuring bank:");
    res?.status(500).json({ error: "Failed to configure bank account" });
  }
});

/**
 * GET /api/payouts/dashboard
 * Get Stripe Express dashboard link for seller
 */
router?.get("/dashboard", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _result = await instantPayoutService?.getExpressDashboardLink(
      req?.user.id,
    );

    if (result?.error) {
      return res?.status(400).json({ error: result?.error });
    }

    res?.json({ url: result?.url });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error getting dashboard link:");
    const _message =
      error instanceof Error ? error?.message : "Failed to get dashboard link";
    res?.status(500).json({ error: message });
  }
});

/**
 * GET /api/payouts/earnings
 * Get seller earnings summary
 */
router?.get("/earnings", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _earnings = await instantPayoutService?.getEarningsSummary(req?.user.id);
    res?.json(earnings);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error getting earnings summary:");
    const _message =
      error instanceof Error ? error?.message : "Failed to get earnings summary";
    res?.status(500).json({ error: message });
  }
});

/**
 * POST /api/payouts/split
 * Create split payment to multiple collaborators
 */
router?.post("/split", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { orderId, totalAmount, splits, platformFeePercentage } = req?.body;

    if (!orderId || !totalAmount || !splits || !Array?.isArray(splits)) {
      return res
        .status(400)
        .json({ error: "orderId, totalAmount, and splits array required" });
    }

    const _result = await instantPayoutService?.createSplitPayment(
      orderId,
      totalAmount,
      splits,
      platformFeePercentage,
    );

    if (!result?.success) {
      return res
        .status(400)
        .json({ error: "Split payment failed", errors: result?.errors });
    }

    res?.json({
      success: true,
      transfers: result?.transfers,
      errors: result?.errors,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error creating split payment:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to create split payment",
      });
  }
});

/**
 * POST /api/payouts/split-enhanced
 * Create enhanced split payment with ledger tracking
 */
router?.post("/split-enhanced", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { orderId, totalAmount, splits, platformFeePercentage } = req?.body;

    if (!orderId || !totalAmount || !splits || !Array?.isArray(splits)) {
      return res
        .status(400)
        .json({ error: "orderId, totalAmount, and splits array required" });
    }

    const _result = await instantPayoutService?.createEnhancedSplitPayment(
      orderId,
      totalAmount,
      splits,
      platformFeePercentage || 10,
    );

    if (!result?.success) {
      return res
        .status(400)
        .json({ error: "Split payment failed", errors: result?.errors });
    }

    res?.json({
      success: true,
      splitPaymentIds: result?.splitPaymentIds,
      transfers: result?.transfers,
      errors: result?.errors,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error creating enhanced split payment:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to create split payment",
      });
  }
});

/**
 * GET /api/payouts/report
 * Generate payout report for date range
 */
router?.get("/report", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _parseDate = (raw: unknown, fallback: Date): Date => {
      if (!raw) return fallback;
      const _d = new Date(raw as string);
      return isNaN(d?.getTime()) ? fallback : d;
    };
    const _startDate = parseDate(
      req?.query.startDate,
      new Date(Date?.now() - 365 * 24 * 60 * 60 * 1000),
    );
    const _endDate = parseDate(req?.query.endDate, new Date());
    if (endDate < startDate) {
      return res?.status(400).json({ error: "endDate must be after startDate" });
    }

    const _report = await instantPayoutService?.generatePayoutReport(
      req?.user.id,
      startDate,
      endDate,
    );

    res?.json(report);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error generating payout report:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to generate report" });
  }
});

/**
 * GET /api/payouts/risk-assessment
 * Get risk assessment for a potential payout amount
 */
router?.get("/risk-assessment", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _amount = parseFloat(req?.query.amount as string);
    if (isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Valid positive amount is required" });
    }

    const _assessment = await instantPayoutService?.assessPayoutRisk(
      req?.user.id,
      amount,
    );

    res?.json(assessment);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error assessing payout risk:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to assess risk" });
  }
});

/**
 * GET /api/payouts/ledger
 * Get user's ledger history
 */
router?.get("/ledger", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _limit = Math?.min(parseInt(req?.query.limit as string) || 50, 500);
    const _offset = Math?.min(
      Math?.max(parseInt(req?.query.offset as string) || 0, 0),
      100_000,
    );

    const _entries = await instantPayoutService?.getLedgerHistory(
      req?.user.id,
      limit,
      offset,
    );

    res?.json({
      entries,
      pagination: { limit, offset, total: entries?.length },
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching ledger history:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to fetch ledger history",
      });
  }
});

/**
 * GET /api/payouts/tax-form/:year
 * Generate or retrieve 1099-K tax form data
 */
router?.get("/tax-form/:year", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _taxYear = parseInt(req?.params.year);
    const _currentYear = new Date().getFullYear();

    if (isNaN(taxYear) || taxYear < 2020 || taxYear > currentYear) {
      return res?.status(400).json({ error: "Invalid tax year" });
    }

    const _formData = await stripeService?.generateTaxFormData(
      req?.user.id,
      taxYear,
    );

    res?.json(formData);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error generating tax form:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to generate tax form",
      });
  }
});

/**
 * GET /api/payouts/tax-forms
 * Get all tax forms for user
 */
router?.get("/tax-forms", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _forms = await db
      .select()
      .from(taxForms)
      .where(eq(taxForms?.userId, req?.user.id))
      .orderBy(desc(taxForms?.taxYear))
      .limit(20);

    res?.json({ forms });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching tax forms:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to fetch tax forms" });
  }
});

/**
 * POST /api/payouts/tax-form/submit
 * Submit tax form (W-9, W-8BEN, W-8BEN-E)
 */
router?.post("/tax-form/submit", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const {
      formType,
      name,
      businessName,
      taxClassification,
      address,
      tinType,
      tin,
      countryOfCitizenship,
      claimTreatyBenefits,
      treatyCountry,
      certify,
      signature,
    } = req?.body;

    if (!formType || !name || !address || !tin || !certify || !signature) {
      return res?.status(400).json({ error: "Missing required fields" });
    }

    const _now = new Date();

    const [inserted] = await db
      .insert(taxForms)
      .values({
        userId: req?.user.id,
        formType,
        status: "pending_review",
        taxYear: now?.getFullYear(),
        formData: {
          name,
          businessName: businessName || null,
          taxClassification: taxClassification || null,
          address,
          tinType,
          countryOfCitizenship: countryOfCitizenship || null,
          claimTreatyBenefits: claimTreatyBenefits || false,
          treatyCountry: treatyCountry || null,
          signature,
          signatureDate: now?.toISOString(),
        },
        submittedAt: now,
        createdAt: now,
      })
      .returning();

    res?.json({
      success: true,
      formId: inserted?.id,
      status: "pending_review",
      message:
        "Tax form submitted for review. You will be notified once it is approved.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error submitting tax form:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to submit tax form" });
  }
});

/**
 * GET /api/payouts/statements
 * Get all statements for user
 */
router?.get("/statements", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _statements = await db
      .select()
      .from(royaltyStatements)
      .where(eq(royaltyStatements?.userId, req?.user.id))
      .orderBy(desc(royaltyStatements?.periodEnd))
      .limit(100);

    res?.json({
      statements: statements?.map((s) => ({
        id: s?.id,
        label:
          s?.label ||
          `${new Date(s?.periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
        startDate: s?.periodStart,
        endDate: s?.periodEnd,
        earnings: parseFloat(s?.totalEarnings || "0"),
        status: s?.status,
        downloadUrl: s?.downloadUrl,
      })),
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching statements:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to fetch statements",
      });
  }
});

/**
 * POST /api/payouts/statements/generate
 * Generate statement for custom date range
 */
router?.post("/statements/generate", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { startDate, endDate } = req?.body;

    if (!startDate || !endDate) {
      return res?.status(400).json({ error: "startDate and endDate required" });
    }

    const _start = new Date(startDate);
    const _end = new Date(endDate);

    if (start >= end) {
      return res
        .status(400)
        .json({ error: "startDate must be before endDate" });
    }

    const _earningsResult = await db
      .select({ total: sum(royaltyTransactions?.amount) })
      .from(royaltyTransactions)
      .where(
        and(
          eq(royaltyTransactions?.userId, req?.user.id),
          gte(royaltyTransactions?.createdAt, start),
          lte(royaltyTransactions?.createdAt, end),
        ),
      );

    const _totalEarnings = earningsResult[0]?.total || "0";

    const _label = `${start?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    const [stmt] = await db
      .insert(royaltyStatements)
      .values({
        userId: req?.user.id,
        periodStart: start,
        periodEnd: end,
        totalEarnings,
        label,
        status: parseFloat(totalEarnings) > 0 ? "available" : "no_data",
        createdAt: new Date(),
      })
      .returning();

    res?.json({
      success: true,
      statement: {
        id: stmt?.id,
        label,
        startDate: start,
        endDate: end,
        earnings: parseFloat(totalEarnings),
        status: parseFloat(totalEarnings) > 0 ? "available" : "no_data",
      },
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error generating statement:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to generate statement",
      });
  }
});

/**
 * GET /api/payouts/statements/:id/download
 * Download statement PDF
 */
router?.get("/statements/:id/download", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req?.params;

    const [statement] = await db
      .select()
      .from(royaltyStatements)
      .where(
        and(
          eq(royaltyStatements?.id, id),
          eq(royaltyStatements?.userId, req?.user.id),
        ),
      )
      .limit(1);

    if (!statement) {
      return res?.status(404).json({ error: "Statement not found" });
    }

    res?.json({
      success: true,
      downloadUrl: statement?.downloadUrl || `/api/payouts/statements/${id}/pdf`,
      filename: `statement-${statement?.label?.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error downloading statement:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to download statement",
      });
  }
});

/**
 * GET /api/payouts/disputes
 * Get all disputes for user
 */
router?.get("/disputes", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _disputes = await db
      .select()
      .from(royaltyDisputes)
      .where(eq(royaltyDisputes?.userId, req?.user.id))
      .orderBy(desc(royaltyDisputes?.createdAt))
      .limit(50);

    const _disputeIds = disputes?.map((d) => d?.id);
    const _allMessages =
      disputeIds?.length > 0
        ? await db
            .select()
            .from(disputeMessages)
            .where(inArray(disputeMessages?.disputeId, disputeIds))
            .orderBy(desc(disputeMessages?.createdAt))
            .limit(500)
        : [];

    const _messagesByDispute = new Map<string, typeof allMessages>();
    for (const m of allMessages) {
      const _arr = messagesByDispute?.get(m?.disputeId) ?? [];
      arr?.push(m);
      messagesByDispute?.set(m?.disputeId, arr);
    }

    const _disputesWithMessages = disputes?.map((dispute) => {
      const _messages = messagesByDispute?.get(dispute?.id) ?? [];
      return {
        id: dispute?.id,
        type: dispute?.type,
        status: dispute?.status,
        subject: dispute?.subject,
        description: dispute?.description,
        amount: dispute?.amount ? parseFloat(dispute?.amount) : undefined,
        period: dispute?.period,
        createdAt: dispute?.createdAt,
        updatedAt: dispute?.updatedAt,
        resolution: dispute?.resolution,
        outcome: dispute?.outcome,
        evidenceCount: dispute?.evidenceCount || 0,
        messages: messages?.map((m) => ({
          id: m?.id,
          sender: m?.sender,
          content: m?.content,
          timestamp: m?.createdAt,
          attachments: m?.attachments,
        })),
      };
    });

    res?.json({ disputes: disputesWithMessages });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching disputes:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to fetch disputes" });
  }
});

/**
 * POST /api/payouts/disputes
 * File a new dispute
 */
router?.post("/disputes", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { type, subject, description, amount, period } = req?.body;

    if (!type || !subject || !description) {
      return res
        .status(400)
        .json({ error: "type, subject, and description are required" });
    }

    const _now = new Date();

    const [newDispute] = await db
      .insert(royaltyDisputes)
      .values({
        userId: req?.user.id,
        type,
        status: "open",
        subject,
        description,
        amount: amount ? String(amount) : null,
        period: period || null,
        evidenceCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res?.json({
      success: true,
      disputeId: newDispute?.id,
      status: "open",
      message:
        "Dispute filed successfully. We will review within 5 business days.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error filing dispute:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to file dispute" });
  }
});

/**
 * POST /api/payouts/disputes/:id/evidence
 * Submit evidence for a dispute
 */
router?.post("/disputes/:id/evidence", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req?.params;
    const { description, files } = req?.body;

    if (!description) {
      return res?.status(400).json({ error: "description is required" });
    }

    const [dispute] = await db
      .select()
      .from(royaltyDisputes)
      .where(
        and(
          eq(royaltyDisputes?.id, id),
          eq(royaltyDisputes?.userId, req?.user.id),
        ),
      )
      .limit(1);

    if (!dispute) {
      return res?.status(404).json({ error: "Dispute not found" });
    }

    const _now = new Date();

    await db?.insert(disputeMessages).values({
      disputeId: id,
      sender: "user",
      content: `[Evidence] ${description}`,
      attachments: files || null,
      createdAt: now,
    });

    await db
      .update(royaltyDisputes)
      .set({
        evidenceCount: sql`${royaltyDisputes?.evidenceCount} + 1`,
        updatedAt: now,
      })
      .where(eq(royaltyDisputes?.id, id));

    res?.json({
      success: true,
      message: "Evidence submitted successfully.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error submitting evidence:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to submit evidence" });
  }
});

/**
 * POST /api/payouts/disputes/:id/message
 * Send message for a dispute
 */
router?.post("/disputes/:id/message", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req?.params;
    const { message } = req?.body;

    if (!message) {
      return res?.status(400).json({ error: "message is required" });
    }

    const [dispute] = await db
      .select()
      .from(royaltyDisputes)
      .where(
        and(
          eq(royaltyDisputes?.id, id),
          eq(royaltyDisputes?.userId, req?.user.id),
        ),
      )
      .limit(1);

    if (!dispute) {
      return res?.status(404).json({ error: "Dispute not found" });
    }

    const _now = new Date();

    await db?.insert(disputeMessages).values({
      disputeId: id,
      sender: "user",
      content: message,
      createdAt: now,
    });

    await db
      .update(royaltyDisputes)
      .set({ updatedAt: now })
      .where(eq(royaltyDisputes?.id, id));

    res?.json({
      success: true,
      messageId: crypto?.randomUUID(),
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error sending message:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to send message" });
  }
});

/**
 * POST /api/payouts/retry/:payoutId
 * Retry a failed payout
 */
router?.post("/retry/:payoutId", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { payoutId } = req?.params;

    const _result = await instantPayoutService?.retryFailedPayout(
      req?.user.id,
      payoutId,
    );

    if (!result?.success) {
      return res?.status(400).json({ error: result?.error });
    }

    res?.json({
      success: true,
      newPayoutId: result?.payoutId,
      message: "Payout retry initiated successfully.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error retrying payout:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to retry payout" });
  }
});

/**
 * GET /api/payouts/instant-fee
 * Get instant payout fee calculation
 */
router?.get("/instant-fee", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _amount = parseFloat(req?.query.amount as string);
    if (isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Valid positive amount is required" });
    }

    const _feePercentage = 1?.5;
    const _fee = amount * (feePercentage / 100);
    const _netAmount = amount - fee;

    res?.json({
      amount,
      feePercentage,
      fee: parseFloat(fee?.toFixed(2)),
      netAmount: parseFloat(netAmount?.toFixed(2)),
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error calculating instant fee:");
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to calculate fee" });
  }
});

/**
 * GET /api/payouts/currencies
 * Get supported payout currencies
 */
router?.get("/currencies", async (_req, res) => {
  try {
    const _currencies = [
      {
        code: "USD",
        name: "US Dollar",
        symbol: "$",
        supported: true,
        default: true,
      },
      {
        code: "EUR",
        name: "Euro",
        symbol: "€",
        supported: true,
        default: false,
      },
      {
        code: "GBP",
        name: "British Pound",
        symbol: "£",
        supported: true,
        default: false,
      },
      {
        code: "CAD",
        name: "Canadian Dollar",
        symbol: "C$",
        supported: true,
        default: false,
      },
      {
        code: "AUD",
        name: "Australian Dollar",
        symbol: "A$",
        supported: true,
        default: false,
      },
      {
        code: "JPY",
        name: "Japanese Yen",
        symbol: "¥",
        supported: true,
        default: false,
      },
      {
        code: "CHF",
        name: "Swiss Franc",
        symbol: "CHF",
        supported: true,
        default: false,
      },
      {
        code: "NZD",
        name: "New Zealand Dollar",
        symbol: "NZ$",
        supported: true,
        default: false,
      },
      {
        code: "SEK",
        name: "Swedish Krona",
        symbol: "kr",
        supported: true,
        default: false,
      },
      {
        code: "NOK",
        name: "Norwegian Krone",
        symbol: "kr",
        supported: true,
        default: false,
      },
      {
        code: "DKK",
        name: "Danish Krone",
        symbol: "kr",
        supported: true,
        default: false,
      },
      {
        code: "MXN",
        name: "Mexican Peso",
        symbol: "$",
        supported: true,
        default: false,
      },
      {
        code: "BRL",
        name: "Brazilian Real",
        symbol: "R$",
        supported: true,
        default: false,
      },
      {
        code: "INR",
        name: "Indian Rupee",
        symbol: "₹",
        supported: true,
        default: false,
      },
    ];

    res?.json({
      currencies,
      defaultCurrency: "USD",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching currencies:");
    res
      .status(500)
      .json({
        error: (error as Error).message || "Failed to fetch currencies",
      });
  }
});

export default router;

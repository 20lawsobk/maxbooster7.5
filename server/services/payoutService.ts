import { db } from "../db.js";
import { royaltyStatements, systemSettings } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import crypto from "crypto";

export type PaymentFrequency =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual";
export type PaymentMethod =
  | "bank_transfer"
  | "paypal"
  | "stripe"
  | "check"
  | "crypto";
export type PayoutStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface PaymentPreferences {
  userId: string;
  minimumThreshold: number;
  currency: string;
  frequency: PaymentFrequency;
  preferredMethod: PaymentMethod;
  bankDetails?: BankDetails;
  paypalEmail?: string;
  stripeAccountId?: string;
  cryptoWallet?: CryptoWalletDetails;
  taxWithholdingRate?: number;
  autoPayoutEnabled: boolean;
}

export interface BankDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode?: string;
  iban?: string;
  accountType: "checking" | "savings";
  country: string;
}

export interface CryptoWalletDetails {
  network: "ethereum" | "bitcoin" | "usdc" | "usdt";
  walletAddress: string;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PayoutStatus;
  grossAmount: number;
  taxWithheld: number;
  netAmount: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  transactionId?: string;
  receiptUrl?: string;
}

export interface PayoutSchedule {
  userId: string;
  frequency: PaymentFrequency;
  nextPayoutDate: Date;
  minimumThreshold: number;
  currentBalance: number;
  isEligible: boolean;
  eligibilityReason?: string;
}

export interface TaxWithholdingCalculation {
  grossAmount: number;
  withholdingRate: number;
  withholdingAmount: number;
  netAmount: number;
  taxFormRequired: boolean;
  taxFormType?: "1099-MISC" | "W-8BEN" | "none";
}

export interface PaymentReceipt {
  receiptId: string;
  payoutId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  transactionId?: string;
  createdAt: Date;
  statementPeriods: string[];
}

const DEFAULT_THRESHOLDS: Record<string, number> = {
  USD: 25.0,
  EUR: 25.0,
  GBP: 20.0,
  CAD: 35.0,
  AUD: 35.0,
  JPY: 3000,
};

const TAX_WITHHOLDING_RATES: Record<string, number> = {
  US_DOMESTIC: 0.0,
  US_FOREIGN: 0.3,
  EU_VAT: 0.2,
  default: 0.0,
};

const PREF_CACHE_MAX = 50_000; // max users cached in-process
const PREF_CACHE_TTL = 30 * 60 * 1000; // 30 min read-through cache

export class PayoutService {
  private payoutRequests: Map<string, PayoutRequest> = new Map();
  private readonly MAX_PAYOUT_REQUESTS = 20_000; // cap in-flight request cache
  private readonly MAX_RECEIPTS = 50_000; // cap receipt cache
  private receipts: Map<string, PaymentReceipt> = new Map();

  // payment preferences: DB-backed with in-process LRU read-through cache.
  // Key: userId, Value: { prefs, cachedAt }
  private paymentPreferences: Map<
    string,
    { prefs: PaymentPreferences; cachedAt: number }
  > = new Map();

  constructor() {
    // Periodic cleanup: evict stale cache entries and enforce hard caps.
    setInterval(
      () => {
        const cutoff = Date?.now() - PREF_CACHE_TTL;
        for (const [uid, entry] of this.paymentPreferences.entries()) {
          if (entry?.cachedAt < cutoff) this.paymentPreferences.delete(uid);
        }
        // Hard caps
        while (this.paymentPreferences.size > PREF_CACHE_MAX) {
          const k = this.paymentPreferences.keys().next().value;
          if (k !== undefined) this.paymentPreferences.delete(k);
        }
        while (this.payoutRequests.size > this.MAX_PAYOUT_REQUESTS) {
          const k = this.payoutRequests.keys().next().value;
          if (k !== undefined) this.payoutRequests.delete(k);
        }
        while (this.receipts.size > this.MAX_RECEIPTS) {
          const k = this.receipts.keys().next().value;
          if (k !== undefined) this.receipts.delete(k);
        }
      },
      15 * 60 * 1000,
    ).unref();
  }

  async getPaymentPreferences(
    userId: string,
  ): Promise<PaymentPreferences | null> {
    // 1. Check in-process cache
    const cached = this.paymentPreferences.get(userId);
    if (cached && Date?.now() - cached?.cachedAt < PREF_CACHE_TTL)
      return cached?.prefs;
    // 2. Read through to DB
    try {
      const row = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, `payment_prefs:${userId}`))
        .limit(1);
      if (row?.length && row[0].value) {
        const prefs = row[0].value as unknown as PaymentPreferences;
        this.paymentPreferences.set(userId, { prefs, cachedAt: Date.now() });
        return prefs;
      }
    } catch (err) {
      logger.warn(
        { err },
        `[PayoutService] Failed to read payment prefs for ${userId} from DB`,
      );
    }
    return null;
  }

  async setPaymentPreferences(
    preferences: PaymentPreferences,
  ): Promise<PaymentPreferences> {
    if (
      preferences?.minimumThreshold <
      this.getMinimumThreshold(preferences?.currency)
    ) {
      throw new Error(
        `Minimum threshold must be at least ${this.getMinimumThreshold(preferences?.currency)} ${preferences?.currency}`,
      );
    }
    // Persist to DB first
    await db
      .insert(systemSettings)
      .values({
        key: `payment_prefs:${preferences?.userId}`,
        value: preferences as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: preferences as unknown as Record<string, unknown> },
      });
    // Update in-process cache
    this.paymentPreferences.set(preferences?.userId, {
      prefs: preferences,
      cachedAt: Date.now(),
    });
    logger.info(`Updated payment preferences for user ${preferences?.userId}`);
    return preferences;
  }

  getMinimumThreshold(currency: string): number {
    return DEFAULT_THRESHOLDS[currency] || DEFAULT_THRESHOLDS.USD;
  }

  async calculateAvailableBalance(userId: string): Promise<{
    available: number;
    pending: number;
    held: number;
    currency: string;
  }> {
    const statements = await db
      .select()
      .from(royaltyStatements)
      .where(
        and(
          eq(royaltyStatements.userId, userId),
          eq(royaltyStatements.status, "finalized"),
        ),
      );

    const pendingPayouts = Array.from(this.payoutRequests.values()).filter(
      (p) =>
        p?.userId === userId &&
        (p?.status === "pending" || p?.status === "processing"),
    );

    const available = statements?.reduce(
      (sum, s) => sum + Number((s as any)?.payableAmount),
      0,
    );
    const pending = pendingPayouts?.reduce((sum, p) => sum + p?.amount, 0);

    return {
      available: Math.max(0, available - pending),
      pending,
      held: 0,
      currency: "USD",
    };
  }

  calculateTaxWithholding(
    amount: number,
    userCountry: string,
    taxProfileComplete: boolean,
  ): TaxWithholdingCalculation {
    let withholdingRate = TAX_WITHHOLDING_RATES?.default;
    let taxFormRequired = false;
    let taxFormType: "1099-MISC" | "W-8BEN" | "none" = "none";

    if (userCountry === "US") {
      withholdingRate = TAX_WITHHOLDING_RATES.US_DOMESTIC;
      if (amount >= 600) {
        taxFormRequired = true;
        taxFormType = "1099-MISC";
      }
    } else if (!taxProfileComplete) {
      withholdingRate = TAX_WITHHOLDING_RATES.US_FOREIGN;
      taxFormRequired = true;
      taxFormType = "W-8BEN";
    }

    const withholdingAmount = amount * withholdingRate;
    const netAmount = amount - withholdingAmount;

    return {
      grossAmount: amount,
      withholdingRate,
      withholdingAmount,
      netAmount,
      taxFormRequired,
      taxFormType,
    };
  }

  async requestPayout(
    userId: string,
    amount: number,
    method?: PaymentMethod,
  ): Promise<PayoutRequest> {
    const preferences = await this.getPaymentPreferences(userId);
    const paymentMethod =
      method || preferences?.preferredMethod || "bank_transfer";
    const currency = preferences?.currency || "USD";

    const balance = await this.calculateAvailableBalance(userId);
    if (amount > balance?.available) {
      throw new Error(
        `Requested amount $${amount} exceeds available balance $${balance?.available}`,
      );
    }

    const threshold =
      preferences?.minimumThreshold || this.getMinimumThreshold(currency);
    if (amount < threshold) {
      throw new Error(`Amount must be at least ${threshold} ${currency}`);
    }

    const taxCalc = this.calculateTaxWithholding(amount, "US", true);

    const payoutId = crypto?.randomUUID();
    const payout: PayoutRequest = {
      id: payoutId,
      userId,
      amount,
      currency,
      method: paymentMethod,
      status: "pending",
      grossAmount: amount,
      taxWithheld: taxCalc.withholdingAmount,
      netAmount: taxCalc.netAmount,
      createdAt: new Date(),
    };

    this.payoutRequests.set(payoutId, payout);
    logger.info(
      `Created payout request ${payoutId} for user ${userId}, amount: ${amount}`,
    );

    return payout;
  }

  async processPayout(payoutId: string): Promise<PayoutRequest> {
    const payout = this.payoutRequests.get(payoutId);
    if (!payout) {
      throw new Error(`Payout ${payoutId} not found`);
    }

    if (payout?.status !== "pending") {
      throw new Error(`Payout ${payoutId} is not in pending status`);
    }

    payout.status = "processing";
    payout.processedAt = new Date();
    this.payoutRequests.set(payoutId, payout);

    logger.info(`Processing payout ${payoutId}`);

    try {
      await this.executePayment(payout);

      payout.status = "completed";
      payout.completedAt = new Date();
      payout.transactionId = `txn_${crypto?.randomUUID().slice(0, 8)}`;

      const receipt = await this.generateReceipt(payout);
      payout.receiptUrl = `/receipts/${receipt?.receiptId}`;

      this.payoutRequests.set(payoutId, payout);
      logger.info(
        `Completed payout ${payoutId}, transaction: ${payout?.transactionId}`,
      );
    } catch (error) {
      payout.status = "failed";
      payout.failureReason =
        error instanceof Error ? error?.message : "Unknown error";
      this.payoutRequests.set(payoutId, payout);
      logger.warn(`Failed payout ${payoutId}: ${payout?.failureReason}`);
    }

    return payout;
  }

  private async executePayment(payout: PayoutRequest): Promise<void> {
    switch (payout?.method) {
      case "stripe":
        logger.info(`Executing Stripe payout for ${payout?.id}`);
        break;
      case "paypal":
        logger.info(`Executing PayPal payout for ${payout?.id}`);
        break;
      case "bank_transfer":
        logger.info(`Executing bank transfer for ${payout?.id}`);
        break;
      default:
        logger.info(`Executing ${payout?.method} payout for ${payout?.id}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async cancelPayout(payoutId: string, reason: string): Promise<PayoutRequest> {
    const payout = this.payoutRequests.get(payoutId);
    if (!payout) {
      throw new Error(`Payout ${payoutId} not found`);
    }

    if (payout?.status !== "pending") {
      throw new Error(`Cannot cancel payout in ${payout?.status} status`);
    }

    payout.status = "cancelled";
    payout.failureReason = reason;
    this.payoutRequests.set(payoutId, payout);

    logger.info(`Cancelled payout ${payoutId}: ${reason}`);
    return payout;
  }

  async getPayoutHistory(
    userId: string,
    options?: { limit?: number; status?: PayoutStatus },
  ): Promise<PayoutRequest[]> {
    let payouts = Array.from(this.payoutRequests.values())
      .filter((p) => p?.userId === userId)
      .sort((a, b) => b?.createdAt.getTime() - a?.createdAt.getTime());

    if (options?.status) {
      payouts = payouts?.filter((p) => p?.status === options?.status);
    }

    if (options?.limit) {
      payouts = payouts?.slice(0, options?.limit);
    }

    return payouts;
  }

  async getPayoutSchedule(userId: string): Promise<PayoutSchedule> {
    const preferences = await this.getPaymentPreferences(userId);
    const balance = await this.calculateAvailableBalance(userId);

    const frequency = preferences?.frequency || "monthly";
    const minimumThreshold =
      preferences?.minimumThreshold || this.getMinimumThreshold("USD");

    const today = new Date();
    let nextPayoutDate = new Date(today);

    switch (frequency) {
      case "monthly":
        nextPayoutDate?.setMonth(nextPayoutDate?.getMonth() + 1);
        nextPayoutDate?.setDate(1);
        break;
      case "quarterly":
        nextPayoutDate?.setMonth(
          Math.ceil((nextPayoutDate?.getMonth() + 1) / 3) * 3,
        );
        nextPayoutDate?.setDate(1);
        break;
      case "semi_annual":
        nextPayoutDate?.setMonth(
          Math.ceil((nextPayoutDate?.getMonth() + 1) / 6) * 6,
        );
        nextPayoutDate?.setDate(1);
        break;
      case "annual":
        nextPayoutDate?.setFullYear(nextPayoutDate?.getFullYear() + 1);
        nextPayoutDate?.setMonth(0);
        nextPayoutDate?.setDate(1);
        break;
    }

    const isEligible = balance?.available >= minimumThreshold;
    let eligibilityReason: string | undefined;

    if (!isEligible) {
      eligibilityReason = `Balance $${balance?.available.toFixed(2)} is below minimum threshold $${minimumThreshold?.toFixed(2)}`;
    }

    return {
      userId,
      frequency,
      nextPayoutDate,
      minimumThreshold,
      currentBalance: balance.available,
      isEligible,
      eligibilityReason,
    };
  }

  async generateReceipt(payout: PayoutRequest): Promise<PaymentReceipt> {
    const receiptId = crypto?.randomUUID();

    const receipt: PaymentReceipt = {
      receiptId,
      payoutId: payout.id,
      userId: payout.userId,
      amount: payout.netAmount,
      currency: payout.currency,
      method: payout.method,
      transactionId: payout.transactionId,
      createdAt: new Date(),
      statementPeriods: [],
    };

    this.receipts.set(receiptId, receipt);
    logger.info(`Generated receipt ${receiptId} for payout ${payout?.id}`);

    return receipt;
  }

  async getReceipt(receiptId: string): Promise<PaymentReceipt | null> {
    return this.receipts.get(receiptId) || null;
  }

  async getReceiptsByUser(userId: string): Promise<PaymentReceipt[]> {
    return Array.from(this.receipts.values())
      .filter((r) => r?.userId === userId)
      .sort((a, b) => b?.createdAt.getTime() - a?.createdAt.getTime());
  }

  /**
   * Loads every user's payment preferences directly from the DB — NOT from
   * the in-process read-through cache, which only holds users who happened
   * to have their prefs read during this process's lifetime. A cache-only
   * scan would silently skip auto-payout-eligible users the cache never
   * warmed for, so the drain job would never actually reach them.
   */
  private async getAllPaymentPreferences(): Promise<PaymentPreferences[]> {
    const rows = await db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(sql`${systemSettings.key} LIKE 'payment_prefs:%'`);

    const prefsList: PaymentPreferences[] = [];
    for (const row of rows) {
      if (!row?.value) continue;
      const prefs = row.value as unknown as PaymentPreferences;
      prefsList.push(prefs);
      // Opportunistically warm the cache so subsequent reads are fast.
      if (prefs?.userId) {
        this.paymentPreferences.set(prefs.userId, {
          prefs,
          cachedAt: Date.now(),
        });
      }
    }
    return prefsList;
  }

  /**
   * Auto-drains every seller's accumulated royalty balance once it crosses
   * their configured payout threshold. Without this running on a schedule,
   * `autoPayoutEnabled` in preferences was inert — balances would sit
   * unpaid indefinitely no matter how high they climbed.
   */
  async processScheduledPayouts(): Promise<{
    processed: number;
    failed: number;
    skipped: number;
  }> {
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    const allPreferences = await this.getAllPaymentPreferences();

    for (const prefs of allPreferences) {
      if (!prefs?.autoPayoutEnabled) {
        skipped++;
        continue;
      }

      try {
        const schedule = await this.getPayoutSchedule(prefs?.userId);

        if (!schedule?.isEligible) {
          skipped++;
          continue;
        }

        const payout = await this.requestPayout(
          prefs?.userId,
          schedule?.currentBalance,
          prefs?.preferredMethod,
        );

        await this.processPayout(payout?.id);
        processed++;
      } catch (error) {
        logger.warn(
          { err: error },
          `Failed scheduled payout for user ${prefs?.userId}:`,
        );
        failed++;
      }
    }

    logger.info(
      `Scheduled payouts complete: ${processed} processed, ${failed} failed, ${skipped} skipped`,
    );
    return { processed, failed, skipped };
  }

  getSupportedPaymentMethods(): PaymentMethod[] {
    return ["bank_transfer", "paypal", "stripe", "check", "crypto"];
  }

  getSupportedCurrencies(): string[] {
    return Object.keys(DEFAULT_THRESHOLDS);
  }

  getPaymentFrequencyOptions(): PaymentFrequency[] {
    return ["monthly", "quarterly", "semi_annual", "annual"];
  }
}

export const payoutService = new PayoutService();

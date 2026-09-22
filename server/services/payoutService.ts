import { db } from "../db.js";
import { systemSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { commerceRepository, commerceEngine } from "./commerce/runtime";
import { requestCommercePayout, payoutView } from "./commerce/payouts";
import { majorUnits } from "./commerce/contract";
import { legacyReconciliation } from "./commerce/readModels";

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
    reconciliation: Awaited<ReturnType<typeof legacyReconciliation>>;
  }> {
    const preferences=await this.getPaymentPreferences(userId);
    if(!preferences) throw new Error("Configure payout preferences before viewing scheduled payout balances");
    const currency=(preferences.currency||"USD").toLowerCase();
    const balance=await commerceRepository.balance(userId,currency);
    return {available:majorUnits(Math.max(0,balance.available),currency),pending:majorUnits(balance.reserved,currency),held:majorUnits(Math.max(0,-balance.available),currency),currency:currency.toUpperCase(),
      reconciliation:await legacyReconciliation(userId)};
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
    idempotencyKey?: string,
  ): Promise<PayoutRequest> {
    const prefs=await this.getPaymentPreferences(userId);
    if(!prefs) throw new Error("Configure payout preferences before requesting a payout");
    if(method && !["stripe","bank_transfer"].includes(method)) throw new Error("This payout method is not configured; select Stripe bank transfer");
    const result=await requestCommercePayout(userId,amount,(prefs.currency||"USD").toLowerCase(),idempotencyKey);
    return payoutView(await commerceRepository.get(result.payoutId)) as PayoutRequest;
  }

  async processPayout(payoutId: string): Promise<PayoutRequest> {
    await commerceEngine().execute(payoutId);
    const op=await commerceRepository.get(payoutId);
    if(!op) throw new Error("Payout not found");
    return payoutView(op) as PayoutRequest;
  }

  async cancelPayout(payoutId: string, reason: string): Promise<PayoutRequest> {
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500) {
      throw new Error("A cancellation reason of 1–500 characters is required");
    }
    const op=await commerceRepository.claim(payoutId);
    if(!op || op.transfer_id || op.payload.bankStarted || (op.attempts||0)>1) throw new Error("Payout already submitted; await provider reconciliation");
    await commerceRepository.release(op, reason.trim());
    return payoutView(await commerceRepository.get(payoutId)) as PayoutRequest;
  }

  async getPayoutHistory(
    userId: string,
    options?: { limit?: number; status?: PayoutStatus },
  ): Promise<PayoutRequest[]> {
    let payouts=(await commerceRepository.history(userId)).map(op=>payoutView(op) as PayoutRequest);
    if(options?.status) payouts=payouts.filter(p=>p.status===options.status);
    return payouts.slice(0,options?.limit||100);
  }

  async getPayoutSchedule(userId: string): Promise<PayoutSchedule> {
    const prefs=await this.getPaymentPreferences(userId);
    if(!prefs) throw new Error("Configure payout preferences before scheduling payouts");
    const balance=await this.calculateAvailableBalance(userId);
    const months={monthly:1,quarterly:3,semi_annual:6,annual:12}[prefs.frequency]||1;
    const schedule=await commerceRepository.due(userId,months);
    const minimum=prefs.minimumThreshold||this.getMinimumThreshold(prefs.currency);
    return {userId,frequency:prefs.frequency,nextPayoutDate:schedule.next,minimumThreshold:minimum,currentBalance:balance.available,
      isEligible:schedule.due&&balance.available>=minimum,eligibilityReason:!schedule.due?"Scheduled date has not arrived":balance.available<minimum?"Below threshold":undefined};
  }

  async generateReceipt(payout: PayoutRequest): Promise<PaymentReceipt> {
    const receipt=await this.getReceipt(payout.id);
    if(!receipt) throw new Error("A receipt requires a confirmed bank payout");
    return receipt;
  }

  async getReceipt(receiptId: string): Promise<PaymentReceipt | null> {
    const op=await commerceRepository.get(receiptId);
    if(!op || op.state!=="completed" || op.kind!=="withdrawal") return null;
    return {receiptId:op.id,payoutId:op.id,userId:op.user_id,amount:majorUnits(op.amount_cents,op.currency),currency:op.currency,
      method:"stripe",transactionId:op.provider_id,createdAt:new Date(op.created_at),statementPeriods:[]};
  }

  async getReceiptsByUser(userId: string): Promise<PaymentReceipt[]> {
    const receipts=await Promise.all((await commerceRepository.history(userId)).map(op=>this.getReceipt(op.id)));
    return receipts.filter((r):r is PaymentReceipt=>r!==null);
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
    const { retryCommerceWebhookInbox }=await import("../safety/stripeWebhookSecurity");
    await retryCommerceWebhookInbox();
    const drain=await commerceEngine().drain();
    let processed=drain.processed,failed=drain.failed,skipped=0;
    for(const prefs of await this.getAllPaymentPreferences()) {
      if(!prefs.autoPayoutEnabled) {skipped++;continue;}
      try {
        const months={monthly:1,quarterly:3,semi_annual:6,annual:12}[prefs.frequency]||1;
        const schedule=await commerceRepository.due(prefs.userId,months);
        const balance=await this.calculateAvailableBalance(prefs.userId);
        if(!schedule.due || balance.available<(prefs.minimumThreshold||this.getMinimumThreshold(prefs.currency))) {skipped++;continue;}
        await this.requestPayout(prefs.userId,balance.available,prefs.preferredMethod,`scheduled:${schedule.next.toISOString()}`);
        await commerceRepository.advance(prefs.userId,months);
        processed++;
      } catch(error) {logger.warn({err:error},"Scheduled commerce payout failed");failed++;}
    }
    return {processed,failed,skipped};
  }

  getSupportedPaymentMethods(): PaymentMethod[] {
    return ["bank_transfer", "stripe"];
  }

  getSupportedCurrencies(): string[] {
    return Object.keys(DEFAULT_THRESHOLDS);
  }

  getPaymentFrequencyOptions(): PaymentFrequency[] {
    return ["monthly", "quarterly", "semi_annual", "annual"];
  }
}

export const payoutService = new PayoutService();

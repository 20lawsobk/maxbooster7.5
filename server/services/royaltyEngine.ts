import { db } from "../db.js";
import { royaltyStatements, recoupmentAccounts, splitContracts, dspRates, exchangeRates, revenueEvents, projectRoyaltySplits, platformRoyaltyRates, type RoyaltyStatement, type InsertRoyaltyStatement } from "@shared/schema";
import { eq, and, gte, lte, desc, sql, isNull, or } from "drizzle-orm";
import { logger } from "../logger.js";
import crypto from "crypto";

export type RoyaltyType =
  | "streaming"
  | "mechanical"
  | "performance"
  | "sync"
  | "download"
  | "other";
export type FeeTier = "free" | "standard" | "pro" | "label" | "enterprise";
export type CalculationModel = "pro_rata" | "user_centric";

export interface StreamData {
  dsp: string;
  territory: string;
  streams: number;
  downloads?: number;
  currency: string;
  reportDate: Date;
  releaseId?: string;
  trackId?: string;
  isrcCode?: string;
  rawRevenue?: number;
  royaltyType?: RoyaltyType;
  isUserCentric?: boolean;
}

export interface RoyaltyCalculation {
  grossRevenue: number;
  currency: string;
  territory: string;
  dsp: string;
  streamCount: number;
  downloads: number;
  perStreamRate: number;
  effectiveRate: number;
  platformFee: number;
  distributionFee: number;
  netRevenue: number;
  netToArtist: number;
  exchangeRate: number;
  fxRate: number;
  fxDate: Date;
  usdEquivalent: number;
  royaltyType: RoyaltyType;
  calculationBreakdown: {
    baseRate: number;
    territoryMultiplier: number;
    tierBonus: number;
    feeDeductions: number;
    mechanicalShare: number;
    performanceShare: number;
  };
}

export interface MechanicalRoyalty {
  isrcCode: string;
  territoryCode: string;
  mechanicalRate: number;
  publisherShare: number;
  writerShare: number;
  totalMechanical: number;
  hfaRate?: number;
  mriRate?: number;
}

export interface PerformanceRoyalty {
  isrcCode: string;
  pro: string;
  performanceType: "broadcast" | "digital" | "live" | "background";
  publisherShare: number;
  writerShare: number;
  totalPerformance: number;
}

export interface SyncRoyalty {
  licenseId: string;
  licenseeType: "film" | "tv" | "commercial" | "game" | "trailer" | "other";
  masterFee: number;
  publishingFee: number;
  totalSyncFee: number;
  territory: string;
  termMonths: number;
  exclusivity: boolean;
}

export interface PeriodStatement {
  id: string;
  userId: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  platformFees: number;
  distributionFees: number;
  recoupmentDeductions: number;
  netRevenue: number;
  payableAmount: number;
  currency: string;
  usdEquivalent: number;
  totalStreams: number;
  totalDownloads: number;
  lineItems: LineItem[];
  territoryBreakdown: TerritoryBreakdown[];
  dspBreakdown: DspBreakdown[];
  status: "draft" | "pending" | "finalized" | "disputed" | "paid";
}

export interface LineItem {
  dsp: string;
  territory: string;
  streams: number;
  downloads: number;
  grossRevenue: number;
  effectiveRate: number;
  currency: string;
  exchangeRate: number;
}

export interface TerritoryBreakdown {
  territory: string;
  streams: number;
  revenue: number;
  percentage: number;
}

export interface DspBreakdown {
  dsp: string;
  streams: number;
  revenue: number;
  averageRate: number;
}

export interface RecoupmentResult {
  accountId: string;
  previousBalance: number;
  amountApplied: number;
  newBalance: number;
  isFullyRecouped: boolean;
  remainingEarnings: number;
}

export interface SplitBreakdown {
  participantId: string;
  participantName: string;
  role: string;
  splitPercentage: number;
  grossAmount: number;
  netAmount: number;
  recoupmentDeduction: number;
  payableAmount: number;
}

const DEFAULT_PLATFORM_FEE_RATE = 0.15;
const DEFAULT_DISTRIBUTION_FEE_RATE = 0.09;

export const FEE_TIERS: Record<
  FeeTier,
  {
    platformFee: number;
    distributionFee: number;
    name: string;
    description: string;
  }
> = {
  free: {
    platformFee: 0.2,
    distributionFee: 0.15,
    name: "Free",
    description: "Basic tier with standard fees",
  },
  standard: {
    platformFee: 0,
    distributionFee: 0,
    name: "Standard",
    description: "All-inclusive subscription — distribution included",
  },
  pro: {
    platformFee: 0,
    distributionFee: 0,
    name: "Pro",
    description: "All-inclusive subscription — distribution included",
  },
  label: {
    platformFee: 0,
    distributionFee: 0,
    name: "Label",
    description: "All-inclusive subscription — distribution included",
  },
  enterprise: {
    platformFee: 0,
    distributionFee: 0,
    name: "Enterprise",
    description: "All-inclusive subscription — distribution included",
  },
};

export const MECHANICAL_RATES: Record<
  string,
  { rate: number; type: "statutory" | "negotiated" }
> = {
  US: { rate: 0.00091, type: "statutory" },
  CA: { rate: 0.00083, type: "statutory" },
  GB: { rate: 0.00085, type: "statutory" },
  EU: { rate: 0.00077, type: "statutory" },
  AU: { rate: 0.00072, type: "statutory" },
  JP: { rate: 0.00068, type: "statutory" },
  default: { rate: 0.00065, type: "negotiated" },
};

export const PERFORMANCE_SPLITS: Record<
  string,
  { publisherShare: number; writerShare: number }
> = {
  ASCAP: { publisherShare: 0.5, writerShare: 0.5 },
  BMI: { publisherShare: 0.5, writerShare: 0.5 },
  SESAC: { publisherShare: 0.5, writerShare: 0.5 },
  GMR: { publisherShare: 0.5, writerShare: 0.5 },
  PRS: { publisherShare: 0.5, writerShare: 0.5 },
  GEMA: { publisherShare: 0.6, writerShare: 0.4 },
  SACEM: { publisherShare: 0.5, writerShare: 0.5 },
  JASRAC: { publisherShare: 0.5, writerShare: 0.5 },
  default: { publisherShare: 0.5, writerShare: 0.5 },
};

const DSP_BASE_RATES: Record<string, number> = {
  spotify: 0.003,
  apple_music: 0.01,
  youtube: 0.00069,
  youtube_music: 0.002,
  amazon_music: 0.004,
  tidal: 0.01284,
  deezer: 0.0064,
  pandora: 0.00133,
  soundcloud: 0.0025,
  tiktok: 0.002,
  facebook: 0.002,
  instagram: 0.002,
  default: 0.003,
};

const DSP_PREMIUM_MULTIPLIERS: Record<string, number> = {
  spotify: 1.5,
  apple_music: 1.3,
  tidal: 1.0,
  amazon_music: 1.4,
  youtube_music: 1.3,
  deezer: 1.2,
  default: 1.0,
};

const TERRITORY_MULTIPLIERS: Record<string, number> = {
  US: 1.0,
  GB: 0.95,
  CA: 0.9,
  AU: 0.88,
  DE: 0.92,
  FR: 0.9,
  JP: 0.85,
  BR: 0.4,
  IN: 0.15,
  MX: 0.35,
  ES: 0.8,
  IT: 0.82,
  NL: 0.88,
  SE: 0.95,
  NO: 0.95,
  DK: 0.92,
  FI: 0.9,
  KR: 0.7,
  ZA: 0.3,
  GLOBAL: 0.75,
  default: 0.6,
};


export class RoyaltyEngine {
  private platformFeeRate: number;
  private distributionFeeRate: number;

  constructor(
    platformFeeRate: number = DEFAULT_PLATFORM_FEE_RATE,
    distributionFeeRate: number = DEFAULT_DISTRIBUTION_FEE_RATE,
  ) {
    this.platformFeeRate = platformFeeRate;
    this.distributionFeeRate = distributionFeeRate;
  }

  async calculateStream(
    stream: StreamData,
    userTier: FeeTier = "standard",
  ): Promise<RoyaltyCalculation> {
    const dspSlug = stream?.dsp.toLowerCase().replace(/\s+/g, "_");

    const customRate = await this.getDspRate(
      dspSlug,
      stream?.territory,
      stream?.reportDate,
    );
    // Fallback chain: time-effective custom rate → admin-editable DB rate → hardcoded default
    let baseRate: number;
    let dbPremiumMultiplier: number = 1.0;
    if (customRate) {
      baseRate = customRate;
    } else {
      const dbRate = await this.getPlatformBaseRateFromDB(dspSlug);
      if (dbRate) {
        baseRate = dbRate?.baseRate;
        dbPremiumMultiplier = dbRate?.premiumMultiplier;
      } else {
        baseRate = DSP_BASE_RATES[dspSlug] || DSP_BASE_RATES?.default;
      }
    }

    const territoryMultiplier =
      TERRITORY_MULTIPLIERS[stream?.territory] || TERRITORY_MULTIPLIERS?.default;
    const premiumMultiplier = stream?.isUserCentric
      ? dbPremiumMultiplier || DSP_PREMIUM_MULTIPLIERS[dspSlug] || 1.0
      : 1.0;

    const effectiveRate = baseRate * territoryMultiplier * premiumMultiplier;
    const perStreamRate = effectiveRate;

    let grossRevenue: number;
    if (stream?.rawRevenue !== undefined) {
      grossRevenue = stream?.rawRevenue;
    } else {
      grossRevenue = stream?.streams * effectiveRate;
      if (stream?.downloads) {
        grossRevenue += stream?.downloads * (effectiveRate * 10);
      }
    }

    const exchangeRate = await this.getExchangeRate(
      stream?.currency,
      "USD",
      stream?.reportDate,
    );
    const grossRevenueUSD = grossRevenue * exchangeRate;

    const tierConfig = FEE_TIERS[userTier];
    const platformFee = grossRevenueUSD * tierConfig?.platformFee;
    const distributionFee = grossRevenueUSD * tierConfig?.distributionFee;
    const netRevenue = grossRevenueUSD - platformFee - distributionFee;

    const mechanicalRate =
      MECHANICAL_RATES[stream?.territory] || MECHANICAL_RATES?.default;
    const mechanicalShare = stream?.streams * mechanicalRate?.rate;
    const performanceShare = netRevenue * 0.5;

    const royaltyType: RoyaltyType = stream?.royaltyType || "streaming";

    return {
      grossRevenue,
      currency: stream.currency,
      territory: stream.territory,
      dsp: stream.dsp,
      streamCount: stream.streams,
      downloads: stream.downloads || 0,
      perStreamRate,
      effectiveRate,
      platformFee,
      distributionFee,
      netRevenue,
      netToArtist: netRevenue,
      exchangeRate,
      fxRate: exchangeRate,
      fxDate: stream.reportDate,
      usdEquivalent: grossRevenueUSD,
      royaltyType,
      calculationBreakdown: {
        baseRate,
        territoryMultiplier,
        tierBonus: premiumMultiplier - 1.0,
        feeDeductions: platformFee + distributionFee,
        mechanicalShare,
        performanceShare,
      },
    };
  }

  calculateMechanicalRoyalty(
    isrcCode: string,
    territory: string,
    streams: number,
    publisherPercentage: number = 0.5,
  ): MechanicalRoyalty {
    const mechanicalConfig =
      MECHANICAL_RATES[territory] || MECHANICAL_RATES?.default;
    const totalMechanical = streams * mechanicalConfig?.rate;
    const publisherShare = totalMechanical * publisherPercentage;
    const writerShare = totalMechanical * (1 - publisherPercentage);

    return {
      isrcCode,
      territoryCode: territory,
      mechanicalRate: mechanicalConfig.rate,
      publisherShare,
      writerShare,
      totalMechanical,
      hfaRate: territory === "US" ? 0.00091 : undefined,
      mriRate: territory === "US" ? 0.00091 : undefined,
    };
  }

  calculatePerformanceRoyalty(
    isrcCode: string,
    pro: string,
    performanceType: "broadcast" | "digital" | "live" | "background",
    totalRevenue: number,
  ): PerformanceRoyalty {
    const proConfig = PERFORMANCE_SPLITS[pro] || PERFORMANCE_SPLITS?.default;
    const totalPerformance = totalRevenue;
    const publisherShare = totalPerformance * proConfig?.publisherShare;
    const writerShare = totalPerformance * proConfig?.writerShare;

    return {
      isrcCode,
      pro,
      performanceType,
      publisherShare,
      writerShare,
      totalPerformance,
    };
  }

  calculateSyncRoyalty(
    licenseId: string,
    licenseeType: "film" | "tv" | "commercial" | "game" | "trailer" | "other",
    masterFee: number,
    publishingFee: number,
    territory: string,
    termMonths: number = 12,
    exclusivity: boolean = false,
  ): SyncRoyalty {
    const exclusivityMultiplier = exclusivity ? 1.5 : 1.0;
    const adjustedMasterFee = masterFee * exclusivityMultiplier;
    const adjustedPublishingFee = publishingFee * exclusivityMultiplier;

    return {
      licenseId,
      licenseeType,
      masterFee: adjustedMasterFee,
      publishingFee: adjustedPublishingFee,
      totalSyncFee: adjustedMasterFee + adjustedPublishingFee,
      territory,
      termMonths,
      exclusivity,
    };
  }

  getFeeTierInfo(tier: FeeTier): {
    platformFee: number;
    distributionFee: number;
    name: string;
    description: string;
  } {
    return FEE_TIERS[tier];
  }

  calculateNetByTier(
    grossRevenue: number,
    tier: FeeTier,
  ): {
    platformFee: number;
    distributionFee: number;
    netRevenue: number;
    savings: number;
  } {
    const tierConfig = FEE_TIERS[tier];
    const freeConfig = FEE_TIERS?.free;

    const platformFee = grossRevenue * tierConfig?.platformFee;
    const distributionFee = grossRevenue * tierConfig?.distributionFee;
    const netRevenue = grossRevenue - platformFee - distributionFee;

    const freeNetRevenue =
      grossRevenue -
      grossRevenue * freeConfig?.platformFee -
      grossRevenue * freeConfig?.distributionFee;
    const savings = netRevenue - freeNetRevenue;

    return { platformFee, distributionFee, netRevenue, savings };
  }

  async calculatePeriod(
    userId: string,
    startDate: Date,
    endDate: Date,
    releaseId?: string,
  ): Promise<PeriodStatement> {
    const period = this.formatPeriod(startDate);

    const dateConditions = and(
      gte(revenueEvents?.occurredAt, startDate),
      lte(revenueEvents?.occurredAt, endDate),
    );
    const whereClause = releaseId
      ? and(dateConditions, eq(revenueEvents?.projectId, releaseId))
      : dateConditions;

    const events = await db
      .select()
      .from(revenueEvents)
      .where(whereClause)
      .limit(5000);

    const lineItems: LineItem[] = [];
    const territoryMap = new Map<
      string,
      { streams: number; revenue: number }
    >();
    const dspMap = new Map<
      string,
      { streams: number; revenue: number; rates: number[] }
    >();

    let totalGross = 0;
    let totalPlatformFees = 0;
    let totalDistributionFees = 0;
    let totalStreams = 0;
    let totalDownloads = 0;

    for (const event of events) {
      const calculation = await this.calculateStream({
        dsp: event.source,
        territory: event.sourceType || "GLOBAL",
        streams: 1,
        currency: event.currency,
        reportDate: event.occurredAt,
        rawRevenue: Number(event?.amount),
      });

      const lineItem: LineItem = {
        dsp: event.source,
        territory: event.sourceType || "GLOBAL",
        streams: 1,
        downloads: 0,
        grossRevenue: Number(event?.amount),
        effectiveRate: calculation.effectiveRate,
        currency: event.currency,
        exchangeRate: calculation.exchangeRate,
      };
      lineItems?.push(lineItem);

      totalGross += calculation?.usdEquivalent;
      totalPlatformFees += calculation?.platformFee;
      totalDistributionFees += calculation?.distributionFee;
      totalStreams += 1;

      const territory = event?.sourceType || "GLOBAL";
      const existing = territoryMap?.get(territory) || {
        streams: 0,
        revenue: 0,
      };
      territoryMap?.set(territory, {
        streams: existing.streams + 1,
        revenue: existing.revenue + calculation?.usdEquivalent,
      });

      const dsp = event?.source;
      const dspData = dspMap?.get(dsp) || { streams: 0, revenue: 0, rates: [] };
      dspData.streams += 1;
      dspData.revenue += calculation?.usdEquivalent;
      dspData?.rates.push(calculation?.effectiveRate);
      dspMap?.set(dsp, dspData);
    }

    const recoupmentDeductions = await this.calculateRecoupmentDeductions(
      userId,
      totalGross - totalPlatformFees - totalDistributionFees,
    );

    const netRevenue = totalGross - totalPlatformFees - totalDistributionFees;
    const payableAmount = netRevenue - recoupmentDeductions;

    const territoryBreakdown: TerritoryBreakdown[] = Array.from(
      territoryMap?.entries(),
    ).map(([territory, data]) => ({
      territory,
      streams: data.streams,
      revenue: data.revenue,
      percentage: totalGross > 0 ? (data?.revenue / totalGross) * 100 : 0,
    }));

    const dspBreakdown: DspBreakdown[] = Array.from(dspMap?.entries()).map(
      ([dsp, data]) => ({
        dsp,
        streams: data.streams,
        revenue: data.revenue,
        averageRate:
          data?.rates.length > 0
            ? data?.rates.reduce((a, b) => a + b, 0) / data?.rates.length
            : 0,
      }),
    );

    const statementId = crypto?.randomUUID();

    return {
      id: statementId,
      userId,
      period,
      periodStart: startDate,
      periodEnd: endDate,
      grossRevenue: totalGross,
      platformFees: totalPlatformFees,
      distributionFees: totalDistributionFees,
      recoupmentDeductions,
      netRevenue,
      payableAmount,
      currency: "USD",
      usdEquivalent: totalGross,
      totalStreams,
      totalDownloads,
      lineItems,
      territoryBreakdown,
      dspBreakdown,
      status: "draft",
    };
  }

  async applyRecoupment(
    userId: string,
    amount: number,
  ): Promise<RecoupmentResult[]> {
    const activeAccounts = await db
      .select()
      .from(recoupmentAccounts)
      .where(
        and(
          eq(recoupmentAccounts?.userId, userId),
          eq(recoupmentAccounts?.isActive, true),
        ),
      )
      .orderBy(recoupmentAccounts?.priority)
      .limit(50);

    const results: RecoupmentResult[] = [];
    let remainingAmount = amount;

    await db?.transaction(async (tx) => {
      for (const account of activeAccounts) {
        if (remainingAmount <= 0) break;

        const balance = Number(account?.remainingBalance);
        if (balance <= 0) continue;

        const recoupmentRate = Number(account?.recoupmentRate) / 100;
        const maxRecoupable = remainingAmount * recoupmentRate;
        const amountToRecoup = Math.min(maxRecoupable, balance);

        const newBalance = balance - amountToRecoup;
        const isFullyRecouped = newBalance <= 0;

        await tx
          .update(recoupmentAccounts)
          .set({
            recoupedAmount: sql`${recoupmentAccounts?.recoupedAmount} + ${amountToRecoup}`,
            remainingBalance: String(newBalance),
            fullyRecoupedAt: isFullyRecouped ? new Date() : null,
            isActive: !isFullyRecouped,
            updatedAt: new Date(),
          })
          .where(eq(recoupmentAccounts?.id, account?.id));

        results?.push({
          accountId: account.id,
          previousBalance: balance,
          amountApplied: amountToRecoup,
          newBalance,
          isFullyRecouped,
          remainingEarnings: remainingAmount - amountToRecoup,
        });

        remainingAmount -= amountToRecoup;
      }
    });

    return results;
  }

  async getSplitBreakdown(releaseId: string): Promise<SplitBreakdown[]> {
    const contract = await db
      .select()
      .from(splitContracts)
      .where(
        and(
          eq(splitContracts?.releaseId, releaseId),
          eq(splitContracts?.status, "active"),
        ),
      )
      .limit(1);

    if (contract?.length === 0) {
      const projectSplits = await db
        .select()
        .from(projectRoyaltySplits)
        .where(eq(projectRoyaltySplits?.projectId, releaseId));

      return projectSplits?.map((split) => ({
        participantId: split.collaboratorId,
        participantName: split.collaboratorId,
        role: split.role || "collaborator",
        splitPercentage: Number(split?.splitPercentage),
        grossAmount: 0,
        netAmount: 0,
        recoupmentDeduction: 0,
        payableAmount: 0,
      }));
    }

    const activeContract = contract[0];
    const participants = activeContract?.participants as Array<{
      userId: string;
      name: string;
      role: string;
      splitPercentage: number;
    }>;

    return participants?.map((p) => ({
      participantId: p.userId,
      participantName: p.name,
      role: p.role,
      splitPercentage: p.splitPercentage,
      grossAmount: 0,
      netAmount: 0,
      recoupmentDeduction: 0,
      payableAmount: 0,
    }));
  }

  async calculateSplitAmounts(
    releaseId: string,
    grossRevenue: number,
    netRevenue: number,
  ): Promise<SplitBreakdown[]> {
    const splits = await this.getSplitBreakdown(releaseId);

    return await Promise?.all(
      splits?.map(async (split) => {
        const grossAmount = grossRevenue * (split?.splitPercentage / 100);
        const netAmount = netRevenue * (split?.splitPercentage / 100);

        const recoupmentDeduction = await this.calculateRecoupmentDeductions(
          split?.participantId,
          netAmount,
        );

        return {
          ...split,
          grossAmount,
          netAmount,
          recoupmentDeduction,
          payableAmount: netAmount - recoupmentDeduction,
        };
      }),
    );
  }

  async saveStatement(statement: PeriodStatement): Promise<RoyaltyStatement> {
    const insertData: InsertRoyaltyStatement = {
      userId: statement.userId,
      statementPeriod: statement.period,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      grossRevenue: String(statement?.grossRevenue),
      platformFees: String(statement?.platformFees),
      distributionFees: String(statement?.distributionFees),
      recoupmentDeductions: String(statement?.recoupmentDeductions),
      netRevenue: String(statement?.netRevenue),
      payableAmount: String(statement?.payableAmount),
      currency: statement.currency,
      usdEquivalent: String(statement?.usdEquivalent),
      totalStreams: statement.totalStreams,
      totalDownloads: statement.totalDownloads,
      status: statement.status,
      lineItems: statement.lineItems,
      territoryBreakdown: statement.territoryBreakdown,
      dspBreakdown: statement.dspBreakdown,
    };

    const [result] = await db
      .insert(royaltyStatements)
      .values(insertData)
      .returning();

    return result;
  }

  async getStatement(statementId: string): Promise<RoyaltyStatement | null> {
    const [statement] = await db
      .select()
      .from(royaltyStatements)
      .where(eq(royaltyStatements?.id, statementId))
      .limit(1);

    return statement || null;
  }

  async getUserStatements(
    userId: string,
    options?: { limit?: number; offset?: number; status?: string },
  ): Promise<RoyaltyStatement[]> {
    const conditions = [eq(royaltyStatements?.userId, userId)];
    if (options?.status)
      conditions?.push(
        eq(royaltyStatements?.status, options?.status as Record<string, unknown>),
      );

    return await db
      .select()
      .from(royaltyStatements)
      .where(and(...conditions))
      .orderBy(desc(royaltyStatements?.periodStart))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  async finalizeStatement(statementId: string): Promise<RoyaltyStatement> {
    const [updated] = await db
      .update(royaltyStatements)
      .set({
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(royaltyStatements?.id, statementId))
      .returning();

    return updated;
  }

  async markStatementPaid(statementId: string): Promise<RoyaltyStatement> {
    const [updated] = await db
      .update(royaltyStatements)
      .set({
        status: "paid",
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(royaltyStatements?.id, statementId))
      .returning();

    return updated;
  }

  private async getDspRate(
    dspSlug: string,
    territory: string,
    date: Date,
  ): Promise<number | null> {
    const [rate] = await db
      .select()
      .from(dspRates)
      .where(
        and(
          eq(dspRates?.dspSlug, dspSlug),
          or(
            eq(dspRates?.territory, territory),
            eq(dspRates?.territory, "GLOBAL"),
          ),
          lte(dspRates?.effectiveFrom, date),
          or(isNull(dspRates?.effectiveTo), gte(dspRates?.effectiveTo, date)),
        ),
      )
      .orderBy(desc(dspRates?.effectiveFrom))
      .limit(1);

    return rate ? Number(rate?.ratePerStream) : null;
  }

  // In-memory cache for platform_royalty_rates (TTL: 1 hour)
  private _platformRatesCache: {
    data: Map<string, { baseRate: number; premiumMultiplier: number }>;
    expiresAt: number;
  } | null = null;

  private async getPlatformBaseRateFromDB(
    dspSlug: string,
  ): Promise<{ baseRate: number; premiumMultiplier: number } | null> {
    const now = Date?.now();

    // Populate cache if empty or expired
    if (!this._platformRatesCache || now > this._platformRatesCache.expiresAt) {
      try {
        const rows = await db?.select().from(platformRoyaltyRates);
        const map = new Map<
          string,
          { baseRate: number; premiumMultiplier: number }
        >();
        for (const row of rows) {
          map?.set(row?.platform, {
            baseRate: row.baseRatePerStream,
            premiumMultiplier: row.premiumMultiplier,
          });
        }
        this._platformRatesCache = { data: map, expiresAt: now + 3600_000 };
      } catch (err) {
        logger.warn(
          { err: err },
          "Failed to load platform royalty rates from DB, using hardcoded fallback:",
        );
        return null;
      }
    }

    return this._platformRatesCache.data?.get(dspSlug) ?? null;
  }

  invalidatePlatformRatesCache() {
    this._platformRatesCache = null;
  }

  private async getExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    date: Date,
  ): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates?.fromCurrency, fromCurrency),
          eq(exchangeRates?.toCurrency, toCurrency),
          lte(exchangeRates?.rateDate, date),
        ),
      )
      .orderBy(desc(exchangeRates?.rateDate))
      .limit(1);

    return rate ? Number(rate?.rate) : 1;
  }

  private async calculateRecoupmentDeductions(
    userId: string,
    availableAmount: number,
  ): Promise<number> {
    const activeAccounts = await db
      .select()
      .from(recoupmentAccounts)
      .where(
        and(
          eq(recoupmentAccounts?.userId, userId),
          eq(recoupmentAccounts?.isActive, true),
        ),
      );

    let totalDeduction = 0;
    let remaining = availableAmount;

    for (const account of activeAccounts) {
      if (remaining <= 0) break;

      const balance = Number(account?.remainingBalance);
      const rate = Number(account?.recoupmentRate) / 100;
      const maxDeduction = remaining * rate;
      const actualDeduction = Math.min(maxDeduction, balance);

      totalDeduction += actualDeduction;
      remaining -= actualDeduction;
    }

    return totalDeduction;
  }

  private formatPeriod(date: Date): string {
    const year = date?.getFullYear();
    const month = String(date?.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  async seedDefaultDspRates(): Promise<void> {
    const existingRates = await db?.select().from(dspRates).limit(1);
    if (existingRates?.length > 0) {
      logger.info("DSP rates already seeded");
      return;
    }

    const now = new Date();
    const ratesToInsert = Object.entries(DSP_BASE_RATES).map(([dsp, rate]) => ({
      dspName: dsp.charAt(0).toUpperCase() + dsp?.slice(1).replace(/_/g, " "),
      dspSlug: dsp,
      territory: "GLOBAL",
      ratePerStream: String(rate),
      currency: "USD",
      effectiveFrom: now,
    }));

    await db?.insert(dspRates).values(ratesToInsert);
    logger.info(`Seeded ${ratesToInsert?.length} default DSP rates`);
  }
}

export const royaltyEngine = new RoyaltyEngine();

// @ts-nocheck
import { db } from "../db.js";
import { royaltyDisputes, royaltyStatements, users, type RoyaltyDispute, type InsertRoyaltyDispute } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import crypto from "crypto";
import { emailService } from "./emailService.js";

export interface CreateDisputeInput {
  userId: string;
  statementId?: string;
  releaseId?: string;
  disputeType: string;
  category: string;
  subject: string;
  description: string;
  disputedAmount?: number;
  disputedStreams?: number;
  affectedPeriod?: string;
  evidenceUrls?: string[];
  supportingDocuments?: Array<{
    name: string;
    url: string;
    type: string;
    uploadedAt: string;
  }>;
}

export interface UpdateDisputeInput {
  status?: "open" | "under_review" | "resolved" | "rejected" | "escalated";
  priority?: string;
  assignedTo?: string;
  internalNote?: {
    note: string;
    addedBy: string;
  };
  resolution?: {
    outcome: "approved" | "rejected" | "partial" | "withdrawn";
    adjustedAmount?: number;
    explanation: string;
    resolvedBy: string;
  };
}

export interface DisputeMessage {
  message: string;
  from: string;
  to: string;
  type: "email" | "internal" | "system";
}

export interface DisputeStats {
  total: number;
  open: number;
  underReview: number;
  resolved: number;
  rejected: number;
  escalated: number;
  averageResolutionDays: number;
  totalDisputedAmount: number;
  totalAdjustedAmount: number;
}

export interface FundHold {
  id: string;
  disputeId: string;
  userId: string;
  amount: number;
  currency: string;
  reason: string;
  createdAt: Date;
  releasedAt?: Date;
  status: "held" | "released" | "forfeited";
}

export interface DisputeFundHoldResult {
  holdId: string;
  disputeId: string;
  amountHeld: number;
  currency: string;
  holdStatus: "created" | "already_exists" | "failed";
  message: string;
}

const DISPUTE_TYPES = [
  "missing_streams",
  "incorrect_calculation",
  "missing_territory",
  "wrong_rate",
  "duplicate_deduction",
  "incorrect_split",
  "recoupment_error",
  "currency_issue",
  "other",
];

const DISPUTE_CATEGORIES = [
  "streaming",
  "downloads",
  "mechanical",
  "performance",
  "sync",
  "splits",
  "recoupment",
  "tax",
  "payout",
  "other",
];

export class RoyaltyDisputeService {
  async createDispute(input: CreateDisputeInput): Promise<RoyaltyDispute> {
    if (!DISPUTE_TYPES?.includes(input?.disputeType)) {
      throw new Error(
        `Invalid dispute type: ${input?.disputeType}. Valid types: ${DISPUTE_TYPES?.join(", ")}`,
      );
    }

    if (!DISPUTE_CATEGORIES?.includes(input?.category)) {
      throw new Error(
        `Invalid category: ${input?.category}. Valid categories: ${DISPUTE_CATEGORIES?.join(", ")}`,
      );
    }

    const insertData = {
      userId: input.userId,
      statementId: input.statementId,
      releaseId: input.releaseId,
      type: input.disputeType,
      status: "open",
      priority: "normal",
      subject: input.subject,
      description: input.description,
      amount: input.disputedAmount
        ? String(input?.disputedAmount)
        : undefined,
      period: input.affectedPeriod,
      evidenceUrls: input.evidenceUrls,
      supportingDocuments: input.supportingDocuments,
      internalNotes: [],
      communicationLog: [
        {
          message: "Dispute submitted",
          from: "system",
          to: input.userId,
          sentAt: new Date().toISOString(),
          type: "system" as const,
        },
      ],
    };

    const [dispute] = await db
      .insert(royaltyDisputes)
      .values(insertData as any)
      .returning();

    logger.info(
      `Created dispute ${dispute?.id} for user ${input?.userId}, type: ${input?.disputeType}`,
    );

    await this.notifyAdminOfNewDispute(dispute);

    return dispute;
  }

  async getDisputeById(disputeId: string): Promise<RoyaltyDispute | null> {
    const [dispute] = await db
      .select()
      .from(royaltyDisputes)
      .where(eq(royaltyDisputes.id, disputeId))
      .limit(1);

    return dispute || null;
  }

  async getDisputesByUser(
    userId: string,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<RoyaltyDispute[]> {
    const conditions = [eq(royaltyDisputes.userId, userId)];
    if (options?.status)
      conditions?.push(
        eq(royaltyDisputes.status, options?.status),
      );

    return await db
      .select()
      .from(royaltyDisputes)
      .where(and(...conditions))
      .orderBy(desc(royaltyDisputes.createdAt))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  async getDisputesByStatement(statementId: string): Promise<RoyaltyDispute[]> {
    // statement_id column not in current schema; filter via raw SQL
    return await db
      .select()
      .from(royaltyDisputes)
      .where(sql`statement_id = ${statementId}`)
      .orderBy(desc(royaltyDisputes.createdAt));
  }

  async getAllDisputes(options?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<RoyaltyDispute[]> {
    const conditions = [];
    if (options?.status)
      conditions?.push(
        eq(royaltyDisputes.status, options?.status),
      );

    return await db
      .select()
      .from(royaltyDisputes)
      .where(conditions?.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(royaltyDisputes.createdAt))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  async updateDispute(
    disputeId: string,
    input: UpdateDisputeInput,
    updatedBy: string,
  ): Promise<RoyaltyDispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const updates: Partial<typeof royaltyDisputes.$inferInsert> & Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input?.status) {
      updates.status = input?.status;

      if (input?.status === "resolved" || input?.status === "rejected") {
        (updates as any).resolvedAt = new Date();
      }
    }

    if (input?.priority) {
      (updates as any).priority = input?.priority;
    }

    if (input?.assignedTo) {
      (updates as any).assignedTo = input?.assignedTo;
    }

    if (input?.internalNote) {
      const existingNotes =
        ((dispute as any)?.internalNotes as Array<{
          note: string;
          addedBy: string;
          addedAt: string;
        }>) || [];
      (updates as any).internalNotes = [
        ...existingNotes,
        {
          note: input.internalNote.note,
          addedBy: input.internalNote.addedBy,
          addedAt: new Date().toISOString(),
        },
      ];
    }

    if (input?.resolution) {
      (updates as any).resolution = JSON.stringify({
        ...input?.resolution,
        resolvedAt: new Date().toISOString(),
      });
      updates.status =
        input?.resolution.outcome === "approved" ||
        input?.resolution.outcome === "partial"
          ? "resolved"
          : "rejected";
      (updates as any).resolvedAt = new Date();
    }

    const [updated] = await db
      .update(royaltyDisputes)
      .set(updates as any)
      .where(eq(royaltyDisputes.id, disputeId))
      .returning();

    await this.addSystemMessage(
      disputeId,
      `Dispute updated by ${updatedBy}`,
      updatedBy,
    );

    logger.info(`Updated dispute ${disputeId}, status: ${updated?.status}`);

    return updated;
  }

  async addMessage(
    disputeId: string,
    message: DisputeMessage,
  ): Promise<RoyaltyDispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const existingLog =
      ((dispute as any)?.communicationLog as Array<
        typeof message & { sentAt: string }
      >) || [];
    const updatedLog = [
      ...existingLog,
      {
        ...message,
        sentAt: new Date().toISOString(),
      },
    ];

    const [updated] = await db
      .update(royaltyDisputes)
      .set({
        communicationLog: updatedLog,
        updatedAt: new Date(),
      } as any)
      .where(eq(royaltyDisputes.id, disputeId))
      .returning();

    logger.info(`Added message to dispute ${disputeId} from ${message?.from}`);

    return updated;
  }

  async addEvidence(
    disputeId: string,
    evidence: { name: string; url: string; type: string },
  ): Promise<RoyaltyDispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const existingDocs =
      ((dispute as any)?.supportingDocuments as Array<{
        name: string;
        url: string;
        type: string;
        uploadedAt: string;
      }>) || [];

    const [updated] = await db
      .update(royaltyDisputes)
      .set({
        supportingDocuments: [
          ...existingDocs,
          {
            ...evidence,
            uploadedAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      } as any)
      .where(eq(royaltyDisputes.id, disputeId))
      .returning();

    logger.info(`Added evidence to dispute ${disputeId}: ${evidence?.name}`);

    return updated;
  }

  async escalateDispute(
    disputeId: string,
    escalatedTo: string,
    reason: string,
    escalatedBy: string,
  ): Promise<RoyaltyDispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const existingNotes =
      ((dispute as any)?.internalNotes as Array<{
        note: string;
        addedBy: string;
        addedAt: string;
      }>) || [];

    const [updated] = await db
      .update(royaltyDisputes)
      .set({
        status: "escalated",
        priority: "high",
        escalatedTo,
        internalNotes: [
          ...existingNotes,
          {
            note: `Escalated to ${escalatedTo}: ${reason}`,
            addedBy: escalatedBy,
            addedAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      } as any)
      .where(eq(royaltyDisputes.id, disputeId))
      .returning();

    logger.info(`Escalated dispute ${disputeId} to ${escalatedTo}`);

    return updated;
  }

  async resolveDispute(
    disputeId: string,
    resolution: {
      outcome: "approved" | "rejected" | "partial" | "withdrawn";
      adjustedAmount?: number;
      explanation: string;
      resolvedBy: string;
    },
  ): Promise<RoyaltyDispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const resolutionData = {
      ...resolution,
      resolvedAt: new Date().toISOString(),
    };

    const status = resolution?.outcome === "rejected" ? "rejected" : "resolved";

    const [updated] = await db
      .update(royaltyDisputes)
      .set({
        status,
        resolution: JSON.stringify(resolutionData),
        updatedAt: new Date(),
      } as any)
      .where(eq(royaltyDisputes.id, disputeId))
      .returning();

    if (resolution?.adjustedAmount && (dispute as any)?.statementId) {
      await this.applyStatementAdjustment(
        (dispute as any)?.statementId,
        resolution?.adjustedAmount,
      );
    }

    await this.notifyUserOfResolution(updated);

    logger.info(
      `Resolved dispute ${disputeId} with outcome: ${resolution?.outcome}`,
    );

    return updated;
  }

  async withdrawDispute(
    disputeId: string,
    userId: string,
  ): Promise<RoyaltyDispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (dispute?.userId !== userId) {
      throw new Error("Only the dispute creator can withdraw a dispute");
    }

    if (dispute?.status === "resolved" || dispute?.status === "rejected") {
      throw new Error("Cannot withdraw a resolved or rejected dispute");
    }

    return await this.resolveDispute(disputeId, {
      outcome: "withdrawn",
      explanation: "Withdrawn by user",
      resolvedBy: userId,
    });
  }

  async getDisputeStats(options?: { userId?: string }): Promise<DisputeStats> {
    const disputes = await (options?.userId
      ? db.select().from(royaltyDisputes).where(eq(royaltyDisputes.userId, options.userId))
      : db.select().from(royaltyDisputes));

    const statusCounts = {
      open: 0,
      underReview: 0,
      resolved: 0,
      rejected: 0,
      escalated: 0,
    };

    let totalResolutionDays = 0;
    let resolvedCount = 0;
    let totalDisputedAmount = 0;
    let totalAdjustedAmount = 0;

    for (const dispute of disputes) {
      switch (dispute?.status) {
        case "open":
          statusCounts.open++;
          break;
        case "under_review":
          statusCounts.underReview++;
          break;
        case "resolved":
          statusCounts.resolved++;
          break;
        case "rejected":
          statusCounts.rejected++;
          break;
        case "escalated":
          statusCounts.escalated++;
          break;
      }

      if ((dispute as any)?.disputedAmount) {
        totalDisputedAmount += Number((dispute as any)?.disputedAmount);
      }

      if ((dispute as any)?.resolvedAt && (dispute as any)?.submittedAt) {
        const days =
          ((dispute as any)?.resolvedAt.getTime() - (dispute as any)?.submittedAt.getTime()) /
          (1000 * 60 * 60 * 24);
        totalResolutionDays += days;
        resolvedCount++;
      }

      if (dispute?.resolution) {
        const resolution = dispute?.resolution as { adjustedAmount?: number };
        if (resolution?.adjustedAmount) {
          totalAdjustedAmount += resolution?.adjustedAmount;
        }
      }
    }

    return {
      total: disputes.length,
      ...statusCounts,
      averageResolutionDays:
        resolvedCount > 0 ? totalResolutionDays / resolvedCount : 0,
      totalDisputedAmount,
      totalAdjustedAmount,
    };
  }

  private async addSystemMessage(
    disputeId: string,
    message: string,
    _triggeredBy: string,
  ): Promise<void> {
    await this.addMessage(disputeId, {
      message,
      from: "system",
      to: "all",
      type: "system",
    });
  }

  private async applyStatementAdjustment(
    statementId: string,
    adjustmentAmount: number,
  ): Promise<void> {
    const [statement] = await db
      .select()
      .from(royaltyStatements)
      .where(eq(royaltyStatements.id, statementId))
      .limit(1);

    if (!statement) {
      logger.warn(`Statement ${statementId} not found for adjustment`);
      return;
    }

    const existingAuditTrail =
      ((statement as any)?.auditTrail as Array<{
        action: string;
        timestamp: string;
        userId: string;
        details: string;
      }>) || [];

    // royaltyStatements schema uses totalEarnings; adjust via raw SQL for missing columns
    await db
      .update(royaltyStatements)
      .set({
        totalEarnings: sql`(COALESCE(total_earnings::numeric, 0) + ${adjustmentAmount})::text`,
      } as any)
      .where(eq(royaltyStatements.id, statementId));

    logger.info(
      `Applied adjustment of ${adjustmentAmount} to statement ${statementId}`,
    );
  }

  private async notifyAdminOfNewDispute(
    dispute: RoyaltyDispute,
  ): Promise<void> {
    try {
      logger.info(
        `New dispute notification would be sent for dispute ${dispute?.id}`,
      );
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to send admin notification for new dispute:",
      );
    }
  }

  private async notifyUserOfResolution(dispute: RoyaltyDispute): Promise<void> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, dispute?.userId))
        .limit(1);

      if (user?.email) {
        const resolution = dispute?.resolution as {
          outcome: string;
          explanation: string;
        } | null;
        await (emailService as any)?.sendTemplatedEmail(user?.email, "dispute_resolved", {
          userName: user.firstName || user?.username || "User",
          disputeId: dispute.id,
          outcome: resolution!.outcome || "unknown",
          explanation: resolution!.explanation || "",
        });
      }
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to send user notification for resolved dispute:",
      );
    }
  }

  getDisputeTypes(): string[] {
    return DISPUTE_TYPES;
  }

  getDisputeCategories(): string[] {
    return DISPUTE_CATEGORIES;
  }

  private fundHolds: Map<string, FundHold> = new Map();
  private _holdCleanupStarted = false;
  private static readonly MAX_ACTIVE_FUND_HOLDS = 200_000;
  private static readonly SETTLED_HOLD_TTL_MS = 48 * 60 * 60 * 1000;

  private startFundHoldCleanup(): void {
    setInterval(
      () => {
        const cutoff = Date?.now() - RoyaltyDisputeService.SETTLED_HOLD_TTL_MS;
        for (const [id, hold] of this.fundHolds) {
          if (
            hold?.status !== "held" &&
            hold?.releasedAt &&
            hold?.releasedAt.getTime() < cutoff
          ) {
            this.fundHolds.delete(id);
          }
        }
      },
      6 * 60 * 60 * 1000,
    ).unref();
  }

  async createFundHold(
    disputeId: string,
    amount: number,
    currency: string = "USD",
  ): Promise<DisputeFundHoldResult> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      return {
        holdId: "",
        disputeId,
        amountHeld: 0,
        currency,
        holdStatus: "failed",
        message: `Dispute ${disputeId} not found`,
      };
    }

    const existingHold = Array.from(this.fundHolds.values()).find(
      (h) => h?.disputeId === disputeId && h?.status === "held",
    );

    if (existingHold) {
      return {
        holdId: existingHold.id,
        disputeId,
        amountHeld: existingHold.amount,
        currency: existingHold.currency,
        holdStatus: "already_exists",
        message: "Fund hold already exists for this dispute",
      };
    }

    const holdId = crypto?.randomUUID();
    const hold: FundHold = {
      id: holdId,
      disputeId,
      userId: dispute.userId,
      amount,
      currency,
      reason: `Automatic hold for dispute: ${dispute?.subject}`,
      createdAt: new Date(),
      status: "held",
    };

    if (!this._holdCleanupStarted) {
      this._holdCleanupStarted = true;
      this.startFundHoldCleanup();
    }
    if (this.fundHolds.size >= RoyaltyDisputeService.MAX_ACTIVE_FUND_HOLDS) {
      logger.error(
        `[RoyaltyDispute] fundHolds at capacity (${this.fundHolds.size}) — cannot create new hold for dispute ${disputeId}`,
      );
      return {
        holdId: "",
        disputeId,
        amountHeld: 0,
        currency,
        holdStatus: "failed",
        message: "Fund hold capacity reached",
      };
    }
    this.fundHolds.set(holdId, hold);

    await this.addSystemMessage(
      disputeId,
      `Funds held: $${amount?.toFixed(2)} ${currency}`,
      "system",
    );
    logger.info(
      `Created fund hold ${holdId} for dispute ${disputeId}, amount: ${amount}`,
    );

    return {
      holdId,
      disputeId,
      amountHeld: amount,
      currency,
      holdStatus: "created",
      message: "Fund hold created successfully",
    };
  }

  async releaseFundHold(
    holdId: string,
    reason: string = "Dispute resolved",
  ): Promise<FundHold | null> {
    const hold = this.fundHolds.get(holdId);
    if (!hold) {
      logger.warn(`Fund hold ${holdId} not found`);
      return null;
    }

    hold.status = "released";
    hold.releasedAt = new Date();
    this.fundHolds.set(holdId, hold);

    await this.addSystemMessage(
      hold?.disputeId,
      `Funds released: $${hold?.amount.toFixed(2)} ${hold?.currency} - ${reason}`,
      "system",
    );
    logger.info(`Released fund hold ${holdId}, reason: ${reason}`);

    return hold;
  }

  async forfeitFundHold(
    holdId: string,
    reason: string,
  ): Promise<FundHold | null> {
    const hold = this.fundHolds.get(holdId);
    if (!hold) {
      logger.warn(`Fund hold ${holdId} not found`);
      return null;
    }

    hold.status = "forfeited";
    hold.releasedAt = new Date();
    this.fundHolds.set(holdId, hold);

    await this.addSystemMessage(
      hold?.disputeId,
      `Funds forfeited: $${hold?.amount.toFixed(2)} ${hold?.currency} - ${reason}`,
      "system",
    );
    logger.info(`Forfeited fund hold ${holdId}, reason: ${reason}`);

    return hold;
  }

  async getFundHoldsForDispute(disputeId: string): Promise<FundHold[]> {
    return Array.from(this.fundHolds.values()).filter(
      (h) => h?.disputeId === disputeId,
    );
  }

  async getFundHoldsForUser(userId: string): Promise<FundHold[]> {
    return Array.from(this.fundHolds.values()).filter(
      (h) => h?.userId === userId,
    );
  }

  async getTotalHeldAmount(
    userId: string,
  ): Promise<{ total: number; currency: string; holds: FundHold[] }> {
    const holds = await this.getFundHoldsForUser(userId);
    const activeHolds = holds?.filter((h) => h?.status === "held");
    const total = activeHolds?.reduce((sum, h) => sum + h?.amount, 0);

    return {
      total,
      currency: "USD",
      holds: activeHolds,
    };
  }

  async autoHoldDisputedFunds(
    disputeId: string,
  ): Promise<DisputeFundHoldResult | null> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute || (!dispute as any)?.disputedAmount) {
      return null;
    }

    const amount = Number((dispute as any)?.disputedAmount);
    if (amount <= 0) {
      return null;
    }

    return await this.createFundHold(disputeId, amount, "USD");
  }

  async releaseHoldsOnResolution(disputeId: string): Promise<FundHold[]> {
    const holds = await this.getFundHoldsForDispute(disputeId);
    const releasedHolds: FundHold[] = [];

    for (const hold of holds) {
      if (hold?.status === "held") {
        const released = await this.releaseFundHold(
          hold?.id,
          "Dispute resolved",
        );
        if (released) {
          releasedHolds?.push(released);
        }
      }
    }

    return releasedHolds;
  }
}

export const royaltyDisputeService = new RoyaltyDisputeService();

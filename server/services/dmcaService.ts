import { db } from '../db.js';
import {
  dmcaNotices,
  dmcaStrikes,
  legalHolds,
  users,
  projects,
  type DMCANotice,
  type DMCAStrike,
  type LegalHold,
  type InsertDMCANotice,
  type InsertDMCAStrike,
  type InsertLegalHold,
} from '@shared/schema';
import { eq, and, desc, gte, sql, count } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { emailService } from './emailService.js';

export type DMCANoticeType = 'takedown' | 'counter';
export type DMCANoticeStatus = 'pending' | 'processed' | 'disputed' | 'restored' | 'rejected';
export type DMCAContentType = 'track' | 'artwork' | 'video' | 'other';

export interface DMCANoticeSubmission {
  type: DMCANoticeType;
  contentId: string;
  contentType: DMCAContentType;
  claimantName: string;
  claimantEmail: string;
  claimantAddress: string;
  claimantPhone?: string;
  originalWorkUrl: string;
  originalWorkDescription?: string;
  infringingUrl?: string;
  signature: string;
  goodFaithStatement: boolean;
  accuracyStatement: boolean;
  perjuryStatement: boolean;
}

export interface CounterNoticeSubmission {
  originalNoticeId: string;
  claimantName: string;
  claimantEmail: string;
  claimantAddress: string;
  counterNoticeReason: string;
  signature: string;
  goodFaithStatement: boolean;
  perjuryStatement: boolean;
}

export interface StrikeInfo {
  userId: string;
  activeStrikes: number;
  totalStrikes: number;
  strikes: DMCAStrike[];
  isRepeatInfringer: boolean;
  accountStatus: 'good_standing' | 'warned' | 'suspended' | 'terminated';
}

export interface LegalHoldRequest {
  contentId: string;
  contentType: string;
  holdReason: string;
  holdType: 'dmca' | 'legal' | 'investigation' | 'preservation';
  dmcaNoticeId?: string;
}

const MAX_STRIKES = 3;
const STRIKE_EXPIRATION_DAYS = 365;
const COUNTER_NOTICE_WAIT_DAYS = 10;

export class DMCAService {
  async submitNotice(submission: DMCANoticeSubmission): Promise<DMCANotice> {
    if (!submission.goodFaithStatement || !submission.accuracyStatement || !submission.perjuryStatement) {
      throw new Error('All required statements must be affirmed');
    }

    if (!this.isValidEmail(submission.claimantEmail)) {
      throw new Error('Invalid claimant email address');
    }

    const contentOwner = await this.findContentOwner(submission.contentId, submission.contentType);

    const [notice] = await db
      .insert(dmcaNotices)
      .values({
        type: submission.type,
        status: 'pending',
        contentId: submission.contentId,
        contentType: submission.contentType,
        contentOwnerId: contentOwner?.id,
        claimantName: submission.claimantName,
        claimantEmail: submission.claimantEmail,
        claimantAddress: submission.claimantAddress,
        claimantPhone: submission.claimantPhone,
        originalWorkUrl: submission.originalWorkUrl,
        originalWorkDescription: submission.originalWorkDescription,
        infringingUrl: submission.infringingUrl,
        signature: submission.signature,
        goodFaithStatement: submission.goodFaithStatement,
        accuracyStatement: submission.accuracyStatement,
        perjuryStatement: submission.perjuryStatement,
      })
      .returning();

    logger.info(`DMCA notice submitted: ${notice.id}, type: ${notice.type}`);

    await this.notifyContentOwner(notice);
    await this.notifyAdministrators(notice);

    return notice;
  }

  async submitCounterNotice(submission: CounterNoticeSubmission): Promise<DMCANotice> {
    const originalNotice = await this.getNotice(submission.originalNoticeId);
    if (!originalNotice) {
      throw new Error('Original DMCA notice not found');
    }

    if (originalNotice.type !== 'takedown') {
      throw new Error('Can only counter a takedown notice');
    }

    if (originalNotice.status !== 'processed') {
      throw new Error('Can only counter a processed takedown notice');
    }

    if (!submission.goodFaithStatement || !submission.perjuryStatement) {
      throw new Error('All required statements must be affirmed');
    }

    const [counterNotice] = await db
      .insert(dmcaNotices)
      .values({
        type: 'counter',
        status: 'pending',
        contentId: originalNotice.contentId,
        contentType: originalNotice.contentType,
        contentOwnerId: originalNotice.contentOwnerId,
        claimantName: submission.claimantName,
        claimantEmail: submission.claimantEmail,
        claimantAddress: submission.claimantAddress,
        originalWorkUrl: originalNotice.originalWorkUrl,
        signature: submission.signature,
        goodFaithStatement: submission.goodFaithStatement,
        perjuryStatement: submission.perjuryStatement,
        relatedNoticeId: originalNotice.id,
        counterNoticeReason: submission.counterNoticeReason,
      })
      .returning();

    await db
      .update(dmcaNotices)
      .set({ status: 'disputed' })
      .where(eq(dmcaNotices.id, originalNotice.id));

    logger.info(`Counter-notice submitted: ${counterNotice.id} for original: ${originalNotice.id}`);

    await this.notifyOriginalClaimant(counterNotice, originalNotice);
    await this.notifyAdministrators(counterNotice);
    await this.scheduleContentRestoration(counterNotice);

    return counterNotice;
  }

  async processNotice(noticeId: string, adminId: string, action: 'approve' | 'reject', notes?: string): Promise<DMCANotice> {
    const notice = await this.getNotice(noticeId);
    if (!notice) {
      throw new Error('Notice not found');
    }

    if (notice.status !== 'pending') {
      throw new Error('Notice has already been processed');
    }

    if (action === 'approve') {
      if (notice.type === 'takedown') {
        await this.executeTakedown(notice);
        if (notice.contentOwnerId) {
          await this.addStrike(notice.contentOwnerId, notice.id, 'DMCA takedown processed');
        }
      } else {
        await this.executeRestoration(notice);
      }
    }

    const newStatus = action === 'approve' ? 'processed' : 'rejected';

    const [updatedNotice] = await db
      .update(dmcaNotices)
      .set({
        status: newStatus,
        processedAt: new Date(),
        processedBy: adminId,
        adminNotes: notes,
      })
      .where(eq(dmcaNotices.id, noticeId))
      .returning();

    logger.info(`DMCA notice ${noticeId} ${action}ed by ${adminId}`);

    return updatedNotice;
  }

  async executeTakedown(notice: DMCANotice): Promise<void> {
    await this.createLegalHold({
      contentId: notice.contentId,
      contentType: notice.contentType,
      holdReason: `DMCA takedown notice ${notice.id}`,
      holdType: 'dmca',
      dmcaNoticeId: notice.id,
    });

    logger.info(`Content ${notice.contentId} taken down due to DMCA notice ${notice.id}`);
  }

  async executeRestoration(notice: DMCANotice): Promise<void> {
    await db
      .update(legalHolds)
      .set({
        status: 'released',
      })
      .where(
        and(
          eq(legalHolds.contentId, notice.contentId),
          eq(legalHolds.status, 'active')
        )
      );

    const [updatedNotice] = await db
      .update(dmcaNotices)
      .set({
        status: 'restored',
        restoredAt: new Date(),
      })
      .where(eq(dmcaNotices.id, notice.id))
      .returning();

    if (notice.relatedNoticeId) {
      await db
        .update(dmcaNotices)
        .set({ status: 'restored' })
        .where(eq(dmcaNotices.id, notice.relatedNoticeId));
    }

    logger.info(`Content ${notice.contentId} restored after counter-notice ${notice.id}`);
  }

  async addStrike(userId: string, noticeId: string, reason: string): Promise<DMCAStrike> {
    const strikeInfo = await this.getStrikeInfo(userId);
    const newStrikeNumber = strikeInfo.activeStrikes + 1;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + STRIKE_EXPIRATION_DAYS);

    const [strike] = await db
      .insert(dmcaStrikes)
      .values({
        userId,
        noticeId,
        strikeNumber: newStrikeNumber,
        reason,
        isActive: true,
        expiresAt,
      })
      .returning();

    logger.info(`Strike ${newStrikeNumber} added for user ${userId}, notice: ${noticeId}`);

    if (newStrikeNumber >= MAX_STRIKES) {
      await this.handleRepeatInfringer(userId);
    } else if (newStrikeNumber === MAX_STRIKES - 1) {
      await this.sendFinalWarning(userId);
    }

    return strike;
  }

  async revokeStrike(strikeId: string, adminId: string, reason: string): Promise<DMCAStrike> {
    const [strike] = await db
      .update(dmcaStrikes)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedBy: adminId,
        revokeReason: reason,
      })
      .where(eq(dmcaStrikes.id, strikeId))
      .returning();

    logger.info(`Strike ${strikeId} revoked by ${adminId}: ${reason}`);

    return strike;
  }

  async getStrikeInfo(userId: string): Promise<StrikeInfo> {
    const allStrikes = await db
      .select()
      .from(dmcaStrikes)
      .where(eq(dmcaStrikes.userId, userId))
      .orderBy(desc(dmcaStrikes.createdAt));

    const now = new Date();
    const activeStrikes = allStrikes.filter(
      s => !s.expiresAt || s.expiresAt > now
    );

    const activeCount = activeStrikes.length;
    let accountStatus: StrikeInfo['accountStatus'] = 'good_standing';

    if (activeCount >= MAX_STRIKES) {
      accountStatus = 'terminated';
    } else if (activeCount === MAX_STRIKES - 1) {
      accountStatus = 'warned';
    } else if (activeCount > 0) {
      accountStatus = 'warned';
    }

    return {
      userId,
      activeStrikes: activeCount,
      totalStrikes: allStrikes.length,
      strikes: allStrikes,
      isRepeatInfringer: activeCount >= MAX_STRIKES,
      accountStatus,
    };
  }

  async handleRepeatInfringer(userId: string): Promise<void> {
    logger.warn(`User ${userId} is a repeat infringer (3+ strikes). Initiating account termination.`);

    await this.notifyRepeatInfringer(userId);

    const userProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId));

    for (const project of userProjects) {
      await this.createLegalHold({
        contentId: project.id,
        contentType: 'project',
        holdReason: 'Repeat infringer policy - account terminated',
        holdType: 'legal',
      });
    }
  }

  async createLegalHold(request: LegalHoldRequest): Promise<LegalHold> {
    const [hold] = await db
      .insert(legalHolds)
      .values({
        contentId: request.contentId,
        contentType: request.contentType,
        holdReason: request.holdReason,
        holdType: request.holdType,
        dmcaNoticeId: request.dmcaNoticeId,
        isActive: true,
      })
      .returning();

    logger.info(`Legal hold created: ${hold.id} for content ${request.contentId}`);

    return hold;
  }

  async releaseLegalHold(holdId: string, adminId: string): Promise<LegalHold> {
    const [hold] = await db
      .update(legalHolds)
      .set({
        isActive: false,
        releasedAt: new Date(),
        releasedBy: adminId,
      })
      .where(eq(legalHolds.id, holdId))
      .returning();

    logger.info(`Legal hold ${holdId} released by ${adminId}`);

    return hold;
  }

  async getActiveLegalHolds(contentId?: string): Promise<LegalHold[]> {
    const query = contentId
      ? and(eq(legalHolds.status, 'active'), eq(legalHolds.contentId, contentId))
      : eq(legalHolds.status, 'active');

    return db
      .select()
      .from(legalHolds)
      .where(query)
      .orderBy(desc(legalHolds.createdAt));
  }

  async getNotice(noticeId: string): Promise<DMCANotice | null> {
    const [notice] = await db
      .select()
      .from(dmcaNotices)
      .where(eq(dmcaNotices.id, noticeId));

    return notice || null;
  }

  async getNoticesByUser(userId: string): Promise<DMCANotice[]> {
    // Since the schema doesn't have contentOwnerId, we query by matching 
    // the user's email to the claimant email (notices filed by this user)
    // or by joining through content ownership (notices against user's content)
    try {
      // First get the user's email
      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      
      if (!user) {
        return [];
      }
      
      // Return notices where user is the claimant (filed the claim)
      const noticesAsClaimant = await db
        .select()
        .from(dmcaNotices)
        .where(eq(dmcaNotices.claimantEmail, user.email))
        .orderBy(desc(dmcaNotices.submittedAt));
      
      // Also get notices where user's content was claimed
      // Join through projects table where contentId matches project id
      const noticesAgainstContent = await db
        .select({
          id: dmcaNotices.id,
          contentType: dmcaNotices.contentType,
          contentId: dmcaNotices.contentId,
          claimantName: dmcaNotices.claimantName,
          claimantEmail: dmcaNotices.claimantEmail,
          description: dmcaNotices.description,
          status: dmcaNotices.status,
          submittedAt: dmcaNotices.submittedAt,
          resolvedAt: dmcaNotices.resolvedAt,
          createdAt: dmcaNotices.createdAt,
        })
        .from(dmcaNotices)
        .innerJoin(projects, eq(dmcaNotices.contentId, projects.id))
        .where(eq(projects.userId, userId))
        .orderBy(desc(dmcaNotices.submittedAt));
      
      // Combine and deduplicate
      const allNotices = [...noticesAsClaimant, ...noticesAgainstContent];
      const uniqueNotices = allNotices.filter((notice, index, self) => 
        index === self.findIndex(n => n.id === notice.id)
      );
      
      return uniqueNotices;
    } catch (error) {
      logger.error('Error fetching notices by user:', error);
      return [];
    }
  }

  async getPendingNotices(): Promise<DMCANotice[]> {
    return db
      .select()
      .from(dmcaNotices)
      .where(eq(dmcaNotices.status, 'pending'))
      .orderBy(dmcaNotices.submittedAt);
  }

  async getAllNotices(options?: { limit?: number; offset?: number; status?: DMCANoticeStatus }): Promise<{ notices: DMCANotice[]; total: number }> {
    let query = db.select().from(dmcaNotices);
    let countQuery = db.select({ count: count() }).from(dmcaNotices);

    if (options?.status) {
      query = query.where(eq(dmcaNotices.status, options.status)) as typeof query;
      countQuery = countQuery.where(eq(dmcaNotices.status, options.status)) as typeof countQuery;
    }

    query = query.orderBy(desc(dmcaNotices.submittedAt)) as typeof query;

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    const [notices, [{ count: total }]] = await Promise.all([query, countQuery]);

    return { notices, total: Number(total) };
  }

  private async findContentOwner(contentId: string, contentType: DMCAContentType): Promise<{ id: string } | null> {
    try {
      if (contentType === 'track' || contentType === 'artwork' || contentType === 'video') {
        const [project] = await db
          .select({ id: projects.id, userId: projects.userId })
          .from(projects)
          .where(eq(projects.id, contentId));

        if (project) {
          return { id: project.userId };
        }
      }
    } catch (error) {
      logger.error('Error finding content owner:', error);
    }
    return null;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async notifyContentOwner(notice: DMCANotice): Promise<void> {
    if (!notice.contentOwnerId) return;

    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, notice.contentOwnerId));

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: 'DMCA Notice Received for Your Content',
          html: `
            <h2>DMCA Notice Received</h2>
            <p>Dear ${user.firstName || 'Content Owner'},</p>
            <p>We have received a DMCA takedown notice for content associated with your account.</p>
            <p><strong>Content ID:</strong> ${notice.contentId}</p>
            <p><strong>Claimant:</strong> ${notice.claimantName}</p>
            <p>You may file a counter-notification if you believe this notice was sent in error.</p>
            <p>Please log in to your account to view the full details and respond.</p>
          `,
        });
      }
    } catch (error) {
      logger.error('Error notifying content owner:', error);
    }
  }

  private async notifyAdministrators(notice: DMCANotice): Promise<void> {
    logger.info(`Admin notification: New DMCA ${notice.type} notice ${notice.id} requires review`);
  }

  private async notifyOriginalClaimant(counterNotice: DMCANotice, originalNotice: DMCANotice): Promise<void> {
    try {
      await emailService.sendEmail({
        to: originalNotice.claimantEmail,
        subject: 'Counter-Notification Received for Your DMCA Claim',
        html: `
          <h2>Counter-Notification Received</h2>
          <p>Dear ${originalNotice.claimantName},</p>
          <p>A counter-notification has been filed in response to your DMCA takedown request.</p>
          <p>Under the DMCA, you have ${COUNTER_NOTICE_WAIT_DAYS} business days to file legal action to prevent restoration of the content.</p>
          <p>If no legal action is filed, the content may be restored after this period.</p>
        `,
      });
    } catch (error) {
      logger.error('Error notifying original claimant:', error);
    }
  }

  private async scheduleContentRestoration(notice: DMCANotice): Promise<void> {
    const restorationDate = new Date();
    restorationDate.setDate(restorationDate.getDate() + COUNTER_NOTICE_WAIT_DAYS);
    
    logger.info(`Content ${notice.contentId} scheduled for restoration on ${restorationDate.toISOString()} unless legal action is filed`);
  }

  private async sendFinalWarning(userId: string): Promise<void> {
    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId));

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Final Warning: Account Termination Risk',
          html: `
            <h2>Final Warning - DMCA Strikes</h2>
            <p>Dear ${user.firstName || 'User'},</p>
            <p>Your account has received ${MAX_STRIKES - 1} DMCA strikes. One more strike will result in account termination under our repeat infringer policy.</p>
            <p>Please ensure all content you upload is properly licensed or owned by you.</p>
          `,
        });
      }
    } catch (error) {
      logger.error('Error sending final warning:', error);
    }
  }

  private async notifyRepeatInfringer(userId: string): Promise<void> {
    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId));

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Account Terminated - Repeat Infringer Policy',
          html: `
            <h2>Account Termination Notice</h2>
            <p>Dear ${user.firstName || 'User'},</p>
            <p>Your account has been terminated due to repeated copyright infringement under our repeat infringer policy.</p>
            <p>All your content has been placed on legal hold and is no longer accessible.</p>
            <p>If you believe this action was taken in error, please contact our legal department.</p>
          `,
        });
      }
    } catch (error) {
      logger.error('Error notifying repeat infringer:', error);
    }
  }
}

export const dmcaService = new DMCAService();
